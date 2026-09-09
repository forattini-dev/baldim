# s3db.js → Baldin parity audit

Baseline: `forattini-dev/s3db.js` at
`8264a009ce46b6f5b6e8a30a8916e9608fbffc11`. This inventory distinguishes a
working core from a completed product migration.

## Inventory

| Surface | s3db.js baseline | Baldin status | Result |
| --- | ---: | --- | --- |
| Source | 558 files, 555 TypeScript | 98 core source files plus 505 adapter, plugin, shared-package, and application source files | Partial |
| Core engine | Database, Resource, Schema, Validator, manager | Migrated from the `lite` dependency closure | Working |
| Plugin catalog | 32 plugin families, 411 TypeScript files | Public plugin SDK plus all 32 standalone plugin packages | Working |
| Installable packages | One all-in-one package | `core`, five storage adapters, 32 standalone plugins, three shared packages, CLI, and MCP | Working |
| Storage adapters | Built into the package | Memory, S3, filesystem, SQLite/libSQL/D1, and RedDB are separate packages | Working |
| CLI | 6 TypeScript modules plus 2 bin files | `@baldin/cli` with the `baldin` executable and public-package-only imports | Working |
| MCP | 3 source modules plus 27 server/tool files | `@baldin/mcp` with stdio/HTTP transports, bundled docs, and neutral storage calls | Working |
| Testing utilities | Factory and Seeder | Migrated to `@baldin/testing` | Working |
| Public subpaths | root, lite, concerns, plugins, generator | Every former subpath is mapped to core, a standalone plugin, typegen, or utils; Recker-specific HTTP helpers are explicitly retired | Working |
| Test suites | 118 core and 176 plugin test files | 189 focused test files, 2,095 passing tests, 46 intentionally skipped optional-integration cases, plus 4 MinIO contract cases in CI | Partial |
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

The baseline barrel exports 32 plugin families. All 32 are standalone
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
| CloudInventory | `@baldin/plugin-cloud-inventory` |
| Spider | `@baldin/plugin-spider` |
| Recon | `@baldin/plugin-recon` |

## Corrective order

1. Run the storage contract suite against configured AWS S3 and R2 targets.
2. Extend the shared contract to RedDB and remote SQLite test services.
3. Extend baseline persisted-data fixtures beyond the current filesystem coverage
   to S3-compatible and SQLite representations.
4. Publish prereleases and validate an application migration before declaring
   Baldin a replacement for `s3db.js`.

## Definition of converted

Baldin is converted only when every baseline public export and test family is
marked migrated, intentionally replaced, or intentionally retired; core contains
no provider implementation source; every package is independently buildable and
publishable; compatibility fixtures open existing data without mutation surprises;
and AWS S3/R2/compatible-provider contract suites are green.

The complete export-level accounting is in the [public API mapping](public-api-mapping.md).
