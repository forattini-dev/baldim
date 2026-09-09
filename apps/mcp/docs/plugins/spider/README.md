# @baldim/plugin-spider

Web crawling and discovery for Baldim. Spider combines Recker-based HTTP crawling with optional browser automation, queue processing, TTL cleanup, persistence, proxy rotation, SEO analysis, security analysis, and technology detection.

```ts
import { Database } from '@baldim/core';
import { MemoryAdapter } from '@baldim/adapter-memory';
import { SpiderPlugin } from '@baldim/plugin-spider';

const db = new Database({ adapter: new MemoryAdapter() });

await db.use(new SpiderPlugin({
  puppeteer: { enabled: false },
  discovery: { enabled: true, maxDepth: 2 },
  crawlQueue: { driver: 'memory' },
  crawlStorage: { driver: 'memory' },
}));
```

Browser automation remains enabled by default. Set `puppeteer.enabled` to `false` for HTTP-only crawling without a local Chrome installation.

Optional crawl backends are installed with this package and can be selected through `crawlQueue`, `crawlStorage`, and `proxy` configuration.
