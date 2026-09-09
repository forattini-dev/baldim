/** Flattens nested plain objects into dot-separated paths. */
export function flatten(
  value: Record<string, unknown>,
  options: { safe?: boolean } = {},
  prefix = '',
  result: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [key, entry] of Object.entries(value || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    const isPlainObject = entry !== null
      && typeof entry === 'object'
      && !Array.isArray(entry)
      && Object.getPrototypeOf(entry) === Object.prototype;

    if (isPlainObject) {
      flatten(entry as Record<string, unknown>, options, path, result);
    } else if (Array.isArray(entry) && !options.safe) {
      entry.forEach((item, index) => {
        const arrayPath = `${path}.${index}`;
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          flatten(item as Record<string, unknown>, options, arrayPath, result);
        } else {
          result[arrayPath] = item;
        }
      });
    } else {
      result[path] = entry;
    }
  }

  return result;
}
