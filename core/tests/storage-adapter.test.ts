import { describe, expect, it } from 'vitest';
import { ConnectionString } from '../src/connection-string.class.js';
import {
  createStorageClient,
  hasStorageAdapter,
  registerStorageAdapter,
  resolveLegacyConnectionString,
  type StorageAdapterContext,
} from '../src/storage-adapter.js';

const context: StorageAdapterContext = {
  connectionString: 'example://bucket',
  clientOptions: {},
  logLevel: 'silent',
  logger: undefined,
  executorPool: false,
};

describe('storage adapter registry', () => {
  it('parses nested adapter options without knowing the provider', () => {
    const parsed = new ConnectionString('custom://host/path?retry.count=3&enabled=true&name=value');
    expect(parsed.protocol).toBe('custom');
    expect(parsed.clientOptions).toEqual({ retry: { count: 3 }, enabled: true, name: 'value' });
  });

  it('registers, resolves, and unregisters protocol factories', async () => {
    const client = { id: 'example-client' };
    const unregister = registerStorageAdapter('example', () => client as never);

    expect(hasStorageAdapter('example:')).toBe(true);
    expect(await createStorageClient('EXAMPLE:', context)).toBe(client);

    unregister();
    expect(hasStorageAdapter('example')).toBe(false);
  });

  it('reports an unregistered protocol without knowing its provider', async () => {
    await expect(createStorageClient('missing', context)).rejects.toThrow(
      'No storage adapter is registered for missing:'
    );
  });

  it('lets an adapter own legacy option resolution', () => {
    const unregister = registerStorageAdapter('legacy', () => ({ id: 'legacy' }) as never, {
      legacyConnectionString: (options) => options.legacyBucket === 'docs'
        ? 'legacy://docs'
        : undefined,
    });

    expect(resolveLegacyConnectionString({ legacyBucket: 'docs' })).toBe('legacy://docs');
    unregister();
    expect(resolveLegacyConnectionString({ legacyBucket: 'docs' })).toBeUndefined();
  });
});