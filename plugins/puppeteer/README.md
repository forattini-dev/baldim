# @baldim/plugin-puppeteer

Browser automation for Baldim with proxy pools, persistent cookie sessions,
network and console monitoring, performance metrics, storage capture, and
anti-bot inspection.

```ts
import { Baldim } from '@baldim/core';
import { PuppeteerPlugin } from '@baldim/plugin-puppeteer';

const database = new Baldim({ connectionString: 'memory://browser-work' });
await database.connect();

const browser = await database.usePlugin(new PuppeteerPlugin({
  launch: { headless: true },
  cookies: { enabled: true },
}));
```

The package owns its browser dependencies. Puppeteer downloads its supported
browser during installation unless the standard Puppeteer environment settings
select an existing executable or skip the download.
