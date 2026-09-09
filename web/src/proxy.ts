import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy-session';

/**
 * Next 16 renamed the `middleware` file convention to `proxy`; the semantics
 * are unchanged. This runs before every matched request: it refreshes the
 * Supabase auth cookie and redirects unauthenticated visitors to /login.
 */
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except:
     *   _next/static, _next/image  — build output
     *   favicon.ico, static assets — no session needed
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
