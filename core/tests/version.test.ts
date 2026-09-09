import { Baldin } from '../src/index.js';

describe('runtime version', () => {
  it('reports the published package version', () => {
    const database = new Baldin({ connectionString: 'memory://version-test', logLevel: 'silent' });

    expect(database.s3dbVersion).toBe('0.1.0');
  });
});
