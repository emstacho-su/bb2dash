# Phase 12b tail — PM browser walk (2026-09-21)

Logged-in Playwright on the Vercel preview of `fix/page-pass-12b-tail` (Stack signed in; the PM
drove). Screenshots in `walk-12b-tail/`. Every planner row the walk created was deleted in the same
sitting; the Google mirror settles back to 68 on the next push tick.

## T-2 — small assignment popover + full-details page (P-planner-5)

| Step | Result |
|---|---|
| Expand the Assignments band, click a Monday due card | popover anchored under the card: course chip, title, due line, "10 points possible", status select, Blackboard ↗, "See full details →" (`walk-tail-02`) |
| Escape | popover closes; focus back on the card's link |
| Click a Thursday card (rightmost column with items) | popover flips left to stay inside the board (`walk-tail-03`) |
| "See full details" | `/course/IST.323/assignment/IST.323/lab-1-performing-a-ransomware-attack` renders the same body under the course tabs (`walk-tail-04`) |
| Home and Grades | still emit `?item=` popouts (regression test `item-popout-surfaces`) |

Finding **W-1** (fixed in round 3, W-37): the due line read "Due not recorded · 11:59 PM" — the date
half came from `due_date`, null on 38 of 44 timed assignments. Now derived from `due_at` in New York:
"Due Wed, Sep 23 · 11:59 PM"; the page's DUE cell the same.

## T-1 — recurring planner events (P-planner-6)

| Step | Result (prod rows checked by SQL after each step) |
|---|---|
| Fri Sep 25 9:00 slot → Repeats: Weekly → Ends on 2026-10-16 | form shows "4 occurrences"; Save → 4 rows on one series, Fridays 9:00 New York; ↻ mark on the block (`walk-tail-05`); push run 42 inserted 4 |
| Edit Sep 25, start 9:30, scope dialog → **This event** (`walk-tail-06`) | that row moved and detached; the other three untouched |
| Week of Sep 28: edit Oct 2, new title, **This and following** | Oct 2–16 retitled and moved to a new series; old series `until_date` → Oct 1 with the detached row |
| Edit an occurrence | Repeats and Ends on read-only with the sentence explaining why |
| Delete Oct 2, **All events** | new series + its 3 rows gone; the detached Sep 25 row survived (by design) |
| Delete the detached row | plain confirm, no scope question; grid empty of test rows |

Finding **W-2** (pre-existing, fixed by **089**): every timed Blackboard deadline sat one day late on
the planner and the Home tracker — `v_work_items.due_on` cast `due_at` to a date in UTC, so 11:59 PM
New York became the next day. 22 assignments moved; Lab #1 now sits on Wed 23 like its Google event.

Finding **W-3** (open, known issue): deleting the *last* occurrence of a series through the plain
delete (a detached row) leaves an empty `planner_event_series` row. Harmless and invisible; the
walk's one orphan was removed by SQL. 088 handles the RPC paths only.

Not walked: monthly and daily rules (unit + property tests only), the 52 cap in the browser, a
Los Angeles occurrence across a DST week (property-tested).
