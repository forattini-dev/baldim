# @baldim/plugin-kubernetes-inventory

Kubernetes inventory for Baldim. The plugin discovers resources from one or more clusters and stores current snapshots, immutable versions, configuration diffs, and per-cluster sync state.

```ts
import { Baldim } from '@baldim/core';
import { KubernetesInventoryPlugin } from '@baldim/plugin-kubernetes-inventory';

const db = new Baldim({ connectionString: 'memory://inventory' });
await db.connect();

const inventory = new KubernetesInventoryPlugin({
  clusters: [{ id: 'production', context: 'production' }],
  discovery: { runOnInstall: true },
  scheduled: { enabled: true, cron: '0 */6 * * *', timezone: 'UTC' },
});

await db.usePlugin(inventory, 'k8s');
const snapshots = await inventory.getSnapshots({ clusterId: 'production' });
```

The package owns `@kubernetes/client-node`, `node-cron`, and its data-processing dependencies. It only requires `@baldim/core` as a peer.

## License

MIT.
