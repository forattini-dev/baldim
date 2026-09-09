# @baldin/adapter-sqlite

Registers `sqlite:`, `sqlite+libsql:`, and `sqlite+d1:` storage protocols.

```ts
import { Baldin } from '@baldin/core';
import '@baldin/adapter-sqlite';

const database = new Baldin({
  connectionString: 'sqlite:./data/app.sqlite',
});

await database.connect();
```

The package owns its SQLite, libSQL, and Cloudflare D1 integration code. The
optional `@libsql/client` dependency is loaded only for `sqlite+libsql:`
connections. A D1 binding can be supplied through `clientOptions.binding`; a
deployed D1 database can be addressed with the account, database, and API-token
options supported by the adapter.

Local tests run the complete storage contract through SQLite, the real libSQL
client with a local database, and a D1-compatible binding. Deployed-provider
contract runs use these environment variables:

- `BALDIN_LIBSQL_TEST_URL` and optional `BALDIN_LIBSQL_AUTH_TOKEN`
- `BALDIN_D1_ACCOUNT_ID`, `BALDIN_D1_DATABASE_ID`, and `BALDIN_D1_API_TOKEN`

The read-only `s3db.js` v21 SQLite fixture verifies that Baldin can open existing
manifests, resources, documents, and partitions without changing the file.
