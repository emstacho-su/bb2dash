# 103 · W-70 verification (screens B)

Worker W-70, branch `feat/styling-22-screens-b`, worktree `bb2dash-wt-22-screens-b`. Merged `origin/feat/styling-22`
(ea91c9a) first, a merge; the start check passed (`web/e2e/phone-width.spec.ts` and `web/test/TopNav.fold.test.tsx`
both exist on the phase branch, `git cat-file -e` exit 0 each).

## Task 14: the gradebook scrolls inside its own box; the routes of rows 05-12 fit at 390 px

Commits: `53cab10` test (RED), `0f94ea4` feat (GREEN).

### RED, then GREEN

| Step | Command | Exit | Result |
|---|---|---|---|
| RED, unit | `cd web && npx vitest run test/GradesTables.layout.test.tsx test/gradebook-phone-width.css.test.ts` | 1 | 4 failed, 4 passed (8): the wrapper rule has no `overflow-x`, no `min-width: 0`, no hook in the source, no hook in the rendered DOM. The layout test (3 cases) and the th/td case pass. |
| RED, harness | `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route /course/\|route /grades \|route /materials \|route /workspace "` from a detached worktree at `53cab10` | 1 | run `20261008T234852Z`: 12 passed, 4 failed. Page `scrollWidth`: `/grades` 505 (both themes), `/course/IST.466/grades` 642 (both themes); the other six routes 390. |
| GREEN, unit | same unit command | 0 | 2 files, 8 passed, 0 failed |
| GREEN, harness | same harness command from this worktree at `0f94ea4` | 0 | run `20261008T235232Z`: `exit_code` 0, `result` `passed`, 16 passed, 0 failed |

The harness pattern in the task row is written `\|` between alternatives. Playwright's `-g` takes a JavaScript
regular expression, where `\|` is a literal bar and would select nothing, so the plain `|` was used. It selects the
same 16 titles (5 `/course/` routes, `/grades`, `/materials`, `/workspace`, each in both themes).

Page `scrollWidth` per route, GREEN run `20261008T235232Z` (all 390, dark and light):
`/course/IST.352/stream`, `/course/IST.471/classwork`, `/course/IST.466/grades`, `/course/IST.466/info`,
`/course/IST.471/assignment/IST.471/a1-proposal`, `/grades`, `/materials`, `/workspace`.

Which of the eight were too wide, and by how much, at RED: only the two gradebook routes (`/grades` 505, so 115 px too
wide; `/course/IST.466/grades` 642, 252 px). Both render `GradebookTable`, so the one scroll box fixes both. The
candidates the brief named (`white-space: nowrap` in `CourseSubBar` and `Materials`) did not overflow at 390 px; no
other file needed a change.

