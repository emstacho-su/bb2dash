import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './database.types';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './env';

/** Paths that render without a session. Everything else is guarded. */
const PUBLIC_PATHS = ['/login', '/privacy', '/terms'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Move the auth cookies Supabase just refreshed onto a different response.
 *
 * `createServerClient`'s `setAll` writes the rotated token onto the pass-through
 * response. A redirect is a NEW response and carries none of it, so returning one
 * directly throws the refresh away and the next request arrives unauthenticated —
 * a sign-out for anyone whose window has been open long enough for the token to
 * expire (Phase 12b, P-shell-1).
 */
function carryCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

/**
 * Refreshes the Supabase auth cookie and enforces the app-wide auth guard.
 *
 * There is exactly ONE user and NO signup path (project decision) — an
 * unauthenticated visitor is redirected to /login and nowhere else.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Without config there is no auth to check. Let the request through so the
  // page can render its own "not configured" notice rather than redirect-loop.
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (not getSession()) — it revalidates the JWT with the auth server.
  // If Supabase is unreachable we fail closed for guarded paths.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return carryCookies(response, NextResponse.redirect(url));
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return carryCookies(response, NextResponse.redirect(url));
  }

  return response;
}
