import { afterEach, describe, expect, it, vi } from 'vitest';
import { Baldin } from '@baldin/core';
import { AuditPlugin } from '../src/index.js';

let database: Baldin | undefined;

afterEach(async () => {
  await database?.disconnect();
  database = undefined;
});

describe('AuditPlugin', () => {
  it('installs its namespaced audit resource through the public plugin API', async () => {
    database = new Baldin({ connectionString: 'memory://audit-test', logLevel: 'silent' });
    await database.connect();

    const plugin = new AuditPlugin({ namespace: 'admin' });
    await database.usePlugin(plugin);

    expect(plugin.auditResourceName).toBe('plg_admin_audits');
    expect(database.resources.plg_admin_audits).toBeDefined();
    expect(database.plugins.audit).toBe(plugin);
  });

  it('records inserts from an existing resource', async () => {
    database = new Baldin({ connectionString: 'memory://audit-events', logLevel: 'silent' });
    await database.connect();
    const users = await database.createResource({
      name: 'users',
      attributes: { id: 'string|required', name: 'string|required' },
    });
    const plugin = new AuditPlugin();
    await database.usePlugin(plugin);
    await users.insert({ id: 'user-1', name: 'Ada' });
    await vi.waitFor(async () => {
      const records = await plugin.getAuditLogs({ resourceName: 'users' });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        resourceName: 'users',
        operation: 'insert',
        recordId: 'user-1',
      });
    });
  });
  it('preserves an explicit resource name', () => {
    const plugin = new AuditPlugin({ resourceName: 'custom_audit_log' });
    expect(plugin.auditResourceName).toBe('custom_audit_log');
  });
});