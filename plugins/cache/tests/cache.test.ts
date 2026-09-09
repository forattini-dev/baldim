import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import {
  CachePlugin,
  FilesystemCache,
  MemoryCache,
  MultiTierCache,
  RedisCache,
  S3Cache,
} from '../src/index.js';

describe('@baldim/plugin-cache', () => {
  beforeEach(() => {
    MemoryClient.clearAllStorage();
  });

  test('caches reads and invalidates them after a write', async () => {
    const database = new Baldim({ connectionString: 'memory://cache-plugin', logLevel: 'silent' });
    await database.connect();
    const plugin = new CachePlugin({ driver: 'memory', logLevel: 'silent', maxMemoryBytes: 1024 * 1024 });

    try {
      await plugin.install(database);
      const users = await database.createResource({
        name: 'users',
        attributes: { name: 'string|required' },
      });
      const user = await users.insert({ name: 'Ada' });

      await users.get(user.id);
      await users.get(user.id);
      await users.get(user.id);
      expect(plugin.getStats().hits).toBeGreaterThanOrEqual(1);

      await users.update(user.id, { name: 'Grace' });
      await users.get(user.id);
      expect((await users.get(user.id))?.name).toBe('Grace');
      expect((users as any).cache).toBeDefined();
    } finally {
      await plugin.stop();
      await database.disconnect();
    }
  });

  test('isolates named cache plugin instances on one resource', async () => {
    const database = new Baldim({ connectionString: 'memory://cache-namespaces', logLevel: 'silent' });
    await database.connect();
    const primary = new CachePlugin({ driver: 'memory', instanceName: 'primary', logLevel: 'silent', maxMemoryBytes: 1024 * 1024 });
    const secondary = new CachePlugin({ driver: 'memory', instanceName: 'secondary', logLevel: 'silent', maxMemoryBytes: 1024 * 1024 });

    try {
      await primary.install(database);
      await secondary.install(database);
      const notes = await database.createResource({
        name: 'notes',
        attributes: { title: 'string|required' },
      });

      expect((notes as any).getCacheNamespace('primary')?.driver).toBe(primary.driver);
      expect((notes as any).getCacheNamespace('secondary')?.driver).toBe(secondary.driver);
    } finally {
      await secondary.stop();
      await primary.stop();
      await database.disconnect();
    }
  });

  test('removes database hooks, middleware, and resource extensions on stop', async () => {
    const database = new Baldim({ connectionString: 'memory://cache-stop', logLevel: 'silent' });
    await database.connect();
    const plugin = new CachePlugin({ driver: 'memory', logLevel: 'silent', maxMemoryBytes: 1024 * 1024 });
    await plugin.install(database);
    const users = await database.createResource({
      name: 'users_stop',
      attributes: { name: 'string|required' },
    });

    expect((users as any).cache).toBeDefined();
    await plugin.stop();
    expect((users as any).cache).toBeUndefined();
    expect((users as any).getCacheNamespace).toBeUndefined();

    const posts = await database.createResource({
      name: 'posts_after_stop',
      attributes: { title: 'string|required' },
    });
    expect((posts as any).cache).toBeUndefined();
    await database.disconnect();
  });

  test('applies per-method TTL and reads the legacy cache envelope', async () => {
    const database = new Baldim({ connectionString: 'memory://cache-method-policy', logLevel: 'silent' });
    await database.connect();
    const plugin = new CachePlugin({
      driver: 'memory',
      logLevel: 'silent',
      maxMemoryBytes: 1024 * 1024,
      methodPolicies: { get: { minHitsBeforeStore: 1, ttlMs: 20 } },
    });

    try {
      await plugin.install(database);
      const users = await database.createResource({
        name: 'policy_users',
        attributes: { name: 'string|required' },
      });
      await users.insert({ id: 'one', name: 'Ada' });

      await users.get('one');
      await users.get('one');
      expect(plugin.getStats().hits).toBe(1);
      await new Promise(resolve => setTimeout(resolve, 30));
      await users.get('one');
      expect(plugin.getStats().misses).toBe(2);

      expect((plugin as any).unwrapCachedValue({
        __s3dbCacheV: 1,
        storedAt: Date.now(),
        ttlMs: 1000,
        payload: { compatible: true },
      })).toMatchObject({ present: true, expired: false, value: { compatible: true } });
    } finally {
      await plugin.stop();
      await database.disconnect();
    }
  });

  test('enforces memory capacity and supports TTL', async () => {
    const cache = new MemoryCache({ maxSize: 1, ttl: 20, enableStats: true, monitorInterval: 0 });
    await cache.set('first', { value: 1 });
    await cache.set('second', { value: 2 });

    expect(await cache.get('first')).toBeNull();
    expect(await cache.get('second')).toEqual({ value: 2 });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(await cache.get('second')).toBeNull();
    expect(cache.getStats().evictions).toBe(1);
    await cache.shutdown();
  });

  test('persists filesystem entries and clears a prefix', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'baldim-cache-'));
    const cache = new FilesystemCache({ directory, prefix: 'test', enableCleanup: false });

    try {
      await cache.set('users/1', { name: 'Ada' });
      await cache.set('posts/1', { title: 'Hello' });
      expect(await cache.get('users/1')).toEqual({ name: 'Ada' });
      await cache.clear('users');
      expect(await cache.get('users/1')).toBeNull();
      expect(await cache.get('posts/1')).toEqual({ title: 'Hello' });
    } finally {
      cache.destroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('uses a Baldim storage client through the object-storage cache contract', async () => {
    const database = new Baldim({ connectionString: 'memory://cache-object-storage', logLevel: 'silent' });
    await database.connect();
    const cache = new S3Cache({ client: database.client, keyPrefix: 'contract', ttl: 1000 });

    try {
      await cache.set('one', { value: 1 });
      expect(await cache.get('one')).toEqual({ value: 1 });
      expect(await cache.keys()).toEqual(['one']);
      expect(await cache.size()).toBe(1);
      await cache.clear();
      expect(await cache.size()).toBe(0);
    } finally {
      await database.disconnect();
    }
  });

  test('accepts an injected Redis-compatible client', async () => {
    const values = new Map<string, string>();
    const client = {
      connect: async () => undefined,
      quit: async () => undefined,
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: string) => { values.set(key, value); return 'OK'; },
      setex: async (key: string, _seconds: number, value: string) => { values.set(key, value); return 'OK'; },
      del: async (...keys: string[]) => {
        let deleted = 0;
        for (const key of keys) deleted += values.delete(key) ? 1 : 0;
        return deleted;
      },
      scan: async (_cursor: string, _match: string, pattern: string) => {
        const prefix = pattern.slice(0, -1);
        return ['0', [...values.keys()].filter(key => key.startsWith(prefix))] as [string, string[]];
      },
      on: () => undefined,
    };
    const cache = new RedisCache({ client, keyPrefix: 'test', ttl: 1000, enableStats: true });

    await cache.set('one', { value: 1 });
    expect(await cache.get('one')).toEqual({ value: 1 });
    expect(await cache.keys()).toEqual(['one']);
    await cache.clear();
    expect(await cache.size()).toBe(0);
    await cache.shutdown();
  });

  test('promotes a hit from a slower cache tier', async () => {
    const fast = new MemoryCache({ monitorInterval: 0 });
    const slow = new MemoryCache({ monitorInterval: 0 });
    const cache = new MultiTierCache({
      drivers: [
        { name: 'fast', driver: fast },
        { name: 'slow', driver: slow },
      ],
      promoteOnHit: true,
    });

    await slow.set('key', { value: 42 });
    expect(await cache.get('key')).toEqual({ value: 42 });
    await new Promise(resolve => setImmediate(resolve));
    expect(await fast.get('key')).toEqual({ value: 42 });
    await fast.shutdown();
    await slow.shutdown();
  });
});
