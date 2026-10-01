'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getDesktopUpdater } from '@/lib/desktop-bridge';
import { clearPersistedQueryCache } from '@/lib/query-provider';
import { SIDEBAR_ID } from '@/lib/sidebar-preference';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { HamburgerIcon, UserIcon } from './icons';
import { ActivityMenu } from './ActivityMenu';
import { Bell } from './Bell';
import { NavSearch } from './NavSearch';
import { useSidebar } from './SidebarProvider';
import { SyncButton } from './SyncButton';
import { usePopover } from './usePopover';
import { isUpdateLocked, updateLabel, useDesktopUpdate } from './useDesktopUpdate';
import styles from './TopNav.module.css';

/**
 * The persistent top bar — GUI decision 1c.
 *
 *   bb2dash mark · Home · Planner · Inbox · Grades · Materials
 *   … Sync · search icon · ☰ Courses · activity · bell · user   (right-aligned)
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
 *
 * 2026-09-30: the wide "Search ⌘K" button became a search icon that expands
 * in place into a field (`NavSearch.tsx`), with the results in a popover.
 * Stack's walk the same day moved it and Sync into the right-hand group:
 * Sync → search → ☰ → activity → bell → account.
 *
 * Stack, 2026-09-30: inside the desktop shell the account menu also offers
 * "Update desktop app" (feature-detected on `window.bb2dashDesktop`; a normal
 * browser never shows it). It reports its state in place: checking, up to
 * date, restarting, or the failure reason.
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

  const [user, userAnchor] = usePopover<HTMLSpanElement>();
  const desktopUpdate = useDesktopUpdate();
  // Read only while the menu is open, which is always after hydration.
  const showDesktopUpdate = user.open && getDesktopUpdater() !== null;
  // Destructured, not read off the context object: `toggleRef` reaches a `ref`
  // prop, and the React Compiler would otherwise treat the whole object as a ref.
  const { open: sidebarOpen, toggle: toggleSidebar, toggleRef: sidebarToggleRef } = useSidebar();

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

  return (
    <nav className={styles.bar} aria-label="Primary">
      <Link href="/" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        <span className={styles.brandName}>bb2dash</span>
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

      <span className={styles.right}>
        <SyncButton />

        {/* Search — an icon whose field grows leftward (Sync slides left);
            ⌘K / Ctrl+K opens it too. */}
        <NavSearch />

        {/* ☰ — the course sidebar toggle */}
        <button
          type="button"
          ref={sidebarToggleRef}
          className={styles.icToggle}
          onClick={() => {
            user.close();
            toggleSidebar();
          }}
          aria-expanded={sidebarOpen}
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
        <span ref={userAnchor} style={{ display: 'contents' }}>
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
              {showDesktopUpdate && (
                <button
                  type="button"
                  className={styles.ddRow}
                  role="menuitem"
                  onClick={desktopUpdate.start}
                  disabled={isUpdateLocked(desktopUpdate.state)}
                  aria-busy={desktopUpdate.state.status === 'pending'}
                >
                  {updateLabel(desktopUpdate.state)}
                </button>
              )}
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
