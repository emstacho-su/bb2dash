/**
 * What one run works on (Phase 23). Pure.
 *
 * `inbox_apply_prepare()` returns the whole answered queue. The rows that need no reading are
 * archived by the worker itself with a templated record: applied by the transform, kept,
 * dismissed, or a notice about a request, and carrying no note. A note can ask for more than the bucket says ("keep mine, and
 * mark it submitted"), so any row with a note goes to Claude. A session answer ("which class is
 * this file for?") is the transform's to apply, in `link_file_sessions`, and the role cannot write
 * `bb_files`: when the file shows the fold did what the answer says, the worker records it too
 * (migration 185 sends the file's link with the row). Of the rest, at most
 * `BATCH_MAX_ITEMS` go to Claude in this run; the close files a follow-up for what is left.
 *
 * A held answer (migration 187) is one an earlier run could not apply and Stack has not answered
 * again. `inbox_apply_prepare()` names those ids under `held`: empty for a request the button
 * filed (a press tries them again), the held ids for a request a sync or a follow-up filed. The
 * worker still records a held row it can record itself, and skips only a held row that would
 * go to Claude.
 */

import { BATCH_MAX_ITEMS } from './config.js';

export const DECISION_SCHEMA = 'inbox-decision/1';

export type TemplatedBucket = 'applied_by_transform' | 'kept' | 'dismissed' | 'recorded_elsewhere';

/** `attention_items.entity` of a notice the worker or the sync raised about a request: it names no course row. */
export const NOTICE_ENTITY = 'agent_request';

/** What 185's `inbox_apply_prepare()` says of a `session_link/<file id>` row: Stack's pick and the file's link now. */
export interface SessionLink {
  readonly fileId: number;
  /** The session he picked; null when he answered "none" or the answer names no session. */
  readonly pick: number | null;
  /** False when the file is gone or superseded. */
  readonly fileCurrent: boolean;
  readonly fileSessionId: number | null;
}

/** One row of `v_inbox_queue`, as `inbox_apply_prepare()` returns it. */
export interface QueueRow {
  readonly id: number;
  readonly kind: string;
  readonly courseId: string | null;
  readonly entity: string | null;
  readonly ref: string | null;
  readonly question: string;
  readonly state: string;
  readonly accept: string | null;
  readonly hasNote: boolean;
  readonly wasApplied: boolean;
  readonly appliedAt: string | null;
  /** `resolved_at` exactly as `prepare` handed it over (a string, never a Date: microseconds stay), or null. */
  readonly resolvedAt: string | null;
  /** Null for any row that is not a session answer. */
  readonly sessionLink: SessionLink | null;
}

export interface Prepared {
  readonly queue: readonly QueueRow[];
  readonly runsToday: number;
  /** `params.skip` of the request: the items an earlier run of this chain could not apply. */
  readonly skip: readonly number[];
  /** `held` of the answer: the held item ids; null when the key is absent (a function older than 187). */
  readonly held?: readonly number[] | null;
  readonly trigger: string | null;
}

export interface Templated {
  readonly row: QueueRow;
  readonly bucket: TemplatedBucket;
  /** Why no reading was needed: the `rule` of the row's record. */
  readonly rule: string;
}

