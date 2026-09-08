import { randomBytes } from 'node:crypto';
import type { LogLevel, Logger, MonitoringConfig, QueueStats, TaskManager } from './types.js';

export interface ErrorContext {
  statusCode?: number;
  code?: string;
  retriable?: boolean;
  suggestion?: string;
  original?: unknown;
  [key: string]: unknown;
}

export class BaseError extends Error {
  statusCode: number;
  code?: string;
  retriable: boolean;
  suggestion?: string;
  original?: unknown;
  data: ErrorContext;

  constructor(message: string, context: ErrorContext = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = context.statusCode ?? 500;
    this.code = context.code;
    this.retriable = context.retriable ?? false;
    this.suggestion = context.suggestion;
    this.original = context.original;
    this.data = context;
  }
}

export class DatabaseError extends BaseError {}
export class ResourceError extends BaseError {}
export class ValidationError extends BaseError {}
export class MetadataLimitError extends BaseError {}

export function mapAwsError(error: Error, context: ErrorContext = {}): BaseError {
  if (error instanceof BaseError) return error;
  return new DatabaseError(error.message || 'Storage operation failed', { ...context, original: error });
}

export function normalizeEtagHeader(headerValue: string | undefined | null): string[] {
  if (headerValue === undefined || headerValue === null) return [];
  return String(headerValue).split(',').map(value => value.trim()).filter(Boolean)
    .map(value => value.replace(/^W\//i, '').replace(/^['"]|['"]$/g, ''));
}

export function idGenerator(size = 22): string {
  return randomBytes(Math.ceil(size * 0.75) + 2).toString('base64url').slice(0, size);
}

export type TryResult<T> = [true, null, T] | [false, Error, undefined];
export async function tryFn<T>(fn: () => Promise<T> | T): Promise<TryResult<T>> {
  try {
    return [true, null, await fn()];
  } catch (error) {
    return [false, error instanceof Error ? error : new Error(String(error)), undefined];
  }
}

const noOp = (): void => {};
export function createLogger(options: { name: string; level: LogLevel }): Logger {
  if (options.level === 'silent') return { debug: noOp, info: noOp, warn: noOp, error: noOp, trace: noOp };
  const write = (method: 'debug' | 'info' | 'warn' | 'error') => (obj: unknown, msg?: string): void => {
    const logger = console[method] || console.log;
    if (msg) logger(`[${options.name}] ${msg}`, obj);
    else logger(`[${options.name}]`, obj);
  };
  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error'), trace: write('debug') };
}

interface RunnerOptions {
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  monitoring?: MonitoringConfig;
}

export class TasksRunner implements TaskManager {
  concurrency: number;
  private retries: number;
  private retryDelay: number;
  private timeout: number;
  private completed = 0;
  private failed = 0;

  constructor(options: RunnerOptions = {}) {
    this.concurrency = Math.max(1, Math.trunc(options.concurrency ?? 5));
    this.retries = Math.max(0, Math.trunc(options.retries ?? 3));
    this.retryDelay = Math.max(0, options.retryDelay ?? 1000);
    this.timeout = Math.max(0, options.timeout ?? 30000);
  }

  async process<T, R>(items: T[], handler: (item: T, index: number) => Promise<R> | R): Promise<{ results: R[]; errors: Error[] }> {
    const values = new Array<R | undefined>(items.length);
    const failures: Error[] = [];
    let next = 0;
    const runOne = async (item: T, index: number): Promise<R> => {
      let lastError: Error | undefined;
      for (let attempt = 0; attempt <= this.retries; attempt += 1) {
        try {
          const task = Promise.resolve(handler(item, index));
          if (!this.timeout) return await task;
          return await Promise.race([
            task,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Task timed out after ${this.timeout}ms`)), this.timeout)),
          ]);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt < this.retries && this.retryDelay) await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
      throw lastError ?? new Error('Task failed');
    };
    const worker = async (): Promise<void> => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        try {
          values[index] = await runOne(items[index]!, index);
          this.completed += 1;
        } catch (error) {
          failures.push(error instanceof Error ? error : new Error(String(error)));
          this.failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, items.length) }, () => worker()));
    return { results: values.filter((value): value is R => value !== undefined), errors: failures };
  }

  getStats(): QueueStats {
    return { pending: 0, active: 0, completed: this.completed, failed: this.failed };
  }

  getAggregateMetrics(): QueueStats {
    return this.getStats();
  }

  destroy(): void {}
}
