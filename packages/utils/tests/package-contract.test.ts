import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports: Record<string, unknown>;
};

describe('package contract', () => {
  it('has no provider or web-framework runtime dependency', () => {
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies).toEqual({ '@baldin/core': '^0.1.0' });
    expect(JSON.stringify(manifest)).not.toMatch(/recker|raffel|hono|aws-sdk/);
  });

  it('publishes each focused utility entry point', () => {
    expect(Object.keys(manifest.exports)).toEqual(expect.arrayContaining([
      '.',
      './error-classifier',
      './http-client',
      './memory-profiler',
      './money',
      './optimized-encoding'
    ]));
  });
});
