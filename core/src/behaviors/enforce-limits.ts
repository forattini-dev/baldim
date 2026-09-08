import { calculateTotalSize, calculateEffectiveLimit } from '../concerns/calculator.js';
import { MetadataLimitError } from '../errors.js';
import type { StringRecord } from '../types/common.types.js';
import type {
  BehaviorHandleInsertParams,
  BehaviorHandleUpdateParams,
  BehaviorHandleUpsertParams,
  BehaviorHandleGetParams,
  BehaviorResult,
  BehaviorGetResult
} from './types.js';

export const DEFAULT_METADATA_LIMIT_BYTES = 2047;
/** @deprecated Use DEFAULT_METADATA_LIMIT_BYTES. */
export const S3_METADATA_LIMIT_BYTES = DEFAULT_METADATA_LIMIT_BYTES;

export async function handleInsert({ resource, data, mappedData }: BehaviorHandleInsertParams): Promise<BehaviorResult> {
  const totalSize = calculateTotalSize(mappedData);

  const effectiveLimit = calculateEffectiveLimit({
    storageLimit: resource.metadataLimit ?? DEFAULT_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id: data.id as string
    }
  });

  if (totalSize > effectiveLimit) {
    throw new MetadataLimitError('Metadata size exceeds 2KB limit on insert', {
      totalSize,
      effectiveLimit,
      absoluteLimit: resource.metadataLimit ?? DEFAULT_METADATA_LIMIT_BYTES,
      excess: totalSize - effectiveLimit,
      resourceName: resource.name,
      operation: 'insert'
    });
  }

  return { mappedData, body: '' };
}

export async function handleUpdate({ resource, id, mappedData }: BehaviorHandleUpdateParams): Promise<BehaviorResult> {
  const totalSize = calculateTotalSize(mappedData);

  const effectiveLimit = calculateEffectiveLimit({
    storageLimit: resource.metadataLimit ?? DEFAULT_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id
    }
  });

  if (totalSize > effectiveLimit) {
    throw new MetadataLimitError('Metadata size exceeds 2KB limit on update', {
      totalSize,
      effectiveLimit,
      absoluteLimit: resource.metadataLimit ?? DEFAULT_METADATA_LIMIT_BYTES,
      excess: totalSize - effectiveLimit,
      resourceName: resource.name,
      operation: 'update',
      id
    });
  }
  return { mappedData, body: JSON.stringify(mappedData) };
}

export async function handleUpsert({ resource, id, mappedData }: BehaviorHandleUpsertParams): Promise<BehaviorResult> {
  const totalSize = calculateTotalSize(mappedData);

  const effectiveLimit = calculateEffectiveLimit({
    storageLimit: resource.metadataLimit ?? DEFAULT_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id
    }
  });

  if (totalSize > effectiveLimit) {
    throw new MetadataLimitError('Metadata size exceeds 2KB limit on upsert', {
      totalSize,
      effectiveLimit,
      absoluteLimit: resource.metadataLimit ?? DEFAULT_METADATA_LIMIT_BYTES,
      excess: totalSize - effectiveLimit,
      resourceName: resource.name,
      operation: 'upsert',
      id
    });
  }
  return { mappedData, body: '' };
}

export async function handleGet({ metadata, body }: BehaviorHandleGetParams): Promise<BehaviorGetResult> {
  return { metadata, body };
}
