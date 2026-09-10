'use client';

/**
 * Assignment popout (R-05) — artboard 04-assignment, ported to the top-nav shell.
 *
 * What it shows: the synced facts, the grade component the item counts toward,
 * the rest of its series, the late and AI policies verbatim, and the planner
 * block Stack owns. What it does NOT show this phase: any score, and any
 * submission/upload block — both arrive with Phase 10's gradebook, and inventing
 * either would break the project's honesty rule.
 *
 * Unknowns read "not recorded" rather than being hidden or filled in.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import { courseCodeFromId, STATUS_LABEL, STATUS_OPTIONS } from '@/lib/queries.today';
import { useCourse, type ProgressStatus } from '@/lib/queries';
import {
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  useAssignment,
  useAssignmentProgress,
  useAssignmentSeries,
  useGradeComponent,
  useGradingScheme,
  useSavePlanner,
  type AssignmentProgress,
  type PlannerPatch,
} from '@/lib/queries.popout';
import { DOW_LABELS, MONTH_LABELS, parseDateOnly } from '@/components/tracker/anchor';
import styles from './Popout.module.css';

const NOT_RECORDED = 'not recorded';

/** 'YYYY-MM-DD' → "Wed · Sep 23". */
function formatDate(iso: string | null): string {
  if (!iso) return NOT_RECORDED;
  const d = parseDateOnly(iso);
  return `${DOW_LABELS[d.getDay()]} · ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * A status label. The view types `status` loosely (string | null), so an
 * unrecognised value is shown as itself rather than swallowed.
 */
function statusText(status: string | null | undefined): string {
  const key = status ?? 'not_started';
  return STATUS_LABEL[key as ProgressStatus] ?? key.replace(/_/g, ' ');
}

/** A timestamp's clock part, or '' when there is none. */
function formatClock(dueAt: string | null): string {
  if (!dueAt) return '';
  const at = new Date(dueAt);
  if (!Number.isFinite(at.getTime())) return '';
  return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** The planner fields, as the form holds them (empty string = cleared). */
interface PlannerForm {
  planned_start: string;
  planned_finish: string;
  est_minutes: string;
  notes: string;
}

const EMPTY_FORM: PlannerForm = {
  planned_start: '',
  planned_finish: '',
  est_minutes: '',
  notes: '',
};

function formFrom(progress: AssignmentProgress | null | undefined): PlannerForm {
  if (!progress) return EMPTY_FORM;
  return {
    planned_start: progress.planned_start ?? '',
    planned_finish: progress.planned_finish ?? '',
    est_minutes: progress.est_minutes == null ? '' : String(progress.est_minutes),
    notes: progress.notes ?? '',
  };
}

export function AssignmentPopout({ assignmentId }: { assignmentId: string }) {
  const assignmentQ = useAssignment(assignmentId);
  const progressQ = useAssignmentProgress(assignmentId);
  const assignment = assignmentQ.data ?? null;
  const courseId = assignment?.course_id;

  const courseQ = useCourse(courseId ?? '');
  const componentQ = useGradeComponent(assignment?.component_id);
  const schemeQ = useGradingScheme(courseId);
  const seriesQ = useAssignmentSeries(courseId, assignment?.series_key);
  const save = useSavePlanner();

  const [form, setForm] = useState<PlannerForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed the form once the row lands, and again if the popout switches items.
  useEffect(() => {
    setForm(formFrom(progressQ.data));
    setSaveError(null);
  }, [assignmentId, progressQ.data]);

  const progress = progressQ.data ?? null;
  const status = progress?.status ?? 'not_started';
  const priority = progress?.priority ?? 'normal';

  function commit(patch: PlannerPatch) {
    setSaveError(null);
    save.mutate(
      { assignmentId, patch },
      { onError: (error) => setSaveError(error instanceof Error ? error.message : 'Save failed.') },
    );
  }

  /** Send a field only when it actually changed, so a blur is not a write. */
  function commitField<K extends keyof PlannerForm>(key: K, current: string) {
    const saved = formFrom(progress)[key];
    if (current === saved) return;
    if (key === 'est_minutes') {
      commit({ est_minutes: current === '' ? null : Number(current) });
      return;
    }
    if (key === 'notes') {
      commit({ notes: current });
      return;
    }
    commit({ [key]: current === '' ? null : current } as PlannerPatch);
  }

  if (assignmentQ.isPending) {
    return <p className={styles.state}>Loading assignment…</p>;
  }
  if (assignmentQ.isError) {
    return (
      <p className={styles.problem} role="alert">
        Could not load this assignment: {(assignmentQ.error as Error).message}
      </p>
    );
  }
  if (!assignment) {
    return <p className={styles.state}>No assignment with id {assignmentId}.</p>;
  }

  const component = componentQ.data ?? null;
  const scheme = schemeQ.data ?? null;
  const series = seriesQ.data ?? [];
  const course = courseQ.data ?? null;
  const clock = formatClock(assignment.due_at);
  const pending = save.isPending;

  return (
    <>
      <div className={styles.breadcrumb}>
        <span className={tokens.tagAccent}>{courseCodeFromId(assignment.course_id)}</span>
        {component && <span className={tokens.tagNeutral}>{component.name}</span>}
        {assignment.sequence_no != null && (
          <span className={tokens.mono}>#{assignment.sequence_no}</span>
        )}
        {assignment.confidence !== 'confirmed' && (
          <span className={tokens.tagOutline}>{assignment.confidence}</span>
        )}
      </div>

      <div>
        <h2 className={styles.title}>{assignment.title}</h2>
        <div className={styles.subTitle}>
          <span>{assignment.type.replace(/_/g, ' ')}</span>
          {assignment.is_group && <span>· group work</span>}
          {assignment.is_extra_credit && <span>· extra credit</span>}
        </div>
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={tokens.kicker}>Due</span>
          <span className={styles.factValue}>
            {assignment.due_date ? formatDate(assignment.due_date) : NOT_RECORDED}
          </span>
          <span className={styles.factNote}>
            {clock || assignment.due_rule || 'time not recorded'}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={tokens.kicker}>Points</span>
          <span className={styles.factValue}>
            {assignment.points_possible == null ? NOT_RECORDED : assignment.points_possible}
          </span>
          <span className={styles.factNote}>
            {component
              ? `${component.name}${component.points != null ? ` · ${component.points} pts` : ''}${
                  component.weight_pct != null ? ` · ${component.weight_pct}% of the grade` : ''
                }`
              : 'no grade component recorded'}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={tokens.kicker}>Source</span>
          <span className={styles.factValue}>{assignment.source.replace(/_/g, ' ')}</span>
          <span className={styles.factNote}>{assignment.source_ref ?? NOT_RECORDED}</span>
        </div>
      </div>

      <section className={styles.block}>
        <span className={tokens.kicker}>Instructions</span>
        {assignment.description ? (
          <p className={styles.prose}>{assignment.description}</p>
        ) : (
          <p className={styles.missing}>No description was captured for this item.</p>
        )}
      </section>

      {assignment.series_key && series.length > 1 && (
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <span className={tokens.kicker}>Series · {assignment.series_key}</span>
            <span className={styles.footerNote}>{series.length} items</span>
          </div>
          <div className={styles.series}>
            {series.map((sibling) => (
              <div
                key={`${sibling.item_kind}:${sibling.item_id}`}
                className={
                  sibling.item_id === assignmentId
                    ? `${styles.seriesItem} ${styles.seriesItemCurrent}`
                    : styles.seriesItem
                }
              >
                <span className={styles.seriesTitle}>{sibling.title}</span>
                <span className={styles.seriesMeta}>
                  {sibling.due_on ? formatDate(sibling.due_on) : 'no date'} ·{' '}
                  {statusText(sibling.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.block}>
        <span className={tokens.kicker}>Late policy</span>
        {scheme?.late_policy ? (
          <p className={styles.prose}>{scheme.late_policy}</p>
        ) : (
          <p className={styles.missing}>No late policy is recorded for this course.</p>
        )}
      </section>

      <section className={styles.block}>
        <span className={tokens.kicker}>AI policy</span>
        {scheme?.ai_policy ? (
          <p className={styles.prose}>{scheme.ai_policy}</p>
        ) : (
          <p className={styles.missing}>No AI policy is recorded for this course.</p>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <span className={tokens.kicker}>Your plan</span>
          <span className={styles.footerNote}>
            assignment_progress · yours, never overwritten by a sync
          </span>
          <span className={styles.saveState}>
            {pending ? 'saving…' : progress ? 'saved' : 'not planned yet'}
          </span>
        </div>

        {saveError && (
          <p className={styles.saveError} role="alert">
            {saveError}
          </p>
        )}

        <div className={styles.planner}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Status</span>
            <select
              className={styles.control}
              value={status}
              disabled={pending}
              onChange={(e) => commit({ status: e.target.value as AssignmentProgress['status'] })}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABEL[option]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Priority</span>
            <select
              className={styles.control}
              value={priority}
              disabled={pending}
              onChange={(e) =>
                commit({ priority: e.target.value as AssignmentProgress['priority'] })
              }
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {PRIORITY_LABEL[option]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Planned start</span>
            <input
              className={styles.control}
              type="date"
              value={form.planned_start}
              disabled={pending}
              onChange={(e) => setForm((f) => ({ ...f, planned_start: e.target.value }))}
              onBlur={(e) => commitField('planned_start', e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Planned finish</span>
            <input
              className={styles.control}
              type="date"
              value={form.planned_finish}
              disabled={pending}
              onChange={(e) => setForm((f) => ({ ...f, planned_finish: e.target.value }))}
              onBlur={(e) => commitField('planned_finish', e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Estimate (minutes)</span>
            <input
              className={styles.control}
              type="number"
              min={0}
              step={5}
              inputMode="numeric"
              value={form.est_minutes}
              disabled={pending}
              onChange={(e) => setForm((f) => ({ ...f, est_minutes: e.target.value }))}
              onBlur={(e) => commitField('est_minutes', e.target.value)}
            />
          </label>

          <label className={`${styles.field} ${styles.plannerWide}`}>
            <span className={styles.fieldLabel}>Notes</span>
            <textarea
              className={styles.textArea}
              value={form.notes}
              disabled={pending}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              onBlur={(e) => commitField('notes', e.target.value)}
            />
          </label>
        </div>
      </section>

      <div className={styles.footer}>
        <span className={styles.footerNote}>
          Scores and submission status arrive with the gradebook (Phase 10).
        </span>
        <span className={styles.footerLinks}>
          <Link className={tokens.btnGhost} href={`/course/${assignment.course_id}/grades`}>
            Grades →
          </Link>
          {course?.bb_url ? (
            <a
              className={tokens.btnSecondary}
              href={course.bb_url}
              target="_blank"
              rel="noreferrer"
              title="Course-level link — Blackboard has no stable per-item URL here."
            >
              Open in Blackboard ↗ <span className={styles.footerNote}>(course)</span>
            </a>
          ) : (
            <span className={styles.footerNote}>No Blackboard link recorded for this course.</span>
          )}
        </span>
      </div>
    </>
  );
}
