// bb2dash :: edge function `calendar-push` — tests
//
// Runs with no network and no database: a fake Google client records the calls, an in-memory
// map plays the calendar_events mirror, and the back-off's sleep is a spy that returns at once.
//
//   node --test supabase/functions/calendar-push/push_test.ts        (Node 22+; used here)
//   deno test --allow-none supabase/functions/calendar-push/         (same source, if Deno is
//                                                                     installed — it is not on
//                                                                     this machine)
//
// The four numbered runs are the Contract's:
//   1. empty mirror                        -> N inserts
//   2. the same data again                 -> zero Google calls
//   3. one date changed, one row deleted   -> exactly one patch and one delete
//   4. one Blackboard-linked item absent   -> exactly that event deleted, syllabus-only left
//
// The event_at rule, the in_workload filter and absent_from_blackboard live in SQL (migrations
// 060 and 065, v_calendar_push_items), so the authoritative test for them is the fixture
// transaction recorded in docs/planning/69a_W21_VERIFICATION.md §4. The instants below are its
// output, and the assertions here prove the TypeScript side does not move them: a date-only exam
// keeps its class-start instant and a date-only quiz its 23:59, on both sides of the 2026-11-01
// fall-back, and a meeting- or attendance-typed row never reaches the pusher at all.

//
// v4 (Phase 11b) adds the planner arm. Its tests are at the end of the file: one row per kind,
// an edit, a delete, a task ticked done, a mixed run with per-arm counts, zero writes on a
// re-run for both arms, the Los Angeles, all-day and online bodies, and the golden test that the
// assignment arm's body and hash are still v3's.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  APP_PROPERTY,
  buildEventBody,
  calendarEventId,
  type CalendarEventBody,
  colourIdForCourse,
  colourIdForKind,
  contentHash,
  DEFAULT_WEB_BASE_URL,
  DONE_PREFIX,
  type GoogleCalendar,
  type GoogleResult,
  itemLink,
  KIND_COLOUR_IDS,
  plannerEventId,
  type PushItem,
  stableStringify,
} from "./google.ts";
import {
  emptyCounts,
  isRateLimited,
  mirrorKey,
  type MirrorRow,
  type MirrorStore,
  PAGE_SIZE,
  type PageReader,
  type PushCounts,
  readAllPages,
  readAndRunPush,
  runPush,
} from "./push.ts";
import {
  createMirrorStore,
  type FilterChain,
  ITEM_ERROR_LIMIT,
  type MirrorTableClient,
} from "./store.ts";

const CALENDAR = "bb2dash-test@group.calendar.google.com";
const OLD_CALENDAR = "previous-calendar@group.calendar.google.com";
/** Deliberately not the production origin: the tests must fail if it gets baked back in. */
const WEB_BASE = "https://bb2dash.test";

// ------------------------------------------------------------------------------------------
// Fixtures. event_at values are verbatim from the SQL fixture transaction (verification §4).
// ------------------------------------------------------------------------------------------

/** The planner columns of v_calendar_push_items v2, all null on an assignment row (068). */
const NO_PLANNER_COLUMNS = {
  kind: null,
  kind_label: null,
  summary: null,
  starts_at: null,
  ends_at: null,
  time_zone: null,
  all_day: null,
  start_date: null,
  end_date: null,
  week_start: null,
  location_kind: null,
  location: null,
  notes: null,
  done: null,
} as const;

/**
 * An assignment-arm row. event_id is left empty ("not supplied") so the fixtures stay
 * synchronous; the pusher only cross-checks a view id that is present, and the tests at the end
 * of the file cover a present one, matching and not.
 */
function item(over: Partial<PushItem> & { assignment_id: string }): PushItem {
  return {
    source: "assignment",
    ref_id: over.assignment_id,
    event_id: "",
    course_id: "IST.323",
    course_code: "IST 323",
    title: "Untitled",
    type: "quiz",
    due_at: null,
    due_date: null,
    event_at: "2026-11-05T04:59:00+00:00",
    points_possible: null,
    status: "not_started",
    absent_from_blackboard: false,
    ...NO_PLANNER_COLUMNS,
    ...over,
  };
}

/** The six v3 totals, expanded to the full v4 counts object for a run with assignments only. */
function assignmentsOnly(totals: Partial<Record<string, number>>): PushCounts {
  const counts = emptyCounts() as unknown as Record<string, number>;
  for (const [verb, n] of Object.entries(totals)) {
    counts[verb] = n ?? 0;
    counts[`${verb}_assignments`] = n ?? 0;
  }
  return counts as unknown as PushCounts;
}

/** Four items: two syllabus-only, two Blackboard-linked. */
function baseDesired(): PushItem[] {
  return [
    item({
      assignment_id: "IST.323/exam-2",
      title: "Exam #2",
      type: "exam",
      due_date: "2026-10-21",
      event_at: "2026-10-21T19:45:00+00:00", // class start, EDT
      points_possible: 100,
    }),
    item({
      assignment_id: "IST.323/quiz-09",
      title: "Quiz #9",
      due_date: "2026-10-21",
      event_at: "2026-10-22T03:59:00+00:00", // 23:59 EDT
      points_possible: 5,
    }),
    item({
      assignment_id: "IST.466/major-project-2-su-it",
      course_id: "IST.466",
      course_code: "IST 466",
      title: "Major Project #2: SU IT case student presentation",
      type: "group_presentation",
      due_date: "2026-11-17",
      event_at: "2026-11-17T19:00:00+00:00",
    }),
    item({
      assignment_id: "IST.352/knowledge-check-09-14-26",
      course_id: "IST.352",
      course_code: "IST 352",
      title: "Knowledge Check - 09/14/26",
      due_at: "2026-09-14T16:50:00+00:00",
      event_at: "2026-09-14T16:50:00+00:00",
    }),
  ];
}

// ------------------------------------------------------------------------------------------
// Doubles
// ------------------------------------------------------------------------------------------

interface Call {
  op: "insert" | "patch" | "delete" | "list";
  id: string;
  /** R2b-5: which calendar the call was addressed to, not just which event. */
  calendarId: string;
  /** R3-1: the body Google was sent, so a test can assert it carries status confirmed. */
  body?: CalendarEventBody;
}

