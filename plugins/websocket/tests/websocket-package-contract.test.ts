import { describe, expect, it } from 'vitest';
import { WebSocketPlugin } from '../src/index.js';
import { createMemoryDatabaseForTest } from './helpers/database.js';

describe('WebSocket package contract', () => {
  it('reports the bound port and Baldin readiness dependency', async () => {
    const database = createMemoryDatabaseForTest(`websocket-contract-${Date.now()}`, {
      logLevel: 'silent',
    });
    const websocket = new WebSocketPlugin({
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      startupBanner: false,
    });

    await database.connect();
    try {
      await database.usePlugin(websocket);
      const info = websocket.getServerInfo();
      expect(info.isRunning).toBe(true);
      expect('port' in info ? info.port : 0).toBeGreaterThan(0);

      if (!('port' in info)) throw new Error('WebSocket server did not expose its bound port');
      const response = await fetch(`http://127.0.0.1:${info.port}/health/ready`);
      expect(response.status).toBe(200);
      const body = await response.json() as {
        checks: Record<string, { status: string }>;
      };
      expect(body.checks.baldin).toEqual({ status: 'healthy' });
      expect(body.checks).not.toHaveProperty('s3db');
    } finally {
      await websocket.onStop();
      await database.disconnect();
    }
  });
});
