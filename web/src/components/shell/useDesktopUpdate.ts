'use client';

/**
 * State for the account menu's "Update desktop app" item (2026-09-30).
 *
 * Kept by `TopNav` rather than the menu, so closing and reopening the menu mid-check still
 * shows "Checking for updates…". `available` is false in a normal browser, where the item
 * is not rendered at all.
 */

import { useCallback, useRef, useState } from 'react';

import { type DesktopUpdateResult, getDesktopUpdater, requestDesktopUpdate } from '@/lib/desktop-bridge';

export type DesktopUpdateState = { readonly status: 'idle' } | { readonly status: 'pending' } | DesktopUpdateResult;

export const UPDATE_LABELS = Object.freeze({
  idle: 'Update desktop app',
  pending: 'Checking for updates…',
  upToDate: 'Up to date',
  restarting: 'Updating — bb2dash will restart',
  failedPrefix: 'Update failed: ',
});

export function updateLabel(state: DesktopUpdateState): string {
  switch (state.status) {
    case 'idle':
      return UPDATE_LABELS.idle;
    case 'pending':
      return UPDATE_LABELS.pending;
    case 'up-to-date':
      return UPDATE_LABELS.upToDate;
    case 'restarting':
      return UPDATE_LABELS.restarting;
    case 'failed':
      return `${UPDATE_LABELS.failedPrefix}${state.reason}`;
  }
}

/** Pending, or about to restart: nothing more to click. */
export function isUpdateLocked(state: DesktopUpdateState): boolean {
  return state.status === 'pending' || state.status === 'restarting';
}

export function useDesktopUpdate(): {
  readonly state: DesktopUpdateState;
  readonly start: () => void;
} {
  const [state, setState] = useState<DesktopUpdateState>({ status: 'idle' });
  const running = useRef(false);

  const start = useCallback(() => {
    const updater = getDesktopUpdater();
    if (updater === null || running.current) return;
    running.current = true;
    setState({ status: 'pending' });
    void requestDesktopUpdate(updater).then((result) => {
      running.current = false;
      setState(result);
    });
  }, []);

  return { state, start };
}
