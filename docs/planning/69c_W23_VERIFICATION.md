# 69c — W-23 verification (Phase 11b, planner events: database + Google Calendar push)

Worker: W-23. Branch `feat/planner-events-11b-db`, worktree `bb2dash-wt-pe-db`, cut from
`feat/planner-events-11b` at `ddc8bba`.
Contract: `docs/planning/69b_PHASE11B_planner_events.md` § "Contract (frozen)" and PM kickoff notes
K-1..K-11. Date: 2026-09-16. Project `goultdzqcavefcgnifdy` (prod; there is no staging).

Everything below was captured against prod. All times are UTC.

**End state on prod:** 067 and 068 applied, `calendar-push` **v4** live with `verify_jwt = false`,
`gcal_enabled = true`, zero `planner_events` rows, zero `planner` mirror rows, 64 mirror rows and
64 `app=bb2dash` events on Google, lock free, `gcal_dirty` false.

## 1. What shipped

| Artefact | Applied / deployed as | Version | md5 (git blob, LF) |
|---|---|---|---|
| `db/migrations/067_planner_events.sql` | `067_planner_events` | `20260916201011` | `0f80614c9e151b97702e5d786de6b92a` |
| `db/migrations/068_calendar_push_planner_arm.sql` | `068_calendar_push_planner_arm` | `20260916202321` | `3dcfae62c5bd1ec6a2548afa428790f0` |
| `supabase/functions/calendar-push/{index,google,push}.ts` | edge function `calendar-push` | **v4**, `verify_jwt = false` | see §1.2 |

**067 was applied, committed and pushed first** (20:10 UTC, commit `5fd9ea5`) so W-24 could
regenerate `database.types.ts` from prod (K-10). 068 was committed unapplied (`2f10b8b`) and applied
only inside the K-5 cut-over (§3).

### 1.1 The md5s are the migration files' own

Both migrations were dry-run inside `begin; … rollback;` through `execute_sql` (§2) and then applied
under the file's name. The md5 above is the repo file's git blob (LF). **One difference from 69a
§1.1:** `apply_migration` stored 067 and 068 *with* their trailing newline (`right(statements[1], 1)
= chr(10)` is true for both, false for 066), so the matching expression is `md5(statements[1])`,
not `md5(statements[1] || chr(10))`. Verified after the proof:

```sql
select name, md5(statements[1]) from supabase_migrations.schema_migrations
 where name in ('067_planner_events', '068_calendar_push_planner_arm');
-- 067_planner_events               0f80614c9e151b97702e5d786de6b92a
-- 068_calendar_push_planner_arm    3dcfae62c5bd1ec6a2548afa428790f0
```

Both files are pure ASCII (068 writes the middle dot as `U&' \00B7 '`). Nothing at 069 or above
exists on prod; 001–066 were not edited.

### 1.2 The edge function's sources are the deployed sources

| File | v3 (git blob md5) | **v4** (git blob md5) | v4 bytes |
|---|---|---|---|
| `supabase/functions/calendar-push/index.ts` | `6c3e8712d58f71e60a34ee5c6feee1a4` | `216b3daf1e15668bb797cc8c547a0e31` | 13817 |
| `supabase/functions/calendar-push/google.ts` | `aca4de76c77cd75969905e00adb932f4` | `b48c5cd95e4fa8adb5adf5f37e8309a5` | 22147 |
| `supabase/functions/calendar-push/push.ts` | `8ea3ae9bd98feeb49f712c3d04d24012` | `95c2b5873ed4f1a422089f8e8a537d7e` | 12458 |

Before the deploy, `get_edge_function` showed v3 live (`ezbr_sha256 acec412f…`, matching 69a) with
the three v3 blobs above. v4 was deployed at **20:25:53.165**, `ezbr_sha256
4edc93119ac02372b904352f7032e9f8125ffb80ed1a3f5b52b75608a237d3c9`. The `get_edge_function` read-back
was saved to disk and compared **byte for byte** with `git show HEAD:<file>` by a script (not by
eye): all three files `IDENTICAL`, md5s as above, `verify_jwt false`, version 4. `push_test.ts` is
not deployed.

