import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type Resource from '../resource.class.js';
import type { ResourceData } from '../resource.class.js';
import type { ReplaceOptions } from './resource-persistence.class.js';
import type { AttributesSchema } from './resource-validator.class.js';
import { isNotFoundError } from '../concerns/storage-errors.js';
import { fieldValue, pathParts, setField } from './document-query.js';

export class DocumentEngineError extends Error {
  readonly statusCode: number;
  readonly retriable: boolean;
  constructor(
    message: string,
    public code: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DocumentEngineError';
    this.statusCode = [
      'UNIQUE_CONSTRAINT',
      'WRITE_CONFLICT',
      'MIGRATION_LOCKED',
    ].includes(code)
      ? 409
      : code === 'UNSUPPORTED_CAPABILITY'
        ? 501
        : 422;
    this.retriable = code === 'WRITE_CONFLICT';
  }
}
export interface IndexDefinition {
  fields: readonly string[];
  unique?: boolean;
  sparse?: boolean;
}
export interface ResourceIndex extends IndexDefinition {
  name: string;
  state: 'building' | 'ready';
}
export interface MutationOperations {
  increment?: Record<string, number>;
  addToSet?: Record<string, unknown>;
  pull?: Record<string, unknown>;
  unset?: readonly string[];
}
export interface MigrationOptions {
  name: string;
  batchSize?: number;
  maxBatches?: number;
  transform: (
    document: ResourceData,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}
export interface MigrationReport {
  name: string;
  cursor: string | null;
  processed: number;
  migrated: number;
  failures: Array<{ id: string; message: string }>;
  complete: boolean;
}
export interface PartitionIntegrityReport {
  documents: number;
  missing: string[];
  stale: string[];
  repaired: boolean;
}
const systemFields = new Set([
  'id',
  '_etag',
  '_v',
  '_lastModified',
  '_contentLength',
  '_hasContent',
  '_mimeType',
  '_versionId',
  '_expiresAt',
  '_definitionHash',
  '_originalVersion',
  '_versionMapped',
  '_decryptionFailed',
  '_error',
  '$before',
  '$after',
  '_partition',
  '_partitionValues',
]);
export function documentPayload(
  document: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(document).filter(([key]) => !systemFields.has(key)),
  );
}
function digest(value: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object' && !(v instanceof Date)
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, stable(x)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}
function validName(name: string): void {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name))
    throw new TypeError(
      'Index/migration names must contain 1–80 letters, digits, underscores or hyphens',
    );
}
function positive(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${name} must be a positive integer`);
  return value;
}
export interface SchemaChange {
  field: string;
  kind: 'added' | 'removed' | 'changed';
  requiresMigration: boolean;
}
export function compareSchemas(
  before: AttributesSchema,
  after: AttributesSchema,
): SchemaChange[] {
  const changes: SchemaChange[] = [];
  for (const field of new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ])) {
    if (
      field.startsWith('$$') ||
      isDeepStrictEqual(before[field], after[field])
    )
      continue;
    const kind = !Object.hasOwn(before, field)
      ? 'added'
      : !Object.hasOwn(after, field)
        ? 'removed'
        : 'changed';
    const definition = after[field];
    const optional =
      typeof definition === 'string'
        ? definition
            .split('|')
            .some((rule) => rule === 'optional' || rule.startsWith('default:'))
        : !!definition &&
          typeof definition === 'object' &&
          (definition.optional === true ||
            Object.hasOwn(definition, 'default'));
    changes.push({
      field,
      kind,
      requiresMigration: kind !== 'added' || !optional,
    });
  }
  return changes;
}

/** Provider-independent document operations. Transaction guarantees come from Client. */
export class ResourceEngine {
  constructor(
    private resource: Resource,
    private replaceStored: (
      id: string,
      data: Record<string, unknown>,
      options: ReplaceOptions,
    ) => Promise<ResourceData>,
  ) {}
  private get client() {
    return this.resource.client;
  }
  private get root() {
    return `resource=${this.resource.name}/`;
  }
  private get definitions() {
    return `${this.root}meta/index-definitions/`;
  }
  private async read<T>(key: string): Promise<T | null> {
    try {
      const object = await this.client.getObject(key);
      return JSON.parse(await object.Body!.transformToString!()) as T;
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }
  private async write(
    key: string,
    data: unknown,
    ifNoneMatch?: string,
  ): Promise<void> {
    await this.client.putObject({
      key,
      body: JSON.stringify(data),
      metadata: {},
      contentType: 'application/json',
      ifNoneMatch,
    });
  }
  private async *keys(prefix: string, max = 10000): AsyncGenerator<string> {
    let cursor: string | null = null,
      count = 0;
    do {
      const page = await this.client.listObjects({
        prefix,
        maxKeys: Math.min(200, max - count + 1),
        continuationToken: cursor,
      });
      for (const item of page.Contents || []) {
        if (++count > max)
          throw new DocumentEngineError('Scan limit exceeded', 'SCAN_LIMIT', {
            prefix,
            max,
          });
        yield item.Key;
      }
      cursor = page.IsTruncated ? (page.NextContinuationToken ?? null) : null;
      if (page.IsTruncated && !cursor)
        throw new DocumentEngineError(
          'Storage omitted continuation token',
          'INVALID_CURSOR',
        );
    } while (cursor);
  }
  private async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.client.runInTransaction
      ? this.client.runInTransaction(fn)
      : fn();
  }
  async listIndexes(): Promise<ResourceIndex[]> {
    const result: ResourceIndex[] = [];
    for await (const key of this.keys(this.definitions, 100)) {
      const definition = await this.read<ResourceIndex>(key);
      if (definition) result.push(definition);
    }
    return result;
  }
  private indexKey(
    index: ResourceIndex,
    document: Record<string, unknown>,
  ): string | null {
    const values = index.fields.map((field) => fieldValue(document, field));
    if (index.sparse && values.some((v) => v === undefined || v === null))
      return null;
    const tuple = values.map((v) => {
      if (v instanceof Date) return ['date', v.toISOString()];
      if (
        (v !== undefined &&
          v !== null &&
          !['string', 'number', 'boolean'].includes(typeof v)) ||
        (typeof v === 'number' && !Number.isFinite(v))
      )
        throw new DocumentEngineError(
          'Indexes require scalar field values',
          'INVALID_INDEX_VALUE',
        );
      return [typeof v, v ?? null];
    });
    const prefix = `${this.root}index=${index.name}/${digest(tuple)}`;
    return index.unique
      ? prefix
      : `${prefix}/id=${encodeURIComponent(String(document.id))}`;
  }
  private async addIndexEntry(
    index: ResourceIndex,
    document: ResourceData,
  ): Promise<void> {
    const key = this.indexKey(index, document);
    if (!key) return;
    if (index.unique) {
      const owner = await this.read<{ id: string }>(key);
      if (owner && owner.id !== document.id)
        throw new DocumentEngineError(
          `Unique index '${index.name}' conflicts`,
          'UNIQUE_CONSTRAINT',
          { index: index.name, id: document.id, owner: owner.id },
        );
      if (owner) return;
    }
    await this.write(key, { id: document.id }, index.unique ? '*' : undefined);
  }
  async createIndex(
    name: string,
    definition: IndexDefinition,
    options: { maxScan?: number; quiescent?: boolean } = {},
  ): Promise<ResourceIndex> {
    validName(name);
    if (
      !Array.isArray(definition.fields) ||
      !definition.fields.length ||
      new Set(definition.fields).size !== definition.fields.length
    )
      throw new TypeError(
        'Index fields must be a nonempty list of distinct paths',
      );
    definition.fields.forEach(pathParts);
    if (definition.unique && !this.client.runInTransaction)
      throw new DocumentEngineError(
        'Unique indexes require transactional storage',
        'UNSUPPORTED_CAPABILITY',
      );
    if (!this.client.runInTransaction && !options.quiescent)
      throw new DocumentEngineError(
        'Pause writers and pass quiescent: true to build an index on nontransactional storage',
        'QUIESCENCE_REQUIRED',
      );
    const max = positive(options.maxScan ?? 10000, 'maxScan');
    return this.transaction(async () => {
      const index: ResourceIndex = { ...definition, name, state: 'building' };
      const key = `${this.definitions}${name}.json`;
      const existing = await this.read<ResourceIndex>(key);
      if (existing) {
        if (
          !isDeepStrictEqual(existing.fields, definition.fields) ||
          !!existing.unique !== !!definition.unique ||
          !!existing.sparse !== !!definition.sparse
        )
          throw new DocumentEngineError(
            'Index definition differs from persisted definition',
            'INDEX_EXISTS',
          );
        if (existing.state === 'ready') return existing;
      } else await this.write(key, index, '*');
      for await (const documentKey of this.keys(`${this.root}data/`, max)) {
        const id = documentKey.slice(documentKey.lastIndexOf('/id=') + 4);
        await this.addIndexEntry(index, await this.resource.get(id));
      }
      index.state = 'ready';
      await this.write(key, index);
      return index;
    });
  }
  async dropIndex(
    name: string,
    options: { quiescent?: boolean } = {},
  ): Promise<void> {
    validName(name);
    if (!this.client.runInTransaction && !options.quiescent)
      throw new DocumentEngineError(
        'Pause writers before dropping an index',
        'QUIESCENCE_REQUIRED',
      );
    await this.transaction(async () => {
      await this.client.deleteObject(`${this.definitions}${name}.json`);
      await this.client.deleteAll({ prefix: `${this.root}index=${name}/` });
    });
  }
  async findIndexedDocuments(
    equalities: Record<string, unknown>,
    maxScan: number,
  ): Promise<ResourceData[] | null> {
    const candidates = (await this.listIndexes())
      .filter(
        (i) =>
          i.state === 'ready' &&
          i.fields.every(
            (f) =>
              Object.hasOwn(equalities, f) &&
              (equalities[f] == null ||
                equalities[f] instanceof Date ||
                ['string', 'number', 'boolean'].includes(typeof equalities[f])),
          ) &&
          !(i.sparse && i.fields.some((f) => equalities[f] == null)),
      )
      .sort((a, b) => b.fields.length - a.fields.length);
    const index = candidates[0];
    if (!index) return null;
    const equalityDocument: Record<string, unknown> = { id: '' };
    for (const field of index.fields)
      setField(equalityDocument, field, equalities[field]);
    const key = this.indexKey({ ...index, unique: true }, equalityDocument)!;
    const result: ResourceData[] = [];
    const load = async (entryKey: string) => {
      const entry = await this.read<{ id: string }>(entryKey);
      if (entry) {
        const doc = await this.resource.getOrNull(entry.id);
        if (doc && this.indexKey({ ...index, unique: true }, doc) === key)
          result.push(doc);
      }
    };
    if (index.unique) await load(key);
    else
      for await (const entry of this.keys(`${key}/`, maxScan))
        await load(entry);
    return result;
  }
  async writeDocument<T>(
    id: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const nested = this.client.isInTransaction?.() === true;
    return this.transaction(async () => {
      const indexes = await this.listIndexes();
      if (nested && indexes.some((i) => i.unique))
        throw new DocumentEngineError(
          'Unique-index writes must own their transaction; nested transactions lack rollback isolation',
          'UNSUPPORTED_CAPABILITY',
        );
      if (!indexes.length) return fn();
      if (indexes.some((i) => i.unique) && !this.client.runInTransaction)
        throw new DocumentEngineError(
          'Persisted unique indexes require transactional storage',
          'UNSUPPORTED_CAPABILITY',
        );
      const before = id ? await this.resource.getOrNull(id) : null;
      const journalKey = `${this.root}meta/index-journal/${randomUUID()}.json`;
      if (!this.client.runInTransaction)
        await this.write(journalKey, { id, operation: 'write' });
      const result = await fn();
      if (
        result &&
        typeof result === 'object' &&
        'success' in result &&
        !(result as { success: boolean }).success
      ) {
        if (!this.client.runInTransaction)
          await this.client.deleteObject(journalKey);
        return result;
      }
      const finalId = id ?? (result as { id?: string })?.id;
      const after = finalId ? await this.resource.getOrNull(finalId) : null;
      for (const index of indexes) {
        if (after) await this.addIndexEntry(index, after);
        const oldKey = before ? this.indexKey(index, before) : null;
        const newKey = after ? this.indexKey(index, after) : null;
        if (oldKey && oldKey !== newKey) await this.client.deleteObject(oldKey);
      }
      if (!this.client.runInTransaction)
        await this.client.deleteObject(journalKey);
      return result;
    });
  }
  private requireDocumentRevision(): void {
    if (
      !this.client.runInTransaction &&
      this.resource.behavior !== 'body-only' &&
      !this.client.capabilities?.etagIncludesMetadata
    )
      throw new DocumentEngineError(
        'Metadata mutations require transactional storage or an adapter whose ETags include metadata; use body-only storage otherwise',
        'UNSUPPORTED_CAPABILITY',
      );
  }
  async mutate(
    id: string,
    transform: (
      data: ResourceData,
    ) => Record<string, unknown> | Promise<Record<string, unknown>>,
    options: { retries?: number } = {},
  ): Promise<ResourceData> {
    this.requireDocumentRevision();
    const retries = options.retries ?? 5;
    if (!Number.isSafeInteger(retries) || retries < 0 || retries > 100)
      throw new TypeError('retries must be an integer between 0 and 100');
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.writeDocument(id, async () => {
          const current = await this.resource.get(id);
          if (typeof current._etag !== 'string' || !current._etag)
            throw new DocumentEngineError(
              'Mutation requires an ETag',
              'UNSUPPORTED_CAPABILITY',
            );
          const next = await transform(structuredClone(current));
          if (
            !next ||
            typeof next !== 'object' ||
            Array.isArray(next) ||
            (next.id !== undefined && next.id !== id)
          )
            throw new TypeError(
              'Mutation must return a document with the same ID',
            );
          return this.replaceStored(id, documentPayload(next), {
            ifMatch: current._etag,
            preserveContent: true,
          });
        });
      } catch (error) {
        const e = error as {
          statusCode?: number;
          $metadata?: { httpStatusCode?: number };
          name?: string;
        };
        if (
          e.statusCode !== 412 &&
          e.$metadata?.httpStatusCode !== 412 &&
          e.name !== 'PreconditionFailed'
        )
          throw error;
        if (attempt === retries)
          throw new DocumentEngineError(
            'Mutation retries exhausted',
            'WRITE_CONFLICT',
            { id, attempts: attempt + 1 },
          );
      }
    }
    throw new Error('Unreachable');
  }
  async modify(
    id: string,
    operations: MutationOperations,
    options: { retries?: number } = {},
  ): Promise<ResourceData> {
    const paths = [
      ...Object.keys(operations.increment ?? {}),
      ...Object.keys(operations.addToSet ?? {}),
      ...Object.keys(operations.pull ?? {}),
      ...(operations.unset ?? []),
    ];
    paths.forEach((path) => {
      pathParts(path);
      if (systemFields.has(path.split('.')[0]!))
        throw new TypeError('Cannot modify system fields');
    });
    if (
      paths.some((p, i) =>
        paths.some(
          (q, j) =>
            i !== j &&
            (p === q || p.startsWith(`${q}.`) || q.startsWith(`${p}.`)),
        ),
      )
    )
      throw new TypeError('Mutation paths overlap');
    return this.mutate(
      id,
      (current) => {
        for (const [path, amount] of Object.entries(
          operations.increment ?? {},
        )) {
          const previous = fieldValue(current, path);
          if (
            typeof previous !== 'number' ||
            !Number.isFinite(previous) ||
            !Number.isFinite(amount) ||
            !Number.isFinite(previous + amount)
          )
            throw new TypeError('increment requires finite numbers');
          setField(current, path, previous + amount);
        }
        for (const [path, item] of Object.entries(operations.addToSet ?? {})) {
          const array = fieldValue(current, path);
          if (!Array.isArray(array))
            throw new TypeError('addToSet requires an array field');
          if (!array.some((v) => isDeepStrictEqual(v, item))) array.push(item);
        }
        for (const [path, item] of Object.entries(operations.pull ?? {})) {
          const array = fieldValue(current, path);
          if (!Array.isArray(array))
            throw new TypeError('pull requires an array field');
          setField(
            current,
            path,
            array.filter((v) => !isDeepStrictEqual(v, item)),
          );
        }
        for (const path of operations.unset ?? []) {
          const parts = pathParts(path),
            parent =
              parts.length === 1
                ? current
                : fieldValue(current, parts.slice(0, -1).join('.'));
          if (parent && typeof parent === 'object')
            delete (parent as Record<string, unknown>)[parts.at(-1)!];
        }
        return current;
      },
      options,
    );
  }
  async repairPartitions(
    options: { repair?: boolean; quiescent?: boolean; maxScan?: number } = {},
  ): Promise<PartitionIntegrityReport> {
    if (options.repair && !this.client.runInTransaction && !options.quiescent)
      throw new DocumentEngineError(
        'Pause writers before repairing partitions',
        'QUIESCENCE_REQUIRED',
      );
    return this.transaction(async () => {
      const max = positive(options.maxScan ?? 10000, 'maxScan');
      const expected = new Set<string>();
      let documents = 0;
      for await (const key of this.keys(`${this.root}data/`, max)) {
        const document = await this.resource.get(
          key.slice(key.lastIndexOf('/id=') + 4),
        );
        documents++;
        for (const name of Object.keys(this.resource.config.partitions)) {
          const reference = this.resource.getPartitionKey({
            partitionName: name,
            id: document.id,
            data: document,
          });
          if (reference) expected.add(reference);
        }
      }
      const actual = new Set<string>();
      for await (const key of this.keys(
        `${this.root}partition=`,
        max * Math.max(1, Object.keys(this.resource.config.partitions).length),
      ))
        actual.add(key);
      const missing = [...expected].filter((k) => !actual.has(k)),
        stale = [...actual].filter((k) => !expected.has(k));
      if (options.repair) {
        for (const key of missing)
          await this.client.putObject({
            key,
            body: '',
            metadata: { _v: String(this.resource.version) },
          });
        for (const key of stale) await this.client.deleteObject(key);
      }
      return { documents, missing, stale, repaired: !!options.repair };
    });
  }
  async repairIndexes(
    options: { quiescent?: boolean; maxScan?: number } = {},
  ): Promise<{ entries: number; journalsCleared: number }> {
    if (!this.client.runInTransaction && !options.quiescent)
      throw new DocumentEngineError(
        'Pause writers before repairing indexes',
        'QUIESCENCE_REQUIRED',
      );
    return this.transaction(async () => {
      const indexes = await this.listIndexes(),
        max = positive(options.maxScan ?? 10000, 'maxScan');
      if (indexes.some((i) => i.unique) && !this.client.runInTransaction)
        throw new DocumentEngineError(
          'Unique indexes require transactional storage',
          'UNSUPPORTED_CAPABILITY',
        );
      // Finish scanning before changing any entries so scan/read failures preserve indexes.
      const documents: ResourceData[] = [];
      for await (const key of this.keys(`${this.root}data/`, max))
        documents.push(
          await this.resource.get(key.slice(key.lastIndexOf('/id=') + 4)),
        );
      let entries = 0;
      for (const index of indexes) {
        if (index.unique) {
          const seen = new Set<string>();
          for (const document of documents) {
            const key = this.indexKey(index, document);
            if (key && seen.has(key))
              throw new DocumentEngineError(
                'Duplicate values prevent index repair',
                'UNIQUE_CONSTRAINT',
              );
            if (key) seen.add(key);
          }
        }
        await this.write(`${this.definitions}${index.name}.json`, {
          ...index,
          state: 'building',
        });
        await this.client.deleteAll({
          prefix: `${this.root}index=${index.name}/`,
        });
        for (const document of documents) {
          await this.addIndexEntry(index, document);
          entries++;
        }
        await this.write(`${this.definitions}${index.name}.json`, {
          ...index,
          state: 'ready',
        });
      }
      let journalsCleared = 0;
      for await (const key of this.keys(
        `${this.root}meta/index-journal/`,
        max,
      )) {
        await this.client.deleteObject(key);
        journalsCleared++;
      }
      return { entries, journalsCleared };
    });
  }
  async migrate(options: MigrationOptions): Promise<MigrationReport> {
    validName(options.name);
    this.requireDocumentRevision();
    const batchSize = positive(options.batchSize ?? 100, 'batchSize');
    const maxBatches = positive(options.maxBatches ?? 100, 'maxBatches');
    const root = `${this.root}meta/migrations/${options.name}/`,
      stateKey = `${root}state.json`;
    const lockKey = `${root}lock.json`;
    // A durable lock prevents two runners from applying the same migration. A crashed
    // runner requires explicit operator recovery; never steal a live runner's lock.
    try {
      await this.write(lockKey, { startedAt: new Date().toISOString() }, '*');
    } catch (error) {
      const e = error as {
        statusCode?: number;
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        e.statusCode === 412 ||
        e.name === 'PreconditionFailed' ||
        e.$metadata?.httpStatusCode === 412
      )
        throw new DocumentEngineError(
          'Migration is already running or requires lock recovery',
          'MIGRATION_LOCKED',
        );
      throw error;
    }
    try {
      const report = (await this.read<MigrationReport>(stateKey)) ?? {
        name: options.name,
        cursor: null,
        processed: 0,
        migrated: 0,
        failures: [],
        complete: false,
      };
      // Per-document journals are authoritative if a crash happened before the batch checkpoint.
      let completed = 0;
      for await (const key of this.keys(`${root}documents/`, 100000)) {
        if ((await this.read<{ done: boolean }>(key))?.done) completed++;
      }
      report.processed = completed;
      report.migrated = completed;
      if (report.complete) return report;
      report.failures = [];
      for (let batch = 0; batch < maxBatches; batch++) {
        const page = await this.client.listObjects({
          prefix: `${this.root}data/`,
          maxKeys: batchSize,
          continuationToken: report.cursor,
        });
        for (const item of page.Contents || []) {
          const id = item.Key.slice(item.Key.lastIndexOf('/id=') + 4),
            journalKey = `${root}documents/${digest(id)}.json`;
          try {
            const changed = await this.writeDocument(id, async () => {
              const current = await this.resource.get(id);
              const journal = await this.read<{
                sourceETag: string;
                targetHash: string;
                done: boolean;
              }>(journalKey);
              if (journal?.done) return false;
              if (
                journal &&
                digest(documentPayload(current)) === journal.targetHash
              ) {
                await this.write(journalKey, { ...journal, done: true });
                return true;
              }
              if (journal && journal.sourceETag !== current._etag)
                throw new DocumentEngineError(
                  'Document changed during migration',
                  'WRITE_CONFLICT',
                );
              if (typeof current._etag !== 'string')
                throw new DocumentEngineError(
                  'Migration requires conditional writes',
                  'UNSUPPORTED_CAPABILITY',
                );
              const transformed = await options.transform(
                structuredClone(current),
              );
              if (
                !transformed ||
                typeof transformed !== 'object' ||
                Array.isArray(transformed) ||
                (transformed.id !== undefined && transformed.id !== id)
              )
                throw new TypeError(
                  'Migration must return a document with the same ID',
                );
              const validation = await this.resource.validate(
                { ...documentPayload(transformed), id },
                { includeId: true },
              );
              if (!validation.isValid)
                throw new DocumentEngineError(
                  'Migrated document failed schema validation',
                  'MIGRATION_VALIDATION',
                  { id },
                );
              const next = documentPayload(validation.data);
              const pending = {
                sourceETag: current._etag,
                targetHash: digest(next),
                done: false,
              };
              if (journal && pending.targetHash !== journal.targetHash)
                throw new DocumentEngineError(
                  'Migration transform changed between attempts',
                  'MIGRATION_CHANGED',
                );
              await this.write(journalKey, pending);
              await this.replaceStored(id, next, {
                ifMatch: current._etag,
                preserveContent: true,
              });
              await this.write(journalKey, { ...pending, done: true });
              return true;
            });
            if (changed) {
              report.processed++;
              report.migrated++;
            }
          } catch (error) {
            report.failures.push({ id, message: (error as Error).message });
            // Do not advance the cursor past a failed batch; completed journals skip
            // earlier documents on resume. No plaintext document is stored in journals.
            await this.write(stateKey, report);
            return report;
          }
        }
        report.failures = [];
        report.cursor = page.IsTruncated
          ? (page.NextContinuationToken ?? null)
          : null;
        if (page.IsTruncated && !report.cursor)
          throw new DocumentEngineError(
            'Storage omitted continuation token',
            'INVALID_CURSOR',
          );
        report.complete = !page.IsTruncated;
        await this.write(stateKey, report);
        if (report.complete) break;
      }
      return report;
    } finally {
      await this.client.deleteObject(lockKey);
    }
  }
  async recoverMigrationLock(
    name: string,
    options: { runnerStopped: true },
  ): Promise<void> {
    validName(name);
    if (options.runnerStopped !== true)
      throw new TypeError('Confirm the previous runner has stopped');
    await this.client.deleteObject(
      `${this.root}meta/migrations/${name}/lock.json`,
    );
  }
}
