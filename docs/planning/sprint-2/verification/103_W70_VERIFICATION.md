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

## ui-ux-pro-max

Required by the brief's working rules (amendment 3, H-1). One row per task that changes what is drawn.

| Task | Skill loaded | Files read first | Searches run | Advice set aside, and the rule that won |
|---|---|---|---|---|
| 19, 28, 31, 34, 37 | yes (Skill tool, `ui-ux-pro-max`, once at the start of the resume, before task 19) | `design-system/bb2dash/MASTER.md` (all of it), `design-system/bb2dash/pages/grades.md`, `design-system/bb2dash/pages/workspace.md`; `direction-d.json` and `component-changes.json` for every value and entry | none. The brief names every rule these tasks write, the component-changes entries give each change word for word, and `direction-d.json` holds every value, so a query would only have returned advice the brief already overrides. No `--persist` was passed and no script ran | `touch-target-size` (44 px) and `web-target-size` lose to `--size-target` (task 36, not mine); `readable-font-size` (16 px body) and the type-floor advice lose to the seven pinned `--text-*` sizes and the brief's "no 11px floor" (D-2); `weight-hierarchy` loses to the sweep's rule that weights are `--font-weight-*` tokens at today's value; `truncation-strategy` and `spring-physics` do not apply (these tasks truncate and animate nothing new); the icon-package advice (a Phosphor import) loses to "no new dependency": the marks are the inline SVGs of `icons.tsx`; `grades.md` lines 21-22, 34, 36 and 37 ("waits", "needs his word") are read against D-2, D-3, D-5 and H-5 and the brief's table of overtaken lines: all of them are now in (tasks 28, 31, 34, 37) |

## Task 19: the sweep of screens B

Commit `18dd4ce`. Every size literal, `color-mix()` and literal weight in the 66 files of the cluster is a token
reference at today's value. `screens-b.json` is set to 0 for all ten files in the same commit.

* **Dead rules deleted, and the Serif check.** `GradeModel.module.css` held 31 classes; its two renderers
  (`LinkColumnControl.tsx`, `ScoreHistory.tsx`) use seven. The other 24 (the "Our model" container with the 6% mix, the
  what-if cell, the solver, the actions, the old table, `.srOnly`) were dead since Phase 12b and went, **its table head
  with them**. So the Serif check's target reads `7 0 0`, not `8 0 0`. `GradesTables.layout.test.tsx` (unedited) still
  finds `modelStyles.link`, which stays.
* **Entries applied.** 29 `.openLink` and 30 `.itemLink` on the global link style (the colour, `text-decoration: none`
  and the hover rules are gone; `.itemLink` keeps one `:active` rule for the dim). 42: `.tabActive` and `.weekCurrent`
  name `--color-accent-500` (`.weekCurrent` also `--color-on-accent`). 23: the six boxed error rules compose
  `errorNotice` and drop their own fill and colour (padding, radius and size stay). 59: `user-select: none` on the
  course tabs (with `-webkit-user-drag: none`, they are anchors) and on the gradebook head. 60: the focus rules of the
  cluster draw `var(--size-focus) solid var(--color-accent)` with `--size-focus-gap` (inset on the rows that sit flush
  in a clipped box, as before). 64: `transition: var(--motion-control)` on the course tabs. 65: `opacity: 0.7` while
  held on `.openLink`, `.itemLink`, both `.bbLink` and `.emptyLink`.
* **Kept as they were (A3, A5 and pins).** The `.laneHead` and `.weekRow` tracks with their `72px minmax(240px, 1fr)`
  floors, `.asgRow`'s `32px minmax(0, 1fr) minmax(7.5rem, 9rem)`, the `@container (max-width: 600px)` step, and
  `CourseClasswork.tsx`'s one `marginLeft` key. `course-timeline-css.test.ts`, `Workspace.layout.test.tsx` and
  `CourseClasswork.test.tsx` are unedited and green.
* **Not done here (task 26).** `CourseTimeline.module.css`'s `.rail` `position: sticky` (my line of task 26) is as it was.

### The named commands, as printed

| Command | Exit | Printed |
|---|---|---|
| Baseline sum, `F=/^screens-b\.json$/` | 0 | `0` |
| Time check over the screens B stylesheets | 1 | nothing |
| No-select check over `CourseSubBar.module.css` and `GradebookTable.module.css` | 0 | `2 0 0` |
| `grep -c "transition: var(--motion-control)" "web/src/app/(app)/course/[id]/CourseSubBar.module.css"` | 0 | `1` |
| Weight check over `"web/src/app/(app)/materials" web/src/components/course web/src/components/grades` (and over the other five folders of the cluster) | 1 | nothing |
| Red files over `"web/src/app/(app)/course" web/src/components/course` | 0 | `CourseSubBar.module.css` and `CourseTimeline.module.css` (2 lines) |
| Notice files over the five paths of the row | 0 | six lines: `CourseAssignment`, `Materials`, `Workspace` (under `app/(app)`), `UploadDropZone`, `ConversationList`, `ServiceStatus` |
| `grep -c "var(--color-on-accent)" web/src/components/course/CourseTimeline.module.css` | 0 | `1` |
| Ring check | 0 | `29 21 3` over all of `web/src`; none of the 21 is in the cluster |
| `cd web && npx vitest run test/token-audit.test.ts` | 0 | 89 passed |
| `cd web && npm test` | 0 | 164 files, 3238 passed, 0 failed |
| `npm run typecheck`; `npx eslint . --max-warnings 0` | 0; 0 | no error; no output |

