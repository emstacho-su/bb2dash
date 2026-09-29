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

  if (view === 'timeline') redirect(`/course/${encodeURIComponent(courseId)}/stream`);
  return <CourseClasswork courseId={courseId} />;
}
