import { registerStorageAdapter, type StorageAdapterContext } from '@baldin/core/adapter';
import type { RemoteSqliteClientConfig, SqliteClientConfig } from './client-types.js';
import { SqliteClient } from './sqlite-client.class.js';
import { RemoteSqliteClient } from './remote-sqlite-client.class.js';

export { SqliteClient } from './sqlite-client.class.js';
export { RemoteSqliteClient } from './remote-sqlite-client.class.js';
export type { SqliteClientConfig, RemoteSqliteClientConfig } from './client-types.js';

function createLocal(context: StorageAdapterContext): SqliteClient {
  return new SqliteClient({ ...context.clientOptions, logLevel: context.logLevel, logger: context.logger as SqliteClientConfig['logger'] });
}

function createRemote(context: StorageAdapterContext): RemoteSqliteClient {
  const driver = context.connectionString.startsWith('sqlite+d1:') ? 'd1' : 'libsql';
  return new RemoteSqliteClient({
    ...context.clientOptions,
    connectionString: context.connectionString,
    endpoint: context.connectionString,
    sqliteDriver: driver,
    logLevel: context.logLevel,
    logger: context.logger as RemoteSqliteClientConfig['logger'],
  });
}

export const unregisterSqliteAdapter = registerStorageAdapter('sqlite', (context) => createLocal(context) as unknown as import('@baldin/core/adapter').Client);
export const unregisterRemoteSqliteAdapter = registerStorageAdapter(['sqlite+libsql', 'sqlite+d1'], (context) => createRemote(context) as unknown as import('@baldin/core/adapter').Client);
