import {
  CookieFarmSuitePlugin,
  type CookieFarmSuitePluginOptions,
  type PersonaJob,
} from '../src/index.js';

void CookieFarmSuitePlugin;
void ({} as CookieFarmSuitePluginOptions);
void ({} as PersonaJob);

new CookieFarmSuitePlugin({
  namespace: 'persona',
  queue: { autoStart: false, concurrency: 2 },
  cookieFarm: { generation: { count: 0 } },
  ttl: { queue: { ttl: 900 } },
});
