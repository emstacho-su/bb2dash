// bb2dash :: edge function `calendar-push` — push.ts
// One push run: diff what SHOULD be on the calendar against what the mirror says IS on it, and
// make the smallest set of Google calls that closes the gap.
//
// WHY THIS IS A SEPARATE FILE FROM index.ts. index.ts owns the HTTP request, the shared-secret
// check and the Supabase client; none of that can run outside the edge runtime. The algorithm
// below owns the decisions the definition of done asks to be proven — zero writes on a re-run,
// exactly one patch after a date change, exactly one delete after an item disappears — and it
// takes every collaborator as an argument, so the tests drive it with a fake Google client, an
// in-memory mirror and a sleep that does not sleep. No Deno globals, no remote imports: the same
// source runs under `node --test`.
//
// THE DIFF, in one paragraph. Every desired item is hashed into a canonical event body. An item
// the mirror has never seen is inserted; an item whose hash is unchanged costs no API call at
// all; an item whose hash moved is patched. A mirror row with no matching desired item is
// deleted from Google and then from the mirror — that covers a deleted assignment, an
// assignment that lost its date, one that left the workload, one the newest Blackboard crawl
// stopped reporting (Q3), and a deleted planner event, because all of them leave
// v_calendar_push_items the same way. A further case runs before all of them: a mirror row
// pointing at a calendar that is no longer the configured one is deleted from THAT calendar and
// dropped, so the item is re-created on the new one instead of being abandoned on the old.
//
// v4 (Phase 11b). Two arms share this one diff: `source` 'assignment' (due dates, unchanged
// from v3) and 'planner' (events Stack creates in the planner). Everything is keyed by
// (source, ref_id), the mirror's primary key since migration 068, and every count is kept twice:
// the six totals v3 wrote, and the same six split per arm (K-7), so a run that touched only
// planner events visibly issued zero writes on the assignment arm.

import {
  buildEventBody,
  type CalendarEventBody,
  contentHash,
  eventIdFor,
  type GoogleCalendar,
  type GoogleResult,
  type PushItem,
  type PushSource,
} from "./google.ts";

export interface MirrorRow {
  source: PushSource;
  ref_id: string;
  event_id: string;
  calendar_id: string;
  content_hash: string;
  etag: string | null;
  state: string;
}

/** Everything the run needs to write back, so the algorithm never speaks to PostgREST itself. */
export interface MirrorStore {
  saveSuccess(row: MirrorRow): Promise<void>;
  /** Records last_error on an EXISTING row; never invents one for an event Google refused. */
  saveFailure(source: PushSource, refId: string, error: string): Promise<void>;
  markDeleting(source: PushSource, refId: string): Promise<void>;
  remove(source: PushSource, refId: string): Promise<void>;
}

export const COUNT_VERBS = [
  "scanned",
  "inserted",
  "patched",
  "deleted",
  "unchanged",
  "failed",
] as const;
export type CountVerb = typeof COUNT_VERBS[number];

/** The per-arm suffix K-7 names: `inserted_assignments`, `inserted_planner`, ... */
export type ArmSuffix = "assignments" | "planner";

/** The six v3 totals, then each of them per arm. calendar_push_runs.counts is this object. */
export type PushCounts =
  & Record<CountVerb, number>
  & Record<`${CountVerb}_${ArmSuffix}`, number>;

export interface RunPushDeps {
  calendarId: string;
  /** Every row of v_calendar_push_items, absent ones included — they are what gets deleted. */
  desired: PushItem[];
  mirror: MirrorRow[];
  google: GoogleCalendar;
  store: MirrorStore;
  /** app_settings.web_base_url: the origin of each event's "open in bb2dash" link (066). */
  webBaseUrl: string;
  /** Injected so the back-off costs nothing in tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RunPushResult {
  status: "ok" | "partial";
  counts: PushCounts;
  errors: string[];
}

// ------------------------------------------------------------------------------------------
// Round 2, R2-1: reading both sides of the diff completely, or not at all
// ------------------------------------------------------------------------------------------
//
// PostgREST caps a response at max_rows (1000 on this project) and says nothing when it does.
// A truncated desired set is the worst failure this function can have: the delete pass would
// take every event past the cap off Stack's calendar. So both sides are read page by page, in
// a fixed total order ((source, ref_id) is unique on both the view and the mirror), and a side
// that cannot be read completely throws, which aborts the run before a single Google call.
//
// Offset paging over a table that changes mid-read can skip or repeat a row. Each page asks for
// the exact row count; if the count moves between pages, if a key repeats, or if the rows read
// do not add up to the count, the read throws too. Any such change also raises gcal_dirty
// (061, 067 triggers), so the next tick simply tries again.

/**
 * Well under the project's max_rows (1000), so a full page is never silently cut short by the
 * server and "a short page is the last page" stays true.
 */
export const PAGE_SIZE = 500;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  /** The exact row count PostgREST reports with `count: "exact"`; null when not asked for. */
  count: number | null;
}

/** Reads rows `from`..`to` inclusive (PostgREST's `.range()`), in a stable total order. */
export type PageReader<T> = (from: number, to: number) => Promise<PageResult<T>>;

