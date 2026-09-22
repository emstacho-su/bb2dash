'use client';

/**
 * The full-details screen (T-2, P-planner-5).
 *
 * It renders `AssignmentDetailBody` — the same component the `?item=` popout
 * renders, with no markup copied between them — inside a panel under the course
 * sub-bar. Its own job is the two things the popout never has to do: check that
 * the assignment in the URL exists and belongs under this course, and say so
 * honestly while that is still unknown.
 *
 * NOT FOUND. Both "no such assignment" and "that assignment is another
 * course's" raise Next's not-found boundary, so a mistyped or stale link is a
 * 404 rather than an empty panel. Neither is decided before the reads that
 * would settle it have landed: a loading query is not evidence of absence.
 */

import { notFound } from 'next/navigation';
import { AssignmentDetailBody } from '@/components/popout/AssignmentDetailBody';
import { isQueryLoading } from '@/components/shared/QueryState';
import { assignmentBelongsToCourse } from '@/lib/assignment-page';
import { useCourse } from '@/lib/queries';
import { useAssignment } from '@/lib/queries.popout';
import styles from './CourseAssignment.module.css';

export function CourseAssignment({
  courseId,
  assignmentId,
}: {
  courseId: string;
  assignmentId: string;
}) {
  const assignmentQ = useAssignment(assignmentId);
  const assignment = assignmentQ.data ?? null;

  // The assignment's own course row, for the parent-shell case. Same query key
  // the body uses, so this is the cache entry rather than a second request.
  const ownerQ = useCourse(assignment?.course_id ?? '');

  if (isQueryLoading(assignmentQ)) {
    return <p className={styles.state}>Loading assignment…</p>;
  }

  if (assignmentQ.isError) {
    return (
      <p className={styles.problem} role="alert">
        Could not load this assignment: {(assignmentQ.error as Error).message}
      </p>
    );
  }

  if (assignment === null) notFound();

  const ownCourse = assignment.course_id === courseId;
  if (!ownCourse) {
    // Only the shell case needs the course row, and only then is it worth
    // waiting for one.
    if (isQueryLoading(ownerQ)) {
      return <p className={styles.state}>Loading assignment…</p>;
    }
    const parent = ownerQ.data?.parent_course_id ?? null;
    if (!assignmentBelongsToCourse(courseId, assignment.course_id, parent)) notFound();
  }

  return (
    <section className={styles.panel} aria-label="Assignment detail">
      <AssignmentDetailBody assignmentId={assignmentId} />
    </section>
  );
}
