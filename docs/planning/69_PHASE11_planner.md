# Phase 11 — Planner week grid, Google Calendar push, announcements bell

Date: 2026-09-14 (brief); Contract frozen **2026-09-15** (PM session). Product manager: Stack.
Requirements: R-19, R-25, R-20 (bell + page), R-16 (the two group-item dates only) from
`60_REQUIREMENTS_v2.md`. Phase branch `feat/planner-11`, one PR. Runs **in parallel with
Phase 10a, V-1 and V-2**. **Migration range 060–069** (10a owns 046–059).

**Base.** Cut from `main` at `570a869` (PR #11 merged; Phase 9's `announcements.author` /
`read_at` / `modified_at` from migration 033 are live).

## Why

The Today tracker answers "what is due soon"; nothing answers "what does my week look like" or
puts due dates where Stack already lives (Google Calendar). Announcements exist in the Stream
but there is no cross-course signal that something new arrived. Phase 11 is the planner half of
the original plan, cut to what Stack said he will use.

## Stack's decisions (2026-09-14, `70_MVP_INDEX.md` §1.6)

* Week grid: **meetings + due items, read-only** — class meetings with room on their days and
  times, due items on their day, today highlighted, `◂ ▸` by week, status quick-edit on due
  items as on Today. **No drag**, no day view, no work-window planning.
* Google Calendar: **due dates only**, one dedicated bb2dash calendar, push-only
  (create/update/delete as data changes), nothing read back. Meetings are not pushed.
* Bell: unread badge; **opening the dropdown marks its items seen**; dropdown lists unread
  first (course · author · date); "See all" → all-courses Announcements page.
* R-16: only the IST.323 Security-in-the-News date and the IST.466 Group #3 slots stay here;
  OCR and week/session classification moved to V-1's questions step.

## MVP (in Stack's words)

Open `/planner` and see this week: each class block with its room, each due item on its day,
today marked, arrows to move a week either way, and the same status quick-edit as Today. Every
assignment, quiz and exam due date is on a "bb2dash" calendar in my Google account and stays
correct when dates change or items vanish. The bell shows how many announcements I have not
seen; opening it shows them newest first and clears the count; "See all" lists every course's
announcements.

## Stack's answers to the open questions (2026-09-15)

