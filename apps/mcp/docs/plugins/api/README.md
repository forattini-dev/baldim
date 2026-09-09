# @baldim/plugin-api

Raffel-based API plugin for Baldim. It exposes database resources through HTTP and WebSocket endpoints with authentication, authorization, validation, rate limiting, OpenAPI/USD documentation, static files, health checks, and runtime inspection.

```ts
import { Baldim } from '@baldim/core';
import { ApiPlugin } from '@baldim/plugin-api';

const database = new Baldim({ connectionString: 'memory://app' });
await database.connect();
await database.usePlugin(new ApiPlugin({ port: 3000 }));
```

Raffel is a direct dependency of this package. Optional integrations such as Redis sessions, GeoIP, Pino HTTP, EJS, and Pug stay optional and are loaded only when configured.
