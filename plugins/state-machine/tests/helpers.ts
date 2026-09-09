import { Baldim, type Database, type DatabaseOptions } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';

let sequence = 0;

export function createDatabaseForTest(label: string, options: Partial<DatabaseOptions> = {}): Database {
  const safeLabel = label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return new Baldim({
    connectionString: `memory://state-machine-${safeLabel}-${++sequence}`,
    logLevel: 'silent',
    ...options,
  });
}

export function clearStateMachineTestStorage(): void {
  MemoryClient.clearAllStorage();
}
