import { readFileSync } from 'node:fs';

let cachedVersion: string | undefined;

export function getVersion(): string {
  if (cachedVersion) return cachedVersion;
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  cachedVersion = String(manifest.version || '0.0.0-dev');
  return cachedVersion;
}
