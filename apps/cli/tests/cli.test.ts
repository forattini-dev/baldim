import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { MigrationManager } from '../src/migration-manager.js';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('@baldin/cli', () => {
  it('ships a runnable Baldin command', async () => {
    const entrypoint = new URL('../dist/index.js', import.meta.url);
    const { stdout } = await execFileAsync(process.execPath, [entrypoint.pathname, '--help']);

    expect(stdout).toContain('Baldin CLI');
    expect(stdout).toContain('mcp              Start the Baldin MCP');
    expect(stdout).not.toContain('s3db.js');
  });

  it('generates executable migration modules', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'baldin-cli-'));
    temporaryDirectories.push(directory);
    const manager = new MigrationManager(null, directory);
    const generated = await manager.generate('create_users');
    const source = await readFile(generated.filepath, 'utf8');

    expect(generated.filename).toMatch(/_create_users\.js$/);
    expect(source).toContain('export async function up(database)');
    expect(source).toContain('export async function down(database)');
  });
});
