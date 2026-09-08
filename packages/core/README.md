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

The core currently includes the S3-compatible, memory, filesystem, SQLite,
libSQL/D1, and RedDB clients inherited from s3db.js. Provider packages will be
extracted behind a stable client contract in later migration slices.

`S3db` remains available as a deprecated class alias so applications can migrate
their imports before changing persisted data. BuckieDB continues to read and
write the established `s3db.json` metadata format during this compatibility phase.

No package has been published to npm yet.
