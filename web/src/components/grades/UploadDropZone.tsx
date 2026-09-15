'use client';

/**
 * Stage a file against an assignment (Phase 10a, R-18).
 *
 * bb2dash cannot submit anything to Blackboard, and this control never pretends
 * otherwise: it puts a copy of the file in the library under `my_submissions`
 * so it is one click away when Stack opens Blackboard to attach it. The word
 * "Submit" appears on no control in this app — a test asserts that over the
 * whole of `web/src`.
 *
 * Everything is validated at the boundary before a byte moves (one file, 50 MB,
 * a usable name), and every failure — validation, Storage, or the `bb_files`
 * insert — is shown here in a `role="alert"`. Nothing is swallowed.
 */

import { useRef, useState } from 'react';
import { useStageUpload, MAX_UPLOAD_BYTES } from '@/lib/queries.grades';
import tokens from '@/styles/tokens.module.css';
import styles from './UploadDropZone.module.css';

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
  }
  return 'The file was not staged.';
}

export function UploadDropZone({
  courseId,
  assignmentId,
  compact = false,
  label = 'Stage a file',
}: {
  courseId: string;
  /** The assignment the file is filed under; null files it at the course root. */
  assignmentId: string | null;
  /** The one-line form used on a Classwork row. */
  compact?: boolean;
  label?: string;
}) {
  const stage = useStageUpload();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<string | null>(null);

  const inputId = `stage-file-${assignmentId ?? courseId}`;

  function send(files: FileList | readonly File[] | null) {
    setError(null);
    setStaged(null);
    stage.mutate(
      { courseId, assignmentId, files },
      {
        onSuccess: (result) => setStaged(result.fileName),
        onError: (failure) => setError(messageOf(failure)),
      },
    );
    if (inputRef.current) inputRef.current.value = '';
  }

  const busy = stage.isPending;
  const megabytes = MAX_UPLOAD_BYTES / (1024 * 1024);

  return (
    <div
      className={compact ? styles.compact : styles.zone}
      data-dragging={dragging ? 'true' : 'false'}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        send(event.dataTransfer?.files ?? null);
      }}
    >
      <label className={compact ? styles.compactLabel : styles.label} htmlFor={inputId}>
        {busy ? 'Staging…' : label}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        className={styles.input}
        type="file"
        disabled={busy}
        onChange={(event) => send(event.target.files)}
      />

      {!compact && (
        <p className={styles.hint}>
          Drop one file here (up to {megabytes} MB). It is filed under this course&rsquo;s
          <span className={tokens.mono}> my_submissions</span> — you still attach it in Blackboard.
        </p>
      )}

      {staged && (
        <p className={styles.done} role="status">
          Staged “{staged}”. Find it in Materials under My submissions.
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
