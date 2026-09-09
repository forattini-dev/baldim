# @baldim/plugin-tree

Tree operations for Baldim resources using nested-set or adjacency-list storage.
The plugin adds a `resource.tree` namespace and enriches returned nodes with
node-scoped tree helpers.

```ts
import { Baldim } from '@baldim/core';
import { TreePlugin } from '@baldim/plugin-tree';

const database = new Baldim({ connectionString: 'memory://catalog' });
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
