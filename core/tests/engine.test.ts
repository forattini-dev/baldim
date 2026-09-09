import { afterEach, describe, expect, it, vi } from 'vitest';
import { Baldin, Database } from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';

const databases: Database[] = [];
let sequence = 0;

async function createDatabase(label: string): Promise<Baldin> {
  const database = new Baldin({
    connectionString: `memory://engine-${label}-${++sequence}`,
    logLevel: 'silent',
    exitOnSignal: false,
  });
  databases.push(database);
  await database.connect();
  return database;
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    if (database.isConnected()) await database.disconnect();
  }
  MemoryClient.clearAllStorage();
});

describe('Baldin core engine', () => {
  it('validates writes without leaving a rejected document behind', async () => {
    const database = await createDatabase('validation');
    const people = await database.createResource({
      name: 'people',
      timestamps: false,
      attributes: {
        name: 'string|required|minlength:2',
        age: 'number|required|min:0',
        email: 'email|required',
      },
    });

    await expect(people.insert({ id: 'invalid', name: 'A', age: -1, email: 'bad' }))
      .rejects.toMatchObject({ statusCode: 422, retriable: false });
    expect(await people.listIds()).toEqual([]);
  });

  it('forwards skipCache from Resource.count to the query engine', async () => {
    const database = await createDatabase('count-skip-cache');
    const items = await database.createResource({
      name: 'count_items',
      timestamps: false,
      attributes: { name: 'string|required' },
    });
    await items.insert({ id: 'one', name: 'One' });

    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    (items as unknown as { cache: typeof cache }).cache = cache;

    expect(await items.count()).toBe(1);
    expect(cache.get).toHaveBeenCalledOnce();
    expect(cache.set).toHaveBeenCalledOnce();

    cache.get.mockClear();
    cache.set.mockClear();
    expect(await items.count({ skipCache: true })).toBe(1);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('moves partition indexes when a partition field changes', async () => {
    const database = await createDatabase('partitions');
    const users = await database.createResource({
      name: 'users',
      timestamps: false,
      asyncPartitions: false,
      attributes: { name: 'string|required', region: 'string|required' },
      partitions: { byRegion: { fields: { region: 'string' } } },
    });
    await users.insert({ id: 'ana', name: 'Ana', region: 'BR' });
    expect(await users.listIds({ partition: 'byRegion', partitionValues: { region: 'BR' } }))
      .toEqual(['ana']);

    await users.update('ana', { region: 'US' });
    expect(await users.listIds({ partition: 'byRegion', partitionValues: { region: 'BR' } }))
      .toEqual([]);
    expect(await users.listIds({ partition: 'byRegion', partitionValues: { region: 'US' } }))
      .toEqual(['ana']);
  });

  it('keeps similarly named partition namespaces isolated during updates', async () => {
    const database = await createDatabase('partition-prefixes');
    const jobs = await database.createResource({
      name: 'jobs',
      timestamps: false,
      asyncPartitions: false,
      attributes: {
        account: 'string|required',
        active: 'boolean|required',
      },
      partitions: {
        byAccount: { fields: { account: 'string' } },
        byAccountAndActive: { fields: { account: 'string', active: 'boolean' } },
      },
    });

    await jobs.insert({ id: 'job-1', account: 'acme', active: false });
    await jobs.update('job-1', { active: true });

    expect(await jobs.listIds({
      partition: 'byAccount',
      partitionValues: { account: 'acme' },
    })).toEqual(['job-1']);
    expect(await jobs.listIds({
      partition: 'byAccountAndActive',
      partitionValues: { account: 'acme', active: true },
    })).toEqual(['job-1']);
    expect(await jobs.listIds({
      partition: 'byAccountAndActive',
      partitionValues: { account: 'acme', active: false },
    })).toEqual([]);
  });

  it('stores typed nested values with the body-only behavior', async () => {
    const database = await createDatabase('body-only');
    const records = await database.createResource({
      name: 'records',
      behavior: 'body-only',
      timestamps: false,
      attributes: {
        title: 'string|required',
        tags: { type: 'array', items: 'string' },
        settings: { type: 'object' },
      },
    });
    await records.insert({
      id: 'typed',
      title: 'Typed body',
      tags: ['one', 'two'],
      settings: { enabled: true, retries: 3 },
    });

    expect(await records.get('typed')).toMatchObject({
      tags: ['one', 'two'],
      settings: { enabled: true, retries: 3 },
    });
  });

  it('restores resource definitions and documents on reconnect', async () => {
    const connectionString = `memory://engine-reconnect-${++sequence}`;
    const first = new Baldin({ connectionString, logLevel: 'silent', exitOnSignal: false });
    databases.push(first);
    await first.connect();
    const notes = await first.createResource({
      name: 'notes',
      timestamps: false,
      attributes: { title: 'string|required', pinned: 'boolean|required' },
    });
    await notes.insert({ id: 'one', title: 'Persisted definition', pinned: true });
    await first.disconnect();

    const reopened = new Baldin({ connectionString, logLevel: 'silent', exitOnSignal: false });
    databases.push(reopened);
    await reopened.connect();
    expect(Object.keys(reopened.resources)).toEqual(['notes']);
    expect(await reopened.resources.notes.get('one')).toMatchObject({
      title: 'Persisted definition',
      pinned: true,
    });
  });

  it('stores, reads, and removes binary content independently of attributes', async () => {
    const database = await createDatabase('content');
    const assets = await database.createResource({
      name: 'assets',
      timestamps: false,
      attributes: { name: 'string|required' },
    });
    await assets.insert({ id: 'logo', name: 'logo.txt' });
    const payload = Buffer.from('baldin-content');
    await assets.setContent({ id: 'logo', buffer: payload, contentType: 'text/plain' });

    expect(await assets.hasContent('logo')).toBe(true);
    const content = await assets.content('logo');
    expect(content.buffer.equals(payload)).toBe(true);
    expect(content.contentType).toBe('text/plain');
    expect(await assets.get('logo')).toMatchObject({ name: 'logo.txt' });

    await assets.deleteContent('logo');
    expect(await assets.hasContent('logo')).toBe(false);
    expect(await assets.get('logo')).toMatchObject({ name: 'logo.txt' });
  });
});
