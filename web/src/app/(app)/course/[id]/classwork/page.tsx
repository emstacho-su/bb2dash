import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CourseClasswork } from './CourseClasswork';

export const metadata: Metadata = {
  title: 'Classwork · bb2dash',
};

/**
 * `/course/[id]/classwork` — Blackboard's folder tree, and nothing else.
 *
 * The week-rail timeline this route used to show under `?view=timeline` is the
 * Stream tab since round 3 (R3-4), so an old link lands there.
 *
 * Next 16: `params` and `searchParams` are promises.
 */
/**
 * Where `?view=timeline` goes: this course's Stream, with every other query
 * parameter carried over (a pasted `&item=session:105` must still open its
 * popout). The id is encoded as one path segment, so the target is always
 * `/course/<id>/stream` on this app — never another origin or path.
 */
function streamRedirectPath(
  courseId: string,
  query: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'view' || value === undefined) continue;
    for (const one of Array.isArray(value) ? value : [value]) params.append(key, one);
  }
  const search = params.toString();
  return `/course/${encodeURIComponent(courseId)}/stream${search ? `?${search}` : ''}`;
}

export default async function CourseClassworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const courseId = decodeURIComponent(id);
  const view = Array.isArray(query.view) ? query.view[0] : query.view;

  if (view === 'timeline') redirect(streamRedirectPath(courseId, query));
  return <CourseClasswork courseId={courseId} />;
}
