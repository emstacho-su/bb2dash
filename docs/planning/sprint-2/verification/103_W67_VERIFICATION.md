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

## ui-ux-pro-max

Required by the brief's working rules (amendment 3, H-1). One row per task that changes what is drawn.

| Task | Skill loaded | Files read first | Searches run | Advice set aside, and the rule that won |
|---|---|---|---|---|
| 8 | yes (Skill tool, `ui-ux-pro-max`, at the start of the task) | `design-system/bb2dash/MASTER.md` (all of it); `docs/planning/sprint-2/evidence/103_style_tiles/direction-d.json` for every value | none. The design system was generated and hand-edited to direction D, the brief names every rule task 8 writes and `direction-d.json` holds every value, so a query would only have returned advice the brief already overrides. No `--persist` was passed and no script ran | the skill's `touch-target-size` (44 px) loses to `--size-target`, 24 px, the brief's WCAG 2.2 AA target for desktop web (task 36); `readable-font-size` (16 px body) loses to the seven pinned `--text-*` sizes (the 18 layout tokens do not move); `spring-physics` loses to the `--ease-out` / `--ease-in` curves the brief declares; `toast-dismiss` (3 to 5 s) loses to the app's `TOAST_MS`; the icon-package advice loses to "no new dependency" |
| 10 | yes (the skill stays loaded for the session; named again at the start of the task) | `design-system/bb2dash/MASTER.md` (read at task 8, read again for the menu rules); the tile's account-menu fragment in `tile-d.html` (`ddGroup`, `.ddRow[role="menuitemradio"]`) | none | `nav-hierarchy` and `destructive-nav-separation` (keep the theme rows apart from Sign out) are met by the group; the skill's `state-clarity` is met by a tick shape, not colour alone (`color-not-only`) |
| 16 | yes | `design-system/bb2dash/MASTER.md` (Buttons, Cards, Fields, Focus, Chrome), the tile's shared-primitives block, `component-changes.json` entries for W-67's files | none; the tile and MASTER carry every value the sweep writes | the skill's `disabled-states` 0.38 to 0.5 loses to the one strength 0.5 (entry `disabled-one-look`); `touch-target-size` 44 px loses to the 24 px `--size-target` (task 36); the generated `transition: all 200ms` and a hover lift lose to `--motion-control` and no lift (MASTER anti-patterns); `input outline: none` with a glow loses to the one 2 px ring |
| 33 | yes | `design-system/bb2dash/MASTER.md` (Colour: the ink and the ground), `component-changes.json` entry `app-mark` | none | the skill's icon advice (Phosphor, outline or filled families) does not apply to a launcher icon; the square is two greys from the tokens, no gradient, glow or second hue |
| 37 | yes | MASTER.md "Busy is not off" and the entries `busy-says-busy` and `disabled-one-look` | none | the skill's `loading-buttons` (disable and show a spinner) is met by the button's own label ("Signing in…"); a spinner would be a new loop, which MASTER's anti-patterns forbid |

## Task 8: the token set for direction D (P-78, R-53)

Written 2026-10-08. The branch was merged with `origin/feat/styling-22` first; the six start checks passed (the
DECISIONS row `:1`, the JSON, `tileOnly` in the JSON, `MASTER.md`, the three "Tokens my sweep needs" sections each `:1`).

### What the commit holds

* `web/src/app/globals.css`, rewritten from `main`'s: `:root` (dark, `color-scheme: dark`) and
  `:root[data-theme='light']` (`color-scheme: light`) written from `direction-d.json`'s two maps, value for value; the
  fonts `@import` is D's `fontsHref`; the three exit names from `tileOnly.dark`; `--size-target: 24px`; the scrollbar
  block in `@media (hover: hover) and (pointer: fine)`; the one checkbox rule on `:where(input[type='checkbox'])`; the
  one reduced-motion block; the `data-theme-switching` rule; `scroll-padding-top` on `html`; `text-wrap: balance` on
  the headings; the thin-underline link rules and `transition: var(--motion-control)` on `a`; the one focus ring on the
  new tokens; the `arrives` keyframe.
* `web/src/styles/tokens.module.css`: `.errorNotice` and `.tip`, tokens only. The foundation baseline did not move.
* `web/src/lib/queries.grades.ts`: `attemptText` (a `Map`, so a code such as `constructor` reads as itself), left off
  the object when `attemptStatus` is null. `web/test/queries.grades.attempt-text.test.ts`, 8 cases. The two old files
  (`queries.grades.test.ts`, `status-vocabulary.test.ts`) are unedited.
* `web/test/theme-contrast.test.ts` (new): the 38 frozen pairs in both blocks, 32 of text and 6 of non-text.
* `web/test/type-tokens.contrast.test.ts`: keeps its first two assertions, drops the four, holds the urgency rule in
  both blocks against the card and the picked-day fill. Header and the comment over the `--type-*` tokens rewritten.
