import { registerStorageAdapter, type StorageAdapterContext } from '@baldim/core/adapter';
import type { FileSystemClientConfig } from './types.js';
import path from 'node:path';
import { FileSystemClient } from './filesystem-client.class.js';

export { FileSystemClient } from './filesystem-client.class.js';
export { FileSystemStorage } from './filesystem-storage.class.js';
export type { FileSystemClientConfig, FileSystemStorageConfig, FileSystemStorageStats, CompressionConfig, TTLConfig, LockingConfig, BackupConfig, JournalConfig, StatsConfig } from './types.js';

function filePathFromUrl(url: URL): string {
  let pathname = url.pathname || '';
  if (url.hostname && /^[a-z]$/i.test(url.hostname)) pathname = `${url.hostname}:${pathname}`;
  else if (url.hostname === '.' || url.hostname === '..') pathname = `${url.hostname}${pathname}`;
  else if (url.hostname && url.hostname !== 'localhost') pathname = `//${url.hostname}${pathname}`;
  const decoded = decodeURIComponent(pathname);
  if (!decoded || decoded === '/') throw new TypeError('file: connection requires a path');
  return path.resolve(decoded);
}

export function createFileSystemClient(context: StorageAdapterContext): FileSystemClient {
  const url = new URL(context.connectionString);
  return new FileSystemClient({
    basePath: filePathFromUrl(url),
    bucket: 's3db',
    keyPrefix: '',
    ...context.clientOptions,
    logLevel: context.logLevel,
    logger: context.logger as FileSystemClientConfig['logger'],
  });
}

export const unregisterFileSystemAdapter = registerStorageAdapter(
  'file',
  (context) => createFileSystemClient(context) as unknown as import('@baldim/core/adapter').Client
);