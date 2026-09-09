# s3db.js → Baldim parity audit

Baseline: `forattini-dev/s3db.js` at
`8264a009ce46b6f5b6e8a30a8916e9608fbffc11`. This inventory distinguishes a
working core from a completed product migration.

## Inventory

| Surface | s3db.js baseline | Baldim status | Result |
| --- | ---: | --- | --- |
| Source | 558 files, 555 TypeScript | 98 core source files plus 504 adapter, plugin, shared-package, and application source files; every baseline public surface is accounted for | Working |
| Core engine | Database, Resource, Schema, Validator, manager | Migrated from the `lite` dependency closure | Working |
| Plugin catalog | 32 plugin families, 411 TypeScript files | Public plugin SDK plus all 32 standalone plugin packages | Working |
| Installable packages | One all-in-one package | `core`, five storage adapters, 32 standalone plugins, three shared packages, CLI, and MCP | Working |
| Storage adapters | Built into the package | Memory, S3, filesystem, SQLite/libSQL/D1, and HTTP-based RedDB are separate packages | Working |
| CLI | 6 TypeScript modules plus 2 bin files | `@baldim/cli` with the `baldim` executable and public-package-only imports | Working |
| MCP | 3 source modules plus 27 server/tool files | `@baldim/mcp` with stdio/HTTP transports, bundled docs, and neutral storage calls | Working |
| Testing utilities | Factory and Seeder | Migrated to `@baldim/testing` | Working |
| Public subpaths | root, lite, concerns, plugins, generator | Every former subpath is mapped to core, a standalone plugin, typegen, or utils; Recker-specific HTTP helpers are explicitly retired | Working |
| Test suites | 118 core and 176 plugin test files | 193 focused test files, 2,110 passing tests, 48 intentionally skipped optional-integration cases, plus 5 MinIO contract/fixture cases in CI | Working locally |
| npm releases | `s3db.js` published | Nothing published | Missing |

## Architectural gaps

`@baldim/core` contains no storage implementation source. It installs the independent
`@baldim/adapter-memory` package so `memory:` works by default, while external
providers resolve through a public protocol registry. Provider configuration types
live in their adapter packages; core publishes neutral storage contracts and deprecated
aliases for the former S3-named types. Connection-string parsing is generic in core;
each adapter owns the interpretation of its URL, credentials, and provider options.
Adapters declare capabilities such as distributed metadata locking; core does not
infer provider behavior from protocols, regions, or endpoints.

The source still carries legacy names such as `s3db.json`, `s3dbVersion`, and
`S3DB_*`. Persisted manifest names and operational environment variables are
intentional compatibility boundaries. All remaining legacy names are classified in `docs/compatibility-boundaries.md`;
new APIs and operational names use Baldim while persisted and deprecated contracts remain stable.

The S3 adapter accepts AWS S3, Cloudflare R2, MinIO, and custom compatible endpoints.
CI runs the shared storage contract and the persisted v21 object fixture against
MinIO. Local tests run the same contract through RedDB HTTP, libSQL, and D1 binding
interfaces; configured deployed-service runs are still needed before release.

## Plugin migration inventory

The baseline barrel exports 32 plugin families. All 32 are standalone
Baldim packages:

| Migrated plugin | Baldim package |
| --- | --- |
| Audit | `@baldim/plugin-audit` |
| API | `@baldim/plugin-api` |
| Backup | `@baldim/plugin-backup` |
| Cache | `@baldim/plugin-cache` |
| Costs | `@baldim/plugin-costs` |
| EventualConsistency | `@baldim/plugin-eventual-consistency` |
| FullText | `@baldim/plugin-fulltext` |
| Geo | `@baldim/plugin-geo` |
| Graph | `@baldim/plugin-graph` |
| Importer | `@baldim/plugin-importer` |
| Identity | `@baldim/plugin-identity` |
| Metrics | `@baldim/plugin-metrics` |
| QueueConsumer | `@baldim/plugin-queue-consumer` |
| S3Queue | `@baldim/plugin-s3-queue` |
| Scheduler | `@baldim/plugin-scheduler` |
| SMTP | `@baldim/plugin-smtp` |
| StateMachine | `@baldim/plugin-state-machine` |
| Tfstate | `@baldim/plugin-tfstate` |
| Tree | `@baldim/plugin-tree` |
| Tournament | `@baldim/plugin-tournament` |
| TTL | `@baldim/plugin-ttl` |
| Vector | `@baldim/plugin-vector` |
| WebSocket | `@baldim/plugin-websocket` |
| Puppeteer | `@baldim/plugin-puppeteer` |
| CookieFarm | `@baldim/plugin-cookie-farm` |
| CookieFarmSuite | `@baldim/plugin-cookie-farm-suite` |
| KubernetesInventory | `@baldim/plugin-kubernetes-inventory` |
| ML | `@baldim/plugin-ml` |
| Replicator | `@baldim/plugin-replicator` |
| CloudInventory | `@baldim/plugin-cloud-inventory` |
| Spider | `@baldim/plugin-spider` |
| Recon | `@baldim/plugin-recon` |

## Corrective order

1. Run the storage contract suite against configured AWS S3 and R2 targets.
2. Run the passing RedDB HTTP, libSQL, and D1 contracts against deployed services.
3. Publish prereleases and validate an application migration before declaring
   Baldim a replacement for `s3db.js`.

## Definition of converted

Baldim is converted only when every baseline public export and test family is
marked migrated, intentionally replaced, or intentionally retired; core contains
no provider implementation source; every package is independently buildable and
publishable; compatibility fixtures open existing data without mutation surprises;
and AWS S3/R2/compatible-provider contract suites are green.

The complete export-level accounting is in the [public API mapping](public-api-mapping.md).
