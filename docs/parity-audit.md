# s3db.js → Baldin parity audit

Baseline: `forattini-dev/s3db.js` at
`8264a009ce46b6f5b6e8a30a8916e9608fbffc11`. This inventory distinguishes a
working core from a completed product migration.

## Inventory

| Surface | s3db.js baseline | Baldin status | Result |
| --- | ---: | --- | --- |
| Source | 558 files, 555 TypeScript | 95 core source files plus 357 adapter, plugin, and shared-package source files | Partial |
| Core engine | Database, Resource, Schema, Validator, manager | Migrated from the `lite` dependency closure | Working |
| Plugin catalog | 32 plugin families, 411 TypeScript files | Public plugin SDK plus 29 standalone plugin packages; 3 families remain | Partial |
| Installable packages | One all-in-one package | `core`, five storage adapters, 29 standalone plugins, and two shared packages | Partial |
| Storage adapters | Built into the package | Memory, S3, filesystem, SQLite/libSQL/D1, and RedDB are separate packages | Working |
| CLI | 6 TypeScript modules plus 2 bin files | No CLI application/package | Missing |
| MCP | 3 source modules plus 27 server/tool files | No MCP application/package | Missing |
| Testing utilities | Factory and Seeder | Migrated to `@baldin/testing` | Working |
| Public subpaths | root, lite, concerns, plugins, generator | Core subpaths plus standalone plugins, testing, and typegen packages | Partial |
| Test suites | 118 core and 176 plugin test files | 162 focused test files, 1,792 passing tests, 19 intentionally skipped optional-integration cases, plus 4 MinIO contract cases in CI | Partial |
| npm releases | `s3db.js` published | Nothing published | Missing |

## Architectural gaps

`@baldin/core` contains no storage implementation source. It installs the independent
`@baldin/adapter-memory` package so `memory:` works by default, while external
providers resolve through a public protocol registry. Provider configuration types
live in their adapter packages; core publishes neutral storage contracts and deprecated
aliases for the former S3-named types. Connection-string parsing is generic in core;
each adapter owns the interpretation of its URL, credentials, and provider options.
Adapters declare capabilities such as distributed metadata locking; core does not
infer provider behavior from protocols, regions, or endpoints.

The source still carries legacy names such as `s3db.json`, `s3dbVersion`, and
`S3DB_*`. Persisted manifest names and operational environment variables are
intentional compatibility boundaries. All remaining legacy names are classified in `docs/compatibility-boundaries.md`;
new APIs and operational names use Baldin while persisted and deprecated contracts remain stable.

The S3 adapter accepts AWS S3, Cloudflare R2, MinIO, and custom compatible endpoints.
CI runs the shared storage contract against MinIO; configured AWS S3 and R2 target
runs are still needed before release.

## Plugin migration inventory

The baseline barrel exports 32 plugin families. The following 29 are standalone
Baldin packages:

| Migrated plugin | Baldin package |
| --- | --- |
| Audit | `@baldin/plugin-audit` |
| API | `@baldin/plugin-api` |
| Backup | `@baldin/plugin-backup` |
| Cache | `@baldin/plugin-cache` |
| Costs | `@baldin/plugin-costs` |
| EventualConsistency | `@baldin/plugin-eventual-consistency` |
| FullText | `@baldin/plugin-fulltext` |
| Geo | `@baldin/plugin-geo` |
| Graph | `@baldin/plugin-graph` |
| Importer | `@baldin/plugin-importer` |
| Identity | `@baldin/plugin-identity` |
| Metrics | `@baldin/plugin-metrics` |
| QueueConsumer | `@baldin/plugin-queue-consumer` |
| S3Queue | `@baldin/plugin-s3-queue` |
| Scheduler | `@baldin/plugin-scheduler` |
| SMTP | `@baldin/plugin-smtp` |
| StateMachine | `@baldin/plugin-state-machine` |
| Tfstate | `@baldin/plugin-tfstate` |
| Tree | `@baldin/plugin-tree` |
| Tournament | `@baldin/plugin-tournament` |
| TTL | `@baldin/plugin-ttl` |
| Vector | `@baldin/plugin-vector` |
| WebSocket | `@baldin/plugin-websocket` |
| Puppeteer | `@baldin/plugin-puppeteer` |
| CookieFarm | `@baldin/plugin-cookie-farm` |
| CookieFarmSuite | `@baldin/plugin-cookie-farm-suite` |
| KubernetesInventory | `@baldin/plugin-kubernetes-inventory` |
| ML | `@baldin/plugin-ml` |
| Replicator | `@baldin/plugin-replicator` |

The 3 remaining families are CloudInventory, Spider, and Recon.

## Corrective order

1. Run the storage contract suite against configured AWS S3 and R2 targets.
2. Extend the shared contract to RedDB and remote SQLite test services.
3. Migrate the remaining 3 plugin families to `@baldin/plugin-<name>` with their
   relevant original tests.
4. Restore remaining public utilities and explicitly retire or migrate every old subpath export.
5. Migrate CLI and MCP into applications that consume public workspace packages.
6. Extend baseline persisted-data fixtures beyond the current filesystem coverage
   to S3-compatible and SQLite representations.
7. Publish prereleases and validate an application migration before declaring
   Baldin a replacement for `s3db.js`.

## Definition of converted

Baldin is converted only when every baseline public export and test family is
marked migrated, intentionally replaced, or intentionally retired; core contains
no provider implementation source; every package is independently buildable and
publishable; compatibility fixtures open existing data without mutation surprises;
and AWS S3/R2/compatible-provider contract suites are green.