## 2. Dry runs (rolled back)

### 2.1 067

Six positive rows and twenty negative cases, run through a `pg_temp` helper that records each
statement's `sqlstate`, then rolled back (`to_regclass('planner_events')` was null afterwards).

| Case | Result |
|---|---|
| timed event NY; zero-length task `done=false`; all-day LA; online `https://` + course; all-day `America/Santiago` on 2026-09-06 (midnight skipped by DST); `UTC` + in_person | all `ok` |
| Santiago row stored | `2026-09-06 04:00+00`, local `01:00`: accepted by the "Postgres's own resolution of local 00:00" reading (K-3 note in the file header) |
| `gcal_dirty` after the inserts; after a 0-row `update … where false` | `true`; `true` again (statement-level) |
| zone `UTC+3`, `Mars/Olympus`, `EST5EDT`; update to `UTC+3` | `23514` "time_zone … is not an IANA zone name" |
| all-day at 09:00; all-day at 00:00 UTC (not NY); all-day end date = start date | `23514` from the trigger |
| online `meet.google.com/abc` (no scheme); `javascript:alert(1)`; `https://a b` | `23514 planner_events_online_is_url` |
| task without `done`; event with `done` | `23514 planner_events_done_iff_task` |
| `location_kind` without `location`; `location` without kind | `23514 planner_events_location_pair` |
| title `'   '`; title 201 chars; ends before starts; notes 2001 chars | `23514` (title checks, `ends_after_start`, notes check) |
| unknown course `NOPE.999`; kind `meeting` | `23503` FK; `22P02` enum |
| RLS, stranger uid: select / update / delete / insert | `0` / `0` rows / `0` rows / `42501` |
| RLS, owner uid: select / update task `done` | `6` / `1` row |
| `anon` select | `42501 permission denied` |
| grants | `authenticated`: SELECT, INSERT, UPDATE, DELETE only; `anon`: none |
| triggers | `planner_events_check_time` (BEFORE INSERT OR UPDATE, row), `planner_events_updated_at` (BEFORE UPDATE, row), `planner_events_mark_calendar_dirty` (AFTER I/U/D, **statement**, `tgtype 28`) |
| policies | `planner_events_owner_{select,insert,update,delete}`, all `(select auth.uid()) = (select public.app_owner())` |

### 2.2 068

Snapshot of the old view and mirror into temp tables, then 068, then checks, then rollback.

| Check | Result |
|---|---|
| old view rows / new `source='assignment'` rows | 66 / 66 |
| old view `EXCEPT` new (the 11 v1 columns), and the reverse | 0 and 0 |
| assignment rows with `ref_id = assignment_id`, `event_id = calendar_event_id(assignment_id)`, all 14 planner columns null | 66 of 66 |
| mirror rows / `source = 'assignment'` / same `event_id`, `content_hash`, `calendar_id`, `state` as before | 64 / 64 / 64 |
| mirror `event_id` equals the view's `event_id` on `(source, ref_id)` | 64 |
| primary key | `PRIMARY KEY (source, ref_id)` |
| view ACL / options | `{postgres, authenticated, service_role = arwdDxtm}` (identical to before), `security_invoker=true`, no anon |
| planner fixtures | `IST 323 · Event · Study group`; `Task · Buy notebook`; all-day LA `start_date 2026-09-27`, `end_date 2026-09-29`; an LA 21:30 PDT Sunday event gets `week_start 2026-09-28` (its New York date is Monday); uuid `…0001` → `pe11e594f481958c10e3015d0bf0447a22` (pinned in a test) |

## 3. Pre-flight and the K-5 cut-over

### 3.1 Pre-flight (task 4)

A scratch script (session scratchpad, not the repo) read prod through PostgREST with the service
credential (read from `~/.claude.json` at runtime, never printed), fed every assignment row to
**v4's** `buildEventBody` + `contentHash`, compared each against the mirror, then ran v4's whole
`runPush` against a recording fake Google client and a recording store.

