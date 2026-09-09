# @baldim/plugin-metrics

Operation metrics, persistent telemetry, error and performance logs, and Prometheus output for Baldim.

```ts
import { Baldim } from '@baldim/core';
import { MetricsPlugin } from '@baldim/plugin-metrics';

const db = new Baldim({ connectionString: 'memory://metrics' });
await db.connect();

const metrics = new MetricsPlugin({
  flushInterval: 60_000,
  prometheus: { enabled: false },
});
await db.usePlugin(metrics);

console.log(await metrics.getStats());
```
