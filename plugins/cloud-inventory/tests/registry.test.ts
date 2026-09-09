import { describe, expect, it } from 'vitest';
import {
  BaseCloudDriver,
  createCloudDriver,
  listCloudDrivers,
  registerCloudDriver,
} from '../src/cloud-inventory/index.js';

describe('cloud inventory driver registry', () => {
  it('registers and creates custom drivers', async () => {
    class FixtureDriver extends BaseCloudDriver {
      async listResources() {
        return [{ provider: 'fixture', resourceId: 'fixture-1', resourceType: 'fixture.item' }];
      }
    }

    const name = `fixture-${Date.now()}-${Math.random()}`;
    registerCloudDriver(name, (options = {}) => new FixtureDriver({ driver: name, ...options }));

    expect(listCloudDrivers()).toContain(name);
    await expect(createCloudDriver(name, { config: { region: 'test' } })).resolves.toBeInstanceOf(FixtureDriver);
  });

  it('does not expose removed mock aliases', () => {
    expect(listCloudDrivers()).not.toEqual(expect.arrayContaining(['aws-mock', 'gcp-mock', 'azure-mock']));
  });
});
