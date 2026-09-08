# BuckieDB 🪣

A small document database for object storage — the modular successor to s3db.js.

**Status: core migration.** The database engine behind the former `s3db.js/lite`
entrypoint now runs as `@buckiedb/core`. Database CRUD, schemas, resources,
behaviors, streams, concurrency, and the built-in clients are present. The large
plugin catalog and CLI still need to be split into their own packages.

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

## Workspace

| Path | Package | Status |
| --- | --- | --- |
| packages/core | @buckiedb/core | Working database engine and built-in clients |
| packages/adapter-s3 | @buckiedb/adapter-s3 | Planned; design notes only |
| packages/plugin-* | @buckiedb/plugin-<name> | Future plugin packages |
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

The current core intentionally keeps the old built-in clients so the engine can be
validated before package boundaries move. The target design uses explicit adapters
and optional plugins. See [the migration plan](docs/migration.md) for source
provenance, compatibility guarantees and extraction order.

`S3db` remains as a deprecated class alias. The persisted `s3db.json` manifest and
the existing `S3DB_*` environment variables remain supported during migration.

## License

[Unlicense](UNLICENSE), preserving the license of the original s3db.js source.