export async function readAllPages<T>(
  label: string,
  readPage: PageReader<T>,
  keyOf: (row: T) => string,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`${label}: page size must be a positive integer`);
  }
  const rows: T[] = [];
  const seen = new Set<string>();
  let expected: number | null = null;

  for (let from = 0;; from += pageSize) {
    const to = from + pageSize - 1;
    const page = await readPage(from, to);
    if (page.error) {
      throw new Error(`${label}: reading rows ${from}-${to} failed: ${page.error.message}`);
    }
    if (page.count !== null) {
      if (expected === null) expected = page.count;
      else if (page.count !== expected) {
        throw new Error(`${label}: row count moved from ${expected} to ${page.count} mid-read`);
      }
    }
    const data = page.data ?? [];
    if (data.length > pageSize) {
      throw new Error(`${label}: page ${from}-${to} returned ${data.length} rows`);
    }
    for (const row of data) {
      const key = keyOf(row);
      if (seen.has(key)) throw new Error(`${label}: ${key} was read twice; the rows moved mid-read`);
      seen.add(key);
      rows.push(row);
    }
    if (data.length < pageSize) break;
  }

  if (expected !== null && rows.length !== expected) {
    throw new Error(`${label}: read ${rows.length} rows but the count is ${expected}`);
  }
  return rows;
}

export interface PagedPushDeps extends Omit<RunPushDeps, "desired" | "mirror"> {
  readDesiredPage: PageReader<PushItem>;
  readMirrorPage: PageReader<MirrorRow>;
  pageSize?: number;
}

/**
 * Read both sides completely, then run the diff. A read failure rejects before runPush is
 * reached, so nothing is ever diffed against a partial list and Google is never called.
 */
export async function readAndRunPush(deps: PagedPushDeps): Promise<RunPushResult> {
  const { readDesiredPage, readMirrorPage, pageSize, ...rest } = deps;
  const keyOf = (row: { source: PushSource; ref_id: string }) => mirrorKey(row.source, row.ref_id);
  const desired = await readAllPages("v_calendar_push_items", readDesiredPage, keyOf, pageSize);
  const mirror = await readAllPages("calendar_events", readMirrorPage, keyOf, pageSize);
  return runPush({ ...rest, desired, mirror });
}

/** 1 s, 2 s, 4 s, then give up on that item and carry on with the rest of the run. */
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000];

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function emptyCounts(): PushCounts {
  const counts = {} as Record<string, number>;
  for (const verb of COUNT_VERBS) {
    counts[verb] = 0;
    counts[`${verb}_assignments`] = 0;
    counts[`${verb}_planner`] = 0;
  }
  return counts as PushCounts;
}

function armOf(source: PushSource): ArmSuffix {
  return source === "planner" ? "planner" : "assignments";
}

/** Adds one to a verb's total and to that verb's count for the row's arm. */
function bump(counts: PushCounts, verb: CountVerb, source: PushSource): void {
  counts[verb] += 1;
  counts[`${verb}_${armOf(source)}`] += 1;
}

/** The mirror's primary key as one string. A source never contains ':', so this cannot clash. */
export function mirrorKey(source: PushSource, refId: string): string {
  return `${source}:${refId}`;
}

/**
 * Google signals "slow down" two ways: 429, and 403 with a rateLimitExceeded reason. A plain 403
 * (wrong calendar, scope not granted) is a permanent error and must NOT be retried — retrying it
 * would turn a misconfiguration into twelve seconds of dead time per item.
 */
export function isRateLimited(result: GoogleResult): boolean {
  if (result.status === 429) return true;
  if (result.status !== 403) return false;
  return /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(result.error ?? "");
}

async function withBackoff(
  call: () => Promise<GoogleResult>,
  sleep: (ms: number) => Promise<void>,
): Promise<GoogleResult> {
  let result = await call();
  for (const delay of BACKOFF_MS) {
    if (!isRateLimited(result)) return result;
    await sleep(delay);
    result = await call();
  }
  return result;
}

/** Google says the event is not there: 404 (never was / already gone) or 410 (deleted). */
function isMissing(result: GoogleResult): boolean {
  return result.status === 404 || result.status === 410;
}

