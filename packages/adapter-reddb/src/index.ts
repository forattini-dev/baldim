import { registerStorageAdapter, type StorageAdapterContext } from '@baldin/core/adapter';
import { RedDbClient } from './reddb-client.class.js';
import type { RedDbClientConfig } from './reddb-types.js';
export { RedDbClient } from './reddb-client.class.js';
export type { RedDbClientConfig } from './reddb-types.js';

export function createRedDbStorageClient(context: StorageAdapterContext): RedDbClient {
  const url = new URL(context.connectionString);
  return new RedDbClient({
    ...context.clientOptions,
    baseUrl: String(context.clientOptions.baseUrl || `http://${url.hostname || 'localhost'}:${url.port || '8080'}`),
    logLevel: context.logLevel,
    logger: context.logger as RedDbClientConfig['logger'],
  });
}
export const unregisterRedDbAdapter = registerStorageAdapter('reddb', (context) => createRedDbStorageClient(context) as unknown as import('@baldin/core/adapter').Client);
