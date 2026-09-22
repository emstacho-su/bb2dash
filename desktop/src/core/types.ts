/**
 * PM-owned shared signatures for Phase 12 (docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md, C-5, C-6,
 * C-7, C-13). W-25 implements `rest` and `session-decode` against these; W-26 builds the poller
 * against them. Changing a name or shape here is a numbered note in the verification file first.
 *
 * Everything in `core/` is plain Node: no `electron` import (C-13, enforced by a unit test).
 */

/** What `session-decode` returns from the web session's auth cookie(s). Never persisted. */
export interface WebSession {
  readonly accessToken: string;
  /** Unix seconds, from the cookie's `expires_at`. */
  readonly expiresAt: number;
}

/** One PostgREST GET. `query` is the raw query string after `?`, already encoded. */
export type RestGet = <T>(
  relation: string,
  query: string,
  validate: (rows: unknown) => T,
) => Promise<T>;

/** R1: one row of `v_sync_status`. */
export interface SyncStatusRow {
  readonly id: number;
  readonly run_id: string | null;
  readonly status: 'running' | 'ok' | 'partial' | 'failed' | string;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly trigger: string | null;
  readonly summary: {
    readonly changes?: readonly string[];
    readonly attention_raised?: number;
    readonly errors?: readonly string[];
  } | null;
}

/** R2: one row of `v_gradebook_history` newer than the watermark. */
export interface GradeRow {
  readonly shell_course_id: string;
  readonly column_id: string;
  readonly name: string;
  readonly run_id: string;
  readonly seen_at: string;
  readonly score: number;
  readonly possible: number | null;
  readonly previous_score: number | null;
}

/** R3: one row of `v_work_items` due tomorrow. */
export interface DueRow {
  readonly item_kind: 'assignment' | 'reading';
  readonly item_id: string;
  readonly course_id: string;
  readonly title: string;
  readonly due_at: string | null;
  readonly due_on: string;
  readonly status: string;
}

/** `courses?select=id,title_short`, read once per launch for labels. */
export interface CourseLabel {
  readonly id: string;
  readonly title_short: string;
}

/** userData/notify-watermark.json (C-7). */
export interface Watermark {
  readonly version: 1;
  readonly lastSeenAt: string;
  /**
   * R2-1: the instant this install first started notifying. The grade read looks a fixed
   * window *behind* `lastSeenAt` to cover the crawl -> transform gap, and this is the line
   * that window may never cross — so a first launch still fires nothing historical, however
   * wide the overlap grows. Written once and never moved.
   */
  readonly notifyFloor: string;
  readonly dueCheckedOn: string | null;
  /** Newest 500 kept. */
  readonly firedKeys: readonly string[];
}

export interface WatermarkStore {
  read(): Promise<Watermark | null>;
  /** Atomic: tmp + rename. */
  write(next: Watermark): Promise<void>;
}

export interface Toast {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  /** Validated by `deeplink` before navigation (C-7 Delivery). */
  readonly route: string;
}

export interface ReduceInput {
  readonly sync: SyncStatusRow | null;
  readonly grades: readonly GradeRow[];
  /** `null` when the daily due check did not run this tick. */
  readonly due: readonly DueRow[] | null;
  readonly now: Date;
  readonly watermark: Watermark;
  readonly courses: readonly CourseLabel[];
  /**
   * R2-2: where `lastSeenAt` advances to. Defaults to `now` (C-7 rule 4). The scheduler
   * passes an earlier instant when the grade read was truncated by the page cap, so the
   * rows it could not reach this tick are still behind the watermark next tick.
   */
  readonly advanceTo?: Date;
}

export interface ReduceOutput {
  readonly toasts: readonly Toast[];
  readonly watermark: Watermark;
}

/** Pure (C-7): same input, same output; no clock, no I/O. */
export type Reduce = (input: ReduceInput) => ReduceOutput;

/** Electron supplies `Notification`; a container later supplies a webhook (C-13). */
export interface Notifier {
  show(toast: Toast): Promise<void>;
}

/** Electron supplies `child_process.spawn`; a container later runs `claude -p` (C-13). */
export interface Launcher {
  spawn(argv: readonly string[], cwd: string): Promise<void>;
}

/** C-8: `{ repoDir, id } -> argv`; throws on an id that does not match `^\d{1,12}$`. */
export type BuildSyncCommand = (input: {
  readonly repoDir: string;
  readonly id: string;
  readonly wtPath: string | null;
}) => readonly string[];
