/**
 * bb2dash — sync-loop query layer (Phase 9, W-16).
 *
 * The read/write contract for the three Phase 9 relations:
 *   `v_sync_status`   one row: the latest sync run + open attention counts + freshness
 *   `attention_items` the Inbox queue (agent raises, app resolves)
 *   `agent_requests`  the app-to-agent direction (Sync button inserts `kind='sync'`)
 *
 * Conventions follow queries.ts: a key in `syncKeys`, an `xOptions()` returning
 * queryOptions, a `useX()` hook, throw on error, no fabricated fallbacks.
 *
 * ROW TYPES. `attention_items`, `agent_requests` and `v_sync_status` are created
 * by migrations 031/032/035 (worker W-15) in the same phase, so the checked-in
 * `database.types.ts` does not describe them yet and this module may not edit it.
 * The interfaces below are transcribed by hand from the frozen contract in
 * `docs/planning/62_PHASE9_sync_loop.md` and are cast at the call site.
 * // PM: replace with generated types at integration
 *
 * BOUNDARY VALIDATION. Nothing reaches Postgres unchecked: ids must be positive
 * integers, notes are trimmed and capped at NOTE_MAX_LENGTH, date answers are
 * parsed and round-tripped, and the row shapes coming back are normalised by
 * pure functions rather than trusted field by field.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './supabase/client';

/**
 * The Phase 9 relations are absent from the generated Database type, so the
 * typed client rejects `.from('attention_items')`. Read and write them through
 * an un-narrowed client until the types are regenerated; every row that comes
 * back is pinned to an interface below. Same pattern as queries.today.ts.
 */
function untypedClient(): SupabaseClient {
  return getSupabaseBrowserClient() as unknown as SupabaseClient;
}

/* ---------------------------------------------------------------------------
 * Row types (hand-declared from the frozen contract — see header)
 * ------------------------------------------------------------------------ */

/** `attention_items.kind` — migration 031's check constraint, in Inbox order. */
export type AttentionKind =
  | 'conflict'
  | 'stack_must_confirm'
  | 'missing'
  | 'deadline'
  | 'data_gap';

/** `attention_items.state`. */
export type AttentionState = 'open' | 'resolved' | 'dismissed';

/** `sync_runs.status` (migration 019). */
export type SyncRunStatus = 'running' | 'ok' | 'partial' | 'failed';

/** `agent_requests.kind` — this phase's check constraint lists only these two. */
export type AgentRequestKind = 'sync' | 'transform';

/** `agent_requests.state`. */
export type AgentRequestState = 'queued' | 'claimed' | 'done' | 'failed' | 'cancelled';

/** One row of `attention_items` (migration 031). */
export interface AttentionItem {
  id: number;
  raised_at: string;
  raised_by: number | null;
  kind: AttentionKind;
  course_id: string | null;
  entity: string | null;
  ref: string | null;
  field: string | null;
  from_value: unknown;
  to_value: unknown;
  question: string;
  suggested: unknown;
  state: AttentionState;
  resolved_at: string | null;
  resolution: Record<string, unknown> | null;
  /** Stack's free-text "why", written with every resolution. */
  resolution_note: string | null;
  /** Set by the transform once the resolution has been applied. */
  applied_at: string | null;
}

/** One row of `agent_requests` (migration 032). */
export interface AgentRequest {
  id: number;
  created_at: string;
  kind: AgentRequestKind;
  scope: string | null;
  params: Record<string, unknown>;
  note: string | null;
  state: AgentRequestState;
  claimed_at: string | null;
  claimed_by: string | null;
  finished_at: string | null;
  sync_run_id: number | null;
  result: Record<string, unknown> | null;
}

/** One `v_data_freshness` row, carried inside `v_sync_status` as jsonb. */
export interface FreshnessRow {
  stage: string;
  fresh_as_of: string | null;
  last_attempt_at: string | null;
  last_attempt_failed: boolean | null;
}

/** `sync_runs.summary` — the envelope migration 035's driver writes. */
export interface SyncSummary {
  stages: Record<string, unknown> | null;
  /** Plain-language lines. Objects carrying a `label` are tolerated. */
  changes: unknown[];
  attention_raised: number | null;
}

