import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PuppeteerPlugin } from '../src/index.js';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

describe('@baldin/plugin-puppeteer package contract', () => {
  it('owns every browser runtime dependency it imports', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

    expect(manifest.dependencies).toMatchObject({
      'ghost-cursor': expect.any(String),
      'puppeteer-extra': expect.any(String),
      'puppeteer-extra-plugin-stealth': expect.any(String),
      'user-agents': expect.any(String),
    });
    expect(manifest.optionalDependencies).toMatchObject({
      puppeteer: expect.any(String),
    });
    expect(manifest.dependencies).not.toHaveProperty('@baldin/core');
    expect(manifest.peerDependencies).toEqual({ '@baldin/core': '^0.1.0' });
  });

  it('loads its declared automation integrations without starting a browser', async () => {
    const plugin = new PuppeteerPlugin({
      cookies: { enabled: false },
      pool: { enabled: false },
      userAgent: { enabled: true, random: true },
    });

    await (plugin as unknown as { _importDependencies(): Promise<void> })._importDependencies();

    expect(typeof plugin.puppeteer.launch).toBe('function');
    expect(plugin.UserAgent).toBeTypeOf('function');
    expect(plugin.createGhostCursor).toBeTypeOf('function');
  });

  it('contains no legacy project branding in runtime source', async () => {
    const files = [
      'src/index.ts',
      'src/errors.ts',
      'src/puppeteer/anti-bot-detector.ts',
      'src/puppeteer/console-monitor.ts',
      'src/puppeteer/cookie-manager.ts',
      'src/puppeteer/network-monitor.ts',
      'src/puppeteer/performance-manager.ts',
      'src/puppeteer/proxy-manager.ts',
      'src/puppeteer/stealth-manager.ts',
      'src/puppeteer/storage-manager.ts',
      'src/puppeteer/webrtc-streams-detector.ts',
    ];
    const contents = await Promise.all(files.map((path) => readFile(`${packageRoot}/${path}`, 'utf8')));

    expect(contents.join('\n')).not.toMatch(/s3db|bucketdb|buckiedb/i);
  });
});