function fakeGoogle(
  responses: Partial<Record<Call["op"], GoogleResult[]>> = {},
): { client: GoogleCalendar; calls: Call[] } {
  const calls: Call[] = [];
  const queue = {
    insert: [...(responses.insert ?? [])],
    patch: [...(responses.patch ?? [])],
    delete: [...(responses.delete ?? [])],
  };
  const next = (op: "insert" | "patch" | "delete", fallback: GoogleResult): GoogleResult =>
    queue[op].length ? queue[op].shift()! : fallback;

  const ok = (status: number, etag: string | null): GoogleResult => ({ status, etag, error: null });

  return {
    calls,
    client: {
      insert(calendarId, body) {
        calls.push({ op: "insert", id: body.id, calendarId, body });
        return Promise.resolve(next("insert", ok(200, '"inserted"')));
      },
      patch(calendarId, eventId, body) {
        calls.push({ op: "patch", id: eventId, calendarId, body });
        return Promise.resolve(next("patch", ok(200, '"patched"')));
      },
      remove(calendarId, eventId) {
        calls.push({ op: "delete", id: eventId, calendarId });
        return Promise.resolve(next("delete", ok(204, null)));
      },
      list(calendarId) {
        calls.push({ op: "list", id: "", calendarId });
        return Promise.resolve({ status: 200, ids: [], error: null });
      },
    },
  };
}

/** An in-memory calendar_events, keyed like the table: (source, ref_id). */
function memoryStore(): { store: MirrorStore; rows: Map<string, MirrorRow> } {
  const rows = new Map<string, MirrorRow>();
  return {
    rows,
    store: {
      saveSuccess(row) {
        rows.set(mirrorKey(row.source, row.ref_id), { ...row });
        return Promise.resolve();
      },
      saveFailure(source, refId) {
        // The real store updates last_error on an existing row and never creates one.
        return Promise.resolve(void mirrorKey(source, refId));
      },
      markDeleting(source, refId) {
        const key = mirrorKey(source, refId);
        const row = rows.get(key);
        if (row) rows.set(key, { ...row, state: "deleting" });
        return Promise.resolve();
      },
      remove(source, refId) {
        rows.delete(mirrorKey(source, refId));
        return Promise.resolve();
      },
    },
  };
}

/** A mirror key for an assignment row, for the v3 tests that address rows by assignment id. */
const assignmentKey = (assignmentId: string) => mirrorKey("assignment", assignmentId);

const noSleep = () => Promise.resolve();

// ------------------------------------------------------------------------------------------
// Run 1 — empty mirror
// ------------------------------------------------------------------------------------------

test("run 1: an empty mirror inserts one event per desired item", async () => {
  const desired = baseDesired();
  const google = fakeGoogle();
  const { store, rows } = memoryStore();

  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired,
    mirror: [],
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.counts, assignmentsOnly({
    scanned: 4,
    inserted: 4,
    patched: 0,
    deleted: 0,
    unchanged: 0,
    failed: 0,
  }));
  assert.equal(google.calls.filter((c) => c.op === "insert").length, 4);
  assert.equal(google.calls.filter((c) => c.op !== "insert").length, 0);
  assert.equal(rows.size, 4);

  for (const row of rows.values()) {
    assert.match(row.event_id, /^bb[0-9a-f]{32}$/);
    assert.equal(row.calendar_id, CALENDAR);
    assert.equal(row.state, "live");
  }
});

// ------------------------------------------------------------------------------------------
// Run 2 — idempotency
// ------------------------------------------------------------------------------------------

test("run 2: the same data again issues zero Google calls", async () => {
  const desired = baseDesired();
  const first = fakeGoogle();
  const { store, rows } = memoryStore();

  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired,
    mirror: [],
    google: first.client,
    store,
    sleep: noSleep,
  });

  const second = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: baseDesired(),
    mirror: [...rows.values()],
    google: second.client,
    store,
    sleep: noSleep,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.counts.unchanged, 4);
  assert.equal(result.counts.inserted + result.counts.patched + result.counts.deleted, 0);
  assert.deepEqual(second.calls, []);
});

// ------------------------------------------------------------------------------------------
// Run 3 — one date change, one deletion
// ------------------------------------------------------------------------------------------

test("run 3: one date change patches one event, one removed row deletes one", async () => {
  const { store, rows } = memoryStore();
  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: baseDesired(),
    mirror: [],
    google: fakeGoogle().client,
    store,
    sleep: noSleep,
  });

  // Quiz #9 moves a week; the IST.352 knowledge check is gone from the view entirely.
  const desired = baseDesired()
    .filter((i) => i.assignment_id !== "IST.352/knowledge-check-09-14-26")
    .map((i) =>
      i.assignment_id === "IST.323/quiz-09"
        ? { ...i, due_date: "2026-10-28", event_at: "2026-10-29T03:59:00+00:00" }
        : i
    );

  const google = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired,
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.counts, assignmentsOnly({
    scanned: 3,
    inserted: 0,
    patched: 1,
    deleted: 1,
    unchanged: 2,
    failed: 0,
  }));

  const patched = google.calls.filter((c) => c.op === "patch");
  const deleted = google.calls.filter((c) => c.op === "delete");
  assert.equal(patched.length, 1);
  assert.equal(deleted.length, 1);
  assert.equal(patched[0].id, await calendarEventId("IST.323/quiz-09"));
  assert.equal(deleted[0].id, await calendarEventId("IST.352/knowledge-check-09-14-26"));
  assert.equal(rows.has(assignmentKey("IST.352/knowledge-check-09-14-26")), false);
  assert.equal(rows.size, 3);
});

// ------------------------------------------------------------------------------------------
// Run 4 — a crawl that stopped reporting one Blackboard-linked item
// ------------------------------------------------------------------------------------------

test("run 4: an absent Blackboard item is deleted, syllabus-only items are left alone", async () => {
  const { store, rows } = memoryStore();
  const desired = baseDesired();
  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired,
    mirror: [],
    google: fakeGoogle().client,
    store,
    sleep: noSleep,
  });

  // The newest folded crawl of IST.352 no longer reports the knowledge check. Every other row is
  // syllabus-only (bb_item_id null), which the view can never mark absent.
  const afterCrawl = baseDesired().map((i) =>
    i.assignment_id === "IST.352/knowledge-check-09-14-26"
      ? { ...i, absent_from_blackboard: true }
      : i
  );

  const google = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: afterCrawl,
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.counts, assignmentsOnly({
    scanned: 4,
    inserted: 0,
    patched: 0,
    deleted: 1,
    unchanged: 3,
    failed: 0,
  }));
  assert.deepEqual(google.calls.map((c) => c.op), ["delete"]);
  assert.equal(google.calls[0].id, await calendarEventId("IST.352/knowledge-check-09-14-26"));
  assert.equal(rows.size, 3);
  assert.equal(rows.has(assignmentKey("IST.323/exam-2")), true);
});

// ------------------------------------------------------------------------------------------
// The event body
// ------------------------------------------------------------------------------------------

test("event ids are deterministic and match migration 060's calendar_event_id()", async () => {
  // The value on the right is what `select calendar_event_id('IST.323/quiz-03')` returns on prod.
  assert.equal(await calendarEventId("IST.323/quiz-03"), "bb3c534b09739b13428eb1df69e0e61877");
  assert.match(await calendarEventId("IST.466/letter-of-gratitude"), /^bb[0-9a-v]{32}$/);
});

