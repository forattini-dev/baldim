import { Baldin } from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';
import { CostsPlugin } from '../src/index.js';
import { detectProvider, getPricingForProvider } from '../src/pricing.js';

describe('CostsPlugin lifecycle', () => {
  beforeEach(() => MemoryClient.clearAllStorage());

  it('detects the active adapter and records real client operations', async () => {
    const database = new Baldin({ connectionString: 'memory://costs-lifecycle', logLevel: 'silent' });
    await database.connect();
    const plugin = new CostsPlugin();

    await database.usePlugin(plugin);
    await database.client.putObject({
      key: 'resource=people/item-1',
      body: 'hello',
    });

    const costs = plugin.getCosts();
    expect(costs.provider).toBe('self-hosted');
    expect(costs.requests.counts.put).toBe(1);
    expect(costs.storage.totalBytes).toBe(5);
    expect(costs.usage.byResource.people).toBe(1);
    expect((database.client as unknown as { costs?: unknown }).costs).toBe(plugin.costs);

    await database.disconnect();
  });

  it('starts idempotently and removes client instrumentation when uninstalled', async () => {
    const database = new Baldin({ connectionString: 'memory://costs-cleanup', logLevel: 'silent' });
    await database.connect();
    const plugin = new CostsPlugin({ provider: 'aws-s3' });

    await database.usePlugin(plugin);
    const client = database.client;
    const listeners = client.listenerCount('cl:response');
    await plugin.start();
    expect(client.listenerCount('cl:response')).toBe(listeners);

    await database.uninstallPlugin('costs');
    expect(client.listenerCount('cl:response')).toBe(listeners - 1);
    expect((client as unknown as { costs?: unknown }).costs).toBeUndefined();

    const countAfterStop = plugin.getCosts().requests.total;
    await client.putObject({ key: 'resource=people/item-2', body: 'ignored' });
    expect(plugin.getCosts().requests.total).toBe(countAfterStop);

    await database.disconnect();
  });
});

describe('provider pricing boundaries', () => {
  it('treats RedDB as self-hosted storage', () => {
    expect(detectProvider('reddb://token:write@localhost:8080/data')).toBe('self-hosted');
  });

  it('returns isolated pricing objects', () => {
    const first = getPricingForProvider('aws-s3');
    first.requests.get = 42;
    first.storage.tiers[0]!.pricePerGB = 42;

    const second = getPricingForProvider('aws-s3');
    expect(second.requests.get).toBeCloseTo(0.0004 / 1000, 10);
    expect(second.storage.tiers[0]!.pricePerGB).toBe(0.023);
  });
});
