import type { Readable } from 'node:stream';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface Logger {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  trace?: (obj: unknown, msg?: string) => void;
}

export interface MonitoringConfig {
  collectMetrics?: boolean;
  [key: string]: unknown;
}

export interface QueueStats {
  pending?: number;
  active?: number;
  completed?: number;
  failed?: number;
  [key: string]: unknown;
}

export interface TaskManager {
  concurrency: number;
  process<T, R>(items: T[], handler: (item: T, index: number) => Promise<R> | R): Promise<{ results: R[]; errors: Error[] }>;
  getStats?(): QueueStats;
  getAggregateMetrics?(since?: number): unknown;
  destroy?(): Promise<void> | void;
}

export interface MemoryClientConfig {
  id?: string;
  logLevel?: string;
  logger?: Logger;
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  taskExecutor?: TaskManager;
  taskExecutorMonitoring?: MonitoringConfig | null;
  bucket?: string;
  keyPrefix?: string;
  region?: string;
  enforceLimits?: boolean;
  metadataLimit?: number;
  maxObjectSize?: number;
  persistPath?: string;
  autoPersist?: boolean;
  maxMemoryMB?: number;
  evictionEnabled?: boolean;
}

export interface MemoryStorageConfig {
  bucket?: string;
  enforceLimits?: boolean;
  metadataLimit?: number;
  maxObjectSize?: number;
  persistPath?: string;
  autoPersist?: boolean;
  logLevel?: string;
  logger?: Logger;
  maxMemoryMB?: number;
  evictionEnabled?: boolean;
}

export interface ClientConfig {
  bucket: string;
  keyPrefix: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  [key: string]: unknown;
}

export interface StoragePutObjectParams {
  key: string;
  metadata?: Record<string, unknown>;
  contentType?: string;
  body?: Buffer | string | Readable;
  contentEncoding?: string;
  contentLength?: number;
  ifMatch?: string;
  ifNoneMatch?: string;
}

export interface StorageCopyObjectParams {
  from: string;
  to: string;
  metadata?: Record<string, unknown>;
  metadataDirective?: 'COPY' | 'REPLACE';
  contentType?: string;
}

export interface StorageListObjectsParams {
  prefix?: string;
  delimiter?: string | null;
  maxKeys?: number;
  continuationToken?: string | null;
  startAfter?: string | null;
}

export interface GetKeysPageParams {
  prefix?: string;
  offset?: number;
  amount?: number;
}

export interface StorageObject {
  Body?: Readable & {
    transformToString?: (encoding?: string) => Promise<string>;
    transformToByteArray?: () => Promise<Uint8Array>;
    transformToWebStream?: () => ReadableStream;
  };
  Metadata: Record<string, string>;
  ContentType?: string;
  ContentLength?: number;
  ETag?: string;
  LastModified?: Date;
  ContentEncoding?: string;
}

export interface StorageObjectInfo {
  Key: string;
  Size: number;
  LastModified: Date;
  ETag: string;
  StorageClass?: string;
}

export interface StoragePutObjectResponse {
  ETag: string;
  VersionId: string | null;
  ServerSideEncryption: string | null;
  Location: string;
}

export interface StorageCopyObjectResponse {
  CopyObjectResult: { ETag: string; LastModified: string };
  BucketKeyEnabled: boolean;
  VersionId: string | null;
  ServerSideEncryption: string | null;
}

export interface StorageDeleteObjectResponse {
  DeleteMarker: boolean;
  VersionId: string | null;
}

export interface StorageDeleteObjectsResponse {
  Deleted: Array<{ Key: string }>;
  Errors: Array<{ Key: string; Code: string; Message: string }>;
}

export interface StorageListObjectsResponse {
  Contents: StorageObjectInfo[];
  CommonPrefixes: Array<{ Prefix: string }>;
  IsTruncated: boolean;
  ContinuationToken?: string;
  NextContinuationToken?: string | null;
  KeyCount: number;
  MaxKeys: number;
  Prefix?: string;
  Delimiter?: string | null;
  StartAfter?: string;
}

/** @deprecated Use StoragePutObjectParams. */
export type PutObjectParams = StoragePutObjectParams;
/** @deprecated Use StorageCopyObjectParams. */
export type CopyObjectParams = StorageCopyObjectParams;
/** @deprecated Use StorageListObjectsParams. */
export type ListObjectsParams = StorageListObjectsParams;
/** @deprecated Use StorageObject. */
export type S3Object = StorageObject;
/** @deprecated Use StorageObjectInfo. */
export type S3ObjectInfo = StorageObjectInfo;
/** @deprecated Use StoragePutObjectResponse. */
export type PutObjectResponse = StoragePutObjectResponse;
/** @deprecated Use StorageCopyObjectResponse. */
export type CopyObjectResponse = StorageCopyObjectResponse;
/** @deprecated Use StorageDeleteObjectResponse. */
export type DeleteObjectResponse = StorageDeleteObjectResponse;
/** @deprecated Use StorageDeleteObjectsResponse. */
export type DeleteObjectsResponse = StorageDeleteObjectsResponse;
/** @deprecated Use StorageListObjectsResponse. */
export type ListObjectsResponse = StorageListObjectsResponse;

export interface StorageObjectData {
  body: Buffer;
  metadata: Record<string, string>;
  contentType: string;
  etag: string;
  lastModified: string;
  size: number;
  contentEncoding?: string;
  contentLength: number;
}

export interface StoragePutParams {
  body?: Buffer | string | unknown;
  metadata?: Record<string, string>;
  contentType?: string;
  contentEncoding?: string;
  contentLength?: number;
  ifMatch?: string;
  ifNoneMatch?: string;
}

export interface StorageCopyParams {
  metadata?: Record<string, string>;
  metadataDirective?: 'COPY' | 'REPLACE';
  contentType?: string;
}

export interface StorageListParams {
  prefix?: string;
  delimiter?: string | null;
  maxKeys?: number;
  continuationToken?: string | null;
  startAfter?: string | null;
}

export interface MemoryStorageStats {
  objectCount: number;
  totalSize: number;
  totalSizeFormatted: string;
  keys: string[];
  bucket: string;
  maxMemoryMB: number;
  memoryUsagePercent: number;
  evictions: number;
  evictedBytes: number;
  peakMemoryBytes: number;
}

export interface StorageSnapshot {
  timestamp: string;
  bucket: string;
  objectCount: number;
  objects: Record<string, {
    body: string;
    metadata: Record<string, string>;
    contentType: string;
    etag: string;
    lastModified: string;
    size: number;
    contentEncoding?: string;
    contentLength: number;
  }>;
}

export interface MemoryAdapterContext {
  connectionString: string;
  clientOptions: Record<string, unknown>;
  logLevel: string;
  logger?: Logger;
}
