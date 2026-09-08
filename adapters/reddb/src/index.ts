import { registerStorageAdapter, type StorageAdapterContext } from '@baldin/core/adapter';
import { RedDbClient } from './reddb-client.class.js';
import type { RedDbClientConfig } from './reddb-types.js';
export { RedDbClient } from './reddb-client.class.js';
export type { RedDbClientConfig } from './reddb-types.js';

export function createRedDbStorageClient(context: StorageAdapterContext): RedDbClient {
  const url = new URL(context.connectionString);
  const collection = url.searchParams.get('collection') || 's3db';
  const keyPrefix = url.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/');
  return new RedDbClient({
    baseUrl: `http://${url.hostname || 'localhost'}:${url.port || '8080'}`,
    authToken: url.username ? decodeURIComponent(url.username) : undefined,
    writeToken: url.password ? decodeURIComponent(url.password) : undefined,
    collection,
    bucket: collection,
    keyPrefix,
    region: 'reddb',
    ...context.clientOptions,
    logLevel: context.logLevel,
    logger: context.logger as RedDbClientConfig['logger'],
  });
}
export const unregisterRedDbAdapter = registerStorageAdapter('reddb', (context) => createRedDbStorageClient(context) as unknown as import('@baldin/core/adapter').Client);
