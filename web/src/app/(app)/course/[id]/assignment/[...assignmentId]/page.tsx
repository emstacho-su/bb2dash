import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { assignmentIdFromSegments } from '@/lib/assignment-page';
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
 * Next 16: `params` is a promise.
 */
export default async function CourseAssignmentPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string[] }>;
}) {
  const { id, assignmentId } = await params;
  const resolved = assignmentIdFromSegments(assignmentId);
  if (resolved === null) notFound();

  return <CourseAssignment courseId={decodeURIComponent(id)} assignmentId={resolved} />;
}
