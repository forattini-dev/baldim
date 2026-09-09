import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Baldim } from '@baldim/core';
import { SqliteClient } from '../src/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 's3db-v21.sqlite');
const paths: string[] = [];

async function digest(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

afterEach(async () => {
  for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('s3db.js SQLite persisted-data compatibility', () => {
  it('opens v21 metadata, bodies, and partitions without rewriting the database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'baldim-legacy-sqlite-'));
    paths.push(directory);
    const databasePath = join(directory, 'legacy.sqlite');
    await copyFile(fixture, databasePath);
    const before = await digest(databasePath);

    const client = new SqliteClient({
      basePath: databasePath,
      bucket: 'legacy',
      keyPrefix: 'compat',
      logLevel: 'silent'
    });
    const database = new Baldim({ client, logLevel: 'silent', exitOnSignal: false });
    await database.connect();

    expect(Object.keys(database.resources).sort()).toEqual(['articles', 'users']);
    expect(await database.resources.users.get('ana')).toMatchObject({
      name: 'Ana',
      email: 'ana@example.com',
      region: 'BR',
      active: true,
      score: 42.5
    });
    expect(await database.resources.users.listIds({
      partition: 'byRegion',
      partitionValues: { region: 'BR' }
    })).toEqual(['ana']);
    expect(await database.resources.articles.get('migration-note')).toMatchObject({
      title: 'Created by s3db.js 21.6.2',
      tags: ['legacy', 'fixture'],
      details: { source: 's3db.js', compatible: true }
    });

    await database.disconnect();
    expect(await digest(databasePath)).toBe(before);
  });
});