| Run of the script | View rows | Mirror rows | Hashes equal | Event ids equal | Simulated `runPush` |
|---|---|---|---|---|---|
| before 068 (old view, mapped to `source='assignment'`) | 66 (2 absent) | 64, all `live`, all on the configured calendar | **64 / 64** | 64 / 64 | `ok`, unchanged 64, **0 Google calls, 0 mirror writes** |
| after 068 was applied, before v4 was deployed (the real v2 view) | 66 (2 absent) | 64 | **64 / 64** | 64 / 64, and the view's `event_id` equals v4's computed id for all 64 | `ok`, unchanged 64, **0 calls, 0 writes** |

No row legitimately differed: no mirror row was `deleting`, failed or on another calendar. The two
absent rows are 69a §4.1's duplicate-`bb_item_id` pair, never in the mirror. The golden test
(§5) pins the same fact for one row inside the test suite.

### 3.2 Cut-over timestamps

| Step | What | When (UTC) | Evidence |
|---|---|---|---|
| 1 | `update app_settings set gcal_enabled = false` | **20:22:49.82** | same statement read back: `gcal_push_run_id` null, `gcal_push_request_id` null, 0 running runs, 0 planner rows, 64 mirror rows |
| 2 | `apply_migration 068_calendar_push_planner_arm` | **20:23:21** (version) | md5 checked 20:23:27; mirror 64 assignment rows, view 66 rows, ACL unchanged; post-068 pre-flight (§3.1 row 2) |
| 3 | deploy `calendar-push` v4, `verify_jwt false` | **20:25:53.165** | `get_edge_function`: version 4, `verify_jwt false`, sources byte-identical (§1.2) |
| 4 + 5 | `gcal_enabled = true`, `calendar_push_now()`, `calendar_push_tick()` in **one** transaction (deviation 1) | **20:26:26.575** | tick `{fired: true, run_id: 17}` |
| — | run 17 finished | 20:26:27.917 | read at 20:26:31: `gcal_enabled` true, lock released, `gcal_last_status ok` |

**Step-4 counts (run 17):** `status ok`; `scanned_assignments 66`, `inserted_assignments 0`,
`patched_assignments 0`, `deleted_assignments 0`, `failed_assignments 0`, `unchanged_assignments
64`; planner arm all zero. Every existing row kept its event id and v4 builds the assignment body
exactly as v3 did. The push was off for 3 min 37 s (20:22:49 → 20:26:26).

## 4. Live proof on Stack's `bb2dash` calendar (K-8)

Proof rows were inserted with SQL (as postgres), titled `bb2dash test · <kind>`, uuids
`0b2d7e57-0000-4000-8000-00000000000N`, all in the week of Monday 2026-09-28: one per kind (the
event linked to IST.323, the working location in person at "Hinds Hall"), plus three more — an
event in `America/Los_Angeles`, an all-day out of office, and an online event
(`https://example.com/bb2dash-test-meeting`). Every push was fired by `calendar_push_tick()` in the
same transaction as the change, so runs record `trigger = scheduled` and hold the lock like a cron
run. The Google side was read with the function's own client (`exchangeRefreshToken` +
`createGoogleCalendar(...).list`, i.e. `privateExtendedProperty=app=bb2dash`, `showDeleted=false`)
plus `events.get` per `pe…` id; nothing secret and not the calendar id was printed.

| Run | Fired | Change first | Counts (planner arm / assignment arm) | Google `app=bb2dash` vs mirror |
|---|---|---|---|---|
| baseline | 20:27:13 | — | — | 64 = 64 |
| **18** | 20:27:34 | 9 proof rows inserted | **inserted 9** / 0 writes, unchanged 64 | **73 = 73**, 0 ids on one side only |
| **19** | 20:27:58 | nothing (`calendar_push_now()`) | **0 writes, unchanged 9** / 0 writes, unchanged 64 | — |
| **20** | 20:28:12 | focus time moved 09:00→10:00 (2 h); task `done = true` | **patched 2**, unchanged 7 / 0 writes | — |
| **21** | 20:28:23 | out of office switched timed → all-day; working location's location cleared | **patched 2**, unchanged 7 / 0 writes | 73 = 73 |
| **22** | 20:28:44 | all 9 proof rows deleted | **deleted 9** / 0 writes, unchanged 64 | — |
| **23** | 20:29:00 | nothing (`calendar_push_now()`) | 0 / **0 writes**, unchanged 64 | **64 = 64**, 0 `pe` ids |

