# @baldin/plugin-ttl

Time-to-live policies for Baldin resources. The plugin supports indexed background cleanup and lazy expiration during reads.

```ts
import { Baldin } from '@baldin/core';
import { TTLPlugin } from '@baldin/plugin-ttl';

const db = new Baldin({ connectionString: 'memory://sessions' });
await db.connect();
await db.createResource({
  name: 'sessions',
  attributes: { token: 'string|required' },
});

await db.usePlugin(new TTLPlugin({
  resources: {
    sessions: { ttl: 3600, onExpire: 'hard-delete' },
  },
}));
```

Expiration strategies are `hard-delete`, `soft-delete`, `archive`, and `callback`. Use `mode: 'lazy'` to enforce expiration on reads without maintaining the expiration index.