RED was the audit itself: with the sweep in and the JSON still at 72, `token-audit.test.ts` failed on
`screens-b: every file is at its baseline` with ten "counts 0, below its baseline" lines; setting the JSON to 0 made
it green.

## Task 28: type, titles and dates

Commit `f9040e7`. The gradebook head takes `--font-body` at `--font-weight-medium` (a small-capital head, so the Weight
check stays empty); the "seen" stamp loses `tokens.mono`. `git grep -c "font-family: var(--font-heading)" --
GradebookTable.module.css GradeModel.module.css` prints nothing (exit 1); `grep -c "tokens.mono"
web/src/components/grades/GradebookTable.tsx` prints `0`; the Weight check over the cluster prints nothing; the Serif
check over my two rules prints `1 0 0` (one block found, since `GradeModel`'s head is gone). `npm test`: 164 files,
3238 passed; typecheck and eslint exit 0.

## Task 34: captions and codes

Commit `7e2099a`. `GradebookTable.tsx` prints `submission.attemptText` inside the `submission.attemptStatus &&` it had.
`GradebookTable.test.tsx` changed on lines 61 and 119 only.

| Command | Exit | Printed |
|---|---|---|
| `grep -c "submission.attemptText" web/src/components/grades/GradebookTable.tsx` | 0 | `1` |
| `grep -c "last attempt: needs grading" web/test/GradebookTable.test.tsx` | 0 | `2` |
| `git diff --numstat origin/main...HEAD -- web/test/GradebookTable.test.tsx` | 0 | `2	2	web/test/GradebookTable.test.tsx` |
| `cd web && npx vitest run test/GradebookTable.test.tsx test/status-vocabulary.test.ts` | 0 | 2 files, 36 passed |

## Task 37: busy says busy

Commit `9d85a10`. `aria-busy` beside the five `disabled` sites of the row. `git grep -c -E
"aria-busy=\{(pending|busy)\}"` over the four files prints `LinkColumnControl.tsx:2`, `UploadDropZone.tsx:1`,
`OpenStoredButton.tsx:1`, `ConversationList.tsx:1`; `grep -c "aria-busy" web/src/components/shell/TopNav.tsx` prints
`1`. `npm test`: 164 files, 3238 passed. No stylesheet of mine carries a rule for it (the five rules of the busy look
belong to other workers).

## Task 31: marks

Commit `19f7ba3`, after W-68's `icons.tsx` commit (`git grep -c "export function Mark"` printed `:2`, `git grep -c
"export const MARK_CHAR"` printed `:1`). 18 characters in 9 files drawn by `Mark`: `TimelineRows.tsx` (close),
`CourseGradeCard.tsx` (fold caret, "Open ... →"), `FileOpenAction.tsx`, `MaterialsBrowser.tsx` (two fold carets, "Open
in Classwork →", "Blackboard ↗"), `CourseSubBar.tsx`, `CourseClasswork.tsx`, `CourseGrades.tsx`, `CourseInfo.tsx`,
`CourseStream.tsx`.

* **Mark characters, before and after** (the command over all of `web/src`): before `41 20`, after `23 11`. W-70's fall
  is 18 characters in 9 files, as the brief says; the 23 and 11 left are the other workers'.
* A right arrow after a link's words is `<Mark name="caretRight" char={MARK_CHAR.arrowRight} />`, so the glyph stands in
  `icons.tsx` only. The two carets that were `aria-hidden` sit in the same `aria-hidden` span.
* `CourseStream.tsx`'s two labels keep their values (`` `Open ${MARK_CHAR.arrowUpRight}` `` is `'Open ↗'`) and are drawn
  through `MarkedLabel`; so is `FileOpenAction.tsx`'s fallback.
* `grep -c "<MarkedLabel"`: `FileOpenAction.tsx` 1, `MaterialsBrowser.tsx` 2, `CourseStream.tsx` 1.
* `cd web && npx vitest run test/course-stream.history.test.tsx test/FileOpenAction.test.tsx
  test/MaterialsCourseLinks.test.tsx test/CourseClasswork.test.tsx` → exit 0, 4 files, 57 passed, unedited.
* `cd web && npm test` → exit 0, 167 files, 3301 passed; typecheck exit 0; eslint exit 0; audit exit 0.
* **Default.** `MaterialsBrowser.tsx` renders `STAGED_LABEL` twice (the link, and a plain span when there is no
  Blackboard link). The brief's "stays typed" rule is for `SubmissionBlock.tsx:98` and its `getByText`; no test reads
  `MaterialsBrowser`'s span that way (no test mentions `STAGED_LABEL`), so both are drawn through `MarkedLabel`.

## Harness run: owed

`node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route /course/|route /grades |route /materials |route /workspace "`
from this worktree at `19f7ba3`: run `20261009T005344Z`, `exit_code` 1, **16 failed**. Every case fails before it
measures anything, at `bodyFontLoaded` (`phone-width.spec.ts:182`): `a face of Source Sans 3 with status "loaded"`,
30 s timeout. A repeat of `route /grades ` alone (run `20261009T010534Z`) failed the same way, so it is not a flake.
The cause is not in my files: the failing precondition is the page's body font, which comes from the Google Fonts
`@import` in `web/src/app/globals.css` (W-67's, task 8) and the box. W-67's own run `20261009T004202Z` of the public
pages fails at the same line. I did not wait or poll for it. Widths are therefore **not re-measured** since the sweep;
the last measured widths are the GREEN run of task 14 (`20261008T235232Z`, all 16 at 390). The sweep swaps literals
for tokens at the same value and the marks are 1em inline SVGs where a one-character glyph stood, so no box is
expected to move. **Owed:** this run, 16 passed, once the font loads in the box.
