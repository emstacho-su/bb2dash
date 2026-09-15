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

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  APP_PROPERTY,
  buildEventBody,
  calendarEventId,
  type CalendarEventBody,
  colourIdForCourse,
  contentHash,
  type GoogleCalendar,
  type GoogleResult,
  type PushItem,
  stableStringify,
} from "./google.ts";
import { isRateLimited, type MirrorRow, type MirrorStore, runPush } from "./push.ts";

const CALENDAR = "bb2dash-test@group.calendar.google.com";

// ------------------------------------------------------------------------------------------
// Fixtures. event_at values are verbatim from the SQL fixture transaction (verification §4).
// ------------------------------------------------------------------------------------------

function item(over: Partial<PushItem> & { assignment_id: string }): PushItem {
  return {
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
    ...over,
  };
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
      insert(_calendarId, body) {
        calls.push({ op: "insert", id: body.id });
        return Promise.resolve(next("insert", ok(200, '"inserted"')));
      },
      patch(_calendarId, eventId) {
        calls.push({ op: "patch", id: eventId });
        return Promise.resolve(next("patch", ok(200, '"patched"')));
      },
      remove(_calendarId, eventId) {
        calls.push({ op: "delete", id: eventId });
        return Promise.resolve(next("delete", ok(204, null)));
      },
      list() {
        calls.push({ op: "list", id: "" });
        return Promise.resolve({ status: 200, ids: [], error: null });
      },
    },
  };
}

function memoryStore(): { store: MirrorStore; rows: Map<string, MirrorRow> } {
  const rows = new Map<string, MirrorRow>();
  return {
    rows,
    store: {
      saveSuccess(row) {
        rows.set(row.assignment_id, { ...row });
        return Promise.resolve();
      },
      saveFailure(assignmentId) {
        // The real store updates last_error on an existing row and never creates one.
        return Promise.resolve(void assignmentId);
      },
      markDeleting(assignmentId) {
        const row = rows.get(assignmentId);
        if (row) rows.set(assignmentId, { ...row, state: "deleting" });
        return Promise.resolve();
      },
      remove(assignmentId) {
        rows.delete(assignmentId);
        return Promise.resolve();
      },
    },
  };
}

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
    desired,
    mirror: [],
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.counts, {
    scanned: 4,
    inserted: 4,
    patched: 0,
    deleted: 0,
    unchanged: 0,
    failed: 0,
  });
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
    desired,
    mirror: [],
    google: first.client,
    store,
    sleep: noSleep,
  });

  const second = fakeGoogle();
  const result = await runPush({
    calendarId: CALENDAR,
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
    desired,
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.counts, {
    scanned: 3,
    inserted: 0,
    patched: 1,
    deleted: 1,
    unchanged: 2,
    failed: 0,
  });

  const patched = google.calls.filter((c) => c.op === "patch");
  const deleted = google.calls.filter((c) => c.op === "delete");
  assert.equal(patched.length, 1);
  assert.equal(deleted.length, 1);
  assert.equal(patched[0].id, await calendarEventId("IST.323/quiz-09"));
  assert.equal(deleted[0].id, await calendarEventId("IST.352/knowledge-check-09-14-26"));
  assert.equal(rows.has("IST.352/knowledge-check-09-14-26"), false);
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
    desired: afterCrawl,
    mirror: [...rows.values()],
    google: google.client,
    store,
    sleep: noSleep,
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.counts, {
    scanned: 4,
    inserted: 0,
    patched: 0,
    deleted: 1,
    unchanged: 3,
    failed: 0,
  });
  assert.deepEqual(google.calls.map((c) => c.op), ["delete"]);
  assert.equal(google.calls[0].id, await calendarEventId("IST.352/knowledge-check-09-14-26"));
  assert.equal(rows.size, 3);
  assert.equal(rows.has("IST.323/exam-2"), true);
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
    const body = buildEventBody(source, "bbdeadbeef");
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
    const body = buildEventBody(item({ assignment_id: "x", type, event_at: eventAt }), "bbx");
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
  const body = buildEventBody(baseDesired()[0], "bbx");
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
    desired: [baseDesired()[0]],
    mirror: [],
    google: fakeGoogle().client,
    store,
    sleep: noSleep,
  });

  const google = fakeGoogle({ delete: [{ status: 404, etag: null, error: "HTTP 404: notFound" }] });
  const result = await runPush({
    calendarId: CALENDAR,
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
