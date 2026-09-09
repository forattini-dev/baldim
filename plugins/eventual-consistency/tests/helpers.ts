import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import { CronManager } from '@baldim/core/plugin';

let databaseCounter = 0;

export function createDatabaseForTest(
  testName: string,
  options: Record<string, unknown> = {},
): Baldim {
  const suffix = `${Date.now()}-${++databaseCounter}`;
  const client = options.client ?? new MemoryClient({
    bucket: 'baldim-tests',
    keyPrefix: `${testName}/${suffix}`,
    logLevel: 'silent',
  });
  const cronManager = options.cronManager ?? new CronManager({
    disabled: true,
    exitOnSignal: false,
    logLevel: 'silent',
  });

  return new Baldim({
    ...options,
    client,
    cronManager,
    logLevel: 'silent',
  });
}
