# @baldim/core

Baldim's document database engine, multidatabase manager, and extension contracts.

```ts
import { Baldim } from '@baldim/core';

const database = new Baldim({
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

await notes.insert({ id: 'first', title: 'Try Baldim', done: false });
```

For multiple databases, use the manager with named connections:

```ts
import { DatabaseManager } from '@baldim/core';
import '@baldim/adapter-s3';

const databases = new DatabaseManager({
  default: 'primary',
  connections: {
    primary: { connectionString: 's3://app-data' },
    analytics: { connectionString: 's3://analytics-data' },
  },
});

await databases.connect();
await databases.createResource({
  connection: 'primary', // optional: `primary` is the configured default
  name: 'users',
  attributes: { name: 'string' },
});
await databases.createResource({
  connection: 'analytics',
  name: 'events',
  attributes: { type: 'string' },
});

const users = databases.resources.users;
const events = databases.resource('events');
const analyticsEvents = databases.connection('analytics').resources.events;
```

Resource names created through the manager are unique across its connections.
Omitting `connection` from `createResource()` uses the configured default. Use
`connection(name)` for direct database access, or `resource(name)` and `resources`
for a unified view. Resource names are globally unique inside the manager; direct
resource creation is indexed, but cross-connection creation should go through the
manager so it can reject duplicates before writing metadata.

The memory implementation lives in `@baldim/adapter-memory` and is installed by
core, so `memory:` works without setup. Filesystem, SQLite/libSQL/D1, RedDB, and
S3-compatible storage live in separate adapter packages and register when imported.

`S3db` remains available as a deprecated class alias so applications can migrate
their imports before changing persisted data. Baldim continues to read and
write the established `s3db.json` metadata format during this compatibility phase.

No package has been published to npm yet.
