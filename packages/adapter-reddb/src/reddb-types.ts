import type { RedDbGrpcKeepaliveOptions, RedDbGrpcTlsOptions, RedDbOperationTimeouts, RedDbTransportMode, RedDbWireTlsOptions } from 'recker';
import type { Logger, MonitoringConfig, TaskManager } from '@baldin/core/adapter';

export interface RedDbClientConfig {
  id?: string; logLevel?: string; logger?: Logger; taskExecutor?: TaskManager;
  taskExecutorMonitoring?: MonitoringConfig | null; concurrency?: number; retries?: number;
  retryDelay?: number; timeout?: number; retryableErrors?: string[]; baseUrl: string;
  authToken?: string; writeToken?: string; collection?: string; bucket?: string;
  keyPrefix?: string; region?: string; transport?: RedDbTransportMode;
  allowTransportFallback?: boolean; headers?: Record<string,string>; http2?: boolean;
  wireAddress?: string; wireTls?: boolean | RedDbWireTlsOptions; wirePoolSize?: number;
  wireKeepAlive?: boolean; wireKeepAliveInitialDelayMs?: number; wireConnectTimeout?: number;
  grpcAddress?: string; grpcTls?: boolean | RedDbGrpcTlsOptions;
  grpcOptions?: Record<string,string|number>; grpcKeepalive?: RedDbGrpcKeepaliveOptions;
  operationTimeouts?: RedDbOperationTimeouts; batchConcurrency?: number;
  ensureIndexes?: boolean; warmupIndexes?: boolean; indexTransport?: RedDbTransportMode;
}
