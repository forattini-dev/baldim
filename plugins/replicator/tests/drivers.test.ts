import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WebhookReplicator,
  createReplicator,
  loadBigqueryReplicator,
  loadDynamoDBReplicator,
  loadMongoDBReplicator,
  loadMySQLReplicator,
  loadPlanetScaleReplicator,
  loadPostgresReplicator,
  loadSqsReplicator,
  loadTursoReplicator,
} from '../src/index.js';

const servers: Array<ReturnType<typeof createServer>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('replicator drivers', () => {
  it('loads every declared external driver from the standalone package', async () => {
    const drivers = await Promise.all([
      loadBigqueryReplicator(), loadDynamoDBReplicator(), loadMongoDBReplicator(),
      loadMySQLReplicator(), loadPlanetScaleReplicator(), loadPostgresReplicator(),
      loadSqsReplicator(), loadTursoReplicator(),
    ]);
    expect(drivers.every((driver) => typeof driver === 'function')).toBe(true);
    await expect(createReplicator('unknown')).rejects.toThrow(/Unknown replicator driver/);
  });

  it('replicates to an HTTP endpoint with authentication and Baldin source metadata', async () => {
    const received: Array<{ headers: Record<string, string | string[] | undefined>; body: any }> = [];
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        received.push({ headers: request.headers, body: JSON.parse(body) });
        response.writeHead(204).end();
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP server did not bind');

    const replicator = new WebhookReplicator({
      url: `http://127.0.0.1:${address.port}/events`,
      auth: { type: 'bearer', token: 'secret' },
      retries: 1,
      logLevel: false,
    }, ['users']);
    await replicator.initialize({});
    await expect(replicator.replicate('users', 'insert', { id: 'one' }, 'one')).resolves.toMatchObject({ success: true, status: 204 });

    expect(received).toHaveLength(1);
    expect(received[0]!.headers.authorization).toBe('Bearer secret');
    expect(received[0]!.body).toMatchObject({ resource: 'users', action: 'insert', source: 'baldin-webhook-replicator' });
  });
});
