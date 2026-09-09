import { describe, expect, it } from 'vitest';
import { loadCloudDriver } from '../src/cloud-inventory/index.js';

describe('bundled cloud inventory drivers', () => {
  it.each([
    'aws',
    'gcp',
    'azure',
    'digitalocean',
    'oracle',
    'vultr',
    'linode',
    'hetzner',
    'alibaba',
    'cloudflare',
    'mongodbatlas',
  ])('loads the %s driver and its package-owned SDKs', async (provider) => {
    await expect(loadCloudDriver(provider)).resolves.toEqual(expect.any(Function));
  });
});
