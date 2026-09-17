/**
 * C-10: "a redaction test proves no bearer token or cookie value is ever written".
 *
 * The samples are shaped like the real ones — a Supabase access token is a JWT, and
 * `@supabase/ssr` 0.12.7 writes `sb-goultdzqcavefcgnifdy-auth-token[.N]` with a `base64-`
 * prefixed value (C-5) — so a regression that only handles toy strings still fails here.
 */

import { describe, expect, it } from 'vitest';

import { createRedactingLogger, describeError, redact, silentLogger } from '../../src/core/redact';

/** Not a real credential: a structurally valid JWT over nonsense claims. */
const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.' +
  'nQzUwYWRmZGQyNmYyZjQ4YzQ5YzlhMWIyYzNkNGU1ZjY';

const FAKE_COOKIE = `sb-goultdzqcavefcgnifdy-auth-token.0=base64-${'Qk9HVVNfVE9LRU5fVkFMVUU'.repeat(3)}`;

function secretsIn(text: string): string[] {
  return [FAKE_JWT, FAKE_COOKIE.split('=')[1] ?? ''].filter((secret) => text.includes(secret));
}

describe('redact', () => {
  it('removes a bare JWT', () => {
    const line = redact(`rest GET failed with ${FAKE_JWT}`);
    expect(secretsIn(line)).toEqual([]);
    expect(line).toContain('[redacted]');
  });

  it('removes an Authorization: Bearer header', () => {
    const line = redact(`Authorization: Bearer ${FAKE_JWT}`);
    expect(secretsIn(line)).toEqual([]);
  });

  it('removes an apikey header', () => {
    const line = redact(`apikey: ${FAKE_JWT}`);
    expect(secretsIn(line)).toEqual([]);
  });

  it('removes a chunked auth cookie value but keeps the cookie name', () => {
    const line = redact(`cookies: ${FAKE_COOKIE}; other=1`);
    expect(secretsIn(line)).toEqual([]);
    expect(line).toContain('sb-goultdzqcavefcgnifdy-auth-token.0=[redacted]');
    expect(line).toContain('other=1');
  });

  it('removes a token inside a JSON blob', () => {
    const line = redact(JSON.stringify({ access_token: FAKE_JWT, refresh_token: 'abc-def-ghi' }));
    expect(secretsIn(line)).toEqual([]);
  });

  it('removes any long opaque run, whatever it is called', () => {
    const blob = 'Z'.repeat(80);
    expect(redact(`mystery=${blob}`)).not.toContain(blob);
  });

  it('never truncates a secret: it substitutes', () => {
    const line = redact(FAKE_JWT);
    expect(line).toBe('[redacted]');
    expect(line).not.toContain(FAKE_JWT.slice(0, 20));
  });

  it('leaves ordinary log lines alone', () => {
    const line = 'tick (interval) fired 2 toast(s)';
    expect(redact(line)).toBe(line);
    expect(redact('navigated to /course/IST.323/grades')).toBe('navigated to /course/IST.323/grades');
  });
});

describe('createRedactingLogger', () => {
  it('redacts every level and prefixes the line', () => {
    const seen: string[] = [];
    const log = createRedactingLogger((level, line) => seen.push(`${level}|${line}`));
    log.info(`token ${FAKE_JWT}`);
    log.warn(FAKE_COOKIE);
    log.error(`Bearer ${FAKE_JWT}`);
    expect(seen).toHaveLength(3);
    for (const line of seen) expect(secretsIn(line)).toEqual([]);
    expect(seen[0]).toContain('info|[poller]');
  });

  it('never lets a broken sink take the poller down', () => {
    const log = createRedactingLogger(() => {
      throw new Error('disk full');
    });
    expect(() => log.error('anything')).not.toThrow();
  });

  it('silentLogger discards everything', () => {
    expect(() => {
      silentLogger.info('a');
      silentLogger.warn('b');
      silentLogger.error('c');
    }).not.toThrow();
  });
});

describe('describeError', () => {
  it('names an Error without its stack', () => {
    expect(describeError(new TypeError('bad shape'))).toBe('TypeError: bad shape');
  });

  it('redacts a token that leaked into a message', () => {
    expect(secretsIn(describeError(new Error(`401 for ${FAKE_JWT}`)))).toEqual([]);
  });

  it('handles a thrown string and a thrown non-error', () => {
    expect(describeError('plain')).toBe('plain');
    expect(describeError({ nope: true })).toBe('non-error thrown');
  });

  it('caps the length', () => {
    expect(describeError(new Error('x'.repeat(1000))).length).toBeLessThanOrEqual(300);
  });
});
