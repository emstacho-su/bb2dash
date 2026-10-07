/**
 * What one run works on (Phase 23). Pure.
 *
 * `inbox_apply_prepare()` returns the whole answered queue. The rows that need no reading are
 * archived by the worker itself with a templated record: applied by the transform, kept,
 * dismissed, or a notice about a request, and carrying no note. A note can ask for more than the bucket says ("keep mine, and
 * mark it submitted"), so any row with a note goes to Claude. A session answer ("which class is
 * this file for?") is the transform's to apply, in `link_file_sessions`, and the role cannot write
 * `bb_files`: when the file shows what the fold did with the answer, the worker records it too
 * (migration 185 sends the file's link with the row). Of the rest, at most
 * `BATCH_MAX_ITEMS` go to Claude in this run; the close files a follow-up for what is left.
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
  /** Null for any row that is not a session answer. */
  readonly sessionLink: SessionLink | null;
}

export interface Prepared {
  readonly queue: readonly QueueRow[];
  readonly runsToday: number;
  /** `params.skip` of the request: the items an earlier run of this chain could not apply. */
  readonly skip: readonly number[];
  readonly trigger: string | null;
}

export interface Templated {
  readonly row: QueueRow;
  readonly bucket: TemplatedBucket;
}

export interface BatchPlan {
  readonly templated: readonly Templated[];
  /** The items this run hands to Claude, in the queue's order. */
  readonly forClaude: readonly QueueRow[];
  /** Items that wait for the follow-up because the batch is full. */
  readonly deferred: readonly number[];
  /** Items left out because an earlier run of this chain could not apply them. */
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
      sessionLink: sessionLink(entry.session_link),
    };
  });
  const runs = Number(value.runs_today);
  return {
    queue,
    runsToday: Number.isFinite(runs) && runs > 0 ? Math.trunc(runs) : 0,
    skip: itemIds(params.skip),
    trigger: textOrNull(params.trigger),
  };
}

/** `resolution.accept` of a session answer that picks no session. */
const ACCEPT_NONE = 'none';

/**
 * What `link_file_sessions` did, or will do, with a session answer, when the file's own row says
 * so; null when the file and the answer disagree, and somebody has to read it.
 *
 * The fold applies a pick only while the file is unlinked, reads an answer from an archived row
 * too (163), and leaves a "none" unlinked without asking again.
 */
function sessionLinkRule(row: QueueRow): string | null {
  const link = row.sessionLink;
  if (link === null || row.state !== 'resolved' || !link.fileCurrent) return null;
  if (link.pick === null) {
    return row.accept === ACCEPT_NONE && link.fileSessionId === null
      ? `Answered none: link_file_sessions leaves file ${link.fileId} unlinked and does not ask again while the week's classes stay as shown (migrations 123, 163).`
      : null;
  }
  if (link.fileSessionId === link.pick) {
    return `link_file_sessions set session ${link.pick} on file ${link.fileId} from this answer (migrations 123, 163).`;
  }
  return link.fileSessionId === null
    ? `File ${link.fileId} is not linked yet: link_file_sessions reads this answer at the next sync, from an archived row too (migration 163), and sets session ${link.pick} while the week's classes stay as shown.`
    : null;
}

/** The bucket of a row the worker can record without reading anything, or null. */
export function templatedBucket(row: QueueRow): TemplatedBucket | null {
  if (row.hasNote) return null;
  if (row.wasApplied) return 'applied_by_transform';
  if (sessionLinkRule(row) !== null) return 'applied_by_transform';
  if (row.kind === 'conflict' && row.accept === 'keep') return 'kept';
  if (row.state === 'dismissed') return 'dismissed';
  // A confirmed notice ("the apply run failed", "log in again") asks for no row change: a full
  // Sonnet and Opus run to archive it would spend one of the day's runs on nothing.
  if (row.entity === NOTICE_ENTITY) return 'recorded_elsewhere';
  return null;
}

const TEMPLATED_RULE: Readonly<Record<TemplatedBucket, (row: QueueRow) => string>> = Object.freeze({
  applied_by_transform: (row) =>
    row.wasApplied
      ? `Applied by apply_resolutions()${row.appliedAt === null ? '' : ` at ${row.appliedAt}`}.`
      : (sessionLinkRule(row) ?? 'Applied by the transform.'),
  kept: () => 'Keep mine stands until Blackboard changes the value (attention_keep_stands).',
  dismissed: () => 'Dismissed without a note.',
  recorded_elsewhere: () => 'A notice about a request, acknowledged; it names no course row, so nothing was changed.',
});

/** The record of a row archived without Claude: the `inbox-decision/1` shape migration 181 checks. */
export function templatedDecision(row: QueueRow, bucket: TemplatedBucket, requestId: number): Record<string, unknown> {
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
    rule: TEMPLATED_RULE[bucket](row),
    sources: ['apply worker (no reading needed)'],
    flagged: null,
  };
}

/** Split the queue into what the worker records itself, what Claude gets, and what waits. */
export function planBatch(prepared: Prepared, max: number = BATCH_MAX_ITEMS): BatchPlan {
  const skip = new Set(prepared.skip);
  const templated: Templated[] = [];
  const rest: QueueRow[] = [];
  const skipped: number[] = [];
  for (const row of prepared.queue) {
    if (skip.has(row.id)) {
      skipped.push(row.id);
      continue;
    }
    const bucket = templatedBucket(row);
    if (bucket === null) rest.push(row);
    else templated.push({ row, bucket });
  }
  return {
    templated,
    forClaude: rest.slice(0, max),
    deferred: rest.slice(max).map((row) => row.id),
    skipped,
  };
}
