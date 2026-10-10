# Executable core recipes

[Core guide](../README.md) · [API reference](api.md) · [Errors and recovery](errors.md)

These files are compiled and executed by `pnpm --filter @baldim/core docs:check` in CI. The marked blocks below must match their source files exactly. All functions own their database lifecycle and disconnect in `finally`.

For local execution, build the core first (`pnpm --filter @baldim/core build`). Node 24 can run the TypeScript examples directly. For instance, from the repository root:

```sh
node --input-type=module -e "import('./core/examples/crud.ts').then(m => m.crudExample()).then(console.log)"
```

In a consuming application, install `@baldim/core`, copy the example file and invoke its exported function. Document-engine recipes require the 0.3 API; an older published core will not expose those methods. The memory recipes need no extra adapter package.

## CRUD, queries, partitions and pagination

This recipe creates typed documents, uses a guarded increment to change an age, selects a bounded partition candidate set, projects fields, traverses two cursor pages and audits references. `getOrNull` distinguishes absence from a storage error; `deleteMany.errors` is a number.

[Source](../examples/crud.ts)

<!-- example: examples/crud.ts -->
```ts
import { randomUUID } from 'node:crypto';
import { Baldim } from '@baldim/core';

export async function crudExample() {
  const db = new Baldim({
    connectionString: `memory://docs-crud-${randomUUID()}`,
    logLevel: 'silent',
    exitOnSignal: false,
  });
  await db.connect();
  try {
    const users = await db.createResource({
      name: 'users',
      behavior: 'body-only',
      asyncPartitions: false,
      attributes: {
        name: 'string|required',
        age: 'number|required',
        tenant: 'string|required',
        labels: { type: 'array', items: 'string' },
      },
      partitions: { byTenant: { fields: { tenant: 'string' } } },
    });
    await users.insertMany([
      { id: 'ada', name: 'Ada', age: 36, tenant: 'acme', labels: [] },
      { id: 'grace', name: 'Grace', age: 25, tenant: 'acme', labels: [] },
    ]);
    await users.patch('ada', { age: 37 });
    await users.modify('ada', {
      increment: { age: 1 },
      addToSet: { labels: 'reviewed' },
    });
    const selected = await users.query(
      { tenant: 'acme', age: { $gte: 30 } },
      {
        select: ['name', 'age'],
        orderBy: { age: 'desc' },
        limit: 10,
        maxScan: 100,
      },
    );
    const first = await users.page({ size: 1 });
    const second = first.nextCursor
      ? await users.page({ size: 1, cursor: first.nextCursor })
      : null;
    const audit = await users.repairPartitions(); // read-only by default
    const missing = await users.getOrNull('missing');
    const deleted = await users.deleteMany(['grace']);
    return { selected, first, second, audit, missing, deleted };
  } finally {
    await db.disconnect();
  }
}
```

## Multidatabase

The default connection handles users; analytics handles events. Unified lookup does not require a connection name because resource names are unique inside the manager. The recipe also shows explicit local lookup.

[Source](../examples/multidatabase.ts)

<!-- example: examples/multidatabase.ts -->
```ts
import { randomUUID } from 'node:crypto';
import { DatabaseManager } from '@baldim/core';

