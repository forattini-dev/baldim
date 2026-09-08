export function normalizeEtagHeader(headerValue: string | undefined | null): string[] {
  if (headerValue === undefined || headerValue === null) return [];
  return String(headerValue)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^W\//i, '').replace(/^['"]|['"]$/g, ''));
}
