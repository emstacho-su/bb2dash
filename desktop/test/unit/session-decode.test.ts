/**
 * C-5 — cookie(s) in, `{ accessToken, expiresAt }` out. Single cookie, chunked
 * cookie, the `base64-` prefix, and every way the value can be unusable.
 */

import { describe, expect, it } from 'vitest';

import {
  authCookieBaseName,
  decodeSession,
  decodeSessionValue,
  isExpired,
  joinCookieChunks,
} from '../../src/core/session-decode';

const BASE = 'sb-goultdzqcavefcgnifdy-auth-token';

/** A JWT-shaped access token whose payload carries `exp`. */
function jwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'stack', exp })).toString('base64url');
  return `${header}.${payload}.signature`;
}

function cookieValue(session: Record<string, unknown>): string {
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

describe('authCookieBaseName', () => {
  it('derives the name from the project ref', () => {
    expect(authCookieBaseName('https://goultdzqcavefcgnifdy.supabase.co')).toBe(BASE);
  });

  it('is null for a local fixture URL, so the caller matches any auth cookie', () => {
    expect(authCookieBaseName('http://127.0.0.1:4321')).toBeNull();
    expect(authCookieBaseName('not a url')).toBeNull();
  });
});

describe('joinCookieChunks', () => {
  it('reads a single unchunked cookie', () => {
    expect(joinCookieChunks([{ name: BASE, value: 'abc' }], BASE)).toBe('abc');
  });

  it('joins chunks in index order, not the order they arrive in', () => {
    const cookies = [
      { name: `${BASE}.2`, value: 'ccc' },
      { name: `${BASE}.0`, value: 'aaa' },
      { name: `${BASE}.1`, value: 'bbb' },
    ];
    expect(joinCookieChunks(cookies, BASE)).toBe('aaabbbccc');
  });

  it('orders past ten chunks numerically, not lexically', () => {
    const cookies = Array.from({ length: 12 }, (_, index) => ({
      name: `${BASE}.${index}`,
      value: String.fromCharCode(97 + index),
    }));
    expect(joinCookieChunks(cookies.slice().reverse(), BASE)).toBe('abcdefghijkl');
  });

  it('prefers the chunks when a stale unchunked cookie is also present', () => {
    const cookies = [
      { name: BASE, value: 'stale' },
      { name: `${BASE}.0`, value: 'fre' },
      { name: `${BASE}.1`, value: 'sh' },
    ];
    expect(joinCookieChunks(cookies, BASE)).toBe('fresh');
  });

  it('ignores cookies belonging to other names', () => {
    const cookies = [
      { name: 'other-cookie', value: 'no' },
      { name: BASE, value: 'yes' },
    ];
    expect(joinCookieChunks(cookies, BASE)).toBe('yes');
  });

  it('matches any sb-…-auth-token when no base name is known', () => {
    expect(joinCookieChunks([{ name: 'sb-localfixture-auth-token.0', value: 'x' }], null)).toBe('x');
  });

  it('is null when nothing matches', () => {
    expect(joinCookieChunks([{ name: 'unrelated', value: 'x' }], BASE)).toBeNull();
    expect(joinCookieChunks([], BASE)).toBeNull();
  });
});

describe('decodeSessionValue', () => {
  const exp = 1_800_000_000;

  it('strips the base64- prefix and reads access_token + expires_at', () => {
    const session = decodeSessionValue(
      cookieValue({ access_token: jwt(exp), expires_at: exp, refresh_token: 'r' }),
    );
    expect(session).toEqual({ accessToken: jwt(exp), expiresAt: exp });
  });

  it('reads a plain JSON cookie with no prefix', () => {
    const session = decodeSessionValue(JSON.stringify({ access_token: jwt(exp), expires_at: exp }));
    expect(session?.expiresAt).toBe(exp);
  });

  it('reads a percent-encoded cookie value', () => {
    const raw = encodeURIComponent(JSON.stringify({ access_token: jwt(exp), expires_at: exp }));
    expect(decodeSessionValue(raw)?.accessToken).toBe(jwt(exp));
  });

  it('falls back to the JWT exp when the JSON has no expires_at', () => {
    expect(decodeSessionValue(cookieValue({ access_token: jwt(exp) }))?.expiresAt).toBe(exp);
  });

  it('reads the older array form', () => {
    const json = JSON.stringify([jwt(exp), 'refresh']);
    const value = `base64-${Buffer.from(json).toString('base64url')}`;
    expect(decodeSessionValue(value)?.expiresAt).toBe(exp);
  });

  it.each([
    ['empty', ''],
    ['valid base64 that is not JSON', `base64-${Buffer.from('hello').toString('base64url')}`],
    ['JSON without an access token', cookieValue({ token_type: 'bearer' })],
    ['an opaque token with no expiry anywhere', cookieValue({ access_token: 'opaque' })],
  ])('is null for %s', (_label, value) => {
    expect(decodeSessionValue(value)).toBeNull();
  });

  it('returns a frozen object', () => {
    const session = decodeSessionValue(cookieValue({ access_token: jwt(exp), expires_at: exp }));
    expect(Object.isFrozen(session)).toBe(true);
  });
});

describe('decodeSession', () => {
  const exp = 1_900_000_000;

  it('joins chunks and decodes them as one value', () => {
    const value = cookieValue({ access_token: jwt(exp), expires_at: exp });
    const half = Math.ceil(value.length / 2);
    const cookies = [
      { name: `${BASE}.0`, value: value.slice(0, half) },
      { name: `${BASE}.1`, value: value.slice(half) },
    ];
    expect(decodeSession(cookies, BASE)).toEqual({ accessToken: jwt(exp), expiresAt: exp });
  });

  it('is null when the partition holds no auth cookie', () => {
    expect(decodeSession([], BASE)).toBeNull();
  });
});

describe('isExpired', () => {
  it('is true at or past the expiry second', () => {
    const session = { accessToken: 'a', expiresAt: 1_000 };
    expect(isExpired(session, 1_000_000)).toBe(true);
    expect(isExpired(session, 999_999)).toBe(false);
  });
});
