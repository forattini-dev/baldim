import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Baldin } from '@baldin/core';
import { FileSystemClient } from '../src/index.js';
import { runStorageAdapterContract } from '../../../tests/storage-adapter-contract.js';

const paths: string[] = [];
afterEach(async () => { for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true }); });

describe('@baldin/adapter-filesystem', () => {
  it('owns file connection parsing and query overrides', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'baldin-fs-options-'));
    paths.push(directory);
    const database = new Baldin({ connectionString: `file://${directory}?bucket=custom&keyPrefix=nested`, logLevel: 'silent' });
    await database.ensureClientInitialized();
    expect(database.client.config).toMatchObject({ basePath: directory, bucket: 'custom', keyPrefix: 'nested' });
    await database.disconnect();
  });

  it('runs document CRUD through a registered file: connection', async () => {
    const path = await mkdtemp(join(tmpdir(), 'baldin-fs-'));
    paths.push(path);
    const database = new Baldin({ connectionString: `file://${path}`, logLevel: 'silent' });
    await database.connect();
    expect(database.client).toBeInstanceOf(FileSystemClient);
    const notes = await database.createResource({ name: 'notes', attributes: { title: 'string|required' } });
    await notes.insert({ id: 'one', title: 'stored' });
    expect(await notes.get('one')).toMatchObject({ title: 'stored' });
    await database.disconnect();
  });
});
runStorageAdapterContract('@baldin/adapter-filesystem', async () => {
  const path = await mkdtemp(join(tmpdir(), 'baldin-fs-contract-'));
  paths.push(path);
  return new FileSystemClient({ basePath: path, bucket: 'contract', logLevel: 'silent' });
});