export interface BatchPlan {
  readonly templated: readonly Templated[];
  /** The items this run hands to Claude, in the queue's order. */
  readonly forClaude: readonly QueueRow[];
  /** Items that wait for the follow-up because the batch is full. */
  readonly deferred: readonly number[];
  /** Items left out of Claude's batch because they are held (or, for an old function, skipped by an earlier run). */
  readonly skipped: readonly number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function itemId(value: unknown): number | null {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function itemIds(value: unknown): number[] {
  return Array.isArray(value) ? value.map(itemId).filter((id): id is number => id !== null) : [];
}

/** The session link of a row, or null: a row without one, or one that names no file, gets a reader. */
function sessionLink(value: unknown): SessionLink | null {
  if (!isRecord(value)) return null;
  const fileId = itemId(value.file_id);
  if (fileId === null) return null;
  return {
    fileId,
    pick: itemId(value.pick),
    fileCurrent: value.file_found === true && value.file_current === true,
    fileSessionId: itemId(value.file_session_id),
  };
}

/** The answer of `inbox_apply_prepare()`, validated: a row that is not a queue row stops the run. */
export function parsePrepared(value: unknown): Prepared {
  if (!isRecord(value) || !Array.isArray(value.queue)) throw new Error('inbox_apply_prepare: the answer holds no queue');
  const params = isRecord(value.params) ? value.params : {};
  const queue = value.queue.map((entry): QueueRow => {
    const id = isRecord(entry) ? itemId(entry.id) : null;
    if (!isRecord(entry) || id === null) throw new Error('inbox_apply_prepare: a queue row has no item id');
    return {
      id,
      kind: String(entry.kind ?? ''),
      courseId: textOrNull(entry.course_id),
      entity: textOrNull(entry.entity),
      ref: textOrNull(entry.ref),
      question: String(entry.question ?? ''),
      state: String(entry.state ?? ''),
      accept: textOrNull(entry.accept),
      hasNote: entry.has_note === true,
      wasApplied: entry.was_applied === true,
      appliedAt: textOrNull(entry.applied_at),
      resolvedAt: textOrNull(entry.resolved_at),
      sessionLink: sessionLink(entry.session_link),
    };
  });
  const runs = Number(value.runs_today);
  return {
    queue,
    runsToday: Number.isFinite(runs) && runs > 0 ? Math.trunc(runs) : 0,
    skip: itemIds(params.skip),
    held: Array.isArray(value.held) ? itemIds(value.held) : null,
    trigger: textOrNull(params.trigger),
  };
}

/** The ids this run leaves out of Claude's reach: `held` when the answer carries it, `params.skip` only for an old function. */
export function skipSet(prepared: Prepared): readonly number[] {
  return prepared.held ?? prepared.skip;
}

/** `resolution.accept` of a session answer that picks no session. */
const ACCEPT_NONE = 'none';

/**
 * What the file's own row shows `link_file_sessions` did with a session answer; null when the
 * file does not show it, and somebody has to read the item.
 *
 * Only what is already true is recorded here. A pick that is not on the file yet is one of two
 * things the row cannot tell apart: answered since the last fold (the next one sets it, from an
 * archived row too, 163), or declined by a fold that has already read it (the week's classes are
 * no longer the ones he was shown). That one gets a reader.
 */
function sessionLinkRule(row: QueueRow): string | null {
  const link = row.sessionLink;
  if (link === null || row.state !== 'resolved' || !link.fileCurrent) return null;
  if (link.pick === null) {
    return row.accept === ACCEPT_NONE && link.fileSessionId === null
      ? `Answered none: file ${link.fileId} is unlinked, as link_file_sessions leaves it (migrations 123, 163).`
      : null;
  }
  return link.fileSessionId === link.pick
    ? `File ${link.fileId} carries session ${link.pick}, his pick, set by link_file_sessions (migrations 123, 163).`
    : null;
}

/** The bucket and the rule of a row the worker can record without reading anything, or null. */
export function templatedRecord(row: QueueRow): Templated | null {
  const as = (bucket: TemplatedBucket, rule: string): Templated => ({ row, bucket, rule });
  if (row.hasNote) return null;
  // The session rule is read before the general one: a session answer the fold stamped (188) reads
  // `was_applied` too, and the function that applied it is link_file_sessions, not apply_resolutions.
  const sessionRule = sessionLinkRule(row);
  if (sessionRule !== null) return as('applied_by_transform', sessionRule);
  const at = row.appliedAt === null ? '' : ` at ${row.appliedAt}`;
  if (row.wasApplied && row.sessionLink !== null) {
    return as('applied_by_transform', `Applied by link_file_sessions()${at}; the stamp was set when the fold wrote his pick (migration 188).`);
  }
  if (row.wasApplied) return as('applied_by_transform', `Applied by apply_resolutions()${at}.`);
  if (row.kind === 'conflict' && row.accept === 'keep') return as('kept', 'Keep mine stands until Blackboard changes the value (attention_keep_stands).');
  if (row.state === 'dismissed') return as('dismissed', 'Dismissed without a note.');
  // A confirmed notice ("the apply run failed", "log in again") asks for no row change: a full
  // Sonnet and Opus run to archive it would spend one of the day's runs on nothing.
  if (row.entity === NOTICE_ENTITY) return as('recorded_elsewhere', 'A notice about a request, acknowledged; it names no course row, so nothing was changed.');
  return null;
}

/** The bucket alone, or null for a row that needs a reader. */
export function templatedBucket(row: QueueRow): TemplatedBucket | null {
  return templatedRecord(row)?.bucket ?? null;
}

/** The record of a row archived without Claude: the `inbox-decision/1` shape migration 181 checks. */
export function templatedDecision({ row, bucket, rule }: Templated, requestId: number): Record<string, unknown> {
  return {
    schema: DECISION_SCHEMA,
    item: row.id,
    request: requestId,
    mode: 'unattended',
    bucket,
    title: row.ref ?? `item ${row.id}`,
    course: row.courseId,
    ref: row.ref,
    question: row.question,
    change: 'recorded only',
    rule,
    sources: ['apply worker (no reading needed)'],
    flagged: null,
  };
}

/** Split the queue into what the worker records itself, what Claude gets, and what waits. */
export function planBatch(prepared: Prepared, max: number = BATCH_MAX_ITEMS): BatchPlan {
  const skip = new Set(skipSet(prepared));
  const templated: Templated[] = [];
  const rest: QueueRow[] = [];
  const skipped: number[] = [];
  for (const row of prepared.queue) {
    // The worker's own free record comes first: a held row it can record needs no run, and 188 makes
    // that likely for a session answer. Only a held row that would go to Claude is skipped.
    const record = templatedRecord(row);
    if (record !== null) templated.push(record);
    else if (skip.has(row.id)) skipped.push(row.id);
    else rest.push(row);
  }
  return {
    templated,
    forClaude: rest.slice(0, max),
    deferred: rest.slice(max).map((row) => row.id),
    skipped,
  };
}
