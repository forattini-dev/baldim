export default function tryFn<T>(fn: () => Promise<T>): Promise<[true, null, T] | [false, Error, null]>;
export default function tryFn<T>(fn: () => T): [true, null, T] | [false, Error, null];
export default function tryFn<T>(fn: () => T | Promise<T>): [true, null, T] | [false, Error, null] | Promise<[true, null, T] | [false, Error, null]> {
  try {
    const value = fn();
    if (value instanceof Promise) {
      return value.then(
        result => [true, null, result] as [true, null, T],
        cause => [false, asError(cause), null] as [false, Error, null]
      );
    }
    return [true, null, value];
  } catch (cause) {
    return [false, asError(cause), null];
  }
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
