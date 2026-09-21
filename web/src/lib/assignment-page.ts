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
 * `decodeURIComponent` that answers `null` instead of throwing.
 *
 * A path segment is untrusted input: `%`, `%zz` and a truncated multi-byte
 * escape all raise `URIError`, and an unhandled one in a server component is a
 * 500 for what is really a URL nobody can resolve.
 */
export function decodePathSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Rebuild the assignment id from what the route hands over.
 *
 * TR-5: the segments arrive **still encoded** — Next gives a catch-all the path
 * verbatim, which is why the sibling course pages decode `id` — so each one is
 * decoded here. Without that, every id a URL cannot carry as-is (a space, an
 * `&`, an apostrophe, an accented letter) rebuilt into a string no assignment
 * has, and the `%2F` single-segment form this module documents never rebuilt at
 * all.
 *
 * The segments are untrusted: an empty one is a doubled slash and is dropped, a
 * malformed escape names no assignment and resolves to `null`, and so does a
 * path with nothing left in it. The page says not found rather than querying
 * for `''` or crashing.
 */
export function assignmentIdFromSegments(
  segments: readonly string[] | string | undefined,
): string | null {
  const parts = typeof segments === 'string' ? [segments] : (segments ?? []);
  const decoded: string[] = [];

  for (const part of parts) {
    if (part === '') continue;
    const value = decodePathSegment(part);
    if (value === null) return null;
    if (value.trim() === '') continue;
    decoded.push(value);
  }

  return decoded.length === 0 ? null : decoded.join('/');
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