The task row also asks that, on `/course/IST.466/grades`, the scroll box's `scrollWidth` be greater than its
`clientWidth`, read from the frozen hook. The spec as it stands on the phase branch does not read the hook (it asserts
the page's `scrollWidth` only) and `web/e2e/` is not mine to edit, so that reading was not made. What shows the box
scrolls: the page `scrollWidth` went from 642 to 390 with the table's width unchanged. The hook itself is proven by
the unit test (one element carries it, it wraps both tables, it carries the `.wrap` class).

### What changed

* `web/src/components/grades/GradebookTable.tsx`: `<div className={styles.wrap} data-scroll-box="gradebook">`.
* `web/src/components/grades/GradebookTable.module.css`: `.wrap` gains `min-width: 0` and `overflow-x: auto`. Nothing on
  `th` or `td`. No size literal added, so `screens-b.json` is unchanged (no baseline moved).
* `web/test/gradebook-phone-width.css.test.ts` (new, 5 cases): the wrapper rule has `overflow-x: auto` and no vertical
  scroll or `overflow` shorthand; it has `min-width: 0`; no `th` / `td` rule in either grades stylesheet sets
  `overflow*` or `display`; the source carries the hook once on `className={styles.wrap}`; the rendered table has one
  hook element, with the wrapper class, around both tables.

### The checks of the task row, each by itself

| Command | Exit | Result |
|---|---|---|
| `cd web && npx vitest run test/GradesTables.layout.test.tsx test/gradebook-phone-width.css.test.ts` | 0 | 2 files, 8 passed, 0 failed (layout test unedited) |
| `cd web && npx vitest run test/Workspace.layout.test.tsx test/course-timeline-css.test.ts test/CourseClasswork.test.tsx test/GradebookTable.test.tsx test/token-audit.test.ts` (with the two above) | 0 | 7 files, 151 passed, 0 failed |
| `grep -c 'data-scroll-box="gradebook"' web/src/components/grades/GradebookTable.tsx` | 0 | `1` |
| `cd web && npx vitest run test/token-audit.test.ts` | 0 | 1 file, 89 passed, 0 failed |
| `cd web && npm test` | 0 | 161 files, 3123 passed, 0 failed |
| `cd web && npm run typecheck` | 0 | no error |
| `cd web && npx eslint . --max-warnings 0` | 0 | no output |
| `grep -c "^## Tokens my sweep needs$" docs/planning/sprint-2/verification/103_W70_VERIFICATION.md` | 0 | `1` |

### Defaults taken

1. The scroll box is `.wrap`, the existing element around both tables and the bookkeeping toggle (the Contract allows
   "`.wrap` or an inner element"). The toggle button therefore sits inside the box and slides with the tables if they
   are scrolled; it is pinned left by `align-self: flex-start`.
2. `min-width: 0` is added with `overflow-x: auto`: the card that holds the table is a grid / flex child and without it
   the box would widen its parent instead of scrolling.
3. The harness `-g` pattern uses a plain `|` (see above).
4. No `ui-ux-pro-max` section: task 14 changes no drawn look (the task list names 12, 13, 16 to 19 and 26 to 38 for the
   skill). The section is owed with W-70's sweep.

## Tokens my sweep needs

Survey of the whole W-70 cluster (`screens-b`, 66 files, baseline total 72) with the scanner of
`web/test/token-audit.scan.ts` and the frozen allowlist, plus the literal `font-weight` declarations the Weight check
looks for. Counts: 69 size literals and 3 `color-mix()` (72, the baseline), 0 colour literals, 0 TSX style keys, 4
literal weights. `1px` and `2px` and the A3 pinned declarations need no token and are not listed. Line numbers are the
files as of commit `0f94ea4` (GT counts the six comment and rule lines task 14 added); the Stream timeline is `components/course/CourseTimeline.module.css`
(CT below), `app/(app)/course/[id]/classwork/CourseClasswork.module.css` is CC, `app/(app)/materials/Materials.module.css`
is MT, `app/(app)/course/[id]/info/CourseInfo.module.css` is CI, `app/(app)/course/[id]/CourseSubBar.module.css` is SB,
`components/grades/GradebookTable.module.css` is GT.

Already declared and reused, so not listed: `11px` is `--text-xs` (CT 122, 193, 281, 352); `13.5px` is `--text-base`
(CT 288). The seven `--space-*` and the three `--radius-*` have no exact match for any remaining literal. D's 34 new
names are not asked for under another name; `--font-heading-weight` is 500 today but it is the heading weight and D
moves it to 600, so the plain 500 asks for its own name below.

| Name | Today's value | Where it is used |
|---|---|---|
| `--text-3xs` (first asked as `--text-9`) | `9px` | font-size: CC 116; MT 176, 196; CT 66, 199, 299, 310, 336, 423, 469, 510 |
| `--text-2xs` (first asked as `--text-10`) | `10px` | font-size: CC 68, 99; CI 64, 111; MT 112, 118; GT 25 |
| `--text-10-5` | `10.5px` | font-size: CT 46 |
| `--text-11-5` | `11.5px` | font-size: CT 147, 213, 293 |
| `--text-12` | `12px` | font-size: CT 249, 325 |
| `--text-13` | `13px` | font-size: CT 377 |
| `--size-3` | `3px` | gap CT 273; padding CT 324 (`3px var(--space-3)`) |
| `--size-4` | `4px` | padding SB 18; gap SB 69 |
| `--size-5` | `5px` | padding CC 100 (`1px 5px`) |
| `--size-6` | `6px` | padding: CC 76, 125; CT 200, 300, 308, 378, 421, 509 |
| `--size-8` | `8px` | padding SB 70 (`1px 8px`) |
| `--size-9` | `9px` | width MT 114 (the bucket caret) |
| `--size-16` | `16px` | width and height: CT 331, 332, 503, 504 |
| `--size-22` | `22px` | height CT 38 |
| `--size-28` | `28px` | width and height MT 168, 169; flex-basis calc MT 253; width CT 37 |
| `--size-32` | `32px` | width and height: CT 244, 245, 492, 493; padding calc CT 448 |
| `--size-44` | `44px` | grid-template-columns CT 22 |
| `--size-60` | `60px` | grid-template-columns: CT 411, 412 (inside the 600px container step) |
| `--size-72` | `72px` | grid-template-columns: CT 114 (`.laneHeadSingle`), 172 (`.undated`); the pinned `.laneHead` / `.weekRow` tracks are A3 and keep their literal |
| `--size-assignment-max` | `760px` | the assignment page frame, `width: min(760px, 100%)`: `course/[id]/assignment/[...assignmentId]/CourseAssignment.module.css` 9 |
| `--size-conversations-min` | `14rem` | Workspace conversation column, `minmax(14rem, 18rem)`: `app/(app)/workspace/Workspace.module.css` 8 |
| `--size-conversations-max` | `18rem` | same declaration |
| `--size-report-card-min` | `11rem` | `components/grades/ReportCardStrip.module.css` 20 (`.card` min-width) |
| `--size-report-card-max` | `16rem` | `components/grades/ReportCardStrip.module.css` 21 (`.card` max-width) |
| `--color-accent-tint-6` | `color-mix(in srgb, var(--color-accent) 6%, transparent)` | background: `components/grades/GradeModel.module.css` 14 |
| `--color-accent-tint-7` | `color-mix(in srgb, var(--color-accent) 7%, transparent)` | background: CT 177 |
| `--color-accent-tint-12` | `color-mix(in srgb, var(--color-accent) 12%, transparent)` | background: CT 499 |
| `--font-weight-regular` | `400` | font-weight: GT 45 (`.nameCell`) |
| `--font-weight-medium` | `500` | font-weight: MT 137; CT 250 |
| `--font-weight-semibold` | `600` | font-weight: MT 25 (`.courseCode`) |

That is 30 names: 6 `--text-*`, 18 `--size-*`, 3 `--color-*`, 3 `--font-*`. Notes for task 8:

* The three tints are `--color-*`, so each needs a light-block declaration; today's value is the same expression in
  both themes (it resolves against `--color-accent`, which D points at the ink in both).
* `--size-4`, `--size-5`, `--size-6`, `--size-8` and `--size-3` are spacing used for padding and gaps in modules that
  have no `--space-*` step that equals them (the seven `--space-*` are 2.8, 5.6, 8.4, 11.2, 16.8, 22.4 and 33.6 px).
  If another table asks for the same px value under another `--size-*` name, one name per value is enough: say so in
  the task 8 commit and I use the name `globals.css` declares.
* A name this table lacks is reported, not invented: none is known to be missing.

I do not start the sweep (task 19): it waits for W-67's task 8.

## Waiting for

W-67's task 8 (the token declarations, `.errorNotice`, the light block) before the sweep, task 19. Nothing in this task
was blocked by another worker's file: all 16 cases of rows 05-12 pass.

## Resume: after W-67's task 8

Merged `origin/feat/styling-22` (a merge). The five start checks each printed one line (`data-theme='light'` in
`globals.css`; `^\.errorNotice` in `tokens.module.css`; `motion-control`; `size-target`; `attemptText`).

* **Names corrected.** The PM ruled one name per value: 10px type is `--text-2xs` and 9px is `--text-3xs`; there is no
  `--text-10` or `--text-9`. The two rows of the table above now carry the declared names, with the first-asked name
  beside each.
* **Token names**, printed: `68 38 0`, `69 53 0`, `70 31 0`. (31, not 30: the command's pattern also reads the
  `--size-4, ...` bullet of the notes under the table, which starts with a backticked name.)
* **The gradebook hook, closed.** W-68's spec now reads it. Run `20261009T001508Z` printed
  `route /course/IST.466/grades [dark]: box scrollWidth=620 clientWidth=345` (the same in light). The box scrolls.
