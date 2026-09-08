import { registerStorageAdapter, type FileSystemClientConfig, type StorageAdapterContext } from '@baldin/core/adapter';
import { FileSystemClient } from './filesystem-client.class.js';

export { FileSystemClient } from './filesystem-client.class.js';
export { FileSystemStorage } from './filesystem-storage.class.js';
export type { FileSystemClientConfig, FileSystemStorageConfig } from '@baldin/core/adapter';

export function createFileSystemClient(context: StorageAdapterContext): FileSystemClient {
  return new FileSystemClient({
    ...context.clientOptions,
    logLevel: context.logLevel,
    logger: context.logger as FileSystemClientConfig['logger'],
  });
}

export const unregisterFileSystemAdapter = registerStorageAdapter(
  'file',
  (context) => createFileSystemClient(context) as unknown as import('@baldin/core/adapter').Client
);