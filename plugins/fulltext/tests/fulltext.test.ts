import { Baldim, MemoryClient, type Database, type Resource } from '@baldim/core';
import { beforeEach, describe, expect, test } from 'vitest';
import { FullTextPlugin } from '../src/index.js';

let sequence = 0;

function connection(label: string): string {
  return `memory://plugin-fulltext-${label}-${++sequence}`;
}

function createDatabase(connectionString: string): Database {
  return new Baldim({ connectionString, logLevel: 'silent' });
}

async function createArticles(db: Database, name = 'articles'): Promise<Resource> {
  return db.createResource({
    name,
    attributes: {
      title: 'string|required',
      content: 'string|optional',
      category: 'string|optional',
    },
  });
}

function createPlugin(options: Record<string, unknown> = {}): FullTextPlugin {
  return new FullTextPlugin({
    logLevel: 'silent',
    fields: { articles: ['title', 'content'] },
    ...options,
  });
}

beforeEach(() => {
  MemoryClient.clearAllStorage();
});

describe('@baldim/plugin-fulltext', () => {
  test('tokenizes case-insensitively while preserving accented words', () => {
    const plugin = createPlugin();
    expect(plugin.tokenize('Baldim, RÁPIDO e útil!')).toEqual(['baldim', 'rápido', 'e', 'útil']);
  });

  test('does not create indexes or attach hooks when disabled', async () => {
    const db = createDatabase(connection('disabled'));
    await db.connect();
    const articles = await createArticles(db);
    const plugin = createPlugin({ enabled: false });
    await db.usePlugin(plugin);
    await articles.insert({ id: 'ignored', title: 'Disabled index', content: 'must not appear' });

    expect(db.resources[plugin.indexResourceName]).toBeUndefined();
    expect(await plugin.search('articles', 'disabled')).toEqual([]);
    await db.disconnect();
  });

  test('indexes existing resources and returns ranked records', async () => {
    const db = createDatabase(connection('existing'));
    await db.connect();
    const articles = await createArticles(db);
    const plugin = createPlugin();
    await db.usePlugin(plugin);

    await articles.insert({ id: 'one', title: 'Baldim database', content: 'fast object database' });
    await articles.insert({ id: 'two', title: 'Baldim guide', content: 'setup tutorial' });

    const matches = await plugin.searchRecords('articles', 'baldim database');
    expect(matches.map((record) => record.id)).toEqual(['one', 'two']);
    expect(matches[0]!._searchScore).toBeGreaterThan(matches[1]!._searchScore);
    await db.disconnect();
  });

  test('indexes resources created after plugin installation', async () => {
    const db = createDatabase(connection('future'));
    await db.connect();
    const plugin = createPlugin();
    await db.usePlugin(plugin);
    const articles = await createArticles(db);

    await articles.insert({ id: 'later', title: 'Created later', content: 'searchable extension hook' });

    expect((await plugin.searchRecords('articles', 'extension'))[0]?.id).toBe('later');
    await db.disconnect();
  });

  test('updates and deletes index membership with resource writes', async () => {
    const db = createDatabase(connection('mutations'));
    await db.connect();
    const articles = await createArticles(db);
    const plugin = createPlugin();
    await db.usePlugin(plugin);

    await articles.insert({ id: 'changing', title: 'Legacy wording', content: 'first version' });
    expect(await plugin.search('articles', 'legacy')).toHaveLength(1);

    await articles.update('changing', { title: 'Modern wording', content: 'second version' });
    expect(await plugin.search('articles', 'legacy')).toEqual([]);
    expect((await plugin.search('articles', 'modern'))[0]?.recordId).toBe('changing');

    await articles.delete('changing');
    expect(await plugin.search('articles', 'modern')).toEqual([]);
    await db.disconnect();
  });

  test('supports field filters, exact words, partial words, offsets, and limits', async () => {
    const db = createDatabase(connection('options'));
    await db.connect();
    const articles = await createArticles(db);
    const plugin = createPlugin();
    await db.usePlugin(plugin);

    await articles.insert({ id: 'one', title: 'Database internals', content: 'storage engine' });
    await articles.insert({ id: 'two', title: 'Storage overview', content: 'database tutorial' });

    expect((await plugin.search('articles', 'data', { exactMatch: false })).map((item) => item.recordId)).toEqual(['one', 'two']);
    expect(await plugin.search('articles', 'data', { exactMatch: true })).toEqual([]);
    expect((await plugin.search('articles', 'database', { fields: ['title'] })).map((item) => item.recordId)).toEqual(['one']);
    expect(await plugin.search('articles', 'database', { limit: 1 })).toHaveLength(1);
    expect(await plugin.search('articles', 'database', { offset: 1, limit: 1 })).toHaveLength(1);
    await db.disconnect();
  });

  test('persists indexes and restores them after reconnect', async () => {
    const connectionString = connection('reconnect');
    const first = createDatabase(connectionString);
    await first.connect();
    const articles = await createArticles(first);
    const firstPlugin = createPlugin();
    await first.usePlugin(firstPlugin);
    await articles.insert({ id: 'persisted', title: 'Persistent search', content: 'survives reconnect' });
    await first.disconnect();

    const second = createDatabase(connectionString);
    await second.connect();
    const secondPlugin = createPlugin();
    await second.usePlugin(secondPlugin);

    expect((await secondPlugin.searchRecords('articles', 'persistent'))[0]?.id).toBe('persisted');
    await second.disconnect();
  });

  test('keeps a cleared index deleted after reconnect', async () => {
    const connectionString = connection('clear');
    const first = createDatabase(connectionString);
    await first.connect();
    const articles = await createArticles(first);
    const firstPlugin = createPlugin();
    await first.usePlugin(firstPlugin);
    await articles.insert({ id: 'removed-index', title: 'Vanishing index', content: 'clear me' });
    await firstPlugin.saveIndexes();
    await firstPlugin.clearIndex('articles');
    await first.disconnect();

    const second = createDatabase(connectionString);
    await second.connect();
    const secondPlugin = createPlugin();
    await second.usePlugin(secondPlugin);

    expect(await secondPlugin.search('articles', 'vanishing')).toEqual([]);
    await second.disconnect();
  });

  test('rebuilds indexes from stored records', async () => {
    const db = createDatabase(connection('rebuild'));
    await db.connect();
    const articles = await createArticles(db);
    await articles.insert({ id: 'before-plugin', title: 'Historic document', content: 'rebuild target' });
    const plugin = createPlugin();
    await db.usePlugin(plugin);

    expect(await plugin.search('articles', 'historic')).toEqual([]);
    await plugin.rebuildIndex('articles');
    expect((await plugin.search('articles', 'historic'))[0]?.recordId).toBe('before-plugin');
    await db.disconnect();
  });

  test('detaches database hooks and resource middleware when stopped', async () => {
    const db = createDatabase(connection('stop'));
    await db.connect();
    const articles = await createArticles(db);
    const plugin = createPlugin();
    await db.usePlugin(plugin);
    await plugin.stop();

    await articles.insert({ id: 'after-stop', title: 'Detached behavior', content: 'must stay unindexed' });
    const later = await createArticles(db, 'later_articles');
    await later.insert({ id: 'later', title: 'No hook', content: 'also unindexed' });

    expect(await plugin.search('articles', 'detached')).toEqual([]);
    expect(plugin.indexes.size).toBe(0);
    await db.disconnect();
  });

  test('isolates persistent index resources by namespace', () => {
    expect(createPlugin({ namespace: 'tenant-a' }).indexResourceName).toBe('plg_tenant-a_fulltext_indexes');
    expect(createPlugin({ namespace: 'tenant-b' }).indexResourceName).toBe('plg_tenant-b_fulltext_indexes');
  });
});
