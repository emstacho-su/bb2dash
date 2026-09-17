/**
 * C-5 — turn the web session's auth cookie(s) into `{ accessToken, expiresAt }`.
 *
 * Plain Node, no `electron` import (C-13). The Electron adapter
 * (`src/main/session.ts`) pulls the cookie rows out of the `persist:bb2dash`
 * partition and calls in here; a container later supplies a token from its
 * environment instead and skips this module entirely.
 *
 * `@supabase/ssr` 0.12.7 writes `sb-<project-ref>-auth-token`. Above roughly
 * 3 KB it splits the *value string* across `…-auth-token.0`, `.1`, … with the
 * `base64-` prefix on chunk 0. Nothing here is ever written to disk or logged:
 * the token exists in memory for the length of one PostgREST read.
 */

import type { WebSession } from './types';

export interface RawCookie {
  readonly name: string;
  readonly value: string;
}

const BASE64_PREFIX = 'base64-';
const CHUNK_SUFFIX = /\.(\d+)$/;

/**
 * `https://goultdzqcavefcgnifdy.supabase.co` -> `sb-goultdzqcavefcgnifdy-auth-token`.
 * Returns `null` for a URL with no project ref (a localhost test fixture), and
 * callers then fall back to `ANY_AUTH_COOKIE`.
 */
export function authCookieBaseName(supabaseUrl: string): string | null {
  let host: string;
  try {
    host = new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
  const label = host.split('.')[0];
  if (!label || !host.endsWith('.supabase.co')) return null;
  return `sb-${label}-auth-token`;
}

/** Matches any Supabase auth cookie, chunked or not. Used when no ref is known. */
export const ANY_AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

function matchesBase(name: string, baseName: string | null): boolean {
  if (baseName === null) return ANY_AUTH_COOKIE.test(name);
  return name === baseName || name.startsWith(`${baseName}.`);
}

/**
 * Join the chunks of one auth cookie in index order. An unchunked cookie is
 * used only when no chunk exists, which is what `@supabase/ssr` leaves behind
 * when it switches a session from one form to the other.
 */
export function joinCookieChunks(
  cookies: readonly RawCookie[],
  baseName: string | null,
): string | null {
  const relevant = cookies.filter((cookie) => matchesBase(cookie.name, baseName));
  if (relevant.length === 0) return null;

  const chunks = relevant
    .map((cookie) => {
      const match = CHUNK_SUFFIX.exec(cookie.name);
      return match ? { index: Number(match[1]), value: cookie.value } : null;
    })
    .filter((entry): entry is { index: number; value: string } => entry !== null)
    .sort((a, b) => a.index - b.index);

  if (chunks.length > 0) return chunks.map((chunk) => chunk.value).join('');

  const whole = relevant.find((cookie) => !CHUNK_SUFFIX.test(cookie.name));
  return whole ? whole.value : null;
}

/** Cookie values arrive percent-encoded from some writers and raw from others. */
function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function fromBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/** `exp` out of a JWT payload, when the session JSON carries no `expires_at`. */
function expiryFromJwt(accessToken: string): number | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  const json = fromBase64Url(payload);
  if (json === null) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { exp?: unknown }).exp === 'number') {
      return (parsed as { exp: number }).exp;
    }
  } catch {
    return null;
  }
  return null;
}

function toSession(parsed: unknown): WebSession | null {
  // Object form (`@supabase/ssr` 0.12.x) and the older array form both appear
  // in the wild; accept either rather than guessing which writer was last.
  let accessToken: unknown;
  let expiresAt: unknown;

  if (Array.isArray(parsed)) {
    accessToken = parsed[0];
  } else if (parsed !== null && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    accessToken = record.access_token;
    expiresAt = record.expires_at;
  }

  if (typeof accessToken !== 'string' || accessToken.length === 0) return null;
  const expiry =
    typeof expiresAt === 'number' ? expiresAt : expiryFromJwt(accessToken);
  if (expiry === null) return null;

  return Object.freeze({ accessToken, expiresAt: expiry });
}

/** One joined cookie value -> session, or `null` when it is not a session at all. */
export function decodeSessionValue(rawValue: string): WebSession | null {
  const value = decodeComponent(rawValue).trim();
  if (value.length === 0) return null;

  const json = value.startsWith(BASE64_PREFIX)
    ? fromBase64Url(value.slice(BASE64_PREFIX.length))
    : value;
  if (json === null) return null;

  try {
    return toSession(JSON.parse(json));
  } catch {
    return null;
  }
}

/** The whole path: cookie rows in, `{ accessToken, expiresAt }` or `null` out. */
export function decodeSession(
  cookies: readonly RawCookie[],
  baseName: string | null,
): WebSession | null {
  const joined = joinCookieChunks(cookies, baseName);
  return joined === null ? null : decodeSessionValue(joined);
}

/** C-5: an expired session means the poller skips the tick, never refreshes. */
export function isExpired(session: WebSession, nowMs: number): boolean {
  return session.expiresAt * 1000 <= nowMs;
}
