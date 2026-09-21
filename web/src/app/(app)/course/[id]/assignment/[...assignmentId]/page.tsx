import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { assignmentIdFromSegments, decodePathSegment } from '@/lib/assignment-page';
import { CourseAssignment } from './CourseAssignment';

export const metadata: Metadata = {
  title: 'Assignment · bb2dash',
};

/**
 * `/course/[id]/assignment/[…]` — one assignment's full details, on a page of
 * its own (Phase 12b, T-2 / P-planner-5).
 *
 * The same body the `?item=` popout renders, under the course sub-bar instead
 * of over whatever screen the reader was on. It is what the planner's small
 * popover links to, and it is linkable from anywhere.
 *
 * The path is a catch-all because `assignments.id` carries a slash; see
 * `@/lib/assignment-page` for why that is not a `%2F` single segment.
 *
 * TR-5: every segment arrives percent-encoded and is decoded here — the course
 * id the way the sibling pages decode theirs, and each assignment segment in
 * `assignmentIdFromSegments`. A URL carrying a malformed escape names nothing,
 * so it is a 404 rather than an unhandled `URIError`.
 *
 * Next 16: `params` is a promise.
 */
export default async function CourseAssignmentPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string[] }>;
}) {
  const { id, assignmentId } = await params;
  const courseId = decodePathSegment(id);
  const resolved = assignmentIdFromSegments(assignmentId);
  if (courseId === null || resolved === null) notFound();

  return <CourseAssignment courseId={courseId} assignmentId={resolved} />;
}
