import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Baldin } from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';
import {
  generateResourceInterface,
  generateTypes,
  isFieldRequired,
  mapFieldTypeToTypeScript,
  printTypes,
} from '../src/index.js';

describe('@baldin/typegen', () => {
  beforeEach(() => MemoryClient.clearAllStorage());

  it('maps Baldin field types to TypeScript', () => {
    expect(mapFieldTypeToTypeScript('string|required')).toBe('string');
    expect(mapFieldTypeToTypeScript('embedding:1536')).toBe('number[]');
    expect(mapFieldTypeToTypeScript('json')).toBe('unknown');
    expect(mapFieldTypeToTypeScript('custom')).toBe('unknown');
  });

  it('detects required rules in string and object definitions', () => {
    expect(isFieldRequired('string|required')).toBe(true);
    expect(isFieldRequired({ type: 'string|required' })).toBe(true);
    expect(isFieldRequired({ type: 'string', required: true })).toBe(true);
    expect(isFieldRequired('string|optional')).toBe(false);
  });

  it('renders nested objects, arrays, descriptions, and safe field names', () => {
    const output = generateResourceInterface('audit-events', {
      'event-name': { type: 'string', required: true, description: 'Event */ name' },
      tags: { type: 'array', items: 'string' },
      actor: { type: 'object', props: { email: 'email|required', 'display-name': 'string' } },
    });
    expect(output).toContain('export interface AuditEvents');
    expect(output).toContain('"event-name": string;');
    expect(output).toContain('Event * / name');
    expect(output).toContain('tags?: Array<string>;');
    expect(output).toContain('email: string;');
    expect(output).toContain('"display-name"?: string;');
  });

  it('does not duplicate id or timestamp fields', () => {
    const output = generateResourceInterface('records', {
      id: 'string|required', createdAt: 'datetime|required', updatedAt: 'datetime|required',
    }, true);
    expect(output.match(/\bid:/g)).toHaveLength(1);
    expect(output.match(/\bcreatedAt:/g)).toHaveLength(1);
    expect(output.match(/\bupdatedAt:/g)).toHaveLength(1);
  });

  it('generates resource maps from a connected Baldin database', async () => {
    const database = new Baldin({ connectionString: 'memory://typegen', logLevel: 'silent' });
    await database.connect();
    await database.createResource({
      name: 'users', timestamps: true,
      attributes: { name: 'string|required', age: 'number', profile: { type: 'object', props: { bio: 'string' } } },
    });
    const output = await printTypes(database);
    expect(output).toContain("import type { Database, Resource } from \"@baldin/core\";");
    expect(output).toContain('export interface Users');
    expect(output).toContain('name: string;');
    expect(output).toContain('age?: number;');
    expect(output).toContain('users: TypedResource<Users>;');
    expect(output).toContain("export type TypedDatabase = Omit<Database, 'resources'>");
    await database.disconnect();
  });

  it('filters plugin-owned attributes', async () => {
    const output = await printTypes({ resources: {
      records: {
        attributes: { title: 'string', internalScore: 'number' },
        schema: { _pluginAttributes: { search: ['internalScore'] } },
      },
    } });
    expect(output).toContain('title?: string;');
    expect(output).not.toContain('internalScore');
  });

  it('supports type-only output without importing core', async () => {
    const output = await printTypes({ resources: { 'event-log': { attributes: { value: 'json' } } } }, {
      includeResource: false,
      banner: false,
    });
    expect(output).not.toContain('import type');
    expect(output).toContain('"event-log": unknown;');
  });

  it('writes generated output and creates parent directories', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'baldin-typegen-'));
    const outputPath = join(directory, 'nested', 'database.generated.ts');
    try {
      const generated = await generateTypes({ resources: {} }, { outputPath });
      expect(await readFile(outputPath, 'utf8')).toBe(generated);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('escapes custom module names as string literals', async () => {
    const output = await printTypes({ resources: {} }, { moduleName: 'custom"module' });
    expect(output).toContain('from "custom\\\"module";');
  });

  it('prefixes interface names that begin with a number', () => {
    expect(generateResourceInterface('2026-events', {})).toContain('interface Resource2026Events');
  });
});
