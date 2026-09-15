import type { Metadata } from 'next';
import { CourseGrades } from './CourseGrades';

export const metadata: Metadata = {
  title: 'Grades · bb2dash',
};

/**
 * `/course/[id]/grades` — this course's gradebook (Phase 10a).
 *
 * The placeholder that stood here said grades would arrive with Phase 10 and
 * refused to draw a figure until there was a real one behind it. There is one
 * now; the refusal lives on in the rendering, which shows Blackboard's values
 * with the time we saw them and computes nothing.
 *
 * Next 16: `params` is a promise.
 */
export default async function CourseGradesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CourseGrades courseId={decodeURIComponent(id)} />;
}
