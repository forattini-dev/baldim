# @baldin/plugin-metrics

Operation metrics, persistent telemetry, error and performance logs, and Prometheus output for Baldin.

```ts
import { Baldin } from '@baldin/core';
import { MetricsPlugin } from '@baldin/plugin-metrics';

const db = new Baldin({ connectionString: 'memory://metrics' });
await db.connect();

const metrics = new MetricsPlugin({
  flushInterval: 60_000,
  prometheus: { enabled: false },
});
await db.usePlugin(metrics);

console.log(await metrics.getStats());
```
