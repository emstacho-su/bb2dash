# W-33 (planner) — verification note, Phase 12b

Branch `fix/page-pass-12b-planner`, worktree `bb2dash-wt-12b-planner`.
Rows: **PL-1, PL-2, PL-3 — done.** T-1 (recurring) and T-2 (small popover) not started;
they are post-MVP and wait for the PM.

| gate | before W-33 | after |
|---|---|---|
| `npm run typecheck` | clean | clean |
| `npm run build` | compiles | compiles |
| `npm test` | 87 files, **1342** tests | 92 files, **1421** tests |

Nothing in this branch inserts a `planner_events` row. Every test mocks
`@/lib/supabase/client`; the suite has no network and no Supabase project.

---

## The one map

```ts
// web/src/lib/planner-rows.ts
slotToPx(slot: number, heights: readonly number[]): number
pxToSlot(px: number,   heights: readonly number[]): number
spanPx(top: number, height: number, heights: readonly number[]): { topPx, heightPx }
```

`heights` is one entry per half-hour row, in pixels, for the **whole week** — the seven
columns share their rows with the gutter, so a table per day would put "3 PM" on seven
different lines. It is built by

```ts
buildSlotHeights(weekSlotWeights(blocksByDay))   // in usePlannerWeekData
```

where `weekSlotWeights` takes the **busiest day** per row (never the week's sum) and
`buildSlotHeights` turns a row's weight *w* into `min(max(ceil(w), 1), 4) × 24px`.

Every consumer and where it calls:

| consumer | file:symbol | call |
|---|---|---|
| class blocks, due cards, event segments | `PlannerBoard.tsx` → `Block` | `spanPx(block.top, block.height, heights)` → `--top-px` / `--height-px` |
| the now-line | `PlannerBoard.tsx` → `DayColumn` | `slotToPx(nowSlot, heights)` |
| the gutter's hour labels | `PlannerBoard.tsx` → `HourGutter` | `slotToPx(hour.slot, heights)` |
| the hour rules | `PlannerBoard.tsx` → `HourRules` | `slotToPx(hour.slot, heights)` |
| the 196 half-hour click targets | `PlannerSlots.tsx` → `DaySlots` | `slotToPx(slot, heights)` and `slotToPx(slot + 1, heights) − that` |
| the board's total height | `PlannerBoard.tsx` → `WeekBoard` | `gridHeightPx(heights)` → `--planner-grid-height` |
| the pre-hydration reserve | `PlannerWeek.tsx` → `PlannerWeekSkeleton` | `reservedBoardHeightPx()` |

**The 08:00–22:00 clamp did not move.** `slotOffset` (planner-week.ts) and `segmentBox`
(planner-events-grid.ts) still clamp in *slot* units. That is deliberate and it is safe
because the map is monotonic: `top ≤ 28 − height` in slots implies the block's pixels are
inside `[0, gridHeightPx]`. The property test `never goes backwards` is what makes that an
argument rather than an assumption, and
`PlannerWeek.events.test.tsx > splits an event across New York midnight` asserts the
clamped segments' resolved pixels (648px and 0px).

---

## Worked example — a class and two due items in one hour

The fixture in `web/test/PlannerWeek.rows.test.tsx`: Wednesday 2026-09-16,
IST 323 lecture **3:45–5:05 PM** in Hinds Hall 010, with two IST 323 items due inside it —
Quiz 3 at 4:00 PM and "Lab #1 — packet capture and analysis for the midterm review" at
4:30 PM. Both are the lecture's own course inside its window, so both **nest** in the class
block (Phase 11's rule, unchanged).

**1. Slots.** `slotOffset(15:45) = (945 − 480) / 30 = 15.5`;
`slotOffset(17:05) = (1025 − 480) / 30 = 18.1\overline{6}`. Height `2.6\overline{6}` slots.

**2. Weight.** The class asks for `1 + nested.length = 3` lanes' worth of room —
itself plus one per chip. Nothing else is drawn that day.

**3. Rows charged.** Every row the block covers, whole or part:
`floor(15.5) = 15` through `ceil(18.1\overline{6}) = 19`, exclusive — rows **15, 16, 17, 18**.

**4. The table.**

| row | clock | weight | height |
|---|---|---|---|
| 0–14 | 08:00 – 15:30 | 0 or 1 | 24px |
| **15** | **15:30** | **3** | **72px** |
| **16** | **16:00** | **3** | **72px** |
| **17** | **16:30** | **3** | **72px** |
| **18** | **17:00** | **3** | **72px** |
| 19–27 | 17:30 – 21:30 | 0 | 24px |

**5. Positions.**

```
slotToPx(15.5)    = 15×24 + 0.5×72                 = 360 + 36        = 396px
slotToPx(18.1667) = 15×24 + 3×72 + 0.1667×72       = 360 + 216 + 12  = 588px
block height      = 588 − 396                                        = 192px
```

Phase 11 gave the same class `2.6\overline{6} × 24 = 64px` and scrolled the two chips
inside it. It now gets **192px** — three times the room, which is exactly the three lanes
it asked for — and nothing scrolls.

**6. What moved with it.** Grid height `28×24 + 4×48 = 672 + 192 = 864px`. The 5 PM gutter
label sits at `slotToPx(18) = 576px`. The 5:30 PM click target sits at
`slotToPx(19) = 648px` and `pxToSlot(648) = 19` exactly, so the click still creates an
event at 5:30 PM. The now-line (10:00, slot 4) has not moved at all: `96px`, as before.

All six numbers are asserted in `PlannerWeek.rows.test.tsx`, written out literally and then
asked of `slotToPx` a second time — which is what pins the component to the module rather
than to a copy of its arithmetic.

---

## PL-1 · P-planner-1 — the Assignments band collapses

Commit `0ca4908`.

* **RED:** `npx vitest run test/PlannerWeek.band.test.tsx` → **8 failed** (no toggle
  exists: `Unable to find an accessible element with the role "button" and name /assignments/i`).
  The 10 storage tests in `test/planner-band-preference.test.ts` passed on the new module.
* **GREEN:** 18/18.
* **Persistence** is `web/src/components/planner/band-preference.ts`, the no-throw rules of
  `web/src/lib/sidebar-preference.ts` verbatim: `readStoredBand` returns `null` when storage
  throws, `writeStoredBand` swallows a quota error, and `BAND_DEFAULT` is `'closed'` so a
  browser with no memory still opens closed. Key `bb2dash.planner.assignments`.
  Test: *renders closed rather than throwing when storage is blocked*.
* **Nothing due is invisible.** A closed day cell keeps its place and shows its count, and
  carries it for a screen reader: `Assignments · Thu · 2 due`, `Assignments · Wed · nothing due`.
  A day with nothing shows no number rather than a `0`.
* **The empty-week line shows either way** — it is the week's state, not the band's contents.
* Six existing tests in `PlannerWeek.test.tsx` now open the band first, the same click Stack
  makes. `PlannerWeek.test.tsx` also clears `localStorage` per test: jsdom keeps one store per
  file, and without it one test's choice leaked into the next (it did, and the three
  even-numbered band tests failed — diagnosed, not guessed).

## PL-2 · P-planner-2, 3, 4 — variable rows, no scrollers, wrapping

Commit `96ffeec`.

* **RED:** `npx vitest run test/planner-rows.test.ts` →
  `Failed to resolve import "@/lib/planner-rows"`. **GREEN:** 30/30.
* **fast-check** is already a dev dependency (`4.10.1`, added by 10b). The property suite runs
  **200 cases** per property over random weight tables and random fractional slot positions.
  `FC_SEED=<integer>` replays a failure; the seed is printed in front of the report. The
  helper is local to `test/planner-rows.test.ts` rather than imported from
  `test/grade-model/fc-params.ts`, so W-31's tree and mine cannot break each other.
* The five properties the brief asked for:

  | property | test |
  |---|---|
  | monotonic | *never goes backwards* |
  | continuous | *has no gap at a row boundary, so two blocks meet flush* |
  | inverse round-trips | *undoes slotToPx*, and the same from a pixel |
  | cap honoured | *never leaves a row shorter than the base or taller than the cap* |
  | **base case identical** | *is a plain multiplication when no row has grown* — `slotToPx(s) === s × 24` at every whole slot, every half slot, and 200 random fractional ones |

  The base case is also asserted end to end on the screen:
  `PlannerWeek.rows.test.tsx > a week with nothing overlapping is the grid Phase 11 drew`
  checks the board's total height, four slot buttons and both block kinds against `slot × 24`.
* **Lanes are untouched.** `assignLanes` is unchanged; past the 4× cap the side-by-side lanes
  carry the rest, as before. *still lets two clashing courses share the hour side by side, and
  grows it* asserts both halves: `--lane-width: 50%` on each block **and** a grown grid.
* **P-planner-3.** `.nested { overflow-y: auto }` is gone. `test/planner-css.test.ts` scans the
  whole stylesheet for `overflow(-y): auto|scroll` and requires **no match**, and separately
  requires `.board { overflow-x: auto }` to survive — that one is seven columns on a narrow
  window, not a block.
* **P-planner-4.** `.blockTitle`, `.blockTopic`, `.blockRoom` and `.eventTitle` carry
  `white-space: normal` + `overflow-wrap: anywhere` under `-webkit-line-clamp`. The block
  title's clamp is `var(--title-lines)`, set per block from `titleLines(heightPx, otherLines)`
  — floor of `(height − 6px padding) / 14px line`, less the lines the block always draws,
  bounded to 1…6. At one line the clamp *is* the ellipsis, so a compact half-hour block keeps
  the Phase 11 look with no special case; `.eventBlock[data-compact]` says so explicitly
  because its layout is a row.
  `PLANNER_BLOCK_LINE_PX = 14` is `--text-xs` (11px) × `line-height: 1.25`, rounded up — both
  numbers are in the stylesheet, neither is a guess.
* **The hour rules changed mechanism.** They were a `repeating-linear-gradient` every 48px on
  the column background; an even repeat stops meeting the gutter's labels the moment a row
  grows. They are now one positioned 1px rule per hour, placed by the same `slotToPx`.
  `draws one hour rule per hour after the first, on the same map` checks all thirteen.
* `PlannerWeek.tsx` is the screen again (250 lines); the board moved to `PlannerBoard.tsx`
  (383). Largest file in my scope is the stylesheet at 708 lines.

## PL-3 · P-planner-7 — the three inspected risks

Commit `3d76579`. RED → GREEN for each; before the fix,
`npx vitest run test/planner-css.test.ts test/PlannerWeek.hydration.test.tsx` reported
**5 failed | 17 passed**.

1. **The band label could be clipped by its own band.** "Assignments" does not fit a 62px
   gutter, so 11b rotated it — which needs ~86px of *height* instead. A band cell is 29px with
   one chip in it and shorter on an empty week, so the rotation traded one clipping for
   another; the empty week was the visible case, not the only one. **Fix:** the word is not
   drawn. The chevron is what the gutter shows, the per-day counts say what is behind it, and
   "Assignments" stays the cell's accessible name and its `title`. Nothing in that cell asks
   the band for room, so nothing in it can be clipped at any band height.
   **Test:** *does not rotate the label into the band height* — no `writing-mode` and no
   `rotate:` anywhere in the stylesheet — and *keeps the word for a screen reader without
   asking for room on screen*. jsdom lays nothing out, so this is asserted from the source,
   the way `audits.test.ts` already does for the whole of `src/`.
2. **`.blockCode` absolute inside a `display: contents` parent with no positioned chip.**
   `.nestedChip > .blockHead` generates no box, so the visually-hidden course code resolved
   against the class block two levels up. **Fix:** `.nestedChip { position: relative }`.
   **Test:** *positions the nested chip, because its hidden course code is absolute*, which
   asserts both halves so the rule cannot be dropped as "unused". The same trap was about to
   be reintroduced by the fix for risk 1 — `.bandToggleLabel` is absolute too — so
   `.bandToggle` is positioned in the same commit.
3. **The pre-hydration placeholder swapped the whole section.** One line of text, replaced a
   moment later by ~770px of grid. **Fix:** `PlannerWeekSkeleton` — the same `<section>`, the
   same header row, an inert pager, and the board's height held open by
   `reservedBoardHeightPx()` = `(28 + 4) × 24 = 768px` (the hour rows plus the day heads and
   two bands). Exact on a week with no overlaps; short by whatever a crowded one gained, which
   is stated in the function's own comment rather than pretended away.
   **No React #418:** the skeleton renders identically on the server and on the first client
   render, and it says nothing the server cannot know. *still invents nothing the server can
   not know* asserts no week label, no `Week 4`, no now-line, no band; the pre-existing
   *hydrates server HTML under a restored cache without a hydration error* still passes with
   `onRecoverableError` never called. The pager is `aria-hidden` and the section `aria-busy`
   while it is inert, so no screen reader is offered a control that does nothing.

---

## Status labels

The planner has **no status vocabulary of its own**. Its only status surface is the shared
`StatusSelect` (`web/src/components/tracker/StatusSelect.tsx`), which `PlannerItem.tsx`
imports; the planner event form has no status field. So the planner is covered by W-32's S-1
the moment `StatusSelect` reads `web/src/lib/progress-status.ts` instead of
`queries.today`'s `STATUS_OPTIONS` / `STATUS_LABEL`. I did not touch `progress-status.ts` or
`StatusSelect.tsx`. Worth a second look on the PM's browser walk: open the Planner quick-edit
after W-32 lands and confirm it lists exactly the six.

## For the browser walk

1. `/planner` opens with **Assignments collapsed**; the counts in the seven cells match what
   expanding shows. Toggle, reload, it is still open.
2. A week with a class and something due inside it — **that hour is taller**, the chips are in
   the class block, and there is no scrollbar inside it.
3. **Click an empty slot below that class.** The create form must prefill the half hour the
   slot looks like. This is the one thing a unit test can only approximate.
4. The **gutter's hour labels line up with the hour rules** in every column, on a grown week.
5. Load `/planner` with a cleared cache and watch the top of the page: the header and the
   board's box should be there first and stay put. Console must be clean (no #418).
6. A long assignment title on a tall block should **wrap**, not ellipsise mid-word; a
   half-hour event should still be one line.

## What T-1 and T-2 will need from this geometry

* **T-1 (recurring, P-planner-6).** Occurrences are ordinary `planner_events` rows, so they
  arrive as ordinary segments and cost the row table nothing new — a weekly series simply
  makes the same row busy on more days, and `weekSlotWeights` already takes the busiest day.
  One thing to decide: a series with an occurrence every day at 9 AM will make that row as
  tall as **one** day's crowding, which is right, but a series badge or count drawn on the
  block would add a line and so should raise the block's `weight`, not just its markup.
* **T-2 (small popover, P-planner-5).** It needs an anchor rectangle for the thing clicked.
  `spanPx` already gives the block's `topPx`/`heightPx` in the column's own coordinates, and
  `pxToSlot` reads a pixel back as a time — between them the popover can be positioned from
  the model rather than from `getBoundingClientRect`, which matters because the board scrolls
  sideways. Blocks carry `data-block` and chips `data-open="true"`; both are stable handles.
  The popover must not be rendered inside a block: `.block { overflow: hidden }` would clip
  it, and that clip is now load-bearing (it is what replaced the scrollers).
