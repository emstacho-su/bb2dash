# Brief 103 freeze audit (Phase 22, styling), 2026-10-08

Date 2026-10-08 · PM: the Fable session · Product manager: Stack
Scope: `docs/planning/sprint-2/briefs/103_PHASE22_styling.md`, written 2026-09-24 against `main` a5042fa.
Result: 125 claims re-measured, 58 hold, 67 do not. The brief was rewritten in place and frozen the same day.

## 1. What was audited and how

Nine agents read the brief against the repository, all read-only. No suite, build or browser was run. The
checkout stayed clean.

* Four **readers**, one per area: foundation (tokens, theme, desktop, the audit's rules), shell (the top bar,
  panels, popouts), screens (the inventory, the two screen clusters) and harness (the walk harness, gates,
  acceptance). Each turned the brief's statements in its area into numbered claims and measured each one on
  `main` 8269fac.
* Four **verifiers**, one per area. Each re-derived every claim of its reader with its own scripts and plain
  `git grep`, on HEAD and on a5042fa, and looked for what the reader missed.
* One **critic**. It read DECISIONS, STATUS and ORCHESTRATOR since 2026-09-24 for later decisions and rules the
  brief does not know, and wrote the gap list G-01..G-17.

`main` moved while they read, from 8269fac to a58be34 (PR #83, docs only). `web/` and `desktop/` are identical
between the two, so every figure holds at both.

| Area | Claims | Hold | Drifted | Gone | Unverifiable | Verifier disagreed | Missed by the reader |
|---|---|---|---|---|---|---|---|
| foundation | 32 | 20 | 12 | 0 | 0 | 1 | 4 |
| shell | 29 | 9 | 17 | 2 | 1 | 2 | 3 |
| screens | 37 | 15 | 19 | 2 | 1 | 3 | 4 |
| harness | 27 | 14 | 11 | 1 | 1 | 6 | 4 |
| total | 125 | 58 | 59 | 5 | 3 | 12 | 15 |

"Drifted" means the claim was true on a5042fa or as planned and is not true on today's `main`. "Gone" means the
thing the claim names no longer exists. "Unverifiable" means it could not be settled without a browser or a
service the agents were not allowed to call.

The PM ruled on the result (F-1..F-15, listed in the brief's "Freeze record"). Stack answered the nine open items
on 2026-10-08: "test this by spinning up a testing container and walking the PR yourself. IF there are explicit
taste decisions to be made, call out where to look and I will deliberate on those manually."

## 2. Every claim that did not hold

One line each: what the brief said, what `main` shows, what the freeze did.

### Foundation (12)

| Id | The brief said | `main` shows | The freeze |
|---|---|---|---|
| A-11 | `--color-neutral-600` is the text colour of 18 declarations in 12 modules | 16 in 11 | Why corrected |
| A-14 | 441 px declarations in 31 of 36 non-token modules, 175 of them 1px/2px, 53 font sizes | 444 declarations (506 literals) in 35 of 46; 198 hold only 1px or 2px; 55 font sizes; 6 `rem` literals in 3 modules | Why corrected, with the counting rule named |
| A-15 | 26 `style=` sites in 14 TSX files; `PlannerBoard.tsx:95`, `:250`, `:358`, `:367` | 25 in 13; keys at `:97` and `:252`; the two consts at `:377` and `:389` | Corrected |
| A-16 | 0 unresolved of 1,461 `var()` references | 0 of 1,659 | Corrected |
| A-17 | A1: six `@media` values, 14 queries | 17 queries over eight values (480 and 760 are new) and one `@container` at 600px | F-5: A1 has eight values and one named container entry |
| A-18 | 21 signed 1px/2px values | 27 | Corrected |
| A-19 | `planner-css.test.ts:111` pins the 14px line height; three A3 examples | The line is `:128`; more pinned and mirrored declarations exist | F-5: A3 has two kinds and names the known entries |
| A-24 | `web/vitest.config.mts` gains coverage entries if `coverage.include` is a list | It is a glob, with a `lines: 83` floor | F-6: the file leaves W-67's set |
| A-25 | The `evidence/` and `verification/` folders are new | Both exist (2 and 35 files) | Wording dropped |
| A-26 | `desktop/src/main/window.ts:233` paints `'#12131a'` | Line 256 | Corrected (F-9) |
| A-27 | The window background is the one line outside `web/` | A second painted window exists, the update prompt, with its own dark page | Item 4: out of scope, one DECISIONS row |
| A-31 | The four owner sets cover every file | `web/src/components/course/` is in no set; W-68's name list is stale | F-6 |

### Shell (20)

| Id | The brief said | `main` shows | The freeze |
|---|---|---|---|
| B-01 | W-68 owns 15 named shell files, `CommandPalette.*` among them | 18 files; `CommandPalette.*` gone; `NavSearch.*`, `SearchPanel.*`, `useDesktopUpdate.ts` new | F-6: the list is today's |
| B-04 | The bar has a wide Search button (`.cmdk`) and four icons | Sync and five icon buttons; no `.cmdk` | Item 6 |
| B-05 | At ≤720 px the bar hides Search | Search is hidden at no width; the links shrink into a scrolling strip | Why rewritten; the strip rules go with the fold |
| B-07 | The brand word gets a `.brandWord` span, clipped at ≤720 px | It is already `span.brandName`, clipped at ≤480 px | Item 2: it stays as `main` has it |
| B-08 | (gone) The 720 px block hides `.links` and `.cmdk` | `.cmdk` does not exist | The fold hides `.links` only |
| B-09 | The Menu ends with a Search button that sends `bb2dash:command-palette`, "the event TopNav already sends" | Nothing sends it; `NavSearch` still listens | The Menu holds the six links only |
| B-11 | At 390 px the row is 362 px and the folded bar needs about 375 px | The row is 373 px; about 313 px folded with the idle label (estimate) | Estimate replaced; tasks 5 and 13 measure |
| B-12 | Search is a command palette with a centred panel and a 180 px box | An icon that grows into a field (240 px; 180 px at ≤480) with a results popover | Row 22 and open state 7 reworded |
| B-13 | (unverifiable; `main`'s own rule) At ≤480 px three icons step aside while search is open | Inline `display: contents` beats the rule, so nothing hides; the bar is about 121 px over (estimate) | F-4: the wrappers become a class at task 13; nav `scrollWidth` ≤ 390 with search open |
| B-14 | Open state 7 is the CommandPalette `.panel` | The NavSearch `.rootOpen` pill and its `.popover` | F-4 |
| B-15 | At 390 px the unfolded bar is too wide | With the idle label the strip absorbs it; long Sync labels overflow (estimate) | Why rewritten; `quietSync` pins the label |
| B-16 | Folded, the bar fits once the word is hidden | No fold fits the long labels (estimate) | Item 2: icon only at ≤480 px |
| B-17 | Unfolded, the bar needs about 950 px, or 1,040 px with Workspace | Measured 851 px idle and up to 974 px with the longest label (STATUS, 2026-10-05) | Item 3; the numbers replaced |
| B-18 | The Sync button reads one short label | 13 strings; the longest has 25 characters | Items 2 and 3 |
| B-20 | The account menu holds the identity and Sign out | Also "Update desktop app" inside the desktop shell; a test pins the `menuitem` list | Row 25 note; F-8: `menuitemradio` only |
| B-21 | Capping Bell and Activity at 360 px puts them inside | The cap alone leaves them 14 px off the left edge at 390 px | F-4: anchored `right: 0` as well |
| B-22 | `.toast` and `.toastError` are the positioned boxes | The positioned box is `.stack`; about 121 px off the left edge at 390 px | F-4: `.stack` is re-anchored |
| B-28 | (gone) The session popout opens from a class block on `/planner` | No screen links to it; only a pasted URL opens it | F-7: row 18 |
| B-29 | The shell cluster has two `style=` sites | Four | F-4 |
| B-31 | The frozen breakpoint set has six values | Eight, and one container step | F-5 |

### Screens (22)

| Id | The brief said | `main` shows | The freeze |
|---|---|---|---|
| C-01 | The four sets are disjoint and the cluster map follows them | Disjoint holds; 86 files were in no cluster | F-6 |
| C-02 | W-70 owns the course, grades, materials and workspace code | `components/course/` (5 files) is in no set; its stylesheet counts 55 | F-6: W-70 |
| C-03 | A file not listed is not touched | `web/src/lib/` (80 files) and `proxy.ts` had no cluster, at count 0; a JSDoc comment holds `var(--slot)` | F-6: foundation, baseline 0; F-5: a fixture for the comment |
| C-04 | 441 px declarations; 26 `style=` sites in 14 files | 444 in 35 of 46; 25 in 13 | Corrected |
| C-05 | The two Workspace folders start at a baseline of 0 | 2, both in `Workspace.module.css:8` | Corrected |
| C-06 | 14 `@media` width queries over six values | 17 over eight, and one `@container` | F-5 |
| C-07 | A3 needs three planner entries; one old test is edited | More pins: four 240px floors, a 32px track, 7.5rem and 9rem, the status select's 3px, `.chip`'s padding, `.barArea`'s 120px | F-5: A3 |
| C-09 | Row 07 is `/course/IST.471/stream`, W-70's | IST.352 is the course with New and Changed posts; the body is `components/course/` | F-7: row 07 |
| C-10 | Row 11 is W-70's sweep | The body is W-68's `AssignmentDetailBody`; W-70 owns the frame | F-7: row 11 |
| C-11 | The Workspace is "not on main today" | It is on `main`; bare `/workspace` shows no conversation | F-7: row 12 |
| C-13 | (gone) Row 18: click the first class block | A class block has no click target | F-7: row 18 |
| C-17 | (gone) Row 22: the command palette | Search in the bar | F-7: row 22 |
| C-22 | Row 28: the `agent_requests` POST and poll are intercepted | The button also reads `sync_runs`; the toast has three forms | F-7: row 28 under `quietSync` |
| C-23 | Row 29: `/grades` with a failed read shows the error notice | That line is muted grey text; the red notice is drawn elsewhere | F-7: row 29 moves to `/inbox` |
| C-25 | The walk's 29 surfaces are the inventory | The planner wizard and several states have no row | Item 7: row 30; other states "swept, not shot" |
| C-26 | Each surface has one sweep worker | Several draw from more than one worker's files | One sentence under the table |
| C-28 | `PlannerWeek.module.css` lines 99 and 830 | 107 and 844 | Corrected |
| C-29 | `planner-css.test.ts:111` | `:128` | Corrected |
| C-32 | `PlannerBoard.tsx` line numbers | Sites at 96, 252, 275, 318, 399, 401, 418, 420; consts at 377 and 389 | Corrected |
| C-34 | (unverifiable) At 390 px only the gradebook and the planner need a scroll container | Read from the stylesheets only; nowrap text could widen other pages | Task 5's RED run shows which routes fail |
| C-35 | Nothing else pins the Workspace modules | `Workspace.layout.test.tsx` (five modules) and `e2e/workspace-layout.spec.ts` | F-8 |
| C-37 | R-36's rule line would live in `lib/grade-model/labels.ts` | It shipped in `GradedSoFarFigure.tsx` and `lib/graded-so-far.ts` | Corrected |

### Harness (13)

| Id | The brief said | `main` shows | The freeze |
|---|---|---|---|
| D-02 | `login.mjs` opens a window and the PM signs in | It signs in by script from the test login file | F-3 |
| D-06 | The PM signs in by hand before each harness run | Automated since Phase 17 | F-3 |
| D-08 | `npm run lint` with warnings not above `main`'s | The `lint` script has no flag; the gate that was run is `npx eslint . --max-warnings 0` | F-10 |
| D-12 | (gone) `web/README.md` carries notes on the harness | It has none | Named out of scope |
| D-13 | (unverifiable) Each worker branch has a preview the spec can run against | Previews exist; none was ever walked; each needs a share token | F-3: no per-worker previews |
| D-14 | `vercel curl` reads the preview behind protection | The `vercel` CLI is not installed | F-3: the Vercel connector |
| D-16 | The no-writes SQL reading 0 shows the walk wrote nothing | It misses the Workspace tables, `reading_progress` and more, and a background sync can make it non-zero | F-11 |
| D-20 | Acceptance is Stack walking seven steps on the preview | Since 2026-10-07 a phase's pack is run after the merge | F-13: the PM's walk; no pack |
| D-23 | The B-24 row gives only the spec total for "wrap" | Still so | The row carries every count |
| D-24 | The RPC section names only task 21 | Still so | "tasks 21 and 22" |
| D-25 | Steps rest on defaults that are PROVISIONAL | Answered 2026-09-27 by delegation | F-1 |
| D-26 | `/login` is walked signed out | A signed-in visit is redirected; a protected preview shows Vercel's page first | F-4: the session cookies are removed; the walk box has no Vercel wall |
| D-27 | The `evidence/` and `verification/` folders are new | Both exist | Wording dropped |

## 3. What the second agents corrected

Twelve claims where a verifier disagreed with its reader. The verifier's value was used after a re-check in the
repository on a58be34.

| Id | The reader said | The verifier's correction |
|---|---|---|
| A-28 | `window.test.ts` has 22 `createWindow` calls; two other suites load `window.ts` | 20 calls; three suites, and `deeplink.test.ts:16` has no electron mock, so `nativeTheme` is read inside `createWindow` |
| B-03 | `Shell.module.css`'s `.stub*` rules serve only the dead `ScreenStub` | `.stubBody` is live (the Planner and Workspace loading lines); only `.stub`, `.stubTitle`, `.stubMeta` may go |
| B-31 | The set gains 480 and 760 | Also one container step, 600px |
| C-03 | 1,660 `var()` references | 1,659 outside comments; 1,660 counts the JSDoc line |
| C-07 | Four new tests pin literals | One pins size literals (`course-timeline-css.test.ts`); the others pin structure. A second mirrored value was not listed: `.barArea` 120px |
| C-35 | The Workspace test holds the folder to six modules | Five; the sixth sheet it reads is outside the folder |
| D-04 | `failReads` aborts GET | It aborts every method |
| D-08 | The last recorded web count is 2863 | 2895 (STATUS, Phase 23 entry). The freeze found a later record, 2913 (STATUS, "Acceptance run", 2026-10-08), and used that |
| D-13 | Whether worker branches get previews was not checked | They do (two past worker branches each show READY builds) |
| D-21 | Acceptance step ids are `3a..3z` only | Ids may run 1 to 99 with a suffix |
| D-23 | The delegation paragraph is line 20 | Line 19 |
| D-25 | Stack must confirm the delegated answers | ORCHESTRATOR already tells the PM to strike PROVISIONAL at the session's start; only the row amending B-6 is owed |

Two smaller corrections with no id: `CourseTimeline.module.css` counts 55, not about 57; six stylesheet-reading
checks were added since the brief, not five (the sixth is `web/e2e/workspace-acceptance-helpers.spec.ts`).

## 4. What the second agents found that the first missed (15)

| Area | Finding | The freeze |
|---|---|---|
| foundation | `course-timeline-css.test.ts` pins seven size literals and the container value | F-5: A1 and A3 entries |
| foundation | Nothing always mounted owns the Auto listener: `ThemeMenu` exists only while the account menu is open | F-8: the listener lives in the boot script; task 9 gains the case |
| foundation | 26 text declarations use tokens the contrast list does not name | F-8: eight pairs added. `--color-bg` used once as a text colour is not in the ruling's list and was not added |
| foundation | Two imperative style writes (`InboxCard.tsx:75-76`) are seen by no count | F-5: outside the scope, and task 1 says so |
| shell | A container-query step exists (600px) | F-5 |
| shell | The Sync toast has three kinds; the walk shows one | Row 28 names the kind shown; the other two are "swept, not shot" |
| shell | 25 `style=` sites in 13 files; four are W-68's | Corrected |
| screens | Two old tests assert inline style keys the audit counts | F-5: A5 |
| screens | Two mirrored values have private constants | F-5: source-backed A3 entries; no export added |
| screens | `web/vitest.config.mts` leaves W-67's set | F-6 |
| screens | The brief's 441 is not comparable with 444; the same method gives 404 at a5042fa | Why names the method and both figures |
| harness | The desktop step cannot be walked on a preview: the build loads production | F-9 |
| harness | "Sync and four icons" is five; whether Search folds into the Menu is a product call | Item 6 |
| harness | The seams assume a baseline already in `npm test` and the Workspace at 0 | Seams rewritten |
| harness | Task 20's "one modified test" count is at risk from the timeline test | The pins are allowlisted, so that test stays unedited |

## 5. The gap list

| Gap | What it is | Handling |
|---|---|---|
| G-01 | B-24's reason for the Menu no longer holds since the search icon | Item 6; DECISIONS row amending B-24 |
| G-02 | Acceptance is now a pack run after the merge | F-13: the PM's walk in the walk box; no pack; DECISIONS row |
| G-03 | No one rule governs walk screenshots in this public repository | Item 8: no PNG is committed; shots stay outside every repository |
| G-04 | The tiles are committed as HTML and could carry real data | F-12: sample data only, each fragment marked |
| G-05 | The desktop update prompt is a second, dark window | Item 4: out of scope; DECISIONS row; named in `WALK.md` |
| G-06 | The desktop step cannot be done on a preview; desktop gates are thin | F-9: a second instance from the phase worktree; F-10: `test:e2e` if W-67 says the launch can break |
| G-07 | The no-writes SQL can fail with no walk write and misses new write paths | F-11: the guard in every case and a before-and-after fingerprint; "blocked" means repeat |
| G-08 | Four lessons are missing from the task list | (a) every shot is opened and judged: F-13. (b) the browser layout specs run in the walk box: F-10. (c) a bare `npm run walk` is never run in a Phase 22 worktree; the proposed env switch on the two specs was not added (section 7). (d) two spawns and no message to a running worker: F-14. (e) the first `/code-review` runs before the final merges: F-10 |
| G-09 | The B-6 row says the audit landed with Phase 17; it did not | F-1; DECISIONS row amending B-6 |
| G-10 | Open item 3's widths are wrong and the Sync label now changes length | Item 3 with the measured 851 and 974 px; two "longest label" cases; `quietSync` |
| G-11 | New screen states have no inventory row | Item 7: row 30; a "swept, not shot" list. The Stream block's placement stays Stack's open item |
| G-12 | `main` moved during the audit; worker ids up to W-74 are taken | The branch is cut from a58be34; the fifth worker is W-75 |
| G-13 | Out-of-phase web PRs and acceptance runs share this machine | F-14: the PM re-baselines when `main` moves; a walk and `just accept` never run at the same time |
| G-14 | The harness login changed; a push during a walk breaks it | F-3: the walk box signs in by script on its own build, so no push rule is needed |
| G-15 | The Nov 30 to Dec 13 freeze; the calendar token expires about 2026-10-09 05:00Z | Nothing to do now. A push-failure line on Home is named in `WALK.md` if it shows |
| G-16 | Known issues on `main` will show on the walk | A "Known, not this phase" list in `WALK.md`; F-10 names the three SQL units |
| G-17 | The end-of-phase VM test is a design note, not a duty | Not built here. Its lesson is taken: no check reads a result through a pipe |

## 6. Re-checked for the freeze, on a58be34

The writer of the freeze re-ran these in `bb2dash-wt-22` before carrying a value into the brief:

* 444 px declarations (506 literals) in 35 of 46 non-token modules; 198 declarations hold only 1px or 2px; 55
  font-size declarations; 27 signed 1px/2px literals; 6 `rem` literals in 3 modules.
* 25 `style=` sites in 13 TSX files, with their line numbers; 4 in the shell cluster.
* 1,659 `var()` references outside comments (1,652 in CSS, 7 in TSX), 0 unresolved.
* 16 `color: var(--color-neutral-600)` declarations in 11 modules.
* 17 `@media` width queries over {480, 620, 640, 720, 760, 820, 900, 1023.98} and one `@container` at 600px
  (`CourseTimeline.module.css:410`).
* 7 literal `font-weight` declarations outside `globals.css` (8 with `globals.css:185`).
* Every `.css`, `.ts` and `.tsx` file under `web/src` falls in exactly one cluster once `components/course/`,
  `lib/` and `proxy.ts` are mapped: 90, 31, 46, 66. Only `favicon.ico` and `apple-icon.png` have no owner.
* Line numbers: `window.ts:253` and `:256`; `PlannerWeek.module.css:107`, `:844`; `planner-css.test.ts:49`,
  `:128`; `PlannerBoard.tsx`'s eight sites and two consts; `TopNav.module.css:244-281`; `globals.css:18`, `:164`,
  `:212`, `:220-230`.
* `item-popout.spec.ts` builds `/course/IST.466/classwork?view=timeline&item=session:105`. The wizard's button is
  `aria-label="New event"` at `PlannerWeekHeader.tsx:68`.
* The fingerprint's columns, each read in `db/migrations` (001, 031, 032, 033, 057, 067, 082, 140).
* Route count 16; no `ScreenStub` under `web/src/app`; `@playwright/test` 1.63.0; the `lint` script is plain
  `eslint`.
* Each pipe-free command the brief names was tried in Git Bash on today's tree or on a scratch fixture.

## 7. Where the freeze departs from a ruling, or could not apply a finding

* **The Sync button's `title`.** Item 2 and item 3 put the full label in the button's title. `SyncButton.test.tsx`
  pins the button's `title` to `phaseTitle`'s sentence in four places, and no old test may be edited. The brief
  gives the label its own span and puts the full label in that span's `title`; the button's title stays.
* **The test-count floor.** F-10 names 2895. STATUS holds a later record, 2913 ("Acceptance run", 2026-10-08).
  The brief uses 2913.
* **The raw-HTML guard.** `web/test/raw-html.audit.test.ts` allows `dangerouslySetInnerHTML=` in one file only.
  Task 9 injects the theme script from the root layout, so that test's allow-list must gain the file. No ruling
  covers it. The brief names it as the third pre-existing test edit, moves task 20's count of modified test
  files from 1 to 2, and lists the DECISIONS row the test's header asks for as owed in the PR.
* **G-08 (c), an env switch on the two new specs.** F-3 fixes the walk box's interface and names no switch, so
  none was added. After the phase a bare `npm run walk` also runs both specs. This is left for the PM.
* **Font weights.** Item 1 says weights change through tokens. The brief adds `--font-*` to the families a new
  name may use and checks the seven literals with a plain `git grep`. The audit's five counts are unchanged.
* **The token hand-off.** A sweep worker may not edit `globals.css`, and the brief never said how W-67 learns
  which names the sweeps need. The freeze adds a "Tokens my sweep needs" table to each sweep worker's first
  spawn. It follows from F-14's two spawns; no ruling asks for it.
* **A second layout spec.** F-10's example names `workspace-layout.spec.ts`. The brief also runs
  `workspace-acceptance-helpers.spec.ts`, which reads the same two stylesheets.
* **The cluster rule.** With every file mapped, the ratchet now fails when any scanned file is in no cluster,
  not only one with a non-zero count.
* **The fingerprint select was not run.** Its columns were confirmed in the migrations. It was not executed
  against production.
* **The Activity panel's `.ddNote`.** The class has no rule on `main`, so three lines are unstyled. A fix is a
  visible change, not a token swap. It is listed as known and left.

## 8. Where the full evidence is

The workflow journal holds every agent's full return value: each claim with its quote, its evidence and the
command that produced it, each verifier's verdict, and the critic's seventeen gaps:
`~/.claude/projects/C--Users-stack-projects-bb2dash/4e1944d8-f2ff-4d05-bb5f-e6cd2af75826/subagents/workflows/wf_4533262d-feb/journal.jsonl`.
It is a session file on the laptop, not a repo file. This record is the durable summary.
