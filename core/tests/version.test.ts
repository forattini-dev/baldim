import { Baldim } from '../src/index.js';
import { readFileSync } from 'node:fs';

const packageVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

describe('runtime version', () => {
  it('reports the published package version', () => {
    const database = new Baldim({ connectionString: 'memory://version-test', logLevel: 'silent' });

    expect(database.s3dbVersion).toBe(packageVersion);
  });
});
