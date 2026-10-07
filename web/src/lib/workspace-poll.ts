/**
 * bb2dash — when the Workspace re-reads its stored messages (Phase 21, the
 * review round of 2026-10-06; ruling V4, findings CR-9 and CR-12).
 *
 * The stored row is the record of an answer, and the page learns of it from the
 * `done` broadcast. A broadcast can be missed, so the messages are also polled,
 * every 5 s, in two situations. Both are read off the rows, never off what the
 * page happened to hold when a button was pressed:
 *
 *   * A REQUEST IS OPEN (`queued` or `claimed`).
 *   * THE NEWEST REQUEST HAS CLOSED AND ITS ASSISTANT ROW IS STILL UNFINISHED.
 *     After Stop the runner sees the cancel within seconds and stores what it
 *     had written; until then the row the page holds is the unfinished one.
 *     This poll ends by itself: when the stored row lands, or 60 s after the
 *     page first saw the request so.
 *
 * WHOSE 60 S. The page's own: counted on its monotonic clock from the moment
 * the messages query first saw the request closed and unstored. The request's
 * `finished_at` is the database's time, and setting it beside the browser's
 * wall clock is the fault CR-8 removed from the service line.
 *
 * A closed request with no assistant row is owed nothing: the runner never
 * began it (Stop on a queued request), so nothing is polled for it.
 *
 * The open states are defined here, once, because this is the rule they
 * decide; `queries.workspace.ts` exports them on.
 */

import type {
  WorkspaceMessage,
  WorkspaceRequest,
  WorkspaceRequestState,
} from './queries.workspace';
import { monotonicNowMs } from './workspace-clock';

/**
 * The two states in which a request is still open. The one definition: the
 * thread, and whatever else asks whether a request is open, imports this.
 */
export const WORKSPACE_OPEN_STATES: readonly WorkspaceRequestState[] = ['queued', 'claimed'];

/** How long after a request closes with its answer unstored the messages are still polled. */
export const WORKSPACE_CLOSED_POLL_MS = 60_000;

type Requests = readonly WorkspaceRequest[] | null | undefined;
type Messages = readonly WorkspaceMessage[] | null | undefined;

/**
 * The conversation's open request (`queued` or `claimed`), or null. The unique
 * index `workspace_requests_one_open` allows one at most; the newest wins if a
 * cached list ever held two.
 */
export function openRequestOf(requests: Requests): WorkspaceRequest | null {
  if (!requests) return null;
  for (let index = requests.length - 1; index >= 0; index -= 1) {
    if (WORKSPACE_OPEN_STATES.includes(requests[index].state)) return requests[index];
  }
  return null;
}

/**
 * The newest request, when it has closed and its assistant row is still
 * unfinished: the runner has yet to store what it wrote. Null otherwise.
 */
export function unstoredClosedRequestOf(
  requests: Requests,
  messages: Messages,
): WorkspaceRequest | null {
  const newest = requests?.at(-1) ?? null;
  if (newest === null || WORKSPACE_OPEN_STATES.includes(newest.state)) return null;
  const unfinished = (messages ?? []).some(
    (message) =>
      message.role === 'assistant' && message.request_id === newest.id && !message.finished,
  );
  return unfinished ? newest : null;
}

/**
 * Per messages query: the closed request it is polling for, and when it first
 * saw that request closed and unstored, on the page's own clock. Held beside
 * the query, not in the cache: the cache is saved to localStorage, and a
 * monotonic reading means nothing to the next page load.
 */
const closedPolls = new WeakMap<object, { requestId: number; sinceMs: number }>();

/** True from the first time `query` asks about `requestId`, for 60 s. */
function closedPollRunning(query: object, requestId: number): boolean {
  const nowMs = monotonicNowMs();
  const poll = closedPolls.get(query);
  if (poll === undefined || poll.requestId !== requestId) {
    closedPolls.set(query, { requestId, sinceMs: nowMs });
    return true;
  }
  return nowMs - poll.sinceMs < WORKSPACE_CLOSED_POLL_MS;
}

/** The messages query as TanStack hands it to a `refetchInterval` function. */
export interface MessagesQuery {
  state: { data: readonly WorkspaceMessage[] | undefined };
}

/**
 * Whether the messages are polled now: a request is open, or the newest one
 * closed with its answer unstored less than 60 s ago (see the header).
 */
export function messagesPolled(requests: Requests, query: MessagesQuery): boolean {
  if (openRequestOf(requests) !== null) return true;
  const owed = unstoredClosedRequestOf(requests, query.state.data);
  return owed !== null && closedPollRunning(query, owed.id);
}
