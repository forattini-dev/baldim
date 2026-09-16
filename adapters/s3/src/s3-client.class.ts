import path from 'path';
import EventEmitter from 'events';
import type { Readable } from 'node:stream';
import { chunk } from 'lodash-es';

import { ReckerHttpHandler } from './recker-http-handler.js';

import {
  S3Client as AwsS3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  ListMultipartUploadsCommand,
} from '@aws-sdk/client-s3';

import {
  AdaptiveTuning,
  TasksPool,
  UnknownError,
  ValidationError,
  idGenerator,
  mapAwsError,
  md5,
  metadataDecode,
  metadataEncode,
  tryFn,
} from '@baldim/core/adapter';
import { normalizeHttpClientRetryConfig } from './client-compat.js';
import { parseS3ConnectionString, type S3ConnectionConfig } from './connection-string.js';
import type {
  Logger,
  TaskExecutorConfig,
  AutotuneConfig,
  MonitoringConfig,
  StoragePutObjectParams,
  StorageCopyObjectParams,
  StorageListObjectsParams,
  GetKeysPageParams,
  QueueStats,
  StorageCreateMultipartUploadParams,
  StorageCreateMultipartUploadResponse,
  StorageUploadPartParams,
  StorageUploadPartResponse,
  StorageCompleteMultipartUploadParams,
  StorageCompleteMultipartUploadResponse,
  StorageAbortMultipartUploadParams,
  StorageAbortMultipartUploadResponse,
  StorageListPartsParams,
  StorageListPartsResponse,
  StorageListMultipartUploadsParams,
  StorageListMultipartUploadsResponse,
  StoragePutObjectMultipartParams,
  StoragePutObjectResponse,
} from '@baldim/core/adapter';
import { HTTP_CLIENT_PROFILES } from './types.js';
import type { HttpClientOptions, HttpClientProfile, ReckerHttpHandlerOptions, S3ClientConfig } from './types.js';

interface NormalizedTaskExecutorConfig {
  enabled: boolean;
  concurrency?: number | 'auto';
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  autotune?: AutotuneConfig | null;
  monitoring?: MonitoringConfig;
}

interface ExecuteOperationOptions {
  bypassPool?: boolean;
  priority?: number;
  retries?: number;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

interface BatchOptions {
  onItemComplete?: (value: unknown, index: number) => void;
  onItemError?: (error: Error, index: number) => void;
}

interface TasksPoolType {
  enqueue: <T>(fn: () => Promise<T>, options?: { priority?: number; retries?: number; timeout?: number; metadata?: Record<string, unknown> }) => Promise<T>;
  getStats: () => QueueStats;
  getAggregateMetrics: (since?: number) => unknown;
  pause: () => Promise<void>;
  resume: () => void;
  drain: () => Promise<void>;
  stop: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  stats?: { queueSize?: number; activeCount?: number };
}

interface AwsCommand {
  constructor: { name: string };
  input?: any;
}

export class S3Client extends EventEmitter {
  id: string;
  readonly capabilities = { distributedMetadataLock: true, multipartUpload: true } as const;
  logLevel: string;
  private logger: Logger;
  config: S3ConnectionConfig;
  connectionString: string;
  httpClientOptions: HttpClientOptions;
  client: AwsS3Client;
  private httpHandler: ReckerHttpHandler | null = null;
  private _rawHttpClientOptions: HttpClientOptions;
  private _inflightCoalescing: Map<string, Promise<unknown>>;
  private taskExecutorConfig: NormalizedTaskExecutorConfig;
  private taskExecutor: TasksPoolType | null;
  private readonly _slowOperationThresholds: {
    executeOperationMs: number;
    getObjectMs: number;
    listObjectsMs: number;
    getAllKeysIterationMs: number;
    getAllKeysTotalMs: number;
    getKeysPageMs: number;
  };
  private _warnSlowOperations: boolean;
  metadataLimit: number;

  constructor({
    logLevel = 'info',
    logger = null,
    id = null,
    AwsS3Client: providedClient,
    connectionString,
    httpClientOptions = {},
    taskExecutor = false,
    executorPool = null,
    metadataLimit,
  }: S3ClientConfig) {
    super();
    this.logLevel = logLevel;

    const noop = (): void => {};
    this.logger = logger || {
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
      trace: noop
    };

    this.id = id ?? idGenerator(77);
    this.config = parseS3ConnectionString(connectionString);
    this.connectionString = connectionString;

    const isR2 = this.config.endpoint?.includes('.r2.cloudflarestorage.com') || false;
    this.metadataLimit = metadataLimit ?? (isR2 ? 8192 : 2047);

    this._rawHttpClientOptions = httpClientOptions || {};
    this.httpClientOptions = {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: httpClientOptions.maxSockets || 50,
      maxFreeSockets: httpClientOptions.maxFreeSockets || 10,
      timeout: 60000,
      ...httpClientOptions,
    };
    this.client = (providedClient as AwsS3Client) || this.createClient();
    this._inflightCoalescing = new Map();

    const poolConfig = executorPool ?? taskExecutor ?? false;

    this.taskExecutorConfig = this._normalizeTaskExecutorConfig(poolConfig as boolean | TaskExecutorConfig);
    this.taskExecutor = this.taskExecutorConfig.enabled ? this._createTasksPool() : null;
    const slowProfile = this._getPerfThresholdMs('S3DB_S3_SLOW_PROFILE', 0);
    const s3Defaults = slowProfile === 2
      ? {
          executeOperationMs: 2000,
          getObjectMs: 2000,
          listObjectsMs: 2000,
          getAllKeysIterationMs: 1200,
          getAllKeysTotalMs: 2000,
          getKeysPageMs: 2000
        }
      : {
          executeOperationMs: 750,
          getObjectMs: 750,
          listObjectsMs: 750,
          getAllKeysIterationMs: 750,
          getAllKeysTotalMs: 750,
          getKeysPageMs: 750
        };

    this._slowOperationThresholds = {
      executeOperationMs: this._getPerfThresholdMs('S3DB_S3_SLOW_EXECUTE_MS', s3Defaults.executeOperationMs),
      getObjectMs: this._getPerfThresholdMs('S3DB_S3_SLOW_GETOBJECT_MS', s3Defaults.getObjectMs),
      listObjectsMs: this._getPerfThresholdMs('S3DB_S3_SLOW_LISTOBJECTS_MS', s3Defaults.listObjectsMs),
      getAllKeysIterationMs: this._getPerfThresholdMs('S3DB_S3_SLOW_LIST_ITERATION_MS', s3Defaults.getAllKeysIterationMs),
      getAllKeysTotalMs: this._getPerfThresholdMs('S3DB_S3_SLOW_LIST_TOTAL_MS', s3Defaults.getAllKeysTotalMs),
      getKeysPageMs: this._getPerfThresholdMs('S3DB_S3_SLOW_GETKEYSPAGE_MS', s3Defaults.getKeysPageMs)
    };
    this._warnSlowOperations = this._getPerfBoolean(
      'S3DB_S3_SLOW_LOGS_ENABLED',
      this._getPerfBoolean('S3DB_SLOW_LOGS_ENABLED', true)
    );
  }

