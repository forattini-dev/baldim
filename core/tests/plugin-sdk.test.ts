import { afterEach, describe, expect, test } from 'vitest';
import { Baldin, MemoryClient, type Database } from '@baldin/core';
import {
  Plugin,
  resolveResourceNames,
  type ResourceLike,
} from '@baldin/core/plugin';

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

  test('removes plugin-owned resource hooks when the plugin stops', async () => {
    class HookPlugin extends Plugin {
      override async onInstall(): Promise<void> {
        const resource = this.database.resources.notes!;
        this.addResourceHook(resource as unknown as ResourceLike, 'beforeInsert', (data) => ({
          ...(data as Record<string, unknown>),
          title: `hook:${String((data as Record<string, unknown>).title)}`,
        }));
      }
    }

    const database = createDatabase('hooks');
    await database.connect();
    const notes = await database.createResource({ name: 'notes', attributes: { title: 'string|required' } });
    const plugin = new HookPlugin({ logLevel: 'silent' });
    await database.usePlugin(plugin);

    expect((await notes.insert({ id: 'with-hook', title: 'active' })).title).toBe('hook:active');
    await plugin.stop();
    expect((await notes.insert({ id: 'without-hook', title: 'stopped' })).title).toBe('stopped');
  });

  test('removes plugin-owned database hooks when the plugin stops', async () => {
    class ResourceObserverPlugin extends Plugin {
      created: string[] = [];

      override async onInstall(): Promise<void> {
        this.addDatabaseHook('afterCreateResource', ({ resource }) => {
          this.created.push((resource as { name: string }).name);
        });
      }
    }

    const database = createDatabase('database-hooks');
    await database.connect();
    const plugin = new ResourceObserverPlugin({ logLevel: 'silent' });
    await database.usePlugin(plugin);

    await database.createResource({ name: 'observed', attributes: { title: 'string|required' } });
    expect(plugin.created).toEqual(['observed']);

    await plugin.stop();
    await database.createResource({ name: 'ignored', attributes: { title: 'string|required' } });
    expect(plugin.created).toEqual(['observed']);
  });

  test('restores plugin-owned resource extensions when the plugin stops', async () => {
    class HelpersPlugin extends Plugin {
      override async onInstall(): Promise<void> {
        const resource = this.database.resources.notes!;
        this.extendResource(resource as unknown as ResourceLike, {
          helper: () => 'available',
          pluginState: { enabled: true },
        });
      }
    }

    const database = createDatabase('extensions');
    await database.connect();
    const notes = await database.createResource({ name: 'notes', attributes: { title: 'string|required' } });
    const plugin = new HelpersPlugin({ logLevel: 'silent' });
    await database.usePlugin(plugin);

    expect((notes as unknown as { helper(): string }).helper()).toBe('available');
    expect((notes as unknown as { pluginState: unknown }).pluginState).toEqual({ enabled: true });
    await plugin.stop();
    expect('helper' in notes).toBe(false);
    expect('pluginState' in notes).toBe(false);
  });

  test('refuses to replace an existing resource API property', async () => {
    class CollisionPlugin extends Plugin {
      override async onInstall(): Promise<void> {
        const resource = this.database.resources.notes!;
        this.extendResource(resource as unknown as ResourceLike, {
          insert: () => undefined,
        });
      }
    }

    const database = createDatabase('collision');
    await database.connect();
    await database.createResource({ name: 'notes', attributes: { title: 'string|required' } });
    const plugin = new CollisionPlugin({ logLevel: 'silent' });

    await expect(database.usePlugin(plugin)).rejects.toThrow('Cannot replace existing resource property "insert"');
    expect(database.plugins.collision).toBeUndefined();
    expect(database.pluginList).not.toContain(plugin);
  });

  test('rolls back registration and installed behavior when plugin start fails', async () => {
    class FailingPlugin extends Plugin {
      override async onInstall(): Promise<void> {
        const resource = this.database.resources.notes!;
        this.addMiddleware(resource as unknown as ResourceLike, 'insert', async (next, data, options) => {
          return next({ ...(data as Record<string, unknown>), title: 'leaked' }, options);
        });
        this.extendResource(resource as unknown as ResourceLike, {
          leakedHelper: () => true,
        });
      }

      override async onStart(): Promise<void> {
        throw new Error('start failed');
      }
    }

    const database = createDatabase('rollback');
    await database.connect();
    const notes = await database.createResource({ name: 'notes', attributes: { title: 'string|required' } });
    const plugin = new FailingPlugin({ logLevel: 'silent' });

    await expect(database.usePlugin(plugin)).rejects.toThrow('start failed');
    expect(database.plugins.failing).toBeUndefined();
    expect(database.pluginList).not.toContain(plugin);
    expect('leakedHelper' in notes).toBe(false);
    expect((await notes.insert({ id: 'clean', title: 'clean' })).title).toBe('clean');
  });

  test('resolves a typed collection of names with one namespace policy', () => {
    const names = resolveResourceNames('state-machine', {
      states: 'entity_states',
      transitions: { defaultName: 'state_transitions' },
      external: { override: 'custom_events' },
    }, { namespace: 'orders' });

    expect(names).toEqual({
      states: 'plg_orders_entity_states',
      transitions: 'plg_orders_state_transitions',
      external: 'custom_events',
    });
  });

});
