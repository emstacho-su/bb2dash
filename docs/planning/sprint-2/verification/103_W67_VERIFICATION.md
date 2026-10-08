# 103 · W-67 verification (foundation), tasks 1 and 2

Phase 22, brief `docs/planning/sprint-2/briefs/103_PHASE22_styling.md`. Worker W-67, branch
`feat/styling-22-foundation`, worktree `bb2dash-wt-22-foundation`, cut from `feat/styling-22` at c42924f.
Written 2026-10-08. Tasks 1 and 2: the token audit ratchet and its frozen allowlist. A checker round followed
the same day (findings CR-1 and CR-2). It has its own section below, and the numbers here are the ones after it.

No file under `web/src` was touched, not even for a probe. Nothing under `project-state/` was touched. The
brief was not edited. No dependency was added: the scanner imports nothing.

## What is on the branch

| commit | what |
|---|---|
| `10ed7d4` | feat(22-T1): `web/test/token-audit.scan.ts`, `web/test/token-audit.test.ts`, the four baselines |
| `ce2519f` | feat(22-T2): `web/test/token-audit.allowlist.ts`, the scanner's three allowances, the entry checks, two baselines lowered |
| `2fd1d44` | docs(22): this note, with the task-2 sha |
| `172a0ee` | fix(22-T2): CR-1, first step: a width condition is read whole at any depth |
| `a1afeae` | fix(22-T2): CR-2: an A5 entry names exactly one key of its file |
| `efac39b` | fix(22-T2): CR-1, second step: a width condition that holds a function fails whole |
| this commit | docs(22): the checker round on the record |

**The task-2 commit is `ce2519f5fea5c752cc712f3df0e15a924f5e5328`.** After it the allowlist file is not edited
by anyone. The check at the PR:

    git diff --quiet ce2519f5fea5c752cc712f3df0e15a924f5e5328 HEAD -- web/test/token-audit.allowlist.ts

It exits 0 today, after the checker round too. The file's blob at that commit is
`b2e43b9636bb9f34c5174da51e911e5de9c1c1d2`, and it is the blob on the branch now.

## The four gates

Each command was run by itself from `web/`. No result was read through a pipe: the output went to a file and
the exit code came from the shell.

On the task-2 tree (`ce2519f`):

| Command | Exit | Result |
|---|---|---|
| `npx vitest run test/token-audit.test.ts` | 0 | 1 file, 86 passed (86), 0 failed |
| `npm test` | 0 | 157 files, 2999 passed (2999), 0 failed |
| `npm run typecheck` | 0 | `tsc --noEmit`, no error |
| `npx eslint . --max-warnings 0` | 0 | no output |

After the checker round (`efac39b`):

| Command | Exit | Result |
|---|---|---|
| `npx vitest run test/token-audit.test.ts` | 0 | 1 file, 89 passed (89), 0 failed |
| `npm test` | 0 | 157 files, 3002 passed (3002), 0 failed |
| `npm run typecheck` | 0 | `tsc --noEmit`, no error |
| `npx eslint . --max-warnings 0` | 0 | no output |

2999 is `main`'s 2913 plus the 86 cases of the new file. 3002 is the same 2913 plus 89: the round added three
cases. The first `npm test`, at task 1, gave 2981.

## Task 1: the token audit ratchet (P-15)

### RED, then GREEN

| Step | Command | Exit | Result |
|---|---|---|---|
| RED 1: the fixture cases against a scanner that finds nothing, baselines `{}` | `npx vitest run test/token-audit.test.ts` | 1 | 35 failed, 33 passed (68) |
| RED 2: the scanner written, baselines still `{}` | same | 1 | 4 failed, 64 passed (68) |
| GREEN: the four baselines written from the tree | same | 0 | 68 passed (68) |
| The first whole suite | `npm test` | 0 | 2981 passed (2981) |
| Types, lint | `npm run typecheck`; `npx eslint . --max-warnings 0` | 0; 0 | no error; no output |

RED 1's 35 failures are the 30 "what counts" fixtures, the line-and-literal case and four of the unresolved
cases. Every "counts 0" fixture passes against an empty scanner, which is why those cases alone prove nothing
and the "what counts" table sits beside them. RED 2's four failures are the four ratchet cases: every file with
a literal was above a baseline of 0.

