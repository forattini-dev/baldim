import { isDeepStrictEqual } from 'node:util';

export type FieldPredicate = {
  $eq?: unknown;
  $ne?: unknown;
  $gt?: unknown;
  $gte?: unknown;
  $lt?: unknown;
  $lte?: unknown;
  $in?: readonly unknown[];
  $nin?: readonly unknown[];
  $exists?: boolean;
};
export interface DocumentFilter {
  [field: string]: unknown;
  $and?: readonly DocumentFilter[];
  $or?: readonly DocumentFilter[];
  $not?: DocumentFilter;
}
export interface DocumentQueryOptions {
  limit?: number;
  offset?: number;
  partition?: string | null;
  partitionValues?: Record<string, unknown>;
  select?: readonly string[];
  orderBy?: Record<string, 'asc' | 'desc'>;
  maxScan?: number;
}
const operators = new Set([
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$in',
  '$nin',
  '$exists',
]);
export function pathParts(path: string): string[] {
  const parts = path.split('.');
  if (
    !path ||
    parts.some(
      (p) => !p || ['__proto__', 'constructor', 'prototype'].includes(p),
    )
  )
    throw new TypeError(`Invalid document path: ${path}`);
  return parts;
}
export function fieldValue(
  document: Record<string, unknown>,
  path: string,
): unknown {
  let value: unknown = document;
  for (const part of pathParts(path)) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part))
      return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
