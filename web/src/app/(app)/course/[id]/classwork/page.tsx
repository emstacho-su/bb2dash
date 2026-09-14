import type { Metadata } from 'next';
import { CourseClasswork } from './CourseClasswork';
import { CourseScreen } from './CourseScreen';

export const metadata: Metadata = {
  title: 'Classwork · bb2dash',
};

/**
 * `/course/[id]/classwork` — Blackboard's folder tree, and, under
 * `?view=timeline`, the week-rail timeline this route inherited from the old
 * single-page course screen (moved here unchanged, GUI decision 6b).
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

  if (view === 'timeline') return <CourseScreen courseId={courseId} />;
  return <CourseClasswork courseId={courseId} />;
}
