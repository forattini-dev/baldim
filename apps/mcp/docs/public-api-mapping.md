# Public API mapping from s3db.js

This table accounts for every export pattern and every module reachable through
the former `s3db.js/concerns/*` wildcard at baseline commit
`8264a009ce46b6f5b6e8a30a8916e9608fbffc11`.

## Package entry points

| Former import | Baldim import | Disposition |
| --- | --- | --- |
| `s3db.js` | `@baldim/core` | `Baldim` is canonical; `S3db` and `BuckieDB` remain deprecated aliases. |
| `s3db.js/lite` | `@baldim/core/lite` | Migrated. |
| `s3db.js/typescript-generator` | `@baldim/typegen` | Migrated to an independently publishable package. |
| `s3db.js/concerns/guards-helpers` | `@baldim/plugin-api/guards` | Owned by the API plugin. |
| `s3db.js/plugins/*` | `@baldim/plugin-*` | Each of the 32 plugin families is a standalone package; see the [parity audit](parity-audit.md#plugin-migration-inventory). |
| `s3db.js/concerns/*` | Entries below | The broad wildcard was split by responsibility. |
| `s3db.js/package.json` | `@baldim/core/package.json` or the selected package manifest | Each package exposes its own manifest. |
| `s3db` / `s3db.js` executable | `baldim` from `@baldim/cli` | Renamed executable. |

## Former concern modules

| Former `s3db.js/concerns/<module>` | Baldim import | Disposition |
| --- | --- | --- |
| `adaptive-tuning` | `@baldim/core/concerns/adaptive-tuning` | Migrated. |
| `async-event-emitter` | `@baldim/core/concerns/async-event-emitter` | Migrated. |
| `base62` | `@baldim/core/concerns/base62` or `@baldim/core/encoding` | Migrated; the focused encoding entry is preferred. |
| `benchmark` | `@baldim/core/concerns/benchmark` | Migrated. |
| `binary` | `@baldim/core/concerns/binary` | Migrated. |
| `calculator` | `@baldim/core/concerns/calculator` | Migrated. |
| `cron-manager` | `@baldim/core/concerns/cron-manager` | Migrated. |
| `crypto` | `@baldim/core/concerns/crypto` | Migrated. |
| `dictionary-encoding` | `@baldim/core/concerns/dictionary-encoding` | Migrated. |
| `distributed-lock` | `@baldim/core/concerns/distributed-lock` | Migrated against a neutral storage contract. |
| `distributed-sequence` | `@baldim/core/concerns/distributed-sequence` | Migrated against a neutral storage contract. |
| `error-classifier` | `@baldim/utils/error-classifier` | Migrated to the shared utility package. |
| `failban-manager` | `@baldim/plugin-api/failban` | Migrated with the HTTP API capability that uses it. |
| `flatten` | `@baldim/core/concerns/flatten` | Migrated. |
| `geo-encoding` | `@baldim/core/concerns/geo-encoding` | Migrated. |
| `high-performance-inserter` | `@baldim/core/concerns/high-performance-inserter` | Migrated; direct writes now use `StorageClient.putObject` instead of AWS SDK internals. |
| `http-client` | `@baldim/utils/http-client` | Migrated as a Fetch-based, provider-neutral client. Recker discovery, curl-impersonate installation, and `ReckerWrapper` were intentionally removed; Recker-backed crawling belongs to `@baldim/plugin-spider`. |
| `id` | `@baldim/core/concerns/id` | Migrated. |
| `incremental-sequence` | `@baldim/core/concerns/incremental-sequence` | Migrated. |
| `index` | Package-specific roots above | Replaced by explicit package entry points to avoid installing unrelated providers and plugins. |
| `ip` | `@baldim/core/concerns/ip` | Migrated. |
| `logger-redact` | `@baldim/core/concerns/logger-redact` | Migrated. |
| `logger` | `@baldim/core/concerns/logger` | Migrated. |
| `map-with-concurrency` | `@baldim/core/concerns/map-with-concurrency` | Migrated. |
| `memory-profiler` | `@baldim/utils/memory-profiler` | Migrated to the shared utility package. |
| `metadata-encoding` | `@baldim/core/concerns/metadata-encoding` | Migrated. |
| `money` | `@baldim/utils/money` | Migrated to the shared utility package. |
| `optimized-encoding` | `@baldim/utils/optimized-encoding` | Migrated to the shared utility package. |
| `partition-queue` | `@baldim/core/concerns/partition-queue` | Migrated. |
| `password-hashing` | `@baldim/core/concerns/password-hashing` or `@baldim/core/password` | Migrated; the focused password entry is preferred. |
| `performance-monitor` | `@baldim/core/concerns/performance-monitor` | Migrated. |
| `plugin-storage` | `@baldim/core/plugin` | Migrated as part of the public plugin SDK. |
| `process-manager` | `@baldim/core/concerns/process-manager` | Migrated. |
| `process-max-listeners` | `@baldim/core/concerns/process-max-listeners` | Migrated. |
| `ring-buffer` | `@baldim/core/concerns/ring-buffer` | Migrated. |
| `s3-errors` | `@baldim/core/storage-errors` | Renamed to the provider-neutral storage error contract. Deprecated S3 aliases remain where they were public. |
| `s3-key` | `@baldim/core/storage-key` | Renamed to the provider-neutral storage key contract. |
| `safe-event-emitter` | `@baldim/core/concerns/safe-event-emitter` | Migrated. |
| `safe-merge` | `@baldim/core/concerns/safe-merge` | Migrated. |
| `text-compression` | `@baldim/core/concerns/text-compression` | Migrated. |
| `try-fn` | `@baldim/core/concerns/try-fn` | Migrated. |
| `typescript-generator` | `@baldim/typegen` | Migrated to an independently publishable package. |
| `validator-cache` | `@baldim/core/concerns/validator-cache` | Migrated. |

The old HTTP module's Recker-specific helpers are the only intentionally retired
symbols in this inventory. They performed package discovery and binary installation
inside a generic utility module. Baldim keeps protocol runtimes in the plugin or
adapter that owns them.
