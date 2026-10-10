import { Baldim, DocumentEngineError } from '@baldim/core';
import type { Client } from '@baldim/core/adapter';

// The caller supplies a real transactional client, e.g. local SQLite.
export async function uniqueIndexExample(client: Client) {
  const db = new Baldim({ client, logLevel: 'silent', exitOnSignal: false });
  await db.connect();
  try {
    const users = await db.createResource({
      name: 'users',
      behavior: 'body-only',
      attributes: { email: 'email|required', name: 'string|required' },
    });
    await users.createIndex('email', { fields: ['email'], unique: true });
    await users.insert({ id: 'ada', email: 'ada@example.com', name: 'Ada' });
    let conflict: string | null = null;
    try {
      await users.insert({
        id: 'duplicate',
        email: 'ada@example.com',
        name: 'Other',
      });
    } catch (error) {
      if (
        !(error instanceof DocumentEngineError) ||
        error.code !== 'UNIQUE_CONSTRAINT'
      )
        throw error;
      conflict = error.code; // the duplicate document was rolled back
    }
    const duplicate = await users.getOrNull('duplicate');
    const owner = await users.query({ email: 'ada@example.com' });
    return { conflict, duplicate, owner };
  } finally {
    await db.disconnect();
  }
}
