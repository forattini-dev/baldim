import { Baldin } from '@baldin/core';

export function createMemoryDatabaseForTest(
  name: string,
  options: Record<string, unknown> = {},
): Baldin {
  return new Baldin({
    connectionString: `memory://${name}`,
    ...options,
  });
}
