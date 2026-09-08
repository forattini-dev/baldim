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
export { mapAwsError, UnknownError } from './errors.js';
export { TasksPool } from './tasks/tasks-pool.class.js';
export { AdaptiveTuning } from './concerns/adaptive-tuning.js';
export { HTTP_CLIENT_PROFILES } from './clients/types.js';
export type {
  Logger,
  S3ClientConfig,
  HttpClientOptions,
  HttpClientProfile,
  TaskExecutorConfig,
  AutotuneConfig,
  MonitoringConfig,
  PutObjectParams,
  CopyObjectParams,
  ListObjectsParams,
  GetKeysPageParams,
  QueueStats,
  ReckerHttpHandlerOptions,
  CircuitStats,
  HandlerMetrics,
  AwsHttpRequest,
  AwsHttpResponse,
  HandleOptions,
} from './clients/types.js';