# R-11 — Phase 11: planner week grid, Google Calendar push, announcements bell

Researcher R-11, 2026-09-14. Scope: R-19, R-25 (due dates only), R-20. Read-only research.

## 1. Comparables

| Product | How it ships the feature |
|---|---|
| [MyStudyLife](https://mystudylife.com/tour/) | Weekly/rotating timetable plus day/week/month views; classes, tasks and exams in one grid. Rotation (Day A/B) is its differentiator — bb2dash needs none of it. |
| [Google Classroom → Calendar](https://support.google.com/edu/classroom/answer/6272985) | Auto-managed calendar per class; **only items with due dates appear**; the Classroom calendar is read-only. Exactly Stack's MVP shape. |
| [Canvas calendar feed](https://www.myclassmaite.com/guides/canvas-syllabus-to-google-calendar) | Publishes an ICS URL you subscribe to — one-way, read-only, and Google refreshes subscribed ICS roughly [every 12–24 h](https://usemooncal.com/en/guides/google-calendar-ics-refresh). The standard student complaint. |
| [Todoist for students](https://www.todoist.com/inspiration/todoist-guide-for-students) | Calendar integration is **read-only inside Todoist**, one provider at a time. Deliberately refuses a two-way merge. |
| [TickTick](https://ticktick.com/) | Course-per-list, tags, saved filters ("due this week"), calendar view over tasks. |

## 2. Patterns to copy

**Week grid, density and time.** `meetings` already stores `day_of_week`, `start_time`/`end_time` as bare `time` plus `location` — floating wall-clock, which is what a class schedule actually is. Keep it; render by wall clock, never round-trip through UTC. Due items are mixed: `assignments.due_at` is `timestamptz`, `assignments.due_date` is a bare `date`. Resolve one zone (`America/New_York`) once at the top of the page; put date-only items in an all-day band above the timed rows instead of inventing 23:59. Copy Classroom's restraint — meetings in time position, due items in the band, today's column tinted. `◂ ▸` steps ±7 days from an anchor date, not from "now", so paging is a pure function.

**Event identity for idempotent push.** Do not let Google mint ids. `events.insert` accepts a client-specified `id`, which "prevents duplicate event creation if the operation fails at some point after it is successfully executed in the Calendar backend" ([create-events](https://developers.google.com/workspace/calendar/api/guides/create-events)). Charset is base32hex — lowercase `a`–`v` and `0`–`9`, 5–1024 chars, unique per calendar ([Events reference](https://developers.google.com/workspace/calendar/api/v3/reference/events)). SHA-256 hex satisfies that charset directly: `id = 'bb' || left(sha256_hex(assignment_id), 32)`. Push becomes an upsert — `insert`, and on 409 `patch`. Tag every event with a private extended property (`app=bb2dash`, `assignment_id=…`) so the whole set is recoverable via `events.list(privateExtendedProperty=…)` without trusting local state ([extended properties](https://developers.google.com/workspace/calendar/api/guides/extended-properties)). Keep a content hash locally and skip the call when nothing changed — that is what makes re-runs free.

**Bell semantics.** Stack's rule (dropdown open = seen = badge clears) is the PatternFly notification-badge model: the badge is a silent "something new in the drawer" indicator, and read/unread must still differ visually in the list after it clears ([PatternFly](https://www.patternfly.org/components/notification-badge/design-guidelines/)). `announcements.is_read boolean` exists (migration 004) and 014 records that `read_at`/`author` were cut; reinstate as a nullable `seen_at timestamptz`.

## 3. Anti-patterns

- **Two-way sync.** Todoist and Classroom both refuse it. Never read Google back. If Stack edits an event there, our next push overwrites it — say so in the UI copy.
- **Duplicate events.** Caused by Google-minted ids plus a retry, or by "delete all, re-create" reconciliation — both produce notification storms on his phone.
- **Timezone bugs.** Storing a meeting as an instant (drifts an hour across the [8 Mar spring-forward](https://qaskills.sh/blog/timezone-dst-testing-guide)); treating a date-only due date as midnight UTC (wrong day all evening); sending `dateTime` without `timeZone` (interpreted against the calendar's zone, not ours).
- **ICS feed as the mechanism.** 12–24 h lag; a status change appears tomorrow.

## 4. Standard operating procedure

**Grids.** Fixture weeks, never `new Date()`: freeze the clock (`vi.setSystemTime`) and assert placement for an ordinary week, the 8 Mar 2026 spring-forward week, the 1 Nov 2026 fall-back week, an empty week, and one straddling `meetings.starts_on`/`ends_on`. Name fixtures for the hazard (`springForwardMissingTwoThirty`) so nobody simplifies them away. Home is the existing Vitest suite in `web/test/`.

**Sync.** Three runs against a throwaway calendar: run 1 creates N events; run 2 with unchanged data issues **zero** writes and leaves the count identical; run 3, after one date change and one deletion, patches exactly one and deletes exactly one. Assert on the Google-side count from `events.list(privateExtendedProperty='app=bb2dash')`, not on our logs.

**Quotas.** Projects created on/after 1 May 2026: 10,000 req/min/project, 600 req/min/user, 1,000,000 req/day billing threshold ([usage limits](https://developers.google.com/workspace/calendar/api/guides/quota)). ~200 assignments is noise; still back off on 403 `userRateLimitExceeded`.

**OAuth, one user.** The trap: with the consent screen **External + Testing**, refresh tokens are revoked after 7 days and the sync dies silently mid-semester ([Google](https://support.google.com/cloud/answer/15549945)). Publish to **In Production**, or set user type **Internal** under the Syracuse Workspace org. Scope `calendar.events` only, `access_type=offline`, `prompt=consent` once; refresh token into Supabase Vault.

## 5. Proposed DoD checklist

- [ ] Grid renders `meetings` with room at wall-clock position for the anchor week.
- [ ] Due items land on their day: date-only in the all-day band, timed items in position.
- [ ] Today's column is visually distinct; `◂ ▸` steps ±7 days; header names the week's date range.
- [ ] Status quick-edit writes `assignment_progress` and the row updates without reload, as on Today.
- [ ] No drag, no work-window lane, no day view.
- [ ] Vitest: five fixture weeks green, including spring-forward and fall-back.
- [ ] Empty week renders an empty state, not a blank page.
- [ ] Consent screen is not External+Testing; refresh token in Supabase Vault; no token in the repo or the browser bundle.
- [ ] A dedicated `bb2dash` calendar is created on first run and its id persisted; the push never writes to `primary`.
- [ ] Event ids are deterministic and base32hex-safe; every event carries `privateExtendedProperty app=bb2dash`.
- [ ] Idempotency proof: re-run with unchanged data issues zero writes; Google-side event count unchanged.
- [ ] Date change → exactly one `patch`; assignment removed → exactly one `delete`; both demoed live.
- [ ] Meetings are not pushed (R-25 as amended, `70_MVP_INDEX` §1.9).
- [ ] Bell badge shows unread count; opening the dropdown clears it and stamps `seen_at`; read/unread rows stay visually distinct after.
- [ ] Announcements page lists all courses newest-first with course · author · date, and survives reload with the badge at zero.

## 6. Open questions for Stack

1. One `bb2dash` calendar or one per course? Classroom does per-class so each can be coloured/hidden in Google.
2. All-day event on the due date, or a timed 30-minute event ending at `due_at`? Timed gives a phone alert at the right hour.
3. If an assignment vanishes from a crawl, delete its event immediately, or only after two consecutive absences (crawl-flake insurance)?
4. Does the crawler's creator field (R-20) land in this PR? Without it the bell line degrades to `course · date`.
5. Does opening the Announcements *page* also clear the badge, or only the dropdown?
