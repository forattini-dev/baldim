import { afterEach, describe, expect, it } from 'vitest';

interface ContractObject {
  Body?: { transformToString?: (encoding?: string) => Promise<string> };
  Metadata: Record<string, string>;
  ContentType?: string;
  ContentLength?: number;
  ETag?: string;
}

export interface StorageContractClient {
  capabilities?: { distributedMetadataLock?: boolean };
  putObject(params: {
    key: string;
    body?: string | Buffer;
    metadata?: Record<string, unknown>;
    contentType?: string;
    ifMatch?: string;
    ifNoneMatch?: string;
  }): Promise<{ ETag: string }>;
  getObject(key: string): Promise<ContractObject>;
  headObject(key: string): Promise<ContractObject>;
  exists(key: string): Promise<boolean>;
  copyObject(params: { from: string; to: string }): Promise<unknown>;
  moveObject(params: { from: string; to: string }): Promise<boolean>;
  deleteObject(key: string): Promise<unknown>;
  deleteObjects(keys: string[]): Promise<{ Deleted: Array<{ Key: string }> }>;
  listObjects(params?: {
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string | null;
  }): Promise<{
    Contents: Array<{ Key: string }>;
    IsTruncated: boolean;
    NextContinuationToken?: string | null;
  }>;
  getAllKeys(params?: { prefix?: string }): Promise<string[]>;
  destroy(): void | Promise<void>;
}

export function runStorageAdapterContract(
  adapterName: string,
  createClient: () => StorageContractClient | Promise<StorageContractClient>
): void {
  describe(`${adapterName} storage contract`, () => {
    const clients: StorageContractClient[] = [];
    const client = async (): Promise<StorageContractClient> => {
      const instance = await createClient();
      clients.push(instance);
      return instance;
    };

    afterEach(async () => {
      for (const instance of clients.splice(0)) await instance.destroy();
    });

    it('round-trips body, metadata, headers, and existence', async () => {
      const storage = await client();
      const result = await storage.putObject({
        key: 'contract/one.txt',
        body: 'hello Baldim',
        metadata: { kind: 'contract', count: 2 },
        contentType: 'text/plain',
      });

      expect(result.ETag).toBeTruthy();
      expect(await storage.exists('contract/one.txt')).toBe(true);
      const object = await storage.getObject('contract/one.txt');
      expect(await object.Body?.transformToString?.()).toBe('hello Baldim');
      expect(object.Metadata).toEqual({ kind: 'contract', count: '2' });
      expect(object.ContentType).toBe('text/plain');
      const head = await storage.headObject('contract/one.txt');
      expect(head.ContentLength).toBe(Buffer.byteLength('hello Baldim'));
      expect(head.ETag).toBe(result.ETag);
    });

    it('lists a stable paginated prefix', async () => {
      const storage = await client();
      await storage.putObject({ key: 'contract/a', body: 'a' });
      await storage.putObject({ key: 'contract/b', body: 'b' });
      await storage.putObject({ key: 'outside/c', body: 'c' });

      expect(await storage.getAllKeys({ prefix: 'contract/' })).toEqual([
        'contract/a',
        'contract/b',
      ]);
      const first = await storage.listObjects({ prefix: 'contract/', maxKeys: 1 });
      expect(first.Contents.map((entry) => entry.Key)).toEqual(['contract/a']);
      expect(first.IsTruncated).toBe(true);
      const second = await storage.listObjects({
        prefix: 'contract/',
        maxKeys: 1,
        continuationToken: first.NextContinuationToken,
      });
      expect(second.Contents.map((entry) => entry.Key)).toEqual(['contract/b']);
    });

    it('copies, moves, and deletes objects', async () => {
      const storage = await client();
      await storage.putObject({ key: 'contract/source', body: 'payload' });
      await storage.copyObject({ from: 'contract/source', to: 'contract/copy' });
      expect(await storage.exists('contract/copy')).toBe(true);
      expect(await storage.moveObject({ from: 'contract/copy', to: 'contract/moved' })).toBe(true);
      expect(await storage.exists('contract/copy')).toBe(false);
      expect(await storage.exists('contract/moved')).toBe(true);
      const deleted = await storage.deleteObjects(['contract/source', 'contract/moved']);
      expect(deleted.Deleted.map((entry) => entry.Key).sort()).toEqual([
        'contract/moved',
        'contract/source',
      ]);
    });

    it('enforces conditional writes with ETags', async () => {
      const storage = await client();
      const first = await storage.putObject({ key: 'contract/conditional', body: 'one' });
      await expect(storage.putObject({
        key: 'contract/conditional',
        body: 'duplicate',
        ifNoneMatch: '*',
      })).rejects.toMatchObject({ statusCode: 412 });
      await storage.putObject({
        key: 'contract/conditional',
        body: 'two',
        ifMatch: first.ETag,
      });
      await expect(storage.putObject({
        key: 'contract/conditional',
        body: 'stale',
        ifMatch: first.ETag,
      })).rejects.toMatchObject({ statusCode: 412 });
    });
  });
}
