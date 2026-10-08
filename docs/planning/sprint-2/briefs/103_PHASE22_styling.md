# Phase 22 · Styling: tokens, light and dark, the phone-width nav, Stack's direction

Date 2026-09-24 · Frozen 2026-10-08 against `main` a58be34 · Amended 2026-10-08 (the direction: tile D) · PM: the Fable session · Product manager: Stack
Requirements: R-53, R-46; S2-styling-1
PM-added steps: P-15, P-16, P-17, P-76, P-77, P-78, P-79
Branch `feat/styling-22` · Worktree `bb2dash-wt-22` · Migration range: **none** (no number reserved, 94 §1)
One PR per phase, with no exception. Tasks 1–2 (P-15, P-16) did not ride Phase 17's PR. They are this branch's
first code commits (DECISIONS 2026-10-08, the row that amends the 2026-09-27 B-6 row).
Status: **Contract frozen 2026-10-08.** B-6, B-23 and B-24 were answered by delegation on 2026-09-27, each to its
default (DECISIONS rows of that date). Stack answered the nine open items on 2026-10-08 (§Open items, closed).
The direction was decided the same day: tile D, "Charcoal" (§Freeze record, amendment 2).

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
| B-24 | Phone-width nav (Q15) | **Default, amended 2026-10-08** (§Open items, item 6). The row folded "its page links … and Search into one Menu … replacing today's hide-Search step". Its recorded reason, "TopNav already hides Search at ≤720 px", stopped being true with the 2026-09-30 search icon. As amended: at the **existing 720 px step** the Menu holds the six page links and nothing else; Search stays an icon in the bar; the Sync button shows its icon only at ≤480 px and its label is capped at ≤1023.98 px | "No Menu" (keep the strip, or wrap to two rows): task 12 changes. Open state 4 leaves, so the open states are 7 → 6 and task 13's 14 open-state cases → 12 (its run 22 → 20). `phone-width.spec.ts` 54 cases → 52. Inventory row 27 leaves: 29 surfaces, `theme-walk.spec.ts` 60 cases → 58, task 22's shots 30 + 30 → 29 + 29, `WALK.md` 62 tick lines → 60. Task 21 drops `41-phone-nav-menu.png`. The reachability cases become "each link and the search icon visible and focusable with no menu". A different breakpoint: A1's frozen set changes and a DECISIONS row records it. |

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
token values, and through the 55 component-level changes of
`docs/planning/sprint-2/evidence/103_style_tiles/component-changes.json`. Those are which radius, colour or
weight token a rule uses, the shared error-notice form, link underlines, pill buttons, the Upcoming work block
in tile C's shapes, and the course side panel on the panel grey. Each change belongs to the worker who owns the
file it names; the four owner sets do not move (§Component changes by owner). Still out: any layout, spacing or
type-size change.

