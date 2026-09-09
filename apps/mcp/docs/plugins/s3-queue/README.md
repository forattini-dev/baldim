# @baldim/plugin-s3-queue

Durable queues stored through Baldim resources and plugin storage. The plugin
supports visibility leases, retry and dead-letter policies, FIFO/LIFO ordering,
coordinated workers, recovery, queue statistics, and request-cost estimates.

Despite its compatibility name, the package works with any Baldim storage
adapter that implements the required conditional-write and lock capabilities.

```ts
import { Baldim } from '@baldim/core';
import { S3QueuePlugin } from '@baldim/plugin-s3-queue';

const database = new Baldim({ connectionString: 'memory://jobs' });
await database.connect();

const jobs = await database.createResource({
  name: 'jobs',
  attributes: { task: 'string|required' },
});

await database.usePlugin(new S3QueuePlugin({
  resource: 'jobs',
  autoStart: false,
  enableCoordinator: false,
}));

await jobs.enqueue({ task: 'rebuild-index' });
```