test("every event carries app=bb2dash, the course code first, and zero length", () => {
  for (const source of baseDesired()) {
    const body = buildEventBody(source, "bbdeadbeef", WEB_BASE);
    assert.equal(body.status, "confirmed");
    assert.equal(body.extendedProperties.private.app, APP_PROPERTY);
    assert.equal(body.extendedProperties.private.assignment_id, source.assignment_id);
    assert.ok(body.summary.startsWith(source.course_code + " · "));
    assert.deepEqual(body.start, body.end);
    assert.equal(body.start.timeZone, "America/New_York");
    assert.equal(body.reminders.useDefault, true);
    assert.match(body.description, /Managed by bb2dash/);
    assert.ok(body.description.includes("?item=assignment:" + source.assignment_id));
  }
});

test("each course gets its own fixed colourId, unknown courses get graphite", () => {
  const seen = new Map<string, string>();
  for (
    const course of [
      "ECN.304",
      "GEO.103.lecture",
      "GEO.103.recitation",
      "IST.323",
      "IST.352",
      "IST.466",
      "IST.471",
    ]
  ) {
    const colour = colourIdForCourse(course);
    assert.ok(Number(colour) >= 1 && Number(colour) <= 11, `${course} -> ${colour}`);
    assert.equal(seen.has(colour), false, `${course} reuses colour ${colour}`);
    seen.set(colour, course);
  }
  assert.equal(colourIdForCourse("NEW.101"), "8");
});

test("event_at survives as the instant the view computed, on both sides of the fall-back", () => {
  // Verbatim from the SQL fixture transaction: IST.323 meets 15:45 America/New_York.
  const cases: [string, string, string][] = [
    ["exam", "2026-10-21T19:45:00+00:00", "2026-10-21T19:45:00Z"], // class start, EDT
    ["exam", "2026-11-04T20:45:00+00:00", "2026-11-04T20:45:00Z"], // class start, EST
    ["quiz", "2026-10-22T03:59:00+00:00", "2026-10-22T03:59:00Z"], // 23:59 EDT
    ["quiz", "2026-11-05T04:59:00+00:00", "2026-11-05T04:59:00Z"], // 23:59 EST
    ["exam", "2026-11-08T04:59:00+00:00", "2026-11-08T04:59:00Z"], // Saturday: no meeting, 23:59
  ];
  for (const [type, eventAt, expected] of cases) {
    const body = buildEventBody(
      item({ assignment_id: "x", type, event_at: eventAt }),
      "bbx",
      WEB_BASE,
    );
    assert.equal(body.start.dateTime, expected);
    assert.equal(body.end.dateTime, expected);
  }
});

test("a meeting- or attendance-typed row never reaches the pusher", async () => {
  // v_calendar_push_items filters in_workload = false, so these rows are simply not in the
  // desired set (proved in SQL, verification §4). What is asserted here is that the pusher makes
  // no call for anything it was not given, and that nothing synthesises an event from a mirror
  // row alone.
  const google = fakeGoogle();
  const { store } = memoryStore();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [],
    mirror: [],
    google: google.client,
    store,
    sleep: noSleep,
  });
  assert.deepEqual(google.calls, []);
  assert.equal(result.counts.scanned, 0);
});

test("the content hash ignores key order but not values", async () => {
  const body = buildEventBody(baseDesired()[0], "bbx", WEB_BASE);
  const reordered = JSON.parse(
    JSON.stringify({ reminders: body.reminders, ...body }),
  ) as CalendarEventBody;
  assert.equal(await contentHash(body), await contentHash(reordered));

  const moved = { ...body, start: { ...body.start, dateTime: "2026-10-22T19:45:00Z" } };
  assert.notEqual(await contentHash(body), await contentHash(moved));
  assert.ok(stableStringify({ b: 1, a: 2 }).startsWith('{"a"'));
});

// ------------------------------------------------------------------------------------------
// Recoveries and back-off
// ------------------------------------------------------------------------------------------

test("an insert that collides (409) falls back to patch", async () => {
  const google = fakeGoogle({ insert: [{ status: 409, etag: null, error: "HTTP 409: duplicate" }] });
  const { store, rows } = memoryStore();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [baseDesired()[0]],
    mirror: [],
    google: google.client,
    store,
    sleep: noSleep,
  });
  assert.deepEqual(google.calls.map((c) => c.op), ["insert", "patch"]);
  assert.equal(result.counts.patched, 1);
  assert.equal(result.counts.inserted, 0);
  assert.equal(rows.size, 1);
});

test("a patch for an event Google no longer holds (404) re-inserts it", async () => {
  const { store, rows } = memoryStore();
  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [baseDesired()[0]],
    mirror: [],
    google: fakeGoogle().client,
    store,
    sleep: noSleep,
  });

  const moved = [{ ...baseDesired()[0], event_at: "2026-10-22T19:45:00+00:00" }];
  const google = fakeGoogle({ patch: [{ status: 404, etag: null, error: "HTTP 404: notFound" }] });
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: moved,
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });
  assert.deepEqual(google.calls.map((c) => c.op), ["patch", "insert"]);
  assert.equal(result.counts.inserted, 1);
  assert.equal(result.status, "ok");
});

test("a rate limit is retried 1s / 2s / 4s and then given up on", async () => {
  const slept: number[] = [];
  const sleep = (ms: number) => {
    slept.push(ms);
    return Promise.resolve();
  };
  const limited: GoogleResult = {
    status: 403,
    etag: null,
    error: "HTTP 403: userRateLimitExceeded: Rate Limit Exceeded",
  };

  const recovers = fakeGoogle({ insert: [limited, limited, { status: 200, etag: '"e"', error: null }] });
  const a = memoryStore();
  const first = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [baseDesired()[0]],
    mirror: [],
    google: recovers.client,
    store: a.store,
    sleep,
  });
  assert.deepEqual(slept, [1000, 2000]);
  assert.equal(first.counts.inserted, 1);
  assert.equal(first.status, "ok");

  slept.length = 0;
  const persists = fakeGoogle({ insert: [limited, limited, limited, limited] });
  const b = memoryStore();
  const second = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [baseDesired()[0]],
    mirror: [],
    google: persists.client,
    store: b.store,
    sleep,
  });
  assert.deepEqual(slept, [1000, 2000, 4000]);
  assert.equal(second.counts.failed, 1);
  assert.equal(second.status, "partial");
  assert.equal(b.rows.size, 0, "a failed insert must not leave a mirror row claiming success");
});

