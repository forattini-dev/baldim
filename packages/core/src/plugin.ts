import EventEmitter from 'node:events';
import { createLogger, type Logger } from './concerns/logger.js';
import type { Database } from './database.class.js';

export interface PluginOptions {
  slug?: string;
  namespace?: string | null;
  instanceId?: string;
  logLevel?: string;
  logger?: Logger;
  [key: string]: unknown;
}

export interface ResourceLike {
  config?: { partitions?: Record<string, { fields?: Record<string, unknown> }> };
  name?: string;
  applyPartitionRule?(value: unknown, rule: unknown): unknown;
}

export interface UninstallOptions {
  purgeData?: boolean;
}

export abstract class Plugin<TOptions extends PluginOptions = PluginOptions> extends EventEmitter {
  readonly name: string;
  readonly options: TOptions;
  readonly baseSlug: string;
  slug: string;
  instanceName: string | null = null;
  namespace: string | null;
  processManager: Database['processManager'] | undefined;
  cronManager: Database['cronManager'] | undefined;
  logger: Logger;
  logLevel: string;
  database!: Database;

  constructor(options: TOptions = {} as TOptions) {
    super();
    this.name = this.constructor.name;
    this.options = options;
    this.baseSlug = options.slug || this.name.replace(/Plugin$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    this.namespace = normalizeNamespace(options.namespace ?? options.instanceId);
    this.slug = this.namespace ? `${this.baseSlug}--${this.namespace}` : this.baseSlug;
    this.logLevel = options.logLevel || 'info';
    this.logger = options.logger || createLogger({
      name: `Plugin:${this.name}`,
      level: this.logLevel as never,
    });
  }

  setInstanceName(name: string): void {
    this.instanceName = name;
    if (this.options.namespace === undefined && this.options.instanceId === undefined) {
      this.setNamespace(name === this.baseSlug ? null : name);
    }
  }

  setNamespace(value: string | null | undefined): void {
    this.namespace = normalizeNamespace(value);
    this.slug = this.namespace ? `${this.baseSlug}--${this.namespace}` : this.baseSlug;
    this.onNamespaceChanged(this.namespace);
  }

  onNamespaceChanged(_namespace: string | null): void {}

  async install(database: Database): Promise<void> {
    this.database = database;
    this.processManager ||= database.processManager;
    this.cronManager ||= database.cronManager;
    await this.onInstall();
  }

  async start(): Promise<void> {
    await this.onStart();
  }

  async stop(): Promise<void> {
    await this.onStop();
    this.removeAllListeners();
  }

  async uninstall(options: UninstallOptions = {}): Promise<void> {
    await this.onUninstall(options);
  }

  async onInstall(): Promise<void> {}
  async onStart(): Promise<void> {}
  async onStop(): Promise<void> {}
  async onUninstall(_options: UninstallOptions): Promise<void> {}

  getPartitionValues(
    data: Record<string, unknown>,
    resource: ResourceLike
  ): Record<string, Record<string, unknown>> {
    const definitions = resource.config?.partitions;
    if (!definitions) return {};

    const values: Record<string, Record<string, unknown>> = {};
    for (const [partitionName, definition] of Object.entries(definitions)) {
      values[partitionName] = {};
      for (const [fieldName, rule] of Object.entries(definition.fields || {})) {
        const value = this.getNestedFieldValue(data, fieldName);
        if (value !== null && value !== undefined) {
          values[partitionName][fieldName] = resource.applyPartitionRule
            ? resource.applyPartitionRule(value, rule)
            : value;
        }
      }
    }
    return values;
  }

  getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown {
    let value: unknown = data;
    for (const key of fieldPath.split('.')) {
      if (!value || typeof value !== 'object' || !(key in value)) return null;
      value = (value as Record<string, unknown>)[key];
    }
    return value ?? null;
  }
}

export function normalizeNamespace(namespace?: string | null): string | null {
  if (!namespace) return null;
  const normalized = String(namespace).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || null;
}

export function validateNamespace(namespace: string): void {
  if (namespace === '') return;
  if (typeof namespace !== 'string' || namespace.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(namespace)) {
    throw new Error('Namespace must contain at most 50 alphanumeric, hyphen, or underscore characters.');
  }
}

export function getValidatedNamespace(
  config: { namespace?: string | null } = {},
  defaultNamespace = ''
): string {
  const namespace = config.namespace ?? defaultNamespace;
  validateNamespace(namespace);
  return namespace;
}

const PLUGIN_RESOURCE_PREFIX = 'plg_';

export function resolveResourceName(
  pluginKey: string,
  descriptor: { defaultName?: string; override?: string; suffix?: string } = {},
  options: { namespace?: string; applyNamespaceToOverrides?: boolean } = {}
): string {
  const explicit = descriptor.override?.trim();
  if (explicit && !options.applyNamespaceToOverrides) return explicit;

  const base = explicit || descriptor.defaultName || (descriptor.suffix ? `${pluginKey}_${descriptor.suffix}` : '');
  if (!base) throw new Error(`Cannot derive a resource name for plugin ${pluginKey}.`);

  const withPrefix = base.startsWith(PLUGIN_RESOURCE_PREFIX) ? base : `${PLUGIN_RESOURCE_PREFIX}${base.replace(/^_+/, '')}`;
  const namespace = normalizeNamespace(options.namespace);
  if (!namespace) return withPrefix;

  const withoutPrefix = withPrefix.slice(PLUGIN_RESOURCE_PREFIX.length);
  return withoutPrefix.startsWith(`${namespace}_`)
    ? withPrefix
    : `${PLUGIN_RESOURCE_PREFIX}${namespace}_${withoutPrefix}`;
}

export { createLogger } from './concerns/logger.js';
export type { Logger, LogLevel } from './concerns/logger.js';
export { tryFn } from './concerns/try-fn.js';
export { mapWithConcurrency, forEachWithConcurrency } from './concerns/map-with-concurrency.js';
export { PluginError } from './errors.js';
export type { Database } from './database.class.js';