### The fixture cases the task row lists

All pass. Counts 1: `#fff`, `rgba(0,0,0,.5)`, `color-mix(in srgb, var(--a) 10%, transparent)`, `white`,
`padding: 13px`, `style={{ padding: 0 }}`, `const s = { padding: 0 }` with `style={s}`, `style={pick()}`.
Counts 2: `minmax(14rem, 18rem)`. Counts 0: `var(--color-text)`, `transparent`, `currentColor`, `/* #fff */`,
`style={{ '--x': v }}`, `style={{ ['--x' as string]: v }}`, `const s = { ['--x' as string]: v }` with
`style={s}`, a `.ts` JSDoc comment holding `var(--slot) * 24px` (0 counts and 0 unresolved), and
`box.style.height = 'auto'`. The test's header says imperative style writes are outside the audit's scope.
A fixture `var(--nope)` is unresolved once. The live tree has 0 unresolved references. Every scanned file
belongs to exactly one cluster. `web/src/app/layout.tsx` counts 1, its `'#161826'`: the number is in
`foundation.json`, and a fixture holds the same line. It is not a hard-coded live assertion, because task 9
removes the literal.

The test adds 21 "counts" fixtures and 12 "counts 0" fixtures of its own: a literal in a keyframe, a hex
inside a CSS string, a class name that is also a colour name, an apostrophe in JSX text before a `style=`, a
comment inside a JSX tag, and so on.

### The scanner checked against two outside sources

Neither check is committed. Both ran from a scratch folder outside the repository.

* **Against the TypeScript parser.** The hand-rolled lexer was compared with `typescript` 5.9.3's own parse
  of every `.ts` and `.tsx` file under `web/src`, `web/test`, `web/e2e`, `desktop/src`, `desktop/test`,
  `mcp-server`, `sync` and `apply`: 548 files at task 2. Every string literal and template literal matched in
  position and text (34,598 literals, 0 files differ), and so did every JSX `style=` attribute (25).
* **Against the freeze audit (103a §6).** With nothing let through, the scanner gives the audit's own
  numbers: 444 px declarations holding 506 literals in 35 of 46 non-token modules; 198 declarations holding
  only 1px or 2px; 55 font-size declarations; 27 signed 1px or 2px literals; 6 `rem` literals in 3 modules;
  27 `color-mix()` in 9 modules plus `tokens.module.css`; 25 `style=` sites in 13 TSX files, 11 of them with
  custom properties only; 17 `@media` width queries over eight values and one `@container` at 600px; 1,659
  `var()` references outside comments (1,652 in CSS, 37 of those in `globals.css`, and 7 in TSX), 0 unresolved.

### Baselines as written at task 1

1px and 2px count 0 at this step, held as a constant in the test until task 2 put the rule in the allowlist.
A3 and A5 were not applied yet. These are the numbers the task row's estimates describe (foundation about
35, screens-a about 116, screens-b about 82), and the real numbers are the same.

| Cluster | Files in the cluster | Files with a count | Sum | colour | color-mix | size | style key |
|---|---|---|---|---|---|---|---|
| foundation | 90 | 4 | 35 | 1 | 5 | 22 | 7 |
| shell | 31 | 12 | 123 | 1 | 4 | 114 | 4 |
| screens-a | 46 | 17 | 116 | 0 | 15 | 95 | 6 |
| screens-b | 66 | 11 | 82 | 0 | 3 | 78 | 1 |
| all four | 233 | 44 | 356 | 2 | 27 | 309 | 18 |

## Task 2: the frozen allowlist (P-16)

### RED, then GREEN

| Step | Command | Exit | Result |
|---|---|---|---|
| RED 1: the allowlist written, the scanner's new parts still stubs | `npx vitest run test/token-audit.test.ts` | 1 | 8 failed, 78 passed (86) |
| RED 2: the scanner applies A3, A4 and A5, baselines still task 1's | same | 1 | 2 failed, 84 passed (86) |
| GREEN: `screens-a.json` and `screens-b.json` lowered | same | 0 | 86 passed (86) |

