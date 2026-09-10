import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { TopNav } from '@/components/shell/TopNav';
import { getCurrentUser } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import styles from './Shell.module.css';

/**
 * The authenticated app shell. Every screen inside the (app) route group gets
 * the persistent top bar and the cmd-K mount point.
 *
 * Auth is enforced twice on purpose: the middleware redirects before a render
 * happens (fast, covers every path), and this layout re-checks server-side so
 * a mis-scoped matcher can never leak a screen.
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
    </div>
  );
}
