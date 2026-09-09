import { afterEach, describe, expect, it, vi } from 'vitest';
import { KubernetesDriver, type K8sResourceType } from '../src/index.js';

const originalKubeconfigContent = process.env.KUBECONFIG_CONTENT;

afterEach(() => {
  if (originalKubeconfigContent === undefined) delete process.env.KUBECONFIG_CONTENT;
  else process.env.KUBECONFIG_CONTENT = originalKubeconfigContent;
});

describe('KubernetesDriver', () => {
  it('reads base64 kubeconfig content and sanitizes sensitive resources', () => {
    const kubeconfig = 'apiVersion: v1\nclusters: []\n';
    process.env.KUBECONFIG_CONTENT = Buffer.from(kubeconfig).toString('base64');
    const driver = new KubernetesDriver({ id: 'production' });

    expect(driver._resolveKubeconfigContent()).toBe(kubeconfig);

    const secretType: K8sResourceType = {
      group: '', version: 'v1', kind: 'Secret', plural: 'secrets', namespaced: true, category: 'config',
    };
    const resource = driver._normalizeResource(secretType, {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'credentials', namespace: 'default', uid: 'secret-1' },
      data: { password: 'c2VjcmV0' },
    });

    expect(resource.resourceType).toBe('core.v1.Secret');
    expect(resource.configuration.data).toEqual({ password: '[REDACTED]' });
    expect(resource.configuration).not.toHaveProperty('metadata');
  });

  it('uses the client-node 1.x object parameters and follows pagination tokens', async () => {
    const driver = new KubernetesDriver({
      id: 'production',
      discovery: { pagination: { enabled: true, pageSize: 1 } },
    });
    const calls: Record<string, unknown>[] = [];
    const listNamespacedDeployment = vi.fn(async (options: Record<string, unknown>) => {
      calls.push(options);
      if (calls.length === 1) {
        return { items: [{ metadata: { name: 'web-1' } }], metadata: { _continue: 'next-page' } };
      }
      return { items: [{ metadata: { name: 'web-2' } }], metadata: {} };
    });
    driver.apiClients.apps = { listNamespace: vi.fn(), listNamespacedDeployment } as never;

    const deploymentType: K8sResourceType = {
      group: 'apps', version: 'v1', kind: 'Deployment', plural: 'deployments', namespaced: true, category: 'workload',
    };
    const resources = await driver._fetchStandardNamespacedResources(deploymentType, 'default');

    expect(resources.map((resource) => resource.metadata?.name)).toEqual(['web-1', 'web-2']);
    expect(calls).toEqual([
      { namespace: 'default', limit: 1, _continue: undefined },
      { namespace: 'default', limit: 1, _continue: 'next-page' },
    ]);
  });

  it('calls custom-resource and CRD APIs with object parameters', async () => {
    const driver = new KubernetesDriver({
      id: 'production',
      discovery: { includeCRDs: true, pagination: { enabled: false, pageSize: 100 } },
    });
    const listNamespacedCustomObject = vi.fn(async () => ({ items: [{ metadata: { name: 'widget' } }] }));
    const listCustomResourceDefinition = vi.fn(async () => ({
      items: [{
        metadata: { name: 'widgets.example.com' },
        spec: {
          group: 'example.com',
          scope: 'Namespaced',
          names: { kind: 'Widget', plural: 'widgets' },
          versions: [{ name: 'v1', storage: true }],
        },
      }],
    }));
    driver.apiClients.customObjects = { listNamespace: vi.fn(), listNamespacedCustomObject } as never;
    driver.apiClients.apiExtensions = { listNamespace: vi.fn(), listCustomResourceDefinition } as never;

    const widgetType: K8sResourceType = {
      group: 'example.com', version: 'v1', kind: 'Widget', plural: 'widgets', namespaced: true, category: 'custom', isCRD: true,
    };
    const resources = await driver._fetchCustomResources(widgetType, 'tenant-a');
    const discovered = await driver._discoverCRDs(true);

    expect(resources).toHaveLength(1);
    expect(listNamespacedCustomObject).toHaveBeenCalledWith({
      group: 'example.com', version: 'v1', namespace: 'tenant-a', plural: 'widgets',
    });
    expect(listCustomResourceDefinition).toHaveBeenCalledWith({});
    expect(discovered).toMatchObject([{ group: 'example.com', version: 'v1', kind: 'Widget', isCRD: true }]);
  });

  it('retries throttled calls according to its own retry policy', async () => {
    const driver = new KubernetesDriver({
      id: 'production',
      retries: { maxRetries: 2, backoffBase: 0, retryOn429: true },
    });
    const operation = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('throttled'), { statusCode: 429 }))
      .mockResolvedValue('ok');

    await expect(driver._retryOperation(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
