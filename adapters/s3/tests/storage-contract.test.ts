import { beforeAll, describe, it } from 'vitest';
import { CreateBucketCommand, S3Client as AwsS3Client } from '@aws-sdk/client-s3';
import { S3Client } from '../src/index.js';
import { runStorageAdapterContract } from '../../../tests/storage-adapter-contract.js';

const contractUrl = process.env.BALDIM_S3_CONTRACT_URL;

if (!contractUrl) {
  describe.skip('@baldim/adapter-s3 storage contract', () => {
    it('runs when BALDIM_S3_CONTRACT_URL is configured', () => undefined);
  });
} else {
  const baseUrl = new URL(contractUrl);
  const bucket = baseUrl.pathname.split('/').filter(Boolean)[0];
  if (!bucket) throw new Error('BALDIM_S3_CONTRACT_URL must include a bucket path.');

  beforeAll(async () => {
    const admin = new AwsS3Client({
      region: baseUrl.searchParams.get('region') || 'us-east-1',
      endpoint: baseUrl.origin,
      forcePathStyle: true,
      credentials: {
        accessKeyId: decodeURIComponent(baseUrl.username),
        secretAccessKey: decodeURIComponent(baseUrl.password),
      },
    });
    try {
      await admin.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const name = (error as Error).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
    } finally {
      admin.destroy();
    }
  });

  runStorageAdapterContract('@baldim/adapter-s3', () => {
    const url = new URL(contractUrl);
    const prefix = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    url.pathname = `/${bucket}/${prefix}`;
    return new S3Client({
      connectionString: url.toString(),
      logLevel: 'silent',
      httpClientOptions: { useReckerHandler: false },
    }) as never;
  });
}
