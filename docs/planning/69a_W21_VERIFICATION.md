# 69a — W-21 verification (Phase 11, database + Google Calendar push)

Worker: W-21. Branch `feat/planner-11-db`, worktree `bb2dash-wt-p11-db`.
Contract: `docs/planning/69_PHASE11_planner.md` § "Contract (frozen)", task loops 5–10.
Date: 2026-09-15. Project `goultdzqcavefcgnifdy` (prod — there is no staging).

Everything below was captured against prod. The live three-run proof against Stack's Google
account is **deferred** — he has not finished the one-time setup — and its exact commands are in
§9.

## 1. What shipped

| Artefact | Applied / deployed as | Version | md5 |
|---|---|---|---|
| `db/migrations/060_calendar_events.sql` | `060_calendar_events` | `20260915144845` | `3de34420ec72a98cdaf6ae70c9078e51` |
| `db/migrations/061_calendar_push_state.sql` | `061_calendar_push_state` | `20260915145057` | `a778c30f3e4b2c52caba26120438fad5` |
| `db/migrations/062_calendar_push_tick.sql` | `062_calendar_push_tick` | `20260915145422` | `efdc71e10d5950b3122504d027f9504b` |
| `db/migrations/063_announcements_seen.sql` | `063_announcements_seen` | `20260915144228` | `8876d49ba7bd263483fad308c98dad93` |
| `db/migrations/064_calendar_secrets.sql` | `064_calendar_secrets` | `20260915145613` | `cca5b6113c402fc0e8a0b5b95f0b3754` |
| `supabase/functions/calendar-push/{index,google,push}.ts` | edge function `calendar-push` | v1, `verify_jwt = false` | see §1.2 |
| `scripts/google-consent.mjs` | not run — Stack runs it | — | — |

**063 was applied and pushed first** (14:42 UTC), before 060–062 and 064, because W-22's bell
reads `v_announcements_unread` and `mark_announcements_seen()`.

### 1.1 The md5s are the migration files' own

Each migration was dry-run inside `begin; … rollback;` through `execute_sql` before being applied
under the same name as the file. The column above is `md5` of the repo file's **git blob** (LF),
and it equals `md5(statements[1] || chr(10))` read back from
`supabase_migrations.schema_migrations` — `apply_migration` stores the statement without its
trailing newline, so the newline is added back for the comparison. Verified for all five:

```sql
select name, md5(statements[1] || chr(10)) from supabase_migrations.schema_migrations
 where name in ('060_calendar_events','061_calendar_push_state','062_calendar_push_tick',
                '063_announcements_seen','064_calendar_secrets');
```

The working tree carries CRLF (`core.autocrlf = true`); the git blob and the applied SQL are both
LF, exactly as W-10 recorded for Phase 7.

### 1.2 The edge function's sources are the deployed sources

| File | git blob md5 (LF) |
|---|---|
| `supabase/functions/calendar-push/index.ts` | `d5f8f72da83940e5a68f12cb7afc500a` |
| `supabase/functions/calendar-push/google.ts` | `9674eccc5b1d1ae3866f25d94e83b4d7` |
| `supabase/functions/calendar-push/push.ts` | `b4ffe47015cd6cf3607a72f890a8886c` |

Deployed as `calendar-push` v1, `verify_jwt: false`, entrypoint `index.ts`,
`ezbr_sha256 104eb0228d3f1a20d6e7f4f6a5c2a8f8290b7ef52dea55ed3cf593f8c5a8a092`. The deployed
content was read back with `get_edge_function` and compared with the repo files; the first
upload differed from the repo in two characters (an `—` and a `·` escape that the
deploy path had already unescaped), and the repo files were changed to the literal characters so
that the two are identical. `push_test.ts` is not deployed.

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

Live counts on prod, after 060: `v_calendar_push_items` returns **64** rows, **22** of them
`absent_from_blackboard` (they will not be pushed, and any event they already had would be
deleted). `v_announcements_unread` returns **12** of 16 announcements — the other four carry
Blackboard's own `is_read`.

