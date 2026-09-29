'use client';

/**
 * "Apply answers now" (R-42, B-21) — the Inbox's answers applied without a
 * crawl or a Claude session.
 *
 * `transform_tick` drains queued `agent_requests` rows of kind `transform`
 * every two minutes, and each one runs `apply_resolutions()` (042), which
 * writes the four assignment fields an answered Inbox row can carry. So
 * applying an answer now is filing one such row. No migration, no new path:
 * the insert is the one `createAgentRequest` already makes for Sync.
 *
 * One open transform request at a time, for the reason Sync has the rule:
 * nothing in the app closes an `agent_requests` row, so a second press while
 * one is queued or claimed would file a request that only duplicates it. While
 * one is open, this tab's or another's, a press files nothing and the button
 * shows that request's state instead.
 *
 * Built on `queries.sync.ts`'s exports, which this file does not edit.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  APPLIED_FIELDS,
  openRequestOptions,
  useAgentRequest,
  useCreateAgentRequest,
  useRefreshInboxOnSettled,
  type AgentRequest,
  type AgentRequestState,
} from './queries.sync';

/** The control's label: apart from "Apply answers", which runs /inbox-apply. */
export const APPLY_NOW_LABEL = 'Apply answers now';

/** The line under it, naming the four fields `apply_resolutions()` writes. */
export const APPLY_NOW_HELP =
  'Applies answered due dates, points and Blackboard links now, without a sync ' +
  `(${APPLIED_FIELDS.join(', ')}). Every other answer waits for "Apply answers".`;

/** What the button says while a transform request is moving. */
export const APPLY_NOW_STATE_LABEL: Record<AgentRequestState, string> = {
  queued: 'apply queued',
  claimed: 'applying…',
  done: 'answers applied',
  failed: 'apply failed',
  cancelled: 'apply cancelled',
};

function isOpen(state: AgentRequestState | undefined): boolean {
  return state === 'queued' || state === 'claimed';
}

/** The error a failed request recorded, if it recorded one as text. */
export function requestFailure(request: AgentRequest | null | undefined): string | null {
  if (request?.state !== 'failed') return null;
  const error = request.result?.error;
  return typeof error === 'string' && error.trim() !== '' ? error.trim() : null;
}

/** The newest queued or claimed transform request, or null. */
export function useOpenTransformRequest() {
  return useQuery(openRequestOptions('transform'));
}

export interface ApplyNow {
  /** The state of the request this button is showing, or null when it shows none. */
  state: AgentRequestState | null;
  /** Why the shown request failed, when it said. */
  failure: string | null;
  /** The insert is in flight. */
  filing: boolean;
  /** "Nothing open" is not known yet, so a press could duplicate a request. */
  lookingForOpen: boolean;
  /** The insert was refused. */
  error: Error | null;
  /** File a transform request, unless one is already open. */
  apply: () => Promise<void>;
}

export function useApplyNow(): ApplyNow {
  const create = useCreateAgentRequest();
  const open = useOpenTransformRequest();
  const [requestId, setRequestId] = useState<number | null>(null);
  const tracked = useAgentRequest(requestId);

  // When the request settles, apply_resolutions() has written what it could:
  // the Inbox list, the Home counts and the queue count refresh then.
  useRefreshInboxOnSettled(tracked.data?.state ?? null);

  const openRequest = open.data ?? null;
  // An open request outranks a settled one this tab filed earlier.
  const shown = isOpen(tracked.data?.state)
    ? (tracked.data ?? null)
    : (openRequest ?? tracked.data ?? null);
  // A request this tab filed whose row has not been read back yet is still open.
  const trackedUnread = requestId !== null && tracked.data === undefined;
  const lookingForOpen = open.isPending;

  async function apply(): Promise<void> {
    if (lookingForOpen || create.isPending || trackedUnread) return;
    const active = isOpen(shown?.state) ? shown : null;
    if (active) {
      setRequestId(active.id);
      return;
    }
    try {
      const row = await create.mutateAsync({ kind: 'transform', scope: 'all' });
      setRequestId(row.id);
    } catch {
      // The mutation keeps its own error, which the button renders; nothing is lost here.
    }
  }

  return {
    state: shown?.state ?? null,
    failure: requestFailure(shown),
    filing: create.isPending,
    lookingForOpen,
    error: create.error ?? null,
    apply,
  };
}
