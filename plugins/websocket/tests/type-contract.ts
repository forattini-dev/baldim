import {
  WebSocketPlugin,
  WebSocketServer,
  type WebSocketOptions,
  type WebSocketServerInfo,
} from '../src/index.js';

void WebSocketPlugin;
void WebSocketServer;
void ({} as WebSocketOptions);
void ({} as WebSocketServerInfo);

new WebSocketPlugin({
  auth: {
    drivers: [{
      driver: 'oidc',
      config: { issuer: 'https://identity.example.test' },
    }],
  },
});

new WebSocketPlugin({
  auth: {
    apiKey: { enabled: true, keys: { development: { id: 'test-user' } } },
  },
});
