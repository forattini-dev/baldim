# @baldin/plugin-cookie-farm

CookieFarm manages persistent browser personas on top of
`@baldin/plugin-puppeteer`. It stores fingerprints and cookies, warms sessions,
tracks reputation, rotates unhealthy personas, and exports the active pool.

```ts
import { Baldin } from '@baldin/core';
import { PuppeteerPlugin } from '@baldin/plugin-puppeteer';
import { CookieFarmPlugin } from '@baldin/plugin-cookie-farm';

const database = new Baldin({ connectionString: 'memory://personas' });
await database.connect();
await database.usePlugin(new PuppeteerPlugin());
await database.usePlugin(new CookieFarmPlugin({ generation: { count: 5 } }));
```

Install Puppeteer first on the same database. Namespaced CookieFarm instances
prefer a Puppeteer instance with the same namespace.
