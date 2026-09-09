import type { Metadata } from 'next';
import { ScreenStub } from '@/components/shell/ScreenStub';
import { CourseSubBar } from './CourseSubBar';
import styles from '../../Shell.module.css';

export const metadata: Metadata = {
  title: 'Course · bb2dash',
};

/**
 * Course page. The real screen — per-course Upcoming-work tracker, sticky week
 * rail 1–16 with Current/All modes, Lecture vs Assignment lanes by week — is
 * artboard 14-course-v2 and belongs to W-6.
 *
 * Next 16: `params` is a promise.
 */
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const courseId = decodeURIComponent(id);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Course</span>
          <h1 className={styles.title}>{courseId}</h1>
        </div>
      </header>

      <CourseSubBar courseId={courseId} />

      <ScreenStub title="Course stream" owner="W-6 · Course page">
        The course sub-bar above is the thin second bar from GUI decision 1c (Stream · Grades ·
        Materials · Info, plus meeting time/room and the Blackboard link). Beneath it go the
        per-course tracker and the week rail.
      </ScreenStub>
    </>
  );
}
