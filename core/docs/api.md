# Core API reference

[Core guide](../README.md) · [Behaviors](behaviors.md) · [Protected fields](protected-fields.md) · [Errors](errors.md) · [Executable recipes](recipes.md)

This reference covers application-facing methods. Internal hydration, mapper and partition-maintenance helpers are not a stable application API. The emitted TypeScript declarations contain the exact overloads and exported types. Document query operators, persisted document indexes, `modify`/`mutate`, migrations and integrity repair require the core 0.3 API described in this branch; they are not all available in 0.2.x.

## Database lifecycle and resources

```ts
import { Baldim } from '@baldim/core';
const db = new Baldim({ connectionString: 'memory://application' });
await db.connect();
try {
  const users = await db.createResource({
    name: 'users', behavior: 'body-only',
    attributes: { name: 'string|required' },
  });
  await users.insert({ id: 'ada', name: 'Ada' });
} finally {
  await db.disconnect();
}
```

| API | Inputs and defaults | Result / behavior |
| --- | --- | --- |
| `new Baldim(options)` | `connectionString` or explicit `client`; memory is registered by core | Configures a database; call `connect()` before resource work |
| `connect()` | No arguments | Connects storage and restores persisted resource definitions |
| `disconnect()` | No arguments | Performs database/plugin/storage cleanup; use in `finally` or shutdown handling |
| `createResource(config)` | Required `name`, `attributes`; `behavior: 'user-managed'` by default | `Resource<S>` for a literal schema; creates or applies the current definition. It does not rewrite old documents |
| `getResource(name)` | Resource name | Resolves a resource asynchronously; rejects if it cannot be found |
| `resources[name]` | Resource name | Connection-local resource map; check for missing names before use |
| `resourceExists(name)` | Resource name | Boolean lookup in the resource registry |
| `listResources()` | No arguments | Current resource definitions |
| `flushMetadata()` | No arguments | Flushes deferred definition writes before controlled shutdown |
| `usePlugin(plugin, name?)` | Plugin instance; optional registry name | Installs the plugin through the database lifecycle |
| `uninstallPlugin(name, options?)` | Registry name; `purgeData` chooses cleanup policy | Removes that plugin instance |

### Resource definition options

| Option | Default / meaning |
| --- | --- |
| `attributes` | Schema strings or object definitions; runtime validation remains authoritative |
| `behavior` | `user-managed`; choose explicitly with the [behavior guide](behaviors.md) |
| `timestamps` | `false`; when enabled, writes manage `createdAt` and `updatedAt` |
| `paranoid` | `true`; administrative `deleteAll` and `deleteAllData` require explicit `false` |
| `strictValidation` | `true`; invalid writes reject |
| `allNestedObjectsOptional` | `true` in the resource constructor; set `false` when nested required rules must be enforced |
| `autoDecrypt` | `true`; `false` returns stored ciphertext for secret fields |
| `security` | Inherits database settings, with resource overrides for passphrase, pepper and algorithm costs |
| `partitions` | No partitions by default; shorthand field array or named definitions |
| `asyncPartitions` | Adapter-dependent; normally asynchronous for portable adapters, synchronous for native partition-index adapters. Set `false` to wait for portable maintenance |
| `hooks` | Before/after lifecycle functions; external hook side effects are not rolled back with storage |
| `idGenerator` / `idSize` | Optional custom generator/ID configuration; supplying `id` avoids generating an ID |

## Document reads and writes

`Document<S>` below means the inferred schema document plus `id`. Dynamic schemas retain the general `ResourceData` API. Reads of old records do not prove that a new schema migration has already run.

| API | Parameters | Return and failure semantics |
| --- | --- | --- |
| `insert(data, options?)` | Schema data; optional `id` | Document; existing explicit ID conflicts. Use `upsert` for insert-or-update |
| `get(id)` | Nonempty ID | Document; a missing record rejects |
| `getOrNull(id)` | ID | Document or `null` only for not-found; other storage failures reject |
| `getOrThrow(id)` | ID | Document; missing record rejects with `RESOURCE_NOT_FOUND` |
| `exists(id)` | ID | Boolean; uses storage metadata; non-not-found failures reject |
| `update(id, attributes)` | Partial top-level values; nested paths supported at runtime | Merges into the existing document, validates and writes; missing record rejects |
| `patch(id, fields, options?)` | Partial values, including typed dotted paths; optional partition hints | Partial update; may use metadata-copy optimization for applicable behaviors |
| `replace(id, fullData, options?)` | Complete schema payload | Full replacement with the same ID; omitted fields disappear unless schema defaults restore them |
| `upsert({ id, ...data })` | Required ID | Updates an existing record or inserts an absent one |
| `delete(id)` | ID | Storage deletion response, not a document/count; missing/read failures can reject |
| `validate(data, options?)` | Data; optional `includeId` | Validation result; not a persistence operation. Protected-field validation can normalize/encrypt/hash values |
| `applyDefaults(data)` | Input values | Values with schema defaults; does not persist |