export async function multidatabaseExample() {
  const namespace = randomUUID();
  const manager = new DatabaseManager({
    default: 'primary',
    defaults: { logLevel: 'silent', exitOnSignal: false },
    connections: {
      primary: { connectionString: `memory://docs-primary-${namespace}` },
      analytics: { connectionString: `memory://docs-analytics-${namespace}` },
    },
  });
  await manager.connect();
  try {
    const users = await manager.createResource({
      name: 'users',
      attributes: { name: 'string|required' },
    }); // no connection: uses primary
    const events = await manager.createResource({
      connection: 'analytics',
      name: 'events',
      attributes: { type: 'string|required' },
    });
    await users.insert({ id: 'ada', name: 'Ada' });
    await events.insert({ id: 'login-1', type: 'login' });
    const unified = await manager.resource('events').get('login-1');
    const local = await manager
      .connection('analytics')
      .resources.events!.get('login-1');
    return {
      unified,
      local,
      owner: manager.getConnectionForResource('events'),
      names: manager.connectionNames,
    };
  } finally {
    await manager.disconnect();
  }
}
```

## Unique index conflict and rollback

Pass an actual transactional client. Memory/S3 cannot guarantee uniqueness across primary documents and index keys. In a consuming application, install `@baldim/core @baldim/adapter-sqlite`, then call this recipe with a local SQLite client:

```ts
import { SqliteClient } from '@baldim/adapter-sqlite';
import { uniqueIndexExample } from './unique-index.ts';
const result = await uniqueIndexExample(new SqliteClient({
  basePath: ':memory:', bucket: 'docs-unique', logLevel: 'silent',
}));
console.log(result.conflict, result.duplicate); // UNIQUE_CONSTRAINT, null
```

The CI test injects the real local SQLite implementation and verifies that the duplicate record is absent and the original owner remains. The caller must not reuse the supplied client after the recipe disconnects.

[Source](../examples/unique-index.ts)

<!-- example: examples/unique-index.ts -->
```ts
import { Baldim, DocumentEngineError } from '@baldim/core';
import type { Client } from '@baldim/core/adapter';

// The caller supplies a real transactional client, e.g. local SQLite.
export async function uniqueIndexExample(client: Client) {
  const db = new Baldim({ client, logLevel: 'silent', exitOnSignal: false });
  await db.connect();
  try {
    const users = await db.createResource({
      name: 'users',
      behavior: 'body-only',
      attributes: { email: 'email|required', name: 'string|required' },
    });
    await users.createIndex('email', { fields: ['email'], unique: true });
    await users.insert({ id: 'ada', email: 'ada@example.com', name: 'Ada' });
    let conflict: string | null = null;
    try {
      await users.insert({
        id: 'duplicate',
        email: 'ada@example.com',
        name: 'Other',
      });
    } catch (error) {
      if (
        !(error instanceof DocumentEngineError) ||
        error.code !== 'UNIQUE_CONSTRAINT'
      )
        throw error;
      conflict = error.code; // the duplicate document was rolled back
    }
    const duplicate = await users.getOrNull('duplicate');
    const owner = await users.query({ email: 'ada@example.com' });
    return { conflict, duplicate, owner };
  } finally {
    await db.disconnect();
  }
}
```

## Rename, backfill and resume a migration

This recipe renames a field, converts a decimal string to integer cents, and backfills `active`. Source fields stay optional in the transitional schema so unmigrated records remain readable. The transformation deliberately throws once for document b to demonstrate recovery; this represents a temporary lookup outage, not a random change in the output transformation.

The first report is incomplete and contains the failed ID. The second call reuses the same migration name/transform, skips the completed a document, and finishes b. Both writes are already committed individually; there is no whole-migration rollback. After verifying completion and old-field removal, declare a final schema without the optional legacy fields. Keep source decoding compatible for other stored schema versions throughout a real migration.

[Source](../examples/migration.ts)

<!-- example: examples/migration.ts -->
```ts
import { randomUUID } from 'node:crypto';
import { Baldim, compareSchemas } from '@baldim/core';