test("a permanent 403 is not retried", async () => {
  const slept: number[] = [];
  const google = fakeGoogle({
    insert: [{ status: 403, etag: null, error: "HTTP 403: forbidden: insufficient scope" }],
  });
  const { store } = memoryStore();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [baseDesired()[0]],
    mirror: [],
    google: google.client,
    store,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  });
  assert.deepEqual(slept, []);
  assert.equal(google.calls.length, 1);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.status, "partial");
});

test("isRateLimited tells a quota 403 from an ordinary one", () => {
  assert.equal(isRateLimited({ status: 429, etag: null, error: "HTTP 429" }), true);
  assert.equal(
    isRateLimited({ status: 403, etag: null, error: "HTTP 403: rateLimitExceeded" }),
    true,
  );
  assert.equal(isRateLimited({ status: 403, etag: null, error: "HTTP 403: forbidden" }), false);
  assert.equal(isRateLimited({ status: 0, etag: null, error: "network down" }), false);
});

// ------------------------------------------------------------------------------------------
// The calendar the push refuses to touch
// ------------------------------------------------------------------------------------------

test("the push refuses to write to 'primary' or to an empty calendar id", async () => {
  const { store } = memoryStore();
  for (const calendarId of ["primary", ""]) {
    await assert.rejects(
      () =>
        runPush({
          calendarId,
          webBaseUrl: WEB_BASE,
          desired: baseDesired(),
          mirror: [],
          google: fakeGoogle().client,
          store,
          sleep: noSleep,
        }),
      /primary/,
    );
  }
});

test("a delete that comes back 404 still counts as deleted", async () => {
  const { store, rows } = memoryStore();
  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [baseDesired()[0]],
    mirror: [],
    google: fakeGoogle().client,
    store,
    sleep: noSleep,
  });

  const google = fakeGoogle({ delete: [{ status: 404, etag: null, error: "HTTP 404: notFound" }] });
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [],
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });
  assert.equal(result.counts.deleted, 1);
  assert.equal(result.counts.failed, 0);
  assert.equal(rows.size, 0);
});

// ------------------------------------------------------------------------------------------
// R2b-5 — the calendar was repointed
// ------------------------------------------------------------------------------------------

test("repointing the calendar deletes on the old id and inserts on the new", async () => {
  const { store, rows } = memoryStore();
  await runPush({
    calendarId: OLD_CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: baseDesired(),
    mirror: [],
    google: fakeGoogle().client,
    store,
    sleep: noSleep,
  });
  const onOldCalendar = [...rows.values()];
  assert.equal(onOldCalendar.length, 4);
  assert.ok(onOldCalendar.every((row) => row.calendar_id === OLD_CALENDAR));

  const google = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: baseDesired(),
    mirror: onOldCalendar,
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.deepEqual(result.counts, assignmentsOnly({
    scanned: 4,
    inserted: 4,
    patched: 0,
    deleted: 4,
    unchanged: 0,
    failed: 0,
  }));
  // Order matters: the old events come off before the new ones go on, or the mirror rows that
  // say where the old ones live are overwritten first.
  assert.deepEqual(
    google.calls.map((c) => c.op),
    ["delete", "delete", "delete", "delete", "insert", "insert", "insert", "insert"],
  );
  assert.deepEqual(
    google.calls.map((c) => c.calendarId),
    [OLD_CALENDAR, OLD_CALENDAR, OLD_CALENDAR, OLD_CALENDAR, CALENDAR, CALENDAR, CALENDAR, CALENDAR],
  );
  assert.equal(rows.size, 4);
  assert.ok([...rows.values()].every((row) => row.calendar_id === CALENDAR));
});

test("an orphan Google refuses to delete is retried next run, not re-created", async () => {
  const { store, rows } = memoryStore();
  await runPush({
    calendarId: OLD_CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [baseDesired()[0]],
    mirror: [],
    google: fakeGoogle().client,
    store,
    sleep: noSleep,
  });

  const google = fakeGoogle({
    delete: [{ status: 500, etag: null, error: "HTTP 500: backendError" }],
  });
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [baseDesired()[0]],
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.deepEqual(google.calls.map((c) => c.op), ["delete"]);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.counts.inserted, 0);
  assert.equal(result.status, "partial");
  assert.equal(
    rows.get(assignmentKey("IST.323/exam-2"))?.calendar_id,
    OLD_CALENDAR,
    "the row must keep pointing at the old calendar so the next run can retry the delete",
  );
});

// ------------------------------------------------------------------------------------------
// R2b-7 — the web origin is configuration, not code
// ------------------------------------------------------------------------------------------

test("the bb2dash link uses the injected origin, trailing slash and all", async () => {
  const source = baseDesired()[0];
  const plain = buildEventBody(source, "bbx", "https://bb2dash.example");
  assert.ok(
    plain.description.includes("https://bb2dash.example/?item=assignment:" + source.assignment_id),
  );

  const slashed = buildEventBody(source, "bbx", "https://bb2dash.example/");
  assert.equal(slashed.description, plain.description, "a trailing slash must not change the link");

  assert.equal(itemLink("", "IST.323/quiz-03"), DEFAULT_WEB_BASE_URL + "/?item=assignment:IST.323/quiz-03");

  // The origin is inside the canonical body, which is why it must be configuration: moving the
  // deployment moves every content_hash and therefore patches every event exactly once.
  const elsewhere = buildEventBody(source, "bbx", "https://bb2dash.other");
  assert.notEqual(await contentHash(plain), await contentHash(elsewhere));
});

// ------------------------------------------------------------------------------------------
// R3-1 — an item that comes back after being deleted
// ------------------------------------------------------------------------------------------

test("an item deleted and then re-added is un-cancelled, not silently invisible", async () => {
  const { store, rows } = memoryStore();
  const only = baseDesired()[0];

  // A. the item is pushed for the first time.
  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [only],
    mirror: [],
    google: fakeGoogle().client,
    store,
    sleep: noSleep,
  });
  assert.equal(rows.size, 1);

  // B. it leaves the desired set and the event is deleted. Google keeps the id, in status
  //    "cancelled" — which is why C cannot simply insert it again.
  const removed = fakeGoogle();
  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [],
    mirror: [...rows.values()],
    google: removed.client,
    store,
    sleep: noSleep,
  });
  assert.deepEqual(removed.calls.map((c) => c.op), ["delete"]);
  assert.equal(rows.size, 0);

  // C. it comes back. The mirror has forgotten it, so the pusher inserts; Google answers 409
  //    because the cancelled id is still taken, and the fallback patch has to say
  //    status: "confirmed" or the event stays invisible for ever.
  const back = fakeGoogle({ insert: [{ status: 409, etag: null, error: "HTTP 409: duplicate" }] });
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [only],
    mirror: [...rows.values()],
    google: back.client,
    store,
    sleep: noSleep,
  });

  assert.deepEqual(back.calls.map((c) => c.op), ["insert", "patch"]);
  const patched = back.calls[1];
  assert.equal(patched.id, await calendarEventId(only.ref_id));
  assert.equal(patched.body?.status, "confirmed", "the 409 fallback must un-cancel the event");
  assert.equal(result.counts.patched, 1);
  assert.equal(result.counts.failed, 0);
  assert.equal(rows.size, 1);
});

