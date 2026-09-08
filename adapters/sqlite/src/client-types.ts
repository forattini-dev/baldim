import type { Logger, MonitoringConfig, TaskManager } from '@baldin/core/adapter';

export interface SqliteClientConfig {
  id?: string;
  logLevel?: string;
  logger?: Logger;
  taskExecutor?: TaskManager;
  taskExecutorMonitoring?: MonitoringConfig | null;
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  basePath?: string;
  bucket?: string;
  keyPrefix?: string;
  region?: string;
  enforceLimits?: boolean;
  metadataLimit?: number;
  maxObjectSize?: number;
  maxMemoryMB?: number;
}

export interface RemoteSqliteClientConfig {
  id?: string;
  logLevel?: string;
  logger?: Logger;
  taskExecutor?: TaskManager;
  taskExecutorMonitoring?: MonitoringConfig | null;
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  bucket?: string;
  keyPrefix?: string;
  region?: string;
  endpoint: string;
  connectionString?: string;
  sqliteDriver: 'libsql' | 'd1';
  enforceLimits?: boolean;
  metadataLimit?: number;
  maxObjectSize?: number;
  authToken?: string;
  apiToken?: string;
  syncUrl?: string;
  syncInterval?: number;
  d1Binding?: unknown;
  executor?: {
    execute(sql: string, args?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
    close?(): Promise<void> | void;
  };
}

