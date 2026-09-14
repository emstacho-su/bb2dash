'use client';

/**
 * Session popout (R-05) — artboard 03-lecture, ported to the top-nav shell.
 *
 * The course screen's inline SessionPanel content (kind, tentative flag, topic,
 * date, notes) plus the two things the artboard has and the panel dropped: the
 * readings assigned for that date, and the files pinned to the session.
 *
 * A file with stored bytes opens through a signed URL; one that only has a
 * source URL opens that; one recorded on disk only says so rather than
 * offering a link that would fail.
 *
 * "No readings are recorded" and "No files are pinned" are claims about the
 * course, so neither may stand in for a query that is still running or that
 * failed — both sections, and the counts in the sub-title, guard themselves.
 */

import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import { courseCodeFromId } from '@/lib/queries.today';
import { bucketLabel, fileTypeChip, formatBytes } from '@/lib/queries.materials';
import { useSession, useSessionFiles, useSessionReadings } from '@/lib/queries.popout';
import { OpenStoredButton } from '@/components/materials/OpenStoredButton';
import {
  QueryState,
  isQueryLoading,
  isQueryUnresolved,
  type QueryLike,
} from '@/components/shared/QueryState';
import { DOW_LABELS, MONTH_LABELS, parseDateOnly } from '@/components/tracker/anchor';
import styles from './Popout.module.css';

/** 'YYYY-MM-DD' → "Wed · Sep 9". */
function formatDate(iso: string | null): string {
  if (!iso) return 'not recorded';
  const d = parseDateOnly(iso);
  return `${DOW_LABELS[d.getDay()]} · ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * "3 readings" for the sub-title — but a count is a fact, and a query that has
 * not answered supports no fact. "0 readings" is exactly the wrong thing to say
 * about one that is still loading or that failed.
 */
export function countText(query: QueryLike, count: number, noun: string): string {
  if (isQueryLoading(query)) return `${noun}s loading…`;
  if (query.isError) return `${noun}s unavailable`;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function SessionPopout({ sessionId }: { sessionId: number }) {
  const sessionQ = useSession(sessionId);
  const session = sessionQ.data ?? null;

  const readingsQ = useSessionReadings(session?.course_id, session?.session_date);
  const filesQ = useSessionFiles(sessionId);

  if (sessionQ.isPending) {
    return <p className={styles.state}>Loading session…</p>;
  }
  if (sessionQ.isError) {
    return (
      <p className={styles.problem} role="alert">
        Could not load this session: {(sessionQ.error as Error).message}
      </p>
    );
  }
  if (!session) {
    return <p className={styles.state}>No session with id {sessionId}.</p>;
  }

  const readings = readingsQ.data ?? [];
  const files = filesQ.data ?? [];
  const tentative = session.confidence !== 'confirmed';

  return (
    <>
      <div className={styles.breadcrumb}>
        <span className={tokens.tagAccent}>{courseCodeFromId(session.course_id)}</span>
        {session.kind && session.kind !== 'lecture' && (
          <span className={tokens.tagNeutral}>{session.kind.replace(/_/g, ' ')}</span>
        )}
        {session.week_no != null && <span className={tokens.mono}>Week {session.week_no}</span>}
        {tentative && <span className={tokens.tagOutline}>tentative — date/detail inferred</span>}
      </div>

      <div>
        <h2 className={styles.title}>{session.topic ?? 'Untitled session'}</h2>
        <div className={styles.subTitle}>
          <span>{formatDate(session.session_date)}</span>
          <span>·</span>
          <span>{countText(filesQ, files.length, 'material')}</span>
          <span>·</span>
          <span>{countText(readingsQ, readings.length, 'reading')}</span>
        </div>
      </div>

      {session.notes && (
        <section className={styles.block}>
          <span className={tokens.kicker}>Notes</span>
          <p className={styles.prose}>{session.notes}</p>
        </section>
      )}

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <span className={tokens.kicker}>Readings for this date</span>
          <QueryState
            query={readingsQ}
            of="the readings"
            className={styles.footerNote}
            as="span"
          />
        </div>
        {readings.length === 0 && !isQueryUnresolved(readingsQ) ? (
          <p className={styles.missing}>No readings are recorded for {formatDate(session.session_date)}.</p>
        ) : (
          <div className={styles.list}>
            {readings.map((reading) => (
              <div key={reading.id} className={styles.listRow}>
                <span className={tokens.glyphReading} aria-hidden="true">
                  R
                </span>
                <span className={styles.listMain}>
                  <span className={styles.listTitle}>
                    {reading.citation || reading.topic || 'Untitled reading'}
                  </span>
                  <span className={styles.listMeta}>
                    {reading.required ? 'Required' : 'Optional'}
                    {reading.notes ? ` · ${reading.notes}` : ''}
                  </span>
                </span>
                {reading.url && (
                  <a
                    className={tokens.btnSecondary}
                    href={reading.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <span className={tokens.kicker}>Files pinned to this session</span>
          <QueryState query={filesQ} of="the files" className={styles.footerNote} as="span" />
        </div>
        {files.length === 0 && !isQueryUnresolved(filesQ) ? (
          <p className={styles.missing}>No files are pinned to this session.</p>
        ) : (
          <div className={styles.list}>
            {files.map((file) => (
              <div key={file.id} className={styles.listRow}>
                <span className={tokens.tagNeutral} aria-hidden="true">
                  {fileTypeChip(file.mime_type, file.file_name)}
                </span>
                <span className={styles.listMain}>
                  <span className={styles.listTitle}>{file.file_name ?? 'Untitled file'}</span>
                  <span className={styles.listMeta}>
                    {bucketLabel(file.bucket)} · {formatBytes(file.bytes)}
                  </span>
                </span>
                {file.storage_path ? (
                  <OpenStoredButton storagePath={file.storage_path} className={tokens.btnPrimary} />
                ) : file.source_url ? (
                  <a
                    className={tokens.btnSecondary}
                    href={file.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open ↗
                  </a>
                ) : (
                  <span className={styles.footerNote}>
                    {file.local_path ? 'on disk only' : 'no route'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className={styles.footer}>
        <span className={styles.footerNote}>
          Session facts come from the syllabus and the course deck; files come from Blackboard.
        </span>
        <span className={styles.footerLinks}>
          <Link className={tokens.btnGhost} href={`/course/${session.course_id}/classwork`}>
            Open in Classwork →
          </Link>
        </span>
      </div>
    </>
  );
}
