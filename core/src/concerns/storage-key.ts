/**
 * Storage Key Utilities
 *
 * Storage object keys use POSIX-style forward slashes regardless of the operating system.
 * These utilities ensure consistent key construction across all platforms.
 */

import { ValidationError } from '../errors.js';

/**
 * Join path segments for storage keys using forward slashes.
 * Unlike path.join(), this always uses '/' as separator.
 * Also normalizes any backslashes within segments to forward slashes.
 */
export function joinStorageKey(...segments: string[]): string {
  return segments
    .filter(s => s && s.length > 0)
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
}

/**
 * Normalize a storage key by replacing backslashes with forward slashes.
 * Useful when migrating keys that may have been incorrectly constructed.
 */
export function normalizeStorageKey(key: string): string {
  return key.replace(/\\/g, '/').replace(/\/+/g, '/');
}

const UNSAFE_KEY_CHARS = /[\\\/=%]/;

/**
 * Validates that a value is safe for use in storage keys.
 * IDs and partition values must be URL-friendly (no /, \, =, or %).
 * Returns true if valid, false if contains unsafe characters.
 */
export function isValidStorageKeySegment(value: string): boolean {
  return !UNSAFE_KEY_CHARS.test(value);
}

/**
 * Validates a value for storage key usage, throwing ValidationError if invalid.
 * Use this for IDs and partition values.
 * Accepts any value type - coerces to string for validation.
 */
export function validateStorageKeySegment(value: unknown, context: string): void {
  const strValue = String(value);
  if (UNSAFE_KEY_CHARS.test(strValue)) {
    const invalidChars = strValue.match(UNSAFE_KEY_CHARS);
    throw new ValidationError(
      `Invalid ${context}: contains unsafe character '${invalidChars?.[0]}'`,
      {
        field: context,
        value: strValue,
        constraint: 'url-safe',
        statusCode: 400,
        suggestion: 'IDs and partition values must be URL-friendly (no /, \\, =, or %). Use alphanumeric characters, hyphens, or underscores.'
      }
    );
  }
}