test("every write carries status confirmed, insert and patch alike", async () => {
  const { store, rows } = memoryStore();
  const first = fakeGoogle();
  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: baseDesired(),
    mirror: [],
    google: first.client,
    store,
    sleep: noSleep,
  });

  const moved = baseDesired().map((i) => ({ ...i, event_at: "2026-12-01T05:00:00+00:00" }));
  const second = fakeGoogle();
  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: moved,
    mirror: [...rows.values()],
    google: second.client,
    store,
    sleep: noSleep,
  });

  const bodies = [...first.calls, ...second.calls].filter((c) => c.body);
  assert.equal(bodies.length, 8);
  assert.ok(bodies.every((c) => c.body?.status === "confirmed"));
});

// ==========================================================================================
// v4 — the planner arm (Phase 11b, migration 068, K-5..K-7)
// ==========================================================================================

/** Kind labels exactly as migration 068's view writes them (K-6). */
const KIND_LABELS: Readonly<Record<string, string>> = {
  event: "Event",
  task: "Task",
  out_of_office: "Out of office",
  focus_time: "Focus time",
  working_location: "Working location",
  appointment_slot: "Appointment slot",
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * A planner-arm row shaped like 068's output. summary is what SQL builds —
 * "[<course code> · ]<kind label> · <title>" — so a test that sets a course passes it too.
 */
function plannerItem(over: Partial<PushItem> & { ref_id: string; kind: string }): PushItem {
  const label = KIND_LABELS[over.kind];
  const title = over.title ?? `bb2dash test · ${over.kind}`;
  const startsAt = over.starts_at ?? "2026-09-21T17:00:00+00:00";
  return {
    source: "planner",
    event_id: "",
    assignment_id: null,
    course_id: null,
    course_code: null,
    title,
    type: null,
    due_at: null,
    due_date: null,
    event_at: startsAt,
    points_possible: null,
    status: null,
    absent_from_blackboard: false,
    kind_label: label,
    summary: `${label} · ${title}`,
    starts_at: startsAt,
    ends_at: "2026-09-21T18:00:00+00:00",
    time_zone: "America/New_York",
    all_day: false,
    start_date: null,
    end_date: null,
    week_start: "2026-09-21",
    location_kind: null,
    location: null,
    notes: null,
    done: over.kind === "task" ? false : null,
    ...over,
  };
}

/** One planner row per kind, uuids 1..6. */
function onePerKind(): PushItem[] {
  return Object.keys(KIND_LABELS).map((kind, i) => plannerItem({ ref_id: uuid(i + 1), kind }));
}

/** A mirror already holding `desired`, as after a first successful run. */
async function seeded(desired: PushItem[]) {
  const mirror = memoryStore();
  await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired,
    mirror: [],
    google: fakeGoogle().client,
    store: mirror.store,
    sleep: noSleep,
  });
  return mirror;
}

test("planner: one row per kind inserts six events, each with its kind's label and colour", async () => {
  const google = fakeGoogle();
  const { store, rows } = memoryStore();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: onePerKind(),
    mirror: [],
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.counts.inserted_planner, 6);
  assert.equal(result.counts.inserted_assignments, 0);
  assert.equal(google.calls.length, 6);
  assert.ok(google.calls.every((c) => c.op === "insert"));

  for (const [i, kind] of Object.keys(KIND_LABELS).entries()) {
    const ref = uuid(i + 1);
    const body = google.calls[i].body!;
    assert.equal(body.id, await plannerEventId(ref));
    assert.match(body.id, /^pe[0-9a-f]{32}$/);
    assert.equal(body.summary, `${KIND_LABELS[kind]} · bb2dash test · ${kind}`);
    assert.equal(body.colorId, KIND_COLOUR_IDS[kind]);
    assert.ok(body.description.includes(`bb2dash: ${KIND_LABELS[kind]}`));
    assert.ok(body.description.endsWith(`${WEB_BASE}/planner?week=2026-09-21`));
    assert.deepEqual(body.extendedProperties.private, { app: APP_PROPERTY, planner_event_id: ref });
    assert.equal(body.status, "confirmed");
    assert.equal(rows.get(mirrorKey("planner", ref))?.source, "planner");
  }
  assert.equal(rows.size, 6);
});

test("planner: the six kinds have six distinct fixed colours, and the kind wins over a course", () => {
  const colours = Object.keys(KIND_LABELS).map((kind) => colourIdForKind(kind));
  assert.equal(new Set(colours).size, 6);
  assert.ok(colours.every((c) => Number(c) >= 1 && Number(c) <= 11));
  assert.equal(colourIdForKind("nonsense"), "8");

  const withCourse = plannerItem({
    ref_id: uuid(1),
    kind: "focus_time",
    course_id: "IST.323",
    course_code: "IST 323",
    title: "Exam prep",
    summary: "IST 323 · Focus time · Exam prep",
  });
  const body = buildEventBody(withCourse, "pex", WEB_BASE);
  assert.equal(body.colorId, KIND_COLOUR_IDS.focus_time);
  assert.notEqual(body.colorId, colourIdForCourse("IST.323"));
  assert.equal(body.summary, "IST 323 · Focus time · Exam prep");
});

test("planner: an edited time patches exactly one event", async () => {
  const { store, rows } = await seeded(onePerKind());
  const edited = onePerKind().map((i) =>
    i.ref_id === uuid(1)
      ? { ...i, starts_at: "2026-09-21T19:00:00+00:00", ends_at: "2026-09-21T20:00:00+00:00" }
      : i
  );
  const google = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: edited,
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });
  assert.deepEqual(
    google.calls.map((c) => [c.op, c.id]),
    [["patch", await plannerEventId(uuid(1))]],
  );
  assert.equal(result.counts.patched_planner, 1);
  assert.equal(result.counts.unchanged_planner, 5);
  const start = google.calls[0].body!.start as { dateTime: string };
  assert.equal(start.dateTime, "2026-09-21T19:00:00Z");
});

test("planner: a deleted planner event deletes exactly one Google event", async () => {
  const { store, rows } = await seeded(onePerKind());
  const google = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: onePerKind().filter((i) => i.ref_id !== uuid(3)),
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });
  assert.deepEqual(
    google.calls.map((c) => [c.op, c.id]),
    [["delete", await plannerEventId(uuid(3))]],
  );
  assert.equal(result.counts.deleted_planner, 1);
  assert.equal(result.counts.deleted_assignments, 0);
  assert.equal(rows.has(mirrorKey("planner", uuid(3))), false);
  assert.equal(rows.size, 5);
});

