import { MemoryClient } from '@baldim/adapter-memory';
import { Baldim } from '@baldim/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReconPlugin } from '../src/index.js';

const databases: Baldim[] = [];

afterEach(async () => {
  while (databases.length > 0) await databases.pop()!.disconnect();
});

describe('ReconPlugin with Baldim', () => {
  it('initializes resources and manages persisted targets through its public API', async () => {
    const database = new Baldim({
      client: new MemoryClient({
        bucket: `baldim-recon-${Date.now()}-${Math.random()}`,
        keyPrefix: 'tests/',
        logLevel: 'silent',
      }),
      logLevel: 'silent',
    });
    await database.connect();
    databases.push(database);

    const recon = new ReconPlugin({
      behavior: 'passive',
      scheduler: { enabled: false },
      logLevel: 'silent',
    });
    vi.spyOn(recon.commandRunner, 'isRedBlueAvailable').mockResolvedValue(true);

    await database.usePlugin(recon, 'recon');

    expect(recon.initialized).toBe(true);
    expect(database.resources.plg_recon_hosts).toBeDefined();
    expect(database.resources.plg_recon_targets).toBeDefined();

    const target = await recon.addTarget('https://example.com/path');
    expect(target).toMatchObject({
      id: 'example.com',
      host: 'example.com',
      protocol: 'https',
      path: '/path',
    });
    expect(await recon.listTargets()).toHaveLength(1);
    await expect(recon.removeTarget('example.com')).resolves.toBe(true);
    expect(await recon.listTargets()).toHaveLength(0);

    await expect(recon.getToolStatus()).resolves.toMatchObject({
      rb: { available: true, required: true },
    });
    await expect(recon.isToolAvailable('rb')).resolves.toBe(true);
  });
});
