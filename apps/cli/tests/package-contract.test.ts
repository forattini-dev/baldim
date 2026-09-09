import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('@baldim/cli package contract', () => {
  it('owns its runtime dependencies and delegates MCP to its public app package', () => {
    expect(manifest.bin).toEqual({ baldim: './dist/index.js' });
    expect(manifest.dependencies).toMatchObject({
      '@baldim/core': 'workspace:*',
      '@baldim/mcp': 'workspace:*',
      '@baldim/adapter-memory': 'workspace:*',
      '@baldim/adapter-filesystem': 'workspace:*',
      '@baldim/adapter-reddb': 'workspace:*',
      '@baldim/adapter-s3': 'workspace:*',
      '@baldim/adapter-sqlite': 'workspace:*',
      'cli-args-parser': expect.any(String),
      'tuiuiu.js': expect.any(String),
    });
  });
});
