/**
 * C-5 / C-10 — the log redaction. The DoD asks for a test proving no bearer
 * token or cookie value is ever written; this is it, and `src/main/log.ts`
 * routes every line through the function under test.
 */

import { describe, expect, it } from 'vitest';

import { redact } from '../../src/core/redact';

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdGFjayIsImV4cCI6MTgwMDAwMDAwMH0.c2lnbmF0dXJl';

describe('redact', () => {
  it('removes a bearer token', () => {
    const line = redact(`request failed with headers {"authorization":"Bearer ${JWT}"}`);
    expect(line).not.toContain(JWT);
    expect(line).toContain('Bearer [redacted]');
  });

  it('removes a bare JWT, whatever it was labelled', () => {
    expect(redact(`apikey ${JWT} rejected`)).not.toContain(JWT);
  });

  it('removes the Supabase auth cookie value, prefixed', () => {
    const value = `base64-${Buffer.from(JSON.stringify({ access_token: JWT })).toString('base64url')}`;
    const line = redact(`cookie read: ${value}`);
    expect(line).not.toContain(value);
    expect(line).toContain('[redacted-cookie]');
  });

  it('removes a cookie written as name=value', () => {
    const line = redact('sb-goultdzqcavefcgnifdy-auth-token.0=abcdef012345; Path=/');
    expect(line).toBe('sb-goultdzqcavefcgnifdy-auth-token.0=[redacted]; Path=/');
  });

  it('removes an apikey query parameter', () => {
    expect(redact(`GET /rest/v1/courses?select=id&apikey=${JWT}`)).not.toContain(JWT);
  });

  it('leaves ordinary lines alone', () => {
    const line = 'config loaded from C:\\Users\\estac\\AppData\\Roaming\\bb2dash\\config.json';
    expect(redact(line)).toBe(line);
  });

  it('returns a new string and never mutates its input', () => {
    const input = `Bearer ${JWT}`;
    const output = redact(input);
    expect(input).toBe(`Bearer ${JWT}`);
    expect(output).not.toBe(input);
  });
});
