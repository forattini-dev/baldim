import type Resource from '../resource.class.js';
import type { AttributesSchema } from '../core/resource-validator.class.js';
import type { DocumentQueryOptions } from '../core/document-query.js';
type Head<S extends string> = S extends `${infer H}|${string}` ? H : S;
type EnumValues<S extends string> = S extends `${infer H},${infer R}`
  ? H | EnumValues<R>
  : S;
type Enum<S extends string> = S extends `${string}|enum:${infer V}`
  ? EnumValues<V extends `${infer E}|${string}` ? E : V>
  : never;
type Scalar<T extends string> = T extends
  'number' | 'integer' | 'float' | 'double'
  ? number
  : T extends 'boolean' | 'bool'
    ? boolean
    : T extends 'date' | 'datetime'
      ? Date | string
      : T extends 'array'
        ? unknown[]
        : T extends 'object'
          ? Record<string, unknown>
          : T extends `embedding:${string}`
            ? number[]
            : T extends 'any' | 'json'
              ? unknown
              : string;
export type InferAttribute<A> = A extends string
  ? Head<A> extends 'string'
    ? [Enum<A>] extends [never]
      ? string
      : Enum<A>
    : Scalar<Head<A>>
  : A extends { type: 'array'; items: infer I }
    ? InferAttribute<I>[]
    : A extends { type: 'object'; properties: infer P extends AttributesSchema }
      ? InferSchema<P>
      : A extends { type: 'object'; props: infer P extends AttributesSchema }
        ? InferSchema<P>
        : A extends { type: infer T extends string }
          ? Scalar<T>
          : A extends AttributesSchema
            ? InferSchema<A>
            : unknown;
type Fields<S> = Exclude<keyof S & string, `$$${string}`>;
type Optional<A> = A extends `${string}|optional${string}`
  ? true
  : A extends { optional: true }
    ? true
    : false;
type Defaulted<A> = A extends `${string}|default:${string}`
  ? true
  : A extends { default: unknown }
    ? true
    : false;
export type InferSchema<S extends AttributesSchema> = {
  [K in Fields<S> as Optional<S[K]> extends true ? never : K]: InferAttribute<
    S[K]
  >;
} & {
  [K in Fields<S> as Optional<S[K]> extends true ? K : never]?: InferAttribute<
    S[K]
  >;
};
export type InsertDocument<S extends AttributesSchema> = {
  [
    K in Fields<S> as Optional<S[K]> extends true
      ? never
      : Defaulted<S[K]> extends true
        ? never
        : K
  ]: InferAttribute<S[K]>;
} & {
  [
    K in Fields<S> as Optional<S[K]> extends true
      ? K
      : Defaulted<S[K]> extends true
        ? K
        : never
  ]?: InferAttribute<S[K]>;
} & { id?: string };
export type SchemaDocument<S extends AttributesSchema> = InferSchema<S> & {
  id: string;
  _etag?: string;
  _v?: string;
};
type Depth = [never, 0, 1, 2, 3, 4];
type Paths<T, D extends number = 4> = D extends 0
  ? never
  : {
      [K in keyof T & string]:
        | K
        | (NonNullable<T[K]> extends readonly unknown[] | Date
            ? never
            : NonNullable<T[K]> extends object
              ? `${K}.${Paths<NonNullable<T[K]>, Depth[D]>}`
              : never);
    }[keyof T & string];
type PathValue<T, P extends string> = P extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? PathValue<NonNullable<T[H]>, R>
    : never
  : P extends keyof T
    ? T[P]
    : never;
type Predicate<V> =
  | V
  | {
      $eq?: V;
      $ne?: V;
      $in?: readonly V[];
      $nin?: readonly V[];
      $exists?: boolean;
    }
  | (NonNullable<V> extends string | number | Date
      ? { $gt?: V; $gte?: V; $lt?: V; $lte?: V }
      : never);
export type TypedFilter<T> = {
  [P in Paths<T>]?: Predicate<PathValue<T, P>>;
} & {
  $and?: readonly TypedFilter<T>[];
  $or?: readonly TypedFilter<T>[];
  $not?: TypedFilter<T>;
};
type Options<T> = Omit<DocumentQueryOptions, 'select' | 'orderBy'> & {
  select?: readonly Paths<T>[];
  orderBy?: Partial<Record<Paths<T>, 'asc' | 'desc'>>;
};
export type TypedResource<S extends AttributesSchema> = Resource<S>;
export type TypedQueryOptions<S extends AttributesSchema> =
  string extends keyof S ? DocumentQueryOptions : Options<SchemaDocument<S>>;
export type ResourceDocument<S extends AttributesSchema> =
  string extends keyof S
    ? import('../resource.class.js').ResourceData
    : SchemaDocument<S>;
export type ResourceInsert<S extends AttributesSchema> = string extends keyof S
  ? Record<string, unknown> & { id?: string }
  : InsertDocument<S>;
export type ResourceUpdate<S extends AttributesSchema> = string extends keyof S
  ? Record<string, unknown>
  : Partial<InferSchema<S>>;
export type ResourceFilter<S extends AttributesSchema> = string extends keyof S
  ? Record<string, unknown>
  : TypedFilter<SchemaDocument<S>>;
export type ResourcePatch<S extends AttributesSchema> = string extends keyof S
  ? Record<string, unknown>
  : { [P in Paths<InferSchema<S>>]?: PathValue<InferSchema<S>, P> };
