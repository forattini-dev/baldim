# @baldim/plugin-state-machine

Persistent state machines for Baldim resources, including guards, lifecycle
hooks, transition history, optimistic state versions, triggers, and state TTLs.

```ts
import { Baldim } from '@baldim/core';
import { StateMachinePlugin } from '@baldim/plugin-state-machine';

const database = new Baldim({ connectionString: 'memory://workflow' });
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

Install `@baldim/plugin-scheduler` when cron triggers are enabled. Date,
function, and event triggers use the database-scoped lifecycle managers.
