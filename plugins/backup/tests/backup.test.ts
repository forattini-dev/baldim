import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import {
  BackupPlugin,
  FilesystemBackupDriver,
  S3BackupDriver,
  MultiBackupDriver,
  createBackupDriver,
  validateBackupConfig
} from '../src/index.js';
import { readBackupArchive, writeBackupArchive, decodeArchiveFile } from '../src/archive.js';

let database: Baldim | undefined;
let testDir: string;

beforeEach(async () => {
  MemoryClient.clearAllStorage();
  testDir = await mkdtemp(path.join(tmpdir(), 'baldim-backup-test-'));
});

afterEach(async () => {
  await database?.disconnect();
  database = undefined;
  await rm(testDir, { recursive: true, force: true });
});

async function createDatabase(name: string): Promise<Baldim> {
  database = new Baldim({ connectionString: `memory://${name}`, logLevel: 'silent' });
  await database.connect();
  return database;
}

describe('backup archive codec', () => {
  it.each(['none', 'gzip', 'brotli', 'deflate'] as const)(
    'round-trips binary files with %s compression',
    async compression => {
      const target = path.join(testDir, `${compression}.backup`);
      const binary = Buffer.from([0, 255, 1, 128, 42]);
      await writeBackupArchive(target, [{ name: 'data.bin', data: binary }], compression, null);
      const archive = await readBackupArchive(target, compression, null);
      expect(decodeArchiveFile(archive.files[0]!)).toEqual(binary);
    }
  );

  it('encrypts and authenticates an archive', async () => {
    const target = path.join(testDir, 'encrypted.backup');
    const encryption = { key: 'correct horse battery staple', algorithm: 'aes-256-gcm' };
    await writeBackupArchive(target, [{ name: 'data.json', data: Buffer.from('{"ok":true}'), text: true }], 'gzip', encryption);
    expect((await readFile(target, 'utf8'))).not.toContain('"ok":true');
    const archive = await readBackupArchive(target, 'gzip', encryption);
    expect(decodeArchiveFile(archive.files[0]!).toString()).toBe('{"ok":true}');
    await expect(readBackupArchive(target, 'gzip', { ...encryption, key: 'wrong' })).rejects.toThrow();
  });
});

describe('filesystem backup driver', () => {
  it('detects checksum mismatches', async () => {
    const source = path.join(testDir, 'source.bin');
    await writeFile(source, 'backup data');
    const driver = new FilesystemBackupDriver({ path: path.join(testDir, 'store'), logLevel: 'silent' });
    const uploaded = await driver.upload(source, 'backup-1', { type: 'full' });
    const checksum = createHash('sha256').update('backup data').digest('hex');
    await expect(driver.verify('backup-1', checksum, uploaded)).resolves.toBe(true);
    await expect(driver.verify('backup-1', 'bad-checksum', uploaded)).resolves.toBe(false);
  });
});


describe('S3 backup driver contract', () => {
  it('works with the public structural methods used by @baldim/adapter-s3', async () => {
    const objects = new Map<string, Buffer>();
    const client = {
      config: { bucket: 'unit-test' },
      async putObject({ key, body }: { key: string; body: unknown }) {
        if (typeof body === 'string') objects.set(key, Buffer.from(body));
        else {
          const chunks: Buffer[] = [];
          for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
          objects.set(key, Buffer.concat(chunks));
        }
        return { ETag: 'etag' };
      },
      async getObject(key: string) {
        const value = objects.get(key);
        if (!value) throw new Error('missing');
        return { Body: value };
      },
      async deleteObject(key: string) {
        objects.delete(key);
      },
      async listObjects({ prefix = '' }: { prefix?: string }) {
        return {
          Contents: [...objects.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([Key, value]) => ({
              Key,
              Size: value.byteLength,
              LastModified: new Date('2026-01-01T00:00:00.000Z')
            }))
        };
      }
    };

    const db = await createDatabase('backup-s3-contract');
    const source = path.join(testDir, 'source.backup');
    const target = path.join(testDir, 'downloaded.backup');
    await writeFile(source, 'object storage backup');
    const driver = new S3BackupDriver({
      client,
      path: 'backups/{date}',
      logLevel: 'silent'
    });
    await driver.setup(db);

    const uploaded = await driver.upload(source, 's3-one', { type: 'full' });
    const checksum = createHash('sha256').update('object storage backup').digest('hex');
    expect(await driver.verify('s3-one', checksum, uploaded)).toBe(true);
    expect(await driver.verify('s3-one', 'wrong', uploaded)).toBe(false);
    expect((await driver.list()).map(item => item.id)).toEqual(['s3-one']);
    await driver.download('s3-one', target, uploaded);
    expect(await readFile(target, 'utf8')).toBe('object storage backup');
    expect(driver.getStorageInfo().config).not.toHaveProperty('client');
    await driver.delete('s3-one', uploaded);
    expect(await driver.list()).toEqual([]);
  });
});

