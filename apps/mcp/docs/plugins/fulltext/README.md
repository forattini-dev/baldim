# @baldim/plugin-fulltext

Persistent word indexes and ranked full-text search for Baldim resources.

```ts
import { Baldim } from '@baldim/core';
import { FullTextPlugin } from '@baldim/plugin-fulltext';

const database = new Baldim({ connectionString: 'memory://catalog' });
await database.connect();

await database.usePlugin(new FullTextPlugin({
  fields: {
    products: ['name', 'description'],
  },
}));

const products = await database.createResource({
  name: 'products',
  attributes: { name: 'string|required', description: 'string' },
});

await products.insert({ name: 'Baldim azul', description: 'Pequeno e rápido' });
const matches = await database.plugins.fulltext.searchRecords('products', 'rápido');
```

Indexes are stored in a normal Baldim resource, survive reconnects, and can be rebuilt or cleared through the plugin API.
