# @baldim/plugin-cookie-farm

CookieFarm manages persistent browser personas on top of
`@baldim/plugin-puppeteer`. It stores fingerprints and cookies, warms sessions,
tracks reputation, rotates unhealthy personas, and exports the active pool.

```ts
import { Baldim } from '@baldim/core';
import { PuppeteerPlugin } from '@baldim/plugin-puppeteer';
import { CookieFarmPlugin } from '@baldim/plugin-cookie-farm';

const database = new Baldim({ connectionString: 'memory://personas' });
await database.connect();
await database.usePlugin(new PuppeteerPlugin());
await database.usePlugin(new CookieFarmPlugin({ generation: { count: 5 } }));
```

Install Puppeteer first on the same database. Namespaced CookieFarm instances
prefer a Puppeteer instance with the same namespace.
