'use client';

/**
 * The planner's planner-event state: which event the form is open on, where
 * focus goes back to, every planner-event write, and the grid alert (Phase 11b).
 *
 * WRITES LIVE HERE, NOT IN THE FORM (R2-6). The dialog can close while a save is
 * still in flight (Esc, Cancel, the backdrop). This hook stays mounted with the
 * grid, so the write's outcome still has somewhere to go: a refusal while the
 * dialog is open shows in the dialog; one that lands after it closed shows in
 * the grid alert, and the optimistic block rolls back. Nothing fails silently.
 *
 * THE ALERT (R2-10) carries the last planner-event write that failed outside
 * the dialog — a task tick, or a save whose dialog had closed. It clears on the
 * next successful planner-event write or when dismissed.
 *
 * FOCUS. Closing puts focus back on the opener (K-9: "focus returns to the
 * slot"), explicitly rather than by trusting `document.activeElement` at open
 * time, because some browsers do not focus a button on click.
 *
 * SERIES (T-1). A new event that repeats is written by `planner_series_create`
 * instead of a plain insert. Saving or deleting an occurrence that is still
 * part of a series asks "This event / This and following events / All events"
 * first; the answer picks the write, and "This event" is the ordinary update
 * with `series_detached` (or the ordinary delete). Nothing writes until the
 * question is answered.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useCreatePlannerEvent,
  useDeletePlannerEvent,
  useUpdatePlannerEvent,
} from '@/lib/queries.plannerEvents';
import {
  useCreatePlannerSeries,
  useDeletePlannerSeries,
  usePlannerSeriesRule,
  useUpdatePlannerSeries,
} from '@/lib/queries.plannerSeries';
import type { SeriesScope } from '@/lib/planner-recurrence';
import {
  isSeriesMember,
  seriesIdOf,
  type PlannerEventDraft,
  type PlannerEventRow,
} from '@/lib/planner-events';
import type { EventActions } from './PlannerEventBlock';
import type { PlannerEventFormMode, PlannerEventFormProps } from './PlannerEventForm';
import type { FormSeries } from './planner-event-form-state';
import type {
  PlannerSeriesScopeDialogProps,
  SeriesScopeIntent,
} from './PlannerSeriesScopeDialog';

/** The open dialog: its identity, and the state of the write it started. */
interface Session {
  id: number;
  target: PlannerEventFormMode;
  pending: boolean;
  error: Error | null;
}

/** T-1: the scope question standing between an edit or delete and its write. */
interface ScopeAsk {
  intent: SeriesScopeIntent;
  /** The occurrence the question was asked from. */
  event: PlannerEventRow;
  seriesId: string;
  /** Edit only: what the form wants saved. */
  draft: PlannerEventDraft | null;
  /** The dialog session the answer's write belongs to. */
  sessionId: number;
}

export interface PlannerEventEditor {
  /**
   * Props for the open `PlannerEventForm`, or null when no dialog is open.
   * `sessionId` is its React key, so each open mounts a fresh form.
   */
  form: (PlannerEventFormProps & { sessionId: number }) | null;
  /** Props for the open `PlannerSeriesScopeDialog`, or null (T-1). */
  scope: PlannerSeriesScopeDialogProps | null;
  actions: EventActions;
  /** The grid alert's text, or null. */
  alert: string | null;
  dismissAlert: () => void;
}

/** A thrown value as an Error. PostgREST errors can arrive as plain `{ message }`. */
function asError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const message = (reason as { message?: unknown } | null)?.message;
  return new Error(typeof message === 'string' ? message : String(reason));
}