describe('BackupPlugin', () => {
  it('backs up, lists, and restores a resource through the public Baldim API', async () => {
    const db = await createDatabase('backup-e2e');
    const users = await db.createResource({
      name: 'users',
      behavior: 'body-only',
      attributes: { id: 'string|required', name: 'string|required' }
    });
    await users.insert({ id: 'u1', name: 'Ada' });

    const onBackupComplete = vi.fn();
    const onRestoreComplete = vi.fn();
    const plugin = new BackupPlugin({
      logLevel: 'silent',
      config: { path: path.join(testDir, 'store', '{date}') },
      tempDir: path.join(testDir, 'temp'),
      onBackupComplete,
      onRestoreComplete
    });
    await db.usePlugin(plugin);

    const result = await plugin.backup();
    expect(result.type).toBe('full');
    expect(result.checksum).toHaveLength(64);
    const archive = await readBackupArchive(
      (result.driverInfo as { path: string }).path,
      'gzip',
      null
    );
    const definitionMetadata = JSON.parse(
      decodeArchiveFile(archive.files.find(file => file.name === 's3db.json')!).toString('utf8')
    );
    expect(definitionMetadata.resources.users).toMatchObject({
      name: 'users',
      behavior: 'body-only',
      exportFile: 'users.jsonl.gz'
    });
    expect(await plugin.getBackupStatus(result.id)).toMatchObject({ status: 'completed' });
    expect((await plugin.listBackups()).map(item => item.id)).toContain(result.id);
    expect(onBackupComplete).toHaveBeenCalledOnce();

    await users.update('u1', { name: 'Changed' });
    await users.insert({ id: 'u2', name: 'Grace' });
    const restored = await plugin.restore(result.id, { overwrite: true });

    expect(restored.restored).toEqual([
      { name: 'users', recordsRestored: 1, totalRecords: 1 }
    ]);
    expect(await users.list()).toEqual([
      expect.objectContaining({ id: 'u1', name: 'Ada' })
    ]);
    expect(onRestoreComplete).toHaveBeenCalledOnce();
  });

  it('honors include and exclude without backing up its metadata resource', async () => {
    const db = await createDatabase('backup-filters');
    const users = await db.createResource({ name: 'users', attributes: { value: 'string' } });
    const logs = await db.createResource({ name: 'logs', attributes: { value: 'string' } });
    await users.insert({ id: 'u1', value: 'keep' });
    await logs.insert({ id: 'l1', value: 'omit' });

    const plugin = new BackupPlugin({
      logLevel: 'silent',
      include: ['users', 'logs', 'plg_backup_metadata'],
      exclude: ['logs'],
      compression: 'none',
      config: { path: path.join(testDir, 'store') },
      tempDir: path.join(testDir, 'temp')
    });
    await db.usePlugin(plugin);
    const result = await plugin.backup();

    for (const id of await users.listIds()) await users.delete(id);
    for (const id of await logs.listIds()) await logs.delete(id);
    const restored = await plugin.restore(result.id, { mode: 'replace' });

    expect(restored.restored.map(item => item.name)).toEqual(['users']);
    expect(await users.listIds()).toEqual(['u1']);
    expect(await logs.listIds()).toEqual([]);
  });

  it('exports only records changed after the previous backup', async () => {
    const db = await createDatabase('backup-incremental');
    const records = await db.createResource({
      name: 'records',
      timestamps: true,
      attributes: { value: 'string' }
    });
    await records.insert({ id: 'one', value: 'first' });
    await records.insert({ id: 'two', value: 'second' });
    const plugin = new BackupPlugin({
      logLevel: 'silent',
      config: { path: path.join(testDir, 'incremental') },
      tempDir: path.join(testDir, 'temp')
    });
    await db.usePlugin(plugin);
    await plugin.backup('full');
    await new Promise(resolve => setTimeout(resolve, 2));
    await records.update('two', { value: 'changed' });
    const incremental = await plugin.backup('incremental');

    await records.delete('one');
    await records.delete('two');
    const restored = await plugin.restore(incremental.id, { mode: 'replace' });
    expect(restored.restored).toEqual([
      { name: 'records', recordsRestored: 1, totalRecords: 1 }
    ]);
    expect(await records.listIds()).toEqual(['two']);
    expect(await records.get('two')).toMatchObject({ value: 'changed' });
  });

  it('backs up and restores encrypted data', async () => {
    const db = await createDatabase('backup-encrypted');
    const secrets = await db.createResource({ name: 'secrets', attributes: { value: 'string' } });
    await secrets.insert({ id: 's1', value: 'classified' });
    const plugin = new BackupPlugin({
      logLevel: 'silent',
      compression: 'brotli',
      encryption: { key: 'test backup key', algorithm: 'aes-256-gcm' },
      config: { path: path.join(testDir, 'encrypted') },
      tempDir: path.join(testDir, 'temp')
    });
    await db.usePlugin(plugin);
    const result = await plugin.backup();
    await secrets.delete('s1');
    await plugin.restore(result.id);
    expect(await secrets.get('s1')).toMatchObject({ value: 'classified' });
  });

  it('backs up and restores through multiple filesystem destinations', async () => {
    const db = await createDatabase('backup-multi');
    const records = await db.createResource({ name: 'records', attributes: { value: 'string' } });
    await records.insert({ id: 'one', value: 'original' });
    const plugin = new BackupPlugin({
      logLevel: 'silent',
      driver: 'multi',
      config: {
        destinations: [
          { driver: 'filesystem', config: { path: path.join(testDir, 'one') } },
          { driver: 'filesystem', config: { path: path.join(testDir, 'two') } }
        ],
        strategy: 'all',
        concurrency: 1
      },
      tempDir: path.join(testDir, 'temp')
    });
    await db.usePlugin(plugin);
    const backup = await plugin.backup();

    expect(backup.driverInfo).toEqual([
      expect.objectContaining({ destination: 0, status: 'success' }),
      expect.objectContaining({ destination: 1, status: 'success' })
    ]);
    await records.delete('one');
    await plugin.restore(backup.id);
    expect(await records.get('one')).toMatchObject({ value: 'original' });
  });

  it('runs driver cleanup through the base plugin lifecycle', async () => {
    const db = await createDatabase('backup-cleanup');
    const plugin = new BackupPlugin({
      logLevel: 'silent',
      config: { path: path.join(testDir, 'cleanup') },
      tempDir: path.join(testDir, 'temp')
    });
    await db.usePlugin(plugin);
    const cleanup = vi.spyOn(plugin.driver!, 'cleanup');
    await db.uninstallPlugin('backup');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('rejects unauthenticated archive encryption algorithms', () => {
    expect(() => new BackupPlugin({
      config: { path: path.join(testDir, 'store') },
      encryption: { key: 'secret', algorithm: 'aes-256-cbc' }
    })).toThrow('must be aes-256-gcm');
  });

  it('validates and constructs the multi-destination driver', () => {
    expect(() => new BackupPlugin({ logLevel: 'silent' })).not.toThrow();
    const config = {
      destinations: [
        { driver: 'filesystem' as const, config: { path: path.join(testDir, 'one') } },
        { driver: 'filesystem' as const, config: { path: path.join(testDir, 'two') } }
      ],
      strategy: 'all' as const
    };
    expect(validateBackupConfig('multi', config)).toBe(true);
    expect(createBackupDriver('multi', config)).toBeInstanceOf(MultiBackupDriver);
    expect(() => validateBackupConfig('multi', { destinations: [] })).toThrow('non-empty');
    expect(() => validateBackupConfig('unknown', {})).toThrow('Unknown backup driver');
  });
});
