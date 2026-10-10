# Choose a storage behavior

[Core guide](../README.md) · [API reference](api.md)

`behavior` controls how schema-mapped attributes use an object's metadata and body. It is a resource setting, not a choice of adapter. Choose it when declaring the resource; changing it does not automatically rewrite existing objects.

## Decision table

| Behavior | Attribute placement | When the metadata budget is exceeded | Use when |
| --- | --- | --- | --- |
| `body-only` | Mapped attributes in a JSON body; mapping/version information stays in metadata | Attributes do not compete for metadata space | General nested documents, growing payloads, portable ETag-based mutations |
| `body-overflow` | Smaller mapped fields in metadata; overflow fields in JSON body | Moves overflow fields to body; reads merge both parts | Retaining small metadata fields while allowing larger documents |
| `user-managed` (default) | Small inserts use metadata; oversize inserts spill mapped data into body; updates can use body too | Emits `exceedsLimit`; placement depends on operation, so do not assume the body is always free | Existing compatible layouts, or deliberate binary-content use with small attributes |
| `enforce-limits` | Attributes must fit metadata | Rejects with `MetadataLimitError` | Applications that require a strict metadata budget |
| `truncate-data` | Keeps fitting metadata fields | Can shorten a field and omit subsequent fields; marks truncation | Explicitly lossy workloads that accept changed/missing values |

For a new document resource, `body-only` is a straightforward choice. For `enforce-limits` and `truncate-data`, schema mapping/system fields consume part of the budget; the portable default is 2,047 bytes and the effective attribute allowance is smaller. The exact available budget depends on storage configuration and system metadata.

```ts
const orders = await db.createResource({
  name: 'orders', behavior: 'body-only',
  attributes: {
    customer: 'string|required',
    total: 'number|required',
    items: { type: 'array', items: { type: 'object', props: { sku: 'string', quantity: 'number' } } },
  },
});
```

`truncate-data` is not a substitute for validation: a validated input can be truncated at storage time, including serialized nested values. Choose a lossless mode when reading exactly the input values matters. `body-overflow` preserves the document fields but uses the body for overflow, so attaching arbitrary binary content there is incompatible with that layout.

## Concurrency is a separate capability

| Storage guarantee | `modify` / `mutate` / migrations | Unique document indexes |
| --- | --- | --- |
| Real `runInTransaction` | Read, transform and write are enclosed in one transaction | Also requires transaction-context detection; conflicting document/index writes roll back |
| No transaction; body-derived ETag | Supported for `body-only`; reject other behaviors | Unsupported |
| No transaction; adapter declares `etagIncludesMetadata` | Conditional replacement covers logical body/metadata changes | Unsupported; a document CAS is not a transaction across index keys |

Memory and S3 currently use body-derived ETags and do not implement these storage transactions. Use `body-only` for their optimistic document mutations. Local SQLite supports real transactions. Do not infer capabilities of remote SQLite/libSQL/D1 clients from local SQLite's behavior; check the actual client contract.

Direct `replace(..., { ifMatch })` and `updateConditional` rely on the adapter's ETag. Body-derived ETags may remain unchanged after metadata-only changes. The guarded mutation/migration APIs reject unsafe combinations rather than promising lost-update protection. Sorting/pagination and audits on active nontransactional writers are observations, not snapshots.

## Binary content

Use `user-managed` with attributes that fit metadata when the body must hold binary content. `setContent()` writes that body; do not combine it with `body-only`/overflow document attributes. Ordinary update/replacement paths can rewrite the body. Explicit preservation is available:

```ts
const assets = await db.createResource({
  name: 'assets', behavior: 'user-managed',
  attributes: { filename: 'string|required' },
});
await assets.insert({ id: 'logo', filename: 'logo.png' });
await assets.setContent({ id: 'logo', buffer: Buffer.from([0, 1, 2]), contentType: 'image/png' });
await assets.replace('logo', { filename: 'new-logo.png' }, { preserveContent: true });
const content = await assets.content('logo');
```

Safe `mutate` and migrations preserve user-managed content automatically when the adapter supports their required revision/transaction guarantee. Preservation is distinct from protection against concurrent writers.

## Partitions versus document indexes

Partitions are declared with the schema and maintain references under named access paths. Their composite field order is the lexicographic order of field names in the current implementation. Automatic planning uses a contiguous leading equality prefix; constraining only a later field cannot narrow to that prefix. Declare separate partitions for other access patterns.

Document indexes are persisted separately using `createIndex`. Composite equality lookup requires all indexed fields. Range predicates do not create an ordered range index: they evaluate a bounded candidate set. Use `maxScan` deliberately, `page()` for unfiltered traversal, and an explicit equality partition/index when it narrows the workload.

Set `asyncPartitions: false` when the write must wait for portable reference maintenance. This alone is not a multi-key transaction. After interruptions, `repairPartitions()` audits references; nontransactional repair requires pausing writers and passing `quiescent: true`.
