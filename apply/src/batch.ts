/**
 * What one run works on (Phase 23). Pure.
 *
 * `inbox_apply_prepare()` returns the whole answered queue. The rows that need no reading are
 * archived by the worker itself with a templated record: applied by the transform, kept, or
 * dismissed, and carrying no note. A note can ask for more than the bucket says ("keep mine, and
 * mark it submitted"), so any row with a note goes to Claude. Of the rest, at most
 * `BATCH_MAX_ITEMS` go to Claude in this run; the close files a follow-up for what is left.
 */

import { BATCH_MAX_ITEMS } from './config.js';

export const DECISION_SCHEMA = 'inbox-decision/1';

export type TemplatedBucket = 'applied_by_transform' | 'kept' | 'dismissed';

/** One row of `v_inbox_queue`, as `inbox_apply_prepare()` returns it. */
export interface QueueRow {
  readonly id: number;
  readonly kind: string;
  readonly courseId: string | null;
  readonly ref: string | null;
  readonly question: string;
  readonly state: string;
  readonly accept: string | null;
  readonly hasNote: boolean;
  readonly wasApplied: boolean;
  readonly appliedAt: string | null;
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
      ref: textOrNull(entry.ref),
      question: String(entry.question ?? ''),
      state: String(entry.state ?? ''),
      accept: textOrNull(entry.accept),
      hasNote: entry.has_note === true,
      wasApplied: entry.was_applied === true,
      appliedAt: textOrNull(entry.applied_at),
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

/** The bucket of a row the worker can record without reading anything, or null. */
export function templatedBucket(row: QueueRow): TemplatedBucket | null {
  if (row.hasNote) return null;
  if (row.wasApplied) return 'applied_by_transform';
  if (row.kind === 'conflict' && row.accept === 'keep') return 'kept';
  if (row.state === 'dismissed') return 'dismissed';
  return null;
}

const TEMPLATED_RULE: Readonly<Record<TemplatedBucket, (row: QueueRow) => string>> = Object.freeze({
  applied_by_transform: (row) => `Applied by apply_resolutions()${row.appliedAt === null ? '' : ` at ${row.appliedAt}`}.`,
  kept: () => 'Keep mine stands until Blackboard changes the value (attention_keep_stands).',
  dismissed: () => 'Dismissed without a note.',
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
