import { randomUUID } from 'node:crypto';
import { Baldim } from '@baldim/core';
import { verifyPassword } from '@baldim/core/password';

export async function protectedFieldsExample(security: {
  passphrase: string;
  pepper: string;
}) {
  const db = new Baldim({
    connectionString: `memory://docs-protected-${randomUUID()}`,
    security: { ...security, bcrypt: { rounds: 12 } },
    logLevel: 'silent',
    exitOnSignal: false,
  });
  await db.connect();
  try {
    const attributes = {
      name: 'string|required',
      password: 'password|required',
      apiToken: 'secret|required',
    } as const;
    const accounts = await db.createResource({
      name: 'accounts',
      behavior: 'body-only',
      attributes,
    });
    await accounts.insert({
      id: 'ada',
      name: 'Ada',
      password: 'sample-password',
      apiToken: 'sample-api-token',
    });
    const account = await accounts.get('ada');
    const valid = await verifyPassword(
      'sample-password',
      account.password,
      security.pepper,
    );
    const invalid = await verifyPassword(
      'wrong-password',
      account.password,
      security.pepper,
    );
    await accounts.update('ada', { name: 'Ada Lovelace' }); // retain the password hash
    const updated = await accounts.get('ada');
    const raw = await db.createResource({
      name: 'accounts',
      behavior: 'body-only',
      attributes,
      autoDecrypt: false,
    });
    const encrypted = await raw.get('ada');
    return {
      valid,
      invalid,
      secretWasDecrypted: account.apiToken === 'sample-api-token',
      passwordHashWasPreserved: account.password === updated.password,
      rawReadIsEncrypted: encrypted.apiToken !== 'sample-api-token',
    };
  } finally {
    await db.disconnect();
  }
}
