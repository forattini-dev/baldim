import { Baldin } from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';

let sequence = 0;

export function createDatabaseForTest(scope: string): Baldin {
  return new Baldin({
    client: new MemoryClient({
      bucket: 'baldin-tests',
      keyPrefix: `puppeteer/${scope}/${Date.now()}-${++sequence}`,
      logLevel: 'silent',
    }),
    logLevel: 'silent',
  });
}
