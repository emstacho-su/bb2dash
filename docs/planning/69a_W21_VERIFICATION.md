# 69a — W-21 verification (Phase 11, database + Google Calendar push)

Worker: W-21. Branch `feat/planner-11-db`, worktree `bb2dash-wt-p11-db`.
Contract: `docs/planning/69_PHASE11_planner.md` § "Contract (frozen)", task loops 5–10.
Date: 2026-09-15. Project `goultdzqcavefcgnifdy` (prod — there is no staging).

Everything below was captured against prod. The live three-run proof against Stack's Google
account is **deferred** — he has not finished the one-time setup — and its exact commands are in
§9.

**Round 2 and round 2b (2026-09-15, after PM integration and `/code-review main high`).**
R2-1 was a real defect in the Contract's `absent_from_blackboard` rule, fixed by migration
`065_absent_from_crawl_capture` (§4.1). R2b-2, R2b-3, R2b-6 and R2b-7 are fixed by
`066_calendar_push_lock_and_dirty` (§4.2) and by `calendar-push` v2; R2b-5 and R2b-8 are in the
function alone. R2-2 and R2-3 are decisions with no code change (§11 and §3).

**Round 3 (2026-09-15, from the live proof).** Stack finished the Google setup, the PM flipped
`gcal_enabled`, and runs 1–4 went against his real calendar. Run 4 exposed R3-1: a deleted
event keeps its id in Google's `cancelled` state, so the item's return patched a cancelled row
and left it invisible — 62 mirror rows, 61 events. Fixed in `calendar-push` **v3** by carrying
`status: "confirmed"` in the canonical body, and repaired live (§9).

## 1. What shipped

| Artefact | Applied / deployed as | Version | md5 |
|---|---|---|---|
| `db/migrations/060_calendar_events.sql` | `060_calendar_events` | `20260915144845` | `3de34420ec72a98cdaf6ae70c9078e51` |
| `db/migrations/061_calendar_push_state.sql` | `061_calendar_push_state` | `20260915145057` | `a778c30f3e4b2c52caba26120438fad5` |
| `db/migrations/062_calendar_push_tick.sql` | `062_calendar_push_tick` | `20260915145422` | `efdc71e10d5950b3122504d027f9504b` |
| `db/migrations/063_announcements_seen.sql` | `063_announcements_seen` | `20260915144228` | `8876d49ba7bd263483fad308c98dad93` |
| `db/migrations/064_calendar_secrets.sql` | `064_calendar_secrets` | `20260915145613` | `cca5b6113c402fc0e8a0b5b95f0b3754` |
| `db/migrations/065_absent_from_crawl_capture.sql` (round 2) | `065_absent_from_crawl_capture` | `20260915152248` | `0e289efa72ad248240f73da94704e1d7` |
| `db/migrations/066_calendar_push_lock_and_dirty.sql` (round 2b) | `066_calendar_push_lock_and_dirty` | `20260915180429` | `58474bc5d575f4b95622da886d6bb386` |
| `supabase/functions/calendar-push/{index,google,push}.ts` | edge function `calendar-push` | **v3**, `verify_jwt = false` | see §1.2 |
| `scripts/google-consent.mjs` | not run — Stack runs it | — | — |

**063 was applied and pushed first** (14:42 UTC), before 060–062 and 064, because W-22's bell
reads `v_announcements_unread` and `mark_announcements_seen()`.

### 1.1 The md5s are the migration files' own

Each migration was dry-run inside `begin; … rollback;` through `execute_sql` before being applied
under the same name as the file. The column above is `md5` of the repo file's **git blob** (LF),
and it equals `md5(statements[1] || chr(10))` read back from
`supabase_migrations.schema_migrations` — `apply_migration` stores the statement without its
trailing newline, so the newline is added back for the comparison. Verified for all seven:

```sql
select name, md5(statements[1] || chr(10)) from supabase_migrations.schema_migrations
 where name in ('060_calendar_events','061_calendar_push_state','062_calendar_push_tick',
                '063_announcements_seen','064_calendar_secrets',
                '065_absent_from_crawl_capture','066_calendar_push_lock_and_dirty');
```

The working tree carries CRLF (`core.autocrlf = true`); the git blob and the applied SQL are both
LF, exactly as W-10 recorded for Phase 7.

### 1.2 The edge function's sources are the deployed sources

| File | v1 | v2 | **v3** (git blob md5, LF) |
|---|---|---|---|
| `supabase/functions/calendar-push/index.ts` | `d5f8f72d…` | `6c3e8712d58f71e60a34ee5c6feee1a4` | unchanged from v2 |
| `supabase/functions/calendar-push/google.ts` | `9674eccc…` | `222fa60d959c6b994d81f6ac092fa173` | `aca4de76c77cd75969905e00adb932f4` |
| `supabase/functions/calendar-push/push.ts` | `b4ffe470…` | `8ea3ae9bd98feeb49f712c3d04d24012` | unchanged from v2 |

