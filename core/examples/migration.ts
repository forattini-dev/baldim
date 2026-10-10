import { randomUUID } from 'node:crypto';
import { Baldim, compareSchemas } from '@baldim/core';

export async function migrationExample() {
  const db = new Baldim({
    connectionString: `memory://docs-migration-${randomUUID()}`,
    logLevel: 'silent',
    exitOnSignal: false,
  });
  await db.connect();
  try {
    const previous = {
      legacyName: 'string|required',
      amountText: 'string|required',
    } as const;
    const old = await db.createResource({
      name: 'customers',
      behavior: 'body-only',
      attributes: previous,
    });
    await old.insertMany([
      { id: 'a', legacyName: 'Ada', amountText: '12.50' },
      { id: 'b', legacyName: 'Grace', amountText: '3.00' },
    ]);
    // Retain source fields as optional while old documents are still readable.
    const next = {
      legacyName: 'string|optional',
      amountText: 'string|optional',
      name: 'string|required',
      cents: 'number|required',
      active: 'boolean|required',
    } as const;
    const changes = compareSchemas(previous, next);
    const customers = await db.createResource({
      name: 'customers',
      behavior: 'body-only',
      attributes: next,
    });
    let dependencyAvailable = false;
    const visited: string[] = [];
    const transform = (current: { id: string; [field: string]: unknown }) => {
      visited.push(current.id);
      // Demonstrate a temporary failure before any write to this document.
      if (current.id === 'b' && !dependencyAvailable)
        throw new Error('Lookup temporarily unavailable');
      return {
        name: String(current.legacyName),
        cents: Math.round(Number(current.amountText) * 100),
        active: true,
      };
    };
    const options = {
      name: 'customer-name-cents-v1',
      batchSize: 2,
      maxBatches: 10,
      transform,
    };
    const first = await customers.migrate(options);
    // first.complete is false; first.failures identifies b. Document a is committed.
    dependencyAvailable = true;
    const resumed = await customers.migrate(options); // a is skipped by its journal
    const documents = await customers.list({ limit: 10 });
    return { changes, first, resumed, documents, visited };
  } finally {
    await db.disconnect();
  }
}