export async function runPush(deps: RunPushDeps): Promise<RunPushResult> {
  const { calendarId, desired, mirror, google, store, webBaseUrl } = deps;
  const sleep = deps.sleep ?? realSleep;

  if (!calendarId || calendarId === "primary") {
    // Belt and braces with the check constraint in migration 061. The push never, under any
    // failure mode, writes to the account's default calendar.
    throw new Error("calendar-push refuses to write to 'primary'");
  }

  const counts = emptyCounts();
  for (const item of desired) bump(counts, "scanned", item.source);
  const errors: string[] = [];

  // Q3: an item the newest folded crawl of its course stopped reporting leaves the desired set,
  // which is precisely how its event comes to be deleted below. Planner rows are never absent.
  const wanted = desired.filter((item) => !item.absent_from_blackboard);
  const wantedKeys = new Set(wanted.map((item) => mirrorKey(item.source, item.ref_id)));
  const byKey = new Map(mirror.map((row) => [mirrorKey(row.source, row.ref_id), row]));

  // R2b-5. A mirror row written to a DIFFERENT calendar is an orphan: Stack repointed
  // app_settings.gcal_calendar_id and that event is still sitting on the old calendar where
  // nothing will ever touch it again. It has to come off the old calendar BEFORE the desired
  // pass, because that pass re-inserts the same item into the new calendar and overwrites its
  // mirror row - doing it the other way round would destroy the only record of where the old
  // event is. An orphan whose removal fails keeps its row AND its item is skipped this run, so
  // the record survives for the next one to retry.
  const skip = new Set<string>();
  for (const row of mirror) {
    if (row.calendar_id === calendarId) continue;
    const key = mirrorKey(row.source, row.ref_id);

    await store.markDeleting(row.source, row.ref_id);
    const result = await withBackoff(() => google.remove(row.calendar_id, row.event_id), sleep);

    if (result.error && !isMissing(result)) {
      bump(counts, "failed", row.source);
      errors.push(`${key}: on the previous calendar: ${result.error}`);
      await store.saveFailure(row.source, row.ref_id, result.error);
      skip.add(key);
      continue;
    }

    bump(counts, "deleted", row.source);
    await store.remove(row.source, row.ref_id);
    byKey.delete(key);
  }

  for (const item of wanted) {
    const key = mirrorKey(item.source, item.ref_id);
    if (skip.has(key)) continue;

    const eventId = await eventIdFor(item);
    // The view computes the same id in SQL (060, 068). If the two ever disagree, writing under
    // either would strand an event the other side cannot find, so the item fails loudly instead.
    if (item.event_id && item.event_id !== eventId) {
      bump(counts, "failed", item.source);
      errors.push(`${key}: view event_id ${item.event_id} differs from computed ${eventId}`);
      continue;
    }

    let body: CalendarEventBody;
    try {
      body = buildEventBody(item, eventId, webBaseUrl);
    } catch (cause) {
      bump(counts, "failed", item.source);
      errors.push(`${key}: ${cause instanceof Error ? cause.message : String(cause)}`);
      continue;
    }
    const hash = await contentHash(body);
    const existing = byKey.get(key);

    // The whole idempotency proof: same hash, same calendar, still live — no API call is made.
    if (
      existing && existing.content_hash === hash && existing.state === "live" &&
      existing.calendar_id === calendarId
    ) {
      bump(counts, "unchanged", item.source);
      continue;
    }

    const { result, action } = await writeEvent(
      google,
      calendarId,
      eventId,
      body,
      Boolean(existing),
      sleep,
    );

    if (result.error) {
      bump(counts, "failed", item.source);
      errors.push(`${key}: ${result.error}`);
      await store.saveFailure(item.source, item.ref_id, result.error);
      continue;
    }

    bump(counts, action, item.source);
    await store.saveSuccess({
      source: item.source,
      ref_id: item.ref_id,
      event_id: eventId,
      calendar_id: calendarId,
      content_hash: hash,
      etag: result.etag,
      state: "live",
    });
  }

  for (const row of mirror) {
    // Rows on another calendar were dealt with by the orphan pass above.
    if (row.calendar_id !== calendarId) continue;
    const key = mirrorKey(row.source, row.ref_id);
    if (wantedKeys.has(key)) continue;

    await store.markDeleting(row.source, row.ref_id);
    const result = await withBackoff(() => google.remove(calendarId, row.event_id), sleep);

    // A 404 means somebody already deleted it in Google's UI. That is the desired end state, so
    // it counts as a delete rather than a failure the next run would retry forever.
    if (result.error && !isMissing(result)) {
      bump(counts, "failed", row.source);
      errors.push(`${key}: ${result.error}`);
      await store.saveFailure(row.source, row.ref_id, result.error);
      continue;
    }

    bump(counts, "deleted", row.source);
    await store.remove(row.source, row.ref_id);
  }

  return { status: counts.failed > 0 ? "partial" : "ok", counts, errors };
}

/**
 * Insert or patch, with the two recoveries the Contract names:
 *   - inserting an id Google already holds (409) is a patch in disguise;
 *   - patching an id Google no longer holds (404/410 — Stack deleted it by hand) is an insert.
 */
async function writeEvent(
  google: GoogleCalendar,
  calendarId: string,
  eventId: string,
  body: CalendarEventBody,
  hasMirrorRow: boolean,
  sleep: (ms: number) => Promise<void>,
): Promise<{ result: GoogleResult; action: "inserted" | "patched" }> {
  if (!hasMirrorRow) {
    const inserted = await withBackoff(() => google.insert(calendarId, body), sleep);
    if (inserted.status !== 409) return { result: inserted, action: "inserted" };
    const patched = await withBackoff(() => google.patch(calendarId, eventId, body), sleep);
    return { result: patched, action: "patched" };
  }

  const patched = await withBackoff(() => google.patch(calendarId, eventId, body), sleep);
  if (!isMissing(patched)) return { result: patched, action: "patched" };
  const inserted = await withBackoff(() => google.insert(calendarId, body), sleep);
  return { result: inserted, action: "inserted" };
}
