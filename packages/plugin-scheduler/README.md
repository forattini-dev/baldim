# @baldin/plugin-scheduler

Cron-style jobs for Baldin with distributed locking, retries, timeouts, execution history, and coordinator election.

```ts
import { Baldin } from '@baldin/core';
import { SchedulerPlugin } from '@baldin/plugin-scheduler';

const database = new Baldin({ connectionString: 'memory://jobs' });
await database.connect();

await database.usePlugin(new SchedulerPlugin({
  jobs: {
    cleanup: {
      schedule: '0 * * * *',
      action: async (db, context) => {
        console.log(`running ${context.jobName} on ${db.id}`);
      },
    },
  },
}));
```

The scheduler uses Baldin's provider-neutral plugin storage for execution locks. In a distributed deployment, only the elected coordinator schedules timers and a lock prevents duplicate execution.
