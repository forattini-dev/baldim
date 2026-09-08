import { describe, expect, it } from 'vitest';
import { BuckieDB } from '@buckiedb/core';
import { hasStorageAdapter } from '@buckiedb/core/adapter';
import { S3Client, createS3Client } from '../src/index.js';

describe('@buckiedb/adapter-s3', () => {
  it('registers all S3-compatible URL protocols on import', () => {
    expect(hasStorageAdapter('s3')).toBe(true);
    expect(hasStorageAdapter('http:')).toBe(true);
    expect(hasStorageAdapter('https:')).toBe(true);
  });

  it('initializes an S3 BuckieDB connection through the registry', async () => {
    const database = new BuckieDB({
      connectionString: 's3://access:secret@test-bucket?region=us-east-1',
      clientOptions: { httpClientOptions: { useReckerHandler: false } },
      logLevel: 'silent',
    });
    await database.ensureClientInitialized();
    expect(database.client).toBeInstanceOf(S3Client);
    await database.disconnect();
  });
  it('creates an S3 client without making a network request', () => {
    const client = createS3Client({
      connectionString: 's3://access:secret@test-bucket?region=us-east-1',
      clientOptions: { httpClientOptions: { useReckerHandler: false } },
      logLevel: 'silent',
      logger: undefined,
      executorPool: false,
    });

    expect(client).toBeInstanceOf(S3Client);
    client.destroy();
  });
});