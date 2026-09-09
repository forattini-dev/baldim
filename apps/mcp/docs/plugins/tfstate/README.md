# @baldim/plugin-tfstate

Import, inspect, diff, monitor, and export Terraform or OpenTofu state with Baldim.

```sh
pnpm add @baldim/core @baldim/plugin-tfstate
```

```ts
import { Baldim } from '@baldim/core';
import { TfStatePlugin } from '@baldim/plugin-tfstate';

const database = new Baldim();
await database.connect();

const tfstate = new TfStatePlugin({
  driver: 'filesystem',
  config: { basePath: './terraform', selector: '**/*.tfstate' },
  trackDiffs: true,
});

await database.usePlugin(tfstate);
await tfstate.triggerMonitoring();
```

The plugin owns its filesystem glob dependency and its S3 integration dependency. The S3 driver uses `@baldim/adapter-s3`; provider code does not enter `@baldim/core`.

Driver classes are also available from `@baldim/plugin-tfstate/drivers`.