RED 1's eight failures: the three A1 cases, two A3 cases (a named declaration still counted; every entry
stale), two A4 cases and one A5 case. The constant-backed and source-backed cases already passed, because they
read the tree and not the scanner. RED 2's two failures are the ratchet's lower bound at work. Six files
were below their baseline by exactly what A3 and A5 let through:

| File | Task 1 | Task 2 | Let through |
|---|---|---|---|
| `PlannerWeek.module.css` | 41 | 35 | `--planner-slot` (1), `.block` line-height (1), `.block` padding (2), `.chip` padding (2) |
| `StatusSelect.module.css` | 3 | 1 | `.statusSelect` padding (2) |
| `UpcomingTracker.module.css` | 20 | 19 | `.barArea` height (1) |
| `PlannerWeek.tsx` | 1 | 0 | the `height` key (A5) |
| `CourseTimeline.module.css` | 55 | 46 | `.laneHead` (3), `.weekRow` (3), `.asgRow` (3) |
| `CourseClasswork.tsx` | 1 | 0 | the `marginLeft` key (A5) |

### The allowlist's entries, by category

| Category | Entries | What |
|---|---|---|
| A1 | 8 values and 1 container entry | `@media` widths 480px, 620px, 640px, 720px, 760px, 820px, 900px, 1023.98px; `@container` 600px in `web/src/components/course/CourseTimeline.module.css` |
| A2 | 2 | `1px`, `2px`, sign ignored, in any property |
| A3 | 9 declarations: 3 constant-backed, 6 source-backed | below |
| A4 | 1 rule, 0 stored values | in `web/src/lib/theme-preference.ts`, a hex equal to `--color-bg` of `:root` or `:root[data-theme='light']` in `globals.css` counts 0 |
| A5 | 2 keys | `PlannerWeek.tsx` `height`; `CourseClasswork.tsx` `marginLeft` |

A3, one entry each as (file, selector, property, value, reason), with its backing:

| File | Selector | Declaration | Backing |
|---|---|---|---|
| `PlannerWeek.module.css` | `.board` | `--planner-slot: 24px` | constant `PLANNER_BASE_SLOT_PX` (24) |
| `PlannerWeek.module.css` | `.block` | `line-height: 14px` | constant `PLANNER_BLOCK_LINE_PX` (14) |
| `PlannerWeek.module.css` | `.block` | `padding: 3px 5px` | constant `PLANNER_BLOCK_PADDING_PX` (6 = 2 × 3) |
| `PlannerWeek.module.css` | `.chip` | `padding: 3px 5px` | source: `.block`'s padding in the same file (line 312 at the freeze) |
| `StatusSelect.module.css` | `.statusSelect` | `padding: 3px 6px` | source: `planner-rows.ts` line 75, the private `STATUS_SELECT_PX` |
| `UpcomingTracker.module.css` | `.barArea` | `height: 120px` | source: `UpcomingTracker.tsx` line 118, the private `BAR_AREA_PX` |
| `CourseTimeline.module.css` | `.laneHead` | `grid-template-columns: 72px minmax(240px, 1fr) minmax(240px, 1fr)` | source: `course-timeline-css.test.ts` line 41 |
| `CourseTimeline.module.css` | `.weekRow` | the same value | source: the same line |
| `CourseTimeline.module.css` | `.asgRow` | `grid-template-columns: 32px minmax(0, 1fr) minmax(7.5rem, 9rem)` | source: `course-timeline-css.test.ts` line 66 |

The cases the task row names pass under these exact titles: "breakpoint set equals {480, 620, 640,
720, 760, 820, 900, 1023.98}", "the one @container entry is 600px in CourseTimeline.module.css", "every A3
entry matches a live declaration", "a constant-backed entry equals its imported constant", "a source-backed
entry's regex matches its named line" (0 stale) and "A5 holds exactly two keys". A4's case passes while
`theme-preference.ts` and the light block do not exist: today the rule resolves to one value, the dark
`--color-bg`, and it reads the second when the block arrives.

### Baselines as they stand after task 2

