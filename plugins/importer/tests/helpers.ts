import { Baldim, type DatabaseOptions } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';

let sequence = 0;

export function createDatabaseForTest(testName: string, options: Partial<DatabaseOptions> = {}): Baldim {
  MemoryClient.clearAllStorage();
  return new Baldim({
    connectionString: `memory://importer-${++sequence}`,
    logLevel: 'silent',
    name: testName,
    ...options,
  });
}