* `web/test/theme-tokens.test.ts`: a live-file describe block (the JSON's two maps, the exit names, the light block's
  colour and shadow names, `color-scheme`, the 18 layout tokens against the verbatim `main` copy, no system block, every
  colour resolves).

### RED, then GREEN

| Step | Command | Exit | Result |
|---|---|---|---|
| RED: `attemptText` test against `main`'s `queries.grades.ts` | `npx vitest run test/queries.grades.attempt-text.test.ts` | 1 | 5 failed, 3 passed (8) |
| RED: the three theme tests against `main`'s `globals.css` | `npx vitest run test/theme-tokens.test.ts test/theme-contrast.test.ts test/type-tokens.contrast.test.ts` | 1 | 35 failed, 127 passed (162) |
| GREEN: the row's vitest line | `npx vitest run test/theme-tokens.test.ts test/theme-contrast.test.ts test/type-tokens.contrast.test.ts test/Workspace.layout.test.tsx` | 0 | 4 files, 166 passed (166) |
| GREEN: the attempt-text line | `npx vitest run test/queries.grades.attempt-text.test.ts test/queries.grades.test.ts test/status-vocabulary.test.ts` | 0 | 3 files, 68 passed (68) |
| `npm test` | | 0 | 164 files, 3238 passed (3238) |
| `npm run typecheck` | | 0 | no error |
| `npx eslint . --max-warnings 0` | | 0 | no output |

### The named commands, as printed

| Command | Printed |
|---|---|
| Direction check | `125 0 77 0 true` |
| Exit tokens | `3 0` |
| New names | `34 0 17` (the third reaches 0 at task 20) |
| Token names | `68 38 0`, `69 53 0`, `70 31 2` (the 2 are `--text-9` and `--text-10`, which the PM's ruling 2 does not declare; see below) |
| Red files over `web/src` | prints nothing |
| `grep -c "MIN_DELTA_E = 30" web/test/type-tokens.contrast.test.ts` | 0 |
| `grep -c` in `globals.css` of `prefers-reduced-motion: reduce`; `data-theme-switching`; `(hover: hover) and (pointer: fine)`; `:where(input\[type=`; `text-wrap: balance`; `scroll-padding-top: var(--nav-height)`; `text-decoration-thickness: var(--size-underline)` | 1 each |
| `grep -c "family=Inter" web/src/app/globals.css` | 0 |
| `grep -c "^\.tip"`; `grep -c "^\.errorNotice"` in `tokens.module.css` | 3; 2 |

### Token names as declared

The sweep workers read this section. One name per value for the numeric names; a name with a purpose in it stands
beside the numeric name of its value. Every other name a table asked for is declared as asked.

| Asked name | Declared name | Value | Asked by |
|---|---|---|---|
| `--text-10` | `--text-2xs` (no `--text-10`) | 10px | W-70 (W-69 asked `--text-2xs`) |
| `--text-9` | `--text-3xs` (no `--text-9`) | 9px | W-70 (W-69 asked `--text-3xs`) |
| `--color-mix-text-45-transparent` | declared as `var(--color-text-45)`, so one mix and two names | text 45% over transparent | W-69 (W-68 asked `--color-text-45`) |
| `--size-3` to `--size-150` and the rest of the plain numeric names | each once, as asked | N px | W-68, W-69, W-70 (the three tables agree) |
| `--font-weight-semibold` | once | 600 | W-69, W-70 |
| `--font-weight-regular`, `--font-weight-medium` | as asked | 400, 500 | W-70 |
| `--size-panel-gutter`, `--size-toast-top`, `--size-nav-search-min`, `--size-sync-label-max`, `--size-nav-search-narrow`, `--size-nav-search-width`, `--size-toast-width`, `--size-panel-max`, `--size-search-popover-max` | as asked, each its own literal, beside the numeric name of its value where one exists (28, 38, 72, 180, 240, 320) | 28, 38, 72, 72, 180, 240, 320, 360, 560 px | W-68 |
| `--size-planner-gutter`, `--size-planner-gutter-narrow`, `--size-planner-day-min` | as asked | 62, 48, 101 px | W-69 |
| `--size-assignment-max` (beside `--size-760`), `--size-conversations-min/-max`, `--size-report-card-min/-max` | as asked | 760px, 14rem, 18rem, 11rem, 16rem | W-70 |
| the 12 `--color-mix-*`, `--color-accent-tint-6/7/12`, `--color-scrim`, `--color-scrim-popout`, `--color-text-45/-30/-78` | as asked; the same expression in the dark and the light block, so each resolves against its own block's values | today's mixes | W-69, W-70, W-68 |
| `--radius-3` | as asked (3px, the value `--radius-sm` also holds) | 3px | W-69 |

Names W-67's own files need, declared at the same step: `--text-12` (also W-70's), `--text-14`, `--text-19`,
`--size-380`, `--font-weight-bold` (700, for `.glyph`; entry `weights-as-tokens` default). `--size-3`, `-5`, `-6`, `-10`,
`-18` and `-36` are the tables' own.

