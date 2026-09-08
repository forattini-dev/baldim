import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseError, DatabaseManager, MemoryClient } from '@buckiedb/core';

describe('DatabaseManager public API', () => {
  let manager: DatabaseManager | undefined;

  afterEach(async () => {
    if (manager?.isConnected()) await manager.disconnect();
    MemoryClient.clearAllStorage();
  });

  it('connects named databases and routes resources between them', async () => {
    manager = new DatabaseManager({
      default: 'primary',
      defaults: {
        logLevel: 'silent',
        deferMetadataWrites: true,
        exitOnSignal: false,
      },
      connections: {
        primary: { connectionString: 'memory://manager-primary' },
        analytics: { connectionString: 'memory://manager-analytics' },
      },
    });

    await manager.connect();

    const users = await manager.createResource({
      name: 'users',
      attributes: { name: 'string' },
    });
    const events = await manager.createResource({
      connection: 'analytics',
      name: 'events',
      attributes: { type: 'string' },
    });

    await users.insert({ id: 'user-1', name: 'Ada' });
    await events.insert({ id: 'event-1', type: 'signed-in' });

    expect(manager.connectionNames).toEqual(['primary', 'analytics']);
    expect(manager.defaultConnection).toBe(manager.connection('primary'));
    expect(manager.getConnectionForResource('users')).toBe('primary');
    expect(manager.getConnectionForResource('events')).toBe('analytics');
    expect(await manager.resource('users').get('user-1')).toMatchObject({ name: 'Ada' });
    expect(await manager.resource('events').get('event-1')).toMatchObject({ type: 'signed-in' });
  });

  it('rejects duplicate resource names across databases', async () => {
    manager = new DatabaseManager({
      defaults: { logLevel: 'silent', deferMetadataWrites: true, exitOnSignal: false },
      connections: {
        first: { connectionString: 'memory://manager-first' },
        second: { connectionString: 'memory://manager-second' },
      },
    });
    await manager.connect();

    await manager.createResource({
      name: 'items',
      attributes: { title: 'string' },
      connection: 'first',
    });
    await expect(
      manager.createResource({
        name: 'items',
        attributes: { title: 'string' },
        connection: 'second',
      }),
    ).rejects.toBeInstanceOf(DatabaseError);
  });

  it('requires at least one named connection', () => {
    expect(() => new DatabaseManager({ connections: {} })).toThrow(DatabaseError);
  });
});