export function setField(
  document: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = pathParts(path);
  let target = document;
  for (const part of parts.slice(0, -1)) {
    if (
      !target[part] ||
      typeof target[part] !== 'object' ||
      Array.isArray(target[part])
    )
      target[part] = {};
    target = target[part] as Record<string, unknown>;
  }
  target[parts.at(-1)!] = value;
}
export function isPredicate(value: unknown): value is FieldPredicate {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).some((k) => k.startsWith('$'))
  );
}
export function validateFilter(filter: DocumentFilter, depth = 0): void {
  if (
    !filter ||
    typeof filter !== 'object' ||
    Array.isArray(filter) ||
    depth > 32
  )
    throw new TypeError('Invalid query filter');
  for (const [field, condition] of Object.entries(filter)) {
    if (field === '$and' || field === '$or') {
      if (!Array.isArray(condition) || condition.length === 0)
        throw new TypeError(`${field} requires a nonempty array`);
      for (const child of condition)
        validateFilter(child as DocumentFilter, depth + 1);
    } else if (field === '$not')
      validateFilter(condition as DocumentFilter, depth + 1);
    else {
      if (field.startsWith('$'))
        throw new TypeError(`Unknown query operator: ${field}`);
      pathParts(field);
      if (isPredicate(condition))
        for (const [operator, operand] of Object.entries(condition)) {
          if (!operators.has(operator))
            throw new TypeError(`Unknown field operator: ${operator}`);
          if (
            (operator === '$in' || operator === '$nin') &&
            !Array.isArray(operand)
          )
            throw new TypeError(`${operator} requires an array`);
          if (operator === '$exists' && typeof operand !== 'boolean')
            throw new TypeError('$exists requires a boolean');
          if (
            ['$gt', '$gte', '$lt', '$lte'].includes(operator) &&
            !(
              typeof operand === 'string' ||
              (typeof operand === 'number' && Number.isFinite(operand)) ||
              (operand instanceof Date && Number.isFinite(operand.getTime()))
            )
          )
            throw new TypeError(
              `${operator} requires a finite number, string or Date`,
            );
        }
    }
  }
}
function compare(a: unknown, b: unknown): number | null {
  if (a instanceof Date && b instanceof Date)
    return Math.sign(a.getTime() - b.getTime());
  if (typeof a !== typeof b || !['number', 'string'].includes(typeof a))
    return null;
  if (typeof a === 'number' && (!Number.isFinite(a) || !Number.isFinite(b)))
    return null;
  return a === b ? 0 : (a as string | number) < (b as string | number) ? -1 : 1;
}
export function matchesFilter(
  document: Record<string, unknown>,
  filter: DocumentFilter,
): boolean {
  return Object.entries(filter).every(([field, condition]) => {
    if (field === '$and')
      return (condition as DocumentFilter[]).every((f) =>
        matchesFilter(document, f),
      );
    if (field === '$or')
      return (condition as DocumentFilter[]).some((f) =>
        matchesFilter(document, f),
      );
    if (field === '$not')
      return !matchesFilter(document, condition as DocumentFilter);
    const value = fieldValue(document, field);
    if (!isPredicate(condition)) return isDeepStrictEqual(value, condition);
    return Object.entries(condition).every(([op, operand]) => {
      if (op === '$eq') return isDeepStrictEqual(value, operand);
      if (op === '$ne') return !isDeepStrictEqual(value, operand);
      if (op === '$exists') return (value !== undefined) === operand;
      if (op === '$in')
        return (operand as unknown[]).some((v) => isDeepStrictEqual(value, v));
      if (op === '$nin')
        return !(operand as unknown[]).some((v) => isDeepStrictEqual(value, v));
      const n = compare(value, operand);
      return (
        n !== null &&
        (op === '$gt'
          ? n > 0
          : op === '$gte'
            ? n >= 0
            : op === '$lt'
              ? n < 0
              : n <= 0)
      );
    });
  });
}
/** Equalities that hold for every matching document, suitable for index planning. */
export function equalityFilter(
  filter: DocumentFilter,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const conflicts = new Set<string>();
  const add = (field: string, value: unknown) => {
    if (
      Object.hasOwn(result, field) &&
      !isDeepStrictEqual(result[field], value)
    )
      conflicts.add(field);
    else result[field] = value;
  };
  for (const [field, condition] of Object.entries(filter)) {
    if (field === '$and')
      for (const child of condition as DocumentFilter[])
        for (const [k, v] of Object.entries(equalityFilter(child))) add(k, v);
    else if (!field.startsWith('$')) {
      if (isPredicate(condition)) {
        if (Object.hasOwn(condition, '$eq')) add(field, condition.$eq);
      } else if (condition === null || typeof condition !== 'object')
        add(field, condition);
    }
  }
  for (const field of conflicts) delete result[field];
  return result;
}
export function finishQuery<T extends Record<string, unknown>>(
  documents: T[],
  options: DocumentQueryOptions,
): T[] {
  if (options.orderBy) {
    const entries = Object.entries(options.orderBy);
    documents.sort((a, b) => {
      for (const [field, direction] of entries) {
        const av = fieldValue(a, field),
          bv = fieldValue(b, field);
        const cmp =
          compare(av, bv) ??
          (av === bv
            ? 0
            : av == null
              ? -1
              : bv == null
                ? 1
                : String(av).localeCompare(String(bv)));
        if (cmp) return direction === 'desc' ? -cmp : cmp;
      }
      return String(a.id).localeCompare(String(b.id));
    });
  }
  const selected = documents.slice(
    options.offset ?? 0,
    (options.offset ?? 0) + (options.limit ?? 100),
  );
  if (!options.select) return selected;
  return selected.map((doc) => {
    const projected: Record<string, unknown> = { id: doc.id };
    for (const path of options.select!) {
      const value = fieldValue(doc, path);
      if (value !== undefined) setField(projected, path, value);
    }
    return projected as T;
  });
}
export function validateQueryOptions(options: DocumentQueryOptions): void {
  for (const [key, value] of Object.entries({
    limit: options.limit ?? 100,
    offset: options.offset ?? 0,
    maxScan: options.maxScan ?? 10000,
  })) {
    if (!Number.isSafeInteger(value) || value < (key === 'maxScan' ? 1 : 0))
      throw new TypeError(`Invalid query ${key}`);
  }
  if (options.select) {
    if (!Array.isArray(options.select))
      throw new TypeError('select must be an array');
    for (const field of options.select) pathParts(field);
  }
  if (options.orderBy)
    for (const [field, direction] of Object.entries(options.orderBy)) {
      pathParts(field);
      if (!['asc', 'desc'].includes(direction))
        throw new TypeError('orderBy direction must be asc or desc');
    }
}
