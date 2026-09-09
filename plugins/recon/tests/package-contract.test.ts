import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ReconPlugin } from '../src/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function sourceText(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceText(path);
    return extname(entry.name) === '.ts' ? readFile(path, 'utf8') : '';
  }))).join('\n');
}

describe('@baldim/plugin-recon package contract', () => {
  it('owns Recker and RedBlue while keeping core as a peer', async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
    expect(manifest.dependencies).toMatchObject({ recker: '1.0.103' });
    expect(manifest.optionalDependencies).toMatchObject({ 'redblue-cli': '^0.1.0' });
    expect(manifest.peerDependencies).toEqual({
      '@baldim/core': expect.stringMatching(/^\^\d+\.\d+\.\d+$/),
    });
  });

  it('contains no legacy branding or monolith-only imports', async () => {
    const source = await sourceText(resolve(packageRoot, 'src'));
    expect(source).not.toMatch(/s3db|bucketdb|buckiedb/i);
    expect(source).not.toMatch(/#src|from ['"]\.\.\/\.\.\/\.\.\/(concerns|tasks)|plugin\.class/);
  });

  it('constructs without registering process-wide signal handlers', () => {
    const before = Object.fromEntries(
      ['SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException', 'unhandledRejection']
        .map((event) => [event, process.listenerCount(event)]),
    );

    for (let index = 0; index < 5; index += 1) {
      new ReconPlugin({ behavior: 'passive', logLevel: 'silent' });
    }

    for (const [event, count] of Object.entries(before)) {
      expect(process.listenerCount(event)).toBe(count);
    }
  });
});
