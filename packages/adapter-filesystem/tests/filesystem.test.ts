import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Baldin } from '@baldin/core';
import { FileSystemClient } from '../src/index.js';

const paths: string[] = [];
afterEach(async () => { for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true }); });

describe('@baldin/adapter-filesystem', () => {
  it('runs document CRUD through a registered file: connection', async () => {
    const path = await mkdtemp(join(tmpdir(), 'baldin-fs-'));
    paths.push(path);
    const database = new Baldin({ connectionString: `file://${path}`, logLevel: 'silent' });
    await database.connect();
    expect(database.client).toBeInstanceOf(FileSystemClient);
    const notes = await database.createResource({ name: 'notes', attributes: { title: 'string|required' } });
    await notes.insert({ id: 'one', title: 'stored' });
    expect(await notes.get('one')).toMatchObject({ title: 'stored' });
    await database.disconnect();
  });
});