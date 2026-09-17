/**
 * C-4 — the navigation allowlist, as a decision table. The Electron wiring in
 * `src/main/navigation.ts` does nothing but act on these three answers.
 */

import { describe, expect, it } from 'vitest';

import {
  ALLOWED_PERMISSION,
  decideNavigation,
  decidePermission,
  decideWindowOpen,
} from '../../src/core/navigation-policy';

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

// ---------------------------------------------------------------------------------------
// R2-5 — the Sync button's clipboard write
// ---------------------------------------------------------------------------------------

describe('decidePermission (R2-5)', () => {
  const APP = 'https://web-xi-ten-uy9xk6c6p0.vercel.app';
  const SUPABASE = 'https://goultdzqcavefcgnifdy.supabase.co';

  it('allows the app origin to write the clipboard', () => {
    // C-3 denied everything, which made the Sync button's copy fail silently inside the
    // shell — and the clipboard is the only path to the command once a request is queued,
    // because a second press makes no POST and opens no terminal.
    const decision = decidePermission(ALLOWED_PERMISSION, `${APP}/planner`, APP);
    expect(decision.allow).toBe(true);
    expect(decision.reason).toContain(APP);
  });

  it('allows it regardless of the path or query the request came from', () => {
    for (const from of [APP, `${APP}/`, `${APP}/course/IST.323/grades?tab=all`]) {
      expect(decidePermission(ALLOWED_PERMISSION, from, APP).allow).toBe(true);
    }
  });

  it.each([
    'clipboard-read',
    'geolocation',
    'notifications',
    'media',
    'midi',
    'openExternal',
    'display-capture',
    'fullscreen',
  ])('denies %s even from the app', (permission) => {
    const decision = decidePermission(permission, `${APP}/`, APP);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toContain('allowlist');
  });

  it('denies the clipboard write to the Supabase origin', () => {
    // Supabase is in the *navigation* allowlist for auth redirects and signed Storage
    // URLs. None of that needs a clipboard.
    const decision = decidePermission(ALLOWED_PERMISSION, `${SUPABASE}/auth/v1/callback`, APP);
    expect(decision.allow).toBe(false);
    expect(decision.reason).toContain(SUPABASE);
  });

  it.each([
    ['a different host', 'https://evil.example/page'],
    ['http against an https app', 'http://web-xi-ten-uy9xk6c6p0.vercel.app/'],
    ['a lookalike host', 'https://web-xi-ten-uy9xk6c6p0.vercel.app.evil.example/'],
    ['a file URL', 'file:///C:/Users/estac/x.html'],
  ])('denies the clipboard write from %s', (_label, from) => {
    expect(decidePermission(ALLOWED_PERMISSION, from, APP).allow).toBe(false);
  });

  it('denies when the requesting URL is missing or unparseable', () => {
    expect(decidePermission(ALLOWED_PERMISSION, undefined, APP).allow).toBe(false);
    expect(decidePermission(ALLOWED_PERMISSION, '', APP).allow).toBe(false);
    expect(decidePermission(ALLOWED_PERMISSION, 'not a url', APP).allow).toBe(false);
  });

  it('denies everything when appUrl itself is not a URL', () => {
    expect(decidePermission(ALLOWED_PERMISSION, `${APP}/`, 'nonsense').allow).toBe(false);
  });

  it('names exactly the permission Chromium raises for navigator.clipboard.writeText', () => {
    expect(ALLOWED_PERMISSION).toBe('clipboard-sanitized-write');
  });
});
