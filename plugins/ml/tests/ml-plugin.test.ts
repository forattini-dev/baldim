import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import { afterEach, describe, expect, it } from 'vitest';
import { MLPlugin } from '../src/index.js';

const databases: Baldim[] = [];

async function createDatabase(label: string): Promise<Baldim> {
  const database = new Baldim({
    client: new MemoryClient({
      bucket: `baldim-ml-${label}-${Date.now()}-${Math.random()}`,
      keyPrefix: 'tests/',
      logLevel: 'silent',
    }),
    logLevel: 'silent',
  });
  await database.connect();
  databases.push(database);
  return database;
}

afterEach(async () => {
  while (databases.length > 0) await databases.pop()!.disconnect();
});

describe('MLPlugin', () => {
  it('trains configured models and exposes the resource ML namespace', async () => {
    const database = await createDatabase('regression');
    const samples = await database.createResource({
      name: 'samples',
      timestamps: false,
      attributes: { x: 'number|required', y: 'number|required' },
    });
    for (let x = 0; x < 16; x += 1) await samples.insert({ id: String(x), x, y: 3 * x + 2 });

    const plugin = new MLPlugin({
      models: {
        linear: {
          type: 'regression',
          resource: 'samples',
          features: ['x'],
          target: 'y',
          saveModel: false,
          modelConfig: { epochs: 80, batchSize: 4, learningRate: 0.05, validationSplit: 0 },
        },
      },
      minTrainingSamples: 4,
      saveModel: false,
      enableVersioning: false,
      logLevel: 'silent',
    });
    await database.usePlugin(plugin, 'ml');

    const trained = await plugin.train('linear');
    const predicted = await plugin.predict('linear', { x: 5 });
    const resourcePrediction = await (samples as any).ml.predict({ x: 5 }, 'y');

    expect(trained).toMatchObject({ samples: 16, epochs: 80 });
    expect(predicted.prediction).toBeCloseTo(17, 0);
    expect(resourcePrediction.prediction).toBeCloseTo(17, 0);
    expect((samples as any).ml.list()).toMatchObject([{ name: 'linear', type: 'regression', isTrained: true }]);
    expect(plugin.getStats()).toMatchObject({ models: 1, trainedModels: 1, totalTrainings: 1 });
  });

  it('rejects invalid model configuration before creating model state', async () => {
    const database = await createDatabase('invalid');
    const plugin = new MLPlugin({
      models: {
        invalid: { type: 'regression', resource: 'samples', features: [], target: 'y' },
      },
      logLevel: 'silent',
    });

    await expect(database.usePlugin(plugin, 'ml')).rejects.toThrow(/feature/);
    expect(plugin.models).toEqual({});
  });
});
