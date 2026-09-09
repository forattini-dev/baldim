import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import { afterEach, describe, expect, it } from 'vitest';
import {
  KubernetesInventoryPlugin,
  type KubernetesInventoryDriver,
  type KubernetesInventoryResource,
} from '../src/index.js';

class FakeDriver implements KubernetesInventoryDriver {
  initialized = false;
  destroyed = false;
  resources: KubernetesInventoryResource[];

  constructor(resources: KubernetesInventoryResource[]) {
    this.resources = resources;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
  }

  async *listResources(): AsyncGenerator<KubernetesInventoryResource> {
    for (const resource of this.resources) yield structuredClone(resource);
  }

  async discoverResourceTypes(): Promise<string[]> {
    return [...new Set(this.resources.map((resource) => resource.resourceType))];
  }
}

const databases: Baldim[] = [];

async function createDatabase(label: string): Promise<Baldim> {
  const database = new Baldim({
    client: new MemoryClient({
      bucket: `baldim-k8s-${label}-${Date.now()}-${Math.random()}`,
      keyPrefix: 'tests/',
      logLevel: 'silent',
    }),
    logLevel: 'silent',
  });
  await database.connect();
  databases.push(database);
  return database;
}

function deployment(replicas: number): KubernetesInventoryResource {
  return {
    clusterId: 'production',
    namespace: 'default',
    resourceType: 'apps.v1.Deployment',
    resourceId: 'web',
    uid: 'deployment-web',
    name: 'web',
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    labels: { app: 'web' },
    annotations: {},
    configuration: { spec: { replicas } },
  };
}

afterEach(async () => {
  while (databases.length > 0) {
    await databases.pop()!.disconnect();
  }
});

describe('KubernetesInventoryPlugin', () => {
  it('persists initial, unchanged, and changed snapshots with history and diffs', async () => {
    const database = await createDatabase('history');
    const driver = new FakeDriver([deployment(2)]);
    const plugin = new KubernetesInventoryPlugin({
      clusters: [{ id: 'production', name: 'Production' }],
      discovery: { runOnInstall: true },
      driverFactory: () => driver,
      logLevel: 'silent',
    });

    await database.usePlugin(plugin, 'k8s');

    expect(driver.initialized).toBe(true);
    expect(await plugin.getSnapshots({ clusterId: 'production' })).toHaveLength(1);
    expect(await plugin.getVersions({ clusterId: 'production' })).toHaveLength(1);
    expect(await plugin.getChanges({ clusterId: 'production' })).toHaveLength(0);

    const unchanged = await plugin.syncCluster('production');
    expect(unchanged).toMatchObject({ success: true, total: 1, unchanged: 1, updated: 0 });
    expect(await plugin.getVersions({ clusterId: 'production' })).toHaveLength(1);

    driver.resources = [deployment(3)];
    const changed = await plugin.syncCluster('production');
    expect(changed).toMatchObject({ success: true, total: 1, updated: 1, unchanged: 0 });

    const versions = await plugin.getVersions({ clusterId: 'production', resourceId: 'web' });
    expect(versions.map((version) => version.version).sort()).toEqual([1, 2]);
    const changes = await plugin.getChanges({ clusterId: 'production', resourceId: 'web' });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ fromVersion: 1, toVersion: 2 });
    expect(changes[0]!.diff).toEqual({
      added: {},
      removed: {},
      updated: { spec: { old: { replicas: 2 }, new: { replicas: 3 } } },
    });

    const clusterSummary = await database.resources[plugin.resourceNames.clusters]!.get('production');
    expect(clusterSummary).toMatchObject({ name: 'Production', status: 'idle' });
    expect(clusterSummary.lastResult).toMatchObject({ success: true, counters: { total: 1, updated: 1 } });
  });

  it('applies select and ignore filters before persistence', async () => {
    const database = await createDatabase('filters');
    const driver = new FakeDriver([
      deployment(1),
      { ...deployment(1), resourceType: 'core.v1.Secret', resourceId: 'credentials', kind: 'Secret' },
      { ...deployment(1), resourceType: 'batch.v1.Job', resourceId: 'migration', kind: 'Job' },
    ]);
    const plugin = new KubernetesInventoryPlugin({
      clusters: [{ id: 'production' }],
      discovery: {
        runOnInstall: false,
        select: '*.v1.*',
        ignore: ['core.v1.*', (resource) => resource.resourceType.startsWith('batch.')],
      },
      driverFactory: () => driver,
      logLevel: 'silent',
    });

    await database.usePlugin(plugin, 'k8s');
    const result = await plugin.syncCluster('production');

    expect(result).toMatchObject({ success: true, total: 3, created: 1 });
    expect(await plugin.getSnapshots()).toMatchObject([{ resourceType: 'apps.v1.Deployment' }]);
    expect(await plugin.discoverResourceTypes('production')).toEqual([
      'apps.v1.Deployment',
      'core.v1.Secret',
      'batch.v1.Job',
    ]);
  });

  it('validates clusters and destroys initialized drivers on shutdown', async () => {
    const invalidDatabase = await createDatabase('invalid');
    await expect(invalidDatabase.usePlugin(new KubernetesInventoryPlugin({ logLevel: 'silent' }), 'k8s'))
      .rejects.toThrow(/At least one cluster/);

    const duplicateDatabase = await createDatabase('duplicate');
    await expect(duplicateDatabase.usePlugin(new KubernetesInventoryPlugin({
      clusters: [{ id: 'same' }, { id: 'same' }],
      logLevel: 'silent',
    }), 'k8s')).rejects.toThrow(/Duplicate cluster IDs/);

    const database = await createDatabase('shutdown');
    const driver = new FakeDriver([]);
    const plugin = new KubernetesInventoryPlugin({
      clusters: [{ id: 'production' }],
      discovery: { runOnInstall: false },
      driverFactory: () => driver,
      logLevel: 'silent',
    });
    await database.usePlugin(plugin, 'k8s');
    await database.disconnect();
    databases.splice(databases.indexOf(database), 1);

    expect(driver.destroyed).toBe(true);
    expect(plugin.clusterDrivers.size).toBe(0);
  });
});
