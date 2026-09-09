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

describe('@baldin/mcp package contract', () => {
  it('owns every runtime dependency used by the application', () => {
    expect(manifest.dependencies).toMatchObject({
      '@baldin/core': 'workspace:*',
      '@baldin/adapter-memory': 'workspace:*',
      '@baldin/adapter-filesystem': 'workspace:*',
      '@baldin/adapter-reddb': 'workspace:*',
      '@baldin/adapter-s3': 'workspace:*',
      '@baldin/adapter-sqlite': 'workspace:*',
      '@baldin/plugin-cache': 'workspace:*',
      '@baldin/plugin-costs': 'workspace:*',
      '@modelcontextprotocol/sdk': expect.any(String),
      dotenv: expect.any(String),
      'fuse.js': expect.any(String),
    });
  });

  it('uses Baldin package boundaries and branding', () => {
    const source = readTree(new URL('src', packageRoot).pathname);
    expect(source).not.toContain("from 's3db.js'");
    expect(source).not.toContain('s3db://');
    expect(source).not.toContain('S3DB_CONNECTION_STRING');
    expect(source).toContain('baldin://');
  });
});
