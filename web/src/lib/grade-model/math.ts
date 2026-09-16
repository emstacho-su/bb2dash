/**
 * Small numeric helpers for the grade-model engine. Every one returns a new
 * value and leaves its input untouched (inputs may be frozen).
 */

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Mean of `values`; 0 for an empty list (callers guard the empty case). */
export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/** `values` followed by `r` until the list holds `slots` entries. */
export function fillSlots(values: readonly number[], slots: number, r: number): readonly number[] {
  const missing = Math.max(0, slots - values.length);
  return [...values, ...Array.from({ length: missing }, () => r)];
}

export function ascending(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

export function descending(values: readonly number[]): number[] {
  return [...values].sort((a, b) => b - a);
}
