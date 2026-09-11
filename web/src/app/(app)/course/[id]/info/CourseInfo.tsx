'use client';

/**
 * Course Info (Phase 8, T-05 / R-04).
 *
 * Sections in the order the contract fixes them: Staff · Meetings · Policies ·
 * Syllabus · Groups · Card note · Blackboard link.
 *
 * Two rules run through the whole pane. Nothing is blank: a field with no value
 * reads "not recorded", so a missing office hour is visibly missing rather than
 * looking like a rendering bug. And nothing synced is paraphrased: the AI and
 * late policies, and the group notes, are printed exactly as they were
 * recorded. The one writable thing here is the card note.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CARD_NOTE_MAX_LENGTH,
  meetingPatterns,
  normalizeCardNote,
  orNotRecorded,
  validateCardNote,
  realRoomDispute,
  useCourseDisplay,
  useCourseGradingScheme,
  useCourseShells,
  useCourseStaff,
  useUpdateCardNote,
  type CourseStaff,
} from '@/lib/queries.course';
import { fileTitle, useCurrentFiles, type BbFileRow } from '@/lib/queries.materials';
import { OpenStoredButton } from '@/components/materials/OpenStoredButton';
import tokens from '@/styles/tokens.module.css';
import styles from './CourseInfo.module.css';

/** The caption the contract requires on the Groups section, verbatim. */
const GROUPS_CAPTION = 'as recorded; Blackboard disagrees for IST 466 — unresolved';

