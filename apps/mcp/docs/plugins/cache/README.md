# @baldin/plugin-cache

Caching for Baldin resources with memory, filesystem, Redis, object-storage,
partition-aware filesystem, and multi-tier drivers.

```ts
import { Baldin } from '@baldin/core';
import { CachePlugin } from '@baldin/plugin-cache';

const database = new Baldin({ connectionString: 'memory://app' });
await database.connect();
await database.usePlugin(new CachePlugin({ driver: 'memory' }));
```

The plugin package owns its cache-driver integrations. Install `ioredis` in the
application when using the Redis driver. The object-storage driver consumes the
public storage client already attached to the Baldin database.
