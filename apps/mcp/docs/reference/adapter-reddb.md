# @baldim/adapter-reddb

Imports register the `reddb:` protocol with Baldim. The adapter speaks RedDB's
public HTTP API and owns only its storage mapping dependencies; it does not install
Recker or a web framework.

```ts
import { Baldim } from '@baldim/core';
import '@baldim/adapter-reddb';

const database = new Baldim({
  connectionString: 'reddb://read-token:write-token@localhost:8080/my-prefix?collection=app'
});
await database.connect();
```

The username becomes the bearer read token, and the password becomes the
`X-Write-Token` header. The path is an object key prefix; `collection` selects the
RedDB collection.

The local shared contract runs against an in-process RedDB-compatible HTTP server.
Set `BALDIM_REDDB_CONTRACT_URL` to exercise a deployed service. Optional settings
are `BALDIM_REDDB_COLLECTION`, `BALDIM_REDDB_AUTH_TOKEN`, and
`BALDIM_REDDB_WRITE_TOKEN`.
