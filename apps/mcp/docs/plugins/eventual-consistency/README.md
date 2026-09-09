# @baldin/plugin-eventual-consistency

Eventually consistent counters and aggregations for Baldin resources. The plugin
supports synchronous and asynchronous updates, coordinated ticket workers,
consolidation, recalculation, retention, and time-series analytics.

```sh
pnpm add @baldin/core @baldin/plugin-eventual-consistency
```

```ts
import { Baldin } from '@baldin/core';
import { EventualConsistencyPlugin } from '@baldin/plugin-eventual-consistency';

const database = new Baldin({ connectionString: 'memory://analytics' });
await database.connect();
const posts = await database.createResource({
  name: 'posts',
  attributes: { views: 'number|default:0' },
});

await database.usePlugin(new EventualConsistencyPlugin({
  mode: 'async',
  resources: { posts: ['views'] },
}));

await posts.insert({ id: 'post-1', views: 0 });
await posts.add('post-1', 'views', 1);

// Applies pending transactions for post-1 only.
await posts.consolidate('post-1', 'views');
```

The plugin adds `add`, `sub`, `set`, `increment`, `decrement`, `consolidate`,
`getConsolidatedValue`, and `recalculate` helpers to configured resources. It
restores any previous methods when stopped. Background consolidation and garbage
collection use Baldin's plugin storage and coordinator contracts, so the plugin
does not depend on a specific storage adapter.