No table name was outside the eight families, and none repeated one of D's 34 under another name, so ruling 3 mapped
nothing beyond the two `--text-*` names above.

### Defaults taken

1. **Light block, `--color-mix-*` and the other new colours:** the same expression as the dark block (ruling 4); it
   reads the light block's own `--color-text`, `--color-bg`, `--color-surface` and `--color-accent`. `--color-scrim` is
   `rgba(0, 0, 0, 0.5)` in both.
2. **`.tip` markup contract.** The brief does not name the attribute. The class draws `attr(data-tip)`, under the
   button, after twice `--motion-delay` of hover and at once on keyboard focus, only when `data-tip` is present. W-68
   puts `data-tip="<name>"` and the class `tip` on the five icon buttons (task 32). It is centred under the button;
   the rightmost button may need a side offset in W-68's own module.
3. **The checkbox rule is one line in `:where(input[type='checkbox'])`; the tick and checked state are
   `:where([type='checkbox'])...`**, so the brief's `grep -c ":where(input\[type="` is 1 and the specificity is still 0.
4. **The theme-switch rule is on one line** for the same reason (the grep counts lines).
5. **The loading wait in the reduce block is on `[data-loading]`.** Home's loading line is `Today.module.css .muted`
   (W-69, task 18), a hashed module class a global rule cannot name, and `data-loading` is not ruled in (H-5). So the
   kept wait reaches Home's line only if W-69 puts `data-loading` on it or writes its own reduce rule with
   `!important`, because the block's `animation: none !important` otherwise removes the wait. The keyframe `arrives`
   is declared in `globals.css`; a CSS module that animates with it needs its own `@keyframes arrives` too (Next
   localises `animation` names). For W-69.
6. **`--color-surface-press`** is D's `color-mix(text 8%, surface)`; the reader's `color-mix` second argument may be a
   `var()` that ends in a plain colour, which this is.

## Task 9: theme-preference, the boot script, the root layout (P-76, P-78, R-53)

Files: `web/src/lib/theme-preference.ts` (new), `web/src/app/layout.tsx`, `web/test/theme-preference.test.ts` (new),
`web/test/raw-html.audit.test.ts` (the three parts the brief names: the header sentence, the allow-list constants, the
two cases that read them; the scanner, its fixtures and `OTHER_SINKS` are as they were),
`web/test/token-audit.baseline/foundation.json` (`layout.tsx` 1 to 0, in this commit).

| Step | Command | Exit | Result |
|---|---|---|---|
| RED: the new test with `theme-preference.ts` moved aside | `npx vitest run test/theme-preference.test.ts test/raw-html.audit.test.ts` | 1 | the new file failed to load (no module); `raw-html.audit` 6 passed |
| GREEN | same | 0 | 2 files, 43 passed (43) |
| the token audit after the root layout lost its literal | `npx vitest run test/token-audit.test.ts` | 1, then 0 | "layout.tsx counts 0, below its baseline of 1"; passes once the baseline is lowered |
| `npm test` | | 0 | 165 files, 3275 passed (3275) |
| `npm run typecheck` | | 0 | no error |
| `npx eslint . --max-warnings 0` | | 0 | no output |
| `grep -c "#161826" web/src/app/layout.tsx` | | | 0 |
| `grep -c "__html: THEME_BOOT_SCRIPT" web/src/app/layout.tsx` | | | 1 |
| `git grep -c "dangerouslySetInnerHTML=" -- web/src` | | | `web/src/app/(app)/layout.tsx:1`, `web/src/app/layout.tsx:1` |

What the test proves: the nine rows of `resolveTheme` (and the same nine through the real script in jsdom with a
stubbed `matchMedia`, each stamping the expected `data-theme` and writing and removing no storage); no `matchMedia`
stamps dark and does not throw; a stored `dark` or junk value is left where it is; a resolved light sets every
`theme-color` meta; a `change` event with `auto` stored re-stamps the attribute and the metas and sets
`data-theme-switching`, gone two frames later, and with nothing, `light`, `dark` or junk stored it changes neither;
the boot stamp never sets the switching mark; the listener is registered whatever is stored and reads storage again on
each change; `THEME_BG` equals the blocks' `--color-bg` read by the reader; `THEME_COLOR` equals `THEME_BG.dark`.

Defaults taken:

1. **`suppressHydrationWarning` on `<html>`.** The boot script stamps `data-theme` before React hydrates and React never
   renders it, so the attribute is the one thing the server HTML and the client may disagree on. The brief does not name
   it; it is the standard form for this and affects only that element's own attributes.
