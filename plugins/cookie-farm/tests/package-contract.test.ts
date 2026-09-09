import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

describe('@baldin/plugin-cookie-farm package contract', () => {
  it('owns its Puppeteer plugin dependency while keeping core as a peer', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

    expect(manifest.dependencies).toEqual({ '@baldin/plugin-puppeteer': 'workspace:*' });
    expect(manifest.peerDependencies).toEqual({ '@baldin/core': '^0.1.0' });
  });

  it('contains no legacy project branding in runtime source', async () => {
    const contents = await Promise.all(['src/index.ts', 'src/errors.ts']
      .map((path) => readFile(`${packageRoot}/${path}`, 'utf8')));

    expect(contents.join('\n')).not.toMatch(/s3db|bucketdb|buckiedb/i);
  });
});
