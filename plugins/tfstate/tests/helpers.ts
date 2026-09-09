import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Baldin } from '@baldin/core';
import { CronManager } from '@baldin/core/plugin';
import { MemoryClient } from '@baldin/adapter-memory';
import { TfStatePlugin } from '../src/index.js';

export async function createTfstateContext(suffix = 'default') {
  const keyPrefix = `suite=plugins/terraform-state-${suffix}/${Date.now()}-${Math.random()}`;
  const database = new Baldin({
    client: new MemoryClient({ bucket: 'baldin-tests', keyPrefix, logLevel: 'silent' }),
    cronManager: new CronManager({ disabled: true, exitOnSignal: false, logLevel: 'silent' }),
    logLevel: 'silent',
  });
  await database.connect();
  const tempDir = await mkdtemp(join(tmpdir(), `baldin-tfstate-${suffix}-`));

  return {
    database,
    tempDir,
    async cleanup() {
      await database.disconnect();
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup failures
      }
    }
  };
}

export function createStateFile(tempDir, serial, resources, options = {}) {
  const state = {
    version: options.version ?? 4,
    terraform_version: options.terraformVersion ?? '1.5.0',
    serial,
    lineage: options.lineage ?? 'example-lineage-abc-123',
    outputs: options.outputs ?? {},
    resources,
  };

  const fileName = options.fileName ?? `test-state-${serial}.tfstate`;
  const filePath = join(tempDir, fileName);
  writeFileSync(filePath, JSON.stringify(state, null, 2));
  return filePath;
}

export function createPlugin(options = {}) {
  return new TfStatePlugin(options);
}
