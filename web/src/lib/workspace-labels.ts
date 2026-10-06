/**
 * bb2dash — the Workspace's strings (Phase 21).
 *
 * FROZEN. PM wording from brief 102 (Contract: "States, in words", "Frozen
 * strings", the archive labels, the tier badges) and ruling T2 (the three
 * skeleton strings): every sentence the Workspace page says about a question
 * or an answer is spelled once, here, word for word, and
 * `web/test/workspace-labels.test.ts` holds each one against the brief. None
 * of them carries a cost figure: the per-answer cap is a runner setting the
 * page cannot read, and the stored cost estimate is never shown.
 *
 * RULING U1 (2026-10-06) added the three lines of the empty message column,
 * the placeholder of the text box and the "Status" label, and kept the
 * "New conversation" link. They are PM wording too, and held the same way.
 *
 * ACCEPTED. The last section holds the words the screen needs that the brief
 * does not spell: region names, the two empty lines of the list, and the
 * problem lines for a read or a write that failed. W-66 wrote them in the
 * forms the app already uses (the Inbox's "Could not load …: <reason>");
 * ruling U1 accepted them as PM wording, so the test holds them as well.
 */

import type { WorkspaceErrorCode, WorkspaceTier } from './queries.workspace';

/* ---------------------------------------------------------------------------
 * Frozen: the states, in words
 * ------------------------------------------------------------------------ */

/** Under a question whose request is `queued`: no runner has claimed it yet. */
export const QUEUED_LINE = 'Waiting for the Workspace service';

/**
 * Shown in place of half-written text when a stream is joined late: the lowest
 * `seq` received is not 1 (a reload, a page opened mid-answer, a cold Realtime
 * start). The stored row replaces it.
 */
export const LATE_STREAM_LINE = 'Answering…';

/** The service line when the runner's heartbeat is null or more than 120 s old. */
export const OFFLINE_LINE = 'The Workspace service is offline.';

/**
 * One sentence per `error_code`, chosen by the request row's code. The stored
 * sign-in sentence names the command in plain words, with no backticks.
 */
export const ERROR_SENTENCES: Readonly<Record<WorkspaceErrorCode, string>> = {
  cancelled: 'You stopped this answer.',
  budget_exceeded: 'Stopped at the per-answer cost limit.',
  timeout: 'This took too long and was stopped.',
  stale_claim: 'The Workspace service stopped part-way. Ask again.',
  provider_not_configured: 'That model is not connected.',
  cli_error: 'The assistant could not finish this answer. Ask again.',
  usage_limit: "Your Claude plan's limit is used up. Try again after it resets.",
  sign_in_expired:
    "The Workspace's Claude sign-in has expired. Run claude setup-token again and store the new token.",
};

/** The stopped sentence: what a `cancelled` request says, and what Stop shows at once. */
export const STOPPED_SENTENCE = ERROR_SENTENCES.cancelled;

/* ---------------------------------------------------------------------------
 * Frozen: the two refusals
 * ------------------------------------------------------------------------ */

/** A second question while one is open: SQLSTATE 23505 from `workspace_ask`. */
export const REFUSAL_STILL_ANSWERING = 'This conversation is still answering.';

/**
 * Empty or over-long text: refused by the page before any request, and by the
 * database with SQLSTATE 22023.
 */
export const REFUSAL_QUESTION_LENGTH = 'Write a question of 1 to 8000 characters.';

/* ---------------------------------------------------------------------------
 * Frozen: the controls and the badges
 * ------------------------------------------------------------------------ */

/** The composer's button. No control reads "Submit" (`web/test/audits.test.ts`). */
export const ASK_LABEL = 'Ask';

/** The same button while a request is open. */
export const STOP_LABEL = 'Stop';

export const ARCHIVE_LABEL = 'Archive';
export const UNARCHIVE_LABEL = 'Unarchive';
export const SHOW_ARCHIVED_LABEL = 'Show archived';

