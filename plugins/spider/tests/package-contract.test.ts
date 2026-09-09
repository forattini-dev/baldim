import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function sourceText(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceText(path);
    return extname(entry.name) === '.ts' ? readFile(path, 'utf8') : '';
  }))).join('\n');
}

describe('@baldin/plugin-spider package contract', () => {
  it('owns every directly imported runtime and composes plugins through package dependencies', async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
    const runtime = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    };

    expect(manifest.peerDependencies).toEqual({ '@baldin/core': '^0.1.0' });
    expect(runtime).toMatchObject({
      '@baldin/plugin-puppeteer': 'workspace:*',
      '@baldin/plugin-queue-consumer': 'workspace:*',
      '@baldin/plugin-s3-queue': 'workspace:*',
      '@baldin/plugin-ttl': 'workspace:*',
      '@aws-sdk/client-sqs': '^3.0.0',
      amqplib: '^0.10.8',
      bullmq: '>=5.0.0',
      ioredis: '^5.4.1',
      puppeteer: '^24.29.1',
      'puppeteer-core': '^24.29.1',
      recker: '1.0.103',
    });
  });

  it('contains no legacy branding or monolith-only imports', async () => {
    const source = await sourceText(resolve(packageRoot, 'src'));
    expect(source).not.toMatch(/s3db|bucketdb|buckiedb/i);
    expect(source).not.toMatch(/#src|from ['"]\.\.\/concerns|from ['"]\.\/plugin\.class/);
  });
});
