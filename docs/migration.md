# Migration from s3db.js

## Baseline

Source: https://github.com/forattini-dev/s3db.js/tree/8264a009ce46b6f5b6e8a30a8916e9608fbffc11
Local source: ~/workspace/s3db.js (clean at extraction).
Original project and data remain unchanged. Source license: Unlicense.

## Completed in the bootstrap

- pnpm workspace, Turborepo task graph, TypeScript ESM build, independent Changesets versioning.
- @buckiedb/core numeric encoding, copied unchanged from src/concerns/base62.ts.
- Original tests/core/functions/base62.test.ts and tests/core/concerns/base62-embeddings.test.ts.
  Their imports now target the built @buckiedb/core/encoding export.
- GitHub Actions installs, typechecks, builds, tests and packs the core package.

## Next extraction stages

1. Characterize persisted formats: schema metadata, key encoding, document bodies,
   partitions and the s3db.json manifest. Add fixtures from the original implementation.
2. Derive a storage contract from src/clients/types.ts and actual Database/Resource
   call sites. Prove it with a memory adapter before moving the S3 client.
3. Extract Database, Resource, Schema and Validator with their regression tests.
   Replace client construction with injection. Keep existing stored-data formats
   until a separate migration is designed and tested.
4. Extract @buckiedb/adapter-s3. Test against a local S3-compatible service, then
   configured AWS S3 and Cloudflare R2 test buckets. Never use production data for tests.
5. Extract the plugin lifecycle contract and migrate plugins one by one to
   @buckiedb/plugin-<name>. Keep provider SDKs and optional frameworks in their packages.
6. Add a compatibility entry point and documented API migration once Database works.
   Decide intentionally which legacy features to retire; do not silently drop them.

## Dependency rules

Core must not import plugins or provider adapters. Adapters depend on core contracts;
plugins depend on the core public API. Workspace dependencies use workspace:^.
Packages own their runtime dependencies and release independently.

## Known coupling in the source

src/index.ts re-exports plugins and all clients. Even src/lite.ts exports S3, memory,
filesystem and SQLite clients. src/database.class.ts includes lifecycle, thread-pool,
cron and plugin coordination. Moving that entry point wholesale would retain the
coupling this remake intends to remove.

## Status and limits

This is an initial extraction, not a working BuckieDB database or completed migration.
No npm package has been published and the @buckiedb scope has not been registered.
The metadata codec's legacy edge cases are deliberately preserved for compatibility.
Local dependency/build commands were blocked by the red-dev host disk reserve
(21 GiB available, 30 GiB required); full validation runs in GitHub Actions.
