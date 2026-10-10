import { afterEach, describe, expect, it, vi } from 'vitest';
import { Baldim, compareSchemas, type Resource } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import { SqliteClient } from '../../adapters/sqlite/src/sqlite-client.class.js';
const databases: Baldim[] = [];
let seq = 0;
async function setup() {
  const db = new Baldim({
    connectionString: `memory://document-engine-${++seq}`,
    logLevel: 'silent',
    exitOnSignal: false,
  });
  databases.push(db);
  await db.connect();
  const items = await db.createResource({
    name: 'items',
    behavior: 'body-only',
    asyncPartitions: false,
    attributes: {
      name: 'string|required',
      score: 'number|required',
      group: 'string|required',
      tags: { type: 'array', items: 'string' },
      note: 'string|optional',
    },
    partitions: { byGroup: { fields: { group: 'string' } } },
  });
  return { db, items };
}
afterEach(async () => {
  for (const db of databases.splice(0)) await db.disconnect();
  MemoryClient.clearAllStorage();
});
describe('document queries', () => {
  it('combines predicates, nested logic, ordering and projection', async () => {
    const { items } = await setup();
    await items.insertMany([
      { id: 'a', name: 'A', score: 1, group: 'one', tags: [] },
      { id: 'b', name: 'B', score: 4, group: 'two', tags: [] },
      { id: 'c', name: 'C', score: 8, group: 'one', tags: [], note: 'yes' },
    ]);
    expect(
      await items.query(
        {
          $and: [
            { score: { $gte: 2 } },
            { $or: [{ group: 'one' }, { score: { $in: [4] } }] },
          ],
        },
        { orderBy: { score: 'desc' }, select: ['name'] },
      ),
    ).toEqual([
      { id: 'c', name: 'C' },
      { id: 'b', name: 'B' },
    ]);
    expect(
      (await items.query({ note: { $exists: false }, score: { $lt: 5 } })).map(
        (x) => x.id,
      ),
    ).toEqual(['a', 'b']);
    expect(
      (await items.query({ $not: { score: { $lte: 4 } } })).map((x) => x.id),
    ).toEqual(['c']);
  });
  it('applies offset to matching rows and enforces a complete scan for ordering', async () => {
    const { items } = await setup();
    for (let i = 0; i < 8; i++)
      await items.insert({
        id: `id-${i}`,
        name: `N${i}`,
        score: i,
        group: i % 2 ? 'odd' : 'even',
        tags: [],
      });
    expect(
      (await items.query({ score: { $gte: 3 } }, { offset: 2, limit: 2 })).map(
        (x) => x.score,
      ),
    ).toEqual([5, 6]);
    expect(
      (
        await items.query(
          { group: { $eq: 'odd' } },
          { orderBy: { score: 'desc' }, limit: 2 },
        )
      ).map((x) => x.score),
    ).toEqual([7, 5]);
    await expect(
      items.query({}, { orderBy: { score: 'asc' }, maxScan: 3 }),
    ).rejects.toThrow('scan limit');
    await expect(items.query({ score: { $what: 2 } } as never)).rejects.toThrow(
      'Unknown field',
    );
    await expect(
      items.query({}, { select: ['__proto__.polluted'] } as never),
    ).rejects.toThrow('Invalid document path');
  });
});
describe('document concurrency', () => {
  it('retries ETag conflicts without dropping concurrent increments', async () => {
    const { items } = await setup();
    await items.insert({
      id: 'a',
      name: 'A',
      score: 0,
      group: 'one',
      tags: [],
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        items.modify('a', { increment: { score: 1 } }, { retries: 30 }),
      ),
    );
    expect((await items.get('a')).score).toBe(10);
    await items.modify('a', { addToSet: { tags: 'one' } });
    await items.modify('a', { addToSet: { tags: 'one' } });
    expect((await items.get('a')).tags).toEqual(['one']);
    await items.modify('a', { pull: { tags: 'one' } });
    expect((await items.get('a')).tags).toEqual([]);
  });
  it('removes fields with a full conditional replacement and rejects stale ETags', async () => {
    const { items } = await setup();
    const before = await items.insert({
      id: 'a',
      name: 'A',
      score: 0,
      group: 'one',
      tags: [],
      note: 'remove',
    });
    await items.modify('a', { unset: ['note'] });
    expect((await items.get('a')).note).toBeUndefined();
    await expect(
      items.replace(
        'a',
        { name: 'Old', score: 0, group: 'one', tags: [] },
        { ifMatch: before._etag },
      ),
    ).rejects.toMatchObject({ statusCode: 412 });
  });
});
describe('index lifecycle and recovery', () => {
  it('persists and maintains composite sparse indexes across CRUD and reconnects', async () => {
    const { db, items } = await setup();
    await items.createIndex(
      'group_score',
      { fields: ['group', 'score'], sparse: true },
      { quiescent: true },
    );
    await items.insert({
      id: 'a',
      name: 'A',
      score: 1,
      group: 'one',
      tags: [],
    });
    await items.insert({
      id: 'b',
      name: 'B',
      score: 2,
      group: 'two',
      tags: [],
    });
    expect(
      (await items.query({ group: 'one', score: 1 })).map((x) => x.id),
    ).toEqual(['a']);
    await items.update('a', { group: 'two' });
    expect(await items.query({ group: 'one', score: 1 })).toEqual([]);
    expect(
      (await items.query({ group: 'two', score: 1 })).map((x) => x.id),
    ).toEqual(['a']);
    await db.disconnect();
    await db.connect();
    const reopened = await db.getResource('items');
    expect((await reopened.listIndexes())[0]?.state).toBe('ready');
    await reopened.deleteMany(['a', 'b']);
    expect(await reopened.query({ group: 'two', score: 1 })).toEqual([]);
    await reopened.dropIndex('group_score', { quiescent: true });
    expect(await reopened.listIndexes()).toEqual([]);
  });
  it('refuses unsupported unique guarantees and repairs failed index writes', async () => {
    const { db, items } = await setup();
    await expect(
      items.createIndex('unique_name', { fields: ['name'], unique: true }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    await items.createIndex(
      'group',
      { fields: ['group'] },
      { quiescent: true },
    );
    const put = db.client.putObject.bind(db.client);
    const spy = vi
      .spyOn(db.client, 'putObject')
      .mockImplementation(async (args) => {
        if (args.key.includes('/index=group/'))
          throw new Error('index disk failure');
        return put(args);
      });
    await expect(
      items.insert({ id: 'a', name: 'A', score: 1, group: 'one', tags: [] }),
    ).rejects.toThrow('index disk failure');
    spy.mockRestore();
    expect(await items.exists('a')).toBe(true);
    const repaired = await items.repairIndexes({ quiescent: true });
    expect(repaired.journalsCleared).toBe(1);
    expect((await items.query({ group: 'one' })).map((x) => x.id)).toEqual([
      'a',
    ]);
  });
  it('detects missing and stale partition references and repairs them', async () => {
    const { db, items } = await setup();
    await items.insert({
      id: 'a',
      name: 'A',
      score: 1,
      group: 'one',
      tags: [],
    });
    const expected = items.getPartitionKey({
      partitionName: 'byGroup',
      id: 'a',
      data: await items.get('a'),
    })!;
    await db.client.deleteObject(expected);
    const stale = 'resource=items/partition=byGroup/group=old/id=missing';
    await db.client.putObject({ key: stale, body: '', metadata: {} });
    expect(await items.repairPartitions()).toMatchObject({
      missing: [expected],
      stale: [stale],
      repaired: false,
    });
    await items.repairPartitions({ repair: true, quiescent: true });
    expect(await items.repairPartitions()).toMatchObject({
      missing: [],
      stale: [],
    });
  });
});
describe('schema migrations', () => {
  it('classifies schema changes conservatively', () => {
    expect(
      compareSchemas(
        { old: 'string', score: 'number' },
        { score: 'string', extra: 'string|optional' },
      ),
    ).toEqual([
      { field: 'old', kind: 'removed', requiresMigration: true },
      { field: 'score', kind: 'changed', requiresMigration: true },
      { field: 'extra', kind: 'added', requiresMigration: false },
    ]);
  });
  it('resumes a failed batch without transforming completed documents again', async () => {
    const { items } = await setup();
    await items.insertMany([
      { id: 'a', name: 'A', score: 1, group: 'one', tags: [] },
      { id: 'b', name: 'B', score: 2, group: 'one', tags: [] },
      { id: 'c', name: 'C', score: 3, group: 'one', tags: [] },
    ]);
    let fail = true;
    const transform = vi.fn((doc: any) => {
      if (doc.id === 'b' && fail) throw new Error('temporary failure');
      return { ...doc, score: doc.score + 10 };
    });
    const first = await items.migrate({
      name: 'score_v2',
      batchSize: 2,
      transform,
    });
    expect(first.complete).toBe(false);
    expect(first.failures[0]?.id).toBe('b');
    fail = false;
    const last = await items.migrate({
      name: 'score_v2',
      batchSize: 2,
      transform,
    });
    expect(last.complete).toBe(true);
    expect(last.failures).toEqual([]);
    expect((await items.list()).map((x) => x.score)).toEqual([11, 12, 13]);
    expect(transform.mock.calls.filter(([doc]) => doc.id === 'a')).toHaveLength(
      1,
    );
  });
});

describe('transactional core indexes', () => {
  async function transactional() {
    const client = new SqliteClient({
      basePath: ':memory:',
      bucket: 'core-index',
      logLevel: 'silent',
    });
    const db = new Baldim({ client, logLevel: 'silent', exitOnSignal: false });
    databases.push(db);
    await db.connect();
    const items = await db.createResource({
      name: 'unique_items',
      behavior: 'body-only',
      asyncPartitions: false,
      attributes: { email: 'string|required', group: 'string|required' },
      partitions: { byGroup: { fields: { group: 'string' } } },
    });
    return { db, items };
  }
  it('allows one concurrent owner and rolls back documents and partitions on conflicts', async () => {
    const { items } = await transactional();
    await items.createIndex('email', { fields: ['email'], unique: true });
    const results = await Promise.allSettled([
      items.insert({ id: 'a', email: 'one@example.com', group: 'one' }),
      items.insert({ id: 'b', email: 'one@example.com', group: 'two' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const documents = await items.list();
    expect(documents).toHaveLength(1);
    expect((await items.repairPartitions()).stale).toEqual([]);
    await items.insert({ id: 'c', email: 'two@example.com', group: 'two' });
    await expect(
      items.update('c', { email: 'one@example.com' }),
    ).rejects.toMatchObject({ code: 'UNIQUE_CONSTRAINT' });
    expect((await items.get('c')).email).toBe('two@example.com');
    await items.delete(documents[0]!.id);
    await items.update('c', { email: 'one@example.com' });
    expect(
      (await items.query({ email: 'one@example.com' })).map((x) => x.id),
    ).toEqual(['c']);
  });
  it('isolates bulk unique conflicts and rejects nested unique writes before changing documents', async () => {
    const { db, items } = await transactional();
    await items.createIndex('email', { fields: ['email'], unique: true });
    const inserted = await items.insertMany([
      { id: 'a', email: 'same', group: 'one' },
      { id: 'b', email: 'same', group: 'two' },
      { id: 'c', email: 'other', group: 'three' },
    ]);
    expect(inserted).toHaveLength(2);
    expect(await items.list()).toHaveLength(2);
    await db.client.runInTransaction!(async () => {
      await expect(items.update('c', { email: 'same' })).rejects.toMatchObject({
        code: 'UNSUPPORTED_CAPABILITY',
      });
    });
    expect((await items.get('c')).email).toBe('other');
    await items.mutate('c', (current) => ({ ...current, group: 'changed' }));
    expect((await items.get('c')).group).toBe('changed');
    const ids = inserted.map((doc) => doc.id);
    expect(await items.deleteMany(ids)).toEqual({ deleted: 2, errors: 0 });
    expect(await items.list()).toEqual([]);
  });
  it('rolls back an index build that finds duplicates', async () => {
    const { items } = await transactional();
    await items.insertMany([
      { id: 'a', email: 'same', group: 'one' },
      { id: 'b', email: 'same', group: 'two' },
    ]);
    await expect(
      items.createIndex('email', { fields: ['email'], unique: true }),
    ).rejects.toMatchObject({ code: 'UNIQUE_CONSTRAINT' });
    expect(await items.listIndexes()).toEqual([]);
    expect(await items.list()).toHaveLength(2);
  });
});
describe('document recovery boundaries', () => {
  it('preserves binary content when mutating user-managed attributes', async () => {
    const client = new SqliteClient({
      basePath: ':memory:',
      bucket: 'content',
      logLevel: 'silent',
    });
    const db = new Baldim({ client, logLevel: 'silent', exitOnSignal: false });
    databases.push(db);
    await db.connect();
    const files = await db.createResource({
      name: 'files',
      behavior: 'user-managed',
      attributes: { score: 'number|required' },
    });
    await files.insert({ id: 'a', score: 1 });
    await files.setContent({
      id: 'a',
      buffer: Buffer.from([0, 1, 2, 255]),
      contentType: 'application/octet-stream',
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        files.modify('a', { increment: { score: 1 } }),
      ),
    );
    expect((await files.get('a')).score).toBe(11);
    expect((await files.content('a')).buffer).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
  });
  it('rejects unsafe metadata-only optimistic writes before invoking transforms', async () => {
    const { db } = await setup();
    const files = await db.createResource({
      name: 'metadata_files',
      behavior: 'user-managed',
      attributes: { score: 'number|required' },
    });
    await files.insert({ id: 'a', score: 1 });
    const transform = vi.fn((current) => ({
      ...current,
      score: current.score + 1,
    }));
    await expect(files.mutate('a', transform)).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
    });
    await expect(
      files.migrate({ name: 'unsafe', transform }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    expect(transform).not.toHaveBeenCalled();
    expect((await files.get('a')).score).toBe(1);
  });
  it('resumes after a document write succeeded but its completion journal failed', async () => {
    const { db, items } = await setup();
    await items.insert({
      id: 'a',
      name: 'A',
      score: 1,
      group: 'one',
      tags: [],
    });
    const put = db.client.putObject.bind(db.client);
    let fail = true;
    const spy = vi
      .spyOn(db.client, 'putObject')
      .mockImplementation(async (args) => {
        if (
          fail &&
          args.key.includes('/migrations/crash/documents/') &&
          String(args.body).includes('"done":true')
        ) {
          fail = false;
          throw new Error('journal write failed');
        }
        return put(args);
      });
    const transform = vi.fn((doc: any) => ({ ...doc, score: doc.score + 10 }));
    expect((await items.migrate({ name: 'crash', transform })).complete).toBe(
      false,
    );
    spy.mockRestore();
    const resumed = await items.migrate({ name: 'crash', transform });
    expect(resumed.complete).toBe(true);
    expect(resumed.migrated).toBe(1);
    expect((await items.get('a')).score).toBe(11);
    expect(transform).toHaveBeenCalledOnce();
  });
});

describe('query and migration boundaries', () => {
  it('looks up indexes on nested scalar fields', async () => {
    const { db } = await setup();
    const profiles = await db.createResource({
      name: 'profiles',
      behavior: 'body-only',
      attributes: {
        profile: { type: 'object', props: { name: 'string|required' } },
      },
    });
    await profiles.insert({ id: 'a', profile: { name: 'Ada' } });
    await profiles.insert({ id: 'b', profile: { name: 'Grace' } });
    await profiles.createIndex(
      'name',
      { fields: ['profile.name'] },
      { quiescent: true },
    );
    const lookup = vi.spyOn(profiles, 'findIndexedDocuments');
    expect(
      (await profiles.query({ 'profile.name': 'Ada' })).map((doc) => doc.id),
    ).toEqual(['a']);
    expect(lookup).toHaveBeenCalledWith({ 'profile.name': 'Ada' }, 10000);
  });

  it('does not use a composite partition when only a later field is constrained', async () => {
    const { db } = await setup();
    const docs = await db.createResource({
      name: 'composite',
      asyncPartitions: false,
      attributes: { region: 'string|required', status: 'string|required' },
      partitions: {
        byRegionStatus: { fields: { region: 'string', status: 'string' } },
      },
    });
    await docs.insertMany([
      { id: 'a', region: 'BR', status: 'open' },
      { id: 'b', region: 'US', status: 'open' },
    ]);
    expect((await docs.query({ status: 'open' })).map((x) => x.id)).toEqual([
      'a',
      'b',
    ]);
  });
  it('respects an explicit partition even when another index matches the filter', async () => {
    const { items } = await setup();
    await items.createIndex('name', { fields: ['name'] }, { quiescent: true });
    await items.insertMany([
      { id: 'a', name: 'same', score: 1, group: 'one', tags: [] },
      { id: 'b', name: 'same', score: 2, group: 'two', tags: [] },
    ]);
    expect(
      (
        await items.query(
          { name: 'same' },
          { partition: 'byGroup', partitionValues: { group: 'one' } },
        )
      ).map((x) => x.id),
    ).toEqual(['a']);
  });
  it('validates migration output and supports a renamed field under the target schema', async () => {
    const { db } = await setup();
    const old = await db.createResource({
      name: 'rename',
      behavior: 'body-only',
      attributes: { oldName: 'string|required' },
    });
    await old.insert({ id: 'a', oldName: 'Ada' });
    const next = await db.createResource({
      name: 'rename',
      behavior: 'body-only',
      attributes: { newName: 'string|required' },
    });
    const report = await next.migrate({
      name: 'rename_v2',
      transform: (doc) => ({ newName: doc.oldName }),
    });
    expect(report.complete).toBe(true);
    expect(await next.get('a')).toMatchObject({ newName: 'Ada' });
    expect((await next.get('a')) as Record<string, unknown>).not.toHaveProperty(
      'oldName',
    );
    const failed = await next.migrate({
      name: 'invalid_v3',
      transform: () => ({ newName: 42 }),
    });
    expect(failed.failures).toHaveLength(1);
    expect((await next.get('a')).newName).toBe('Ada');
  });
});

describe('administrative indexed deletion', () => {
  it('preserves paranoid protection when indexes exist', async () => {
    const { items } = await setup();
    await items.createIndex('group', { fields: ['group'] }, { quiescent: true });
    await items.insert({ id: 'a', name: 'A', score: 1, group: 'one', tags: [] });
    await expect(items.deleteAll()).rejects.toThrow('paranoid: false');
    await expect(items.deleteAllData()).rejects.toThrow('paranoid: false');
    expect((await items.get('a')).name).toBe('A');
    expect((await items.listIndexes())[0]?.state).toBe('ready');
  });

  it('distinguishes document deletion from purging definitions and auxiliary objects', async () => {
    const { db } = await setup();
    const items = await db.createResource({
      name: 'purge', paranoid: false, behavior: 'body-only',
      attributes: { group: 'string|required' },
    });
    await items.createIndex('group', { fields: ['group'] }, { quiescent: true });
    await items.insert({ id: 'a', group: 'one' });
    expect(await items.deleteAll()).toMatchObject({ deletedCount: 1 });
    expect(await items.listIndexes()).toHaveLength(1);
    expect(await items.query({ group: 'one' })).toEqual([]);
    await items.insert({ id: 'b', group: 'two' });
    expect((await items.deleteAllData()).deletedCount).toBeGreaterThan(1);
    expect(await items.listIndexes()).toEqual([]);
    expect(await items.getOrNull('b')).toBeNull();
  });
});
