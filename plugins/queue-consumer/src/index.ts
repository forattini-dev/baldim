import {
  Plugin,
  mapWithConcurrency,
  type Logger,
  type PluginOptions,
} from '@baldin/core/plugin';
import {
  createConsumer,
  type ConsumerFactory,
  type QueueConsumer,
} from './consumers/index.js';
import { QueueError } from './errors.js';

interface DatabaseResource {
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(id: string): Promise<unknown>;
}

export interface QueueMessage {
  resource?: string;
  action?: 'insert' | 'update' | 'delete' | string;
  data?: Record<string, unknown>;
  $body?: QueueMessage;
  [key: string]: unknown;
}

export interface QueueMessageContext {
  driver: string;
  queueName: string;
  raw: unknown;
}

export interface QueueDefinition {
  name?: string;
  resources?: string | string[];
  onMessage?: (message: QueueMessage, context: QueueMessageContext) => Promise<unknown>;
  queueUrl?: string;
  queueName?: string;
  [key: string]: unknown;
}

export interface DriverDefinition {
  driver: string;
  queues?: QueueDefinition[];
  [key: string]: unknown;
}

/** @deprecated Use DriverDefinition instead. */
export interface LegacyDriverDefinition {
  driver: string;
  config?: Record<string, unknown>;
  consumers?: LegacyConsumerDefinition[];
  [key: string]: unknown;
}

/** @deprecated Use QueueDefinition instead. */
export interface LegacyConsumerDefinition {
  name?: string;
  resources: string | string[];
  queueUrl?: string;
  queueName?: string;
  [key: string]: unknown;
}

export interface QueueConsumerPluginOptions extends PluginOptions {
  drivers?: DriverDefinition[];
  startConcurrency?: number;
  stopConcurrency?: number;
  consumerFactory?: ConsumerFactory;
  logger?: Logger;
  /** @deprecated Use `drivers` instead. */
  consumers?: LegacyDriverDefinition[];
}

interface StartTask {
  driver: string;
  queueName: string;
  create: () => Promise<QueueConsumer>;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? value as number : fallback;
}

export class QueueConsumerPlugin extends Plugin<QueueConsumerPluginOptions> {
  readonly driversConfig: DriverDefinition[];
  consumers: QueueConsumer[] = [];
  readonly startConcurrency: number;
  readonly stopConcurrency: number;
  private readonly consumerFactory: ConsumerFactory;
  readonly _consumersByName = new Map<string, QueueConsumer>();

  constructor(options: QueueConsumerPluginOptions = {}) {
    super(options);
    this.driversConfig = this.normalizeDriversConfig(options);
    this.startConcurrency = positiveInteger(options.startConcurrency, 5);
    this.stopConcurrency = positiveInteger(options.stopConcurrency, this.startConcurrency);
    this.consumerFactory = options.consumerFactory ?? createConsumer;
  }

  override async onInstall(): Promise<void> {
    if (this.consumers.length > 0) return;

    const tasks = this.createStartTasks();
    const names = new Set<string>();
    for (const task of tasks) {
      if (names.has(task.queueName)) {
        throw new QueueError(`Duplicate queue publisher name '${task.queueName}'`, {
          operation: 'onInstall',
          queueName: task.queueName,
          statusCode: 409,
          suggestion: 'Give each queue definition a unique name.',
        });
      }
      names.add(task.queueName);
    }

    const { errors } = await mapWithConcurrency(
      tasks,
      async task => {
        const consumer = await task.create();
        try {
          await consumer.start();
        } catch (cause) {
          try { await consumer.stop(); } catch { /* preserve the start failure */ }
          throw cause;
        }
        this.consumers.push(consumer);
        this._consumersByName.set(task.queueName, consumer);
      },
      { concurrency: this.startConcurrency }
    );

    if (errors.length > 0) {
      await this.stopConsumers();
      throw new QueueError('Failed to start one or more queue consumers', {
        operation: 'onInstall',
        details: errors.map(({ item, raw }) => `[${item.driver}:${item.queueName}] ${raw.message}`).join('; '),
        suggestion: 'Review queue configuration and connectivity before retrying.',
      });
    }
  }

  override async onStop(): Promise<void> {
    await this.stopConsumers();
  }

  async handleMessage(message: QueueMessage, configuredResource: string): Promise<unknown> {
    let body = message.$body ?? message;
    if (body.$body && !body.resource && !body.action && !body.data) body = body.$body;

    const resourceName = body.resource ?? message.resource;
    const action = body.action ?? message.action;
    const data = body.data ?? message.data;

    if (!resourceName) {
      throw new QueueError('Resource not found in message', {
        operation: 'handleMessage', queueName: configuredResource,
        suggestion: 'Include a resource field in the message.',
      });
    }
    if (!action) {
      throw new QueueError('Action not found in message', {
        operation: 'handleMessage', queueName: configuredResource,
        suggestion: 'Include an insert, update, or delete action in the message.',
      });
    }

    const resource = (this.database.resources as unknown as Record<string, DatabaseResource>)[resourceName];
    if (!resource) {
      throw new QueueError(`Resource '${resourceName}' not found`, {
        operation: 'handleMessage', queueName: configuredResource, resource: resourceName,
        availableResources: Object.keys(this.database.resources),
      });
    }

    if (action === 'insert') return resource.insert(data ?? {});
    if (action === 'update' || action === 'delete') {
      const payload = data ?? {};
      const id = payload.id;
      if (typeof id !== 'string' || id.length === 0) {
        throw new QueueError(`Action '${action}' requires data.id`, {
          operation: 'handleMessage', queueName: configuredResource, resource: resourceName, action,
        });
      }
      if (action === 'delete') return resource.delete(id);
      const { id: _id, ...attributes } = payload;
      return resource.update(id, attributes);
    }

    throw new QueueError(`Unsupported action '${action}'`, {
      operation: 'handleMessage', queueName: configuredResource, resource: resourceName, action,
      supportedActions: ['insert', 'update', 'delete'],
    });
  }

