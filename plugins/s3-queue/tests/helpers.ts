import { Baldin } from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';
import { CronManager } from '@baldin/core/plugin';

let databaseCounter = 0;

export function createDatabaseForTest(
  testName: string,
  options: Record<string, unknown> = {},
): Baldin {
  const suffix = `${Date.now()}-${++databaseCounter}`;
  const client = options.client ?? new MemoryClient({
    bucket: 'baldin-tests',
    keyPrefix: `${testName}/${suffix}`,
    logLevel: 'silent',
  });
  const cronManager = options.cronManager ?? new CronManager({
    disabled: true,
    exitOnSignal: false,
    logLevel: 'silent',
  });

  return new Baldin({
    ...options,
    client,
    cronManager,
    logLevel: 'silent',
  });
}
