# @baldin/plugin-graph

Graph relationships, indexed edges, traversal, and weighted shortest paths for Baldin resources.

```ts
import { Baldin } from '@baldin/core';
import { GraphPlugin } from '@baldin/plugin-graph';

const db = new Baldin({ connectionString: 'memory://social' });
await db.connect();
await db.createResource({
  name: 'people',
  attributes: { name: 'string|required' },
});
await db.createResource({
  name: 'relationships',
  attributes: {
    source: 'string|required',
    target: 'string|required',
    label: 'string|optional',
  },
  partitions: {
    bySource: { fields: { source: 'string' } },
    byTarget: { fields: { target: 'string' } },
    byLabel: { fields: { label: 'string' } },
  },
});

await db.usePlugin(new GraphPlugin({
  vertices: 'people',
  edges: 'relationships',
}));

await db.resources.people.graph!.connect!('alice', 'bob', { label: 'knows' });
```
