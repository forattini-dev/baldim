# BuckieDB 🪣

A small document database for object storage — the modular successor to s3db.js.

**Status: initial migration.** The workspace and first core encoding module are
implemented. Database CRUD, storage adapters and plugins are not yet migrated.
This repository is not ready to replace s3db.js in an application.

## Workspace

| Path | Package | Status |
| --- | --- | --- |
| packages/core | @buckiedb/core | Numeric metadata codecs extracted, no runtime dependencies |
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

The design keeps the core independent of storage providers, with explicit adapters
and optional plugins. See [the migration plan](docs/migration.md) for source
provenance, completed work and extraction order.

## License

[Unlicense](UNLICENSE), preserving the license of the original s3db.js source.
