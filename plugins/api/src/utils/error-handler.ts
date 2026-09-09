import type { Context } from '../http/http-runtime.js';
import { error as formatError } from './response-formatter.js';
import { createLogger } from '@baldim/core/plugin';
import type { Logger } from '@baldim/core/plugin';

const logger: Logger = createLogger({ name: 'ErrorHandler', level: 'info' });

export interface BaldimError extends Error {
  resource?: string;
  bucket?: string;
  key?: string;
  operation?: string;
  suggestion?: string;
  availableResources?: string[];
}

export interface ErrorDetails {
  resource?: string;
  bucket?: string;
  key?: string;
  operation?: string;
  suggestion?: string;
  availableResources?: string[];
  [key: string]: unknown;
}

const errorStatusMap: Record<string, number> = {
  'ValidationError': 400,
  'InvalidResourceItem': 400,
  'ResourceNotFound': 404,
  'NoSuchKey': 404,
  'NoSuchBucket': 404,
  'PartitionError': 400,
  'CryptoError': 500,
  'SchemaError': 400,
  'QueueError': 500,
  'ResourceError': 500
};

export function getStatusFromError(err: Error | BaldimError): number {
  if (err.name && errorStatusMap[err.name]) {
    return errorStatusMap[err.name]!;
  }

  if (err.constructor && err.constructor.name && errorStatusMap[err.constructor.name]) {
    return errorStatusMap[err.constructor.name]!;
  }

  if (err.message) {
    if (err.message.includes('not found') || err.message.includes('does not exist')) {
      return 404;
    }
    if (err.message.includes('validation') || err.message.includes('invalid')) {
      return 400;
    }
    if (err.message.includes('unauthorized') || err.message.includes('authentication')) {
      return 401;
    }
    if (err.message.includes('forbidden') || err.message.includes('permission')) {
      return 403;
    }
  }

  return 500;
}

export function errorHandler(err: Error | BaldimError, c: Context): Response {
  const status = getStatusFromError(err);
  const code = err.name || 'INTERNAL_ERROR';

  const details: ErrorDetails = {};

  const baldimError = err as BaldimError;
  if (baldimError.resource) details.resource = baldimError.resource;
  if (baldimError.bucket) details.bucket = baldimError.bucket;
  if (baldimError.key) details.key = baldimError.key;
  if (baldimError.operation) details.operation = baldimError.operation;
  if (baldimError.suggestion) details.suggestion = baldimError.suggestion;
  if (baldimError.availableResources) details.availableResources = baldimError.availableResources;

  const response = formatError(err, {
    status,
    code,
    details
  });

  const logLevel = c?.get?.('logLevel');
  if (logLevel === 'debug' || logLevel === 'trace') {
    if (status >= 500) {
      logger.error({
        message: err.message,
        code,
        status,
        stack: err.stack,
        details
      }, '[API Plugin] Error');
    } else if (status >= 400 && status < 500) {
      logger.warn({
        message: err.message,
        code,
        status,
        details
      }, '[API Plugin] Client error');
    }
  }

  return c.json(response, response._status as Parameters<typeof c.json>[1]);
}

export type AsyncRouteHandler = (c: Context) => Promise<Response>;

export function asyncHandler(fn: AsyncRouteHandler): AsyncRouteHandler {
  return async (c: Context): Promise<Response> => {
    try {
      return await fn(c);
    } catch (err) {
      return errorHandler(err as Error, c);
    }
  };
}

export type TryApiCallResult<T> = [true, null, T] | [false, Error, Response];

export async function tryApiCall<T>(fn: () => Promise<T>, c: Context): Promise<TryApiCallResult<T>> {
  try {
    const result = await fn();
    return [true, null, result];
  } catch (err) {
    const response = errorHandler(err as Error, c);
    return [false, err as Error, response];
  }
}

export default {
  errorHandler,
  asyncHandler,
  tryApiCall,
  getStatusFromError
};
