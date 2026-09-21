'use client';

/**
 * "Your plan" — the one editable block of the assignment detail (R-05).
 *
 * Split out of `AssignmentPopout.tsx` in Phase 12b (T-2) so the popout and the
 * full-details page under the course render the same block rather than two
 * copies of it. Everything here writes `assignment_progress`, which is Stack's
 * own row and is never overwritten by a sync.
 */

import { useEffect, useRef, useState } from 'react';
import tokens from '@/styles/tokens.module.css';
import { StatusOptions } from '@/components/tracker/StatusSelect';
import type { ProgressStatus } from '@/lib/queries';
import {
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  useSavePlanner,
  type AssignmentProgress,
  type PlannerPatch,
} from '@/lib/queries.popout';
import { isQueryUnresolved, queryStateText, type QueryLike } from '@/components/shared/QueryState';
import styles from './Popout.module.css';

/** The planner fields, as the form holds them (empty string = cleared). */
export interface PlannerForm {
  planned_start: string;
  planned_finish: string;
  est_minutes: string;
  notes: string;
}

export const EMPTY_FORM: PlannerForm = {
  planned_start: '',
  planned_finish: '',
  est_minutes: '',
  notes: '',
};

export function formFrom(progress: AssignmentProgress | null | undefined): PlannerForm {
  if (!progress) return EMPTY_FORM;
  return {
    planned_start: progress.planned_start ?? '',
    planned_finish: progress.planned_finish ?? '',
    est_minutes: progress.est_minutes == null ? '' : String(progress.est_minutes),
    notes: progress.notes ?? '',
  };
}

const PLANNER_FIELDS = ['planned_start', 'planned_finish', 'est_minutes', 'notes'] as const;

/**
 * Take the server's values for every field the owner has not touched since
 * their last commit, and keep the owner's text for the ones they have.
 *
 * Returns `current` itself when nothing moved, so a refetch that changes
 * nothing does not re-render the form.
 */
export function mergePlannerForm(
  current: PlannerForm,
  server: PlannerForm,
  dirtyFields: ReadonlySet<keyof PlannerForm>,
): PlannerForm {
  let changed = false;
  const merged: PlannerForm = { ...current };
  for (const key of PLANNER_FIELDS) {
    if (dirtyFields.has(key)) continue;
    if (merged[key] === server[key]) continue;
    merged[key] = server[key];
    changed = true;
  }
  return changed ? merged : current;
}

/** What the block needs of the `assignment_progress` query. */
export interface ProgressQuery extends QueryLike {
  data: AssignmentProgress | null | undefined;
}

export function AssignmentPlannerBlock({
  assignmentId,
  progressQ,
}: {
  assignmentId: string;
  progressQ: ProgressQuery;
}) {
  const save = useSavePlanner();

  const [form, setForm] = useState<PlannerForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Fields edited since their last successful commit — the server may not overwrite these. */
  const dirtyFields = useRef<Set<keyof PlannerForm>>(new Set());
  const seededFor = useRef<string | null>(null);

  /**
   * Seed the form when the block switches items, and afterwards merge the
   * server's values only into fields nobody is typing in.
   *
   * Replacing the whole form on every `progressQ.data` identity change wiped
   * whatever was being typed: a blur commit invalidates the row, the refetch
   * returns a new object, and the effect ran again with it.
   */
  useEffect(() => {
    if (seededFor.current !== assignmentId) {
      seededFor.current = assignmentId;
      dirtyFields.current = new Set();
      setForm(formFrom(progressQ.data));
      setSaveError(null);
      return;
    }
    const server = formFrom(progressQ.data);
    setForm((current) => mergePlannerForm(current, server, dirtyFields.current));
  }, [assignmentId, progressQ.data]);

  /** Record that the owner has changed a field, then hold the new text. */
  function editField<K extends keyof PlannerForm>(key: K, value: string) {
    dirtyFields.current.add(key);
    setForm((f) => ({ ...f, [key]: value }));
  }

  const progress = progressQ.data ?? null;
  const status = progress?.status ?? 'not_started';
  const priority = progress?.priority ?? 'normal';

  function commit(patch: PlannerPatch, onSaved?: () => void) {
    setSaveError(null);
    save.mutate(
      { assignmentId, patch },
      {
        onSuccess: () => onSaved?.(),
        onError: (error) => setSaveError(error instanceof Error ? error.message : 'Save failed.'),
      },
    );
  }

  /**
   * Send a field only when it actually changed, so a blur is not a write. The
   * field stops being dirty once the write has landed — until then the server's
   * copy is the stale one and must not be merged back over it.
   */
  function commitField<K extends keyof PlannerForm>(key: K, current: string) {
    const saved = formFrom(progress)[key];
    if (current === saved) {
      dirtyFields.current.delete(key);
      return;
    }
    const settle = () => dirtyFields.current.delete(key);
    if (key === 'est_minutes') {
      commit({ est_minutes: current === '' ? null : Number(current) }, settle);
      return;
    }
    if (key === 'notes') {
      commit({ notes: current }, settle);
      return;
    }
    commit({ [key]: current === '' ? null : current } as PlannerPatch, settle);
  }

  // The planner block is the owner's own row. Until it has actually been read
  // there is nothing to edit: an enabled empty form would invite a write that
  // silently replaces planner state the screen never managed to load.
  const plannerUnavailable = isQueryUnresolved(progressQ);
  const pending = save.isPending;
  const controlsDisabled = pending || plannerUnavailable;

  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <span className={tokens.kicker}>Your plan</span>
        <span className={styles.footerNote}>
          assignment_progress · yours, never overwritten by a sync
        </span>
        <span className={styles.saveState}>
          {pending
            ? 'saving…'
            : (queryStateText(progressQ, 'your plan') ?? (progress ? 'saved' : 'not planned yet'))}
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
            disabled={controlsDisabled}
            onChange={(e) => commit({ status: e.target.value as AssignmentProgress['status'] })}
          >
            <StatusOptions value={status as ProgressStatus} />
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Priority</span>
          <select
            className={styles.control}
            value={priority}
            disabled={controlsDisabled}
            onChange={(e) => commit({ priority: e.target.value as AssignmentProgress['priority'] })}
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
            disabled={controlsDisabled}
            onChange={(e) => editField('planned_start', e.target.value)}
            onBlur={(e) => commitField('planned_start', e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Planned finish</span>
          <input
            className={styles.control}
            type="date"
            value={form.planned_finish}
            disabled={controlsDisabled}
            onChange={(e) => editField('planned_finish', e.target.value)}
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
            disabled={controlsDisabled}
            onChange={(e) => editField('est_minutes', e.target.value)}
            onBlur={(e) => commitField('est_minutes', e.target.value)}
          />
        </label>

        <label className={`${styles.field} ${styles.plannerWide}`}>
          <span className={styles.fieldLabel}>Notes</span>
          <textarea
            className={styles.textArea}
            value={form.notes}
            disabled={controlsDisabled}
            onChange={(e) => editField('notes', e.target.value)}
            onBlur={(e) => commitField('notes', e.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