### Conditional replacement and update

`replace` options include `ifMatch?: string` and `preserveContent?: boolean` (default false), plus partition hints. A stale ETag rejects; [safe mutations](../README.md#optimistic-document-mutations) handle retries automatically. `preserveContent: true` preserves an existing user-managed body and content type; it does not make the operation transactional.

`updateConditional(id, attributes, { ifMatch })` requires a nonempty ETag. It returns `{ success, data?, etag?, error?, validationErrors? }`; inspect `success` rather than assuming every conflict throws. Invalid arguments and storage failures can still reject. An ETag derived only from the body is not a complete metadata revision token.

```ts
const current = await users.get('ada');
if (typeof current._etag !== 'string') throw new Error('Adapter did not provide an ETag');
const result = await users.updateConditional('ada', { name: 'Ada Lovelace' }, { ifMatch: current._etag });
if (!result.success) {
  // Reload and reconcile, or report the conflict to the caller.
  console.log(result.error);
}
```

## Bulk operations, lists and pagination

| API | Options / defaults | Result |
| --- | --- | --- |
| `insertMany(documents)` | Array of insert payloads | Successful documents; item failures emit error events and are omitted. Not an all-or-nothing batch |
| `getMany(ids)` | Array of IDs | Hydrated successful results; item failures are reported through error events. Do not assume input/output positions remain aligned |
| `deleteMany(ids)` | Array of IDs | `{ deleted: number, errors: number }`; each item has its own outcome |
| `list(options?)` | `limit`, `offset: 0`, partition hints | Documents; default portable list window is 1,000. Pass a bounded limit explicitly |
| `listIds(options?)` | Same window/partition options | IDs without loading document bodies; default amount 1,000 |
| `count(options?)` | Partition hints; `skipCache: false` | Number for that resource/access path; not the count for an arbitrary query filter |
| `getAll()` | No arguments | Entire resource in memory; use bounded pages for growing resources |
| `page(options?)` | `size: 100`, optional cursor **or** one-based page number | Page object below; offset is unsupported and page/cursor cannot be combined |
| `deleteAll()` | Requires resource `paranoid: false` | `{ deletedCount }`; clears primary documents. Prefer paged `deleteMany` when normal per-item hooks/reference maintenance matter |
| `deleteAllData()` | Requires resource `paranoid: false` | Purges storage under the resource prefix, including index definitions/references/journals; `deletedCount` is a storage-object count |

Bulk successes are not rolled back because another item fails. Unique-index writes own one transaction per document and reject caller-owned nested transactions. For administrative purges, audit partition references afterward as appropriate; `deleteAll` does not universally provide per-document hook/partition cleanup on every path.

```ts
let cursor: string | null = null;
do {
  const page = await users.page({ size: 100, cursor });
  for (const document of page.items) console.log(document.id);
  cursor = page.nextCursor ?? null;
} while (cursor);
```

`page()` returns `{ items, pageSize, hasMore, nextCursor, page, totalItems, totalPages }`. The current cursor implementation returns `totalItems: null` and `totalPages: null`; call `count()` separately if needed. `page` is null for cursor requests. Although `skipCount` exists in the public options type, it does not populate totals in this implementation. Keep size, partition and partition values unchanged when reusing a cursor. Pagination does not create a snapshot while records are changing.

## Query reference

`query(filter = {}, options = {})` returns matching documents. Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `limit` | `100` | Maximum returned matches; `0` returns an empty array |
| `offset` | `0` | Number of matching documents to skip |
| `maxScan` | `10000` | Budget for fallback/index scans; a positive safe integer |
| `select` | All fields | Dotted field paths; projection always includes `id`, with partial result typing |
| `orderBy` | Storage order | Field-to-`asc`/`desc` mapping; sort ties use ID |
| `partition` / `partitionValues` | Automatic planning | Explicit access path; explicit partitions take precedence over document indexes |

Limits and offsets must be nonnegative safe integers. Sorting materializes the complete bounded candidate set, not just the first page. Storage-native equality filters do not expose internal provider scan counts. [Filter semantics and examples](../README.md#document-queries).

## Persisted indexes and recovery

| API | Options / defaults | Return / requirements |
| --- | --- | --- |
| `createIndex(name, definition, options?)` | Required nonempty distinct `fields`; `unique: false`, `sparse: false`; `maxScan: 10000` | `{ name, fields, unique?, sparse?, state }`; persisted backfill; same ready definition is reusable |
| `listIndexes()` | No arguments | Persisted definitions, including `building` or `ready` state |
| `dropIndex(name, options?)` | `quiescent` on nontransactional storage | Removes its definition/references |
| `repairIndexes(options?)` | `maxScan: 10000`; `quiescent` without transactions | `{ entries, journalsCleared }`; rebuilds from primary documents and clears pending repair journals |
| `repairPartitions(options?)` | `repair: false`, `maxScan: 10000`; `quiescent` when repairing without transactions | `{ documents, missing, stale, repaired }`; default is read-only |

Index/migration names allow 1–80 letters, digits, underscores or hyphens. Indexed values must be finite scalars or dates. A composite index is usable for equality lookup when **all** fields are constrained; this is different from a partition's leading-prefix planning. Sparse indexes skip missing and null fields; non-sparse indexes distinguish missing from null.

Unique indexes require `runInTransaction` and `isInTransaction` support. Their writes and index builds must own their transactions. Quiescence flags are operator assertions: the core does not pause writers for you. A failed nontransactional index write can leave the document committed and a journal pending; stop writers, repair, then resume indexed queries. See [error recovery](errors.md) and the [unique-index recipe](recipes.md#unique-index-conflict-and-rollback).

## Mutations and migrations

| API | Parameters and defaults | Result |
| --- | --- | --- |
| `modify(id, operations, options?)` | `increment`, `addToSet`, `pull`, `unset`; `retries: 5` | Updated document; finite numeric/array fields required; overlapping/system paths rejected |
| `mutate(id, transform, options?)` | Pure transform returning a full payload with the same ID; `retries: 5` (0–100) | Updated document; retry exhaustion rejects `WRITE_CONFLICT` |
| `compareSchemas(previous, next)` | Two schema definitions | `[{ field, kind, requiresMigration }]`; conservative diff only, no writes |
| `migrate(options)` | Required stable `name`, `transform`; `batchSize: 100`, `maxBatches: 100` | Migration report; stops at first per-document failure and checkpoints for resume |
| `recoverMigrationLock(name, { runnerStopped: true })` | Explicit assertion that the previous runner stopped | Removes the durable runner lock; never use to displace a live migration |

`migrate` reports `{ name, cursor, processed, migrated, failures: [{ id, message }], complete }`. `complete: false` can mean either a failure **or** reaching `maxBatches`; inspect both fields and call again when appropriate. Completed names are immutable. Transformations must be deterministic and may run more than once after failures. Whole migrations are not one transaction; pause creates/deletes for a stable candidate set. Journal enumeration is bounded at 100,000 entries per migration. [Complete rename/backfill/recovery recipe](recipes.md#rename-backfill-and-resume-a-migration).

## Binary content, hooks and streams

| API | Parameters / result |
| --- | --- |
| `setContent({ id, buffer, contentType? })` | Buffer/string; default `application/octet-stream`; writes the document body |
| `content(id)` | `{ buffer: Buffer \| null, contentType: string \| null }` |
| `hasContent(id)` | Boolean |
| `deleteContent(id)` | Removes body content; keeps mapped attributes where supported |
| `readable()` / `writable()` | Resource-backed Node stream helpers |
| `useMiddleware(method, fn)` | Returns a removal function |
| `on(event, listener)` / `once(...)` | Resource lifecycle events |

Use content APIs with `user-managed` attributes that fit metadata; body-based document modes use the same body for attributes. Ordinary writes can replace that body. Use `replace(..., { preserveContent: true })` for deliberate user-managed content preservation, or safe `mutate`/`migrate` on a capable adapter. See [behaviors](behaviors.md).

Hooks are supplied in `createResource({ hooks: { beforeInsert: [fn], afterInsert: [fn], ... } })`. They may transform values and may run before a transaction rolls back. Keep external effects idempotent; storage rollback does not undo a sent message or external request.

## DatabaseManager

| API | Default / result |
| --- | --- |
| `new DatabaseManager({ connections, defaults?, default? })` | Requires at least one connection. `default` is the first connection name when omitted |
| `connect()` / `disconnect()` | Starts/stops managed databases; connect rolls back partial startup failures |
| `createResource({ connection?, ...config })` | Uses the named connection or configured default; resource names must be globally unique |
| `resource(name)` / `resources[name]` | Unified cross-connection lookup; `resource` rejects unknown/ambiguous names |
| `connection(name)` | Direct database handle; unknown name rejects |
| `defaultConnection` | Default database handle |
| `connectionNames` / `resourceNames` | Names of registered connections/resources |
| `getConnectionForResource(name)` | Owner connection name; unknown/ambiguous names reject |
| `isConnected()` | Manager lifecycle state |

Use `manager.createResource()` to reject cross-connection duplicates before persistence. `manager.connection('analytics').resources.events` is local lookup; `manager.resources.events` is unified lookup. Neither performs an implicit cross-database transaction. [Executable multidatabase recipe](recipes.md#multidatabase).
