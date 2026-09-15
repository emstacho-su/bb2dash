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
// assignment that lost its date, one that left the workload, and one the newest Blackboard crawl
// stopped reporting (Q3), because all four leave v_calendar_push_items the same way. A fifth
// case runs before all of them: a mirror row pointing at a calendar that is no longer the
// configured one is deleted from THAT calendar and dropped, so the item is re-created on the
// new one instead of being abandoned on the old.

import {
  buildEventBody,
  calendarEventId,
  type CalendarEventBody,
  contentHash,
  type GoogleCalendar,
  type GoogleResult,
  type PushItem,
} from "./google.ts";

export interface MirrorRow {
  assignment_id: string;
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
  saveFailure(assignmentId: string, error: string): Promise<void>;
  markDeleting(assignmentId: string): Promise<void>;
  remove(assignmentId: string): Promise<void>;
}

export interface PushCounts {
  scanned: number;
  inserted: number;
  patched: number;
  deleted: number;
  unchanged: number;
  failed: number;
}

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

/** 1 s, 2 s, 4 s, then give up on that item and carry on with the rest of the run. */
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000];

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

  const counts: PushCounts = {
    scanned: desired.length,
    inserted: 0,
    patched: 0,
    deleted: 0,
    unchanged: 0,
    failed: 0,
  };
  const errors: string[] = [];

  // Q3: an item the newest folded crawl of its course stopped reporting leaves the desired set,
  // which is precisely how its event comes to be deleted below.
  const wanted = desired.filter((item) => !item.absent_from_blackboard);
  const wantedIds = new Set(wanted.map((item) => item.assignment_id));
  const byAssignment = new Map(mirror.map((row) => [row.assignment_id, row]));

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

    await store.markDeleting(row.assignment_id);
    const result = await withBackoff(() => google.remove(row.calendar_id, row.event_id), sleep);

    if (result.error && !isMissing(result)) {
      counts.failed += 1;
      errors.push(`${row.assignment_id}: on the previous calendar: ${result.error}`);
      await store.saveFailure(row.assignment_id, result.error);
      skip.add(row.assignment_id);
      continue;
    }

    counts.deleted += 1;
    await store.remove(row.assignment_id);
    byAssignment.delete(row.assignment_id);
  }

  for (const item of wanted) {
    if (skip.has(item.assignment_id)) continue;

    const eventId = await calendarEventId(item.assignment_id);
    const body = buildEventBody(item, eventId, webBaseUrl);
    const hash = await contentHash(body);
    const existing = byAssignment.get(item.assignment_id);

    // The whole idempotency proof: same hash, same calendar, still live — no API call is made.
    if (
      existing && existing.content_hash === hash && existing.state === "live" &&
      existing.calendar_id === calendarId
    ) {
      counts.unchanged += 1;
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
      counts.failed += 1;
      errors.push(`${item.assignment_id}: ${result.error}`);
      await store.saveFailure(item.assignment_id, result.error);
      continue;
    }

    counts[action] += 1;
    await store.saveSuccess({
      assignment_id: item.assignment_id,
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
    if (wantedIds.has(row.assignment_id)) continue;

    await store.markDeleting(row.assignment_id);
    const result = await withBackoff(() => google.remove(calendarId, row.event_id), sleep);

    // A 404 means somebody already deleted it in Google's UI. That is the desired end state, so
    // it counts as a delete rather than a failure the next run would retry forever.
    if (result.error && !isMissing(result)) {
      counts.failed += 1;
      errors.push(`${row.assignment_id}: ${result.error}`);
      await store.saveFailure(row.assignment_id, result.error);
      continue;
    }

    counts.deleted += 1;
    await store.remove(row.assignment_id);
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
