// bb2dash :: scripts/lib/accept-proofs-detail.mjs
// What one proof's result says, and what of its row may be printed.
//
// A proof's statement returns one row. `ok` is its verdict, `blocked` says the run must be
// repeated, and everything else is `detail`: what the host keeps beside the verdict. `detail` is
// built from an allow-list, at every depth, because the host's output is read by people and the
// database holds what was typed and answered:
//
//   kept       a number, true, false, null, and a text that is a uuid, an ISO time, a planner
//              fingerprint or a short token (a state, a tier, a tool's name, an id as text);
//   withheld   anything else: the word `withheld` stands in its place. A sentence is always
//              withheld: a token holds no blank.
//
// And a row that carries a key named like a text column (TEXT_NAMES), at any depth, fails its
// proof outright: renaming a column or wrapping a row in json does not get text out.

import { FINGERPRINT, ISO_TIME, TEXT_NAMES, UUID } from './accept-proofs-shapes.mjs';

/** What stands in `detail` for a value that is none of the allowed shapes. */
export const WITHHELD = 'withheld';

/**
 * A short code, name or number as text: a state, a tier, a tool's name, a model's id. It holds no
 * blank, so a sentence is never one, however short and however plain its words.
 */
const SHORT_TOKEN = /^[A-Za-z0-9_.:·+-]{0,64}$/;

const isKeptText = (text) => UUID.test(text) || ISO_TIME.test(text) || FINGERPRINT.test(text) || SHORT_TOKEN.test(text);

const isPlainObject = (value) => [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** One value of `detail` by the allow-list; lists and plain objects are walked. */
function kept(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : WITHHELD;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return isKeptText(value) ? value : WITHHELD;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? WITHHELD : value.toISOString();
  if (Array.isArray(value)) return value.map(kept);
  if (typeof value !== 'object' || !isPlainObject(value)) return WITHHELD;
  // A key is text too: an object keyed by anything but short names is withheld whole.
  if (!Object.keys(value).every((key) => key !== '' && SHORT_TOKEN.test(key))) return WITHHELD;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, kept(inner)]));
}

/** The first key of a value, at any depth, that is named like a text column; null when there is none. */
function textKeyIn(value) {
  if (value === null || typeof value !== 'object' || value instanceof Date) return null;
  if (Array.isArray(value)) return value.map(textKeyIn).find((found) => found !== null) ?? null;
  for (const [key, inner] of Object.entries(value)) {
    if (TEXT_NAMES.includes(key.toLowerCase())) return key.toLowerCase();
    const found = textKeyIn(inner);
    if (found !== null) return found;
  }
  return null;
}

/**
 * What a statement's result says. One row whose `ok` is true passes. `blocked` true outranks
 * both pass and fail: the proof could not be read fairly, and the run is repeated.
 */
export function decide(result) {
  const failed = (detail) => ({ pass: false, blocked: false, detail });
  if (Array.isArray(result)) return failed({ error: 'expected_one_result', results: result.length });
  const rows = result?.rows ?? [];
  if (rows.length !== 1) return failed({ error: 'expected_one_row', rows: rows.length });
  const [row] = rows;
  const leaked = textKeyIn(row);
  if (leaked !== null) return failed({ error: 'forbidden_key', key: leaked });
  if (!Object.hasOwn(row, 'ok')) return failed({ error: 'no_ok_column' });
  const { ok, blocked, ...rest } = row;
  const detail = kept(rest);
  if (blocked === true) return { pass: false, blocked: true, detail };
  return { pass: ok === true, blocked: false, detail };
}
