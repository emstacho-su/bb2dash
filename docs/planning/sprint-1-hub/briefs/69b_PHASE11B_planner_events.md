# Phase 11b — Planner events (created in bb2dash, pushed to Google)

Date: 2026-09-16 (brief; PM session). Product manager: Stack. Follows Phase 11 (PR #12). Phase
branch `feat/planner-events-11b`, one PR, cut from `main` after PR #12 merges. **Migration range
067–072** (Phase 11 used 060–066; Phase 12 moves to 073–079).

## Why

Stack's acceptance walk of Phase 11 (2026-09-16) ended with one ask: the planner should hold the
kinds of thing he puts on Google Calendar (events, tasks, out of office, focus time, working
location, appointment slots), created in the planner and written to the `bb2dash` calendar, so
the week grid is the one place he plans from. Nothing is read back from Google.

## Stack's decisions (2026-09-16)

* **Direction:** create in the planner, write to Google; never the other way.
* **Calendar:** only the `bb2dash` calendar. The SU primary calendar is never read or written.
* **Display:** as blocks on the week grid, alongside class meetings and due items.
* **Time zones (Q1):** not always New York. Every planner event carries its own IANA zone; the
  grid and Google both honour it. Location is optional and is either a physical place or an
  online meeting link.
* **Working location (Q2):** varies; it is an ordinary kind with an optional time range and an
  optional place, not a fixed whole-day strip.
* **Appointment slot (Q3):** kept, as a plain timed block.
* **Tasks (Q4):** no link to assignments; ticking a task never touches `assignment_progress`.
* **Colour (Q5):** kind colour wins in Google; the course code leads the title when a course is
  set.

## Google facts that shape the contract

* The Calendar API allows `eventType` `outOfOffice`, `focusTime` and `workingLocation` **only on
  a primary calendar**; on a secondary calendar such as `bb2dash` they are rejected. Appointment
  schedules have **no create endpoint**. So every planner event is pushed as an ordinary
  (`default`) event whose **title prefix and colour carry the kind**; the kind's behaviour
  (auto-decline, free/busy) exists only in the planner's own display. Stack accepts this.
* Push stays idempotent on deterministic ids: `'pe' || left(sha256_hex(planner_events.id), 32)`,
  extended property `app=bb2dash`, `planner_event_id=<id>`; the same insert/patch/delete diff as
  due dates, the same run table, the same tick.

## MVP (in Stack's words, paraphrased)

Click an empty slot on `/planner`, pick a kind, give it a title and a time, save. It shows as a
block in my week and appears on the `bb2dash` calendar in Google within two minutes. Edit or
delete it in the planner and Google follows. Kinds: Event, Task, Out of office, Focus time,
Working location, Appointment slot.

## Contract (frozen — workers build against this)

### Migrations (067–072)

**067 `planner_events`.**

```sql
create type planner_event_kind as enum
  ('event','task','out_of_office','focus_time','working_location','appointment_slot');

create table planner_events (
  id            uuid primary key default gen_random_uuid(),
  kind          planner_event_kind not null,
  title         text not null check (length(title) between 1 and 200),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null check (ends_at >= starts_at),
  time_zone     text not null default 'America/New_York',   -- IANA name, validated by
                                                            -- `now() at time zone time_zone`
  all_day       boolean not null default false,
  location_kind text check (location_kind in ('in_person','online')),
  location      text check (location is null or length(location) <= 500),
                -- place name for in_person, a URL for online; null when there is none
                -- (check: location_kind is null iff location is null; online => location is http(s))
  notes         text check (notes is null or length(notes) <= 2000),
  done          boolean,                        -- tasks only; null for other kinds (check)
  course_id     text references courses(id),   -- optional link, colours the block
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- RLS owner-only for all four verbs (auth.uid() = app_owner(), 038 scalar-subquery form);
-- anon revoked; set_updated_at trigger; statement trigger marks app_settings.gcal_dirty.
```

**068 `v_calendar_push_items` v2.** Adds the planner arm: one row per `planner_events` row with
`source = 'planner'`, `event_id = 'pe' || …`, `summary` = `<kind label> · <title>` (course code
first when `course_id` is set), `start`/`end` from `starts_at`/`ends_at` with `timeZone = time_zone` (all-day → the date pair
in that zone), `location` passed through (an online URL goes in both `location` and the
description, since arbitrary meeting links cannot be attached as conference data),
`absent_from_blackboard = false`. The assignment arm is unchanged (`source = 'assignment'`).
`calendar_events` gains `source text not null default 'assignment'` and the primary key becomes
`(source, ref_id)` where `ref_id` is `assignment_id` or the planner event uuid; the existing
column `assignment_id` is kept as `ref_id`'s old name via a view-compatible rename in the same
migration. Every existing row keeps its event id.

069–072: reserved for review rounds.

### Edge function `calendar-push` v4

Reads the widened view; the body builder switches on `source`: planner rows get `colorId` from a
fixed per-kind map (kind wins over course colour), `description` = notes + the kind line
(`bb2dash: Focus time`), and for `task` rows a `✓ ` prefix on the title when `done`. Delete pass
unchanged (row present, not in desired set → delete). Tests: one planner row per kind inserted;
edit → one patch; delete → one delete; a task marked done → one patch; mixed run with assignments
keeps both arms' counts separate in `counts` (`inserted_assignments`, `inserted_planner`, …).

### Web

* `queries.plannerEvents.ts`: `plannerEventsWindowOptions(from, to)`, `useCreatePlannerEvent`,
  `useUpdatePlannerEvent`, `useDeletePlannerEvent` (optimistic, keyed on the week window);
  validation at the boundary (title length, end ≥ start, kind enum, notes cap).
* Grid: planner events render as blocks in their column at the wall-clock position **converted
  from the event's own zone to the grid's zone** (the grid stays on `COURSE_TIME_ZONE`; a block
  whose zone differs shows its local time in the chip, e.g. "09:00 PT"); all-day ones sit in a
  row labelled "Events" beside the Assignments band; kind decides the block style (six CSS
  variants on tokens, no new colours outside `globals.css`); a `task` shows a checkbox that writes
  `done`; an online location renders as a link; clicking an empty slot opens `PlannerEventForm`
  (dialog: kind, title, date, start/end or all-day, **time zone** picker defaulting to
  New York with a short list of common zones plus free entry, location kind + location, notes,
  course); clicking a block opens the same form in edit mode with Delete. Esc closes; focus
  returns to the slot. Zone arithmetic goes through `Intl`, never hand-rolled offsets, with tests
  on both sides of the 2026-11-01 fall-back and for an event entered in `America/Los_Angeles`.
* No drag, no recurrence, no reminders in the MVP (Google's default reminders apply).
* Tests: form validation, create/edit/delete mutations hit `planner_events` only, block placement
  per kind, all-day placement, task checkbox, keyboard close.

### Seams

Phase 11's `v_calendar_push_items`, `calendar_events` and `calendar-push` are extended by
migration and redeploy, never edited in place. Phase 10a/10b own grades; V-1 owns grading rules.
`assignments` and `assignment_progress` are never written by planner events.

## Stack's answers (2026-09-16)

| # | Question | Answer |
|---|---|---|
| Q1 | All-day and working-location rows date-only in New York? | **No.** Each event carries its own time zone; location is optional and may be a physical place or an online meeting link |
| Q2 | Working location a whole-day strip with a place? | **No.** It varies; ordinary kind, optional time range, optional place |
| Q3 | Keep appointment slot as a plain timed block? | **Yes** |
| Q4 | Task linked to an assignment? | **No** |
| Q5 | Kind colour wins when a course is set? | **Yes** |

## Definition of done

- [ ] Stack's acceptance script: (1) create one of each kind on `/planner` and see each block;
      (2) each appears on the `bb2dash` calendar within two minutes with the kind in the title;
      (3) edit a time → the Google event moves; (4) delete → it disappears; (5) tick a task → the
      title gains ✓ in Google; (6) due-date events are unaffected (count unchanged); (7) an event
      entered in another zone shows at the right New York time in the grid and the right local
      time in Google; (8) an online event's link is clickable in both.
- [ ] Idempotency: a re-run with no change issues zero writes for both arms.
- [ ] RLS: a second uid sees and writes nothing on `planner_events`.
- [ ] SOP gates: typecheck/build/test green; `/code-review main high`; `/security-review`;
      STATUS + DECISIONS + ORCHESTRATOR updated; Vercel preview posted.

## Workers (proposed)

* **W-23 db + push** (`feat/planner-events-11b-db`): 067–068, `calendar-push` v4, tests, live
  proof against the `bb2dash` calendar.
* **W-24 web** (`feat/planner-events-11b-web`): query layer, form, blocks, tests.

## Out of scope

Reading anything from Google; the SU primary calendar; Google's native out-of-office /
focus-time / working-location semantics; appointment schedule pages; recurrence; drag.

## PM kickoff notes (2026-09-16)

Implementation details the Contract left open, settled by the PM at kickoff. No product decision
above changes; where a note tightens a rule, the Contract's intent is quoted. Workers cite these
as K-n.

**K-1 Branches, worktrees, seams checked.** Phase branch `feat/planner-events-11b`
(`C:/Users/estac/projects/bb2dash-wt-planner-events-11b`), cut from `main` at `5b84b01` (PR #13).
W-23 `feat/planner-events-11b-db` in `bb2dash-wt-pe-db`; W-24 `feat/planner-events-11b-web` in
`bb2dash-wt-pe-web`. At kickoff prod `schema_migrations` ends at 066 (nothing at 067 or above),
`calendar-push` v3 is live with `verify_jwt` off, `gcal_enabled` is true, no push lock is held,
`calendar_events` holds 64 rows, and nothing depends on `v_calendar_push_items` or
`calendar_events`. Phase 10a's `run_transform` (051) and every grade object are untouched here.

**K-2 `time_zone` is an IANA name, checked by the database.** Postgres also accepts POSIX strings
such as `UTC+3` and reads their sign the opposite way from ISO (three hours *west*); `Intl` and
Google read them differently or reject them. Rule: the value is `UTC` or matches
`^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$` and is present in `pg_timezone_names`. A `check` cannot run that
lookup (and a check calling `now()` is not immutable), so a `before insert or update` trigger
enforces it with a clear message. The web mirrors it: the same regex plus
`new Intl.DateTimeFormat('en-US', { timeZone })` not throwing.

**K-3 All-day rows store an exclusive end.** `all_day = true` → `starts_at` is 00:00 of the first
day in `time_zone`, `ends_at` is 00:00 of the day *after* the last day (Google's convention), so
a one-day event spans one local day. The view's all-day `start.date` / `end.date` are
`(starts_at at time zone time_zone)::date` / `(ends_at at time zone time_zone)::date`. The trigger
from K-2 rejects an all-day row whose instants are not local midnights in its zone or whose end
date is not after its start date. The grid places an all-day event on its dates whatever its zone.

**K-4 The remaining checks, spelled out.** `btrim(title) <> ''` alongside the length check;
`(location_kind is null) = (location is null)`; `location_kind is distinct from 'online' or
location ~* '^https?://[^[:space:]]+$'`; `(kind = 'task') = (done is not null)`. Grants: select,
insert, update, delete to `authenticated` under the owner policies; `anon` revoked. The dirty
trigger is statement-level `after insert or update or delete`, like 061's on `assignments`.

**K-5 068 must not break the live push.** v3 reads `calendar_events.assignment_id` and
`v_calendar_push_items.assignment_id`; renaming the column breaks v3 the moment 068 lands. "View-
compatible rename" is read as: `calendar_events.assignment_id` becomes `ref_id` with
`source text not null default 'assignment' check (source in ('assignment','planner'))` and primary
key `(source, ref_id)`; the view is dropped and recreated (no dependents, so column order may
change) with new leading columns `source`, `ref_id`, `event_id`, keeps `assignment_id` (null on
planner rows), and re-applies `security_invoker`, the anon revoke and the grants. Cut-over order,
timestamps recorded: (1) `gcal_enabled = false`, confirm `gcal_push_run_id is null`; (2) apply
068; (3) deploy v4 with `verify_jwt` false; (4) one manual push must report **zero writes on the
assignment arm**; (5) `gcal_enabled = true`. Step 4 is the proof that every existing row kept its
event id *and* that v4 builds the assignment body byte-for-byte as v3 did (any drift moves every
`content_hash` and patches all of them).

**K-6 Event body for the planner arm.** Kind labels, exactly: Event, Task, Out of office, Focus
time, Working location, Appointment slot. The view's `summary` is `[<course code> · ]<kind label>
· <title>`; v4 prefixes `✓ ` to the whole summary for a task with `done`. Timed events send
`start.dateTime` / `end.dateTime` as the stored instant (RFC 3339 with offset) **and** `timeZone`
= the event's zone, so Google keeps the instant and displays it in that zone. `description` =
notes (when set), the online URL (when online), the line `bb2dash: <kind label>`, and the
`open in bb2dash` link to `<web_base_url>/planner?week=<Monday of the New York start date>`.
`colorId` comes from one fixed six-entry kind map in `google.ts`, commented; the assignment arm
keeps its per-course colour. Deleting uses the mirror row's `source`.

**K-7 Run counts.** `calendar_push_runs.counts` keeps its six totals and adds
`<verb>_assignments` / `<verb>_planner` for each verb. Nothing in `web/` reads `counts` today.

**K-8 Live proof on Stack's real calendar leaves nothing behind.** Proof events are inserted with
SQL as the service role, titled `bb2dash test · <kind>`, dated in one week, one per kind plus one
in `America/Los_Angeles`, one all-day and one online. Run the push, check Google, patch one, mark
the task done, delete all, push again. End state: no `planner` rows in `calendar_events`, no
`planner_events` rows, Google-side count by `privateExtendedProperty app=bb2dash` equal to the
mirror count. The second-uid RLS check runs in `begin; … rollback;`.

**K-9 Grid rules (W-24).**
* Window query: `starts_at < <week end> and ends_at >= <week start>` (keeps zero-length tasks).
* Position is the New York wall clock through `Intl`. A timed event crossing New York midnight
  renders one segment per day, clipped. A segment outside 08:00–22:00 is clamped to the grid edge
  and its chip still prints the real times. A zero-length event renders at the due-card minimum
  height.
* Zone chip: when `time_zone` is not `America/New_York`, the block shows the event's own local
  time and `Intl`'s short zone name (e.g. "09:00 PDT").
* All-day events sit in a second band row labelled **Events**, directly beneath the Assignments
  band, same seven columns.
* Clicking an empty half-hour slot opens `PlannerEventForm` pre-filled with that date, that start,
  a 60-minute end and `America/New_York`; clicking an empty Events cell pre-fills an all-day
  event. Clicking an existing block (class, due card, planner event) never opens the create form;
  the Phase 11 click-to-popout on due cards and class blocks keeps working.
* Form times are wall-clock values in the chosen zone, converted once, in the web, with an
  `Intl`-based helper and no new dependency, using Temporal's `compatible` rule: a repeated time
  (the 2026-11-01 01:00–02:00 fold) takes the earlier instant, a skipped time moves forward by the
  gap, and the form says so under the field. Postgres resolves a fold the other way (standard
  time), which is why SQL never re-derives an instant from a wall clock.
* Kind decides the block style (six variants on tokens in `globals.css`; a missing token is added
  there, nowhere else). A course, when set, puts its code in the block's text; it does not
  recolour the block.
* The task checkbox updates `planner_events.done` only.

**K-10 Types and ordering.** W-23 applies and pushes **067 first** so W-24 can regenerate
`database.types.ts` from prod; until then W-24 writes against a local type matching the DDL. The
PM regenerates the types again at integration, after 068.

**K-11 Test floors.** Neither package may end below its count at `5b84b01`; each worker reports
before and after. W-23 writes `docs/planning/69c_W23_VERIFICATION.md` in the shape of
`69a_W21_VERIFICATION.md` (git-blob md5 per its §1.1, the K-5 timestamps, the K-8 runs, RLS,
advisor diff).

## Round 2 — code-review fixes (2026-09-16)

`/code-review main high` on the integrated branch (`56e8ec4`) returned 15 findings; the PM checked
the ones that matter against the code and prod. `/security-review`: no findings. Migration **069**
is reserved for this round (070–072 stay free). 067–068 are byte-frozen.

| # | Owner | Finding (checked) | Fix |
|---|---|---|---|
| R2-1 | W-23 | `index.ts` reads `v_calendar_push_items` and `calendar_events` in one unpaginated select; PostgREST's row cap (1000) would silently truncate the desired set and the delete pass would remove the missing events from Google. The planner arm grows without a date bound, so the cap is reachable | Read both sides page by page (`.range()`) until a short page, in a helper that `push.ts`-style tests can drive; a run that cannot read a complete side aborts rather than diffing a partial list |
| R2-2 | W-23 | `saveFailure` and `markDeleting` discard PostgREST's `{ error }` | Check and throw like `saveSuccess` / `remove` |
| R2-3 | W-23 | 067's trigger scans `pg_timezone_names` on every insert **and** update: **499 ms measured on prod**, so every task tick waits half a second | **069**: skip the zone lookup on `UPDATE` when `time_zone` is unchanged; show before/after timing of a rolled-back `done` update |
| R2-4 | W-24 | Editing an event that starts in the second 01:xx of the 2026-11-01 fold re-resolves its wall clock with the earlier-instant rule and moves it an hour, even when only the title changed | Keep the stored instants when date, time and zone are unchanged; convert only edited times |
| R2-5 | W-24 | Rollback restores a whole-cache snapshot, so two overlapping optimistic writes undo each other | Roll back only the affected row (or invalidate) instead of restoring the snapshot |
| R2-6 | W-24 | Esc / Cancel stay enabled while a save is pending; closing mid-save hides a server rejection | No silent loss: either block closing while pending or surface the failure outside the dialog (the grid alert) |
| R2-7 | W-24 | `canonicalTimeZone` leaves an alias such as `us/eastern` as typed; Intl accepts it, 067 rejects it, the user sees a raw database error | Send Intl's resolved zone name; field-level error for anything the K-2 rule rejects |
| R2-8 | W-24 | `eventCount` / `isEmpty` count fetched rows, not placed blocks | Count what renders |
| R2-9 | W-24 | All-day midnight check ignores seconds, so the validator accepts rows 067 rejects | Compare seconds too |
| R2-10 | W-24 | The task-toggle error alert never clears after a later successful write | Clear on the next successful write or on dismiss |
| R2-11 | W-24 | `intlAcceptsZone` builds a new `Intl.DateTimeFormat` per call despite the cached formatter | Reuse the cache |
| R2-12 | W-24 | `planner-zone.ts` re-implements `newYorkWallClock` (planner-week.ts) and `shiftIso` (anchor.ts) | Call the existing helpers |
| R2-13 | W-24 | `PlannerEventForm`'s `COLUMN_FIELD` duplicates `FIELD_OF`; the server-validation merge is unreachable | Export one map, drop the dead path |

Not changed, recorded in DECISIONS instead: 068 renamed a column and swapped a primary key rather
than adding them (the frozen Contract asked for `(source, ref_id)`; the K-5 cut-over held the push
off for 3 min 37 s with zero writes to existing events). STATUS / DECISIONS / ORCHESTRATOR are the
PM's, in this PR.