test("planner: a task marked done patches once and its title gains the check mark", async () => {
  const { store, rows } = await seeded(onePerKind());
  const done = onePerKind().map((i) => (i.kind === "task" ? { ...i, done: true } : i));
  const google = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: done,
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });
  assert.equal(google.calls.length, 1);
  assert.equal(google.calls[0].op, "patch");
  assert.equal(google.calls[0].body!.summary, `${DONE_PREFIX}Task · bb2dash test · task`);
  assert.equal(DONE_PREFIX, "✓ ");
  assert.equal(result.counts.patched_planner, 1);

  // done only decorates a task; a stray true on another kind (the database forbids it) does not.
  const notTask = buildEventBody(
    plannerItem({ ref_id: uuid(9), kind: "event", done: true }),
    "pex",
    WEB_BASE,
  );
  assert.ok(!notTask.summary.startsWith(DONE_PREFIX));
});

test("planner: a mixed run keeps both arms' counts separate", async () => {
  // Mirror holds the four assignments and six planner events. Then: one assignment date moves,
  // one assignment disappears, one planner event is edited, one is deleted, one new one is added.
  const { store, rows } = await seeded([...baseDesired(), ...onePerKind()]);
  const desired = [
    ...baseDesired()
      .filter((i) => i.assignment_id !== "IST.466/major-project-2-su-it")
      .map((i) =>
        i.assignment_id === "IST.323/quiz-09" ? { ...i, event_at: "2026-10-29T03:59:00+00:00" } : i
      ),
    ...onePerKind()
      .filter((i) => i.ref_id !== uuid(2))
      .map((i) => (i.ref_id === uuid(5) ? { ...i, notes: "bring laptop" } : i)),
    plannerItem({ ref_id: uuid(7), kind: "event", title: "new one", summary: "Event · new one" }),
  ];
  const google = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired,
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.counts, {
    scanned: 9,
    inserted: 1,
    patched: 2,
    deleted: 2,
    unchanged: 6,
    failed: 0,
    scanned_assignments: 3,
    inserted_assignments: 0,
    patched_assignments: 1,
    deleted_assignments: 1,
    unchanged_assignments: 2,
    failed_assignments: 0,
    scanned_planner: 6,
    inserted_planner: 1,
    patched_planner: 1,
    deleted_planner: 1,
    unchanged_planner: 4,
    failed_planner: 0,
  });
  assert.equal(google.calls.length, 5);
});

test("planner: a re-run with no change issues zero writes on both arms", async () => {
  const both = () => [...baseDesired(), ...onePerKind()];
  const { store, rows } = await seeded(both());
  const google = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: both(),
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });
  assert.deepEqual(google.calls, []);
  assert.equal(result.counts.unchanged_assignments, 4);
  assert.equal(result.counts.unchanged_planner, 6);
  for (const verb of ["inserted", "patched", "deleted", "failed"] as const) {
    assert.equal(result.counts[`${verb}_assignments`], 0, verb);
    assert.equal(result.counts[`${verb}_planner`], 0, verb);
  }
});

test("planner body: an event entered in America/Los_Angeles keeps its instant and its zone", () => {
  // 09:00-10:00 PDT on Monday 2026-09-21 is 16:00-17:00 UTC and 12:00-13:00 in New York.
  const la = plannerItem({
    ref_id: uuid(1),
    kind: "event",
    starts_at: "2026-09-21T16:00:00+00:00",
    ends_at: "2026-09-21T17:00:00+00:00",
    time_zone: "America/Los_Angeles",
  });
  const body = buildEventBody(la, "pex", WEB_BASE);
  assert.deepEqual(body.start, {
    dateTime: "2026-09-21T16:00:00Z",
    timeZone: "America/Los_Angeles",
    date: null,
  });
  assert.deepEqual(body.end, {
    dateTime: "2026-09-21T17:00:00Z",
    timeZone: "America/Los_Angeles",
    date: null,
  });
  // The same instant shown in another zone is a different body, so the zone edit is pushed.
  const ny = buildEventBody({ ...la, time_zone: "America/New_York" }, "pex", WEB_BASE);
  assert.notEqual(stableStringify(body), stableStringify(ny));
});

test("planner body: an all-day event sends the exclusive date pair and clears dateTime", () => {
  // 068's view: start_date / end_date are the local dates, end exclusive (067, K-3).
  const allDay = plannerItem({
    ref_id: uuid(3),
    kind: "out_of_office",
    starts_at: "2026-09-27T07:00:00+00:00",
    ends_at: "2026-09-29T07:00:00+00:00",
    time_zone: "America/Los_Angeles",
    all_day: true,
    start_date: "2026-09-27",
    end_date: "2026-09-29",
  });
  const body = buildEventBody(allDay, "pex", WEB_BASE);
  assert.deepEqual(body.start, { date: "2026-09-27", dateTime: null, timeZone: null });
  assert.deepEqual(body.end, { date: "2026-09-29", dateTime: null, timeZone: null });

  // An all-day row the view could not date is a failed item, never a guessed event.
  assert.throws(
    () => buildEventBody({ ...allDay, start_date: null }, "pex", WEB_BASE),
    /all-day row without start_date/,
  );
});

test("planner body: an online URL goes in location and description; a place in location only", () => {
  const url = "https://meet.google.com/abc-defg-hij";
  const online = buildEventBody(
    plannerItem({
      ref_id: uuid(4),
      kind: "appointment_slot",
      location_kind: "online",
      location: url,
      notes: "Office hours",
      week_start: "2026-09-21",
    }),
    "pex",
    WEB_BASE,
  );
  assert.equal(online.location, url);
  assert.equal(
    online.description,
    [
      "Office hours",
      "",
      url,
      "bb2dash: Appointment slot",
      `${WEB_BASE}/planner?week=2026-09-21`,
    ].join("\n"),
  );

  const inPerson = buildEventBody(
    plannerItem({
      ref_id: uuid(5),
      kind: "working_location",
      location_kind: "in_person",
      location: "Bird Library",
    }),
    "pex",
    WEB_BASE,
  );
  assert.equal(inPerson.location, "Bird Library");
  assert.ok(!inPerson.description.includes("Bird Library"));

  // No location is an explicit null, so removing a location in bb2dash clears it in Google.
  const none = buildEventBody(plannerItem({ ref_id: uuid(6), kind: "event" }), "pex", WEB_BASE);
  assert.equal(none.location, null);
  assert.equal(none.description, `bb2dash: Event\n${WEB_BASE}/planner?week=2026-09-21`);
});

