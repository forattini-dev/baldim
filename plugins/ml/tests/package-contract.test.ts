import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('@baldin/plugin-ml package contract', () => {
  it('owns TensorFlow and keeps Baldin core as a peer', async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));

    expect(manifest.name).toBe('@baldin/plugin-ml');
    expect(manifest.dependencies).toEqual({ '@tensorflow/tfjs': '^4.22.0' });
    expect(manifest.peerDependencies).toEqual({ '@baldin/core': '^0.1.0' });
  });

  it('contains no legacy product branding', async () => {
    const source = await readFile(resolve(packageRoot, 'src/index.ts'), 'utf8');
    expect(source).not.toMatch(/s3db|bucketdb|buckiedb/i);
  });
});
