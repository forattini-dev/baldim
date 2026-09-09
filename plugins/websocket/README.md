# @baldim/plugin-websocket

Standalone real-time server for Baldim resources. It supports CRUD messages,
resource subscriptions, public/private/presence/queue channels, JWT and API-key
authentication, single-use connection tickets, compression, rate limiting, and
connection recovery.

```ts
import { Baldim } from '@baldim/core';
import { WebSocketPlugin } from '@baldim/plugin-websocket';

const database = new Baldim({ connectionString: 'memory://realtime' });
await database.connect();

const websocket = new WebSocketPlugin({
  host: '127.0.0.1',
  port: 3001,
  resources: {
    messages: {
      protected: ['internalNotes'],
    },
  },
});

await database.usePlugin(websocket);
```

The package owns its Raffel WebSocket runtime and its `jose` JWT verification
dependency. It can run without the API plugin. Applications may use
`@baldim/plugin-api` alongside it when they need both HTTP CRUD and a dedicated
real-time endpoint.
