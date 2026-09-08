import { Baldin, type Database, type DatabaseOptions } from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';

let sequence = 0;

export function createDatabaseForTest(label: string, options: Partial<DatabaseOptions> = {}): Database {
  const safeLabel = label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return new Baldin({
    connectionString: `memory://state-machine-${safeLabel}-${++sequence}`,
    logLevel: 'silent',
    ...options,
  });
}

export function clearStateMachineTestStorage(): void {
  MemoryClient.clearAllStorage();
}