`calendar_event_id('IST.323/quiz-03')` on prod = `bb3c534b09739b13428eb1df69e0e61877`: 34
characters, matching `^bb[0-9a-v]{32}$`, i.e. inside Google's base32hex id charset. The
TypeScript `calendarEventId()` asserts the identical value (§6).

## 5. `calendar_push_tick` behaviour

Four branches exercised in a rolled-back transaction before 062 was applied, each returning the
documented shape:

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
ℹ tests 17   pass 17   fail 0

$ node --test scripts/google-consent.test.mjs
✔ the authorisation URL asks for an offline grant and forces the consent screen
✔ the scope is calendar.events, not full calendar access
✔ the client secret never appears in the authorisation URL
✔ the token exchange posts the code, the verifier and the identical redirect_uri
✔ the PKCE challenge is the S256 digest of the verifier, url-safe
✔ a fresh push secret is 256 random url-safe bits and never repeats
✔ the four secret names are exactly the ones migration 064 accepts
✔ readEnv names every missing variable and refuses the primary calendar
ℹ tests 8   pass 8   fail 0
```

25 tests, all green, no network and no database. The four numbered runs use a fake Google client
that records every call and an in-memory mirror that is carried from run to run, so "zero writes
on a re-run" is asserted as `deepEqual(calls, [])` rather than as a count.

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

## 9. Live proof: pending Stack's Google setup

**State on prod at the time of writing:** `gcal_enabled = false`, `gcal_dirty = false`,
`gcal_calendar_id = c_2dd6f03f…@group.calendar.google.com` (already present — written outside
this worktree, so Stack has created the calendar and someone has recorded its id), and
`select count(*) from vault.decrypted_secrets` = **0**. So setup steps 1–3 look done and **step 4
— `node scripts/google-consent.mjs` — has not been run**. Nothing can be pushed until it is; the
tick says so in its own run row rather than failing silently.

Runs 1–3 below are for the PM once Stack reports step 4 done. Each is a `calendar_push_now()`
followed by reading the run row; the cron job fires within two minutes, or
`select calendar_push_tick();` fires it at once.

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
0`, `counts.failed = 0`, and `mirror_rows = desired_rows`. As of 2026-09-15 that is **42**
(64 view rows less 22 absent) — re-read both numbers at the time, a sync in between will move
them.

### 9.2 Run 2 — idempotency

```sql
select calendar_push_now();
select calendar_push_tick();
select id, status, counts from calendar_push_runs order by id desc limit 1;
```

Expect `status = 'ok'` and `counts` with `inserted = 0, patched = 0, deleted = 0` and
`unchanged` equal to run 1's `inserted`. **Zero Google writes.**

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

## 11. One thing for the PM to decide (not a defect)

Q6 says "every dated `assignments` row whose `v_work_items.in_workload` is true; readings and
attendance are too noisy". `in_workload` is false for `meeting`, `attendance` and `participation`
but **true for `reading`**, and the `readings` table is a different arm of `v_work_items` that
this view never touches. So five *assignments* rows typed `reading` (IST.352's "Reading -
Chapter N" gradebook items) are currently in the desired set and will be pushed.

That is the Contract's operative rule applied faithfully, and those five are real graded items
rather than syllabus reading assignments — but if Stack wants them off the calendar it is a
one-line `and a.type <> 'reading'` in the view, and 065–069 are reserved for exactly this kind of
review-round fix. Flagged rather than decided.

## 12. What is still open

- Stack's setup step 4 (`node scripts/google-consent.mjs`) — Vault holds no secrets yet.
- The PM flips `gcal_enabled = true` afterwards and walks §9.1–9.4.
- `web/src/lib/supabase/database.types.ts` is regenerated by the PM at integration; W-21 did not
  touch `web/`.
- R-16's two group-item dates are the PM's Inbox resolutions, not a migration (Contract § R-16).