  private async _coalesce<T>(key: string, operationFn: () => Promise<T>): Promise<T> {
    if (this._inflightCoalescing.has(key)) {
      return this._inflightCoalescing.get(key) as Promise<T>;
    }

    const promise = operationFn().finally(() => {
      this._inflightCoalescing.delete(key);
    });

    this._inflightCoalescing.set(key, promise);
    return promise;
  }

  private _normalizeTaskExecutorConfig(config: boolean | TaskExecutorConfig): NormalizedTaskExecutorConfig {
    const envEnabled = process.env.S3DB_EXECUTOR_ENABLED;
    const envConcurrency = process.env.S3DB_CONCURRENCY;

    if (config === false || (typeof config === 'object' && config?.enabled === false) || envEnabled === 'false' || envEnabled === '0') {
      return { enabled: false };
    }

    let defaultConcurrency = 10;
    if (envConcurrency) {
      const parsed = parseInt(envConcurrency, 10);
      if (!isNaN(parsed) && parsed > 0) {
        defaultConcurrency = parsed;
      }
    }

    const configObj = typeof config === 'object' ? config : {};

    const normalized: NormalizedTaskExecutorConfig = {
      enabled: configObj.enabled ?? true,
      concurrency: configObj.concurrency ?? defaultConcurrency,
      retries: configObj.retries ?? 3,
      retryDelay: configObj.retryDelay ?? 1000,
      timeout: configObj.timeout ?? 30000,
      retryableErrors: configObj.retryableErrors ?? [
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'EPIPE',
        'ECONNREFUSED',
        'SlowDown',
        'ServiceUnavailable',
        'InternalError',
        'RequestTimeout',
        'ThrottlingException',
        'ProvisionedThroughputExceededException',
      ],
      autotune: configObj.autotune ?? null,
      monitoring: configObj.monitoring ?? { collectMetrics: true },
    };

    return normalized;
  }

  private _getPerfThresholdMs(envName: string, fallback: number): number {
    const raw = process.env[envName];
    if (!raw) {
      return fallback;
    }

    const value = parseInt(raw, 10);
    if (Number.isNaN(value) || value < 0) {
      return fallback;
    }

    return value;
  }

  private _getPerfBoolean(envName: string, fallback: boolean): boolean {
    const raw = process.env[envName];
    if (!raw) {
      return fallback;
    }

    if (raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes' || raw.toLowerCase() === 'on') {
      return true;
    }

    if (raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'no' || raw.toLowerCase() === 'off') {
      return false;
    }

    return fallback;
  }

  private _normalizedHttpClientOptions(): HttpClientOptions {
    const raw = this._rawHttpClientOptions;
    const profile = typeof raw.httpClientProfile === 'string'
      ? HTTP_CLIENT_PROFILES[raw.httpClientProfile as HttpClientProfile]
      : null;

    if (!profile) {
      return this.httpClientOptions;
    }

    return {
      ...this.httpClientOptions,
      ...profile,
      ...raw,
    };
  }

  private _normalizeHttpHandlerOptions(): ReckerHttpHandlerOptions {
    const options = this._normalizedHttpClientOptions();
    const raw = options;
    const { retryProfile } = normalizeHttpClientRetryConfig(raw);
    const connections = typeof raw.connections === 'number'
      ? raw.connections
      : raw.maxSockets;
    const keepAliveTimeout = raw.keepAliveTimeout ?? raw.keepAliveMsecs;
    const bodyTimeout = raw.bodyTimeout ?? raw.timeout;

    const normalized: ReckerHttpHandlerOptions = { ...options };

    if (connections !== undefined) {
      normalized.connections = connections;
    }
    if (keepAliveTimeout !== undefined) {
      normalized.keepAliveTimeout = keepAliveTimeout;
    }
    if (bodyTimeout !== undefined) {
      normalized.bodyTimeout = bodyTimeout;
    }
    if (retryProfile === 'sdk-only') {
      normalized.enableRetry = false;
    }
    if (retryProfile === 'recker-only' && normalized.enableRetry === undefined) {
      normalized.enableRetry = true;
    }

    return normalized;
  }

  private _createTasksPool(): TasksPoolType {
    const poolConfig: Record<string, unknown> = {
      concurrency: this.taskExecutorConfig.concurrency,
      retries: this.taskExecutorConfig.retries,
      retryDelay: this.taskExecutorConfig.retryDelay,
      timeout: this.taskExecutorConfig.timeout,
      retryableErrors: this.taskExecutorConfig.retryableErrors,
      monitoring: this.taskExecutorConfig.monitoring,
    };

    if (poolConfig.concurrency === 'auto') {
      const tuner = new AdaptiveTuning(this.taskExecutorConfig.autotune || {});
      poolConfig.concurrency = tuner.currentConcurrency;
      poolConfig.autotune = tuner;
    } else if (this.taskExecutorConfig.autotune) {
      const tuner = new AdaptiveTuning({
        ...this.taskExecutorConfig.autotune,
        minConcurrency: poolConfig.concurrency as number,
      });
      poolConfig.autotune = tuner;
    }

    const pool = new TasksPool(poolConfig) as unknown as TasksPoolType;

    pool.on('pool:taskStarted', (task: unknown) => {
      const typedTask = task as { timings: { queueWait: number }; id: string; signature: string; metadata?: { operation?: string } };
      this.emit('pool:taskStarted', typedTask);
    });
    pool.on('pool:taskCompleted', (task: unknown) => this.emit('pool:taskCompleted', task));
    pool.on('pool:taskFailed', (task: unknown, error: unknown) => this.emit('pool:taskFailed', task, error));
    pool.on('pool:taskRetried', (task: unknown, attempt: unknown) => this.emit('pool:taskRetried', task, attempt));

    return pool;
  }

