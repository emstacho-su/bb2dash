'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { courseCode, useCourses } from '@/lib/queries';
import { SIDEBAR_ID } from '@/lib/sidebar-preference';
import { useSidebar } from './SidebarProvider';
import styles from './CourseSidebar.module.css';

/**
 * The course rail — what the ☰ pop-down used to be (GUI decision 1c), folded
 * into a sidebar so the main column can fill the rest of the width instead of
 * stopping at `--content-max` and leaving dead space on the right.
 *
 * Two presentations, one component. At `SIDEBAR_BREAKPOINT` and up the rail is
 * in flow and pushes the content; below it the wrapper turns into a fixed
 * drawer with a scrim. Which side it sits on is `--sidebar-side` (globals.css)
 * in both modes — the wrapper, the rail and its hairline all read that token.
 */

/** True when the route is this course's page or anything under it. */
export function isCurrentCourse(pathname: string, courseId: string): boolean {
  const base = `/course/${encodeURIComponent(courseId)}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function CourseSidebar() {
  const pathname = usePathname();
  const { open, overlay, close, toggleRef } = useSidebar();
  const panelRef = useRef<HTMLElement | null>(null);
  const coursesQuery = useCourses();

  /** Close and hand focus back to the control that opened it. */
  const dismiss = useCallback(() => {
    close();
    toggleRef.current?.focus();
  }, [close, toggleRef]);

  // Drawer behaviour only: focus moves in on open, Escape closes.
  useEffect(() => {
    if (!overlay || !open) return;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [overlay, open, dismiss]);

  // A drawer covers the page it just navigated to, so get out of the way.
  // In-flow mode keeps the rail up — that is the whole point of it.
  useEffect(() => {
    if (overlay && open) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const courses = coursesQuery.data;

  return (
    <div className={styles.wrap}>
      <aside
        id={SIDEBAR_ID}
        ref={panelRef}
        className={styles.rail}
        aria-label="Courses"
        tabIndex={-1}
        inert={!open}
      >
        <div className={styles.inner}>
          <h2 className={styles.head}>Courses</h2>

          {coursesQuery.isPending && <p className={styles.note}>Loading…</p>}
          {coursesQuery.isError && (
            <p className={styles.note}>Could not load courses. Check the connection and retry.</p>
          )}
          {courses?.length === 0 && (
            <p className={styles.note}>No courses yet — run a Blackboard sync.</p>
          )}

          {courses && courses.length > 0 && (
            <ul className={styles.list}>
              {courses.map((course) => {
                const current = isCurrentCourse(pathname, course.id);
                return (
                  <li key={course.id}>
                    <Link
                      href={`/course/${encodeURIComponent(course.id)}`}
                      className={current ? styles.rowCurrent : styles.row}
                      aria-current={current ? 'page' : undefined}
                    >
                      <span className={styles.code}>{courseCode(course)}</span>
                      <span className={styles.title}>{course.title_short}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Drawer scrim. `display: none` in flow mode, so it is out of the tab
          order on a laptop and a real labelled control on a phone. */}
      <button type="button" className={styles.scrim} onClick={dismiss}>
        <span className="sr-only">Close courses sidebar</span>
      </button>
    </div>
  );
}
