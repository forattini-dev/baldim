import { SpiderPlugin, type SpiderPluginConfig } from '@baldin/plugin-spider';
import { CrawlContext, URLPatternMatcher } from '@baldin/plugin-spider/spider';
import { createCrawlQueue } from '@baldin/plugin-spider/adapters';

const options: SpiderPluginConfig = {
  discovery: { enabled: true },
  crawlQueue: { driver: 'memory' },
  crawlStorage: { driver: 'memory' },
};

void new SpiderPlugin(options);
void CrawlContext;
void URLPatternMatcher;
void createCrawlQueue;
