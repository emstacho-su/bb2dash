'use client';

/**
 * The assignment popout's submission block (Phase 10a, R-17/R-18).
 *
 * What it shows: Blackboard's submission status verbatim, when the last attempt
 * was submitted, which attempt this is of how many, the attempts Blackboard
 * recorded, the file(s) actually submitted (pulled back into the library by the
 * sync), and the files Stack has staged here ready to attach.
 *
 * Phase 12b (G-5, P-grades-8 / P-grades-9) adds two things that used to sit on
 * the gradebook row: the instructor's feedback, in full and as text, and the
 * score history for this assignment's column. This is where Stack opens an
 * item, so this is where the words about it belong.
 *
 * What it deliberately does NOT show:
 *   - any score. The popout is about the work, not the mark (Requirements §6.2
 *     #4, Stack's answer 6); the gradebook table is where a score lives. The
 *     score *history* is a different thing — it is the record of a mark
 *     changing between syncs, and it only renders behind a disclosure.
 *   - the confirmation/receipt number. It is captured in `bb_attempts.receipt`
 *     because Blackboard hands it over, but it tells Stack nothing he acts on
 *     (answer 1), so nothing renders it.
 *
 * A staged file whose bytes match a pulled-back copy stays in the list with a
 * "matches" chip rather than disappearing (answer 4) — the point of the chip is
 * to prove the copy on file is the copy that went in.
 */

import {
  SHA_LABEL,
  STAGED_LABEL,
  attemptsAllowed,
  attemptsText,
  compareSha,
  formatSeenAt,
  hasFeedback,
  submissionLabel,
  submissionOrigin,
  useAssignmentAttempts,
  useAssignmentGrade,
  useAssignmentHistory,
  useSubmissionFiles,
  type SubmissionFile,
} from '@/lib/queries.grades';
import { fileTypeChip, formatBytes } from '@/lib/queries.materials';
import { FileOpenAction } from '@/components/materials/FileOpenAction';
import { ScoreHistory } from '@/components/grades/ScoreHistory';
import { UploadDropZone } from '@/components/grades/UploadDropZone';
import { QueryState, isQueryUnresolved } from '@/components/shared/QueryState';
import tokens from '@/styles/tokens.module.css';
import styles from './SubmissionBlock.module.css';

/** The first eight hex characters, enough to eyeball two copies apart. */
export function shortSha(sha: string | null | undefined): string | null {
  if (typeof sha !== 'string' || sha.trim() === '') return null;
  return sha.trim().slice(0, 8);
}

function FileRow({
  file,
  blackboardUrl,
  submittedShas,
}: {
  file: SubmissionFile;
  blackboardUrl: string | null;
  /** Every sha we hold for a copy that actually reached Blackboard. */
  submittedShas: (string | null)[];
}) {
  const origin = submissionOrigin(file);
  const chip = fileTypeChip(file.mime_type, file.file_name);
  const sha = shortSha(file.sha256);
  const comparison = origin === 'staged' ? compareSha(file.sha256, submittedShas) : null;

  return (
    <div className={styles.fileRow}>
      <span className={styles.chip} aria-hidden="true">
        {chip}
      </span>
      <span className={styles.fileMain}>
        <span className={styles.fileName}>{file.file_name}</span>
        <span className={styles.fileMeta}>
          {formatBytes(file.bytes)}
          {sha && <span className={tokens.mono}> · sha {sha}</span>}
        </span>
        {origin === 'staged' &&
          (blackboardUrl ? (
            <a
              className={styles.stagedLink}
              href={blackboardUrl}
              target="_blank"
              rel="noreferrer"
              title="bb2dash cannot submit for you — open Blackboard and attach it there."
            >
              {STAGED_LABEL}
            </a>
          ) : (
            <span className={styles.stagedLink}>{STAGED_LABEL}</span>
          ))}
      </span>

      {origin === 'pulled_back' && (
        <span className={tokens.tagAccent} title="Pulled back out of Blackboard by a sync.">
          submitted copy
        </span>
      )}
      {comparison && (
        <span
          className={comparison === 'matches' ? tokens.tagAccent : tokens.tagNeutral}
          title="sha256 of the staged bytes against the copy Blackboard holds."
        >
          {SHA_LABEL[comparison]}
        </span>
      )}

      <FileOpenAction routes={file} blackboardUrl={blackboardUrl} />
    </div>
  );
}

