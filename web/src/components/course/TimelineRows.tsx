'use client';

/**
 * The rows of the course timeline (R3-4), moved out of the old
 * `classwork/CourseScreen.tsx`:
 *
 *   SessionRow      a class session: date, kind, the IST.466 attendance marker
 *                   (T-15) and its per-session file count line
 *   SessionPanel    the session detail opened by clicking a SessionRow
 *   AnnouncementRow an announcement on its posted day, behind a bell
 *   AssignmentRow   an assignment on its due date: popout link, points, the
 *                   status select (R-37) and the files linked to it
 *   TimelineFiles   a file list through the shared `FileOpenAction` ladder
 */

import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import type { CourseStreamRow, Session, WorkItem } from '@/lib/queries.course';
import { workItemDueDate } from '@/lib/queries.course';
import { fileTypeChip } from '@/lib/queries.materials';
import { itemQuery } from '@/lib/queries.popout';
import type { ProgressStatus } from '@/lib/queries';
import { FileOpenAction } from '@/components/materials/FileOpenAction';
import { AttendanceMarker, AttendanceRule } from '@/components/popout/SessionPopout';
import { BellIcon } from '@/components/shell/icons';
import { StatusSelect } from '@/components/tracker/StatusSelect';
import type { TimelineFile } from './timeline-model';
import styles from './CourseTimeline.module.css';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'YYYY-MM-DD' → "Mon · Sep 7" (parsed as UTC so the day never shifts). */
export function formatDay(dateISO: string | null): string {
  if (!dateISO) return '';
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const mon = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${DOW[dt.getUTCDay()]} · ${mon} ${dt.getUTCDate()}`;
}

/** Category → the token glyph background/foreground class. */
const GLYPH_CLASS: Record<string, string> = {
  reading: styles.avReading,
  assignment: styles.avAssignment,
  quiz: styles.avQuiz,
  project: styles.avProject,
  exam: styles.avExam,
};

/* -- files ----------------------------------------------------------------- */

export function TimelineFiles({ files }: { files: readonly TimelineFile[] }) {
  if (files.length === 0) return null;
  return (
    <ul className={styles.fileList}>
      {files.map((file) => (
        <li key={file.id} className={styles.fileItem}>
          <span className={styles.fileChip} aria-hidden="true">
            {fileTypeChip(file.mime_type, file.file_name)}
          </span>
          <span className={styles.fileName}>{file.file_name ?? 'Untitled file'}</span>
          <FileOpenAction routes={file} className={tokens.btnGhost} />
        </li>
      ))}
    </ul>
  );
}

/* -- sessions -------------------------------------------------------------- */

export function SessionRow({
  session,
  fileCount,
  active,
  onClick,
}: {
  session: Session;
  fileCount: number;
  active: boolean;
  onClick: () => void;
}) {
  const tentative = session.confidence !== 'confirmed';
  const noClass = session.kind === 'no_class';
  return (
    <button
      type="button"
      className={[styles.sessionRow, active ? styles.sessionRowActive : '', noClass ? styles.sessionRowMuted : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={styles.avatarLecture}>L</span>
      <span className={styles.sessionBody}>
        <span className={styles.sessionMetaRow}>
          <span className={styles.sessionDate}>{formatDay(session.session_date)}</span>
          {session.kind && session.kind !== 'lecture' && (
            <span className={styles.kindTag}>{session.kind.replace(/_/g, ' ')}</span>
          )}
          {tentative && <span className={styles.tentativeTag}>tentative</span>}
          <AttendanceMarker session={session} className={styles.attendanceTag} />
        </span>
        <span className={styles.sessionTitle}>{session.topic ?? 'Untitled session'}</span>
        <span className={styles.sessionSub}>
          {fileCount > 0 ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : 'no files'}
        </span>
      </span>
    </button>
  );
}

export function SessionPanel({
  session,
  files,
  onClose,
}: {
  session: Session;
  files: string[];
  onClose: () => void;
}) {
  const tentative = session.confidence !== 'confirmed';
  return (
    <section className={styles.panel} aria-label="Session detail">
      <div className={styles.panelHead}>
        <span className={tokens.kicker}>Session</span>
        {session.kind && session.kind !== 'lecture' && (
          <span className={styles.kindTag}>{session.kind.replace(/_/g, ' ')}</span>
        )}
        {tentative && <span className={styles.tentativeTag}>tentative — date/detail inferred</span>}
        <AttendanceMarker session={session} className={styles.attendanceTag} />
        <button type="button" className={styles.panelClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <h2 className={styles.panelTitle}>{session.topic ?? 'Untitled session'}</h2>
      <div className={styles.panelMeta}>
        <span>{formatDay(session.session_date)}</span>
        <span>·</span>
        <span>{files.length} material{files.length === 1 ? '' : 's'}</span>
      </div>
      <AttendanceRule courseId={session.course_id} className={styles.attendanceRule} />
      {files.length > 0 && (
        <ul className={styles.panelFiles}>
          {files.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {session.notes && <p className={styles.panelNotes}>{session.notes}</p>}
    </section>
  );
}

/* -- announcements --------------------------------------------------------- */

export function AnnouncementRow({ post, day }: { post: CourseStreamRow; day: string }) {
  return (
    <div className={styles.announcementRow} data-entry="announcement">
      <span className={styles.avatarAnnouncement} role="img" aria-label="Announcement">
        <BellIcon />
      </span>
      <span className={styles.sessionBody}>
        <span className={styles.sessionMetaRow}>
          <span className={styles.sessionDate}>{formatDay(day)}</span>
          {post.meta?.is_unread === true && <span className={styles.unreadTag}>unread</span>}
        </span>
        <Link className={`${styles.sessionTitle} ${styles.titleLink}`} href="/announcements">
          {post.title}
        </Link>
      </span>
    </div>
  );
}

/* -- assignments ----------------------------------------------------------- */

export function AssignmentRow({
  item,
  files,
  onStatusChange,
  pending,
}: {
  item: WorkItem;
  files: readonly TimelineFile[];
  onStatusChange: (item: WorkItem, status: ProgressStatus) => void;
  pending: boolean;
}) {
  const due = workItemDueDate(item);
  const glyphCls = GLYPH_CLASS[item.category ?? 'assignment'] ?? styles.avAssignment;
  const tentative = item.confidence && item.confidence !== 'confirmed';
  const points =
    item.points_possible != null ? `${item.points_possible} pt${item.points_possible === 1 ? '' : 's'}` : null;
  const title = item.title ?? 'Untitled assignment';
  const itemId = item.item_id;
  const isAssignment = item.item_kind === 'assignment' && itemId != null;

  return (
    <div className={styles.asgRow} data-entry="assignment">
      <span className={[styles.avatar, glyphCls].join(' ')}>{item.glyph ?? 'A'}</span>
      <span className={styles.asgBody}>
        <span className={styles.asgMetaRow}>
          <span className={styles.sessionDate}>{due ? formatDay(due) : 'no date'}</span>
          {tentative && <span className={styles.tentativeTag}>tentative</span>}
        </span>
        {isAssignment ? (
          <Link
            className={`${styles.sessionTitle} ${styles.asgTitle} ${styles.titleLink}`}
            href={itemQuery({ kind: 'assignment', id: itemId })}
            scroll={false}
          >
            {title}
          </Link>
        ) : (
          <span className={`${styles.sessionTitle} ${styles.asgTitle}`}>{title}</span>
        )}
        {points && <span className={styles.sessionSub}>{points}</span>}
        <TimelineFiles files={files} />
      </span>
      {itemId != null && (
        <span className={styles.asgStatus}>
          <StatusSelect
            item={{ title, status: (item.status ?? 'not_started') as ProgressStatus }}
            onChange={(_row, status) => onStatusChange(item, status)}
            pending={pending}
          />
        </span>
      )}
    </div>
  );
}
