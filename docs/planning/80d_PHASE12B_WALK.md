# Phase 12b — PM browser walk

PM session in Playwright on the Vercel preview of `fix/page-pass-12b`
(`web-git-fix-page-pass-12b-emstacho-sus-projects.vercel.app`), signed in by Stack, 1440 × 900,
prod data. Screenshots in `walk-12b/`. "Before" is production `main` as Stack described it in
his list; no before-screenshots were taken (the list is the record).

## Pass 1 — 2026-09-17, branch at `4fc6e4c` (W-30, W-32, W-33 merged; W-31 still building)

| row | check | result | evidence |
|---|---|---|---|
| H-1 | five types tell apart | **pass** — teal reading, violet assignment, amber quiz, green project, red exam | `home.png` |
| H-2 | scroll spans all dated items, opens at today, ◂ ▸ work | **pass** — strip 4531 px wide in a 1075 px window, opened at today (9/17), caption "Scrolls Sep 14 – Nov 11"; course Stream reuse also scrolls (Aug 31 – Nov 11) | `home.png`, `course-after-sidebar-click.png` |
| H-3 | one card; needs-attention last | **pass** | `home.png` |
| H-4 | Undated holds none of the twelve; all ten cases in Materials | **pass** — Undated = 5 real items; Materials shows "Case pool" | `home.png`, `materials.png` |
| H-5 | course cards open the course | **pass** — six cards, each an `<a href="/course/<id>">` | DOM read |
| H-6 | sidebar closes on navigation, preference untouched | **pass** — open on Home, clicked IST 323 in the sidebar, closed on the course page; no sidebar key written | `course-after-sidebar-click.png` |
| S-1 | six statuses everywhere | **pass on Home, tracker, planner chip** — not opened / in progress / submitted / graded / excused / DNF. **Finding F-1** below | `home.png`, `planner.png` |
| PL-1 | band collapsed by default, counts shown | **pass** — 4 / 1 / 2 / 3 for the week of 9/21 | `planner.png` |
| PL-2 | overlap hour grows; no inner scrollbars; text wraps; click below a grown hour lands right | **pass** — Mon 4 PM hour is taller (IST 323 + Quiz #4 nested, no scrollbar); "New event, Mon Sep 21, 6:00 PM" sits on the 6 PM gutter line and the form prefilled 18:00–19:00 (closed without saving). **Finding F-2** | `planner.png` |
| PL-3 | no layout jump, clean console | **pass** — 0 errors, 0 warnings on load | console read |
| I-2 | both outcomes stated per row | **pass** — "Recorded only — nothing is changed automatically." under both buttons of a kind that never applies; help text at the top | `inbox.png` |
| I-3 | no raw JSON; source in words; link | **pass** — course, kind, age, from → to, "From the staff list in GEO 103 … Raised by sync run #47", "Open GEO 103 →". **Findings F-3, F-4** | `inbox.png` |
| M-1 | buckets collapse; readings under date headers; Case pool | **pass** — 30 toggles; "Thu, Aug 27", "Tue, Sep 8" …; "Case pool" present | `materials.png` |
| M-2 | label split | **pass (label half)** — In library 68 · External 58 · Off-platform 21 · "On Blackboard — not pulled yet" 18. The 18 wait for a file pull | DOM read |
| M-3 | "How to access" opens the course syllabus | **pass** — opened a signed URL under `bb-files/ECN.304/syllabus_…` | DOM read |
| X-3 | the two IST.323 final-project events on Google | pending the next calendar push read | — |
| G-* | grades rows | pending W-31 | — |
| X-2 | Electron build | pending | — |

### Findings (go back to workers as round 2)

* **F-1 (S-1, W-32).** The course Stream's post line still prints the raw enum ("not started");
  it should read `statusLabel()` → "not opened".
* **F-2 (PL-2, W-33).** A class block's first line clips the end time ("10:35 AM – 11:30 A"); let
  the time wrap or drop the repeated AM/PM. Short blocks also cut their topic mid-word ("Trendy
  Today, Toxic"); clamp on a line boundary.
* **F-3 (I-3, W-32).** A date in another year prints without the year ("Tue, Sep 20, 11:06 AM"
  is 2022). Print the year whenever it differs from the current one — that is the whole point
  of those out-of-term conflicts.
* **F-4 (I-2, W-32).** Resolved staff-name conflicts carry the chip "answered, applies on next
  sync", but that kind never applies. The chip should say "answered · recorded only" for kinds
  `apply_resolutions` skips.
* **F-5 (X-3, W-30, low).** The IST.323 shared-column conflict is still open in the Inbox though
  075 now handles the shared column; decide whether 075's restamp should dismiss it.