/** The single row of `v_sync_status` (migration 035), normalised. */
export interface SyncStatus {
  id: number | null;
  run_id: string | null;
  status: SyncRunStatus | null;
  started_at: string | null;
  finished_at: string | null;
  trigger: string | null;
  summary: SyncSummary | null;
  /** Open `attention_items` counts by kind. An absent kind means zero. */
  open_attention: Partial<Record<AttentionKind, number>>;
  /** `v_data_freshness` rows, one per stage. */
  freshness: FreshnessRow[];
}

/** One line of the in-app Activity list, flattened from `summary.changes`. */
export interface ActivityEntry {
  /** `sync_runs.id` — also the localStorage seen marker. */
  runId: number;
  /** Index of the line inside that run, so React keys stay stable. */
  lineNo: number;
  at: string | null;
  status: SyncRunStatus | null;
  line: string;
}

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------ */

/** Inbox group order, and the order the Home row lists its typed counts. */
export const ATTENTION_KIND_ORDER: readonly AttentionKind[] = [
  'conflict',
  'stack_must_confirm',
  'missing',
  'deadline',
  'data_gap',
] as const;

/** Human labels. "needs input" is the Home row's word for stack_must_confirm. */
export const ATTENTION_KIND_LABEL: Record<AttentionKind, string> = {
  conflict: 'conflict',
  stack_must_confirm: 'needs input',
  missing: 'missing',
  deadline: 'deadline',
  data_gap: 'data gap',
};

/** Longer headings for the Inbox groups. */
export const ATTENTION_KIND_HEADING: Record<AttentionKind, string> = {
  conflict: 'Conflicts',
  stack_must_confirm: 'Needs your input',
  missing: 'Missing',
  deadline: 'Deadlines',
  data_gap: 'Data gaps',
};

/** The four counts the Home needs-attention row shows (GUI decision 5a). */
export const HOME_COUNT_KINDS: readonly AttentionKind[] = [
  'conflict',
  'stack_must_confirm',
  'missing',
  'deadline',
] as const;

/** Cap on the free-text "why" note, enforced before anything is sent. */
export const NOTE_MAX_LENGTH = 500;

/** How many open items the Home row shows when expanded. */
export const HOME_TOP_N = 5;

const ACTIVITY_SEEN_KEY = 'bb2dash:activity-seen';

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

export const syncKeys = {
  status: () => ['sync-status'] as const,
  attention: (state?: AttentionState) => ['attention-items', state ?? 'all'] as const,
  attentionAll: () => ['attention-items'] as const,
  agentRequest: (id: number) => ['agent-request', id] as const,
  activity: (limit: number) => ['activity', limit] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Input validation (pure — every write goes through these first)
 * ------------------------------------------------------------------------ */

/** A row id must be a positive integer before it goes into a filter. */
export function assertRowId(id: unknown, what = 'id'): number {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error(`${what} must be a positive integer, got ${String(id)}`);
  }
  return id;
}

/**
 * Trim the "why" note, drop it when empty, and refuse anything over the cap.
 * The note is optional on every resolution but always travels with it.
 */
export function normalizeNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null;
  if (typeof note !== 'string') throw new Error('note must be text');
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > NOTE_MAX_LENGTH) {
    throw new Error(`note is ${trimmed.length} characters; the limit is ${NOTE_MAX_LENGTH}`);
  }
  return trimmed;
}

/**
 * Parse a date answer. Accepts exactly 'YYYY-MM-DD' (what an input[type=date]
 * emits) and round-trips it through Date so 2026-02-31 is rejected rather than
 * silently rolled forward.
 */
export function parseDateAnswer(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`expected a date as YYYY-MM-DD, got "${String(value)}"`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  const ok =
    parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
  if (!ok) throw new Error(`"${value}" is not a real date`);
  return value;
}

/** Trim a free-text answer, refuse an empty one, and cap it like the note. */
export function parseTextAnswer(value: string): string {
  if (typeof value !== 'string') throw new Error('answer must be text');
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error('answer is empty');
  if (trimmed.length > NOTE_MAX_LENGTH) {
    throw new Error(`answer is ${trimmed.length} characters; the limit is ${NOTE_MAX_LENGTH}`);
  }
  return trimmed;
}

