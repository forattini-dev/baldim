import { registerStorageAdapter, type S3ClientConfig, type StorageAdapterContext } from '@buckiedb/core/adapter';
import { S3Client } from './s3-client.class.js';

export { S3Client } from './s3-client.class.js';
export type { S3ClientConfig, HttpClientOptions } from '@buckiedb/core/adapter';

export function createS3Client(context: StorageAdapterContext): S3Client {
  return new S3Client({
    ...context.clientOptions,
    connectionString: context.connectionString,
    logLevel: context.logLevel,
    logger: context.logger as S3ClientConfig['logger'],
    executorPool: context.executorPool as S3ClientConfig['executorPool'],
  });
}

export const unregisterS3Adapter = registerStorageAdapter(
  ['s3', 'http', 'https'],
  (context) => createS3Client(context) as unknown as import('@buckiedb/core/adapter').Client
);

export default S3Client;