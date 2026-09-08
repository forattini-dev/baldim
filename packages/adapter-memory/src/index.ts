import { MemoryClient } from './memory-client.class.js';
import type { MemoryAdapterContext } from './types.js';

export { MemoryClient } from './memory-client.class.js';
export { MemoryStorage } from './memory-storage.class.js';
export type { MemoryAdapterContext, MemoryClientConfig, MemoryStorageConfig, MemoryStorageStats, StorageSnapshot } from './types.js';

export function createMemoryClient(context: MemoryAdapterContext): MemoryClient {
  const url = new URL(context.connectionString);
  const bucket = decodeURIComponent(url.hostname || 's3db');
  const keyPrefix = url.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/');
  return new MemoryClient({
    bucket,
    keyPrefix,
    ...context.clientOptions,
    logLevel: context.logLevel,
    logger: context.logger,
  });
}
