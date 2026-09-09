# @baldim/plugin-queue-consumer

Queue consumption and publishing for Baldim. The package provides drivers for Amazon SQS, RabbitMQ, Redis lists, Redis streams, Redis pub/sub, and BullMQ. Install only the optional driver dependency used by your application.

```ts
import { Baldim } from '@baldim/core';
import { QueueConsumerPlugin } from '@baldim/plugin-queue-consumer';

const database = new Baldim({ connectionString: 'memory://queues' });
await database.connect();
await database.createResource({ name: 'jobs', attributes: { title: 'string|required' } });
await database.usePlugin(new QueueConsumerPlugin({
  drivers: [{
    driver: 'redis-list',
    host: 'localhost',
    key: 'jobs',
    queues: [{ name: 'jobs', resources: 'jobs' }],
  }],
}));
```

Driver dependencies are optional: `@aws-sdk/client-sqs`, `amqplib`, `ioredis`, or `bullmq`.
