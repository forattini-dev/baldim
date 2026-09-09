# @baldim/plugin-graph

Graph relationships, indexed edges, traversal, and weighted shortest paths for Baldim resources.

```ts
import { Baldim } from '@baldim/core';
import { GraphPlugin } from '@baldim/plugin-graph';

const db = new Baldim({ connectionString: 'memory://social' });
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
