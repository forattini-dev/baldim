import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@baldim/core/adapter';
import { S3Client } from '../src/index.js';

const FIVE_MIB = 5 * 1024 * 1024;

interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

function createStubClient(options: { failPartNumbers?: number[] } = {}) {
  const sent: SentCommand[] = [];
  const send = vi.fn(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const name = command.constructor.name;
    sent.push({ name, input: command.input });

    switch (name) {
      case 'CreateMultipartUploadCommand':
        return { UploadId: 'upload-1' };
      case 'UploadPartCommand': {
        if (options.failPartNumbers?.includes(Number(command.input.PartNumber))) {
          const failure = new Error('Part upload failed');
          failure.name = 'InternalError';
          throw failure;
        }
        return { ETag: `"etag-${command.input.PartNumber}"` };
      }
      case 'CompleteMultipartUploadCommand':
        return { ETag: '"complete-etag"', Location: 'https://mybucket.s3.amazonaws.com/key', VersionId: 'version-1' };
      case 'AbortMultipartUploadCommand':
        return {};
      case 'ListPartsCommand':
        return {
          Parts: [
            { PartNumber: 1, ETag: '"etag-1"' },
            { PartNumber: 2, ETag: '"etag-2"' },
          ],
          IsTruncated: false,
          NextPartNumberMarker: 2,
        };
      case 'ListMultipartUploadsCommand':
        return {
          Uploads: [
            { Key: 'prefix/object-a', UploadId: 'upload-1', Initiated: new Date(0) },
          ],
          IsTruncated: true,
          NextKeyMarker: 'prefix/object-a',
          NextUploadIdMarker: 'upload-1',
        };
      default:
        throw new Error(`Unexpected command: ${name}`);
    }
  });

  const stub = { send, destroy: vi.fn() } as unknown;
  return { sent, send, stub: stub as never };
}

function createClient(keyPrefix = ''): S3Client {
  const { stub } = createStubClient();
  return new S3Client({
    connectionString: `s3://access:secret@mybucket${keyPrefix ? `/${keyPrefix}` : ''}?region=us-east-1`,
    AwsS3Client: stub,
  });
}

