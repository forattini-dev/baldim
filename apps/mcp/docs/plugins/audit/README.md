# @baldim/plugin-audit

Persistent audit records for creates, updates, and deletes in Baldim resources.

```ts
import { Baldim } from '@baldim/core';
import { AuditPlugin } from '@baldim/plugin-audit';

const database = new Baldim({ connectionString: 'memory://app' });
await database.connect();
await database.usePlugin(new AuditPlugin({ includeData: true }));
```

The audit resource defaults to `plg_audits`. Use `namespace`, `resourceName`, or
`resourceNames.audit` when multiple plugin instances share a database.