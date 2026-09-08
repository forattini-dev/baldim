/** Stable surface for storage adapter authors. */
export {
  createStorageClient,
  hasStorageAdapter,
  registerStorageAdapter,
  type StorageAdapterContext,
  type StorageAdapterFactory,
  type Client,
} from './storage-adapter.js';

export { ConnectionString } from './connection-string.class.js';
export { tryFn } from './concerns/try-fn.js';
export { md5 } from './concerns/crypto.js';
export { idGenerator } from './concerns/id.js';
export { metadataEncode, metadataDecode } from './concerns/metadata-encoding.js';
export { mapStorageError, mapAwsError, UnknownError, BaseError, DatabaseError, MetadataLimitError, ResourceError, ValidationError, NoSuchKey } from './errors.js';
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
