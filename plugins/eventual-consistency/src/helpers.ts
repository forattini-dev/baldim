/**
 * Helper methods for EventualConsistencyPlugin
 * @module eventual-consistency/helpers
 */

import { createTransaction } from './transactions.js';
import { type FieldHandler } from './utils.js';
import type { NormalizedConfig } from './config.js';

export interface HelperOptions {
  source?: string;
}

export interface TargetResource {
  _eventualConsistencyPlugins?: Record<string, FieldHandler>;
  add?(recordId: string, field: string, value: number, options?: HelperOptions): Promise<any>;
  add?(recordId: string, value: number, options?: HelperOptions): Promise<any>;
  add?(field: string, value: number, options?: HelperOptions): Promise<any>;
  add?(value: number, options?: HelperOptions): Promise<any>;
  sub?(recordId: string, field: string, value: number, options?: HelperOptions): Promise<any>;
  sub?(recordId: string, value: number, options?: HelperOptions): Promise<any>;
  sub?(field: string, value: number, options?: HelperOptions): Promise<any>;
  sub?(value: number, options?: HelperOptions): Promise<any>;
  set?(recordId: string, field: string, value: number, options?: HelperOptions): Promise<any>;
  set?(recordId: string, value: number, options?: HelperOptions): Promise<any>;
  set?(field: string, value: number, options?: HelperOptions): Promise<any>;
  set?(value: number, options?: HelperOptions): Promise<any>;
  increment?(recordId: string, field: string, options?: HelperOptions): Promise<any>;
  increment?(recordId: string, options?: HelperOptions): Promise<any>;
  increment?(field: string, options?: HelperOptions): Promise<any>;
  increment?(options?: HelperOptions): Promise<any>;
  decrement?(recordId: string, field: string, options?: HelperOptions): Promise<any>;
  decrement?(recordId: string, options?: HelperOptions): Promise<any>;
  decrement?(field: string, options?: HelperOptions): Promise<any>;
  decrement?(options?: HelperOptions): Promise<any>;
  consolidate?(recordId: string, field?: string): Promise<any>;
  consolidate?(field?: string): Promise<any>;
  getConsolidatedValue?(recordId: string, field: string): Promise<number>;
  recalculate?(recordId: string, field: string): Promise<number>;
  [key: string]: any;
}

export interface EventualConsistencyPlugin {
  runConsolidation(handler: FieldHandler, resourceName: string, fieldName: string): Promise<any>;
  runRecordConsolidation(handler: FieldHandler, originalId: string): Promise<any>;
  getConsolidatedValue(resourceName: string, fieldName: string, recordId: string): Promise<number>;
  recalculateRecord(resourceName: string, fieldName: string, recordId: string): Promise<number>;
}

const HELPER_METHODS = [
  'add',
  'sub',
  'set',
  'increment',
  'decrement',
  'consolidate',
  'getConsolidatedValue',
  'recalculate'
] as const;

interface FieldBinding {
  handler: FieldHandler;
  plugin: EventualConsistencyPlugin;
}

interface HelperInstallation {
  bindings: Map<string, FieldBinding[]>;
  originalMethods: Map<string, PropertyDescriptor | undefined>;
  originalRegistry: Record<string, FieldHandler> | undefined;
  originalRegistryDescriptor: PropertyDescriptor | undefined;
}

const helperInstallations = new WeakMap<TargetResource, HelperInstallation>();

function getFieldBinding(resource: TargetResource, field: string): FieldBinding | undefined {
  return helperInstallations.get(resource)?.bindings.get(field)?.at(-1);
}

interface ResolvedMutationCall {
  recordId: string;
  field: string;
  value: number;
  options: HelperOptions;
  handler: FieldHandler | null;
}

function getConfiguredFields(resource: TargetResource): string[] {
  return Object.keys(resource._eventualConsistencyPlugins || {});
}

function isBoundRecord(resource: TargetResource): boolean {
  return resource.id !== undefined && resource.id !== null;
}

