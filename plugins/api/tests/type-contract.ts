import { ApiPlugin } from '../src/index.js';
import type { ApiPluginOptions } from '../src/index.js';

const options: ApiPluginOptions = {
  port: 3000,
  docs: { enabled: true },
};

const plugin = new ApiPlugin(options);
void plugin.raffel;