2. **`resolveTheme(stored, systemPrefersLight)`** takes `null` for "no `matchMedia`", so the nine rows are the function's
   own table and the script's behaviour is tested against the same rows.
3. **`stampTheme(theme, switching)`** and the storage helpers are exported for `ThemeMenu` (task 10). The script does the
   same work in its own text because it cannot import.
4. **The listener falls back to `addListener`** where `addEventListener` is missing on the query (an old engine); the
   test stubs only `addEventListener`.

## Task 10: ThemeMenu, the component (P-77, R-53)

Files: `web/src/components/shell/ThemeMenu.tsx`, `web/src/components/shell/ThemeMenu.module.css` (tokens only),
`web/test/ThemeMenu.test.tsx` (new). The mount in `TopNav.tsx` is W-68's (`grep -c "<ThemeMenu"` is theirs to bring to 1).
Skill: loaded for this task (the Skill tool, at the start of task 8, stays loaded in this session); `MASTER.md` and the
tile's account-menu fragment (`tile-d.html`, the `ddGroup` block and `.ddRow[role="menuitemradio"]`) were read first.
No search was run. The look is the tile's: a "Theme" small-capital head, three rows like the account menu's own rows,
the picked row marked by a tick in the ink (a shape, not a colour).

| Step | Command | Exit | Result |
|---|---|---|---|
| RED: the new test with `ThemeMenu.tsx` moved aside | `npx vitest run test/ThemeMenu.test.tsx test/TopNav.update.test.tsx` | 1 | the new file failed to load; `TopNav.update` 8 passed |
| GREEN | same | 0 | 2 files, 23 passed (23) |
| `npm test` | | 0 | 166 files, 3290 passed (3290) |
| `npm run typecheck` | | 0 | no error |
| `npx eslint . --max-warnings 0` | | 0 | no output |
| Time check over `web/src/components/shell/ThemeMenu.module.css` (the file read directly, as it was not yet tracked) | | 1 (no match) | prints nothing |

The test proves: exactly three `menuitemradio` rows named Dark, Light, Auto in DOM order, no `menuitem`; Dark checked
with no key, and under a stubbed light system; a stored `light` or `auto` checks its row; a stored `dark`, junk or
empty value shows Dark; Light writes `light`, stamps the attribute and every meta; Auto follows a stubbed light or dark
system and, with no `matchMedia`, stamps dark; Dark removes the key and stamps dark; a throwing storage still stamps
and the checked row follows the pick; a pick sets `data-theme-switching`, gone two animation frames later.

Defaults taken:

1. **The rows sit in a `role="group"` named "Theme"**, with a "Theme" head, as the tile draws it. The group is a child
   of the account menu's `role="menu"`, which ARIA allows for `menuitemradio`.
2. **Same-tab refresh of the checked row**: `useSyncExternalStore` is notified by a module-level listener set after the
   component's own write (the `storage` event only fires in other tabs). The picked value is also kept in state so a
   throwing storage still shows the pick.
3. **The mount is W-68's.** `ThemeMenu` takes no props; W-68 places `<ThemeMenu />` between the identity block and the
   Update row, as the tile does. Its rows are `menuitemradio`, so the Update row's `menuitem` list does not change.
4. **Keyboard**: the rows are buttons, so Tab reaches them; the arrow-key behaviour of the account menu is W-68's task 32
   (the theme rows "are in the order").

## Task 11: the desktop window background from the tokens (R-53, G-3)

