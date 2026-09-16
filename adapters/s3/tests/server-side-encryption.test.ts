import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { S3Client } from '../src/index.js';

interface RecordedRequest {
  method: string;
  path: string;
  encryptionHeader: string | undefined;
}

async function startFakeS3(): Promise<{ server: Server; requests: RecordedRequest[]; port: number }> {
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      requests.push({
        method: req.method ?? '',
        path: req.url ?? '',
        encryptionHeader: req.headers['x-amz-server-side-encryption'],
      });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/xml');
      res.setHeader('etag', '"test-etag"');
      res.end('<PutObjectResult><ETag>"test-etag"</ETag></PutObjectResult>');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, requests, port };
}

function createClient(port: number): S3Client {
  return new S3Client({
    connectionString: `http://key:secret@127.0.0.1:${port}/sse-bucket?region=us-east-1`,
    logLevel: 'silent',
    httpClientOptions: { useReckerHandler: false },
  }) as S3Client;
}

describe('@baldim/adapter-s3 server-side encryption', () => {
  let fake: { server: Server; requests: RecordedRequest[]; port: number };

  beforeAll(async () => {
    fake = await startFakeS3();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => fake.server.close(() => resolve()));
  });

  it('sends x-amz-server-side-encryption on PutObject when serverSideEncryption is set', async () => {
    const client = createClient(fake.port);
    await client.putObject({ key: 'encrypted/item', body: 'payload', serverSideEncryption: 'AES256' });
    const put = fake.requests.find((r) => r.method === 'PUT' && r.path.includes('encrypted/item'));
    expect(put).toBeDefined();
    expect(put?.encryptionHeader).toBe('AES256');
    await client.destroy();
  });

  it('omits the header by default and never sends it on reads', async () => {
    const client = createClient(fake.port);
    await client.putObject({ key: 'plain/item', body: 'payload' });
    await client.getObject('plain/item');
    const put = fake.requests.find((r) => r.method === 'PUT' && r.path.includes('plain/item'));
    const get = fake.requests.find((r) => r.method === 'GET' && r.path.includes('plain/item'));
    expect(put).toBeDefined();
    expect(put?.encryptionHeader).toBeUndefined();
    expect(get).toBeDefined();
    expect(get?.encryptionHeader).toBeUndefined();
    await client.destroy();
  });
});