  private async _executeOperation<T>(fn: () => Promise<T>, options: ExecuteOperationOptions = {}): Promise<T> {
    if (!this.taskExecutor || options.bypassPool) {
      return await fn();
    }

    if (this.logLevel === 'debug' || this.logLevel === 'trace') {
      const stats = this.taskExecutor.getStats();
      if ((stats.queueSize ?? 0) > 5 || (stats.activeCount ?? 0) > ((stats.effectiveConcurrency ?? 10) * 0.8)) {
        this.logger.debug(`[S3Client] Pool Load: Active=${stats.activeCount}/${stats.effectiveConcurrency}, Queue=${stats.queueSize}, Operation=${options.metadata?.operation || 'unknown'}`);
      }
    }

    const enqueueStart = Date.now();
    const result = await this.taskExecutor.enqueue(fn, {
      priority: options.priority ?? 0,
      retries: options.retries,
      timeout: options.timeout,
      metadata: options.metadata || {},
    });
    const totalMs = Date.now() - enqueueStart;

    if (this._warnSlowOperations && totalMs > this._slowOperationThresholds.executeOperationMs) {
      const op = options.metadata?.operation || 'unknown';
      const key = String(options.metadata?.key || '?').substring(0, 50);
      const stats = this.taskExecutor?.stats || {};
      this.logger.warn({ op, totalMs, key, queueSize: stats.queueSize || 0, active: stats.activeCount || 0 }, `[PERF] S3Client._executeOperation SLOW`);
    }

    return result;
  }

  private async _executeBatch<T>(
    fns: Array<() => Promise<T>>,
    options: BatchOptions = {}
  ): Promise<{ results: (T | null)[]; errors: Array<{ error: Error; index: number }> }> {
    if (!this.taskExecutor) {
      return await this._executeBatchWithLimit(fns, options);
    }

    const wrapped = fns.map((fn, index) =>
      Promise.resolve()
        .then(() => fn())
        .then((value) => {
          options.onItemComplete?.(value, index);
          return value;
        })
        .catch((error) => {
          options.onItemError?.(error as Error, index);
          throw error;
        })
    );

    const settled = await Promise.allSettled(wrapped);
    const results = settled.map((state) =>
      state.status === 'fulfilled' ? state.value : null
    );
    const errors = settled
      .map((state, index) =>
        state.status === 'rejected' ? { error: state.reason as Error, index } : null
      )
      .filter((e): e is { error: Error; index: number } => e !== null);

    return { results, errors };
  }

  private _resolveBatchConcurrency(total: number): number {
    if (total <= 1) return total;

    const env = process.env.S3DB_CONCURRENCY;
    if (env) {
      const parsed = parseInt(env, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.min(total, parsed);
      }
    }

    const maxSockets = this.httpClientOptions.maxSockets;
    if (typeof maxSockets === 'number' && maxSockets > 0) {
      return Math.min(total, maxSockets);
    }

    return Math.min(total, 10);
  }

  private async _executeBatchWithLimit<T>(
    fns: Array<() => Promise<T>>,
    options: BatchOptions = {}
  ): Promise<{ results: (T | null)[]; errors: Array<{ error: Error; index: number }> }> {
    if (fns.length === 0) {
      return { results: [], errors: [] };
    }

    const results = new Array<T | null>(fns.length).fill(null);
    const errorsByIndex = new Array<{ error: Error; index: number } | null>(fns.length).fill(null);
    const concurrency = Math.max(1, this._resolveBatchConcurrency(fns.length));
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex++;
        if (index >= fns.length) return;

        try {
          const value = await fns[index]!();
          results[index] = value;
          options.onItemComplete?.(value, index);
        } catch (error) {
          const err = error as Error;
          errorsByIndex[index] = { error: err, index };
          options.onItemError?.(err, index);
        }
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.allSettled(workers);

    const errors = errorsByIndex.filter((e): e is { error: Error; index: number } => e !== null);
    return { results, errors };
  }

  getQueueStats(): QueueStats | null {
    return this.taskExecutor ? this.taskExecutor.getStats() : null;
  }

  getAggregateMetrics(since: number = 0): unknown | null {
    return this.taskExecutor ? this.taskExecutor.getAggregateMetrics(since) : null;
  }

  async pausePool(): Promise<void | null> {
    if (!this.taskExecutor) return null;
    return this.taskExecutor.pause();
  }

  resumePool(): void | null {
    if (!this.taskExecutor) return null;
    this.taskExecutor.resume();
  }

  async drainPool(): Promise<void | null> {
    if (!this.taskExecutor) return null;
    return this.taskExecutor.drain();
  }

  stopPool(): void {
    if (!this.taskExecutor) return;
    this.taskExecutor.stop();
  }

  async destroy(): Promise<void> {
    if (this.httpHandler) {
      await this.httpHandler.destroyAsync();
      this.httpHandler = null;
    }
    if (this.client && typeof this.client.destroy === 'function') {
      this.client.destroy();
    }
    this.stopPool();
    this.removeAllListeners();
  }

