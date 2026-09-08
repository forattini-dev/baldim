import type { Readable } from 'node:stream';
import type { Logger, TaskExecutorConfig } from '@baldin/core/adapter';

export interface S3ClientConfig {
  logLevel?: string;
  logger?: Logger | null;
  id?: string | null;
  AwsS3Client?: unknown;
  connectionString: string;
  httpClientOptions?: HttpClientOptions;
  taskExecutor?: boolean | TaskExecutorConfig;
  executorPool?: boolean | TaskExecutorConfig | null;
  metadataLimit?: number;
}

export type HttpClientProfile = 'balanced' | 'throughput' | 'resilient';

export const HTTP_CLIENT_PROFILES: Record<HttpClientProfile, Partial<HttpClientOptions>> = {
  balanced: {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
    connections: 50,
    headersTimeout: 30000,
    bodyTimeout: 60000,
    http2: true,
    http2Preset: 'performance',
    enableRetry: true,
    retryProfile: 'dual',
    maxRetries: 3,
  },
  throughput: {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 150,
    maxFreeSockets: 20,
    timeout: 120000,
    connections: 150,
    headersTimeout: 30000,
    bodyTimeout: 120000,
    http2: true,
    http2Preset: 'low-latency',
    enableRetry: true,
    retryProfile: 'recker-only',
    maxRetries: 2,
  },
  resilient: {
    keepAlive: true,
    keepAliveMsecs: 2000,
    maxSockets: 50,
    maxFreeSockets: 20,
    timeout: 60000,
    connections: 50,
    headersTimeout: 30000,
    bodyTimeout: 60000,
    http2: true,
    http2Preset: 'balanced',
    retryProfile: 'sdk-only',
    retryMode: 'adaptive',
    retryAttempts: 4,
  },
};

export interface HttpClientOptions {
  /** Apply a pre-defined transport profile before custom overrides. */
  httpClientProfile?: HttpClientProfile;
  /**
   * Retry ownership profile for the transport stack.
   * - dual (default): both handler and AWS client can retry.
   * - recker-only: retry only in Recker handler.
   * - sdk-only: retry only in AWS client.
   */
  retryProfile?: 'dual' | 'recker-only' | 'sdk-only';
  /**
   * Request-attempt budget for the AWS client when its retry layer is active.
   */
  retryAttempts?: number;
  /** Retry mode for AWS client when its retry layer is active ('standard' | 'adaptive'). */
  retryMode?: 'standard' | 'adaptive';
  /** Backward-compatible alias for retryProfile. */
  retryCoordination?: 'dual' | 'recker-only' | 'aws-only';
  /** Backward-compatible alias for retryMode. */
  awsRetryMode?: 'standard' | 'adaptive';
  /** Backward-compatible alias for retryAttempts. */
  awsMaxAttempts?: number;
  connectTimeout?: number;
  headersTimeout?: number;
  bodyTimeout?: number;
  keepAlive?: boolean;
  keepAliveMsecs?: number;
  maxSockets?: number;
  maxFreeSockets?: number;
  timeout?: number;
  connections?: number;
  pipelining?: number;
  keepAliveTimeout?: number;
  keepAliveMaxTimeout?: number;
  keepAliveTimeoutThreshold?: number;
  maxRequestsPerClient?: number;
  clientTtl?: number | null;
  http2?: boolean;
  http2Preset?: 'balanced' | 'performance' | 'low-latency' | 'low-memory';
  http2MaxConcurrentStreams?: number;
  enableHttp2Metrics?: boolean;
  enableDedup?: boolean;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTimeout?: number;
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  retryJitter?: boolean;
  respectRetryAfter?: boolean;
  /** Use Recker HTTP handler (defaults to true). Falls back to AWS SDK default handler on failures by default. */
  useReckerHandler?: boolean;
  /** If false, throw immediately when Recker handler initialization fails. */
  failFastOnReckerFailure?: boolean;
  [key: string]: unknown;
}

export interface ReckerHttpHandlerOptions {
  connectTimeout?: number;
  headersTimeout?: number;
  bodyTimeout?: number;
  keepAlive?: boolean;
  keepAliveTimeout?: number;
  keepAliveMaxTimeout?: number;
  keepAliveTimeoutThreshold?: number;
  connections?: number;
  pipelining?: number;
  maxRequestsPerClient?: number;
  clientTtl?: number | null;
  maxCachedSessions?: number;
  localAddress?: string;
  http2?: boolean;
  http2MaxConcurrentStreams?: number;
  /** HTTP/2 preset: 'balanced' | 'performance' | 'low-latency' | 'low-memory' */
  http2Preset?: 'balanced' | 'performance' | 'low-latency' | 'low-memory';
  /** Enable Expect: 100-Continue for large uploads (bytes threshold or boolean) */
  expectContinue?: boolean | number;
  /** Enable HTTP/2 observability metrics */
  enableHttp2Metrics?: boolean;
  enableDedup?: boolean;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTimeout?: number;
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  retryJitter?: boolean;
  respectRetryAfter?: boolean;
  /** Internal alignment with HttpClientOptions.useReckerHandler. */
  useReckerHandler?: boolean;
  /** Internal alignment with HttpClientOptions.failFastOnReckerFailure. */
  failFastOnReckerFailure?: boolean;
}

export interface CircuitStats {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export interface HandlerMetrics {
  requests: number;
  retries: number;
  deduped: number;
  circuitBreakerTrips: number;
  circuitStates?: Record<string, CircuitStats>;
  pendingDeduped?: number;
  /** HTTP/2 metrics (when enableHttp2Metrics is true) */
  http2?: {
    sessions: number;
    activeSessions: number;
    streams: number;
    activeStreams: number;
    errors: number;
  };
}

export interface AwsHttpRequest {
  protocol?: string;
  hostname: string;
  port?: number;
  path: string;
  query?: Record<string, string | string[] | null | undefined>;
  method: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
}

export interface AwsHttpResponse {
  statusCode: number;
  reason?: string;
  headers: Record<string, string>;
  body?: Readable;
}

export interface HandleOptions {
  abortSignal?: AbortSignal;
  requestTimeout?: number;
}



/** Compatibility options accepted by Baldin when this adapter is imported. */
export interface LegacyS3DatabaseOptions {
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}
