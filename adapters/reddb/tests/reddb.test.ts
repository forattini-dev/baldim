import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Baldim } from '@baldim/core';
import { RedDbClient } from '../src/index.js';
describe('@baldim/adapter-reddb', () => {
  it('initializes reddb: through the public registry without a request', async () => {
    const database = new Baldim({ connectionString: 'reddb://token@localhost:8080/app', logLevel: 'silent' });
    await database.ensureClientInitialized();
    expect(database.client).toBeInstanceOf(RedDbClient);
    expect(database.client.config).toMatchObject({ bucket: 's3db', keyPrefix: 'app', region: 'reddb' });
    await database.disconnect();
  });

  it('owns only its HTTP transport and shared utility dependencies', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(manifest.dependencies).toEqual({
      '@baldim/core': 'workspace:*',
      '@baldim/utils': 'workspace:*',
      'lodash-es': '^4.18.1'
    });
    expect(JSON.stringify(manifest)).not.toMatch(/recker|raffel|hono/);
  });
});
