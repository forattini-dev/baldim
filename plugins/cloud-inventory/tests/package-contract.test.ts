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

describe('@baldin/plugin-cloud-inventory package contract', () => {
  it('owns all provider SDKs and keeps core as a peer', async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);

    expect(manifest.peerDependencies).toEqual({ '@baldin/core': '^0.1.0' });
    expect([...declared]).toEqual(expect.arrayContaining([
      '@aws-sdk/client-ec2',
      '@aws-sdk/credential-providers',
      '@azure/identity',
      '@google-cloud/compute',
      '@linode/api-v4',
      '@vultr/vultr-node',
      'cloudflare',
      'oci-core',
    ]));
  });

  it('contains no legacy project branding or monolith-only imports', async () => {
    const source = await sourceText(resolve(packageRoot, 'src'));
    expect(source).not.toMatch(/s3db|bucketdb|buckiedb/i);
    expect(source).not.toMatch(/from ['"]\.\.\/concerns|from ['"]\.\/plugin\.class/);
  });
});
