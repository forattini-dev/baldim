import EventEmitter from 'node:events';
import { createLogger, type Logger } from './concerns/logger.js';
import { PluginError } from './errors.js';
import { PluginStorage, type PluginClient } from './plugins/concerns/plugin-storage.js';
import type { Database } from './database.class.js';
import type { DatabaseHookFunction, HookEventName } from './database/types.js';
import type {
  MiddlewareContext,
  NextFunction,
  SupportedMethod,
} from './core/resource-middleware.class.js';

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
  useMiddleware?(
    method: SupportedMethod,
    middleware: (context: MiddlewareContext, next: NextFunction) => Promise<unknown>
  ): void | (() => void);
  addHook?(event: string, hook: (data: unknown) => unknown | Promise<unknown>): void;
  removeHook?(event: string, hook: (data: unknown) => unknown | Promise<unknown>): boolean;
}

export type PluginMiddleware = (
  next: (...args: unknown[]) => Promise<unknown>,
  ...args: unknown[]
) => Promise<unknown>;

export type PluginWrapper = (
  result: unknown,
  args: unknown[],
  methodName: string
) => Promise<unknown> | unknown;

export interface ScheduledTask {
  stop?(): void;
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
  protected _cronJobs: string[] = [];
  protected _storage: PluginStorage | null = null;
  private _middlewareDisposers: Array<() => void> = [];
  private _resourceDisposers: Array<() => void> = [];
  private _databaseHookDisposers: Array<() => void> = [];
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
    this._storage = null;
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
    try {
      await this.onStop();
    } finally {
      for (const dispose of this._databaseHookDisposers.splice(0).reverse()) dispose();
      for (const dispose of this._resourceDisposers.splice(0).reverse()) dispose();
      for (const dispose of this._middlewareDisposers.splice(0)) dispose();
      this.stopAllCronJobs();
      this.removeAllListeners();
    }
  }

  async uninstall(options: UninstallOptions = {}): Promise<void> {
    await this.onUninstall(options);
    if (options.purgeData && this._storage) {
      const deleted = await this._storage.deleteAll();
      this.emit('plugin.dataPurged', { deleted });
    }
  }

  async onInstall(): Promise<void> {}
  async onStart(): Promise<void> {}
  async onStop(): Promise<void> {}
  async onUninstall(_options: UninstallOptions): Promise<void> {}

  async scheduleCron(
    expression: string,
    fn: () => Promise<void> | void,
    suffix = 'job',
    options: Record<string, unknown> = {}
  ): Promise<ScheduledTask | null> {
    if (!this.cronManager) return null;

    const jobName = `${this.slug}-${suffix}`;
    const task = await this.cronManager.schedule(expression, fn, jobName, options);
    if (task) this._cronJobs.push(jobName);
    return task;
  }

  async scheduleInterval(
    milliseconds: number,
    fn: () => Promise<void> | void,
    suffix = 'interval',
    options: Record<string, unknown> = {}
  ): Promise<ScheduledTask | null> {
    if (!this.cronManager) return null;

    const jobName = `${this.slug}-${suffix}`;
    const task = await this.cronManager.scheduleInterval(milliseconds, fn, jobName, options);
    if (task) this._cronJobs.push(jobName);
    return task;
  }

  stopAllCronJobs(): number {
    if (!this.cronManager) return 0;

    let stopped = 0;
    for (const jobName of this._cronJobs) {
      if (this.cronManager.stop(jobName)) stopped++;
    }
    this._cronJobs = [];
    return stopped;
  }

  getStorage(): PluginStorage {
    if (!this._storage) {
      if (!this.database?.client) {
        throw new PluginError('Plugin storage unavailable until plugin is installed', {
          pluginName: this.name,
          operation: 'getStorage',
          statusCode: 400,
          retriable: false,
          suggestion: 'Install the plugin on a connected database before accessing its storage.',
        });
      }
      this._storage = new PluginStorage(this.database.client as unknown as PluginClient, this.slug);
    }
    return this._storage;
  }

  addMiddleware(resource: ResourceLike, method: SupportedMethod, middleware: PluginMiddleware): void {
    if (!resource.useMiddleware) {
      throw new PluginError(`Cannot add middleware to "${method}"`, {
        pluginName: this.name,
        operation: 'addMiddleware',
        statusCode: 400,
        retriable: false,
        suggestion: 'Ensure the resource exposes useMiddleware() before registering middleware.',
        resourceName: resource.name || 'unknown',
        methodName: method,
      });
    }

    const dispose = resource.useMiddleware(method, async (context, next) => {
      const invokeNext = async (...nextArgs: unknown[]): Promise<unknown> => {
        if (nextArgs.length > 0) context.args = nextArgs;
        return next();
      };
      return middleware(invokeNext, ...context.args);
    });
    if (dispose) this._middlewareDisposers.push(dispose);
  }

  addResourceHook(
    resource: ResourceLike,
    event: string,
    hook: (data: unknown) => unknown | Promise<unknown>
  ): void {
    if (!resource.addHook || !resource.removeHook) {
      throw new PluginError(`Cannot add resource hook "${event}"`, {
        pluginName: this.name,
        operation: 'addResourceHook',
        resourceName: resource.name || 'unknown',
        event,
        statusCode: 400,
        retriable: false,
        suggestion: 'Ensure the resource exposes addHook() and removeHook().',
      });
    }

    resource.addHook(event, hook);
    this._resourceDisposers.push(() => {
      resource.removeHook?.(event, hook);
    });
  }

  addDatabaseHook(
    event: HookEventName,
    hook: DatabaseHookFunction
  ): void {
    this.database.addHook(event, hook);
    this._databaseHookDisposers.push(() => {
      this.database.removeHook(event, hook);
    });
  }

  /**
   * Adds plugin-owned properties or methods to a resource for this plugin's
   * lifetime. The properties are removed when it stops.
   */
  extendResource(resource: ResourceLike, extensions: Record<string, unknown>): void {
    const target = resource as ResourceLike & Record<string, unknown>;

    for (const [property, value] of Object.entries(extensions)) {
      if (property in target) {
        throw new PluginError(`Cannot replace existing resource property "${property}"`, {
          pluginName: this.name,
          operation: 'extendResource',
          resourceName: resource.name || 'unknown',
          property,
          statusCode: 409,
          retriable: false,
          suggestion: 'Choose a plugin extension name that does not overlap with the Resource API.',
        });
      }

      Object.defineProperty(target, property, {
        configurable: true,
        enumerable: false,
        writable: true,
        value,
      });

      this._resourceDisposers.push(() => {
        delete target[property];
      });
    }
  }

  wrapResourceMethod(resource: ResourceLike, method: SupportedMethod, wrapper: PluginWrapper): void {
    this.addMiddleware(resource, method, async (next, ...args) => {
      const result = await next(...args);
      return wrapper(result, args, method);
    });
  }

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

