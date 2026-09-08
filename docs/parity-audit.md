# s3db.js → BuckieDB parity audit

Baseline: `forattini-dev/s3db.js` at
`8264a009ce46b6f5b6e8a30a8916e9608fbffc11`. This inventory distinguishes a
working core from a completed product migration.

## Inventory

| Surface | s3db.js baseline | BuckieDB status | Result |
| --- | ---: | --- | --- |
| Source | 558 files, 555 TypeScript | 111 TypeScript files in core | Partial |
| Core engine | Database, Resource, Schema, Validator, manager | Migrated from the `lite` dependency closure | Working |
| Plugin catalog | 23 plugin families, 411 TypeScript files | No `plugin-*` package | Missing |
| Installable packages | One all-in-one package | Only `@buckiedb/core` | Partial |
| Storage adapters | Built into the package | `adapter-s3` is design notes only | Missing |
| CLI | 6 TypeScript modules plus 2 bin files | No CLI application/package | Missing |
| MCP | 3 source modules plus 27 server/tool files | No MCP application/package | Missing |
| Testing utilities | Factory and Seeder | Not exported or migrated | Missing |
| Public subpaths | root, lite, concerns, plugins, generator | root, lite, encoding | Partial |
| Test suites | 118 core and 176 plugin test files | 4 focused test files | Partial |
| npm releases | `s3db.js` published | Nothing published | Missing |

## Architectural gaps

The core still contains S3, filesystem, SQLite/libSQL/D1, and RedDB clients and
depends directly on provider/transport packages. This preserves behavior while
the migration is tested, but it does not meet the target boundary. A completed
core must depend only on storage contracts; each implementation must move to an
`@buckiedb/adapter-*` package.

The source still carries 173 occurrences of legacy names such as `s3db.json`,
`s3dbVersion`, and `S3DB_*`. Persisted manifest names and operational environment
variables are intentional compatibility boundaries. Comments, logger names,
generated TypeScript module names, and other non-persisted branding still need
classification and migration.

Provider freedom is currently inherited through the S3-compatible endpoint
configuration. It is not yet proven by adapter contract tests against AWS S3,
Cloudflare R2, MinIO, and another compatible implementation.

## Corrective order

1. Export and test the storage client contract with MemoryClient as the reference.
2. Extract `@buckiedb/adapter-s3`; run the same contract suite against S3, R2,
   MinIO, and a custom endpoint.
3. Extract filesystem, SQLite/libSQL/D1, and RedDB adapters; remove their runtime
   dependencies from core.
4. Stabilize the plugin contract, then migrate each of the 23 plugin families to
   `@buckiedb/plugin-<name>` with its relevant original tests.
5. Restore public utilities, Factory/Seeder, TypeScript generation, and explicitly
   retire or migrate every old subpath export.
6. Migrate CLI and MCP into applications that consume public workspace packages.
7. Run persisted-data fixtures against databases written by the baseline version.
8. Publish prereleases and validate an application migration before declaring
   BuckieDB a replacement for `s3db.js`.

## Definition of converted

BuckieDB is converted only when every baseline public export and test family is
marked migrated, intentionally replaced, or intentionally retired; core imports
no provider implementation; every package is independently buildable and
publishable; compatibility fixtures open existing data without mutation surprises;
and AWS S3/R2/compatible-provider contract suites are green.
