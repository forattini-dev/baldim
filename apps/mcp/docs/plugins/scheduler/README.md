# @baldim/plugin-scheduler

Cron-style jobs for Baldim with distributed locking, retries, timeouts, execution history, and coordinator election.

```ts
import { Baldim } from '@baldim/core';
import { SchedulerPlugin } from '@baldim/plugin-scheduler';

const database = new Baldim({ connectionString: 'memory://jobs' });
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

The scheduler uses Baldim's provider-neutral plugin storage for execution locks. In a distributed deployment, only the elected coordinator schedules timers and a lock prevents duplicate execution.
