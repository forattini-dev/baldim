import type { Logger, MonitoringConfig, TaskManager } from '@baldim/core/adapter';

export interface FileSystemClientConfig {
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
  compression?: CompressionConfig;
  ttl?: TTLConfig;
  locking?: LockingConfig;
  backup?: BackupConfig;
  journal?: JournalConfig;
  stats?: StatsConfig;
}

export interface CompressionConfig {
  enabled?: boolean;
  threshold?: number;
  level?: number;
}

export interface TTLConfig {
  enabled?: boolean;
  defaultTTL?: number;
  cleanupInterval?: number;
}

export interface LockingConfig {
  enabled?: boolean;
  timeout?: number;
}

export interface BackupConfig {
  enabled?: boolean;
  suffix?: string;
}

export interface JournalConfig {
  enabled?: boolean;
  file?: string;
}

export interface StatsConfig {
  enabled?: boolean;
}

export interface FileSystemStorageConfig {
  basePath?: string;
  bucket?: string;
  enforceLimits?: boolean;
  metadataLimit?: number;
  maxObjectSize?: number;
  logLevel?: string;
  logger?: Logger;
  compression?: CompressionConfig;
  ttl?: TTLConfig;
  locking?: LockingConfig;
  backup?: BackupConfig;
  journal?: JournalConfig;
  stats?: StatsConfig;
}

export interface FileSystemStorageStats {
  gets: number;
  puts: number;
  deletes: number;
  errors: number;
  compressionSaved: number;
  totalCompressed: number;
  totalUncompressed: number;
  avgCompressionRatio: string | number;
  features: {
    compression: boolean;
    ttl: boolean;
    locking: boolean;
    backup: boolean;
    journal: boolean;
    stats: boolean;
  };
}

