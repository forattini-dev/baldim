# @baldim/core

Baldim's document database engine, multidatabase manager, and extension contracts. Requires Node.js 24 or newer.

```sh
pnpm add @baldim/core
```

The npm README describes its bundled package version. GitHub branch documentation can contain unreleased changes; use the matching release tag and [changelog](CHANGELOG.md) for your installed version. The document-engine APIs below (query operators, persisted indexes, mutations, migrations and repair) require core **0.3.0 or later**; they are not all present in 0.2.x. Before that release is published, use a build of this feature branch to run those recipes.

## Documentation map

- [Connect and create a resource](#connect-and-create-a-resource)
- [Everyday CRUD and pagination](#everyday-crud-and-pagination)
- [Multiple databases](#multiple-databases)
- [Schemas and inferred types](#schemas-and-inferred-typescript-types)
- [Document queries](#document-queries)
- [Composite, sparse and unique indexes](#composite-sparse-and-unique-indexes)
- [Document mutations](#optimistic-document-mutations)
- [Schema migrations](#schema-evolution-and-resumable-migrations)
- [Partition integrity](#partition-integrity-and-repair)
- [Choose a storage behavior](docs/behaviors.md)
- [Passwords and secrets](docs/protected-fields.md)
- [API reference: inputs, defaults and returns](docs/api.md)
- [Errors and recovery](docs/errors.md)
- [Executable recipes checked by CI](docs/recipes.md)

## Connect and create a resource

```ts
import { Baldim } from '@baldim/core';

const database = new Baldim({
  connectionString: 'memory://my-app',
});

await database.connect();

const notes = await database.createResource({
  name: 'notes',
  attributes: {
    title: 'string',
    done: 'boolean',
  },
});

await notes.insert({ id: 'first', title: 'Try Baldim', done: false });
```

Storage clients with multipart support (for example `@baldim/adapter-s3`) can
be used per insert:

```ts
await notes.insert({ id: 'big-one', title: 'Large record', done: false }, { multipart: true });
await notes.insert(
  { id: 'big-two', title: 'Large record', done: false },
  { multipart: { partSize: 16 * 1024 * 1024, queueConcurrency: 2 } },
);
```

## Everyday CRUD and pagination

```ts
const first = await notes.get('first');
const missing = await notes.getOrNull('missing'); // null; storage outages still reject
await notes.update('first', { done: true });
await notes.patch('first', { title: 'Ship Baldim' });
await notes.replace('first', { title: 'Ship Baldim', done: true });
await notes.upsert({ id: 'second', title: 'Read the guide', done: false });

const ids = await notes.listIds({ limit: 20 });
const documents = await notes.list({ limit: 20 });
const count = await notes.count();
const page = await notes.page({ size: 20 });
const next = page.nextCursor
  ? await notes.page({ size: 20, cursor: page.nextCursor })
  : null;
const removed = await notes.deleteMany(['second']);
console.log(removed.deleted, removed.errors); // numeric counts
```

`insert` creates a new ID; `upsert` requires an explicit ID. `update`/`patch` merge values; `replace` writes the complete intended payload. Cursor pages do not include a total count and are not snapshots across concurrent writers. Bulk methods retain successes and report item failures rather than rolling back the entire batch. See the [API reference](docs/api.md) for every option/default/result and the [CRUD recipe](docs/recipes.md#crud-queries-partitions-and-pagination) for a complete connected example.

Connect once during startup and use `try/finally` or graceful shutdown to call `database.disconnect()`. Choose [behavior](docs/behaviors.md) explicitly for growing documents, metadata budgets or binary content. Configure [passwords and secrets](docs/protected-fields.md) before storing protected fields.

## Multiple databases

Use the manager with named connections:

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

await databases.connect();
await databases.createResource({
  connection: 'primary', // optional: `primary` is the configured default
  name: 'users',
  attributes: { name: 'string' },
});
await databases.createResource({
  connection: 'analytics',
  name: 'events',
  attributes: { type: 'string' },
});

const users = databases.resources.users;
const events = databases.resource('events');
const analyticsEvents = databases.connection('analytics').resources.events;
```

Resource names created through the manager are unique across its connections.
Omitting `connection` from `createResource()` uses the configured default. Use
`connection(name)` for direct database access, or `resource(name)` and `resources`
for a unified view. Resource names are globally unique inside the manager; direct
resource creation is indexed, but cross-connection creation should go through the
manager so it can reject duplicates before writing metadata.

The memory implementation lives in `@baldim/adapter-memory` and is installed by
core, so `memory:` works without setup. Filesystem, SQLite/libSQL/D1, RedDB, and
S3-compatible storage live in separate adapter packages and register when imported.

`S3db` remains available as a deprecated class alias so applications can migrate
their imports before changing persisted data. Baldim continues to read and
write the established `s3db.json` metadata format during this compatibility phase.

## Schemas and inferred TypeScript types

Literal schemas passed to `createResource()` infer insert, update, patch, read,
query, and page types. This also works through `DatabaseManager.createResource()`.
The runtime instance remains a `Resource`; dynamic `AttributesSchema` definitions
retain the existing generic document API.

```ts
const orders = await database.createResource({
  name: 'orders',
  behavior: 'body-only',
  attributes: {
    customer: 'string|required',
    total: 'number|required',
    status: 'string|required|enum:pending,paid,cancelled',
    labels: { type: 'array', items: 'string' },
    note: 'string|optional',
  },
  asyncPartitions: false,
  partitions: { byStatus: { fields: { status: 'string' } } },
});

await orders.insert({ id: 'order-1', customer: 'Ada', total: 120, status: 'pending', labels: [] });
// TypeScript rejects a string total, missing customer, unknown query fields,
// and wrong operand types. Fields with defaults may be omitted on insert.
```

Exported types include `InferSchema<S>`, `InsertDocument<S>`,
`SchemaDocument<S>`, and `TypedResource<S>` (`Resource<S>`). String, number,
boolean, date/datetime, string enums, object properties, array items and dotted
nested paths are supported. Dates are typed as `Date | string`; runtime schema
validation remains authoritative. Types cannot describe plugin-added fields or
schemas discovered only after connecting: use the generic `Resource` for those.

## Document queries

```ts
const selected = await orders.query({
  $and: [
    { status: { $in: ['pending', 'paid'] } },
    { total: { $gte: 100, $lt: 500 } },
  ],
  note: { $exists: false },
}, {
  orderBy: { total: 'desc' },
  select: ['customer', 'total'],
  limit: 20,
  offset: 0,
  maxScan: 10_000,
});
```

Plain values keep equality semantics. Predicates support `$eq`, `$ne`, `$gt`,
`$gte`, `$lt`, `$lte`, `$in`, `$nin`, and `$exists`; logical expressions support
`$and`, `$or`, and `$not`. Missing fields differ from fields explicitly set to
`null`. Comparisons require matching scalar types; no string/number coercion is
performed. Multiple predicates on a field and sibling conditions are ANDed.

Only guaranteed equalities are used to choose a partition or composite index.
Composite partitions require a contiguous leading prefix. Storage-native
filtering remains available for plain equality queries. Other queries use
bounded cursor scans, applying filters before offset and limit. Scan-based
queries default to at most 10,000 hydrated documents; exceeding `maxScan` rejects
instead of returning a partial result. Native filters apply at the provider and
do not expose their internal scan counts to this document-level budget.

Ordering scans the complete candidate set within that bound, then sorts; equal
sort values use ID as a deterministic tiebreaker. Ordering does not create a
snapshot across concurrent writes. Projection returns only selected fields plus
`id`; projected results are typed as partial documents. Scan-based queries have
no automatic global index for range predicates.

## Composite, sparse and unique indexes

```ts
// Pause writers when building/dropping/repairing on nontransactional storage.
await orders.createIndex('customer_status', {
  fields: ['customer', 'status'],
  sparse: true,
}, { quiescent: true, maxScan: 10_000 });

console.log(await orders.listIndexes());
const matches = await orders.query({ customer: 'Ada', status: 'pending' });
await orders.dropIndex('customer_status', { quiescent: true });
```

Definitions and references persist separately from the resource schema. Inserts,
updates, patches, replacements, conditional updates, upserts and bulk document
operations maintain them. A ready index is selected when all its fields have
known equality values; range predicates use scan evaluation. Sparse indexes
skip documents with a missing or null indexed field. Non-sparse indexes include
those values. Indexed values must be finite scalar values or dates.

`unique: true` requires a client's real `runInTransaction()` implementation and
`isInTransaction()` context detection.
The document, its index references, and transactional partition writes commit
or roll back together. A duplicate rejects with
`DocumentEngineError.code === 'UNIQUE_CONSTRAINT'`. Nontransactional clients,
including the current memory and S3 implementations, reject unique indexes with
`UNSUPPORTED_CAPABILITY`. Unique-index writes reject caller-owned nested transactions
because the adapter contract provides no savepoints for isolated rollback. Bulk
operations retain successful items and roll back each failed item separately.
Core adds no storage SDK or transaction emulation.

On nontransactional clients, failed index maintenance can leave the document
committed. A durable index journal remains for recovery; stop writers and run
`resource.repairIndexes({ quiescent: true })`. Queries can miss entries until
repair completes. Hooks can execute before a transaction is rolled back; their
external side effects are not part of the storage transaction.

## Optimistic document mutations

```ts
await orders.modify('order-1', {
  increment: { total: 10 },
  addToSet: { labels: 'reviewed' },
});
await orders.modify('order-1', { pull: { labels: 'reviewed' }, unset: ['note'] });

await orders.mutate('order-1', current => ({
  ...current,
  total: current.total + 10,
}), { retries: 5 });
```

With transactional adapters, the complete read/transform/write runs inside one
transaction. Other adapters use the current ETag for a conditional replacement,
but require `behavior: 'body-only'` or an explicit `etagIncludesMetadata`
capability: body-only ETags cannot detect metadata changes. Unsafe operations
reject with `UNSUPPORTED_CAPABILITY` before running the transform. These rules
also apply to migrations.
A conflicting ETag retries from the newest document; exhaustion rejects with
`WRITE_CONFLICT`. The transform can execute more than once: keep it pure and
free of external side effects. IDs and storage metadata cannot be changed by
`modify()`. Numeric increments require finite numbers; array operations compare
values structurally. Overlapping mutation paths are rejected.

A direct `replace(id, data, { ifMatch: etag })` also supports conditional writes.
Mutations and migrations preserve user-managed binary content. This mechanism
coordinates one document; it does not provide transactions across resources or
connections, and depends on the adapter enforcing its declared transaction or ETag guarantees.
For direct conditional replacements, a body-only ETag is not a full revision
token when attributes are stored in metadata.

## Schema evolution and resumable migrations

`compareSchemas(previous, next)` reports added, removed and changed fields.
Adding an optional or defaulted field is classified as compatible; other changes
conservatively require migration. The report does not automatically transform
documents or change a resource's schema.

Declare the target schema using the normal resource definition, then run an
explicit deterministic transformation with a stable, unique migration name:

```ts
const report = await orders.migrate({
  name: 'orders-total-v2',
  batchSize: 100,
  maxBatches: 10,
  transform: current => ({ ...current, total: Number(current.total) }),
});

console.log(report.complete, report.migrated, report.failures);
// Inspect failures; call again with the same name/transform to resume an incomplete migration.
```

Every output is validated against the current resource schema and written with
its source ETag. Batches checkpoint their cursor. Per-document journals prevent
reapplying completed transformations if a batch or checkpoint fails; journals
store hashes and status, never plaintext document payloads. A write committed
before its completion journal can be recognized by its expected payload hash.
Transformations and schema normalization must be deterministic across retries.
Concurrent changes produce an explicit conflict rather than being overwritten.

The first failed document stops its batch and returns a report containing the
failure. Completed documents in that batch are skipped on resume. Completed
migration names are immutable; use a new name for a later transformation. Keep
any source fields/decoding needed by the transform available until completion.
Migrations are not atomic across all documents and should run on a stable
candidate set; pause concurrent creates/deletes when pagination could change.

A durable lock excludes simultaneous runners. After a process crash, confirm
that its runner has stopped, then call
`resource.recoverMigrationLock(name, { runnerStopped: true })` before resuming.
The core never automatically steals an active migration lock. See the [rename/backfill/failure/resume recipe](docs/recipes.md#rename-backfill-and-resume-a-migration), and the [migration options/report reference](docs/api.md#mutations-and-migrations).

## Partition integrity and repair

```ts
const audit = await orders.repairPartitions(); // read-only
console.log(audit.missing, audit.stale);

await orders.repairPartitions({
  repair: true,
  quiescent: true,
  maxScan: 10_000,
});
```

The audit derives expected references from primary documents, then finds missing
and stale partition keys. Repair creates missing references and removes stale
ones without rewriting documents. Transactional clients run the operation in a
transaction. Other clients require writers to be paused for repair; an audit
while writers are active is an observation rather than a consistent snapshot.
Scans are bounded, and repair starts only after the document/reference scan has
completed successfully. Existing asynchronous partition-write behavior remains
available; this API provides explicit detection and recovery.

## Documentation verification

The [recipes](docs/recipes.md) are compiled as TypeScript and executed against memory and real local SQLite in CI. Marked recipe blocks are checked against their source files, and local links/headings in the core guide are validated. Run `pnpm --filter @baldim/core docs:check` after a build. Short contextual snippets elsewhere in the guide explain API usage; they are not all standalone programs. The guides and example source files are included in the npm package.
