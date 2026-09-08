import { describe, expect, it } from 'vitest';
import { ConnectionString } from '../src/connection-string.class.js';
import {
  createStorageClient,
  hasStorageAdapter,
  registerStorageAdapter,
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

  it('explains how to enable S3 when no adapter is registered', async () => {
    await expect(createStorageClient('s3', context)).rejects.toThrow('@baldin/adapter-s3');
  });
});