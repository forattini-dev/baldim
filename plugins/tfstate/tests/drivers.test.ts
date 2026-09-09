import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { S3Client } from '@baldim/adapter-s3';

import {
  FilesystemTfStateDriver,
  S3TfStateDriver,
  StateFileNotFoundError,
  TfStateError,
  TfStatePlugin,
} from '../src/index.js';
import { createTfstateContext } from './helpers.js';

describe('TfState drivers', () => {
  test('filesystem driver lists and reads matching state files', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'baldim-tfstate-driver-'));
    try {
      await writeFile(path.join(directory, 'terraform.tfstate'), JSON.stringify({ version: 4, serial: 1 }));
      await writeFile(path.join(directory, 'ignored.json'), '{}');
      const driver = new FilesystemTfStateDriver({ basePath: directory, selector: '*.tfstate' });

      await driver.initialize();
      const files = await driver.listStateFiles();

      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe('terraform.tfstate');
      await expect(driver.readStateFile(files[0]!.path)).resolves.toMatchObject({ version: 4, serial: 1 });
      await expect(driver.hasBeenModified(files[0]!.path, new Date(0))).resolves.toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('filesystem driver reports missing state files', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'baldim-tfstate-driver-'));
    try {
      const driver = new FilesystemTfStateDriver({ basePath: directory });
      await expect(driver.readStateFile('missing.tfstate')).rejects.toBeInstanceOf(StateFileNotFoundError);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('S3 driver delegates through the standalone adapter client', async () => {
    const state = { version: 4, serial: 2, lineage: 'example' };
    const fakeClient = {
      listObjects: vi.fn().mockResolvedValue({
        Contents: [
          { Key: 'terraform/prod.tfstate', LastModified: new Date('2026-01-01'), Size: 42, ETag: 'state-etag' },
          { Key: 'terraform/readme.txt', LastModified: new Date('2026-01-01'), Size: 5, ETag: 'text-etag' },
        ],
      }),
      getObject: vi.fn().mockResolvedValue({ Body: Buffer.from(JSON.stringify(state)) }),
      headObject: vi.fn().mockResolvedValue({ LastModified: new Date('2026-01-01'), ContentLength: 42, ETag: 'state-etag' }),
    };
    const driver = new S3TfStateDriver({ bucket: 'states', prefix: 'terraform/', selector: '*.tfstate' });
    driver.client = fakeClient as unknown as S3Client;

    await expect(driver.listStateFiles()).resolves.toEqual([
      expect.objectContaining({ path: 'terraform/prod.tfstate', size: 42, etag: 'state-etag' }),
    ]);
    await expect(driver.readStateFile('terraform/prod.tfstate')).resolves.toEqual(state);
    await expect(driver.getStateFileMetadata('terraform/prod.tfstate')).resolves.toEqual(
      expect.objectContaining({ path: 'terraform/prod.tfstate', size: 42, etag: 'state-etag' }),
    );
    expect(fakeClient.listObjects).toHaveBeenCalledWith({ prefix: 'terraform/' });
  });

  test('S3 driver validates connection strings without reaching the provider', () => {
    expect(() => new S3TfStateDriver({ connectionString: 'https://example.com/state' })).toThrow(TfStateError);
  });

  test('remote imports preserve lineage and calculate diffs through a supplied client', async () => {
    const context = await createTfstateContext('remote-import');
    try {
      const first = {
        version: 4,
        terraform_version: '1.9.0',
        serial: 1,
        lineage: 'remote-lineage',
        outputs: {},
        resources: [{ mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1', size: 'small' } }] }],
      };
      const second = {
        ...first,
        serial: 2,
        resources: [{ mode: 'managed', type: 'aws_instance', name: 'web', instances: [{ attributes: { id: 'i-1', size: 'large' } }] }],
      };
      const client = {
        getObject: vi.fn()
          .mockResolvedValueOnce({ Body: Buffer.from(JSON.stringify(first)) })
          .mockResolvedValueOnce({ Body: Buffer.from(JSON.stringify(second)) }),
      };
      const plugin = new TfStatePlugin({ logLevel: 'silent', asyncPartitions: false, trackDiffs: true });
      await context.database.usePlugin(plugin);

      await plugin.importStateFromS3('states', 'first.tfstate', { client });
      const result = await plugin.importStateFromS3('states', 'second.tfstate', { client });

      expect(result.diff).toMatchObject({ added: 0, modified: 1, deleted: 0, isFirst: false });
      expect(await plugin.stateFilesResource.query({ lineageId: 'remote-lineage' })).toHaveLength(2);
      expect(await plugin.diffsResource.query({ lineageId: 'remote-lineage' })).toHaveLength(1);
    } finally {
      await context.cleanup();
    }
  });

  test('filesystem monitoring stores the lineage foreign key', async () => {
    const context = await createTfstateContext('filesystem-monitor');
    try {
      await writeFile(path.join(context.tempDir, 'terraform.tfstate'), JSON.stringify({
        version: 4,
        terraform_version: '1.9.0',
        serial: 1,
        lineage: 'filesystem-lineage',
        outputs: {},
        resources: [{ mode: 'managed', type: 'aws_s3_bucket', name: 'assets', instances: [{ attributes: { id: 'assets' } }] }],
      }));
      const plugin = new TfStatePlugin({
        logLevel: 'silent',
        asyncPartitions: false,
        trackDiffs: false,
        driver: 'filesystem',
        config: { basePath: context.tempDir, selector: '*.tfstate' },
      });
      await context.database.usePlugin(plugin);

      const result = await plugin.triggerMonitoring();

      expect(result).toMatchObject({ totalFiles: 1, newFiles: 1, changedFiles: 0 });
      expect((await plugin.stateFilesResource.list())[0]?.lineageId).toBe('filesystem-lineage');
      expect((await plugin.resource.list())[0]?.lineageId).toBe('filesystem-lineage');
    } finally {
      await context.cleanup();
    }
  });
});
