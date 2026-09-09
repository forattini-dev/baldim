# @baldin/plugin-cloud-inventory

Multi-cloud inventory for Baldin. It discovers infrastructure resources, records snapshots and changes, schedules synchronization, and exports Terraform state.

The package owns every provider SDK it loads. AWS SDK clients are regular dependencies because the AWS driver uses static imports; SDKs loaded only by their provider driver are optional dependencies.

```ts
import { Baldin } from '@baldin/core';
import { memory } from '@baldin/adapter-memory';
import { CloudInventoryPlugin } from '@baldin/plugin-cloud-inventory';

const database = new Baldin({ storage: memory() });
await database.connect();
await database.usePlugin(new CloudInventoryPlugin({
  clouds: [{ id: 'production', driver: 'aws', config: { regions: ['us-east-1'] } }],
}));
```

Provider driver classes and loaders are also available from `@baldin/plugin-cloud-inventory/drivers`.
