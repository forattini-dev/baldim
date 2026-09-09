import { afterEach, describe, expect, it, vi } from 'vitest';
import { Baldim, DatabaseError, DatabaseManager } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';

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
    expect(manager.resources.users).toBe(users);
    expect(manager.resources.events).toBe(events);
    expect(manager.connection('analytics').resources.events).toBe(events);
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

  it('indexes resources created through a named connection', async () => {
    manager = new DatabaseManager({
      defaults: { logLevel: 'silent', deferMetadataWrites: true, exitOnSignal: false },
      connections: {
        primary: { connectionString: 'memory://manager-direct' },
      },
    });
    await manager.connect();

    await manager.connection('primary').createResource({
      name: 'direct-resource',
      attributes: { value: 'string' },
    });

    expect(manager.getConnectionForResource('direct-resource')).toBe('primary');
  });

  it('reattaches event forwarding after reconnecting', async () => {
    manager = new DatabaseManager({
      defaults: { logLevel: 'silent', deferMetadataWrites: true, exitOnSignal: false },
      connections: {
        primary: { connectionString: 'memory://manager-reconnect' },
      },
    });
    const connected = vi.fn();
    manager.on('primary:db:connected', connected);

    await manager.connect();
    await manager.disconnect();
    await manager.connect();

    expect(connected).toHaveBeenCalledTimes(2);
  });

  it('rolls back every connection when restored resources have duplicate names', async () => {
    const seed = async (connectionString: string) => {
      const database = new Baldim({
        connectionString,
        logLevel: 'silent',
        deferMetadataWrites: false,
        exitOnSignal: false,
      });
      await database.connect();
      await database.createResource({ name: 'duplicate', attributes: { value: 'string' } });
      await database.disconnect();
    };
    await seed('memory://manager-duplicate-a');
    await seed('memory://manager-duplicate-b');

    manager = new DatabaseManager({
      defaults: { logLevel: 'silent', exitOnSignal: false },
      connections: {
        first: { connectionString: 'memory://manager-duplicate-a' },
        second: { connectionString: 'memory://manager-duplicate-b' },
      },
    });

    await expect(manager.connect()).rejects.toThrow(/exists on both/);
    expect(manager.isConnected()).toBe(false);
    expect(manager.connection('first').isConnected()).toBe(false);
    expect(manager.connection('second').isConnected()).toBe(false);
  });

  it('rejects an unknown default connection during construction', () => {
    expect(() => new DatabaseManager({
      default: 'missing',
      connections: { primary: { connectionString: 'memory://manager-default' } },
    })).toThrow(/Default connection "missing" not found/);
  });

  it('reports unknown connections and resources with useful context', () => {
    manager = new DatabaseManager({
      connections: { primary: { connectionString: 'memory://manager-errors', logLevel: 'silent' } },
    });

    try {
      manager.connection('missing');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseError);
      expect((error as DatabaseError).suggestion).toBe('Available connections: primary');
    }
    try {
      manager.resource('missing');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseError);
      expect((error as DatabaseError).suggestion).toBe('Available resources: (none)');
    }
  });

  it('rolls back connected databases after a partial connection failure', async () => {
    manager = new DatabaseManager({
      defaults: { logLevel: 'silent', exitOnSignal: false },
      connections: {
        good: { connectionString: 'memory://manager-partial-good' },
        bad: { connectionString: 'unregistered://manager-partial-bad' },
      },
    });

    await expect(manager.connect()).rejects.toThrow(/Failed to connect "bad"/);
    expect(manager.connection('good').isConnected()).toBe(false);
    expect(manager.connection('bad').isConnected()).toBe(false);
    expect(manager.isConnected()).toBe(false);
  });

  it('attempts every disconnect and clears manager state when one fails', async () => {
    manager = new DatabaseManager({
      defaults: { logLevel: 'silent', exitOnSignal: false },
      connections: {
        first: { connectionString: 'memory://manager-disconnect-first' },
        second: { connectionString: 'memory://manager-disconnect-second' },
      },
    });
    await manager.connect();

    const first = manager.connection('first');
    const second = manager.connection('second');
    const originalFirstDisconnect = first.disconnect.bind(first);
    const originalSecondDisconnect = second.disconnect.bind(second);
    const firstDisconnect = vi.spyOn(first, 'disconnect').mockImplementation(async () => {
      await originalFirstDisconnect();
      throw new Error('disconnect failed');
    });
    const secondDisconnect = vi.spyOn(second, 'disconnect').mockImplementation(originalSecondDisconnect);

    await expect(manager.disconnect()).rejects.toThrow(/Failed to disconnect "first"/);
    expect(firstDisconnect).toHaveBeenCalledOnce();
    expect(secondDisconnect).toHaveBeenCalledOnce();
    expect(manager.isConnected()).toBe(false);
  });

  it('detects duplicate names created directly on separate databases', async () => {
    manager = new DatabaseManager({
      defaults: { logLevel: 'silent', deferMetadataWrites: true, exitOnSignal: false },
      connections: {
        first: { connectionString: 'memory://manager-direct-duplicate-first' },
        second: { connectionString: 'memory://manager-direct-duplicate-second' },
      },
    });
    await manager.connect();
    await manager.connection('first').createResource({ name: 'same', attributes: { value: 'string' } });
    await manager.connection('second').createResource({ name: 'same', attributes: { value: 'string' } });

    expect(() => manager!.resources).toThrow(/exists on more than one connection/);
  });

});
