import { afterEach, describe, expect, it } from 'vitest';
import { Baldim } from '@baldim/core';
import '@baldim/adapter-memory';
import { CachePlugin } from '@baldim/plugin-cache';
import { FilesystemCache } from '@baldim/plugin-cache/drivers';
import { CostsPlugin } from '@baldim/plugin-costs';
import { parseArgs } from '../src/entrypoint.js';
import { resolveConfig } from '../src/config.js';
import { createConnectionHandlers } from '../src/tools/connection.js';
import { createDocsSearchHandlers } from '../src/tools/docs-search.js';

const envKeys = [
  'BALDIM_CONNECTION_STRING',
  'BALDIM_VERBOSE',
  'BALDIM_PARALLELISM',
  'BALDIM_CACHE_ENABLED',
];

afterEach(() => {
  for (const key of envKeys) delete process.env[key];
});

describe('Baldim MCP', () => {
  it('parses both split and equals transport arguments', () => {
    expect(parseArgs(['--transport=http', '--host=127.0.0.1', '--port=18000'])).toEqual({
      transport: 'http', host: '127.0.0.1', port: 18000,
    });
    expect(parseArgs(['--transport', 'stdio'])).toMatchObject({ transport: 'stdio' });
  });

  it('resolves canonical Baldim environment configuration', () => {
    process.env.BALDIM_CONNECTION_STRING = 'memory://mcp-config';
    process.env.BALDIM_VERBOSE = 'true';
    process.env.BALDIM_PARALLELISM = '4';
    process.env.BALDIM_CACHE_ENABLED = 'false';

    expect(resolveConfig()).toMatchObject({
      connectionString: 'memory://mcp-config',
      verbose: true,
      parallelism: 4,
      cache: { enabled: false },
    });
  });

  it('searches the documentation bundled with the package', async () => {
    const handlers = createDocsSearchHandlers({} as never);
    const result = await handlers.baldimSearchDocs({ query: 'storage adapter', limit: 5 });

    expect(result.success).toBe(true);
    expect(result.totalDocs).toBeGreaterThan(5);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.some((item: { uri?: string }) => item.uri?.startsWith('baldim://'))).toBe(true);
  });

  it('connects and disconnects through the public memory adapter', async () => {
    const handlers = createConnectionHandlers({} as never);
    const result = await handlers.dbConnect({
      connectionString: `memory://mcp-${Date.now()}`,
      enableCache: false,
      enableCosts: false,
    }, null, { Baldim, CachePlugin, CostsPlugin, FilesystemCache });

    expect(result.success).toBe(true);
    expect(result.database).toBeInstanceOf(Baldim);
    expect(result.database.isConnected()).toBe(true);

    const disconnected = await handlers.dbDisconnect({}, result.database);
    expect(disconnected).toMatchObject({ success: true, clearDatabase: true });
  });
});