Screen inventory (the walk's 30 surfaces; each is shot and ticked in light and in dark, 60 lines). The first
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

Sweep names the worker whose stylesheet leads; a surface may also draw W-68's `PopoutShell`, `QueryState` or
`Shell.module.css` header. Theme-walk shots are named `NN-<slug>-<theme>.png` for NN 01–30. The six phone shots
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
links in the nav, and both stay unedited. Search stays the icon in the bar at every width. Escape closes the
Menu and returns focus to it; an outside click or a pathname change closes it; Menu and the account menu close
each other; ☰ closes Menu; Menu never writes `html[data-sidebar]` or `localStorage['bb2dash.sidebar']`.
`usePopover`, as Phase 17's R-51 left it, closes on an outside mouse press and on Escape and returns no focus.
So `TopNav` calls the other menu's `close()` itself, as ☰ does today (`TopNav.tsx:119-122`), and returns focus
to Menu itself, only while Menu is open. The hook is not reshaped.

The ≤720 px strip rules on `.links` (`TopNav.module.css:251-257`: its `gap`, `flex: 0 1 auto`, `min-width: 3em`,
`overflow-x: auto`, `scrollbar-width: none`) are deleted with the fold. The brand word stays as `main` has it:
`span.brandName`, clipped in the `(max-width: 480px)` block (`TopNav.module.css:266-273`). There is no
`.brandWord`.

The Sync label gets a span of its own. At ≤480 px the button shows its icon only: the label text stays in the
DOM (`SyncButton.test.tsx` finds the button by its label) and the span gets `.sr-only`'s declarations
(`globals.css:220-230`, copied, not edited) in a `(max-width: 480px)` block of `SyncButton.module.css`. At
≤1023.98 px the span is capped (a `max-width` with `overflow: hidden` and `text-overflow: ellipsis`), so the
unfolded bar, with search collapsed, is never wider than the desktop window's 900 px minimum
(`desktop/src/main/window.ts:253`). The full label is the span's `title`. The button's own `title` stays what
`phaseTitle` returns, the sentence that says what the sync is doing: `SyncButton.test.tsx:157`, `:244`, `:458`
and `:464` pin it.

What the 900 px case proves. `bar at 900 longest label` measures a page 900 px wide with search collapsed. The
window's 900 px is its outer size (`window.ts` sets no `useContentSize`), so the page inside is narrower by the
frame and by the page scrollbar the shell shows (STATUS, Known issues). The case does not prove the real window.
The PM looks at the real window at its minimum width in acceptance step 5 and records what it shows. W-68 sets
the cap with that in mind: the idle bar is 851 px, so the room is small.

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
* Desktop: `windowBackground()` from `desktop/src/main/window-background.ts` (new) replaces the `'#12131a'`
  literal (`window.ts:256`). It takes no argument and returns the dark `--color-bg` value (new export `DARK`),
  pinned by test to `globals.css`. `nativeTheme` is not read anywhere in `desktop/`, so
  `desktop/test/unit/window.test.ts` is **not edited** and `desktop/test/unit/deeplink.test.ts:16` still loads
  `window.ts` with no electron mock. The window is destroyed on close and built again on every open since
  2026-09-30, and each time it opens on the app's dark ground. A person who picked Light sees one dark frame at
  each open, before the page paints; that is accepted and written down (DECISIONS 2026-10-08). The update prompt
  (`desktop/src/main/update-prompt.ts`) keeps its own dark page and is not touched.

**Token set rules (R-53; amendment 2, G-5).** Every custom property `main` declares keeps its name. Task 8
writes direction D's values from `docs/planning/sprint-2/evidence/103_style_tiles/direction-d.json`: every name
of its `dark` map into `:root` and every name of its `light` map into `:root[data-theme='light']`, value for
value (107 and 73 names; the Direction check of §Task list compares them). New names are allowed in the
families `--color-*`, `--shadow-*`, `--text-*`, `--size-*`, `--radius-*` and `--font-*`, declared in `:root`, and
every `--color-*` / `--shadow-*` is redeclared in the light block (the light block's set of those names equals
the dark block's). D brings 12 new names. Each is declared at task 8 and each is used by a rule once the sweeps
are in (the New names check): `--color-panel`, `--color-on-accent`, `--radius-xs`, `--radius-control`,
`--radius-chip`, `--radius-bar`, `--radius-day`, `--shadow-mark`, `--size-underline`, `--size-underline-mark`,
`--size-underline-offset` and `--size-notice-bar`. The names the sweeps need for their size literals still
arrive through the token hand-off (§Workers), beside these 12. The ramps are redefined in light so a step keeps
its distance from the ground (`--color-neutral-100` is the strong end on either ground).

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
the 600 px container step (A1, A3). `web/test/upcoming-tracker-css.test.ts`: W-69 keeps `.tracker`'s
`scrollbar-color` as two `var(--color-*)` tokens. `web/test/NavSearch.css.test.ts`: W-68 adds no chained
`composes` and no CSS `order` on `.field` or `.spinner`.

### Component changes by owner

Amendment 2, G-2. The source is `docs/planning/sprint-2/evidence/103_style_tiles/component-changes.json`, 55
entries; each row below is one entry, by its `id`, in the file's order. Paths are under `web/src`. The JSON's
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
* **W-68 shell and phone width:** every file in `web/src/components/shell/` except `ThemeMenu.*` (today:
  `TopNav.tsx`, `TopNav.module.css`, `Bell.tsx`, `Bell.module.css`, `ActivityMenu.tsx`, `SyncButton.tsx`,
  `SyncButton.module.css`, `CourseSidebar.tsx`, `CourseSidebar.module.css`, `NavSearch.tsx`,
  `NavSearch.module.css`, `SearchPanel.tsx`, `SearchPanel.module.css`, `SidebarProvider.tsx`, `usePopover.ts`,
  `useDesktopUpdate.ts`, `icons.tsx`, `ScreenStub.tsx`); `web/src/app/(app)/Shell.module.css`;
  `web/src/app/(app)/layout.tsx`; everything in `web/src/components/popout/`;
  `web/src/components/shared/QueryState.tsx`; new `web/test/TopNav.fold.test.tsx`, `web/e2e/phone-width.spec.ts`;
  `web/test/token-audit.baseline/shell.json` from task 1 on.
* **W-69 screens A:** `web/src/app/(app)/page.tsx`, `Today.tsx`, `Today.module.css`, `NeedsAttention.tsx`,
  `NeedsAttention.module.css`, `CourseGradeFigure.tsx`; `web/src/app/(app)/planner/`, `inbox/`, `announcements/`;
  `web/src/components/planner/`, `tracker/`, `inbox/`, `announcements/`; new
  `web/test/planner-phone-width.css.test.ts` and `web/test/UpcomingTracker.urgency.test.tsx`;
  `web/test/token-audit.baseline/screens-a.json`.
* **W-70 screens B:** `web/src/app/(app)/course/`, `grades/`, `materials/`, `workspace/`;
  `web/src/components/grades/`, `materials/`, `workspace/` (Phase 21's `ConversationList`, `MessageList`,
  `Composer`, `TierBadge`, `ServiceStatus` and their modules, the token sweep and the component changes of
  their files only, no new module in the folder) and
  `web/src/components/course/` (the Stream timeline, 5 files); new `web/test/gradebook-phone-width.css.test.ts`;
  `web/test/token-audit.baseline/screens-b.json`.
* **W-75 walk box:** only its own new files: `scripts/walk-box.mjs`, `scripts/walk-box.test.mjs`,
  `docker/walk/entry.sh`, `web/e2e/walk22.lib.ts`, `web/test/walk22-lib.test.ts`, `103_W75_VERIFICATION.md`.
* **PM:** the tiles and the rest of the evidence folder, `walks/walk-22/WALK.md`, `103_PHASE22_REVIEW.md`, `103a_PHASE22_FREEZE_AUDIT.md`,
  `project-state/STATUS.md`, `DECISIONS.md`, `ORCHESTRATOR.md`, this brief. Workers never touch `project-state/`.
  Nobody edits `web/e2e/playwright.config.ts`, `web/e2e/login.mjs`, `web/e2e/walk.ts`, any spec already under
  `web/e2e/`, `web/package.json`, `web/package-lock.json`, `desktop/package.json`,
  `desktop/src/main/update-prompt.ts`, `web/src/lib/planner-rows.ts` or any `db/` file.

Checked against `git ls-files web/src` on a58be34: every `.css`, `.ts` and `.tsx` file falls in exactly one of
the four clusters. Two files belong to no set and are not touched: `web/src/app/favicon.ico` and
`web/src/app/apple-icon.png` (binary, outside the audit's scope, shipped in Phase 17).

Three crossings, resolved by order, not by shared edits: W-75's task 0 is merged into `feat/styling-22` before
any other worker's first harness run; W-68 adds the one `<ThemeMenu />` line to `TopNav.tsx` after W-67's
`ThemeMenu` commit is on the phase branch; W-67 creates all four baseline JSONs at task 1 and each passes to its
owner from then on. No pre-existing test file is edited except `type-tokens.contrast.test.ts` (at task 3 for
the reader, and at task 8 for the urgency rule) and the allow-list part of `raw-html.audit.test.ts` (its header
sentence, its constants and the two cases that read them). No pre-existing desktop test is edited (amendment 2,
G-3). The Upcoming work order gets a new test file; `UpcomingTracker.test.tsx` checks that the five legend
labels are there, not their order, and stays unedited.

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
  page with about ten hard-coded colours); it stays dark and is out of scope. Electron keeps `minWidth: 900`, so
  C-1's 390 px does not reach it; the label cap is what keeps the bar, with search collapsed, inside a 900 px
  page. The window's 900 px is its outer size, so the PM looks at the real window at its minimum width
  (acceptance step 5). Containers (Phase 14)
  never touch the renderer (v3 D-20 excludes containerizing the Electron GUI).

### Must respect

DECISIONS rows, verbatim:

* [2026-09-09] "Renderer: CSS Modules + custom properties, **no Tailwind**"
* [2026-09-09] "Workflow SOP: dev on branches, push per completed task, **one PR per phase**, merge only on Stack's word"
* [2026-09-10] "`web/` test harness is vitest + Testing Library (jsdom), versions pinned exact; coverage `include` scoped to `queries.search.ts` until screens gain tests"
* [2026-09-14] "GUI decision 1c amended: ☰ toggles a **course sidebar**, not a pop-down. The rail holds the course list; `.main` drops its `--content-max` cap and fills the rest of the width"
* [2026-09-14] "The sidebar's side is one token, `--sidebar-side` in globals.css, read as a flex-direction (`row` = left, `row-reverse` = right) by the shell row, the drawer wrapper and the rail's hairline"
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

Frozen brief lines this phase inherits (81, 2026-09-14 and 2026-09-16; 80c, 2026-09-16), verbatim:

* 81:17-19 "Definition of done: **every screen on tokens, light + dark, Stack approves each** — no hard-coded colours or sizes outside `globals.css`; both themes render; a per-screen preview checklist he ticks." (For this phase the PM ticks each surface line and Stack rules on the listed taste calls: DECISIONS 2026-10-08.)
* 81:50 "No layout, copy, or behaviour change: the screen tests from earlier phases pass unchanged."
* 81:67-69 "They are **named exceptions** to the DoD's "no layout, copy, or behaviour change" rule; each needs its own check and a line in the acceptance checklist."
* 81:73 (C-1, Expected) "no horizontal page scroll at 390 px on every route; wide tables scroll inside their own container"
* 81:79-80 "New screens, behaviour changes (except C-1 to C-3 above), Tailwind or any UI framework, new dependencies."
* 80c:47 "Phase 13's C-1..C-3 stay in 13 unless Stack moves them." (B-23 moved C-2 and C-3 out on 2026-09-27.)

## MVP (in Stack's words)

Stack's own words for this phase are four; the fourth, on the direction, is at the end of this section.
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

## Definition of done

SOP gates. Each command is run by itself and its exit code is recorded; no result is read through a pipe.

- [ ] In `web/`: `npm run typecheck` → exit 0; `npm run build` → exit 0; `npm test` → exit 0, 0 failures, test
      count not below 2913 (`main`'s last recorded count, STATUS "Acceptance run", 2026-10-08);
      `npx eslint . --max-warnings 0` → exit 0 (the `lint` script itself has no flag);
      `npm run test:coverage` → exit 0 (the `lines: 83` floor holds, the two new modules included).
- [ ] In `desktop/`: `npm run typecheck` → exit 0; `npm test` → exit 0, 0 failures; `npm run test:e2e` too if
      W-67's verification file says the one-line change can break the launch. `mcp-server/` is not touched:
      `git diff --quiet origin/main...HEAD -- mcp-server` → exit 0.
- [ ] The existing browser layout specs, in the walk box:
      `node scripts/walk-box.mjs web/e2e/workspace-layout.spec.ts web/e2e/workspace-acceptance-helpers.spec.ts`
      → exit 0.
- [ ] `/code-review main high`, twice: once when the sweep commits are pushed and before the final merges, so
      findings go back to the same workers as a numbered round 2; once on the integrated branch. The first run
      needs a tree that holds all four sweeps, and `feat/styling-22` does not yet: the PM cuts a scratch branch
      `review/styling-22-sweeps` from `feat/styling-22` in a worktree of its own (`bb2dash-wt-22-review`), merges
      the four worker branches into it locally and runs the review there. That branch is never pushed, and it and
      its worktree are removed after the review. Every CRITICAL and HIGH finding fixed or declined by Stack,
      recorded in `103_PHASE22_REVIEW.md` (task 23).
- [ ] `/security-review`: **required**, because the phase adds an inline script to the root layout of every page
      and reads a stored value into it (`localStorage['bb2dash.theme']`).
- [ ] "0 failures" is read against `web/` and `desktop/` only. Three SQL units fail on `main` on production's
      course data and are not this phase's: `grading_invariants.sql`, `phase18_122_supersede_rule.sql` and
      `phase18_golden_truth.sql` (STATUS, Known issues). No check here runs the SQL suite.
- [ ] STATUS, DECISIONS and ORCHESTRATOR updated in the PR. Six rows were written with the freeze on 2026-10-08:
      Stack's answer; the B-6 amendment; the B-24 amendment; the allowlist A1–A5; the walk box, no committed
      screenshot and no acceptance pack; the desktop window and the update prompt. Four more were written with
      amendment 2 the same day: the direction, tile D (task 7); the scope, with the component-level changes and
      the two named behaviour changes; the theme default, with the control's three choices, its storage key and
      the desktop window; the work-type urgency scale in place of the five-hue rule. Rows still owed in the PR:
      Phase 22 carries R-21's DoD and C-1 (81's Contract superseded, Phase 13's number retired);
      `tokens.module.css` audited, not exempt; the ratchet in `npm test` in place of CI; the root layout in the
      raw-HTML allow-list (task 9). STATUS records the bar width task 5 measured.
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
2. **The 60 surface lines.** Task 22's shots. The PM or an independent checker opens every one of the 60 shots
   and judges it against its surface and against direction D (`tile-d.html`): the right screen, on its theme's
   ground, nothing unreadable, nothing left in the other theme's colours, and red only where D puts it (where
   you are, the most urgent work, what is unread, and `#ff0000` never as words). On the shots that show Upcoming
   work (rows 01 and 07) the legend reads exam first and each day's most urgent bar is on top. One tick and one
   note per line in `WALK.md`.
3. **390 px.** Task 21's run: no route scrolls sideways; the planner week and the IST.466 table scroll inside
   their own boxes. The six phone shots are opened and judged. The C-1 line is ticked.
4. **The Menu by keyboard.** Task 21's reachability cases: Tab to Menu, Enter opens it, Tab reaches Home,
   Planner, Inbox, Grades, Materials and Workspace in turn, Escape closes it and focus is back on Menu; the
   search icon is reached by Tab in the bar and opens the field. ☰ still opens the courses drawer. Bell and
   Activity open fully on screen.
5. **The desktop look** (as amended, G-3, which calls this step 6). The PM builds a second desktop instance from
   the phase worktree (`desktop/`, its own `--user-data-dir`, `BB2DASH_APP_URL` pointing at a local `next start`
   of the branch, as Phase 21's walk did) and launches it in whatever mode Windows is in: **the desktop window
   opens on the app's dark ground with no lighter frame first.** The instance has nothing stored, so the page
   that follows is dark too. The PM does not change the laptop's Windows theme, and Stack's running desktop app
   is never touched. A person who picked Light sees one dark frame at each open; that is accepted, written down
   and named in `WALK.md`, not walked. The PM then drags that second window to its minimum width and records in
   `WALK.md` the
   page's inner width and whether the page scrolls sideways there, with the Sync label idle and search
   collapsed. The window's 900 px is its outer size, so this is the one look at the real window that
   `bar at 900 longest label` cannot give. What it shows is recorded; a sideways scroll there is also named in
   the PR body. The toggle line is ticked after steps 1 and 5.
6. **Taste calls** (as amended, G-6). `WALK.md` lists each explicit taste decision with the surface, the theme,
   what to look at, where (the preview URL and the shot's file name) and the PM's default. The list opens with
   the five already put to Stack with tile D, each with the default taken: T-1 dark even under a light system;
   T-2 the urgency scale for work types; T-3 flat reds, not striped ones, for exam and project (the limit is
   named: without colour vision an exam bar and a reading bar are the same grey); T-4 the brand square and the
   focus ring in the ink, not in red; T-5 the type as picked (Source Serif 4, Source Sans 3, Source Code Pro).
   Later ones are added as the walk finds them, from T-6 on.
7. **Stack's part.** The direction is his and is in (task 7). What is left is the taste calls. Then "merge", or
   what to change.

After the merge, not a gate of the PR: `node scripts/walk-box.mjs --url https://web-xi-ten-uy9xk6c6p0.vercel.app
web/e2e/phone-width.spec.ts web/e2e/theme-walk.spec.ts` once, and the two counts go into STATUS.

What proves each requirement in scope:

* **R-53:** the four baseline JSONs sum to 0, unresolved references 0, the allowlist unchanged since task 2
  (tasks 16–20); `theme-contrast.test.ts` and `type-tokens.contrast.test.ts` green in both blocks (task 8); the
  Direction check and the New names check (tasks 8 and 20); the red marks in nine files and no others, and 13
  composed error notices (task 20); 60 walk shots opened and judged (task 22); 62 ticked lines in `WALK.md`
  (task 25).
* **R-46:** `phone-width.spec.ts` → 54 passed, 0 failed in the walk box on the integrated branch (task 21),
  after it failed first on `/course/IST.466/grades` (task 5).
* **S2-styling-1:** four tiles and the walkthrough page committed, and the "Phase 22 direction" DECISIONS row
  naming tile D (tasks 6–7).
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

"Harness run" is the walk box (§Contract). A worker's harness run (tasks 0, 5, 13, 14, 15, 16) starts from that
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
`scrollWidth` ≤ 900, printed). The theme-walk spec's titles are frozen too, **60 cases**:
`NN <slug> [<theme>]` for the 30 inventory rows.

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
* "Tile contrast" is
  `node -e "const fs=require('fs'),K=['event','task','ooo','focus','worklocation','appointment'],C=['reading','assignment','quiz','project','exam'],S='--color-surface',G='--color-bg',P=[];const a=(f,b,o,m)=>P.push([f,b,o,m]);for(const f of ['--color-text','--color-muted','--color-accent'])for(const g of [G,S])a(f,g,0,4.5);a('--color-danger',S,0,4.5);a('--color-danger','--color-danger-bg',S,4.5);for(const x of [300,400,500,600])a('--color-neutral-'+x,S,0,4.5);a('--color-accent-100','--color-accent-800',0,4.5);for(const k of K)a('--planner-'+k+'-fg','--planner-'+k+'-bg',S,4.5);for(const c of C)a('--type-'+c+'-fg','--type-'+c+'-bg',0,4.5);for(const f of ['--color-accent-200','--color-accent-300','--color-accent-2','--color-neutral-200','--color-accent-2-100','--color-neutral-100'])a(f,S,0,4.5);a('--color-accent-400',G,0,4.5);a('--color-accent-400',S,0,4.5);for(const c of C)a('--type-'+c+'-bg',S,0,3);a('--color-accent',G,0,3);const lin=c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4,L=c=>0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);for(const t of 'abcd'){const s=fs.readFileSync('docs/planning/sprint-2/evidence/103_style_tiles/tile-'+t+'.html','utf8');const blk=h=>{const i=s.indexOf(h),m={};if(i<0)return m;for(const x of s.slice(i,s.indexOf('}',i)).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g))m[x[1]]=x[2].trim();return m};const D=blk(':root {'),Lt=Object.assign({},D,blk(':root[data-theme=\x22light\x22] {'));const out=[t];for(const m of [D,Lt]){const r=(v,g)=>{v=v.trim();let x=/^var\((--[a-z0-9-]+)\)$/.exec(v);if(x)return r(m[x[1]],g);x=/^color-mix\(in srgb, (.+) ([0-9.]+)%, (.+)\)$/.exec(v);if(x){const c=r(x[1],g),p=x[2]/100,d=x[3]==='transparent'?g:r(x[3],g);return c.map((u,i)=>u*p+d[i]*(1-p))}x=/^#([0-9a-f]{6})$/i.exec(v);if(!x)throw new Error('cannot read '+v);return [0,2,4].map(i=>parseInt(x[1].slice(i,i+2),16)/255)};let bad=0;for(const [f,b,o,min] of P){const g=r(m[o||S],[0,0,0]),bg=r(m[b],g),fg=r(m[f],bg),x=L(fg),y=L(bg);if((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)<min)bad++}out.push(P.length,bad)}console.log(out.join(' '))}"`.
  Per tile it reads the tile's own `:root` block and its `:root[data-theme="light"]` block, builds the 38
  frozen pairs of §Contract, and prints the tile's letter, then for dark and for light the number of pairs
  measured and the number that fail. `\x22` is the double quote. Run on 2026-10-08: four lines, each
  `<letter> 38 0 38 0`. It holds the frozen list only. Each tile's work-type rule (the five-hue rule for A, B
  and C; the urgency rule for D) was checked by the designer's own script, which is not in the repository; the
  evidence folder's `README.md` records its results.
* "Direction check" is
  `node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('docs/planning/sprint-2/evidence/103_style_tiles/direction-d.json','utf8'));const g=fs.readFileSync('web/src/app/globals.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');const q=s=>String(s).replace(/\s+/g,' ').replace(/\x22/g,'\x27').trim();const blk=h=>{const i=g.indexOf(h),m={};if(i<0)return m;for(const x of g.slice(i,g.indexOf('}',i)).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g))m[x[1]]=q(x[2]);return m};const D=blk(':root {'),L=blk(':root[data-theme=\x27light\x27] {');const miss=(m,B)=>Object.keys(m).filter(k=>B[k]!==q(m[k])).length;console.log(Object.keys(d.dark).length,miss(d.dark,D),Object.keys(d.light).length,miss(d.light,L),g.includes(d.fontsHref))"`.
  It prints the number of names in `direction-d.json`'s `dark` map, how many of them `:root` lacks or holds at
  another value, the same two numbers for the `light` map against `:root[data-theme='light']`, and whether
  `globals.css` holds D's `fontsHref` as written. Values are compared after squeezing white space and reading
  either kind of quote as the same; `\x27` is the single quote. When task 8 is right it prints
  `107 0 73 0 true`. Tried on a scratch fixture on 2026-10-08, with a changed value and a missing name as the
  failing cases.
* "New names" is
  `node -e "const fs=require('fs'),p=require('path');const N='--color-panel --color-on-accent --radius-xs --radius-control --radius-chip --radius-bar --radius-day --shadow-mark --size-underline --size-underline-mark --size-underline-offset --size-notice-bar'.split(' ');const g=fs.readFileSync('web/src/app/globals.css','utf8');const u=fs.readdirSync('web/src',{recursive:true}).filter(f=>/\.(css|tsx?)$/.test(f)).map(f=>fs.readFileSync(p.join('web/src',f),'utf8')).join('\n');console.log(N.length,N.filter(n=>!g.includes(n+':')).length,N.filter(n=>!u.includes('var('+n+')')).length)"`.
  It prints 12, how many of direction D's 12 new names `globals.css` does not declare, and how many no file
  under `web/src` uses as `var(<name>)`. On a58be34 it prints `12 12 12`. After task 8 the second number is 0.
  After the sweeps the third is 0 too. Tried on a scratch fixture on 2026-10-08.
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
  `node -e "const f=require('fs').readdirSync(process.argv[1]);console.log(f.filter(x=>/^(0[1-9]|[12][0-9]|30)-.+-light\.png$/.test(x)).length,f.filter(x=>/^(0[1-9]|[12][0-9]|30)-.+-dark\.png$/.test(x)).length,f.filter(x=>/^4[0-5]-phone-.+\.png$/.test(x)).length)" "C:/Users/stack/.bb2dash-walk/22/<run id>/shots"`.
  It prints the light, dark and phone shot counts of that run.
* "Spec list" is `cd web && npx playwright test -c e2e/playwright.config.ts <spec> --list`; its last line reads
  `Total: <n> tests in 1 file`. It starts no browser and needs no session.
* "Token names" is
  `node -e "const fs=require('fs');const g=fs.readFileSync('web/src/app/globals.css','utf8');for(const w of [68,69,70]){const t=(fs.readFileSync('docs/planning/sprint-2/verification/103_W'+w+'_VERIFICATION.md','utf8').split(/^## Tokens my sweep needs\r?\n/m)[1]||'').split(/^## /m)[0];const n=[...t.matchAll(/^. *\x60(--[a-z0-9-]+)\x60/gm)].map(m=>m[1]);console.log(w,n.length,n.filter(x=>!g.includes(x+':')).length)}"`.
  Per sweep worker it prints the worker's number, how many token names its "Tokens my sweep needs" table holds,
  and how many of them `globals.css` does not declare. It reads the first cell of each table row, where the name
  stands in backticks (`\x60` is the backtick). Tried on a scratch fixture on 2026-10-08.
* "Audit green" is `cd web && npx vitest run test/token-audit.test.ts` → 0 failures.

Inside the table below, `\|` is Markdown's escaped pipe. It stands for a plain `|` inside a quoted pattern (a
regex "or"). No command in this brief sends one command's output into another.

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 0 | The walk box: `scripts/walk-box.mjs`, `docker/walk/entry.sh`, the spec helpers `web/e2e/walk22.lib.ts`, and their tests | R-53, R-46 (the harness of tasks 5, 13–16, 20–22) | W-75 | `node --test scripts/walk-box.test.mjs` → 0 failures; `cd web && npx vitest run test/walk22-lib.test.ts` → 0 failures; a real run, `node scripts/walk-box.mjs web/e2e/harness.spec.ts`, on this branch's build → exit 0; `test -s C:/Users/stack/.bb2dash-walk/22/<run id>/run.json` → exit 0 | none |
| 1 | Token audit ratchet: `token-audit.scan.ts` (pure scanner), `token-audit.test.ts` (scans `web/src`, compares with the four baseline JSONs, cluster map, unresolved pass), baselines written from today's tree | P-15, R-53 | W-67 (this branch's first code commit) | `cd web && npx vitest run test/token-audit.test.ts` → 0 failures; its fixture cases count exactly `#fff` 1, `rgba(0,0,0,.5)` 1, `color-mix(in srgb, var(--a) 10%, transparent)` 1, `white` 1, `padding: 13px` 1, `minmax(14rem, 18rem)` 2, `style={{ padding: 0 }}` 1, `const s = { padding: 0 }` + `style={s}` 1, `style={pick()}` 1, and 0 for `var(--color-text)`, `transparent`, `currentColor`, `/* #fff */`, `style={{ '--x': v }}`, `style={{ ['--x' as string]: v }}`, `const s = { ['--x' as string]: v }` + `style={s}`, a `.ts` JSDoc comment holding `var(--slot) * 24px` (0 counts and 0 unresolved) and `box.style.height = 'auto'` (imperative writes are outside the scope; the test says so); a fixture `var(--nope)` → unresolved 1; live tree unresolved → 0; every scanned file belongs to exactly one cluster; `layout.tsx` counts 1 on `main` (its `'#161826'`). W-67 records the four baseline sums and the count of its first `npm test` in `103_W67_VERIFICATION.md` (audit estimates before A3 and A5: foundation about 35, screens-a about 116, screens-b about 82; the task writes the real numbers) | "`npm test` now fails if anyone adds a hard-coded colour or size." |
| 2 | Freeze the allowlist A1–A5 in `token-audit.allowlist.ts`; `tokens.module.css` audited | P-16, R-53 | W-67 | `cd web && npx vitest run test/token-audit.test.ts` → 0 failures, including "breakpoint set equals {480, 620, 640, 720, 760, 820, 900, 1023.98}", "the one @container entry is 600px in CourseTimeline.module.css", "every A3 entry matches a live declaration; a constant-backed entry equals its imported constant; a source-backed entry's regex matches its named line" (0 stale) and "A5 holds exactly two keys"; every further pinned or mirrored declaration W-67 finds is listed in `103_W67_VERIFICATION.md`; at the PR, `git diff --quiet <task-2 sha> HEAD -- web/test/token-audit.allowlist.ts` → exit 0 (sha in `103_W67_VERIFICATION.md`) | none |
| 3 | Block-aware token reader `css-tokens.ts`; `type-tokens.contrast.test.ts` runs per block | P-17 | W-67 | `cd web && npx vitest run test/type-tokens.contrast.test.ts test/theme-tokens.test.ts` → 0 failures, including: appending `:root[data-theme='light'] { --color-surface: #ffffff; }` to the fixture leaves the dark map's `--color-surface` = `#232532`; the reader composites in floating point and rounds only when it prints a hex: `color-mix(in srgb, #e9e9ed 16%, transparent)` over `#232532` prints `#434450` (0.16 × `#e9e9ed` + 0.84 × `#232532`, today's `--color-divider` on the card); contrast is computed from the unrounded composite: on a fixture holding a verbatim copy of today's `:root` block (`globals.css:20-165`, byte-identical to a5042fa), inline in `theme-tokens.test.ts` and never re-read from the live file (task 8 changes both pairs there), the reader reports `--color-neutral-600` on `--color-surface` = 3.52 and `--color-danger` on `--color-danger-bg` over `--color-surface` = 3.94 (two decimals). At this task `type-tokens.contrast.test.ts` only moves onto the reader: its six assertions stay and hold on today's values. Task 8 replaces four of them with the urgency rule (amendment 2, G-4) | none |
| 4 | Inventory confirmed: no stub screen, route count as frozen | R-53 | PM | `grep -rl "ScreenStub" web/src/app` → prints nothing; Route count → 16 (both hold on a58be34) | none |
| 5 | `phone-width.spec.ts` written first, with its 54 frozen titles, and run RED in the walk box on W-68's own worktree (before tasks 12–15) | R-46, P-79 | W-68 | Spec list for `phone-width.spec.ts` → `Total: 54 tests in 1 file`; harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts` → `exit_code` 1 and `result` `tests failed` in `run.json` (a box failure, 64 to 76, is not a RED run), ≥ 1 failed, `route /course/IST.466/grades [dark]` among the failures with its `scrollWidth` (> 390) printed; every route case prints `route <path> [<theme>]: page scrollWidth=<n>` whether it passes or fails; in the same run `unfolded bar at 721` passes and prints its line (the unfolded bar's width with the idle label; open item 3 records this number); `grep -c "route /course/IST.466/grades" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → ≥ 1 and `grep -c "unfolded bar at 721: nav scrollWidth=" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → ≥ 1 (the pasted output, with the run id); W-68 pastes every failing route title with its `scrollWidth` and its inventory row's Sweep worker under one heading: `grep -c "^## Routes too wide at 390 px$" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → 1 | none |
| 6 | Four style tiles and the walkthrough page, committed as evidence (as amended, G-1; done 2026-10-08). A, B and C were shown to Stack through the one walkthrough page (`style-pick.html`), not as three separate published pages. D, "Charcoal", is the direction and was shown as a page of its own, with `direction-d.json` and `component-changes.json` beside it. Each tile draws the app's own fragments (top bar with Menu, Sync and the five icons; buttons; graded-so-far figure; a gradebook row; the five tracker chips; one planner block per kind; an Inbox row; an error notice; a popout header) with a live theme control and the real token names. **Sample data only:** no real score, course text, name or email, and each tile says on the page that every name and number is a sample. The no-fabricated-numbers rule is about the app's screens | S2-styling-1, R-53 | PM | `git ls-files "docs/planning/sprint-2/evidence/103_style_tiles/tile-*.html"` → exactly four lines; `git ls-files docs/planning/sprint-2/evidence/103_style_tiles/style-pick.html` → exactly one line; Tile check, run at this task's commit (before task 8 adds names) → `a 0 true true true false`, `b 0 true true true false`, `c 0 true true true false`, `d 0 true false true false` (each as it was designed: A, B and C with a system block, D without one, dark by default); Tile contrast → `a 38 0 38 0`, `b 38 0 38 0`, `c 38 0 38 0`, `d 38 0 38 0`; the two page addresses, the walkthrough and tile D, in the task's commit message (62acbd3): URL count → 2 | "I compared three tiles in one walkthrough, saved my pick, and was shown tile D." |
| 7 | The direction is recorded: tile D (as amended, G-1; gate before task 8; done 2026-10-08) | S2-styling-1 | Stack + PM | `grep -cE "Phase 22 direction.*tile D" project-state/DECISIONS.md` → 1 on the phase branch (the row names the tile, holds Stack's pick, his four notes and his sentence word for word, the two page addresses, and the five taste calls with the default taken on each) | "I picked B, said what to change, and the build is on tile D." |
| 8 | Token set for direction D (as amended, G-4, G-5): `:root` (dark) and `:root[data-theme='light']` written from `direction-d.json`'s two maps, value for value; `color-scheme` per block; D's 12 new names; the fonts `@import` changed to D's `fontsHref`; the link style of `a` and `a:hover` (entry `links-thin-underline`); the shared `.errorNotice` class in `tokens.module.css` (entry `error-notice-shared`, here so that the sweeps can compose it); the new names the sweeps need (at today's values, read from the three "Tokens my sweep needs" tables and W-67's own list, the weight tokens among them); the two sub-AA pairs fixed; the urgency rule in `type-tokens.contrast.test.ts`, with its header comment and the comment over the `--type-*` tokens rewritten | R-53, P-78 | W-67 | `cd web && npx vitest run test/theme-tokens.test.ts test/theme-contrast.test.ts test/type-tokens.contrast.test.ts test/Workspace.layout.test.tsx` → 0 failures: the light block lacks 0 of `:root`'s `--color-*` / `--shadow-*` names; `color-scheme` is `dark` / `light`; the 18 layout tokens (seven `--space-*`: 1, 2, 3, 4, 6, 8, 12; `--nav-height`, `--content-max`, `--sidebar-width`, `--sidebar-side`; seven `--text-*`: `-xs`, `-sm`, `-base`, `-md`, `-lg`, `-xl`, `-2xl`) equal `main`'s values; every one of the 38 frozen pairs ≥ 4.5 (text) or ≥ 3 (non-text) in both blocks; `type-tokens.contrast.test.ts` keeps its first two assertions and holds every clause of §Contract's urgency rule in both blocks, against the card and against the picked-day fill. Then, each by itself: `grep -c "MIN_DELTA_E = 30" web/test/type-tokens.contrast.test.ts` → 0 (the old pair rule is gone); Direction check → `107 0 73 0 true`; New names → `12 0 <n>` (all 12 declared; `<n>` reaches 0 at task 20); `grep -c "^\.errorNotice" web/src/styles/tokens.module.css` → 1 or more; `grep -c "family=Inter" web/src/app/globals.css` → 0; `grep -c "text-decoration-thickness: var(--size-underline)" web/src/app/globals.css` → 1 (the `a` rule of entry `links-thin-underline`; 0 on a58be34); Red files over `web/src/app/globals.css` → prints nothing (`--planner-focus-edge` holds D's value, so the one line of a58be34 is gone); Audit green (`.errorNotice` is written with tokens only, so `foundation.json` does not rise); Token names → three lines, `68 <n> 0`, `69 <n> 0` and `70 <n> 0`, each `<n>` above 0 (every name of the three tables is declared; the three verification files reach W-67's worktree with the merge it makes when it is resumed for this task) | "Home on the preview wears direction D." |
| 9 | `theme-preference.ts`, `THEME_BOOT_SCRIPT` with its system-change listener in the root layout, `THEME_COLOR` (the dark ground) for `viewport.themeColor`; the root layout joins the raw-HTML allow-list (as amended, G-3: nothing stored means Dark) | P-76, P-78, R-53 | W-67 | `cd web && npx vitest run test/theme-preference.test.ts test/raw-html.audit.test.ts` → 0 failures: `resolveTheme` table, nine rows (nothing stored + system light → dark; nothing stored + system dark → dark; stored `light` + system dark → light; stored `auto` + system light → light; stored `auto` + system dark → dark; stored `auto` + no `matchMedia` → dark; stored `dark` + system light → dark; junk + system light → dark; storage throws + system light → dark); the script, run in jsdom for each of the nine with a stubbed `matchMedia`, stamps the expected `data-theme` and writes no storage; with no `matchMedia` it stamps `dark` and does not throw; with `auto` stored a `change` event on the query re-stamps `data-theme` and sets the `theme-color` meta to the new ground, and with nothing stored or `light` stored the same event changes neither; at boot a resolved `light` sets the `theme-color` meta to `THEME_BG.light`; `THEME_BG.dark` / `.light` equal the blocks' `--color-bg`; `THEME_COLOR` equals `THEME_BG.dark`; `grep -c "#161826" web/src/app/layout.tsx` → 0; `grep -c "__html: THEME_BOOT_SCRIPT" web/src/app/layout.tsx` → 1; `git grep -c "dangerouslySetInnerHTML=" -- web/src` → exactly two lines, `web/src/app/(app)/layout.tsx:1` and `web/src/app/layout.tsx:1` | none |
| 10 | `ThemeMenu` (Dark / Light / Auto, in that order) and its mount in the account menu (as amended, G-3) | P-77, R-53 | W-67 (component), W-68 (mount) | `cd web && npx vitest run test/ThemeMenu.test.tsx test/TopNav.update.test.tsx` → 0 failures: exactly three `menuitemradio` rows, named Dark, Light and Auto in that order in the DOM, and no new `menuitem`; Dark checked with no key, under a stubbed light system too; Light → `data-theme="light"`, key `light`, every `theme-color` meta = `THEME_BG.light`; Auto → key `auto`, attribute and every meta follow a stubbed `matchMedia`; Dark → key removed, `data-theme="dark"`, every meta = `THEME_BG.dark`; a stored `dark` or a junk value shows Dark checked; a throwing storage still stamps; `grep -c "<ThemeMenu" web/src/components/shell/TopNav.tsx` → 1 | "Account menu starts on Dark. Light, reload, still light. Auto follows Windows." |
| 11 | Desktop window background from the tokens: always the app's dark ground (as amended, G-3) | R-53 | W-67 | `cd desktop && npx vitest run test/unit/window-background.test.ts test/unit/window.test.ts test/unit/deeplink.test.ts` → 0 failures (`DARK` equals `:root`'s `--color-bg` read from `../web/src/app/globals.css`; `windowBackground()` = `DARK`); `grep -c "12131a" desktop/src/main/window.ts` → 0; `git grep -c "nativeTheme" -- desktop/src` → prints nothing (it prints nothing on `main` too); `git diff --quiet origin/main...HEAD -- desktop/test/unit/window.test.ts desktop/src/main/update-prompt.ts` → exit 0; `103_W67_VERIFICATION.md` says whether the change can break the launch (if yes, `cd desktop && npm run test:e2e` → exit 0 joins task 20) | "The desktop window opens on the app's dark ground." |
| 12 | Nav fold at the 720 px step; the Sync label's own span, icon only at ≤480 px, capped at ≤1023.98 px | R-46, P-79 | W-68 | `cd web && npx vitest run test/TopNav.fold.test.tsx test/TopNav.search.test.tsx test/TopNav.workspace.test.tsx test/TopNav.update.test.tsx test/SyncButton.test.tsx test/CourseSidebar.test.tsx test/NavSearch.css.test.ts` → 0 failures, the six old files unedited. The new file's cases: Menu `aria-expanded` false → true, `aria-controls="primary-nav-menu"`; the panel holds one link per `NAV_LINKS` entry (6), in order, with `aria-current` on the active one, and nothing else; no panel and no second "Materials" link in the DOM while Menu is closed; Escape closes and focus returns to Menu; a pathname change closes it; Menu and the account menu close each other; ☰ closes Menu and keeps `aria-controls="course-sidebar"`. CSS cases: `TopNav.module.css`'s `(max-width: 720px)` block hides `.links` and shows Menu, Menu is `display: none` outside it, and the block holds no `overflow-x`, `min-width` or `scrollbar-width` for `.links`; the `(max-width: 480px)` block gives `.brandName` `clip-path: inset(50%)` and no other block does; no `.brandWord` exists; `SyncButton.module.css`'s `(max-width: 480px)` block gives the label span `clip-path: inset(50%)` and its `(max-width: 1023.98px)` block gives it a `max-width` and `text-overflow: ellipsis`; the label span's `title` equals its text; the brand link's accessible name is "bb2dash" (`getByRole('link', { name: 'bb2dash' })` finds exactly 1). Audit green: `shell.json` follows this commit, up by each size literal the fold and the label cap add, each named in the commit message (§Contract, "The baseline before the tokens exist") | "At phone width the bar shows Menu; it lists the six pages." |
| 13 | The seven open states of §Contract inside the viewport at ≤720 px: Bell and Activity capped at `min(360px, calc(100vw - 28px))` and anchored `right: 0`; `.stack` re-anchored; the three `display: contents` wrappers to a class, so search open at 390 px fits | R-46 | W-68 | harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "open state\|reachability\|bar at\|sidebar toggle\|popout assignment"` → exit 0, 22 passed, 0 failed (14 open-state cases, each asserting its panel's rect `left ≥ 0` and `right ≤ innerWidth` at 390 px, case 7 also the nav's `scrollWidth` ≤ 390 with search open; 2 reachability; `unfolded bar at 721`, `bar at 390 longest label`, `bar at 900 longest label`; `sidebar toggle`; 2 `popout assignment`). Case 3 measures `.ddUser` before W-68's task-10 mount; task 21 re-runs it with the theme control inside. `grep -c "display: 'contents'" web/src/components/shell/TopNav.tsx web/src/components/shell/ActivityMenu.tsx web/src/components/shell/Bell.tsx` → three lines ending `:0`. Audit green: `shell.json` follows in the same commit, down by those three sites and up by each size literal the panel cap and the `.stack` re-anchor add, each named in the commit message. `grep -c "^## Tokens my sweep needs$" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → 1 | "Bell and Activity open fully on a phone." |
| 14 | Gradebook scrolls inside its own box; every route of rows 05–12 fits at 390 px | R-46 | W-70 | `cd web && npx vitest run test/GradesTables.layout.test.tsx test/gradebook-phone-width.css.test.ts` → 0 failures (the layout test unedited; the new one asserts the wrapper rule has `overflow-x: auto` and no `th` / `td` rule gains `overflow` or `display`); harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route /course/\|route /grades \|route /materials \|route /workspace "` → exit 0, 16 passed, 0 failed (the eight routes of rows 05–12 in both themes: page `scrollWidth` ≤ 390; on `/course/IST.466/grades` the scroll box's `scrollWidth` > `clientWidth`, read from the frozen hook); `grep -c 'data-scroll-box="gradebook"' web/src/components/grades/GradebookTable.tsx` → 1; Audit green, with `screens-b.json` following any literal a phone-width rule adds; `grep -c "^## Tokens my sweep needs$" docs/planning/sprint-2/verification/103_W70_VERIFICATION.md` → 1 | "IST.466 Grades at phone width: the table slides inside its box." |
| 15 | Planner board scrolls inside itself; every route of rows 01–04 fits at 390 px | R-46 | W-69 | `cd web && npx vitest run test/planner-css.test.ts test/planner-phone-width.css.test.ts` → 0 failures (no `min-width` on `.board` in any block; the 760 px floor on its tracks or an inner element; no vertical scroller); harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route / \|route /planner \|route /inbox \|route /announcements "` → exit 0, 8 passed, 0 failed (the four routes of rows 01–04 in both themes: page `scrollWidth` ≤ 390; on `/planner` the board's `scrollWidth` > `clientWidth`, read from `[data-planner-board="true"]`); Audit green, with `screens-a.json` following any literal a phone-width rule adds; `grep -c "^## Tokens my sweep needs$" docs/planning/sprint-2/verification/103_W69_VERIFICATION.md` → 1 | "The week slides at phone width; the page does not." |
| 16 | Sweep the foundation cluster (tokens module, login, privacy, terms, not-found, ThemeMenu) and apply the entries of `component-changes.json` that name W-67's files (§Component changes by owner: the card edge, the tags, the buttons, the input well and the glyph in `tokens.module.css`; `.mark` and `.error` in `Login.module.css`); write `theme-walk.spec.ts` with its 60 frozen titles, each case reaching its theme as acceptance step 1 says; every route of rows 13–16 fits at 390 px | R-53, R-46 | W-67 | Baseline sum with `F=/^foundation\.json$/` → 0; Weight check over `web/src/styles web/src/app/login` → prints nothing; Notice files over `web/src/app/login` → exactly one line; `grep -c "var(--radius-control)" web/src/styles/tokens.module.css` → 1 or more; `grep -c "var(--radius-chip)" web/src/styles/tokens.module.css` → 2 or more (`.tag` and `.glyph`); `grep -c "var(--shadow-mark)" web/src/app/login/Login.module.css` → 1; `cd web && npm test` → 0 failures; Spec list for `theme-walk.spec.ts` → `Total: 60 tests in 1 file`; harness run `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route /login \|route /privacy \|route /terms \|route /no-such-page "` → exit 0, 8 passed, 0 failed (the four public routes in both themes, page `scrollWidth` ≤ 390). W-67 stops here and reports the theme-walk run as owed, because that run needs W-68's mount and W-68 is resumed for the mount only after W-67's task 10. **Owed, on resume:** once the mount commit is merged the PM messages the stopped W-67, which merges `origin/feat/styling-22` and makes the harness run `node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts` → exit 0, 60 passed, 0 failed, before task 22 | none |
| 17 | Sweep the shell cluster (scrim to a token, the last `style=` site `TopNav.tsx:154` to a class, search, popouts, `QueryState`). `ScreenStub.tsx` and `Shell.module.css`'s `.stub`, `.stubTitle` and `.stubMeta` have no importer and may be deleted; `.stubBody` is live (the Planner and Workspace loading lines) and is swept. Apply the entries of `component-changes.json` that name W-68's files (§Component changes by owner: the brand mark, the nav links, the unread badge and the two unread dots, the Sync pill, the course side panel on the panel grey, `Popout.module.css`'s `.problem`) | R-53 | W-68 | Baseline sum with `F=/^shell\.json$/` → 0; Weight check over `web/src/components/shell web/src/components/popout` → prints nothing; Red files over `web/src/components/shell` → exactly three lines (`Bell.module.css`, `CourseSidebar.module.css`, `TopNav.module.css`); Notice files over `web/src/components/popout` → exactly one line; `grep -c "var(--color-panel)" web/src/components/shell/CourseSidebar.module.css` → 1 or more; `grep -c "var(--radius-control)" web/src/components/shell/SyncButton.module.css` → 1 or more; `grep -c "var(--shadow-mark)" web/src/components/shell/TopNav.module.css` → 1; `cd web && npm test` → 0 failures (`NavSearch.css.test.ts` unedited) | none |
| 18 | Sweep screens A (Home, planner, tracker, Inbox, Announcements; the 8 `PlannerBoard.tsx` `style=` sites keep only `--` keys; `PlannerWeek.tsx`'s `height` key stays, A5). Apply the entries of `component-changes.json` that name W-69's files (§Component changes by owner: the Upcoming work block in tile C's shapes, the Inbox chips and source link, the red marks of the Inbox tab, the planner's today and now line and the announcements' unread dot, five boxed error rules and the popover's bare line). The Upcoming work order (named exception 3): `LEGEND` reads exam, project, quiz, assignment, reading, and `DayColumn` draws a day's bars most urgent on top, with the new test `UpcomingTracker.urgency.test.tsx` | R-53 | W-69 | Baseline sum with `F=/^screens-a\.json$/` → 0; Weight check over `"web/src/app/(app)/NeedsAttention.module.css" web/src/components/tracker` → prints nothing; `cd web && npx vitest run test/UpcomingTracker.urgency.test.tsx test/UpcomingTracker.test.tsx test/UpcomingTracker.scroll.test.tsx test/upcoming-tracker-css.test.ts` → 0 failures, the three old files unedited. The new file's cases: the legend's five entries read exam, project, quiz, assignment, reading in DOM order; a day whose items arrive as reading, quiz, exam draws the exam's bar on top and the reading's at the bottom (`.barArea` is `flex-direction: column-reverse` on `main` and stays so, so the top bar is the last child); two items of one type keep the order they arrived in. Red files over `"web/src/app/(app)/inbox" web/src/components/announcements web/src/components/planner web/src/components/tracker` → exactly four lines; Notice files over `"web/src/app/(app)/inbox" "web/src/app/(app)/Today.module.css" web/src/components/inbox web/src/components/planner` → exactly five lines; `grep -c "var(--radius-day)" web/src/components/tracker/UpcomingTracker.module.css` → 1; `grep -c "var(--radius-bar)" web/src/components/tracker/UpcomingTracker.module.css` → 1; `cd web && npm test` → 0 failures (`planner-css.test.ts`, `upcoming-tracker-css.test.ts` and `PlannerWeek.hydration.test.tsx` unedited) | "Upcoming work reads most urgent first: exams and projects in red on top." |
| 19 | Sweep screens B (course tabs, the Stream timeline in `components/course/`, the assignment page's frame, Grades, Materials, Workspace; dead `GradeModel.module.css` classes may be deleted instead; `CourseClasswork.tsx`'s `marginLeft` key stays, A5; no new module in `components/workspace/`). Apply the entries of `component-changes.json` that name W-70's files (§Component changes by owner: the two grade links on the global link style, the red marks of the course tab and the Stream's current week, six boxed error rules) | R-53 | W-70 | Baseline sum with `F=/^screens-b\.json$/` → 0; Weight check over `"web/src/app/(app)/materials" web/src/components/course web/src/components/grades` → prints nothing; Red files over `"web/src/app/(app)/course" web/src/components/course` → exactly two lines (`CourseSubBar.module.css`, `CourseTimeline.module.css`); Notice files over `"web/src/app/(app)/materials" "web/src/app/(app)/workspace" "web/src/app/(app)/course" web/src/components/workspace web/src/components/grades` → exactly six lines; `grep -c "var(--color-on-accent)" web/src/components/course/CourseTimeline.module.css` → 1 or more; `cd web && npm test` → 0 failures (`course-timeline-css.test.ts`, `Workspace.layout.test.tsx` and `CourseClasswork.test.tsx` unedited) | none |
| 20 | Integrate: full suites, all baselines zero, old tests edited only where §Files allows, no new dependency, no committed screenshot | R-53 | PM | in `web/`: `npm run typecheck`, `npm run build`, `npm test`, `npx eslint . --max-warnings 0`, `npm run test:coverage` → each exit 0, 0 failures, `npm test`'s count ≥ 2913; in `desktop/`: `npm run typecheck`, `npm test` → each exit 0; Baseline sum with `F=/\.json$/` → 0; Weight check over `"web/src/*.css" ":(exclude)web/src/app/globals.css"` → prints nothing; harness run `node scripts/walk-box.mjs web/e2e/workspace-layout.spec.ts web/e2e/workspace-acceptance-helpers.spec.ts` → exit 0; Direction check → `107 0 73 0 true`; New names → `12 0 0` (each of the 12 declared and used); Red files over `web/src` → exactly nine lines (`CourseSubBar.module.css`, `Inbox.module.css`, `AnnouncementsList.module.css`, `CourseTimeline.module.css`, `PlannerWeek.module.css`, `Bell.module.css`, `CourseSidebar.module.css`, `TopNav.module.css`, `UpcomingTracker.module.css`); Notice files over `web/src` → exactly 13 lines; `git diff --diff-filter=M --name-only origin/main...HEAD -- "web/test/*.test.ts" "web/test/*.test.tsx"` → exactly two lines, `web/test/raw-html.audit.test.ts` and `web/test/type-tokens.contrast.test.ts`; `git diff --diff-filter=MD --name-only origin/main...HEAD -- desktop/test` → prints nothing (no pre-existing desktop test modified or deleted: amendment 2, G-3); `git diff --diff-filter=MD --name-only origin/main...HEAD -- web/e2e` → prints nothing; `git diff --quiet origin/main...HEAD -- web/package.json web/package-lock.json desktop/package.json desktop/package-lock.json web/vitest.config.mts desktop/vitest.config.mts` → exit 0; `git diff --quiet origin/main...HEAD -- mcp-server` → exit 0; `git diff --name-only --diff-filter=A origin/main...HEAD -- "*.png"` → prints nothing | none |
| 21 | 390 px walk green in the walk box on the integrated branch, no writes | R-46, P-79 | PM (runs W-68's spec) | Fingerprint → `requests_open` 0; harness run with `WALK_SHOTS=1`, `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts` → exit 0 and `grep -c "54 passed" C:/Users/stack/.bb2dash-walk/22/<run id>/stdout.log` → 1 (16 routes × 2 themes, 1 popout × 2, 7 open states × 2, reachability × 2, `sidebar toggle`, `unfolded bar at 721`, `bar at 390 longest label`, `bar at 900 longest label`); Fingerprint again → the same `fingerprint`; Shot count → `0 0 6`: `40-phone-home.png` (brand mark, Menu, Sync as an icon and the five icons in one row, no horizontal scrollbar), `41-phone-nav-menu.png` (Home, Planner, Inbox, Grades, Materials, Workspace listed and nothing else), `42-phone-course-grades.png` (table cut at its box edge with its own scrollbar), `43-phone-planner.png` (week cut at the board edge), `44-phone-bell.png` and `45-phone-activity.png` (both panel edges inside the screen); the PM opens all six | "At 390 px nothing scrolls sideways." |
| 22 | Theme walk: 60 shots, each opened and judged | R-53, P-76 | PM (runs W-67's spec) | Fingerprint → `requests_open` 0; harness run with `WALK_SHOTS=1`, `node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts` → exit 0 and `grep -c "60 passed" C:/Users/stack/.bb2dash-walk/22/<run id>/stdout.log` → 1 (each case: `html[data-theme]` = its theme, computed `body` background = `THEME_BG[theme]`, 0 console messages matching `/hydrat\|#418/`; a `[dark]` case stores nothing under an emulated light system and a `[light]` case stores `light` once under an emulated dark system; the two `25 account-menu` cases and the two `13 login` cases also walk acceptance step 1); Fingerprint again → the same `fingerprint`; Shot count → `30 30 0`, each shot named `NN-<slug>-<theme>.png` from the inventory table and showing that surface open on its theme's ground; the PM or an independent checker opens every shot and writes its line in `WALK.md` | none |
| 23 | Gates: `/code-review main high` twice (the first on the scratch branch `review/styling-22-sweeps`, a local merge of the four worker branches, DoD), `/security-review` | R-53 | PM | `grep -c "^## /code-review main high (sweeps pushed)$" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 1; at the PR the scratch branch is gone and was never pushed: `git branch --list "review/styling-22-sweeps"` → prints nothing and `git ls-remote --heads origin "review/styling-22-sweeps"` → prints nothing; `grep -c "^## /code-review main high (integrated)$" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 1; `grep -c "^## /security-review$" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 1; `grep -c "\| open \|" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 0 (every CRITICAL / HIGH row reads fixed or declined-by-Stack) | none |
| 24 | STATUS, DECISIONS (rows owed, see DoD), ORCHESTRATOR (its Session F prompt rewritten to this brief); PR with the preview | R-53, R-46, S2-styling-1 | PM | `git diff --name-only origin/main...HEAD -- project-state` → exactly three lines; `gh pr view feat/styling-22 --json state -q .state` → `OPEN`; `curl -s -o /dev/null -w "%{http_code}" https://<phase preview host>/login` → 200, read through the Vercel connector's `web_fetch_vercel_url` if protection answers 401 (the `vercel` CLI is not installed); `git ls-files "docs/planning/sprint-2/walks/walk-22/*.png"` → prints nothing | none |
| 25 | The PM's acceptance walk (the script above); Stack's taste calls | R-53, R-46, S2-styling-1 | PM; then Stack (taste calls, the merge word) | `grep -c "^- \[x\]" docs/planning/sprint-2/walks/walk-22/WALK.md` → 62 (60 surface lines, the C-1 line, the toggle line); `grep -c "^- \[ \]" docs/planning/sprint-2/walks/walk-22/WALK.md` → 0; `grep -c "^## Taste calls for Stack$" docs/planning/sprint-2/walks/walk-22/WALK.md` → 1; `grep -c "^. T-[1-5] . " docs/planning/sprint-2/walks/walk-22/WALK.md` → 5 (the five taste calls already put to Stack open the table as rows T-1 to T-5; the dots stand for the table's bars); `grep -c "^Desktop window: dark ground at open, no lighter frame first; Windows in " docs/planning/sprint-2/walks/walk-22/WALK.md` → 1; `grep -c "^Desktop window at its minimum width: " docs/planning/sprint-2/walks/walk-22/WALK.md` → 1 | "The PM walked every screen in light and dark; I ruled on the taste calls and said merge." |

`WALK.md` is the PM's and holds, in this order: the two run ids and the two fingerprints; 60 surface lines, one
per inventory row and theme, each `- [x] NN <slug> · <theme> · <note>`; the C-1 line and the toggle line; a
"Phone shots" table for 40–45 (a table, not tick lines); the line
`Desktop window: dark ground at open, no lighter frame first; Windows in <light or dark> mode` (acceptance step
5 as amended; a line under it says that a person who picked Light sees one dark frame at each open); the line
`Desktop window at its minimum width: page <n> px wide, sideways scroll <yes or no>` (acceptance step 5); a
section "Swept, not shot"; a section "Known, not this phase" (the app shell 1 px taller than its window, which
a light scrollbar shows more; the Activity panel's `.ddNote` lines, which have no rule on `main`; the dark update prompt;
a calendar push-failure line on Home if the token has expired); and "## Taste calls for Stack", a table of
number, surface, theme, what to look at, where, the PM's default, and Stack's ruling. The table opens with the
five calls already put to Stack with tile D, numbered T-1 to T-5 in the first cell, each with the default
taken (acceptance step 6 as amended, G-6): dark even under a light system; the urgency scale; flat, not
striped, reds, with the colour-blind limit named; the brand square and the focus ring in the ink, not red; the
type as picked. Later calls follow as T-6 and up. Its notes carry no score, course text, name or email: the
repository is public.

## Workers

| Worker | Stream | Branch · worktree | Owns (Contract §Files has the full list) | Tasks |
|---|---|---|---|---|
| W-67 | Foundation: audit, tokens, theme, desktop, public pages | `feat/styling-22-foundation` · `bb2dash-wt-22-foundation` | `globals.css`, root `layout.tsx`, `tokens.module.css`, `login/`, `privacy/`, `terms/`, `not-found.tsx`, `theme-preference.ts`, `ThemeMenu.*`, the audit, token and theme tests, the allow-list part of `raw-html.audit.test.ts`, `e2e/theme-walk.spec.ts`, `desktop/src/main/window.ts`, `window-background.ts` and its new test (no old desktop test) | 1, 2, 3, 8, 9, 10 (component), 11, 16 |
| W-68 | Shell and phone width | `feat/styling-22-shell` · `bb2dash-wt-22-shell` | `web/src/components/shell/` except `ThemeMenu.*`, `(app)/Shell.module.css`, `(app)/layout.tsx`, `components/popout/`, `QueryState.tsx`, `TopNav.fold.test.tsx`, `e2e/phone-width.spec.ts` | 5, 10 (mount), 12, 13, 17 |
| W-69 | Screens A | `feat/styling-22-screens-a` · `bb2dash-wt-22-screens-a` | Home files, `planner/`, `inbox/`, `announcements/` (routes and components), `tracker/`, `planner-phone-width.css.test.ts` | 15, 18 |
| W-70 | Screens B | `feat/styling-22-screens-b` · `bb2dash-wt-22-screens-b` | `course/`, `grades/`, `materials/`, `workspace/` (routes and components), `components/course/`, `gradebook-phone-width.css.test.ts` | 14, 19 |
| W-75 | The walk box | `feat/styling-22-walkbox` · `bb2dash-wt-22-walkbox` | `scripts/walk-box.mjs`, `scripts/walk-box.test.mjs`, `docker/walk/entry.sh`, `web/e2e/walk22.lib.ts`, `web/test/walk22-lib.test.ts` | 0 |

Order: tasks 1–2 first, the first code commits merged into `feat/styling-22`; task 0 beside them, merged before
any other worker's first harness run; then W-67's task 3 and W-68's task 5; tasks 6–7 are done (amendment 2:
the tiles are committed and the direction row is written), so nothing waits for a pick; W-68, W-69 and W-70 do
the direction-free C-1 work (12–15; task 13's case 3 runs without the theme control, which W-68 mounts at task
10, §Contract); task 8 still follows the three "Tokens my sweep needs" tables and gates every sweep (16–19).
The order of tasks did not move with amendment 2.

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
| W-67 resumed (8, 9, 10 component, 11, 16) | the direction's DECISIONS row and the evidence folder (amendment 2's commit); the last C-1 commit of W-68, W-69 and W-70 (their C-1 fixes and their tables) | `git grep -cE "Phase 22 direction.*tile D" origin/feat/styling-22 -- project-state/DECISIONS.md` → one line ending `:1`; `git cat-file -e origin/feat/styling-22:docs/planning/sprint-2/evidence/103_style_tiles/direction-d.json` → exit 0; `git grep -c "^## Tokens my sweep needs$" origin/feat/styling-22 -- docs/planning/sprint-2/verification` → three lines, each ending `:1` |
| W-69 resumed (18), W-70 resumed (19) | W-67's task-8 commit | `git grep -c "data-theme='light'" origin/feat/styling-22 -- web/src/app/globals.css` → one line (the light block exists); `git grep -c "^\.errorNotice" origin/feat/styling-22 -- web/src/styles/tokens.module.css` → one line (the shared class exists) |
| W-68 resumed (10 mount, then 17) | W-67's task-8 commit and its task-10 component commit | the two lines above; `git cat-file -e origin/feat/styling-22:web/src/components/shell/ThemeMenu.tsx` → exit 0 |
| W-67 resumed again (task 16's owed run) | W-68's mount commit | `git grep -c "<ThemeMenu" origin/feat/styling-22 -- web/src/components/shell/TopNav.tsx` → one line ending `:1` |

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
  D's 12 new names and its values do not come through the tables: W-67 writes them from `direction-d.json`
  (§Token set rules), and a table does not ask for one of the 12 under another name. In its sweep a worker uses
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
  tree holds all four sweeps at that point. The PM then runs tasks 20–25.

## Out of scope

* New screens or routes; any behaviour or copy change beyond the Menu fold, the phone-width rules of §Contract,
  the theme control with its Dark default, the Upcoming work order, and the word "Error" the shared error
  notice draws through CSS (81:79-80; the last three by amendment 2).
* Any layout, spacing or type-size change. The component-level changes of `component-changes.json` are in
  scope (amendment 2, G-2); they change which radius, colour or weight token a rule uses, and nothing a layout
  test pins. The 18 layout tokens keep `main`'s values.
* Directions A, B and C as built. A red focus ring, a red brand square and striped exam and project bars:
  they are taste calls T-3 and T-4, and the default taken is the ink and flat bars, unless Stack rules
  otherwise.
* A change to the frozen list of 38 contrast pairs. Direction D's own drawn pairs (`direction-d.json`,
  `drawnPairs`) were checked on the tile and are not added to `theme-contrast.test.ts`.
* The favicon, `apple-icon.png` (R-50, P-80) and R-36's rank-weight rule line: shipped in Phases 17 and 16 under
  B-23; per-exam weights (R-36 option M) stay parked.
* `usePopover`'s reshape and the React-compiler lint work (R-51): Phase 17.
* The Workspace page's behaviour, storage and transport (S2-workspace-1): Phase 21; only its tokens are swept here.
* Planner geometry (row heights, `slotToPx`, lanes), the Stream timeline's pinned widths, the courses-sidebar
  mechanics (`data-sidebar`, `--sidebar-side`, the 1024 px drawer), the grade figures and every status label.
* Electron beyond the main window's background: tray, toasts and R-108's proofs (Phase 17), packaging (D-6). A
  desktop window that opens light for a person who picked Light: it opens dark, always (amendment 2, G-3).
* The desktop update prompt (`desktop/src/main/update-prompt.ts`): it keeps its own dark page (DECISIONS
  2026-10-08). It is named in `WALK.md`.
* An acceptance pack (`acceptance/22/`, `web/e2e/accept22.spec.ts`) and a `just accept 22` run (DECISIONS
  2026-10-08).
* Per-worker Vercel previews, share tokens and hand sign-ins. Committed screenshots.
* Sideways scroll in browser windows between 721 px and the bar's idle width: measured and recorded, not fixed.
* The unfolded bar with the search field open, in a window narrower than that bar (about 923 px to about
  1,091 px by estimate): named, not measured by any case, not fixed. The 900 px sentence holds with search
  collapsed only.
* The folded bar between 481 and 720 px with search open or a long Sync label (too wide up to about 673 px and
  about 560 px by the audit's estimate, before the label cap): named, not measured by any case, not fixed. The
  rule that hides three icons while search is open stays in the `(max-width: 480px)` block.
* Known on `main` and left as they are: the app shell 1 px taller than its window (STATUS, Known issues); the
  Activity panel's `.ddNote` lines, which have no rule; `web/README.md`, which has no notes on the walk harness;
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
   the component-level changes of `component-changes.json`. Layout, spacing and type sizes stay out.
2. **The brand word at phone width.** Closed, default. It stays as `main` has it: `span.brandName`, clipped at
   ≤480 px. No `.brandWord`. At ≤480 px the Sync button shows its icon only; the label stays in the DOM, clipped
   the way `.sr-only` is, and is the label span's `title`.
3. **Widths just above the fold.** Closed, default. The links fold into Menu at 720 px. The unfolded bar, with
   search collapsed, may never be wider than the desktop window's 900 px minimum, so at ≤1023.98 px the Sync
   label is capped. The case that holds it measures a 900 px page; the window's 900 px is its outer size, so the
   PM also looks at the real window at its minimum width (acceptance step 5). Browser windows between 721 px and
   the bar's idle width (851 px on 2026-10-05) may still scroll sideways; task 5 measures and records the width;
   it is recorded, not fixed. The bar with search open, and the folded bar between 481 and 720 px, are named in
   §Out of scope and not fixed.
4. **The desktop window before the page paints.** Closed, default. The main window's background follows Windows
   (`nativeTheme`), read at each window creation. If Stack picks the theme opposite to Windows, the window shows
   the other ground for one frame at each open. The update prompt keeps its own dark page: out of scope, named in
   `WALK.md`. **Amended the same day (amendment 2, G-3):** the window does not follow Windows. It always opens
   on the app's dark ground, and `nativeTheme` is not read. A person who picked Light sees one dark frame at
   each open.
5. **Pages without JavaScript.** Closed, default. They show the dark theme (the `:root` block). Since
   amendment 2 that is also what a first visit shows with JavaScript, under any system.
6. **The Menu, after the search icon** (new; amends B-24). Closed, default. At ≤720 px the bar hides the links
   and shows Menu; the panel lists the six pages and nothing else. Search stays the icon in the bar at every
   width. The right group is Sync plus five icon buttons. The ≤720 px strip rules on `.links` go with the fold.
7. **The planner's new-event wizard** (new). Closed, default. It is inventory row 30: 30 surfaces, 60 theme-walk
   cases, 60 surface lines.
8. **Walk screenshots in a public repository** (new). Closed, the safe option. No PNG is committed. Shots are
   written outside every repository, in the walk box's output folder. `WALK.md` is committed.
9. **How the phase is accepted** (new). Closed by his sentence. The PM walks the PR in a throwaway test
   container and ticks each surface line. Stack picks the tile and rules on the listed taste calls. This amends,
   for this phase, the 2026-09-14 words "Stack approves each". The merge still waits for his word. The pick is
   in since amendment 2: he picked B in the walkthrough and the build is on tile D, which was made from it.

## Session prompt

See `project-state/ORCHESTRATOR.md` §6, Session F (Phase 22); the PM rewrites that prompt to this brief at task 24.

Until task 24 rewrites it, that prompt predates the freeze. It still says PROVISIONAL, open items 1–5, four
workers, tasks 1–2 riding Phase 17's PR, a run on each preview, 58 surface lines and Stack walking the acceptance
script. The Phase 17 prompt in the same section (B1) still offers that ride. Where the prompt differs from this
brief, this brief wins, and no session or worker is started from that prompt.
