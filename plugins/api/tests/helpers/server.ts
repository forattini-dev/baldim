import { ApiPlugin } from '../../src/index.js';

export async function waitForServer(port, options = {}) {
  const {
    path = '/health',
    maxAttempts = 300, // Increased from 60 to 300 (30 seconds)
    delayMs = 100
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (response.ok || response.status === 401 || response.status === 404) {
        return;
      }
    } catch (err) {
      // swallow connection errors until server is ready
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error(`API server on port ${port} did not become ready in time`);
}

export function getApiPort(plugin) {
  const port = plugin.getServerInfo().port;
  if (typeof port !== 'number' || port <= 0) {
    throw new Error('API server did not expose its bound port');
  }
  return port;
}

export async function startApiPlugin(db, pluginOptions = {}, instanceName) {
  const mergedOptions = {
    host: '127.0.0.1',
    logLevel: 'debug', // Changed to debug for more verbose logging
    ...pluginOptions,
    port: pluginOptions.port ?? 0
  };

  if (!mergedOptions.docs) {
    mergedOptions.docs = { enabled: false };
  }
  if (!('logging' in mergedOptions)) {
    mergedOptions.logging = { enabled: false };
  }

  const plugin = new ApiPlugin(mergedOptions);
  const name = instanceName || 'api-test';
  await db.usePlugin(plugin, name);
  const port = getApiPort(plugin);
  await waitForServer(port);
  return { plugin, port };
}
