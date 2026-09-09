import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createTemporaryPathForTest(scope: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `baldin-vector-${scope}-`));
}