| # | Question | Answer (Stack, 2026-09-15) |
|---|---|---|
| Q1 | One `bb2dash` calendar or one per course | **One calendar, filterable by course**: the course code opens every event title (Google's search box filters on it) and each course gets a fixed event `colorId` |
| Q2 | Due events: all-day or timed | **Timed, at the due time.** `due_at` → event at that instant. Date-only `due_date` → **11:59 PM** that day, except `project`, `exam`, `final_exam` → **the start of that day's class meeting** (11:59 PM when the course has no meeting that weekday) |
| Q3 | When is an event deleted | **Only when the item no longer exists in Blackboard.** Blackboard crawls are the source of truth being appended to the db: a Blackboard-linked assignment absent from the newest folded crawl of its course is deleted from the calendar; syllabus-only items are never deleted for absence. A row that is deleted or loses its date is deleted too |
| Q4 | Does the Announcements page also clear the badge | **Yes** |
| Q5 | Which Google account holds the calendar | **`emstacho@g.syr.edu`** (Syracuse Google Workspace; nothing exists there yet) → consent screen **Internal** if SU lets a student create a Cloud project in the SU organisation, else External + Published (see setup step 1) |
| Q6 | Which items are pushed | **As proposed**: every dated `assignments` row whose `v_work_items.in_workload` is true; readings and attendance are too noisy |
| Q7 | `author` stays "not recorded" this phase | **Yes** |
| Q8 | R-16 values | **SITN: Stack chose 11/4** (2026-11-04, a Wednesday; IST.323 meets 15:45). The syllabus's group→date table has no 11/4 slot, so this is recorded as his choice, `confidence = confirmed`. **IST.466 Group #3**: the schedule (v. Sep 10) lists Major Project #1 presentations on 10/20 **and** 10/22, #2 on 11/17 **and** 11/19, without saying which group presents which day; the two rows keep their first-day dates, `tentative`, with a note |

## Contract (frozen — all workers build against this)

### Seams with Phase 10a, V-1 and Phase 9 (frozen)

| Phase 11 owns | 10a / others own | Rule |
|---|---|---|
| `db/migrations/060–069` | 10a: 046–059; V-1: one data migration in 10's range | numbers never overlap; each migration is additive |
| `supabase/functions/calendar-push/` | 10a: no new functions | — |
| `web/src/app/(app)/planner/`, `web/src/app/(app)/announcements/` | 10a: `grades/`, `course/[id]/grades/` | different routes, no shared files |
| `web/src/components/shell/TopNav.tsx` (the bell block only), `components/shell/Bell.tsx`, `components/planner/*`, `components/announcements/*` | 10a: `components/popout/*`, `components/grades/*` | 11 links to the popout via `itemHref`; it never edits popout files |
| `web/src/lib/queries.planner.ts`, `queries.announcements.ts`, `lib/planner-week.ts` | 10a: `queries.grades.ts` | `queries.today.ts` is read by both; neither edits it |
| `scripts/google-consent.mjs` | 10a: `ingest/bb_crawler.js` | **11 never touches the crawler** (author stays null; Q7) |
| `app_settings` gains `gcal_*` columns; new tables `calendar_events`, `calendar_push_runs` | 9 owns `run_transform` / `transform_tick`; 10a adds stages inside `run_transform` | **11 never redefines the Phase 9 driver functions**: the push has its own pg_cron job and its own run table |
| `announcements.read_at` (the seen mark, 033) | 9's `stage_announcements` writes every other column | `read_at` is never written by a sync |
| `web/src/lib/supabase/database.types.ts` | regenerated by each PM at integration | conflicts are resolved by regenerating, never by hand-merging |

Phase 8's popout (`?item=assignment:<id>`) and Phase 9's `announcements` table are consumed
as they are on `main`.

### Migrations (060–069, applied under the file's name, byte-identical)

**060 `calendar_events`.** The mirror of what has been pushed to Google.

```sql
create table calendar_events (
  assignment_id   text primary key,                 -- no FK on purpose: an orphan row is how
                                                    -- the pusher learns to delete the event
  event_id        text not null unique,             -- 'bb' || left(sha256_hex(assignment_id), 32)
  calendar_id     text not null,                    -- app_settings.gcal_calendar_id at push time
  content_hash    text not null,                    -- sha256 of the canonical event body
  etag            text,
  state           text not null default 'live' check (state in ('live','deleting')),
  last_pushed_at  timestamptz not null default now(),
  last_error      text,
  updated_at      timestamptz not null default now()
);
alter table calendar_events enable row level security;
create policy calendar_events_owner_read on calendar_events
  for select to authenticated using (auth.uid() = public.app_owner());
-- no insert/update/delete policy: only the service role (the edge function) writes
revoke all on calendar_events from anon;
```

`event_id` is computed once by `calendar_event_id(assignment_id text) returns text` (SQL,
immutable): `'bb' || left(encode(sha256(convert_to(assignment_id, 'UTF8')), 'hex'), 32)`.
Hex is a subset of Google's base32hex charset (`0-9a-v`), 34 chars, unique per calendar.

**061 `calendar_push_state`.** Additive columns on the single-row `app_settings`:

| column | type | meaning |
|---|---|---|
| `gcal_enabled` | boolean not null default false | the PM flips it after Stack's setup; nothing is pushed while false |
| `gcal_calendar_id` | text | the "bb2dash" calendar's id (never `primary`; a check constraint refuses it) |
| `gcal_dirty` | boolean not null default false | set by the trigger below; cleared by a successful push |
| `gcal_push_request_id` | bigint | pg_net request id of the push in flight, else null |
| `gcal_push_requested_at` | timestamptz | when it was fired |
| `gcal_last_push_at` | timestamptz | last push that finished (any status) |
| `gcal_last_status` | text | `ok` / `partial` / `failed` |
| `gcal_last_error` | text | |

Plus `calendar_push_runs` (own log; **not** `sync_runs` — that would need a new value on the
shared `source` enum and an edit to the Activity filter, and it keeps 11 out of the Phase 9
driver):

```sql
create table calendar_push_runs (
  id           bigint generated always as identity primary key,
  trigger      text not null check (trigger in ('scheduled','manual')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running','ok','partial','failed')),
  counts       jsonb not null default '{}'::jsonb,   -- {scanned, inserted, patched, deleted, unchanged, failed}
  error        text
);
```
RLS: owner select; service role writes. A statement-level trigger
`assignments_mark_calendar_dirty` (after insert/update/delete on `assignments`) sets
`app_settings.gcal_dirty = true`. That covers the transform, `apply_resolutions()`, and any
edit Stack makes by hand; no Phase 9 function is touched.

**062 `calendar_push_tick`.** `calendar_push_tick() returns jsonb` (security definer,
`search_path = public, pg_temp`, revoked from `anon`/`authenticated`), scheduled by pg_cron as
`bb2dash-calendar-push` every 2 minutes (`*/2 * * * *`, offset one minute from the transform
tick with `1-59/2 * * * *`). Each tick:

1. **Reap.** If `gcal_push_request_id` is set and `gcal_push_requested_at < now() - 30 min`,
   record the run as `failed` (`no response from calendar-push within 30 minutes`) and clear
   the request id.
2. **Fire.** If `gcal_enabled` and `gcal_dirty` and no request is in flight: insert a
   `calendar_push_runs` row (`running`), then
   `net.http_post(url := <functions>/calendar-push, headers := {'x-push-secret': <vault>,
   'content-type': 'application/json'}, body := {'run_id': <id>}, timeout_milliseconds := 55000)`.
   The secret comes from `vault.decrypted_secrets where name = 'calendar_push_secret'`,
   readable only because the function is security definer. Nothing else in the tick reads Vault.
3. Return `{fired, reaped, run_id}`.

The edge function writes its own result back (below); there is no collect step because the
function has the service role and reports directly. `calendar_push_now() returns void` (security
definer, executable by `authenticated`, refuses unless `auth.uid() = app_owner()`) sets
`gcal_dirty = true`; the next tick fires the push. The UI does not need it in the MVP; the PM
uses it for the acceptance script.

**063 `announcements_seen`.** `v_announcements_unread` (security_invoker, anon revoked):

```sql
select a.id, a.course_id, c.title_short as course, a.title, a.author, a.posted_at,
       a.modified_at, a.read_at
  from announcements a join courses c on c.id = a.course_id
 where a.read_at is null and a.is_read is distinct from true;
```
(`is_read` is Blackboard's own mark: an announcement Stack already opened in Blackboard is not
"new" to him.) `mark_announcements_seen() returns int` (security invoker, `authenticated`):
`update announcements set read_at = now() where read_at is null` — the owner_all policy scopes
it. **No new column**: 033's `read_at` was added for exactly this and its comment already says
so; the bell's semantics are "seen in the dropdown or on the page", and the DoD's `seen_at`
wording reads as `read_at` from here on.

**064 `calendar_secrets`.** `calendar_secret_set(p_name text, p_value text)` and
`calendar_secrets() returns table(name text, secret text)` over `vault.create_secret` /
`vault.update_secret` / `vault.decrypted_secrets`, security definer, **executable by
`service_role` only** (revoke from public, anon, authenticated). Names are fixed:
`google_client_id`, `google_client_secret`, `google_refresh_token`, `calendar_push_secret`.
The consent script writes them through PostgREST with the service key; the edge function reads
them with the service role. No secret ever appears in the repo, the browser bundle, or a chat.

065–069: reserved for review-round fixes. R-16 dates are **not** a migration: they are Inbox
resolutions (see below).

### Edge function `supabase/functions/calendar-push/index.ts`

Deployed with **`verify_jwt = false`**; the caller proves itself with `x-push-secret`, compared
constant-time to Vault's `calendar_push_secret`. Any other request gets 401 and no body. Body:
`{ run_id: bigint }` (the `calendar_push_runs` row the tick opened); a missing `run_id` opens
one with `trigger = 'manual'`.

Algorithm, one run:

1. Read secrets via `rpc('calendar_secrets')`, `app_settings` (`gcal_enabled`,
   `gcal_calendar_id`); refuse (`failed`, error text) if disabled or the calendar id is null.
2. Exchange the refresh token for an access token (`https://oauth2.googleapis.com/token`,
   `grant_type=refresh_token`). On `invalid_grant` record `failed` with
   `refresh token revoked or expired; re-run scripts/google-consent.mjs` and stop.
3. **Desired set** = rows of `v_calendar_push_items` (a security_invoker view in 060 over
   `assignments` × `v_work_items` × `meetings`, columns: `assignment_id`, `course_id`,
   `course_code`, `title`, `type`, `due_at`, `due_date`, `event_at` (timestamptz, computed
   below), `points_possible`, `status`, `absent_from_blackboard` boolean) where `in_workload`,
   a date exists (Q6) and `absent_from_blackboard` is false (Q3). The view computes:
   * `event_at` = `due_at` when set; else for `type in ('project','exam','final_exam')` the
     `meetings.start_time` of that course on `due_date`'s weekday (within `starts_on`/`ends_on`)
     as America/New_York; else `due_date` at 23:59 America/New_York. Computed in SQL with
     `(due_date + start_time) at time zone 'America/New_York'` so DST is Postgres's problem.
   * `absent_from_blackboard` = `bb_item_id is not null` **and** the newest folded Blackboard
     `sync_runs` row (`source = 'blackboard'`, `status in ('ok','partial')`, not
     `unregistered`) has a `bb_raw` `course` row for this course (`courses.bb_id`) **and**
     `bb_last_seen < that run's started_at`. Syllabus-only rows (`bb_item_id is null`) are never
     absent. Absent rows leave the desired set, so step 4 deletes their events; if the item
     reappears in a later crawl its event is re-created under the same id.
   Each row becomes a canonical event body:
   * `id` = `calendar_event_id(assignment_id)`
   * `summary` = `<course code> · <title>` (e.g. `IST 323 · Quiz 3`)
   * `start` = `end` = `{dateTime: event_at, timeZone: 'America/New_York'}` (Q2: the marker
     sits at the due time; a zero-length event is legal in the Calendar API)
   * `colorId` = a fixed map from `course_id` to Google's event colours 1–11, declared once in
     `google.ts` and listed in the verification note (Q1)
   * `description` = type, points if known, bb2dash link
     `https://web-xi-ten-uy9xk6c6p0.vercel.app/?item=assignment:<id>`, and the line
     `Managed by bb2dash — edits here are overwritten on the next push.`
   * `extendedProperties.private` = `{ app: 'bb2dash', assignment_id }`
   * `reminders.useDefault = true`; no attendees, no recurrence, no colour.
   `content_hash` = sha256 of the JSON-stable body.
4. **Diff** against `calendar_events`: new id → `events.insert` (on 409 → `events.patch`;
   on 410 or a 404 for a `live` row → treat as absent and insert); hash changed → `patch`;
   row present but not in the desired set (deleted, undated, left the workload, or
   `absent_from_blackboard`) → `events.delete` (404 counts as deleted) then the row is removed;
   unchanged → **no call**.
5. Never touches `primary`; the calendar id comes only from `app_settings`.
6. Back-off on 403 `userRateLimitExceeded` / 429: 1 s, 2 s, 4 s, then mark that item `failed`
   with `last_error` and continue.
7. Write `calendar_push_runs` (`status`, `counts`, `finished_at`) and `app_settings`
   (`gcal_dirty = false` only when `status = 'ok'`; `gcal_push_request_id = null`;
   `gcal_last_*`). Return the counts as JSON.

The Google client is one small module (`google.ts`: token exchange, insert/patch/delete/list
with `fetch`, no SDK) so the tests can inject a fake. Tests (Deno test or vitest with
`--environment node`, worker's call, but they must run in CI without network): run 1 on an
empty mirror inserts N; run 2 on the same data issues zero writes; run 3 after one date change
and one deletion patches one and deletes one; run 4 after a fixture crawl that omits one
Blackboard-linked item deletes exactly that event and leaves syllabus-only items alone; a
meeting never appears (the test asserts the view filters `in_workload = false` rows such as
attendance, and `event_at` resolves a date-only exam to class start and a date-only quiz to
23:59, on both sides of the 2026-11-01 fall-back).

### One-time setup Stack does himself (before W-21's live proof)

1. **Account: `emstacho@g.syr.edu`** (Q5). Sign in to Google Cloud Console as that account
   and try to create the project **inside the Syracuse University organisation**; if that
   works, set the consent screen's user type to **Internal** (no verification, no 7-day token
   expiry). If SU blocks project creation for students, create the project with no
   organisation instead and set the consent screen to **External** and **publish it to
   Production** (never leave it in Testing: Google revokes a Testing app's refresh tokens after
   7 days). `calendar.events` is a sensitive scope, so an unverified External app shows a
   "Google hasn't verified this app" screen once; Advanced → Continue is fine for your own
   account. One more SU-specific risk: a Workspace admin can block unverified third-party apps
   for the whole domain. If the consent page says the app is blocked by your administrator,
   stop and tell the PM; the fallback is a personal Google account for the calendar.
2. In [Google Cloud Console](https://console.cloud.google.com/): create a project `bb2dash`
   (or reuse one), **enable the Google Calendar API**, configure the OAuth consent screen as
   above with scope `https://www.googleapis.com/auth/calendar.events`, then create an OAuth
   client of type **Desktop app**. Keep the client id and client secret to hand (they go into
   Vault, not the repo).
3. In Google Calendar (the same account): **create a calendar named `bb2dash`**, open its
   settings → *Integrate calendar* → copy the **Calendar ID** (`…@group.calendar.google.com`).
   The push refuses to run without it and never writes to `primary`. Creating it by hand keeps
   the scope at `calendar.events` instead of full `calendar`.
4. On this machine, from the repo root, run once:
   ```powershell
   $env:GOOGLE_CLIENT_ID = '…'; $env:GOOGLE_CLIENT_SECRET = '…'
   $env:GCAL_CALENDAR_ID = '…@group.calendar.google.com'
   $env:BB2DASH_SERVICE_KEY = '<service role key from ~/.claude.json>'
   node scripts/google-consent.mjs
   ```
   It opens the browser for consent (`access_type=offline`, `prompt=consent`), receives the
   code on a loopback port, exchanges it, then stores `google_client_id`,
   `google_client_secret`, `google_refresh_token` and a freshly generated
   `calendar_push_secret` through `calendar_secret_set` and writes `gcal_calendar_id`. Nothing
   is printed except `stored 4 secrets`. Clear the four env vars afterwards.
5. Tell the PM session it is done. The PM sets `gcal_enabled = true`, runs
   `select calendar_push_now()`, and W-21 records the three-run proof.

### Web: `/planner` (R-19)

* Route `web/src/app/(app)/planner/page.tsx` → `PlannerWeek.tsx` (client). Query param
  `?week=YYYY-MM-DD` = the Monday anchor; absent → the current week (Monday rule as in
  `components/tracker/anchor.ts`). `◂ ▸` write `?week=` (± 7 days) so paging is pure and
  linkable; a "Today" button clears it.
* Columns Monday → Sunday (Sunday deadlines are common); rows 08:00–22:00 in 30-minute
  slots; an **all-day band** above the rows holds date-only due items. Header names the range
  (`Sep 14 – 20, 2026`) and the term week number when `terms` covers it.
* **Meetings**: `queries.planner.ts` → `meetingsOptions()` selects `meetings` joined to
  `courses` (`id`, `title_short`, `subject`, `number`) — owner RLS exists. `lib/planner-week.ts`
  (pure, no React): `expandMeetings(meetings, weekStart)` places each row on its `day_of_week`
  for the week if `starts_on ≤ date ≤ ends_on` (null bounds = open), by wall-clock `HH:MM`;
  **never through `Date` arithmetic across the DST boundary**. Block shows course code, room
  (`location`, "room not recorded" when null) and, when a `sessions` row exists for that
  course and date, its `topic`.
* **Due items**: `useWorkItemsWindow(from, to)` from `queries.today.ts` (unchanged); timed
  `due_at` items sit at their New York wall-clock position, date-only in the band (the grid
  shows the fact as recorded; the 11:59 PM / class-start rule is the calendar push's, not the
  grid's). Category
  glyph and tint as on Today. Click → the popout via `itemHref(pathname, target)`.
* **Status quick-edit**: `StatusSelect` + `useSetItemStatus` exactly as Today; writes
  `assignment_progress` / `reading_progress` only; the optimistic patch goes through
  `progress-cache.ts`. No new mutation code.
* **Today**: the column is tinted and carries a "now" line during the visible hours.
* **Empty week** (no meetings, no items, e.g. Thanksgiving): the grid still renders, with
  "Nothing scheduled this week." in the band.
* No drag handlers, no day view, no work-window lane (DoD grep).
* Tests (`web/test/planner-week.test.ts`, `PlannerWeek.test.tsx`): fixture weeks with a
  frozen clock — an ordinary week (2026-09-14), **fall-back week (2026-11-01)**, spring-forward
  (2026-03-08) as a pure-function case, an empty week, a week straddling `ends_on`
  (2026-12-07); placement asserted by wall-clock; ◂ ▸ arithmetic; empty state; quick-edit
  writes the right table (mocked client).

### Web: bell + `/announcements` (R-20)

* `components/shell/Bell.tsx` replaces the disabled placeholder in `TopNav.tsx` (the only
  TopNav edit). Badge = `count(v_announcements_unread)` via `queries.announcements.ts`
  (`unreadOptions()`, refetch on window focus, 60 s stale). Dropdown (uses `usePopover`, same
  pattern as `ActivityMenu`) lists up to 8: unread first, then newest seen, each row
  `course · author · date` (author null → `not recorded`), title; click → `/course/<id>/stream`.
  **On open**: `rpc('mark_announcements_seen')` after the list has rendered, then the badge
  invalidates to 0; rows opened as unread keep their unread styling until the dropdown closes
  (so "what was new" is still legible). "See all" → `/announcements`.
* `/announcements` (`app/(app)/announcements/page.tsx` → `AnnouncementsList.tsx`): every
  course, `posted_at desc`, `course · author · date`, title, body (through `scrubSnippet` as the
  Stream does; plain text, never `dangerouslySetInnerHTML`), read/unread distinction by
  `read_at`. Visiting the page marks all seen (Q4). Reload keeps the badge at zero.
* Tests: badge count; open → RPC called once → badge 0; rows stay distinguishable; page
  ordering and null-author label.

### R-16 (the two group-item dates)

No migration and no code. Recorded by the PM **the Inbox way** (`resolution` jsonb +
`resolution_note` naming this session), applied by a `transform` request on the next tick
(`apply_resolutions()` writes the field and sets `confidence = 'confirmed'`; it does not change
`source`):

* **IST.323 Security in the News** (attention `#162`, field `due_at`): value
  `2026-11-04 15:45 America/New_York`, Stack's choice on 2026-09-15. The syllabus's group→date
  table (1=9/16 … 10=12/2) has no 11/4 entry and Blackboard's groups endpoint returned zero
  groups, so the note says the date is his selection, not a derived one. `#26` (group number
  and date, no field) is resolved with the same date and a note that the group number is still
  unknown; `#2` stays open (it asks for the group number).
* **IST.466 Group #3** (attention `#35` is about the Ethics team, already known: Team 2,
  9/24 confirmed): the Sep 10 schedule lists Major Project #1 presentations on 10/20 and
  10/22 and #2 on 11/17 and 11/19 without assigning groups to days. `major-project-1-synchrony`
  (10/20) and `major-project-2-su-it` (11/17) keep their first-day dates and `tentative`
  confidence; the PM resolves `#35` with a note saying the day within each pair is not
  published and will follow the next schedule upload. Nothing is invented.

### Definition-of-done wording adjusted by this Contract

* "`announcements.seen_at`" → `read_at` (033), same semantics.
* "`sync_stage_runs` row per push run" → `calendar_push_runs` row per push run (own table,
  own cron job; the Phase 9 driver is not edited).
* "A dedicated `bb2dash` calendar is created on first run" → created once by Stack (step 3);
  the push refuses to run without its id and never writes `primary`.

## Definition of done

Source: Stack's answers (`70_MVP_INDEX.md` §1.6) + research `research/74_RESEARCH_phase11_planner.md` §5.

- [ ] **Stack's acceptance script (on the preview + his Google Calendar):** (1) open `/planner`:
      this week's class blocks with rooms at the right times, due items on their days, today
      marked, header names the week; (2) `◂ ▸` moves a week each way; (3) change a due item's
      status inline and see it update without reload; (4) open Google Calendar and find the
      "bb2dash" calendar with every assignment/quiz/exam due date and no class meetings; (5) the
      PM changes one due date on prod and Stack sees exactly one event move; (6) the bell shows a
      count, opening it lists unread first and clears the count, "See all" opens the
      Announcements page. All six ticked.
- [ ] Grid renders `meetings` with room at wall-clock position (America/New_York) for the
      anchor week; date-only due items in the all-day band, timed ones in position.
- [ ] Status quick-edit writes `assignment_progress` and never a fact table; the row updates
      without reload (RTL test).
- [ ] Vitest: five fixture weeks green, including spring-forward and fall-back; an empty week
      renders an empty state.
- [ ] No drag, no work-window lane, no day view (grep for handlers).
- [ ] OAuth: consent screen is **not** External + Testing (Internal under the Syracuse Workspace
      org, or published) so the refresh token is not revoked after 7 days; token in Supabase
      Vault, never in the repo or browser bundle (grep assertion). Stack's one-time setup steps
      are listed in the brief and done.
- [ ] The dedicated `bb2dash` calendar's id is persisted in `app_settings`; the push never
      writes `primary` (check constraint + test).
- [ ] Event ids are deterministic and base32hex-safe (`'bb' || left(sha256_hex(assignment_id), 32)`);
      every event carries `privateExtendedProperty app=bb2dash`; the whole set is recoverable
      from Google by that property.
- [ ] Idempotency proof: a re-run with unchanged data issues zero writes and the Google-side
      count is unchanged (log + count in the verification note).
- [ ] Date change → exactly one `patch`; assignment removed → exactly one `delete`; both demoed
      live and asserted in tests against a mocked Calendar client.
- [ ] Meetings are not pushed (test: zero meeting-typed events).
- [ ] Date-only items are pushed at 11:59 PM, or at class start for project/exam/final_exam
      (test on both sides of the fall-back); every event carries the course code first and the
      course's fixed `colorId`.
- [ ] A Blackboard-linked item absent from the newest folded crawl of its course is deleted
      from the calendar on the next push; a syllabus-only item never is (test + live demo).
- [ ] Bell: badge = unread count from `v_announcements_unread`; opening the dropdown stamps
      `read_at` and clears the badge; rows stay distinguishable afterwards (RTL test).
- [ ] Announcements page lists all courses newest-first with course · author · date and
      survives reload with the badge at zero.
- [ ] R-16: the two group-item dates recorded with `source` / `confidence`, or explicitly left
      `tentative` with a note.
- [ ] SOP gates: typecheck/build/test green; `/code-review main high` HIGH cleared;
      `/security-review` (OAuth token handling in scope); STATUS + DECISIONS + ORCHESTRATOR
      updated; Vercel preview posted.

## Task loops

| # | task | executable check | demo line (Stack) | owner |
|---|---|---|---|---|
| 1 | Freeze the Contract; put open questions to Stack; list his Google setup steps | answers recorded; steps done by Stack | — | PM session |
| 2 | Meeting-pattern expansion + week window (`planner-week.ts`, `queries.planner.ts`) | vitest: five fixture weeks incl. DST | — | W-22 |
| 3 | `/planner` grid, today marker, ◂ ▸, empty state | RTL tests per state | "my week, with rooms" | W-22 |
| 4 | Status quick-edit reuse | RTL test; SQL: only `assignment_progress` written | "I tick an item on the grid" | W-22 |
| 5 | `calendar_events` + `v_calendar_push_items` (060), `app_settings.gcal_*` + `calendar_push_runs` + dirty trigger (061) | SQL: owner-only; unique per assignment; trigger sets dirty | — | W-21 |
| 6 | Vault RPCs (064) + `scripts/google-consent.mjs` | function reads the token from Vault; no token in repo/bundle (grep); script stores 4 secrets on a dry run against a throwaway name | — | W-21 |
| 7 | `calendar-push` function: upsert by deterministic id, extended property, delete orphans | mocked-client tests: insert/patch/delete counts | — | W-21 |
| 8 | `calendar_push_tick` + cron job (062), `calendar_push_now()` | `calendar_push_runs` row per push run; reaper fires after 30 min | — | W-21 |
| 9 | Idempotency + change/delete proofs on prod | log shows 0 writes on re-run; 1 patch / 1 delete on change | "I change a date and the event moves" | W-21 (after Stack's setup) |
| 10 | `v_announcements_unread` + `mark_announcements_seen()` (063) | SQL view test; RPC count | — | W-21 |
| 11 | Bell + dropdown + mark-seen-on-open | RTL tests | "the bell count clears when I open it" | W-22 |
| 12 | `/announcements` page | RTL test; reload keeps the badge at zero | "every course's announcements in one list" | W-22 |
| 13 | R-16 group-item dates | SQL: rows carry `source` / `confidence` | — | PM session (Inbox resolutions) |
| 14 | Gates + docs + preview | SOP list | — | PM session |
| 15 | **Stack's acceptance script** | — | the six steps above | Stack |

## Out of scope

Meeting events in Google Calendar, two-way sync, day view, drag-to-reschedule, per-item read
tracking on announcements, OCR and classification (V-1), crawler changes (10a's file this
sprint; the announcements creator key stays unverified), a "push now" button in the UI.

## Workers

* **W-21 database + calendar** (`feat/planner-11-db`, worktree
  `C:/Users/estac/projects/bb2dash-wt-p11-db`): 060–064, `calendar-push` function and its
  tests, `scripts/google-consent.mjs`, verification note `docs/planning/69a_W21_VERIFICATION.md`
  with the three-run proof against Stack's calendar (after his setup), md5 of applied
  migrations, advisor diff.
* **W-22 web** (`feat/planner-11-web`, worktree `C:/Users/estac/projects/bb2dash-wt-p11-web`):
  planner grid, bell + dropdown, Announcements page, tests. Reads 063's view/RPC names from
  this Contract and stubs them until W-21 pushes; W-21 pushes 063 first so W-22's live check
  works within the first hour.

Push order: W-21 applies and pushes **063** first (W-22 depends on it), then 060–062, then 064
and the function.

## Integration (PM)

Merge `feat/planner-11-db` then `feat/planner-11-web` into `feat/planner-11`; regenerate
`database.types.ts`; `npm ci` if deps changed; typecheck + build + tests in `web/`; deploy
`calendar-push`; live smoke: `select calendar_push_now()` → a `calendar_push_runs` row with
`status = 'ok'` and counts; the bell against prod. `/code-review main high`, `/security-review`
(Vault RPC grants, the `x-push-secret` comparison, `verify_jwt = false` justification, the
consent script's handling of the service key). STATUS, DECISIONS, ORCHESTRATOR in the same PR.
Vercel preview for Stack. Stop at "ready when you say so."
