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

interface RegisteredStorageAdapter {
  factory: StorageAdapterFactory;
}

const adapters = new Map<string, RegisteredStorageAdapter>();

function normalizeProtocol(protocol: string): string {
  return protocol.trim().toLowerCase().replace(/:$/, '');
}

export function registerStorageAdapter(
  protocols: string | readonly string[],
  factory: StorageAdapterFactory
): () => void {
  const normalized = (Array.isArray(protocols) ? protocols : [protocols]).map(normalizeProtocol);
  const registration: RegisteredStorageAdapter = { factory };

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

export async function createStorageClient(
  protocol: string,
  context: StorageAdapterContext
): Promise<Client> {
  const normalized = normalizeProtocol(protocol);
  const registration = adapters.get(normalized);

  if (!registration) {
    throw new Error(
      `No storage adapter is registered for ${normalized}:. Import the adapter package before creating this Baldim connection, or pass a client explicitly.`
    );
  }

  return registration.factory(context);
}

export type { Client } from './clients/types.js';
