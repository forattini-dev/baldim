import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface McpSecurityConfig {
  passphrase?: string;
  pepper?: string;
  bcrypt?: { rounds?: number };
  argon2?: {
    memoryCost?: number;
    timeCost?: number;
    parallelism?: number;
  };
}

export interface McpCacheConfig {
  enabled?: boolean;
  driver?: 'memory' | 'filesystem';
  maxSize?: number;
  ttl?: number;
  directory?: string;
  prefix?: string;
}

export interface McpCostsConfig {
  enabled?: boolean;
}

export interface McpServerConfig {
  transport?: 'stdio' | 'http';
  host?: string;
  port?: number;
}

export interface McpConfig {
  connectionString?: string;
  verbose?: boolean;
  parallelism?: number;
  versioningEnabled?: boolean;
  security?: McpSecurityConfig;
  cache?: McpCacheConfig;
  costs?: McpCostsConfig;
  server?: McpServerConfig;
}

const ENV_MAP: Record<string, { path: string; type: 'string' | 'number' | 'boolean' }> = {
  BALDIN_CONNECTION_STRING:           { path: 'connectionString', type: 'string' },
  S3_CONNECTION_STRING:             { path: 'connectionString', type: 'string' },
  BALDIN_VERBOSE:                     { path: 'verbose', type: 'boolean' },
  BALDIN_PARALLELISM:                 { path: 'parallelism', type: 'number' },
  BALDIN_VERSIONING_ENABLED:          { path: 'versioningEnabled', type: 'boolean' },

  BALDIN_SECURITY_PASSPHRASE:         { path: 'security.passphrase', type: 'string' },
  BALDIN_SECURITY_PEPPER:             { path: 'security.pepper', type: 'string' },
  BALDIN_SECURITY_BCRYPT_ROUNDS:      { path: 'security.bcrypt.rounds', type: 'number' },
  BALDIN_SECURITY_ARGON2:             { path: 'security.argon2', type: 'boolean' },
  BALDIN_SECURITY_ARGON2_MEMORY_COST: { path: 'security.argon2.memoryCost', type: 'number' },
  BALDIN_SECURITY_ARGON2_TIME_COST:   { path: 'security.argon2.timeCost', type: 'number' },
  BALDIN_SECURITY_ARGON2_PARALLELISM: { path: 'security.argon2.parallelism', type: 'number' },

  BALDIN_CACHE_ENABLED:               { path: 'cache.enabled', type: 'boolean' },
  BALDIN_CACHE_DRIVER:                { path: 'cache.driver', type: 'string' },
  BALDIN_CACHE_MAX_SIZE:              { path: 'cache.maxSize', type: 'number' },
  BALDIN_CACHE_TTL:                   { path: 'cache.ttl', type: 'number' },
  BALDIN_CACHE_DIRECTORY:             { path: 'cache.directory', type: 'string' },
  BALDIN_CACHE_PREFIX:                { path: 'cache.prefix', type: 'string' },

  BALDIN_COSTS_ENABLED:               { path: 'costs.enabled', type: 'boolean' },

  MCP_TRANSPORT:                    { path: 'server.transport', type: 'string' },
  MCP_SERVER_HOST:                  { path: 'server.host', type: 'string' },
  MCP_SERVER_PORT:                  { path: 'server.port', type: 'number' },
};

function parseValue(raw: string, type: 'string' | 'number' | 'boolean'): string | number | boolean {
  if (type === 'boolean') return raw === 'true' || raw === '1';
  if (type === 'number') return parseInt(raw, 10);
  return raw;
}

function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function loadConfigFile(): McpConfig {
  const configPath = process.env.BALDIN_CONFIG
    || resolve(process.cwd(), 'baldin.config.json');

  if (!existsSync(configPath)) return {};

  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as McpConfig;
  } catch {
    return {};
  }
}

function loadEnvVars(): McpConfig {
  const config: Record<string, unknown> = {};

  for (const [envKey, { path, type }] of Object.entries(ENV_MAP)) {
    const raw = process.env[envKey];
    if (raw === undefined || raw === '') continue;

    if (path === 'security.argon2' && type === 'boolean') {
      if (parseValue(raw, 'boolean')) {
        setNested(config, 'security.argon2', {});
      }
      continue;
    }

    setNested(config, path, parseValue(raw, type));
  }

  return config as McpConfig;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (srcVal !== null && typeof srcVal === 'object' && !Array.isArray(srcVal)
      && tgtVal !== null && typeof tgtVal === 'object' && !Array.isArray(tgtVal)) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

const DEFAULTS: McpConfig = {
  verbose: false,
  parallelism: 10,
  versioningEnabled: false,
  security: { passphrase: 'secret', bcrypt: { rounds: 12 } },
  cache: { enabled: true, driver: 'memory', maxSize: 1000, ttl: 300000, directory: './cache', prefix: 'baldin' },
  costs: { enabled: true },
  server: { transport: 'stdio', host: '0.0.0.0', port: 17500 },
};

export function resolveConfig(toolArgs?: Partial<McpConfig>): McpConfig {
  const file = loadConfigFile();
  const env = loadEnvVars();

  let config = deepMerge(DEFAULTS as Record<string, unknown>, file as Record<string, unknown>);
  config = deepMerge(config, env as Record<string, unknown>);
  if (toolArgs) {
    config = deepMerge(config, toolArgs as Record<string, unknown>);
  }

  return config as McpConfig;
}
