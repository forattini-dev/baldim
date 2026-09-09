import { SpiderPlugin, type SpiderPluginConfig } from '@baldim/plugin-spider';
import { CrawlContext, URLPatternMatcher } from '@baldim/plugin-spider/spider';
import { createCrawlQueue } from '@baldim/plugin-spider/adapters';

const options: SpiderPluginConfig = {
  discovery: { enabled: true },
  crawlQueue: { driver: 'memory' },
  crawlStorage: { driver: 'memory' },
};

void new SpiderPlugin(options);
void CrawlContext;
void URLPatternMatcher;
void createCrawlQueue;
