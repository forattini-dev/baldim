# @baldin/plugin-tree

Tree operations for Baldin resources using nested-set or adjacency-list storage.
The plugin adds a `resource.tree` namespace and enriches returned nodes with
node-scoped tree helpers.

```ts
import { Baldin } from '@baldin/core';
import { TreePlugin } from '@baldin/plugin-tree';

const database = new Baldin({ connectionString: 'memory://catalog' });
await database.connect();

const categories = await database.createResource({
  name: 'categories',
  attributes: {
    name: 'string|required',
    parentId: 'string|optional',
  },
  partitions: {
    byParent: { fields: { parentId: 'string' } },
  },
});

await database.usePlugin(new TreePlugin({
  resources: ['categories'],
  driver: 'adjacency-list',
}));

const root = await categories.tree.createRoot({ name: 'Products' });
await categories.tree.addChild(root.id, { name: 'Books' });
```
