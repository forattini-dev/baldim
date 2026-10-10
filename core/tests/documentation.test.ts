import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryClient } from '@baldim/adapter-memory';
import { SqliteClient } from '../../adapters/sqlite/src/sqlite-client.class.js';
import { crudExample } from '../examples/crud.js';
import { multidatabaseExample } from '../examples/multidatabase.js';
import { uniqueIndexExample } from '../examples/unique-index.js';
import { migrationExample } from '../examples/migration.js';
import { protectedFieldsExample } from '../examples/protected-fields.js';

const coreRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
afterEach(() => MemoryClient.clearAllStorage());

describe('executable core documentation', () => {
  it('runs CRUD, filtered projection, cursor pages and a partition audit', async () => {
    const result = await crudExample();
    expect(result.selected).toEqual([{ id: 'ada', name: 'Ada', age: 38 }]);
    expect(result.first.items.map((item) => item.id)).toEqual(['ada']);
    expect(result.second?.items.map((item) => item.id)).toEqual(['grace']);
    expect(result.second?.hasMore).toBe(false);
    expect(result.audit).toMatchObject({
      documents: 2,
      missing: [],
      stale: [],
      repaired: false,
    });
    expect(result.missing).toBeNull();
    expect(result.deleted).toEqual({ deleted: 1, errors: 0 });
  });

  it('resolves a resource on another connection through the manager', async () => {
    const result = await multidatabaseExample();
    expect(result.names).toEqual(['primary', 'analytics']);
    expect(result.owner).toBe('analytics');
    expect(result.unified).toMatchObject({ id: 'login-1', type: 'login' });
    expect(result.local).toEqual(result.unified);
  });

  it('rolls back a unique conflict using actual local SQLite transactions', async () => {
    const result = await uniqueIndexExample(
      new SqliteClient({
        basePath: ':memory:',
        bucket: 'docs-unique',
        logLevel: 'silent',
      }),
    );
    expect(result.conflict).toBe('UNIQUE_CONSTRAINT');
    expect(result.duplicate).toBeNull();
    expect(result.owner.map((item) => item.id)).toEqual(['ada']);
  });

  it('resumes a failed rename/backfill without transforming committed documents again', async () => {
    const result = await migrationExample();
    expect(result.first).toMatchObject({
      complete: false,
      migrated: 1,
      failures: [{ id: 'b' }],
    });
    expect(result.resumed).toMatchObject({
      complete: true,
      migrated: 2,
      failures: [],
    });
    expect(result.visited).toEqual(['a', 'b', 'b']);
    expect(result.documents).toEqual([
      expect.objectContaining({
        id: 'a',
        name: 'Ada',
        cents: 1250,
        active: true,
      }),
      expect.objectContaining({
        id: 'b',
        name: 'Grace',
        cents: 300,
        active: true,
      }),
    ]);
    for (const item of result.documents) {
      expect(item).not.toHaveProperty('legacyName');
      expect(item).not.toHaveProperty('amountText');
    }
  });

  it('verifies passwords, preserves hashes and controls secret decryption', async () => {
    expect(
      await protectedFieldsExample({
        passphrase: 'documentation-fixture-passphrase',
        pepper: 'documentation-fixture-pepper',
      }),
    ).toEqual({
      valid: true,
      invalid: false,
      secretWasDecrypted: true,
      passwordHashWasPreserved: true,
      rawReadIsEncrypted: true,
    });
  });

  it('keeps every complete recipe identical to its executable source', async () => {
    const recipes = await readFile(
      resolve(coreRoot, 'docs/recipes.md'),
      'utf8',
    );
    const pattern = /<!-- example: ([^>]+) -->\s*```ts\r?\n([\s\S]*?)\r?\n```/g;
    const blocks = [...recipes.matchAll(pattern)];
    expect(blocks).toHaveLength(5);
    for (const [, file, snippet] of blocks) {
      const source = await readFile(resolve(coreRoot, file!.trim()), 'utf8');
      expect(snippet?.trimEnd(), file).toBe(source.trimEnd());
    }
  });

  it('resolves local documentation links and GitHub heading anchors', async () => {
    const files = [
      '../README.md',
      'README.md',
      'docs/api.md',
      'docs/behaviors.md',
      'docs/protected-fields.md',
      'docs/errors.md',
      'docs/recipes.md',
    ];
    for (const file of files) {
      const path = resolve(coreRoot, file);
      const markdown = await readFile(path, 'utf8');
      for (const [, destination] of markdown.matchAll(
        /\[[^\]]*\]\(([^)]+)\)/g,
      )) {
        if (/^(?:https?:|mailto:)/.test(destination!)) continue;
        if (file === '../README.md' && !destination!.startsWith('core/'))
          continue;
        const [relativePath, anchor] = destination!.split('#');
        const target = relativePath
          ? resolve(dirname(path), relativePath)
          : path;
        expect((await stat(target)).isFile(), file + ': ' + destination).toBe(
          true,
        );
        if (!anchor || !target.endsWith('.md')) continue;
        const headings = new Set<string>();
        const counts = new Map<string, number>();
        for (const [, title] of (await readFile(target, 'utf8')).matchAll(
          /^#{1,6}\s+(.+)$/gm,
        )) {
          const slug = title!
            .toLowerCase()
            .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
            .replace(/\s/g, '-');
          const count = counts.get(slug) ?? 0;
          headings.add(count ? slug + '-' + count : slug);
          counts.set(slug, count + 1);
        }
        expect(
          headings.has(decodeURIComponent(anchor)),
          file + ': ' + destination,
        ).toBe(true);
      }
    }
  });
});