/* ---------------------------------------------------------------------------
 * Resolutions — the per-kind controls the Inbox offers
 * ------------------------------------------------------------------------ */

/**
 * What Stack can answer, per kind (brief, Web surfaces):
 *   conflict                     Accept Blackboard / Keep mine
 *   stack_must_confirm, missing  a text or date input
 *   deadline, data_gap           Dismiss
 * Every variant carries the optional free-text "why".
 */
export type ResolveInput =
  | { id: number; kind: 'conflict'; accept: 'blackboard' | 'keep'; note?: string | null }
  | {
      id: number;
      kind: 'stack_must_confirm' | 'missing';
      answer: string;
      answerType: 'text' | 'date';
      note?: string | null;
    }
  | { id: number; kind: 'deadline' | 'data_gap'; note?: string | null };

/** The exact column patch a resolution writes. `applied_at` is the agent's. */
export interface ResolutionPatch {
  state: AttentionState;
  resolved_at: string;
  resolution: Record<string, unknown>;
  resolution_note: string | null;
}

/**
 * Build the update body for one resolution. Pure, so the request shape per kind
 * is testable without a client. Throws on anything the boundary rules reject.
 *
 * `conflict` uses the accept vocabulary migration 034 applies:
 * `resolution->>'accept' = 'blackboard'` writes `to_value` to the field,
 * `'keep'` confirms the row we already have.
 */
export function buildResolutionPatch(input: ResolveInput, now: Date = new Date()): ResolutionPatch {
  assertRowId(input.id, 'attention item id');
  const resolution_note = normalizeNote(input.note);
  const resolved_at = now.toISOString();

  switch (input.kind) {
    case 'conflict': {
      if (input.accept !== 'blackboard' && input.accept !== 'keep') {
        throw new Error(`unknown conflict answer "${String(input.accept)}"`);
      }
      return {
        state: 'resolved',
        resolved_at,
        resolution: { accept: input.accept },
        resolution_note,
      };
    }
    case 'stack_must_confirm':
    case 'missing': {
      const value =
        input.answerType === 'date' ? parseDateAnswer(input.answer) : parseTextAnswer(input.answer);
      return {
        state: 'resolved',
        resolved_at,
        resolution: { value, value_type: input.answerType },
        resolution_note,
      };
    }
    case 'deadline':
    case 'data_gap': {
      return {
        state: 'dismissed',
        resolved_at,
        resolution: { dismissed: true },
        resolution_note,
      };
    }
    default: {
      const never: never = input;
      throw new Error(`unknown attention kind ${JSON.stringify(never)}`);
    }
  }
}

/* ---------------------------------------------------------------------------
 * Normalisers (pure — the view and the summary envelope are jsonb, so trust
 * nothing about their inner shape)
 * ------------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTextOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Coerce `sync_runs.summary` into the envelope, tolerating a partial one. */
export function normalizeSummary(value: unknown): SyncSummary | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const raised = raw.attention_raised;
  return {
    stages: asRecord(raw.stages),
    changes: Array.isArray(raw.changes) ? raw.changes : [],
    attention_raised: typeof raised === 'number' && Number.isFinite(raised) ? raised : null,
  };
}

/**
 * The plain-language change lines of a summary. The contract says strings; an
 * object carrying a `label` (the D2 `Change` shape) is accepted rather than
 * rendered as "[object Object]". Anything else is dropped, not invented.
 */
export function changeLines(summary: SyncSummary | null): string[] {
  if (!summary) return [];
  const out: string[] = [];
  for (const entry of summary.changes) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      out.push(entry.trim());
      continue;
    }
    const record = asRecord(entry);
    const label = record?.label;
    if (typeof label === 'string' && label.trim().length > 0) out.push(label.trim());
  }
  return out;
}

/** Coerce the `open_attention` jsonb into per-kind counts; unknown keys drop. */
export function normalizeOpenAttention(value: unknown): Partial<Record<AttentionKind, number>> {
  const raw = asRecord(value);
  const out: Partial<Record<AttentionKind, number>> = {};
  if (!raw) return out;
  for (const kind of ATTENTION_KIND_ORDER) {
    const n = raw[kind];
    const parsed = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) out[kind] = parsed;
  }
  return out;
}