| Cluster | Files in the cluster | Files with a count | Sum | colour | color-mix | size | style key | Largest files |
|---|---|---|---|---|---|---|---|---|
| foundation | 90 | 4 | 35 | 1 | 5 | 22 | 7 | `tokens.module.css` 21, `not-found.tsx` 7, `Login.module.css` 6, `layout.tsx` 1 |
| shell | 31 | 12 | 123 | 1 | 4 | 114 | 4 | `TopNav.module.css` 42, `SearchPanel.module.css` 17, `Popout.module.css` 15 |
| screens-a | 46 | 16 | 106 | 0 | 15 | 86 | 5 | `PlannerWeek.module.css` 35, `UpcomingTracker.module.css` 19, `Today.module.css` 16 |
| screens-b | 66 | 10 | 72 | 0 | 3 | 69 | 0 | `CourseTimeline.module.css` 46, `Materials.module.css` 8, `CourseClasswork.module.css` 6 |
| all four | 233 | 42 | 336 | 2 | 27 | 291 | 16 | |

The brief's "Baseline sum" command with `F=/\.json$/` prints 336. Unresolved references: 0 of 1,659. A JSON
lists only files that count above 0, by path from the repository root; a file that is not listed has a
baseline of 0. `Workspace.module.css` is at 2, as the brief's Seams say.

### The ratchet proved to fail, five ways

Each probe changed one of W-67's own files, ran the test, and put the file back. The three files' sha256
sums were compared before and after, and matched. The allowlist probe ran before the task-2 commit.

| Probe | Change | Exit | What failed |
|---|---|---|---|
| Above | `layout.tsx` taken out of `foundation.json` | 1 | "counts 1, above its baseline of 0", with the line and the literal |
| Below | `layout.tsx` set to 2; a baseline of 3 for a file that does not exist | 1 | "counts 1, below its baseline of 2"; "has a baseline of 3 and no longer exists" |
| No cluster | the `web/src/proxy.ts` line taken out of the cluster map | 1 | "web/src/proxy.ts: none" |
| Unresolved | the live pass told the token file is elsewhere | 1 | 1,591 unresolved references listed |
| Stale entry | `.barArea`'s value written as `121px` in the allowlist | 1 | the entry reported stale, and `UpcomingTracker.module.css` at 20 above its 19 |

## The checker round: CR-1 and CR-2

An independent checker reviewed tasks 1 and 2 and sent two findings. Both were verified and both are right.
Both fixes are in files that are not frozen. **The allowlist file was not changed**, so the task-2 sha stands.
No baseline was changed: the four sums are still 35, 123, 106 and 72.

| Finding | Verdict | Where the fix is | Commits |
|---|---|---|---|
| CR-1: a width wrapped in `calc()` is not read, so a breakpoint outside the set passes | right, applied | `widthLengths` in `web/test/token-audit.scan.ts` | `172a0ee`, `efac39b` |
| CR-2: A5 lets every key of that name through in its file, and the entry check asks only for one or more | right, applied | the A5 entry check in `web/test/token-audit.test.ts` | `a1afeae` |

### RED, then GREEN

| Step | Command | Exit | Result |
|---|---|---|---|
| RED: one new fixture case per finding, against the task-2 code | `npx vitest run test/token-audit.test.ts` | 1 | 2 failed, 86 passed (88) |
| GREEN: both fixes | same | 0 | 88 passed (88) |
| RED: the arithmetic case of CR-1 | same | 1 | 1 failed, 88 passed (89) |
| GREEN: a width condition that holds a function fails whole | same | 0 | 89 passed (89) |

### CR-1: what was wrong, and what A1 does now

`widthLengths` read only a pair of parentheses with no pair inside it. In `(max-width: calc(700px))` that
pair is `(700px)`, which names no width, so the prelude gave no length and was not checked at all. The same
held for `@container`. The brief says of A1: "any other value fails".

Now a pair of parentheses is a width condition when its own text names a width, at any depth. A plain one
gives its numbers, as before. One that holds a function or a group of its own comes back whole, as written.
That text equals no allowed value, so the case fails. A height beside a width in a grouped condition, such as
`((max-height: 500px) or (min-width: 600px))`, is still not read.

The fix is not the one-level regex the checker proposed. Two reasons, both checked:

* **Depth.** A direct call with that regex gives `[]` for `(max-width: calc((700px)))` and for
  `(min-width: calc(100vw - (2 * 10px)))`. It is the same hole one level down. It also reads the height in
  `((max-height: 500px) or (min-width: 600px))` as a width.
* **Arithmetic.** Reading the numbers inside `calc()` is not enough. `(max-width: calc(720px + 720px))` is
  1440px. Read as numbers it is 720px twice, both in the frozen set, so it passed. `(max-width: var(--x))`
  gave no number and was not counted as a width query. `172a0ee` had this hole and `efac39b` closed it.

**Default taken**, the most conservative reading: a breakpoint is one of the eight literals, written plain.
A function in a width condition fails whatever its value, so `calc(720px)` fails too. No width query on the
tree uses a function today: the 17 `@media` queries and the one `@container` are all plain.

### CR-2: what was wrong, and what A5 does now

The scanner lets an A5 key's name through anywhere in its file. The entry check asked that the file sets the
key at least once. So a second inline `height` in `PlannerWeek.tsx`, or more `marginLeft` keys in
`CourseClasswork.tsx`, counted 0 and nothing failed.

The check now asks for exactly one key of that name in the file, read with nothing let through. That is A3's
exactly-one rule, for A5. Each file holds exactly one such key today (line 123 in both). The scanner did not
change: the name still counts 0 in its file, and the A5 case is what fails when a second key appears. That
case's title gained the word "once". The title the task row names, "A5 holds exactly two keys", is unchanged.

### The probes, before and after

The probes ran in a scratch copy of `web/src` and `web/test` outside the repository, with the worktree's
vitest. No file under `web/src` in the worktree was touched. Each probe appended one line to one file of the
copy, ran `npx vitest run test/token-audit.test.ts` by itself, and put the file back. "Before" is the audit
as it stood at `2fd1d44`. "After" is `efac39b`.

| Probe | File of the copy | Exit before | Exit after | The case that fails after |
|---|---|---|---|---|
| `@media (max-width: calc(700px))` | `TopNav.module.css` | 0 | 1 | "breakpoint set equals {480, 620, 640, 720, 760, 820, 900, 1023.98}" |
| `@media (max-width: calc(100vw - (2 * 10px)))` | same | 0 | 1 | the same |
| `@media (max-width: calc((700px)))` | same | 0 | 1 | the same |
| `@media (max-width: calc(720px))` | same | 0 | 1 | the same |
| `@media (max-width: calc(720px + 720px))` | same | 0 | 1 | the same |
| `@media (max-width: var(--color-text))` | same | 0 | 1 | the same |
| `@media (max-width: 700px)`, plain | same | 1 | 1 | the same |
| `@media (max-width: 720px)`, plain, the control | same | 0 | 0 | none |
| `@container (min-width: calc(650px))` | `CourseTimeline.module.css` | 0 | 1 | "the one @container entry is 600px in CourseTimeline.module.css" |
| `@container (min-width: calc(600px))` | same | 0 | 1 | the same |
| a second element with `style={{ height: 13 }}` | `PlannerWeek.tsx` | 0 | 1 | A5, "each is a key its file sets today, once, read back by exactly one line of its test" |
| two more `style={{ marginLeft: … }}` | `CourseClasswork.tsx` | 0 | 1 | the same A5 case |

Every "after" failure is one case of 89, and the other 88 pass. The copy's control run, with nothing
appended, gave 89 passed.

## Pinned or mirrored declarations found beyond the nine the brief names

**None was added as an A3 entry.** The search read every test and spec that names a stylesheet (twelve files
under `web/test` and `web/e2e`), every test that asserts on an inline style, every numeric constant in
`web/src`, and every stylesheet comment that names a TypeScript file. What it found, and why none is an entry:

| Declaration | Pinned or mirrored by | Counts today | Why no entry |
|---|---|---|---|
| `PlannerWeek.module.css` `.nested` `gap: 2px` and `margin-top: 2px` | `PLANNER_NESTED_GAP_PX` (2), `planner-rows.ts:86` | 0 | A2 already holds 2px |
| `PlannerWeek.module.css` `.nestedChip` `padding: 1px 4px` | the 1px, by `PLANNER_NESTED_CHIP_PX` (`planner-rows.ts:83`) and `CHIP_PADDING_PX` (`nested-fit.ts:44`) | 1 (the 4px) | the mirrored 1px is held by A2; nothing mirrors the 4px |
| `PlannerWeek.module.css` `.nestedChip` `gap: 1px 4px` | the 1px row gap, by the same two constants and `CHIP_ROW_GAP_PX` (`nested-fit.ts:45`) | 1 (the 4px) | the same |
| `StatusSelect.module.css` `.statusSelect` `border: 1px solid var(--color-divider)` | the 1px, by `STATUS_SELECT_PX` | 0 | A2 already holds 1px |
| `PlannerWeek.module.css` `.itemBlock` `min-height: calc(var(--planner-slot) * 2)` | `PLANNER_DUE_CARD_MIN_PX` (2 × the base slot) | 0 | it holds no literal |
| `PlannerWeek.module.css` `.bandToggleLabel` `width: 1px` | `planner-css.test.ts:86` | 0 | A2 already holds 1px |
| `MessageList.module.css` `max-height: 62dvh` | a comment in `web/e2e/walk21.first.ts:35` | 0 | `dvh` is not a unit the audit counts |

The rule taken: an A3 entry exists where a test pins, or a constant mirrors, a literal the audit would
otherwise count. This is how the freeze audit read the same lines (103a C-07 names "the status select's 3px"
and not its 1px border). The one place it decides a count is `.nestedChip`: its two 4px literals stay in
`screens-a.json` for W-69's sweep. A token of the same value keeps the 1px parts and the arithmetic as they
are. The other reading, an entry for every declaration a constant touches, would have frozen both
declarations whole and let the two 4px through. If the PM wants that reading, it has to be said before
`ce2519f` is merged, because the file cannot change after.

Three more things, for the sweep workers, that are not pins:

* The 72px label track also stands in declarations no test reads: `.laneHeadSingle` and
  `.weekRowSingle, .undated` (`72px minmax(0, 1fr)`), and 60px twice inside the container block. W-70 sweeps
  those. `.laneHead` and `.weekRow` keep the literal, so the two must be given the same value.
* `nested-fit.ts` estimates characters per line from a 95 px column less `.block`'s 5px and `.nestedChip`'s
  4px. They are estimates that err tall, not mirrors. A token of the same value changes nothing.
* The only non-custom-property style keys any test asserts on are the two of A5. Every other inline-style
  assertion in `web/test` reads a custom property.

## Departures from the brief, and the defaults taken

Nothing in tasks 1 and 2 was left unbuilt. Two things could not be built as written:

1. **A source-backed entry is found by its regex, not by its line number.** The brief says the test "reads
   that line and matches it". Two of the named files will be edited (`PlannerWeek.module.css` at tasks 15 and
   18, `UpcomingTracker.tsx` at task 18). A line that moves by one would make a frozen entry stale, and the
   file may not be edited to fix it. So each entry keeps the line number as it stood at the freeze, for the
   reader, and the test requires the entry's regex to match exactly one place in the named file.
2. **`.chip`'s regex is longer than the brief's.** `padding:\s*3px 5px;` matches two lines of that
   stylesheet, `.block`'s (312) and `.chip`'s own (549). The entry's regex is
   `^\.block \{[^}]*?padding:\s*3px 5px;`, which is `.block`'s declaration and nothing else.

Defaults taken where the brief leaves room:

* **Task 1 already let 1px and 2px through**, as a constant in the test, so its baselines are the audit's
  estimates. Task 2 moved the rule into the allowlist and changed no count by it.
* **The lane floors' backing names test line 41**, the `it.each` case, inside the brief's range 36 to 45.
* **A3 names declarations of top-level rules only.** The same declaration inside an at-rule is not the
  entry's and still counts. Each entry must match exactly one live declaration.
* **A5 entries carry a source backing too**: the test line that reads the key back. The test also checks
  that its file sets the key exactly once (CR-2; before the checker round it asked for at least once).
