import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Baldim } from '@baldim/core';
import { SqliteClient } from '../src/index.js';
import { runStorageAdapterContract } from '../../../tests/storage-adapter-contract.js';

const paths: string[] = [];
afterEach(async () => { for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true }); });

describe('@baldim/adapter-sqlite', () => {
  it('owns sqlite connection parsing and query overrides', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'baldim-sqlite-options-'));
    paths.push(directory);
    const file = join(directory, 'options.sqlite');
    const database = new Baldim({ connectionString: `sqlite:///${file.replace(/^\//, '')}?bucket=custom&keyPrefix=nested`, logLevel: 'silent' });
    await database.ensureClientInitialized();
    expect(database.client.config).toMatchObject({ basePath: file, bucket: 'custom', keyPrefix: 'nested' });
    await database.disconnect();
  });

  it('runs document CRUD through sqlite:', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'baldim-sqlite-'));
    paths.push(dir);
    const file = join(dir, 'data.sqlite');
    const database = new Baldim({ connectionString: `sqlite:///${file.replace(/^\//, '')}`, logLevel: 'silent' });
    await database.connect();
    expect(database.client).toBeInstanceOf(SqliteClient);
    const notes = await database.createResource({ name: 'notes', attributes: { title: 'string|required' } });
    await notes.insert({ id: 'one', title: 'stored' });
    expect(await notes.get('one')).toMatchObject({ title: 'stored' });
    await database.disconnect();
  });
});
runStorageAdapterContract('@baldim/adapter-sqlite', async () => {
  const path = await mkdtemp(join(tmpdir(), 'baldim-sqlite-contract-'));
  paths.push(path);
  return new SqliteClient({ basePath: join(path, 'contract.sqlite'), bucket: 'contract', logLevel: 'silent' });
});
