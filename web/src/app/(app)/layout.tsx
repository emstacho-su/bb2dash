import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { ItemPopout } from '@/components/popout/ItemPopout';
import { TopNav } from '@/components/shell/TopNav';
import { getCurrentUser } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import styles from './Shell.module.css';

/**
 * The authenticated app shell. Every screen inside the (app) route group gets
 * the persistent top bar, the cmd-K mount point, and the `?item=` popout host.
 *
 * Auth is enforced twice on purpose: the middleware redirects before a render
 * happens (fast, covers every path), and this layout re-checks server-side so
 * a mis-scoped matcher can never leak a screen.
 *
 * The popout host reads the query string, so it sits behind a Suspense boundary
 * — without one, `useSearchParams` would opt every static screen in this group
 * out of prerendering.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) redirect('/login');

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className={styles.shell}>
      <TopNav userEmail={user.email ?? null} />
      <main className={styles.main}>{children}</main>
      <CommandPalette />
      <Suspense fallback={null}>
        <ItemPopout />
      </Suspense>
    </div>
  );
}