/** One badge per assistant message: the model level that answered, and what it is for. */
export const TIER_BADGES: Readonly<Record<WorkspaceTier, string>> = {
  low: 'Haiku · lookup',
  mid: 'Sonnet · standard',
  high: 'Opus · deep work',
};

/** Starts the line that names the tools an answer used. */
export const USED_PREFIX = 'Used:';

/* ---------------------------------------------------------------------------
 * Frozen: the three skeleton strings (ruling T2)
 * ------------------------------------------------------------------------ */

/** The kicker over the page title. */
export const PAGE_KICKER = 'Assistant';

/** The Suspense fallback of the route. */
export const LOADING_FALLBACK = 'Loading the Workspace…';

/**
 * A conversation that could not be read. An id that does not exist is not this
 * line: it has its own (`COLUMN_NOT_FOUND_LINE`).
 */
export function conversationProblemLine(reason: string): string {
  return `Could not load this conversation: ${reason}`;
}

/* ---------------------------------------------------------------------------
 * Frozen: the empty message column, the placeholder, the status label and the
 * way back to an empty composer (ruling U1)
 * ------------------------------------------------------------------------ */

/** The message column with no conversation selected. */
export const COLUMN_START_LINE = 'Ask a question to start a conversation.';

/** The message column while the conversation's rows are still being read. */
export const COLUMN_LOADING_LINE = 'Loading the conversation…';

/**
 * The message column for a `?c=` id that has no rows, and for SQLSTATE 23503
 * from `workspace_ask`. The database's own sentence about the foreign key is
 * never shown.
 */
export const COLUMN_NOT_FOUND_LINE = 'This conversation was not found.';

/** The visible placeholder of the composer's text box. */
export const QUESTION_PLACEHOLDER = 'Ask about your courses or your decisions';

/**
 * What a screen reader hears before a status line that has no answer text
 * beside it (a queued question, an answer not yet begun, a failure with no
 * stored text). An answer with text keeps `ANSWER_ROLE_LABEL`.
 */
export const STATUS_ROLE_LABEL = 'Status';

/**
 * The link back to an empty composer, `/workspace` with no `?c=`: at the top of
 * the list, and beside the not-found line.
 */
export const NEW_CONVERSATION_LABEL = 'New conversation';

/* ---------------------------------------------------------------------------
 * Accepted as PM wording (ruling U1): W-66's strings, in the app's own forms
 * ------------------------------------------------------------------------ */

/** The name of the list region, and its heading. */
export const CONVERSATIONS_HEADING = 'Conversations';

/** The list once it has answered with no rows. */
export const NO_CONVERSATIONS_LINE = 'No conversations yet.';

/** The archived list once it has answered with no rows. */
export const NO_ARCHIVED_LINE = 'No archived conversations.';

/** The name of the message column, for a screen reader. */
export const MESSAGES_REGION_LABEL = 'Messages';

/** The name of the composer's text box, for a screen reader. */
export const QUESTION_FIELD_LABEL = 'Question';

/** Who wrote a turn, for a screen reader. */
export const QUESTION_ROLE_LABEL = 'You asked';
export const ANSWER_ROLE_LABEL = 'The assistant answered';

/** The conversation list could not be read. */
export function conversationsProblemLine(reason: string): string {
  return `Could not load the conversations: ${reason}`;
}

/** `v_workspace_status` could not be read, so nothing is said about the service. */
export function statusProblemLine(reason: string): string {
  return `Could not load the Workspace service status: ${reason}`;
}

/** A question that failed for a reason that is neither refusal. */
export function askProblemLine(reason: string): string {
  return `Could not send this question: ${reason}`;
}

/** A Stop that failed: the request is still open. */
export function stopProblemLine(reason: string): string {
  return `Could not stop this answer: ${reason}`;
}

/** An Archive or an Unarchive that failed. */
export function archiveProblemLine(reason: string): string {
  return `Could not change this conversation: ${reason}`;
}
