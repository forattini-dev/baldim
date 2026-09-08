import { Baldin, MemoryClient, type Database, type Resource } from '@baldin/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TTLPlugin, type TTLExpireStrategy } from '../src/index.js';

let sequence = 0;

function createDatabase(label: string): Database {
  return new Baldin({
    connectionString: `memory://plugin-ttl-${label}-${++sequence}`,
    logLevel: 'silent',
  });
}

async function createExpiringResource(
  db: Database,
  name = 'sessions',
  extraAttributes: Record<string, string> = {},
): Promise<Resource> {
  return db.createResource({
    name,
    attributes: {
      value: 'string|optional',
      expiresAt: 'number|required',
      ...extraAttributes,
    },
  });
}

function createPlugin(
  resourceName: string,
  strategy: TTLExpireStrategy,
  options: Record<string, unknown> = {},
): TTLPlugin {
  return new TTLPlugin({
    enableCoordinator: false,
    logLevel: 'silent',
    resources: {
      [resourceName]: {
        field: 'expiresAt',
        onExpire: strategy,
        ...options,
      },
    },
  });
}

beforeEach(() => {
  MemoryClient.clearAllStorage();
});

describe('@baldin/plugin-ttl', () => {
  test('validates batch size at construction', () => {
    expect(() => new TTLPlugin({ batchSize: 0 })).toThrow('[TTLPlugin] Invalid batchSize');
    expect(() => new TTLPlugin({ batchSize: 10_001 })).toThrow('[TTLPlugin] Invalid batchSize');
    expect(() => new TTLPlugin({ batchSize: 1.5 })).toThrow('[TTLPlugin] Invalid batchSize');
  });

  test('validates resource expiration strategies during installation', async () => {
    const db = createDatabase('validation');
    await db.connect();

    const missingExpiration = new TTLPlugin({
      enableCoordinator: false,
      resources: { sessions: { onExpire: 'hard-delete' } },
    });
    await expect(db.usePlugin(missingExpiration)).rejects.toThrow('[TTLPlugin] Missing TTL configuration');

    const missingCallback = new TTLPlugin({
      enableCoordinator: false,
      resources: { sessions: { ttl: 60, onExpire: 'callback' } },
    });
    await expect(db.usePlugin(missingCallback)).rejects.toThrow('[TTLPlugin] Callback handler required');

    await db.disconnect();
  });

  test('indexes inserts and hard-deletes expired records', async () => {
    const db = createDatabase('hard-delete');
    await db.connect();
    const sessions = await createExpiringResource(db);
    const plugin = createPlugin('sessions', 'hard-delete');
    await db.usePlugin(plugin);

    await sessions.insert({ id: 'expired', value: 'old', expiresAt: Date.now() - 1 });
    await sessions.insert({ id: 'active', value: 'new', expiresAt: Date.now() + 60_000 });

    const index = db.resources[plugin.indexResourceName]!;
    expect(await index.getOrNull('sessions:expired')).not.toBeNull();
    expect(await index.getOrNull('sessions:active')).not.toBeNull();

    await plugin.runCleanup();

    expect(await sessions.getOrNull('expired')).toBeNull();
    expect(await sessions.getOrNull('active')).not.toBeNull();
    expect(plugin.getStats().totalDeleted).toBe(1);
    expect(plugin.getStats().totalErrors).toBe(0);
    await db.disconnect();
  });

  test('reindexes a record when its expiration changes', async () => {
    const db = createDatabase('update');
    await db.connect();
    const sessions = await createExpiringResource(db);
    const plugin = createPlugin('sessions', 'hard-delete');
    await db.usePlugin(plugin);

    await sessions.insert({ id: 'moving', expiresAt: Date.now() + 60_000 });
    const index = db.resources[plugin.indexResourceName]!;
    const before = await index.get('sessions:moving');

    await sessions.update('moving', { expiresAt: Date.now() + 172_800_000 });
    const after = await index.get('sessions:moving');

    expect(after.expiresAtTimestamp).toBeGreaterThan(before.expiresAtTimestamp as number);
    expect(after.expiresAtCohort).not.toBe(before.expiresAtCohort);
    await db.disconnect();
  });

  test('soft-deletes expired records with the configured marker', async () => {
    const db = createDatabase('soft-delete');
    await db.connect();
    const sessions = await createExpiringResource(db, 'sessions', {
      removedAt: 'datetime|optional',
      isdeleted: 'string|optional',
    });
    const plugin = createPlugin('sessions', 'soft-delete', { deleteField: 'removedAt' });
    await db.usePlugin(plugin);

    await sessions.insert({ id: 'expired', expiresAt: Date.now() - 1 });
    await plugin.runCleanup();

    const record = await sessions.get('expired');
    expect(record.removedAt).toBeTruthy();
    expect(record.isdeleted).toBe('true');
    expect(plugin.getStats().totalSoftDeleted).toBe(1);
    await db.disconnect();
  });

  test('archives expired records before deleting the original', async () => {
    const db = createDatabase('archive');
    await db.connect();
    const sessions = await createExpiringResource(db);
    const archive = await db.createResource({
      name: 'session_archive',
      attributes: {
        value: 'string|optional',
        expiresAt: 'number|required',
        archivedAt: 'datetime|required',
        archivedFrom: 'string|required',
        originalId: 'string|required',
      },
    });
    const plugin = createPlugin('sessions', 'archive', { archiveResource: 'session_archive' });
    await db.usePlugin(plugin);

    await sessions.insert({ id: 'expired', value: 'payload', expiresAt: Date.now() - 1 });
    await plugin.runCleanup();

    expect(await sessions.getOrNull('expired')).toBeNull();
    const archived = await archive.list();
    expect(archived).toHaveLength(1);
    expect(archived[0]).toMatchObject({ value: 'payload', archivedFrom: 'sessions', originalId: 'expired' });
    expect(plugin.getStats().totalErrors).toBe(0);
    await db.disconnect();
  });

  test('keeps callback records when the callback declines deletion', async () => {
    const db = createDatabase('callback-keep');
    await db.connect();
    const sessions = await createExpiringResource(db);
    const callback = vi.fn(async () => false);
    const plugin = createPlugin('sessions', 'callback', { callback });
    await db.usePlugin(plugin);

    await sessions.insert({ id: 'expired', expiresAt: Date.now() - 1 });
    await plugin.runCleanup();

    expect(callback).toHaveBeenCalledOnce();
    expect(await sessions.getOrNull('expired')).not.toBeNull();
    expect(await db.resources[plugin.indexResourceName]!.getOrNull('sessions:expired')).not.toBeNull();
    await db.disconnect();
  });

  test('enforces lazy expiration without creating an index resource', async () => {
    const db = createDatabase('lazy');
    await db.connect();
    const sessions = await createExpiringResource(db);
    const plugin = new TTLPlugin({
      enableCoordinator: false,
      mode: 'lazy',
      logLevel: 'silent',
      resources: {
        sessions: { field: 'expiresAt', onExpire: 'hard-delete' },
      },
    });
    await db.usePlugin(plugin);

    await sessions.insert({ id: 'expired', expiresAt: Date.now() - 1 });
    await sessions.insert({ id: 'active', expiresAt: Date.now() + 60_000 });

    expect(db.resources[plugin.indexResourceName]).toBeUndefined();
    expect(await sessions.getOrNull('expired')).toBeNull();
    expect(await sessions.getOrNull('active')).not.toBeNull();
    expect(await sessions.list()).toHaveLength(1);
    await db.disconnect();
  });

  test('isolates index resources by plugin namespace', async () => {
    const first = new TTLPlugin({ namespace: 'tenant-a', enableCoordinator: false });
    const second = new TTLPlugin({ namespace: 'tenant-b', enableCoordinator: false });

    expect(first.indexResourceName).toBe('plg_tenant-a_ttl_expiration_index');
    expect(second.indexResourceName).toBe('plg_tenant-b_ttl_expiration_index');
  });
});
