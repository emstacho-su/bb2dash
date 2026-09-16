'use client';

/**
 * Which planner event the form is open on, and where focus goes back to
 * (Phase 11b).
 *
 * The planner opens `PlannerEventForm` from three places — an empty slot, an
 * empty Events cell, an existing block — and each remembers its opener. Closing
 * puts focus back on it (K-9: "focus returns to the slot"), explicitly rather
 * than by trusting `document.activeElement` at open time, because some
 * browsers do not focus a button on click.
 *
 * The task checkbox's write also lives here, so the grid has one place that
 * owns planner-event actions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUpdatePlannerEvent } from '@/lib/queries.plannerEvents';
import type { PlannerEventRow } from '@/lib/planner-events';
import type { EventActions } from './PlannerEventBlock';
import type { PlannerEventFormMode } from './PlannerEventForm';

export interface PlannerEventEditor {
  target: PlannerEventFormMode | null;
  /** Bumps on every open, so each form mounts fresh. */
  openCount: number;
  close: () => void;
  actions: EventActions;
  /** Why the last task tick did not stick, if it did not. */
  doneError: Error | null;
}

export function usePlannerEventEditor(): PlannerEventEditor {
  const [target, setTarget] = useState<PlannerEventFormMode | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [closeCount, setCloseCount] = useState(0);
  const openerRef = useRef<HTMLElement | null>(null);
  const setDone = useUpdatePlannerEvent();

  const open = useCallback((next: PlannerEventFormMode, opener: HTMLElement) => {
    openerRef.current = opener;
    setTarget(next);
    setOpenCount((count) => count + 1);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setCloseCount((count) => count + 1);
  }, []);

  // Runs after the dialog has unmounted (and after its own focus hand-back),
  // so the opener is what ends up focused.
  useEffect(() => {
    if (closeCount === 0) return;
    const opener = openerRef.current;
    if (opener && opener.isConnected) opener.focus();
  }, [closeCount]);

  const actions: EventActions = {
    edit: (event, opener) => open({ mode: 'edit', event }, opener),
    create: (prefill, opener) => open({ mode: 'create', prefill }, opener),
    toggleDone: (event: PlannerEventRow, done: boolean) =>
      setDone.mutate({ current: event, patch: { done } }),
    pendingDoneId: setDone.isPending ? (setDone.variables?.current.id ?? null) : null,
  };

  return { target, openCount, close, actions, doneError: setDone.error };
}
