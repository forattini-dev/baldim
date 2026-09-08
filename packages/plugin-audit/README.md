# @buckiedb/plugin-audit

Persistent audit records for creates, updates, and deletes in BuckieDB resources.

```ts
import { BuckieDB } from '@buckiedb/core';
import { AuditPlugin } from '@buckiedb/plugin-audit';

const database = new BuckieDB({ connectionString: 'memory://app' });
await database.connect();
await database.usePlugin(new AuditPlugin({ includeData: true }));
```

The audit resource defaults to `plg_audits`. Use `namespace`, `resourceName`, or
`resourceNames.audit` when multiple plugin instances share a database.