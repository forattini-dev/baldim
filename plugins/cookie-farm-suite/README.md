# @baldim/plugin-cookie-farm-suite

CookieFarmSuite installs and coordinates Puppeteer, CookieFarm, S3Queue, and an
optional TTL policy under one namespace. It provides a persistent persona-job
resource and a processor API for application workflows.

```ts
import { CookieFarmSuitePlugin } from '@baldim/plugin-cookie-farm-suite';

await database.usePlugin(new CookieFarmSuitePlugin({
  namespace: 'persona',
  queue: { autoStart: false },
  cookieFarm: { generation: { count: 0 } },
}));
```

Each composed plugin remains independently installable and is declared as a
direct runtime dependency of this package.
