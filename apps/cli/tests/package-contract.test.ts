import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('@baldin/cli package contract', () => {
  it('owns its runtime dependencies and delegates MCP to its public app package', () => {
    expect(manifest.bin).toEqual({ baldin: './dist/index.js' });
    expect(manifest.dependencies).toMatchObject({
      '@baldin/core': 'workspace:*',
      '@baldin/mcp': 'workspace:*',
      '@baldin/adapter-memory': 'workspace:*',
      '@baldin/adapter-filesystem': 'workspace:*',
      '@baldin/adapter-reddb': 'workspace:*',
      '@baldin/adapter-s3': 'workspace:*',
      '@baldin/adapter-sqlite': 'workspace:*',
      'cli-args-parser': expect.any(String),
      'tuiuiu.js': expect.any(String),
    });
  });
});
