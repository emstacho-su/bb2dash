import type { Metadata } from 'next';
import { CourseSubBar } from './CourseSubBar';
import { CourseScreen } from './CourseScreen';

export const metadata: Metadata = {
  title: 'Course · bb2dash',
};

/**
 * Course page (screen W-6, artboard 14-course-v2): the course sub-bar, a verbatim
 * AI-policy block, the sticky week rail 1–16 and the Lecture vs Assignment lanes.
 * The sub-bar leads (GUI decision 1c) so there is no separate page header; the
 * screen renders an sr-only <h1> for the document outline.
 *
 * Next 16: `params` is a promise.
 */
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const courseId = decodeURIComponent(id);

  return (
    <>
      <CourseSubBar courseId={courseId} />
      <CourseScreen courseId={courseId} />
    </>
  );
}
