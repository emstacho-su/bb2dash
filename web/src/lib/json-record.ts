/**
 * bb2dash — the one jsonb guard (2026-10-05).
 *
 * A jsonb column comes back as `unknown`; before any field is read off it, it
 * has to be an object and not an array. Three modules used to carry their own
 * copy of this check; this is the one they import.
 */

/** A JSON object (not null, not an array) as a record; null for anything else. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
