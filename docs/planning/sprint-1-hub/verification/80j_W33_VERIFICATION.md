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
buildSlotHeights(weekSlotDemandPx(blocksByDay))   // in usePlannerWeekData
```

where `weekSlotDemandPx` takes the **busiest day** per row (never the week's sum) and
`buildSlotHeights` clamps each row's demand to `[24px, 96px]`. A row's demand is two things
added: **one base height per block drawn on it** (the lane rule, so three overlapping blocks
still make a 72px row) **plus the largest per-row shortfall among them** — how much more a
block needs than its own span is worth, spread over that span. Lanes add up because they sit
side by side; shortfalls do not, because a row only has to be as tall as the hungriest block
on it needs. See Round 3 below for why that is not one number.

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

**2. What it needs.** The class draws three lines of its own — the course-and-time head, the
room, the session's topic — and carries two nested chips. A chip is 39px: 1px of padding,
a 14px title line, a 1px row gap, the 22px status control, 1px of padding. So

```
contentRequiredPx(3, 2) = 6 + 3×14 + (2 + 39 + 2 + 39) = 130px
```

against the `2.6\overline{6} × 24 = 64px` its hours are worth. **Shortfall 66px.**

Not "three lanes". That was CR-5's bug: a chip was charged as a whole 24px lane on *every*
row the class spanned, so this block came out at 192px, an 80-minute class with one chip at
144px for a 39px chip, and three chips put every row on the 96px cap.

**3. Rows charged.** Every row the block covers, whole or part:
`floor(15.5) = 15` through `ceil(18.1\overline{6}) = 19`, exclusive — rows **15, 16, 17, 18**.
Each is asked for one lane (24px) plus the shortfall spread over the block's **span**, not
over the four rows it touches: `66 / 2.6\overline{6} = 24.75px`. Spreading over the four rows
would hand the block only two-thirds of what it asked for.

**4. The table.**

| row | clock | demand | height |
|---|---|---|---|
| 0–14 | 08:00 – 15:30 | 0 or 24px | 24px |
| **15** | **15:30** | **24 + 24.75** | **48.75px** |
| **16** | **16:00** | **24 + 24.75** | **48.75px** |
| **17** | **16:30** | **24 + 24.75** | **48.75px** |
| **18** | **17:00** | **24 + 24.75** | **48.75px** |
| 19–27 | 17:30 – 21:30 | 0 | 24px |

A fractional row height is fine, and usually right: a shortfall rarely divides evenly into a
span, and CSS lays out subpixels without complaint.

**5. Positions.**

```
slotToPx(15.5)    = 15×24 + 0.5×48.75               = 360 + 24.375   = 384.375px
slotToPx(18.1667) = 15×24 + 3×48.75 + 0.1667×48.75  = 360 + 146.25 + 8.125 = 514.375px
block height      = 514.375 − 384.375                                = 130px
```

Phase 11 gave the same class 64px and scrolled the two chips inside it. It now gets
**exactly the 130px its content needs** — not a pixel more — and nothing scrolls.

**6. What moved with it.** Grid height `28×24 + 4×24.75 = 672 + 99 = 771px`. The 5 PM gutter
label sits at `slotToPx(18) = 506.25px`. The 5:30 PM click target sits at
`slotToPx(19) = 555px` and `pxToSlot(555) = 19` exactly, so the click still creates an
event at 5:30 PM. The now-line (10:00, slot 4) has not moved at all: `96px`, as before.

**A class with no chips does not grow at all**, even if a line does not fit: Stack's rule is
that hours grow when things collide, not whenever text is long. The 55-minute GEO 103 block
stays 44px, clips its topic on a whole line, and keeps it on its tooltip (F-2).

All of these numbers are asserted in `PlannerWeek.rows.test.tsx`, written out literally and then
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

## Round 2 — F-2 (P-planner-4), from the PM's browser walk

Everything else in PL-1..PL-3 passed the walk, including the click below a grown hour.
`80d_PHASE12B_WALK.md` finding **F-2** had two halves, both visible in `../walks/walk-12b/planner.png`.

| gate | round 1 | round 2 |
|---|---|---|
| `npm test` | 92 files, 1421 | **103 files, 1656** (the phase branch merged in) |
| `npm run typecheck` / `build` | clean | clean |

RED first: `npx vitest run test/planner-week.test.ts test/planner-rows.test.ts
test/planner-css.test.ts test/PlannerWeek.rows.test.tsx` → **15 failed**
(`formatClockRange is not a function`, `blockContentPx is not a function`,
`no rule for ".blockBody"`, no `flex-wrap`, no `line-height: 14px`). Then green.

### (a) "GEO 103 10:35 AM – 11:30 A" — the end time clipped off the line

Two changes, because either alone leaves a case standing.

* **`formatClockRange(startMinute, endMinute)`** in `planner-week.ts` — Google's rule: when
  both ends share a meridiem it is said once. `10:35 AM – 11:30 AM` → **`10:35 – 11:30 AM`**,
  three of the four characters that were being lost. Both are kept when they differ
  (`11:40 AM – 12:35 PM`), which is exactly the range where dropping one would mislead.
  Noon and midnight are the cases a naive hour comparison gets wrong and both are tested.
  An end *earlier* than the start is not bad data here — an 11 PM–1 AM event arrives as
  `(1380, 60)` and reads `11:00 PM – 1:00 AM`; `expandMeetings` checks a backwards end
  itself before asking, because a class that ends before it starts *is* bad data.
  Used by `expandMeetings` and `planner-events-grid.timedSegments` — the only two places
  a range was being assembled by hand.
* **`.blockHead { flex-wrap: wrap; gap: 0 4px }`** — shortening is not enough for
  `11:40 AM – 12:35 PM` (19 characters), so the head is now allowed to wrap and the range
  drops onto its own line instead of being eaten by the block's `overflow: hidden`.
  Nothing in the head can be clipped horizontally any more: it either fits or it wraps.
  `row-gap: 0` keeps that second line on the 14px pitch (b) counts in.

Nine existing expectations moved to the new format across four suites
(`3:45 PM – 5:05 PM` → `3:45 – 5:05 PM`, and so on); `11:00 PM – 1:00 AM` did not.

### (b) "Trendy Today, Toxic" cut through the middle of the letters

A block's height is whatever its hours make it and is almost never a multiple of a line, so
clipping at the block's own edge cuts a line in half. Three changes:

* **`.block { line-height: 14px }`**, not `1.25`. This arithmetic counts lines, and
  1.25 × 11px = 13.75px does not divide a text area into whole ones — three of them end
  0.75px past a 42px area, and that sliver is the half-drawn line. 14px on 11px text is the
  same 1.27 to the eye. `PLANNER_BLOCK_LINE_PX` is now exact rather than a rounding.
* **`blockContentPx(heightPx)`** in `planner-rows.ts` — the most whole lines that fit, and
  not one pixel more. Property-tested: always a multiple of the line, never more than the
  block has to give, never shrinks as the block grows, at least one line, and it agrees with
  `titleLines`.
* **`.blockBody`**, a new wrapper inside the block with `height: var(--content-px)`,
  `overflow: hidden`, `gap: 0`. The block keeps its full height, so its coloured box still
  spans its real hours and still meets the hour rules; only the *text* stops early, at the
  line boundary. The clip then lands exactly where the next line begins, so every line drawn
  is drawn completely and the one that does not fit is not drawn at all — whatever wrapped
  above it. Six `>` selectors were re-rooted onto `.blockBody`, including the compact event
  block's row layout.

A due card is drawn at `.itemBlock`'s 48px minimum however short its span, so its text is
counted from **that** (`PLANNER_DUE_CARD_MIN_PX`), not from its one slot: 42px, three lines,
which is head + title + status.

**The trade this makes, in the open.** The 55-minute GEO 103 block has room for two lines —
code/time and room — so its topic is now not drawn at all rather than half drawn. A topic
that exists and is nowhere would be worse than the bug, so the class block gained a tooltip
carrying every line whether or not there was room for it:
`GEO 103 · 10:35 – 11:30 AM · Watson Theater · Trendy Today, Toxic Tomorrow`
(`meetingTooltip`, asserted in `PlannerWeek.rows.test.tsx`). A class has no popout, so its
`title` was free; an item's own `Open …` title still wins.

### Also in round 2

`PlannerWeek.band.test.tsx` flaked once in the full run — the first test of the file, which
also pays the module import, at 5.18s against vitest's 5s default, on a machine running
103 jsdom environments. The work is real and small; what is not predictable is when the file
gets the CPU. The budget is raised (`vi.setConfig({ testTimeout: 20_000 })`, 15s on the
`findBy` waits) rather than the assertion loosened, and the reason is written above it. Full
suite run twice after, green both times.

### What the PM should check on the next walk

1. Friday's `GEO 103 11:40 AM – 12:35 PM` — the one range that still cannot be shortened.
   It should now **wrap onto a second line**, right-aligned, not clip.
2. The Monday/Wednesday GEO blocks: two lines, both whole. Hover one and the topic should
   be in the tooltip.
3. `IST 466 2:00 – 3:20 PM` on Tuesday had a two-line topic that just fitted at 64px; with
   whole-line clipping it gets four lines of 14px in a 58px text area — so the last line
   may now be dropped rather than squeezed. Worth a look to confirm that reads better.

## Round 3 — CR-5 (P-planner-2), from `/code-review main high`

| gate | round 2 | round 3 |
|---|---|---|
| `npm test` | 103 files, 1656 | **91 files, 1520** (the phase branch merged in; W-31 consolidated the grade-model suites) |
| `npm run typecheck` / `build` | clean | clean |

**The finding.** `weight = 1 + chips` was charged to *every* row a class spanned. An
80-minute class is four rows, so one 39px chip made all four 48px and the block 144px; three
chips put every row on the 96px cap, 288px of block — and since the seven columns share one
set of rows, the whole board stretched with it.

**The fix.** A row's demand is no longer one number. It is **lanes + shortfall**:

* **lanes** — one base height per block drawn on the row. Unchanged, and it is still what
  makes two genuinely concurrent blocks a 48px row and three a 72px one. They add up because
  they sit side by side.
* **shortfall** — `max(0, requiredPx − span × 24)`, spread over the block's **own span** and
  taken as a *maximum* across the blocks on a row, not a sum. A row only has to be as tall as
  the hungriest block on it needs it to be.

`requiredPx` is measured, not estimated: `contentRequiredPx(textLines, chips)` adds the
block's padding (6px), its own lines (14px each) and the chips — **39px** apiece, which is
`.nestedChip`'s 1px padding + a 14px title line + its 1px row gap + the 22px status control
(`.statusSelect`: a line box, 3px padding and a 1px border, both sides) + 1px of padding —
with `.nested`'s 2px gaps between and above them.

Spreading over the *span* rather than over the rows touched is the part that is easy to get
wrong: a 2⅔-slot block covers four rows, so dividing by four would hand it two-thirds of what
it asked for.

**The numbers.** All from `test/planner-rows.test.ts`, RED against the old table:

| case | required | before | after |
|---|---|---|---|
| 80-min class, 1 chip | 89px | 144px | **89px** |
| 80-min class, 2 chips | 130px | 192px | **130px** |
| 80-min class, 3 chips | 171px | 288px, every row capped | **171px**, no row above 64.125px |
| 80-min class, no chips | 48px | 64px | **64px** (unchanged) |
| two clashing blocks | — | 48px row | **48px row** (unchanged) |

**New property**, as the review asked: *gives a block that needs more than its span the room,
and barely more* — for random spans and demands, a block that asked for more than its span is
worth gets at least `min(requiredPx, cap)` and strictly less than `requiredPx + 24`. Blocks
hanging off the bottom of the grid are excluded, because `slotToPx` clamps them and they
genuinely cannot be given their full height (`slotBox` and `segmentBox` clamp before this
point, so no real block reaches it that way).

**Base case and cap both kept.** A week with nothing overlapping and nothing nested demands
`1 × 24` a row, so the table is flat and `slotToPx(s) === s × 24` — still property-tested at
200 random fractional positions. The cap is still 4× base, now applied to the summed demand.

**One judgement call to flag.** `requiredPx` is only asked for by a class that actually has
chips nested in it. A class too short for its own topic does **not** stretch the grid — Stack's
rule is that hours grow when things collide, not whenever a line is long — so the 55-minute
GEO 103 block stays 44px and keeps F-2's behaviour: two whole lines, and the topic on the
tooltip. `buildSlotHeights` now returns fractional heights, which is correct (a shortfall
rarely divides evenly into a span) and which CSS lays out without complaint.

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