* **A1 reads width conditions**: `min-width`, `max-width`, `width`, `inline-size` and the range syntax, at
  any depth of a grouped condition. A height condition is not governed. A width condition that holds a
  function or a group of its own, such as `calc()`, `min()` or `var()`, fails whatever its value (CR-1;
  before the checker round it was not read). The container case asks that every live `@container` width is
  the named entry and that at least one exists.
* **A TypeScript string that is a colour includes the named colours**, so `fill="white"` counts. `main` has
  no such string. A JSX attribute string is a string literal. A template literal counts when it is a colour
  function, such as `` `rgba(0, 0, 0, ${a})` ``.
* **The colour functions are exactly the brief's list.** `color()` and the system colours are not on it and
  are not counted.
* **A word is not read as a colour in a property whose values are names**: `composes`, `animation`,
  `animation-name`, `font`, `font-family`, `grid-area`, `container`, `container-name`.
* **`0px` is a size literal.** The count agrees with the audit's 506.
* **An unresolved reference is judged by name.** A reference with a fallback still needs a declaration. A
  "TSX style key" is a custom-property key of a `style=` object, inline or through a `const`, in any file.
* **The cluster test fails for any scanned file with no cluster**, the brief's wording. That covers the
  narrower "a file with a non-zero count".
* **Baselines are lowered by hand.** There is no update switch. The failure prints the number to write.
* **File size.** The brief fixes three modules, so the scanner holds both readers: 797 lines after the
  checker round (778 at task 2), under the 800-line limit with three lines to spare. The next change that
  adds to the scanner has to split it. The test is 714 lines (673 at task 2) and the allowlist 293.

## For the workers who come after

* A count above its baseline prints the file, every finding's line and literal, and "Use a token".
* A count below its baseline prints the number to set. Set it in the same commit. A file that reaches 0 may
  be set to 0 or taken out of the JSON.
* A new file needs no baseline while it counts 0. It does need a cluster: a path under no prefix fails.
* `web/test/token-audit.allowlist.ts` is frozen. A literal it does not let through is removed or becomes a
  token.
* A breakpoint is written plain: `@media (max-width: 720px)`. A `calc()`, a `min()` or a `var()` in a width
  condition fails, even around an allowed value.
* An A5 key is one key. A second inline `height` in `PlannerWeek.tsx`, or a second `marginLeft` in
  `CourseClasswork.tsx`, fails the A5 case although the scanner counts it 0.

## Task 3: the block-aware reader (P-17)

Written 2026-10-08. The branch was merged with `origin/feat/styling-22` first (a merge, no rebase), so the
brief read here is the current one. Three files, all W-67's: `web/test/css-tokens.ts` (new, 463 lines),
`web/test/theme-tokens.test.ts` (new, 474 lines) and `web/test/type-tokens.contrast.test.ts` (moved onto the
reader). Nothing under `web/src`, `project-state/`, the brief, `globals.css`, any lock file or `package.json`
was touched. The allowlist is unchanged: `git diff --quiet ce2519f HEAD -- web/test/token-audit.allowlist.ts`
exits 0. No dependency was added. Commit: `d84ce26` feat(22-T3).

### RED, then GREEN

| Step | Command | Exit | Result |
|---|---|---|---|
| RED 1: tests written, `css-tokens.ts` a stub whose functions throw | `npx vitest run test/type-tokens.contrast.test.ts test/theme-tokens.test.ts` | 1 | 2 files failed at collection, no test ran (the stub threw on import-time reads) |
| RED 2: stub returns empty maps, the rest still throws | same | 1 | 58 failed, 3 passed (61); the 3 are the selector-name case and two "reads nothing" cases that an empty map satisfies |
| GREEN: the reader written | same | 0 | 2 files, 62 passed (62): 36 in `theme-tokens.test.ts`, 26 in `type-tokens.contrast.test.ts` |

One case was loosened after GREEN's first run: the "unrounded composite" case bounded the float-versus-rounded
gap at 0.01, and the real gap is 0.023. The bound is now 0.05. The case still asserts the two numbers are not
equal, which is what proves nothing is rounded on the way.

### The gates

Each command ran by itself from `web/`, output to a file, exit code from the shell.

