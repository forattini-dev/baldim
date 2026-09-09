# @baldin/plugin-state-machine

Persistent state machines for Baldin resources, including guards, lifecycle
hooks, transition history, optimistic state versions, triggers, and state TTLs.

```ts
import { Baldin } from '@baldin/core';
import { StateMachinePlugin } from '@baldin/plugin-state-machine';

const database = new Baldin({ connectionString: 'memory://workflow' });
await database.connect();
await database.usePlugin(new StateMachinePlugin({
  stateMachines: {
    order: {
      initialState: 'pending',
      states: {
        pending: { on: { PAY: 'paid' } },
        paid: { type: 'final' },
      },
    },
  },
}));
```

Install `@baldin/plugin-scheduler` when cron triggers are enabled. Date,
function, and event triggers use the database-scoped lifecycle managers.
