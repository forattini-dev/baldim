import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

describe('@baldin/plugin-kubernetes-inventory package contract', () => {
  it('owns every Kubernetes runtime dependency and keeps core as a peer', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

    expect(manifest.dependencies).toEqual({
      '@kubernetes/client-node': '^1.0.0',
      'json-stable-stringify': '^1.3.0',
      'lodash-es': '^4.18.1',
      'node-cron': '^4.0.0',
    });
    expect(manifest.peerDependencies).toEqual({
      '@baldin/core': expect.stringMatching(/^\^\d+\.\d+\.\d+$/),
    });
  });

  it('contains no legacy project branding or monolith-only imports', async () => {
    const files = [
      'src/index.ts',
      'src/kubernetes-inventory/k8s-driver.ts',
      'src/kubernetes-inventory/resource-types.ts',
    ];
    const contents = await Promise.all(files.map((path) => readFile(`${packageRoot}/${path}`, 'utf8')));
    const source = contents.join('\n');

    expect(source).not.toMatch(/s3db|bucketdb|buckiedb/i);
    expect(source).not.toMatch(/from ['"]\.\.\/concerns|from ['"]\.\/plugin\.class/);
  });
});