v3 touches `google.ts` only (R3-1). `index.ts` keeps its `(v2)` banner on purpose: that line
names the revision of *that file*, and the file did not change — re-uploading it to edit a
comment would be another transcription pass over a live function for no behavioural gain.

Deployed as `calendar-push` **v3**, `verify_jwt: false`, entrypoint `index.ts`,
`ezbr_sha256 acec412f38b05c23cadf9e83183936be3be3635ef8cd6882cd385366aa5b92e7`
(v2 `5c8ba43efb379c28ea939891bd49588d5681d53efaa3431ebf2acec97efe468c`,
v1 `104eb0228d3f1a20d6e7f4f6a5c2a8f8290b7ef52dea55ed3cf593f8c5a8a092`). All three deployments
were read back with `get_edge_function` and compared with the repo files. On v1 the upload
differed in two characters (an `—` and a `·` escape the deploy path had already
unescaped) and the repo files were changed to the literal characters; v2 and v3 matched the
blobs above with no correction needed. `push_test.ts` is not deployed.

## 2. Objects, grants and RLS on prod

| Object | Kind | Security | anon | authenticated | service_role |
|---|---|---|---|---|---|
| `calendar_events` | table | RLS on, policy `calendar_events_owner_read` (select only) | no select | select (owner rows) | writes (bypasses RLS) |
| `calendar_push_runs` | table | RLS on, policy `calendar_push_runs_owner_read` (select only) | no select | select (owner rows) | insert/update |
| `v_calendar_push_items` | view | `security_invoker=true` | revoked | select | select |
| `v_announcements_unread` | view | `security_invoker=true` | revoked | select | select |
| `calendar_event_id(text)` | sql, immutable | invoker, `search_path=public, pg_temp` | — | execute | execute |
| `calendar_push_tick()` | plpgsql | **definer**, `search_path=public, pg_temp` | — | — | execute |
| `calendar_push_now()` | plpgsql | **definer**, `search_path=public, pg_temp` | — | execute (owner-guarded) | execute |
| `calendar_secret_set(text,text)` | plpgsql | **definer**, `search_path=public, pg_temp` | — | — | execute |
| `calendar_secrets()` | sql | **definer**, `search_path=public, pg_temp` | — | — | execute |
| `mark_announcements_seen()` | plpgsql | invoker, `search_path=public, pg_temp` | — | execute | execute |
| `assignments_mark_calendar_dirty()` | trigger fn | invoker, `search_path=public, pg_temp` | — | — | (trigger only) |

`assignments_mark_calendar_dirty` is an **AFTER … FOR EACH STATEMENT** trigger on `assignments`
(`tgtype & 1 = 0`, i.e. statement level, confirmed on prod).

pg_cron, after 062:

| job | schedule | command |
|---|---|---|
| `bb2dash-transform-tick` | `*/2 * * * *` | `select public.transform_tick()` |
| `bb2dash-ical-poll` | `17 6 * * *` | `select public.ical_poll()` |
| **`bb2dash-calendar-push`** | **`1-59/2 * * * *`** | `select public.calendar_push_tick()` |

No Phase 9 function was redefined: `run_transform`, `transform_tick`, `ical_poll`, `ical_collect`,
`apply_resolutions` and every `stage_*` are untouched, and migrations 001–059 were not edited.

## 3. Advisor diff

`get_advisors` was run immediately before 060 and again after 064.

### Security

| Lint | Before | After | Note |
|---|---|---|---|
| `function_search_path_mutable` (WARN) | 7 | 7 | unchanged — every function W-21 created sets `search_path` |
| `authenticated_security_definer_function_executable` (WARN) | 1 (`app_owner`) | **2** (`app_owner`, `calendar_push_now`) | **new, and intended** |
| `auth_leaked_password_protection` (WARN) | 1 | 1 | pre-existing, project setting |

The one new security finding is `calendar_push_now()`. The Contract specifies it as "security
definer, executable by `authenticated`, refuses unless `auth.uid() = app_owner()`", so the
advisor is describing the design rather than a defect — the same accepted trade-off already
recorded for `app_owner()` (DECISIONS, 2026-09-10). The guard is inside the function, it writes
one boolean and returns nothing, and a non-owner JWT is refused with an exception. Nothing else
on the push path is reachable from a browser: the tick, both Vault doors and the whole secret
surface are `service_role` only.

### Performance

