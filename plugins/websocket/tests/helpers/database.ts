import { Baldim } from '@baldim/core';

export function createMemoryDatabaseForTest(
  name: string,
  options: Record<string, unknown> = {},
): Baldim {
  return new Baldim({
    connectionString: `memory://${name}`,
    ...options,
  });
}