| Command | Exit | Result |
|---|---|---|
| `npx vitest run test/type-tokens.contrast.test.ts test/theme-tokens.test.ts` | 0 | 2 files, 62 passed (62), 0 failed |
| `npm test` | 0 | 159 files, 3094 passed (3094), 0 failed |
| `npm run typecheck` | 0 | `tsc --noEmit`, no error |
| `npx eslint . --max-warnings 0` | 0 | no output |

### What the task row asked for, and where it is proven

| Row | Case in `theme-tokens.test.ts` |
|---|---|
| appending `:root[data-theme='light'] { --color-surface: #ffffff; }` leaves the dark `--color-surface` at `#232532` | "a light block does not move the dark ground ..." |
| `color-mix(in srgb, #e9e9ed 16%, transparent)` over `#232532` prints `#434450` | "prints today's --color-divider on the card as #434450" |
| the reader composites in floating point and rounds only when it prints a hex | "contrast comes from the unrounded composite ..." (float 3.94-pair ratio differs from the ratio of two printed hexes by 0.023) |
| `--color-neutral-600` on `--color-surface` = 3.52 | "--color-neutral-600 on --color-surface is 3.52" |
| `--color-danger` on `--color-danger-bg` over `--color-surface` = 3.94 | "--color-danger on --color-danger-bg over --color-surface is 3.94" |
| the fixture is a verbatim copy of `:root`, inline, never re-read from the live file | `DARK_ROOT` in the test. Checked at write time: the evaluated template literal equals `git show a5042fa:web/src/app/globals.css` lines 20-165 character for character. The four backticks in its comments are escaped in the source. |

Further cases: the light map is the dark map overlaid, and a name only the light block declares reaches the
light map only; a `var()` in the light block resolves against the light map (`--color-muted` over a white card
with `--color-text: #111111` prints `#7c7c7c` in light and `#909199` in dark); the selector may be quoted either
way, and a space before the bracket is a descendant selector and not the light block; comments, an `@import`
with a semicolon in its URL, a `:root` inside an at-rule, and other selectors do not leak into either map;
nested `color-mix`, a non-srgb space, a percentage outside 0 to 100, a translucent colour with no ground,
circular and undeclared `var()` chains each fail with a named error.

### Defaults taken

1. **No light block exists yet, so "the light ground is the light block's `--color-surface`" has nothing to
   read.** Following the brief's wording, the light map is the dark map overlaid by nothing, so the light map
   equals the dark map. `type-tokens.contrast.test.ts` runs its assertions in both blocks, and until task 8 the
   light run measures today's dark card again. The `'#ffffff'` stand-in is gone, as the row says. The honest
   cost: between this commit and task 8 nothing measures the type tokens against a white card. Task 8 replaces
   four of the six assertions and brings the real light block, so I did not keep a white check beside the reader.
   `ThemeMaps.hasLightBlock` is false today and the test header says so.
2. **The six assertions became thirteen cases per block.** The old "segment visible on a dark card" and "on a
   light card" are one case per block now ("the segment is visible on the card", 5 categories), because each
   block's own card is the ground. The other four are as before. 26 cases in the file against 18 before.
3. **The reader reads top-level rules only.** A `:root` inside `@media` or `@supports` is skipped, so a theme
   block inside an at-rule is not seen. If task 8 wants `@media (prefers-color-scheme)` blocks this needs to
   change; the brief names only the two selectors.
4. **A `color-mix` argument that reaches another `color-mix` (written out, or through a `var()`) throws.** The
   brief says one level. Live `globals.css` has none: `--planner-ooo-bg` is a `var()` to a `color-mix`, which is
   a chain, not a nesting, and resolves.
5. **`toHex` and `contrastRatio` refuse a translucent colour**, and `resolveColour` refuses one with no ground.
   `pairContrast(map, fg, bg, over)` lays a translucent `bg` over `over`, and a translucent `fg` over the
   composited `bg`.
6. **Colour moved out of the test.** `contrastRatio`, `deltaE` and the Lab maths moved from
   `type-tokens.contrast.test.ts` into `css-tokens.ts` and now take parsed colours, not hex strings. Nothing else
   imported them (searched `web/src`, `web/test`, `web/e2e` and `desktop`).
7. **`css-tokens.ts` is under `web/test/`, so the token audit (which scans `web/src`) does not see it.**