/** Coerce the freshness jsonb array; rows without a stage name are dropped. */
export function normalizeFreshness(value: unknown): FreshnessRow[] {
  if (!Array.isArray(value)) return [];
  const out: FreshnessRow[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    const stage = row?.stage;
    if (typeof stage !== 'string' || stage.length === 0) continue;
    out.push({
      stage,
      fresh_as_of: asTextOrNull(row?.fresh_as_of),
      last_attempt_at: asTextOrNull(row?.last_attempt_at),
      last_attempt_failed:
        typeof row?.last_attempt_failed === 'boolean' ? row.last_attempt_failed : null,
    });
  }
  return out;
}

/**
 * Normalise one `v_sync_status` row. The view is selected with `*` so a column
 * naming difference at integration degrades to a null field rather than a 400,
 * and the freshness array is accepted under either of its two plausible names.
 */
export function normalizeSyncStatus(row: unknown): SyncStatus | null {
  const raw = asRecord(row);
  if (!raw) return null;
  const status = raw.status;
  return {
    id: typeof raw.id === 'number' ? raw.id : null,
    run_id: asTextOrNull(raw.run_id),
    status:
      status === 'running' || status === 'ok' || status === 'partial' || status === 'failed'
        ? status
        : null,
    started_at: asTextOrNull(raw.started_at),
    finished_at: asTextOrNull(raw.finished_at),
    trigger: asTextOrNull(raw.trigger),
    summary: normalizeSummary(raw.summary),
    open_attention: normalizeOpenAttention(raw.open_attention),
    freshness: normalizeFreshness(raw.freshness ?? raw.data_freshness),
  };
}

/* ---------------------------------------------------------------------------
 * Display helpers (pure)
 * ------------------------------------------------------------------------ */

const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

