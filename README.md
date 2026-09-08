# BuckieDB 🪣

A small document database for object storage — being rebuilt from s3db.js as a modular monorepo.

**Status: core migration.** The database engine behind the former `s3db.js/lite`
entrypoint now runs as `@buckiedb/core`. Database CRUD, schemas, resources,
multidatabase management, behaviors, streams, and concurrency are present. The S3
adapter and first standalone plugin have been extracted; the remaining plugin catalog,
provider adapters, CLI, and MCP still need migration.

This is not yet a feature-complete replacement for `s3db.js`. The tracked gaps
and completion criteria live in the [parity audit](docs/parity-audit.md).

```ts
import { BuckieDB } from '@buckiedb/core';

const database = new BuckieDB({ connectionString: 'memory://my-app' });
await database.connect();

const notes = await database.createResource({
  name: 'notes',
  attributes: { title: 'string', done: 'boolean' },
});

await notes.insert({ title: 'Hello from BuckieDB', done: false });
```

Multiple named databases are coordinated by `DatabaseManager`:

```ts
import { DatabaseManager } from '@buckiedb/core';
import '@buckiedb/adapter-s3';

const databases = new DatabaseManager({
  default: 'primary',
  connections: {
    primary: { connectionString: 's3://app-data' },
    analytics: { connectionString: 's3://analytics-data' },
  },
});
```

## Workspace

| Path | Package | Status |
| --- | --- | --- |
| packages/core | @buckiedb/core | Engine, multidatabase manager, adapter registry, and plugin SDK |
| packages/adapter-s3 | @buckiedb/adapter-s3 | Installable S3/R2/MinIO-compatible adapter |
| packages/plugin-audit | @buckiedb/plugin-audit | First extracted standalone plugin |
| apps | Docs, CLI, demos | Reserved |

## Development

Use Node.js 24 or newer and pnpm 10.33.0.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
```

Turborepo builds dependencies before consumers. Tests import compiled package
exports so the package entry points are exercised. Changesets tracks independent
package releases; no automatic npm publishing is configured.

The core still carries the filesystem, SQLite/libSQL/D1, and RedDB clients during
the migration. S3 already loads through the public adapter registry, and plugins use
the public plugin SDK. See [the migration plan](docs/migration.md) for source
provenance, compatibility guarantees and extraction order.

`S3db` remains as a deprecated class alias. The persisted `s3db.json` manifest and
the existing `S3DB_*` environment variables remain supported during migration.

## License

[Unlicense](UNLICENSE), preserving the license of the original s3db.js source.