| Lint | Before | After | Note |
|---|---|---|---|
| `unindexed_foreign_keys` (INFO) | 14 | 14 | `calendar_events` and `calendar_push_runs` have no foreign keys by design |
| `auth_rls_initplan` (WARN) | 21 | 21 | both new policies use 038's `(select auth.uid()) = (select public.app_owner())` form, so neither is flagged |
| `unused_index` (INFO) | 5 | 7 | the two additions are `bb_attempts_latest_idx` and `bb_attempts_sync_run_idx` — **Phase 10a's**, not W-21's; no index was created by 060–064 |

Re-run after 065 and after 066: **identical on both axes**. 065 recreates one view; 066 adds two
columns and recreates one view and one function, creating no policy, no index and no new
function, so there was nothing new for either linter to find.

## 4. SQL proof: `event_at`, the `in_workload` filter, `absent_from_blackboard`

Executable check for task loop 5, run inside `begin; … rollback;` against prod. Nine fixture
assignments were inserted on IST.323 (which meets Mon/Wed 15:45 America/New_York); 2026-10-21 and
2026-11-04 are both Wednesdays, one on each side of the 2026-11-01 fall-back.

| fixture | type | `due_date` | `event_at` | in New York | `absent_from_blackboard` |
|---|---|---|---|---|---|
| `exam-edt` | exam | 2026-10-21 | `2026-10-21 19:45+00` | **15:45** (class start, EDT) | false |
| `exam-est` | exam | 2026-11-04 | `2026-11-04 20:45+00` | **15:45** (class start, EST) | false |
| `quiz-edt` | quiz | 2026-10-21 | `2026-10-22 03:59+00` | **23:59** (EDT) | false |
| `quiz-est` | quiz | 2026-11-04 | `2026-11-05 04:59+00` | **23:59** (EST) | false |
| `exam-no-mtg` | exam | 2026-11-07 (Sat) | `2026-11-08 04:59+00` | **23:59** — no meeting that weekday | false |
| `attendance` | attendance | 2026-11-04 | — | **row absent from the view** | — |
| `meeting` | meeting | 2026-11-04 | — | **row absent from the view** | — |
| `bb-gone` | quiz, `bb_item_id` set, `bb_last_seen` 60 days old | 2026-11-04 | `2026-11-05 04:59+00` | 23:59 | **true** |
| `bb-present` | quiz, `bb_item_id` set, `bb_last_seen` now | 2026-11-04 | `2026-11-05 04:59+00` | 23:59 | false |

The same offsets appear on either side of the fall-back with no offset arithmetic anywhere: the
view builds a local timestamp with `(due_date + start_time) at time zone 'America/New_York'` and
lets Postgres resolve the instant. Meetings and attendance never reach the pusher because
`effort_base.in_workload` is false for `meeting`, `attendance` and `participation`, and the view
filters on `v_work_items.in_workload`.

Both `bb-*` fixtures give the same answer under the corrected rule of §4.1, and the whole table
was re-run inside the round-2 and round-2b fixture transactions unchanged.

Live counts on prod, **after 066**: `v_calendar_push_items` returns **64** rows, **2** of them
`absent_from_blackboard` (before 065 it was 22 — see §4.1). `v_announcements_unread` returns
**12** of 16 announcements — the other four carry Blackboard's own `is_read`.

### 4.1 Round 2 (R2-1): `absent_from_blackboard` compares against the crawl's `captured_at`

Confirmed on prod before fixing. `stage_assignments` stamps `bb_last_seen` with the **crawl
row's** `captured_at`, while 060 compared it with the **fold's** `sync_runs.started_at`. For the
2026-09-14 crawl those are:

| clock | value |
|---|---|
| `bb_raw.captured_at`, per course | 17:19:20 – 17:19:31 |
| `sync_runs.started_at`, the fold | 17:22:00 |

Roughly three minutes apart and always in the same direction, so `bb_last_seen < started_at` was
true for every item the crawl had seen: the test had no discriminating power. Measured before
the fix, **22 of 64** push-set rows were "absent" while every one of them was in the newest
crawl's payload — the first live push would have deleted 22 of Stack's events.

065 recreates the view (same columns, `security_invoker = true`, anon revoked) comparing
`bb_last_seen` with the `captured_at` of the `bb_raw` row (`kind = 'course'`,
`bb_course_id = courses.bb_id`) belonging to the newest folded run. After 065: **2 of 64**.

Fixture transaction (rolled back), a newer folded crawl covering IST.323 only and differing from
the older one by a single gradebook column:

| fixture | course | `bb_item_id` | `bb_last_seen` | `absent_from_blackboard` |
|---|---|---|---|---|
| `ZZ.r2/seen-in-new` | IST.323 (in the new crawl) | set | = the new crawl's `captured_at` | false |
| `ZZ.r2/missed-by-new` | IST.323 (in the new crawl) | set | 12 days older | **true** — the only one |
| `ZZ.r2/syllabus-only` | IST.323 (in the new crawl) | null | null | false |
| `ZZ.r2/other-course` | IST.352 (**not** in that crawl) | set | 12 days older | false |

