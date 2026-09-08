# Migration from s3db.js

## Baseline

Source: https://github.com/forattini-dev/s3db.js/tree/8264a009ce46b6f5b6e8a30a8916e9608fbffc11
Local source: ~/workspace/s3db.js (clean at extraction).
Original project and data remain unchanged. Source license: Unlicense.

## Completed

- pnpm workspace, Turborepo task graph, TypeScript ESM build, independent Changesets versioning.
- The complete dependency closure of the old `s3db.js/lite` entrypoint is now
  compiled inside `@buckiedb/core`: Database, Resource, Schema, Validator,
  DatabaseManager, behaviors, streams, concurrency, tasks, and built-in storage clients.
- `BuckieDB` is the primary named and default class. `S3db` is a deprecated
  compatibility subclass and `Database` remains available.
- The numeric encoding implementation is preserved from src/concerns/base62.ts.
- Original tests/core/functions/base62.test.ts and tests/core/concerns/base62-embeddings.test.ts.
  Their imports now target the built @buckiedb/core/encoding export.
- A public-API integration test exercises connect, resource creation, insert,
  get, update, and delete through MemoryClient.
- DatabaseManager tests cover named connections, default routing, cross-database
  resource lookup, and duplicate-name protection.
- GitHub Actions installs from a frozen lockfile, typechecks, builds, tests,
  packs the package, installs that tarball in an empty consumer, and imports
  both public entrypoints.

## Next extraction stages

1. Expand compatibility fixtures for persisted formats: schema metadata, key encoding, document bodies,
   partitions and the s3db.json manifest. Add fixtures from the original implementation.
2. Stabilize and export a storage contract from src/clients/types.ts, using the
   current MemoryClient suite to prove it before clients move between packages.
3. Extract @buckiedb/adapter-s3. Test against a local S3-compatible service, then
   configured AWS S3 and Cloudflare R2 test buckets. Never use production data for tests.
4. Move filesystem, SQLite/libSQL/D1, and RedDB into their own adapters after S3.
5. Extract the plugin lifecycle contract and migrate plugins one by one to
   @buckiedb/plugin-<name>. Keep provider SDKs and optional frameworks in their packages.
6. Migrate the CLI and MCP server after their plugin dependencies have package homes.

## Dependency rules

The target core must not import plugins or provider adapters. During the compatibility
phase, the built-in clients remain in core and are tracked as extraction debt.
Adapters depend on core contracts;
plugins depend on the core public API. Workspace dependencies use workspace:^.
Packages own their runtime dependencies and release independently.

## Known coupling in the source

The old src/index.ts re-exports plugins and all clients. Its `lite` entrypoint was
selected as the migration boundary because it excludes the plugin catalog while
retaining a complete, usable database. Database still coordinates lifecycle,
thread-pool, cron, and the plugin contract; those seams need dedicated tests before
they can move safely.

## Compatibility contract

- Existing buckets keep the `s3db.json` manifest name and `s3dbVersion` metadata.
- Existing `S3DB_*` environment variables continue to work.
- Storage defaults remain unchanged so an import rename cannot silently select a
  different bucket, directory, or SQLite file.
- `S3db` remains importable while callers move to `BuckieDB`.
- These names describe persisted or operational compatibility. New documentation
  and public entrypoints use the BuckieDB name.

## Status and limits

The core is a working BuckieDB database, but the full plugin/CLI migration is incomplete.
No npm package has been published and the @buckiedb scope has not been registered.
The metadata codec's legacy edge cases are deliberately preserved for compatibility.
Local dependency/build commands were blocked by the red-dev host disk reserve
(21 GiB available, 30 GiB required); full validation runs in GitHub Actions.
