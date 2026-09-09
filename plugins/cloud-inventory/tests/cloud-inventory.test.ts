import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CloudInventoryPlugin,
  type CloudResource,
} from '../src/index.js';
import {
  BaseCloudDriver,
  registerCloudDriver,
} from '../src/cloud-inventory/index.js';

class FixtureDriver extends BaseCloudDriver {
  initialized = false;
  destroyed = false;
  resources: CloudResource[];

  constructor(driver: string, resources: CloudResource[]) {
    super({ driver });
    this.resources = resources;
  }

  override async initialize(): Promise<void> {
    this.initialized = true;
  }

  override async destroy(): Promise<void> {
    this.destroyed = true;
  }

  override async *listResources(): AsyncGenerator<CloudResource> {
    for (const resource of this.resources) yield structuredClone(resource);
  }
}

const databases: Baldim[] = [];

async function createDatabase(label: string): Promise<Baldim> {
  const database = new Baldim({
    client: new MemoryClient({
      bucket: `baldim-cloud-inventory-${label}-${Date.now()}-${Math.random()}`,
      keyPrefix: 'tests/',
      logLevel: 'silent',
    }),
    logLevel: 'silent',
  });
  await database.connect();
  databases.push(database);
  return database;
}

function server(size: string): CloudResource {
  return {
    provider: 'fixture',
    accountId: 'account-1',
    region: 'test-1',
    service: 'compute',
    resourceType: 'fixture.compute.server',
    resourceId: 'server-1',
    name: 'web',
    tags: { environment: 'test' },
    configuration: { size, enabled: true },
  };
}

afterEach(async () => {
  while (databases.length > 0) await databases.pop()!.disconnect();
});

describe('CloudInventoryPlugin', () => {
  it('persists snapshots, versions, changes, and cloud summaries', async () => {
    const database = await createDatabase('history');
    const driverName = `fixture-history-${Date.now()}-${Math.random()}`;
    const driver = new FixtureDriver(driverName, [server('small')]);
    registerCloudDriver(driverName, () => driver);
    const plugin = new CloudInventoryPlugin({
      clouds: [{ id: 'production', driver: driverName, credentials: {} }],
      discovery: { runOnInstall: false },
      logLevel: 'silent',
    });

    await database.usePlugin(plugin, 'cloud');
    expect(driver.initialized).toBe(true);

    await expect(plugin.syncCloud('production')).resolves.toMatchObject({
      created: 1,
      updated: 0,
      unchanged: 0,
      processed: 1,
    });
    await expect(plugin.syncCloud('production')).resolves.toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
    });

    driver.resources = [server('large')];
    await expect(plugin.syncCloud('production')).resolves.toMatchObject({
      created: 0,
      updated: 1,
      unchanged: 0,
    });

    const snapshots = await database.resources[plugin.resourceNames.snapshots]!.query();
    const versions = await database.resources[plugin.resourceNames.versions]!.query();
    const changes = await database.resources[plugin.resourceNames.changes]!.query();
    const summary = await database.resources[plugin.resourceNames.clouds]!.get('production');

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ latestVersion: 2, changelogSize: 1, name: 'web' });
    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.version).sort()).toEqual([1, 2]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ fromVersion: 1, toVersion: 2 });
    expect(summary).toMatchObject({ status: 'idle', totalResources: 1, totalVersions: 2 });
  });

  it('validates configuration and destroys drivers during shutdown', async () => {
    const invalidDatabase = await createDatabase('invalid');
    await expect(invalidDatabase.usePlugin(new CloudInventoryPlugin({ logLevel: 'silent' }), 'cloud'))
      .rejects.toThrow(/requires a "clouds" array/);

    const database = await createDatabase('shutdown');
    const driverName = `fixture-shutdown-${Date.now()}-${Math.random()}`;
    const driver = new FixtureDriver(driverName, []);
    registerCloudDriver(driverName, () => driver);
    const plugin = new CloudInventoryPlugin({
      clouds: [{ id: 'production', driver: driverName, credentials: {} }],
      discovery: { runOnInstall: false },
      logLevel: 'silent',
    });
    await database.usePlugin(plugin, 'cloud');
    await database.disconnect();
    databases.splice(databases.indexOf(database), 1);

    expect(driver.destroyed).toBe(true);
    expect(plugin.cloudDrivers.size).toBe(0);
  });
});
