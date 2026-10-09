/**
 * What a document's text must be before it is put: the rules of "Uploads and extraction", steps 5
 * and 6. Pure; the units come from a parser nobody vetted, so every shape is checked as data.
 */

import { MAX_TOTAL_CHARS, MAX_UNITS, TEXT_UNIT_KIND, TEXT_UNIT_NO, type ErrorCode } from './constants.js';

export interface Unit {
  unit_kind: string;
  unit_no: number;
  text: string;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

const NUL = 0;
const HAS_VISIBLE = /\S/;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** A unit as the parser's answer or a test gives it, or null when its shape is not the agreed one. */
export function asUnit(value: unknown): Unit | null {
  if (typeof value !== 'object' || value === null) return null;
  const { unit_kind: kind, unit_no: no, text } = value as Record<string, unknown>;
  if (typeof kind !== 'string' || typeof text !== 'string') return null;
  if (typeof no !== 'number' || !Number.isSafeInteger(no) || no < 0) return null;
  return { unit_kind: kind, unit_no: no, text };
}

/** The units of an answer, or null when the list or any unit is not the agreed shape. */
export function asUnits(value: unknown): Unit[] | null {
  if (!Array.isArray(value)) return null;
  const units: Unit[] = [];
  for (const item of value) {
    const unit = asUnit(item);
    if (unit === null) return null;
    units.push(unit);
  }
  return units;
}

/** A plain-text or Markdown file: valid UTF-8, no NUL byte, one character that is not white space. */
export function textFileUnits(bytes: Buffer): Checked<Unit[]> {
  if (bytes.includes(NUL)) return { ok: false, code: 'bad_bytes' };
  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch {
    return { ok: false, code: 'bad_bytes' };
  }
  if (!HAS_VISIBLE.test(text)) return { ok: false, code: 'no_text' };
  return { ok: true, value: [{ unit_kind: TEXT_UNIT_KIND, unit_no: TEXT_UNIT_NO, text }] };
}

/**
 * Leave out a unit with no character that is not white space; a file left with none is `no_text`;
 * then more than MAX_UNITS units or MAX_TOTAL_CHARS characters is `too_many_units`.
 */
export function prepareUnits(units: readonly Unit[]): Checked<Unit[]> {
  const kept = units.filter((unit) => HAS_VISIBLE.test(unit.text));
  if (kept.length === 0) return { ok: false, code: 'no_text' };
  const chars = kept.reduce((sum, unit) => sum + unit.text.length, 0);
  if (kept.length > MAX_UNITS || chars > MAX_TOTAL_CHARS) return { ok: false, code: 'too_many_units' };
  return { ok: true, value: kept };
}
