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
