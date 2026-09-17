/**
 * Phase 12b, item X-1 (P-shell-1). `updateSession` refreshes the Supabase auth
 * cookie and then, on two of its four exits, threw the refreshed cookie away.
 *
 * `createServerClient`'s `setAll` callback writes the new token onto a response
 * built with `NextResponse.next()`. Both redirect branches return a brand-new
 * `NextResponse.redirect(...)`, which carries none of it — so an expired token
 * that Supabase had just rotated was never handed back to the browser, and the
 * next request arrived unauthenticated again. In the desktop shell, where the
 * window sits open for hours, that is a sign-out.
 *
 * These tests drive the module with a stubbed `@supabase/ssr` whose `getUser`
 * rotates a cookie exactly as the real one does.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** What the stubbed Supabase client rotates on each getUser() call. */
const REFRESHED = [
  { name: 'sb-goultdzqcavefcgnifdy-auth-token', value: 'rotated-access-token', options: { path: '/' } },
  { name: 'sb-goultdzqcavefcgnifdy-auth-token.1', value: 'rotated-refresh-token', options: { path: '/' } },
];

let user: { id: string } | null = null;
let rotate = true;

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { getAll: () => unknown; setAll: (c: typeof REFRESHED) => void } },
  ) => ({
    auth: {
      async getUser() {
        // The real client calls setAll when it rotates the token.
        if (rotate) opts.cookies.setAll(REFRESHED);
        return { data: { user }, error: null };
      },
    },
  }),
}));

async function run(path: string) {
  const { updateSession } = await import('@/lib/supabase/proxy-session');
  return updateSession(new NextRequest(new URL(`https://bb2dash.test${path}`)));
}

function cookieValue(res: Awaited<ReturnType<typeof run>>, name: string): string | undefined {
  return res.cookies.get(name)?.value;
}

describe('updateSession', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    user = null;
    rotate = true;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('keeps the refreshed cookies when it redirects a signed-out visitor to /login', async () => {
    const res = await run('/planner');

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://bb2dash.test/login?next=%2Fplanner');

    for (const c of REFRESHED) {
      expect(cookieValue(res, c.name)).toBe(c.value);
    }
  });

  it('keeps the refreshed cookies when it redirects a signed-in visitor away from /login', async () => {
    user = { id: 'stack' };
    const res = await run('/login');

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://bb2dash.test/');

    for (const c of REFRESHED) {
      expect(cookieValue(res, c.name)).toBe(c.value);
    }
  });

  it('still carries the refreshed cookies on the pass-through exit', async () => {
    user = { id: 'stack' };
    const res = await run('/planner');

    expect(res.status).toBe(200);
    for (const c of REFRESHED) {
      expect(cookieValue(res, c.name)).toBe(c.value);
    }
  });

  it('leaves a public path alone for a signed-out visitor', async () => {
    const res = await run('/privacy');

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('adds no cookies of its own when nothing was rotated', async () => {
    rotate = false;
    const res = await run('/planner');

    expect(res.status).toBe(307);
    expect(res.cookies.getAll()).toHaveLength(0);
  });
});
