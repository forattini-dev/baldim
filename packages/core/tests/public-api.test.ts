import { afterEach, describe, expect, it } from 'vitest';
import BaldinDefault, {
  Baldin,
  BuckieDB,
  Database,
  MemoryClient,
  S3db,
  decode,
  encode,
} from '@baldin/core';

describe('@baldin/core public API', () => {
  const databases: Database[] = [];

  afterEach(async () => {
    for (const database of databases.splice(0)) {
      if (database.isConnected()) await database.disconnect();
    }
    MemoryClient.clearAllStorage();
  });

  it('exports Baldin as the primary and default database class', () => {
    expect(BaldinDefault).toBe(Baldin);
    expect(new Baldin({ connectionString: 'memory://api-test', logLevel: 'silent' })).toBeInstanceOf(Database);
  });

  it('keeps the old public names as migration aliases', () => {
    expect(new BuckieDB({ connectionString: 'memory://name-compat', logLevel: 'silent' })).toBeInstanceOf(Baldin);
    expect(new S3db({ connectionString: 'memory://compat-test', logLevel: 'silent' })).toBeInstanceOf(Baldin);
  });

  it('performs a document lifecycle through the memory client', async () => {
    const database = new Baldin({
      connectionString: 'memory://baldin-tests/documents',
      logLevel: 'silent',
    });
    databases.push(database);
    await database.connect();

    const notes = await database.createResource({
      name: 'notes',
      attributes: { title: 'string', done: 'boolean' },
    });
    const inserted = await notes.insert({ id: 'first', title: 'Ship Baldin', done: false });
    expect(inserted.id).toBe('first');
    expect(await notes.get('first')).toMatchObject({ title: 'Ship Baldin', done: false });

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
