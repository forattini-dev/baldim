import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function sourceText(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const chunks = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceText(path);
    return extname(entry.name) === '.ts' ? readFile(path, 'utf8') : '';
  }));
  return chunks.join('\n');
}

describe('@baldin/plugin-replicator package contract', () => {
  it('owns every target client and keeps core as a peer', async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@aws-sdk/client-dynamodb', '@aws-sdk/client-sqs', '@aws-sdk/lib-dynamodb',
      '@google-cloud/bigquery', '@libsql/client', '@planetscale/database',
      'mongodb', 'mysql2', 'pg',
    ]);
    expect(manifest.peerDependencies).toEqual({
      '@baldin/core': expect.stringMatching(/^\^\d+\.\d+\.\d+$/),
    });
  });

  it('contains no legacy product branding', async () => {
    expect(await sourceText(resolve(packageRoot, 'src'))).not.toMatch(/s3db|bucketdb|buckiedb/i);
  });
});
