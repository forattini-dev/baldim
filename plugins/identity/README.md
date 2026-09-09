# @baldim/plugin-identity

OAuth2 and OpenID Connect identity provider for Baldim. It includes RSA signing
keys, authorization code, refresh token, password and client credentials grants,
sessions, onboarding, account lockout, rate limiting, optional MFA and email,
and an administrative UI.

```ts
import { Baldim } from '@baldim/core';
import { IdentityPlugin } from '@baldim/plugin-identity';

const database = new Baldim({ connectionString: 'memory://identity' });
await database.connect();

const identity = new IdentityPlugin({
  host: '127.0.0.1',
  port: 4000,
  issuer: 'http://127.0.0.1:4000',
  resources: {
    users: { name: 'users' },
    tenants: { name: 'tenants' },
    clients: { name: 'oauth_clients' },
  },
  onboarding: {
    mode: 'config',
    admin: {
      email: 'admin@example.com',
      password: process.env.IDENTITY_ADMIN_PASSWORD!,
    },
  },
});

await database.usePlugin(identity);
```

The package owns its Raffel HTTP runtime. `nodemailer`, `otpauth`, `qrcode`,
and GeoIP support are optional dependencies used only when their matching
features are enabled. Audit support is supplied by `@baldim/plugin-audit`.

The server publishes OIDC discovery at `/.well-known/openid-configuration`,
keys at `/.well-known/jwks.json`, and Baldim integration metadata at
`/.well-known/baldim-identity.json`.

```ts
import {
  ClientCredentialsAuthDriver,
  PasswordAuthDriver,
} from '@baldim/plugin-identity/drivers';
```
