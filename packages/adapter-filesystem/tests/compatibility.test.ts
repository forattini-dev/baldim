import { createHash } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Baldin } from '@baldin/core';
import { FileSystemClient } from '../src/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 's3db-v21-filesystem');
const paths: string[] = [];

async function digestTree(root: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relative = path.slice(root.length + 1);
      hash.update(relative);
      if (entry.isDirectory()) await visit(path);
      else hash.update(await readFile(path));
    }
  };
  await visit(root);
  return hash.digest('hex');
}

afterEach(async () => {
  for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('s3db.js persisted-data compatibility', () => {
  it('opens v21 metadata, bodies, and partitions without rewriting the fixture', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'baldin-legacy-fixture-'));
    paths.push(directory);
    await cp(fixture, directory, { recursive: true });
    const before = await digestTree(directory);

    const client = new FileSystemClient({
      basePath: directory,
      bucket: 'legacy',
      keyPrefix: 'compat',
      logLevel: 'silent',
    });
    const database = new Baldin({ client, logLevel: 'silent', exitOnSignal: false });
    await database.connect();

    expect(Object.keys(database.resources).sort()).toEqual(['articles', 'users']);
    expect(await database.resources.users.get('ana')).toMatchObject({
      name: 'Ana',
      email: 'ana@example.com',
      region: 'BR',
      active: true,
      score: 42.5,
    });
    expect(await database.resources.users.listIds({
      partition: 'byRegion',
      partitionValues: { region: 'BR' },
    })).toEqual(['ana']);
    expect(await database.resources.articles.get('migration-note')).toMatchObject({
      title: 'Created by s3db.js 21.6.2',
      tags: ['legacy', 'fixture'],
      details: { source: 's3db.js', compatible: true },
    });

    await database.disconnect();
    expect(await digestTree(directory)).toBe(before);
  });
});
