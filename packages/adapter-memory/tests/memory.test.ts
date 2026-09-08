import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryClient, MemoryStorage, createMemoryClient } from '../src/index.js';

const paths: string[] = [];

afterEach(async () => {
  MemoryClient.clearAllStorage();
  for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('@baldin/adapter-memory', () => {
  it('owns memory connection parsing', () => {
    const client = createMemoryClient({
      connectionString: 'memory://bucket-name/nested/prefix',
      clientOptions: {},
      logLevel: 'silent',
    });
    expect(client.config).toMatchObject({ bucket: 'bucket-name', keyPrefix: 'nested/prefix' });
  });

  it('stores, lists, snapshots, and restores objects', async () => {
    const client = new MemoryClient({ bucket: 'adapter-memory', logLevel: 'silent' });
    await client.putObject({ key: 'notes/one', body: 'hello', metadata: { count: 2 } });
    expect(await client.exists('notes/one')).toBe(true);
    expect(await client.getAllKeys({ prefix: 'notes/' })).toEqual(['notes/one']);
    expect(client.snapshot().objectCount).toBe(1);

    const restored = new MemoryStorage({ bucket: 'adapter-memory', logLevel: 'silent' });
    restored.restore(client.snapshot());
    expect((await restored.get('notes/one')).ETag).toBeTruthy();
    await client.destroy();
  });

  it('persists and reloads a snapshot', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'baldin-memory-'));
    paths.push(directory);
    const persistPath = join(directory, 'snapshot.json');
    const storage = new MemoryStorage({ bucket: 'persistent', persistPath, logLevel: 'silent' });
    await storage.put('entry', { body: 'value', metadata: { kind: 'test' } });
    await storage.saveToDisk();

    const serialized = JSON.parse(await readFile(persistPath, 'utf8'));
    expect(serialized.objectCount).toBe(1);
    const loaded = new MemoryStorage({ bucket: 'persistent', persistPath, logLevel: 'silent' });
    await loaded.loadFromDisk();
    expect((await loaded.get('entry')).Metadata).toEqual({ kind: 'test' });
  });
});
