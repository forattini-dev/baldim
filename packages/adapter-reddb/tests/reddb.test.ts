import { describe, expect, it } from 'vitest';
import { Baldin } from '@baldin/core';
import { RedDbClient } from '../src/index.js';
describe('@baldin/adapter-reddb', () => {
  it('initializes reddb: through the public registry without a request', async () => {
    const database = new Baldin({ connectionString: 'reddb://token@localhost:8080/app', logLevel: 'silent' });
    await database.ensureClientInitialized();
    expect(database.client).toBeInstanceOf(RedDbClient);
    await database.disconnect();
  });
});
