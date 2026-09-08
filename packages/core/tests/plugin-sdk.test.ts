import { afterEach, describe, expect, test } from 'vitest';
import { Baldin, MemoryClient, type Database } from '@baldin/core';
import { Plugin, type ResourceLike } from '@baldin/core/plugin';

let sequence = 0;
const databases: Database[] = [];

function createDatabase(label: string): Database {
  const database = new Baldin({
    connectionString: `memory://plugin-sdk-${label}-${++sequence}`,
    logLevel: 'silent',
  });
  databases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    if (database.isConnected()) await database.disconnect();
  }
  MemoryClient.clearAllStorage();
});

describe('@baldin/core plugin SDK', () => {
  test('stops plugins installed after connect during database disconnect', async () => {
    class LifecyclePlugin extends Plugin {
      stops = 0;
      override async onStop(): Promise<void> {
        this.stops++;
      }
    }

    const database = createDatabase('lifecycle');
    const plugin = new LifecyclePlugin({ logLevel: 'silent' });
    await database.connect();
    await database.usePlugin(plugin);

    expect(database.pluginList).toContain(plugin);
    await database.disconnect();
    expect(plugin.stops).toBe(1);
  });

  test('disposes plugin middleware when the plugin stops', async () => {
    class PrefixPlugin extends Plugin {
      override async onInstall(): Promise<void> {
        const resource = this.database.resources.notes!;
        this.addMiddleware(resource as unknown as ResourceLike, 'insert', async (next, data, options) => {
          return next({ ...(data as Record<string, unknown>), title: `plugin:${String((data as Record<string, unknown>).title)}` }, options);
        });
      }
    }

    const database = createDatabase('middleware');
    await database.connect();
    const notes = await database.createResource({ name: 'notes', attributes: { title: 'string|required' } });
    const plugin = new PrefixPlugin({ logLevel: 'silent' });
    await database.usePlugin(plugin);

    expect((await notes.insert({ id: 'with', title: 'active' })).title).toBe('plugin:active');
    await plugin.stop();
    expect((await notes.insert({ id: 'without', title: 'stopped' })).title).toBe('stopped');
  });
});
