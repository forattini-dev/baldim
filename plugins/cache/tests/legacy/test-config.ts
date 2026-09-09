import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';

let sequence = 0;

export function createMemoryDatabaseForTest(name = 'cache-test') {
  MemoryClient.clearAllStorage();
  sequence += 1;
  return new Baldim({ connectionString: `memory://${name}-${sequence}`, logLevel: 'silent' });
}

export function createTemporaryPathForTest(prefix = 'baldim-cache') {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}
