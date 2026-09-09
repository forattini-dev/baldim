import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import { MetricsPlugin } from '../src/index.js';

describe('MetricsPlugin integration', () => {
  beforeEach(() => MemoryClient.clearAllStorage());

  it('instruments existing and newly-created resources exactly once', async () => {
    const database = new Baldim({ connectionString: 'memory://metrics-integration', logLevel: 'silent' });
    await database.connect();
    const existing = await database.createResource({ name: 'existing', attributes: { value: 'string|required' } });
    const plugin = new MetricsPlugin({ flushInterval: 0, prometheus: { enabled: false }, logLevel: 'silent' });
    await database.usePlugin(plugin);
    const created = await database.createResource({ name: 'created', attributes: { value: 'string|required' } });

    plugin.installResourceHooks(existing as never);
    plugin.installResourceHooks(created as never);
    await existing.insert({ id: 'a', value: 'A' });
    await created.insert({ id: 'b', value: 'B' });

    expect(plugin.metrics.resources.existing.insert.count).toBe(1);
    expect(plugin.metrics.resources.created.insert.count).toBe(1);
    await database.disconnect();
  });

  it('removes resource and database instrumentation when uninstalled', async () => {
    const database = new Baldim({ connectionString: 'memory://metrics-cleanup', logLevel: 'silent' });
    await database.connect();
    const resource = await database.createResource({ name: 'items', attributes: { value: 'string|required' } });
    const plugin = new MetricsPlugin({ flushInterval: 0, prometheus: { enabled: false }, logLevel: 'silent' });
    await database.usePlugin(plugin);
    await resource.insert({ id: 'before', value: 'before' });

    await database.uninstallPlugin('metrics');
    const countAfterStop = plugin.metrics.operations.insert.count;
    await resource.insert({ id: 'after', value: 'after' });
    await database.createResource({ name: 'later', attributes: { value: 'string|required' } });

    expect(plugin.metrics.operations.insert.count).toBe(countAfterStop);
    await database.disconnect();
  });

  it('uses namespaced internal resources', async () => {
    const database = new Baldim({ connectionString: 'memory://metrics-namespace', logLevel: 'silent' });
    await database.connect();
    const plugin = new MetricsPlugin({
      namespace: 'ops-west',
      flushInterval: 0,
      prometheus: { enabled: false },
      logLevel: 'silent',
    });
    await database.usePlugin(plugin, 'metrics-west');

    expect(plugin.resourceNames.metrics).toBe('plg_ops-west_metrics');
    expect(database.resources[plugin.resourceNames.metrics]).toBeDefined();
    await database.disconnect();
  });

  it('exports Baldim Prometheus metric names', async () => {
    const plugin = new MetricsPlugin({ prometheus: { enabled: false }, logLevel: 'silent' });
    plugin.recordOperation('orders', 'insert', 25, false);

    const output = await plugin.getPrometheusMetrics();
    expect(output).toContain('baldim_operations_total');
    expect(output).toContain('baldim_info');
  });

  it('serves the standalone Prometheus endpoint and releases its port', async () => {
    const database = new Baldim({ connectionString: 'memory://metrics-http', logLevel: 'silent' });
    await database.connect();
    const plugin = new MetricsPlugin({
      flushInterval: 0,
      prometheus: { enabled: true, mode: 'standalone', port: 0, enforceIpAllowlist: false },
      logLevel: 'silent',
    });
    await database.usePlugin(plugin);
    const address = plugin.metricsServer!.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP metrics listener');

    const response = await fetch(`http://127.0.0.1:${address.port}/metrics`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('baldim_info');

    await database.uninstallPlugin('metrics');
    expect(plugin.metricsServer).toBeNull();
    await database.disconnect();
  });

});
