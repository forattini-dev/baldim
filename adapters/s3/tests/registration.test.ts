import { describe, expect, it } from 'vitest';
import { Baldim } from '@baldim/core';
import { hasStorageAdapter } from '@baldim/core/adapter';
import { S3Client, createS3Client } from '../src/index.js';

describe('@baldim/adapter-s3', () => {
  it('registers all S3-compatible URL protocols on import', () => {
    expect(hasStorageAdapter('s3')).toBe(true);
    expect(hasStorageAdapter('http:')).toBe(true);
    expect(hasStorageAdapter('https:')).toBe(true);
  });

  it('initializes an S3 Baldim connection through the registry', async () => {
    const database = new Baldim({
      connectionString: 's3://access:secret@test-bucket?region=us-east-1',
      clientOptions: { httpClientOptions: { useReckerHandler: false } },
      logLevel: 'silent',
    });
    await database.ensureClientInitialized();
    expect(database.client).toBeInstanceOf(S3Client);
    expect(database.client.config).toMatchObject({ bucket: 'test-bucket', region: 'us-east-1', keyPrefix: '' });
    await database.disconnect();
  });
  it('owns compatibility parsing for legacy S3 database options', async () => {
    const database = new Baldim({
      bucket: 'legacy-bucket',
      region: 'eu-west-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      logLevel: 'silent',
    });

    await database.ensureClientInitialized();
    expect(database.connectionString).toContain('s3://key:secret@legacy-bucket');
    expect(database.client.config).toMatchObject({ bucket: 'legacy-bucket', region: 'eu-west-1' });
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
    expect(client.config).toMatchObject({ bucket: 'test-bucket', region: 'us-east-1' });
    client.destroy();
  });
});