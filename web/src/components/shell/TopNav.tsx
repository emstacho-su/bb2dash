'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { clearPersistedQueryCache } from '@/lib/query-provider';
import { SIDEBAR_ID } from '@/lib/sidebar-preference';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { HamburgerIcon, SearchIcon, UserIcon } from './icons';
import { ActivityMenu } from './ActivityMenu';
import { Bell } from './Bell';
import { useSidebar } from './SidebarProvider';
import { SyncButton } from './SyncButton';
import { usePopover } from './usePopover';
import styles from './TopNav.module.css';

/**
 * The persistent top bar — GUI decision 1c.
 *
 *   bb2dash mark · Home · Planner · Inbox · Grades · Materials
 *   … cmd-K affordance · Sync … ☰ Courses · activity · bell · user
 *
 * ☰ no longer opens a pop-down list: it toggles the course sidebar below the
 * bar (`CourseSidebar`). The pop-down capped the content column at
 * `--content-max` for nothing and left a gap on wide windows; the rail uses
 * that space instead. Its open/closed highlight comes from
 * `html[data-sidebar]` rather than React state, so it is right on frame one.
 *
 * Phase 9 added the Inbox link (between Planner and Grades), the Sync button
 * next to ⌘K, and the Activity pop-down. Phase 11 replaced the disabled bell
 * placeholder with the real one (`Bell.tsx`).
 */

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/planner', label: 'Planner' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/grades', label: 'Grades' },
  { href: '/materials', label: 'Materials' },
] as const;

export function TopNav({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const user = usePopover<HTMLSpanElement>();
  const sidebar = useSidebar();

  // Close the user menu on navigation.
  useEffect(() => {
    user.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    clearPersistedQueryCache();
    router.replace('/login');
    router.refresh();
  }

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent('bb2dash:command-palette'));
  }

  return (
    <nav className={styles.bar} aria-label="Primary">
      <Link href="/" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        bb2dash
      </Link>

      <span className={styles.links}>
        {NAV_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href) ? styles.linkActive : styles.link}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </span>

      {/* cmd-K mount point — W-8 replaces the handler with the real palette. */}
      <button type="button" className={styles.cmdk} onClick={openCommandPalette}>
        <SearchIcon />
        Search
        <span className={styles.kbd}>⌘K</span>
      </button>

      <SyncButton />

      <span className={styles.right}>
        {/* ☰ — the course sidebar toggle */}
        <button
          type="button"
          ref={sidebar.toggleRef}
          className={styles.icToggle}
          onClick={() => {
            user.close();
            sidebar.toggle();
          }}
          aria-expanded={sidebar.open}
          aria-controls={SIDEBAR_ID}
          title="Courses sidebar"
        >
          <HamburgerIcon />
          <span className="sr-only">Courses sidebar</span>
        </button>

        {/* Activity — what the last syncs changed (R-26 web half). */}
        <ActivityMenu />

        {/* Announcements — unread badge, dropdown, "See all" (R-20). */}
        <Bell />

        {/* User menu */}
        <span ref={user.ref} style={{ display: 'contents' }}>
          <button
            type="button"
            className={user.open ? styles.icOpen : styles.ic}
            onClick={() => user.toggle()}
            aria-expanded={user.open}
            aria-haspopup="menu"
            title="Account"
          >
            <UserIcon />
            <span className="sr-only">Account</span>
          </button>

          {user.open && (
            <div className={styles.ddUser} role="menu">
              <div className={styles.ddIdentity}>
                <span className={styles.ddHead} style={{ padding: 0 }}>
                  Signed in
                </span>
                <span className={styles.ddEmail}>{userEmail ?? 'unknown'}</span>
              </div>
              <button type="button" className={styles.ddRow} role="menuitem" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </span>
      </span>
    </nav>
  );
}
