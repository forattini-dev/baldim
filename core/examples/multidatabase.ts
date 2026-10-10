import { randomUUID } from 'node:crypto';
import { DatabaseManager } from '@baldim/core';

export async function multidatabaseExample() {
  const namespace = randomUUID();
  const manager = new DatabaseManager({
    default: 'primary',
    defaults: { logLevel: 'silent', exitOnSignal: false },
    connections: {
      primary: { connectionString: `memory://docs-primary-${namespace}` },
      analytics: { connectionString: `memory://docs-analytics-${namespace}` },
    },
  });
  await manager.connect();
  try {
    const users = await manager.createResource({
      name: 'users',
      attributes: { name: 'string|required' },
    }); // no connection: uses primary
    const events = await manager.createResource({
      connection: 'analytics',
      name: 'events',
      attributes: { type: 'string|required' },
    });
    await users.insert({ id: 'ada', name: 'Ada' });
    await events.insert({ id: 'login-1', type: 'login' });
    const unified = await manager.resource('events').get('login-1');
    const local = await manager
      .connection('analytics')
      .resources.events!.get('login-1');
    return {
      unified,
      local,
      owner: manager.getConnectionForResource('events'),
      names: manager.connectionNames,
    };
  } finally {
    await manager.disconnect();
  }
}