Files: `desktop/src/main/window-background.ts` (new, no Electron import), `desktop/src/main/window.ts` (the one literal
`'#12131a'` becomes `windowBackground()` and one import), `desktop/test/unit/window-background.test.ts` (new). No old
desktop test is edited. `desktop/node_modules` did not exist in this worktree; `npm ci --ignore-scripts` ran in
`desktop/` (336 packages, no lock file change, Electron's binary download skipped because the unit suite mocks it).

| Step | Command | Exit | Result |
|---|---|---|---|
| RED: the new test with no module | `cd desktop && npx vitest run test/unit/window-background.test.ts test/unit/window.test.ts test/unit/deeplink.test.ts` | 1 | the new file failed to load; the other two 53 passed |
| GREEN | same | 0 | 3 files, 58 passed (58) |
| whole unit suite | `cd desktop && npx vitest run` | 0 | 43 files, 829 passed (829) |
| `npm run typecheck` | | 0 | no error |
| `grep -c "12131a" desktop/src/main/window.ts` | | | 0 |
| `git grep -c "nativeTheme" -- desktop/src` | | 1 (no match) | prints nothing |
| `git diff --quiet origin/main...HEAD -- desktop/test/unit/window.test.ts` | | 0 | unchanged |

The test pins `DARK` to `:root`'s `--color-bg` read from `../web/src/app/globals.css` (`#050505`), `windowBackground()`
to `DARK` with no argument, and `window.ts` to no longer holding the old ground.

**Can the change break the launch? No.** `window-background.ts` imports nothing, so it cannot fail at load; its one
export is a constant six-digit hex, which is what `BrowserWindow`'s `backgroundColor` takes; `window.ts` already built
the window with a hex there and only the value changed (`#12131a` to `#050505`). The one visible effect is that the
frame before the page paints is the new dark ground, and a person who chose Light sees that dark frame at each open
(accepted, DECISIONS 2026-10-08). `desktop/test/e2e/fixture-server.ts:36` still holds `#12131a` in a fixture page's
inline style; it is test scaffolding, not the shell, and is not edited. The Playwright suite
(`npm run test:e2e`, which builds and launches the real shell) was not run in this task: it is a gate of tasks 27 and 20.

## Task 16: the foundation sweep, the theme walk, the public routes (R-53, R-46)

Files: `web/src/styles/tokens.module.css`, `web/src/app/login/Login.module.css`, `web/src/app/NotFound.module.css` (new),
`web/src/app/not-found.tsx` (its three inline style attributes become classes), `web/test/token-audit.baseline/foundation.json`
(now `{}`), `web/e2e/theme-walk.spec.ts` (new), and, found on the way, `web/src/lib/fonts-href.ts`, `web/src/app/layout.tsx`,
`web/test/fonts-href.test.ts`. `privacy` and `terms` hold no literal: they use `Login.module.css`, so the sweep reached them
through it. `ThemeMenu.module.css` was written with tokens only at task 10.

### Checks, each run by itself

| Check | Printed |
|---|---|
| Baseline sum, `F=/^foundation\.json$/` | `0` |
| Weight check over `web/src/styles web/src/app/login` | prints nothing |
| Time check over the foundation paths (`web/src/styles/*.css`, `web/src/app/login/*.css`, `NotFound.module.css`, `ThemeMenu.module.css`) | prints nothing |
| Field check | before the sweep `5 0 0`, after `5 1 1` (its one rule, `.input`) |
| No-select check over `web/src/styles/tokens.module.css` | `1 0 0` |
| Strength check | before the sweep `7 7`, after the sweep `8 6` (`.btn:disabled` at 0.5, and `.btnPrimary:disabled` at 1), `9 6` after task 37's busy rule |
| `grep -c "transition: var(--motion-control)" web/src/styles/tokens.module.css` | 2 |
| `grep -c "linear-gradient" web/src/styles/tokens.module.css` | 0 |
| `grep -c "reducedMotion: 'reduce'" web/e2e/theme-walk.spec.ts`; `grep -c "setViewportSize" web/e2e/theme-walk.spec.ts` | 1; 4 |
| Notice files over `web/src/app/login` | `web/src/app/login/Login.module.css` |
| `grep -c "var(--radius-control)"`; `grep -c "var(--radius-chip)"` in `tokens.module.css`; `grep -c "var(--shadow-mark)"` in `Login.module.css` | 1; 2; 1 |
| `cd web && npm test` | exit 0, 168 files, 3296 passed |
| Spec list for `theme-walk.spec.ts` | `Total: 64 tests in 1 file` |
| `npm run typecheck`; `npx eslint . --max-warnings 0` | exit 0; exit 0 |

What the sweep changed, by entry of `component-changes.json`: `card-edge` (`.card` is `--shadow-sm`), `tag-pill`,
`tag-accent-is-filled`, `tag-outline-is-grey`, `button-pill-sans` (body face, `--font-weight-semibold`),
`button-fills` (filled ink primary with a flat grey switched-off pill at full strength; secondary on neutral 900 inside
neutral 600; ghost with the thin grey underline), `input-well`, `glyph-round` (`--font-weight-bold`),
`decoration-out` (`.rule` is a plain hairline), `brand-mark` (`.mark` in `Login.module.css`: `--radius-xs`,
`--shadow-mark`), `error-notice-composed` (`.error` in `Login.module.css` composes `errorNotice`), `select-as-field`
(`.input`'s edge, hover edge, and `cursor: pointer` on a select), `chrome-no-select` (`.btn`, `.kicker`, `.glyph`, and the
login brand), `focus-ring-one` (`.input:focus-visible` keeps the one ring and moves it onto the hairline),
`state-transitions` and `press-states` (`transition: var(--motion-control)` on `.btn` and `.input`; `.btn` scales to 0.98;
the quiet button takes the `--color-active` wash).

Defaults taken:

1. **The ghost button's hover is `--color-hover`**, not the tile's `color-mix(accent 10%)`, because the audit counts every
   `color-mix()` in a module and the entry `hover-grammar` says a row takes the hover wash. The tile's mix and the wash are
   within a few percent of each other.
2. **`.field > label` takes `--color-muted`** (64% text) in place of its own 70% mix, for the same reason.
3. **`not-found.tsx` keeps its structure**; its `style` attributes are the classes `.screen`, `.title`, `.lede` of
   `NotFound.module.css`, which is why the file's baseline went from 7 to 0.
4. **The theme-walk spec's reach for rows 19 to 21, 30 and `planner targets`** is written from the brief's inventory words
   and from the components' source, not from a run: none of the five has been exercised. Rows 21 and `planner targets`
   intercept `planner_events` with one fixture row each (`kind`, `series_id`, `done` as the app's column list has them);
   row 21 presses the form's Delete and, if the scope dialog is not open, the confirmation. Expect the PM's first run to
   adjust one or two selectors.
5. **The spec reaches `html[data-theme]` the way acceptance step 1 does**: a `[light]` case puts `light` in
   `localStorage['bb2dash.theme']` before the first load and every case asserts the attribute, so a case fails if the
   theme mechanism did not stamp.

### A finding the PM needs: the fonts did not load in the build

The first harness run of the four public routes failed all 8 cases on the font assertion ("a face of Source Sans 3 with
status loaded"), not on width. A probe spec in the walk box (not committed) showed `document.fonts` empty, no `@import`
rule in the page's two stylesheets, and no request to `fonts.googleapis.com`. Reproduced twice on this machine:

* `next build` (Turbopack): the built CSS chunk holds no `googleapis`. The same build with `main`'s Inter `@import`
  keeps it.
* `next dev`: five variants of the `@import` line on the same file. The full `fontsHref` is dropped; the same URL with
  `Source+Serif+4:wght@600` (no range) stays; a URL with only the range `opsz,wght@8..60,600` is dropped; the `url("...")`
  form, the string form, a `layer(...)` and a media condition are all dropped. So the cause is `..` in the URL.

So direction D's `fontsHref`, as written, never loads in a Next 16.3.4 build: every page would have shown the fallback
faces (`Segoe UI`, `Georgia`). The Direction check (`globals.css` holds `fontsHref` as written) still passes and the
`@import` stays, but it is dead. The fix in `2a29b5e`: `web/src/lib/fonts-href.ts` holds the string once, the root
layout links it (`<link rel="stylesheet">` plus a `preconnect` for each host), and `fonts-href.test.ts` pins the JSON,
the `@import` and the constant equal. Two other ways were left alone on purpose: dropping the range
(`wght@600`) changes the face the tile showed, and `next/font` is ruled out by name.

### The public routes, in the walk box

`node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route /login |route /privacy |route /terms |route /no-such-page "`
from the worktree root, with a plain `|` in the pattern.

| Run | Commit | `run.json` | Result |
|---|---|---|---|
| `20261009T004202Z` | `9f96ecf` (before the fonts fix) | `exit_code` 1, `tests failed` | 8 failed: every case on the font assertion, none on width |
| `20261009T011138Z` | `a5b3db2` (after the fonts fix `2a29b5e`; the spec file was not yet committed) | `exit_code` 0, `passed` | **8 passed, 0 failed**: the four public routes in both themes, `page scrollWidth=390` on each |

The first run is kept here because its failure is the finding below. Both runs started with no `bb2dash-walk22-` container,
no `bb2dash-accept-` container and no `accept.lock`; no `WALK_SHOTS`. The walk box was the only container started.

### Owed

`node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts -- --grep-invert "31 frame-scrolled\|planner targets"` →
exit 0, 61 passed, 0 failed. It needs W-68's mount of `<ThemeMenu />` in `TopNav.tsx` (the row 25 cases look for the group
named Theme and three `menuitemradio` rows) and waits for it, as the brief says. Not run. The other cases of the spec
(rows 01 to 24 and 26 to 30) do not need the mount and have not been run either: they were not asked for before the
mount, and several reach states in other workers' components.

## Task 33: the app's icon (D-5, named exception 11)

Files: `desktop/scripts/draw-mark.mjs` (new, no dependency; reads the ground and the ink from the dark block of
`globals.css`), `desktop/build/icon.png`, `icon.ico`, `tray-16.png`, `web/src/app/favicon.ico`, `web/src/app/apple-icon.png`
(the five binary files), `desktop/test/unit/app-mark.test.ts` (new, 7 cases). `make-icons.mjs` and `desktop/package.json`
are unchanged.

| Step | Command | Exit | Result |
|---|---|---|---|
| RED: the new test against the old lavender ring | `cd desktop && npx vitest run test/unit/app-mark.test.ts` | 1 | 4 failed, 3 passed (7) |
| draw | `cd desktop && node scripts/draw-mark.mjs` | 0 | `120x120, 60px square, ground rgb(5,5,5), ink rgb(250,250,250)` |
| derive | `cd desktop && npm run icons` | 0 | `wrote build/icon.ico (16, 32, 48, 256)`, `wrote build/tray-16.png` |
| GREEN | `cd desktop && npx vitest run test/unit/app-mark.test.ts` | 0 | 7 passed (7) |
| whole desktop unit suite | `cd desktop && npx vitest run` | 0 | 44 files, 836 passed |
| `git status --short desktop/build` after both scripts, committed | | | prints nothing |
| `cmp desktop/build/icon.ico web/src/app/favicon.ico`; `cmp desktop/build/icon.png web/src/app/apple-icon.png` | | 0; 0 | |
| `git diff --name-only origin/main...HEAD -- desktop/build web/src/app/favicon.ico web/src/app/apple-icon.png` | | | exactly five lines |
| `git diff --name-only --diff-filter=A origin/main...HEAD -- "*.png"` | | | prints nothing |
| `git diff --quiet origin/main...HEAD -- desktop/scripts/make-icons.mjs desktop/package.json` | | 0 | |

The square is 60 px on the 120 px canvas, centred (taste call T-10, the default taken). `favicon.ico` is copied by hand
after `npm run icons`, because `make-icons.mjs` may not be edited; the test holds both web files byte for byte.

## Task 37, W-67's part: busy says busy (H-5)

`LoginForm.tsx` carries `aria-busy={pending}` on the two fields and the submit button, and `tokens.module.css` `.input`
has its switched-off look on `:disabled:not([aria-busy='true'])` (fill `--color-neutral-900`, edge `--color-neutral-800`,
words `--color-neutral-600`, `cursor: not-allowed`) and its busy look on `:disabled[aria-busy='true']` (half strength,
`cursor: progress`). `web/test/LoginForm.busy.test.tsx` (2 cases): `aria-busy="false"` at rest, and `true` on the three
together while the request is in flight, each disabled. `git grep -c -E "aria-busy=\{(pending|busy)\}" -- web/src/app/login`
prints `web/src/app/login/LoginForm.tsx:3`. `npm test` 168 files, 3296 passed; `git grep -c -E ":disabled:not\(\[aria-busy=.true.\]\)" -- web/src`
prints `web/src/styles/tokens.module.css:1` (the other four rules are the other workers').

## Task 16: the owed theme-walk run

W-68's mount was on `origin/feat/styling-22` (`git grep -c "<ThemeMenu" origin/feat/styling-22 -- web/src/components/shell/TopNav.tsx`
printed `:1`); the branch was merged at ca52b96. Command, from the worktree root, on a committed tree, in the background, no
`WALK_SHOTS`: `node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts -- --grep-invert "31 frame-scrolled|planner targets"`.
Before each run: no `bb2dash-walk22-` or `bb2dash-accept-` container, no `accept.lock`.

| Run | Commit | Result |
|---|---|---|
| `20261009T012143Z` (first) | `934fe25` | `exit_code` 1: 58 passed, 3 failed |
| `20261009T013028Z` | `9d4d95f`, `dirty` false | `exit_code` 0, `result` `passed`: **61 passed, 0 failed** (4.1 m) |

Selector fixes, all in `web/e2e/theme-walk.spec.ts`:

1. **The bar's icon buttons by role and name** (`fix(22-T16)`, before the first run): Activity and Announcements are
   `getByRole('button', { name: ... })`, non-exact because a count joins the name; no `title` selector is left, because task 32
   takes the title off the five icon buttons.
2. **Row 16, `16 not-found [dark]` and `[light]`**: the case opened `/no-such-page` signed out, which the proxy sends to `/login`,
   so the "Not found" heading never showed. It opens signed in under a quiet Sync label, as `phone-width.spec.ts` does.
3. **`motion off under reduced motion`**: it read `--motion-exit` as `0s`; the build's minifier writes a zero time that way.
   The case accepts `0ms` or `0s`.

No case failed because of an element in another worker's file. Nothing was written to the database in either run
(`guardWrites22` is on every case). The two cases left out, `31 frame-scrolled` and `planner targets`, stay owed to tasks 26 and 36.

## Round 2

From the first `/code-review main high`. The branch was merged with `origin/feat/styling-22` first (it holds `origin/main` after
the Phase 23 follow-ups; nothing of it is in these files). One commit per item.

### R2-3 (HIGH): the `theme-color` meta after an in-app navigation

**It reproduced.** The assertion went into `25 account-menu [light]` first (`b9d3976`): pick Light, set a marker on `window`,
follow the bar's Planner link (the marker survives, so it is a client navigation), read every `meta[name="theme-color"]`.

| | Run | Printed | Result |
|---|---|---|---|
| RED, before any fix | `20261009T030405Z`, `b9d3976`, `dirty` false | `theme-color metas after the navigation: ["#f4f4f4","#050505"]` | `25 account-menu [dark]` passed, `[light]` failed, `exit_code` 1 |
| GREEN, after `da7719c` | `20261009T031847Z`, `8a4faf5`, `dirty` false | `theme-color metas after the navigation: ["#f4f4f4","#f4f4f4"]` | `25 account-menu [light]` passed |

The stamped meta stays and Next inserts a fresh one with the server's dark value beside it. The fix is in the boot script
(`da7719c`): a `MutationObserver` on `<head>` sets any `theme-color` meta whose content is not the stamped theme's ground.
Setting a content that is already right changes nothing, so the observer ends. Compile-time constants only, no storage write,
no `MutationObserver` means no observer and the stamp still happens. Unit cases in `theme-preference.test.ts` (5 plus one
with the real observer), RED against the old script: 9 failed of 49 (the R2-3 and R2-5 cases), GREEN with it.

### R2-5 (MEDIUM): another tab's pick

`ab0a9fc`. The boot script adds a `storage` listener: for the key `bb2dash.theme`, or a cleared storage (key null), it
re-resolves and re-stamps the attribute and the metas with `data-theme-switching` for two frames (the same `apply` a system
change uses); any other key does nothing; it writes no storage. `ThemeMenu` keeps what it picked together with what storage
read back right after the pick (`lastPick`): while storage still reads that, the pick shows (a storage that cannot be written
keeps its old value, so the pick has to show beside it); when storage reads anything else, another tab wrote it and the menu
follows. Cases: `theme-preference.test.ts` (6) and `ThemeMenu.test.tsx` (3); RED for the menu before the fix: 2 failed of 18
(a later change after a local pick; the unwritable storage), GREEN after.

### R2-9 (LOW): the preconnect

`07c6d6d`. `crossOrigin` is off the `fonts.googleapis.com` preconnect and on `fonts.gstatic.com` only. A comment over the
`@import` in `globals.css` says the build drops it and the layout's link is what loads. `fonts-href.test.ts` is unchanged and
passes.

### R2-tip (MEDIUM): the drawn label and the button's name

`e82a36c`. `.tip[data-tip]::after` has `content: attr(data-tip) / '';`, an empty alternative text, so the label is drawn and not
spoken. lightningcss keeps the form (`content:attr(data-tip) / ""` out of a minified transform) and the audit is green with
`foundation.json` at `{}`. W-68 can take its `aria-label` workaround off: the name is the `.sr-only` text again.

### R2-notice (LOW): the count

`d84b012`. The comment over `.errorNotice` no longer quotes the compose line.
`git grep -c "composes: errorNotice from" -- web/src/styles/tokens.module.css` prints nothing (exit 1), and
`git grep -l "composes: errorNotice from" -- web/src/styles ...` in the foundation prints `web/src/app/login/Login.module.css` only.

### R2-4c (MEDIUM): the switched-off look on a save

Every `disabled=` in my files, `login/`, `ThemeMenu`, `privacy/`, `terms/`, `not-found` and `layout.tsx`:

| Site | Expression | Decision |
|---|---|---|
| `LoginForm.tsx:101` the email field | `disabled={pending}` | already `aria-busy={pending}` (task 37); nothing beside it |
| `LoginForm.tsx:117` the password field | `disabled={pending}` | already `aria-busy={pending}` |
| `LoginForm.tsx:126` the submit button | `disabled={pending}` | already `aria-busy={pending}`; a button, reached by `.btn:disabled` and `.btnPrimary:disabled`, not by the five field rules |

`ThemeMenu` has no `disabled`. No site holds a pending or busy flag beside something else, so none changed and none was left out
for a reason other than that. The `aria-busy={pending}` count in `web/src/app/login` is still 3.

### Checks

| Check | Result |
|---|---|
| `npx vitest run test/theme-preference.test.ts test/ThemeMenu.test.tsx test/fonts-href.test.ts test/raw-html.audit.test.ts test/token-audit.test.ts test/theme-tokens.test.ts test/foundation-round2.test.ts` | exit 0, 7 files, 216 passed |
| `npm test` | exit 0, 170 files, 3328 passed |
| `npm run typecheck`; `npx eslint . --max-warnings 0` | exit 0; exit 0 |
| Direction check | `125 0 77 0 true` |
| allowlist | `git diff --quiet ce2519f HEAD -- web/test/token-audit.allowlist.ts` exits 0 |

`web/test/foundation-round2.test.ts` (new, 6 cases) pins R2-9, R2-tip and R2-notice; RED against the three files as they stood
before the round: 4 failed, 2 passed; GREEN after.

### The closing harness run

`node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts -- -g "25 account-menu|13 login|motion off"` on the committed and pushed tree
(`8a4faf5`), no `WALK_SHOTS`, no `bb2dash-walk22-` or `bb2dash-accept-` container and no `accept.lock` before it: run
`20261009T031847Z`, `exit_code` 0, `result` `passed`, `dirty` false, **5 passed, 0 failed** (`13 login` in both themes, `25 account-menu`
in both, `motion off under reduced motion`).