test("planner event ids are deterministic and match migration 068's view", async () => {
  // The value on the right is what 068's view returned for this uuid in the dry-run on prod.
  assert.equal(await plannerEventId(uuid(1)), "pe11e594f481958c10e3015d0bf0447a22");
  assert.match(await plannerEventId(uuid(2)), /^pe[0-9a-v]{32}$/);
  assert.notEqual(
    await plannerEventId("IST.323/quiz-03"),
    await calendarEventId("IST.323/quiz-03"),
  );
});

test("a view event_id that disagrees with the computed id fails the item and writes nothing", async () => {
  const good = { ...baseDesired()[0], event_id: await calendarEventId("IST.323/exam-2") };
  const bad = plannerItem({ ref_id: uuid(1), kind: "event", event_id: "pe" + "0".repeat(32) });
  const google = fakeGoogle();
  const { store, rows } = memoryStore();
  const result = await runPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    desired: [good, bad],
    mirror: [],
    google: google.client,
    store,
    sleep: noSleep,
  });
  assert.deepEqual(google.calls.map((c) => c.id), [good.event_id]);
  assert.equal(result.counts.inserted_assignments, 1);
  assert.equal(result.counts.failed_planner, 1);
  assert.equal(result.status, "partial");
  assert.match(result.errors[0], /differs from computed/);
  assert.equal(rows.has(mirrorKey("planner", uuid(1))), false);
});

test("golden: the assignment arm's body and hash are byte-for-byte v3's", async () => {
  // A real prod row (IST.323/exam-2) as v_calendar_push_items v2 returns it. The expected JSON
  // and hash were produced by calendar-push v3's google.ts at ddc8bba and equal the content_hash
  // in prod's calendar_events for this row, so a v4 that drifts by one byte fails here, before
  // the cut-over push would patch every due-date event on Stack's calendar.
  const row = item({
    assignment_id: "IST.323/exam-2",
    event_id: "bb863233340d4ca3699d9629aeb39bec61",
    title: "Exam #2",
    type: "exam",
    due_date: "2026-10-21",
    event_at: "2026-10-21T19:45:00+00:00",
    points_possible: 10,
    status: "not_started",
  });
  const eventId = await calendarEventId("IST.323/exam-2");
  assert.equal(eventId, row.event_id);

  const body = buildEventBody(row, eventId, DEFAULT_WEB_BASE_URL);
  const v3Json = '{"colorId":"11","description":"Type: exam\\nPoints: 10\\n' +
    "https://web-xi-ten-uy9xk6c6p0.vercel.app/?item=assignment:IST.323/exam-2\\n\\n" +
    'Managed by bb2dash — edits here are overwritten on the next push.",' +
    '"end":{"dateTime":"2026-10-21T19:45:00Z","timeZone":"America/New_York"},' +
    '"extendedProperties":{"private":{"app":"bb2dash","assignment_id":"IST.323/exam-2"}},' +
    '"id":"bb863233340d4ca3699d9629aeb39bec61","reminders":{"useDefault":true},' +
    '"start":{"dateTime":"2026-10-21T19:45:00Z","timeZone":"America/New_York"},' +
    '"status":"confirmed","summary":"IST 323 · Exam #2"}';
  assert.equal(stableStringify(body), v3Json);
  assert.equal(
    await contentHash(body),
    "283cdfd8d886691345208f896160f7b83f8650e9f829812c1bdb40ab6fe208d3",
  );
  assert.equal("location" in body, false, "the assignment arm never sends a location key");
});

// ==========================================================================================
// Round 2, R2-1 — both sides are read page by page, completely or not at all
// ==========================================================================================

/** PostgREST's silent response cap on this project. The fake enforces it like the server. */
const MAX_ROWS = 1000;

/**
 * A fake `.range()` reader over `rows`. `failOnCall` makes that call (1-based) return an error;
 * `mutate` runs before a call so a test can move rows between pages.
 */
function fakePages<T>(
  rows: T[],
  opts: { failOnCall?: number; mutate?: (call: number, rows: T[]) => void } = {},
): { read: PageReader<T>; ranges: [number, number][] } {
  const ranges: [number, number][] = [];
  const read: PageReader<T> = (from, to) => {
    ranges.push([from, to]);
    opts.mutate?.(ranges.length, rows);
    if (opts.failOnCall === ranges.length) {
      return Promise.resolve({ data: null, error: { message: "HTTP 503" }, count: null });
    }
    const size = Math.min(to - from + 1, MAX_ROWS);
    return Promise.resolve({ data: rows.slice(from, from + size), error: null, count: rows.length });
  };
  return { read, ranges };
}

const assignmentRows = (n: number): PushItem[] =>
  Array.from({ length: n }, (_, i) =>
    item({
      assignment_id: `ZZ.999/item-${String(i).padStart(5, "0")}`,
      title: `Item ${i}`,
      event_at: "2026-10-01T03:59:00+00:00",
    }));

test("R2-1: a side larger than one page is read completely, in fixed-size ranges", async () => {
  const rows = assignmentRows(1203);
  const pages = fakePages(rows);
  const read = await readAllPages("v_calendar_push_items", pages.read, (r) => r.ref_id);
  assert.equal(read.length, 1203);
  assert.deepEqual(read.map((r) => r.ref_id), rows.map((r) => r.ref_id));
  assert.equal(PAGE_SIZE, 500);
  assert.ok(PAGE_SIZE < MAX_ROWS, "a page must fit under PostgREST's max_rows");
  assert.deepEqual(pages.ranges, [[0, 499], [500, 999], [1000, 1499]]);

  // An exact multiple of the page size ends on an empty page, not one page early.
  const exact = fakePages(assignmentRows(1000));
  assert.equal((await readAllPages("x", exact.read, (r) => r.ref_id)).length, 1000);
  assert.deepEqual(exact.ranges, [[0, 499], [500, 999], [1000, 1499]]);
});

test("R2-1: 1200 unchanged events past the old row cap issue zero Google calls", async () => {
  // The bug R2-1 fixes: one unpaginated select would have returned 1000 of these, and the delete
  // pass would have removed the other 200 events from Stack's calendar.
  const desired = assignmentRows(1200);
  const { rows } = await seeded(desired);
  const google = fakeGoogle();
  const result = await readAndRunPush({
    calendarId: CALENDAR,
    webBaseUrl: WEB_BASE,
    readDesiredPage: fakePages(assignmentRows(1200)).read,
    readMirrorPage: fakePages([...rows.values()]).read,
    google: google.client,
    store: memoryStore().store,
    sleep: noSleep,
  });
  assert.deepEqual(google.calls, []);
  assert.equal(result.counts.unchanged_assignments, 1200);
  assert.equal(result.counts.deleted, 0);
});