export interface ResolveResourceNameParams {
  defaultName?: string;
  override?: string;
  suffix?: string;
}

export interface ResolveResourceNameOptions {
  namespace?: string;
  applyNamespaceToOverrides?: boolean;
}

export type ResourceNameDescriptor = string | ResolveResourceNameParams;

export function resolveResourceName(
  pluginKey: string,
  descriptor: ResolveResourceNameParams = {},
  options: ResolveResourceNameOptions = {}
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

export function resolveResourceNames<T extends Record<string, ResourceNameDescriptor>>(
  pluginKey: string,
  descriptors: T,
  options: ResolveResourceNameOptions = {}
): { [K in keyof T]: string } {
  const result = {} as { [K in keyof T]: string };
  for (const [key, descriptor] of Object.entries(descriptors)) {
    result[key as keyof T] = typeof descriptor === 'string'
      ? resolveResourceName(pluginKey, { defaultName: descriptor }, options)
      : resolveResourceName(pluginKey, descriptor, options);
  }
  return result;
}

export { createLogger } from './concerns/logger.js';
export type { Logger, LogLevel } from './concerns/logger.js';
export {
  CronManager,
  createCronManager,
  getCronManager,
  resetCronManager,
} from './concerns/cron-manager.js';
export type { CronManagerOptions, CronTask } from './concerns/cron-manager.js';
export { tryFn } from './concerns/try-fn.js';
export { mapWithConcurrency, forEachWithConcurrency } from './concerns/map-with-concurrency.js';
export { idGenerator } from './concerns/id.js';
export { PluginError };
export { PluginStorage };
export type { PluginClient, PluginStorageOptions, PluginStorageSetOptions } from './plugins/concerns/plugin-storage.js';
export type { Database } from './database.class.js';
export type { DatabaseHookFunction, HookEventName } from './database/types.js';
export type { Resource } from './resource.class.js';
export type { MiddlewareContext, NextFunction, SupportedMethod } from './core/resource-middleware.class.js';
