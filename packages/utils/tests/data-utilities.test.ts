import { describe, expect, it } from 'vitest';
import { ValidationError } from '@baldin/core';
import { ErrorClassifier, NON_RETRIABLE, RETRIABLE } from '../src/error-classifier.js';
import { bytesToMB, getMemoryUsage, MemorySampler } from '../src/memory-profiler.js';
import { decodeMoney, encodeMoney, formatMoney, getCurrencyDecimals } from '../src/money.js';
import { compareEncodings, optimizedDecode, optimizedEncode } from '../src/optimized-encoding.js';

describe('error classification', () => {
  it('distinguishes transient failures from validation failures', () => {
    expect(ErrorClassifier.classify(Object.assign(new Error('offline'), { code: 'ECONNRESET' }))).toBe(RETRIABLE);
    expect(ErrorClassifier.classify(Object.assign(new Error('bad input'), { name: 'ValidationError' }))).toBe(NON_RETRIABLE);
    expect(ErrorClassifier.isRetriable(Object.assign(new Error('busy'), { statusCode: 503 }))).toBe(true);
  });
});

describe('money helpers', () => {
  it('round-trips currency values using their smallest unit', () => {
    expect(decodeMoney(encodeMoney(123.45, 'BRL'), 'BRL')).toBe(123.45);
    expect(decodeMoney(encodeMoney(42, 'JPY'), 'JPY')).toBe(42);
    expect(getCurrencyDecimals('btc')).toBe(8);
    expect(formatMoney(12.5, 'BRL', 'pt-BR')).toContain('12,50');
  });

  it('rejects negative monetary values', () => {
    expect(() => encodeMoney(-1)).toThrow(ValidationError);
  });
});

describe('optimized encoding', () => {
  it.each(['plain text', 'YWJj', 'olá 👋', '', null, undefined])('round-trips %j', value => {
    expect(optimizedDecode(optimizedEncode(value))).toBe(value);
  });

  it('reports which compact representation was selected', () => {
    expect(compareEncodings('plain text')).toMatchObject({ optimizedMethod: 'none' });
  });
});

describe('memory profiling', () => {
  it('returns normalized memory data and bounded samples', () => {
    const usage = getMemoryUsage();
    expect(usage.heapUsed).toBeGreaterThan(0);
    expect(bytesToMB(1024 * 1024)).toBe(1);

    const sampler = new MemorySampler({ maxSamples: 2 });
    sampler.sample();
    sampler.sample();
    sampler.sample();
    expect(sampler.getSamples()).toHaveLength(2);
    expect(sampler.getStats()?.sampleCount).toBe(2);
  });
});
