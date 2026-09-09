import { createRequire } from 'node:module';

const VERSION = '__INJECT_VERSION__';

let _version: string | null = null;

export function getVersion(): string {
  if (_version) return _version;
  if (VERSION !== '__INJECT_VERSION__') {
    _version = VERSION;
    return _version;
  }

  try {
    const manifest = createRequire(import.meta.url)('../package.json') as { version?: unknown };
    if (typeof manifest.version === 'string' && manifest.version.length > 0) {
      _version = manifest.version;
      return _version;
    }
  } catch {
    // Bundlers may replace VERSION and omit package.json entirely.
  }

  _version = '0.0.0-dev';
  return _version;
}
