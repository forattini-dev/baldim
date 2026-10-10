# Passwords and secrets

[Core guide](../README.md) · [API reference](api.md) · [Executable recipe](recipes.md#passwords-and-secrets)

| Schema type | Stored value | Normal read | Intended use |
| --- | --- | --- | --- |
| `password` / `password:bcrypt` | Compact bcrypt hash | Hash; never the original password | Verifying a supplied password |
| `password:argon2id` | Compact Argon2id hash | Hash | Password verification with Argon2id |
| `secret` | Encrypted string | Decrypted value when `autoDecrypt: true` | Reversible application secrets |

These fields do not add authentication routes, authorization, or automatic response redaction. `get()` returns a password hash and, by default, decrypted secret fields. Select public fields before returning application responses; do not serialize the whole record as an account response.

## Configure the database

Supply a passphrase and optional password pepper from your application configuration. The compatibility default passphrase is the literal `secret`; replace it for data that must be protected. Resource `security` overrides are merged with the database settings.

```ts
import { Baldim } from '@baldim/core';
import { verifyPassword } from '@baldim/core/password';

const passphrase = process.env.APP_ENCRYPTION_PASSPHRASE;
const pepper = process.env.APP_PASSWORD_PEPPER;
if (!passphrase || !pepper) throw new Error('Missing protected-field configuration');

const db = new Baldim({
  connectionString: 'memory://accounts',
  security: { passphrase, pepper, bcrypt: { rounds: 12 } },
});
await db.connect();
const accounts = await db.createResource({
  name: 'accounts', behavior: 'body-only',
  attributes: {
    email: 'email|required',
    password: 'password|required',
    apiToken: 'secret|required',
  },
});
await accounts.insert({ id: 'ada', email: 'ada@example.com', password: 'sample-password', apiToken: 'sample-token' });
const account = await accounts.get('ada');
const authenticated = await verifyPassword('sample-password', account.password, pepper);
// Return an explicitly selected public response, not the complete account.
const publicAccount = { id: account.id, email: account.email };
await db.disconnect();
```

The examples use fixture credentials only. A pepper is applied before hashing and must also be passed to `verifyPassword`. Passphrase changes and pepper changes have different effects: changing the passphrase does not re-encrypt existing records; changing the pepper makes existing password verification fail until a deliberate migration/reset strategy handles it. There is no automatic key rotation API.

## Hashing, verification and updates

`password` defaults to bcrypt with 12 rounds. Supported bcrypt rounds are 12–31. `password:argon2id` uses the Argon2id implementation, with defaults `memoryCost: 65536` (KiB), `timeCost: 3`, `parallelism: 4`; the current helper requires a power-of-two memory cost. Hash algorithms have optional native dependencies: if optional packages were omitted or native bindings cannot load, hashing fails. Install/rebuild the selected implementation in the consuming application as needed (`bcrypt` or `argon2`).

```ts
const accounts = await db.createResource({
  name: 'accounts',
  security: { argon2: { memoryCost: 65536, timeCost: 3, parallelism: 4 } },
  attributes: { password: 'password:argon2id|required' },
});
```

`verifyPassword(plaintext, storedHash, pepper?)` accepts the compact hashes returned by resources as well as supported full hashes. It returns false for a mismatch or unusable hash/module; it does not return a diagnostic exception for every verification failure. Use the async helpers; `hashPasswordSync` requires bcrypt to have been loaded first.

An update that omits `password` preserves the existing hash. Supplying a new plaintext password hashes it; supplying a recognized stored hash preserves that hash rather than hashing it again. Validation itself can transform protected fields, so do not assume `validate()` is a read-only inspection of its input values. Use migrations with deterministic normalization; encrypted values use randomized encryption, and password changes need their own planned handling.

## Secret reads and writes

Secrets use AES-256-GCM with a random salt/IV and PBKDF2-derived key. Treat the ciphertext as opaque; do not depend on its byte/string layout. Secret validation requires a configured passphrase and recognizes ciphertext decryptable with the current key to avoid encrypting it again.

`autoDecrypt` defaults to true. For a resource that should expose opaque stored values, declare `autoDecrypt: false` with the same schema and security configuration. This controls reading; it is not an instruction to write plaintext or a replacement for authorization. Decryption failure can leave the encrypted value in the returned field; do not treat a returned string as proof that decryption succeeded.

An unrelated update preserves unchanged protected fields. Explicitly changing a secret encrypts the replacement. A full `replace()` still requires the complete intended payload: omitted required protected fields fail validation and omitted optional fields disappear. [The verified recipe](recipes.md#passwords-and-secrets) checks verification, unrelated updates and ciphertext reads.
