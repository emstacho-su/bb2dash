/**
 * bb2dash — the Workspace's frozen strings (Phase 21).
 *
 * PM wording, frozen in brief 102 (Contract, "Frozen strings"): every sentence
 * the Workspace page says about a question or an answer is spelled once, here,
 * word for word. None of them carries a cost figure.
 *
 * This file holds the three that the query layer (task 15) and the stream hook
 * (task 4) need. The rest of the list (the queued line, the offline line and
 * the eight error sentences) arrives with the screen in task 16, behind its own
 * test.
 */

/**
 * Shown in place of half-written text when a stream is joined late: the lowest
 * `seq` received is not 1 (a reload, a page opened mid-answer, a cold Realtime
 * start). The stored row replaces it.
 */
export const LATE_STREAM_LINE = 'Answering…';

/** A second question while one is open: SQLSTATE 23505 from `workspace_ask`. */
export const REFUSAL_STILL_ANSWERING = 'This conversation is still answering.';

/**
 * Empty or over-long text: refused by the page before any request, and by the
 * database with SQLSTATE 22023.
 */
export const REFUSAL_QUESTION_LENGTH = 'Write a question of 1 to 8000 characters.';
