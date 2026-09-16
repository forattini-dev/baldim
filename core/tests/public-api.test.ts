import { afterEach, describe, expect, it, vi } from 'vitest';
import BaldimDefault, {
  Baldim,
  CronManager,
  createCronManager,
  Database,
  StorageError,
  decode,
  encode,
} from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';

describe('@baldim/core public API', () => {
  const databases: Database[] = [];

  afterEach(async () => {
    for (const database of databases.splice(0)) {
      if (database.isConnected()) await database.disconnect();
    }
    MemoryClient.clearAllStorage();
    vi.unstubAllEnvs();
  });

  it('exports Baldim as the primary and default database class', () => {
    expect(BaldimDefault).toBe(Baldim);
    expect(new Baldim({ connectionString: 'memory://api-test', logLevel: 'silent' })).toBeInstanceOf(Database);
  });

  it('exports lifecycle managers from the core entry point', () => {
    const manager = createCronManager({ disabled: true, exitOnSignal: false, logLevel: 'silent' });
    expect(manager).toBeInstanceOf(CronManager);
    manager.removeSignalHandlers();
  });

  it('maps provider failures to providerMessage', () => {
    const error = new StorageError('provider failed', {
      original: { name: 'ProviderFailure', message: 'low-level failure' },
    });

    expect(error).toBeInstanceOf(StorageError);
    expect(error.providerMessage).toBe('low-level failure');
  });

  it('reads BALDIM environment settings', () => {
    vi.stubEnv('BALDIM_LOG_LEVEL', 'error');
    vi.stubEnv('BALDIM_DISABLE_CRON', 'true');

    const database = new Baldim({
      connectionString: 'memory://environment-test',
      exitOnSignal: false,
    });
    expect(database.logger.level).toBe('error');
    expect(database.cronManager.disabled).toBe(true);
  });

  it('performs a document lifecycle through the memory client', async () => {
    const database = new Baldim({
      connectionString: 'memory://baldim-tests/documents',
      logLevel: 'silent',
    });
    databases.push(database);
    await database.connect();

    const notes = await database.createResource({
      name: 'notes',
      attributes: { title: 'string', done: 'boolean' },
    });
    const inserted = await notes.insert({ id: 'first', title: 'Ship Baldim', done: false });
    expect(inserted.id).toBe('first');
    expect(await notes.get('first')).toMatchObject({ title: 'Ship Baldim', done: false });

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
