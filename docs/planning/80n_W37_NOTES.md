# W-37 — T-2, the planner popover and the full-details page (P-planner-5)

Worker: W-37 · branch `fix/page-pass-12b-tail-popover` · worktree `bb2dash-wt-12b-tail-popover`,
cut from `main` at `6f20a00` (plus `c3b4552`, the frozen tail contract).

Contract: `80c_PHASE12B_page_pass.md` §"Post-MVP tail — frozen contract (PM, 2026-09-21)" → T-2,
intake row P-planner-5, Stack's answer 14, and row T-2 of §Item task list.

## What was built

### 1. One shared assignment-detail body

`AssignmentPopout.tsx` was 477 lines and was the only place the assignment detail existed. It is
now four files, none over ~250 lines, with no markup copied anywhere:

| file | what it is |
|---|---|
| `web/src/components/popout/AssignmentDetailBody.tsx` | the body itself — breadcrumb, title, facts, instructions, series, late/AI policies, the planner block, the submission block, the footer |
| `web/src/components/popout/AssignmentPlannerBlock.tsx` | "Your plan": the form, its dirty-field merge (`mergePlannerForm`) and the one write |
| `web/src/components/popout/assignment-detail-format.ts` | pure: `NOT_RECORDED`, `formatDate`, `formatClock`, `formatDue` |
| `web/src/components/popout/AssignmentPopout.tsx` | the name the rest of the app opens; renders the body inside `PopoutShell` as before |

`ItemPopout` is unchanged, so `?item=assignment:<id>` behaves exactly as it did on every screen.
`AssignmentPopout.test.tsx`, `ItemPopout.test.tsx` and `SubmissionBlock.test.tsx` passed unedited.

### 2. The full-details route

