import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Baldin } from '@baldin/core';
import { MemoryClient } from '@baldin/adapter-memory';

let sequence = 0;

export function createMemoryDatabaseForTest(name = 'cache-test') {
  MemoryClient.clearAllStorage();
  sequence += 1;
  return new Baldin({ connectionString: `memory://${name}-${sequence}`, logLevel: 'silent' });
}

export function createTemporaryPathForTest(prefix = 'baldin-cache') {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}