export function usePlannerEventEditor(): PlannerEventEditor {
  const [session, setSession] = useState<Session | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [pendingDoneId, setPendingDoneId] = useState<string | null>(null);
  const [closeCount, setCloseCount] = useState(0);
  const openSessionRef = useRef<number | null>(null);
  const nextSessionRef = useRef(0);
  const openerRef = useRef<HTMLElement | null>(null);

  const [scopeAsk, setScopeAsk] = useState<ScopeAsk | null>(null);

  const create = useCreatePlannerEvent();
  const update = useUpdatePlannerEvent();
  const remove = useDeletePlannerEvent();
  const createSeries = useCreatePlannerSeries();
  const updateSeries = useUpdatePlannerSeries();
  const deleteSeries = useDeletePlannerSeries();

  // The rule behind the occurrence being edited, for the form's read-only
  // line. Null id while the form is closed or the event does not repeat.
  const editing = session?.target.mode === 'edit' ? session.target.event : null;
  const editingSeriesId = isSeriesMember(editing) ? seriesIdOf(editing) : null;
  const rule = usePlannerSeriesRule(editingSeriesId);

  const open = useCallback((target: PlannerEventFormMode, opener: HTMLElement) => {
    nextSessionRef.current += 1;
    const id = nextSessionRef.current;
    openSessionRef.current = id;
    openerRef.current = opener;
    setSession({ id, target, pending: false, error: null });
  }, []);

  const close = useCallback(() => {
    openSessionRef.current = null;
    setSession(null);
    setScopeAsk(null);
    setCloseCount((count) => count + 1);
  }, []);

  // Runs after the dialog has unmounted (and after its own focus hand-back),
  // so the opener is what ends up focused.
  useEffect(() => {
    if (closeCount === 0) return;
    const opener = openerRef.current;
    if (opener && opener.isConnected) opener.focus();
  }, [closeCount]);

  /** Run a write started from dialog `sessionId`, and route its outcome. */
  const runDialogWrite = (
    sessionId: number,
    failure: string,
    write: () => Promise<unknown>,
  ) => {
    const patchSession = (patch: Partial<Session>) =>
      setSession((current) => (current && current.id === sessionId ? { ...current, ...patch } : current));

    patchSession({ pending: true, error: null });
    write().then(
      () => {
        setAlert(null);
        if (openSessionRef.current === sessionId) close();
      },
      (reason: unknown) => {
        const error = asError(reason);
        if (openSessionRef.current === sessionId) patchSession({ pending: false, error });
        else setAlert(`${failure}: ${error.message}`);
      },
    );
  };

  /** Ask the scope question instead of writing, when the row is in a series. */
  const ask = (intent: SeriesScopeIntent, event: PlannerEventRow, draft: PlannerEventDraft | null) => {
    const seriesId = seriesIdOf(event);
    if (seriesId === null || !isSeriesMember(event) || session === null) return false;
    setScopeAsk({ intent, event, seriesId, draft, sessionId: session.id });
    return true;
  };

  const form: PlannerEventEditor['form'] =
    session === null
      ? null
      : {
          sessionId: session.id,
          target: session.target,
          pending: session.pending,
          error: session.error,
          onClose: close,
          existingRepeat: editingSeriesId
            ? { freq: rule.data?.freq ?? null, until: rule.data?.until ?? null }
            : null,
          onSave: (draft: PlannerEventDraft, series: FormSeries | null) => {
            const target = session.target;
            const failure = `Could not save “${draft.title.trim()}”`;
            if (target.mode === 'create') {
              runDialogWrite(session.id, failure, () =>
                series === null
                  ? create.mutateAsync(draft)
                  : createSeries.mutateAsync({ freq: series.freq, until: series.until, rows: series.rows }),
              );
              return;
            }
            if (ask('edit', target.event, draft)) return;
            runDialogWrite(session.id, failure, () =>
              update.mutateAsync({ current: target.event, patch: draft }),
            );
          },
          onDelete: (event: PlannerEventRow) => {
            if (ask('delete', event, null)) return;
            runDialogWrite(session.id, `Could not delete “${event.title}”`, () =>
              remove.mutateAsync(event),
            );
          },
        };

  /** The answer to the scope question, turned into the write it names. */
  const chooseScope = (askState: ScopeAsk, scope: SeriesScope) => {
    const { intent, event, seriesId, draft, sessionId } = askState;
    setScopeAsk(null);
    if (intent === 'delete') {
      runDialogWrite(sessionId, `Could not delete “${event.title}”`, () =>
        scope === 'this'
          ? remove.mutateAsync(event)
          : deleteSeries.mutateAsync({ seriesId, scope, from: event.starts_at }),
      );
      return;
    }
    if (draft === null) return;
    runDialogWrite(sessionId, `Could not save “${draft.title.trim()}”`, () =>
      // "This event" leaves the series alone and cuts this row out of it.
      scope === 'this'
        ? update.mutateAsync({ current: event, patch: draft, detach: true })
        : updateSeries.mutateAsync({ seriesId, scope, edited: event, draft }),
    );
  };

  const scope: PlannerEventEditor['scope'] =
    scopeAsk === null
      ? null
      : {
          intent: scopeAsk.intent,
          title: scopeAsk.event.title,
          onChoose: (chosen) => chooseScope(scopeAsk, chosen),
          onCancel: () => setScopeAsk(null),
        };

  const actions: EventActions = {
    edit: (event, opener) => open({ mode: 'edit', event }, opener),
    create: (prefill, opener) => open({ mode: 'create', prefill }, opener),
    toggleDone: (event, done) => {
      setPendingDoneId(event.id);
      update
        .mutateAsync({ current: event, patch: { done } })
        .then(
          () => setAlert(null),
          (reason: unknown) =>
            setAlert(`Could not update “${event.title}”: ${asError(reason).message}`),
        )
        .finally(() => setPendingDoneId((id) => (id === event.id ? null : id)));
    },
    pendingDoneId,
  };

  return { form, scope, actions, alert, dismissAlert: () => setAlert(null) };
}
