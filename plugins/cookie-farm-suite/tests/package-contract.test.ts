import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

describe('@baldin/plugin-cookie-farm-suite package contract', () => {
  it('declares every composed plugin directly', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

    expect(manifest.dependencies).toEqual({
      '@baldin/plugin-cookie-farm': 'workspace:*',
      '@baldin/plugin-puppeteer': 'workspace:*',
      '@baldin/plugin-s3-queue': 'workspace:*',
      '@baldin/plugin-ttl': 'workspace:*',
    });
    expect(manifest.peerDependencies).toEqual({ '@baldin/core': '^0.1.0' });
  });

  it('contains no legacy project branding in runtime source', async () => {
    const source = await readFile(`${packageRoot}/src/index.ts`, 'utf8');
    expect(source).not.toMatch(/s3db|bucketdb|buckiedb/i);
  });
});
