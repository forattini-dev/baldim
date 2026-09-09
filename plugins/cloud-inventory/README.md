# @baldim/plugin-cloud-inventory

Multi-cloud inventory for Baldim. It discovers infrastructure resources, records snapshots and changes, schedules synchronization, and exports Terraform state.

The package owns every provider SDK it loads. AWS SDK clients are regular dependencies because the AWS driver uses static imports; SDKs loaded only by their provider driver are optional dependencies.

```ts
import { Baldim } from '@baldim/core';
import { memory } from '@baldim/adapter-memory';
import { CloudInventoryPlugin } from '@baldim/plugin-cloud-inventory';

const database = new Baldim({ storage: memory() });
await database.connect();
await database.usePlugin(new CloudInventoryPlugin({
  clouds: [{ id: 'production', driver: 'aws', config: { regions: ['us-east-1'] } }],
}));
```

Provider driver classes and loaders are also available from `@baldim/plugin-cloud-inventory/drivers`.
