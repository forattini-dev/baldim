import { registerStorageAdapter, type StorageAdapterContext } from '@baldim/core/adapter';
import type { RemoteSqliteClientConfig, SqliteClientConfig } from './client-types.js';
import path from 'node:path';
import { SqliteClient } from './sqlite-client.class.js';
import { RemoteSqliteClient } from './remote-sqlite-client.class.js';

export { SqliteClient } from './sqlite-client.class.js';
export { RemoteSqliteClient } from './remote-sqlite-client.class.js';
export { isNodeSqliteAvailable } from './sqlite-runtime.js';
export type { SqliteClientConfig, RemoteSqliteClientConfig } from './client-types.js';

function sqlitePathFromUrl(url: URL): string {
  let pathname = url.pathname || '';
  if (url.hostname && /^[a-z]$/i.test(url.hostname)) pathname = `${url.hostname}:${pathname}`;
  else if (url.hostname === '.' || url.hostname === '..') pathname = `${url.hostname}${pathname}`;
  const decoded = decodeURIComponent(pathname);
  if (!decoded || decoded === '/') throw new TypeError('sqlite: connection requires a path');
  if (decoded === '/:memory:' || decoded === ':memory:') return ':memory:';
  return path.resolve(decoded);
}

function createLocal(context: StorageAdapterContext): SqliteClient {
  const url = new URL(context.connectionString);
  return new SqliteClient({
    basePath: sqlitePathFromUrl(url),
    bucket: 's3db',
    keyPrefix: '',
    region: 'sqlite',
    ...context.clientOptions,
    logLevel: context.logLevel,
    logger: context.logger as SqliteClientConfig['logger'],
  });
}

function createRemote(context: StorageAdapterContext): RemoteSqliteClient {
  const driver = context.connectionString.startsWith('sqlite+d1:') ? 'd1' : 'libsql';
  const url = new URL(context.connectionString);
  const endpoint = `${url.protocol}//${url.host}${url.pathname || ''}`;
  return new RemoteSqliteClient({
    connectionString: context.connectionString,
    endpoint,
    bucket: 's3db',
    keyPrefix: '',
    region: 'sqlite',
    ...context.clientOptions,
    sqliteDriver: driver,
    logLevel: context.logLevel,
    logger: context.logger as RemoteSqliteClientConfig['logger'],
  });
}

export const unregisterSqliteAdapter = registerStorageAdapter('sqlite', (context) => createLocal(context) as unknown as import('@baldim/core/adapter').Client);
export const unregisterRemoteSqliteAdapter = registerStorageAdapter(['sqlite+libsql', 'sqlite+d1'], (context) => createRemote(context) as unknown as import('@baldim/core/adapter').Client);
