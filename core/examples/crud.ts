import { randomUUID } from 'node:crypto';
import { Baldim } from '@baldim/core';

export async function crudExample() {
  const db = new Baldim({
    connectionString: `memory://docs-crud-${randomUUID()}`,
    logLevel: 'silent',
    exitOnSignal: false,
  });
  await db.connect();
  try {
    const users = await db.createResource({
      name: 'users',
      behavior: 'body-only',
      asyncPartitions: false,
      attributes: {
        name: 'string|required',
        age: 'number|required',
        tenant: 'string|required',
        labels: { type: 'array', items: 'string' },
      },
      partitions: { byTenant: { fields: { tenant: 'string' } } },
    });
    await users.insertMany([
      { id: 'ada', name: 'Ada', age: 36, tenant: 'acme', labels: [] },
      { id: 'grace', name: 'Grace', age: 25, tenant: 'acme', labels: [] },
    ]);
    await users.patch('ada', { age: 37 });
    await users.modify('ada', {
      increment: { age: 1 },
      addToSet: { labels: 'reviewed' },
    });
    const selected = await users.query(
      { tenant: 'acme', age: { $gte: 30 } },
      {
        select: ['name', 'age'],
        orderBy: { age: 'desc' },
        limit: 10,
        maxScan: 100,
      },
    );
    const first = await users.page({ size: 1 });
    const second = first.nextCursor
      ? await users.page({ size: 1, cursor: first.nextCursor })
      : null;
    const audit = await users.repairPartitions(); // read-only by default
    const missing = await users.getOrNull('missing');
    const deleted = await users.deleteMany(['grace']);
    return { selected, first, second, audit, missing, deleted };
  } finally {
    await db.disconnect();
  }
}
