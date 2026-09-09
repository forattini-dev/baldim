import {
  PuppeteerPlugin,
  ProxyManager,
  CookieManager,
  PuppeteerError,
  type PuppeteerPluginOptions,
  type ProxyConfig,
} from '../src/index.js';

void PuppeteerPlugin;
void ProxyManager;
void CookieManager;
void PuppeteerError;
void ({} as PuppeteerPluginOptions);
void ({} as ProxyConfig);

new PuppeteerPlugin({
  launch: { headless: true },
  cookies: { enabled: false },
  proxy: { enabled: false },
});
