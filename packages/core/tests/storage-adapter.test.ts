import { describe, expect, it } from 'vitest';
import {
  createStorageClient,
  hasStorageAdapter,
  registerStorageAdapter,
  type StorageAdapterContext,
} from '../src/storage-adapter.js';
import { MemoryClient } from '../src/clients/memory-client.class.js';

const context: StorageAdapterContext = {
  connectionString: 'example://bucket',
  clientOptions: {},
  logLevel: 'silent',
  logger: undefined,
  executorPool: false,
};

describe('storage adapter registry', () => {
  it('registers, resolves, and unregisters protocol factories', async () => {
    const unregister = registerStorageAdapter('example', () => new MemoryClient());

    expect(hasStorageAdapter('example:')).toBe(true);
    expect(await createStorageClient('EXAMPLE:', context)).toBeInstanceOf(MemoryClient);

    unregister();
    expect(hasStorageAdapter('example')).toBe(false);
  });

  it('explains how to enable S3 when no adapter is registered', async () => {
    await expect(createStorageClient('s3', context)).rejects.toThrow('@buckiedb/adapter-s3');
  });
});