# Phase 11 — Planner week grid, Google Calendar push, announcements bell

Date: 2026-09-14 (brief); PM session TBD. Product manager: Stack. Requirements: R-19, R-25, R-20
(bell + page), R-16 (the two group-item dates only) from `60_REQUIREMENTS_v2.md`. Phase branch
`feat/planner-11`, one PR. Runs **in parallel with Phase 10a, V-1 and V-2**. **Migration range
060–069** (10a owns 046–059).

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
- [ ] A dedicated `bb2dash` calendar is created on first run and its id persisted; the push
      never writes `primary`.
- [ ] Event ids are deterministic and base32hex-safe (`'bb' || left(sha256_hex(assignment_id), 32)`);
      every event carries `privateExtendedProperty app=bb2dash`; the whole set is recoverable
      from Google by that property.
- [ ] Idempotency proof: a re-run with unchanged data issues zero writes and the Google-side
      count is unchanged (log + count in the verification note).
- [ ] Date change → exactly one `patch`; assignment removed → exactly one `delete`; both demoed
      live and asserted in tests against a mocked Calendar client.
- [ ] Meetings are not pushed (test: zero meeting-typed events).
- [ ] Bell: badge = unread count from `v_announcements_unread`; opening the dropdown stamps
      `seen_at` and clears the badge; rows stay distinguishable afterwards (RTL test).
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
| 2 | Meeting-pattern expansion + week window (`queries.planner.ts`) | vitest: five fixture weeks incl. DST | — | W-22 |
| 3 | `/planner` grid, today marker, ◂ ▸, empty state | RTL tests per state | "my week, with rooms" | W-22 |
| 4 | Status quick-edit reuse | RTL test; SQL: only `assignment_progress` written | "I tick an item on the grid" | W-22 |
| 5 | `calendar_events` table (060) + RLS | SQL: owner-only; unique per assignment | — | W-21 |
| 6 | OAuth + Vault wiring | function reads the token from Vault; no token in repo/bundle (grep) | — | W-21 |
| 7 | `calendar-push` function: create calendar, upsert by deterministic id, extended property | mocked-client tests: insert/patch/delete counts | — | W-21 |
| 8 | Driver job registration | `sync_stage_runs` row per push run | — | W-21 |
| 9 | Idempotency + change/delete proofs on prod | log shows 0 writes on re-run; 1 patch / 1 delete on change | "I change a date and the event moves" | W-21 |
| 10 | `announcements.seen_at` + `v_announcements_unread` (061) | SQL view test | — | W-21 |
| 11 | Bell + dropdown + mark-seen-on-open | RTL tests | "the bell count clears when I open it" | W-22 |
| 12 | `/announcements` page | RTL test; reload keeps the badge at zero | "every course's announcements in one list" | W-22 |
| 13 | R-16 group-item dates | SQL: rows carry `source` / `confidence` | — | W-21 |
| 14 | Gates + docs + preview | SOP list | — | PM session |
| 15 | **Stack's acceptance script** | — | the six steps above | Stack |

Open questions from the research, for Stack (also in `70_MVP_INDEX.md` §5): one `bb2dash`
calendar or one per course; an all-day event on the due date or a timed 30-minute event ending
at `due_at`; delete an event the moment an assignment vanishes from a crawl, or after two
consecutive absences; does opening the Announcements page also clear the badge, or only the
dropdown.

## Out of scope

Meeting events in Google Calendar, two-way sync, day view, drag-to-reschedule, per-item read
tracking on announcements, OCR and classification (V-1).

## Workers (proposed)

* **W-21 database + calendar** (`feat/planner-11-db`): 060+, `calendar-push` function, OAuth
  wiring, driver job, verification note with a real push to Stack's calendar.
* **W-22 web** (`feat/planner-11-web`): planner grid, bell + dropdown, Announcements page,
  tests.
