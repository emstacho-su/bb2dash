/**
 * R2-10 — the string shapes this package validates, in one place.
 *
 * `HH_MM` was declared twice and `ISO_DATE` three times, in four files that all have to
 * agree: the config schema rejects a `dueReminderTime` the NY clock would then re-parse,
 * and the watermark's `dueCheckedOn` is fed straight into a frozen query string. Four
 * copies of a regex are four chances for one of them to drift.
 *
 * Plain Node, no imports (C-13).
 */

/** `2026-09-16` — a calendar date, no zone. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `2026-09-16T18:04:02.000Z` — exactly what `Date.prototype.toISOString` produces, and
 * only that. C-6 interpolates such a value into a query string unencoded, so the shape is
 * what makes that safe: no `+hh:mm` offset, no space separator, no missing `Z`.
 */
export const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

/** `18:00` — a 24-hour wall-clock time, `00:00` to `23:59`. */
export const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True when `value` is a string `Date.prototype.toISOString` could have produced. */
export function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && ISO_INSTANT.test(value);
}

/** True when `value` is a `YYYY-MM-DD` calendar date. */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}

/**
 * `value` as a strict `...Z` instant, or `null` when it is not a usable timestamp at all.
 *
 * A file on disk can hold `2026-09-16T14:04:02+00:00` or `2026-09-16 14:04:02Z`: both
 * parse, neither matches `ISO_INSTANT`, and feeding either to a query builder that demands
 * the strict form throws on every tick forever. Normalising on read is the cheap half of
 * R2-9; the caller decides what to do with `null`.
 */
export function normaliseInstant(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (ISO_INSTANT.test(value)) return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}
