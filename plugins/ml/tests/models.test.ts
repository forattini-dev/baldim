import { afterEach, describe, expect, it } from 'vitest';
import {
  ClassificationModel,
  NeuralNetworkModel,
  RegressionModel,
  TimeSeriesModel,
} from '../src/index.js';

const disposables: Array<{ dispose?: () => void }> = [];

afterEach(() => {
  while (disposables.length > 0) disposables.pop()!.dispose?.();
});

describe('ML models', () => {
  it('trains, predicts, and exports a regression model with bundled TensorFlow.js', async () => {
    const model = new RegressionModel({
      name: 'linear',
      features: ['x'],
      target: 'y',
      minSamples: 4,
      logLevel: 'silent',
      modelConfig: { epochs: 80, batchSize: 4, learningRate: 0.05, validationSplit: 0 },
    });
    disposables.push(model);
    const samples = Array.from({ length: 20 }, (_, x) => ({ x, y: 2 * x + 1 }));

    const trained = await model.train(samples);
    const result = await model.predict({ x: 6 });
    const exported = await model.export();

    expect(trained).toMatchObject({ epochs: 80, samples: 20 });
    expect(result.prediction).toBeCloseTo(13, 0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(exported).toMatchObject({ type: 'regression', config: { name: 'linear', target: 'y' } });
  });

  it('trains a binary classifier and returns labels and probabilities', async () => {
    const model = new ClassificationModel({
      name: 'threshold',
      features: ['value'],
      target: 'label',
      minSamples: 4,
      logLevel: 'silent',
      modelConfig: { epochs: 100, batchSize: 4, learningRate: 0.05, validationSplit: 0, dropout: 0 },
    });
    disposables.push(model);
    const samples = Array.from({ length: 24 }, (_, value) => ({
      value,
      label: value < 12 ? 'low' : 'high',
    }));

    const trained = await model.train(samples);
    const low = await model.predict({ value: 2 });
    const high = await model.predict({ value: 22 });

    expect(trained.samples).toBe(24);
    expect(low.prediction).toBe('low');
    expect(high.prediction).toBe('high');
    expect(low.probabilities).toHaveProperty('low');
    expect(high.probabilities).toHaveProperty('high');
  });

  it('trains and predicts the next point in a time series', async () => {
    const model = new TimeSeriesModel({
      name: 'series',
      features: ['step'],
      target: 'value',
      minSamples: 4,
      logLevel: 'silent',
      modelConfig: {
        epochs: 8,
        batchSize: 2,
        learningRate: 0.05,
        validationSplit: 0,
        lookback: 3,
        lstmUnits: 4,
        denseUnits: 4,
        dropout: 0,
        recurrentDropout: 0,
      },
    });
    disposables.push(model);
    const samples = Array.from({ length: 12 }, (_, step) => ({ step, value: step * 2 }));

    const trained = await model.train(samples);
    const predicted = await model.predict(samples.slice(-3));

    expect(trained.samples).toBe(12);
    expect(predicted.prediction).toEqual(expect.any(Number));
    expect(await model.predictMultiStep(samples.slice(-3), 2)).toHaveLength(2);
  });

  it('supports a custom neural-network architecture', async () => {
    const model = new NeuralNetworkModel({
      name: 'custom',
      features: ['x'],
      target: 'y',
      minSamples: 4,
      logLevel: 'silent',
      modelConfig: {
        epochs: 20,
        batchSize: 4,
        learningRate: 0.05,
        validationSplit: 0,
        layers: [{ units: 8, activation: 'relu' }],
      },
    });
    disposables.push(model);
    const samples = Array.from({ length: 16 }, (_, x) => ({ x, y: x * x }));

    const trained = await model.train(samples);
    const architecture = model.getArchitecture();

    expect(trained.samples).toBe(16);
    expect(architecture).toMatchObject({
      inputFeatures: ['x'],
      hiddenLayers: [{ index: 0, units: 8, activation: 'relu' }],
      outputLayer: { units: 1, activation: 'linear' },
    });
    expect(architecture.totalParameters).toBeGreaterThan(0);
  });
});
