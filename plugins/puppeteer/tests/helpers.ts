import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';

let sequence = 0;

export function createDatabaseForTest(scope: string): Baldim {
  return new Baldim({
    client: new MemoryClient({
      bucket: 'baldim-tests',
      keyPrefix: `puppeteer/${scope}/${Date.now()}-${++sequence}`,
      logLevel: 'silent',
    }),
    logLevel: 'silent',
  });
}
