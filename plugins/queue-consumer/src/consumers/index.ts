import { PluginError } from '@baldin/core/plugin';
import { SqsConsumer } from './sqs-consumer.js';
import { RabbitMqConsumer } from './rabbitmq-consumer.js';
import { RedisListConsumer } from './redis-list-consumer.js';
import { RedisStreamConsumer } from './redis-stream-consumer.js';
import { RedisPubSubConsumer } from './redis-pubsub-consumer.js';
import { BullMqConsumer } from './bullmq-consumer.js';

export { SqsConsumer } from './sqs-consumer.js';
export { RabbitMqConsumer } from './rabbitmq-consumer.js';
export { RedisListConsumer } from './redis-list-consumer.js';
export { RedisStreamConsumer } from './redis-stream-consumer.js';
export { RedisPubSubConsumer } from './redis-pubsub-consumer.js';
export { BullMqConsumer } from './bullmq-consumer.js';

export interface QueueConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
  publish(data: unknown, options?: unknown): Promise<unknown>;
}

type ConsumerConstructor = new (config: Record<string, unknown>) => QueueConsumer;

const consumerDrivers: Record<string, ConsumerConstructor> = {
  sqs: SqsConsumer as unknown as ConsumerConstructor,
  rabbitmq: RabbitMqConsumer as unknown as ConsumerConstructor,
  'redis-list': RedisListConsumer as unknown as ConsumerConstructor,
  'redis-stream': RedisStreamConsumer as unknown as ConsumerConstructor,
  'redis-pubsub': RedisPubSubConsumer as unknown as ConsumerConstructor,
  bullmq: BullMqConsumer as unknown as ConsumerConstructor,
};

export type ConsumerFactory = (
  driver: string,
  config: Record<string, unknown>
) => Promise<QueueConsumer>;

export async function createConsumer(
  driver: string,
  config: Record<string, unknown>
): Promise<QueueConsumer> {
  const Consumer = consumerDrivers[driver];
  if (!Consumer) {
    throw new PluginError(`Unknown consumer driver: ${driver}`, {
      pluginName: 'QueueConsumerPlugin',
      operation: 'createConsumer',
      statusCode: 400,
      retriable: false,
      suggestion: `Use one of the available drivers: ${Object.keys(consumerDrivers).join(', ')}`,
      driver,
    });
  }
  return new Consumer(config);
}

export const loadSqsConsumer = async (): Promise<typeof SqsConsumer> => SqsConsumer;
export const loadRabbitMqConsumer = async (): Promise<typeof RabbitMqConsumer> => RabbitMqConsumer;
export const loadRedisListConsumer = async (): Promise<typeof RedisListConsumer> => RedisListConsumer;
export const loadRedisStreamConsumer = async (): Promise<typeof RedisStreamConsumer> => RedisStreamConsumer;
export const loadRedisPubSubConsumer = async (): Promise<typeof RedisPubSubConsumer> => RedisPubSubConsumer;
export const loadBullMqConsumer = async (): Promise<typeof BullMqConsumer> => BullMqConsumer;
