import { MemoryClient } from '@baldim/adapter-memory';
import { Baldim } from '@baldim/core';
import { afterEach, describe, expect, it } from 'vitest';
import { SpiderPlugin } from '../src/index.js';

const databases: Baldim[] = [];

async function createDatabase(): Promise<Baldim> {
  const database = new Baldim({
    client: new MemoryClient({
      bucket: `baldim-spider-${Date.now()}-${Math.random()}`,
      keyPrefix: 'tests/',
      logLevel: 'silent',
    }),
    logLevel: 'silent',
  });
  await database.connect();
  databases.push(database);
  return database;
}

afterEach(async () => {
  while (databases.length > 0) await databases.pop()!.disconnect();
});

describe('SpiderPlugin with Baldim', () => {
  it('installs its composed plugins and memory crawl backends', async () => {
    const database = await createDatabase();
    const spider = new SpiderPlugin({
      namespace: 'integration',
      logLevel: 'silent',
      puppeteer: { enabled: false },
      queue: { autoStart: false },
      ttl: { enabled: false },
      crawlQueue: { driver: 'memory' },
      crawlStorage: { driver: 'memory' },
      screenshot: { enabled: false },
    });

    await database.usePlugin(spider, 'spider');

    expect(spider.initialized).toBe(true);
    expect(spider.getPuppeteerPlugin()).toBeNull();
    expect(spider.getAvailableActivities().length).toBeGreaterThan(0);

    await spider._crawlQueueAdapter.push({ url: 'https://example.com', depth: 0 });
    expect(await spider._crawlQueueAdapter.size()).toBe(1);
    expect(await spider._crawlQueueAdapter.pop()).toMatchObject({ url: 'https://example.com' });

    await spider._crawlStorageAdapter.saveResult({
      url: 'https://example.com',
      status: 200,
      title: 'Example',
      depth: 0,
      duration: 10,
    });
    expect(await spider._crawlStorageAdapter.getResultCount()).toBe(1);
  });
});
