import type { Logger, MonitoringConfig, TaskManager } from '@baldim/core/adapter';

export interface RedDbClientConfig {
  id?: string; logLevel?: string; logger?: Logger; taskExecutor?: TaskManager;
  taskExecutorMonitoring?: MonitoringConfig | null; concurrency?: number; retries?: number;
  retryDelay?: number; timeout?: number; retryableErrors?: string[]; baseUrl: string;
  authToken?: string; writeToken?: string; collection?: string; bucket?: string;
  keyPrefix?: string; region?: string;
}
