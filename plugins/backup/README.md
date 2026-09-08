# @baldin/plugin-backup

Full and incremental Baldin resource backups with filesystem, object-storage, and multi-destination drivers.

```ts
import { BackupPlugin } from '@baldin/plugin-backup';

const backup = new BackupPlugin({
  driver: 'filesystem',
  config: { path: './backups/{date}' },
  compression: 'gzip',
});

await database.usePlugin(backup);
const result = await backup.backup('full');
await backup.restore(result.id, { mode: 'replace' });
```

Compression supports `none`, `gzip`, `brotli`, and `deflate`. Authenticated archive encryption uses `aes-256-gcm`.

The S3 driver accepts the public structural methods of `@baldin/adapter-s3` through `config.client`; the plugin does not import or install a provider implementation. The multi driver combines filesystem and object-storage destinations with `all`, `any`, or `priority` strategies.
