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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useCreatePlannerEvent,
  useDeletePlannerEvent,
  useUpdatePlannerEvent,
} from '@/lib/queries.plannerEvents';
import type { PlannerEventDraft, PlannerEventRow } from '@/lib/planner-events';
import type { EventActions } from './PlannerEventBlock';
import type { PlannerEventFormMode, PlannerEventFormProps } from './PlannerEventForm';

/** The open dialog: its identity, and the state of the write it started. */
interface Session {
  id: number;
  target: PlannerEventFormMode;
  pending: boolean;
  error: Error | null;
}

export interface PlannerEventEditor {
  /**
   * Props for the open `PlannerEventForm`, or null when no dialog is open.
   * `sessionId` is its React key, so each open mounts a fresh form.
   */
  form: (PlannerEventFormProps & { sessionId: number }) | null;
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

  const create = useCreatePlannerEvent();
  const update = useUpdatePlannerEvent();
  const remove = useDeletePlannerEvent();

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

  const form: PlannerEventEditor['form'] =
    session === null
      ? null
      : {
          sessionId: session.id,
          target: session.target,
          pending: session.pending,
          error: session.error,
          onClose: close,
          onSave: (draft: PlannerEventDraft) => {
            const target = session.target;
            runDialogWrite(session.id, `Could not save “${draft.title.trim()}”`, () =>
              target.mode === 'create'
                ? create.mutateAsync(draft)
                : update.mutateAsync({ current: target.event, patch: draft }),
            );
          },
          onDelete: (event: PlannerEventRow) =>
            runDialogWrite(session.id, `Could not delete “${event.title}”`, () =>
              remove.mutateAsync(event),
            ),
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

  return { form, actions, alert, dismissAlert: () => setAlert(null) };
}