The five `event_at` cases and the two `in_workload` exclusions of §4 were inserted in the same
transaction and came back unchanged.

**Why 2 and not 0.** The PM's round-2 note expected zero absent rows today; the measurement is
two, and they are the same Blackboard item twice over. `IST.323/fp-proposal` and
`IST.323/fp-log-final` carry the *same* `bb_item_id` (`_12983388_1`) and the *same*
`bb_column_id` (`_3569973_1`). That item is in the newest crawl's payload — checked directly
against `bb_raw` — but `stage_assignments` re-stamped neither row, so both still hold
`bb_last_seen` from 2026-09-02 and the corrected rule calls them absent. The consequence is
conservative rather than destructive: those two never enter the desired set, so no event is
created for them and none exists to delete. It is a duplicate-`bb_item_id` question for Phase
9's staging, which Phase 11 does not edit, and it is listed in §12 for the PM.

No `push_test.ts` fixture encoded the old rule — `absent_from_blackboard` reaches the pusher as
a plain boolean column — so only the file's header comment changed, to cite 060 and 065.

### 4.2 Round 2b: the lock, the dirty flag and the weekday convention (migration 066)

One rolled-back fixture transaction proves all four database-side items. Steps and results:

| # | step | result |
|---|---|---|
| A | the view after 066 | 64 rows, 2 absent — unchanged by the weekday fix |
| B | **R2b-6** a date-only exam on Sunday 2026-11-08, with an IST.323 Sunday meeting at 10:00 | `event_at` = **2026-11-08 10:00** New York. Under 060/065's `extract(isodow)` the join found nothing and it would have been 23:59 |
| C | **R2b-2** `calendar_push_tick()` fires | `fired: true`; `gcal_dirty` **false**, `gcal_push_request_id` set, `gcal_push_run_id` = 6 |
| D | **R2b-2** a transform-shaped write to `assignments` while that run is in flight | `gcal_dirty` **true** again — the change survives instead of being erased at the end of the run |
| E | **R2b-3** a *manual* run (id 7) finishing: exactly the two statements `finish()` issues, the second scoped `where gcal_push_run_id = 7` | the lock is untouched: `gcal_push_run_id` still 6, request id still set |
| F | **R2b-3** the request ages 31 minutes and the tick reaps | `reaped: 1`; run **6** `failed`, manual run **7** still `running`, and a fresh scheduled run 8 fires because the reaper re-raised `gcal_dirty` |

R2b-6 is a latent-Sunday fix, not a change to any current row: `extract(dow)` and
`extract(isodow)` agree Monday (1) through Saturday (6) and differ only on Sunday (0 vs 7), and
no course in the Fall 2026 seed meets on a Sunday. The schema convention is `0 = Sunday`
(migration 001's `check (day_of_week between 0 and 6)`, DATA_SYNTAX.md, the seed and
`web/src/lib/planner-week.ts`), so 060's comment claiming ISO was simply wrong and is corrected
in the recreated view.

R2b-7's column, `app_settings.web_base_url`, is `not null default
'https://web-xi-ten-uy9xk6c6p0.vercel.app'` with a shape check (`^https?://[^/[:space:]]+$`), so
a trailing slash or a stray space cannot reach the event body. The function reads it per run.

`calendar_event_id('IST.323/quiz-03')` on prod = `bb3c534b09739b13428eb1df69e0e61877`: 34
characters, matching `^bb[0-9a-v]{32}$`, i.e. inside Google's base32hex id charset. The
TypeScript `calendarEventId()` asserts the identical value (§6).

## 5. `calendar_push_tick` behaviour

Four branches exercised in a rolled-back transaction before 062 was applied, each returning the
documented shape. Migration 066 later changed *when* the flag and the lock move, not these
four answers — see §4.2 steps C–F for the 066 behaviour:

| state | result |
|---|---|
| `gcal_enabled = false` | `{fired: false, reaped: 0, run_id: null, reason: "gcal_enabled is false"}` |
| enabled, not dirty | `{fired: false, …, reason: "nothing has changed since the last successful push"}` |
| enabled + dirty, no Vault secret | `{fired: false, run_id: 3, reason: "calendar_push_secret is not in Vault; run scripts/google-consent.mjs"}` and a `failed` run row |
| a request 31 minutes old | `{reaped: 1, …}`, the open run row marked `failed` with `no response from calendar-push within 30 minutes`, the request id cleared |

Called once for real on prod after applying (15:12 UTC):
`{"fired": false, "reaped": 0, "run_id": null, "reason": "gcal_enabled is false"}` —
zero `calendar_push_runs` rows, zero `calendar_events` rows. The cron job is live and harmless
until the PM flips `gcal_enabled`.

