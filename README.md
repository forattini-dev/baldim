# Baldin 🪣

A small document database for object storage — being rebuilt from s3db.js as a modular monorepo.

**Status: core migration.** The database engine behind the former `s3db.js/lite`
entrypoint now runs as `@baldin/core`. Database CRUD, schemas, resources,
multidatabase management, behaviors, streams, and concurrency are present. The S3
adapters and first standalone plugin have been extracted; the remaining plugin catalog,
memory adapter boundary, CLI, and MCP still need migration.

This is not yet a feature-complete replacement for `s3db.js`. The tracked gaps
and completion criteria live in the [parity audit](docs/parity-audit.md).

```ts
import { Baldin } from '@baldin/core';

const database = new Baldin({ connectionString: 'memory://my-app' });
await database.connect();

const notes = await database.createResource({
  name: 'notes',
  attributes: { title: 'string', done: 'boolean' },
});

await notes.insert({ title: 'Hello from Baldin', done: false });
```

Multiple named databases are coordinated by `DatabaseManager`:

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
```

## Workspace

| Path | Package | Status |
| --- | --- | --- |
| packages/core | @baldin/core | Engine, multidatabase manager, adapter registry, and plugin SDK |
| packages/adapter-filesystem | @baldin/adapter-filesystem | Installable local filesystem adapter |
| packages/adapter-reddb | @baldin/adapter-reddb | Installable RedDB adapter |
| packages/adapter-sqlite | @baldin/adapter-sqlite | SQLite, libSQL, and D1 adapter |
| packages/adapter-s3 | @baldin/adapter-s3 | Installable S3/R2/MinIO-compatible adapter |
| packages/plugin-audit | @baldin/plugin-audit | First extracted standalone plugin |
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

Memory remains the last storage implementation carried by core during the migration.
Filesystem, SQLite, RedDB, and S3 load through the public adapter registry, and plugins use
the public plugin SDK. See [the migration plan](docs/migration.md) for source
provenance, compatibility guarantees and extraction order.

`BuckieDB` and `S3db` remain as deprecated class aliases. The persisted `s3db.json` manifest and
the existing `S3DB_*` environment variables remain supported during migration.

## License

[Unlicense](UNLICENSE), preserving the license of the original s3db.js source.
