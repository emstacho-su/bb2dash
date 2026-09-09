'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { supabaseAnonKey, supabaseUrl } from './env';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * The browser Supabase client. Session lives in cookies (via @supabase/ssr) so
 * the middleware guard and any server component see the same session.
 *
 * Memoised: @supabase/ssr's browser client is meant to be a singleton — a new
 * one per render would spawn duplicate auth listeners.
 */
export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
  }
  return browserClient;
}

export type SupabaseBrowserClient = ReturnType<typeof getSupabaseBrowserClient>;
