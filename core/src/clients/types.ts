import type EventEmitter from 'events';
import type { Readable } from 'node:stream';

export interface TaskExecutorConfig {
  enabled?: boolean;
  concurrency?: number | 'auto';
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  autotune?: AutotuneConfig | null;
  monitoring?: MonitoringConfig;
}

export interface AutotuneConfig {
  initialConcurrency?: number;
  minConcurrency?: number;
  maxConcurrency?: number;
  targetLatencyMs?: number;
  adjustmentInterval?: number;
  [key: string]: unknown;
}

export interface MonitoringConfig {
  collectMetrics?: boolean;
  [key: string]: unknown;
}

export interface Logger {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  trace?: (obj: unknown, msg?: string) => void;
}

export interface ClientConfig {
  bucket: string;
  keyPrefix: string;
  region: string;
  endpoint?: string;
  basePath?: string;
  forcePathStyle?: boolean;
  [key: string]: unknown;
}

export interface TaskManager {
  concurrency?: number;
  process: <T, R>(items: T[], fn: (item: T) => Promise<R>) => Promise<ProcessResult<R>>;
  getStats?: () => QueueStats | null;
  getAggregateMetrics?: (since?: number) => unknown | null;
}

export interface ProcessResult<T> {
  results: T[];
  errors: Array<{ error: Error; index: number; item?: unknown }>;
}

export interface QueueStats {
  queueSize?: number;
  activeCount?: number;
  effectiveConcurrency?: number;
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

export interface FilteredObjectsPageFilter {
  metadataPath: string;
  metadataValue: string;
  mappedBodyPath?: string | null;
  mappedBodyValue?: string | null;
  rawBodyPath?: string | null;
  rawBodyValue?: string | null;
}

export interface GetFilteredObjectsPageParams {
  prefix: string;
  offset?: number;
  amount?: number;
  filters?: FilteredObjectsPageFilter[];
}

export interface GetFilteredObjectsWindowParams {
  prefix: string;
  maxKeys: number;
  continuationToken?: string | null;
  filters?: FilteredObjectsPageFilter[];
}

export interface FilteredObjectsWindowResponse {
  Contents: Array<{ key: string; object: StorageObject }>;
  IsTruncated: boolean;
  NextContinuationToken?: string | null;
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
  CopyObjectResult: {
    ETag: string;
    LastModified: string;
  };
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
  compressed?: boolean;
  originalSize?: number;
  compressionRatio?: string;
  expiresAt?: number | null;
}

export interface StoragePutParams {
  body?: Buffer | string | unknown;
  metadata?: Record<string, string>;
  contentType?: string;
  contentEncoding?: string;
  contentLength?: number;
  ifMatch?: string;
  ifNoneMatch?: string;
  ttl?: number;
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

export interface ClientCapabilities {
  distributedMetadataLock?: boolean;
}

export interface Client extends EventEmitter {
  id: string;
  config: ClientConfig;
  connectionString: string;
  supportsPartitionIndex?: boolean;
  capabilities?: ClientCapabilities;
  runInTransaction?<T>(fn: () => Promise<T> | T): Promise<T>;
  isInTransaction?(): boolean;

  putObject(params: StoragePutObjectParams): Promise<StoragePutObjectResponse>;
  getObject(key: string): Promise<StorageObject>;
  headObject(key: string): Promise<StorageObject>;
  copyObject(params: StorageCopyObjectParams): Promise<StorageCopyObjectResponse>;
  exists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<StorageDeleteObjectResponse>;
  deleteObjects(keys: string[]): Promise<StorageDeleteObjectsResponse>;
  listObjects(params?: StorageListObjectsParams): Promise<StorageListObjectsResponse>;
  getKeysPage(params?: GetKeysPageParams): Promise<string[]>;
  getFilteredObjectsPage?(params: GetFilteredObjectsPageParams): Promise<Array<{ key: string; object: StorageObject }>>;
  getFilteredObjectsWindow?(params: GetFilteredObjectsWindowParams): Promise<FilteredObjectsWindowResponse>;
  getAllKeys(params?: { prefix?: string }): Promise<string[]>;
  count(params?: { prefix?: string }): Promise<number>;
  deleteAll(params?: { prefix?: string }): Promise<number>;
  getContinuationTokenAfterOffset(params?: { prefix?: string; offset?: number }): Promise<string | null>;
  moveObject(params: { from: string; to: string }): Promise<boolean>;
  moveAllObjects(params: { prefixFrom: string; prefixTo: string }): Promise<Array<{ from: string; to: string }>>;
  getQueueStats(): QueueStats | null;
  getAggregateMetrics(since?: number): unknown | null;
  destroy(): void | Promise<void>;
}
