import type { Metadata } from 'next';
import { CourseStream } from './CourseStream';

export const metadata: Metadata = {
  title: 'Stream · bb2dash',
};

/**
 * `/course/[id]/stream` — the course's front page: the per-course Upcoming-work
 * tracker over the day-grouped stream feed. The sub-bar is rendered by the
 * course layout, not here.
 *
 * Next 16: `params` is a promise.
 */
export default async function CourseStreamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseStream courseId={decodeURIComponent(id)} />;
}
