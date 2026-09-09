# @baldin/plugin-costs

Provider-aware accounting and projections for requests, rows, storage, and data transfer.

```ts
import { Baldin } from '@baldin/core';
import { CostsPlugin } from '@baldin/plugin-costs';

const db = new Baldin({ connectionString: 'memory://costs' });
await db.connect();

const costs = new CostsPlugin();
await db.usePlugin(costs);

console.log(costs.snapshot({ windowMs: 60_000 }));
console.log(costs.estimate({ days: 30 }));
```

The plugin detects AWS S3, Cloudflare R2, Cloudflare D1, Turso, and self-hosted connection strings. Pass `provider` to override detection.
