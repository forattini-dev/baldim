import { Baldin } from '@baldin/core';
import { IdentityPlugin } from '../src/index.js';

describe('IdentityServer Raffel runtime', () => {
  it('serves health, OIDC discovery, and Baldin integration metadata', async () => {
    const database = new Baldin({
      connectionString: `memory://identity-raffel-${Date.now()}`,
      logLevel: 'silent',
    });
    const identity = new IdentityPlugin({
      host: '127.0.0.1',
      port: 0,
      issuer: 'http://127.0.0.1',
      logLevel: 'silent',
      onboarding: { enabled: false },
      email: { enabled: false },
      audit: { enabled: false },
      failban: { enabled: false },
      session: { enableCleanup: false },
      resources: {
        users: { name: 'users' },
        tenants: { name: 'tenants' },
        clients: { name: 'oauth_clients' },
      },
    });

    await database.connect();

    try {
      await database.usePlugin(identity);
      const info = identity.getServerInfo();
      expect(info.isRunning).toBe(true);
      expect(info.port).toBeGreaterThan(0);

      const origin = `http://127.0.0.1:${info.port}`;
      const [health, discovery, integration] = await Promise.all([
        fetch(`${origin}/health`),
        fetch(`${origin}/.well-known/openid-configuration`),
        fetch(`${origin}/.well-known/baldin-identity.json`),
      ]);

      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({
        success: true,
        data: { status: 'ok', service: 'identity-provider' },
      });
      expect(discovery.status).toBe(200);
      expect(await discovery.json()).toMatchObject({
        issuer: 'http://127.0.0.1',
        token_endpoint: 'http://127.0.0.1/oauth/token',
      });
      expect(integration.status).toBe(200);
      expect(await integration.json()).toMatchObject({
        issuer: 'http://127.0.0.1',
        resources: { users: 'users', clients: 'oauth_clients' },
      });
    } finally {
      await identity.onStop();
      await database.disconnect();
    }
  });
});
