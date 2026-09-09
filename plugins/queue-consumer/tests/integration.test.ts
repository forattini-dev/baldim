import { Baldim } from '@baldim/core';
import { MemoryClient } from '@baldim/adapter-memory';
import {
  QueueConsumerPlugin,
  QueueError,
  createConsumer,
  RedisPubSubConsumer,
  type QueueConsumer,
} from '../src/index.js';

interface FakeConsumer extends QueueConsumer {
  config: Record<string, unknown>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
}

function fakeConsumer(config: Record<string, unknown>, startError?: Error): FakeConsumer {
  return {
    config,
    start: vi.fn(async () => { if (startError) throw startError; }),
    stop: vi.fn(async () => undefined),
    publish: vi.fn(async (data: unknown) => ({ accepted: data })),
  };
}

describe('QueueConsumerPlugin integration', () => {
  beforeEach(() => MemoryClient.clearAllStorage());

  it('starts, publishes through, and stops a consumer', async () => {
    const created: FakeConsumer[] = [];
    const plugin = new QueueConsumerPlugin({
      logLevel: 'silent',
      drivers: [{ driver: 'fake', key: 'jobs', queues: [{ resources: 'jobs' }] }],
      consumerFactory: async (_driver, config) => {
        const consumer = fakeConsumer(config);
        created.push(consumer);
        return consumer;
      },
    });
    const database = new Baldim({ connectionString: 'memory://queue-lifecycle', logLevel: 'silent' });
    await database.connect();
    await database.usePlugin(plugin);

    expect(plugin.listPublishers()).toEqual(['fake:jobs']);
    await expect(plugin.publish('fake:jobs', { value: 1 })).resolves.toEqual({ accepted: { value: 1 } });
    expect(created[0]?.start).toHaveBeenCalledOnce();
    await database.uninstallPlugin('queueconsumer');
    expect(created[0]?.stop).toHaveBeenCalledOnce();
    expect(plugin.listPublishers()).toEqual([]);
    await database.disconnect();
  });

  it('passes custom messages and queue context to the handler', async () => {
    const handler = vi.fn(async () => undefined);
    let config: Record<string, unknown> = {};
    const plugin = new QueueConsumerPlugin({
      drivers: [{ driver: 'fake', queues: [{ name: 'events', onMessage: handler }] }],
      consumerFactory: async (_driver, value) => { config = value; return fakeConsumer(value); },
      logLevel: 'silent',
    });
    const database = new Baldim({ connectionString: 'memory://queue-custom', logLevel: 'silent' });
    await database.connect();
    await database.usePlugin(plugin);
    const message = { kind: 'created' };
    await (config.onMessage as (message: unknown) => Promise<void>)(message);
    expect(handler).toHaveBeenCalledWith(message, { driver: 'fake', queueName: 'events', raw: message });
    await database.disconnect();
  });

  it('applies insert, update, and delete messages to a real resource', async () => {
    let onMessage!: (message: Record<string, unknown>) => Promise<unknown>;
    const plugin = new QueueConsumerPlugin({
      drivers: [{ driver: 'fake', queues: [{ name: 'records', resources: 'records' }] }],
      consumerFactory: async (_driver, config) => {
        onMessage = config.onMessage as typeof onMessage;
        return fakeConsumer(config);
      },
      logLevel: 'silent',
    });
    const database = new Baldim({ connectionString: 'memory://queue-crud', logLevel: 'silent' });
    await database.connect();
    const records = await database.createResource({ name: 'records', attributes: { value: 'string|required' } });
    await database.usePlugin(plugin);

    await onMessage({ resource: 'records', action: 'insert', data: { id: 'one', value: 'first' } });
    await onMessage({ $body: { resource: 'records', action: 'update', data: { id: 'one', value: 'second' } } });
    expect(await records.get('one')).toMatchObject({ id: 'one', value: 'second' });
    await onMessage({ resource: 'records', action: 'delete', data: { id: 'one' } });
    await expect(records.get('one')).rejects.toThrow();
    await database.disconnect();
  });

  it.each(['update', 'delete'])('requires data.id for %s', async action => {
    const database = new Baldim({ connectionString: `memory://queue-${action}`, logLevel: 'silent' });
    await database.connect();
    await database.createResource({ name: 'records', attributes: { value: 'string' } });
    const plugin = new QueueConsumerPlugin({ logLevel: 'silent' });
    await database.usePlugin(plugin);
    await expect(plugin.handleMessage({ resource: 'records', action, data: {} }, 'records')).rejects.toThrow(`Action '${action}' requires data.id`);
    await database.disconnect();
  });

  it('rejects unsupported actions and missing resources', async () => {
    const database = new Baldim({ connectionString: 'memory://queue-validation', logLevel: 'silent' });
    await database.connect();
    const plugin = new QueueConsumerPlugin({ logLevel: 'silent' });
    await database.usePlugin(plugin);
    await expect(plugin.handleMessage({ action: 'insert', data: {} }, 'jobs')).rejects.toThrow('Resource not found in message');
    await expect(plugin.handleMessage({ resource: 'missing', action: 'insert', data: {} }, 'jobs')).rejects.toThrow("Resource 'missing' not found");
    await database.createResource({ name: 'jobs', attributes: { value: 'string' } });
    await expect(plugin.handleMessage({ resource: 'jobs', action: 'archive', data: {} }, 'jobs')).rejects.toThrow("Unsupported action 'archive'");
    await database.disconnect();
  });

  it('rejects duplicate publisher names before starting consumers', async () => {
    const factory = vi.fn(async (_driver: string, config: Record<string, unknown>) => fakeConsumer(config));
    const plugin = new QueueConsumerPlugin({
      drivers: [{ driver: 'fake', queues: [{ name: 'same', resources: ['one', 'two'] }] }],
      consumerFactory: factory,
      logLevel: 'silent',
    });
    const database = new Baldim({ connectionString: 'memory://queue-duplicates', logLevel: 'silent' });
    await database.connect();
    await expect(database.usePlugin(plugin)).rejects.toThrow("Duplicate queue publisher name 'same'");
    expect(factory).not.toHaveBeenCalled();
    await database.disconnect();
  });

  it('rolls back every created consumer when startup fails', async () => {
    const created: FakeConsumer[] = [];
    const plugin = new QueueConsumerPlugin({
      drivers: [{ driver: 'fake', queues: [{ name: 'good', resources: 'one' }, { name: 'bad', resources: 'two' }] }],
      startConcurrency: 1,
      consumerFactory: async (_driver, config) => {
        const consumer = fakeConsumer(config, created.length === 1 ? new Error('broker unavailable') : undefined);
        created.push(consumer);
        return consumer;
      },
      logLevel: 'silent',
    });
    const database = new Baldim({ connectionString: 'memory://queue-rollback', logLevel: 'silent' });
    await database.connect();
    await expect(database.usePlugin(plugin)).rejects.toThrow('Failed to start one or more queue consumers');
    expect(created).toHaveLength(2);
    expect(created[0]?.stop).toHaveBeenCalledOnce();
    expect(created[1]?.stop).toHaveBeenCalledOnce();
    expect(plugin.listPublishers()).toEqual([]);
    await database.disconnect();
  });

  it('reports unknown built-in drivers without loading optional dependencies', async () => {
    await expect(createConsumer('unknown', {})).rejects.toThrow('Unknown consumer driver: unknown');
  });

  it('routes asynchronous Redis pub/sub handler failures to onError', async () => {
    const onError = vi.fn();
    const consumer = new RedisPubSubConsumer({
      channels: ['events'],
      onMessage: async () => { throw new Error('handler failed'); },
      onError,
    });
    await (consumer as unknown as { _handleIncoming(channel: string, message: string): Promise<void> })
      ._handleIncoming('events', JSON.stringify({ id: 1 }));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'handler failed' }), {
      channel: 'events', message: '{"id":1}', pattern: undefined,
    });
  });

  it('reports unknown publishers with the available names', async () => {
    const plugin = new QueueConsumerPlugin({ logLevel: 'silent' });
    await expect(plugin.publish('missing', {})).rejects.toBeInstanceOf(QueueError);
  });
});
