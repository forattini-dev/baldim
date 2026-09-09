import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client as AwsS3Client
} from '@aws-sdk/client-s3';
import { Baldim } from '@baldim/core';
import { S3Client } from '../src/index.js';

interface Fixture {
  sourceCommit: string;
  sourceVersion: string;
  objects: Array<{
    key: string;
    bodyBase64: string;
    metadata: Record<string, string>;
    contentType: string;
  }>;
}

const contractUrl = process.env.BALDIM_S3_CONTRACT_URL;
const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 's3db-v21-objects.json');

if (!contractUrl) {
  describe.skip('s3db.js S3-compatible persisted-data compatibility', () => {
    it('runs when BALDIM_S3_CONTRACT_URL is configured', () => undefined);
  });
} else {
  const url = new URL(contractUrl);
  const bucket = url.pathname.split('/').filter(Boolean)[0];
  if (!bucket) throw new Error('BALDIM_S3_CONTRACT_URL must include a bucket path.');
  const admin = new AwsS3Client({
    region: url.searchParams.get('region') || 'us-east-1',
    endpoint: url.origin,
    forcePathStyle: true,
    credentials: {
      accessKeyId: decodeURIComponent(url.username),
      secretAccessKey: decodeURIComponent(url.password)
    }
  });

  beforeAll(async () => {
    try {
      await admin.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const name = (error as Error).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
    }
  });

  describe('s3db.js S3-compatible persisted-data compatibility', () => {
    it('opens captured v21 objects without rewriting them', async () => {
      const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
      expect(fixture.sourceVersion).toBe('21.6.2');
      const root = `fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const providerPrefix = `${root}/compat/`;

      await Promise.all(fixture.objects.map(object => admin.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `${providerPrefix}${object.key}`,
        Body: Buffer.from(object.bodyBase64, 'base64'),
        Metadata: object.metadata,
        ContentType: object.contentType
      }))));

      const snapshot = async () => {
        const result = await admin.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: providerPrefix }));
        return (result.Contents || []).map(object => ({
          key: object.Key,
          etag: object.ETag,
          size: object.Size
        })).sort((a, b) => String(a.key).localeCompare(String(b.key)));
      };

      try {
        const before = await snapshot();
        const connection = new URL(contractUrl);
        connection.pathname = `/${bucket}/${root}/compat`;
        const client = new S3Client({
          connectionString: connection.toString(),
          logLevel: 'silent',
          httpClientOptions: { useReckerHandler: false }
        });
        const database = new Baldim({ client, logLevel: 'silent', exitOnSignal: false });
        await database.connect();

        expect(Object.keys(database.resources).sort()).toEqual(['articles', 'users']);
        expect(await database.resources.users.get('ana')).toMatchObject({
          name: 'Ana', email: 'ana@example.com', region: 'BR', active: true, score: 42.5
        });
        expect(await database.resources.users.listIds({
          partition: 'byRegion', partitionValues: { region: 'BR' }
        })).toEqual(['ana']);
        expect(await database.resources.articles.get('migration-note')).toMatchObject({
          title: 'Created by s3db.js 21.6.2',
          tags: ['legacy', 'fixture'],
          details: { source: 's3db.js', compatible: true }
        });

        await database.disconnect();
        expect(await snapshot()).toEqual(before);
      } finally {
        const objects = await snapshot();
        if (objects.length > 0) {
          await admin.send(new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects.map(object => ({ Key: object.key })) }
          }));
        }
      }
    });
  });
}
