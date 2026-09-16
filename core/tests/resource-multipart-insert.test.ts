import { afterEach, describe, expect, it, vi } from 'vitest';
import { Baldim } from '../src/index.js';
import { MemoryClient } from '@baldim/adapter-memory';

describe('Resource.insert multipart option', () => {
  const databases: Baldim[] = [];

  afterEach(async () => {
    for (const database of databases.splice(0)) {
      if (database.isConnected()) await database.disconnect();
    }
  });

  async function createVideosResource() {
    const database = new Baldim({ connectionString: `memory://multipart-insert-${databases.length}`, logLevel: 'silent' });
    databases.push(database);
    await database.connect();
    return await database.createResource({
      name: 'videos',
      attributes: { title: 'string' },
    });
  }

  it('routes the object write through putObjectMultipart when multipart is requested', async () => {
    const videos = await createVideosResource();
    const client = (videos as unknown as { client: MemoryClient }).client;
    const calls: Array<Record<string, unknown>> = [];
    (client as unknown as Record<string, unknown>).putObjectMultipart = vi.fn(async (params: Record<string, unknown>) => {
      calls.push(params);
      return await (client as unknown as { putObject: (p: Record<string, unknown>) => Promise<unknown> }).putObject(params);
    });

    const inserted = await videos.insert({ id: 'v1', title: 'Big' }, { multipart: true });

    expect(inserted.id).toBe('v1');
    expect(calls).toHaveLength(1);
    expect(String(calls[0]!.key)).toContain('v1');
    expect(await videos.get('v1')).toMatchObject({ title: 'Big' });
  });

  it('passes partSize and queueConcurrency through to the client', async () => {
    const videos = await createVideosResource();
    const client = (videos as unknown as { client: MemoryClient }).client;
    const calls: Array<Record<string, unknown>> = [];
    (client as unknown as Record<string, unknown>).putObjectMultipart = vi.fn(async (params: Record<string, unknown>) => {
      calls.push(params);
      return await (client as unknown as { putObject: (p: Record<string, unknown>) => Promise<unknown> }).putObject(params);
    });

    await videos.insert({ id: 'v2', title: 'Bigger' }, { multipart: { partSize: 16 * 1024 * 1024, queueConcurrency: 2 } });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.partSize).toBe(16 * 1024 * 1024);
    expect(calls[0]!.queueConcurrency).toBe(2);
  });

  it('rejects with a clear error when the storage client has no multipart support', async () => {
    const videos = await createVideosResource();

    await expect(videos.insert({ id: 'v3', title: 'No multipart' }, { multipart: true }))
      .rejects.toThrow(/does not support multipart uploads/);
    await expect(videos.get('v3')).rejects.toThrow();
  });

  it('rejects an insert when the id already exists', async () => {
    const videos = await createVideosResource();
    const client = (videos as unknown as { client: MemoryClient }).client;
    (client as unknown as Record<string, unknown>).putObjectMultipart = vi.fn(async (params: Record<string, unknown>) => {
      return await (client as unknown as { putObject: (p: Record<string, unknown>) => Promise<unknown> }).putObject(params);
    });

    await videos.insert({ id: 'v4', title: 'First' }, { multipart: true });
    await expect(videos.insert({ id: 'v4', title: 'Second' }, { multipart: true }))
      .rejects.toThrow(/already exists/);
  });

  it('keeps the default putObject path when multipart is not requested', async () => {
    const videos = await createVideosResource();
    const client = (videos as unknown as { client: MemoryClient }).client;
    const multipartSpy = vi.fn();
    (client as unknown as Record<string, unknown>).putObjectMultipart = multipartSpy;

    const inserted = await videos.insert({ id: 'v5', title: 'Regular' });

    expect(inserted.id).toBe('v5');
    expect(multipartSpy).not.toHaveBeenCalled();
    expect(await videos.get('v5')).toMatchObject({ title: 'Regular' });
  });
});
