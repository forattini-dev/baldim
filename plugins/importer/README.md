# @baldin/plugin-importer

Streaming file imports for Baldin resources. The plugin supports JSON arrays,
JSONL/NDJSON, CSV, TSV, and gzip-compressed variants, with field mapping,
transformations, validation, deduplication, batching, and progress events.

```ts
import { Baldin } from '@baldin/core';
import { ImporterPlugin, Transformers } from '@baldin/plugin-importer';

const database = new Baldin({ connectionString: 'memory://imports' });
await database.connect();

await database.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required',
  },
});

const importer = new ImporterPlugin({
  resource: 'users',
  format: 'csv',
  transforms: { email: Transformers.toLowerCase() },
});

await database.usePlugin(importer);
await importer.import('./users.csv');
```