All seven runs `ok`, `failed 0`, `error null`.

What Google held after run 18 (read back field by field):

| Row | Google `summary` | `start` / `end` | `location` | `colorId` |
|---|---|---|---|---|
| event + IST.323, notes set | `IST 323 · Event · bb2dash test · event` | `2026-09-28T10:00-04:00` → `11:00`, `America/New_York` | null | 9 |
| task | `Task · bb2dash test · task` | `2026-09-28T12:00-04:00` = end (zero length) | null | 1 |
| out of office | `Out of office · bb2dash test · out_of_office` | `2026-09-29T13:00-04:00` → `17:00` | null | 4 |
| focus time | `Focus time · bb2dash test · focus_time` | `2026-09-30T09:00-04:00` → `11:00` | null | 8 |
| working location | `Working location · bb2dash test · working_location` | `2026-10-01T09:00-04:00` → `17:00` | `Hinds Hall` | 2 |
| appointment slot | `Appointment slot · bb2dash test · appointment_slot` | `2026-10-02T15:00-04:00` → `15:30` | null | 5 |
| **Los Angeles** | `Event · bb2dash test · event (Los Angeles)` | `2026-10-01T12:00-04:00` → `13:00`, **`timeZone America/Los_Angeles`** (09:00 PDT) | null | 9 |
| **all-day** | `Out of office · bb2dash test · out_of_office (all-day)` | **`date 2026-10-02` → `date 2026-10-03`** | null | 4 |
| **online** | `Event · bb2dash test · event (online)` | `2026-09-30T16:00-04:00` → `16:45` | **the URL** | 9 |

Every event was `status confirmed` with `extendedProperties.private = {app: bb2dash,
planner_event_id: <uuid>}`. Descriptions: `bb2dash: <kind label>` then
`https://web-xi-ten-uy9xk6c6p0.vercel.app/planner?week=2026-09-28`; the notes-bearing event starts
with its notes and a blank line; the online event's description starts with its URL.

After run 21, Google showed: the task as **`✓ Task · bb2dash test · task`**; focus time at
`10:00-04:00 → 12:00-04:00`; the switched out of office as **`{date: 2026-09-29}` →
`{date: 2026-09-30}`** with no `dateTime` left behind; working location with **`location` null**.
Runs 20 and 21 also prove the explicit-null fields of the planner body clear on a PATCH.

End state, read at 20:29:13: `planner_events` 0 rows, `calendar_events` 64 rows (0 planner),
Google 64 `app=bb2dash` events all `bb…`, run 23 zero writes, `gcal_enabled` true, lock free,
`gcal_dirty` false. The nine deleted `pe…` ids stay in Google's `cancelled` state, invisible and
excluded from the count; were one ever reused, v3's R3-1 `status: confirmed` handles it.

## 5. Tests