export async function migrationExample() {
  const db = new Baldim({
    connectionString: `memory://docs-migration-${randomUUID()}`,
    logLevel: 'silent',
    exitOnSignal: false,
  });
  await db.connect();
  try {
    const previous = {
      legacyName: 'string|required',
      amountText: 'string|required',
    } as const;
    const old = await db.createResource({
      name: 'customers',
      behavior: 'body-only',
      attributes: previous,
    });
    await old.insertMany([
      { id: 'a', legacyName: 'Ada', amountText: '12.50' },
      { id: 'b', legacyName: 'Grace', amountText: '3.00' },
    ]);
    // Retain source fields as optional while old documents are still readable.
    const next = {
      legacyName: 'string|optional',
      amountText: 'string|optional',
      name: 'string|required',
      cents: 'number|required',
      active: 'boolean|required',
    } as const;
    const changes = compareSchemas(previous, next);
    const customers = await db.createResource({
      name: 'customers',
      behavior: 'body-only',
      attributes: next,
    });
    let dependencyAvailable = false;
    const visited: string[] = [];
    const transform = (current: { id: string; [field: string]: unknown }) => {
      visited.push(current.id);
      // Demonstrate a temporary failure before any write to this document.
      if (current.id === 'b' && !dependencyAvailable)
        throw new Error('Lookup temporarily unavailable');
      return {
        name: String(current.legacyName),
        cents: Math.round(Number(current.amountText) * 100),
        active: true,
      };
    };
    const options = {
      name: 'customer-name-cents-v1',
      batchSize: 2,
      maxBatches: 10,
      transform,
    };
    const first = await customers.migrate(options);
    // first.complete is false; first.failures identifies b. Document a is committed.
    dependencyAvailable = true;
    const resumed = await customers.migrate(options); // a is skipped by its journal
    const documents = await customers.list({ limit: 10 });
    return { changes, first, resumed, documents, visited };
  } finally {
    await db.disconnect();
  }
}
```

## Passwords and secrets

Supply application configuration when invoking `protectedFieldsExample({ passphrase, pepper })`. The recipe verifies a password with the same pepper, rejects the wrong password, preserves a hash on an unrelated update and reads opaque ciphertext with `autoDecrypt: false`. It returns booleans, not the protected values. CI supplies fixture-only configuration.

`password` defaults to bcrypt; optional native hashing packages must be available. The example uses a body-only document, while encryption/hashing semantics are independent of the storage adapter. See the [protected-field guide](protected-fields.md) for algorithm settings, key changes and read behavior.

[Source](../examples/protected-fields.ts)

<!-- example: examples/protected-fields.ts -->
```ts
import { randomUUID } from 'node:crypto';
import { Baldim } from '@baldim/core';
import { verifyPassword } from '@baldim/core/password';

export async function protectedFieldsExample(security: {
  passphrase: string;
  pepper: string;
}) {
  const db = new Baldim({
    connectionString: `memory://docs-protected-${randomUUID()}`,
    security: { ...security, bcrypt: { rounds: 12 } },
    logLevel: 'silent',
    exitOnSignal: false,
  });
  await db.connect();
  try {
    const attributes = {
      name: 'string|required',
      password: 'password|required',
      apiToken: 'secret|required',
    } as const;
    const accounts = await db.createResource({
      name: 'accounts',
      behavior: 'body-only',
      attributes,
    });
    await accounts.insert({
      id: 'ada',
      name: 'Ada',
      password: 'sample-password',
      apiToken: 'sample-api-token',
    });
    const account = await accounts.get('ada');
    const valid = await verifyPassword(
      'sample-password',
      account.password,
      security.pepper,
    );
    const invalid = await verifyPassword(
      'wrong-password',
      account.password,
      security.pepper,
    );
    await accounts.update('ada', { name: 'Ada Lovelace' }); // retain the password hash
    const updated = await accounts.get('ada');
    const raw = await db.createResource({
      name: 'accounts',
      behavior: 'body-only',
      attributes,
      autoDecrypt: false,
    });
    const encrypted = await raw.get('ada');
    return {
      valid,
      invalid,
      secretWasDecrypted: account.apiToken === 'sample-api-token',
      passwordHashWasPreserved: account.password === updated.password,
      rawReadIsEncrypted: encrypted.apiToken !== 'sample-api-token',
    };
  } finally {
    await db.disconnect();
  }
}
```

