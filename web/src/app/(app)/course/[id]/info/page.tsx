import type { Metadata } from 'next';
import { CourseInfo } from './CourseInfo';

export const metadata: Metadata = {
  title: 'Course info · bb2dash',
};

/**
 * `/course/[id]/info` — staff, meetings, policies, syllabus, groups, the
 * editable card note and the Blackboard link (T-05 / R-04).
 *
 * Next 16: `params` is a promise.
 */
export default async function CourseInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseInfo courseId={decodeURIComponent(id)} />;
}
