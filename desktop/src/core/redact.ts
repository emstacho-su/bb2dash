/**
 * C-5 / C-10 — nothing that could identify a session may reach the log file.
 *
 * Main holds the access token in memory for the length of one PostgREST read
 * and writes it nowhere. This is the belt to that braces: every line the logger
 * emits passes through `redact` first, so a token that reaches a log line by
 * accident — inside an error message, a URL, a thrown response body — is
 * replaced rather than written.
 *
 * Plain Node, no `electron` import (C-13).
 */

const RULES: readonly { readonly pattern: RegExp; readonly replacement: string }[] = Object.freeze([
  // `Authorization: Bearer <token>` in any casing, however it was stringified.
  { pattern: /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: 'Bearer [redacted]' },
  // A JWT anywhere: the anon key and the access token are both this shape.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g,
    replacement: '[redacted-jwt]',
  },
  // The Supabase auth cookie's own value, prefixed or not.
  { pattern: /base64-[A-Za-z0-9_-]{16,}/g, replacement: '[redacted-cookie]' },
  { pattern: /(sb-[A-Za-z0-9-]+-auth-token(?:\.\d+)?=)[^\s;]+/g, replacement: '$1[redacted]' },
  // `?apikey=…` on a URL that found its way into a message.
  { pattern: /([?&]apikey=)[^&\s]+/gi, replacement: '$1[redacted]' },
]);

/** Returns a new string; the input is never modified. */
export function redact(line: string): string {
  return RULES.reduce((text, rule) => text.replace(rule.pattern, rule.replacement), line);
}