| Suite | At `ddc8bba` | Now |
|---|---|---|
| `node --test supabase/functions/calendar-push/push_test.ts` | 22 pass | **35 pass**, 0 fail |
| `node --test scripts/google-consent.test.mjs` | 9 pass | 9 pass |
| **Total (this worker's packages)** | **31** | **44** |

New tests: one planner row per kind inserts six (labels, colours, `pe` ids, extended property); six
distinct kind colours and kind beats course; an edited time → one patch; a deleted row → one delete;
a task marked done → one patch with `✓ `; a mixed run with the full 18-key counts object; a re-run
with zero writes on both arms; the Los Angeles body; the all-day body (and a failed item, not a
guess, when a date is missing); online / in-person / no location bodies; planner ids match 068's
view; a view `event_id` that disagrees with the computed id fails that item; and the **golden test**:
`IST.323/exam-2`'s canonical JSON and hash `283cdfd8d886691345208f896160f7b83f8650e9f829812c1bdb40ab6fe208d3`
from v3 at `ddc8bba`, which is also that row's `content_hash` on prod.

The 22 v3 tests are unchanged in what they assert; their fixtures gained the v2 view columns, their
`counts` assertions go through an `assignmentsOnly()` helper that expands the six totals into the
18-key object (all on the assignment arm), and mirror lookups use `(source, ref_id)` keys.

`google.ts`, `push.ts` and `push_test.ts` also type-check under `tsc --strict` (web's TypeScript,
scratch tsconfig). The one remaining diagnostic is TS2783 in v3's existing key-order test, present
at `ddc8bba` too. `web/` was not touched.

## 6. RLS on prod (rolled back)

After 068, one probe row inserted as postgres, then in the same rolled-back transaction:

| Caller | `planner_events` select | view planner rows | `calendar_events` select | update | delete | insert |
|---|---|---|---|---|---|---|
| authenticated, stranger uid `5f0c1e2a-…abcd` | **0** | **0** | **0** | **0 rows** | **0 rows** | **`42501` new row violates RLS** |
| authenticated, owner uid | 1 | 1 | — | — | — | — |
| anon | `42501 permission denied` | — | — | — | — | — |

The probe row's title was still `rls probe` afterwards. Post-rollback: 0 planner rows, `gcal_dirty`
false, no new run.

## 7. Advisor diff

Baseline taken immediately before 067 (20:09); after, at 20:29, following the live proof.

| Lint | Before 067 | After 068 | 69a's list | Note |
|---|---|---|---|---|
| `function_search_path_mutable` (WARN) | 7 | 7 | 7 | both new functions set `search_path` |
| `authenticated_security_definer_function_executable` (WARN) | 2 | 2 | 2 | `app_owner`, `calendar_push_now`; nothing new |
| `auth_leaked_password_protection` (WARN) | 1 | 1 | 1 | project setting |
| `unindexed_foreign_keys` (INFO) | 14 | **15** | 14 | **+1: `planner_events_course_id_fkey`** (deviation 8) |
| `auth_rls_initplan` (WARN) | 21 | 21 | 21 | the four new policies use 038's form |
| `unused_index` (INFO) | 5 | 6 | 7 | +1 is `grade_column_links_component_idx` (a grades object, not W-23's; 067/068 create no index). 69a's 7 was taken on 2026-09-15 and the set has moved with other phases since |

## 8. Deviations from the brief, and why

1. **Cut-over steps 4 and 5 ran as one transaction.** Step 4 as written (`calendar_push_now()` while
   `gcal_enabled` is false) cannot produce a run: `calendar_push_tick()` returns "gcal_enabled is
   false" without firing, and v4's `index.ts` (like v3's) aborts a run when the switch is off. So the
   switch went on in the same transaction as `calendar_push_now()` and `calendar_push_tick()`, which
   fired exactly one run holding the lock (a cron tick in between would have seen "in flight"). The
   risk step 4 guards against was retired beforehand: the pre-flight proved zero writes twice, the
   second time against the real 068 view, and the plan was to set `gcal_enabled = false` at once if
   run 17 wrote to the assignment arm. It did not.
2. **Pre-flight data came through PostgREST, not `execute_sql` JSON.** Transcribing ~130 rows of
   doubly escaped JSON into a file by hand is a transcription risk; the script read the same prod
   rows over PostgREST, which is also exactly the wire format v4 consumes. An `execute_sql`
   snapshot was pulled too; it was not machine-compared, but spot checks (`IST.323/exam-2`,
   `IST.323/quiz-03`) carry the same `content_hash` values the script matched.
3. **md5 expression** is `md5(statements[1])` for 067/068 (§1.1): the stored statements keep their
   trailing newline, unlike 060–066.
4. **068's view carries more than K-6 lists:** `kind`, `kind_label`, `start_date`, `end_date` and
   `week_start` are computed in SQL so v4 does no zone or calendar arithmetic; planner rows set
   `event_at = starts_at`. The assignment arm is column-for-column 066 plus nulls.
5. **The planner body sends explicit JSON nulls** for the unused half of `start`/`end`
   (`date` vs `dateTime`/`timeZone`) and for an absent `location`, because Google merges nested
   objects on PATCH. Proved live in run 21. The assignment body is untouched (the golden test checks
   it has no `location` key).
6. **Kind colours** (K-6 fixed the map's existence, not its values): event 9 Blueberry, task 1
   Lavender, out of office 4 Flamingo, focus time 8 Graphite, working location 2 Sage, appointment
   slot 5 Banana. Three reuse a course or fallback colour; seven of Google's eleven are taken by
   courses. For the PM / Stack to confirm or change: changing one moves those planner events'
   hashes only.
7. **Planner description** follows K-6's four parts literally (notes, URL, kind line, link) with a
   blank line after notes; it has no "Managed by bb2dash" line, which only the assignment arm keeps.
8. **No index on `planner_events.course_id`**, so `unindexed_foreign_keys` gains one INFO. A
   single-owner planner table stays small, and an index would only trade that finding for
   `unused_index`.
9. **Added safety in v4:** an item whose view `event_id` disagrees with the TypeScript id is failed,
   not written (a run would be `partial` and retry). Not triggered on prod (64/64 equal).
10. **The dirty trigger uses its own function** `planner_events_mark_calendar_dirty()` (same body as
    061's) so `pg_trigger` reads truthfully; RLS is four per-verb policies rather than one `for all`.
11. **The live proof went a little past K-8:** nine rows (the three special cases as extra rows, not
    folded into kinds), a zero-write re-run while planner rows existed (run 19), and run 21's
    timed→all-day switch and location clear.

## 9. Still open

- **Types:** `web/src/lib/supabase/database.types.ts` must be regenerated after 068 (K-10; PM at
  integration). The view's column list is in §2.2 and the migration header.
- **The planner link** is `<web_base_url>/planner?week=<Monday>`; W-24's `/planner` route has to
  honour `?week=` for the Google link to land on the right week.
- **Kind colours** (deviation 6) await a nod.
- Unchanged from 69a §12: the duplicate-`bb_item_id` pair (`IST.323/fp-proposal`,
  `IST.323/fp-log-final`) stays absent and unpushed.

## Round 2 (2026-09-16, code-review fixes R2-1, R2-2, R2-3)

Branch fast-forwarded to `origin/feat/planner-events-11b` at `e0b4b29` first (no conflicts in
W-23's files). Commits: `eb25d15` R2-1, `c8f6c0f` R2-2, `20d6254` R2-3 (069), then this note.

### R2-1: both sides of the diff are read page by page

`push.ts` gains `readAllPages(label, readPage, keyOf, pageSize = 500)` and `readAndRunPush`, which
reads `v_calendar_push_items` and `calendar_events` completely before `runPush` is reached.
`index.ts` supplies the two page readers: `.select(..., { count: "exact" }).order("source")
.order("ref_id").range(from, to)`. `PAGE_SIZE` 500 sits under the project's `max_rows` 1000, and a
short page ends the read. The read throws, and the run is recorded `failed` before any Google call,
when a page returns an error, when the exact count moves between pages, when a key repeats, or when
the rows read do not add up to the count. Offset paging over a table that changes mid-read can
otherwise skip a row, and a skipped desired row would be deleted from Google.

Checked against PostgREST on prod (read-only probe of `calendar_events`, 64 rows):
`offset=64&limit=500` with `count=exact` → **206, 0 rows** (so an exact multiple of the page size
ends cleanly on an empty page); `offset=70` → **416 PGRST103**, which can only happen if rows vanish
mid-read, and which aborts the run as intended.

### R2-2: every mirror write checks PostgREST's error

The writer moved from `index.ts` to **`store.ts`** (`createMirrorStore(client, now)`) behind a
structural slice of supabase-js, so the node tests can drive it. `saveFailure` and `markDeleting`
now throw on `{ error }` like `saveSuccess` and `remove`. Tested through that seam: each of the four
methods throws on an error; writes are scoped by `(source, ref_id)` and `last_error` is capped at
500; a failed `markDeleting` rejects the run before Google is asked to delete anything.

### R2-3: migration 069, the zone lookup only when the zone changes

| Artefact | Applied as | Version | md5 (git blob = `md5(statements[1])`) |
|---|---|---|---|
| `db/migrations/069_planner_events_zone_check_on_change.sql` | `069_planner_events_zone_check_on_change` | `20260916210258` | `64647e139d9d25785937cfa683c6d5b5` |

`planner_events_check_time()` runs the K-2 `pg_timezone_names` check on `INSERT` and on an `UPDATE`
whose `time_zone IS DISTINCT FROM` the old value; the K-3 all-day checks still run on every write.
The trigger definition is unchanged. The file is ASCII and stored with its trailing newline, like 067
and 068.

Timing, each inside `begin; … rollback;` on prod, with a probe task row: clock time of the
`update planner_events set done = not done` statement, then `EXPLAIN (ANALYZE)` of one more.

| When | `done` update, clock ms | `planner_events_check_time` in EXPLAIN |
|---|---|---|
| dry run, 067 body | 62.7 / 46.7 / 47.8 | 46.5 ms |
| dry run, 069 body, same transaction | 0.5 / 0.2 / 0.1 | 0.0 ms |
| after applying 069 (fresh transaction) | 0.4 / 0.2 / 0.2 / 0.1 / 0.1 | 0.0 ms |
| for comparison, still paying the lookup: insert of the probe; an update that changes `time_zone` | 48.7; 46.7 | 46.9 ms; 46.1 ms |

This session measured the lookup at about 47 ms, not the PM's 499 ms (likely a colder zone
directory or a different client path). Either way the `done` update drops to below a millisecond. An
insert, or an edit that changes the zone, still pays the lookup, as R2-3 specifies.

Still enforced after 069 (dry run): update to `UTC+3` and to `Mars/Olympus`, insert with `EST5EDT`
→ `23514` zone error; an all-day row moved to `America/Los_Angeles` → K-3 midnight error; an all-day
row's start moved an hour with the zone unchanged → K-3 midnight error; an all-day end moved onto
its start date → K-3 end-date error; a timed row moved to `America/Los_Angeles` → ok. Function ACL
unchanged (`postgres`, `service_role`).

### Function v5

| File | v4 md5 | **v5** md5 (git blob) | bytes |
|---|---|---|---|
| `index.ts` | `216b3daf1e15668bb797cc8c547a0e31` | `6797e25c25e42dbf7de085bb8846c4d3` | 13202 |
| `google.ts` | `b48c5cd95e4fa8adb5adf5f37e8309a5` | unchanged | 22147 |
| `push.ts` | `95c2b5873ed4f1a422089f8e8a537d7e` | `5b52f08cbfc460bc6645a5067c8d31ec` | 16434 |
| `store.ts` | — | `e64f7416a3be4774d28c55930755e10d` (new) | 3435 |

Deployed **21:06:32.098** as `calendar-push` **v5**, `verify_jwt false`, `ezbr_sha256
5cd89d55a35d9af89250c361e5d05ad42dbfbb8a3bdf4cc03651bdb27870b0ed`. The `get_edge_function`
read-back was compared by script with the git blobs: all four files `IDENTICAL`. `index.ts` keeps
its `(v4)` first-line banner; the v5 changes are described in its header.

**The zero-write run (run 24).** `calendar_push_now()` + `calendar_push_tick()` at 21:06:51.126,
`gcal_enabled` true throughout, no pause: `status ok`, finished 21:06:52.367, `scanned 66`
(assignments 66, planner 0), `unchanged 64`, inserted / patched / deleted / failed **0 on both
arms**, `error` null. So v5 read both sides through the pager and the assignment hashes did not move.
Afterwards: 64 mirror rows, 0 planner rows, lock free, `gcal_dirty` false.

### Tests

| Suite | Before round 2 | After |
|---|---|---|
| `push_test.ts` | 35 | **42** (R2-1: 4, R2-2: 3) |
| `google-consent.test.mjs` | 9 | 9 |
| **Total** | **44** | **51** |

New R2-1 tests: a 1203-row side read completely in fixed `[0,499] [500,999] [1000,1499]` ranges, and
an exact 1000 ending on an empty page; 1200 unchanged events past the old row cap issue zero Google
calls; a page error on either side (second page, after a partial list exists) rejects with no Google
call and no mirror write; a count that moves, a repeated key and a short total all abort the read.
`google.ts`, `push.ts`, `store.ts` and `push_test.ts` type-check under `tsc --strict` apart from the
pre-existing TS2783 in v3's key-order test.
