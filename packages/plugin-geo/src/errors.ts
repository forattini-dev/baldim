import { StorageError } from '@baldin/core';

export interface GeoErrorDetails {
  resourceName?: string;
  operation?: string;
  coordinates?: unknown;
  description?: string;
  [key: string]: unknown;
}

export class GeoError extends StorageError {
  constructor(message: string, details: GeoErrorDetails = {}) {
    const { resourceName, operation = 'unknown', ...rest } = details;
    super(message, {
      ...rest,
      resourceName,
      operation,
      description: details.description || [
        'Baldin Geo Plugin Error',
        `Operation: ${operation}`,
        resourceName ? `Resource: ${resourceName}` : '',
        'Check coordinate ranges, configured fields, precision, and partition settings.',
      ].filter(Boolean).join('\n'),
    });
  }
}

export default GeoError;