function resolveMutationCall(
  args: any[],
  defaultField: string | null,
  resource: TargetResource
): ResolvedMutationCall {
  const configuredFields = new Set(getConfiguredFields(resource));
  const boundRecord = isBoundRecord(resource);
  let recordId: string | undefined;
  let field = defaultField || '';
  let value: number;
  let options: HelperOptions = {};

  if (boundRecord) {
    recordId = String(resource.id);

    if (args.length === 1) {
      value = args[0];
    } else if (args.length === 2) {
      if (typeof args[0] === 'string' && configuredFields.has(args[0])) {
        field = args[0];
        value = args[1];
      } else {
        value = args[0];
        options = args[1] || {};
      }
    } else {
      field = args[0];
      value = args[1];
      options = args[2] || {};
    }
  } else {
    recordId = args[0] != null ? String(args[0]) : undefined;

    if (args.length === 2) {
      value = args[1];
    } else if (args.length === 3) {
      if (typeof args[1] === 'string' && configuredFields.has(args[1])) {
        field = args[1];
        value = args[2];
      } else {
        value = args[1];
        options = args[2] || {};
      }
    } else {
      field = args[1];
      value = args[2];
      options = args[3] || {};
    }
  }

  if (!recordId) {
    throw new Error('Record ID is required for eventual consistency operations');
  }

  if (!field) {
    throw new Error('Field name is required for eventual consistency operations');
  }

  return {
    recordId,
    field,
    value,
    options,
    handler: resource._eventualConsistencyPlugins?.[field] || null
  };
}

function resolveCounterCall(
  args: any[],
  defaultField: string | null,
  resource: TargetResource
): { recordId: string; field: string; options: HelperOptions } {
  const configuredFields = new Set(getConfiguredFields(resource));
  const boundRecord = isBoundRecord(resource);
  let recordId: string | undefined;
  let field = defaultField || '';
  let options: HelperOptions = {};

  if (boundRecord) {
    recordId = String(resource.id);
    if (typeof args[0] === 'string' && configuredFields.has(args[0])) {
      field = args[0];
      options = args[1] || {};
    } else {
      options = args[0] || {};
    }
  } else {
    recordId = args[0] != null ? String(args[0]) : undefined;
    if (typeof args[1] === 'string' && configuredFields.has(args[1])) {
      field = args[1];
      options = args[2] || {};
    } else {
      options = args[1] || {};
    }
  }

  if (!recordId) {
    throw new Error('Record ID is required for eventual consistency operations');
  }

  if (!field) {
    throw new Error('Field name is required for eventual consistency operations');
  }

  return { recordId, field, options };
}

function resolveConsolidationCall(
  args: any[],
  defaultField: string | null,
  resource: TargetResource
): { recordId: string; field: string } {
  const configuredFields = new Set(getConfiguredFields(resource));
  let recordId: string | undefined;
  let field = defaultField || '';

  if (isBoundRecord(resource)) {
    recordId = String(resource.id);
    if (typeof args[0] === 'string' && configuredFields.has(args[0])) {
      field = args[0];
    }
  } else {
    recordId = args[0] != null ? String(args[0]) : undefined;
    if (typeof args[1] === 'string' && configuredFields.has(args[1])) {
      field = args[1];
    }
  }

  if (!recordId) {
    throw new Error('Record ID is required for consolidation');
  }

  return { recordId, field };
}

/**
 * Add helper methods to a target resource
 *
 * @param resource - Target resource to add methods to
 * @param plugin - Plugin instance for consolidation methods
 * @param config - Plugin configuration
 */
