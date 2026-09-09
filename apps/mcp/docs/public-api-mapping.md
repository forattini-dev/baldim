# Public API mapping from s3db.js

This table accounts for every export pattern and every module reachable through
the former `s3db.js/concerns/*` wildcard at baseline commit
`8264a009ce46b6f5b6e8a30a8916e9608fbffc11`.

## Package entry points

| Former import | Baldin import | Disposition |
| --- | --- | --- |
| `s3db.js` | `@baldin/core` | `Baldin` is canonical; `S3db` and `BuckieDB` remain deprecated aliases. |
| `s3db.js/lite` | `@baldin/core/lite` | Migrated. |
| `s3db.js/typescript-generator` | `@baldin/typegen` | Migrated to an independently publishable package. |
| `s3db.js/concerns/guards-helpers` | `@baldin/plugin-api/guards` | Owned by the API plugin. |
| `s3db.js/plugins/*` | `@baldin/plugin-*` | Each of the 32 plugin families is a standalone package; see the [parity audit](parity-audit.md#plugin-migration-inventory). |
| `s3db.js/concerns/*` | Entries below | The broad wildcard was split by responsibility. |
| `s3db.js/package.json` | `@baldin/core/package.json` or the selected package manifest | Each package exposes its own manifest. |
| `s3db` / `s3db.js` executable | `baldin` from `@baldin/cli` | Renamed executable. |

## Former concern modules

| Former `s3db.js/concerns/<module>` | Baldin import | Disposition |
| --- | --- | --- |
| `adaptive-tuning` | `@baldin/core/concerns/adaptive-tuning` | Migrated. |
| `async-event-emitter` | `@baldin/core/concerns/async-event-emitter` | Migrated. |
| `base62` | `@baldin/core/concerns/base62` or `@baldin/core/encoding` | Migrated; the focused encoding entry is preferred. |
| `benchmark` | `@baldin/core/concerns/benchmark` | Migrated. |
| `binary` | `@baldin/core/concerns/binary` | Migrated. |
| `calculator` | `@baldin/core/concerns/calculator` | Migrated. |
| `cron-manager` | `@baldin/core/concerns/cron-manager` | Migrated. |
| `crypto` | `@baldin/core/concerns/crypto` | Migrated. |
| `dictionary-encoding` | `@baldin/core/concerns/dictionary-encoding` | Migrated. |
| `distributed-lock` | `@baldin/core/concerns/distributed-lock` | Migrated against a neutral storage contract. |
| `distributed-sequence` | `@baldin/core/concerns/distributed-sequence` | Migrated against a neutral storage contract. |
| `error-classifier` | `@baldin/utils/error-classifier` | Migrated to the shared utility package. |
| `failban-manager` | `@baldin/plugin-api/failban` | Migrated with the HTTP API capability that uses it. |
| `flatten` | `@baldin/core/concerns/flatten` | Migrated. |
| `geo-encoding` | `@baldin/core/concerns/geo-encoding` | Migrated. |
| `high-performance-inserter` | `@baldin/core/concerns/high-performance-inserter` | Migrated; direct writes now use `StorageClient.putObject` instead of AWS SDK internals. |
| `http-client` | `@baldin/utils/http-client` | Migrated as a Fetch-based, provider-neutral client. Recker discovery, curl-impersonate installation, and `ReckerWrapper` were intentionally removed; Recker-backed crawling belongs to `@baldin/plugin-spider`. |
| `id` | `@baldin/core/concerns/id` | Migrated. |
| `incremental-sequence` | `@baldin/core/concerns/incremental-sequence` | Migrated. |
| `index` | Package-specific roots above | Replaced by explicit package entry points to avoid installing unrelated providers and plugins. |
| `ip` | `@baldin/core/concerns/ip` | Migrated. |
| `logger-redact` | `@baldin/core/concerns/logger-redact` | Migrated. |
| `logger` | `@baldin/core/concerns/logger` | Migrated. |
| `map-with-concurrency` | `@baldin/core/concerns/map-with-concurrency` | Migrated. |
| `memory-profiler` | `@baldin/utils/memory-profiler` | Migrated to the shared utility package. |
| `metadata-encoding` | `@baldin/core/concerns/metadata-encoding` | Migrated. |
| `money` | `@baldin/utils/money` | Migrated to the shared utility package. |
| `optimized-encoding` | `@baldin/utils/optimized-encoding` | Migrated to the shared utility package. |
| `partition-queue` | `@baldin/core/concerns/partition-queue` | Migrated. |
| `password-hashing` | `@baldin/core/concerns/password-hashing` or `@baldin/core/password` | Migrated; the focused password entry is preferred. |
| `performance-monitor` | `@baldin/core/concerns/performance-monitor` | Migrated. |
| `plugin-storage` | `@baldin/core/plugin` | Migrated as part of the public plugin SDK. |
| `process-manager` | `@baldin/core/concerns/process-manager` | Migrated. |
| `process-max-listeners` | `@baldin/core/concerns/process-max-listeners` | Migrated. |
| `ring-buffer` | `@baldin/core/concerns/ring-buffer` | Migrated. |
| `s3-errors` | `@baldin/core/storage-errors` | Renamed to the provider-neutral storage error contract. Deprecated S3 aliases remain where they were public. |
| `s3-key` | `@baldin/core/storage-key` | Renamed to the provider-neutral storage key contract. |
| `safe-event-emitter` | `@baldin/core/concerns/safe-event-emitter` | Migrated. |
| `safe-merge` | `@baldin/core/concerns/safe-merge` | Migrated. |
| `text-compression` | `@baldin/core/concerns/text-compression` | Migrated. |
| `try-fn` | `@baldin/core/concerns/try-fn` | Migrated. |
| `typescript-generator` | `@baldin/typegen` | Migrated to an independently publishable package. |
| `validator-cache` | `@baldin/core/concerns/validator-cache` | Migrated. |

The old HTTP module's Recker-specific helpers are the only intentionally retired
symbols in this inventory. They performed package discovery and binary installation
inside a generic utility module. Baldin keeps protocol runtimes in the plugin or
adapter that owns them.
