import {
  CookieFarmPlugin,
  CookieFarmError,
  PersonaNotFoundError,
  type CookieFarmPluginOptions,
  type CookieFarmStats,
  type Persona,
} from '../src/index.js';

void CookieFarmPlugin;
void CookieFarmError;
void PersonaNotFoundError;
void ({} as CookieFarmPluginOptions);
void ({} as CookieFarmStats);
void ({} as Persona);

new CookieFarmPlugin({
  generation: { count: 4, userAgentStrategy: 'desktop-only' },
  warmup: { enabled: false },
  storage: { resource: 'browser_personas' },
});
