# Errors and recovery

[Core guide](../README.md) · [API reference](api.md) · [Recovery recipes](recipes.md)

Ordinary single-record methods generally reject on failure. Exceptions matter: `getOrNull` returns null for not-found, bulk methods report per-item outcomes, `updateConditional` can return `success: false`, and `migrate` returns document failures in its report. Inspect the result contract for each API.

Core storage errors expose fields such as `name`, `code`, `statusCode`, `retriable` and contextual details. Not every error is a `DocumentEngineError`; provider errors are normalized where possible, argument validation can throw `TypeError`, and wrapper fields differ across error families. Avoid matching human-readable error strings in application code.

| Failure | How it appears | Recommended response |
| --- | --- | --- |
| Missing record | `getOrNull` returns null; `get` rejects with a not-found storage error | Handle absence separately from a storage outage |
| Invalid schema payload | `ValidationError` / `InvalidResourceItem`, normally status 422 | Correct the input/schema; do not retry the unchanged payload |
| Metadata budget exceeded | `MetadataLimitError` (normally 413) or storage size error | Reduce fields or choose a lossless body behavior |
| Stale ETag | Direct replacement rejects with precondition failure (normally 412); conditional update may return false | Reload/reconcile, or use the guarded mutation API |
| Unique collision | `DocumentEngineError`, code `UNIQUE_CONSTRAINT`, status 409 | Resolve the duplicate; the transactional primary write rolled back |
| Mutation retries exhausted | `DocumentEngineError`, `WRITE_CONFLICT`, status 409, `retriable: true` | Bound application retries or report contention |
| Unsafe storage guarantee | `DocumentEngineError`, `UNSUPPORTED_CAPABILITY`, status 501 | Select a supported behavior/client; repeating the same request will not add the capability |
| Writers must be paused | `DocumentEngineError`, `QUIESCENCE_REQUIRED` | Stop writers before asserting `quiescent: true` |
| Scan budget exceeded | Query: `PartitionError`; maintenance/index scan: `DocumentEngineError` with `SCAN_LIMIT` | Narrow the access path or intentionally adjust the budget; no partial query result is promised |
| Migration already running/crashed | `DocumentEngineError`, `MIGRATION_LOCKED`, status 409 | Wait for the runner or recover the lock only after confirming it stopped |
| Migration output invalid | `report.failures` contains the document/message; underlying engine validation code is `MIGRATION_VALIDATION` | Fix transformation/input; rerun with the same stable migration name |
| Migration changed between attempts | Per-document failure from `MIGRATION_CHANGED` or `WRITE_CONFLICT` | Reconcile source/transform; do not blindly replace the pending journal |
| Invalid filter/path/options | `TypeError`, e.g. unknown operator or unsafe dotted path | Correct the request |

Engine codes other than the documented 409/501 families currently have status 422; `QUIESCENCE_REQUIRED` and `SCAN_LIMIT` are examples. Migration reports carry `id` and `message`, not an exported structured error code per failure. Infrastructure/lock/checkpoint failures can reject the migration call instead of producing a report.

## Handle a unique conflict

```ts
import { DocumentEngineError } from '@baldim/core';
try {
  await users.insert({ id: 'duplicate', email: 'ada@example.com', name: 'Other' });
} catch (error) {
  if (error instanceof DocumentEngineError && error.code === 'UNIQUE_CONSTRAINT') {
    // Return an application conflict response; do not repeat the same insert.
  } else {
    throw error;
  }
}
```

This pattern requires a previously created unique index and a real transactional client. [Executable conflict/rollback recipe](recipes.md#unique-index-conflict-and-rollback).

## Recover maintenance failures

For nontransactional index maintenance, a failure can occur after the primary document was committed. Check the document before retrying an insert. Pause writers, run `repairIndexes({ quiescent: true, maxScan })`, then resume indexed queries. Index references may be missing until repaired; a query result before repair is not a reliable integrity check.

`repairPartitions()` is a read-only audit by default. Inspect `missing` and `stale`; after pausing nontransactional writers, call `repairPartitions({ repair: true, quiescent: true, maxScan })`. The core does not pause writers or coordinate application shutdown for you.

For a failed migration, inspect `complete` and `failures`. Successful documents are already committed and their journals skip them on resume. Reuse the same name and deterministic transform. A controlled return releases the runner lock; a process crash can leave it behind. Call `recoverMigrationLock(name, { runnerStopped: true })` only after confirming the old runner cannot continue. Do not delete journals or claim an active lock to force progress.

Hooks, network requests and other external side effects are outside storage rollback. Mutation retries and migration retries can invoke transforms again; keep them pure or make any external dependency lookup repeatable.