/* -- sections -------------------------------------------------------------- */

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${tokens.cardLg} ${styles.section}`} aria-label={title}>
      <div className={styles.sectionHead}>
        <span className={tokens.kicker}>{title}</span>
        {caption && <span className={styles.caption}>{caption}</span>}
      </div>
      {children}
    </section>
  );
}

/** One staff member. Every field that is missing says so rather than vanishing. */
export function StaffRow({ person }: { person: CourseStaff }) {
  const fields: { label: string; value: string }[] = [
    { label: 'Role', value: orNotRecorded(person.role) },
    { label: 'Email', value: orNotRecorded(person.email) },
    { label: 'Office', value: orNotRecorded(person.office) },
    { label: 'Office hours', value: orNotRecorded(person.office_hours) },
  ];

  return (
    <div className={styles.staffRow}>
      <span className={styles.staffName}>{orNotRecorded(person.name)}</span>
      <dl className={styles.fields}>
        {fields.map((field) => (
          <div key={field.label} className={styles.field}>
            <dt className={styles.fieldLabel}>{field.label}</dt>
            <dd className={styles.fieldValue}>{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The card note: one line of plain text, saved on blur.
 *
 * Three rules, each one a bug that was here:
 *
 *   - The draft is re-seeded only when `stored` actually changes, and only
 *     while the owner is neither typing nor waiting on a save. Re-seeding on
 *     every render of the still-old prop put the previous note back under the
 *     cursor the moment the save started.
 *   - An edit-free blur writes nothing. Blur alone is not an edit, and the
 *     round trip it used to cause could shorten a perfectly legal stored note.
 *   - A failed save keeps the draft. The typed text is the only copy of it;
 *     the error says what happened and the field stays editable for a retry.
 */
export function CardNoteField({
  courseId,
  stored,
  disabled,
}: {
  courseId: string;
  stored: string | null;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(stored ?? '');
  const [dirty, setDirty] = useState(false);
  const [tooLong, setTooLong] = useState<string | null>(null);
  const save = useUpdateCardNote();
  const seeded = useRef(stored);

  useEffect(() => {
    if (seeded.current === stored) return;
    seeded.current = stored;
    if (dirty || save.isPending) return;
    setDraft(stored ?? '');
  }, [stored, dirty, save.isPending]);

  function commit() {
    if (!dirty) return;

    let next: string | null;
    try {
      next = validateCardNote(draft);
    } catch (error) {
      // Keep the draft and stay dirty: the owner decides what to cut.
      setTooLong(error instanceof Error ? error.message : 'That note cannot be saved.');
      return;
    }
    setTooLong(null);

    // Normalized-to-normalized: whitespace the owner did not mean is not an edit.
    if (next === normalizeCardNote(stored)) {
      setDirty(false);
      setDraft(next ?? '');
      return;
    }

    save.mutate(
      { courseId, note: next },
      {
        onSuccess: (savedValue) => {
          setDirty(false);
          setDraft(savedValue ?? '');
        },
      },
    );
  }

  const remaining = CARD_NOTE_MAX_LENGTH - draft.length;
  const problem = tooLong ?? (save.isError ? `Could not save the note: ${save.error.message}` : null);

  return (
    <div className={styles.note}>
      <label className={styles.noteLabel} htmlFor="course-card-note">
        Shown on this course&apos;s card on Home. Plain text, one line.
      </label>
      <input
        id="course-card-note"
        className={tokens.input}
        type="text"
        value={draft}
        maxLength={CARD_NOTE_MAX_LENGTH}
        disabled={disabled || save.isPending}
        placeholder="No note yet"
        onChange={(e) => {
          setDirty(true);
          setTooLong(null);
          setDraft(e.target.value);
        }}
        onBlur={commit}
      />
      <span className={styles.noteMeta}>
        {save.isPending ? 'saving…' : `${remaining} character${remaining === 1 ? '' : 's'} left`}
      </span>
      {problem && (
        <span className={styles.noteError} role="alert">
          {problem}
        </span>
      )}
    </div>
  );
}

/* -- the screen ------------------------------------------------------------ */

export function CourseInfo({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);

  // One cache of `courses` rows carries the locations, the group notes and the
  // card note — they are all columns of the same shell.
  const shellsQ = useCourseShells(shellIds);
  const staffQ = useCourseStaff(shellIds);
  const schemeQ = useCourseGradingScheme(shellIds);
  const filesQ = useCurrentFiles();

  const course = display.data ?? null;
  const patterns = course ? meetingPatterns(course.meetings) : [];
  const disputed =
    course && shellsQ.data
      ? realRoomDispute(course.room_disputed, course.meetings, shellsQ.data.map((s) => s.location))
      : false;

  /** The syllabus file(s) this course has on file, if any. */
  const syllabus = useMemo<BbFileRow[]>(
    () =>
      (filesQ.data ?? []).filter(
        (file) =>
          file.course_id != null &&
          shellIds.includes(file.course_id) &&
          file.bucket === 'syllabus_policy',
      ),
    [filesQ.data, shellIds],
  );

  /**
   * `group_notes` is recorded per shell; show every shell that has one so a
   * merged course does not silently drop the recitation's note.
   */
  const groupNotes = (shellsQ.data ?? []).filter((row) => (row.group_notes ?? '').trim() !== '');

  // The card note is written on the display course's parent shell — the same row
  // `v_course_display` reads it from for the Home card.
  const noteShellId = course?.display_id ?? null;
  const storedNote =
    (shellsQ.data ?? []).find((row) => row.id === noteShellId)?.card_note ?? null;

  if (display.isPending) return <p className={styles.state}>Loading course…</p>;
  if (display.isError) return <p className={styles.state}>Could not load this course.</p>;
  if (!course) return <p className={styles.state}>No course with id {courseId}.</p>;

  const scheme = schemeQ.data ?? null;
  const letterScale = scheme?.letter_scale ?? null;

  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{course.code} — Info</h1>

      <Section title="Staff">
        {staffQ.isPending && <p className={styles.state}>loading…</p>}
        {staffQ.isError && (
          <p className={styles.state} role="alert">
            Could not load staff: {staffQ.error.message}
          </p>
        )}
        {!staffQ.isPending && (staffQ.data?.length ?? 0) === 0 && (
          <p className={styles.state}>No staff are recorded for this course.</p>
        )}
        {(staffQ.data ?? []).map((person) => (
          <StaffRow key={person.id} person={person} />
        ))}
      </Section>

      <Section title="Meetings">
        {patterns.length > 0 ? (
          <ul className={styles.list}>
            {patterns.map((p, i) => (
              <li key={i} className={styles.listItem}>
                <span className={tokens.mono}>{p.days}</span> {p.time}
                <span className={styles.room}> · {orNotRecorded(p.room)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.state}>No scheduled meetings are recorded.</p>
        )}
        {disputed && (
          <p className={styles.dispute}>
            ⚠ room disputed — the meeting room differs from the room on file. Confirm before you go.
          </p>
        )}
      </Section>

      <Section title="Policies">
        <div className={styles.policy}>
          <span className={styles.policyLabel}>AI policy</span>
          {scheme?.ai_policy ? (
            <p className={styles.verbatim}>{scheme.ai_policy}</p>
          ) : (
            <p className={styles.state}>not recorded</p>
          )}
        </div>
        <div className={styles.policy}>
          <span className={styles.policyLabel}>Late policy</span>
          {scheme?.late_policy ? (
            <p className={styles.verbatim}>{scheme.late_policy}</p>
          ) : (
            <p className={styles.state}>not recorded</p>
          )}
        </div>
        {letterScale && typeof letterScale === 'object' && !Array.isArray(letterScale) && (
          <div className={styles.policy}>
            <span className={styles.policyLabel}>Letter scale</span>
            <dl className={styles.fields}>
              {Object.entries(letterScale as Record<string, unknown>).map(([grade, cutoff]) => (
                <div key={grade} className={styles.field}>
                  <dt className={styles.fieldLabel}>{grade}</dt>
                  <dd className={styles.fieldValue}>{String(cutoff)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Section>

      <Section title="Syllabus">
        {filesQ.isPending && <p className={styles.state}>loading…</p>}
        {!filesQ.isPending && syllabus.length === 0 && (
          <p className={styles.state}>No syllabus file has been pulled for this course.</p>
        )}
        {syllabus.map((file) => (
          <div key={file.id} className={styles.fileRow}>
            <span className={styles.fileName}>{fileTitle(file)}</span>
            {file.storage_path ? (
              <OpenStoredButton storagePath={file.storage_path} className={tokens.btnPrimary} />
            ) : file.source_url ? (
              <a className={tokens.btnPrimary} href={file.source_url} target="_blank" rel="noreferrer">
                Open ↗
              </a>
            ) : (
              <button type="button" className={tokens.btnSecondary} disabled>
                No route
              </button>
            )}
          </div>
        ))}
      </Section>

      <Section title="Groups" caption={GROUPS_CAPTION}>
        {shellsQ.isPending && <p className={styles.state}>loading…</p>}
        {!shellsQ.isPending && groupNotes.length === 0 && (
          <p className={styles.state}>No group assignment is recorded for this course.</p>
        )}
        {groupNotes.map((row) => (
          <p key={row.id} className={styles.verbatim}>
            {row.group_notes}
          </p>
        ))}
      </Section>

      <Section title="Card note">
        {shellsQ.isError ? (
          <p className={styles.state} role="alert">
            Could not load the note: {shellsQ.error.message}
          </p>
        ) : (
          <CardNoteField
            courseId={noteShellId ?? courseId}
            stored={storedNote}
            disabled={shellsQ.isPending || !noteShellId}
          />
        )}
      </Section>

      <Section title="Blackboard">
        {course.bb_url ? (
          <a className={tokens.btnSecondary} href={course.bb_url} target="_blank" rel="noreferrer">
            Open this course in Blackboard ↗
          </a>
        ) : (
          <p className={styles.state}>No Blackboard URL is recorded for this course.</p>
        )}
      </Section>
    </div>
  );
}
