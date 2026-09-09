# Baldim 🪣

A small document database for object storage — being rebuilt from s3db.js as a modular monorepo.

**Status: core migration.** The database engine behind the former `s3db.js/lite`
entrypoint now runs as `@baldim/core`. Database CRUD, schemas, resources,
multidatabase management, behaviors, streams, and concurrency are present. The S3
adapters, all 32 standalone plugin families, the shared public utilities, the CLI,
and the MCP server have been extracted. Persisted filesystem, SQLite, and S3-object
fixtures are covered; credentialed contract runs against deployed providers remain.

This is not yet a feature-complete replacement for `s3db.js`. The tracked gaps
and completion criteria live in the [parity audit](docs/parity-audit.md).

```ts
import { Baldim } from '@baldim/core';

const database = new Baldim({ connectionString: 'memory://my-app' });
await database.connect();

const notes = await database.createResource({
  name: 'notes',
  attributes: { title: 'string', done: 'boolean' },
});

await notes.insert({ title: 'Hello from Baldim', done: false });
```

Multiple named databases are coordinated by `DatabaseManager`:

```ts
import { DatabaseManager } from '@baldim/core';
import '@baldim/adapter-s3';

const databases = new DatabaseManager({
  default: 'primary',
  connections: {
    primary: { connectionString: 's3://app-data' },
    analytics: { connectionString: 's3://analytics-data' },
  },
});
```

## Workspace

The workspace is organized by independently publishable package. Each entry owns
its own `src/`, tests, manifest, and dependencies. See the
[repository structure](docs/repository-structure.md) for directory responsibilities
and dependency rules.

| Path | Package | Status |
| --- | --- | --- |
| core | @baldim/core | Engine, multidatabase manager, adapter registry, and plugin SDK |
| adapters/memory | @baldim/adapter-memory | Standalone in-memory adapter, pulled in by core |
| adapters/filesystem | @baldim/adapter-filesystem | Installable local filesystem adapter |
| adapters/reddb | @baldim/adapter-reddb | Installable RedDB adapter |
| adapters/sqlite | @baldim/adapter-sqlite | SQLite, libSQL, and D1 adapter |
| adapters/s3 | @baldim/adapter-s3 | Installable S3/R2/MinIO-compatible adapter |
| plugins/audit | @baldim/plugin-audit | Persistent resource audit plugin |
| plugins/ttl | @baldim/plugin-ttl | Indexed and lazy resource expiration plugin |
| plugins/scheduler | @baldim/plugin-scheduler | Distributed cron jobs and execution history |
| plugins/fulltext | @baldim/plugin-fulltext | Persistent word indexes and ranked search |
| plugins/geo | @baldim/plugin-geo | Geohash indexes, distance calculations, and spatial queries |
| plugins/graph | @baldim/plugin-graph | Indexed edges, traversal, and weighted shortest paths |
| plugins/costs | @baldim/plugin-costs | Provider-aware usage accounting and cost projections |
| plugins/metrics | @baldim/plugin-metrics | Persistent telemetry and Prometheus export |
| plugins/queue-consumer | @baldim/plugin-queue-consumer | Optional SQS, RabbitMQ, Redis, and BullMQ consumers |
| plugins/backup | @baldim/plugin-backup | Full and incremental backups to filesystem or object storage |
| plugins/cache | @baldim/plugin-cache | Memory, filesystem, Redis, object-storage, partition-aware, and multi-tier caching |
| plugins/state-machine | @baldim/plugin-state-machine | Persistent workflows with guards, hooks, triggers, TTL, and transition history |
| plugins/tree | @baldim/plugin-tree | Adjacency-list and nested-set hierarchies with resource and node helpers |
| plugins/importer | @baldim/plugin-importer | Streaming JSON, JSONL, CSV, TSV, and gzip imports |
| plugins/vector | @baldim/plugin-vector | Vector search, clustering, metrics, and optional sqlite-vec acceleration |
| plugins/smtp | @baldim/plugin-smtp | SMTP relay and server modes, templates, retries, and delivery webhooks |
| plugins/tournament | @baldim/plugin-tournament | Tournament registration, formats, brackets, matches, and standings |
| plugins/s3-queue | @baldim/plugin-s3-queue | Durable database-backed queues with coordinated workers and retries |
| plugins/eventual-consistency | @baldim/plugin-eventual-consistency | Eventually consistent counters, consolidation, coordinated workers, and analytics |
| plugins/tfstate | @baldim/plugin-tfstate | Terraform/OpenTofu state ingestion, history, diffs, monitoring, and export |
| plugins/api | @baldim/plugin-api | Raffel-based HTTP/WebSocket API, auth, OpenAPI/USD docs, static files, and runtime inspection |
| plugins/identity | @baldim/plugin-identity | OAuth2/OIDC identity provider, sessions, onboarding, MFA, email, and administrative UI |
| plugins/websocket | @baldim/plugin-websocket | Dedicated real-time CRUD, subscriptions, channels, tickets, and connection recovery |
| plugins/puppeteer | @baldim/plugin-puppeteer | Browser automation, proxy pools, persistent cookies, monitoring, and anti-bot inspection |
| plugins/cookie-farm | @baldim/plugin-cookie-farm | Persistent browser personas, warmup, rotation, reputation, and export |
| plugins/cookie-farm-suite | @baldim/plugin-cookie-farm-suite | Namespaced Puppeteer, CookieFarm, queue, and TTL workflows |
| plugins/kubernetes-inventory | @baldim/plugin-kubernetes-inventory | Kubernetes discovery, snapshots, version history, diffs, and scheduled inventory |
| plugins/ml | @baldim/plugin-ml | TensorFlow.js regression, classification, time-series, and neural-network models |
| plugins/replicator | @baldim/plugin-replicator | Database, queue, and webhook replication with target clients owned by the plugin |
| plugins/cloud-inventory | @baldim/plugin-cloud-inventory | AWS, Azure, GCP, and eight additional provider inventories with snapshots, diffs, scheduling, and Terraform export |
| plugins/spider | @baldim/plugin-spider | Recker crawling, discovery, browser analysis, and memory, database, SQS, RabbitMQ, Redis, BullMQ, filesystem, and proxy backends |
| plugins/recon | @baldim/plugin-recon | Passive, stealth, and active reconnaissance with RedBlue/Recker stages, reporting, scheduling, and uptime monitoring |
| packages/testing | @baldim/testing | Factories and seeders for applications and plugin tests |
| packages/typegen | @baldim/typegen | Generates typed resource maps for applications |
| packages/utils | @baldim/utils | HTTP, error classification, memory profiling, money, and encoding utilities |
| apps/cli | @baldim/cli | Packaged `baldim` command with migrations, schema tools, console, and MCP launcher |
| apps/mcp | @baldim/mcp | Packaged stdio/HTTP MCP server with bundled docs and database tools |

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

`@baldim/core` installs the separate memory adapter so `memory:` works without setup.
Filesystem, SQLite, RedDB, and S3 load through the public adapter registry, and plugins use
the public plugin SDK. See [the migration plan](docs/migration.md) for source
provenance, compatibility guarantees and extraction order.
Raffel is owned only by the API, Identity, WebSocket, and SMTP plugins that import it
directly. Core and all storage adapters remain free of Raffel.
Every former public subpath has a destination or explicit disposition in the
[public API mapping](docs/public-api-mapping.md).

`BuckieDB` and `S3db` remain as deprecated class aliases. The persisted `s3db.json` manifest and
the existing `S3DB_*` environment variables remain supported during migration.

## License

[MIT](../LICENSE).
