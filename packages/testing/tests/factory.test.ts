import { Baldim, ValidationError } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import { Factory } from '../src/index.js';

describe('Factory', () => {
  beforeEach(() => {
    Factory.reset();
    MemoryClient.clearAllStorage();
  });

  it('builds sequential records and resolves asynchronous fields', async () => {
    const factory = Factory.define('users', ({ seq }) => ({
      id: `user-${seq}`,
      name: ({ seq: fieldSeq }) => Promise.resolve(`User ${fieldSeq}`),
    }));
    expect(await factory.build()).toEqual({ id: 'user-1', name: 'User 1' });
    expect(await factory.build()).toEqual({ id: 'user-2', name: 'User 2' });
  });

  it('applies traits before explicit overrides', async () => {
    const factory = Factory.define('users', { role: 'member', active: true })
      .trait('admin', ({ seq }) => ({ role: 'admin', rank: seq }));
    expect(await factory.buildWithTraits('admin', { role: 'owner' })).toEqual({
      role: 'owner', active: true, rank: 1,
    });
  });

  it('reports missing traits', async () => {
    const factory = Factory.define('users', {});
    await expect(factory.buildWithTraits('missing')).rejects.toBeInstanceOf(ValidationError);
  });

  it('uses named sequences shared across factories', () => {
    const users = Factory.define('users', {});
    const posts = Factory.define('posts', {});
    expect(users.sequence('global')).toBe(1);
    expect(posts.sequence('global')).toBe(2);
    Factory.resetSequences();
    expect(users.sequence('global')).toBe(1);
  });

  it('creates records in a real Baldim resource and runs callbacks', async () => {
    const database = new Baldim({ connectionString: 'memory://testing-factory', logLevel: 'silent' });
    await database.connect();
    const users = await database.createResource({ name: 'users', attributes: { name: 'string|required', normalized: 'boolean' } });
    const before = vi.fn(async (attributes: Record<string, unknown>) => ({ ...attributes, name: String(attributes.name).trim() }));
    const after = vi.fn(async (record: Record<string, unknown>) => ({ ...record, observed: true }));
    const factory = Factory.define('users', ({ seq }) => ({ id: `u${seq}`, name: ' Alice ' }))
      .beforeCreate(before)
      .afterCreate(after);
    Factory.setDatabase(database);

    const created = await factory.create({ normalized: true });
    expect(created).toMatchObject({ id: 'u1', name: 'Alice', normalized: true, observed: true });
    expect(await users.get('u1')).toMatchObject({ name: 'Alice', normalized: true });
    expect(before).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();
    await database.disconnect();
  });

  it('accepts a database per create call', async () => {
    const insert = vi.fn(async data => ({ id: 'saved', ...data }));
    const factory = Factory.define('users', { name: 'Ada' });
    await expect(factory.create({}, { database: { resources: { users: { insert } } } })).resolves.toEqual({ id: 'saved', name: 'Ada' });
  });

  it('reports missing database and resource configuration', async () => {
    const factory = Factory.define('users', {});
    await expect(factory.create()).rejects.toThrow('Database not set for factory');
    await expect(factory.create({}, { database: { resources: {} } })).rejects.toThrow("Resource 'users' not found");
  });

  it('builds and creates multiple records in order', async () => {
    const insert = vi.fn(async data => data);
    const factory = Factory.define('users', ({ seq }) => ({ id: `u${seq}` }));
    expect(await factory.buildMany(2)).toEqual([{ id: 'u1' }, { id: 'u2' }]);
    expect(await factory.createMany(2, {}, { database: { resources: { users: { insert } } } })).toEqual([{ id: 'u3' }, { id: 'u4' }]);
  });

  it.each([-1, 1.5, Number.NaN])('rejects invalid batch count %s', async count => {
    const factory = Factory.define('users', {});
    await expect(factory.buildMany(count)).rejects.toThrow('Factory count must be a non-negative integer');
  });
});
