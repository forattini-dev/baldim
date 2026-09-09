import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe } from 'vitest';
import { runStorageAdapterContract } from '../../../tests/storage-adapter-contract.js';
import { RemoteSqliteClient } from '../src/remote-sqlite-client.class.js';

interface BoundStatement {
  bind(...values: unknown[]): BoundStatement;
  all(): Promise<{ results: unknown[] }>;
}

function createD1Binding(): { prepare(sql: string): BoundStatement; close(): void } {
  const database = new DatabaseSync(':memory:');
  return {
    prepare(sql: string): BoundStatement {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async all() {
          const statement = database.prepare(sql);
          if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)) {
            return { results: statement.all(...values as any[]) };
          }
          statement.run(...values as any[]);
          return { results: [] };
        }
      };
    },
    close() {
      database.close();
    }
  };
}

runStorageAdapterContract('@baldin/adapter-sqlite libSQL executor', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'baldin-libsql-contract-'));
  return new RemoteSqliteClient({
    endpoint: `file:${join(directory, 'contract.db')}`,
    connectionString: `sqlite+libsql://local/${Date.now()}`,
    sqliteDriver: 'libsql',
    bucket: `contract-${Date.now()}-${Math.random()}`,
    logLevel: 'silent'
  });
});

runStorageAdapterContract('@baldin/adapter-sqlite D1 binding executor', () => {
  const binding = createD1Binding();
  const client = new RemoteSqliteClient({
    endpoint: 'sqlite+d1://binding/DB',
    connectionString: 'sqlite+d1://binding/DB',
    sqliteDriver: 'd1',
    d1Binding: binding,
    bucket: `contract-${Date.now()}-${Math.random()}`,
    logLevel: 'silent'
  });
  client.once('close', () => binding.close());
  const originalDestroy = client.destroy.bind(client);
  client.destroy = async () => {
    await originalDestroy();
    binding.close();
  };
  return client;
});

const configuredLibsqlUrl = process.env.BALDIN_LIBSQL_TEST_URL;
if (configuredLibsqlUrl) {
  runStorageAdapterContract('@baldin/adapter-sqlite configured libSQL service', () => new RemoteSqliteClient({
    endpoint: configuredLibsqlUrl,
    connectionString: configuredLibsqlUrl,
    sqliteDriver: 'libsql',
    authToken: process.env.BALDIN_LIBSQL_AUTH_TOKEN,
    bucket: `contract-${Date.now()}-${Math.random()}`,
    logLevel: 'silent'
  }));
} else {
  describe.skip('@baldin/adapter-sqlite configured libSQL service', () => {});
}

const configuredD1Account = process.env.BALDIN_D1_ACCOUNT_ID;
const configuredD1Database = process.env.BALDIN_D1_DATABASE_ID;
const configuredD1Token = process.env.BALDIN_D1_API_TOKEN;
if (configuredD1Account && configuredD1Database && configuredD1Token) {
  const endpoint = `sqlite+d1://${configuredD1Account}/${configuredD1Database}`;
  runStorageAdapterContract('@baldin/adapter-sqlite configured D1 service', () => new RemoteSqliteClient({
    endpoint,
    connectionString: endpoint,
    sqliteDriver: 'd1',
    apiToken: configuredD1Token,
    bucket: `contract-${Date.now()}-${Math.random()}`,
    logLevel: 'silent'
  }));
} else {
  describe.skip('@baldin/adapter-sqlite configured D1 service', () => {});
}
