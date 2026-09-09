# @baldin/plugin-kubernetes-inventory

Kubernetes inventory for Baldin. The plugin discovers resources from one or more clusters and stores current snapshots, immutable versions, configuration diffs, and per-cluster sync state.

```ts
import { Baldin } from '@baldin/core';
import { KubernetesInventoryPlugin } from '@baldin/plugin-kubernetes-inventory';

const db = new Baldin({ connectionString: 'memory://inventory' });
await db.connect();

const inventory = new KubernetesInventoryPlugin({
  clusters: [{ id: 'production', context: 'production' }],
  discovery: { runOnInstall: true },
  scheduled: { enabled: true, cron: '0 */6 * * *', timezone: 'UTC' },
});

await db.usePlugin(inventory, 'k8s');
const snapshots = await inventory.getSnapshots({ clusterId: 'production' });
```

The package owns `@kubernetes/client-node`, `node-cron`, and its data-processing dependencies. It only requires `@baldin/core` as a peer.

## License

Unlicense.
