# @baldin/core

Baldin's document database engine, multidatabase manager, and extension contracts.

```ts
import { Baldin } from '@baldin/core';

const database = new Baldin({
  connectionString: 'memory://my-app',
});

await database.connect();

const notes = await database.createResource({
  name: 'notes',
  attributes: {
    title: 'string',
    done: 'boolean',
  },
});

await notes.insert({ id: 'first', title: 'Try Baldin', done: false });
```

For multiple databases, use the manager with named connections:

```ts
import { DatabaseManager } from '@baldin/core';
import '@baldin/adapter-s3';

const databases = new DatabaseManager({
  default: 'primary',
  connections: {
    primary: { connectionString: 's3://app-data' },
    analytics: { connectionString: 's3://analytics-data' },
  },
});

await databases.connect();
await databases.createResource({ name: 'users', attributes: { name: 'string' } });
await databases.createResource({
  connection: 'analytics',
  name: 'events',
  attributes: { type: 'string' },
});
```

Resource names created through the manager are unique across its connections.
Use `connection(name)` for direct database access or `resource(name)` for unified
lookup; direct resource creation is indexed, but cross-connection creation should
go through the manager so it can reject duplicates before writing metadata.

S3-compatible storage lives in `@baldin/adapter-s3` and registers itself when
imported. Memory remains the reference client in core; filesystem, SQLite/libSQL/D1,
and RedDB are transitional built-ins that will move to adapter packages.

`S3db` remains available as a deprecated class alias so applications can migrate
their imports before changing persisted data. Baldin continues to read and
write the established `s3db.json` metadata format during this compatibility phase.

No package has been published to npm yet.
