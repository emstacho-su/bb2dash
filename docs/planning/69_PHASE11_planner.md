# Phase 11 — Planner week grid, Google Calendar push, announcements bell

Date: 2026-09-14 (brief); PM session TBD. Product manager: Stack. Requirements: R-19, R-25, R-20
(bell + page), R-16 (the two group-item dates only) from `60_REQUIREMENTS_v2.md`. Phase branch
`feat/planner-11`, one PR. Runs **in parallel with Phase 10a, V-1 and V-2**. **Migration range
060–069** (10a owns 041–059).

**Base.** Cut from `main` after Phase 9 (PR #10) merges: the bell and Stream posts read Phase
9's `announcements.author` / `read_at` / `modified_at` (migration 033).

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

## Contract — to be frozen by the phase PM session before workers spawn

Must specify:

* `/planner` route and `queries.planner.ts`: the week window, the meeting-pattern expansion
  (from `courses`/`meetings` rows to dated blocks, America/New_York), the due-item source
  (`v_work_items`), status quick-edit reuse from Today.
* Calendar push: `calendar_events` table (060+) keyed by `(assignment_id)` with the Google
  `eventId`, `etag`, `last_pushed_at`, `last_error`; an Edge Function `calendar-push` run by
  the Phase 9 driver after each transform and on demand; idempotency via a stable
  `iCalUID`/extended property; deletion when an item disappears; OAuth for the single user
  server-side with the refresh token in Supabase Vault. **The setup steps Stack must do himself
  (Google Cloud project, consent screen, one-time consent) are listed for him.**
* Bell: `announcements.seen_at` (or reuse `read_at` with the "seen" semantics documented),
  `v_announcements_unread`, the dropdown, the `/announcements` page, mark-all on open.
* R-16 dates: where they come from (materials or Stack) and how they are recorded with
  `source`/`confidence`.

## Seams (frozen)

Phase 10a owns the popout and Grades routes; Phase 11 only links to the popout. V-1 owns grading
rules. Phase 9 owns the driver; 11 registers one job with it. No shared tables are written by
both phases.

## Definition of done

_Pending research (R-11 report) — filled in PR #11._

## Task loops

_Pending research (R-11 report) — filled in PR #11._

## Out of scope

Meeting events in Google Calendar, two-way sync, day view, drag-to-reschedule, per-item read
tracking on announcements, OCR and classification (V-1).

## Workers (proposed)

* **W-21 database + calendar** (`feat/planner-11-db`): 060+, `calendar-push` function, OAuth
  wiring, driver job, verification note with a real push to Stack's calendar.
* **W-22 web** (`feat/planner-11-web`): planner grid, bell + dropdown, Announcements page,
  tests.