  /** @deprecated Kept for compatibility. Use handleMessage(). */
  async _handleMessage(message: QueueMessage, configuredResource: string): Promise<unknown> {
    return this.handleMessage(message, configuredResource);
  }

  async publish(target: string, data: unknown, options?: unknown): Promise<unknown> {
    const consumer = this._consumersByName.get(target);
    if (!consumer) {
      const available = this.listPublishers();
      throw new QueueError(`Publisher '${target}' not found`, {
        operation: 'publish',
        queueName: target,
        suggestion: available.length ? `Available publishers: ${available.join(', ')}` : 'No queue consumers are installed.',
      });
    }
    return consumer.publish(data, options);
  }

  getPublisher(target: string): QueueConsumer | undefined {
    return this._consumersByName.get(target);
  }

  listPublishers(): string[] {
    return [...this._consumersByName.keys()];
  }

  deriveQueueName(driver: string, config: Record<string, unknown>, resource: string): string {
    const channels = config.channels as string[] | undefined;
    const queueId = config.queueUrl ?? config.queue ?? config.key ?? config.stream ?? channels?.[0] ?? resource;
    return `${driver}:${String(queueId)}`;
  }

  /** @deprecated Kept for compatibility. Use deriveQueueName(). */
  _deriveQueueName(driver: string, config: Record<string, unknown>, resource: string): string {
    return this.deriveQueueName(driver, config, resource);
  }

  /** @deprecated Kept for compatibility. Use deriveQueueName(). */
  _deriveConsumerName(driver: string, config: Record<string, unknown>, resource: string): string {
    return this.deriveQueueName(driver, config, resource);
  }

  protected handleError(_error: Error, _raw: unknown, _queueName: string): void {}

  /** @deprecated Override handleError() instead. */
  _handleError(error: Error, raw: unknown, queueName: string): void {
    this.handleError(error, raw, queueName);
  }

  private normalizeDriversConfig(options: QueueConsumerPluginOptions): DriverDefinition[] {
    if (options.drivers) return options.drivers;
    return (options.consumers ?? []).map(legacy => {
      const { driver, config = {}, consumers = [], ...rest } = legacy;
      return { driver, ...config, ...rest, queues: consumers.map(queue => ({ ...queue })) };
    });
  }

  private createStartTasks(): StartTask[] {
    const tasks: StartTask[] = [];
    for (const definition of this.driversConfig) {
      const { driver, queues = [], ...driverConfig } = definition;
      for (const queue of queues) {
        const { resources, name, onMessage, ...queueConfig } = queue;
        const mergedConfig = { ...driverConfig, ...queueConfig };
        if (onMessage) {
          const queueName = name ?? this.deriveQueueName(driver, mergedConfig, 'custom');
          tasks.push({
            driver,
            queueName,
            create: () => this.consumerFactory(driver, {
              ...mergedConfig,
              onMessage: (message: QueueMessage) => onMessage(message, { driver, queueName, raw: message }),
              onError: (error: Error, raw: unknown) => this.handleError(error, raw, queueName),
            }),
          });
          continue;
        }

        const resourceNames = Array.isArray(resources) ? resources : resources ? [resources] : [];
        for (const resourceName of resourceNames) {
          const queueName = name ?? this.deriveQueueName(driver, mergedConfig, resourceName);
          tasks.push({
            driver,
            queueName,
            create: () => this.consumerFactory(driver, {
              ...mergedConfig,
              onMessage: (message: QueueMessage) => this.handleMessage(message, resourceName),
              onError: (error: Error, raw: unknown) => this.handleError(error, raw, queueName),
            }),
          });
        }
      }
    }
    return tasks;
  }

  private async stopConsumers(): Promise<void> {
    const active = [...this.consumers];
    this.consumers = [];
    this._consumersByName.clear();
    const { errors } = await mapWithConcurrency(active, consumer => consumer.stop(), {
      concurrency: this.stopConcurrency,
    });
    for (const { raw } of errors) {
      this.logger.warn({ error: raw.message }, `Failed to stop queue consumer: ${raw.message}`);
    }
  }
}

export { QueueError } from './errors.js';
export { createConsumer } from './consumers/index.js';
export type { ConsumerFactory, QueueConsumer } from './consumers/index.js';
export {
  SqsConsumer,
  RabbitMqConsumer,
  RedisListConsumer,
  RedisStreamConsumer,
  RedisPubSubConsumer,
  BullMqConsumer,
  loadSqsConsumer,
  loadRabbitMqConsumer,
  loadRedisListConsumer,
  loadRedisStreamConsumer,
  loadRedisPubSubConsumer,
  loadBullMqConsumer,
} from './consumers/index.js';