test("R2-1: a page error aborts the run before any Google call or mirror write", async () => {
  const { rows } = await seeded(assignmentRows(3));
  for (const side of ["desired", "mirror"] as const) {
    const google = fakeGoogle();
    const writes: string[] = [];
    const store: MirrorStore = {
      saveSuccess: (r) => Promise.resolve(void writes.push(`save ${r.ref_id}`)),
      saveFailure: (_s, id) => Promise.resolve(void writes.push(`fail ${id}`)),
      markDeleting: (_s, id) => Promise.resolve(void writes.push(`deleting ${id}`)),
      remove: (_s, id) => Promise.resolve(void writes.push(`remove ${id}`)),
    };
    await assert.rejects(
      readAndRunPush({
        calendarId: CALENDAR,
        webBaseUrl: WEB_BASE,
        // Page size 2: the failure lands on the SECOND page, after a partial list exists.
        pageSize: 2,
        readDesiredPage: fakePages(assignmentRows(3), { failOnCall: side === "desired" ? 2 : undefined }).read,
        readMirrorPage: fakePages([...rows.values()], { failOnCall: side === "mirror" ? 2 : undefined }).read,
        google: google.client,
        store,
        sleep: noSleep,
      }),
      side === "desired"
        ? /v_calendar_push_items: reading rows 2-3 failed: HTTP 503/
        : /calendar_events: reading rows 2-3 failed: HTTP 503/,
    );
    assert.deepEqual(google.calls, [], `${side}: no Google call`);
    assert.deepEqual(writes, [], `${side}: no mirror write`);
  }
});

test("R2-1: rows that move between pages abort the read instead of skipping one", async () => {
  const key = (r: PushItem) => r.ref_id;

  // A row deleted before page 2: the count moves, and offset paging would have skipped a row.
  const deleted = fakePages(assignmentRows(5), { mutate: (call, rows) => call === 2 && rows.splice(0, 1) });
  await assert.rejects(readAllPages("v", deleted.read, key, 2), /row count moved from 5 to 4/);

  // A reader that repeats a row across pages (an insert shifted it) is caught by its key.
  const base = assignmentRows(4);
  const repeating: PageReader<PushItem> = (from) =>
    Promise.resolve({ data: from === 0 ? base.slice(0, 2) : base.slice(1, 3), error: null, count: null });
  await assert.rejects(readAllPages("v", repeating, key, 2), /read twice/);

  // Fewer rows than the count claims (a page the server cut short) is not a complete read.
  const short: PageReader<PushItem> = () =>
    Promise.resolve({ data: base.slice(0, 1), error: null, count: 4 });
  await assert.rejects(readAllPages("v", short, key, 2), /read 1 rows but the count is 4/);
});

// ==========================================================================================
// Round 2, R2-2 — every mirror write checks PostgREST's error
// ==========================================================================================

interface TableCall {
  op: "upsert" | "update" | "delete";
  values?: Record<string, unknown>;
  options?: unknown;
  filters: [string, unknown][];
}

/** A fake of the supabase-js slice store.ts uses; `errors` makes an operation answer an error. */
function fakeTable(errors: Partial<Record<TableCall["op"], string>> = {}) {
  const calls: TableCall[] = [];
  const result = (op: TableCall["op"]) => ({
    error: errors[op] ? { message: errors[op]! } : null,
  });
  const chain = (call: TableCall): FilterChain => {
    const c: FilterChain = {
      eq(column, value) {
        call.filters.push([column, value]);
        return c;
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve(result(call.op)).then(onfulfilled, onrejected);
      },
    };
    return c;
  };
  const client: MirrorTableClient = {
    from(table) {
      assert.equal(table, "calendar_events");
      return {
        upsert(values, options) {
          calls.push({ op: "upsert", values, options, filters: [] });
          return Promise.resolve(result("upsert"));
        },
        update(values) {
          const call: TableCall = { op: "update", values, filters: [] };
          calls.push(call);
          return chain(call);
        },
        delete() {
          const call: TableCall = { op: "delete", filters: [] };
          calls.push(call);
          return chain(call);
        },
      };
    },
  };
  return { client, calls };
}

const NOW = "2026-09-16T21:00:00.000Z";
const liveRow: MirrorRow = {
  source: "planner",
  ref_id: uuid(1),
  event_id: "pe11e594f481958c10e3015d0bf0447a22",
  calendar_id: CALENDAR,
  content_hash: "h",
  etag: '"e"',
  state: "live",
};

test("R2-2: every mirror write throws when PostgREST answers with an error", async () => {
  const failing = createMirrorStore(
    fakeTable({ upsert: "boom", update: "boom", delete: "boom" }).client,
    () => NOW,
  );
  await assert.rejects(failing.saveSuccess(liveRow), /calendar_events upsert: boom/);
  await assert.rejects(
    failing.saveFailure("planner", uuid(1), "HTTP 500"),
    /calendar_events update last_error: boom/,
  );
  await assert.rejects(failing.markDeleting("planner", uuid(1)), /calendar_events update state: boom/);
  await assert.rejects(failing.remove("planner", uuid(1)), /calendar_events delete: boom/);
});

test("R2-2: the store scopes every write by (source, ref_id) and caps last_error", async () => {
  const { client, calls } = fakeTable();
  const store = createMirrorStore(client, () => NOW);
  await store.saveSuccess(liveRow);
  await store.saveFailure("assignment", "IST.323/quiz-03", "x".repeat(ITEM_ERROR_LIMIT + 50));
  await store.markDeleting("planner", uuid(2));
  await store.remove("planner", uuid(3));

  assert.deepEqual(calls[0], {
    op: "upsert",
    values: { ...liveRow, last_error: null, last_pushed_at: NOW, updated_at: NOW },
    options: { onConflict: "source,ref_id" },
    filters: [],
  });
  assert.deepEqual(calls[1].filters, [["source", "assignment"], ["ref_id", "IST.323/quiz-03"]]);
  assert.equal((calls[1].values!.last_error as string).length, ITEM_ERROR_LIMIT);
  assert.deepEqual(calls[2], {
    op: "update",
    values: { state: "deleting", updated_at: NOW },
    filters: [["source", "planner"], ["ref_id", uuid(2)]],
  });
  assert.deepEqual(calls[3], { op: "delete", filters: [["source", "planner"], ["ref_id", uuid(3)]] });
});

test("R2-2: a failed markDeleting stops the run before Google is asked to delete", async () => {
  const { rows } = await seeded(onePerKind());
  const google = fakeGoogle();
  await assert.rejects(
    runPush({
      calendarId: CALENDAR,
      webBaseUrl: WEB_BASE,
      desired: onePerKind().filter((i) => i.ref_id !== uuid(3)), // uuid(3) must be deleted
      mirror: [...rows.values()],
      google: google.client,
      store: createMirrorStore(fakeTable({ update: "connection reset" }).client, () => NOW),
      sleep: noSleep,
    }),
    /calendar_events update state: connection reset/,
  );
  assert.deepEqual(google.calls, []);
});
