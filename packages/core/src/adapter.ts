/** Stable surface for storage adapter authors. */
export {
  createStorageClient,
  hasStorageAdapter,
  registerStorageAdapter,
  resolveLegacyConnectionString,
  type StorageAdapterContext,
  type StorageAdapterFactory,
  type StorageAdapterRegistrationOptions,
  type LegacyConnectionStringResolver,
  type Client,
} from './storage-adapter.js';

export { ConnectionString } from './connection-string.class.js';
export { tryFn } from './concerns/try-fn.js';
export { md5 } from './concerns/crypto.js';
export { idGenerator } from './concerns/id.js';
export { metadataEncode, metadataDecode } from './concerns/metadata-encoding.js';
export { mapStorageError, mapAwsError, UnknownError, BaseError, StorageError, S3dbError, DatabaseError, MetadataLimitError, ResourceError, ValidationError, NoSuchKey } from './errors.js';
export type { BaseErrorContext, SerializedError, StorageErrorDetails, S3dbErrorDetails, MapStorageErrorContext, MapAwsErrorContext } from './errors.js';
export { TasksPool } from './tasks/tasks-pool.class.js';
export { TasksRunner } from './tasks/tasks-runner.class.js';
export { createLogger } from './concerns/logger.js';
export { getCronManager } from './concerns/cron-manager.js';
export { normalizeEtagHeader } from './clients/client-compat.js';
export { AdaptiveTuning } from './concerns/adaptive-tuning.js';
export type {
  Logger,
  TaskExecutorConfig,
  AutotuneConfig,
  MonitoringConfig,
  StoragePutObjectParams,
  StorageCopyObjectParams,
  StorageListObjectsParams,
  GetKeysPageParams,
  QueueStats,
  TaskManager,
  ClientConfig,
  StorageObject,
  StoragePutObjectResponse,
  StorageCopyObjectResponse,
  StorageDeleteObjectResponse,
  StorageDeleteObjectsResponse,
  StorageListObjectsResponse,
  StorageObjectData,
  StoragePutParams,
  StorageCopyParams,
  StorageListParams,
} from './clients/types.js';
export type { LogLevel } from './types/common.types.js';
export type { CronManager } from './concerns/cron-manager.js';

export type * from './clients/types.js';
