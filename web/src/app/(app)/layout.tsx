import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { CourseSidebar } from '@/components/shell/CourseSidebar';
import { ItemPopout } from '@/components/popout/ItemPopout';
import { SidebarProvider } from '@/components/shell/SidebarProvider';
import { TopNav } from '@/components/shell/TopNav';
import { SIDEBAR_BOOT_SCRIPT } from '@/lib/sidebar-preference';
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
 *
 * Below the bar the shell is one flex row: the course rail, then the content
 * column, which takes every pixel the rail leaves (no `--content-max` cap here
 * — screens that want a measure set their own).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) redirect('/login');

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <SidebarProvider>
      {/* Stamps html[data-sidebar] during parse so the rail is already in its
          remembered state on the first paint. */}
      <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT_SCRIPT }} />
      <div className={styles.shell}>
        <TopNav userEmail={user.email ?? null} />
        <div className={styles.body}>
          <CourseSidebar />
          <main className={styles.main}>{children}</main>
        </div>
        <CommandPalette />
        <Suspense fallback={null}>
          <ItemPopout />
        </Suspense>
      </div>
    </SidebarProvider>
  );
}
