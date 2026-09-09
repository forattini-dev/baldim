# @baldin/plugin-smtp

Email delivery and receiving for Baldin. The plugin supports provider and custom
SMTP relays, multi-relay strategies, an optional SMTP server, templates, retry
metadata, rate limiting, and delivery webhooks.

```ts
import { Baldin } from '@baldin/core';
import { SMTPPlugin } from '@baldin/plugin-smtp';

const database = new Baldin({ connectionString: 'memory://mail' });
await database.connect();

const smtp = new SMTPPlugin({
  driver: 'sendgrid',
  from: 'noreply@example.com',
  config: { apiKey: process.env.SENDGRID_API_KEY },
});

await database.usePlugin(smtp);
await smtp.sendEmail({
  from: 'noreply@example.com',
  to: 'user@example.com',
  subject: 'Welcome',
  body: 'Hello from Baldin',
});
```

`nodemailer` and `smtp-server` are optional runtime dependencies used by relay
and legacy server modes. Server mode prefers Raffel when its SMTP adapter is
available.