describe('S3Client multipart upload', () => {
  it('reports multipartUpload capability', () => {
    expect(createClient().capabilities.multipartUpload).toBe(true);
  });

  it('uploads a body in parts and completes the multipart upload', async () => {
    const client = createClient();
    const progress: Array<{ partNumber: number; totalParts: number | null; uploadedBytes: number }> = [];
    const body = Buffer.alloc(FIVE_MIB * 2, 7);

    const response = await client.putObjectMultipart!({
      key: 'videos/big.bin',
      body,
      partSize: FIVE_MIB,
      contentType: 'application/octet-stream',
      onProgress: (entry) => progress.push(entry),
    });

    expect(response.ETag).toBe('"complete-etag"');
    expect(response.VersionId).toBe('version-1');

    expect(progress).toEqual([
      { partNumber: 1, totalParts: 2, uploadedBytes: FIVE_MIB },
      { partNumber: 2, totalParts: 2, uploadedBytes: FIVE_MIB * 2 },
    ]);
  });

  it('sends create/uploadPart/complete commands with ordered parts and full keys', async () => {
    const { sent, send, stub } = createStubClient();
    const client = new S3Client({
      connectionString: 's3://access:secret@mybucket/prefix?region=us-east-1',
      AwsS3Client: stub as never,
    });

    await client.putObjectMultipart!({
      key: 'videos/big.bin',
      body: Buffer.alloc(FIVE_MIB + 1),
      partSize: FIVE_MIB,
      metadata: { owner: 'dadario' },
    });

    const names = sent.map((command) => command.name);
    expect(names).toEqual([
      'CreateMultipartUploadCommand',
      'UploadPartCommand',
      'UploadPartCommand',
      'CompleteMultipartUploadCommand',
    ]);

    const created = sent[0]!;
    expect(created.input.Key).toBe('prefix/videos/big.bin');
    expect(created.input.Bucket).toBe('mybucket');

    const parts = sent.filter((command) => command.name === 'UploadPartCommand');
    expect(parts.map((command) => command.input.PartNumber)).toEqual([1, 2]);
    expect(parts[1]!.input.UploadId).toBe('upload-1');

    const complete = sent.find((command) => command.name === 'CompleteMultipartUploadCommand')!;
    expect(complete.input.UploadId).toBe('upload-1');
    expect(complete.input.MultipartUpload).toEqual({
      Parts: [
        { ETag: '"etag-1"', PartNumber: 1 },
        { ETag: '"etag-2"', PartNumber: 2 },
      ],
    });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('accepts a string body smaller than one part', async () => {
    const { sent, stub } = createStubClient();
    const client = new S3Client({
      connectionString: 's3://access:secret@mybucket?region=us-east-1',
      AwsS3Client: stub as never,
    });

    await client.putObjectMultipart!({ key: 'docs/hello.txt', body: 'hello world' });

    const uploads = sent.filter((command) => command.name === 'UploadPartCommand');
    expect(uploads).toHaveLength(1);
  });

  it('aborts the multipart upload when a part fails', async () => {
    const { sent, stub } = createStubClient({ failPartNumbers: [2] });
    const client = new S3Client({
      connectionString: 's3://access:secret@mybucket?region=us-east-1',
      AwsS3Client: stub,
    });

    await expect(
      client.putObjectMultipart!({ key: 'videos/big.bin', body: Buffer.alloc(FIVE_MIB * 2), partSize: FIVE_MIB })
    ).rejects.toThrow('Part upload failed');

    const abort = sent.find((command) => command.name === 'AbortMultipartUploadCommand');
    expect(abort).toBeDefined();
    expect(abort!.input.UploadId).toBe('upload-1');
    expect(sent.at(-1)!.name).toBe('AbortMultipartUploadCommand');
  });

  it('rejects a partSize below the S3 minimum when the body needs multiple parts', async () => {
    const { sent, stub } = createStubClient();
    const client = new S3Client({
      connectionString: 's3://access:secret@mybucket?region=us-east-1',
      AwsS3Client: stub,
    });

    await expect(
      client.putObjectMultipart!({ key: 'videos/big.bin', body: Buffer.alloc(FIVE_MIB * 2), partSize: 1024 })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(sent).toHaveLength(0);
  });

  it('exposes multipart primitives over the AWS commands', async () => {
    const { sent, stub } = createStubClient();
    const client = new S3Client({
      connectionString: 's3://access:secret@mybucket/prefix?region=us-east-1',
      AwsS3Client: stub,
    });

    const created = await client.createMultipartUpload!({ key: 'a.bin', contentType: 'text/plain' });
    expect(created).toEqual({ key: 'a.bin', uploadId: 'upload-1' });
    expect(sent[0]!.input.Key).toBe('prefix/a.bin');

    const part = await client.uploadPart!({ key: 'a.bin', uploadId: 'upload-1', partNumber: 1, body: Buffer.alloc(4) });
    expect(part).toEqual({ partNumber: 1, etag: '"etag-1"' });

    const completed = await client.completeMultipartUpload!({
      key: 'a.bin',
      uploadId: 'upload-1',
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });
    expect(completed.ETag).toBe('"complete-etag"');

    const listedParts = await client.listParts!({ key: 'a.bin', uploadId: 'upload-1' });
    expect(listedParts.parts).toEqual([
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
    ]);
    expect(listedParts.isTruncated).toBe(false);

    const uploads = await client.listMultipartUploads!({ prefix: 'prefix/' });
    expect(uploads.uploads).toEqual([
      { key: 'object-a', uploadId: 'upload-1', initiated: new Date(0) },
    ]);
    expect(uploads.isTruncated).toBe(true);
    expect(uploads.nextContinuationToken).toBe('prefix/object-a|upload-1');

    const aborted = await client.abortMultipartUpload!({ key: 'a.bin', uploadId: 'upload-1' });
    expect(aborted).toEqual({ key: 'a.bin', uploadId: 'upload-1' });
  });

  it('emits multipart lifecycle events', async () => {
    const client = createClient();
    const events: string[] = [];
    for (const name of ['cl:CreateMultipartUpload', 'cl:UploadPart', 'cl:CompleteMultipartUpload', 'cl:PutObjectMultipart']) {
      client.on(name, () => events.push(name));
    }

    await client.putObjectMultipart!({ key: 'a.bin', body: 'x' });

    expect(events).toEqual([
      'cl:CreateMultipartUpload',
      'cl:UploadPart',
      'cl:CompleteMultipartUpload',
      'cl:PutObjectMultipart',
    ]);
  });
});