export function SubmissionBlock({
  assignmentId,
  courseId,
  blackboardUrl = null,
}: {
  assignmentId: string;
  courseId: string | undefined;
  blackboardUrl?: string | null;
}) {
  const gradeQ = useAssignmentGrade(assignmentId);
  const attemptsQ = useAssignmentAttempts(assignmentId);
  const filesQ = useSubmissionFiles(assignmentId);

  const grade = gradeQ.data ?? null;
  const attempts = attemptsQ.data ?? [];
  const files = filesQ.data ?? [];

  // The shell the column lives in. `v_assignment_grade` carries it; the prop is
  // the fallback for a popout opened before that read lands.
  const historyQ = useAssignmentHistory(grade?.course_id ?? courseId, grade?.column_id);
  const history = historyQ.data ?? [];

  const submission = submissionLabel(grade?.submission_status, grade?.last_attempt_status);
  const latest = attempts.length > 0 ? attempts[attempts.length - 1] : null;
  // The view already encodes the ceiling (055); a gradebook row on its own
  // splits it across two columns, which is what `attemptsAllowed` reconciles.
  const allowed =
    latest?.attempts_allowed ?? attemptsAllowed(grade?.multiple_attempts, grade?.attempts_left);
  const attemptCount = latest?.attempt_no ?? attempts.length;

  const pulledBack = files.filter((file) => submissionOrigin(file) === 'pulled_back');
  const staged = files.filter((file) => submissionOrigin(file) === 'staged');
  const submittedShas = pulledBack.map((file) => file.sha256);

  return (
    <section className={styles.block} aria-label="Submission">
      <div className={styles.head}>
        <span className={tokens.kicker}>Submission</span>
        <span className={styles.note}>
          Blackboard&rsquo;s record — bb2dash never submits anything
        </span>
      </div>

      {isQueryUnresolved(gradeQ) ? (
        <QueryState query={gradeQ} of="the submission status" className={styles.note} />
      ) : grade ? (
        <div className={styles.statusRow}>
          <span
            className={tokens.tagNeutral}
            title={submission.status ?? 'Blackboard recorded no submission status.'}
          >
            {submission.text}
          </span>
          {submission.attemptStatus && (
            <span className={styles.note}>last attempt: {submission.attemptStatus}</span>
          )}
          {grade.last_attempt_submitted && (
            <span className={styles.note}>
              submitted {formatSeenAt(grade.last_attempt_submitted)}
            </span>
          )}
          {attemptCount > 0 && (
            <span className={tokens.tagOutline}>{attemptsText(attemptCount, allowed)}</span>
          )}
          <span className={tokens.mono} title="When a Blackboard sync last saw this.">
            seen {formatSeenAt(grade.seen_at)}
          </span>
        </div>
      ) : (
        <p className={styles.note}>
          No gradebook column is linked to this assignment yet, so Blackboard has told us nothing
          about its submission.
        </p>
      )}

      {/* P-grades-9: the instructor's own words, in full. React escapes them;
          `white-space: pre-wrap` keeps their line breaks. */}
      {hasFeedback(grade?.feedback) && (
        <div className={styles.feedback}>
          <span className={tokens.kicker}>Feedback</span>
          <p className={styles.feedbackText}>{grade?.feedback}</p>
        </div>
      )}

      {/* P-grades-8: how this column's score moved across syncs. `ScoreHistory`
          renders nothing when there are fewer than two observations. */}
      {historyQ.isError ? (
        <QueryState query={historyQ} of="the score history" className={styles.note} />
      ) : (
        <ScoreHistory rows={history} label={grade?.name ?? 'this item'} />
      )}

      {isQueryUnresolved(attemptsQ) ? (
        <QueryState query={attemptsQ} of="the attempts" className={styles.note} />
      ) : (
        attempts.length > 0 && (
          <ul className={styles.attempts}>
            {attempts.map((attempt) => (
              <li key={attempt.attempt_id} className={styles.attempt}>
                <span className={styles.attemptNo}>
                  {attemptsText(attempt.attempt_no, attempt.attempts_allowed ?? allowed)}
                </span>
                <span className={tokens.tagNeutral}>{attempt.status ?? '—'}</span>
                <span className={styles.note}>
                  {attempt.submitted_bb
                    ? `submitted ${formatSeenAt(attempt.submitted_bb)}`
                    : 'not submitted'}
                </span>
              </li>
            ))}
          </ul>
        )
      )}

      {isQueryUnresolved(filesQ) ? (
        <QueryState query={filesQ} of="the submission files" className={styles.note} />
      ) : files.length > 0 ? (
        <div className={styles.files}>
          {pulledBack.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              blackboardUrl={blackboardUrl}
              submittedShas={submittedShas}
            />
          ))}
          {staged.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              blackboardUrl={blackboardUrl}
              submittedShas={submittedShas}
            />
          ))}
        </div>
      ) : (
        <p className={styles.note}>No submission files have been recorded for this assignment.</p>
      )}

      {courseId && (
        <UploadDropZone courseId={courseId} assignmentId={assignmentId} label="Stage a file" />
      )}
    </section>
  );
}
