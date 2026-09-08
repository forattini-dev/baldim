import { QueueConsumerPlugin } from '../src/index.js';

describe('QueueConsumerPlugin configuration', () => {
  it('accepts the drivers and queues format', () => {
    const plugin = new QueueConsumerPlugin({
      logLevel: 'silent',
      drivers: [{
        driver: 'sqs',
        region: 'us-east-1',
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/my-queue',
        queues: [{ resources: 'users' }, { resources: ['orders', 'emails'] }],
      }],
    });
    expect(plugin.driversConfig).toHaveLength(1);
    expect(plugin.driversConfig[0]?.driver).toBe('sqs');
    expect(plugin.driversConfig[0]?.region).toBe('us-east-1');
    expect(plugin.driversConfig[0]?.queues?.[1]?.resources).toEqual(['orders', 'emails']);
  });

  it('normalizes the legacy consumers format', () => {
    const plugin = new QueueConsumerPlugin({
      logLevel: 'silent',
      consumers: [{
        driver: 'redis-list',
        config: { host: 'localhost', port: 6379, key: 'jobs' },
        consumers: [{ resources: 'events' }],
        reconnect: true,
      }],
    });
    expect(plugin.driversConfig).toEqual([{
      driver: 'redis-list',
      host: 'localhost',
      port: 6379,
      key: 'jobs',
      reconnect: true,
      queues: [{ resources: 'events' }],
    }]);
  });

  it('prefers drivers when both formats are present', () => {
    const plugin = new QueueConsumerPlugin({
      drivers: [{ driver: 'bullmq', queues: [{ resources: 'jobs' }] }],
      consumers: [{ driver: 'sqs', consumers: [{ resources: 'old' }] }],
      logLevel: 'silent',
    });
    expect(plugin.driversConfig.map(item => item.driver)).toEqual(['bullmq']);
  });

  it('allows a custom handler without a resource', () => {
    const handler = vi.fn();
    const plugin = new QueueConsumerPlugin({
      drivers: [{ driver: 'sqs', queues: [{ name: 'events', onMessage: handler }] }],
      logLevel: 'silent',
    });
    expect(plugin.driversConfig[0]?.queues?.[0]?.onMessage).toBe(handler);
    expect(plugin.driversConfig[0]?.queues?.[0]?.resources).toBeUndefined();
  });

  it('handles an empty configuration', () => {
    expect(new QueueConsumerPlugin({ logLevel: 'silent' }).driversConfig).toEqual([]);
  });

  it('normalizes invalid concurrency values', () => {
    const plugin = new QueueConsumerPlugin({ startConcurrency: Number.NaN, stopConcurrency: 0, logLevel: 'silent' });
    expect(plugin.startConcurrency).toBe(5);
    expect(plugin.stopConcurrency).toBe(5);
  });

  it('derives stable queue names for each driver shape', () => {
    const plugin = new QueueConsumerPlugin({ logLevel: 'silent' });
    expect(plugin.deriveQueueName('sqs', { queueUrl: 'https://sqs/jobs' }, 'users')).toBe('sqs:https://sqs/jobs');
    expect(plugin.deriveQueueName('bullmq', { queue: 'email-jobs' }, 'emails')).toBe('bullmq:email-jobs');
    expect(plugin.deriveQueueName('redis-list', { key: 'events' }, 'events')).toBe('redis-list:events');
    expect(plugin.deriveQueueName('redis-stream', { stream: 'logs' }, 'logs')).toBe('redis-stream:logs');
    expect(plugin.deriveQueueName('redis-pubsub', { channels: ['updates'] }, 'fallback')).toBe('redis-pubsub:updates');
    expect(plugin.deriveQueueName('sqs', {}, 'fallback')).toBe('sqs:fallback');
  });

  it('keeps the legacy name helpers as aliases', () => {
    const plugin = new QueueConsumerPlugin({ logLevel: 'silent' });
    expect(plugin._deriveQueueName('sqs', { queueUrl: 'x' }, 'r')).toBe('sqs:x');
    expect(plugin._deriveConsumerName('sqs', { queueUrl: 'x' }, 'r')).toBe('sqs:x');
  });
});
