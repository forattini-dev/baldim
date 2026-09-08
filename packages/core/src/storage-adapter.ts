import type { Client } from './clients/types.js';

export interface StorageAdapterContext {
  connectionString: string;
  clientOptions: Record<string, unknown>;
  logLevel: string;
  logger: unknown;
  executorPool: unknown;
}

export type StorageAdapterFactory = (
  context: StorageAdapterContext
) => Client | Promise<Client>;

export type LegacyConnectionStringResolver = (
  options: Readonly<Record<string, unknown>>
) => string | undefined;

export interface StorageAdapterRegistrationOptions {
  legacyConnectionString?: LegacyConnectionStringResolver;
}

interface RegisteredStorageAdapter {
  factory: StorageAdapterFactory;
  legacyConnectionString?: LegacyConnectionStringResolver;
}

const adapters = new Map<string, RegisteredStorageAdapter>();

function normalizeProtocol(protocol: string): string {
  return protocol.trim().toLowerCase().replace(/:$/, '');
}

export function registerStorageAdapter(
  protocols: string | readonly string[],
  factory: StorageAdapterFactory,
  options: StorageAdapterRegistrationOptions = {}
): () => void {
  const normalized = (Array.isArray(protocols) ? protocols : [protocols]).map(normalizeProtocol);
  const registration: RegisteredStorageAdapter = { factory, ...options };

  for (const protocol of normalized) {
    if (!protocol) {
      throw new TypeError('Storage adapter protocols cannot be empty.');
    }
    adapters.set(protocol, registration);
  }

  return () => {
    for (const protocol of normalized) {
      if (adapters.get(protocol) === registration) {
        adapters.delete(protocol);
      }
    }
  };
}

export function hasStorageAdapter(protocol: string): boolean {
  return adapters.has(normalizeProtocol(protocol));
}

export function resolveLegacyConnectionString(
  options: Readonly<Record<string, unknown>>
): string | undefined {
  const registrations = new Set(adapters.values());
  for (const registration of registrations) {
    const connectionString = registration.legacyConnectionString?.(options);
    if (connectionString) return connectionString;
  }
  return undefined;
}

export async function createStorageClient(
  protocol: string,
  context: StorageAdapterContext
): Promise<Client> {
  const normalized = normalizeProtocol(protocol);
  const registration = adapters.get(normalized);

  if (!registration) {
    throw new Error(
      `No storage adapter is registered for ${normalized}:. Import the adapter package before creating this Baldin connection, or pass a client explicitly.`
    );
  }

  return registration.factory(context);
}

export type { Client } from './clients/types.js';