  createClient(): AwsS3Client {
    const normalizedHttpHandlerOptions = this._normalizeHttpHandlerOptions();
    const normalizedHttpClientOptions = this._normalizedHttpClientOptions();
    const { retryProfile, maxAttempts, retryMode } = normalizeHttpClientRetryConfig(normalizedHttpClientOptions);
    const useReckerHandler = normalizedHttpClientOptions.useReckerHandler ?? true;
    const failFastOnReckerFailure = normalizedHttpClientOptions.failFastOnReckerFailure ?? false;
    const requestHandlerConfig = { ...normalizedHttpHandlerOptions };
    requestHandlerConfig.useReckerHandler = useReckerHandler;
    requestHandlerConfig.failFastOnReckerFailure = failFastOnReckerFailure;

    if (useReckerHandler) {
      try {
        this.httpHandler = new ReckerHttpHandler(requestHandlerConfig);
      } catch (error) {
        if (failFastOnReckerFailure) {
          throw error;
        }
      }
    }

    const options: {
      region: string;
      endpoint: string;
      requestHandler?: ReckerHttpHandler;
      maxAttempts?: number;
      retryMode?: 'standard' | 'adaptive';
      forcePathStyle?: boolean;
      credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
      };
    } = {
      region: this.config.region,
      endpoint: this.config.endpoint,
    };
    if (this.httpHandler) {
      options.requestHandler = this.httpHandler;
    }

    if (this.config.forcePathStyle) options.forcePathStyle = true;

    if (this.config.accessKeyId) {
      options.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey!,
        ...(this.config.sessionToken ? { sessionToken: this.config.sessionToken } : {}),
      };
    }

    if (retryProfile === 'recker-only') {
      options.maxAttempts = 1;
    } else if (typeof maxAttempts === 'number') {
      options.maxAttempts = maxAttempts;
    }

    if (retryMode !== undefined) {
      options.retryMode = retryMode;
    }

    const client = new AwsS3Client(options as any);

    client.middlewareStack.add(
      (next, context) => async (args) => {
        if (context.commandName === 'DeleteObjectsCommand') {
          const body = (args as { request: { body?: string; headers: Record<string, string> } }).request.body;
          if (body && typeof body === 'string') {
            const contentMd5 = await md5(body);
            (args as { request: { headers: Record<string, string> } }).request.headers['Content-MD5'] = contentMd5;
          }
        }
        return next(args);
      },
      {
        step: 'build',
        name: 'addContentMd5ForDeleteObjects',
        priority: 'high',
      }
    );