/** "just now" / "12 min ago" / "3 hrs ago" / "yesterday" / "4 days ago". */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const ms = now.getTime() - then;
  if (ms < MS_MINUTE) return 'just now';
  if (ms < MS_HOUR) return `${Math.round(ms / MS_MINUTE)} min ago`;
  if (ms < MS_DAY) {
    const hours = Math.round(ms / MS_HOUR);
    return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(ms / MS_DAY);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * The freshness half of the Home row's second line: the stalest stage, named,
 * when it is more than a day old — "files stale 2 days". A stage whose last
 * attempt failed is called out instead, because that is the more urgent fact.
 * Returns null when there is nothing true to say; nothing is invented.
 */
export function stalenessLine(freshness: FreshnessRow[], now: Date = new Date()): string | null {
  if (freshness.length === 0) return null;

  const failed = freshness.filter((row) => row.last_attempt_failed === true);
  if (failed.length > 0) {
    const names = failed.map((row) => row.stage).sort();
    return `${names.join(', ')} last attempt failed`;
  }

  const neverRun = freshness.find((row) => !row.fresh_as_of);
  if (neverRun) return `${neverRun.stage} never synced`;

  let stalest: FreshnessRow | null = null;
  let stalestAt = Number.POSITIVE_INFINITY;
  for (const row of freshness) {
    const at = new Date(row.fresh_as_of as string).getTime();
    if (!Number.isFinite(at)) continue;
    if (at < stalestAt) {
      stalestAt = at;
      stalest = row;
    }
  }
  if (!stalest) return null;

  const days = Math.floor((now.getTime() - stalestAt) / MS_DAY);
  if (days < 1) return null;
  return `${stalest.stage} stale ${days} day${days === 1 ? '' : 's'}`;
}

/** The whole second line: "last synced 3 hrs ago · files stale 2 days". */
export function freshnessLine(status: SyncStatus | null, now: Date = new Date()): string {
  if (!status || status.id === null) return 'no sync recorded yet';
  const parts: string[] = [];
  if (status.status === 'running') parts.push('sync running');
  else parts.push(`last synced ${relativeTime(status.finished_at ?? status.started_at, now)}`);
  if (status.status === 'partial') parts.push('last run partial');
  if (status.status === 'failed') parts.push('last run failed');
  const stale = stalenessLine(status.freshness, now);
  if (stale) parts.push(stale);
  return parts.join(' · ');
}

/** Total open items across every kind. */
export function totalOpen(status: SyncStatus | null): number {
  if (!status) return 0;
  return ATTENTION_KIND_ORDER.reduce((sum, kind) => sum + (status.open_attention[kind] ?? 0), 0);
}

/** The command Stack pastes into a terminal to run the crawl half of a sync. */
export function syncCommand(requestId: number): string {
  assertRowId(requestId, 'agent request id');
  return `claude "/bb-sync ${requestId}"`;
}

/** Group attention items by kind, in Inbox order, dropping empty groups. */
export function groupByKind(
  items: readonly AttentionItem[],
): { kind: AttentionKind; items: AttentionItem[] }[] {
  return ATTENTION_KIND_ORDER.map((kind) => ({
    kind,
    items: items.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0);
}

/** A resolution Stack gave that the transform has not folded in yet. */
export function isAwaitingApply(item: AttentionItem): boolean {
  return item.state !== 'open' && item.applied_at === null;
}

/** Render a jsonb from/to/suggested value as text without inventing one. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.length > 0 ? value : '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

/* ---------------------------------------------------------------------------
 * Activity seen marker (localStorage — per browser, never sent anywhere)
 * ------------------------------------------------------------------------ */

/**
 * The highest `sync_runs.id` Stack has already seen in the Activity list.
 * Every storage access is wrapped: a private window, disabled site data or a
 * server render all throw, and none of them is a reason to break the nav.
 */
export function readActivitySeen(): number {
  try {
    const raw = window.localStorage.getItem(ACTIVITY_SEEN_KEY);
    if (raw === null) return 0;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/** Record the newest run id as seen. Silent on failure, by design. */
export function writeActivitySeen(runId: number): void {
  try {
    if (!Number.isInteger(runId) || runId <= 0) return;
    window.localStorage.setItem(ACTIVITY_SEEN_KEY, String(runId));
  } catch {
    /* storage unavailable — the badge simply keeps showing */
  }
}

/** How many entries are newer than the seen marker. */
export function unseenCount(entries: readonly ActivityEntry[], seen: number): number {
  return entries.filter((entry) => entry.runId > seen).length;
}

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/** `v_sync_status` — the one row the Home row and the Inbox header read. */
export function syncStatusOptions() {
  return queryOptions({
    queryKey: syncKeys.status(),
    queryFn: async (): Promise<SyncStatus | null> => {
      const supabase = untypedClient();
      const { data, error } = await supabase.from('v_sync_status').select('*').maybeSingle();
      if (error) throw error;
      return normalizeSyncStatus(data);
    },
    // The cron folds a crawl every two minutes; a minute of staleness is fine.
    staleTime: 60 * 1000,
  });
}

const ATTENTION_COLUMNS =
  'id, raised_at, raised_by, kind, course_id, entity, ref, field, from_value, to_value, ' +
  'question, suggested, state, resolved_at, resolution, resolution_note, applied_at';

/**
 * `attention_items`. Pass a state to scope the list (the Home row wants only
 * `open`); the Inbox reads them all so it can show answered and dismissed rows.
 */
export function attentionItemsOptions(state?: AttentionState) {
  return queryOptions({
    queryKey: syncKeys.attention(state),
    queryFn: async (): Promise<AttentionItem[]> => {
      const supabase = untypedClient();
      let query = supabase.from('attention_items').select(ATTENTION_COLUMNS);
      if (state) query = query.eq('state', state);
      const { data, error } = await query
        .order('raised_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AttentionItem[];
    },
    staleTime: 60 * 1000,
  });
}

const AGENT_REQUEST_COLUMNS =
  'id, created_at, kind, scope, params, note, state, claimed_at, claimed_by, ' +
  'finished_at, sync_run_id, result';

/** One `agent_requests` row, polled while the Sync button is waiting on it. */
export function agentRequestOptions(id: number | null) {
  return queryOptions({
    queryKey: syncKeys.agentRequest(id ?? 0),
    enabled: id !== null,
    queryFn: async (): Promise<AgentRequest | null> => {
      const requestId = assertRowId(id, 'agent request id');
      const supabase = untypedClient();
      const { data, error } = await supabase
        .from('agent_requests')
        .select(AGENT_REQUEST_COLUMNS)
        .eq('id', requestId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AgentRequest | null;
    },
    // A queued or claimed request only moves when a Claude session moves it.
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'queued' || state === 'claimed' ? 10 * 1000 : false;
    },
    staleTime: 0,
  });
}

/** Flatten the latest runs' `summary.changes` into Activity lines, newest first. */
export function activityOptions(limit = 8) {
  return queryOptions({
    queryKey: syncKeys.activity(limit),
    queryFn: async (): Promise<ActivityEntry[]> => {
      const supabase = untypedClient();
      const { data, error } = await supabase
        .from('sync_runs')
        .select('id, ran_at, started_at, finished_at, status, summary')
        .order('id', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return activityEntries(data ?? []);
    },
    staleTime: 60 * 1000,
  });
}

/** Pure: rows of `sync_runs` to Activity lines, newest run first. */
export function activityEntries(rows: readonly unknown[]): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const row of rows) {
    const raw = asRecord(row);
    if (!raw || typeof raw.id !== 'number') continue;
    const runId = raw.id;
    const status = raw.status;
    const at = asTextOrNull(raw.finished_at) ?? asTextOrNull(raw.ran_at) ?? asTextOrNull(raw.started_at);
    changeLines(normalizeSummary(raw.summary)).forEach((line, lineNo) => {
      out.push({
        runId,
        lineNo,
        at,
        status:
          status === 'running' || status === 'ok' || status === 'partial' || status === 'failed'
            ? status
            : null,
        line,
      });
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Writes
 * ------------------------------------------------------------------------ */

/**
 * Resolve (or dismiss) one attention item. The app owns `state`, `resolved_at`,
 * `resolution` and `resolution_note` and nothing else on the row — `applied_at`
 * belongs to the transform, which is why a resolved row reads "answered,
 * applies on next sync" until the agent stamps it.
 */
export async function resolveAttentionItem(input: ResolveInput): Promise<void> {
  const patch = buildResolutionPatch(input);
  const supabase = untypedClient();
  const { error } = await supabase.from('attention_items').update(patch).eq('id', input.id);
  if (error) throw error;
}

/** What the Sync button (and later, other request buttons) sends. */
export interface CreateAgentRequestInput {
  kind: AgentRequestKind;
  scope?: string | null;
  params?: Record<string, unknown>;
  note?: string | null;
}

/**
 * Insert an `agent_requests` row and hand back the id, which is what the
 * `claude "/bb-sync <id>"` command needs. The app never runs the crawl itself:
 * Blackboard's session lives in Stack's browser behind NetID plus Duo.
 */
export async function createAgentRequest(input: CreateAgentRequestInput): Promise<AgentRequest> {
  if (input.kind !== 'sync' && input.kind !== 'transform') {
    throw new Error(`agent request kind "${String(input.kind)}" is not allowed this phase`);
  }
  const scope =
    input.scope === undefined || input.scope === null ? null : parseTextAnswer(input.scope);
  const note = normalizeNote(input.note);
  const params = input.params ?? {};
  if (asRecord(params) === null) throw new Error('params must be an object');

  const supabase = untypedClient();
  const { data, error } = await supabase
    .from('agent_requests')
    .insert({ kind: input.kind, scope, params, note })
    .select(AGENT_REQUEST_COLUMNS)
    .single();
  if (error) throw error;
  if (!data) throw new Error('the request was not returned after insert');
  return data as unknown as AgentRequest;
}

/**
 * Copy text to the clipboard, reporting whether it worked. Clipboard access is
 * denied outside a secure context and in some embedded views, and a silent
 * failure would leave Stack thinking he has a command he does not have.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

export function useSyncStatus() {
  return useQuery(syncStatusOptions());
}

export function useAttentionItems(state?: AttentionState) {
  return useQuery(attentionItemsOptions(state));
}

export function useAgentRequest(id: number | null) {
  return useQuery(agentRequestOptions(id));
}

export function useActivity(limit = 8) {
  return useQuery(activityOptions(limit));
}

/** Resolve an item, then refresh the Inbox and the Home counts together. */
export function useResolveAttentionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resolveAttentionItem,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: syncKeys.attentionAll() });
      void queryClient.invalidateQueries({ queryKey: syncKeys.status() });
    },
  });
}

/** File an agent request (the Sync button). */
export function useCreateAgentRequest() {
  return useMutation({ mutationFn: createAgentRequest });
}