Vault round-trip (064), also rolled back: four `calendar_secret_set` calls stored four secrets, a
fifth call with the same name took the `vault.update_secret` path and the new value read back,
an unknown name and an empty value were both refused, and `calendar_secrets()` returned exactly
the four names.

## 6. Tests

Deno is **not installed on this machine** (`deno --version` → command not found; `npx deno`
wanted to install it). The Contract allows "Deno test or vitest, worker's call"; `web/` belongs
to W-22 this sprint, so neither was available. The suites run on **Node's built-in test runner**
with native TypeScript type-stripping, and `google.ts` / `push.ts` carry no Deno globals and no
remote imports, so the same sources also run under `deno test` once Deno is installed.

```
$ node --test supabase/functions/calendar-push/push_test.ts
✔ run 1: an empty mirror inserts one event per desired item
✔ run 2: the same data again issues zero Google calls
✔ run 3: one date change patches one event, one removed row deletes one
✔ run 4: an absent Blackboard item is deleted, syllabus-only items are left alone
✔ event ids are deterministic and match migration 060's calendar_event_id()
✔ every event carries app=bb2dash, the course code first, and zero length
✔ each course gets its own fixed colourId, unknown courses get graphite
✔ event_at survives as the instant the view computed, on both sides of the fall-back
✔ a meeting- or attendance-typed row never reaches the pusher
✔ the content hash ignores key order but not values
✔ an insert that collides (409) falls back to patch
✔ a patch for an event Google no longer holds (404) re-inserts it
✔ a rate limit is retried 1s / 2s / 4s and then given up on
✔ a permanent 403 is not retried
✔ isRateLimited tells a quota 403 from an ordinary one
✔ the push refuses to write to 'primary' or to an empty calendar id
✔ a delete that comes back 404 still counts as deleted
✔ repointing the calendar deletes on the old id and inserts on the new          [R2b-5]
✔ an orphan Google refuses to delete is retried next run, not re-created         [R2b-5]
✔ the bb2dash link uses the injected origin, trailing slash and all              [R2b-7]
✔ an item deleted and then re-added is un-cancelled, not silently invisible      [R3-1]
✔ every write carries status confirmed, insert and patch alike                   [R3-1]
ℹ tests 22   pass 22   fail 0

$ node --test scripts/google-consent.test.mjs
✔ the authorisation URL asks for an offline grant and forces the consent screen
✔ the scope is calendar.events, not full calendar access
✔ the client secret never appears in the authorisation URL
✔ the token exchange posts the code, the verifier and the identical redirect_uri
✔ the PKCE challenge is the S256 digest of the verifier, url-safe
✔ a fresh push secret is 256 random url-safe bits and never repeats
✔ the four secret names are exactly the ones migration 064 accepts
✔ readEnv names every missing variable and refuses the primary calendar
✔ serviceHeaders: a legacy JWT key is also a Bearer, an sb_secret key is apikey only
ℹ tests 9   pass 9   fail 0
```

