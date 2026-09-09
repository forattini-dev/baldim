import { Baldin } from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';

let sequence = 0;

export function createMemoryDatabaseForTest(scope: string): Baldin {
  return new Baldin({
    client: new MemoryClient({
      bucket: 'baldin-tests',
      keyPrefix: `cookie-farm-suite/${scope}/${Date.now()}-${++sequence}`,
      logLevel: 'silent',
    }),
    logLevel: 'silent',
  });
}
