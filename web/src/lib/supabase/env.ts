/**
 * Client-side Supabase configuration.
 *
 * Both values are safe in a browser bundle — RLS is the security boundary
 * (see CLAUDE.md "Secrets"). The service-role key must never appear here or
 * anywhere else in this app.
 *
 * These are read at module scope so a missing var fails loudly at the point of
 * use rather than as an opaque 401 from PostgREST. `next build` prerenders
 * pages, so the accessors throw lazily rather than at import time.
 */

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not set. Copy web/.env.example to web/.env.local ' +
        '(local) or set it in the Vercel project settings (deployed).',
    );
  }
  return url;
}

export function supabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Copy web/.env.example to web/.env.local ' +
        '(local) or set it in the Vercel project settings (deployed).',
    );
  }
  return key;
}

/** True when both public vars are present. Used to render a helpful notice
 *  instead of crashing when the app is opened without configuration. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
