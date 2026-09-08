# @baldin/plugin-fulltext

Persistent word indexes and ranked full-text search for Baldin resources.

```ts
import { Baldin } from '@baldin/core';
import { FullTextPlugin } from '@baldin/plugin-fulltext';

const database = new Baldin({ connectionString: 'memory://catalog' });
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

await products.insert({ name: 'Baldin azul', description: 'Pequeno e rápido' });
const matches = await database.plugins.fulltext.searchRecords('products', 'rápido');
```

Indexes are stored in a normal Baldin resource, survive reconnects, and can be rebuilt or cleared through the plugin API.
