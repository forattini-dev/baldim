import { afterEach, describe, expect, it, vi } from 'vitest';
import BaldinDefault, {
  Baldin,
  BuckieDB,
  Database,
  S3db,
  StorageError,
  S3dbError,
  decode,
  encode,
} from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';

describe('@baldin/core public API', () => {
  const databases: Database[] = [];

  afterEach(async () => {
    for (const database of databases.splice(0)) {
      if (database.isConnected()) await database.disconnect();
    }
    MemoryClient.clearAllStorage();
    vi.unstubAllEnvs();
  });

  it('exports Baldin as the primary and default database class', () => {
    expect(BaldinDefault).toBe(Baldin);
    expect(new Baldin({ connectionString: 'memory://api-test', logLevel: 'silent' })).toBeInstanceOf(Database);
  });

  it('keeps the old public names as migration aliases', () => {
    expect(new BuckieDB({ connectionString: 'memory://name-compat', logLevel: 'silent' })).toBeInstanceOf(Baldin);
    expect(new S3db({ connectionString: 'memory://compat-test', logLevel: 'silent' })).toBeInstanceOf(Baldin);
  });

  it('keeps the canonical storage error compatible with the old class name', () => {
    const error = new StorageError('provider failed', {
      original: { name: 'ProviderFailure', message: 'low-level failure' },
    });

    expect(error).toBeInstanceOf(S3dbError);
    expect(error.providerMessage).toBe('low-level failure');
    expect(error.awsMessage).toBe('low-level failure');
  });

  it('prefers BALDIN environment settings and accepts S3DB fallbacks', () => {
    vi.stubEnv('BALDIN_LOG_LEVEL', 'error');
    vi.stubEnv('S3DB_LOG_LEVEL', 'debug');
    vi.stubEnv('BALDIN_DISABLE_CRON', 'true');
    vi.stubEnv('S3DB_DISABLE_CRON', 'false');

    const database = new Baldin({
      connectionString: 'memory://environment-test',
      exitOnSignal: false,
    });
    expect(database.logger.level).toBe('error');
    expect(database.cronManager.disabled).toBe(true);
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
