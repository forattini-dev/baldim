# Baldin 🪣

A small document database for object storage — being rebuilt from s3db.js as a modular monorepo.

**Status: core migration.** The database engine behind the former `s3db.js/lite`
entrypoint now runs as `@baldin/core`. Database CRUD, schemas, resources,
multidatabase management, behaviors, streams, and concurrency are present. The S3
adapters and the first standalone plugins have been extracted; the remaining plugin catalog,
provider contract cleanup, CLI, and MCP still need migration.

This is not yet a feature-complete replacement for `s3db.js`. The tracked gaps
and completion criteria live in the [parity audit](docs/parity-audit.md).

```ts
import { Baldin } from '@baldin/core';

const database = new Baldin({ connectionString: 'memory://my-app' });
await database.connect();

const notes = await database.createResource({
  name: 'notes',
  attributes: { title: 'string', done: 'boolean' },
});

await notes.insert({ title: 'Hello from Baldin', done: false });
```

Multiple named databases are coordinated by `DatabaseManager`:

```ts
import { DatabaseManager } from '@baldin/core';
import '@baldin/adapter-s3';

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
| core | @baldin/core | Engine, multidatabase manager, adapter registry, and plugin SDK |
| adapters/memory | @baldin/adapter-memory | Standalone in-memory adapter, pulled in by core |
| adapters/filesystem | @baldin/adapter-filesystem | Installable local filesystem adapter |
| adapters/reddb | @baldin/adapter-reddb | Installable RedDB adapter |
| adapters/sqlite | @baldin/adapter-sqlite | SQLite, libSQL, and D1 adapter |
| adapters/s3 | @baldin/adapter-s3 | Installable S3/R2/MinIO-compatible adapter |
| plugins/audit | @baldin/plugin-audit | Persistent resource audit plugin |
| plugins/ttl | @baldin/plugin-ttl | Indexed and lazy resource expiration plugin |
| plugins/scheduler | @baldin/plugin-scheduler | Distributed cron jobs and execution history |
| plugins/fulltext | @baldin/plugin-fulltext | Persistent word indexes and ranked search |
| plugins/geo | @baldin/plugin-geo | Geohash indexes, distance calculations, and spatial queries |
| plugins/graph | @baldin/plugin-graph | Indexed edges, traversal, and weighted shortest paths |
| plugins/costs | @baldin/plugin-costs | Provider-aware usage accounting and cost projections |
| plugins/metrics | @baldin/plugin-metrics | Persistent telemetry and Prometheus export |
| plugins/queue-consumer | @baldin/plugin-queue-consumer | Optional SQS, RabbitMQ, Redis, and BullMQ consumers |
| plugins/backup | @baldin/plugin-backup | Full and incremental backups to filesystem or object storage |
| plugins/cache | @baldin/plugin-cache | Memory, filesystem, Redis, object-storage, partition-aware, and multi-tier caching |
| plugins/state-machine | @baldin/plugin-state-machine | Persistent workflows with guards, hooks, triggers, TTL, and transition history |
| plugins/tree | @baldin/plugin-tree | Adjacency-list and nested-set hierarchies with resource and node helpers |
| plugins/importer | @baldin/plugin-importer | Streaming JSON, JSONL, CSV, TSV, and gzip imports |
| plugins/vector | @baldin/plugin-vector | Vector search, clustering, metrics, and optional sqlite-vec acceleration |
| plugins/smtp | @baldin/plugin-smtp | SMTP relay and server modes, templates, retries, and delivery webhooks |
| plugins/tournament | @baldin/plugin-tournament | Tournament registration, formats, brackets, matches, and standings |
| plugins/s3-queue | @baldin/plugin-s3-queue | Durable database-backed queues with coordinated workers and retries |
| plugins/eventual-consistency | @baldin/plugin-eventual-consistency | Eventually consistent counters, consolidation, coordinated workers, and analytics |
| plugins/tfstate | @baldin/plugin-tfstate | Terraform/OpenTofu state ingestion, history, diffs, monitoring, and export |
| plugins/api | @baldin/plugin-api | Raffel-based HTTP/WebSocket API, auth, OpenAPI/USD docs, static files, and runtime inspection |
| plugins/identity | @baldin/plugin-identity | OAuth2/OIDC identity provider, sessions, onboarding, MFA, email, and administrative UI |
| plugins/websocket | @baldin/plugin-websocket | Dedicated real-time CRUD, subscriptions, channels, tickets, and connection recovery |
| plugins/puppeteer | @baldin/plugin-puppeteer | Browser automation, proxy pools, persistent cookies, monitoring, and anti-bot inspection |
| plugins/cookie-farm | @baldin/plugin-cookie-farm | Persistent browser personas, warmup, rotation, reputation, and export |
| plugins/cookie-farm-suite | @baldin/plugin-cookie-farm-suite | Namespaced Puppeteer, CookieFarm, queue, and TTL workflows |
| packages/testing | @baldin/testing | Factories and seeders for applications and plugin tests |
| packages/typegen | @baldin/typegen | Generates typed resource maps for applications |
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

`@baldin/core` installs the separate memory adapter so `memory:` works without setup.
Filesystem, SQLite, RedDB, and S3 load through the public adapter registry, and plugins use
the public plugin SDK. See [the migration plan](docs/migration.md) for source
provenance, compatibility guarantees and extraction order.

`BuckieDB` and `S3db` remain as deprecated class aliases. The persisted `s3db.json` manifest and
the existing `S3DB_*` environment variables remain supported during migration.

## License

[Unlicense](UNLICENSE), preserving the license of the original s3db.js source.
