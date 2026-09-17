/**
 * C-4 — the navigation allowlist, as a decision table. The Electron wiring in
 * `src/main/navigation.ts` does nothing but act on these three answers.
 */

import { describe, expect, it } from 'vitest';

import { decideNavigation, decideWindowOpen } from '../../src/core/navigation-policy';

const ALLOWED = Object.freeze([
  'https://web-xi-ten-uy9xk6c6p0.vercel.app',
  'https://goultdzqcavefcgnifdy.supabase.co',
]);

describe('decideNavigation', () => {
  it.each([
    'https://web-xi-ten-uy9xk6c6p0.vercel.app/',
    'https://web-xi-ten-uy9xk6c6p0.vercel.app/course/IST.323/grades?tab=all',
    'https://goultdzqcavefcgnifdy.supabase.co/auth/v1/verify?token=x',
    'https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/bb-files/a.pdf',
  ])('allows %s', (url) => {
    expect(decideNavigation(url, ALLOWED)).toEqual({ kind: 'allow' });
  });

  it.each([
    'https://blackboard.syracuse.edu/ultra',
    'http://example.com/page',
    'https://web-xi-ten-uy9xk6c6p0.vercel.app.evil.test/',
    'https://goultdzqcavefcgnifdy.supabase.co.attacker.test/',
  ])('hands %s to the default browser', (url) => {
    expect(decideNavigation(url, ALLOWED)).toMatchObject({ kind: 'external' });
  });

  it('treats a different port on an allowed host as a different origin', () => {
    expect(decideNavigation('https://goultdzqcavefcgnifdy.supabase.co:8443/x', ALLOWED)).toMatchObject({
      kind: 'external',
    });
  });

  it.each([
    ['a file URL', 'file:///C:/Windows/System32/calc.exe'],
    ['a custom scheme', 'ms-settings:privacy'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['an unparseable target', 'not a url at all'],
  ])('drops %s', (_label, url) => {
    expect(decideNavigation(url, ALLOWED)).toMatchObject({ kind: 'drop' });
  });

  it('allows nothing when the allowlist is empty', () => {
    expect(decideNavigation('https://web-xi-ten-uy9xk6c6p0.vercel.app/', [])).toMatchObject({
      kind: 'external',
    });
  });
});

describe('decideWindowOpen', () => {
  it('sends an allowed-origin target to the browser too: no window is ever created', () => {
    expect(
      decideWindowOpen('https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/x'),
    ).toMatchObject({ kind: 'external' });
  });

  it('sends an outside link to the browser', () => {
    expect(decideWindowOpen('https://example.com/')).toMatchObject({ kind: 'external' });
  });

  it.each(['file:///C:/secret.txt', 'javascript:alert(1)', 'nope'])('drops %s', (url) => {
    expect(decideWindowOpen(url)).toMatchObject({ kind: 'drop' });
  });

  it('never answers "allow": the handler always denies the new window', () => {
    for (const url of ['https://example.com/', 'file:///x', 'bad']) {
      expect(decideWindowOpen(url).kind).not.toBe('allow');
    }
  });
});
