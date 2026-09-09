'use client';

import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useState, type ReactNode } from 'react';

/**
 * TanStack Query v5 + persistQueryClient (localStorage).
 *
 * Why persist: bb2dash is a single-user hub opened many times a day on the
 * same laptop. A warm cache means Today paints instantly and then revalidates,
 * instead of an empty skeleton on every tab open.
 *
 * Cache safety: the persisted cache is per-browser and holds only rows this
 * user is already allowed to read. `buster` is bumped whenever a query's
 * shape changes so a stale localStorage blob is discarded rather than fed to
 * a component that no longer understands it. Sign-out clears it outright
 * (see UserMenu).
 */

export const PERSIST_KEY = 'bb2dash.query-cache';
export const PERSIST_BUSTER = 'v1';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that navigating between screens does not refetch;
        // short enough that a background sync shows up quickly.
        staleTime: 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000, // must be >= maxAge below or nothing persists
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  // Built once, lazily — window is absent during SSR.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window === 'undefined' ? undefined : window.localStorage,
      key: PERSIST_KEY,
      throttleTime: 1000,
    }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: PERSIST_BUSTER,
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/** Drop the persisted cache. Called on sign-out so a session change never
 *  leaves another session's rows sitting in localStorage. */
export function clearPersistedQueryCache() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PERSIST_KEY);
  } catch {
    // Private mode / storage disabled — nothing was persisted anyway.
  }
  browserQueryClient?.clear();
}
