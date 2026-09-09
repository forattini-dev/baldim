import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';

let sequence = 0;

export function createMemoryDatabaseForTest(scope: string): Baldim {
  return new Baldim({
    client: new MemoryClient({
      bucket: 'baldim-tests',
      keyPrefix: `cookie-farm/${scope}/${Date.now()}-${++sequence}`,
      logLevel: 'silent',
    }),
    logLevel: 'silent',
  });
}
