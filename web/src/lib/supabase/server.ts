import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import { supabaseAnonKey, supabaseUrl } from './env';

/**
 * Supabase client for React Server Components, Server Actions and Route
 * Handlers. Reads the session from the request cookies.
 *
 * Note: in a Server Component the cookie store is read-only, so `setAll` is a
 * no-op there — token refresh is handled by the middleware (see
 * src/lib/supabase/middleware.ts), which is the pattern @supabase/ssr expects.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: refresh is the middleware's job.
        }
      },
    },
  });
}

/** The signed-in user, or null. Never throws on a missing session. */
export async function getCurrentUser() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
