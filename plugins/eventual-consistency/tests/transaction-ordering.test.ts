import { describe, expect, it } from 'vitest';
import {
  compareTransactionsByTimestamp,
  generateTransactionId,
  type Transaction
} from '../src/utils.js';

function transaction(id: string, operation: Transaction['operation']): Transaction {
  return {
    id,
    originalId: 'user-1',
    field: 'balance',
    value: 1,
    operation,
    timestamp: '2026-09-09T12:00:00.000Z',
    cohortDate: '2026-09-09',
    cohortHour: '2026-09-09T12',
    applied: false
  };
}

describe('transaction ordering', () => {
  it('preserves creation order when several operations share one millisecond', () => {
    const timestamp = Date.parse('2026-09-09T12:00:00.000Z');
    const set = transaction(generateTransactionId(timestamp), 'set');
    const add = transaction(generateTransactionId(timestamp), 'add');
    const subtract = transaction(generateTransactionId(timestamp), 'sub');

    expect([subtract, set, add].sort(compareTransactionsByTimestamp)).toEqual([
      set,
      add,
      subtract
    ]);
  });
});
