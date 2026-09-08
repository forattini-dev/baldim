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

const adapters = new Map<string, StorageAdapterFactory>();

function normalizeProtocol(protocol: string): string {
  return protocol.trim().toLowerCase().replace(/:$/, '');
}

export function registerStorageAdapter(
  protocols: string | readonly string[],
  factory: StorageAdapterFactory
): () => void {
  const normalized = (Array.isArray(protocols) ? protocols : [protocols]).map(normalizeProtocol);

  for (const protocol of normalized) {
    if (!protocol) {
      throw new TypeError('Storage adapter protocols cannot be empty.');
    }
    adapters.set(protocol, factory);
  }

  return () => {
    for (const protocol of normalized) {
      if (adapters.get(protocol) === factory) {
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
  const factory = adapters.get(normalized);

  if (!factory) {
    const packageName = normalized === 's3' || normalized === 'http' || normalized === 'https'
      ? '@baldin/adapter-s3'
      : `an adapter for the ${normalized}: protocol`;

    throw new Error(
      `No storage adapter is registered for ${normalized}:. Import ${packageName} before creating this Baldin connection, or pass a client explicitly.`
    );
  }

  return factory(context);
}

export type { Client } from './clients/types.js';