**31 tests, all green**, no network and no database (25 after round 2, 28 after round 2b; the
consent suite gained its ninth test from the PM's `sb_secret_` key-format fix). The four numbered runs
use a fake Google client that records every call — and, since round 2b, which calendar each call
was addressed to — plus an in-memory mirror carried from run to run, so "zero writes on a
re-run" is asserted as `deepEqual(calls, [])` rather than as a count, and the repoint test
asserts the exact call ORDER (four deletes on the old calendar, then four inserts on the new).

R2b-2 and R2b-3 are database behaviour, not TypeScript: their executable checks are steps C–F of
the fixture transaction in §4.2, which issue the same two statements `finish()` does.

Node prints one `MODULE_TYPELESS_PACKAGE_JSON` warning per run; adding a `package.json` inside
`supabase/functions/` to silence it would change what the Deno bundler sees, so the warning is
left alone.

## 7. The colorId map (Q1)

Declared once, in `supabase/functions/calendar-push/google.ts`. Hand-assigned rather than
hashed: a hash would recolour every event the day a course id changed, and two courses could
collide.

| course_id | colorId | Google's name |
|---|---|---|
| `ECN.304` | 5 | Banana |
| `GEO.103.lecture` | 10 | Basil |
| `GEO.103.recitation` | 2 | Sage |
| `IST.323` | 11 | Tomato |
| `IST.352` | 7 | Peacock |
| `IST.466` | 3 | Grape |
| `IST.471` | 6 | Tangerine |
| anything else | 8 | Graphite |

Every event also carries the course code first in its summary (`IST 323 · Quiz 3`), so Google's
search box filters by course, and `extendedProperties.private = {app: 'bb2dash', assignment_id}`,
so the whole set is recoverable with `privateExtendedProperty=app%3Dbb2dash`.

## 8. Secrets: the grep assertion

`git grep` over the branch finds no Google token, no client secret and no service key. The only
matches for secret-shaped patterns are pre-existing placeholders and prose in `mcp-server/`
(`sb_secret_REPLACE_ME`, `sb_secret_test_key_not_real`, README rows). Inside Phase 11's files the
four secret **names** appear — in 062's Vault read, in 064's closed-set check, in the function's
`Secrets` interface and in the consent script's `SECRET_NAMES` — and no value ever does.

The consent script writes to stdout exactly one line, `stored 4 secrets`. The authorisation URL
goes to **stderr** so a shell whose browser did not open can still finish the flow; it contains
the client id (public by design) and never the client secret, which is asserted by a test.
PostgREST failures are reported as `METHOD path -> HTTP status` with no response body, because
the body can echo the request.

## 9. Live proof — done, 2026-09-15

Stack completed the Google setup (`node scripts/google-consent.mjs`, four secrets in Vault) and
the PM set `gcal_enabled = true`. Everything below happened against his real
`c_2dd6f03f…@group.calendar.google.com` calendar. Run 9 is the pre-setup run the tick recorded
as `failed` because the Vault secret was missing — exactly the visible-failure behaviour §5
describes, left in the log on purpose.

| run | trigger | what changed first | counts | status |
|---|---|---|---|---|
| 9 | scheduled | — (setup half done) | `{}` | `failed`: *calendar_push_secret is not in Vault* |
| **10** | scheduled | nothing (first real push) | scanned 64, **inserted 62**, unchanged 0, deleted 0, failed 0 | `ok` |
| **11** | scheduled | nothing | scanned 64, inserted 0, patched 0, deleted 0, **unchanged 62** | `ok` |
| **12** | scheduled | `ECN.304/exam-1` due_date +1 day; `ECN.304/exam-2` due_date set null | scanned 63, **patched 1**, **deleted 1**, unchanged 60 | `ok` |
| **13** | scheduled | both facts restored | scanned 64, **patched 2**, inserted 0, unchanged 60 | `ok` |
| **14** | scheduled | v3 deployed (R3-1 repair) | scanned 64, **patched 62**, inserted 0, deleted 0, failed 0 | `ok` |

Runs 10–12 are the definition of done's three proofs: N inserts on an empty mirror, **zero
Google writes** on a re-run of unchanged data, and exactly one patch plus one delete after one
date moved and one lost its date. Run 13 is where R3-1 surfaced — see §9.5. The SITN event is
on the calendar at **2026-11-04T15:45 America/New_York** with `colorId 11` (IST.323, Tomato),
which is R-16's date and §7's map, both confirmed by eye on Google.

The commands below are the ones that were run, kept so the next person can repeat them.

### 9.0 Preconditions

```sql
-- four secrets present, the calendar id set and not 'primary'
select count(*) as secrets from vault.decrypted_secrets;              -- expect 4
select gcal_enabled, gcal_calendar_id from app_settings where id;
-- the switch
update app_settings set gcal_enabled = true where id;
```

### 9.1 Run 1 — first push, empty mirror

```sql
select calendar_push_now();
select calendar_push_tick();     -- or wait up to two minutes for bb2dash-calendar-push
-- then, after the function has answered (a few seconds):
select id, trigger, status, counts, started_at, finished_at, error
  from calendar_push_runs order by id desc limit 1;
select count(*) as mirror_rows from calendar_events;
select count(*) as desired_rows from v_calendar_push_items where not absent_from_blackboard;
```

Expect `status = 'ok'`, `counts.inserted = counts.scanned - <absent rows>`, `counts.unchanged =
0`, `counts.failed = 0`, and `mirror_rows = desired_rows`.

**Actual (run 10):** `ok`, scanned 64, inserted **62**, unchanged 0, deleted 0, failed 0;
`mirror_rows` 62 = 64 view rows less the 2 absent of §4.1.

### 9.2 Run 2 — idempotency

```sql
select calendar_push_now();
select calendar_push_tick();
select id, status, counts from calendar_push_runs order by id desc limit 1;
```

Expect `status = 'ok'` and `counts` with `inserted = 0, patched = 0, deleted = 0` and
`unchanged` equal to run 1's `inserted`. **Zero Google writes.**

**Actual (run 11):** `ok`, scanned 64, inserted 0, patched 0, deleted 0, **unchanged 62**,
failed 0. Not one Calendar API write.

### 9.3 Run 3 — one date change, one deletion

```sql
-- move one due date by a day (pick a syllabus-only row so no sync undoes it)
update assignments set due_date = due_date + 1 where id = 'IST.323/lab-2';
-- and delete one pushed row
-- (or, to avoid destroying a fact: update assignments set due_date = null where id = '…';)
select calendar_push_now();
select calendar_push_tick();
select id, status, counts from calendar_push_runs order by id desc limit 1;
```

Expect exactly `patched = 1` and, for the undated/deleted row, `deleted = 1`, everything else
`unchanged`. The `assignments_mark_calendar_dirty` trigger sets `gcal_dirty` on those updates by
itself, so `calendar_push_now()` is belt and braces.

**Actual (run 12):** `ok`, scanned **63** (the undated row left the view), **patched 1**,
**deleted 1**, unchanged 60, failed 0. The two facts used were `ECN.304/exam-1` (due_date +1
day) and `ECN.304/exam-2` (due_date set null); both were restored immediately afterwards, which
is run 13.

### 9.4 The Google-side count

`events.list` filtered on the extended property, so it counts bb2dash's events and nothing else
on the account. Run from the repo root, Node 22.18+ or 24 (it imports the function's own client,
which is Node-compatible), with the service key in the environment and no secret printed:

```powershell
$env:BB2DASH_SERVICE_KEY = '<service role key from ~/.claude.json>'
node --input-type=module -e @'
import { exchangeRefreshToken, createGoogleCalendar } from "./supabase/functions/calendar-push/google.ts";
const url = "https://goultdzqcavefcgnifdy.supabase.co", key = process.env.BB2DASH_SERVICE_KEY;
const h = { apikey: key, authorization: "Bearer " + key, "content-type": "application/json" };
const rows = await (await fetch(url + "/rest/v1/rpc/calendar_secrets", { method: "POST", headers: h, body: "{}" })).json();
const s = Object.fromEntries(rows.map((r) => [r.name, r.secret]));
const [cfg] = await (await fetch(url + "/rest/v1/app_settings?id=eq.true&select=gcal_calendar_id", { headers: h })).json();
const t = await exchangeRefreshToken(s.google_client_id, s.google_client_secret, s.google_refresh_token);
const list = await createGoogleCalendar(t.accessToken).list(cfg.gcal_calendar_id);
console.log("google-side events with app=bb2dash:", list.ids.length, list.error ?? "");
'@
Remove-Item Env:BB2DASH_SERVICE_KEY
```

The equivalent raw call, if a token is already to hand:

```
GET https://www.googleapis.com/calendar/v3/calendars/<calendar id>/events
      ?privateExtendedProperty=app%3Dbb2dash&showDeleted=false&maxResults=2500
```

Record the count after run 1 and again after run 2; they must be identical, which together with
run 2's all-zero write counts is the idempotency proof the definition of done asks for.

**Actual:** **61** after run 13 against 62 mirror rows — the one-event gap that is R3-1 — and
**62** after the v3 repair run 14, matching the mirror exactly.

### 9.5 R3-1: a re-added item came back invisible, and the repair

Run 13 restored the two facts run 12 had changed and reported **patched 2, inserted 0**, where
**patched 1 + inserted 1** was expected: `ECN.304/exam-2` had been deleted from Google in run 12
and should have been created afresh. It was patched instead, and the Google-side count stayed at
61 while the mirror said 62.

**Why.** Deleting a Google event does not free its id — the row survives with
`status: "cancelled"`, invisible in the UI and excluded from `events.list`. When the assignment
came back the mirror had forgotten it, so the pusher inserted; Google answered **409** because
the cancelled id was still taken; the 409 fallback patched it; and a patch that says nothing
about `status` leaves it cancelled. The mirror recorded a successful push of an event nobody can
see. Nothing in the diff would ever have noticed: on the next run the hash matches and no call
is made.

**The fix (v3, `google.ts`).** `status: "confirmed"` is part of the canonical event body, so
*every* write — insert, hash-change patch, 409 fallback — restores the event. The alternative,
adding `status` only on the 409 path, keeps the hash stable but fixes exactly the one case we
happened to think of; a cancelled event reached by any other patch would stay invisible. Putting
it in the body costs **one** re-patch of the whole set, because every content hash moves once.

Two tests cover it (§6): delete-then-re-add asserts the second run's fake client sees an insert
answered 409 and then a patch whose body carries `status: "confirmed"`, and a second test
asserts every body written by any path carries it.

**The repair run**, fired by W-21 after deploying v3:

```sql
select calendar_push_now();
select calendar_push_tick();     -- {"fired": true, "reaped": 0, "run_id": 14}
select id, status, counts, finished_at from calendar_push_runs where id = 14;
```

Run 14: `ok`, scanned 64, **patched 62**, inserted 0, deleted 0, failed 0, finished in 33 s; all
62 mirror rows `state = 'live'`; the lock released (`gcal_push_request_id` and
`gcal_push_run_id` both null) and `gcal_dirty` false. That is the predicted one-time re-patch,
and it doubles as the repair: the Google-side count went **61 → 62**.

No further re-patch follows. The hash moved once, with this deployment; the next unchanged run
is back to zero writes.

## 10. Deviations from the Contract, and why

1. **`calendar_push_now()`'s owner check.** The Contract says "refuses unless
   `auth.uid() = app_owner()`". Taken literally that also refuses the PM's own SQL session, where
   `auth.uid()` is null — and the Contract's next sentence says the PM uses this function for the
   acceptance script. It is implemented as *a call carrying a JWT must be the owner's; a call
   with no JWT at all can only be a direct postgres/service_role session*. `anon` holds no
   EXECUTE, and every PostgREST call as `authenticated` carries a uid, so there is no third case.
2. **Policy wording.** The Contract's snippet is `using (auth.uid() = public.app_owner())`; both
   new policies use `using ((select auth.uid()) = (select public.app_owner()))`. Identical
   semantics, and it is the form migration 038 already imposed on `app_settings`,
   `agent_requests` and `attention_items` to clear the `auth_rls_initplan` advisor. The bare form
   would have added two new performance WARNs.
3. **A third file in the edge function.** The Contract names `index.ts` plus `google.ts`. The run
   algorithm is in a third module, `push.ts`, because `index.ts` ends in a top-level
   `Deno.serve(...)` — importing it from a test would start a server. `push.ts` holds exactly the
   behaviour the definition of done asks to be proven and takes every collaborator as an
   argument; `google.ts` keeps the client, the colour map and the event body as specified.
4. **Node's test runner instead of Deno's.** Deno is not installed here (see §6). The sources are
   runtime-neutral, so this is a harness choice, not a design one.
5. **Two extra check constraints in 061.** `gcal_last_status` is constrained to
   `ok / partial / failed` (the Contract's column table lists exactly those three values), and
   the `gcal_calendar_id <> 'primary'` check is written as
   `gcal_calendar_id is null or gcal_calendar_id <> 'primary'` so the column can start out null.
6. **`calendar_push_tick()`'s return value** carries `reason` and `at` alongside the Contract's
   `fired`, `reaped` and `run_id` — a superset, in the style of `transform_tick()`. It also
   short-circuits with a recorded `failed` run when `calendar_push_secret` is missing from Vault,
   rather than firing a request that could only come back 401.
7. **`scanned` counts every row of `v_calendar_push_items`**, absent ones included, because that
   is what the run looked at. `inserted + patched + unchanged` therefore sums to
   `scanned − absent`, and `deleted` is counted separately over the mirror.

Round 2b added two more decisions worth naming, neither of them a departure from the brief:

8. **`finish()` writes app_settings in two statements.** The brief says the lock is released
   only `where gcal_push_run_id = <this run>`. Scoping the WHOLE update that way would also
   suppress `gcal_last_status` for a manual run, which holds no lock and is exactly the run the
   PM watches during the acceptance script. So the outcome fields are written unconditionally
   and the lock release is a second, narrower statement.
9. **A failed orphan removal also skips that item's insert for the run** (R2b-5). The brief says
   to remove the row from its old calendar and let the item be re-inserted into the new one. If
   the removal fails, re-inserting anyway would overwrite the mirror row that records where the
   old event lives — the event would be stranded on the old calendar forever. The item is
   skipped instead, the run is `partial`, `gcal_dirty` stays set, and the next run retries both
   halves.

## 11. The reading-typed rows (R2-2, decided: no change)

Q6 says "every dated `assignments` row whose `v_work_items.in_workload` is true; readings and
attendance are too noisy". `in_workload` is false for `meeting`, `attendance` and
`participation` but **true for `reading`**, and the syllabus `readings` table is a different arm
of `v_work_items` that this view never touches. Five *assignments* rows typed `reading`
(IST.352's "Reading - Chapter N" gradebook items, with real 11:59 PM due times) are therefore in
the desired set.

W-21 raised this in round 1. The PM's round-2 answer (R2-2) is that they stay: Stack's "readings
are too noisy" meant the syllabus `readings` table, which is already excluded, and these five
are graded Blackboard items. No change to the view.

## 12. What is still open

Done since round 1: Stack's setup step 4, the PM's `gcal_enabled = true`, and the whole of
§9.1–9.5 — 62 events live on the calendar, Google-side count matching the mirror.

- **Duplicate `bb_item_id`** (§4.1): `IST.323/fp-proposal` and `IST.323/fp-log-final` share
  `_12983388_1` / `_3569973_1`, `stage_assignments` re-stamps neither, and both are therefore
  reported absent and are not pushed — the two rows behind "scanned 64, 62 pushed". A Phase 9
  staging question; Phase 11 does not edit Phase 9 functions.
- `web/src/lib/supabase/database.types.ts` is regenerated by the PM at integration; W-21 did not
  touch `web/`.
- R-16's two group-item dates are the PM's Inbox resolutions, not a migration (Contract § R-16).
