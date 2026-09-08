import { afterEach, describe, expect, it } from 'vitest';
import BuckieDBDefault, {
  BuckieDB,
  Database,
  MemoryClient,
  S3db,
  decode,
  encode,
} from '@buckiedb/core';

describe('@buckiedb/core public API', () => {
  const databases: Database[] = [];

  afterEach(async () => {
    for (const database of databases.splice(0)) {
      if (database.isConnected()) await database.disconnect();
    }
    MemoryClient.clearAllStorage();
  });

  it('exports BuckieDB as the primary and default database class', () => {
    expect(BuckieDBDefault).toBe(BuckieDB);
    expect(new BuckieDB({ connectionString: 'memory://api-test', logLevel: 'silent' })).toBeInstanceOf(Database);
  });

  it('keeps the old S3db class as a migration alias', () => {
    expect(new S3db({ connectionString: 'memory://compat-test', logLevel: 'silent' })).toBeInstanceOf(BuckieDB);
  });

  it('performs a document lifecycle through the memory client', async () => {
    const database = new BuckieDB({
      connectionString: 'memory://buckiedb-tests/documents',
      logLevel: 'silent',
    });
    databases.push(database);
    await database.connect();

    const notes = await database.createResource({
      name: 'notes',
      attributes: { title: 'string', done: 'boolean' },
    });
    const inserted = await notes.insert({ id: 'first', title: 'Ship BuckieDB', done: false });
    expect(inserted.id).toBe('first');
    expect(await notes.get('first')).toMatchObject({ title: 'Ship BuckieDB', done: false });

    await notes.update('first', { done: true });
    expect(await notes.get('first')).toMatchObject({ done: true });

    await notes.delete('first');
    await expect(notes.get('first')).rejects.toThrow();
  });

  it('preserves the numeric metadata codec', () => {
    expect(encode(62)).toBe('10');
    expect(decode('10')).toBe(62);
  });
});
