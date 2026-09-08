# @buckiedb/core

BuckieDB's document database engine and built-in storage clients.

```ts
import { BuckieDB } from '@buckiedb/core';

const database = new BuckieDB({
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

await notes.insert({ id: 'first', title: 'Try BuckieDB', done: false });
```

For multiple databases, use the manager with named connections:

```ts
import { DatabaseManager } from '@buckiedb/core';

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

Resource names are unique across the manager. Use `connection(name)` for direct
database access or `resource(name)` for unified lookup.

The core currently includes the S3-compatible, memory, filesystem, SQLite,
libSQL/D1, and RedDB clients inherited from s3db.js. Provider packages will be
extracted behind a stable client contract in later migration slices.

`S3db` remains available as a deprecated class alias so applications can migrate
their imports before changing persisted data. BuckieDB continues to read and
write the established `s3db.json` metadata format during this compatibility phase.

No package has been published to npm yet.
