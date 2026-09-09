import { Baldin, type DatabaseOptions } from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';

let sequence = 0;

export function createDatabaseForTest(testName: string, options: Partial<DatabaseOptions> = {}): Baldin {
  MemoryClient.clearAllStorage();
  return new Baldin({
    connectionString: `memory://importer-${++sequence}`,
    logLevel: 'silent',
    name: testName,
    ...options,
  });
}