`/course/[id]/assignment/[...assignmentId]` — `page.tsx` (server, resolves the id) plus
`CourseAssignment.tsx` (client screen) and its CSS module. It renders `AssignmentDetailBody`
inside a panel under the existing course layout and sub-bar, following the data-loading and auth
pattern of the sibling course routes (client screen, TanStack hooks, the `(app)` layout's guard).

Not-found handling raises Next's boundary (`/_not-found` is in the build) when:

* no assignment has that id, **or**
* the assignment belongs to another course — with one deliberate allowance: an assignment on a
  child shell (`courses.parent_course_id`, e.g. GEO 103's recitation) resolves under its parent's
  URL, so links built from a display course still work.

Neither decision is taken before the read that would settle it has landed; a loading query renders
"Loading assignment…", and a failed one says so.

Pure half in `web/src/lib/assignment-page.ts`: `assignmentPagePath`, `assignmentIdFromSegments`,
`assignmentBelongsToCourse`.

### 3. The planner popover

`web/src/components/planner/PlannerItemPopover.tsx` (+ its CSS module). On `/planner` only,
clicking a due card — or pressing Enter on its title, which fires the same click — opens a small
anchored dialog holding: course tag, title, the due line, the points/score line when one exists,
the status select (the six values from `progress-status.ts` via `StatusOptions`, written with the
popout's own `useSavePlanner`), the Blackboard link when the course has one, and "See full
details →" pointing at the new route.

* Escape, the ✕, and a press outside close it; a press on its own card is left to the card, which
  toggles — so one popover is open at a time and a second click on the same item shuts it.
* Focus moves into the panel on open and returns to the item that opened it on close.
* `role="dialog"` + `aria-labelledby` the panel's own `<h2>`, so it is always named (it reads
  "Loading assignment…" until the title arrives). Not `aria-modal`: it is a popover, and Tab is
  not trapped.
* Positioning is `web/src/lib/popover-position.ts` — `placePopover()`, pure, no dependency: sit
  below and centred, flip above when there is no room below, then clamp into the viewport
  intersected with the scrolling planner board (`[data-planner-board]`), inset by a margin. It
  re-measures on resize and on scroll (capture), and the panel is hidden until it has been placed
  once.

**No fabricated numbers.** The points line is `assignments.points_possible` on its own, or
Blackboard's mirrored `effective_score / possible` via `scoreText`. Nothing is divided, totalled
or projected, and an absent score never becomes a zero.

**Wiring.** `PlannerItem.tsx`: `ItemActions.href` now takes the `WorkItem` and returns the
full-details path; `open(id, anchor)` replaces the router push; `openItemId` drives the title
link's `aria-expanded`. `PlannerWeek.tsx`: the popover target state, a week-change reset and the
mount — the only edits there, and none in `PlannerBoard.tsx`. `PlannerEvent*` files, the
recurrence files and `queries.plannerEvents.ts` were not touched (W-36's).

The title stays a real `<a href>` at the full-details page: a plain click is cancelled and left to
bubble to the card (popover), a modified or middle click still opens the page in a new tab.

## Tests

`npm run typecheck`, `npm run lint` (0 errors, 27 warnings — the same 27 as on `main`, none in a
new file), `npm test` and `npm run build` are all green.

| | files | tests |
|---|---|---|
| before | 93 | 1,582 |
| after | 98 | 1,645 |

New files (62 tests): `popover-position.test.ts` (12 — anchoring, flip, clamp, bounds, purity),
`PlannerItemPopover.test.tsx` (24 — contents, the six statuses, the status write, Escape, outside
click, card toggle, focus return, placement, `pointsLine`), `CourseAssignment.test.tsx` (7 — the
page renders the shared body, the child-shell case, loading/error, both not-found branches),
`assignment-page.test.ts` (11 — path, segments, ownership), `item-popout-surfaces.test.tsx` (8 —
Home and Grades still render a real `?item=` href, the four surfaces still go through `itemQuery`,
the planner builds none, the host is still mounted).

Edited: `PlannerWeek.test.tsx` (the six due-item tests that asserted the old `?item=` push now
assert the popover; +1 test for the one-at-a-time toggle; its `maybeSingle` stub now unwraps a row
from the fixture list, which the popover's four single-row reads need),
`PlannerWeek.events.test.tsx` (one assertion: a due card opens the popover, never the event form),
`status-vocabulary.test.ts` (the audit list now names `AssignmentDetailBody.tsx`, the file that
renders the status, in place of `AssignmentPopout.tsx`).

## Deviations from the frozen contract

1. **The route is `/course/[id]/assignment/[...assignmentId]`, a catch-all, not a single dynamic
   segment.** `assignments.id` is `<course>/<kebab-slug>` (DATA_SYNTAX), so every id contains a
   slash; a single segment would mean `%2F`, which `next/link` survives but proxies and CDNs
   routinely decode. The path reads `/course/IST.323/assignment/IST.323/lab-1`. The `%2F` form
   still resolves to the same id, because `assignmentIdFromSegments` joins whatever it is given.
2. **A child shell's assignment is accepted under its parent course's URL** (GEO 103). Strictly,
   "belongs to another course" would 404 it; that would break any link built from the display
   course, which is what every other screen links by.

## For the PM

* **Nothing needs a decision to land.** Both deviations above are mine and reversible in a line
  each if you disagree.
* The planner's due-item title no longer opens the `?item=` panel — that is the contract, but it
  is the one behaviour change Stack will notice on a screen he already walked. Worth a sentence in
  the walk note.
* Browser check outstanding: the popover's geometry is unit-tested and jsdom-tested, but jsdom
  measures every box as zero, so the flip and clamp have never been seen against a real layout.
  The front-end check for T-2 (click a due item on `/planner` → small anchored popover; "See full
  details" → the page under the course) should include a near-the-bottom item and a Sunday-column
  item, which are the flip and the right-edge clamp.
* `database.types.ts` untouched; no migration, no `project-state/` edit, nothing merged.
