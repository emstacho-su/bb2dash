import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CourseSubBar } from './CourseSubBar';

export const metadata: Metadata = {
  title: 'Course · bb2dash',
};

/**
 * Course shell (Phase 8). The sub-bar leads the screen (GUI decision 1c) and is
 * rendered once here so it does not remount — and does not refetch the course —
 * as Stream / Classwork / Grades / Info swap underneath it.
 *
 * Next 16: `params` is a promise.
 */
export default async function CourseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const courseId = decodeURIComponent(id);

  return (
    <>
      <CourseSubBar courseId={courseId} />
      {children}
    </>
  );
}
