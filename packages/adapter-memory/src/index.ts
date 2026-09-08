import { MemoryClient } from './memory-client.class.js';
import type { MemoryAdapterContext } from './types.js';

export { MemoryClient } from './memory-client.class.js';
export { MemoryStorage } from './memory-storage.class.js';
export type { MemoryAdapterContext, MemoryClientConfig, MemoryStorageConfig, MemoryStorageStats, StorageSnapshot } from './types.js';

export function createMemoryClient(context: MemoryAdapterContext): MemoryClient {
  return new MemoryClient({ ...context.clientOptions, logLevel: context.logLevel, logger: context.logger });
}
