# Phase 22 · Styling: tokens, light and dark, the phone-width nav, Stack's direction

Date 2026-09-24 · Frozen 2026-10-08 against `main` a58be34 · Amended 2026-10-08 (the direction: tile D) · Amended again 2026-10-08 (amendment 3: the refinement pass; reviewed the same day, 24 findings applied) · PM: the Fable session · Product manager: Stack
Requirements: R-53, R-46; S2-styling-1
PM-added steps: P-15, P-16, P-17, P-76, P-77, P-78, P-79
Branch `feat/styling-22` · Worktree `bb2dash-wt-22` · Migration range: **none** (no number reserved, 94 §1)
One PR per phase, with no exception. Tasks 1–2 (P-15, P-16) did not ride Phase 17's PR. They are this branch's
first code commits (DECISIONS 2026-10-08, the row that amends the 2026-09-27 B-6 row).
Status: **Contract frozen 2026-10-08.** B-6, B-23 and B-24 were answered by delegation on 2026-09-27, each to its
default (DECISIONS rows of that date). Stack answered the nine open items on 2026-10-08 (§Open items, closed).
The direction was decided the same day: tile D, "Charcoal" (§Freeze record, amendment 2). That afternoon the
ui-ux-pro-max refinement pass ran on tile D and Stack ruled on it: five decisions, D-1 to D-5 (§Freeze record,
amendment 3). The visual build runs from the brief as amendment 3 leaves it.

B-numbers are the item numbers of `93_SPRINT2_RESEARCH_SYNTHESIS.md` §5. This brief is Phase 13 (R-21) re-listed by
Stack as S2-styling-1: it **supersedes the Contract of `../parked/81_PHASE13_styling.md`**; 81 stays the record of
Stack's 2026-09-14 DoD and the 2026-09-16 carry-ins C-1..C-3. Runs **last** (94 §2 rule 5). Phases 16, 17, 18, 19,
14, 21 and 23 are on `main`, so every sprint-2 screen, the Workspace page included, exists.

**Answered by delegation 2026-09-27.** Stack delegated the 93 §5 answers and the plan approval to the PM; the
DECISIONS rows of 2026-09-27 hold them. Of this brief's B-numbers (B-6, B-23, B-24), every one resolved to its
default. Two of those rows are amended by rows of 2026-10-08: B-6's clause on when the audit lands and its
sentence on who ticks each screen (the PM ticks, for this phase), and B-24's Menu (§Stack's calls). Amendment 2
of the same day amends B-6 twice more: how the directions were shown, and the control's default, which is Dark.

## Freeze record, 2026-10-08

The brief was written against `main` a5042fa. On 2026-10-08 nine read-only agents re-measured its 125 claims
against `main` 8269fac (a58be34 since; the difference is one docs-only PR). 67 claims did not hold. The record,
with every such claim, the gap list G-01..G-17 and where the evidence is, is
`docs/planning/sprint-2/verification/103a_PHASE22_FREEZE_AUDIT.md`. The PM's rulings, one line each:

* **F-1 Status.** B-6, B-23 and B-24 stand as answered on 2026-09-27; tasks 1–2 open this branch; one PR.
* **F-2 Stack's answer.** His 2026-10-08 sentence closes the nine open items; the PM walks, he rules on taste.
* **F-3 The walk box.** Every harness run is one throwaway container (`scripts/walk-box.mjs`); W-75 builds it.
* **F-4 Phone width.** Panels capped and re-anchored; the toast's box is `.stack`; state 7 is search; 54 cases.
* **F-5 Allowlist.** A1 has eight `@media` values and one `@container` entry; A3 has two kinds; A5 is new.
* **F-6 Ownership.** `components/course/` to W-70; `lib/` and `proxy.ts` in foundation at 0; no config edit.
* **F-7 Inventory.** 30 surfaces; rows 07, 11, 12, 18, 22, 25, 28 and 29 changed; row 30 is the planner wizard.
* **F-8 Theme mechanism.** The OS-change listener lives in the boot script; eight more contrast pairs.
* **F-9 Desktop.** The literal is at `window.ts:256`; the desktop look is the PM's, in a second instance.
* **F-10 Gates.** `npx eslint . --max-warnings 0`; layout specs in the walk box; `/code-review` twice.
* **F-11 No writes.** Two proofs: the spec's own guard, and a fingerprint before and after each shots run.
* **F-12 Tiles.** Sample data only.
* **F-13 Acceptance.** The acceptance script is the PM's walk in the walk box; no acceptance pack.
* **F-14 Working rules.** Two spawns per worker; a default in every prompt; no message to a running worker.
  (Amended the same day by G-7: one spawn each, with resumes.)
* **F-15 Wording and numbers.** Every stale count, line number and file name is replaced by today's value.

The same day three independent checkers read the frozen brief, the audit record and the day's DECISIONS rows.
They returned 24 findings; all 24 were applied, none against a ruling (103a §8 lists each with what changed).

## Freeze record, amendment 2 (2026-10-08, the direction)

The direction is decided. Stack compared tiles A (Nocturne), B (Chalkboard) and C (Orange) in one walkthrough
page, https://claude.ai/artifact/1BNFChvdcdEbjMTCbWp3rE, and saved his pick there: B overall. Per step: first
look B, type B, top bar and buttons C, grades B, colour coding no pick, Inbox and notices B, light and dark B.
He asked for C's buttons and C's Upcoming work block, a work-type colour code that shows urgency, and a dark
mode that reads as well as the light one. Then he asked for dark by default with a light version, and grey,
white and `#ff0000` as the accents. The PM had a fourth direction designed from that, tile D "Charcoal",
https://claude.ai/artifact/DLqDKhRNFNoSxJ8YQqaoTU. Three independent critics checked it. He was shown it with
five taste calls and the default taken on each, and told that the build continues on D unless he objects. His
words are in the DECISIONS row "Phase 22 direction: tile D (Charcoal)". The evidence is in
`docs/planning/sprint-2/evidence/103_style_tiles/`. The PM's rulings, one line each. They win over the brief as
frozen and over the designer's report:

* **G-1 The direction.** Tile D. A, B and C were shown through one walkthrough page; tasks 6 and 7 check that.
* **G-2 Scope.** The 55 entries of `component-changes.json` are in scope, by file owner; two more behaviour changes.
* **G-3 Theme default.** No stored choice means Dark. The control reads Dark, Light, Auto. The desktop window is dark.
* **G-4 Work-type colours.** One urgency scale. `type-tokens.contrast.test.ts` keeps two assertions and gains the rule.
* **G-5 Tokens.** Task 8 writes `direction-d.json`: both maps, 12 new names, D's fonts. The accent is the ink.
* **G-6 The walk record.** `WALK.md`'s taste calls open with the five already put to Stack.
* **G-7 Workers.** Each worker is spawned once. The task order, the interim merges and the no-message rule stand.

Six defaults the amendment took where a ruling and the brief or the code did not meet. Each is reported to the PM:

1. G-3 calls the desktop step "acceptance step 6". Here the desktop look is step 5 and the taste calls are step
   6. Step numbers are kept: G-3's sentence is written into step 5 and G-6 into step 6.
2. G-4 asks for the DECISIONS row that introduced the five-hue rule. No such row exists. The rule came with
   Phase 12b (brief 80c, rows P-home-1 and H-1) and lives in a comment of `globals.css` and in the test's header.
   The new DECISIONS row quotes those.
3. `component-changes.json`'s entry `weights-as-tokens` asks the PM to rule. Until he does, this Contract's rule
   stands: weights are token references (§Token set rules).
4. With Dark as the default, an emulated light system no longer makes a page light. Both specs therefore store
   the choice for their `[light]` cases (§Panels and wide content; acceptance step 1).
5. G-3 names a pick and a system change as the moments the `theme-color` meta is updated. The boot script also
   sets it when it resolves light at boot, so a stored Light keeps its bar colour across a reload.
6. "Spawned once" is read as one spawn per worker with resumes: a worker that reaches a task whose merge is not
   in yet stops, and the PM messages it once it has stopped (§Workers).

## Freeze record, amendment 3 (2026-10-08, the refinement pass)

Stack, 2026-10-08, afternoon, verbatim: "Tell phase 22 to use /ui-ux-pro-max during its design execution to
sharpen the visual aspects to make this feel like a high-end full production centralized content and schedule
interface dashboard. The end goal of the graphic design is to have a sleek, modern tech design with minimal
motion animations and graphics. This still feels like an electron app and I want it to feel like a professional
grade application."

Then, verbatim: "insert the /ui-ux-pro-max skill usage requirement as a new pass prior to the beginning of the
visual build. This should be a separate refinement pass after the current phase of work builds."

The PM ran that pass the same afternoon as a design-only run: a lead working through the skill, three
independent critics, one fix round. No app code changed. Its write-up is
`docs/planning/sprint-2/verification/103b_PHASE22_REFINEMENT.md` (called REFINEMENT below): his words, the skill
steps as run, ten causes of the Electron feel, a refinement list of 35 rows, the motion spec, the pre-delivery
checklist, and the hand-off this amendment is written from. The refined tile took the earlier one's place in
the evidence folder. It is the second version of the page https://claude.ai/artifact/DLqDKhRNFNoSxJ8YQqaoTU, and
the earlier tile is kept as `tile-d.before-refinement.html`. `direction-d.json` now also holds the motion,
scrollbar, press and focus tokens. `component-changes.json` holds 106 entries: the 55 of amendment 2 and 51 new
ones, each new one with an `owner`. The design system the skill persists is at `design-system/bb2dash/`
(`MASTER.md` and five page files), where the skill reads it from the project root.

Rows 1 to 16 of the list are the default build. They needed no word from him. Rows 17 to 35 waited for a word.
He was asked in the terminal the same afternoon. His decisions, with the label he chose in quotes:

* **D-1 The window** (rows 17 and 18): "Inside Phase 22". The app's bar is the window's title bar, with a
  right-click menu, the app's own menu, a page for a load that fails and the update prompt in direction D. And
  the app is a frame whose panes scroll, not a page that scrolls whole. It is the last stage of the visual
  build, in the same PR. The PM's walk covers it, the packed desktop build included.
* **D-2 Type** (row 21): "Titles and dates". The serif is for titles only: labels and controls take the plain
  sans. Dates and times leave the code face. Sizes stay as they are: no 11px floor. The fonts stay on the one
  Google Fonts import.
* **D-3 Motion and icons**, added to the quiet default: "Panels also animate out" (row 26), "Smooth sidebar and
  search" (row 32), "Bar icons at one weight" (rows 19 and 22). Not chosen: small icons beside rows and actions.
* **D-4 States the app draws**: "Keyboard polish" only (rows 27 and 28): a skip link, arrow keys inside menus,
  focus returning to what opened a panel, the toast's timer pausing, drawn tooltips naming the bar's icons. Not
  chosen: still loading rows and `loading.tsx` (row 23), designed empty states (row 24), app-drawn select lists
  and growing text areas (row 25). The default build's own smaller steps stand: the closed select restyled, and
  Home's loading line waiting before it shows.
* **D-5 Small calls**, all four: "App icon in the new look" (row 20), "Tidy captions and codes" (row 30),
  "Meeting days as outline" (row 33), "Larger click targets" (row 31; the planner's done box needs care, because
  a tick writes to his planner).

The PM's rulings, one line each. They bind this amendment. His decisions win where they differ:

* **H-1 Order and the skill.** Planning half, refinement pass, visual build (tasks 3 to 38), the PM's walk, the
  PR. Every visual task loads the skill and reads the design system first.
* **H-2 The default build.** Rows 1 to 16 join the scope by file owner. `--motion-*` and `--ease-*` join the
  token families. The Time check is a named command.
* **H-3 The window.** Two tasks after 25: the frame with scrolling panes first, then the desktop shell. Both are
  named exceptions. W-67's set gains the desktop files.
* **H-4 The other decisions.** New tasks for D-2 to D-5, each with an owner by file and a check. Every
  pre-existing test that must change is named.
* **H-5 Rows left to the PM.** Row 29 (`aria-busy`): yes. Row 34 (the Upcoming strip's scrollbar): yes. Row 35:
  the panes carry the gutter. Row 23's `data-loading`: not needed.
* **H-6 The walk.** Both specs emulate reduced motion. One case proves motion is off under it. The desktop
  pieces are proven in desktop tests and the PM's desktop look, and listed in `WALK.md`.
* **H-7 What he did not choose** is listed in §Out of scope with his answer.

What moved, in numbers. 39 tasks, 0 to 38; tasks 0 to 25 keep their numbers. Five workers, as before. 31 walk
surfaces (30 before). 54 phone-width cases, as before. 64 theme-walk cases (60 before: two for the new surface,
one for reduced motion, one for the planner's two click targets). 77 tick lines in `WALK.md` (62 before: 62
surface lines, the C-1 line, the toggle line and 13 pre-delivery lines). Five pre-existing web test files may
be edited (two before); each is named in §Files with the lines it may change. No pre-existing desktop test is
edited.

Nineteen defaults the amendment took where a decision, a ruling and the code did not meet. Each is reported to
the PM. The last four, 16 to 19, came with the review of the amendment (the paragraph after this list):

1. **Panels that leave, and the two TopNav tests.** H-4 names `TopNav.search.test.tsx` and
   `TopNav.workspace.test.tsx` as tests row 26 would change. They do not have to. A closing panel stays for
   one exit only where its exit token reads above 0. jsdom loads no stylesheet, so there the token cannot be
   read and the panel is removed at once, as today. Both files stay unedited (task 29).
2. **Row 22's marks, and the tests that read a link by its arrow.** 31 files under `web/test` and `web/e2e`
   hold one of the characters outside a comment, and ten of them read a link or a label by a name with its
   arrow in it (`Inbox.test.tsx:443`, `FileOpenAction.test.tsx:116`, `SyncButton.test.tsx:485`,
   `web/e2e/walk.ts:19`). So each mark keeps its character as text, clipped the way `.sr-only` is, inside
   the wrapper the character has today, and draws its SVG beside it. A character a reader hears today is
   still heard, and one that is `aria-hidden` today stays hidden. Every accessible name and every text
   content stays what the tests read, and no test is edited. The pass lists five marks and counts 41
   characters; nine of the 41 are a right arrow after a link's words, which has no mark of its own, and it
   is drawn as the caret right. The pass counted TSX only: seven more arrows reach the page inside strings
   from `.ts` files, and they are drawn the same way where they are rendered, with the strings left alone.
   Two things the review added. Four of the 41 sit in a label that a TSX file holds as a string, and a test
   reads two of those by value: such a string keeps its value and takes its character from a constant of
   `icons.tsx`. And one label stays typed: the staged label where it is not a link
   (`SubmissionBlock.tsx:98`), because `SubmissionBlock.test.tsx:265` reads it as one text node (task 31).
3. **"Tidy captions and codes", and Blackboard's words.** The code prints the attempt status "verbatim"
   (`web/src/lib/queries.grades.ts:440-441`), three assertions pin it (`GradebookTable.test.tsx:61` and `:119`,
   `SubmissionBlock.test.tsx:146`), and `status-vocabulary.test.ts:113-131` fails any screen that spells a
   status by replacing underscores. So the words are written once, in `queries.grades.ts`, as a new field
   beside the verbatim one, and the two test files change those three strings. The field is left off the
   object when there is no attempt status, so the old whole-object comparison at
   `queries.grades.test.ts:224` still holds. The words are the code's own, in
   lower case with spaces. They are his to change: taste call T-9 (task 34).
4. **The four captions.** The pass says they "move into a tooltip or go". Default: each leaves the page's
   visible text and becomes the `title` of the thing it explains, so nothing he may rely on is lost, the New
   York time line included. Taste call T-9.
5. **The planner's two click targets.** A half-hour block is one slot, 24px, with 3px of padding and a clipped
   edge (`PlannerWeek.module.css` `.block`; A3 pins its padding and line height). Inside it the done box can be
   24px tall and cannot be 24px wide without lying over the title, and a tick is a write. Default: the done
   box's hit area is the block's full height and never reaches past the box's own edge on the title's side; the
   title's hit area is the rest of the block. One browser case proves a press on the title's first pixel opens
   the event and writes nothing. The width is recorded in `WALK.md`, not met (task 36).
6. **Which dates leave the code face.** The pass names two places and the tile drew those two: the Inbox
   card's value panes and the gradebook's Seen column. Default: those two, and the same "seen" stamp in the
   popout's submission block. Left in the code face and named: the planner's hour labels, the tracker's day
   numbers, the meeting-day letters, week numbers, course codes, scores, commands and keys. Taste call T-7
   (task 28).
7. **Row 15 and the frame.** `scroll-padding-top` is in the default build (H-2) and is dead once the bar no
   longer lies over a scrolling page (H-3). It lands at task 8 and goes at task 26.
8. **The exit tokens in the JSON.** D-3 makes the build declare `--motion-exit`, `--motion-exit-lg` and
   `--ease-in`. The pass's `direction-d.json` holds them under `tileOnly.dark`, outside the `dark` map, and the
   file is committed as the pass wrote it. The Direction check still reads the two maps (125 and 77 names). A
   new named command, Exit tokens, reads the three.
9. **The design system's "waits".** `design-system/bb2dash/` is committed as the pass wrote it, before he
   ruled, and stays byte for byte. A line there that says **waits**, "needs his word", "a call for him",
   "the PM's call", "the PM's to rule" or "if he says so" is read against D-1 to D-5 and H-5 above: decided
   in, the task in this brief is the instruction; decided out, §Out of scope. Some lines the decisions
   overtook carry no such mark and state the old plan as fact; §Workers lists each with the task that
   replaces it ("The skill"). This brief wins over the design system, a page file included, and
   `direction-d.json` wins over both on a value.
10. **The tooltip's wait.** The pass says half a second. No token holds it. Default: twice `--motion-delay`,
    written `calc(var(--motion-delay) * 2)`, 480ms, so no module writes a time. Sync keeps its `title`, which
    four assertions pin (`SyncButton.test.tsx:157`, `:244`, `:458`, `:464`), and gets no drawn label: five icon
    buttons do. Row 27 put "the six controls of the bar" to him and the build draws five, so that is put to
    him too: taste call T-11 (task 32).
11. **The search field's slide.** The pass says it "moves 8px". Default: it moves by `--motion-shift`, 6px, the
    one distance a panel travels, so no new size is written (task 30).
12. **Task 6's count of tiles.** Its check counted four `tile-*.html` files. The kept earlier tile makes five.
    The check is amended to five and names them.
13. **The title bar and the dark window.** G-3 stands: the window's background is the dark ground at every
    open. The title bar's three buttons are drawn in the dark bar's colours at open too, and follow the page's
    theme once the page has stamped it (`did-change-theme-color`). A person who picked Light sees one dark
    frame and dark buttons, then the light bar. `nativeTheme` is still read nowhere (task 27).
14. **"Arrow keys inside menus".** Three panels in the app say `role="menu"`: the account menu
    (`TopNav.tsx:152`), Bell (`Bell.tsx:100`; its rows are links with `role="menuitem"`, `:132`) and Activity
    (`ActivityMenu.tsx:69`; its rows are lines of text with nothing to focus). The arrow keys are built in
    the account menu, the theme rows included, because that is what row 28 and the entry
    `keyboard-in-the-shell` put to him: "a menu that acts like one". Bell's links and the phone Menu's keep
    Tab, and Activity has no row to move to. That is narrower than the plural in D-4, so it is put to him
    (taste call T-11) and named in `WALK.md` under "Known, not this phase" (task 32).
15. **The frame at every width, and what a shot shows.** The panes scroll at phone width too. The
    phone-width route cases measure the pane as well as the page, or C-1's proof would pass on a page that
    can no longer scroll (task 26). Left alone, a walk shot would then be the first windowful, and the parts
    the inventory names below it would be judged in neither theme. So each surface case of rows 01 to 12
    makes its window as tall as the bar plus the pane before its shot, and row 31 shows the frame itself,
    with the pane scrolled to its end (§Routes and screens, under the inventory; task 16).
16. **"Meeting days as outline", and what is built.** The label he chose reads the other way round from the
    build. Row 33, the entry `week-strip-shape` and the refined tile all draw a plain day as the outline and
    a meeting day as filled, and task 35 builds that: it is what he was shown under the label. The mismatch
    is put to him so he can turn it round: taste call T-10.
17. **The window's minimum width.** The three window buttons take room the bar did not have to give: 138 px
    by the pass's measure (REFINEMENT §8). The unfolded bar is 851 px with the idle label (2026-10-05), the
    fold is at 720 px and the window's minimum on `main` is 900 px. So from 900 to about 990 px the bar and the buttons
    would not fit, and no browser case can see it: there `env(titlebar-area-width, 100vw)` falls back and
    the padding is 0. Default: task 27 raises the window's `minWidth` from 900 to the idle bar plus the
    buttons, about 990 px. That covers the idle bar. A long Sync label while a sync runs, in a window
    narrower than that longer bar plus the buttons, is named in §Out of scope and not fixed. Taste call T-6
    (§The desktop shell).
18. **The popout's two planner hosts.** The popout that leaves with motion is the one `ItemPopout` hosts.
    The planner's event form and its new-event wizard draw the same frame from W-69's files
    (`PlannerEventForm.tsx:128`, `PlannerEventWizard.tsx:123`), and their parent drops the frame at once.
    Default: those two close at once, as the planner's item popover does. The frame may not wait before it
    calls `onClose` (§Motion, rule 7). Taste call T-8 (task 29).
19. **The drawer's side.** The drawer slides by `transform`, and a transform needs a sign. The side is one
    token, `--sidebar-side`, read as a flex direction (`row-reverse` today, the right), and no token carries
    a sign. Default: the offset is written for today's side in `CourseSidebar.module.css`, and one case of
    `shell-motion.css.test.ts` reads `--sidebar-side` from `globals.css` and fails when the sign does not
    match it. So moving the side is the token and that one sign, in one commit (task 30).

The review of the amendment. The same day two reviewers read amendment 3 as committed (0c5e73c): one against
his decisions, the quotes and the evidence files, one for whether four workers and a desktop task can build
from it. They returned 24 findings, S-1 to S-12 and B-1 to B-12; three pairs are one finding seen twice (S-1
and B-1, S-2 and B-5, S-4 and B-10). Each was checked in the files and the code, and all 24 were applied,
none against a decision or a ruling. What changed, in one line each:

* **Task 8.** `attemptText` is left off when there is no attempt status, so task 8's own check can pass.
* **Marks.** Eight line numbers corrected. A mark keeps the wrapper its character has. A label held as a
  string in a TSX file takes its character from `MARK_CHAR`. One label stays typed. A check for the labels
  that arrive as strings.
* **The desktop shell.** The window's minimum width (default 17). The bar is not a drag region under an open
  dialog, and its panels are `no-drag`. An aborted load is not a failed load. The theme's colour is compared
  without regard to case. Four more pre-existing desktop cases that bind are named.
* **Motion.** The drawer's side (default 19). The planner's form and wizard close at once (default 18). The
  desktop look opens and closes each panel with motion on.
* **The record.** The JSON's `owner` and `file` fields for entries 74 to 98 are the pass's, and this brief's
  tables win. The design system's overtaken lines are listed. Default 14's count of menus is corrected.
* **The walk.** A shot of rows 01 to 12 holds the whole screen (default 15). The update prompt is opened and
  looked at. Three new named commands (Field check, No-select check, Strength check) and a table of proofs
  for the 13 pre-delivery lines.
* **Taste calls.** No new number. T-6, T-7, T-8, T-10 and T-11 each gain what the build narrowed or turned
  round: the minimum width, one small title, the panels that do not leave, the week strip, and the keys and
  labels of "Keyboard polish".

No count of tasks, workers, surfaces, cases, tick lines or editable tests moved with the review.

## Why

R-53 is R-21's definition of done, fixed on 2026-09-14 and never started: every screen on signed-off tokens, in
light and dark, each approved by Stack. Sprint 1 skipped Phase 13 on 2026-09-22 ("skipped, not cancelled") and
Stack re-listed it on 2026-09-23 as S2-styling-1 under "cleaning", which places it after the builds and inside
this sprint. Today (`main` a58be34) `web/src/app/globals.css` holds one dark `:root` block (lines 20–165) with
`color-scheme: dark` hard-coded (line 164). The file is byte-identical to a5042fa. There is no light theme, no
`data-theme`, no toggle and no stored choice. Colour escapes the token file in a handful of places:
`layout.tsx:12` themeColor `'#161826'`, the `CourseSidebar.module.css:161` rgba scrim, and 27 `color-mix()`
tints in 9 modules plus `tokens.module.css`. `desktop/src/main/window.ts:256` paints `'#12131a'` where the app
paints `#161826`. Sizes are the real work. Counted as declarations whose value holds a `<n>px` literal, comments
stripped, there are 444 px declarations (506 literals) in 35 of 46 non-token modules; 198 of them hold only
1px or 2px, and 55 are font sizes. There are 6 `rem` literals in 3 modules. (The same count gives 404 at a5042fa;
the "441" this brief first carried was a count of lines.) There are 25 `style=` sites in 13 TSX files; 11 of them
carry custom properties only. Nothing checks any of it. Two text pairs already miss WCAG AA on today's dark block
(measured from `globals.css`): `--color-neutral-600` on the card at 3.52:1 (16 text declarations in 11 modules)
and `--color-danger` on `--color-danger-bg` over the card at 3.94:1 (every error notice).

R-46 is C-1, carried since the Phase 10b walk (DECISIONS 2026-09-16): at 390 px the document was 636 px wide on
`/course/IST.466/grades`. The top bar never folds. At ≤720 px its six links shrink into a strip that scrolls
sideways with its scrollbar hidden; at 390 px about 100 px of it shows (estimate from the rule values), so most
links are out of sight. Search is an icon at every width since 2026-09-30. The Sync label follows the live sync
and has 13 strings; with a long one the bar itself is wider than a phone (estimate from the rule values; task 5
measures). `GradebookTable`'s `.wrap` has no scroll container. `PlannerWeek`'s `.board` carries
`min-width: 760px` (`PlannerWeek.module.css:844`, in the ≤900 px block) on the same element as its `overflow-x`
(line 107), so `/planner` scrolls the page too. The Bell and
Activity panels are 360 px wide and anchored 36 px from the right; at 390 px their left edge is about 14 px
off screen. The Sync toast's box is 320 px wide and anchored to the button; at 390 px it is about 121 px off
screen (both from the rule values, not seen in a browser). C-1 needs the nav redesign, so it stays here. Under
B-23, C-2 (R-36) and C-3 (R-50) shipped earlier, in Phases 16 and 17.

Why now and in this shape (94 §1, the phase map's "why"): last, after every sprint-2 screen exists; three style
tiles, Stack's pick, the tokens applied on every screen in both themes, the top-nav fold at the existing 720 px
step, walked per screen. The token audit changes nothing on screen. It was meant to land early with Phase 17 and
did not, so nothing merged since 2026-09-24 was held by it. Tasks 1–2 open this branch and write the baselines
from today's tree.

## Stack's calls this brief rests on

All three were answered on 2026-09-27, by delegation, each to its default. The DECISIONS rows of that date hold
them. Worker ids W-67..W-70 follow brief 102's W-63..W-66. The fifth worker is W-75, because W-71..W-74 were
used by other work.

| B | Question (93 §5) | Answer (DECISIONS 2026-09-27, by delegation) | What moves if Stack later changes the answer |
|---|---|---|---|
| B-6 | S2-styling-1: must or should, placement, how directions are shown, the toggle, when the audit lands, C-1 | **Default.** Should, last in the sprint; three style-tile directions as live Artifact pages; a three-state Auto / Light / Dark control in the top-nav account menu, named as an exception to "no behaviour change"; C-1 stays with styling. Two sentences of the row are amended on 2026-10-08. "The token audit lands early, as a test-only ratchet with Phase 17": the audit opens this branch (tasks 1–2). "Stack's own step: Stack picks one of the three style tiles, then ticks each screen in light and dark on the preview": he still picks the tile; for this phase the PM ticks each screen, in the walk box (§Open items, item 9). Amended again the same day (amendment 2): A, B and C were shown through one walkthrough page, a fourth tile, D, is the direction, and the control reads Dark / Light / Auto with Dark as the default | "Must": order only, no task changes. No toggle (follow the OS only): task 10 drops, task 9 keeps the boot script without storage, P-77 closes by a DECISIONS row. Toggle elsewhere: task 10's mount line moves to that file's owner. Directions shown another way: task 6 changes; an in-app page would be a new screen and needs a row against 81:79-80. C-1 leaves: tasks 5, 12–15 and 21 leave with P-79. |
| B-23 | Phase 13 carry-ins (Q14): which of C-1..C-3 ship early | **Default.** C-2's rule line (R-36) shipped in Phase 16: `rankRuleText` in `web/src/components/grades/GradedSoFarFigure.tsx`, `RankRule` in `web/src/lib/graded-so-far.ts`. C-3's favicon (R-50, with P-80's `apple-icon.png`) shipped in Phase 17. **C-1 stays here** | Nothing. Both carry-ins are on `main`. |
| B-24 | Phone-width nav (Q15) | **Default, amended 2026-10-08** (§Open items, item 6). The row folded "its page links … and Search into one Menu … replacing today's hide-Search step". Its recorded reason, "TopNav already hides Search at ≤720 px", stopped being true with the 2026-09-30 search icon. As amended: at the **existing 720 px step** the Menu holds the six page links and nothing else; Search stays an icon in the bar; the Sync button shows its icon only at ≤480 px and its label is capped at ≤1023.98 px | "No Menu" (keep the strip, or wrap to two rows): task 12 changes. Open state 4 leaves, so the open states are 7 → 6 and task 13's 14 open-state cases → 12 (its run 22 → 20). `phone-width.spec.ts` 54 cases → 52. Inventory row 27 leaves: 30 surfaces, `theme-walk.spec.ts` 64 cases → 62, task 22's shots 31 + 31 → 30 + 30, `WALK.md` 77 tick lines → 75 (the counts as amendment 3 leaves them). Task 21 drops `41-phone-nav-menu.png`. The reachability cases become "each link and the search icon visible and focusable with no menu". A different breakpoint: A1's frozen set changes and a DECISIONS row records it. |

**B-42** (93 §5 item 42, the test runner's database credential and migration 100's `db_test_runner` role;
answered 2026-09-27, default) is not a call this brief rests on. No check here runs `scripts/db-test.mjs`, reads
`BB2DASH_TEST_DB_URL` or needs that role: the phase has no migration and no `db/tests` file, and its only
database contact, the no-writes read of tasks 21 and 22, is a read-only select through `execute_sql`.

## Contract (frozen 2026-10-08)

### Routes and screens

**No new route.** Two new controls, both named exceptions to 81:50's "no layout, copy, or behaviour change":
(1) the **Menu** button and its panel at ≤720 px (C-1, B-24 as amended); (2) the **theme control** inside the
account menu (B-6). C-1 also carries the phone-width rules written under "The fold" and "Panels and wide
content" below; they are part of the same named exception. Amendment 2 names two more, both behaviour (G-2,
G-3): (3) the **Upcoming work order**: the tracker's legend and each day's stack of bars read most urgent first
(exam, project, quiz, assignment, reading), in `UpcomingTracker.tsx`, W-69, with a test; (4) the **theme
default**: no stored choice means Dark (§Theme mechanism). The shared error notice puts the word "Error" in
front of each boxed error through CSS; it is one of the component changes below, and no string in a TSX file
changes.

The phase is no longer only a token swap (G-2). Two kinds of change reach the screen. A literal replaced by a
token keeps its value. And direction D changes colour, font family and weights, radii and shadows: through the
token values, and through the component-level changes of
`docs/planning/sprint-2/evidence/103_style_tiles/component-changes.json` (55 entries with amendment 2; since
amendment 3 the file holds 106, of which 90 are in scope). The first 55 are which radius, colour or
weight token a rule uses, the shared error-notice form, link underlines, pill buttons, the Upcoming work block
in tile C's shapes, and the course side panel on the panel grey. Each change belongs to the worker who owns the
file it names; the four owner sets do not move (§Component changes by owner). Still out: any layout, spacing or
type-size change, except where amendment 3 names one below.

**Named exceptions of amendment 3** (H-3, H-4; each has its own task and check, and a line in the acceptance
script, as 81:67-69 asks). They continue the numbering above:

* (5) **The frame.** The app shell is exactly the window's height and its panes scroll; the page does not.
  Layout and behaviour. Task 26, §The frame.
* (6) **The desktop shell beyond its background.** The app's bar is the window's title bar; a right-click menu
  in fields; the app's own menu; a page for a load that fails; the update prompt in direction D; and, so the
  bar clears the three window buttons, a wider minimum for the window (default 17). Task 27, §The
  desktop shell.
* (7) **Panels leave.** A menu, a popover, a toast and the popout fade out as they close. Behaviour. Task 29.
* (8) **The side panel and the search field** move by transform and opacity, not width. Motion. Task 30.
* (9) **Marks.** The bell and Sync are redrawn at the weight of the bar's other icons, and the 41 text
  characters used as marks are drawn by inline SVGs. Markup. Task 31.
* (10) **Keyboard polish.** A skip link (new words: "Skip to content"), arrow keys in the account menu, focus
  back to what opened a panel, a toast's timer that waits, drawn labels on five icon buttons. Markup and
  behaviour. Task 32.
* (11) **The app's icon** in direction D. Five image files. Task 33.
* (12) **Captions and codes.** Four how-to lines leave the page's visible text, and Blackboard's attempt
  status is put into words. Copy. Task 34.
* (13) **Larger click targets.** Four targets get a larger hit area. No box moves. Task 36.
* (14) **Busy says busy.** `aria-busy` on a control that is disabled only while it works. Markup. Task 37.

The default build (rows 1 to 16), the type change (task 28), the week strip (task 35) and the Upcoming strip's
scrollbar (task 38) are CSS on rules that exist. They are component changes, in scope under G-2 as amendment 3
extends it (§Component changes by owner), and move no box. One piece of the default build is script: the root
carries `data-theme-switching` for two frames around a theme switch (§Theme mechanism).

Screen inventory (the walk's 31 surfaces; each is shot and ticked in light and in dark, 62 lines). The first
cell is the number and the slug used in shot names and test titles.

| NN | Surface | How the walk reaches it | Sweep |
|---|---|---|---|
| 01 `home` | Home (tracker, today panel, course cards, Undated, needs attention) | `/` | W-69 |
| 02 `planner` | Planner week | `/planner` | W-69 |
| 03 `inbox` | Inbox (the review queue, its default tab) | `/inbox` | W-69 |
| 04 `announcements` | Announcements | `/announcements`; the `mark_announcements_seen` RPC is fulfilled by `guardWrites22` without reaching the database | W-69 |
| 05 `grades` | Grades, all courses (report-card strip, folding class headers) | `/grades` | W-70 |
| 06 `materials` | Materials | `/materials` | W-70 |
| 07 `course-stream` | Course Stream (tracker, "New and changed materials", the week timeline) | `/course/IST.352/stream` (the course with New and Changed material posts) | W-70 with `components/course/`; the tracker is W-69's |
| 08 `course-classwork` | Course Classwork | `/course/IST.471/classwork` | W-70 |
| 09 `course-grades` | Course Grades | `/course/IST.466/grades` (the C-1 page) | W-70 |
| 10 `course-info` | Course Info | `/course/IST.466/info` | W-70 |
| 11 `assignment-page` | Assignment page | `/course/IST.471/assignment/IST.471/a1-proposal` | W-68 (body, `components/popout`) and W-70 (frame) |
| 12 `workspace` | Workspace, one conversation | `/workspace?c=<fixture id>` over intercepted reads of `workspace_conversations`, `workspace_messages`, `workspace_requests` and `v_workspace_status` holding one answered question in sample text; Ask is never pressed | W-70 |
| 13 `login` | Login | `/login`, signed out (the app's session cookies removed from the browser context) | W-67 |
| 14 `privacy` | Privacy | `/privacy` | W-67 |
| 15 `terms` | Terms | `/terms` | W-67 |
| 16 `not-found` | Not found | `/no-such-page` | W-67 |
| 17 `assignment-popout` | Assignment popout | `/course/IST.471/classwork?item=assignment:IST.471/a1-proposal` (`A1_POPOUT`, `web/e2e/walk.ts:22`) | W-68 |
| 18 `session-popout` | Session popout | the pasted URL `/course/IST.466/classwork?view=timeline&item=session:105`, exactly as `web/e2e/item-popout.spec.ts` builds it (`sessionPopoutUrl`, `IST466_SESSION_ID` = 105). It lands on the Stream with the popout open; the spec finds the popout by role `dialog`, because the Stream's own side panel shares its label | W-68 |
| 19 `planner-item-popover` | Planner item popover | `/planner`, click the first due item, paging forward week by week if the week holds none, as `walk17.spec.ts` does | W-69 |
| 20 `planner-event-form` | Planner event form | `/planner`, click an empty slot (a button named `New event, <day>, <time>`); closed without saving | W-69 |
| 21 `series-scope-dialog` | Series scope dialog | `/planner` over an intercepted fixture week holding one series row; cancelled before any write | W-69 |
| 22 `search` | Search (nav icon, field and results popover) | the search icon in the bar, query `syllabus` | W-68 |
| 23 `bell` | Bell dropdown | bell icon; `mark_announcements_seen` fulfilled by `guardWrites22` | W-68 |
| 24 `activity` | Activity dropdown | activity icon | W-68 |
| 25 `account-menu` | Account menu with the theme control | account icon. The desktop build also shows "Update desktop app" | W-68 (menu), W-67 (control) |
| 26 `courses-sidebar` | Courses sidebar | the rail is asserted at 1280 px; the shot is the drawer and its scrim at 800 px | W-68 |
| 27 `nav-menu` | Nav menu (new) | 390 px, Menu open | W-68 |
| 28 `sync-toast` | Sync toast | Sync pressed under `quietSync` (the `agent_requests` GET and POST and the `sync_runs` GET are intercepted). The shot is the one-line note a filing press shows | W-68 |
| 29 `error-notice` | Error notice (the red one) | `/inbox` with its `attention_items` read forced to fail (`coldCache` + `failReads`); the notice is `Inbox.module.css` `.problem` | W-69 |
| 30 `planner-wizard` | Planner new-event wizard | `/planner`, the week header's button named exactly `New event` (`PlannerWeekHeader.tsx:68`). The dialog "New planner event" opens; Next once; then Cancel, and Discard if it asks. Nothing is saved | W-69 (the frame is W-68's `PopoutShell`) |
| 31 `frame-scrolled` | The frame, a long page scrolled to its end (amendment 3, task 26) | `/grades`, then the content pane (the page's one `main` element) is scrolled to its end. The case asserts that the document is as tall as the window and no taller, that the pane's `scrollTop` is above 0, and that the top bar's top edge is still at 0. The shot shows the bar and the side panel where they were and the end of the page under them | W-68 (the frame), W-70 (the page) |

Sweep names the worker whose stylesheet leads; a surface may also draw W-68's `PopoutShell`, `QueryState` or
`Shell.module.css` header. Theme-walk shots are named `NN-<slug>-<theme>.png` for NN 01–31. Since task 26 the
page no longer scrolls, so a plain shot is the window's view, and the inventory names parts that sit below
the first windowful (row 01's course cards, Undated and needs attention; row 05's class headers; row 07's
week timeline). The checker must see them. So before its shot each surface case of rows 01 to 12 makes its
window as tall as the top bar plus the content pane's `scrollHeight`, with `page.setViewportSize` and the
width unchanged, and the shot holds the whole screen. That works before task 26 as well as after it. Rows 13
to 16 still scroll as documents and are shot whole. Rows 17 to 31 are shot in the config's window, 1440 by
900 (`web/e2e/playwright.config.ts:49`); row 31 shows the frame, with the pane scrolled to its end. Titles
and counts do not move (default 15 of amendment 3). The six phone shots
are numbered 40–45. Each of the two specs builds row 12's fixture itself with `walk.ts`'s `fulfillView`; no
fixture file is shared. A row is shot in the state its reach cell names. States that need a live condition are swept
with their file and listed in `WALK.md` as "swept, not shot": the Workspace offline and problem lines, the
scheduler heartbeat and push-failure lines on Home, the Inbox tabs "Answered, not applied" and "Archived", the
Stream's in-page session panel, the staged-upload drop zone, the desktop-only "Update desktop app" row, and the
Sync toast's fallback command block and its close notice.

**The fold (R-46; B-24 as amended).** On `main` the bar is `nav[aria-label="Primary"]`: the brand link
(`span.mark`, `span.brandName`), `span.links` (the six `NAV_LINKS`) and `span.right`, which holds Sync and five
icon buttons in this order: Search, Courses sidebar (☰), Activity, Announcements, Account
(`TopNav.search.test.tsx:97` pins the order). At `max-width: 720px` the bar hides `.links` and shows a text
button "Menu" (never the ☰ glyph, which stays the course-sidebar toggle) with `aria-expanded` and
`aria-controls="primary-nav-menu"`. Menu sits where the links sit, before `.right`. The panel
`#primary-nav-menu` lists the six `NAV_LINKS` in order (Home, Planner, Inbox, Grades, Materials, Workspace), the
active one with `aria-current="page"`, and nothing else. The panel and its links are in the DOM only while Menu
is open: `TopNav.search.test.tsx` finds one "Materials" link and `TopNav.workspace.test.tsx` finds exactly six
links in the nav, and both stay unedited. Amended by amendment 3 (D-3, task 29): where the panel's exit token
reads above 0 the closing panel stays for that one exit, marked `data-leaving`, and is then removed. In jsdom
no stylesheet is loaded, the token cannot be read, and the panel is removed at once, so both tests see what
they see today. Search stays the icon in the bar at every width. Escape closes the
Menu and returns focus to it; an outside click or a pathname change closes it; Menu and the account menu close
each other; ☰ closes Menu; Menu never writes `html[data-sidebar]` or `localStorage['bb2dash.sidebar']`.
`usePopover`, as Phase 17's R-51 left it, closes on an outside mouse press and on Escape and returns no focus.
So `TopNav` calls the other menu's `close()` itself, as ☰ does today (`TopNav.tsx:119-122`), and returns focus
to Menu itself, only while Menu is open. The hook is not reshaped. Amendment 3's focus return (D-4, task 32)
is done the same way: each menu returns focus to its own button, and `usePopover` keeps the shape R-51 gave it.

The ≤720 px strip rules on `.links` (`TopNav.module.css:251-257`: its `gap`, `flex: 0 1 auto`, `min-width: 3em`,
`overflow-x: auto`, `scrollbar-width: none`) are deleted with the fold. The brand word stays as `main` has it:
`span.brandName`, clipped in the `(max-width: 480px)` block (`TopNav.module.css:266-273`). There is no
`.brandWord`.

The Sync label gets a span of its own. At ≤480 px the button shows its icon only: the label text stays in the
DOM (`SyncButton.test.tsx` finds the button by its label) and the span gets `.sr-only`'s declarations
(`globals.css:220-230`, copied, not edited) in a `(max-width: 480px)` block of `SyncButton.module.css`. At
≤1023.98 px the span is capped (a `max-width` with `overflow: hidden` and `text-overflow: ellipsis`), so the
unfolded bar, with search collapsed, is never wider than 900 px, which is the desktop window's minimum on
`main` (`desktop/src/main/window.ts:253`). The full label is the span's `title`. The button's own `title` stays what
`phaseTitle` returns, the sentence that says what the sync is doing: `SyncButton.test.tsx:157`, `:244`, `:458`
and `:464` pin it.

What the 900 px case proves. `bar at 900 longest label` measures a page 900 px wide with search collapsed. The
window's minimum is its outer size (`window.ts` sets no `useContentSize`), so the page inside is narrower by the
frame and by the page scrollbar the shell shows (STATUS, Known issues). The case does not prove the real window.
The PM looks at the real window at its minimum width in acceptance step 5 and records what it shows. W-68 sets
the cap with that in mind: the idle bar is 851 px, so the room is small.

What the case cannot see since task 27 (default 17 of amendment 3). In the desktop app the bar is the title
bar and Windows' three buttons sit on its right end, 138 px wide by the pass's measure. The case runs in a
browser, where `env(titlebar-area-width, 100vw)` falls back and the bar's extra padding is 0. An 851 px bar
plus 138 px is 989 px, and the fold at 720 px never reaches a desktop window, so nothing folds. Task 27
therefore raises the window's minimum width to the idle bar plus the buttons (§The desktop shell, "The
minimum width"), and the PM's look at the real window at that minimum is the proof (acceptance step 5).

Above 720 px the bar renders as today, except for the label cap. A browser window between 721 px and the bar's
idle width may still scroll sideways. That width was 851 px on 2026-10-05, measured on a static rebuild, and up
to 974 px with the longest label before the cap (STATUS, Known issues). Task 5 measures and records it; it is
recorded, not fixed. With the search field open the unfolded bar is wider by the field
(`NavSearch.module.css:8-9`: 240 px, with a 72 px floor): about 923 px at the floor and about 1,091 px at full
width, counted from the measured 851 px; the audit's own estimate was about 1,120 px. These are estimates and no
case measures them. That width is named in §Out of scope and not fixed. At 390 px the bar row is 373 px wide (390
minus two 8.4 px paddings); the mark, Menu, Sync as an icon and the five icons fit in it (audit estimate with
the idle label still shown: about 313 px; tasks 5 and 13 measure).

Between 481 and 720 px the bar is folded and keeps the brand word, and `main`'s rule that hides three icons
while search is open exists only in the `(max-width: 480px)` block. The audit's shell verifier estimated the
folded bar too wide up to about 673 px with search open, and up to about 560 px with a long Sync label before
the cap. No case runs between 391 and 720 px. That band is named in §Out of scope and not fixed.

**Panels and wide content at ≤720 px.** Seven open states, frozen here and counted by task 13, each lie inside
the viewport at 390 px (bounding rect `left ≥ 0`, `right ≤ innerWidth`): (1) Bell `.panel` (`Bell.module.css`),
(2) `.ddActivity` and (3) `.ddUser` with the theme control (`TopNav.module.css`), (4) the nav panel
`#primary-nav-menu`, (5) SyncButton `.toast` and (6) `.toastError` (`SyncButton.module.css`), (7) the NavSearch
pill (`.rootOpen`) and its `.popover` (`NavSearch.module.css`), opened from the search icon with a query typed.
What must be true after tasks 12–13:

* Bell `.panel` and `.ddActivity` are capped at `min(360px, calc(100vw - 28px))` and anchored `right: 0` at
  ≤720 px. The cap alone leaves them 14 px off the left edge at 390 px.
* The Sync toast's positioned box is `.stack`, not `.toast`. It is re-anchored at ≤720 px so that `.toast` and
  `.toastError` lie inside the viewport. State 5 is opened as inventory row 28 is: Sync is pressed under
  `quietSync`, which answers the press. For state 6 the spec answers the `agent_requests` POST with an error
  itself, with a route of its own registered after `quietSync`, so nothing reaches the database.
* With search open at 390 px the nav's `scrollWidth` is ≤ 390. `main` already has the rule for it, in the
  `(max-width: 480px)` block: `.bar:has([data-search='open']) .icToggle ~ * { display: none }`. It does nothing
  today, because the three wrappers it targets carry an inline `style={{ display: 'contents' }}`
  (`TopNav.tsx:138`, `ActivityMenu.tsx:54`, `Bell.tsx:59`). W-68 turns those three inline styles into a class at
  task 13, not task 17, so the rule takes effect. From the rule values the bar is then still about 15 px too
  wide, because `.right` does not shrink (estimate); W-68 closes that in its own files.
* The shell cluster has four `style=` sites: those three and `TopNav.tsx:154` (`padding: 0`), which task 17
  clears.

Task 13 runs before task 10, so its case (3) measures `.ddUser` as W-68's branch renders it then, without the
theme control (W-68 mounts `ThemeMenu` at task 10, which follows task 8). The same case with the control inside
the menu is proven at task 21, on the integrated branch.
`GradebookTable`: one horizontal scroll container around both tables (on `.wrap` or an inner element), nothing on
`th` / `td`. `PlannerWeek`: `.board` keeps `overflow-x: auto` (`planner-css.test.ts:49` unchanged) and loses its
own `min-width`; the 760 px floor at ≤900 px moves onto its grid tracks or an inner element, so the board scrolls
and the page does not. `planner-css.test.ts:36-41` allows no vertical scroller in that stylesheet, so the inner
element may use `overflow-x` only.

The two scroll boxes have frozen hooks, because W-68 writes the spec and may not read a hashed class name. The
gradebook's scroll container carries `data-scroll-box="gradebook"`: W-70 adds the attribute at task 14, on
whichever element it gives `overflow-x`, and the spec reads the first such element on `/course/IST.466/grades`.
The planner's hook is on `main` already: `data-planner-board="true"` (`PlannerBoard.tsx:95`).

Other routes may be too wide at 390 px as well. The audit read the stylesheets only, and it named
`white-space: nowrap` in `CourseSubBar.module.css:54` and `:75` and in `Materials.module.css:34`, `:191` and
`:213`, and `width: max-content` in `InboxCard.module.css:208`, as candidates. Task 5's RED run lists every route
that fails, with its width. Each failing route is fixed by the worker in its inventory row's Sweep cell, in that
worker's own files, as part of the same named exception: rows 01–04 by W-69 at task 15, rows 05–12 by W-70 at
task 14, rows 13–16 by W-67 at task 16, and the bar and its panels by W-68 at tasks 12–13.

`phone-width.spec.ts` has 54 frozen cases (§Task list). Every case uses `guardWrites22`, and every route case
and open-state case runs under `quietSync` idle, so the Sync label is "Sync" whatever production's sync is
doing. The spec asserts widths and positions only. Its themes follow the theme mechanism as amended (G-3): a
`[dark]` case stores nothing, and a `[light]` case puts `light` in `localStorage['bb2dash.theme']` before its
first load, because an emulated light system no longer makes the page light. Nothing reads the key before task
9, so the spec can run before the theme exists; until then both cases render today's dark, and widths are all
it asserts. The spec stores the key itself. No helper is added to `walk22.lib.ts`.

Two things amendment 3 adds to both new specs (H-6; REFINEMENT §11, point 9). Each opens with
`test.use({ reducedMotion: 'reduce' })`, and `e2e/playwright.config.ts` stays unedited. A panel now mounts
see-through and scaled: a 360 px panel anchored right reads left 40.8 at mount and 30 at rest, and
`toBeVisible` passes at opacity 0. Under reduced motion the rect is at rest on the first frame, so a width or a
shot is true. And from task 26 on, each route case of rows 01–12 measures the content pane as well as the page:
the page's one `main` element has `scrollWidth` ≤ `clientWidth`, printed as `pane scrollWidth=<n>` on the case's
line. Once the frame is built the document cannot scroll, so the page's own `scrollWidth` would pass with a
table that is too wide. Rows 13–16 are outside the shell and measure the page, as before. The titles and the
count of 54 do not change.

**Theme mechanism (P-76, P-77, P-78; B-6, as amended by amendment 2, G-3).** Dark is the default.
`THEME_BOOT_SCRIPT`, `THEME_BG`, `THEME_COLOR`, `THEME_STORAGE_KEY` and `resolveTheme` are new exports of the
new module below.

* `html[data-theme]` always holds a resolved value, `light` or `dark`. It is stamped by `THEME_BOOT_SCRIPT` from
  `web/src/lib/theme-preference.ts` (new), inlined as the first child of `<body>` in the **root** layout
  `web/src/app/layout.tsx` (not `(app)/layout.tsx`, or `/login`, `/privacy`, `/terms` and not-found are missed).
  Same shape as `SIDEBAR_BOOT_SCRIPT`: built from compile-time constants, no interpolated input, React never
  renders the attribute. No CSP or nonce exists in `web/`, so the inline script is not blocked.
* `web/test/raw-html.audit.test.ts` allows `dangerouslySetInnerHTML=` in exactly one file today,
  `src/app/(app)/layout.tsx`, and compares every allowed file's use with one string, `ALLOWED_INJECTION`. Adding
  the root layout to the list alone would fail that comparison. So task 9 edits three parts of the file and
  nothing else: the header's sentence on what is allowed (lines 10–14); the allow-list constants (lines 27–31),
  which become one allowed expression per file, `SIDEBAR_BOOT_SCRIPT` for the app layout and `THEME_BOOT_SCRIPT`
  for the root layout; and the two cases that read them (lines 100–110). The scanner, its fixture cases (lines
  74–97) and `OTHER_SINKS` stay as they are. This is the second pre-existing test this phase edits (the first
  is `type-tokens.contrast.test.ts`; no desktop test is edited, G-3), and the test's own header asks for a
  DECISIONS row, which the PR owes.
* Storage: `localStorage['bb2dash.theme']` holds `light` or `auto`. Absent, `dark` or junk means Dark, also when
  the system is light. The key is written only on an explicit Light or Auto pick; picking Dark removes it. A
  throwing read means Dark (the deliberate best-effort of `sidebar-preference.ts`). The boot script never
  writes storage, so a stray `dark` or junk value stays where it is and reads as Dark.
* Auto is a stored choice, never what a first visit gets. With `auto` stored the script resolves
  `matchMedia('(prefers-color-scheme: light)')`: light when it matches, else dark. Where `matchMedia` does not
  exist the script resolves dark and does not throw (jsdom has none, and nothing in `web/test` stubs it; each
  theme test brings its own stub).
* The system-change listener lives in `THEME_BOOT_SCRIPT`, so it runs on every page. It is registered whatever
  is stored, because Auto can be picked after boot, and it keeps listening while `auto` is stored: on a
  `change` of that query the script reads storage again. With `auto` stored it re-stamps the attribute without
  a reload. With anything else it does nothing. It does not live in `ThemeMenu`, which is mounted only while
  the account menu is open and never on the public pages.
* CSS: exactly two theme blocks in `globals.css`, `:root` (dark: what a first visit shows, what a page without
  JavaScript shows, and what a light system shows while nothing is stored) and `:root[data-theme='light']`,
  with `color-scheme: dark` in the first and `color-scheme: light` in the second. No
  `@media (prefers-color-scheme)` copy of either block: the boot script resolves a stored choice before paint,
  and one light block is what the audit and the contrast reader read.
* `ThemeMenu` (new, `web/src/components/shell/ThemeMenu.tsx`): three `menuitemradio` rows in this order, Dark /
  Light / Auto, with `aria-checked`, rendered inside the account menu. Dark is checked while nothing is stored.
  It adds only `menuitemradio` rows: `TopNav.update.test.tsx:76-77` asserts the exact `menuitem` list. On a pick
  it stamps the attribute and writes or removes the key: Dark removes the key, Light writes `light`, Auto writes
  `auto` and stamps what the system says. It reads storage only while the menu is open, which is after
  hydration. ESLint holds `react-hooks/set-state-in-effect` at error (`web/eslint.config.mjs:57-60`), so it
  reads storage through `useSyncExternalStore`, as `ActivityMenu.tsx` does, not through a `setState` in an
  effect.
* `<meta name="theme-color">`: `viewport.themeColor` in the root layout is `THEME_COLOR`, exported by
  `theme-preference.ts`. It is one value, the dark ground (`THEME_BG.dark`), not a two-entry media array: a
  light system with nothing stored shows the dark page. Whenever the page is stamped, every `theme-color`
  meta's content is set to `THEME_BG[resolved]`: by `ThemeMenu` on a pick, and by the boot script on a system
  change while `auto` is stored. The boot script also sets it at boot when it resolves `light`, so a stored
  Light or Auto keeps its bar colour across a reload (default 5 of amendment 2).
* The switch itself has no motion (amendment 3, row 12, entry `theme-switch-instant`). Every control now eases
  its colours, so a switch would ease all of them at once while the page behind them flips. The root carries
  `data-theme-switching` for two frames around a switch, and one rule in `globals.css` turns every transition
  off while it is there. It is set by `ThemeMenu` on a pick and by the boot script's system-change listener,
  and removed two frames later. The boot stamp never sets it: nothing is on screen to ease at boot. No stored
  value and no new export. One case in `ThemeMenu.test.tsx` (task 10) and one in `theme-preference.test.ts`
  (task 9).
* Desktop: `windowBackground()` from `desktop/src/main/window-background.ts` (new) replaces the `'#12131a'`
  literal (`window.ts:256`). It takes no argument and returns the dark `--color-bg` value (new export `DARK`),
  pinned by test to `globals.css`. `nativeTheme` is not read anywhere in `desktop/`, so
  `desktop/test/unit/window.test.ts` is **not edited** and `desktop/test/unit/deeplink.test.ts:16` still loads
  `window.ts` with no electron mock. The window is destroyed on close and built again on every open since
  2026-09-30, and each time it opens on the app's dark ground. A person who picked Light sees one dark frame at
  each open, before the page paints; that is accepted and written down (DECISIONS 2026-10-08). Amendment 3
  (D-1) leaves all of that standing and adds to it: the window's title bar is the app's bar, its three buttons
  follow the page's theme once the page has stamped it, and the update prompt
  (`desktop/src/main/update-prompt.ts`) is redrawn in direction D as a dark page (§The desktop shell, task 27).
  Amendment 2's sentence that the prompt "is not touched" is reversed by D-1.

**Token set rules (R-53; amendment 2, G-5).** Every custom property `main` declares keeps its name. Task 8
writes direction D's values from `docs/planning/sprint-2/evidence/103_style_tiles/direction-d.json`: every name
of its `dark` map into `:root` and every name of its `light` map into `:root[data-theme='light']`, value for
value (125 and 77 names since amendment 3, 107 and 73 before it; the Direction check of §Task list compares
them). New names are allowed in the families `--color-*`, `--shadow-*`, `--text-*`, `--size-*`, `--radius-*`
and `--font-*`, and since amendment 3 (H-2) in `--motion-*` and `--ease-*`, declared in `:root`, and
every `--color-*` / `--shadow-*` is redeclared in the light block (the light block's set of those names equals
the dark block's). D brings 34 new names. Each is declared at task 8 and each is used by a rule once the sweeps
and the new tasks are in (the New names check). The 12 of amendment 2: `--color-panel`, `--color-on-accent`,
`--radius-xs`, `--radius-control`, `--radius-chip`, `--radius-bar`, `--radius-day`, `--shadow-mark`,
`--size-underline`, `--size-underline-mark`, `--size-underline-offset` and `--size-notice-bar`. The 18 of the
default build, all in the JSON's `dark` map: `--motion-press`, `--motion-state`, `--motion-enter`,
`--motion-enter-lg`, `--motion-delay`, `--motion-shift`, `--motion-spin`, `--ease-out`, `--ease-linear`,
`--motion-control`, `--color-scrollbar`, `--color-scrollbar-hover`, `--color-surface-press`, `--shadow-hover`,
`--size-focus`, `--size-focus-gap`, `--size-scrollbar` and `--size-check`. The three exit names D-3 turns on,
which the JSON holds under `tileOnly.dark` (default 8 of amendment 3; the Exit tokens check compares them):
`--motion-exit`, `--motion-exit-lg` and `--ease-in`. And one name that is in no JSON map, declared from this
brief: `--size-target`, 24px, the smallest pointer target (task 36). The names the sweeps need for their size
literals still arrive through the token hand-off (§Workers), beside these 34. The ramps are redefined in light
so a step keeps its distance from the ground (`--color-neutral-100` is the strong end on either ground).

The accent is the ink. `--color-accent` is `var(--color-neutral-100)` in both themes, and the accent steps 100
to 400 and 600 to 900 point at the neutral step of the same number. Red is opt-in: `--color-accent-500` is
`#ff0000` in both themes and a rule is red only when it names that step. On `main` no module names it;
`globals.css` names it once, in `--planner-focus-edge` (line 156), and task 8 writes D's value there. So after
the sweeps the only files that do are the nine the component changes list (task 20 counts them). `#ff0000` is
never text: it is 4.22:1 on the dark card and 4.00:1 on the light one.

Fonts load from the one Google Fonts `@import` at `globals.css:18` (Inter 400, 500, 600 and 700 today). Task 8
changes that URL to D's `fontsHref`: Source Serif 4 at 600, Source Sans 3 at 400, 500, 600 and 700, and Source
Code Pro at 400. Those are the faces Stack saw under B in the walkthrough when he picked its type. No npm font
package and no `next/font`. Font weights change through tokens. Besides `--font-heading-weight` there are 7
literal `font-weight` declarations outside `globals.css`; they become token references in the sweeps:
`tokens.module.css:180` (W-67), `SearchPanel.module.css:108` (W-68), `NeedsAttention.module.css:51` (W-69),
`Materials.module.css:25` and `:137`, `CourseTimeline.module.css:250` and `GradebookTable.module.css:39` (W-70).
Direction D also sets weight 600 on `.btn`, `.dowToday` and the error notice's word, and 700 on `.glyph` and
`.badge` (`component-changes.json`, entry `weights-as-tokens`, which asks the PM to rule). Until he rules, the
rule above stands for them too: they are token references, their `--font-*` names reach W-67 through the
hand-off and its own list, and the Weight check still prints nothing.

A direction does **not** change these values, which hold layout: the seven `--space-*` (1, 2, 3, 4, 6, 8, 12),
`--nav-height`, `--content-max`, `--sidebar-width`, `--sidebar-side`, the seven `--text-*` sizes, the planner
geometry mirrored by `web/src/lib/planner-rows.ts`, and the Stream timeline's pinned widths
(`course-timeline-css.test.ts`). D's maps hold the 18 layout tokens at `main`'s values. The five `--type-*`
pairs are D's urgency scale (§Contrast).

**Type rules (amendment 3, D-2: "Titles and dates").** The faces stay the three he picked. Where each is used
changes, in nine places and no others: six stylesheet rules and three places where a date is set (entry
`labels-in-the-body-face`):

* The serif is for titles. Six rules that set a label or a control in `--font-heading` take `--font-body`:
  `GradebookTable.module.css` `.table thead th` and `GradeModel.module.css` `.table thead th` (W-70);
  `CourseSidebar.module.css` `.head`, `SearchPanel.module.css` `.modeBtn, .modeBtnActive` and
  `SubmissionBlock.module.css` `.attemptNo` (W-68); `PlannerItemPopover.module.css` `.title` (W-69). The
  search modes are weight 600 and the three small-capital heads are weight 500, both as `--font-*` tokens from
  W-67's list, so the Weight check still prints nothing. The other two keep their weight. One of the six
  is a title by its markup: `PlannerItemPopover`'s `.title` is the popover's `h2` and holds the item's name
  (`PlannerItemPopover.tsx:251`; the rule is `PlannerItemPopover.module.css:44-50`, at 12.5px). The pass
  calls it a label and put it on the list he chose from, so it moves to the sans as the pass wrote it. D-2
  says the serif is for titles, so this one is put to him by name: taste call T-7. If he keeps it in the
  serif, the rule leaves this list and the Serif check's own list, W-69's first grep in task 28 goes, and
  the check's target is `7 0 0`.
* Dates and times leave the code face in three places (default 6 of amendment 3): `InboxCard.module.css`
  `.value` takes `--font-body` (W-69); the "seen" stamp loses `tokens.mono` at `GradebookTable.tsx:249` (W-70)
  and at `SubmissionBlock.tsx:185` (W-68). The sha beside it (`SubmissionBlock.tsx:84`) keeps the code face.
* Left as they are, and named so nobody "fixes" them. In the serif under 15px: `ReportCardStrip.module.css`
  `.code`, `CourseClasswork.module.css` `.itemTitle` and `CourseInfo.module.css` `.staffName`, which are titles
  and names. In the code face: the planner's hour labels (`PlannerWeek.module.css` `.hourLabel`), the tracker's
  day numbers (`UpcomingTracker.module.css` `.dateNum`), the meeting-day letters, week numbers, course codes,
  scores, commands and keys.
* No size changes: there is no 11px floor (entry `type-floor`, not chosen), and the fonts stay on the one
  Google Fonts `@import` (entry `fonts-with-the-app`, not chosen).

**Motion (amendment 3; REFINEMENT §5, as contract).** A few quiet, purposeful transitions and no decoration. No
rule outside `globals.css` writes a time, a curve or an easing keyword of its own (the Time check, §Task list).
Two scales stay plain numbers in the rules: 0.98 for a press and 0.97 for a panel.

| Token | Value | For |
|---|---|---|
| `--motion-press` | 80ms | a press |
| `--motion-state` | 120ms | hover, a field in focus, picked, ticked |
| `--motion-enter` | 180ms | a menu, a popover or a toast arriving |
| `--motion-enter-lg` | 240ms | the popout arriving; the drawer sliding in under 1024 px |
| `--motion-delay` | 240ms | the wait before a loading line shows; twice it, the wait before a drawn label |
| `--motion-shift` | 6px | the one distance a panel or the search field travels |
| `--motion-spin` | 900ms | one turn of a progress mark (Sync turns in 1.1s and search in 0.7s on `main`) |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | what arrives, and state changes |
| `--ease-linear` | `linear` | a progress mark |
| `--motion-control` | the one transition list | `transition: var(--motion-control)` on a control |
| `--motion-exit` | 120ms | a menu, a popover or a toast leaving (declared since D-3) |
| `--motion-exit-lg` | 160ms | the popout leaving (declared since D-3) |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | what leaves (declared since D-3) |

Where motion is allowed, and nowhere else:

| Place | What happens | Tokens |
|---|---|---|
| Hover | fill, edge or text colour eases | `--motion-state`, `--ease-out` |
| Press | a pill scales to 0.98; a row takes the active wash; a named text link dims | `--motion-press` |
| Focus | the ring appears at once, with no motion; a field's edge colour eases | `--motion-state`, the edge only |
| A menu or popover | fades in and grows from 0.97 at the corner nearest its trigger; fades and shrinks back as it leaves | `--motion-enter`, `--ease-out`; `--motion-exit`, `--ease-in` |
| The popout | fades in and rises by `--motion-shift` while its scrim fades in; leaves the same way back | `--motion-enter-lg`; `--motion-exit-lg` |
| A toast | fades in and drops by `--motion-shift` from under its control; fades out when it goes. When it goes is the app's own rule: `TOAST_MS`, 15 seconds, and a toast that asks for something stays until dismissed. Since D-4 the timer waits while the pointer or focus is on the toast | `--motion-enter`; `--motion-exit` |
| A loading line | Home's line waits, then fades in once (entry `loading-never-flashes`). The other loading lines are as on `main` | `--motion-delay`, `--motion-enter` |
| The side panel | under 1024 px the drawer slides in by transform, from the side `--sidebar-side` names, and its scrim fades; from 1024 px up the panel switches with no motion (D-3, task 30; default 19 of amendment 3) | `--motion-enter-lg`, `--ease-out` |
| The search field | fades in and moves by `--motion-shift`; Sync steps aside at once (D-3, task 30) | `--motion-enter`, `--ease-out` |
| A progress mark | Sync's arrows while a sync runs, the search ring while it searches: one turn in `--motion-spin` | `--motion-spin`, `--ease-linear` |
| The theme switch; changing page or week; a list reordering; a figure changing | none | |

Rules:

1. What moves, moves by `transform` and `opacity`. Colour is the one other thing that eases. Since task 30
   nothing animates `width`.
2. Leaving is shorter than arriving: two thirds.
3. A panel opens from its trigger and leaves toward it.
4. Nothing loops and nothing decorates. The two progress marks are status, and both stand still under reduced
   motion. The search ring's slow turn for that reader (`NavSearch.module.css:94-96`) is deleted; the word
   "Searching…" stays.
5. One or two things move in a view at most. An error or an empty line never waits and never fades.
6. Under `prefers-reduced-motion: reduce` nothing eases, slides, fades or turns. `globals.css` gains the one
   block that does it. Two things are in that block besides the switch-off: the wait before a loading line is
   kept, with no fade, and the two exit durations are redeclared `0ms`, so a closing panel is removed at once.
7. No state waits for a transition to end. A second press in the middle of one lands in the new state: a panel
   reopened while it leaves is open.
8. The desktop shell runs with hardware acceleration off (`desktop/src/main/index.ts:401`). The motion was
   measured in a test browser. If the popout stutters in the real window, `--motion-enter-lg: 0ms` makes it
   simply there: one token, no rule change (acceptance step 5).

A panel that leaves (D-3, task 29). On `main` a panel is taken out of the page the moment it closes
(`TopNav.tsx:151`, `Bell.tsx:77`, `ActivityMenu.tsx:68`, `SyncButton.tsx:203`). Since task 29 a closing panel
stays for one exit, carries `data-leaving`, and is then removed. The time is read from the panel's own computed
`--motion-exit` (the popout: `--motion-exit-lg`), never written in script. Where that reads 0 or cannot be
read, the panel is removed at once: under reduced motion, by rule 6, and in jsdom, which loads no stylesheet.
That is why no pre-existing test changes. The panels that leave are the six of row 26 and the phone Menu: the
account menu, Bell, Activity, the search popover, the Sync toast and the popout. The popout leaves where
`ItemPopout` hosts it, which is W-68's file: the assignment and session popouts. `PopoutShell` has two more
hosts in W-69's files, the planner's event form (`PlannerEventForm.tsx:128`) and its new-event wizard
(`PlannerEventWizard.tsx:123`); their parent drops the frame at once, so they close at once (default 18 of
amendment 3). The frame never waits before it calls `onClose`: rule 7. The planner's item popover and the
Inbox apply panel arrive (row 9) and do not leave with motion either. Those four are put to him: taste call
T-8.

The drawer's side (task 30, default 19 of amendment 3). The side panel's side is one token,
`--sidebar-side` (`globals.css:107`, `row-reverse` today), read as a flex direction by the shell row, the
drawer wrapper and the rail's hairline (DECISIONS 2026-09-14). A slide by `transform` also has a side, and
a transform needs a sign that no token carries: a new `--sidebar-*` name is in none of the eight families.
So the closed drawer's offset is written in `CourseSidebar.module.css` for today's side, `translateX(100%)`,
and `shell-motion.css.test.ts` holds one case that reads `--sidebar-side` from `globals.css` and fails when
the sign does not match it: `row` is -100% and `row-reverse` is 100%. Moving the side is then the token and
that one sign, in one commit, and the test says so when one is forgotten.

**Token audit (P-15, P-16).** A hand-rolled vitest scan (D-19 rules out stylelint, postcss and css-tree; none is
a direct dependency of `web/`, and postcss and css-tree, present in `web/package-lock.json` only transitively,
are not imported). Scope: every file under `web/src` ending `.css`, `.module.css`, `.ts` or `.tsx`, except
`web/src/app/globals.css`. `tokens.module.css` **is audited**: the PM's record of Stack's answer (70 §1.8,
"recorded verbatim in intent"; 81:17-19) says "outside `globals.css`"; 81:44-45 adds `tokens.module.css` as a
second exemption that the answer does not contain, so it is dropped. Per file it counts:

1. colour literals in declaration values: `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`,
   `lch()`, `oklab()`, `oklch()` and CSS named colours such as `white` (the keywords `transparent`,
   `currentColor`, `inherit`, `initial`, `unset` and `revert` are not counted); in `.ts` / `.tsx`, a string
   literal that is a colour (on `main` exactly one: `layout.tsx:12`'s `'#161826'`);
2. every `color-mix(` outside `globals.css` (a tint is a colour the token set does not name);
3. size literals, `<number>px` or `<number>rem`, in a declaration value (custom-property declarations in a
   module included, e.g. `--planner-gutter: 62px`), unless allowlisted;
4. TSX `style=` keys that are not custom properties. Custom-property keys count 0, in both spellings `main` uses:
   `'--x'` and the computed `['--x' as string]` (`PlannerBoard.tsx:97`, `:252`). A `style={name}` whose `name` is
   a `const` object literal in the same file (`PlannerBoard.tsx:377` `style`, `:389` `body`) is scanned as that
   literal; any other `style={expression}` counts 1;
5. unresolved references: a `var(--x)` whose name is declared nowhere (`globals.css`, the same module, or a TSX
   style key). This is 81's "undefined custom property" pass; it is **0 on `main` today** (1,659 references
   outside comments: 1,652 in CSS and 7 in TSX) and must stay 0.

Comments are never counted, in CSS or in TypeScript: `web/src/lib/planner-rows.ts:5` holds `var(--slot)` inside
a JSDoc comment and counts 0. Imperative writes (`element.style.x = …`, today only `InboxCard.tsx:75-76`, a
measured height) are outside the audit's scope, and task 1 says so in the test.

Allowlist, frozen at task 2 in `web/test/token-audit.allowlist.ts` (new) and not edited after:
**A1** `@media` width conditions use a value from {480px, 620px, 640px, 720px, 760px, 820px, 900px, 1023.98px}
(the 17 width queries on `main`; custom properties cannot sit in a media condition without a PostCSS
dependency); any other value fails. One named `@container` entry: 600px in
`web/src/components/course/CourseTimeline.module.css`; any other `@container` width fails.
**A2** the values `1px` and `2px`, with or without a leading minus (27 signed ones in non-token modules on
`main`, and the `.sr-only` declarations the Sync label copies at task 12), in any property (hairlines, outlines,
nudges).
**A3** a declaration that a test pins or a TS constant mirrors, one entry each as (file, selector, property,
value, reason), of two kinds. A *constant-backed* entry names an exported constant; the allowlist test imports
it and compares. A *source-backed* entry names a test or source line and a regex; the allowlist test reads that
line and matches it. The second kind is for a private constant or a pin that is itself a regex in a test. No
export is added to `planner-rows.ts`.

The unit is the declaration. An A3 entry covers the whole value of the named declaration as it stands at task 2:
every literal in that value counts 0, the part no test pins included (the `72px` label track beside the lane
floors, the `5px` beside `.block`'s mirrored `3px`), and the sweep leaves the declaration as it is. A value that
changes makes its entry stale and fails the test. Entries known today, nine declarations:

* `PlannerWeek.module.css` `.board` `--planner-slot: 24px` (constant-backed, `PLANNER_BASE_SLOT_PX` = 24);
  `.block` `line-height: 14px` (constant-backed, `PLANNER_BLOCK_LINE_PX` = 14; `planner-css.test.ts:128` pins it
  too); `.block` `padding: 3px 5px` (constant-backed: top + bottom = `PLANNER_BLOCK_PADDING_PX` = 6); the three
  constants are exported by `web/src/lib/planner-rows.ts`;
* `PlannerWeek.module.css` `.chip` `padding: 3px 5px` (:549). No test pins it and no constant mirrors it. It is
  in A3 by ruling F-5, because it repeats `.block`'s box (the stylesheet's own comment at :540-542: a band chip
  is "the same content as a grid block"). It is source-backed against `.block`'s declaration in the same file
  (:312, regex `padding:\s*3px 5px;`), so the two paddings stay equal;
* `StatusSelect.module.css` `.statusSelect` `padding: 3px 6px` (:13; source-backed: `STATUS_SELECT_PX`, private,
  `planner-rows.ts:75`);
* `UpcomingTracker.module.css` `.barArea` `height: 120px` (source-backed: `BAR_AREA_PX`, private,
  `UpcomingTracker.tsx:118`);
* what `course-timeline-css.test.ts` pins in `CourseTimeline.module.css`, three declarations, each
  source-backed against that test: `.laneHead` `grid-template-columns: 72px minmax(240px, 1fr) minmax(240px, 1fr)`
  (:113) and `.weekRow`'s, the same value (:170), for their two lane floors (test lines 36–45); and `.asgRow`
  `grid-template-columns: 32px minmax(0, 1fr) minmax(7.5rem, 9rem)` (:527; test line 66).

W-67 adds every further pinned or mirrored declaration it finds at task 2 as an A3 entry, in the task-2 commit,
and lists it in `103_W67_VERIFICATION.md`. After task 2 the file is not edited.
**A4** the hexes of `THEME_BG` / `THEME_COLOR` in `web/src/lib/theme-preference.ts`, pinned equal to the two
`--color-bg` values. A4 is written at task 2 as a rule, not as values: in that one file, a hex equal to either
theme block's `--color-bg`, read from `globals.css` when the test runs, counts 0. The file is created at task 9
and the light `--color-bg` at task 8; the rule's case passes while the file does not exist,
so the allowlist is not edited when they arrive.
**A5** TSX inline style keys that a pre-existing test asserts on: `PlannerWeek.tsx`'s `height` key
(`PlannerWeek.hydration.test.tsx:112`) and `CourseClasswork.tsx`'s `marginLeft` key
(`CourseClasswork.test.tsx:71`). They count 0.

The ratchet: per-file counts live in `web/test/token-audit.baseline/` (new), one JSON per cluster (`foundation`,
`shell`, `screens-a`, `screens-b`), and a cluster map of path prefixes in `web/test/token-audit.test.ts`. The
prefixes follow the owner sets under §Files (`foundation` = W-67's paths plus `web/src/lib/` and
`web/src/proxy.ts`, `shell` = W-68's, `screens-a` = W-69's, `screens-b` = W-70's). Every `.css`, `.ts` and
`.tsx` file under `web/src` belongs to exactly one cluster: 233 files today, 90 in `foundation` (80 of them under
`web/src/lib/`; `globals.css` is one, and the scan skips it), 31 in `shell`, 46 in `screens-a`, 66 in
`screens-b`. The map is longest match, so a file under two prefixes belongs to the longer one. W-67 writes
`web/src/components/shell/ThemeMenu.` → `foundation` at task 1, ahead of `web/src/components/shell/` → `shell`,
so the two `ThemeMenu.*` files join `foundation` when task 10 creates them. The eight top-level files of
`web/src/app/(app)/` are exact-file entries: `Shell.module.css` and `layout.tsx` → `shell`, the other six →
`screens-a`. The test fails when a file's count is above its baseline, when it is below it (a
stale baseline is lowered in the same commit), when a scanned file belongs to no cluster or to two prefixes of
equal length, or when unresolved references are above 0.

The baseline before the tokens exist. Tasks 12–15 run before task 8 names any `--size-*` token, and the Contract
orders rules there that add size literals: the panel cap `min(360px, calc(100vw - 28px))`, the label cap, the
`.stack` re-anchor, the Menu's own rules, the planner floor on its new element. In tasks 12–15 only, a rule this
Contract names may add size literals. The worker sets its own baseline JSON to the file's new count in the same
commit, up or down, names each added literal in the commit message and in its verification file, and lists it in
its "Tokens my sweep needs" table. Its sweep (tasks 17–19) brings the file to 0. Nothing else raises a baseline
except the PM's re-baseline when `main` moves (§Seams). Each of tasks 12–15 ends with
`cd web && npx vitest run test/token-audit.test.ts` → 0 failures, so a count that left its baseline shows at once.

The audit runs in `npm test` (`vitest run`, whose `include` is
`test/**/*.test.{ts,tsx}`). bb2dash has no CI workflow (no `.github/` on `main`) and v3 D-20 declines "a registry
or CI" (Phase 14's P-50 narrows that to image registry and image-build CI, which adds none here), so `npm test`
is where it fails; that settles 81:34 ("fails the build") and 81:58 ("runs in CI").

What amendment 3 asks of the audit (H-2; REFINEMENT §11, points 7 and 8). The allowlist stays frozen and the
scanner is not edited. No row of the default build and no new task adds a `color-mix()` or a size literal to a
module: a pressed course card takes the token `--color-surface-press`, declared in `globals.css`, which the
scan skips; a planner event's hover edge names the block's own edge colour and a size token; a 24 px target
names `--size-target`. Row 5 takes one mix out of `UpcomingTracker.module.css`, and W-69 lowers its baseline in
that commit. A time is not something the audit counts, so a second named command holds it: the **Time check**
(§Task list) prints nothing when no time literal, no `cubic-bezier(` or `steps(`, and no easing keyword in a
transition or animation value is left in a stylesheet outside `globals.css`. A timer in script is not style
and is not counted. Run as written on today's tree (6bcac9d, 2026-10-08) it prints six lines, all W-68's:
`CourseSidebar.module.css:31` and `:163`, `NavSearch.module.css:55`, `:82` and `:95`, and
`SyncButton.module.css:45`. Row 16 takes them to none. Each sweep runs it over its own paths and task 20 over
all of `web/src`.

**Contrast (P-17; the type-colour rule as amended by amendment 2, G-4).** `web/test/css-tokens.ts` (new) reads
`globals.css` into one map per selector; the light map is the dark map overlaid by the light block. It follows
`var()` chains and resolves one level of `color-mix(in srgb, A p%, B)` where B is a colour or `transparent`,
composited over the ground a pair names.

Work-type colours are one urgency scale, not five unrelated hues. `type-tokens.contrast.test.ts` has six
assertions on `main`. At task 3 all six run per block through the new reader, on today's values, the light
ground being the light block's `--color-surface` instead of the `'#ffffff'` stand-in. At task 8 the first two
stay: "declares a bg and an fg for all five categories", and "the glyph letter is readable on its chip"
(≥ 4.5). The other four go: the segment on a dark card, the segment on a light card, every pair dE ≥ 30, and
the chroma spread. In their place the test holds the designer's rule, quoted from the designer's final report
of 2026-10-08:

> In each theme, against that theme's card and its picked-day fill: exam is #ff0000 (`--color-accent-500`). Project is a second red: chroma at least 40, hue within 15 degrees of exam, chroma no higher than exam, dE at least 30 from exam. Quiz, assignment and reading are greys (chroma at most 5), each with less contrast against the card than the one before, neighbours at least 20 L* apart. Every pair of the five differs by dE at least 20. Every bar is at least 3:1 on both grounds and every chip letter at least 4.5:1.

It is measured per theme. The card is that block's `--color-surface`. The picked-day fill is that block's
`--color-neutral-900`, which is what `.daySelected`'s `var(--color-accent-900)` resolves to in direction D.
Chroma, hue and L* are CIELAB's and dE is CIE76, as the test computes them today. The order clause runs inside
the three greys: quiz, then assignment, then reading. The numbers are `direction-d.json`'s `typeScale`. D's
values pass, measured from the JSON on 2026-10-08: project to exam dE 37.2 in dark and 33.8 in light; grey
steps 26.3 and 22.5 L* in dark, 25.5 and 23.0 in light; smallest pair dE 22.5; lowest bar 3.93 on the dark
card, 3.53 on the dark picked day, 3.95 on the light card and 3.43 on the light picked day; lowest chip letter
4.89. The old pair rule cannot hold for greys: on the dark card a grey reaches 3:1 only from L* 43.8 up, which
leaves less than 30 a step. The rule replaces Phase 12b's five-hue rule (brief 80c, P-home-1 and H-1); the
DECISIONS row of 2026-10-08 records it, and the test's header comment and the comment over the `--type-*`
tokens in `globals.css` are rewritten with it.

`theme-contrast.test.ts` (new) holds the frozen pair list, 38 pairs, measured in both blocks. Amendment 2
leaves the list as it is, and direction D passes it: measured from the JSON on 2026-10-08, 0 of 38 fail in
either block (lowest text pair 4.89 in dark and 5.25 in light; lowest non-text pair 3.93 and 3.95). The list:

* Text, ≥ 4.5:1 (32 pairs): `--color-text` on `--color-bg` and on `--color-surface`; `--color-muted` on both;
  `--color-accent` on both; `--color-danger` on `--color-surface`; `--color-danger` on `--color-danger-bg` over
  `--color-surface` (3.94 today); `--color-neutral-300`, `-400`, `-500` and `-600` on `--color-surface` (`-600`
  is 3.52 today); `--color-accent-100` on `--color-accent-800` (the badge); each `--planner-<kind>-fg` on its
  `--planner-<kind>-bg` over `--color-surface` (six kinds); each `--type-<cat>-fg` on its `--type-<cat>-bg` (five
  categories); and the eight the audit found unmeasured: `--color-accent-200`, `--color-accent-300`,
  `--color-accent-2`, `--color-neutral-200`, `--color-accent-2-100` and `--color-neutral-100`, each on
  `--color-surface`, and `--color-accent-400` (`a:hover`, `globals.css:212`) on `--color-bg` and on
  `--color-surface`.
* Non-text, ≥ 3:1 (6 pairs): each `--type-<cat>-bg` on `--color-surface`; `--color-accent` on `--color-bg` (focus
  ring, active-link underline).

**Layout tests that stay green unedited, where they bind.** `web/test/Workspace.layout.test.tsx` and
`web/e2e/workspace-layout.spec.ts`: W-70 adds, renames or removes no `.module.css` in
`web/src/components/workspace/` and keeps `.column`'s `position` and `overflow-y`; W-67 adds no scrolling class
to `globals.css` without a `position`. `web/test/course-timeline-css.test.ts`: W-70 keeps the pinned tracks and
the 600 px container step (A1, A3). `web/test/upcoming-tracker-css.test.ts`: its first case stays as it is and
`.tracker` never hides its scrollbar; its second case is one of the five pre-existing tests amendment 3 lets a
worker edit (H-5, row 34, task 38). `web/test/NavSearch.css.test.ts`: W-68 adds no chained
`composes` and no CSS `order` on `.field` or `.spinner`. `web/test/planner-css.test.ts`: W-69 leaves `.block`'s
`overflow`, `padding` and `line-height` alone (A3), also in task 36. `web/test/status-vocabulary.test.ts`: no
screen spells a status by replacing underscores, also in task 34.

**The frame (amendment 3, D-1, named exception 5; task 26; entry `app-frame-panes`).** On `main` the whole
document scrolls, bar and all: `.shell` is `min-height: 100dvh` (`Shell.module.css:2`), the bar is
`position: sticky` (`TopNav.module.css:5`), the side panel is sticky under it
(`CourseSidebar.module.css:21-23`), and the shell is 1 px taller than its window on every screen (STATUS, Known
issues). After task 26:

* `.shell` is exactly the window's height (`height: 100dvh`). The bar is not sticky: it is the first row of the
  frame and keeps its `z-index`, so its panels still paint over the page.
* `.main` scrolls by itself: `overflow-y: auto`, `scrollbar-gutter: stable` (H-5, row 35: the panes carry the
  gutter, and `html` gets no such line), `overscroll-behavior: contain`, and a `position`, so an absolutely
  placed label inside it is contained by it (the rule `Workspace.layout.test.tsx` holds for the message
  column). The side panel fills the body's height and its list scrolls alone; the rail loses its `sticky`,
  `top` and `height: calc(100dvh - var(--nav-height))`. Its drawer mode under 1024 px is as on `main`.
* The frame holds at every width, the phone's included (default 15 of amendment 3).
* The document no longer scrolls on a page inside the shell: `document.documentElement.scrollHeight` equals
  `window.innerHeight`. That ends the 1 px. `/login`, `/privacy`, `/terms` and not-found are outside the shell
  and scroll as documents, as on `main`.
* Back and Forward. A browser restores a document's scroll position, not a pane's. So the shell keeps the
  pane's `scrollTop` per history entry and puts it back on Back and Forward; a new page starts at 0. It is kept
  in memory or `sessionStorage`, never in `localStorage`, and nothing is written to the database. New module
  and test: `web/src/components/shell/usePaneScroll.ts`, `web/test/pane-scroll.test.tsx` (W-68).
* Two lines follow in other workers' files. `html`'s `scroll-padding-top` (row 15) goes from `globals.css`
  (W-67): no bar lies over a scrolling page any more. `CourseTimeline.module.css:29` drops `--nav-height` from
  the week rail's `top` (W-70): the pane starts under the bar. The Inbox footer
  (`Inbox.module.css:82`, sticky at the bottom) needs no edit: it sticks to the pane.
* The walk. Inventory row 31 is the frame's own surface. The phone-width route cases measure the pane (§Panels
  and wide content). Every layout test and both walks are run again after this task, which is why it sits
  after the sweeps (§Workers).

**The desktop shell (amendment 3, D-1, named exception 6; task 27; entries `desktop-title-bar` and
`desktop-shell-details`).** On `main` the window has Windows' own title bar above the app's bar, Electron's
default menu one key away (`window.ts:258-261`), no right-click menu, and a blank window when a load fails
(`window.ts:211-213`). After task 27, in W-67's files:

* **The title bar.** `createWindow` (`window.ts:251-264`) adds `titleBarStyle: 'hidden'` and a
  `titleBarOverlay` of colour, symbol colour and height. Windows keeps its own three buttons and draws them in
  the app's colours. `autoHideMenuBar: true` and `backgroundColor: windowBackground()` stay. The values come
  from a new pure module, `desktop/src/main/title-bar.ts`: per theme the bar's fill (`--color-surface`) and its
  ink (`--color-text`), and the height (`--nav-height`, 52), each pinned to `globals.css` by
  `desktop/test/unit/title-bar.test.ts`, the way `window-background.test.ts` pins `DARK`.
  `window-background.ts` gains the light ground, `LIGHT`, so main can tell which theme a colour belongs to.
* **The minimum width** (default 17 of amendment 3). The three buttons take room the bar did not have to
  give. `title-bar.ts` exports three numbers: `CONTROLS_WIDTH`, 138, the buttons' width by the pass's
  measure (REFINEMENT §8); `BAR_IDLE_WIDTH`, the `nav scrollWidth` that task 26's phone-width run prints for
  `unfolded bar at 721` (851 on 2026-10-05, before direction D's fonts; W-67 reads the number from
  `103_W68_VERIFICATION.md`); and `MIN_WIDTH`, their sum rounded up to the next 10, about 990. `createWindow`
  sets `minWidth: MIN_WIDTH` where `main` has 900 (`window.ts:253`); `minHeight` stays 600.
  `title-bar.test.ts` pins the sum and the rounding, and `chrome.spec.ts` reads the live window's minimum.
  No pre-existing desktop test names `minWidth`. A window size saved under the old minimum can be narrower
  than the new one, and `createWindow` opens on the saved bounds (`window.ts:252`): a saved width under
  `MIN_WIDTH` is widened to it before it is used, by a pure function of `title-bar.ts` with a case in
  `title-bar.test.ts`. The new minimum guarantees
  the idle bar with search collapsed, and no more. While a sync runs a long Sync
  label can still make the bar wider than the room the buttons leave, in a window under about 1,038 px
  while the label is capped and under about 1,112 px from 1,024 px on, where the cap ends: named in
  §Out of scope, not fixed. If the PM's look finds the buttons wider than 138 px or the idle bar cut at the
  minimum, that goes back to W-67 as a finding before the PR (acceptance step 5).
* **The theme.** The overlay is built in the dark bar's colours (G-3: the window opens dark). `createWindow`
  listens to `webContents` `did-change-theme-color`, which fires with the page's `theme-color`, and calls
  `setTitleBarOverlay` with that theme's colours: `LIGHT` means light, anything else dark. The two colours
  are compared without regard to case or to white space around them: the page writes its hexes in lower
  case, Electron may hand the colour back in upper case, and no Electron binary was at hand to see which
  (REFINEMENT §11, point 10). A plain string comparison could leave the buttons dark on a light bar with
  every test green. The page already
  rewrites that meta at boot, on a pick and on a system change (§Theme mechanism). There is no new IPC call:
  `preload.test.ts:41-47` allows the page one, and it stays one.
* **In the page.** `TopNav.module.css` `.bar` is the drag region (`app-region: drag`), and its right padding
  clears the three buttons through `env(titlebar-area-width, 100vw)`, which falls back in a browser. No
  `data-desktop` hook (W-68). Electron's drag regions ignore stacking: a layer drawn over a drag region does
  not get the mouse there unless it is marked `no-drag`. Three rules follow, all in W-68's shell stylesheets.
  The bar's controls are `no-drag`. Every panel that opens from the bar is `no-drag` too (the menus, the
  toast, the search popover): each starts inside the bar's 52 px. And while a dialog with
  `aria-modal="true"` is open the bar itself is `no-drag`, by one rule in `TopNav.module.css`
  (`:global(body:has([aria-modal='true'])) .bar`): the popout's backdrop is `position: fixed; inset: 0`
  (`Popout.module.css:7-13`) and its close button sits about 34 px down, inside the strip
  (`PopoutShell.tsx:88-90`), and the series scope dialog is a second fixed layer over the bar
  (`PlannerSeriesScopeDialog.module.css:8-11`). Both say `aria-modal`, so the one rule covers both and W-69
  edits nothing. The pages with no bar get a drag strip in `globals.css`, as tall as
  `env(titlebar-area-height, 0px)`, so a browser draws nothing (W-67). The strip is the first box of `body`
  (`body::before`), never a box after the page's content: a drag region that comes later in the page would
  cover the bar's `no-drag` controls again.
* **The right-click menu.** New module `desktop/src/main/context-menu.ts`: in a field, Cut, Copy, Paste and
  Select all; on a selection outside a field, Copy; elsewhere, no menu. Role items only. Its template is a pure
  function with a test of its own.
* **The app's own menu.** New module `desktop/src/main/app-menu.ts`: a built menu, never `null`, that holds
  Reload, Force reload, the developer tools, Minimise and Close, as role items. No File, Edit or Help. No zoom
  items: zoomed, the bar is no longer 52 window pixels and the three buttons stop matching it (default; taste
  call T-6). No Quit: the tray's Quit stays the only full exit (`index.ts:11-14`). It is installed on the
  app's `ready` event, registered in `bootstrap()`.
* **A load that fails.** New module `desktop/src/main/load-failed.ts`: a dark page in direction D with one
  sentence and one Retry link to the app's address, shown when the main frame fails to load. It has a drag
  strip, a CSP of `default-src 'none'` with inline style only, and no script. `needsReload`
  (`window.ts:146-153`) also answers true while the window shows it, so the backoff, the tray's Open and the
  session reader behave as on `main`. The retry schedule of `attachLoader` does not change. An aborted load
  is not a failed load. Chromium aborts a load whenever something supersedes it, the app's own redirect
  included, and `desktop/src/main/deeplink.ts:41-52` already treats that as benign (`isBenignLoadFailure`:
  `ERR_ABORTED`, code -3). So the page is shown only from `did-fail-load`, only for the main frame, and only
  when the code is not -3. The rule is one pure function of `load-failed.ts`, `showsLoadFailed(errorCode,
  isMainFrame)`, with its cases in `shell-pages.test.ts`. Without it the page could replace one that did
  load: a toast click loads a route over a live window (`index.ts:308-313`), and a stopped navigation leaves
  the page where it was.
* **The update prompt.** `update-prompt.ts` keeps its mechanism and its words and is redrawn in direction D:
  the dark ground, a filled ink pill for Update now, grey pills for the rest, no blue (`#4f6bed` on `main`,
  line 47). It stays a dark page whatever the theme. Its CSP allows no web font, so it and the failed-load page
  keep the system face.
* **Every colour pinned.** Each hex in the prompt's page and in the failed-load page is a value the dark block
  of `globals.css` declares, and neither holds `#ff0000` (`desktop/test/unit/shell-pages.test.ts`, new).

Pre-existing desktop tests that bind, and what must stay true. None is edited:

* `test/e2e/shell.spec.ts:79-89` reads the live window: `autoHideMenuBar` is true and
  `Menu.getApplicationMenu()` is not `null`. The option stays and a menu is always installed.
* `test/e2e/shell.spec.ts:66-77` compares the recorded `window-preferences` event with exactly six keys, and
  `createWindow` records that event from `WEB_PREFERENCES` alone (`window.ts:266`). `chrome.spec.ts` needs
  the window to record the options it was built with. They are recorded under a new kind,
  `window-chrome`, and never added to `window-preferences`.
* `test/e2e/shell.spec.ts:237-247` and `:273-283` stop a navigation and expect the page to stay on the
  fixture, and `test/e2e/notifications.spec.ts:145` loads a route over a live window by a toast click. None
  of the three may end on the failed-load page: an aborted load (code -3) never shows it.
* `test/unit/window.test.ts` runs the real `window.ts` over an `electron` mock that holds `BrowserWindow`,
  `screen` and `app.getPath` only (lines 32-92), and a `webContents` with `loadURL`, `on`, `isCrashed`, `getURL`
  and `session`. So `createWindow` may add options and listeners, and may call `Menu`, `setTitleBarOverlay` or
  anything else new only inside a listener. Lines 189-201 count five `loadURL` calls after the backoff "and
  then silence": the failed-load page is therefore shown from `did-fail-load`, which that mock never fires, and
  not by one more call in the loader. Lines 249-275 hold `needsReload`'s four answers. Line 326 holds
  `autoHideMenuBar`.
* `test/unit/deeplink.test.ts:16` imports `window.ts` with no `electron` mock at all. Nothing new runs when
  `window.ts`, or a module it imports, is loaded.
* `test/unit/gpu-off.test.ts:11-28` imports `index.ts` over a mock whose `Menu` is an empty object and whose
  `whenReady` never resolves. Nothing new runs at import, and `app.disableHardwareAcceleration()` still comes
  before `whenReady` (lines 38-43).
* `test/unit/sync-launcher.test.ts` runs `start()` over a mock with no `Menu` (line 42), a `./window` mock of
  six exports (lines 111-118), and a window whose `webContents` has only `on` and `once` (lines 120-125). So
  `start()` and `wireWindow()` call nothing new, `index.ts` takes no new name from `./window`, the menu is
  installed from an `app.on('ready', …)` listener, which that mock's `on` never runs, and the
  `did-finish-load` handler (`index.ts:237`) stays as it is: line 187 fires it on that bare window. One thing
  follows and is accepted: when the failed-load page finishes loading, that handler runs the poller's
  after-load hook once more.
* `test/unit/update-prompt.test.ts:88-128`: the five labels, the CSP, the sandboxed window with no preload,
  the `data:` page, the four answers. Its mock holds `BrowserWindow` only (line 52).
* `test/unit/preload.test.ts:41-47`: one IPC call. `test/unit/audit.test.ts`: no excluded API, only
  `BB2DASH_*` variables, `shell.openExternal` in two files. `test/unit/core-portability.test.ts`: nothing
  under `core/` imports Electron, so the new modules live in `src/main/`.

`desktop/vitest.config.mts` is not edited: its coverage `include` is a fixed list, and each new module is
proven by its own test, as `window-background.ts` is. `desktop/package.json` is not edited: `npm run icons`
exists, and the mark's script is run with `node`.

**The smaller decisions (amendment 3, D-3 to D-5 and H-5).** Each is one task of §Task list. What the contract
fixes for each:

* **Marks (task 31, named exception 9).** `icons.tsx` draws the bell at the regular weight and Sync as two
  circling arrows on the 256 grid, turning about its centre as on `main`; `SyncButton.tsx`'s own 24-grid icon
  goes. Five marks join `icons.tsx` at the same weight: caret right, caret down, caret left, close, arrow up
  right, drawn by one exported component, `Mark`. No package. The 41 characters in 20 TSX files (the Mark characters command lists what it counts) are
  drawn by those marks. Each mark keeps its character as text, clipped as `.sr-only` is, with the SVG
  `aria-hidden`, and it sits inside the wrapper the character has today. So every accessible name and every
  text content is what it was (default 2): a character a reader hears today is still heard, and a caret
  that is `aria-hidden` today stays hidden. Home's fold caret is one (`Today.tsx:325-327`):
  `TodayLayout.test.tsx:374` and `web/e2e/harness.spec.ts:33` read its button by a name that begins
  `Undated`, so the caret may not join that name. A right arrow
  after a link's words is drawn as the caret right. D-3 did not choose small icons beside rows and actions, so
  no new mark is added anywhere a character does not stand today. Seven more of these characters reach the
  page inside a string from a `.ts` file, which the pass did not count: `lib/queries.grades.ts:627`
  (`STAGED_LABEL`), `lib/queries.materials.ts:529`, `:548` and `:559`, `lib/sync-request-phase.ts:115`, and
  `components/inbox/inbox-row.ts:166` and `:168`. The strings do not change: tests and `web/e2e/walk.ts:19`
  read them. Where such a label is rendered, a second export of `icons.tsx`, `MarkedLabel`, draws its last
  character as the same mark, so a typed arrow does not sit beside a drawn one. They are rendered in five
  files: `SubmissionBlock.tsx` and `SyncButton.tsx` (W-68), `InboxCard.tsx` (W-69), `FileOpenAction.tsx`
  and `MaterialsBrowser.tsx` (W-70). The arrow inside a score
  history (`lib/grade-model-format.ts:78`) is a word in a sentence, not a mark, and stays text. (The review
  of the amendment corrected these eight line numbers: the first ones were counted with comments stripped.)
  Two cases the review added:
  * **A label held as a string in a TSX file.** Four of the 41 are such: `CourseStream.tsx:140` and `:141`
    (`OPEN_LINK_LABEL`, `OPEN_IN_BLACKBOARD_LABEL`), `Inbox.tsx:270` (`InboxLink`'s default label) and
    `FileOpenAction.tsx:120` (the fallback beside `action`). `course-stream.history.test.tsx:377-413`
    compares `contentPostLink`'s label with `'Open ↗'` and `'Open in Blackboard ↗'`, and `:261-263` reads
    the link's text content. So such a string keeps its value. It takes its character from a third export
    of `icons.tsx`, `MARK_CHAR`, a constant that holds the six characters by name (caret right, caret down,
    caret left, close, arrow up right, arrow right), and it is drawn through `MarkedLabel`. The character
    then stands in `icons.tsx` alone, which the Mark characters command leaves out.
  * **The one label that stays typed.** `SubmissionBlock.tsx:98` draws `STAGED_LABEL` as a plain `span`
    when the course has no Blackboard link, and `SubmissionBlock.test.tsx:265` finds it with `getByText`,
    which reads one element's own text. A clipped child would split it. That span keeps its typed arrow;
    the link beside it (`:88-96`) is drawn through `MarkedLabel`. It is named in `WALK.md` under "Known,
    not this phase".
* **Keyboard polish (task 32, named exception 10).** "Skip to content" is the first Tab stop inside the shell,
  shown only on focus, and moves focus to the content pane (`(app)/layout.tsx`, `Shell.module.css`). The
  account menu acts as a menu: opening it puts focus on its first row; Down and Up move between rows and wrap;
  Home and End jump; the theme rows are in the order. Bell and Activity say `role="menu"` too and get no
  arrow keys: Bell's rows and the phone Menu's are links and keep Tab, and Activity's rows are text
  (default 14; taste call T-11). Escape closes the account menu, Bell and Activity and
  puts focus back on the button that opened it; an outside press closes and leaves focus where the press put
  it. Dismiss on a toast puts focus on Sync. A toast's timer stops while the pointer rests on the toast or
  focus is inside it, and starts again on leave (`SyncButton.tsx:123`). The five icon buttons of the bar
  (Search, Courses sidebar, Activity, Announcements, Account) lose their `title` and show the app's own small
  label, from one shared class in `tokens.module.css`: under the button, after `calc(var(--motion-delay) * 2)`
  of hover and at once on keyboard focus. Their accessible name stays the `.sr-only` text. Sync keeps its
  `title` (default 10). The 44 other `title` attributes are left.
* **The app's icon (task 33, named exception 11).** The bar's mark: a square in the ink on the dark ground,
  greys only. `desktop/build/icon.png` is drawn by a small script with no dependency,
  `desktop/scripts/draw-mark.mjs`; `npm run icons` derives `icon.ico` and `tray-16.png` from it;
  `web/src/app/favicon.ico` and `apple-icon.png` are byte copies of the two desktop files, as Phase 17 made
  them (commit a656af1). The square's size on its canvas is taste call T-10.
* **Captions and codes (task 34, named exception 12).** Four how-to lines leave the visible page and become the
  `title` of what they explain: Home's "Open = …" beside the Courses heading (`Today.tsx:252`); the tracker's
  "line = Monday · click a day for detail" (`UpcomingTracker.tsx:498-499`; "Window · …" and "Scrolls …" stay,
  and `UpcomingTracker.scroll.test.tsx:145` pins the first); the tracker's "status is click-to-edit" (`:510`);
  the planner's two legend lines (`PlannerWeek.tsx:252-255`). Blackboard's attempt status is put into words by
  a new field, `attemptText`, beside the verbatim `attemptStatus` in `submissionLabel`
  (`web/src/lib/queries.grades.ts:474-487`): a known code reads in lower case with spaces ("needs grading",
  "in progress", "completed"), an unknown code reads as itself. The field is optional
  (`attemptText?: string`) and is left off the object when `attemptStatus` is null. It may not be a key
  that holds null: `queries.grades.test.ts:224` compares the whole object for a row with no status with
  `toEqual`, which passes over a key that is absent or undefined and not one that is null, and that file
  stays unedited. Both screens print `attemptText`
  (`GradebookTable.tsx:238`, `SubmissionBlock.tsx:175`), each inside the `submission.attemptStatus &&` it
  has today, so the field is there whenever it is printed. The words are his: taste call T-9.
* **The week strip (task 35).** In a course card's week strip a plain day is a hairline outline and a meeting
  day is filled, both in one tone (`Today.module.css` `.stripBar`, `.stripBarMeet`). The difference is a shape,
  not a tone alone. CSS on two rules that exist. The label he chose, "Meeting days as outline", reads the
  other way round. The build follows row 33, the entry `week-strip-shape` and the refined tile, which is
  what he was shown; he can turn it round at taste call T-10 (default 16).
* **Larger click targets (task 36, named exception 13).** Four targets get a hit area from a `::after`, and no
  box moves. The popout's close button and, at 480 px and under, the brand link reach `--size-target` both
  ways. In a planner block the done box's hit area is the block's full height and stops at the box's own edge
  on the title's side, and the title's hit area is the rest of the block (default 5). `.block` keeps its
  `overflow`, `padding` and `line-height`.
* **Busy says busy (task 37, named exception 14; H-5).** A control that is disabled only while it works says
  so. Each of the 24 sites whose `disabled` is exactly `pending`, `busy` or `controlsDisabled` gains
  `aria-busy`: `aria-busy={pending}` or `aria-busy={busy}`. The six `controlsDisabled` sites of
  `AssignmentPlannerBlock.tsx` take `aria-busy={pending}`, because that flag is also true when the planner is
  unavailable (`AssignmentPlannerBlock.tsx:166`), which is off, not busy. The 19 sites with any other
  expression are left. With that in the markup a switched-off field or select gets its own look, on
  `:disabled:not([aria-busy='true'])`: a flat grey box (fill `--color-neutral-900`, edge `--color-neutral-800`,
  words `--color-neutral-600`) with `cursor: not-allowed`. A busy control stays at half strength with
  `cursor: progress`. Five rules carry it: `.input` in `tokens.module.css`, `StatusSelect`, `Popout` `.control`,
  `SearchPanel` `.courseSelect` and `PlannerItemPopover` `.control`.
* **The Upcoming strip's scrollbar (task 38; H-5).** `.tracker` drops its own `scrollbar-width` and
  `scrollbar-color` and its three `::-webkit-scrollbar` rules, so the app's one scrollbar block draws it like
  every other box. It is never hidden, which is what R3-1 asked.

### Component changes by owner

Amendment 2, G-2, extended by amendment 3. The source is
`docs/planning/sprint-2/evidence/103_style_tiles/component-changes.json`. It holds 106 entries since the
refinement pass: the 55 of amendment 2, in the first table, unchanged, and 51 new ones, in the second table
(§Entries 56 to 106). Each row is one entry, by its `id`, in the file's order. Paths are under `web/src`. The JSON's
`what` field is the change, word for word; the Note here only says where it lands. Each worker applies the
entries that name its files: W-67's entries on `globals.css` and the shared `.errorNotice` class land with task
8, so the sweeps can use them; every other entry lands with its owner's sweep (W-67 task 16, W-68 task 17, W-69
task 18, W-70 task 19). A shared entry is split by file, and each worker takes only its own files. An entry
marked "no edit" is recorded so that nobody "fixes" it. An entry marked "tile" changes the tile page only.

| # | `id` | Owner | Where | Note |
|---|---|---|---|---|
| 1 | `theme-two-blocks` | W-67 | `app/globals.css` | task 8 |
| 2 | `theme-default-is-dark` | W-67 | `lib/theme-preference.ts`, `components/shell/ThemeMenu.tsx` | behaviour, named exception (4); tasks 9 and 10 |
| 3 | `tile-theme-control` | tile | none | |
| 4 | `tile-theme-script` | tile | none | |
| 5 | `links-thin-underline` | W-67 | `app/globals.css` `a`, `a:hover` | task 8 |
| 6 | `focus-ring-is-the-ink` | no edit | `app/globals.css` `:focus-visible` and the modules that repeat it | every rule says `var(--color-accent)` already |
| 7 | `field-focus-is-the-ink` | no edit | `styles/tokens.module.css` `.input:focus-visible`, `components/shell/SearchPanel.module.css` | the same |
| 8 | `select-focus-is-the-ink` | tile | none | |
| 9 | `tile-marks-comment` | tile | none | |
| 10 | `tile-kicker` | tile | none | |
| 11 | `tile-theme-switch-shape` | tile | none | |
| 12 | `tile-theme-switch-pressed` | tile | none | |
| 13 | `card-edge` | W-67 | `styles/tokens.module.css` `.card` | task 16 |
| 14 | `card-edge-lg` | no edit | `styles/tokens.module.css` `.cardLg` | it composes `.card` |
| 15 | `tag-pill` | W-67 | `styles/tokens.module.css` `.tag` | task 16 |
| 16 | `tag-accent-is-filled` | W-67 | `styles/tokens.module.css` `.tagAccent` | task 16 |
| 17 | `tag-outline-is-grey` | W-67 | `styles/tokens.module.css` `.tagOutline` | task 16 |
| 18 | `button-pill-sans` | W-67 | `styles/tokens.module.css` `.btn` | task 16 |
| 19 | `button-fills` | W-67 | `styles/tokens.module.css` `.btnPrimary`, `.btnSecondary`, `.btnGhost` | task 16 |
| 20 | `input-well` | W-67 | `styles/tokens.module.css` `.input` | task 16 |
| 21 | `glyph-round` | W-67 | `styles/tokens.module.css` `.glyph` | task 16 |
| 22 | `error-notice-shared` | W-67 | `styles/tokens.module.css` `.errorNotice` (new shared class) | task 8's commit, ahead of the sweeps |
| 23 | `error-notice-composed` | W-67, W-68, W-69, W-70 | 13 boxed rules and one bare line | **W-67:** `app/login/Login.module.css` `.error`. **W-68:** `components/popout/Popout.module.css` `.problem`. **W-69:** `.problem` in `app/(app)/inbox/Inbox.module.css`, `app/(app)/Today.module.css` and `components/inbox/InboxCard.module.css`; `.serverError` in `components/planner/PlannerEventForm.module.css`; `.alert` in `components/planner/PlannerWeek.module.css`; and the bare line `components/planner/PlannerItemPopover.module.css` `.problem`, which gets the word only. **W-70:** `.problem` in `app/(app)/materials/Materials.module.css`, `app/(app)/workspace/Workspace.module.css`, `app/(app)/course/[id]/assignment/[...assignmentId]/CourseAssignment.module.css`, `components/workspace/ConversationList.module.css` and `components/workspace/ServiceStatus.module.css`; `.error` in `components/grades/UploadDropZone.module.css`. 1 + 1 + 5 + 6 = 13 |
| 24 | `brand-mark` | W-68, W-67 | `.mark` in two files | **W-68:** `components/shell/TopNav.module.css`. **W-67:** `app/login/Login.module.css` |
| 25 | `nav-links` | W-68 | `components/shell/TopNav.module.css` `.link` | task 17 |
| 26 | `unread-badge` | W-68 | `components/shell/TopNav.module.css` `.badge` | task 17 |
| 27 | `sync-pill` | W-68 | `components/shell/SyncButton.module.css` `.button` | task 17 |
| 28 | `side-panel` | W-68 | `components/shell/CourseSidebar.module.css` `.rail`, `.rowCurrent` | task 17 |
| 29 | `grade-open-link` | W-70 | `components/grades/CourseGradeCard.module.css` `.openLink` | task 19 |
| 30 | `grade-item-link` | W-70 | `components/grades/GradebookTable.module.css` `.itemLink` | task 19 |
| 31 | `tracker-day-shape` | W-69 | `components/tracker/UpcomingTracker.module.css` `.day` | task 18 |
| 32 | `tracker-week-rule` | W-69 | `components/tracker/UpcomingTracker.module.css` `.dayMonday` | task 18 |
| 33 | `tracker-picked-day` | W-69 | `components/tracker/UpcomingTracker.module.css` `.daySelected` | task 18 |
| 34 | `tracker-bar-shape` | W-69 | `components/tracker/UpcomingTracker.module.css` `.seg` | task 18 |
| 35 | `tracker-today` | W-69 | `components/tracker/UpcomingTracker.module.css` `.dowToday` | task 18 |
| 36 | `tracker-urgency-order` | W-69 | `components/tracker/UpcomingTracker.tsx` `LEGEND`, `DayColumn` | behaviour, named exception (3), with a test; task 18 |
| 37 | `tile-tracker-wednesday` | tile | none | |
| 38 | `tile-tracker-friday` | tile | none | |
| 39 | `inbox-chip` | W-69 | `components/inbox/InboxCard.module.css` `.chip` | task 18 |
| 40 | `inbox-kind-chip` | W-69 | `components/inbox/InboxCard.module.css` `.kindChip` | task 18 |
| 41 | `inbox-source-link` | W-69 | `components/inbox/InboxCard.module.css` `.sourceLink` | task 18 |
| 42 | `red-where-you-are` | W-69, W-70 | five rules in four files | **W-69:** `app/(app)/inbox/Inbox.module.css` `.tab[aria-selected="true"]`; `components/planner/PlannerWeek.module.css` today's `.dayName` and `.nowLine`. **W-70:** `app/(app)/course/[id]/CourseSubBar.module.css` `.tabActive`; `components/course/CourseTimeline.module.css` `.weekCurrent` |
| 43 | `red-unread` | W-68, W-69 | three rules in three files | **W-68:** `components/shell/Bell.module.css` `.dotUnread`, `components/shell/TopNav.module.css` `.ddDotUnseen`. **W-69:** `components/announcements/AnnouncementsList.module.css` `.dotUnread` |
| 44 | `class-block-no-edit` | no edit | `components/planner/PlannerWeek.module.css` `.meetingBlock`, `.chipMeeting` | it follows `--color-accent-2-800`, a task-8 value |
| 45 | `home-cards-no-edit` | no edit | `app/(app)/Today.module.css` | drawn from the tokens as they stand |
| 46 | `weights-as-tokens` | **PM to rule** | `styles/tokens.module.css` (W-67), `components/shell/TopNav.module.css` (W-68), `components/tracker/UpcomingTracker.module.css` (W-69) | no single owner. Default until he rules: §Token set rules. W-67 declares the `--font-*` names at task 8; each owner uses them in its own file |
| 47 | `type-colour-test` | W-67 | `web/test/type-tokens.contrast.test.ts` | task 8 (G-4) |
| 48 | `all-classes-css` | no edit | `app/(app)/Today.module.css`, `components/shell/CourseSidebar.module.css` | the tile's copy of existing rules; the edits are entries 28 and 45 |
| 49 | `all-classes-markup` | tile | none | |
| 50 | `tile-course-card-moved` | tile | none | |
| 51 | `swatch-panel` | tile | none | |
| 52 | `swatch-accent-roles` | tile | none | |
| 53 | `swatch-reds-and-types` | tile | none | |
| 54 | `tile-shape-large` | tile | none | |
| 55 | `shadow-large-no-ring` | W-67 | `app/globals.css` `--shadow-lg` | a token value, task 8; no module rule changes |

Counts, 55 in all. One owner: W-67 14, W-68 4, W-69 9, W-70 2 (29). Shared, split by file: 4 (entries 23, 24,
42, 43). No edit in the app: 6. Tile only: 15. For the PM to rule: 1 (entry 46). Counting shared entries once
for each worker they touch: W-67 16, W-68 7, W-69 12, W-70 4.

Two orders follow from the table. `.errorNotice` must be on `origin/feat/styling-22` before a sweep composes
it, so it is in task 8's commit. And the red marks are the nine files of entries 25, 26, 28, 35, 42 and 43 and
no others, which task 20 counts.

**Entries 56 to 106 (amendment 3).** For entries 56 to 73, the default build, the JSON's `owner` field names
the worker and the task for each file. For entries 74 to 98 it does not: the JSON is the pass's text from
before he ruled. Its `owner` reads "after his word", "the PM" or "a desktop task of its own", its `what`
opens "NEEDS HIS WORD" or "FOR THE PM TO RULE", and several entries name another worker, file or behaviour
than this brief. For those 25 entries this table's Owner and Lands-in columns, §Files and the contract
sections win over the JSON's `owner`, `file` and `what`. The
row here says whether the entry is in, by whose word, and where it lands. "Row" is the row of REFINEMENT §4.
An entry marked **out** is not built: it is listed in §Out of scope with his answer.

| # | `id` | Row | Status | Owner by file | Lands in |
|---|---|---|---|---|---|
| 56 | `scrollbars-themed` | 1 | in, default build | W-67 (`app/globals.css`) | task 8 |
| 57 | `select-as-field` | 2 | in, default build | W-67 (`.input`); W-68 (`Popout` `.control`, `SearchPanel` `.courseSelect`); W-69 (`StatusSelect`, `PlannerItemPopover` `.control`) | tasks 16, 17, 18 |
| 58 | `checkbox-drawn` | 2 | in, default build | W-67 (the one rule in `globals.css`); W-69 (`PlannerWeek.module.css`, the done box loses `accent-color`) | tasks 8, 18 |
| 59 | `chrome-no-select` | 3 | in, default build | W-67, W-68, W-69, W-70, each in its own modules | tasks 16 to 19 |
| 60 | `focus-ring-one` | 4 | in, default build | W-67 (`globals.css`, `tokens.module.css`); W-68, W-69, W-70 in their own modules | tasks 8, 16 to 19 |
| 61 | `hover-grammar` | 5 | in, default build | W-67 (`--shadow-hover`); W-68 (`TopNav` `.link`, `SearchPanel` `.modeBtn`); W-69 (`Today` `.courseCard`, `UpcomingTracker` `.day`, the planner event) | tasks 8, 17, 18 |
| 62 | `disabled-one-look` | 6 | in, default build | W-67 (`.btn:disabled`); W-68 (`SyncButton`, `Popout` `.control`, `TopNav` `.icDisabled`); W-69 (`StatusSelect`, `PlannerWeek`, `PlannerItemPopover`, `InboxApplyButton`) | tasks 16, 17, 18 |
| 63 | `motion-tokens` | 7 | in, default build | W-67 (`globals.css`: the tokens and the reduce block); W-68 deletes `NavSearch.module.css:94-96` | tasks 8, 17 |
| 64 | `state-transitions` | 7 | in, default build | W-67, W-68, W-69, W-70, each in its own modules | tasks 8, 16 to 19 |
| 65 | `press-states` | 8 | in, default build | W-67 (`.btn`, `.btnGhost`, `--color-surface-press`); W-68; W-69; W-70 (the four text links) | tasks 8, 16 to 19 |
| 66 | `panels-arrive` | 9 | in, default build | W-68 (the shell's panels, the popout, the phone Menu, `phone-width.spec.ts`); W-69 (`PlannerItemPopover`, `InboxApplyButton`); W-67 (`theme-walk.spec.ts`) | tasks 5, 16, 17, 18 |
| 67 | `titles-balance` | 10 | in, default build | W-67 (`globals.css` headings); W-68 (`Popout` `.title`); W-69 (`InboxCard` `.title`) | tasks 8, 17, 18 |
| 68 | `loading-never-flashes` | 11 | in, default build | W-69 (`Today.module.css` `.muted`) | task 18 |
| 69 | `theme-switch-instant` | 12 | in, default build (script; §Theme mechanism) | W-67 (`globals.css`, `theme-preference.ts`, `ThemeMenu.tsx`, their two tests) | tasks 8, 9, 10 |
| 70 | `decoration-out` | 13 | in, default build | W-67 (`tokens.module.css` `.rule`); W-68 (`Popout` `.backdrop`) | tasks 16, 17 |
| 71 | `scroll-chaining` | 14 | in, default build | W-68 (`Bell`, `TopNav` `.dd`, `SearchPanel`, `Popout`); W-69 (`PlannerSeriesScopeDialog`) | tasks 17, 18 |
| 72 | `focus-not-under-bar` | 15 | in, default build; goes with the frame | W-67 (`globals.css` `html`) | task 8; removed at task 26 |
| 73 | `time-tokens-shell` | 16 | in, default build | W-68 (`CourseSidebar`, `NavSearch`, `SyncButton`) | task 17 |
| 74 | `desktop-title-bar` | 17 | in, D-1 | W-67 (`desktop/src/main/`, `globals.css` drag strip); W-68 (`TopNav.module.css` `.bar`, and `no-drag` on the bar's controls and panels in its shell stylesheets) | task 27 |
| 75 | `desktop-shell-details` | 17 | in, D-1 | W-67 (`desktop/src/main/`) | task 27 |
| 76 | `app-frame-panes` | 18 | in, D-1 | W-68 (`Shell.module.css`, `TopNav`, `CourseSidebar`, `usePaneScroll.ts`); W-70 (`CourseTimeline.module.css:29`); W-67 (`globals.css`, `theme-walk.spec.ts` row 31) | task 26 |
| 77 | `icons-bar-one-weight` | 19 | in, D-3 | W-68 (`icons.tsx`, `SyncButton.tsx`) | task 31 |
| 78 | `app-mark` | 20 | in, D-5 | W-67 (`desktop/build/`, `desktop/scripts/draw-mark.mjs`, `app/favicon.ico`, `app/apple-icon.png`) | task 33 |
| 79 | `labels-in-the-body-face` | 21 | in, D-2 | W-68, W-69, W-70 (§Type rules) | task 28 |
| 80 | `type-floor` | 21 | **out**, D-2 | none | none |
| 81 | `fonts-with-the-app` | 21 | **out**, D-2 | none | none |
| 82 | `icons-text-characters` | 22 | in, D-3 | W-68 (`icons.tsx`; 5 characters in 3 files of `components/popout/`); W-69 (18 in 8 files); W-70 (18 in 9 files) | task 31 |
| 83 | `loading-attribute` | 23 | **out**, H-5 | none | none |
| 84 | `states-loading-skeleton` | 23 | **out**, D-4 | none | none |
| 85 | `states-empty` | 24 | **out**, D-4 | none | none |
| 86 | `select-list-drawn` | 25 | **out**, D-4 | none | none |
| 87 | `textarea-grows` | 25 | **out**, D-4 | none | none |
| 88 | `menus-leave` | 26 | in, D-3 | W-68 (the shell's panels, `PopoutShell.tsx`, `useExit.ts`); W-67 (the three exit tokens) | tasks 8, 29 |
| 89 | `tooltips-drawn` | 27 | in, D-4 | W-68 (five buttons); W-67 (the shared class in `tokens.module.css`) | tasks 8, 32 |
| 90 | `keyboard-in-the-shell` | 28 | in, D-4 | W-68 (`(app)/layout.tsx`, `Shell.module.css`, `TopNav.tsx`, `Bell.tsx`, `ActivityMenu.tsx`, `SyncButton.tsx`) | task 32 |
| 91 | `toast-waits` | 28 | in, D-4 | W-68 (`SyncButton.tsx`) | task 32 |
| 92 | `busy-says-busy` | 29 | in, H-5 | W-67 (3 sites, `.input`); W-68 (7 sites, 2 rules); W-69 (9 sites, 2 rules); W-70 (5 sites) | task 37 |
| 93 | `copy-captions` | 30 | in, D-5 | W-67 (`lib/queries.grades.ts`); W-69 (`Today.tsx`, `UpcomingTracker.tsx`, `PlannerWeek.tsx`); W-70 (`GradebookTable.tsx`); W-68 (`SubmissionBlock.tsx`) | tasks 8, 34 |
| 94 | `pointer-targets` | 31 | in, D-5 | W-68 (`Popout` `.close`, `TopNav` `.brand`); W-69 (the planner's done box and title); W-67 (`--size-target`, one walk case) | tasks 8, 36 |
| 95 | `width-animations` | 32 | in, D-3 | W-68 (`CourseSidebar.module.css`, `NavSearch.module.css`) | task 30 |
| 96 | `week-strip-shape` | 33 | in, D-5 | W-69 (`Today.module.css`) | task 35 |
| 97 | `tracker-scrollbar` | 34 | in, H-5 | W-69 (`UpcomingTracker.module.css`, `upcoming-tracker-css.test.ts`) | task 38 |
| 98 | `page-gutter-stable` | 35 | settled by the frame, H-5: the panes carry the gutter, `html` gets no line | W-68 (`Shell.module.css` `.main`) | task 26 |
| 99 to 106 | `tile-window-fragment`, `tile-marks`, `tile-states-fragment`, `tile-scroll-list`, `tile-live-menus`, `tile-live-popout`, `tile-try-line`, `tile-proposals-fragment` | none | tile | none | none |

Counts, 51 in all. In scope: 35, which are the 18 of the default build (56 to 73) and 17 by his decisions and
the PM's rulings (74 to 79 without 80 and 81, then 82, 88 to 97). Out: 7 (80, 81, 83, 84, 85, 86, 87). Settled
by another entry: 1 (98). Tile only: 8. With the first table that is 90 entries in scope of 106. Where the
JSON's `what` and a decision differ, the decision wins: entry 63 says the three exit names are "held back",
and D-3 declares them; entry 72 and entry 98 say what the frame does to them, and the frame is in; entry 89
says "the six controls", and Sync keeps its `title` (default 10 of amendment 3); entry 92 names
`aria-busy` beside `controlsDisabled`, and the six sites take `pending` (§The smaller decisions). The same
holds for `owner` and `file`. The entries that differ most, each with what this brief says:

* **74** `desktop-title-bar`: owner "a desktop task of its own". Here: W-67 and W-68, task 27.
* **75** `desktop-shell-details`: "Reload, the developer tools and zoom keep their keys", and a "Retry
  button". Here: no zoom items (taste call T-6) and a Retry link; the context menu and the failed-load page
  are modules of their own, not lines of `window.ts`.
* **78** `app-mark`: owner "the PM". Here: W-67, task 33.
* **83** `loading-attribute`: still reads "W-67 ... task 8". It is out (H-5).
* **88** `menus-leave`: names `usePopover.ts` and `NavSearch.tsx`, and says the two TopNav tests change.
  Here: `useExit.ts`, the hook not reshaped, both tests unedited (default 1).
* **90** `keyboard-in-the-shell`: owner "W-67 (layout.tsx, globals.css), W-68 (usePopover.ts and the
  menus)". Here: all W-68's, in `(app)/layout.tsx` and `Shell.module.css`, and `usePopover` keeps its shape.
* **92** `busy-says-busy`: lists `CourseInfo.tsx:167` and `PlannerItemPopover.tsx:278` and "two rules".
  Here: the 24 sites the Busy sites command counts, which hold neither of those two, and five rules.
* **94** `pointer-targets`: gives the done box `inset: -6px` and says it "waits for a look in the real
  planner". Here: the hit areas of default 5, and the `planner targets` case.
* **97** `tracker-scrollbar`: drops two declarations "so those three rules come alive". Here: task 38
  deletes the three `::-webkit-scrollbar` rules too.

Three more orders follow from this table. What a sweep or a new task needs from W-67 is in W-67's task-8
commit, ahead of the sweeps, as `.errorNotice` is: the 34 names, the scrollbar block, the checkbox rule, the
reduce block, the theme-switching rule, the heading and link rules, the shared label class of task 32, and
`attemptText` of task 34. W-68's `icons.tsx` commit of task 31 is pushed by itself, first in its resume, so
W-69 and W-70 can draw the marks. It holds all three exports: `Mark`, `MarkedLabel` and `MARK_CHAR`. And tasks 26 and 27 come after every other worker task, in that order
(§Workers).

### The walk box (harness runs)

"Harness run" means, from the root of the worktree whose build is under test:

    node scripts/walk-box.mjs <spec file under web/e2e> [more specs] [-- <extra playwright args such as -g "title">]

It starts **one** throwaway container from the stock image `mcr.microsoft.com/playwright:v1.63.0-noble` (on this
machine already; the tag must equal `web/package.json`'s `@playwright/test` version, 1.63.0), with that worktree
mounted read-only. Inside, it copies `web/` to a scratch folder, runs `npm ci`, `npm run build`, starts
`next start` on port 3000, signs in with `web/e2e/login.mjs` (scripted, from the test login file), runs
`npx playwright test -c e2e/playwright.config.ts <specs> <args>` against `http://localhost:3000`, and exits with
Playwright's exit code. The app reads production data as the owner, so the specs only read and guard every
write.

* **Output** goes to `C:/Users/stack/.bb2dash-walk/22/<run id>/`, where the run id is a UTC timestamp such as
  `20261008T051500Z`: `run.json` (run id, commit, specs, args, `started_at` as an ISO time taken on the host,
  `exit_code` and `result`), `stdout.log`, `results/` (Playwright's output) and `shots/` when `WALK_SHOTS=1`. The
  script refuses an output folder that is not absolute or that lies inside any git checkout.
* **Time.** The host script writes `stdout.log` and the last state of `run.json`. A walk outlives a tool call's
  default limit of two minutes, and a RED run can outlive the ten-minute maximum: the config runs one case at a
  time and a case that waits for a missing control uses its whole 90 s. A killed host script leaves the container
  running to its end, `run.json` at `"result": "running"` and no exit code. So every harness run is started in
  the background and read from `run.json` when it ends (§Task list).
* **Options.** `--url <https origin>` skips the build and the start and walks that host instead (used after the
  merge against production; `WALK_VERCEL_SHARE` is passed through when set). `--keep` leaves the container
  running and prints its name; `node scripts/walk-box.mjs --exec <container> <specs...>` runs more specs in it
  and `node scripts/walk-box.mjs --rm <container>` removes it, so a worker can iterate without a rebuild.
* **Inputs**, read by path only, their values never printed: the web app's two public settings from
  `C:/Users/stack/.bb2dash-walk/web.env` (override: `WALK_BOX_WEB_ENV`; passed with docker's `--env-file`, needed
  at build time), and the test login file `C:/Users/stack/projects/bb2dash/.env.testing` (override:
  `WALK_BOX_LOGIN_ENV`; mounted read-only at the scratch checkout's root, so `login.mjs` reads it with its own
  parser).
* **Limits.** It never uses docker compose and never touches another container, network or volume, except one
  named volume of its own for the npm cache (`bb2dash-walk-npm-cache`).
* **Spec helpers** live in `web/e2e/walk22.lib.ts`. `shotPath22(name)` returns a path under `WALK_SHOT_DIR`; it
  throws unless `WALK_SHOTS=1` and `WALK_SHOT_DIR` is set, absolute and outside the checkout.
  `guardWrites22(context)` is `walk.ts`'s guard plus this: it aborts and records the write RPCs `workspace_ask`,
  `workspace_cancel`, `sync_enqueue` and every `planner_series_*`, and any other RPC not on its read allowlist
  (`web/src` calls six RPCs today and all six write), and it fulfils `mark_announcements_seen` without reaching
  the database. `quietSync(context, phase?)` fulfils the `agent_requests` GET and POST and the `sync_runs` GET,
  so the Sync label is pinned: idle by default, or the phase asked for, such as the longest label. The two
  helpers both claim the Sync press, so their order is fixed: `quietSync` is called after `guardWrites22` on the
  same context, and throws otherwise. A request `quietSync` fulfils never reaches the guard and is not a recorded
  write, so a Sync press under `quietSync` leaves `assertNoWrites` green. Any other write to `agent_requests`
  still reaches the guard and is aborted and recorded. Specs take screenshots only through `shotPath22` and only
  when `WALK_SHOTS=1`.
* **Consequences.** No share tokens, no per-worker previews, no hand sign-in, no `state.json` copied between
  worktrees, and no "no push while a run is open" rule for workers: a worker's harness run uses its own
  worktree's build. A bare `npm run walk` is never run in a Phase 22 worktree: it runs every spec and re-shoots
  walk-17's committed shots. A harness run and `just accept` use the same test login and never run at the same
  time. The phase branch still gets its GitHub-linked Vercel preview, and the PR names it for Stack's look.

### RPC signatures

None. This phase creates, alters and calls no RPC, view, table, policy or edge function. Its only database contact
is read-only: the no-writes read of tasks 21 and 22.

### Tables and migrations

| Number | File | Creates |
|---|---|---|
| none | none | Nothing. No number is reserved (94 §1). A task that finds it needs a migration stops; the PM takes the next free block of ten under 94 §2 rule 6 and records it in DECISIONS before anything is applied. |

### Files

New (full paths): `web/src/lib/theme-preference.ts`; `web/src/components/shell/ThemeMenu.tsx`;
`web/src/components/shell/ThemeMenu.module.css`; `web/src/app/NotFound.module.css` (replaces the three `style=`
sites in `not-found.tsx`); `web/test/token-audit.scan.ts`; `web/test/token-audit.test.ts`;
`web/test/token-audit.allowlist.ts`; `web/test/token-audit.baseline/foundation.json`,
`web/test/token-audit.baseline/shell.json`, `web/test/token-audit.baseline/screens-a.json`,
`web/test/token-audit.baseline/screens-b.json`; `web/test/css-tokens.ts`; `web/test/theme-tokens.test.ts`;
`web/test/theme-contrast.test.ts`; `web/test/theme-preference.test.ts`; `web/test/ThemeMenu.test.tsx`;
`web/test/TopNav.fold.test.tsx`; `web/test/planner-phone-width.css.test.ts`;
`web/test/UpcomingTracker.urgency.test.tsx` (amendment 2, W-69);
`web/test/gradebook-phone-width.css.test.ts`; `web/e2e/phone-width.spec.ts` and `web/e2e/theme-walk.spec.ts`
(in Phase 17's walk harness folder, `web/e2e/`; both run through the walk box with
`-c e2e/playwright.config.ts`, a config that is **not edited** here; both write screenshots only through
`shotPath22` and only when `WALK_SHOTS=1`, which the PM sets at tasks 21–22, so a worker's harness run writes
none); `scripts/walk-box.mjs`; `scripts/walk-box.test.mjs` (node:test); `docker/walk/entry.sh`;
`web/e2e/walk22.lib.ts`; `web/test/walk22-lib.test.ts`; `desktop/src/main/window-background.ts`;
`desktop/test/unit/window-background.test.ts`;
`docs/planning/sprint-2/evidence/103_style_tiles/tile-a.html`,
`docs/planning/sprint-2/evidence/103_style_tiles/tile-b.html`,
`docs/planning/sprint-2/evidence/103_style_tiles/tile-c.html`, and with amendment 2, in the same folder,
`tile-d.html`, `style-pick.html` (the walkthrough page), `direction-d.json`, `component-changes.json` and
`README.md`;
`docs/planning/sprint-2/walks/walk-22/WALK.md` (**no PNG is committed anywhere in this phase**: shots stay in
the walk box's output folder, outside every repository);
`docs/planning/sprint-2/verification/103_W67_VERIFICATION.md`,
`docs/planning/sprint-2/verification/103_W68_VERIFICATION.md`,
`docs/planning/sprint-2/verification/103_W69_VERIFICATION.md`,
`docs/planning/sprint-2/verification/103_W70_VERIFICATION.md`,
`docs/planning/sprint-2/verification/103_W75_VERIFICATION.md` (each its own worker's);
`docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md`;
`docs/planning/sprint-2/verification/103a_PHASE22_FREEZE_AUDIT.md` (written with this freeze).

New with amendment 3. Committed with the amendment, by the PM:
`docs/planning/sprint-2/verification/103b_PHASE22_REFINEMENT.md`;
`docs/planning/sprint-2/evidence/103_style_tiles/tile-d.before-refinement.html`;
`design-system/bb2dash/MASTER.md` and `design-system/bb2dash/pages/home.md`, `planner.md`, `grades.md`,
`inbox.md` and `workspace.md`. Written by the build, each by the owner named:

* W-67: `desktop/src/main/title-bar.ts`, `desktop/src/main/app-menu.ts`, `desktop/src/main/context-menu.ts`,
  `desktop/src/main/load-failed.ts`; `desktop/test/unit/title-bar.test.ts`,
  `desktop/test/unit/app-menu.test.ts`, `desktop/test/unit/context-menu.test.ts`,
  `desktop/test/unit/shell-pages.test.ts`, `desktop/test/unit/app-mark.test.ts`;
  `desktop/test/e2e/chrome.spec.ts`; `desktop/scripts/draw-mark.mjs`;
  `web/test/queries.grades.attempt-text.test.ts`.
* W-68: `web/src/components/shell/useExit.ts`, `web/src/components/shell/usePaneScroll.ts`;
  `web/test/useExit.test.tsx`, `web/test/pane-scroll.test.tsx`, `web/test/shell-motion.css.test.ts`,
  `web/test/shell-keyboard.test.tsx`, `web/test/SyncButton.toast-timer.test.tsx`,
  `web/test/shell-targets.css.test.ts`, `web/test/marks.test.tsx`.
* W-69: `web/test/today-week-strip.css.test.ts`, `web/test/planner-targets.css.test.ts`.

Changed, by owner (the sets are **disjoint**; a file not listed is not touched):

* **W-67 foundation:** `web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/styles/tokens.module.css`,
  `web/src/app/login/Login.module.css`, `web/src/app/login/LoginForm.tsx`, `web/src/app/login/page.tsx`,
  `web/src/app/privacy/page.tsx`, `web/src/app/terms/page.tsx`, `web/src/app/not-found.tsx`,
  `web/test/type-tokens.contrast.test.ts`, `web/test/raw-html.audit.test.ts` (task 9: its header sentence, its
  allow-list constants and the two cases that read them, and nothing else), `desktop/src/main/window.ts`
  (`desktop/test/unit/window.test.ts` is **not** edited: amendment 2, G-3); plus every new file above except those listed
  under W-68..W-70, W-75 and the PM (so: `theme-preference.ts`, `ThemeMenu.*`, `NotFound.module.css`, the three
  `token-audit.*` modules and `token-audit.baseline/foundation.json`, `css-tokens.ts`, the four theme tests,
  `web/e2e/theme-walk.spec.ts`, `window-background.ts` and its test, `103_W67_VERIFICATION.md`). The cluster map
  puts `web/src/lib/` and `web/src/proxy.ts` in `foundation` at a baseline of 0; W-67 edits only its own new
  `theme-preference.ts` there. `web/vitest.config.mts` is **not** edited: its `coverage.include` is a glob since
  Phase 17 (`src/**/*.{ts,tsx}`), so the two new modules count toward the `lines: 83` floor by themselves.
  `desktop/vitest.config.mts` is not edited either; `window-background.ts` is proven by its own test.
  **Added by amendment 3 (H-3, H-4):** `desktop/src/main/index.ts` and `desktop/src/main/update-prompt.ts`
  (task 27; `window.ts` was already here); `desktop/build/icon.png`, `desktop/build/icon.ico`,
  `desktop/build/tray-16.png`, `web/src/app/favicon.ico` and `web/src/app/apple-icon.png` (task 33; the two
  web files belonged to no set); `web/src/lib/queries.grades.ts`, for the one new field `attemptText` and its
  gloss, nothing else in the file (task 34); and W-67's new files of the list above. No pre-existing desktop
  test is in this set.
* **W-68 shell and phone width:** every file in `web/src/components/shell/` except `ThemeMenu.*` (today:
  `TopNav.tsx`, `TopNav.module.css`, `Bell.tsx`, `Bell.module.css`, `ActivityMenu.tsx`, `SyncButton.tsx`,
  `SyncButton.module.css`, `CourseSidebar.tsx`, `CourseSidebar.module.css`, `NavSearch.tsx`,
  `NavSearch.module.css`, `SearchPanel.tsx`, `SearchPanel.module.css`, `SidebarProvider.tsx`, `usePopover.ts`,
  `useDesktopUpdate.ts`, `icons.tsx`, `ScreenStub.tsx`); `web/src/app/(app)/Shell.module.css`;
  `web/src/app/(app)/layout.tsx`; everything in `web/src/components/popout/`;
  `web/src/components/shared/QueryState.tsx`; new `web/test/TopNav.fold.test.tsx`, `web/e2e/phone-width.spec.ts`;
  `web/test/token-audit.baseline/shell.json` from task 1 on. **Added by amendment 3:** W-68's new files of the
  list above, and one pre-existing test, `web/test/SubmissionBlock.test.tsx`, for one string on line 146
  (task 34).
* **W-69 screens A:** `web/src/app/(app)/page.tsx`, `Today.tsx`, `Today.module.css`, `NeedsAttention.tsx`,
  `NeedsAttention.module.css`, `CourseGradeFigure.tsx`; `web/src/app/(app)/planner/`, `inbox/`, `announcements/`;
  `web/src/components/planner/`, `tracker/`, `inbox/`, `announcements/`; new
  `web/test/planner-phone-width.css.test.ts` and `web/test/UpcomingTracker.urgency.test.tsx`;
  `web/test/token-audit.baseline/screens-a.json`. **Added by amendment 3:** W-69's two new tests of the list
  above, and one pre-existing test, `web/test/upcoming-tracker-css.test.ts`, for its second case only, lines
  30-34 (task 38).
* **W-70 screens B:** `web/src/app/(app)/course/`, `grades/`, `materials/`, `workspace/`;
  `web/src/components/grades/`, `materials/`, `workspace/` (Phase 21's `ConversationList`, `MessageList`,
  `Composer`, `TierBadge`, `ServiceStatus` and their modules, the token sweep and the component changes of
  their files only, no new module in the folder) and
  `web/src/components/course/` (the Stream timeline, 5 files); new `web/test/gradebook-phone-width.css.test.ts`;
  `web/test/token-audit.baseline/screens-b.json`. **Added by amendment 3:** one pre-existing test,
  `web/test/GradebookTable.test.tsx`, for one string on line 61 and the same string on line 119 (task 34).
* **W-75 walk box:** only its own new files: `scripts/walk-box.mjs`, `scripts/walk-box.test.mjs`,
  `docker/walk/entry.sh`, `web/e2e/walk22.lib.ts`, `web/test/walk22-lib.test.ts`, `103_W75_VERIFICATION.md`.
* **PM:** the tiles and the rest of the evidence folder, `walks/walk-22/WALK.md`, `103_PHASE22_REVIEW.md`, `103a_PHASE22_FREEZE_AUDIT.md`,
  `103b_PHASE22_REFINEMENT.md`, `design-system/bb2dash/`,
  `project-state/STATUS.md`, `DECISIONS.md`, `ORCHESTRATOR.md`, this brief. Workers never touch `project-state/`.
  Nobody edits `web/e2e/playwright.config.ts`, `web/e2e/login.mjs`, `web/e2e/walk.ts`, any spec already under
  `web/e2e/`, `web/package.json`, `web/package-lock.json`, `desktop/package.json`, `desktop/vitest.config.mts`,
  `desktop/playwright.config.ts`, any helper or spec already under `desktop/test/e2e/`,
  `web/src/lib/planner-rows.ts` or any `db/` file. `desktop/src/main/update-prompt.ts` left this list with
  amendment 3 (D-1): it is W-67's, for task 27.

Checked against `git ls-files web/src` on a58be34: every `.css`, `.ts` and `.tsx` file falls in exactly one of
the four clusters. Two binary files belonged to no set: `web/src/app/favicon.ico` and
`web/src/app/apple-icon.png` (outside the audit's scope, shipped in Phase 17). Since amendment 3 they are
W-67's, redrawn at task 33 as byte copies of the two desktop icons.

Three crossings, resolved by order, not by shared edits: W-75's task 0 is merged into `feat/styling-22` before
any other worker's first harness run; W-68 adds the one `<ThemeMenu />` line to `TopNav.tsx` after W-67's
`ThemeMenu` commit is on the phase branch; W-67 creates all four baseline JSONs at task 1 and each passes to its
owner from then on. No pre-existing test file is edited except `type-tokens.contrast.test.ts` (at task 3 for
the reader, and at task 8 for the urgency rule) and the allow-list part of `raw-html.audit.test.ts` (its header
sentence, its constants and the two cases that read them). No pre-existing desktop test is edited (amendment 2,
G-3; amendment 3 keeps it so, §The desktop shell). The Upcoming work order gets a new test file;
`UpcomingTracker.test.tsx` checks that the five legend
labels are there, not their order, and stays unedited.

Amendment 3 (H-4) lets three more pre-existing web tests be edited, each by one worker, for the lines named
and nothing else. That makes five, and task 20 counts five:

| File | Owner | What may change | Why |
|---|---|---|---|
| `web/test/type-tokens.contrast.test.ts` | W-67 | as frozen: the reader at task 3, the urgency rule at task 8 | G-4 |
| `web/test/raw-html.audit.test.ts` | W-67 | as frozen: the header sentence, the constants, the two cases that read them | task 9 |
| `web/test/GradebookTable.test.tsx` | W-70 | lines 61 and 119: the string `'last attempt: NEEDS_GRADING'` becomes `'last attempt: needs grading'` | D-5, task 34 |
| `web/test/SubmissionBlock.test.tsx` | W-68 | line 146: the same string, the same change | D-5, task 34 |
| `web/test/upcoming-tracker-css.test.ts` | W-69 | its second case, lines 30-34: it asserts that `.tracker` sets no `scrollbar-width` and no `scrollbar-color` and that the sheet holds no `.tracker::-webkit-scrollbar` rule. Its first case, lines 25-28, is untouched | H-5, task 38 |

Every other pre-existing test stays unedited, the ones a decision comes near included: the two TopNav tests
(default 1 of amendment 3), the files that read a link by a name with its arrow in it (default 2), `SyncButton.test.tsx`
with its four `title` pins (default 10), `queries.grades.test.ts` (the verbatim `attemptStatus` stays),
`status-vocabulary.test.ts`, `planner-css.test.ts`, `NavSearch.css.test.ts`, `CourseSidebar.test.tsx`,
`Workspace.layout.test.tsx` and every file under `desktop/test/`. Four places in the unedited web tests
bind a task of amendment 3 closely, and each has its rule in the contract:

* `queries.grades.test.ts:224` compares the whole label object for a row with no status. `attemptText` is
  left off that object, never set to null (task 8, §The smaller decisions).
* `SubmissionBlock.test.tsx:265` finds the staged label by `getByText`. That one span stays typed text
  (task 31). Line 146 of the same file is the only line W-68 may change in it.
* `course-stream.history.test.tsx:377-413` and `:261-263` read two link labels by value and by text
  content. The two strings keep their values and take their character from `MARK_CHAR` (task 31).
* `TodayLayout.test.tsx:374` reads Home's fold button by a name that begins `Undated`. Its caret is
  `aria-hidden` today and stays hidden (task 31). `web/e2e/harness.spec.ts:33` reads the same name.

A worker that finds one of them failing on
the contract as written does not edit it: it names the test and the line in its verification file and stops
(§Workers, "No waiting inside a spawn").

### Seams

* **Phase 17 (brief 97):** tasks 1–2 did not ride its PR, so nothing binds its workers and no baseline was kept
  since. Its walk harness (`web/e2e/`: `playwright.config.ts`, `login.mjs`, `walk.ts`) hosts both new specs and is
  used unedited: the walk box runs `login.mjs` scripted, and the specs import `walk.ts`'s helpers. The forced
  failed read is `coldCache` + `failReads`. Its R-51 reshape of `usePopover` is reused as is. Its R-50 favicon
  and P-80 `apple-icon.png` and Phase 16's R-36 rule line are shipped (B-23). Its S2-home-2 and S2-materials-1
  changes are in the screens this phase sweeps.
* **`main` while the phase is open:** from task 1 on, a web change that merges to `main` moves the baseline.
  The PM merges `main` into `feat/styling-22` and changes the cluster's baseline JSON in that merge commit, up or
  down, since a count below its baseline also fails. The allowlist stays frozen (P-16); only the baseline moves.
  Stack's open answer on where the Stream's "New and changed materials" block sits (ORCHESTRATOR §4) is not this
  phase's; a move after W-70's sweep is one such change.
* **Phase 21 (brief 102):** the Workspace page is on `main`. It is inventory row 12 and W-70's sweep. Its two
  folders, `web/src/app/(app)/workspace/` and `web/src/components/workspace/`, are in `screens-b`'s prefixes.
  They start at a count of 2, both in `Workspace.module.css:8` (`minmax(14rem, 18rem)`). Its layout is held by
  `Workspace.layout.test.tsx` and `e2e/workspace-layout.spec.ts` (§Contract).
* **94 §3**, row "16, 17, 18, 21 → 22": every screen exists. The row's second half, a token audit baseline
  already in `npm test` when this phase starts, did not happen.
* **The acceptance run (2026-10-07):** ORCHESTRATOR §3 step 9 asks for a pack written with the phase. This phase
  writes none (DECISIONS 2026-10-08). After the merge the PM runs both specs once with `--url` against
  production and records the counts.
* **Sprint 1 objects kept as they are:** `SIDEBAR_BOOT_SCRIPT` and `sidebar-preference.ts` (the pattern the theme
  script copies; not edited), `html[data-sidebar]`, `--sidebar-side`, `SIDEBAR_BREAKPOINT` 1024 (the fold at 720 sits
  below it; ☰ keeps `aria-controls="course-sidebar"`), `GradesTables.layout.test.tsx` (cells stay cells),
  `planner-css.test.ts` and `planner-rows.ts` (geometry), `useHydrated`, `progress-status.ts` labels (copy).
* **Desktop:** the main window's background is the one line changed outside `web/` and the walk box's files
  (B-6 / 91 §6 Q23 default: "the desktop window background is only corrected to match the tokens"). Since
  amendment 2 it is always the app's dark ground, whatever Windows or the stored choice says (G-3). A second
  painted window exists since 2026-09-30, the update prompt (`desktop/src/main/update-prompt.ts`, its own dark
  page with about ten hard-coded colours); it stays dark, and since amendment 3 it is redrawn in direction D.
  Amendment 3 (D-1) widens this seam: `window.ts`, `index.ts` and `update-prompt.ts` change for the title bar,
  the two menus and the failed-load page, and four small modules join `desktop/src/main/` (§The desktop
  shell). The B-6 default quoted above is amended by a DECISIONS row of 2026-10-08. What still does not move:
  the tray, the toasts, the poller, the session reader, the preload's one IPC call, the navigation guards, the
  launch and update scripts under `desktop/launch/`, and packaging (`electron-builder.yml`, D-6). On `main` Electron holds `minWidth: 900`, so
  C-1's 390 px does not reach it; the label cap is what keeps the bar, with search collapsed, inside a 900 px
  page. This brief first said "Electron keeps `minWidth: 900`". The review of amendment 3 amends that
  (default 17): with the title bar the three buttons take 138 px of the bar, so task 27 raises the minimum
  to the idle bar plus the buttons, about 990 px (§The desktop shell, "The minimum width"). The window's
  minimum is its outer size, so the PM looks at the real window at its minimum width
  (acceptance step 5). Containers (Phase 14)
  never touch the renderer (v3 D-20 excludes containerizing the Electron GUI).

### Must respect

DECISIONS rows, verbatim:

* [2026-09-09] "Renderer: CSS Modules + custom properties, **no Tailwind**"
* [2026-09-09] "Workflow SOP: dev on branches, push per completed task, **one PR per phase**, merge only on Stack's word"
* [2026-09-10] "`web/` test harness is vitest + Testing Library (jsdom), versions pinned exact; coverage `include` scoped to `queries.search.ts` until screens gain tests"
* [2026-09-14] "GUI decision 1c amended: ☰ toggles a **course sidebar**, not a pop-down. The rail holds the course list; `.main` drops its `--content-max` cap and fills the rest of the width"
* [2026-09-14] "The sidebar's side is one token, `--sidebar-side` in globals.css, read as a flex-direction (`row` = left, `row-reverse` = right) by the shell row, the drawer wrapper and the rail's hairline" (amended by amendment 3, task 30: the drawer's slide also has a side, written as one sign in `CourseSidebar.module.css`, and a case of `shell-motion.css.test.ts` fails when that sign and the token disagree; moving the side is the token and that sign)
* [2026-09-14] "Sidebar open/closed lives in `html[data-sidebar]`, stamped by an inline boot script before first paint and owned by React after mount; the choice persists in `localStorage['bb2dash.sidebar']` with the viewport default (open ≥1024px) as the fallback"
* [2026-09-14] "**Definition of done for every remaining phase = SOP gates + Stack's acceptance script** walked on the Vercel preview; sign-off once per phase, at the PR"
* [2026-09-14] "**Every task carries an executable check** (test, SQL assertion, curl, screenshot diff) the worker runs itself, plus one demo line for the acceptance script; a task without a check is not a task"
* [2026-09-14] "Styling direction is decided **after functionality is achieved**; Phase 13's DoD is fixed now (every screen on tokens, light + dark, Stack approves each)"
* [2026-09-16] "A client screen that hydrates inside a Suspense boundary and reads the persisted query cache or the clock renders a placeholder until hydrated (`useHydrated`, `useSyncExternalStore` with a false server snapshot); `/planner` is the first"
* [2026-09-16] "Phase 10b's browser walk: **four findings fixed in PR #15 (round 3)** — grades-table cells kept as table cells (a 10a `display: flex` on `th`/`td` misaligned every Grades table, production included), … **three carried to Phase 13** as named exceptions to its no-layout-change rule (phone-width overflow, per-exam rank weights, favicon)"
* [2026-09-16] "Phase 14 research calls, proposed (frozen when its PM session runs): … images build locally, no registry or CI; …"
* [2026-09-17] "Opening a course **closes the courses sidebar for that navigation without writing the saved preference**"
* [2026-09-22] "**Sprint 1 closed; Phase 13 (styling, R-21) skipped, not cancelled.** More development phases come first; C-1..C-3 stay parked in `docs/planning/sprint-2/parked/81_PHASE13_styling.md`"
* [2026-09-23] "**Sprint 2 planning proceeds stage to stage without a stop**; the PM stops only where Stack's input is required (his §3 fields, the question batch, the phase-plan approval) and otherwise proceeds on stated defaults, each recorded here when adopted"
* [2026-09-24] "**Sprint 2 is planned on stated defaults, all provisional:** … No product call in them is adopted here: each gets its own row, dated the day Stack answers, and a brief may not cite a default as decided before then" (the three rows below are those rows)
* [2026-09-27] "Batch item 6 (B-6), S2-styling-1: default. Should, last in the sprint (Phase 22). Stack picks from three style-tile directions shown as live Artifact pages. A three-state Auto / Light / Dark control goes in the top-nav account menu as a named exception. The token audit lands early, as a test-only ratchet with Phase 17. C-1, the phone-width nav, stays with styling. Stack's own step: Stack picks one of the three style tiles, then ticks each screen in light and dark on the preview (his 2026-09-14 DoD). This must happen before the Nov 30 code freeze or after Dec 13." (two sentences are amended on 2026-10-08: the "lands early" sentence, and in "Stack's own step" who ticks each screen, which for this phase is the PM, in the walk box; amendment 2 of the same day amends two more: the directions were shown through one walkthrough page and a fourth tile is the direction, and the control reads Dark / Light / Auto with Dark as the default)
* [2026-09-27] "Batch item 23 (B-23), Phase 13 carry-ins (Q14): default. Two carry-ins ship early: C-2's rank-weight rule line in Phase 16, and C-3's favicon (the eclipse-ring icon plus apple-icon.png) in Phase 17. C-1 (phone width) stays with the styling phase (22). This amends the 2026-09-22 row that parked C-1..C-3."
* [2026-09-27] "Batch item 24 (B-24), Phone-width nav (Q15): default. At phone width the top bar folds its page links (Workspace included once Phase 21 adds it) and Search into one Menu. The fold happens at the existing 720 px step, replacing today's hide-Search step. The Menu is reachable by keyboard and kept apart from ☰. It is built in Phase 22 with C-1." (amended on 2026-10-08: the Menu holds the six pages only)
* [2026-09-30] "**Search collapses to an icon.** The top bar's wide "Search ⌘K" button becomes one search icon; a click (or ⌘K / Ctrl+K) expands it in place into a "Search materials" field, and results show in a panel anchored under it." Its reason, also verbatim: Stack, 2026-09-30: "reimplement search but only as a search icon (that expands when clicked to show the text field) as the feature is seldom used."
* [2026-10-07] "**Acceptance run · a phase's acceptance walk is carried out by a Claude session in a disposable sandbox container, the host does the Docker steps and checks the facts itself, and a fully green run counts as acceptance.**" ORCHESTRATOR §3 step 9 adds: "The pack is written with the phase, in the phase's own PR: three files and one browser-test file." (not applied to this phase, on Stack's words of 2026-10-08 below)
* [2026-10-08] Stack, on this phase's nine open items: "test this by spinning up a testing container and walking the PR yourself. IF there are explicit taste decisions to be made, call out where to look and I will deliberate on those manually."
* [2026-10-08] Stack, on the direction (the row "Phase 22 direction: tile D (Charcoal)"): "For design direction, I would like to go with a dark mode (light mode version also available, dark mode default) style and take the selections and combine them with inspiration of folk Web 26 and 97 (recent pngs in downloads on this device). Accent colors should be grey, white, and #ff0000 red, pick a color pallete accordingly. This app is functionally a dashboard interface for all of my classes."
* [2026-10-08] Stack, on the work-type colours, in the walkthrough: "need a different color code, one that indicates importance/urgency by color (i.e. exams and projects most urgent, quizzes below that, then assignments, and at the bottom readings)."
* [2026-10-08] Stack, on the refinement pass (the row "Phase 22 refinement pass"): "Tell phase 22 to use /ui-ux-pro-max during its design execution to sharpen the visual aspects to make this feel like a high-end full production centralized content and schedule interface dashboard. The end goal of the graphic design is to have a sleek, modern tech design with minimal motion animations and graphics. This still feels like an electron app and I want it to feel like a professional grade application."
* [2026-10-08] Stack, the same afternoon: "insert the /ui-ux-pro-max skill usage requirement as a new pass prior to the beginning of the visual build. This should be a separate refinement pass after the current phase of work builds."
* [2026-10-08] Stack's five decisions on the pass, by the label he chose (the row "Phase 22 refinement: Stack's decisions D-1 to D-5"): "Inside Phase 22"; "Titles and dates"; "Panels also animate out", "Smooth sidebar and search", "Bar icons at one weight"; "Keyboard polish"; "App icon in the new look", "Tidy captions and codes", "Meeting days as outline", "Larger click targets".

Frozen brief lines this phase inherits (81, 2026-09-14 and 2026-09-16; 80c, 2026-09-16), verbatim:

* 81:17-19 "Definition of done: **every screen on tokens, light + dark, Stack approves each** — no hard-coded colours or sizes outside `globals.css`; both themes render; a per-screen preview checklist he ticks." (For this phase the PM ticks each surface line and Stack rules on the listed taste calls: DECISIONS 2026-10-08.)
* 81:50 "No layout, copy, or behaviour change: the screen tests from earlier phases pass unchanged."
* 81:67-69 "They are **named exceptions** to the DoD's "no layout, copy, or behaviour change" rule; each needs its own check and a line in the acceptance checklist."
* 81:73 (C-1, Expected) "no horizontal page scroll at 390 px on every route; wide tables scroll inside their own container"
* 81:79-80 "New screens, behaviour changes (except C-1 to C-3 above), Tailwind or any UI framework, new dependencies."
* 80c:47 "Phase 13's C-1..C-3 stay in 13 unless Stack moves them." (B-23 moved C-2 and C-3 out on 2026-09-27.)

## MVP (in Stack's words)

Stack's own words for this phase are six. The fourth, on the direction, and the fifth and sixth, on the
refinement pass, are at the end of this section.
"styling", which he wrote for S2-styling-1 on 2026-09-23, filed under
"cleaning" (91 §3.3; his other four fields there still read "_to confirm_"). The DECISIONS 2026-09-14 row
recorded as "Stack's answer" to the MVP questionnaire: "Styling direction is decided **after functionality is
achieved**; Phase 13's DoD is fixed now (every screen on tokens, light + dark, Stack approves each)". And, on
2026-10-08, how the phase is tested: "test this by spinning up a testing container and walking the PR yourself.
IF there are explicit taste decisions to be made, call out where to look and I will deliberate on those
manually." *PM wording, not his:* the PM's record of the 2026-09-14 answer
(`docs/planning/sprint-1-hub/70_MVP_INDEX.md` §1.8, line 82, under §1's "Recorded verbatim in intent") reads:
"**Every screen on tokens, light + dark, Stack approves each**: no hard-coded colours or sizes outside
`globals.css`; both themes; per-screen preview checklist." The parked brief's MVP line (81:23-24) is headed "in
Stack's words" but traces to no recorded answer, so it is treated as PM wording. *PM wording, built on the
answers above:* "I compared three style tiles, picked B, and said what I wanted changed. The PM showed me a
fourth, tile D, and built on it. Every screen and overlay on the checklist is in that direction: dark by
default, with a light version. Work types are coloured by urgency, exams and projects in red, then quizzes,
assignments and readings. The PM walked each pair in a test container, ticked it, and listed the taste calls
for me with where to look. The account menu lets me choose Dark, Light or Auto and remembers what I chose; it
starts on Dark, and Auto follows Windows. At phone width nothing scrolls sideways: a Menu button holds the six
pages, Search stays an icon in the bar, and wide tables and the planner week scroll inside their own boxes."

His fourth, on 2026-10-08, after the walkthrough: "For design direction, I would like to go with a dark mode
(light mode version also available, dark mode default) style and take the selections and combine them with
inspiration of folk Web 26 and 97 (recent pngs in downloads on this device). Accent colors should be grey,
white, and #ff0000 red, pick a color pallete accordingly. This app is functionally a dashboard interface for all
of my classes." His four notes from the walkthrough are in the DECISIONS row of that day.

His fifth, the same afternoon, on how the build should look and feel: "Tell phase 22 to use /ui-ux-pro-max
during its design execution to sharpen the visual aspects to make this feel like a high-end full production
centralized content and schedule interface dashboard. The end goal of the graphic design is to have a sleek,
modern tech design with minimal motion animations and graphics. This still feels like an electron app and I
want it to feel like a professional grade application." His sixth, on when: "insert the /ui-ux-pro-max skill
usage requirement as a new pass prior to the beginning of the visual build. This should be a separate
refinement pass after the current phase of work builds." *PM wording, built on those two and on his five
decisions (§Freeze record, amendment 3):* "The desktop app looks like an application. Its own bar is the
window's title bar, with Windows' three buttons in the app's colours. The bar and the side panel stay put and
the page scrolls under them. Controls ease, answer a press and show one focus ring; menus arrive from their
button and leave again; nothing else moves. Titles are in the serif and labels in the sans. A right click in a
field gives Cut, Copy and Paste. If the app cannot load I get a page with Retry, not a blank window. The taskbar
icon matches the app."

## Definition of done

SOP gates. Each command is run by itself and its exit code is recorded; no result is read through a pipe.

- [ ] In `web/`: `npm run typecheck` → exit 0; `npm run build` → exit 0; `npm test` → exit 0, 0 failures, test
      count not below 2913 (`main`'s last recorded count, STATUS "Acceptance run", 2026-10-08);
      `npx eslint . --max-warnings 0` → exit 0 (the `lint` script itself has no flag);
      `npm run test:coverage` → exit 0 (the `lines: 83` floor holds, the two new modules included).
- [ ] In `desktop/`: `npm run typecheck` → exit 0; `npm test` → exit 0, 0 failures. Since amendment 3 the
      shell changes (D-1), so two more gates are no longer conditional: `npm run test:e2e` → exit 0, 0 failed
      (the three old specs unedited, and the new `chrome.spec.ts`); and the packed-build smoke: `npm run pack`
      → exit 0, then `test -s desktop/dist/win-unpacked/bb2dash.exe` → exit 0 and
      `test -s desktop/dist/win-unpacked/resources/app/build/icon.ico` → exit 0 (from the worktree root), and
      the PM's desktop look runs on that packed build (acceptance step 5). `mcp-server/` is not touched:
      `git diff --quiet origin/main...HEAD -- mcp-server` → exit 0.
- [ ] The existing browser layout specs, in the walk box:
      `node scripts/walk-box.mjs web/e2e/workspace-layout.spec.ts web/e2e/workspace-acceptance-helpers.spec.ts`
      → exit 0.
- [ ] `/code-review main high`, twice: once when the sweep commits are pushed and before the final merges, so
      findings go back to the same workers as a numbered round 2; once on the integrated branch. The first run
      needs a tree that holds all four sweeps, and `feat/styling-22` does not yet: the PM cuts a scratch branch
      `review/styling-22-sweeps` from `feat/styling-22` in a worktree of its own (`bb2dash-wt-22-review`), merges
      the four worker branches into it locally and runs the review there. That branch is never pushed, and it and
      its worktree are removed after the review. Since amendment 3 the first run reads the sweeps with each
      worker's parts of tasks 28 to 38, and the second, on the integrated branch, is also the review of tasks
      26 and 27, which land after the sweeps; its findings go back to W-68 and W-67 as a numbered round. Every
      CRITICAL and HIGH finding fixed or declined by Stack, recorded in `103_PHASE22_REVIEW.md` (task 23).
- [ ] `/security-review`: **required**, because the phase adds an inline script to the root layout of every page
      and reads a stored value into it (`localStorage['bb2dash.theme']`). Since amendment 3 it also reads the
      desktop shell's changes: the window's options, the two menus, the failed-load page (a `data:` page in
      the main window, with a link to the app's address) and the redrawn update prompt. The security baseline
      of `WEB_PREFERENCES` (`window.ts:49-56`) and the preload's one IPC call do not change.
- [ ] "0 failures" is read against `web/` and `desktop/` only. Three SQL units fail on `main` on production's
      course data and are not this phase's: `grading_invariants.sql`, `phase18_122_supersede_rule.sql` and
      `phase18_golden_truth.sql` (STATUS, Known issues). No check here runs the SQL suite.
- [ ] STATUS, DECISIONS and ORCHESTRATOR updated in the PR. Six rows were written with the freeze on 2026-10-08:
      Stack's answer; the B-6 amendment; the B-24 amendment; the allowlist A1–A5; the walk box, no committed
      screenshot and no acceptance pack; the desktop window and the update prompt. Four more were written with
      amendment 2 the same day: the direction, tile D (task 7); the scope, with the component-level changes and
      the two named behaviour changes; the theme default, with the control's three choices, its storage key and
      the desktop window; the work-type urgency scale in place of the five-hue rule. Four more were written
      with amendment 3 the same day: the refinement pass, with his two sentences and what it produced; his
      decisions D-1 to D-5, with what he did not choose; the scope amendment 3 reverses (the desktop shell
      beyond its background, and the frame); the PM's rulings on rows 23, 29, 34 and 35. Rows still owed in
      the PR:
      Phase 22 carries R-21's DoD and C-1 (81's Contract superseded, Phase 13's number retired);
      `tokens.module.css` audited, not exempt; the ratchet in `npm test` in place of CI; the root layout in the
      raw-HTML allow-list (task 9); and each taste call T-6 to T-11 as Stack rules on it. (The three
      pre-existing tests amendment 3 lets a worker edit, and the zoom keys leaving the desktop menu, are in
      amendment 3's rows already.) Two more are owed since the review of amendment 3: the desktop window's
      minimum width, raised from 900 px for the title bar (default 17, task 27); and the side panel's side
      as one token and one sign, which amends the 2026-09-14 row (default 19, task 30).
      STATUS records the bar width task 5 measured, and drops "the app shell 1 px taller than its window" from
      Known issues once task 26 is in.
- [ ] PR open from `feat/styling-22`; its Vercel preview answers 200 on `/login`; the PR body names the preview
      and links `WALK.md` with its "Taste calls for Stack" list (anything visual goes in front of him before
      merge, SOP).
- [ ] The PM stops at "ready when you say so": merge to `main` only on Stack's word in that conversation
      (DECISIONS 2026-09-09, SOP). No merge inside the Nov 30 to Dec 13 code freeze (DECISIONS 2026-09-27): the
      taste calls fall before it or after it. The direction is already in.

The acceptance script. It is the PM's walk, in the walk box, on the phase branch's build (DECISIONS 2026-10-08).
No `acceptance/22/` pack is written.

1. **Theme control and storage** (as amended, G-3). Task 22's run. Every `[dark]` case stores nothing and
   emulates a **light** system: the page is dark all the same, which is the default. Every `[light]` case stores
   `light` once, before its first load and not again on a reload, and emulates a **dark** system: the stored
   choice wins. In both, `html[data-theme]` and the body background are the case's theme. The two
   `25 account-menu` cases also walk the control. `[dark]`: the rows read Dark, Light, Auto and Dark is checked;
   pick Light and the page follows and the key is `light`; reload and it is still light; pick Dark and the key
   is gone and the page is dark. `[light]`: Light is checked; pick Auto and the key is `auto` and the page
   follows the emulated system, so it turns dark; change the emulated system to light and the page follows
   without a reload; reload and it still follows; pick Light and the key is `light`. Each case ends, and is
   shot, on its own theme. The two `13 login` cases show the same on a public page: nothing stored is dark
   under a light system, and a stored `light` is light.
2. **The 62 surface lines** (60 before amendment 3). Task 22's shots. The PM or an independent checker opens
   every one of the 62 shots and judges it against its surface and against direction D (`tile-d.html`, the
   refined tile): the right screen, on its theme's
   ground, nothing unreadable, nothing left in the other theme's colours, and red only where D puts it (where
   you are, the most urgent work, what is unread, and `#ff0000` never as words). On the shots that show Upcoming
   work (rows 01 and 07) the legend reads exam first and each day's most urgent bar is on top. Since amendment
   3 the checker also looks for what a still shot can show of it: titles in the serif and labels in the sans;
   a plain day outlined and a meeting day filled in a course card's week strip (row 01); no caption line under
   the Courses heading, the tracker or the planner (rows 01 and 02); the bell and Sync drawn like the bar's
   other icons; on row 31, the bar and the side panel in place over the end of a long page. The shots of
   rows 01 to 12 hold the whole screen, because each case makes its window as tall as the bar plus the pane
   before it shoots, so every part its inventory row names is in the shot and is judged in both themes. One
   tick and one note per line in `WALK.md`.
3. **390 px.** Task 21's run: no route scrolls sideways; the planner week and the IST.466 table scroll inside
   their own boxes. Since task 26 that is measured on the content pane as well as on the page. The six phone
   shots are opened and judged. The C-1 line is ticked.
4. **The Menu by keyboard.** Task 21's reachability cases: the first Tab stop is "Skip to content" (D-4), and
   Enter on it puts focus on the content pane; Tab to Menu, Enter opens it, Tab reaches Home,
   Planner, Inbox, Grades, Materials and Workspace in turn, Escape closes it and focus is back on Menu; the
   search icon is reached by Tab in the bar and opens the field. ☰ still opens the courses drawer. Bell and
   Activity open fully on screen. The account menu's arrow keys, the focus that returns and the toast's timer
   are proven in `shell-keyboard.test.tsx` and `SyncButton.toast-timer.test.tsx` (task 32); the PM tries each
   once by hand in the desktop look and notes it there.
5. **The desktop look** (as amended, G-3, which calls this step 6; widened by amendment 3, D-1). The PM builds a
   second desktop instance from
   the phase worktree (`desktop/`, its own `--user-data-dir`, `BB2DASH_APP_URL` pointing at a local `next start`
   of the branch, as Phase 21's walk did). Since amendment 3 it is the packed build: `npm run pack`, then
   `desktop/dist/win-unpacked/bb2dash.exe`, so the look covers what he will run. The PM launches it in whatever
   mode Windows is in: **the desktop window
   opens on the app's dark ground with no lighter frame first.** The instance has nothing stored, so the page
   that follows is dark too. The PM does not change the laptop's Windows theme, and Stack's running desktop app
   is never touched. A person who picked Light sees one dark frame at each open; that is accepted, written down
   and named in `WALK.md`, not walked. The PM then drags that second window to its minimum width and records in
   `WALK.md` the
   page's inner width and whether the page scrolls sideways there, with the Sync label idle and search
   collapsed. The minimum is the window's outer size, and since task 27 it is `MIN_WIDTH`, about 990 px where
   `main` has 900 (default 17 of amendment 3). This is the one look at the real window that no browser case
   can give: in a browser the three buttons take no room. With the label idle and search collapsed the bar
   must fit at that minimum, all five icons clear of the three buttons and no sideways scroll. If it does
   not, that goes back to W-67 as a finding before the PR. What a long Sync label does there is recorded and
   named in the PR body, not fixed (§Out of scope). The toggle line is ticked after steps 1 and 5.

   What amendment 3 adds to this look (H-6; REFINEMENT §11, point 10). No browser in the walk box can reach
   these, so each is proven in a desktop test (task 27 or 33) and seen once here, and each is one line of
   `WALK.md` that begins with the words in bold:
   * **Desktop title bar:** one bar. The app's bar is the window's title bar: the window drags by it, its
     buttons and links still press, and Windows' three buttons sit at its end in the bar's colours. The PM
     picks Light in the account menu and the three buttons follow; picks Dark and they follow back. With the
     account menu open its first row presses and the window does not drag. With a popout open its close
     button presses: the bar is not a drag region under a dialog. The PM reads the three buttons' real
     width once in the developer tools (`innerWidth` minus
     `navigator.windowControlsOverlay.getTitlebarAreaRect().width`) and writes it beside `CONTROLS_WIDTH`,
     138; a wider measure goes back to W-67.
   * **Desktop menus:** a right click in the search field gives Cut, Copy, Paste and Select all; on selected
     text outside a field, Copy; on empty space, nothing. The PM presses Alt and writes down what shows. Reload
     and the developer tools answer their keys. The zoom keys do nothing.
   * **Desktop failed load:** a second launch with `BB2DASH_APP_URL` set to an address nothing listens on shows
     the failed-load page in direction D, and the window drags by its top strip. Retry tries again.
   * **Desktop update prompt:** the flow never shows it under the test variable and the instance has no newer
     build, so the PM opens the page itself. `promptHtml()` is a pure export
     (`desktop/test/unit/update-prompt.test.ts:55` imports it). Once `npm run pack` has built `desktop/dist`,
     from `desktop/`:
     `node -e "require('fs').writeFileSync(process.argv[1],require('./dist/main/update-prompt.js').promptHtml())" "C:/Users/stack/.bb2dash-walk/22/update-prompt.html"`
     → exit 0. The file is outside every repository. The PM opens it in a browser and the line says what it
     shows: the dark ground, a filled ink pill for Update now, grey pills for the rest, no blue. Its colours
     are pinned by `shell-pages.test.ts` as well. The command was written from the module's exports and is
     first run by the PM; if the module will not load outside Electron, the line says so and gives the test.
   * **Desktop icon:** the taskbar button, the window's corner and the tray show the square mark in greys.
   * **Desktop scrollbars and motion:** in both themes every box that scrolls shows the app's scrollbar, and
     the page's own starts under the bar (the walk box's headless browser draws none). Motion is looked at
     here with motion on, because both walk specs run with reduced motion. The PM opens the popout, the
     account menu and the bell and writes whether any stutters; the fallback is `--motion-enter-lg: 0ms`.
     The PM closes each of the three and sees it fade out (exception 7), then opens search and sees the
     field fade in, and in a window under 1,024 px opens the courses drawer and sees it slide in from its
     side while its scrim fades (exception 8). If the desktop window's minimum turns out at 1,024 px or
     more, the drawer is looked at in a browser on the same build. In each theme the PM also rests the
     pointer on a bar link, a side panel row, a course card and a pill button that writes nothing (the
     planner's New event, then Cancel), holds each once, and writes that each showed its hover and its press
     and which pointer it had (pre-delivery lines PD-4 and PD-6).
     The line ends with `process.versions.chrome`, read once from the instance's log or developer tools.

   Stack's running desktop app is never touched, and no real sync, no real update and no real done box is
   pressed in this look.
6. **Taste calls** (as amended, G-6). `WALK.md` lists each explicit taste decision with the surface, the theme,
   what to look at, where (the preview URL and the shot's file name) and the PM's default. The list opens with
   the five already put to Stack with tile D, each with the default taken: T-1 dark even under a light system;
   T-2 the urgency scale for work types; T-3 flat reds, not striped ones, for exam and project (the limit is
   named: without colour vision an exam bar and a reading bar are the same grey); T-4 the brand square and the
   focus ring in the ink, not in red; T-5 the type as picked (Source Serif 4, Source Sans 3, Source Code Pro).
   Six follow from amendment 3, each with the default this brief took. The review of the amendment added no
   number: where the build is narrower than a decision's words, or turns a label round, that is a clause of
   the call it belongs to. T-6 the window: the zoom keys left out of the app's menu, and what Alt shows; and
   the window's minimum width, about 990 px where it was 900, so the bar clears the three buttons (default
   17). T-7 type: which dates left the code face (the Inbox card's values and the two "seen" stamps) and
   which stayed (the planner's hours, the tracker's day numbers); the three small titles left in the serif;
   and one small title moved to the sans, the planner popover's heading. T-8 motion: the times as built, for
   his eye; the side panel switching with no motion on a wide window; `--motion-state: 0ms` if he wants
   less; and the four panels that arrive with motion and close at once: the planner's item popover, its
   event form, its new-event wizard and the Inbox apply panel (default 18). T-9 words: the attempt status
   in words ("needs grading", "in progress", "completed"), and the four captions kept as tooltips, not
   deleted. T-10 marks and shapes: the bell and Sync as redrawn; a right arrow after a link drawn as a
   caret; the size of the square on the app's icon; and the week strip, built with a meeting day filled and
   a plain day outlined, the other way round from the label he chose, "Meeting days as outline" (default
   16; look at a course card on shot 01). T-11 targets, keys and labels: the planner's done box is 24 px
   tall and not 24 px wide, by design; the arrow keys are in the account menu only, and Bell's links and
   the phone Menu's keep Tab (default 14); Sync keeps Windows' own tooltip while the five icons beside it
   get the drawn label (default 10).
   Later ones are added as the walk finds them, from T-12 on.
7. **Stack's part.** The direction is his and is in (task 7). What is left is the taste calls. Then "merge", or
   what to change.
8. **The pre-delivery checklist** (amendment 3, H-1; filled by the PM before step 7, and numbered 8 so that
   steps 1 to 7 keep their numbers). The 13 lines of the design system's own checklist
   (`design-system/bb2dash/MASTER.md`, "Pre-Delivery Checklist"), each a tick line in `WALK.md` that begins
   `PD-1` to `PD-13`, each with where its proof is: a named command of §Task list, a test, a walk run or a line
   of step 5. A line that cannot be ticked stops the PR. The proof each line points at:

   | Line | The checklist's line, in short | Where its proof is |
   |---|---|---|
   | PD-1 | every colour, radius, shadow, time and curve is a token | Baseline sum → 0 and Audit green; Time check prints nothing (task 20) |
   | PD-2 | no module gains a `color-mix()` or a size literal | Baseline sum → 0 and Audit green (task 20); the allowlist unchanged since task 2 |
   | PD-3 | red only as a mark, for the three things it means | Red files → exactly nine lines (task 20); the 62 shots judged for red (step 2) |
   | PD-4 | every control has hover, press, focus and switched-off states, in both themes | focus: Ring check → `<n> 0 0`. Switched off: Strength check → `<n> 0`, Field check → `5 5 5` and the five-line `:disabled:not([aria-busy` grep. All at task 20. Hover and press: the `transition: var(--motion-control)` and `var(--color-surface-press)` greps of tasks 16 to 19, and the PM's hand in both themes (step 5, the scrollbars and motion line) |
   | PD-5 | one focus ring, 2px of the ink | Ring check → `<n> 0 0` (task 20); the Direction check holds `--size-focus` |
   | PD-6 | the pointer on what acts, `not-allowed` on what is off, `progress` on what is busy; no busy control dressed as off | Busy sites → `24 24`; the five-line grep, whose five rules hold `cursor: not-allowed` (task 37); the `cursor: progress` grep (task 20); the pointer the PM reads in step 5 |
   | PD-7 | text 4.5:1 and marks 3:1, measured in each theme | `theme-contrast.test.ts` and `type-tokens.contrast.test.ts` (task 8; in `npm test` at task 20) |
   | PD-8 | what moves, moves by transform and opacity | `shell-motion.css.test.ts` and the `width` grep (task 30) |
   | PD-9 | reduced motion stops every transition and animation and keeps the loading wait | the `motion off under reduced motion` case (task 22); the one reduce block of `globals.css` (task 8's grep), from which the PM quotes the declaration that keeps the wait |
   | PD-10 | every box that scrolls shows the themed scrollbar, in the real window, in both themes | step 5, the scrollbars and motion line; task 38's grep for the Upcoming strip |
   | PD-11 | no sideways page scroll at 390px; wide tables scroll in their own box | task 21's run: 54 passed, and `pane scrollWidth=` 24 times |
   | PD-12 | the 18 layout tokens and the planner's geometry are as they were | `theme-tokens.test.ts` (the 18 equal `main`'s, task 8); `planner-css.test.ts` and 0 stale A3 entries (`npm test`, task 20) |
   | PD-13 | no new dependency | task 20's `git diff --quiet` over the four package files and the two vitest configs → exit 0 |

After the merge, not a gate of the PR: `node scripts/walk-box.mjs --url https://web-xi-ten-uy9xk6c6p0.vercel.app
web/e2e/phone-width.spec.ts web/e2e/theme-walk.spec.ts` once, and the two counts go into STATUS.

What proves each requirement in scope:

* **R-53:** the four baseline JSONs sum to 0, unresolved references 0, the allowlist unchanged since task 2
  (tasks 16–20); `theme-contrast.test.ts` and `type-tokens.contrast.test.ts` green in both blocks (task 8); the
  Direction check and the New names check (tasks 8 and 20); the red marks in nine files and no others, and 13
  composed error notices (task 20); 62 walk shots opened and judged (task 22); 77 ticked lines in `WALK.md`
  (task 25).
* **The refinement pass, default build (rows 1 to 16):** the Direction check at `125 0 77 0 true`, the New
  names check at `34 0 0`, the Time check printing nothing, the Ring check at `<n> 0 0`, and for rows 2, 3
  and 6 the Field check at `5 5 5`, the No-select check at `10 0 0` and the Strength check at `<n> 0` (task
  20); the `motion off under reduced motion` case (task 22); the scrollbar and motion line of the desktop
  look (step 5).
* **D-1:** task 26's greps and its `31 frame-scrolled` cases; the pane measure in the 54 phone-width cases
  (task 21); task 27's desktop unit tests, `npm run test:e2e` with `chrome.spec.ts`, the packed-build smoke and
  the six desktop lines of `WALK.md`, the look at the window's minimum width among them.
* **D-2:** the Serif check at `8 0 0` and the two `tokens.mono` greps (task 28).
* **D-3:** `useExit.test.tsx` and the Exit tokens check at `3 0` (task 29); `shell-motion.css.test.ts` (task
  30); the Mark characters command at `0 0` with no test edited, and the seven `<MarkedLabel` greps (task
  31); the closing panels, the drawer and the search field seen with motion on (step 5).
* **D-4:** `shell-keyboard.test.tsx`, `SyncButton.toast-timer.test.tsx` and the reachability cases (task 32).
* **D-5:** `app-mark.test.ts` and the two `cmp` lines (task 33); the three changed strings and
  `queries.grades.attempt-text.test.ts` (task 34); `today-week-strip.css.test.ts` (task 35); the two target
  tests and the `planner targets` case (task 36).
* **H-5:** the Busy sites command at `24 24` (task 37); `upcoming-tracker-css.test.ts` as edited (task 38).
* **R-46:** `phone-width.spec.ts` → 54 passed, 0 failed in the walk box on the integrated branch (task 21),
  after it failed first on `/course/IST.466/grades` (task 5).
* **S2-styling-1:** four tiles and the walkthrough page committed, and the "Phase 22 direction" DECISIONS row
  naming tile D (tasks 6–7). Since amendment 3 tile D is in the folder twice, as refined and as first shown,
  which makes five tile files.
* **P-15:** `token-audit.test.ts` runs in `npm test` and its fixture cases pass (task 1).
* **P-16:** `git diff --quiet` of the allowlist since task 2 exits 0 (task 2).
* **P-17:** the fixture case "a light block does not move the dark ground" passes (task 3).
* **P-76:** the boot-script cases of `theme-preference.test.ts` (task 9) and 0 hydration messages in the theme
  walk (task 22).
* **P-77:** `ThemeMenu.test.tsx` (task 10).
* **P-78:** the `color-scheme` cases of `theme-tokens.test.ts` (task 8).
* **P-79:** the reachability cases of `phone-width.spec.ts` (task 21).

## Task list

Commands are Git Bash and run from the root of the worktree named, unless they start with `cd`. **No check reads
a result through a pipe.** Each command is run by itself and its exit code is recorded; where a count is wanted
the command prints it itself. "Prints nothing" means no output; `git grep` and `grep -rl` then exit 1.

"Harness run" is the walk box (§Contract). A worker's harness run (tasks 0, 5, 13, 14, 15, 16, and since
amendment 3 tasks 26 and 36) starts from that
worker's own worktree, on its own build, without `WALK_SHOTS`. The PM's runs (tasks 20, 21, 22) start from
`bb2dash-wt-22` on the integrated branch; tasks 21 and 22 are the only runs with `WALK_SHOTS=1`, so they alone
write screenshots.

Every harness run is started in the background, never inside a tool call that can end before it (§Contract, the
walk box, "Time"). A run's result is `exit_code` and `result` in its `<run id>/run.json`, read when the run has
ended, together with the count line in its `stdout.log`. "Exit 0" in a harness check means `"exit_code": 0` and
`"result": "passed"` there. A run whose `run.json` still reads `"result": "running"` once its container is gone
was cut short: it does not count and is repeated.

Workers sync by merge, never by rebasing a pushed branch. The PM merges W-67's tasks 1–2 into `feat/styling-22`
first (the branch's first code commits), then W-75's task 0. W-68 is spawned once both are merged, because task 5
needs `walk22.lib.ts` and tasks 12–13 need `shell.json`. The harness runs of tasks 14–15 need W-68's spec and its
fold, so W-69 and W-70 are spawned only once the PM has merged W-68's task-12 commit, which carries task 5. A
worker begins its spawn, and each resume, by merging `origin/feat/styling-22` into its branch. No worker waits
inside a spawn for
another worker's commit (§Workers has the start table and the rule for a worker that finds something missing).

The phone-width spec's test titles are frozen so `-g` selects them, **54 cases** in all:
`route <path> [<theme>]` for the path of each inventory row 01–16, in that order, the path without its query
string (16 × 2: `/`, `/planner`, `/inbox`, `/announcements`, `/grades`, `/materials`, `/course/IST.352/stream`,
`/course/IST.471/classwork`, `/course/IST.466/grades`, `/course/IST.466/info`,
`/course/IST.471/assignment/IST.471/a1-proposal`, `/workspace`, `/login`, `/privacy`, `/terms`, `/no-such-page`;
the `/workspace` case opens row 12's fixture conversation and the `/login` case is walked signed out);
`popout assignment [<theme>]` (1 × 2); `open state <n> <name> [<theme>]` (the seven of §Contract, run on `/`,
7 × 2); `reachability [<theme>]` (1 × 2); `sidebar toggle` (1: ☰ still toggles `html[data-sidebar]`);
`unfolded bar at 721` (1: viewport 721 × 900, idle label; it prints the line
`unfolded bar at 721: nav scrollWidth=<n>` and asserts only that the nav is visible, so it passes whatever width
it prints); `bar at 390 longest label` (1: the longest Sync label forced through `quietSync`; nav `scrollWidth`
≤ 390); `bar at 900 longest label` (1: viewport 900 × 700, unfolded, longest label, search collapsed; nav
`scrollWidth` ≤ 900, printed). The theme-walk spec's titles are frozen too, **64 cases** since amendment 3 (60
before): `NN <slug> [<theme>]` for the 31 inventory rows (62); `motion off under reduced motion` (1); and
`planner targets` (1). The two new cases are not surfaces and take no shot. `motion off under reduced motion`
(H-6) runs as the whole spec does, with reduced motion emulated: it opens the account menu and finds, on the
panel's first frame, an opacity of 1 and a computed `transition-duration` of `0s`, and reads a computed
`--motion-exit` of `0ms` from the root. `planner targets` (default 5 of amendment 3) opens `/planner` over an
intercepted fixture week that holds one task event, as row 21 does with a series row: the element at the
title's first pixel is the title and not the done box; the element at the done box's centre is the checkbox;
a press on the title's first pixel opens the event and `assertNoWrites` holds. It never presses the done box.

Fonts, in both specs. `globals.css:18` loads Inter with `display=swap`, so text paints in a fallback font first,
and a bar measured in the fallback is narrower than the real one (audit estimate: about 847 px against about
876 px). Every case that reads a width, and every shot, first awaits `document.fonts.ready` and asserts that
`document.fonts` holds a face of the first family `--font-body` names (Inter today; Source Sans 3 from task 8
on) with `status` `loaded`. A plain `document.fonts.check()` is not enough: it also answers true when the
font file never arrived. A width or a shot taken in the fallback font does not count.

Who proves which case. Each of the 54 has a worker-level green run before the PM's at task 21: W-68's task 13
runs 22 (the open states, reachability, the three bar cases, the sidebar toggle and the popout), W-70's task 14
runs the 16 route cases of rows 05–12, W-69's task 15 the 8 of rows 01–04, and W-67's task 16 the 8 of rows
13–16 (22 + 16 + 8 + 8 = 54). A worker fixes a failing case in its own files. A case that fails because of an
element in another worker's file is not fixed there: the worker names the element and its file in its
verification file and follows the waiting rule of §Workers.

"Fingerprint" is one read-only select, run through `execute_sql` just before and just after each `WALK_SHOTS`
run (every column confirmed in `db/migrations`: 001, 031, 032, 033, 057, 067, 082, 140):

    select md5(f::text) as fingerprint, f.requests_open, f.requests_n, f.requests_last from (select (select count(*) from agent_requests where state in ('queued', 'claimed')) as requests_open, (select count(*) from agent_requests) as requests_n, (select max(greatest(created_at, coalesce(claimed_at, created_at), coalesce(finished_at, created_at))) from agent_requests) as requests_last, (select count(*) from planner_events) as events_n, (select max(greatest(created_at, updated_at)) from planner_events) as events_last, (select count(*) from planner_event_series) as series_n, (select max(created_at) from planner_event_series) as series_last, (select count(read_at) from announcements) as seen_n, (select max(read_at) from announcements) as seen_last, (select count(*) from assignment_progress) as progress_n, (select max(updated_at) from assignment_progress) as progress_last, (select count(resolved_at) from attention_items) as resolved_n, (select max(resolved_at) from attention_items) as resolved_last, (select count(*) from reading_progress) as reading_n, (select max(updated_at) from reading_progress) as reading_last, (select count(*) from workspace_requests) as ws_requests_n, (select max(greatest(created_at, coalesce(finished_at, created_at))) from workspace_requests) as ws_requests_last, (select count(*) from workspace_conversations) as ws_conversations_n, (select max(greatest(created_at, updated_at)) from workspace_conversations) as ws_conversations_last, (select count(*) from workspace_messages) as ws_messages_n, (select max(created_at) from workspace_messages) as ws_messages_last, (select count(*) from grade_column_links) as links_n, (select max(updated_at) from grade_column_links) as links_last) f

A walk starts only when the first read shows `requests_open` = 0 (no `agent_requests` row queued or claimed). The
walk wrote nothing when the two `fingerprint` values are equal. If they differ and `requests_n` or
`requests_last` moved, a sync or an Inbox apply ran inside the window: the comparison is "blocked" and the walk
is repeated; it is never read as a walk write. If they differ in any other way the run does not count either:
the PM reads the guard's record in `stdout.log` and repeats the walk in a quiet window. This is the second
proof. The first is in every case of both specs: `guardWrites22` and `assertNoWrites`.

Named commands used in the table:

* "Baseline sum" is
  `node -e "const fs=require('fs'),d='web/test/token-audit.baseline',F=/^shell\.json$/;let s=0;for(const f of fs.readdirSync(d).filter(f=>F.test(f)))for(const n of Object.values(JSON.parse(fs.readFileSync(d+'/'+f,'utf8'))))s+=n;console.log(s)"`
  with `F` set to the cluster's file name (shown here for `shell`) or to `/\.json$/` for all four.
* "Route count" is
  `node -e "const fs=require('fs'),p=require('path');console.log(fs.readdirSync('web/src/app',{recursive:true}).filter(f=>p.basename(f)==='page.tsx').length)"`.
* "Weight check" is `git grep -n -E "font-weight:\s*[0-9]+\s*;" -- <paths>`; it prints nothing when no literal
  weight is left in those paths. On a58be34, over `"web/src/*.css" ":(exclude)web/src/app/globals.css"`, it
  prints the 7 lines §Contract names.
* "Tile check" is
  `node -e "const fs=require('fs');const n=[...new Set(fs.readFileSync('web/src/app/globals.css','utf8').match(/--color-[a-z0-9-]+(?=\s*:)/g))];for(const t of 'abcd'){const s=fs.readFileSync('docs/planning/sprint-2/evidence/103_style_tiles/tile-'+t+'.html','utf8');console.log(t,n.filter(x=>!s.includes(x+':')).length,s.includes('Every name and number on this page is a sample.'),/@media \(prefers-color-scheme/.test(s),/:root\[data-theme=/.test(s),/(IST|GEO|ECN|WRT|MAT)[ .]?[0-9]{3}|syr\.edu/.test(s))}"`.
  Per tile it prints the number of `--color-*` names of `globals.css` the tile lacks (38 names today), whether
  the page says every name and number is a sample, whether it carries a system block
  (`@media (prefers-color-scheme)`; A, B and C do, D does not), whether it carries the light block the live
  control switches to, and whether a course id or a university address was found. Amended with amendment 2 to
  what the tiles are: they say "sample" on the page and carry no `data-sample` attribute. Run on 2026-10-08.
  Run again the same day on the refined `tile-d.html` of amendment 3: the same four lines, `d 0 true false
  true false` among them. The command reads `tile-a` to `tile-d` and never the kept
  `tile-d.before-refinement.html`.
* "Tile contrast" is
  `node -e "const fs=require('fs'),K=['event','task','ooo','focus','worklocation','appointment'],C=['reading','assignment','quiz','project','exam'],S='--color-surface',G='--color-bg',P=[];const a=(f,b,o,m)=>P.push([f,b,o,m]);for(const f of ['--color-text','--color-muted','--color-accent'])for(const g of [G,S])a(f,g,0,4.5);a('--color-danger',S,0,4.5);a('--color-danger','--color-danger-bg',S,4.5);for(const x of [300,400,500,600])a('--color-neutral-'+x,S,0,4.5);a('--color-accent-100','--color-accent-800',0,4.5);for(const k of K)a('--planner-'+k+'-fg','--planner-'+k+'-bg',S,4.5);for(const c of C)a('--type-'+c+'-fg','--type-'+c+'-bg',0,4.5);for(const f of ['--color-accent-200','--color-accent-300','--color-accent-2','--color-neutral-200','--color-accent-2-100','--color-neutral-100'])a(f,S,0,4.5);a('--color-accent-400',G,0,4.5);a('--color-accent-400',S,0,4.5);for(const c of C)a('--type-'+c+'-bg',S,0,3);a('--color-accent',G,0,3);const lin=c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4,L=c=>0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);for(const t of 'abcd'){const s=fs.readFileSync('docs/planning/sprint-2/evidence/103_style_tiles/tile-'+t+'.html','utf8');const blk=h=>{const i=s.indexOf(h),m={};if(i<0)return m;for(const x of s.slice(i,s.indexOf('}',i)).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g))m[x[1]]=x[2].trim();return m};const D=blk(':root {'),Lt=Object.assign({},D,blk(':root[data-theme=\x22light\x22] {'));const out=[t];for(const m of [D,Lt]){const r=(v,g)=>{v=v.trim();let x=/^var\((--[a-z0-9-]+)\)$/.exec(v);if(x)return r(m[x[1]],g);x=/^color-mix\(in srgb, (.+) ([0-9.]+)%, (.+)\)$/.exec(v);if(x){const c=r(x[1],g),p=x[2]/100,d=x[3]==='transparent'?g:r(x[3],g);return c.map((u,i)=>u*p+d[i]*(1-p))}x=/^#([0-9a-f]{6})$/i.exec(v);if(!x)throw new Error('cannot read '+v);return [0,2,4].map(i=>parseInt(x[1].slice(i,i+2),16)/255)};let bad=0;for(const [f,b,o,min] of P){const g=r(m[o||S],[0,0,0]),bg=r(m[b],g),fg=r(m[f],bg),x=L(fg),y=L(bg);if((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)<min)bad++}out.push(P.length,bad)}console.log(out.join(' '))}"`.
  Per tile it reads the tile's own `:root` block and its `:root[data-theme="light"]` block, builds the 38
  frozen pairs of §Contract, and prints the tile's letter, then for dark and for light the number of pairs
  measured and the number that fail. `\x22` is the double quote. Run on 2026-10-08: four lines, each
  `<letter> 38 0 38 0`, and the same four lines on the refined tile of amendment 3. It holds the frozen list
  only. Each tile's work-type rule (the five-hue rule for A, B
  and C; the urgency rule for D) was checked by the designer's own script, which is not in the repository; the
  evidence folder's `README.md` records its results.
* "Direction check" is
  `node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('docs/planning/sprint-2/evidence/103_style_tiles/direction-d.json','utf8'));const g=fs.readFileSync('web/src/app/globals.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');const q=s=>String(s).replace(/\s+/g,' ').replace(/\x22/g,'\x27').trim();const blk=h=>{const i=g.indexOf(h),m={};if(i<0)return m;for(const x of g.slice(i,g.indexOf('}',i)).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g))m[x[1]]=q(x[2]);return m};const D=blk(':root {'),L=blk(':root[data-theme=\x27light\x27] {');const miss=(m,B)=>Object.keys(m).filter(k=>B[k]!==q(m[k])).length;console.log(Object.keys(d.dark).length,miss(d.dark,D),Object.keys(d.light).length,miss(d.light,L),g.includes(d.fontsHref))"`.
  It prints the number of names in `direction-d.json`'s `dark` map, how many of them `:root` lacks or holds at
  another value, the same two numbers for the `light` map against `:root[data-theme='light']`, and whether
  `globals.css` holds D's `fontsHref` as written. Values are compared after squeezing white space and reading
  either kind of quote as the same; `\x27` is the single quote. When task 8 is right it prints
  `125 0 77 0 true` (`107 0 73 0 true` before amendment 3, whose JSON holds 18 more names in `dark` and 4 more
  in `light`). Tried on a scratch fixture on 2026-10-08, with a changed value and a missing name as the
  failing cases. Run as written on today's tree (6bcac9d) with the refined JSON it prints `125 106 77 77 false`.
* "Exit tokens" (amendment 3, default 8) is
  `node -e "const fs=require('fs');const t=JSON.parse(fs.readFileSync('docs/planning/sprint-2/evidence/103_style_tiles/direction-d.json','utf8')).tileOnly.dark;const g=fs.readFileSync('web/src/app/globals.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');const q=s=>String(s).replace(/\s+/g,' ').trim();const i=g.indexOf(':root {'),m={};for(const x of g.slice(i,g.indexOf('}',i)).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g))m[x[1]]=q(x[2]);console.log(Object.keys(t).length,Object.keys(t).filter(k=>m[k]!==q(t[k])).length)"`.
  It prints the number of names under the JSON's `tileOnly.dark` (the three exit names) and how many of them
  `:root` lacks or holds at another value. When task 8 is right it prints `3 0`. On today's tree it prints
  `3 3`.
* "New names" is
  `node -e "const fs=require('fs'),p=require('path');const N='--color-panel --color-on-accent --radius-xs --radius-control --radius-chip --radius-bar --radius-day --shadow-mark --size-underline --size-underline-mark --size-underline-offset --size-notice-bar --motion-press --motion-state --motion-enter --motion-enter-lg --motion-delay --motion-shift --motion-spin --ease-out --ease-linear --motion-control --color-scrollbar --color-scrollbar-hover --color-surface-press --shadow-hover --size-focus --size-focus-gap --size-scrollbar --size-check --motion-exit --motion-exit-lg --ease-in --size-target'.split(' ');const g=fs.readFileSync('web/src/app/globals.css','utf8');const u=fs.readdirSync('web/src',{recursive:true}).filter(f=>/\.(css|tsx?)$/.test(f)).map(f=>fs.readFileSync(p.join('web/src',f),'utf8')).join('\n');console.log(N.length,N.filter(n=>!g.includes(n+':')).length,N.filter(n=>!u.includes('var('+n+')')).length)"`.
  It prints 34, how many of direction D's 34 new names (§Token set rules) `globals.css` does not declare, and
  how many no file under `web/src` uses as `var(<name>)`. On today's tree it prints `34 34 34` (`12 12 12` for
  the 12 names of amendment 2 on a58be34). After task 8 the second number is 0. After the sweeps and tasks 26
  to 38 the third is 0 too. Tried on a scratch fixture on 2026-10-08. A name used only inside another token of
  `globals.css` counts as used: `--motion-state` is, in `--motion-control`.
* "Red files" is `git grep -l "var(--color-accent-500)" -- <paths>`: the files that name the red step. On
  a58be34, over `web/src`, it prints one line, `web/src/app/globals.css` (line 156, `--planner-focus-edge`), and
  exits 0. Task 8 writes D's value there (`#ffffff` in dark, `#000000` in light), so the line goes. No module
  names that step today.
* "Notice files" is `git grep -l "composes: errorNotice from" -- <paths>`: the files whose error box composes
  the shared class. The form is the repository's own, for example
  `composes: errorNotice from '@/styles/tokens.module.css';`.
* "URL count" is
  `node -e "const m=require('child_process').execFileSync('git',['log','-1','--format=%B','62acbd3','--','docs/planning/sprint-2/evidence/103_style_tiles'],{encoding:'utf8'});console.log((m.match(/claude\.ai\//g)||[]).length)"`.
  It prints how many Artifact links the message of task 6's commit carries. The command is pinned to that
  commit, 62acbd3 (amendment 2's), so a later commit to the evidence folder does not change the count.
* "Shot count" is
  `node -e "const f=require('fs').readdirSync(process.argv[1]);console.log(f.filter(x=>/^(0[1-9]|[12][0-9]|3[01])-.+-light\.png$/.test(x)).length,f.filter(x=>/^(0[1-9]|[12][0-9]|3[01])-.+-dark\.png$/.test(x)).length,f.filter(x=>/^4[0-5]-phone-.+\.png$/.test(x)).length)" "C:/Users/stack/.bb2dash-walk/22/<run id>/shots"`.
  It prints the light, dark and phone shot counts of that run. Amendment 3 widened both patterns from 30 to 31
  for inventory row 31.
* "Spec list" is `cd web && npx playwright test -c e2e/playwright.config.ts <spec> --list`; its last line reads
  `Total: <n> tests in 1 file`. It starts no browser and needs no session.
* "Token names" is
  `node -e "const fs=require('fs');const g=fs.readFileSync('web/src/app/globals.css','utf8');for(const w of [68,69,70]){const t=(fs.readFileSync('docs/planning/sprint-2/verification/103_W'+w+'_VERIFICATION.md','utf8').split(/^## Tokens my sweep needs\r?\n/m)[1]||'').split(/^## /m)[0];const n=[...t.matchAll(/^. *\x60(--[a-z0-9-]+)\x60/gm)].map(m=>m[1]);console.log(w,n.length,n.filter(x=>!g.includes(x+':')).length)}"`.
  Per sweep worker it prints the worker's number, how many token names its "Tokens my sweep needs" table holds,
  and how many of them `globals.css` does not declare. It reads the first cell of each table row, where the name
  stands in backticks (`\x60` is the backtick). Tried on a scratch fixture on 2026-10-08.
* "Audit green" is `cd web && npx vitest run test/token-audit.test.ts` → 0 failures.

Named commands amendment 3 adds. Each was run as written on today's tree (6bcac9d, 2026-10-08, from the
worktree root in Git Bash) and what it printed is given:

* "Time check" (H-2; REFINEMENT §11, point 7) is
  `git grep -n -E '(^|[^a-zA-Z0-9_.#-])[0-9]*\.?[0-9]+m?s([^a-zA-Z0-9_%-]|$)|cubic-bezier\(|steps\(|(transition|animation)[a-z-]*:[^;]*[ ,](ease|ease-in|ease-out|ease-in-out|linear)([ ,;]|$)' -- <paths>`.
  It prints every time literal, curve or easing keyword in those paths, and prints nothing when none is left.
  Over `'web/src/*.css' ':(exclude)web/src/app/globals.css'` it prints six lines today and exits 0:
  `web/src/components/shell/CourseSidebar.module.css:31` and `:163`,
  `web/src/components/shell/NavSearch.module.css:55`, `:82` and `:95`, and
  `web/src/components/shell/SyncButton.module.css:45`. The target is no output. A sweep runs it over its own
  cluster's stylesheets, and "the foundation paths" and so on in the table mean exactly these (a `*` in a git
  pathspec also matches `/`, so each reaches the folders under it):
  foundation, `"web/src/styles/*.css" "web/src/app/login/*.css" "web/src/app/NotFound.module.css" "web/src/components/shell/ThemeMenu.module.css"`;
  shell, `"web/src/components/shell/*.css" "web/src/components/popout/*.css" "web/src/app/(app)/Shell.module.css"`;
  screens A, `"web/src/app/(app)/Today.module.css" "web/src/app/(app)/NeedsAttention.module.css" "web/src/app/(app)/planner/*.css" "web/src/app/(app)/inbox/*.css" "web/src/app/(app)/announcements/*.css" "web/src/components/planner/*.css" "web/src/components/tracker/*.css" "web/src/components/inbox/*.css" "web/src/components/announcements/*.css"`;
  screens B, `"web/src/app/(app)/course/*.css" "web/src/app/(app)/grades/*.css" "web/src/app/(app)/materials/*.css" "web/src/app/(app)/workspace/*.css" "web/src/components/grades/*.css" "web/src/components/materials/*.css" "web/src/components/workspace/*.css" "web/src/components/course/*.css"`.
* "Ring check" (row 4) is
  `node -e "const fs=require('fs'),p=require('path');let a=0,b=0,c=0;for(const x of fs.readdirSync('web/src',{recursive:true}).map(x=>x.split(p.sep).join('/')).filter(x=>/\.css$/.test(x)&&x!=='app/globals.css')){const t=fs.readFileSync('web/src/'+x,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');for(const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g)){if(!/:focus/.test(m[1]))continue;const o=/(?:^|[;\s])outline:\s*([^;]+);/.exec(m[2]);if(!o)continue;a++;const v=o[1].replace(/\s+/g,' ').trim();if(/^(none|0)$/.test(v))c++;else if(v!=='var(--size-focus) solid var(--color-accent)')b++}}console.log(a,b,c)"`.
  Over every stylesheet outside `globals.css` it prints how many focus rules set an `outline`, how many of
  them in another form than the one ring, and how many remove it. Today it prints `28 25 3`. The target is
  `<n> 0 0`: every focus rule that draws a ring draws the one ring, and none removes it.
* "Serif check" (D-2) is
  `node -e "const fs=require('fs');const R=[['components/grades/GradebookTable.module.css','.table thead th'],['components/grades/GradeModel.module.css','.table thead th'],['components/shell/CourseSidebar.module.css','.head'],['components/shell/SearchPanel.module.css','.modeBtnActive'],['components/planner/PlannerItemPopover.module.css','.title'],['components/popout/SubmissionBlock.module.css','.attemptNo'],['components/inbox/InboxCard.module.css','.value']];let found=0,heading=0,mono=0;for(const [f,s] of R){const c=fs.readFileSync('web/src/'+f,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');for(const m of c.matchAll(/([^{}]+)\{([^{}]*)\}/g)){if(!m[1].split(',').some(x=>x.trim()===s))continue;found++;if(m[2].includes('var(--font-heading)'))heading++;if(m[2].includes('var(--font-mono)'))mono++}}console.log(found,heading,mono)"`.
  Over the seven rules of §Type rules that live in a stylesheet it prints how many rule blocks it found, how
  many still name the heading face and how many the code face. Today it prints `8 6 1` (one selector has two
  blocks). The target is `8 0 0`, or `7 0 0` if W-70's sweep deleted `GradeModel.module.css`'s table head as
  dead and its verification file says so.
* "Busy sites" (H-5, row 29) is
  `node -e "const fs=require('fs'),p=require('path');let a=0,b=0;for(const x of fs.readdirSync('web/src',{recursive:true}).filter(x=>/\.tsx$/.test(x))){const t=fs.readFileSync(p.join('web/src',x),'utf8');a+=(t.match(/disabled=\{(pending|busy|controlsDisabled)\}/g)||[]).length;b+=(t.match(/aria-busy=\{(pending|busy)\}/g)||[]).length}console.log(a,b)"`.
  It prints how many controls are disabled on exactly `pending`, `busy` or `controlsDisabled`, and how many
  `aria-busy={pending}` or `aria-busy={busy}` attributes the TSX holds. Today it prints `24 0`. The target is
  `24 24`.
* "Mark characters" (D-3, row 22) is
  `node -e "const fs=require('fs'),p=require('path');const G=/[▸◂▾▴▶◀✕✓↗×→←]/g;let n=0,f=0;for(const x of fs.readdirSync('web/src',{recursive:true}).map(x=>x.split(p.sep).join('/')).filter(x=>/\.tsx$/.test(x)&&x!=='components/shell/icons.tsx')){const t=fs.readFileSync('web/src/'+x,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,(m,a)=>a);const h=t.match(G)||[];if(h.length){f++;n+=h.length}}console.log(n,f)"`.
  With comments taken out, it prints how many of twelve arrow, caret and cross characters the TSX files hold
  outside `icons.tsx`, and in how many files. Today it prints `41 20`: 11 arrows up right, 9 carets right, 9
  right arrows, 6 carets down, 3 carets left and 3 crosses. The target is `0 0`: each is drawn by a mark of
  `icons.tsx`, which holds the characters themselves as the marks' text and as `MARK_CHAR`.

Three more, added by the review of amendment 3 for rows 2, 3 and 6 of the default build, which had no check.
Each was run as written on today's tree (6bcac9d, 2026-10-08) and what it printed is given:

* "Field check" (row 2, entry `select-as-field`) is
  `node -e "const fs=require('fs');const R=[['styles/tokens.module.css','.input'],['components/tracker/StatusSelect.module.css','.statusSelect'],['components/popout/Popout.module.css','.control'],['components/shell/SearchPanel.module.css','.courseSelect'],['components/planner/PlannerItemPopover.module.css','.control']];let edge=0,hover=0;for(const [f,s] of R){const B=[...fs.readFileSync('web/src/'+f,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)];const has=(t,v)=>B.some(m=>m[1].split(',').some(x=>t(x.trim()))&&m[2].includes(v));if(has(x=>x===s,'var(--color-neutral-600)'))edge++;if(has(x=>x.startsWith(s+':hover'),'var(--color-neutral-400)'))hover++}console.log(R.length,edge,hover)"`.
  Over the five rules that style a field or a select it prints 5, how many name the field's edge
  (`--color-neutral-600`) in the rule itself, and how many name the field's hover edge
  (`--color-neutral-400`) in a `:hover` rule. Today it prints `5 0 0`. The target is `5 5 5`. Neither the
  entry nor the tile sets `appearance` on a select, so the check reads the edge. One rule is W-67's
  (`.input`), two are W-68's and two are W-69's.
* "No-select check" (row 3, entry `chrome-no-select`) is
  `node -e "const fs=require('fs');const F=process.argv.slice(1);let miss=0,box=0;for(const f of F){const t=fs.readFileSync(f,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');if(!/user-select:\s*none/.test(t))miss++;for(const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g))if(/user-select:\s*none/.test(m[2])&&m[1].split(',').some(x=>/^\.(bar|dd|panel|popover|toast)$/.test(x.trim())))box++}console.log(F.length,miss,box)" <files>`.
  It prints how many files it was given, how many of them hold no `user-select: none`, and how many rule
  blocks set it on a box whose children hold words to copy (`.bar`, `.dd`, `.panel`, `.popover` or
  `.toast` as a whole selector). The target is `<n> 0 0`. The files are the ten the entry names, by owner:
  foundation, `web/src/styles/tokens.module.css`; shell,
  `web/src/components/shell/TopNav.module.css web/src/components/shell/SyncButton.module.css web/src/components/shell/CourseSidebar.module.css web/src/components/shell/SearchPanel.module.css web/src/components/popout/Popout.module.css`;
  screens A, `web/src/components/tracker/UpcomingTracker.module.css "web/src/app/(app)/inbox/Inbox.module.css"`;
  screens B, `"web/src/app/(app)/course/[id]/CourseSubBar.module.css" web/src/components/grades/GradebookTable.module.css`.
  Over all ten it prints `10 10 0` today. No rule sets `user-select: none` today; the two
  `user-select: all` lines are the copyable commands and stay.
* "Strength check" (row 6, entry `disabled-one-look`) is
  `node -e "const fs=require('fs'),p=require('path');let a=0,b=0;for(const x of fs.readdirSync('web/src',{recursive:true}).map(x=>x.split(p.sep).join('/')).filter(x=>/\.css$/.test(x)&&x!=='app/globals.css')){const t=fs.readFileSync('web/src/'+x,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');for(const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g)){if(!/:disabled|data-pending/.test(m[1].replace(/:not\(:disabled\)/g,'')))continue;const o=/(?:^|[;\s])opacity:\s*([^;]+);/.exec(m[2]);if(!o)continue;a++;if(!/^(0?\.5|1)$/.test(o[1].trim()))b++}}console.log(a,b)"`.
  Over every stylesheet outside `globals.css` it prints how many rules for a control that cannot be used
  (a `:disabled` rule, or the planner's pending block) set an `opacity`, and how many of them set anything
  but 0.5 or 1. Today it prints `7 7`: the seven rules of the entry, at 0.45, 0.55 and 0.6. The target is
  `<n> 0`. A value of 1 is allowed because two rules need it: a switched-off primary button is a flat grey
  pill at full strength (entry `button-fills`), and so is a switched-off field (task 37). The seven are
  W-67's one (`tokens.module.css`), W-68's two (`SyncButton.module.css`, `Popout.module.css`) and W-69's
  four (`StatusSelect.module.css`, `PlannerWeek.module.css`, `PlannerItemPopover.module.css`,
  `InboxApplyButton.module.css`).

Inside the table below, `\|` is Markdown's escaped pipe. It stands for a plain `|` inside a quoted pattern (a
regex "or"). No command in this brief sends one command's output into another.

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 0 | The walk box: `scripts/walk-box.mjs`, `docker/walk/entry.sh`, the spec helpers `web/e2e/walk22.lib.ts`, and their tests | R-53, R-46 (the harness of tasks 5, 13–16, 20–22) | W-75 | `node --test scripts/walk-box.test.mjs` → 0 failures; `cd web && npx vitest run test/walk22-lib.test.ts` → 0 failures; a real run, `node scripts/walk-box.mjs web/e2e/harness.spec.ts`, on this branch's build → exit 0; `test -s C:/Users/stack/.bb2dash-walk/22/<run id>/run.json` → exit 0 | none |
| 1 | Token audit ratchet: `token-audit.scan.ts` (pure scanner), `token-audit.test.ts` (scans `web/src`, compares with the four baseline JSONs, cluster map, unresolved pass), baselines written from today's tree | P-15, R-53 | W-67 (this branch's first code commit) | `cd web && npx vitest run test/token-audit.test.ts` → 0 failures; its fixture cases count exactly `#fff` 1, `rgba(0,0,0,.5)` 1, `color-mix(in srgb, var(--a) 10%, transparent)` 1, `white` 1, `padding: 13px` 1, `minmax(14rem, 18rem)` 2, `style={{ padding: 0 }}` 1, `const s = { padding: 0 }` + `style={s}` 1, `style={pick()}` 1, and 0 for `var(--color-text)`, `transparent`, `currentColor`, `/* #fff */`, `style={{ '--x': v }}`, `style={{ ['--x' as string]: v }}`, `const s = { ['--x' as string]: v }` + `style={s}`, a `.ts` JSDoc comment holding `var(--slot) * 24px` (0 counts and 0 unresolved) and `box.style.height = 'auto'` (imperative writes are outside the scope; the test says so); a fixture `var(--nope)` → unresolved 1; live tree unresolved → 0; every scanned file belongs to exactly one cluster; `layout.tsx` counts 1 on `main` (its `'#161826'`). W-67 records the four baseline sums and the count of its first `npm test` in `103_W67_VERIFICATION.md` (audit estimates before A3 and A5: foundation about 35, screens-a about 116, screens-b about 82; the task writes the real numbers) | "`npm test` now fails if anyone adds a hard-coded colour or size." |
| 2 | Freeze the allowlist A1–A5 in `token-audit.allowlist.ts`; `tokens.module.css` audited | P-16, R-53 | W-67 | `cd web && npx vitest run test/token-audit.test.ts` → 0 failures, including "breakpoint set equals {480, 620, 640, 720, 760, 820, 900, 1023.98}", "the one @container entry is 600px in CourseTimeline.module.css", "every A3 entry matches a live declaration; a constant-backed entry equals its imported constant; a source-backed entry's regex matches its named line" (0 stale) and "A5 holds exactly two keys"; every further pinned or mirrored declaration W-67 finds is listed in `103_W67_VERIFICATION.md`; at the PR, `git diff --quiet <task-2 sha> HEAD -- web/test/token-audit.allowlist.ts` → exit 0 (sha in `103_W67_VERIFICATION.md`) | none |
| 3 | Block-aware token reader `css-tokens.ts`; `type-tokens.contrast.test.ts` runs per block | P-17 | W-67 | `cd web && npx vitest run test/type-tokens.contrast.test.ts test/theme-tokens.test.ts` → 0 failures, including: appending `:root[data-theme='light'] { --color-surface: #ffffff; }` to the fixture leaves the dark map's `--color-surface` = `#232532`; the reader composites in floating point and rounds only when it prints a hex: `color-mix(in srgb, #e9e9ed 16%, transparent)` over `#232532` prints `#434450` (0.16 × `#e9e9ed` + 0.84 × `#232532`, today's `--color-divider` on the card); contrast is computed from the unrounded composite: on a fixture holding a verbatim copy of today's `:root` block (`globals.css:20-165`, byte-identical to a5042fa), inline in `theme-tokens.test.ts` and never re-read from the live file (task 8 changes both pairs there), the reader reports `--color-neutral-600` on `--color-surface` = 3.52 and `--color-danger` on `--color-danger-bg` over `--color-surface` = 3.94 (two decimals). At this task `type-tokens.contrast.test.ts` only moves onto the reader: its six assertions stay and hold on today's values. Task 8 replaces four of them with the urgency rule (amendment 2, G-4) | none |
| 4 | Inventory confirmed: no stub screen, route count as frozen | R-53 | PM | `grep -rl "ScreenStub" web/src/app` → prints nothing; Route count → 16 (both hold on a58be34) | none |
| 5 | `phone-width.spec.ts` written first, with its 54 frozen titles, and run RED in the walk box on W-68's own worktree (before tasks 12–15). Since amendment 3 the spec opens with `test.use({ reducedMotion: 'reduce' })` (H-6) | R-46, P-79 | W-68 | Spec list for `phone-width.spec.ts` → `Total: 54 tests in 1 file`; `grep -c "reducedMotion: 'reduce'" web/e2e/phone-width.spec.ts` → 1; harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts` → `exit_code` 1 and `result` `tests failed` in `run.json` (a box failure, 64 to 76, is not a RED run), ≥ 1 failed, `route /course/IST.466/grades [dark]` among the failures with its `scrollWidth` (> 390) printed; every route case prints `route <path> [<theme>]: page scrollWidth=<n>` whether it passes or fails; in the same run `unfolded bar at 721` passes and prints its line (the unfolded bar's width with the idle label; open item 3 records this number); `grep -c "route /course/IST.466/grades" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → ≥ 1 and `grep -c "unfolded bar at 721: nav scrollWidth=" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → ≥ 1 (the pasted output, with the run id); W-68 pastes every failing route title with its `scrollWidth` and its inventory row's Sweep worker under one heading: `grep -c "^## Routes too wide at 390 px$" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → 1 | none |
| 6 | Four style tiles and the walkthrough page, committed as evidence (as amended, G-1; done 2026-10-08). A, B and C were shown to Stack through the one walkthrough page (`style-pick.html`), not as three separate published pages. D, "Charcoal", is the direction and was shown as a page of its own, with `direction-d.json` and `component-changes.json` beside it. Each tile draws the app's own fragments (top bar with Menu, Sync and the five icons; buttons; graded-so-far figure; a gradebook row; the five tracker chips; one planner block per kind; an Inbox row; an error notice; a popout header) with a live theme control and the real token names. **Sample data only:** no real score, course text, name or email, and each tile says on the page that every name and number is a sample. The no-fabricated-numbers rule is about the app's screens | S2-styling-1, R-53 | PM | `git ls-files "docs/planning/sprint-2/evidence/103_style_tiles/tile-*.html"` → exactly five lines since amendment 3 (`tile-a.html`, `tile-b.html`, `tile-c.html`, `tile-d.before-refinement.html`, `tile-d.html`; four before it: the kept earlier tile is the fifth, and `tile-d.html` is the refined one); `git ls-files docs/planning/sprint-2/evidence/103_style_tiles/style-pick.html` → exactly one line; Tile check, run at this task's commit (before task 8 adds names) → `a 0 true true true false`, `b 0 true true true false`, `c 0 true true true false`, `d 0 true false true false` (each as it was designed: A, B and C with a system block, D without one, dark by default); Tile contrast → `a 38 0 38 0`, `b 38 0 38 0`, `c 38 0 38 0`, `d 38 0 38 0`; the two page addresses, the walkthrough and tile D, in the task's commit message (62acbd3): URL count → 2 | "I compared three tiles in one walkthrough, saved my pick, and was shown tile D." |
| 7 | The direction is recorded: tile D (as amended, G-1; gate before task 8; done 2026-10-08) | S2-styling-1 | Stack + PM | `grep -cE "Phase 22 direction.*tile D" project-state/DECISIONS.md` → 1 on the phase branch (the row names the tile, holds Stack's pick, his four notes and his sentence word for word, the two page addresses, and the five taste calls with the default taken on each) | "I picked B, said what to change, and the build is on tile D." |
| 8 | Token set for direction D (as amended, G-4, G-5): `:root` (dark) and `:root[data-theme='light']` written from `direction-d.json`'s two maps, value for value; `color-scheme` per block; D's 34 new names (the 30 the two maps bring, the three exit names from `tileOnly.dark`, and `--size-target` at 24px; 12 before amendment 3); what amendment 3 puts in this commit ahead of the sweeps (§Component changes by owner): the scrollbar block inside `@media (hover: hover) and (pointer: fine)`, the one checkbox rule on `:where(input[type='checkbox'])`, the one `prefers-reduced-motion` block (every transition and animation off, the loading wait kept, the two exit durations at `0ms`), the `data-theme-switching` rule, `scroll-padding-top` on `html` (it goes at task 26), `text-wrap: balance` on the headings, `transition: var(--motion-control)` on `a`, the shared label class `.tip` in `tokens.module.css` (task 32), and `attemptText` in `lib/queries.grades.ts` with `queries.grades.attempt-text.test.ts` (task 34); the fonts `@import` changed to D's `fontsHref`; the link style of `a` and `a:hover` (entry `links-thin-underline`); the shared `.errorNotice` class in `tokens.module.css` (entry `error-notice-shared`, here so that the sweeps can compose it); the new names the sweeps need (at today's values, read from the three "Tokens my sweep needs" tables and W-67's own list, the weight tokens among them); the two sub-AA pairs fixed; the urgency rule in `type-tokens.contrast.test.ts`, with its header comment and the comment over the `--type-*` tokens rewritten | R-53, P-78 | W-67 | `cd web && npx vitest run test/theme-tokens.test.ts test/theme-contrast.test.ts test/type-tokens.contrast.test.ts test/Workspace.layout.test.tsx` → 0 failures: the light block lacks 0 of `:root`'s `--color-*` / `--shadow-*` names; `color-scheme` is `dark` / `light`; the 18 layout tokens (seven `--space-*`: 1, 2, 3, 4, 6, 8, 12; `--nav-height`, `--content-max`, `--sidebar-width`, `--sidebar-side`; seven `--text-*`: `-xs`, `-sm`, `-base`, `-md`, `-lg`, `-xl`, `-2xl`) equal `main`'s values; every one of the 38 frozen pairs ≥ 4.5 (text) or ≥ 3 (non-text) in both blocks; `type-tokens.contrast.test.ts` keeps its first two assertions and holds every clause of §Contract's urgency rule in both blocks, against the card and against the picked-day fill. Then, each by itself: `grep -c "MIN_DELTA_E = 30" web/test/type-tokens.contrast.test.ts` → 0 (the old pair rule is gone); Direction check → `125 0 77 0 true`; Exit tokens → `3 0`; New names → `34 0 <n>` (all 34 declared; `<n>` reaches 0 at task 20); `grep -c "prefers-reduced-motion: reduce" web/src/app/globals.css` → 1; `grep -c "data-theme-switching" web/src/app/globals.css` → 1; `grep -c "(hover: hover) and (pointer: fine)" web/src/app/globals.css` → 1; `grep -c ":where(input\[type=" web/src/app/globals.css` → 1; `grep -c "text-wrap: balance" web/src/app/globals.css` → 1; `grep -c "scroll-padding-top: var(--nav-height)" web/src/app/globals.css` → 1; `grep -c "^\.tip" web/src/styles/tokens.module.css` → 1 or more; `cd web && npx vitest run test/queries.grades.attempt-text.test.ts test/queries.grades.test.ts test/status-vocabulary.test.ts` → 0 failures, the two old files unedited (the new file's cases: `attemptText` is "needs grading" for `NEEDS_GRADING`, "in progress" for `IN_PROGRESS` and "completed" for `COMPLETED`; an unknown code reads as itself; it is absent exactly when `attemptStatus` is null, the key left off and never set to null, so `submissionLabel(null)` has the three keys `queries.grades.test.ts:224` compares and no fourth; `attemptStatus` is still Blackboard's own word); `grep -c "^\.errorNotice" web/src/styles/tokens.module.css` → 1 or more; `grep -c "family=Inter" web/src/app/globals.css` → 0; `grep -c "text-decoration-thickness: var(--size-underline)" web/src/app/globals.css` → 1 (the `a` rule of entry `links-thin-underline`; 0 on a58be34); Red files over `web/src/app/globals.css` → prints nothing (`--planner-focus-edge` holds D's value, so the one line of a58be34 is gone); Audit green (`.errorNotice` is written with tokens only, so `foundation.json` does not rise); Token names → three lines, `68 <n> 0`, `69 <n> 0` and `70 <n> 0`, each `<n>` above 0 (every name of the three tables is declared; the three verification files reach W-67's worktree with the merge it makes when it is resumed for this task) | "Home on the preview wears direction D." |
| 9 | `theme-preference.ts`, `THEME_BOOT_SCRIPT` with its system-change listener in the root layout, `THEME_COLOR` (the dark ground) for `viewport.themeColor`; the root layout joins the raw-HTML allow-list (as amended, G-3: nothing stored means Dark) | P-76, P-78, R-53 | W-67 | `cd web && npx vitest run test/theme-preference.test.ts test/raw-html.audit.test.ts` → 0 failures: `resolveTheme` table, nine rows (nothing stored + system light → dark; nothing stored + system dark → dark; stored `light` + system dark → light; stored `auto` + system light → light; stored `auto` + system dark → dark; stored `auto` + no `matchMedia` → dark; stored `dark` + system light → dark; junk + system light → dark; storage throws + system light → dark); the script, run in jsdom for each of the nine with a stubbed `matchMedia`, stamps the expected `data-theme` and writes no storage; with no `matchMedia` it stamps `dark` and does not throw; with `auto` stored a `change` event on the query re-stamps `data-theme` and sets the `theme-color` meta to the new ground, and with nothing stored or `light` stored the same event changes neither; since amendment 3 (row 12) that re-stamp also sets `data-theme-switching` on the root, which is gone two animation frames later, and the boot stamp itself never sets it; at boot a resolved `light` sets the `theme-color` meta to `THEME_BG.light`; `THEME_BG.dark` / `.light` equal the blocks' `--color-bg`; `THEME_COLOR` equals `THEME_BG.dark`; `grep -c "#161826" web/src/app/layout.tsx` → 0; `grep -c "__html: THEME_BOOT_SCRIPT" web/src/app/layout.tsx` → 1; `git grep -c "dangerouslySetInnerHTML=" -- web/src` → exactly two lines, `web/src/app/(app)/layout.tsx:1` and `web/src/app/layout.tsx:1` | none |
| 10 | `ThemeMenu` (Dark / Light / Auto, in that order) and its mount in the account menu (as amended, G-3) | P-77, R-53 | W-67 (component), W-68 (mount) | `cd web && npx vitest run test/ThemeMenu.test.tsx test/TopNav.update.test.tsx` → 0 failures: exactly three `menuitemradio` rows, named Dark, Light and Auto in that order in the DOM, and no new `menuitem`; Dark checked with no key, under a stubbed light system too; Light → `data-theme="light"`, key `light`, every `theme-color` meta = `THEME_BG.light`; Auto → key `auto`, attribute and every meta follow a stubbed `matchMedia`; Dark → key removed, `data-theme="dark"`, every meta = `THEME_BG.dark`; a stored `dark` or a junk value shows Dark checked; a throwing storage still stamps; since amendment 3 (row 12) a pick sets `data-theme-switching` on the root and it is gone two animation frames later; `grep -c "<ThemeMenu" web/src/components/shell/TopNav.tsx` → 1 | "Account menu starts on Dark. Light, reload, still light. Auto follows Windows." |
| 11 | Desktop window background from the tokens: always the app's dark ground (as amended, G-3) | R-53 | W-67 | `cd desktop && npx vitest run test/unit/window-background.test.ts test/unit/window.test.ts test/unit/deeplink.test.ts` → 0 failures (`DARK` equals `:root`'s `--color-bg` read from `../web/src/app/globals.css`; `windowBackground()` = `DARK`); `grep -c "12131a" desktop/src/main/window.ts` → 0; `git grep -c "nativeTheme" -- desktop/src` → prints nothing (it prints nothing on `main` too); `git diff --quiet origin/main...HEAD -- desktop/test/unit/window.test.ts` → exit 0 (`update-prompt.ts` left this check with amendment 3: task 27 redraws it); `103_W67_VERIFICATION.md` says whether the change can break the launch. Since amendment 3 `cd desktop && npm run test:e2e` → exit 0 is a gate of tasks 27 and 20 whatever that file says | "The desktop window opens on the app's dark ground." |
| 12 | Nav fold at the 720 px step; the Sync label's own span, icon only at ≤480 px, capped at ≤1023.98 px | R-46, P-79 | W-68 | `cd web && npx vitest run test/TopNav.fold.test.tsx test/TopNav.search.test.tsx test/TopNav.workspace.test.tsx test/TopNav.update.test.tsx test/SyncButton.test.tsx test/CourseSidebar.test.tsx test/NavSearch.css.test.ts` → 0 failures, the six old files unedited. The new file's cases: Menu `aria-expanded` false → true, `aria-controls="primary-nav-menu"`; the panel holds one link per `NAV_LINKS` entry (6), in order, with `aria-current` on the active one, and nothing else; no panel and no second "Materials" link in the DOM while Menu is closed; Escape closes and focus returns to Menu; a pathname change closes it; Menu and the account menu close each other; ☰ closes Menu and keeps `aria-controls="course-sidebar"`. CSS cases: `TopNav.module.css`'s `(max-width: 720px)` block hides `.links` and shows Menu, Menu is `display: none` outside it, and the block holds no `overflow-x`, `min-width` or `scrollbar-width` for `.links`; the `(max-width: 480px)` block gives `.brandName` `clip-path: inset(50%)` and no other block does; no `.brandWord` exists; `SyncButton.module.css`'s `(max-width: 480px)` block gives the label span `clip-path: inset(50%)` and its `(max-width: 1023.98px)` block gives it a `max-width` and `text-overflow: ellipsis`; the label span's `title` equals its text; the brand link's accessible name is "bb2dash" (`getByRole('link', { name: 'bb2dash' })` finds exactly 1). Audit green: `shell.json` follows this commit, up by each size literal the fold and the label cap add, each named in the commit message (§Contract, "The baseline before the tokens exist") | "At phone width the bar shows Menu; it lists the six pages." |
| 13 | The seven open states of §Contract inside the viewport at ≤720 px: Bell and Activity capped at `min(360px, calc(100vw - 28px))` and anchored `right: 0`; `.stack` re-anchored; the three `display: contents` wrappers to a class, so search open at 390 px fits | R-46 | W-68 | harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "open state\|reachability\|bar at\|sidebar toggle\|popout assignment"` → exit 0, 22 passed, 0 failed (14 open-state cases, each asserting its panel's rect `left ≥ 0` and `right ≤ innerWidth` at 390 px, case 7 also the nav's `scrollWidth` ≤ 390 with search open; 2 reachability; `unfolded bar at 721`, `bar at 390 longest label`, `bar at 900 longest label`; `sidebar toggle`; 2 `popout assignment`). Case 3 measures `.ddUser` before W-68's task-10 mount; task 21 re-runs it with the theme control inside. `grep -c "display: 'contents'" web/src/components/shell/TopNav.tsx web/src/components/shell/ActivityMenu.tsx web/src/components/shell/Bell.tsx` → three lines ending `:0`. Audit green: `shell.json` follows in the same commit, down by those three sites and up by each size literal the panel cap and the `.stack` re-anchor add, each named in the commit message. `grep -c "^## Tokens my sweep needs$" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → 1 | "Bell and Activity open fully on a phone." |
| 14 | Gradebook scrolls inside its own box; every route of rows 05–12 fits at 390 px | R-46 | W-70 | `cd web && npx vitest run test/GradesTables.layout.test.tsx test/gradebook-phone-width.css.test.ts` → 0 failures (the layout test unedited; the new one asserts the wrapper rule has `overflow-x: auto` and no `th` / `td` rule gains `overflow` or `display`); harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route /course/\|route /grades \|route /materials \|route /workspace "` → exit 0, 16 passed, 0 failed (the eight routes of rows 05–12 in both themes: page `scrollWidth` ≤ 390; on `/course/IST.466/grades` the scroll box's `scrollWidth` > `clientWidth`, read from the frozen hook); `grep -c 'data-scroll-box="gradebook"' web/src/components/grades/GradebookTable.tsx` → 1; Audit green, with `screens-b.json` following any literal a phone-width rule adds; `grep -c "^## Tokens my sweep needs$" docs/planning/sprint-2/verification/103_W70_VERIFICATION.md` → 1 | "IST.466 Grades at phone width: the table slides inside its box." |
| 15 | Planner board scrolls inside itself; every route of rows 01–04 fits at 390 px | R-46 | W-69 | `cd web && npx vitest run test/planner-css.test.ts test/planner-phone-width.css.test.ts` → 0 failures (no `min-width` on `.board` in any block; the 760 px floor on its tracks or an inner element; no vertical scroller); harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route / \|route /planner \|route /inbox \|route /announcements "` → exit 0, 8 passed, 0 failed (the four routes of rows 01–04 in both themes: page `scrollWidth` ≤ 390; on `/planner` the board's `scrollWidth` > `clientWidth`, read from `[data-planner-board="true"]`); Audit green, with `screens-a.json` following any literal a phone-width rule adds; `grep -c "^## Tokens my sweep needs$" docs/planning/sprint-2/verification/103_W69_VERIFICATION.md` → 1 | "The week slides at phone width; the page does not." |
| 16 | Sweep the foundation cluster (tokens module, login, privacy, terms, not-found, ThemeMenu) and apply the entries of `component-changes.json` that name W-67's files (§Component changes by owner: the card edge, the tags, the buttons, the input well and the glyph in `tokens.module.css`; `.mark` and `.error` in `Login.module.css`) and, since amendment 3, the entries of its second table that name them (the select as a field on `.input`, the chrome's controls that do not select or drag, the one ring, the one disabled strength, `transition: var(--motion-control)` on `.btn` and `.input`, the press states, the plain `.rule`); write `theme-walk.spec.ts` with its 64 frozen titles (60 before amendment 3), opening with `test.use({ reducedMotion: 'reduce' })`, each surface case reaching its theme as acceptance step 1 says, and each surface case of rows 01 to 12 making its window as tall as the bar plus the content pane before its shot (default 15 of amendment 3); every route of rows 13–16 fits at 390 px | R-53, R-46 | W-67 | Baseline sum with `F=/^foundation\.json$/` → 0; Weight check over `web/src/styles web/src/app/login` → prints nothing; Time check over the foundation paths → prints nothing; Field check → its second and third numbers each up by 1 from the run before the sweep (its one rule, `.input`; both lines recorded; `5 5 5` at task 20); No-select check over the foundation file → `1 0 0`; Strength check → its second number down by 1 from the run before the sweep (`.btn:disabled`; both lines recorded); `grep -c "transition: var(--motion-control)" web/src/styles/tokens.module.css` → 2 or more; `grep -c "linear-gradient" web/src/styles/tokens.module.css` → 0 (1 today, the fading `.rule`); `grep -c "reducedMotion: 'reduce'" web/e2e/theme-walk.spec.ts` → 1; `grep -c "setViewportSize" web/e2e/theme-walk.spec.ts` → 1 or more; Notice files over `web/src/app/login` → exactly one line; `grep -c "var(--radius-control)" web/src/styles/tokens.module.css` → 1 or more; `grep -c "var(--radius-chip)" web/src/styles/tokens.module.css` → 2 or more (`.tag` and `.glyph`); `grep -c "var(--shadow-mark)" web/src/app/login/Login.module.css` → 1; `cd web && npm test` → 0 failures; Spec list for `theme-walk.spec.ts` → `Total: 64 tests in 1 file`; harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route /login \|route /privacy \|route /terms \|route /no-such-page "` → exit 0, 8 passed, 0 failed (the four public routes in both themes, page `scrollWidth` ≤ 390). W-67 stops here and reports the theme-walk run as owed, because that run needs W-68's mount and W-68 is resumed for the mount only after W-67's task 10. **Owed, on resume:** once the mount commit is merged the PM messages the stopped W-67, which merges `origin/feat/styling-22` and makes the harness run `node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts -- --grep-invert "31 frame-scrolled\|planner targets"` → exit 0, 61 passed, 0 failed, before task 22 (the 60 cases of rows 01–30 and `motion off under reduced motion`; the three cases left out wait for tasks 26 and 36, which prove them, and task 22 runs all 64) | none |
| 17 | Sweep the shell cluster (scrim to a token, the last `style=` site `TopNav.tsx:154` to a class, search, popouts, `QueryState`). `ScreenStub.tsx` and `Shell.module.css`'s `.stub`, `.stubTitle` and `.stubMeta` have no importer and may be deleted; `.stubBody` is live (the Planner and Workspace loading lines) and is swept. Apply the entries of `component-changes.json` that name W-68's files (§Component changes by owner: the brand mark, the nav links, the unread badge and the two unread dots, the Sync pill, the course side panel on the panel grey, `Popout.module.css`'s `.problem`) and, since amendment 3, the entries of its second table that name them (rows 2 to 10, 13, 14 and 16 in W-68's modules: the selects as fields, the chrome's controls that do not select or drag, the one ring back on `Popout` `.control` and `NavSearch`, the hover and press states, one disabled strength, `transition: var(--motion-control)`, the panels that arrive with `@starting-style`, `text-wrap: balance` on the popout's title, no blur on the popout's backdrop, `overscroll-behavior: contain` on four floating lists, the six time lines on tokens, and `NavSearch.module.css:94-96` deleted) | R-53 | W-68 | Baseline sum with `F=/^shell\.json$/` → 0; Weight check over `web/src/components/shell web/src/components/popout` → prints nothing; Time check over the shell paths → prints nothing (six lines today); Field check → its second and third numbers each up by 2 from the run before the sweep (`Popout` `.control`, `SearchPanel` `.courseSelect`; both lines recorded); No-select check over the five shell files → `5 0 0`; Strength check → its second number down by 2 (`SyncButton.module.css`, `Popout.module.css`; both lines recorded); `git grep -c "cursor: progress" -- web/src/components/shell web/src/components/popout` → at least two lines, `Popout.module.css` and `SyncButton.module.css` among them (the two of today: a busy control keeps its pointer); `git grep -c "@starting-style" -- web/src/components/shell web/src/components/popout` → exactly five lines (`Bell.module.css`, `NavSearch.module.css`, `SyncButton.module.css`, `TopNav.module.css`, `Popout.module.css`; none today); `git grep -c "overscroll-behavior: contain" -- web/src/components/shell web/src/components/popout` → exactly four lines (`Bell.module.css`, `SearchPanel.module.css`, `TopNav.module.css`, `Popout.module.css`); `grep -c "backdrop-filter" web/src/components/popout/Popout.module.css` → 0; `git grep -c -E "outline:\s*(none\|0)\b" -- web/src/components/shell web/src/components/popout` → prints nothing (two lines today); Red files over `web/src/components/shell` → exactly three lines (`Bell.module.css`, `CourseSidebar.module.css`, `TopNav.module.css`); Notice files over `web/src/components/popout` → exactly one line; `grep -c "var(--color-panel)" web/src/components/shell/CourseSidebar.module.css` → 1 or more; `grep -c "var(--radius-control)" web/src/components/shell/SyncButton.module.css` → 1 or more; `grep -c "var(--shadow-mark)" web/src/components/shell/TopNav.module.css` → 1; `cd web && npm test` → 0 failures (`NavSearch.css.test.ts` unedited) | none |
| 18 | Sweep screens A (Home, planner, tracker, Inbox, Announcements; the 8 `PlannerBoard.tsx` `style=` sites keep only `--` keys; `PlannerWeek.tsx`'s `height` key stays, A5). Apply the entries of `component-changes.json` that name W-69's files (§Component changes by owner: the Upcoming work block in tile C's shapes, the Inbox chips and source link, the red marks of the Inbox tab, the planner's today and now line and the announcements' unread dot, five boxed error rules and the popover's bare line) and, since amendment 3, the entries of its second table that name them (the status select and the popover's `.control` as fields, the done box drawn by the app's rule with its `accent-color` line gone, the controls that do not select or drag, the one ring back on `StatusSelect`, hover as one wash with the day column's own mix gone, one disabled strength, `transition: var(--motion-control)`, the press states, the two panels that arrive, `text-wrap: balance` on the Inbox card's title, Home's loading line that waits, `overscroll-behavior: contain` on the series dialog). The Upcoming work order (named exception 3): `LEGEND` reads exam, project, quiz, assignment, reading, and `DayColumn` draws a day's bars most urgent on top, with the new test `UpcomingTracker.urgency.test.tsx` | R-53 | W-69 | Baseline sum with `F=/^screens-a\.json$/` → 0; Weight check over `"web/src/app/(app)/NeedsAttention.module.css" web/src/components/tracker` → prints nothing; `cd web && npx vitest run test/UpcomingTracker.urgency.test.tsx test/UpcomingTracker.test.tsx test/UpcomingTracker.scroll.test.tsx test/upcoming-tracker-css.test.ts` → 0 failures, the three old files unedited. The new file's cases: the legend's five entries read exam, project, quiz, assignment, reading in DOM order; a day whose items arrive as reading, quiz, exam draws the exam's bar on top and the reading's at the bottom (`.barArea` is `flex-direction: column-reverse` on `main` and stays so, so the top bar is the last child); two items of one type keep the order they arrived in. Red files over `"web/src/app/(app)/inbox" web/src/components/announcements web/src/components/planner web/src/components/tracker` → exactly four lines; Notice files over `"web/src/app/(app)/inbox" "web/src/app/(app)/Today.module.css" web/src/components/inbox web/src/components/planner` → exactly five lines; `grep -c "var(--radius-day)" web/src/components/tracker/UpcomingTracker.module.css` → 1; `grep -c "var(--radius-bar)" web/src/components/tracker/UpcomingTracker.module.css` → 1; Time check over the screens A paths → prints nothing; Field check → its second and third numbers each up by 2 from the run before the sweep (`StatusSelect`, `PlannerItemPopover` `.control`; both lines recorded); No-select check over the two screens A files → `2 0 0`; `grep -c "user-drag: none" "web/src/app/(app)/Today.module.css"` → 1 (0 today; the course card does not drag); Strength check → its second number down by 4 (`StatusSelect.module.css`, `PlannerWeek.module.css`, `PlannerItemPopover.module.css`, `InboxApplyButton.module.css`; both lines recorded); `git grep -c "cursor: progress" -- web/src/components/planner web/src/components/tracker` → at least two lines, `PlannerWeek.module.css` and `StatusSelect.module.css` among them (the two of today); `grep -c "accent-color" web/src/components/planner/PlannerWeek.module.css` → 0 (1 today); `grep -c "outline: none" web/src/components/tracker/StatusSelect.module.css` → 0 (1 today); `grep -c "var(--color-surface-press)" "web/src/app/(app)/Today.module.css"` → 1; `grep -c "var(--motion-delay)" "web/src/app/(app)/Today.module.css"` → 1; `git grep -c "@starting-style" -- web/src/components/planner/PlannerItemPopover.module.css web/src/components/inbox/InboxApplyButton.module.css` → exactly two lines; `cd web && npm test` → 0 failures (`planner-css.test.ts` and `PlannerWeek.hydration.test.tsx` unedited; `upcoming-tracker-css.test.ts` unedited at this task, its second case changes at task 38) | "Upcoming work reads most urgent first: exams and projects in red on top." |
| 19 | Sweep screens B (course tabs, the Stream timeline in `components/course/`, the assignment page's frame, Grades, Materials, Workspace; dead `GradeModel.module.css` classes may be deleted instead; `CourseClasswork.tsx`'s `marginLeft` key stays, A5; no new module in `components/workspace/`). Apply the entries of `component-changes.json` that name W-70's files (§Component changes by owner: the two grade links on the global link style, the red marks of the course tab and the Stream's current week, six boxed error rules) and, since amendment 3, the entries of its second table that name them (the course tabs and the gradebook's head that do not select, the one ring, `transition: var(--motion-control)` on the course tabs, the dim of the four text links while held: `.openLink`, `.itemLink`, `.bbLink`, `.emptyLink`) | R-53 | W-70 | Baseline sum with `F=/^screens-b\.json$/` → 0; Time check over the screens B paths → prints nothing; No-select check over the two screens B files → `2 0 0`; `grep -c "transition: var(--motion-control)" "web/src/app/(app)/course/[id]/CourseSubBar.module.css"` → 1 or more; Weight check over `"web/src/app/(app)/materials" web/src/components/course web/src/components/grades` → prints nothing; Red files over `"web/src/app/(app)/course" web/src/components/course` → exactly two lines (`CourseSubBar.module.css`, `CourseTimeline.module.css`); Notice files over `"web/src/app/(app)/materials" "web/src/app/(app)/workspace" "web/src/app/(app)/course" web/src/components/workspace web/src/components/grades` → exactly six lines; `grep -c "var(--color-on-accent)" web/src/components/course/CourseTimeline.module.css` → 1 or more; `cd web && npm test` → 0 failures (`course-timeline-css.test.ts`, `Workspace.layout.test.tsx` and `CourseClasswork.test.tsx` unedited) | none |
| 20 | Integrate: full suites, all baselines zero, old tests edited only where §Files allows, no new dependency, no committed screenshot | R-53 | PM | in `web/`: `npm run typecheck`, `npm run build`, `npm test`, `npx eslint . --max-warnings 0`, `npm run test:coverage` → each exit 0, 0 failures, `npm test`'s count ≥ 2913; in `desktop/`: `npm run typecheck`, `npm test` → each exit 0, and since amendment 3 `npm run test:e2e` → exit 0, 0 failed, and the packed-build smoke: `npm run pack` → exit 0, then from the worktree root `test -s desktop/dist/win-unpacked/bb2dash.exe` → exit 0 and `test -s desktop/dist/win-unpacked/resources/app/build/icon.ico` → exit 0; Baseline sum with `F=/\.json$/` → 0; Weight check over `"web/src/*.css" ":(exclude)web/src/app/globals.css"` → prints nothing; Time check over `"web/src/*.css" ":(exclude)web/src/app/globals.css"` → prints nothing; harness run `node scripts/walk-box.mjs web/e2e/workspace-layout.spec.ts web/e2e/workspace-acceptance-helpers.spec.ts` → exit 0; Direction check → `125 0 77 0 true`; Exit tokens → `3 0`; New names → `34 0 0` (each of the 34 declared and used); Ring check → `<n> 0 0`; Field check → `5 5 5`; No-select check over the ten files of its note → `10 0 0`; Strength check → `<n> 0`; `git grep -c "cursor: progress" -- web/src` → at least four lines, `PlannerWeek.module.css`, `Popout.module.css`, `SyncButton.module.css` and `StatusSelect.module.css` among them (the four of today); `git grep -c -E "outline:\s*(none\|0)\b" -- web/src` → exactly two lines (`web/src/app/globals.css:1` and `web/src/components/inbox/InboxCard.module.css:1`; five today); Serif check → `8 0 0` (or `7 0 0`, as the command's note says); Busy sites → `24 24`; Mark characters → `0 0`; `git grep -c -E ":disabled:not\(\[aria-busy=.true.\]\)" -- web/src` → exactly five lines; the `## ui-ux-pro-max` grep of §Workers ("The skill") → four lines, each ending `:1`; Red files over `web/src` → exactly nine lines (`CourseSubBar.module.css`, `Inbox.module.css`, `AnnouncementsList.module.css`, `CourseTimeline.module.css`, `PlannerWeek.module.css`, `Bell.module.css`, `CourseSidebar.module.css`, `TopNav.module.css`, `UpcomingTracker.module.css`); Notice files over `web/src` → exactly 13 lines; `git diff --diff-filter=M --name-only origin/main...HEAD -- "web/test/*.test.ts" "web/test/*.test.tsx"` → exactly five lines since amendment 3 (two before it): `web/test/GradebookTable.test.tsx`, `web/test/SubmissionBlock.test.tsx`, `web/test/raw-html.audit.test.ts`, `web/test/type-tokens.contrast.test.ts` and `web/test/upcoming-tracker-css.test.ts` (§Files has what each may change); `git diff --diff-filter=D --name-only origin/main...HEAD -- web/test` → prints nothing; `git diff --diff-filter=MD --name-only origin/main...HEAD -- desktop/test` → prints nothing (no pre-existing desktop test modified or deleted: amendment 2, G-3, kept by amendment 3); `git diff --diff-filter=MD --name-only origin/main...HEAD -- web/e2e` → prints nothing; `git diff --quiet origin/main...HEAD -- web/package.json web/package-lock.json desktop/package.json desktop/package-lock.json web/vitest.config.mts desktop/vitest.config.mts` → exit 0; `git diff --quiet origin/main...HEAD -- mcp-server` → exit 0; `git diff --name-only --diff-filter=A origin/main...HEAD -- "*.png"` → prints nothing | none |
| 21 | 390 px walk green in the walk box on the integrated branch, no writes | R-46, P-79 | PM (runs W-68's spec) | Fingerprint → `requests_open` 0; harness run with `WALK_SHOTS=1`, `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts` → exit 0 and `grep -c "54 passed" C:/Users/stack/.bb2dash-walk/22/<run id>/stdout.log` → 1 and, since task 26, `grep -c "pane scrollWidth=" C:/Users/stack/.bb2dash-walk/22/<run id>/stdout.log` → 24 (the 12 routes inside the shell, in both themes, each measured on the content pane too) (16 routes × 2 themes, 1 popout × 2, 7 open states × 2, reachability × 2, `sidebar toggle`, `unfolded bar at 721`, `bar at 390 longest label`, `bar at 900 longest label`); Fingerprint again → the same `fingerprint`; Shot count → `0 0 6`: `40-phone-home.png` (brand mark, Menu, Sync as an icon and the five icons in one row, no horizontal scrollbar), `41-phone-nav-menu.png` (Home, Planner, Inbox, Grades, Materials, Workspace listed and nothing else), `42-phone-course-grades.png` (table cut at its box edge with its own scrollbar), `43-phone-planner.png` (week cut at the board edge), `44-phone-bell.png` and `45-phone-activity.png` (both panel edges inside the screen); the PM opens all six | "At 390 px nothing scrolls sideways." |
| 22 | Theme walk: 62 shots (60 before amendment 3), each opened and judged | R-53, P-76 | PM (runs W-67's spec) | Fingerprint → `requests_open` 0; harness run with `WALK_SHOTS=1`, `node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts` → exit 0 and `grep -c "64 passed" C:/Users/stack/.bb2dash-walk/22/<run id>/stdout.log` → 1 (62 surface cases, `motion off under reduced motion` and `planner targets`; each surface case: `html[data-theme]` = its theme, computed `body` background = `THEME_BG[theme]`, 0 console messages matching `/hydrat\|#418/`; a `[dark]` case stores nothing under an emulated light system and a `[light]` case stores `light` once under an emulated dark system; the two `25 account-menu` cases and the two `13 login` cases also walk acceptance step 1); Fingerprint again → the same `fingerprint`; Shot count → `31 31 0`, each shot named `NN-<slug>-<theme>.png` from the inventory table and showing that surface open on its theme's ground; the PM or an independent checker opens every shot and writes its line in `WALK.md` | none |
| 23 | Gates: `/code-review main high` twice (the first on the scratch branch `review/styling-22-sweeps`, a local merge of the four worker branches, DoD), `/security-review` | R-53 | PM | `grep -c "^## /code-review main high (sweeps pushed)$" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 1; at the PR the scratch branch is gone and was never pushed: `git branch --list "review/styling-22-sweeps"` → prints nothing and `git ls-remote --heads origin "review/styling-22-sweeps"` → prints nothing; `grep -c "^## /code-review main high (integrated)$" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 1; `grep -c "^## /security-review$" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 1; `grep -c "\| open \|" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 0 (every CRITICAL / HIGH row reads fixed or declined-by-Stack) | none |
| 24 | STATUS, DECISIONS (rows owed, see DoD), ORCHESTRATOR (its Session F prompt rewritten to this brief); PR with the preview | R-53, R-46, S2-styling-1 | PM | `git diff --name-only origin/main...HEAD -- project-state` → exactly three lines; `gh pr view feat/styling-22 --json state -q .state` → `OPEN`; `curl -s -o /dev/null -w "%{http_code}" https://<phase preview host>/login` → 200, read through the Vercel connector's `web_fetch_vercel_url` if protection answers 401 (the `vercel` CLI is not installed); `git ls-files "docs/planning/sprint-2/walks/walk-22/*.png"` → prints nothing | none |
| 25 | The PM's acceptance walk (the script above); Stack's taste calls | R-53, R-46, S2-styling-1 | PM; then Stack (taste calls, the merge word) | `grep -c "^- \[x\]" docs/planning/sprint-2/walks/walk-22/WALK.md` → 77 since amendment 3 (62 before it): `grep -c "^- \[x\] [0-9][0-9] " docs/planning/sprint-2/walks/walk-22/WALK.md` → 62 (the surface lines), the C-1 line, the toggle line, and `grep -c "^- \[x\] PD-[0-9]" docs/planning/sprint-2/walks/walk-22/WALK.md` → 13 (the pre-delivery lines); `grep -c "^- \[ \]" docs/planning/sprint-2/walks/walk-22/WALK.md` → 0; `grep -c "^## Taste calls for Stack$" docs/planning/sprint-2/walks/walk-22/WALK.md` → 1; `grep -c "^. T-[1-5] . " docs/planning/sprint-2/walks/walk-22/WALK.md` → 5 (the five taste calls already put to Stack open the table as rows T-1 to T-5; the dots stand for the table's bars); `grep -c "^Desktop window: dark ground at open, no lighter frame first; Windows in " docs/planning/sprint-2/walks/walk-22/WALK.md` → 1; `grep -c "^Desktop window at its minimum width: " docs/planning/sprint-2/walks/walk-22/WALK.md` → 1; since amendment 3, `grep -cE "^. T-(6\|7\|8\|9\|10\|11) . " docs/planning/sprint-2/walks/walk-22/WALK.md` → 6 (the six taste calls of amendment 3), and `grep -cE "^Desktop (title bar\|menus\|failed load\|update prompt\|icon\|scrollbars and motion): " docs/planning/sprint-2/walks/walk-22/WALK.md` → 6 (the six lines of acceptance step 5), and `grep -c "^## Pre-delivery checklist (ui-ux-pro-max)$" docs/planning/sprint-2/walks/walk-22/WALK.md` → 1 | "The PM walked every screen in light and dark; I ruled on the taste calls and said merge." |
| 26 | **The frame with scrolling panes** (amendment 3, D-1, named exception 5; §The frame). It runs after the four sweeps and before task 27. `.shell` exactly the window's height; the bar no longer sticky; `.main` scrolling by itself with a stable gutter; the side panel filling its height; the pane's scroll position kept across Back and Forward (`usePaneScroll.ts`); the pane measured in the phone-width route cases. Then two lines in other workers' files and one new surface: the Stream's week rail no longer offset by the bar (W-70); `scroll-padding-top` gone from `globals.css` and inventory row 31 in `theme-walk.spec.ts` (W-67) | R-53; D-1, row 18 | W-68; then W-70 and W-67 | **W-68:** `grep -c "position: sticky" web/src/components/shell/TopNav.module.css` → 0 (1 today); `grep -c "position: sticky" web/src/components/shell/CourseSidebar.module.css` → 0 (1 today); `grep -c "min-height: 100dvh" "web/src/app/(app)/Shell.module.css"` → 0 and `grep -c "height: 100dvh" "web/src/app/(app)/Shell.module.css"` → 1; `grep -c "scrollbar-gutter: stable" "web/src/app/(app)/Shell.module.css"` → 1; `grep -c "overscroll-behavior: contain" "web/src/app/(app)/Shell.module.css"` → 1; `cd web && npx vitest run test/pane-scroll.test.tsx test/CourseSidebar.test.tsx test/Workspace.layout.test.tsx test/TopNav.fold.test.tsx` → 0 failures, the two old files unedited. The new file's cases: a new pathname puts the pane's `scrollTop` at 0; Back puts back the `scrollTop` the entry had when it was left, and Forward does the same; nothing is written to `localStorage`; with no pane in the page the hook does nothing. Audit green. Harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts` → exit 0, 54 passed, 0 failed, and `grep -c "pane scrollWidth=" C:/Users/stack/.bb2dash-walk/22/<run id>/stdout.log` → 24. From the same run W-68 pastes the line `unfolded bar at 721: nav scrollWidth=<n>` under a heading of its own, because task 27 sizes the window's minimum width from it (default 17): `grep -c "^## Idle bar width for task 27$" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → 1. **W-70**, once W-68's commit is merged: `grep -c "nav-height" web/src/components/course/CourseTimeline.module.css` → 0 (1 today); `cd web && npx vitest run test/course-timeline-css.test.ts test/CourseTimeline.test.tsx` → 0 failures, unedited. **W-67**, once W-68's commit is merged: `grep -c "scroll-padding-top" web/src/app/globals.css` → 0; harness run `node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts -- -g "31 frame-scrolled"` → exit 0, 2 passed, 0 failed (in each theme: the document's `scrollHeight` equals `innerHeight`; the pane's `scrollTop` is above 0 after it is scrolled to its end; the top bar's top edge is at 0) | "The bar and the side panel stay put. The page scrolls under them, and its scrollbar starts under the bar." |
| 27 | **The desktop shell** (amendment 3, D-1, named exception 6; §The desktop shell). The last worker task. The app's bar as the title bar, following the theme; the window's minimum width raised so the bar clears the three buttons (default 17); the right-click menu; the app's own menu; the failed-load page, never shown for an aborted load; the update prompt in direction D; the drag regions in the page, off under an open dialog | R-53; D-1, row 17 | W-67 (`desktop/`, the drag strip in `globals.css`); W-68 (`TopNav.module.css` `.bar`, and `no-drag` on the bar's controls and panels in its shell stylesheets) | **W-67:** `cd desktop && npx vitest run test/unit/title-bar.test.ts test/unit/app-menu.test.ts test/unit/context-menu.test.ts test/unit/shell-pages.test.ts test/unit/window-background.test.ts test/unit/window.test.ts test/unit/deeplink.test.ts test/unit/gpu-off.test.ts test/unit/sync-launcher.test.ts test/unit/update-prompt.test.ts test/unit/preload.test.ts test/unit/audit.test.ts test/unit/core-portability.test.ts` → 0 failures, the eight old files unedited. The new files' cases. `title-bar`: the dark and the light fill equal the two blocks' `--color-surface`, the symbol colours their `--color-text`, and the height `--nav-height`, all read from `../web/src/app/globals.css`; `LIGHT` equals the light block's `--color-bg`; a colour equal to `LIGHT` maps to light, `LIGHT` written in upper case or with a space before it maps to light too (the comparison ignores case and white space), and `DARK`, `null`, junk and any other colour map to dark; `CONTROLS_WIDTH` is 138, `MIN_WIDTH` is `BAR_IDLE_WIDTH` plus `CONTROLS_WIDTH` rounded up to the next 10, and it is not under 900; a saved width under `MIN_WIDTH` is widened to it and a wider one is kept. `app-menu`: every item is a role item; the roles hold `reload`, `forceReload` and `toggleDevTools`; none is `zoomIn`, `zoomOut`, `resetZoom` or `quit`; no top-level label is File, Edit or Help. `context-menu`: an editable target gives `cut`, `copy`, `paste` and `selectAll`, each enabled by its edit flag; a selection outside a field gives `copy` alone; neither gives an empty list. `shell-pages`: every `#rrggbb` in `promptHtml()` and in the failed-load page is a value the dark block of `globals.css` declares; neither holds `#ff0000`, `#4f6bed` or `#12131a`; the failed-load page holds one link, to the app's address, a CSP that starts `default-src 'none'`, and no `<script`; `showsLoadFailed(-3, true)` is false (an aborted load is not a failed load), `showsLoadFailed(-105, true)` is true, and any code with the main-frame flag false is false. Then, each by itself: `cd desktop && npm run typecheck` → exit 0; `cd desktop && npm test` → exit 0; `cd desktop && npm run test:e2e` → exit 0, 0 failed, the three old specs and `launch.ts`, `harness.ts` and `fixture-server.ts` unedited. The new `chrome.spec.ts`'s cases: under the test variable the window records the options it was built with as an event of a new kind, `window-chrome`, never inside `window-preferences`, whose six keys `shell.spec.ts:66-77` compares; they hold `titleBarStyle` `hidden`, an overlay 52 high in the dark bar's colours and `autoHideMenuBar` true; the live window's minimum width is `MIN_WIDTH`; the installed menu's roles hold no zoom and no quit; a `context-menu` event on an editable target records the four roles and pops no native menu under the test variable; a shell started against an address nothing listens on shows the failed-load page with its Retry link. `grep -c "4f6bed" desktop/src/main/update-prompt.ts` → 0 (1 today); `grep -c "12131a" desktop/src/main/update-prompt.ts` → 0 (1 today); `git grep -c "titleBarOverlay" -- desktop/src/main/window.ts` → one line; `grep -c "minWidth: MIN_WIDTH" desktop/src/main/window.ts` → 1 and `grep -c "minWidth: 900" desktop/src/main/window.ts` → 0 (1 today); `grep -c "recordEvent('window-chrome'" desktop/src/main/window.ts` → 1; `git grep -c "nativeTheme" -- desktop/src` → prints nothing; `git diff --diff-filter=MD --name-only origin/main...HEAD -- desktop/test` → prints nothing; `git diff --quiet origin/main...HEAD -- desktop/package.json desktop/package-lock.json desktop/vitest.config.mts desktop/playwright.config.ts desktop/electron-builder.yml desktop/src/preload` → exit 0; `grep -c "titlebar-area-height" web/src/app/globals.css` → 1 or more; the packed-build smoke: `cd desktop && npm run pack` → exit 0, then from the worktree root `test -s desktop/dist/win-unpacked/bb2dash.exe` → exit 0. **W-68:** `grep -c "app-region: drag" web/src/components/shell/TopNav.module.css` → 1; `grep -c "no-drag" web/src/components/shell/TopNav.module.css` → 2 or more (the bar's controls and panels, and the bar itself under a dialog; 0 today); `grep -c "aria-modal" web/src/components/shell/TopNav.module.css` → 1 or more (the rule that takes the drag region off while a dialog is open; 0 today); `grep -c "titlebar-area-width" web/src/components/shell/TopNav.module.css` → 1 or more; Audit green; `cd web && npm test` → 0 failures. What no test can see is seen in acceptance step 5: a menu row and the popout's close button press in the real window | "The desktop app has one bar. A right click in a field gives Cut, Copy and Paste. If it cannot load I get a Retry page." |
| 28 | **Type: titles and dates** (amendment 3, D-2; §Type rules). Six rules to the body face; the Inbox card's values and the two "seen" stamps out of the code face. No size changes. Each worker does its part in the resume of its sweep | R-53; D-2, row 21 | W-68, W-69, W-70, each in its own files | **W-68:** `git grep -c "font-family: var(--font-heading)" -- web/src/components/shell/CourseSidebar.module.css web/src/components/shell/SearchPanel.module.css web/src/components/popout/SubmissionBlock.module.css` → prints nothing (three lines today); `grep -c "tokens.mono" web/src/components/popout/SubmissionBlock.tsx` → 1 (2 today; the sha keeps it). **W-69:** `git grep -c "font-family: var(--font-heading)" -- web/src/components/planner/PlannerItemPopover.module.css` → prints nothing (one line today); `grep -c "font-family: var(--font-mono)" web/src/components/inbox/InboxCard.module.css` → 0 (1 today). **W-70:** `git grep -c "font-family: var(--font-heading)" -- web/src/components/grades/GradebookTable.module.css web/src/components/grades/GradeModel.module.css` → prints nothing (two lines today); `grep -c "tokens.mono" web/src/components/grades/GradebookTable.tsx` → 0 (1 today). Each: the Weight check over its sweep's paths → prints nothing; `cd web && npm test` → 0 failures. At task 20: Serif check → `8 0 0` | "Table heads and small labels are in the sans. Titles keep the serif. A date reads as a date, not as code." |
| 29 | **Panels leave** (amendment 3, D-3, named exception 7; §Motion). The account menu, the phone Menu, Bell, Activity, the search popover, the Sync toast and the popout fade out as they close, through one hook, `useExit.ts`. The popout leaves where `ItemPopout` hosts it; the planner's event form and wizard, which draw the same frame from W-69's files, close at once (default 18), and `PopoutShell` never waits before it calls `onClose`. In the resume of W-68's sweep, after task 17 | R-53; D-3, row 26 | W-68 (W-67 declared the three exit tokens at task 8) | `cd web && npx vitest run test/useExit.test.tsx test/TopNav.fold.test.tsx test/TopNav.search.test.tsx test/TopNav.workspace.test.tsx test/TopNav.update.test.tsx test/Bell.test.tsx test/SyncButton.test.tsx test/ItemPopout.test.tsx test/AssignmentPopout.test.tsx test/SessionPopout.test.tsx` → 0 failures, the eight pre-existing files unedited. The new file's cases: with no readable exit time the panel is removed in the same render as it closes; with an exit time of 120 the panel stays, carries `data-leaving`, and is gone after 120 ms of fake timers; reopened inside the exit it is open and not leaving; unmounted inside the exit it leaves no timer behind; a close on `PopoutShell` calls `onClose` in the same tick, with an exit time of 120 as well, so a host that drops the frame at once (the planner's form and wizard) is closed at once. `git grep -c "var(--motion-exit)" -- web/src/components/shell` → exactly four lines (`Bell.module.css`, `NavSearch.module.css`, `SyncButton.module.css`, `TopNav.module.css`); `git grep -c "var(--motion-exit-lg)" -- web/src/components/popout` → exactly one line (`Popout.module.css`); `git grep -c "var(--ease-in)" -- web/src/components/shell web/src/components/popout` → exactly five lines; Exit tokens → `3 0`; Time check over the shell paths → prints nothing; Audit green | "A menu fades out as it closes, a little faster than it came." |
| 30 | **Smooth sidebar and search** (amendment 3, D-3, named exception 8; §Motion). Nothing animates `width`. Under 1024 px the drawer slides by transform, from the side `--sidebar-side` names, and its scrim fades; from 1024 px up the side panel switches with no motion; the search field fades in and moves by `--motion-shift`. `html[data-sidebar]`, `--sidebar-side` and the 1024 px step do not change. The closed drawer's offset is written for today's side, and a test holds the sign to the token (default 19). In the resume of W-68's sweep | R-53; D-3, row 32 | W-68 | `cd web && npx vitest run test/shell-motion.css.test.ts test/NavSearch.css.test.ts test/CourseSidebar.test.tsx test/TopNav.search.test.tsx` → 0 failures, the three old files unedited. The new file's cases: no `transition` or `animation` value and no `@keyframes` block in `CourseSidebar.module.css` or `NavSearch.module.css` names `width`; inside `(max-width: 1023.98px)` the drawer's rail moves by `transform` over `var(--motion-enter-lg)` and the scrim eases `opacity`; the closed drawer's `translateX` has the sign of the side that `--sidebar-side` names in `globals.css`, read when the test runs (`row-reverse` is 100%, `row` is -100%), so the case fails if the token is moved and the sign is not; outside that block `.rail` has no `transition`; the search field's arrival names `opacity`, `transform` and `var(--motion-shift)`. `git grep -n -E "(transition\|animation)[a-z-]*:[^;]*width" -- web/src/components/shell` → prints nothing (one line today, `CourseSidebar.module.css:31`); Time check over the shell paths → prints nothing; Audit green; harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "open state 7\|sidebar toggle\|bar at"` → exit 0, 6 passed, 0 failed | "The courses drawer slides in. On a wide window the side panel just switches. Search fades in." |
| 31 | **Marks** (amendment 3, D-3, named exception 9; §The smaller decisions). The bell and Sync redrawn at the bar's weight on the 256 grid; five marks in `icons.tsx`; the 41 characters in 20 TSX files drawn by them, each keeping its character as clipped text inside the wrapper it has today, so a caret that is `aria-hidden` today stays hidden; a label held as a string keeps its value, takes its character from `MARK_CHAR` where a TSX file holds it, and is drawn through `MarkedLabel`; the staged label where it is not a link stays typed (`SubmissionBlock.tsx:98`). W-68's `icons.tsx` commit comes first in its resume and is pushed by itself; W-69 and W-70 do their files once it is merged | R-53; D-3, rows 19 and 22 | W-68 (`icons.tsx`, `SyncButton.tsx`, 5 characters in 3 files of `components/popout/`); W-69 (18 in 8 files); W-70 (18 in 9 files) | **W-68:** `grep -c 'viewBox="0 0 24 24"' web/src/components/shell/SyncButton.tsx` → 0 (1 today); `cd web && npx vitest run test/marks.test.tsx test/TopNav.search.test.tsx test/SyncButton.test.tsx test/Bell.test.tsx test/ItemPopout.test.tsx test/SubmissionBlock.test.tsx test/AssignmentPopout.test.tsx` → 0 failures, the six old files unedited for this task (`TopNav.search.test.tsx:126` and `:130` still find a drawn path in an icon; `SubmissionBlock.test.tsx:265` still finds the typed staged label). The new file's cases: `Mark` draws an `aria-hidden` SVG and holds its character as clipped text; a `Mark` inside an `aria-hidden` wrapper adds nothing to its button's accessible name; `MarkedLabel` with a label that ends in an arrow draws the words and then the mark, and its text content is the label unchanged; a label with no such ending is drawn as it is; `MARK_CHAR` holds the six characters by name, and a label built from it equals the typed string. `git grep -c "export const MARK_CHAR" -- web/src/components/shell/icons.tsx` → one line. The labels that arrive as strings are drawn through `MarkedLabel` where each is rendered, by that file's owner, and each owner greps its own files, every count 1 or more (0 today). **W-68:** `grep -c "<MarkedLabel" web/src/components/popout/SubmissionBlock.tsx` and `grep -c "<MarkedLabel" web/src/components/shell/SyncButton.tsx`; and `grep -c "{STAGED_LABEL}</span>" web/src/components/popout/SubmissionBlock.tsx` → 1 (as today: the one typed label). **W-69:** `grep -c "<MarkedLabel" web/src/components/inbox/InboxCard.tsx` and `grep -c "<MarkedLabel" "web/src/app/(app)/inbox/Inbox.tsx"`; `cd web && npx vitest run test/TodayLayout.test.tsx test/Inbox.test.tsx test/PlannerItemPopover.test.tsx` → 0 failures, unedited (Home's fold button is still named from `Undated`). **W-70:** `grep -c "<MarkedLabel" web/src/components/materials/FileOpenAction.tsx`, `grep -c "<MarkedLabel" "web/src/app/(app)/materials/MaterialsBrowser.tsx"` and `grep -c "<MarkedLabel" "web/src/app/(app)/course/[id]/stream/CourseStream.tsx"`; `cd web && npx vitest run test/course-stream.history.test.tsx test/FileOpenAction.test.tsx test/MaterialsCourseLinks.test.tsx test/CourseClasswork.test.tsx` → 0 failures, unedited (`contentPostLink` still returns `'Open ↗'` and `'Open in Blackboard ↗'`). The PM also looks for a typed arrow on shots 03, 06 and 28 (task 22). **Each worker** runs Mark characters before and after its own commit and records both lines; the fall is its own count: W-68 5 characters in 3 files, W-69 18 in 8, W-70 18 in 9. Each: `cd web && npm test` → 0 failures, with no test edited for this task: every accessible name and every text content is what it was. At task 20: Mark characters → `0 0` | "The bell and Sync match the bar's other icons. Arrows and carets are drawn, not typed." |
| 32 | **Keyboard polish** (amendment 3, D-4, named exception 10; §The smaller decisions). The skip link; the account menu's arrow keys; focus back on Escape and on Dismiss; a toast's timer that waits; drawn labels on five icon buttons. In the resume of W-68's sweep | R-53; D-4, rows 27 and 28 | W-68 (W-67 wrote the shared label class at task 8) | `cd web && npx vitest run test/shell-keyboard.test.tsx test/SyncButton.toast-timer.test.tsx test/SyncButton.test.tsx test/TopNav.search.test.tsx test/TopNav.update.test.tsx test/TopNav.workspace.test.tsx test/Bell.test.tsx` → 0 failures, the five old files unedited. `shell-keyboard`'s cases: opening the account menu puts focus on its first row; Down and Up move between rows and wrap; Home and End jump; the three theme rows are in the order; Escape closes it and focus is on the Account button; an outside press closes it and does not put focus on the button; Escape closes Bell and Activity and focus is on their buttons; Dismiss on a toast puts focus on Sync; each of the five icon buttons has no `title`, carries its name for the drawn label, and keeps its accessible name. `SyncButton.toast-timer`'s cases: a plain toast is gone after `TOAST_MS`; with the pointer on it, it is still there after `TOAST_MS` and gone `TOAST_MS` after the pointer leaves; the same with focus inside it; a toast that asks for something stays. `grep -c "Skip to content" "web/src/app/(app)/layout.tsx"` → 1; `git grep -c "title=" -- web/src/components/shell/TopNav.tsx web/src/components/shell/Bell.tsx web/src/components/shell/ActivityMenu.tsx web/src/components/shell/NavSearch.tsx` → prints nothing (four lines today, five attributes); `grep -c "title={title}" web/src/components/shell/SyncButton.tsx` → 1; harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "reachability"` → exit 0, 2 passed, 0 failed (the first Tab stop is "Skip to content", Enter on it puts focus on the content pane, and Menu and its six links follow as before) | "Tab once and Enter skips the bar. Arrow keys move in the account menu, and Escape puts me back on its button." |
| 33 | **The app's icon** (amendment 3, D-5, named exception 11; §The smaller decisions). `desktop/build/icon.png` drawn by `desktop/scripts/draw-mark.mjs`; `icon.ico` and `tray-16.png` derived by `npm run icons`; the two web icons as byte copies. Beside task 27 | R-53; D-5, row 20 | W-67 | `cd desktop && node scripts/draw-mark.mjs` → exit 0; `cd desktop && npm run icons` → exit 0; then `git status --short desktop/build` → prints nothing (the committed files are what the two scripts write); `cd desktop && npx vitest run test/unit/app-mark.test.ts` → 0 failures. Its cases: `build/icon.png` decodes as an RGBA PNG, 120 by 120 as on `main`; every opaque pixel is a grey, its three channels within 2 of each other; the corner pixel is `DARK` or clear; the centre pixel is the dark block's `--color-neutral-100`; `build/icon.ico` and `build/tray-16.png` are not empty. `cmp desktop/build/icon.ico web/src/app/favicon.ico` → exit 0; `cmp desktop/build/icon.png web/src/app/apple-icon.png` → exit 0 (both hold on `main` too); `git diff --name-only origin/main...HEAD -- desktop/build web/src/app/favicon.ico web/src/app/apple-icon.png` → exactly five lines; `git diff --name-only --diff-filter=A origin/main...HEAD -- "*.png"` → prints nothing; `git diff --quiet origin/main...HEAD -- desktop/scripts/make-icons.mjs desktop/package.json` → exit 0 | "The taskbar, the window's corner and the tray show the app's square mark." |
| 34 | **Captions and codes** (amendment 3, D-5, named exception 12; §The smaller decisions). Four how-to lines become the `title` of what they explain; the attempt status reads in words through `attemptText`. Each worker in the resume of its sweep | R-53; D-5, row 30 | W-69 (`Today.tsx`, `UpcomingTracker.tsx`, `PlannerWeek.tsx`); W-70 (`GradebookTable.tsx` and its test); W-68 (`SubmissionBlock.tsx` and its test); W-67 wrote `attemptText` at task 8 | **W-69:** `grep -c "<span className={styles.sub}>Open = " "web/src/app/(app)/Today.tsx"` → 0 (1 today); `grep -c "styles.detailHint" web/src/components/tracker/UpcomingTracker.tsx` → 0 (1 today); `grep -c "className={styles.legend}" web/src/components/planner/PlannerWeek.tsx` → 0 (1 today); each sentence is still in its file, as a `title`: `grep -c "strip = meeting days" "web/src/app/(app)/Today.tsx"` → 1, `grep -c "line = Monday" web/src/components/tracker/UpcomingTracker.tsx` → 1, `grep -c "status is click-to-edit" web/src/components/tracker/UpcomingTracker.tsx` → 1, `grep -c "the grid shows New York time" web/src/components/planner/PlannerWeek.tsx` → 1; `cd web && npx vitest run test/UpcomingTracker.scroll.test.tsx test/UpcomingTracker.test.tsx test/TodayLayout.test.tsx test/PlannerWeek.test.tsx` → 0 failures, unedited. **W-70:** `grep -c "submission.attemptText" web/src/components/grades/GradebookTable.tsx` → 1 or more; `grep -c "last attempt: needs grading" web/test/GradebookTable.test.tsx` → 2; `git diff --numstat origin/main...HEAD -- web/test/GradebookTable.test.tsx` → one line whose first two numbers are 2 and 2 (two lines added, two removed); `cd web && npx vitest run test/GradebookTable.test.tsx test/status-vocabulary.test.ts` → 0 failures. **W-68:** `grep -c "submission.attemptText" web/src/components/popout/SubmissionBlock.tsx` → 1 or more; `grep -c "last attempt: needs grading" web/test/SubmissionBlock.test.tsx` → 1; `git diff --numstat origin/main...HEAD -- web/test/SubmissionBlock.test.tsx` → one line whose first two numbers are 1 and 1; `cd web && npx vitest run test/SubmissionBlock.test.tsx test/status-vocabulary.test.ts` → 0 failures | "The margins no longer explain the widgets, and a status reads "needs grading"." |
| 35 | **The week strip** (amendment 3, D-5; §The smaller decisions). A plain day outlined, a meeting day filled, one tone, as row 33 and the tile draw it; the label he chose reads the other way round, and he can turn it at T-10 (default 16). In the resume of W-69's sweep | R-53; D-5, row 33 | W-69 | `cd web && npx vitest run test/today-week-strip.css.test.ts test/TodayLayout.test.tsx test/CourseCard.test.tsx` → 0 failures, the two old files unedited. The new file's cases: `.stripBar` has a clear fill and an inset ring; `.stripBarMeet` is filled with the token the ring names and draws no ring; `.stripBar` still declares its width and its height. Audit green | "In a course card's week strip a meeting day is filled and a plain day is an outline." |
| 36 | **Larger click targets** (amendment 3, D-5, named exception 13; §The smaller decisions). Four hit areas from a `::after`; no box moves; the planner's done box never reaches over the title | R-53; D-5, row 31 | W-68 (`Popout` `.close`, `TopNav` `.brand`); W-69 (the planner's done box and title); W-67 declared `--size-target` at task 8 and wrote the `planner targets` case at task 16 | **W-68:** `cd web && npx vitest run test/shell-targets.css.test.ts test/ItemPopout.test.tsx test/TopNav.fold.test.tsx` → 0 failures. The new file's cases: `Popout.module.css` `.close` has a `::after` that reaches `var(--size-target)` both ways; inside `(max-width: 480px)` `TopNav.module.css` `.brand` has a `::after` that is `var(--size-target)` square; neither rule gains a `min-width`, a `min-height` or padding. **W-69:** `cd web && npx vitest run test/planner-targets.css.test.ts test/planner-css.test.ts test/PlannerWeek.events.test.tsx` → 0 failures, the two old files unedited. The new file's cases: the done box's `::after` is absolute, spans the block's height, and its inset on the title's side is 0; the title's `::after` spans the block's height; `.block` keeps its `overflow`, `padding: 3px 5px` and `line-height: 14px`. Audit green, with 0 stale A3 entries. **W-67**, in its last resume, with task 26's run: harness run `node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts -- -g "planner targets"` → exit 0, 1 passed, 0 failed. The PM writes the done box's measured hit size in `WALK.md` under T-11 | "The popout's close and the small brand mark are easy to hit. A planner title never ticks the box beside it." |
| 37 | **Busy says busy** (amendment 3, H-5, named exception 14; §The smaller decisions). `aria-busy` at the 24 sites; the switched-off look on five field and select rules. Each worker in the resume of its sweep | R-53; H-5, row 29 | W-67, W-68, W-69, W-70, each in its own files | Each worker: `git grep -c -E "aria-busy=\{(pending\|busy)\}" -- <its files>` prints exactly these lines. **W-67:** `web/src/app/login/LoginForm.tsx:3`. **W-68:** `web/src/components/popout/AssignmentPlannerBlock.tsx:6` and `web/src/components/shell/SyncButton.tsx:1`. **W-69:** `web/src/components/inbox/InboxCard.tsx:2`, `web/src/components/planner/PlannerEventForm.tsx:1`, `web/src/components/planner/PlannerEventFormFields.tsx:2`, `web/src/components/planner/PlannerSeriesScopeDialog.tsx:3` and `web/src/components/tracker/StatusSelect.tsx:1`. **W-70:** `web/src/components/grades/LinkColumnControl.tsx:2`, `web/src/components/grades/UploadDropZone.tsx:1`, `web/src/components/materials/OpenStoredButton.tsx:1` and `web/src/components/workspace/ConversationList.tsx:1`. `grep -c "aria-busy" web/src/components/shell/TopNav.tsx` → 1 (the update row's, as on `main`). Each: `cd web && npm test` → 0 failures. At task 20: Busy sites → `24 24`, and `git grep -c -E ":disabled:not\(\[aria-busy=.true.\]\)" -- web/src` → exactly five lines (`tokens.module.css`, `StatusSelect.module.css`, `Popout.module.css`, `SearchPanel.module.css`, `PlannerItemPopover.module.css`) | "A field that is switched off looks off. One that is saving looks busy." |
| 38 | **The Upcoming strip's scrollbar** (amendment 3, H-5; §The smaller decisions). `.tracker` leaves its bar to the app's one scrollbar block; the test's second case follows. In the resume of W-69's sweep, after task 18 | R-53; H-5, row 34 | W-69 | `git grep -c -E "scrollbar-(width\|color)\|::-webkit-scrollbar" -- web/src/components/tracker/UpcomingTracker.module.css` → prints nothing; `grep -c "does not hide the scrollbar" web/test/upcoming-tracker-css.test.ts` → 1 (the first case is still there); `cd web && npx vitest run test/upcoming-tracker-css.test.ts test/UpcomingTracker.scroll.test.tsx test/UpcomingTracker.test.tsx` → 0 failures, the last two unedited; Audit green | "The Upcoming strip's scrollbar looks like every other one." |

Where the new tasks sit. Numbers are names, not an order. Tasks 28 to 38 are done by each owner in the resume
that holds its sweep, after the sweep task, so the sweep's baseline is at zero first. Tasks 26 and 27 are the
last stage (D-1): they start once the four sweeps and tasks 28 to 38 are merged, the frame first. The PM's
tasks 20 to 25 follow them. §Workers has the start table.

`WALK.md` is the PM's and holds, in this order: the two run ids and the two fingerprints; 62 surface lines (60
before amendment 3), one
per inventory row and theme, each `- [x] NN <slug> · <theme> · <note>`; the C-1 line and the toggle line; a
"Phone shots" table for 40–45 (a table, not tick lines); the line
`Desktop window: dark ground at open, no lighter frame first; Windows in <light or dark> mode` (acceptance step
5 as amended; a line under it says that a person who picked Light sees one dark frame at each open); the line
`Desktop window at its minimum width: page <n> px wide, sideways scroll <yes or no>` (acceptance step 5); since
amendment 3, the six lines of acceptance step 5 that begin `Desktop title bar: `, `Desktop menus: `,
`Desktop failed load: `, `Desktop update prompt: `, `Desktop icon: ` and `Desktop scrollbars and motion: `,
each saying what was seen and which desktop test proves it (H-6); a section
"## Pre-delivery checklist (ui-ux-pro-max)" with 13 tick lines, `- [x] PD-1 · <the checklist's line> ·
<where its proof is>` to `PD-13` (H-1; acceptance step 8); a
section "Swept, not shot"; a section "Known, not this phase" (the Activity panel's `.ddNote` lines, which have
no rule on `main`; a calendar push-failure line on Home if the token has expired; the planner's done box under
24 px wide, by design; since amendment 3 the 1 px page and the dark update prompt are no longer in this list:
tasks 26 and 27 deal with both; and since the review of amendment 3 it also holds: no arrow keys in Bell,
Activity or the phone Menu; the staged label's typed arrow where the label is not a link; a long Sync label
in a narrow desktop window; and the four panels that close at once, the planner's item popover,
its event form, its wizard and the Inbox apply panel); and "## Taste calls for Stack", a table of
number, surface, theme, what to look at, where, the PM's default, and Stack's ruling. The table opens with the
five calls already put to Stack with tile D, numbered T-1 to T-5 in the first cell, each with the default
taken (acceptance step 6 as amended, G-6): dark even under a light system; the urgency scale; flat, not
striped, reds, with the colour-blind limit named; the brand square and the focus ring in the ink, not red; the
type as picked. The six of amendment 3 follow as T-6 to T-11 (acceptance step 6, with the clauses the review
of the amendment added to T-6, T-7, T-8, T-10 and T-11), and later calls as T-12 and
up. Its notes carry no score, course text, name or email: the
repository is public.

## Workers

| Worker | Stream | Branch · worktree | Owns (Contract §Files has the full list) | Tasks |
|---|---|---|---|---|
| W-67 | Foundation: audit, tokens, theme, desktop, public pages | `feat/styling-22-foundation` · `bb2dash-wt-22-foundation` | `globals.css`, root `layout.tsx`, `tokens.module.css`, `login/`, `privacy/`, `terms/`, `not-found.tsx`, `theme-preference.ts`, `ThemeMenu.*`, the audit, token and theme tests, the allow-list part of `raw-html.audit.test.ts`, `e2e/theme-walk.spec.ts`, `desktop/src/main/window.ts`, `window-background.ts` and its new test (no old desktop test). Since amendment 3 also `desktop/src/main/index.ts` and `update-prompt.ts`, four new modules beside them with their tests and `chrome.spec.ts`, the five icon files with `draw-mark.mjs`, and `lib/queries.grades.ts` for `attemptText` | 1, 2, 3, 8, 9, 10 (component), 11, 16, 33, its part of 37; then its parts of 26 and 36, and 27 |
| W-68 | Shell and phone width | `feat/styling-22-shell` · `bb2dash-wt-22-shell` | `web/src/components/shell/` except `ThemeMenu.*`, `(app)/Shell.module.css`, `(app)/layout.tsx`, `components/popout/`, `QueryState.tsx`, `TopNav.fold.test.tsx`, `e2e/phone-width.spec.ts`. Since amendment 3 also `useExit.ts`, `usePaneScroll.ts`, seven new tests, and line 146 of `SubmissionBlock.test.tsx` | 5, 10 (mount), 12, 13, the `icons.tsx` commit of 31, 17, 29, 30, 32, its parts of 28, 31, 34, 36 and 37; then 26 and its part of 27 |
| W-69 | Screens A | `feat/styling-22-screens-a` · `bb2dash-wt-22-screens-a` | Home files, `planner/`, `inbox/`, `announcements/` (routes and components), `tracker/`, `planner-phone-width.css.test.ts`. Since amendment 3 also two new tests and the second case of `upcoming-tracker-css.test.ts` | 15, 18, 35, 38, its parts of 28, 31, 34, 36 and 37 |
| W-70 | Screens B | `feat/styling-22-screens-b` · `bb2dash-wt-22-screens-b` | `course/`, `grades/`, `materials/`, `workspace/` (routes and components), `components/course/`, `gradebook-phone-width.css.test.ts`. Since amendment 3 also lines 61 and 119 of `GradebookTable.test.tsx` | 14, 19, its parts of 28, 31, 34 and 37; then its line of 26 |
| W-75 | The walk box | `feat/styling-22-walkbox` · `bb2dash-wt-22-walkbox` | `scripts/walk-box.mjs`, `scripts/walk-box.test.mjs`, `docker/walk/entry.sh`, `web/e2e/walk22.lib.ts`, `web/test/walk22-lib.test.ts` | 0 |

Order: tasks 1–2 first, the first code commits merged into `feat/styling-22`; task 0 beside them, merged before
any other worker's first harness run; then W-67's task 3 and W-68's task 5; tasks 6–7 are done (amendment 2:
the tiles are committed and the direction row is written), so nothing waits for a pick; W-68, W-69 and W-70 do
the direction-free C-1 work (12–15; task 13's case 3 runs without the theme control, which W-68 mounts at task
10, §Contract); task 8 still follows the three "Tokens my sweep needs" tables and gates every sweep (16–19).
The order of tasks did not move with amendment 2.

The phase's order since amendment 3 (H-1): the planning half, done and merged (the freeze, the direction, tasks
0 to 2, 6 and 7); the refinement pass, done (2026-10-08, amendment 3); the visual build, tasks 3 to 19 and 26
to 38; the PM's integration and walk, tasks 20 to 25; the PR. Inside the build the order above stands, and
three things are added to it. Each sweep worker goes on, in the same resume, to its parts of tasks 28 to 38.
W-68 starts that resume with task 31's `icons.tsx` commit, pushed by itself, so the other two can draw the
marks. And the last stage is D-1's: task 26, the frame, then task 27, the desktop shell, once the four sweeps
and tasks 28 to 38 are merged.

When each worker starts, and when it is resumed (as amended, G-7). Each worker is spawned once. The first row
it appears in is its spawn; each later row is a resume of the same worker after it has stopped. The PM spawns
or resumes a worker only once what the row needs is on `origin/feat/styling-22`. The worker's first acts are
`git fetch origin`, a merge of `origin/feat/styling-22` into its branch, and its own check from this table. If
the check fails it stops and says so.

| Spawn or resume | Starts once this is merged into `feat/styling-22` | The worker's own check, after `git fetch origin` |
|---|---|---|
| W-67 spawned (1, 2, 3), W-75 spawned (0) | nothing; the branch as frozen | none |
| W-68 spawned (5, 12, 13) | W-67's tasks 1–2 and W-75's task 0 | `git cat-file -e origin/feat/styling-22:web/test/token-audit.allowlist.ts` → exit 0; `git cat-file -e origin/feat/styling-22:web/e2e/walk22.lib.ts` → exit 0 |
| W-70 spawned (14), W-69 spawned (15) | W-68's task-12 commit, which carries task 5 | `git cat-file -e origin/feat/styling-22:web/e2e/phone-width.spec.ts` → exit 0; `git cat-file -e origin/feat/styling-22:web/test/TopNav.fold.test.tsx` → exit 0 |
| W-67 resumed (8, 9, 10 component, 11, 16, then 33 and its part of 37) | the direction's DECISIONS row and the evidence folder (amendment 2's commit); amendment 3's commit (the refined JSON and the design system); the last C-1 commit of W-68, W-69 and W-70 (their C-1 fixes and their tables) | `git grep -cE "Phase 22 direction.*tile D" origin/feat/styling-22 -- project-state/DECISIONS.md` → one line ending `:1`; `git cat-file -e origin/feat/styling-22:docs/planning/sprint-2/evidence/103_style_tiles/direction-d.json` → exit 0; `git grep -c "tileOnly" origin/feat/styling-22 -- docs/planning/sprint-2/evidence/103_style_tiles/direction-d.json` → one line (it is the refined JSON); `git cat-file -e origin/feat/styling-22:design-system/bb2dash/MASTER.md` → exit 0; `git grep -c "^## Tokens my sweep needs$" origin/feat/styling-22 -- docs/planning/sprint-2/verification` → three lines, each ending `:1` |
| W-69 resumed (18, then 35, 38 and its parts of 28, 34, 36 and 37), W-70 resumed (19, then its parts of 28, 34 and 37) | W-67's task-8 commit | `git grep -c "data-theme='light'" origin/feat/styling-22 -- web/src/app/globals.css` → one line (the light block exists); `git grep -c "^\.errorNotice" origin/feat/styling-22 -- web/src/styles/tokens.module.css` → one line (the shared class exists); since amendment 3, `git grep -c "motion-control" origin/feat/styling-22 -- web/src/app/globals.css` → one line, `git grep -c "size-target" origin/feat/styling-22 -- web/src/app/globals.css` → one line, and `git grep -c "attemptText" origin/feat/styling-22 -- web/src/lib/queries.grades.ts` → one line |
| W-68 resumed (10 mount; task 31's `icons.tsx` commit, pushed by itself; 17; then 29, 30, 32 and its parts of 28, 31, 34, 36 and 37) | W-67's task-8 commit and its task-10 component commit | the lines above; `git cat-file -e origin/feat/styling-22:web/src/components/shell/ThemeMenu.tsx` → exit 0; `git grep -c "^\.tip" origin/feat/styling-22 -- web/src/styles/tokens.module.css` → one line |
| W-69 and W-70 go on to their files of task 31 (the same resume if the commit is in; if not, they stop with it owed) | W-68's `icons.tsx` commit of task 31 | `git grep -c "export function Mark" origin/feat/styling-22 -- web/src/components/shell/icons.tsx` → one line (it counts `Mark` and `MarkedLabel`); `git grep -c "export const MARK_CHAR" origin/feat/styling-22 -- web/src/components/shell/icons.tsx` → one line |
| W-67 resumed again (task 16's owed run) | W-68's mount commit | `git grep -c "<ThemeMenu" origin/feat/styling-22 -- web/src/components/shell/TopNav.tsx` → one line ending `:1` |
| W-68 resumed for the last stage (26, then its part of 27) | the four sweep branches with tasks 28 to 38, merged after the first `/code-review` round | on `origin/feat/styling-22`, checked out in its worktree after the merge: Baseline sum with `F=/\.json$/` → 0; Mark characters → `0 0`; Busy sites → `24 24`; Time check over `"web/src/*.css" ":(exclude)web/src/app/globals.css"` → prints nothing |
| W-70 resumed (its line of 26); W-67 resumed (its line of 26 and the `31 frame-scrolled` run, the `planner targets` run of 36, then 27) | W-68's task-26 commit | `git grep -c "scrollbar-gutter: stable" origin/feat/styling-22 -- "web/src/app/(app)/Shell.module.css"` → one line; `git grep -c "position: sticky" origin/feat/styling-22 -- web/src/components/shell/TopNav.module.css` → prints nothing |

Working rules:

* **One spawn each (as amended, G-7).** The direction is in, so no worker waits for a pick and each worker is
  spawned once, with all its tasks, in the order of the task list. The freeze had two spawns per worker, one
  before the pick and one after it. The dependencies between workers did not go away with the pick, so a
  worker still stops where the start table has its next row: it finishes what it can, commits, pushes, says
  what it waits for and stops ("No waiting inside a spawn", below). The PM makes the interim merge and messages
  the stopped worker, which merges `origin/feat/styling-22`, runs that row's check and carries on. That is a
  resume, not a second spawn. W-75 has one task and no resume.
* **A default for everything.** Every prompt carries a default for anything unclear. The worker states the
  default it took in its report and carries on.
* **No message to a running worker.** A running worker is never answered by message. A worker is messaged only
  after it has stopped.
* **No waiting inside a spawn.** A worker never waits or polls for another worker. This is the default for
  three cases: a step needs a commit that is not yet on `origin/feat/styling-22`; a harness case fails because of
  an element in another worker's file; a sweep lacks a token name. The worker finishes everything else it can,
  commits and pushes, writes what it waits for in its verification file and its report (the commit, or the
  element and its file, or the names), and stops. The PM makes the merge or hands the item to the stopped owner,
  then messages the stopped worker, which merges `origin/feat/styling-22` and finishes.
* **Per task.** Workers commit and push per task (`feat(22-T8): …`), run their own checks, and write RED then
  GREEN evidence in their `103_W<nn>_VERIFICATION.md`. A worker lowers its own baseline JSON in the commit that
  removes the literals. In tasks 12–15 only, it raises it in the commit that adds a literal a Contract rule
  names (§Contract, "The baseline before the tokens exist"). A worker never touches `project-state/`.
* **The token hand-off.** A sweep worker may not edit `globals.css`. W-68, W-69 and W-70 each end their C-1
  tasks (12–15) by writing a section "## Tokens my sweep needs" in their verification file: a table of name, today's
  value and where it is used, with names from the allowed families. The name is the first cell of its row and
  stands in backticks, so the Token names command can read it. W-67 reads the three tables at task 8 and
  declares every name at today's value, one name per value where two tables ask for the same thing. Direction
  D's 34 new names (12 before amendment 3) and its values do not come through the tables: W-67 writes them
  from `direction-d.json`, and `--size-target` from this brief
  (§Token set rules), and a table does not ask for one of the 34 under another name. In its sweep a worker uses
  the names as `globals.css` declares them. A name it still lacks is reported,
  not invented: the worker finishes the rest of its sweep, leaves that file's baseline above 0, lists the names
  and stops with its "Baseline sum → 0" check owed. The PM has the stopped W-67 add the names at today's values,
  merges that commit, and messages the stopped sweep worker to finish.
* **The baseline when `main` moves.** A web change that merges to `main` after task 1 moves the baseline. The
  PM merges `main` into `feat/styling-22` and re-baselines in that merge commit.
* **Merges.** Merges into `feat/styling-22` are all merges (a pushed branch is never rebased, and nothing is
  force-pushed). First the interim merges, each made once its commit is pushed. They are the rows of the start
  table above, in this order: W-67's tasks 1–2 (the first of all); W-75's task 0 (before W-68 is spawned);
  W-68's task-12 commit, which carries task 5 (before W-69 and W-70 are spawned); the last C-1 commit of
  W-68, W-69 and W-70, with their C-1 fixes and their "Tokens my sweep needs" tables (before W-67 is resumed for
  task 8, so task 8 can read the tables); W-67's task-8 commit, which carries `.errorNotice` (before the sweeps
  17–19); W-67's task-10 component commit (before W-68 is resumed for its mount); and W-68's mount commit (before
  W-67's owed theme-walk run of task 16). The interim merges did not move with amendment 2. Then the final merges: W-67 first, then W-68, W-69, W-70. The first `/code-review` runs when the sweep
  commits are pushed, before the final merges, on the scratch branch `review/styling-22-sweeps` (DoD): no other
  tree holds all four sweeps at that point. Since amendment 3 those final merges carry each worker's sweep
  with its parts of tasks 28 to 38, and they are not the end: the last stage follows on the merged branch.
  Its merges, in order: W-68's task-26 commit; W-70's line and W-67's line of task 26; W-67's task-27 commits
  with W-68's part of it. The second `/code-review` reads the branch after them. The PM then runs tasks 20–25.
* **The skill (amendment 3, H-1).** Stack's words are that Phase 22 uses ui-ux-pro-max during its design
  execution. Every worker loads the ui-ux-pro-max skill at the start of every task that changes what is drawn
  (8, 10, 12, 13, 16 to 19, 26 to 38), and so does the PM for tasks 21, 22 and 25. It reads the persisted
  design system first: `design-system/bb2dash/MASTER.md`, then the page file for the screen in hand if there
  is one (`pages/home.md`, `planner.md`, `grades.md`, `inbox.md`, `workspace.md`). The skill's scripts run as
  `uv run --no-project python C:/Users/stack/.claude/skills/ui-ux-pro-max/scripts/search.py …`: plain
  `python` is not installed on this machine. Where the skill's advice and this brief differ, the brief wins:
  his palette and his faces, no new dependency, CSS Modules and custom properties, the frozen allowlist, and
  D-1 to D-5. The skill's own rule is that a page file overrides the Master. Here the brief overrides both:
  the design system was written before he ruled and is kept byte for byte. A line of it that says **waits**,
  "needs his word", "a call for him", "the PM's call", "the PM's to rule" or "if he says so" is read against
  §Freeze record, amendment 3 (default 9). The table under these rules lists the lines the decisions
  overtook that carry no such mark. Each worker's verification file carries one section, `## ui-ux-pro-max`, that says the skill
  was loaded for each task, which files it read, each search it ran with its command, and each piece of
  advice it set aside with the rule that won. At task 20:
  `git grep -c "^## ui-ux-pro-max$" -- docs/planning/sprint-2/verification/103_W67_VERIFICATION.md docs/planning/sprint-2/verification/103_W68_VERIFICATION.md docs/planning/sprint-2/verification/103_W69_VERIFICATION.md docs/planning/sprint-2/verification/103_W70_VERIFICATION.md`
  → four lines, each ending `:1`. The PM's own use is the pre-delivery checklist of `WALK.md` (acceptance
  step 8).

The design system's lines that his decisions overtook (default 9 of amendment 3). Every worker reads
`design-system/bb2dash/` first, and the files are as the pass wrote them. These are the lines that read as
the plan and are not, with what holds. Paths are under `design-system/bb2dash/`; `pages/` is left off the
page files' names.

| Where | It says | What holds |
|---|---|---|
| `MASTER.md:263`, under "The window" | "None of it is in Phase 22." | All of it is: tasks 26 and 27 (D-1) |
| `MASTER.md:119`, `:131` and `:141` | the side panel and the search field "keep the motion they have", "as they are" | They move by transform and opacity: task 30 (D-3) |
| `MASTER.md:132` and `:141` | panels "arrive and do not leave with motion"; motion "Nowhere else" | Panels leave: task 29 (D-3). §Motion's table is the list of where motion is allowed |
| `MASTER.md:216` | `scroll-padding-top` keeps a focused control out from under "the sticky bar" | It lands at task 8 and goes at task 26: the bar is not sticky inside the frame |
| `MASTER.md:232` and `:341` | when a toast leaves, "this pass does not touch" | Its timer waits while it is read (task 32) and it fades out (task 29) |
| `MASTER.md:247`; `home.md:34` | the Upcoming strip "keeps its own rule" and "stays a thinner, square bar" | It takes the app's scrollbar: task 38 (H-5) |
| `MASTER.md:251`; `planner.md:43`, `grades.md:44`, `inbox.md:43`, `workspace.md:44` | every other loading line waits once `data-loading` is ruled in | It is not ruled in (H-5). Home's line waits; the others are as on `main` |
| `MASTER.md:201` and `:255`; `grades.md:37` | the switched-off look "waits for the PM's ruling" on `aria-busy` | Ruled in: task 37 (H-5) |
| `MASTER.md:340` | two more icons for the bar's bell and Sync "if he says yes" | He did: task 31 (D-3) |
| `MASTER.md:344` | the title bar advice is kept "for the desktop task that waits" | Task 27 (D-1) |
| `MASTER.md:65`; `grades.md:22` | the serif for titles only "waits"; table heads in the serif: "nothing is changed here" | Labels and controls take the sans: task 28 (D-2). The other half of line 65, the 11px floor and the fonts served by the app, is out |
| `MASTER.md:65`; `grades.md:21`; `inbox.md:23` | dates out of the mono face "waits"; the Seen column and the Inbox card's values are "in the mono face" | Both leave it: task 28 (D-2) |
| `grades.md:36`; `home.md:44`; `planner.md:53` | the status code and the legends are "a call for him" | Both are in: task 34 (D-5) |
| `home.md:35` and `:36`; `grades.md:34` | the week strip "waits"; folds and pagers need "his word" | Tasks 35 and 31 (D-5, D-3) |
| `planner.md:28` | the done box's larger hit area "needs his word" | Task 36, inside the limits of default 5 (D-5) |
| `inbox.md:17` | the apply bar "stays sticky under the top bar" | After task 26 what is sticky sticks to the content pane; its rule needs no edit |
| `MASTER.md:208`, `:251`, `:252` and `:343`; `home.md:42` and `:43`; `planner.md:43`; `grades.md:43`; `inbox.md:42`; `workspace.md:29` and `:42` | the fonts served by the app, the select list drawn by the app, still loading rows, the empty-state form, the text area that grows | Out. §Out of scope lists each with his answer |

## Out of scope

* New screens or routes; any behaviour or copy change beyond the Menu fold, the phone-width rules of §Contract,
  the theme control with its Dark default, the Upcoming work order, the word "Error" the shared error
  notice draws through CSS (81:79-80; the last three by amendment 2), and the ten named exceptions of
  amendment 3 (§Contract, exceptions 5 to 14).
* Any layout, spacing or type-size change, except the frame of task 26 and the hit areas of task 36, which
  move no box. The component-level changes of `component-changes.json` are in
  scope (amendment 2, G-2; entries 56 to 106 as §Component changes by owner marks them); they change which
  radius, colour, weight or motion token a rule uses, and nothing a layout
  test pins. The 18 layout tokens keep `main`'s values.
* **What Stack did not choose on the refinement pass (amendment 3, H-7).** Each was put to him on 2026-10-08
  and is not built in this phase. A later reader does not build it from the tile, from REFINEMENT or from the
  design system, where each is still drawn or described:
  * Small icons beside rows and actions (D-3: he chose "Bar icons at one weight" and not this). No mark is
    added where no character stands today.
  * Still loading rows, a `loading.tsx` per route, and `aria-busy` on a loading block (row 23, entry
    `states-loading-skeleton`; D-4: "Keyboard polish" only).
  * The `data-loading` attribute that would make every loading line wait (row 23, entry `loading-attribute`;
    H-5: not needed). Home's line waits, by the default build; the others are as on `main`.
  * Designed empty states: a title, a sentence and an action (row 24, entry `states-empty`; D-4).
  * The list a select opens drawn by the app (`appearance: base-select`), and text areas that grow and lose
    their grip (row 25, entries `select-list-drawn` and `textarea-grows`; D-4). The closed select is restyled.
  * A floor of 11px under small type (row 21, entry `type-floor`; D-2: sizes stay as they are). The 38
    declarations at 9 and 10px keep their size, as tokens.
  * The fonts served by the app through `next/font` (row 21, entry `fonts-with-the-app`; D-2: the fonts stay
    on the one Google Fonts import).
  * `scrollbar-gutter` on `html` (row 35, entry `page-gutter-stable`; H-5: the panes carry it).
  * Also not in D-1 to D-5 and so not built: a fade between pages; a native theme for the window
    (`nativeTheme`); zoom keys in the desktop menu (taste call T-6); a drawn label on any control outside
    the bar; any change to when a toast leaves other than the wait while it is read.
  * Three things are narrower than a decision's own words. Each is a default of amendment 3, not his
    answer, so each is put to him as a clause of a taste call and stays out unless he says otherwise. A
    drawn label on Sync: D-4 says the bar's icons and row 27 named six controls; the build draws five
    (default 10, T-11). Arrow keys in Bell, Activity or the phone Menu: D-4 says menus; the build gives them
    to the account menu (default 14, T-11). A leaving motion on the planner's item popover, its event form,
    its new-event wizard or the Inbox apply panel: D-3 says panels; the build has seven that leave and these
    four close at once (default 18, T-8).
* Directions A, B and C as built. A red focus ring, a red brand square and striped exam and project bars:
  they are taste calls T-3 and T-4, and the default taken is the ink and flat bars, unless Stack rules
  otherwise.
* A change to the frozen list of 38 contrast pairs. Direction D's own drawn pairs (`direction-d.json`,
  `drawnPairs`) were checked on the tile and are not added to `theme-contrast.test.ts`.
* R-36's rank-weight rule line: shipped in Phase 16 under B-23; per-exam weights (R-36 option M) stay parked.
  The favicon and `apple-icon.png` (R-50, P-80) shipped in Phase 17 and left this list with amendment 3: task
  33 redraws them (D-5).
* `usePopover`'s reshape and the React-compiler lint work (R-51): Phase 17.
* The Workspace page's behaviour, storage and transport (S2-workspace-1): Phase 21; only its tokens are swept here.
* Planner geometry (row heights, `slotToPx`, lanes), the Stream timeline's pinned widths, the courses-sidebar
  mechanics (`data-sidebar`, `--sidebar-side`, the 1024 px drawer), the grade figures and every status label
  (`progress-status.ts`). Amendment 3 touches two of these at the edge and no further: what the side panel
  animates (task 30; its mechanics stay), and Blackboard's own attempt status, which is not one of Stack's
  status labels (task 34).
* Electron beyond what task 27 names. Until amendment 3 this line read "Electron beyond the main window's
  background"; D-1 reverses that for the title bar, the two menus, the failed-load page and the update prompt.
  Still out: the tray, the toasts and R-108's proofs (Phase 17), the poller, the session reader, the preload
  and its one IPC call, the launch and update scripts, packaging (D-6). A
  desktop window that opens light for a person who picked Light: it opens dark, always (amendment 2, G-3).
* The update prompt's mechanism and words (`desktop/src/main/update-prompt.ts`). Until amendment 3 the whole
  file was out ("it keeps its own dark page", DECISIONS 2026-10-08); D-1 reverses that for its look, which
  task 27 redraws in direction D. It stays a dark page.
* An acceptance pack (`acceptance/22/`, `web/e2e/accept22.spec.ts`) and a `just accept 22` run (DECISIONS
  2026-10-08).
* Per-worker Vercel previews, share tokens and hand sign-ins. Committed screenshots.
* Sideways scroll in browser windows between 721 px and the bar's idle width: measured and recorded, not fixed.
* The unfolded bar with the search field open, in a window narrower than that bar (about 923 px to about
  1,091 px by estimate): named, not measured by any case, not fixed. The 900 px sentence holds with search
  collapsed only. In the desktop app the three buttons add their 138 px to both numbers since task 27.
* In the desktop app, a long Sync label while a sync runs, in a window narrower than the bar with that
  label plus the three buttons: the bar can be wider than the room the buttons leave. Under 1,024 px the
  label is capped and the bar is at most 900 px, so that is a window under about 1,038 px. From 1,024 px
  the cap ends and the bar was up to 974 px on 2026-10-05, so that is a window under about 1,112 px. Named,
  not measured by any case, not fixed. The window's new minimum covers the idle bar with search collapsed,
  and the PM's desktop look records the rest (default 17 of amendment 3; acceptance step 5).
* The folded bar between 481 and 720 px with search open or a long Sync label (too wide up to about 673 px and
  about 560 px by the audit's estimate, before the label cap): named, not measured by any case, not fixed. The
  rule that hides three icons while search is open stays in the `(max-width: 480px)` block.
* Known on `main` and left as they are: the
  Activity panel's `.ddNote` lines, which have no rule; `web/README.md`, which has no notes on the walk harness;
  (the app shell 1 px taller than its window was in this list until amendment 3: task 26 ends it);
  the end-of-phase VM test (note 107, a design note on an unmerged branch).
* Tailwind, any UI framework, stylelint, postcss, css-tree, next-themes, `next/font`, any new npm dependency
  (D-19); CI (D-20).
* Any migration, view, RPC, policy or edge function; any write to prod during the walks.
* Editing Phase 17's walk harness (`web/e2e/playwright.config.ts`, `web/e2e/login.mjs`, `web/e2e/walk.ts`, its
  specs).

## Open items, closed 2026-10-08

The PM put nine items to Stack: this brief's five and four the audit added. His answer, verbatim: "test this by
spinning up a testing container and walking the PR yourself. IF there are explicit taste decisions to be made,
call out where to look and I will deliberate on those manually." He overturned none, so items 1–7 go to the
PM's stated defaults, item 8 to the safe option, and item 9 is his sentence (DECISIONS 2026-10-08).

1. **What a direction may change.** Closed, default. Colour, font family and weights, radii and shadows. Not
   spacing, type sizes, planner geometry or the Stream timeline's pinned widths
   (`course-timeline-css.test.ts`). Font weights change through tokens; the 7 literal `font-weight` declarations
   become token references in the sweeps. Amendment 2 (G-2) adds what direction D needs beyond token values:
   the component-level changes of `component-changes.json`. Layout, spacing and type sizes stay out. Amendment
   3 moves this item once more: the refinement pass's default build and Stack's decisions D-1 to D-5 add
   motion, the frame, the desktop shell and the smaller named exceptions (§Contract). Type sizes and spacing
   still do not change.
2. **The brand word at phone width.** Closed, default. It stays as `main` has it: `span.brandName`, clipped at
   ≤480 px. No `.brandWord`. At ≤480 px the Sync button shows its icon only; the label stays in the DOM, clipped
   the way `.sr-only` is, and is the label span's `title`.
3. **Widths just above the fold.** Closed, default. The links fold into Menu at 720 px. The unfolded bar, with
   search collapsed, may never be wider than the desktop window's 900 px minimum, so at ≤1023.98 px the Sync
   label is capped. The case that holds it measures a 900 px page; the window's 900 px is its outer size, so the
   PM also looks at the real window at its minimum width (acceptance step 5). Browser windows between 721 px and
   the bar's idle width (851 px on 2026-10-05) may still scroll sideways; task 5 measures and records the width;
   it is recorded, not fixed. The bar with search open, and the folded bar between 481 and 720 px, are named in
   §Out of scope and not fixed. **Amended by the review of amendment 3 (default 17):** with the title bar
   the desktop window's minimum is no longer 900 px. Task 27 raises it to the idle bar plus the three window
   buttons, about 990 px. The 900 px case stays as the browser's proof of the cap.
4. **The desktop window before the page paints.** Closed, default. The main window's background follows Windows
   (`nativeTheme`), read at each window creation. If Stack picks the theme opposite to Windows, the window shows
   the other ground for one frame at each open. The update prompt keeps its own dark page: out of scope, named in
   `WALK.md`. **Amended the same day (amendment 2, G-3):** the window does not follow Windows. It always opens
   on the app's dark ground, and `nativeTheme` is not read. A person who picked Light sees one dark frame at
   each open. **Amended again (amendment 3, D-1):** the update prompt is redrawn in direction D and stays
   dark; the window's title bar is the app's bar, built dark and following the page's theme once the page has
   stamped it.
5. **Pages without JavaScript.** Closed, default. They show the dark theme (the `:root` block). Since
   amendment 2 that is also what a first visit shows with JavaScript, under any system.
6. **The Menu, after the search icon** (new; amends B-24). Closed, default. At ≤720 px the bar hides the links
   and shows Menu; the panel lists the six pages and nothing else. Search stays the icon in the bar at every
   width. The right group is Sync plus five icon buttons. The ≤720 px strip rules on `.links` go with the fold.
7. **The planner's new-event wizard** (new). Closed, default. It is inventory row 30: 30 surfaces, 60 theme-walk
   cases, 60 surface lines. Amendment 3 adds row 31, the frame: 31 surfaces, 64 theme-walk cases, 62 surface
   lines.
8. **Walk screenshots in a public repository** (new). Closed, the safe option. No PNG is committed. Shots are
   written outside every repository, in the walk box's output folder. `WALK.md` is committed.
9. **How the phase is accepted** (new). Closed by his sentence. The PM walks the PR in a throwaway test
   container and ticks each surface line. Stack picks the tile and rules on the listed taste calls. This amends,
   for this phase, the 2026-09-14 words "Stack approves each". The merge still waits for his word. The pick is
   in since amendment 2: he picked B in the walkthrough and the build is on tile D, which was made from it.

## Session prompt

The prompt below was written by the planning session of 2026-10-08, in Stack's voice, for the fresh session
that runs the visual build. It is his to edit before he pastes it.

`project-state/ORCHESTRATOR.md` §6, Session F (Phase 22) still holds the prompt this phase was started from; the
PM rewrites it to this brief at task 24. Until then that prompt predates the freeze and amendments 2 and 3. It
still says PROVISIONAL, open items 1–5, four workers, tasks 1–2 riding Phase 17's PR, a run on each preview, 58
surface lines and Stack walking the acceptance script, and it knows nothing of tile D, the refinement pass, the
skill rule or tasks 26 to 38. The Phase 17 prompt in the same section (B1) still offers that ride. Where either
differs from this brief, this brief wins, and no session or worker is started from the ORCHESTRATOR prompt.

> `/bb2dash-pm` Continue Phase 22: the visual build, which is the implementation of tile D, "Charcoal". `main`'s STATUS, ORCHESTRATOR (its Session F prompt) and the copy of the brief in the shared checkout are all older than this work: the brief on the branch is the truth, and it is newer than the memories too. The worktree `C:/Users/stack/projects/bb2dash-wt-22` and its branch `feat/styling-22` exist and are yours; the planning session has ended and writes nothing more there. If the worktree is not clean at `origin/feat/styling-22`, stop and tell me. Work there by full paths (a relative path from where you start lands in the shared checkout, which stays on `main`), and cut no new phase branch. Read `docs/planning/sprint-2/briefs/103_PHASE22_styling.md` there in full, its three freeze records first (the freeze; amendment 2, the direction; amendment 3, the ui-ux-pro-max refinement pass and my decisions D-1 to D-5), then the Phase 22 rows at the end of that worktree's `project-state/DECISIONS.md` (they are not on `main`), then memory `phase22-state`. This replaces the skill's "skip nothing" rule: of ORCHESTRATOR read sections 0 to 5 (section 6 is old prompts, the Session F prompt among them: start nothing from it); of STATUS read the first lines of its header and the sections "Where the product is", "GUI phase close-out", "What's next" and "Known issues"; take 91, 93, 94, 105 and 106 by their headings only. You are the first of three sessions I am starting: if the skill's untagged-session check is due, do that review; the other two leave it to you. The brief is the approved plan: give me the triage line and the short report, and do not enter plan mode. I am not limiting plan usage right now. Done and merged on `feat/styling-22`: the planning half (tasks 0, 1, 2, 6 and 7: the walk box, the token audit with its frozen allowlist, the tiles and the direction) and the refinement pass. Not started: the visual build, tasks 3 to 19 and 26 to 38, then your own integration and walk, tasks 20 to 25. The workers of the planning session ended with it and cannot be resumed. W-75 is finished. Spawn W-67 again in its existing worktree `C:/Users/stack/projects/bb2dash-wt-22-foundation` (branch `feat/styling-22-foundation`), starting at task 3, and W-68, W-69 and W-70 in new worktrees (all Opus), each when its row of the brief's start table is met, with the interim merges in the table's order. A row that says "resumed" means the same worker in the same worktree: if that agent is gone, spawn it again there with its verification file as its memory. The last stage is D-1's: the frame with scrolling panes (task 26), then the desktop shell (task 27). Every task that changes what is drawn loads `/ui-ux-pro-max` and reads `design-system/bb2dash/MASTER.md` first; my palette, my type faces and D-1 to D-5 win over the skill, and the brief wins over the design system. Browser runs go through `node scripts/walk-box.mjs`, started in the background; no screenshot is committed. Never answer a running worker by message. Phase 24a and the Phase 23 follow-ups run beside you in their own sessions and worktrees, and the follow-ups are expected to merge first: when `main` moves, merge `origin/main` into `feat/styling-22` and re-baseline in that merge commit, as the brief says. The walk box is the only container you start: never rebuild, restart or stop `sync`, `apply` or `workspace`, never a whole-project `up`, and touch no migration and no `compose.yaml`. Run `/code-review main high` twice and `/security-review` where the brief puts them, each from inside the worktree of the branch under review (from the shared checkout both would read `main`), then walk the PR yourself in the walk box and on the packed desktop build, write `WALK.md` with every taste call and where I should look for it, update STATUS, DECISIONS and ORCHESTRATOR, merge `origin/main` into the branch, open the PR with its preview and stop at "ready when you say so". Tile D is at https://claude.ai/artifact/DLqDKhRNFNoSxJ8YQqaoTU.
