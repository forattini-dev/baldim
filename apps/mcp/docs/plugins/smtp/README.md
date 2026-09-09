# @baldim/plugin-smtp

Email delivery and receiving for Baldim. The plugin supports provider and custom
SMTP relays, multi-relay strategies, an optional SMTP server, templates, retry
metadata, rate limiting, and delivery webhooks.

```ts
import { Baldim } from '@baldim/core';
import { SMTPPlugin } from '@baldim/plugin-smtp';

const database = new Baldim({ connectionString: 'memory://mail' });
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
  body: 'Hello from Baldim',
});
```

`nodemailer` and `smtp-server` are optional runtime dependencies used by relay
and legacy server modes. Server mode prefers Raffel when its SMTP adapter is
available.
