# @baldin/plugin-tfstate

Import, inspect, diff, monitor, and export Terraform or OpenTofu state with Baldin.

```sh
pnpm add @baldin/core @baldin/plugin-tfstate
```

```ts
import { Baldin } from '@baldin/core';
import { TfStatePlugin } from '@baldin/plugin-tfstate';

const database = new Baldin();
await database.connect();

const tfstate = new TfStatePlugin({
  driver: 'filesystem',
  config: { basePath: './terraform', selector: '**/*.tfstate' },
  trackDiffs: true,
});

await database.usePlugin(tfstate);
await tfstate.triggerMonitoring();
```

The plugin owns its filesystem glob dependency and its S3 integration dependency. The S3 driver uses `@baldin/adapter-s3`; provider code does not enter `@baldin/core`.

Driver classes are also available from `@baldin/plugin-tfstate/drivers`.
