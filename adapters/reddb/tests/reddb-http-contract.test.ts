import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runStorageAdapterContract } from '../../../tests/storage-adapter-contract.js';
import { RedDbClient } from '../src/reddb-client.class.js';

interface StoredEntity {
  id: number;
  kind: 'row';
  collection: string;
  data: { named: Record<string, unknown> };
}

const collections = new Map<string, Map<number, StoredEntity>>();
let nextId = 1;
let baseUrl = '';
let prefixSequence = 0;

async function readJson(request: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function sqlValue(query: string, expression: RegExp): string | null {
  const value = query.match(expression)?.[1];
  return value ? value.replace(/''/g, "'").replace(/\\([_%])/g, '$1') : null;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || '/', baseUrl);

  if (request.method === 'POST' && url.pathname === '/query') {
    const { query = '' } = await readJson(request);
    const collection = String(query).match(/FROM\s+([^\s]+)/i)?.[1] || '';
    let rows = Array.from(collections.get(collection)?.values() ?? []);
    const exactKey = sqlValue(query, /_key\s*=\s*'((?:''|[^'])*)'/i);
    const prefix = sqlValue(query, /_key\s+LIKE\s+'((?:''|[^'])*)%'/i);
    const startAfter = sqlValue(query, /_key\s*>\s*'((?:''|[^'])*)'/i);

    if (exactKey !== null) rows = rows.filter(row => row.data.named._key === exactKey);
    if (prefix !== null) rows = rows.filter(row => String(row.data.named._key).startsWith(prefix));
    if (startAfter !== null) rows = rows.filter(row => String(row.data.named._key) > startAfter);
    rows.sort((a, b) => String(a.data.named._key).localeCompare(String(b.data.named._key)));

    const total = rows.length;
    const limit = Number(String(query).match(/LIMIT\s+(\d+)/i)?.[1] ?? total);
    const offset = Number(String(query).match(/OFFSET\s+(\d+)/i)?.[1] ?? 0);
    sendJson(response, 200, { items: rows.slice(offset, offset + limit), total });
    return;
  }

  const rowsMatch = url.pathname.match(/^\/collections\/([^/]+)\/rows$/);
  if (request.method === 'POST' && rowsMatch) {
    const collection = decodeURIComponent(rowsMatch[1]!);
    const { fields } = await readJson(request);
    const entity: StoredEntity = { id: nextId++, kind: 'row', collection, data: { named: fields } };
    const entities = collections.get(collection) ?? new Map<number, StoredEntity>();
    entities.set(entity.id, entity);
    collections.set(collection, entities);
    sendJson(response, 201, { ok: true, id: entity.id, entity });
    return;
  }

  const entityMatch = url.pathname.match(/^\/collections\/([^/]+)\/entities\/(\d+)$/);
  if (entityMatch) {
    const collection = decodeURIComponent(entityMatch[1]!);
    const id = Number(entityMatch[2]);
    const entities = collections.get(collection);
    const entity = entities?.get(id);
    if (!entity) {
      sendJson(response, 404, { error: 'not found' });
      return;
    }
    if (request.method === 'PATCH') {
      const { fields } = await readJson(request);
      entity.data.named = fields;
      sendJson(response, 200, { ok: true, id, entity });
      return;
    }
    if (request.method === 'DELETE') {
      entities!.delete(id);
      sendJson(response, 200, { ok: true, deleted: true });
      return;
    }
  }

  sendJson(response, 404, { error: 'unknown route' });
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch(error => sendJson(response, 500, { error: error.message }));
});

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('RedDB test server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

runStorageAdapterContract('@baldin/adapter-reddb HTTP', () => new RedDbClient({
  baseUrl,
  collection: 'baldin_contract',
  keyPrefix: `case-${++prefixSequence}`,
  logLevel: 'silent'
}));

it('sends read and write credentials through the HTTP transport', async () => {
  let authorization = '';
  let writeToken = '';
  server.once('request', request => {
    authorization = request.headers.authorization || '';
    writeToken = String(request.headers['x-write-token'] || '');
  });
  const client = new RedDbClient({
    baseUrl,
    collection: 'auth_contract',
    authToken: 'reader',
    writeToken: 'writer',
    logLevel: 'silent'
  });

  await client.exists('missing');
  expect(authorization).toBe('Bearer reader');
  expect(writeToken).toBe('writer');
  await client.destroy();
});

const configuredRedDbUrl = process.env.BALDIN_REDDB_CONTRACT_URL;
if (configuredRedDbUrl) {
  runStorageAdapterContract('@baldin/adapter-reddb configured service', () => new RedDbClient({
    baseUrl: configuredRedDbUrl,
    collection: process.env.BALDIN_REDDB_COLLECTION || 'baldin_contract',
    keyPrefix: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    authToken: process.env.BALDIN_REDDB_AUTH_TOKEN,
    writeToken: process.env.BALDIN_REDDB_WRITE_TOKEN,
    logLevel: 'silent'
  }));
} else {
  describe.skip('@baldin/adapter-reddb configured service', () => {
    it('runs when BALDIN_REDDB_CONTRACT_URL is configured', () => undefined);
  });
}
