import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = new URL('..', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8'));

function readTree(directory: string): string {
  return readdirSync(directory).map((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? readTree(path) : readFileSync(path, 'utf8');
  }).join('\n');
}

describe('@baldim/mcp package contract', () => {
  it('owns every runtime dependency used by the application', () => {
    expect(manifest.dependencies).toMatchObject({
      '@baldim/core': 'workspace:*',
      '@baldim/adapter-memory': 'workspace:*',
      '@baldim/adapter-filesystem': 'workspace:*',
      '@baldim/adapter-reddb': 'workspace:*',
      '@baldim/adapter-s3': 'workspace:*',
      '@baldim/adapter-sqlite': 'workspace:*',
      '@baldim/plugin-cache': 'workspace:*',
      '@baldim/plugin-costs': 'workspace:*',
      '@modelcontextprotocol/sdk': expect.any(String),
      dotenv: expect.any(String),
      'fuse.js': expect.any(String),
    });
  });

  it('uses Baldim package boundaries and branding', () => {
    const source = readTree(new URL('src', packageRoot).pathname);
    expect(source).not.toContain("from 's3db.js'");
    expect(source).not.toContain('s3db://');
    expect(source).not.toContain('S3DB_CONNECTION_STRING');
    expect(source).toContain('baldim://');
  });
});
