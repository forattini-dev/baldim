import { Baldim, ValidationError } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import { Factory, Seeder } from '../src/index.js';

describe('Seeder', () => {
  beforeEach(() => {
    Factory.reset();
    MemoryClient.clearAllStorage();
  });

  async function setup(name: string) {
    const database = new Baldim({ connectionString: `memory://${name}`, logLevel: 'silent' });
    await database.connect();
    const users = await database.createResource({ name: 'users', attributes: { name: 'string|required' } });
    return { database, users, seeder: new Seeder(database, { logLevel: 'silent' }) };
  }

  it('creates records from registered factories', async () => {
    const { database, users, seeder } = await setup('testing-seed');
    Factory.define('users', ({ seq }) => ({ id: `u${seq}`, name: `User ${seq}` }));
    const result = await seeder.seed({ users: 3 });
    expect(result.users).toHaveLength(3);
    expect(await users.listIds()).toEqual(['u1', 'u2', 'u3']);
    await database.disconnect();
  });

  it('reports a missing factory', async () => {
    const { database, seeder } = await setup('testing-missing');
    await expect(seeder.seed({ users: 1 })).rejects.toBeInstanceOf(ValidationError);
    await database.disconnect();
  });

  it('runs custom seeders and calls callbacks with the database', async () => {
    const { database, seeder } = await setup('testing-callbacks');
    const callback = vi.fn(async db => Object.keys(db.resources));
    expect(await seeder.call(callback)).toEqual(expect.arrayContaining(['users']));
    expect(await seeder.run([async () => 'first', async () => 'second'])).toEqual(['first', 'second']);
    expect(callback).toHaveBeenCalledWith(database);
    await database.disconnect();
  });

  it('truncates selected resources and skips unknown names', async () => {
    const { database, users, seeder } = await setup('testing-truncate');
    await users.insert({ id: 'u1', name: 'One' });
    await users.insert({ id: 'u2', name: 'Two' });
    await seeder.truncate(['missing', 'users']);
    expect(await users.listIds()).toEqual([]);
    await database.disconnect();
  });

  it('resets all resources and factory sequences', async () => {
    const { database, users, seeder } = await setup('testing-reset');
    const factory = Factory.define('users', ({ seq }) => ({ id: `u${seq}`, name: `User ${seq}` }));
    await factory.create({}, { database: database });
    await seeder.reset();
    expect(await users.listIds()).toEqual([]);
    expect(await factory.build()).toMatchObject({ id: 'u1' });
    await database.disconnect();
  });
});
