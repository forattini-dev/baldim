# @baldin/plugin-audit

Persistent audit records for creates, updates, and deletes in Baldin resources.

```ts
import { Baldin } from '@baldin/core';
import { AuditPlugin } from '@baldin/plugin-audit';

const database = new Baldin({ connectionString: 'memory://app' });
await database.connect();
await database.usePlugin(new AuditPlugin({ includeData: true }));
```

The audit resource defaults to `plg_audits`. Use `namespace`, `resourceName`, or
`resourceNames.audit` when multiple plugin instances share a database.