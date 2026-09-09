# @baldim/plugin-vector

Vector search, distance metrics, and k-means clustering for Baldim resources.
Search uses a portable JavaScript implementation and automatically uses the
optional `sqlite-vec` capability when the SQLite adapter exposes it.

```ts
import { Baldim } from '@baldim/core';
import { VectorPlugin } from '@baldim/plugin-vector';

const database = new Baldim({ connectionString: 'memory://vectors' });
await database.connect();

const documents = await database.createResource({
  name: 'documents',
  attributes: {
    title: 'string|required',
    embedding: 'embedding:3',
  },
  behavior: 'body-overflow',
});

await database.usePlugin(new VectorPlugin({ dimensions: 3 }));
await documents.insert({ title: 'Example', embedding: [1, 0, 0] });

const matches = await documents.vectorSearch([1, 0, 0], {
  vectorField: 'embedding',
  limit: 5,
});
```