    return client;
  }

  async sendCommand(command: AwsCommand): Promise<unknown> {
    this.emit('cl:request', command.constructor.name, command.input);
    const [ok, err, response] = await tryFn(() => this.client.send(command as any));
    if (!ok) {
      const bucket = this.config.bucket;
      const key = command.input && command.input.Key;
      throw mapAwsError(err as Error, {
        bucket,
        key: key as string,
        commandName: command.constructor.name,
        commandInput: command.input,
      });
    }
    this.emit('cl:response', command.constructor.name, response, command.input);
    return response;
  }

  async putObject(params: StoragePutObjectParams): Promise<unknown> {
    const { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;

    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const fullKey = keyPrefix ? path.join(keyPrefix, key) : key;

      const stringMetadata: Record<string, string> = {};
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
          const { encoded } = metadataEncode(v);
          stringMetadata[validKey] = encoded;
        }
      }

      const options: Record<string, unknown> = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
        Metadata: stringMetadata,
        Body: body || Buffer.alloc(0),
      };

      if (contentType !== undefined) options.ContentType = contentType;
      if (contentEncoding !== undefined) options.ContentEncoding = contentEncoding;
      if (contentLength !== undefined) options.ContentLength = contentLength;
      if (ifMatch !== undefined) options.IfMatch = ifMatch;
      if (ifNoneMatch !== undefined) options.IfNoneMatch = ifNoneMatch;

      const [ok, err, response] = await tryFn(() => this.sendCommand(new PutObjectCommand(options as unknown as ConstructorParameters<typeof PutObjectCommand>[0])));
      this.emit('cl:PutObject', err || response, { key, metadata, contentType, body, contentEncoding, contentLength });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'PutObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'putObject', key } });
  }

  async getObject(key: string): Promise<unknown> {
    const getStart = Date.now();
    this.logger.debug({ key: key?.substring(0, 60) }, `[S3Client.getObject] START`);

    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
      };

      const cmdStart = Date.now();
      const [ok, err, response] = await tryFn(async () => {
        const res = await this.sendCommand(new GetObjectCommand(options)) as { Metadata?: Record<string, string> };

        if (res.Metadata) {
          const decodedMetadata: Record<string, unknown> = {};
          for (const [k, value] of Object.entries(res.Metadata)) {
            decodedMetadata[k] = metadataDecode(value);
          }
          res.Metadata = decodedMetadata as Record<string, string>;
        }

        return res;
      });
      const cmdMs = Date.now() - cmdStart;

      this.emit('cl:GetObject', err || response, { key });

      if (!ok) {
        this.logger.debug({ key: key?.substring(0, 60), cmdMs, err: (err as Error)?.name }, `[S3Client.getObject] ERROR`);
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'GetObjectCommand',
          commandInput: options,
        });
      }

      const totalMs = Date.now() - getStart;
      if (this._warnSlowOperations && totalMs > this._slowOperationThresholds.getObjectMs) {
        this.logger.warn({ totalMs, cmdMs, key: key?.substring(0, 60) }, `[PERF] S3Client.getObject SLOW`);
      } else {
        this.logger.debug({ totalMs, key: key?.substring(0, 60) }, `[S3Client.getObject] complete`);
      }

      return response;
    }, { metadata: { operation: 'getObject', key } });
  }

  async headObject(key: string): Promise<unknown> {
    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
      };

      const [ok, err, response] = await tryFn(async () => {
        const res = await this.sendCommand(new HeadObjectCommand(options)) as { Metadata?: Record<string, string> };

        if (res.Metadata) {
          const decodedMetadata: Record<string, unknown> = {};
          for (const [k, value] of Object.entries(res.Metadata)) {
            decodedMetadata[k] = metadataDecode(value);
          }
          res.Metadata = decodedMetadata as Record<string, string>;
        }

        return res;
      });

      this.emit('cl:HeadObject', err || response, { key });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'HeadObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'headObject', key } });
  }

  async copyObject(params: StorageCopyObjectParams): Promise<unknown> {
    const { from, to, metadata, metadataDirective, contentType } = params;

    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options: Record<string, unknown> = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, to) : to,
        CopySource: path.join(this.config.bucket, keyPrefix ? path.join(keyPrefix, from) : from),
      };

      if (metadataDirective) {
        options.MetadataDirective = metadataDirective;
      }

      if (metadata && typeof metadata === 'object') {
        const encodedMetadata: Record<string, string> = {};
        for (const [k, value] of Object.entries(metadata)) {
          const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
          const { encoded } = metadataEncode(value);
          encodedMetadata[validKey] = encoded;
        }
        options.Metadata = encodedMetadata;
      }

      if (contentType) {
        options.ContentType = contentType;
      }

      const [ok, err, response] = await tryFn(() => this.sendCommand(new CopyObjectCommand(options as unknown as ConstructorParameters<typeof CopyObjectCommand>[0])));
      this.emit('cl:CopyObject', err || response, { from, to, metadataDirective });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key: to,
          commandName: 'CopyObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'copyObject', from, to } });
  }

  async exists(key: string): Promise<boolean> {
    const [ok, err] = await tryFn(() => this.headObject(key));
    if (ok) return true;
    if ((err as Error).name === 'NoSuchKey' || (err as Error).name === 'NotFound') return false;
    throw err;
  }

  private _fullKey(key: string): string {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    return keyPrefix ? path.join(keyPrefix, key) : key;
  }

  private _encodeUserMetadata(metadata: Record<string, unknown> | undefined): Record<string, string> | undefined {
    if (!metadata) return undefined;
    const stringMetadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadata)) {
      const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const { encoded } = metadataEncode(v);
      stringMetadata[validKey] = encoded;
    }
    return stringMetadata;
  }

  async createMultipartUpload(params: StorageCreateMultipartUploadParams): Promise<StorageCreateMultipartUploadResponse> {
    const { key, metadata, contentType, contentEncoding } = params;

    return await this._executeOperation(async () => {
      const options: Record<string, unknown> = {
        Bucket: this.config.bucket,
        Key: this._fullKey(key),
      };

      const stringMetadata = this._encodeUserMetadata(metadata);
      if (stringMetadata) options.Metadata = stringMetadata;
      if (contentType !== undefined) options.ContentType = contentType;
      if (contentEncoding !== undefined) options.ContentEncoding = contentEncoding;

      const [ok, err, response] = await tryFn(() => this.sendCommand(new CreateMultipartUploadCommand(options as unknown as ConstructorParameters<typeof CreateMultipartUploadCommand>[0])));
      this.emit('cl:CreateMultipartUpload', err || response, { key });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'CreateMultipartUploadCommand',
          commandInput: options,
        });
      }

      return { key, uploadId: (response as { UploadId?: string }).UploadId! };
    }, { metadata: { operation: 'createMultipartUpload', key } });
  }

  async uploadPart(params: StorageUploadPartParams): Promise<StorageUploadPartResponse> {
    const { key, uploadId, partNumber, body, contentLength } = params;

    return await this._executeOperation(async () => {
      const options: Record<string, unknown> = {
        Bucket: this.config.bucket,
        Key: this._fullKey(key),
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body || Buffer.alloc(0),
      };

      if (contentLength !== undefined) options.ContentLength = contentLength;

      const [ok, err, response] = await tryFn(() => this.sendCommand(new UploadPartCommand(options as unknown as ConstructorParameters<typeof UploadPartCommand>[0])));
      this.emit('cl:UploadPart', err || response, { key, uploadId, partNumber });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'UploadPartCommand',
          commandInput: { ...options, Body: undefined },
        });
      }

      const etag = (response as { ETag?: string }).ETag;
      if (!etag) {
        throw new UnknownError('UploadPart returned no ETag', {
          bucket: this.config.bucket,
          key,
          uploadId,
          partNumber,
        });
      }

      return { partNumber, etag };
    }, { metadata: { operation: 'uploadPart', key, partNumber } });
  }

  async completeMultipartUpload(params: StorageCompleteMultipartUploadParams): Promise<StorageCompleteMultipartUploadResponse> {
    const { key, uploadId, parts } = params;

    if (!parts || parts.length === 0) {
      throw new ValidationError('completeMultipartUpload requires at least one uploaded part.', {
        key,
        uploadId,
      });
    }

    return await this._executeOperation(async () => {
      const orderedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
      const options = {
        Bucket: this.config.bucket,
        Key: this._fullKey(key),
        UploadId: uploadId,
        MultipartUpload: {
          Parts: orderedParts.map((part) => ({
            ETag: part.etag,
            PartNumber: part.partNumber,
          })),
        },
      };

      const [ok, err, response] = await tryFn(() => this.sendCommand(new CompleteMultipartUploadCommand(options)));
      this.emit('cl:CompleteMultipartUpload', err || response, { key, uploadId, parts: orderedParts.length });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'CompleteMultipartUploadCommand',
          commandInput: options,
        });
      }

      const completed = response as { ETag?: string; VersionId?: string; Location?: string };
      return {
        ETag: completed.ETag ?? null,
        VersionId: completed.VersionId ?? null,
        Location: completed.Location ?? null,
      };
    }, { metadata: { operation: 'completeMultipartUpload', key } });
  }

  async abortMultipartUpload(params: StorageAbortMultipartUploadParams): Promise<StorageAbortMultipartUploadResponse> {
    const { key, uploadId } = params;

    return await this._executeOperation(async () => {
      const options = {
        Bucket: this.config.bucket,
        Key: this._fullKey(key),
        UploadId: uploadId,
      };

      const [ok, err, response] = await tryFn(() => this.sendCommand(new AbortMultipartUploadCommand(options)));
      this.emit('cl:AbortMultipartUpload', err || response, { key, uploadId });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'AbortMultipartUploadCommand',
          commandInput: options,
        });
      }

      return { key, uploadId };
    }, { metadata: { operation: 'abortMultipartUpload', key } });
  }

  async listParts(params: StorageListPartsParams): Promise<StorageListPartsResponse> {
    const { key, uploadId, maxParts = 1000, partNumberMarker = 0 } = params;

    return await this._executeOperation(async () => {
      const options = {
        Bucket: this.config.bucket,
        Key: this._fullKey(key),
        UploadId: uploadId,
        MaxParts: maxParts,
        PartNumberMarker: String(partNumberMarker),
      };

      const [ok, err, response] = await tryFn(() => this.sendCommand(new ListPartsCommand(options)));
      this.emit('cl:ListParts', err || response, { key, uploadId });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'ListPartsCommand',
          commandInput: options,
        });
      }

      const raw = response as {
        Parts?: Array<{ PartNumber?: number; ETag?: string }>;
        IsTruncated?: boolean;
        NextPartNumberMarker?: number;
      };

      return {
        key,
        uploadId,
        parts: (raw.Parts || []).map((part) => ({
          partNumber: part.PartNumber!,
          etag: part.ETag!,
        })),
        isTruncated: raw.IsTruncated ?? false,
        nextPartNumberMarker: raw.NextPartNumberMarker ?? null,
      };
    }, { metadata: { operation: 'listParts', key } });
  }

  async listMultipartUploads(params: StorageListMultipartUploadsParams = {}): Promise<StorageListMultipartUploadsResponse> {
    const { prefix, maxUploads = 1000, continuationToken } = params;

    return await this._executeOperation(async () => {
      const options: Record<string, unknown> = {
        Bucket: this.config.bucket,
        MaxUploads: maxUploads,
      };

      if (prefix !== undefined) options.Prefix = prefix;
      if (continuationToken) {
        const [keyMarker, uploadIdMarker] = String(continuationToken).split('|', 2);
        options.KeyMarker = keyMarker;
        options.UploadIdMarker = uploadIdMarker;
      }

      const [ok, err, response] = await tryFn(() => this.sendCommand(new ListMultipartUploadsCommand(options as unknown as ConstructorParameters<typeof ListMultipartUploadsCommand>[0])));
      this.emit('cl:ListMultipartUploads', err || response, { prefix });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          commandName: 'ListMultipartUploadsCommand',
          commandInput: options,
        });
      }

      const raw = response as {
        Uploads?: Array<{ Key?: string; UploadId?: string; Initiated?: Date }>;
        IsTruncated?: boolean;
        NextKeyMarker?: string;
        NextUploadIdMarker?: string;
      };

      const configuredPrefix = this.config.keyPrefix
        ? `${this.config.keyPrefix.replace(/\/+$/, '')}/`
        : '';
      const stripConfiguredPrefix = (key: string | undefined): string =>
        key && configuredPrefix && key.startsWith(configuredPrefix)
          ? key.slice(configuredPrefix.length)
          : (key ?? '');

      return {
        uploads: (raw.Uploads || []).map((upload) => ({
          key: stripConfiguredPrefix(upload.Key),
          uploadId: upload.UploadId!,
          initiated: upload.Initiated ?? null,
        })),
        isTruncated: raw.IsTruncated ?? false,
        nextContinuationToken: raw.IsTruncated && raw.NextKeyMarker
          ? `${raw.NextKeyMarker}|${raw.NextUploadIdMarker ?? ''}`
          : null,
      };
    }, { metadata: { operation: 'listMultipartUploads' } });
  }

  async putObjectMultipart(params: StoragePutObjectMultipartParams): Promise<StoragePutObjectResponse> {
    const { key, body, metadata, contentType, contentEncoding, partSize, queueConcurrency, onProgress } = params;

    const MIN_PART_SIZE = 5 * 1024 * 1024;
    const resolvedPartSize = partSize ?? 8 * 1024 * 1024;

    if (!Number.isFinite(resolvedPartSize) || resolvedPartSize <= 0) {
      throw new ValidationError('putObjectMultipart requires a positive partSize.', { key, partSize });
    }

    const buffer = Buffer.isBuffer(body)
      ? body
      : typeof body === 'string'
        ? Buffer.from(body, 'utf8')
        : await this._streamToBuffer(body);

    const totalParts = Math.max(1, Math.ceil(buffer.length / resolvedPartSize));

    if (totalParts > 1 && resolvedPartSize < MIN_PART_SIZE) {
      throw new ValidationError(
        `partSize must be at least ${MIN_PART_SIZE} bytes when the body is split into multiple parts (S3 minimum part size).`,
        { key, partSize: resolvedPartSize, totalParts }
      );
    }

    const { uploadId } = await this.createMultipartUpload({ key, metadata, contentType, contentEncoding });
    const concurrency = Math.max(1, Math.min(queueConcurrency ?? 4, totalParts));

    try {
      const parts: StorageCompleteMultipartUploadParams['parts'] = [];
      let uploadedBytes = 0;
      let nextPartNumber = 1;

      const worker = async (): Promise<void> => {
        while (true) {
          const partNumber = nextPartNumber++;
          if (partNumber > totalParts) return;

          const start = (partNumber - 1) * resolvedPartSize;
          const chunkBuffer = buffer.subarray(start, Math.min(start + resolvedPartSize, buffer.length));
          const uploaded = await this.uploadPart({ key, uploadId, partNumber, body: chunkBuffer, contentLength: chunkBuffer.length });
          parts.push({ partNumber: uploaded.partNumber, etag: uploaded.etag });
          uploadedBytes += chunkBuffer.length;
          onProgress?.({ partNumber, totalParts, uploadedBytes });
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      const completed = await this.completeMultipartUpload({ key, uploadId, parts });
      const summary = { key, uploadId, totalParts, uploadedBytes, etag: completed.ETag };
      this.emit('cl:PutObjectMultipart', summary, { key });

      return {
        ETag: completed.ETag ?? '',
        VersionId: completed.VersionId,
        ServerSideEncryption: null,
        Location: completed.Location ?? '',
      };
    } catch (error) {
      await tryFn(() => this.abortMultipartUpload({ key, uploadId }));
      throw error;
    }
  }

  private async _streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  async deleteObject(key: string): Promise<unknown> {
    return await this._executeOperation(async () => {
      const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
      const options = {
        Bucket: this.config.bucket,
        Key: keyPrefix ? path.join(keyPrefix, key) : key,
      };

      const [ok, err, response] = await tryFn(() => this.sendCommand(new DeleteObjectCommand(options)));
      this.emit('cl:DeleteObject', err || response, { key });

      if (!ok) {
        throw mapAwsError(err as Error, {
          bucket: this.config.bucket,
          key,
          commandName: 'DeleteObjectCommand',
          commandInput: options,
        });
      }

      return response;
    }, { metadata: { operation: 'deleteObject', key } });
  }

  async deleteObjects(keys: string[]): Promise<{ deleted: unknown[]; notFound: Array<{ message: string; raw: Error }> }> {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    const packages = chunk(keys, 1000);

    const results: unknown[] = [];
    const errors: Array<{ message: string; raw: Error }> = [];
    const canonicalDeleted: Array<{ Key: string }> = [];
    const canonicalErrors: Array<{ Key: string; Code: string; Message: string }> = [];

    for (const packageKeys of packages) {
      const [ok, err, response] = await tryFn(async () => {
        return await this._executeOperation(async () => {
          for (const key of packageKeys) {
            await this.exists(key);
          }

          const options = {
            Bucket: this.config.bucket,
            Delete: {
              Objects: packageKeys.map((key) => ({
                Key: keyPrefix ? path.join(keyPrefix, key) : key,
              })),
            },
          };

          const [ok, err, res] = await tryFn(() => this.sendCommand(new DeleteObjectsCommand(options)));
          if (!ok) throw err;

          return res;
        }, { metadata: { operation: 'deleteObjects', count: packageKeys.length } });
      });

      if (ok) {
        results.push(response);
        canonicalDeleted.push(...packageKeys.map((Key) => ({ Key })));
      } else {
        const message = (err as Error).message;
        errors.push({ message, raw: err as Error });
        canonicalErrors.push(...packageKeys.map((Key) => ({ Key, Code: 'DeleteFailed', Message: message })));
      }
    }

    const report = {
      Deleted: canonicalDeleted,
      Errors: canonicalErrors,
      /** @deprecated Use Deleted. */
      deleted: results,
      /** @deprecated Use Errors. */
      notFound: errors,
    };

    this.emit('cl:DeleteObjects', report, keys);
    return report;
  }

  async deleteAll({ prefix }: { prefix?: string } = {}): Promise<number> {
    const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
    let continuationToken: string | undefined;
    let totalDeleted = 0;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: keyPrefix ? path.join(keyPrefix, prefix || '') : prefix || '',
        ContinuationToken: continuationToken,
      });

      const listResponse = await this.client.send(listCommand) as { Contents?: Array<{ Key?: string }>; IsTruncated?: boolean; NextContinuationToken?: string };

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: listResponse.Contents.map(obj => ({ Key: obj.Key! }))
          }
        });

        const deleteResponse = await this.client.send(deleteCommand) as { Deleted?: unknown[] };
        const deletedCount = deleteResponse.Deleted ? deleteResponse.Deleted.length : 0;
        totalDeleted += deletedCount;

        this.emit('cl:DeleteAll', {
          prefix,
          batch: deletedCount,
          total: totalDeleted
        });
      }

      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);

    this.emit('cl:DeleteAllComplete', {
      prefix,
      totalDeleted
    });

    return totalDeleted;
  }

  async moveObject({ from, to }: { from: string; to: string }): Promise<boolean> {
    const [ok, err] = await tryFn(async () => {
      await this.copyObject({ from, to });
      await this.deleteObject(from);
    });
    if (!ok) {
      throw new UnknownError('Unknown error in moveObject', { bucket: this.config.bucket, from, to, original: err });
    }
    return true;
  }

  async listObjects(params: StorageListObjectsParams = {}): Promise<unknown> {
    const { prefix, maxKeys = 1000, continuationToken } = params;
    const listStart = Date.now();
    this.logger.debug({ prefix: prefix?.substring(0, 60), maxKeys }, `[S3Client.listObjects] START`);

    const options = {
      Bucket: this.config.bucket,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken || undefined,
      Prefix: this.config.keyPrefix
        ? path.join(this.config.keyPrefix, prefix || '')
        : prefix || '',
    };
    const [ok, err, response] = await tryFn(() => this.sendCommand(new ListObjectsV2Command(options)));

    const totalMs = Date.now() - listStart;
    if (!ok) {
      this.logger.warn({ totalMs, prefix: prefix?.substring(0, 60), err: (err as Error)?.name }, `[S3Client.listObjects] ERROR`);
      throw new UnknownError('Unknown error in listObjects', { prefix, bucket: this.config.bucket, original: err });
    }

    if (this._warnSlowOperations && totalMs > this._slowOperationThresholds.listObjectsMs) {
      this.logger.warn({ totalMs, prefix: prefix?.substring(0, 60), keys: (response as { KeyCount?: number })?.KeyCount || 0 }, `[PERF] S3Client.listObjects SLOW`);
    } else {
      this.logger.debug({ totalMs, prefix: prefix?.substring(0, 60), keys: (response as { KeyCount?: number })?.KeyCount || 0 }, `[S3Client.listObjects] complete`);
    }

    const raw = response as {
      Contents?: Array<{ Key?: string; [key: string]: unknown }>;
      CommonPrefixes?: Array<{ Prefix?: string; [key: string]: unknown }>;
      [key: string]: unknown;
    };
    const configuredPrefix = this.config.keyPrefix
      ? `${this.config.keyPrefix.replace(/\/+$/, '')}/`
      : '';
    const stripConfiguredPrefix = (key: string | undefined): string | undefined => {
      if (!key || !configuredPrefix || !key.startsWith(configuredPrefix)) return key;
      return key.slice(configuredPrefix.length);
    };
    const normalizedResponse = {
      ...raw,
      Contents: raw.Contents?.map((entry) => ({
        ...entry,
        Key: stripConfiguredPrefix(entry.Key),
      })),
      CommonPrefixes: raw.CommonPrefixes?.map((entry) => ({
        ...entry,
        Prefix: stripConfiguredPrefix(entry.Prefix),
      })),
      Prefix: prefix || '',
    };

    this.emit('cl:ListObjects', normalizedResponse, options);
    return normalizedResponse;
  }

  async count({ prefix }: { prefix?: string } = {}): Promise<number> {
    let count = 0;
    let truncated = true;
    let continuationToken: string | undefined;
    while (truncated) {
      const options = {
        prefix,
        continuationToken,
      };
      const response = await this.listObjects(options) as { KeyCount?: number; IsTruncated?: boolean; NextContinuationToken?: string };
      count += response.KeyCount || 0;
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }
    this.emit('cl:Count', count, { prefix });
    return count;
  }

  async getAllKeys({ prefix }: { prefix?: string } = {}): Promise<string[]> {
    let keys: string[] = [];
    let truncated = true;
    let continuationToken: string | undefined;
    let iterations = 0;
    const startTotal = Date.now();

    while (truncated) {
      iterations++;
      const options = {
        prefix,
        continuationToken,
      };
      const startList = Date.now();
      const response = await this.listObjects(options) as { Contents?: Array<{ Key: string }>; IsTruncated?: boolean; NextContinuationToken?: string };
      const listMs = Date.now() - startList;

      if (this._warnSlowOperations && listMs > this._slowOperationThresholds.getAllKeysIterationMs) {
        this.logger.warn({ iterations, listMs, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getAllKeys: listObjects iteration SLOW`);
      }

      if (response.Contents) {
        keys = keys.concat(response.Contents.map((x) => x.Key));
      }
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }

    const totalMs = Date.now() - startTotal;
    if (this._warnSlowOperations && totalMs > this._slowOperationThresholds.getAllKeysTotalMs) {
      this.logger.warn({ totalMs, iterations, keysCount: keys.length, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getAllKeys SLOW TOTAL`);
    }

    this.emit('cl:GetAllKeys', keys, { prefix });
    return keys;
  }

  async getContinuationTokenAfterOffset(params: { prefix?: string; offset?: number } = {}): Promise<string | null> {
    const { prefix, offset = 1000 } = params;
    if (offset === 0) return null;
    let truncated = true;
    let continuationToken: string | undefined;
    let skipped = 0;
    while (truncated) {
      const maxKeys =
        offset < 1000
          ? offset
          : offset - skipped > 1000
            ? 1000
            : offset - skipped;
      const options = {
        prefix,
        maxKeys,
        continuationToken,
      };
      const res = await this.listObjects(options) as { Contents?: unknown[]; IsTruncated?: boolean; NextContinuationToken?: string };
      if (res.Contents) {
        skipped += res.Contents.length;
      }
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
      if (skipped >= offset) {
        break;
      }
    }
    this.emit('cl:GetContinuationTokenAfterOffset', continuationToken || null, params);
    return continuationToken || null;
  }

  async getKeysPage(params: GetKeysPageParams = {}): Promise<string[]> {
    const pageStart = Date.now();
    const { prefix, offset = 0, amount = 100 } = params;

    this.logger.debug({ prefix: prefix?.substring(0, 60), offset, amount }, `[S3Client.getKeysPage] START`);

    let keys: string[] = [];
    let truncated = true;
    let continuationToken: string | undefined;
    let iterations = 0;

    if (offset > 0) {
      const tokenStart = Date.now();
      continuationToken = await this.getContinuationTokenAfterOffset({
        prefix,
        offset,
      }) || undefined;
      const tokenMs = Date.now() - tokenStart;
      this.logger.debug({ tokenMs, hasToken: !!continuationToken }, `[S3Client.getKeysPage] getContinuationTokenAfterOffset`);
      if (!continuationToken) {
        this.emit('cl:GetKeysPage', [], params);
        return [];
      }
    }
    while (truncated) {
      iterations++;
      const options = {
        prefix,
        continuationToken,
      };
      const res = await this.listObjects(options) as { Contents?: Array<{ Key: string }>; IsTruncated?: boolean; NextContinuationToken?: string };
      if (res.Contents) {
        keys = keys.concat(res.Contents.map((x) => x.Key));
      }
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
      if (keys.length >= amount) {
        keys = keys.slice(0, amount);
        break;
      }
    }

    const totalMs = Date.now() - pageStart;
    if (this._warnSlowOperations && totalMs > this._slowOperationThresholds.getKeysPageMs) {
      this.logger.warn({ totalMs, iterations, keysCount: keys.length, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getKeysPage SLOW`);
    } else {
      this.logger.debug({ totalMs, iterations, keysCount: keys.length }, `[S3Client.getKeysPage] complete`);
    }

    this.emit('cl:GetKeysPage', keys, params);
    return keys;
  }

  async moveAllObjects({ prefixFrom, prefixTo }: { prefixFrom: string; prefixTo: string }): Promise<string[]> {
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const results: string[] = [];
    const errors: Array<{ message: string; raw: Error; item: string }> = [];

    for (const key of keys) {
      const to = key.replace(prefixFrom, prefixTo);
      const [ok, err] = await tryFn(async () => {
        await this.moveObject({
          from: key,
          to,
        });
      });

      if (ok) {
        results.push(to);
      } else {
        errors.push({
          message: (err as Error).message,
          raw: err as Error,
          item: key
        });
      }
    }

    this.emit('cl:MoveAllObjects', { results, errors }, { prefixFrom, prefixTo });

    if (errors.length > 0) {
      throw new UnknownError('Some objects could not be moved', {
        bucket: this.config.bucket,
        operation: 'moveAllObjects',
        prefixFrom,
        prefixTo,
        totalKeys: keys.length,
        failedCount: errors.length,
        successCount: results.length,
        errors: errors.map(e => ({ message: e.message, raw: e.raw })),
        suggestion: 'Check S3 permissions and retry failed objects individually'
      });
    }
    return results;
  }
}

export default S3Client;
