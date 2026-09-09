import { ValidationError } from '@baldim/core';

export interface FactoryResource {
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface FactoryDatabase {
  resources: Record<string, FactoryResource>;
}

export interface FactoryContext {
  seq: number;
  factory: Factory;
}

export type FieldGenerator = (context: FactoryContext) => unknown | Promise<unknown>;
export type FactoryDefinitionObject = Record<string, unknown | FieldGenerator>;
export type FactoryDefinition = FactoryDefinitionObject | ((context: FactoryContext) => FactoryDefinitionObject | Promise<FactoryDefinitionObject>);
export type TraitDefinition = FactoryDefinitionObject | ((context: FactoryContext) => FactoryDefinitionObject | Promise<FactoryDefinitionObject>);
export type BeforeCreateCallback = (attributes: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown> | void> | void;
export type AfterCreateCallback = (created: Record<string, unknown>, context: { database: FactoryDatabase }) => Record<string, unknown> | Promise<Record<string, unknown> | void> | void;

export interface FactoryOptions { [key: string]: unknown }
export interface BuildOptions { traits?: string[] }
export interface CreateOptions extends BuildOptions { database?: FactoryDatabase }

function validateCount(count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new ValidationError('Factory count must be a non-negative integer', {
      field: 'count', value: count, retriable: false,
    });
  }
}

export class Factory {
  private static readonly sequences = new Map<string, number>();
  private static readonly factories = new Map<string, Factory>();
  private static database: FactoryDatabase | null = null;

  readonly traits = new Map<string, TraitDefinition>();
  readonly afterCreateCallbacks: AfterCreateCallback[] = [];
  readonly beforeCreateCallbacks: BeforeCreateCallback[] = [];

  static define(resourceName: string, definition: FactoryDefinition, options: FactoryOptions = {}): Factory {
    const factory = new Factory(resourceName, definition, options);
    this.factories.set(resourceName, factory);
    return factory;
  }

  static setDatabase(database: FactoryDatabase): void { this.database = database; }
  static get(resourceName: string): Factory | undefined { return this.factories.get(resourceName); }
  static resetSequences(): void { this.sequences.clear(); }
  static reset(): void {
    this.sequences.clear();
    this.factories.clear();
    this.database = null;
  }

  constructor(
    readonly resourceName: string,
    readonly definition: FactoryDefinition,
    readonly options: FactoryOptions = {}
  ) {}

  sequence(name: string = this.resourceName): number {
    const next = (Factory.sequences.get(name) ?? 0) + 1;
    Factory.sequences.set(name, next);
    return next;
  }

  trait(name: string, attributes: TraitDefinition): this {
    this.traits.set(name, attributes);
    return this;
  }

  afterCreate(callback: AfterCreateCallback): this {
    this.afterCreateCallbacks.push(callback);
    return this;
  }

  beforeCreate(callback: BeforeCreateCallback): this {
    this.beforeCreateCallbacks.push(callback);
    return this;
  }

  async build(overrides: Record<string, unknown> = {}, options: BuildOptions = {}): Promise<Record<string, unknown>> {
    const seq = this.sequence();
    let attributes = typeof this.definition === 'function'
      ? await this.definition({ seq, factory: this })
      : { ...this.definition };

    for (const traitName of options.traits ?? []) {
      const trait = this.traits.get(traitName);
      if (!trait) {
        throw new ValidationError(`Trait '${traitName}' not found in factory '${this.resourceName}'`, {
          field: 'trait', value: traitName, resourceName: this.resourceName, retriable: false,
        });
      }
      const traitAttributes = typeof trait === 'function'
        ? await trait({ seq, factory: this })
        : trait;
      attributes = { ...attributes, ...traitAttributes };
    }

    attributes = { ...attributes, ...overrides };
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === 'function') attributes[key] = await (value as FieldGenerator)({ seq, factory: this });
    }
    return attributes;
  }

  async create(overrides: Record<string, unknown> = {}, options: CreateOptions = {}): Promise<Record<string, unknown>> {
    const database = options.database ?? Factory.database;
    if (!database) {
      throw new ValidationError('Database not set for factory', {
        field: 'database', retriable: false,
        suggestion: 'Call Factory.setDatabase(database) or pass { database } to create().',
      });
    }

    let attributes = await this.build(overrides, options);
    for (const callback of this.beforeCreateCallbacks) {
      attributes = await callback(attributes) ?? attributes;
    }

    const resource = database.resources[this.resourceName];
    if (!resource) {
      throw new ValidationError(`Resource '${this.resourceName}' not found in database`, {
        field: 'resourceName', value: this.resourceName, retriable: false,
      });
    }

    let created = await resource.insert(attributes);
    for (const callback of this.afterCreateCallbacks) {
      created = await callback(created, { database }) ?? created;
    }
    return created;
  }

  async createMany(count: number, overrides: Record<string, unknown> = {}, options: CreateOptions = {}): Promise<Record<string, unknown>[]> {
    validateCount(count);
    const records: Record<string, unknown>[] = [];
    for (let index = 0; index < count; index++) records.push(await this.create(overrides, options));
    return records;
  }

  async buildMany(count: number, overrides: Record<string, unknown> = {}, options: BuildOptions = {}): Promise<Record<string, unknown>[]> {
    validateCount(count);
    const records: Record<string, unknown>[] = [];
    for (let index = 0; index < count; index++) records.push(await this.build(overrides, options));
    return records;
  }

  createWithTraits(traits: string | string[], overrides: Record<string, unknown> = {}, options: CreateOptions = {}): Promise<Record<string, unknown>> {
    return this.create(overrides, { ...options, traits: Array.isArray(traits) ? traits : [traits] });
  }

  buildWithTraits(traits: string | string[], overrides: Record<string, unknown> = {}, options: BuildOptions = {}): Promise<Record<string, unknown>> {
    return this.build(overrides, { ...options, traits: Array.isArray(traits) ? traits : [traits] });
  }
}

export default Factory;
