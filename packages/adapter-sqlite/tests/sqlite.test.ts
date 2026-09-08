import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Baldin } from '@baldin/core';
import { SqliteClient } from '../src/index.js';

const paths: string[] = [];
afterEach(async () => { for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true }); });

describe('@baldin/adapter-sqlite', () => {
  it('runs document CRUD through sqlite:', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'baldin-sqlite-'));
    paths.push(dir);
    const file = join(dir, 'data.sqlite');
    const database = new Baldin({ connectionString: `sqlite:///${file.replace(/^\//, '')}`, logLevel: 'silent' });
    await database.connect();
    expect(database.client).toBeInstanceOf(SqliteClient);
    const notes = await database.createResource({ name: 'notes', attributes: { title: 'string|required' } });
    await notes.insert({ id: 'one', title: 'stored' });
    expect(await notes.get('one')).toMatchObject({ title: 'stored' });
    await database.disconnect();
  });
});