export function addHelperMethods(
  resource: TargetResource,
  plugin: EventualConsistencyPlugin,
  _config: NormalizedConfig,
  handler: FieldHandler
): void {
  let installation = helperInstallations.get(resource);
  if (!installation) {
    installation = {
      bindings: new Map(),
      originalMethods: new Map(
        HELPER_METHODS.map(name => [name, Object.getOwnPropertyDescriptor(resource, name)])
      ),
      originalRegistry: resource._eventualConsistencyPlugins
        ? { ...resource._eventualConsistencyPlugins }
        : undefined,
      originalRegistryDescriptor: Object.getOwnPropertyDescriptor(
        resource,
        '_eventualConsistencyPlugins'
      )
    };
    helperInstallations.set(resource, installation);
  }

  const bindings = installation.bindings.get(handler.field) || [];
  if (!bindings.some(binding => binding.handler === handler && binding.plugin === plugin)) {
    bindings.push({ handler, plugin });
    installation.bindings.set(handler.field, bindings);
  }

  resource._eventualConsistencyPlugins ||= {};
  resource._eventualConsistencyPlugins[handler.field] = handler;

  resource.add = async function(...args: any[]): Promise<any> {
    const { recordId, field, value, options, handler } = resolveMutationCall(
      args,
      getDefaultField(this),
      this
    );

    if (!handler) {
      throw new Error(`No eventual consistency handler for field: ${field}`);
    }

    return createTransaction(handler, {
      originalId: recordId,
      field,
      fieldPath: handler.fieldPath,
      value: Math.abs(value),
      operation: 'add',
      options
    });
  };

  resource.sub = async function(...args: any[]): Promise<any> {
    const { recordId, field, value, options, handler } = resolveMutationCall(
      args,
      getDefaultField(this),
      this
    );

    if (!handler) {
      throw new Error(`No eventual consistency handler for field: ${field}`);
    }

    return createTransaction(handler, {
      originalId: recordId,
      field,
      fieldPath: handler.fieldPath,
      value: Math.abs(value),
      operation: 'sub',
      options
    });
  };

  resource.set = async function(...args: any[]): Promise<any> {
    const { recordId, field, value, options, handler } = resolveMutationCall(
      args,
      getDefaultField(this),
      this
    );

    if (!handler) {
      throw new Error(`No eventual consistency handler for field: ${field}`);
    }

    return createTransaction(handler, {
      originalId: recordId,
      field,
      fieldPath: handler.fieldPath,
      value,
      operation: 'set',
      options
    });
  };

  resource.increment = async function(...args: any[]): Promise<any> {
    const { recordId, field, options } = resolveCounterCall(args, getDefaultField(this), this);

    return this.add?.(recordId, field, 1, options);
  };

  resource.decrement = async function(...args: any[]): Promise<any> {
    const { recordId, field, options } = resolveCounterCall(args, getDefaultField(this), this);

    return this.sub?.(recordId, field, 1, options);
  };

  resource.consolidate = async function(...args: any[]): Promise<any> {
    const { recordId, field } = resolveConsolidationCall(args, getDefaultField(this), this);
    if (!field) {
      throw new Error('Field name is required for consolidation');
    }

    const handler = this._eventualConsistencyPlugins?.[field];
    if (!handler) {
      throw new Error(`No eventual consistency handler for field: ${field}`);
    }

    const binding = getFieldBinding(this, field);
    if (!binding) {
      throw new Error(`No eventual consistency plugin found for field "${field}"`);
    }

    return binding.plugin.runRecordConsolidation(handler, recordId);
  };

  resource.getConsolidatedValue = async function(
    recordId: string,
    field: string
  ): Promise<number> {
    const handler = this._eventualConsistencyPlugins?.[field];
    if (!handler) {
      throw new Error(`No eventual consistency handler for field: ${field}`);
    }

    const binding = getFieldBinding(this, field);
    if (!binding) {
      throw new Error(`No eventual consistency plugin found for field "${field}"`);
    }

    return binding.plugin.getConsolidatedValue(handler.resource, field, recordId);
  };

  resource.recalculate = async function(
    recordId: string,
    field: string
  ): Promise<number> {
    if (!field) {
      throw new Error('Field parameter is required');
    }

    const handler = this._eventualConsistencyPlugins?.[field];
    if (!handler) {
      throw new Error(`No eventual consistency plugin found for field "${field}"`);
    }

    const binding = getFieldBinding(this, field);
    if (!binding) {
      throw new Error(`No eventual consistency plugin found for field "${field}"`);
    }

    return binding.plugin.recalculateRecord(handler.resource, field, recordId);
  };
}

/** Remove one handler binding and restore the resource when the last binding leaves. */
export function removeHelperMethods(
  resource: TargetResource,
  handler: FieldHandler
): void {
  const installation = helperInstallations.get(resource);
  if (!installation) {
    return;
  }

  const bindings = installation.bindings.get(handler.field) || [];
  const remaining = bindings.filter(binding => binding.handler !== handler);
  if (remaining.length > 0) {
    installation.bindings.set(handler.field, remaining);
    resource._eventualConsistencyPlugins![handler.field] = remaining.at(-1)!.handler;
  } else {
    installation.bindings.delete(handler.field);
    delete resource._eventualConsistencyPlugins?.[handler.field];
  }

  if (installation.bindings.size > 0) {
    return;
  }

  for (const [name, descriptor] of installation.originalMethods) {
    if (descriptor) {
      Object.defineProperty(resource, name, descriptor);
    } else {
      delete resource[name];
    }
  }

  if (installation.originalRegistryDescriptor) {
    const descriptor = installation.originalRegistryDescriptor;
    Object.defineProperty(
      resource,
      '_eventualConsistencyPlugins',
      'value' in descriptor
        ? { ...descriptor, value: installation.originalRegistry }
        : descriptor
    );
  } else {
    delete resource._eventualConsistencyPlugins;
  }
  helperInstallations.delete(resource);
}

/**
 * Get the default field for a resource (first configured field)
 *
 * @param resource - Target resource
 * @returns Default field name or null
 */
function getDefaultField(resource: TargetResource): string | null {
  if (!resource._eventualConsistencyPlugins) {
    return null;
  }

  const fields = Object.keys(resource._eventualConsistencyPlugins);
  return fields.length > 0 ? (fields[0] ?? null) : null;
}
