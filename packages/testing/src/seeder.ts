import { ValidationError } from '@baldim/core';
import { createLogger, type Logger, type LogLevel } from '@baldim/core/plugin';
import { Factory, type FactoryDatabase, type FactoryResource } from './factory.js';

export interface SeederResource extends FactoryResource {
  listIds(): Promise<string[]>;
  deleteMany(ids: string[]): Promise<unknown>;
}

export interface SeederDatabase extends FactoryDatabase {
  resources: Record<string, SeederResource>;
}

export interface SeederOptions { logLevel?: string; logger?: Logger }
export type SeederCallback<T = unknown> = (database: SeederDatabase) => Promise<T>;

export class Seeder {
  readonly logLevel: string;
  readonly logger: Logger;

  constructor(readonly database: SeederDatabase, readonly options: SeederOptions = {}) {
    this.logLevel = options.logLevel ?? 'info';
    this.logger = options.logger ?? createLogger({ name: 'Seeder', level: this.logLevel as LogLevel });
  }

  async seed(specs: Record<string, number>): Promise<Record<string, Record<string, unknown>[]>> {
    const created: Record<string, Record<string, unknown>[]> = {};
    for (const [resourceName, count] of Object.entries(specs)) {
      const factory = Factory.get(resourceName);
      if (!factory) {
        throw new ValidationError(`Factory for '${resourceName}' not found`, {
          field: 'resourceName', value: resourceName, retriable: false,
        });
      }
      created[resourceName] = await factory.createMany(count, {}, { database: this.database });
    }
    return created;
  }

  call<T>(callback: SeederCallback<T>): Promise<T> { return callback(this.database); }

  async truncate(resourceNames: string[]): Promise<void> {
    for (const resourceName of resourceNames) {
      const resource = this.database.resources[resourceName];
      if (!resource) continue;
      const ids = await resource.listIds();
      if (ids.length > 0) await resource.deleteMany(ids);
    }
  }

  truncateAll(): Promise<void> { return this.truncate(Object.keys(this.database.resources)); }

  async run(seeders: SeederCallback[]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const seeder of seeders) results.push(await seeder(this.database));
    return results;
  }

  seedAndReturn(specs: Record<string, number>): Promise<Record<string, Record<string, unknown>[]>> {
    return this.seed(specs);
  }

  async reset(): Promise<void> {
    await this.truncateAll();
    Factory.resetSequences();
  }
}

export default Seeder;
