import { ConnectionStringError } from './errors.js';

export interface ClientOptions {
  [key: string]: unknown;
}

type CoercedValue = boolean | number | string;

export class ConnectionString {
  readonly url: URL;
  readonly protocol: string;
  readonly clientOptions: ClientOptions;

  constructor(connectionString: string) {
    try {
      this.url = new URL(connectionString);
    } catch (error) {
      throw new ConnectionStringError(`Invalid connection string: ${connectionString}`, {
        original: error,
        input: connectionString,
      });
    }
    this.protocol = this.url.protocol.replace(/:$/, '').toLowerCase();
    this.clientOptions = this.parseQueryParams(this.url.searchParams);
  }

  private parseQueryParams(searchParams: URLSearchParams): ClientOptions {
    const result: ClientOptions = {};
    for (const [key, value] of searchParams.entries()) {
      const keys = key.split('.');
      let current: Record<string, unknown> = result;
      for (let index = 0; index < keys.length - 1; index += 1) {
        const part = keys[index]!;
        if (!current[part] || typeof current[part] !== 'object') current[part] = {};
        current = current[part] as Record<string, unknown>;
      }
      current[keys[keys.length - 1]!] = this.coerce(value);
    }
    return result;
  }

  private coerce(value: string): CoercedValue {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
    return value;
  }
}

export default ConnectionString;
