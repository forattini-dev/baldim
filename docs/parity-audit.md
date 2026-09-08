# s3db.js → Baldin parity audit

Baseline: `forattini-dev/s3db.js` at
`8264a009ce46b6f5b6e8a30a8916e9608fbffc11`. This inventory distinguishes a
working core from a completed product migration.

## Inventory

| Surface | s3db.js baseline | Baldin status | Result |
| --- | ---: | --- | --- |
| Source | 558 files, 555 TypeScript | 113 core TypeScript files plus extracted package sources | Partial |
| Core engine | Database, Resource, Schema, Validator, manager | Migrated from the `lite` dependency closure | Working |
| Plugin catalog | 23 plugin families, 411 TypeScript files | Public plugin SDK and `@baldin/plugin-audit`; 22 families remain | Partial |
| Installable packages | One all-in-one package | `core`, five storage adapters, and `plugin-audit` | Partial |
| Storage adapters | Built into the package | Memory, S3, filesystem, SQLite/libSQL/D1, and RedDB are separate packages | Working |
| CLI | 6 TypeScript modules plus 2 bin files | No CLI application/package | Missing |
| MCP | 3 source modules plus 27 server/tool files | No MCP application/package | Missing |
| Testing utilities | Factory and Seeder | Not exported or migrated | Missing |
| Public subpaths | root, lite, concerns, plugins, generator | root, lite, encoding, adapter SDK, plugin SDK | Partial |
| Test suites | 118 core and 176 plugin test files | 11 focused test files, 58 tests | Partial |
| npm releases | `s3db.js` published | Nothing published | Missing |

## Architectural gaps

`@baldin/core` contains no storage implementation source. It installs the independent
`@baldin/adapter-memory` package so `memory:` works by default, while external
providers resolve through a public protocol registry. Provider-named contract types
still need neutral names with compatibility aliases.

The source still carries legacy names such as `s3db.json`, `s3dbVersion`, and
`S3DB_*`. Persisted manifest names and operational environment variables are
intentional compatibility boundaries. Comments, logger names, generated TypeScript
module names, and other non-persisted branding still need classification.

The S3 adapter accepts AWS S3, Cloudflare R2, MinIO, and custom compatible endpoints,
but only registration and construction are tested today. The same behavioral
contract has not yet run against live targets for each provider.

## Corrective order

1. Run the storage contract suite against AWS S3, R2, MinIO, and a custom endpoint.
2. Replace provider-named core contract types with neutral names and compatibility aliases.
3. Migrate the remaining 22 plugin families to `@baldin/plugin-<name>` with their
   relevant original tests.
4. Restore public utilities, Factory/Seeder, TypeScript generation, and explicitly
   retire or migrate every old subpath export.
5. Migrate CLI and MCP into applications that consume public workspace packages.
6. Run persisted-data fixtures against databases written by the baseline version.
7. Publish prereleases and validate an application migration before declaring
   Baldin a replacement for `s3db.js`.

## Definition of converted

Baldin is converted only when every baseline public export and test family is
marked migrated, intentionally replaced, or intentionally retired; core contains
no provider implementation source; every package is independently buildable and
publishable; compatibility fixtures open existing data without mutation surprises;
and AWS S3/R2/compatible-provider contract suites are green.