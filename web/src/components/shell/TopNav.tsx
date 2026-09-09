'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { clearPersistedQueryCache } from '@/lib/query-provider';
import { courseCode, useCourses } from '@/lib/queries';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { BellIcon, HamburgerIcon, SearchIcon, UserIcon } from './icons';
import { usePopover } from './usePopover';
import styles from './TopNav.module.css';

/**
 * The persistent top bar — GUI decision 1c.
 *
 *   bb2dash mark · Home · Planner · Grades · Materials
 *   … cmd-K affordance … ☰ Courses · bell · user
 *
 * The left rail is retired. Courses open from ☰ as a pop-down list and go
 * straight to the course page.
 */

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/planner', label: 'Planner' },
  { href: '/grades', label: 'Grades' },
  { href: '/materials', label: 'Materials' },
] as const;

export function TopNav({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const courses = usePopover<HTMLSpanElement>();
  const user = usePopover<HTMLSpanElement>();

  const coursesQuery = useCourses();

  // Close the pop-downs on navigation.
  useEffect(() => {
    courses.close();
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

      <span className={styles.right}>
        {/* ☰ Courses pop-down */}
        <span ref={courses.ref} style={{ display: 'contents' }}>
          <button
            type="button"
            className={courses.open ? styles.icOpen : styles.ic}
            onClick={() => {
              user.close();
              courses.toggle();
            }}
            aria-expanded={courses.open}
            aria-haspopup="menu"
            title="Courses"
          >
            <HamburgerIcon />
            <span className="sr-only">Courses</span>
          </button>

          {courses.open && (
            <div className={styles.ddCourses} role="menu">
              <div className={styles.ddHead}>Courses</div>
              {coursesQuery.isPending && <div className={styles.ddNote}>Loading…</div>}
              {coursesQuery.isError && (
                <div className={styles.ddNote}>Could not load courses. Check the connection and retry.</div>
              )}
              {coursesQuery.data?.length === 0 && (
                <div className={styles.ddNote}>No courses yet — run a Blackboard sync.</div>
              )}
              {coursesQuery.data?.map((course) => (
                <Link
                  key={course.id}
                  href={`/course/${encodeURIComponent(course.id)}`}
                  className={styles.ddRow}
                  role="menuitem"
                >
                  <span className={styles.ddCode}>{courseCode(course)}</span>
                  <span className={styles.ddTitle}>{course.title_short}</span>
                </Link>
              ))}
            </div>
          )}
        </span>

        {/* Bell — placeholder this term (announcements screen is not in MVP scope). */}
        <span
          className={styles.icDisabled}
          title="Announcements — not wired up this term"
          aria-disabled="true"
        >
          <BellIcon />
        </span>

        {/* User menu */}
        <span ref={user.ref} style={{ display: 'contents' }}>
          <button
            type="button"
            className={user.open ? styles.icOpen : styles.ic}
            onClick={() => {
              courses.close();
              user.toggle();
            }}
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
