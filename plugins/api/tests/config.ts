import { Baldin, ProcessManager } from '@baldin/core';
import { CronManager } from '@baldin/core/plugin';
import { MemoryClient } from '@baldin/adapter-memory';

let databaseCounter = 0;

export const sleep = (milliseconds: number): Promise<void> => (
  new Promise((resolve) => setTimeout(resolve, milliseconds))
);

export function createMemoryDatabaseForTest(
  testName: string,
  options: Record<string, unknown> = {},
): Baldin {
  databaseCounter += 1;
  const keyPrefix = [
    'suite=plugin-api',
    testName.replace(/[^a-zA-Z0-9_-]/g, '-'),
    `${Date.now()}-${databaseCounter}`,
  ].join('/');

  return new Baldin({
    client: new MemoryClient({
      bucket: 'baldin-tests',
      keyPrefix,
      logLevel: 'silent',
    }),
    processManager: new ProcessManager({ exitOnSignal: false, logLevel: 'silent' }),
    cronManager: new CronManager({ disabled: true, exitOnSignal: false, logLevel: 'silent' }),
    logLevel: 'silent',
    ...options,
  });
}

export function createDatabaseForTest(
  testName: string,
  options: Record<string, unknown> = {},
): Baldin {
  return createMemoryDatabaseForTest(testName, options);
}
