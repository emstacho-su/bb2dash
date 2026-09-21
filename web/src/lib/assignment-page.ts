/**
 * The full-details page's URL, and who is allowed to be on it (Phase 12b, T-2).
 *
 * Pure: no React, no network, no Next. The route itself is
 * `/course/[id]/assignment/[...assignmentId]`.
 *
 * WHY A CATCH-ALL. `assignments.id` is `<course>/<kebab-slug>` (DATA_SYNTAX),
 * so every assignment id contains a slash. Squeezing one into a single dynamic
 * segment means `%2F`, which survives `next/link` but is decoded by enough
 * proxies on the way to a deployment to be a bad bet for a link Stack is meant
 * to be able to paste anywhere. Each segment is encoded on its own instead, so
 * the path reads `/course/IST.323/assignment/IST.323/lab-1` and rebuilds
 * exactly — and a `%2F` form still rebuilds to the same id, because Next hands
 * back one already-decoded segment.
 */

/** The path of an assignment's full-details page under a course. */
export function assignmentPagePath(courseId: string, assignmentId: string): string {
  const course = encodeURIComponent(courseId);
  const id = assignmentId.split('/').map(encodeURIComponent).join('/');
  return `/course/${course}/assignment/${id}`;
}

/**
 * Rebuild the assignment id from what the route hands over. The segments are
 * untrusted: anything empty resolves to `null` and the page says not found
 * rather than querying for `''`.
 */
export function assignmentIdFromSegments(
  segments: readonly string[] | string | undefined,
): string | null {
  const parts = typeof segments === 'string' ? [segments] : (segments ?? []);
  const id = parts
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('/');
  return id === '' ? null : id;
}

/**
 * Does this assignment belong under this course's URL?
 *
 * Normally its `course_id` is the course in the path. A course read together
 * with its parent — GEO 103's recitation shell — is also at home under the
 * parent's URL, so a link built from the display course still resolves.
 */
export function assignmentBelongsToCourse(
  courseId: string,
  assignmentCourseId: string | null | undefined,
  parentCourseId: string | null | undefined,
): boolean {
  if (!assignmentCourseId) return false;
  if (assignmentCourseId === courseId) return true;
  return Boolean(parentCourseId) && parentCourseId === courseId;
}
