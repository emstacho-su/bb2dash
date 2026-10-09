# W-68 verification: shell and phone width (Phase 22, tasks 5, 12, 13)

Worker W-68, branch `feat/styling-22-shell`, worktree `bb2dash-wt-22-shell`, started from `origin/feat/styling-22`.
Start check: `git cat-file -e origin/feat/styling-22:web/test/token-audit.allowlist.ts` exit 0 and
`git cat-file -e origin/feat/styling-22:web/e2e/walk22.lib.ts` exit 0.
Merge of `origin/feat/styling-22`: already up to date.

## Task 5: the spec, written first, RED

Spec list, from `web/`: `npx playwright test -c e2e/playwright.config.ts e2e/phone-width.spec.ts --list` ends
`Total: 54 tests in 1 file`, exit 0. `grep -c "reducedMotion: 'reduce'" web/e2e/phone-width.spec.ts` prints 1.
`npx vitest run test/walk22-lib.test.ts` (the rule that a new spec takes `test` from `./walk22.lib`): 48 passed.

The harness run, `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts`, on commit 8979e1c (the spec, before any fix).
Run id **20261008T233444Z**, `run.json`: `"exit_code": 1`, `"result": "tests failed"`, 648 s. Count line:
`24 failed`, `30 passed (9.7m)`. Every route case printed its `page scrollWidth`. Pasted output (the printed lines and the
failed list of `stdout.log`):

```
route / [dark]: page scrollWidth=444
route / [light]: page scrollWidth=444
route /planner [dark]: page scrollWidth=771
route /planner [light]: page scrollWidth=771
route /inbox [dark]: page scrollWidth=390
route /inbox [light]: page scrollWidth=390
route /announcements [dark]: page scrollWidth=390
route /announcements [light]: page scrollWidth=390
route /grades [dark]: page scrollWidth=505
route /grades [light]: page scrollWidth=505
route /materials [dark]: page scrollWidth=390
route /materials [light]: page scrollWidth=390
route /course/IST.352/stream [dark]: page scrollWidth=390
route /course/IST.352/stream [light]: page scrollWidth=390
route /course/IST.471/classwork [dark]: page scrollWidth=390
route /course/IST.471/classwork [light]: page scrollWidth=390
route /course/IST.466/grades [dark]: page scrollWidth=642
route /course/IST.466/grades [light]: page scrollWidth=642
route /course/IST.466/info [dark]: page scrollWidth=390
route /course/IST.466/info [light]: page scrollWidth=390
route /course/IST.471/assignment/IST.471/a1-proposal [dark]: page scrollWidth=390
route /course/IST.471/assignment/IST.471/a1-proposal [light]: page scrollWidth=390
route /workspace [dark]: page scrollWidth=390
route /workspace [light]: page scrollWidth=390
route /login [dark]: page scrollWidth=390
route /login [light]: page scrollWidth=390
route /privacy [dark]: page scrollWidth=390
route /privacy [light]: page scrollWidth=390
route /terms [dark]: page scrollWidth=390
route /terms [light]: page scrollWidth=390
route /no-such-page [dark]: page scrollWidth=390
route /no-such-page [light]: page scrollWidth=390
popout assignment [dark] dialog: left=5.6 right=384.4 innerWidth=390
popout assignment [dark]: page scrollWidth=390
popout assignment [light] dialog: left=5.6 right=384.4 innerWidth=390
popout assignment [light]: page scrollWidth=390
open state 1 bell [dark] panel: left=-14.4 right=345.6 innerWidth=390
open state 1 bell [light] panel: left=-14.4 right=345.6 innerWidth=390
open state 3 account [dark] panel: left=141.6 right=381.6 innerWidth=390
open state 3 account [light] panel: left=141.6 right=381.6 innerWidth=390
open state 5 sync-toast [dark] toast: left=-120.8 right=199.2 innerWidth=390
open state 5 sync-toast [light] toast: left=-120.8 right=199.2 innerWidth=390
open state 6 sync-error [dark] toast: left=-120.8 right=199.2 innerWidth=390
open state 6 sync-error [light] toast: left=-120.8 right=199.2 innerWidth=390
open state 7 search [dark] pill: left=150.9 right=362.9 innerWidth=390
open state 7 search [dark] popover: left=134.5 right=502.0 innerWidth=390
open state 7 search [light] pill: left=150.9 right=362.9 innerWidth=390
open state 7 search [light] popover: left=134.5 right=502.0 innerWidth=390
unfolded bar at 721: nav scrollWidth=851
bar at 390 longest label: nav scrollWidth=445
bar at 900 longest label: nav scrollWidth=974
  24 failed
  30 passed (9.7m)
✘   1 e2e/phone-width.spec.ts:223:9 › route / [dark] (3.5s)
✘   2 e2e/phone-width.spec.ts:223:9 › route / [light] (3.3s)
✘   3 e2e/phone-width.spec.ts:223:9 › route /planner [dark] (3.4s)
✘   4 e2e/phone-width.spec.ts:223:9 › route /planner [light] (3.4s)
✘   9 e2e/phone-width.spec.ts:223:9 › route /grades [dark] (3.1s)
✘  10 e2e/phone-width.spec.ts:223:9 › route /grades [light] (3.5s)
✘  17 e2e/phone-width.spec.ts:223:9 › route /course/IST.466/grades [dark] (3.1s)
✘  18 e2e/phone-width.spec.ts:223:9 › route /course/IST.466/grades [light] (3.2s)
✘  35 e2e/phone-width.spec.ts:368:9 › open state 1 bell [dark] (3.3s)
✘  36 e2e/phone-width.spec.ts:368:9 › open state 1 bell [light] (3.4s)
✘  37 e2e/phone-width.spec.ts:368:9 › open state 2 activity [dark] (1.5m)
✘  38 e2e/phone-width.spec.ts:368:9 › open state 2 activity [light] (1.5m)
✘  41 e2e/phone-width.spec.ts:368:9 › open state 4 nav-menu [dark] (1.5m)
✘  42 e2e/phone-width.spec.ts:368:9 › open state 4 nav-menu [light] (1.5m)
✘  43 e2e/phone-width.spec.ts:368:9 › open state 5 sync-toast [dark] (3.7s)
✘  44 e2e/phone-width.spec.ts:368:9 › open state 5 sync-toast [light] (3.5s)
✘  45 e2e/phone-width.spec.ts:368:9 › open state 6 sync-error [dark] (3.5s)
✘  46 e2e/phone-width.spec.ts:368:9 › open state 6 sync-error [light] (3.4s)
✘  47 e2e/phone-width.spec.ts:368:9 › open state 7 search [dark] (3.7s)
✘  48 e2e/phone-width.spec.ts:368:9 › open state 7 search [light] (3.4s)
✘  49 e2e/phone-width.spec.ts:415:7 › reachability [dark] (23.2s)
✘  50 e2e/phone-width.spec.ts:415:7 › reachability [light] (23.3s)
✘  53 e2e/phone-width.spec.ts:464:5 › bar at 390 longest label (3.2s)
✘  54 e2e/phone-width.spec.ts:474:5 › bar at 900 longest label (3.5s)
```

`route /course/IST.466/grades [dark]` is among the failures with `scrollWidth=642` (> 390). `unfolded bar at 721` passed and printed
the line the row asks for: `unfolded bar at 721: nav scrollWidth=851` (open item 3: **851 px**, the idle label, search collapsed, in the
real Inter face; the longest label printed 974 at 900, as STATUS recorded).

Notes on this RED run, said plainly:

* Two cases failed partly through the spec's own fault. `open state 2 activity` and `reachability` looked the Activity button up by the exact
  name "Activity", but its accessible name carries the count badge ("Activity 44" in the page snapshot), so they timed out for that reason as
  well as for the missing Menu. Found in the GREEN attempts below and fixed in the spec (the two buttons are found by `title`), in the
  task-13 commit. The other failures are for the reasons their printed lines give.
* `popout assignment` passes in both themes at 390 px (dialog 5.6 to 384.4, page 390), RED included.

## Routes too wide at 390 px

Read off the RED run above (every route that failed, with its `page scrollWidth`; dark and light read the same). The Sweep worker is the one in the brief's inventory row.

| Route | Inventory row | scrollWidth | Sweep worker | Note |
|---|---|---|---|---|
| `/` | 01 home | 444 | W-69 | Still 444 after the fold and Menu (run 20261009T000727Z, below), so it is the page and not the bar |
| `/planner` | 02 planner | 771 | W-69 | the board's 760 px floor (`planner-phone-width.css.test.ts`) |
| `/grades` | 05 grades | 505 | W-70 | the gradebook tables |
| `/course/IST.466/grades` | 09 course-grades | 642 | W-70 | the C-1 page |

The other 12 route paths (inbox, announcements, materials, the other three course pages, workspace, login, privacy, terms, not-found, and the
assignment page) printed 390 in both themes.

Re-measure of `/` after tasks 12 and 13: `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route / \["`, run **20261009T000727Z**
(HEAD 240687a, task-13 changes uncommitted): `route / [dark]: page scrollWidth=444`, `route / [light]: page scrollWidth=444`, 2 failed.

## Task 12: the nav fold

ui-ux-pro-max loaded (see its section). Test first: `web/test/TopNav.fold.test.tsx` (24 cases).

RED, `cd web && npx vitest run test/TopNav.fold.test.tsx` before any change to the shell: exit 1, `Test Files 1 failed (1)`,
`Tests 17 failed | 7 passed (24)` (Menu absent, no Sync label span, no 720/480/1023.98 rules).

GREEN after the change: the row's command
`cd web && npx vitest run test/TopNav.fold.test.tsx test/TopNav.search.test.tsx test/TopNav.workspace.test.tsx test/TopNav.update.test.tsx test/SyncButton.test.tsx test/CourseSidebar.test.tsx test/NavSearch.css.test.ts`
exit 0, `Test Files 7 passed (7)`, `Tests 108 passed (108)`. The six old files are unedited.
`npx vitest run test/token-audit.test.ts`: 89 passed, exit 0, with `shell.json` changed in the same commit.
`npx eslint src/components/shell test/TopNav.fold.test.tsx e2e/phone-width.spec.ts --max-warnings 0` exit 0; `npx tsc --noEmit -p .` exit 0.

What was built. `TopNav.tsx`: a Menu button (`aria-expanded`, `aria-controls="primary-nav-menu"`) in its own `usePopover`, and a panel
`#primary-nav-menu` of the six `NAV_LINKS`, mounted only while open. Escape closes and returns focus to Menu (done in `TopNav`; `usePopover`
is not reshaped); a pathname change, an outside press, a press on one of the panel's links, the account button and ☰ close it; Menu closes the
account menu. It writes neither `html[data-sidebar]` nor `localStorage['bb2dash.sidebar']` (a test holds that). `TopNav.module.css`: in the
720 px block `.links` is `display: none`, `.menu` is shown and the strip rules (`gap`, `flex`, `min-width`, `overflow-x`, `scrollbar-width`) are
deleted; the 480 px `.brandName` rule is untouched. `SyncButton.tsx`: the label sits in `<span class=label title={label}>`; the button's own
`title` is still the phase sentence. `SyncButton.module.css`: `.label` takes `.sr-only`'s declarations at 480 px and below, and
`max-width: 72px` with `overflow: hidden` and `text-overflow: ellipsis` at 1023.98 px and below.

Size literals added by task 12, as the Contract allows: **`max-width: 72px`** on the Sync label span (`SyncButton.module.css`, 8 to 9 in
`shell.json`). The Menu rules add none: they use tokens, `100%` and the allowlisted `1px` and `2px`.

The 72 px cap is a default chosen from the brief's numbers (idle bar 851 px, limit 900 px: the label may be about 49 px wider than "Sync")
and confirmed by the 900 px case below.

## Task 13: the seven open states

ui-ux-pro-max loaded again (see its section). RED: the open-state, reachability and bar cases of the RED run above (the same run
**20261008T233444Z**): bell panel left=-14.4, sync toast left=-120.8, search popover right=502.0, no Menu, `bar at 390 longest label`
nav 445, `bar at 900 longest label` nav 974.

Changes. `Bell.module.css` `.panel` and `TopNav.module.css` `.ddActivity`: at 720 px and below, `width: min(360px, calc(100vw - 28px))` and
`right: 0`. `SyncButton.module.css`: at 720 px and below `.wrap` is `position: static`, so `.stack` (the toast's positioned box) anchors to the
bar's right-hand group and ends at its right edge; its width rule was already `min(320px, calc(100vw - 28px))`. The three
`style={{ display: 'contents' }}` wrappers (`TopNav.tsx`, `ActivityMenu.tsx`, `Bell.tsx`) became a class (`TopNav.module.css` `.anchor`,
`Bell.module.css` `.anchor`), so the 480 px rule `.bar:has([data-search='open']) .icToggle ~ * { display: none }` takes effect. That alone fitted
the bar at 390 px with search open (nav scrollWidth 390): no change to `.right` was needed.

`grep -c "display: 'contents'" web/src/components/shell/TopNav.tsx web/src/components/shell/ActivityMenu.tsx web/src/components/shell/Bell.tsx`
prints three lines, each ending `:0`.

GREEN, `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "open state|reachability|bar at|sidebar toggle|popout assignment"`:
run **20261009T000426Z**, `"exit_code": 0`, `"result": "passed"`, `22 passed (1.2m)`, 0 failed, on HEAD 240687a (the task-12 commit) plus the
task-13 changes uncommitted (`"dirty": true`; they are the commit that carries this file). Pasted:

```
popout assignment [dark] dialog: left=5.6 right=384.4 innerWidth=390
popout assignment [dark]: page scrollWidth=390
popout assignment [light] dialog: left=5.6 right=384.4 innerWidth=390
popout assignment [light]: page scrollWidth=390
open state 1 bell [dark] panel: left=21.6 right=381.6 innerWidth=390
open state 1 bell [light] panel: left=21.6 right=381.6 innerWidth=390
open state 2 activity [dark] panel: left=21.6 right=381.6 innerWidth=390
open state 2 activity [light] panel: left=21.6 right=381.6 innerWidth=390
open state 3 account [dark] panel: left=141.6 right=381.6 innerWidth=390
open state 3 account [light] panel: left=141.6 right=381.6 innerWidth=390
open state 4 nav-menu [dark] panel: left=0.0 right=390.0 innerWidth=390
open state 4 nav-menu [light] panel: left=0.0 right=390.0 innerWidth=390
open state 5 sync-toast [dark] toast: left=61.6 right=381.6 innerWidth=390
open state 5 sync-toast [light] toast: left=61.6 right=381.6 innerWidth=390
open state 6 sync-error [dark] toast: left=61.6 right=381.6 innerWidth=390
open state 6 sync-error [light] toast: left=61.6 right=381.6 innerWidth=390
open state 7 search [dark] pill: left=134.8 right=346.8 innerWidth=390
open state 7 search [dark] popover: left=14.0 right=381.6 innerWidth=390
open state 7 search [dark]: nav scrollWidth=390
open state 7 search [light] pill: left=134.8 right=346.8 innerWidth=390
open state 7 search [light] popover: left=14.0 right=381.6 innerWidth=390
open state 7 search [light]: nav scrollWidth=390
unfolded bar at 721: nav scrollWidth=851
bar at 390 longest label: nav scrollWidth=390
bar at 900 longest label: nav scrollWidth=900
  22 passed (1.2m)
```

Earlier attempts, kept because they show what was fixed: run 20261008T234559Z (18 passed, 4 failed: Activity and reachability, the badge in the
accessible name, a spec fault); run 20261008T235253Z (16 passed, 6 failed: the first fix, a regular expression on the name, did not match, so
the lookup became `nav button[title^="Activity"]` and `nav button[title="Announcements"]`).

Size literals added by task 13: `min(360px, calc(100vw - 28px))` twice, so **360px** and **28px** in `Bell.module.css` (12 to 14) and in
`TopNav.module.css` (`.ddActivity`, 42 to 44). `SyncButton.module.css` adds none beyond task 12's. Sites removed: the three inline styles
(`ActivityMenu.tsx` 1 to 0, `Bell.tsx` 1 to 0, `TopNav.tsx` 2 to 1; its remaining `padding` key is task 17's). `shell.json` follows in the same
commit. `cd web && npx vitest run test/token-audit.test.ts` is 89 passed, exit 0.

## Tokens my sweep needs

Every size literal the audit counts in W-68's cluster after task 13 (read off the audit with the baselines set to 0: 133 findings), one name
per value, with the caps the Contract rules added named by their job. Names stand in the allowed families; `--size-N` means `N` px. Where
W-67 already has a better name from direction D (focus, press, check sizes), use that.

| Name | Today's value | Where used |
|---|---|---|
| `--size-3` | 3px | popout/Popout.module.css 88; TopNav.module.css 237, 238 |
| `--size-4` | 4px | popout/Popout.module.css 42, 203; SearchPanel.module.css 27, 52, 134, 203; TopNav.module.css 240 |
| `--size-5` | 5px | popout/Popout.module.css 221; SearchPanel.module.css 196; SyncButton.module.css 14 |
| `--size-6` | 6px | popout/SubmissionBlock.module.css 95; Bell.module.css 60, 61, 62; CourseSidebar.module.css 64; SearchPanel.module.css 138, 139; TopNav.module.css 22, 53, 154, 160, 161, 186 |
| `--size-7` | 7px | Bell.module.css 50; SearchPanel.module.css 152; TopNav.module.css 241 |
| `--size-8` | 8px | popout/Popout.module.css 42, 221; Bell.module.css 31, 47; CourseSidebar.module.css 64, 85; SearchPanel.module.css 52; TopNav.module.css 151, 197 |
| `--size-9` | 9px | TopNav.module.css 21, 32, 33, 239 |
| `--size-10` | 10px | Shell.module.css 43; popout/Popout.module.css 153, 207; popout/SubmissionBlock.module.css 91; Bell.module.css 31; CourseSidebar.module.css 67, 84, 129; SearchPanel.module.css 27, 178, 208; SyncButton.module.css 14; TopNav.module.css 11, 36, 186, 187, 196, 221, 307, 329 |
| `--size-12` | 12px | Bell.module.css 31, 50, 100; TopNav.module.css 154, 186, 197, 221 |
| `--size-12-5` | 12.5px | TopNav.module.css 229 |
| `--size-13` | 13px | CourseSidebar.module.css 86; NavSearch.module.css 76, 77; TopNav.module.css 198 |
| `--size-14` | 14px | Shell.module.css 72; CourseSidebar.module.css 64, 85, 129, 129; SyncButton.module.css 37, 38; TopNav.module.css 244, 307 |
| `--size-16` | 16px | TopNav.module.css 25 |
| `--size-17` | 17px | SearchPanel.module.css 201, 202 |
| `--size-18` | 18px | TopNav.module.css 90, 91 |
| `--size-panel-gutter` | 28px | Bell.module.css 117; SyncButton.module.css 179; TopNav.module.css 11, 321 |
| `--size-32` | 32px | NavSearch.module.css 46; TopNav.module.css 75, 76 |
| `--size-36` | 36px | Bell.module.css 38; TopNav.module.css 142 |
| `--size-toast-top` | 38px | SyncButton.module.css 63 |
| `--size-40` | 40px | TopNav.module.css 124 |
| `--size-58` | 58px | CourseSidebar.module.css 113 |
| `--size-68` | 68px | popout/Popout.module.css 236 |
| `--size-nav-search-min` | 72px | NavSearch.module.css 9 |
| `--size-sync-label-max` | 72px | SyncButton.module.css 149 |
| `--size-116` | 116px | popout/Popout.module.css 140 |
| `--size-140` | 140px | popout/Popout.module.css 80 |
| `--size-150` | 150px | popout/Popout.module.css 194 |
| `--size-nav-search-narrow` | 180px | NavSearch.module.css 127 |
| `--size-nav-search-width` | 240px | NavSearch.module.css 8; SearchPanel.module.css 53; TopNav.module.css 136 |
| `--size-toast-width` | 320px | SyncButton.module.css 65, 179 |
| `--size-panel-max` | 360px | Bell.module.css 39, 117; TopNav.module.css 143, 321 |
| `--size-search-popover-max` | 560px | NavSearch.module.css 105, 106 |
| `--size-760` | 760px | popout/Popout.module.css 21 |

Colour literals and mixes (the audit counts a `color-mix()` in a module):

| Name | Today's value | Where used |
|---|---|---|
| `--color-scrim` | rgba(0, 0, 0, 0.5) | CourseSidebar.module.css:161 |
| `--color-scrim-popout` | color-mix(in srgb, var(--color-bg) 72%, transparent) | popout/Popout.module.css:16 |
| `--color-text-45` | color-mix(in srgb, var(--color-text) 45%, transparent) | popout/Popout.module.css:224 |
| `--color-text-30` | color-mix(in srgb, var(--color-text) 30%, transparent) | SearchPanel.module.css:154 |
| `--color-text-78` | color-mix(in srgb, var(--color-text) 78%, transparent) | SearchPanel.module.css:163 |

Not a token: `TopNav.tsx:209`'s `style={{ padding: 0 }}` (task 17 clears it with a class).

## ui-ux-pro-max

* **Task 12.** The skill was loaded (Skill tool). Read in full: `design-system/bb2dash/MASTER.md`. No page file applies (the bar is not a page).
  Searches, run as `uv run --no-project python C:/Users/stack/.claude/skills/ui-ux-pro-max/scripts/search.py ...`:
  1. `"mobile menu button collapse navigation" --domain ux -n 3`: the three results (Back Button, Sticky Navigation, Mobile Keyboards) were
     off-topic for a collapsed menu; no verified match, so the Quick Reference's `nav-label-icon`, `nav-state-active` and
     `focus-not-obscured` guidance was used (Menu is a text button; the current page is marked in the panel; the panel hangs below the bar).
  2. `"touch target size spacing" --domain ux -n 2`: Touch Target Size (web: 24 CSS px, WCAG) and Touch Spacing (8 px).
  Set aside, with the rule that won: the 8 px gap between targets (the bar's group gap is `--space-1`; the brief allows no spacing change and
  task 36 owns larger click targets); an entrance animation on the panel (MASTER's panel motion belongs to tasks 29 and 30, and the Contract
  has the panel mount with no motion now). The focus return MASTER marks "waits" is built here for Menu only, because the brief's Contract
  asks for it ("Escape closes the Menu and returns focus to it").
* **Task 13.** The skill was loaded again; MASTER.md was in hand from task 12 (read earlier in the same session, not re-read). Search:
  `"no horizontal scroll mobile viewport" --domain ux -n 2`: Horizontal Scroll (web), fit the content to the viewport. Set aside: its code
  example `overflow-x-hidden` (it would hide a too-wide bar rather than fit it; the panels and the bar are fixed by geometry and a case
  measures them), and Tailwind class names (the brief: CSS Modules and custom properties).

## Defaults taken

1. **Test titles for the open states.** The brief fixes `open state <n> <name> [<theme>]` and not the names: 1 `bell`, 2 `activity`, 3 `account`,
   4 `nav-menu`, 5 `sync-toast`, 6 `sync-error`, 7 `search`.
2. **What "reachability" asserts.** At 390 px on `/`, each of the bar's seven controls (Menu, Sync, Search, ☰, Activity, Announcements, Account)
   is visible, inside the viewport and not covered at its centre; with Menu open, the six links are the same; pressing "Planner" reaches `/planner`.
3. **`popout assignment`** asserts the dialog inside the viewport and the page no wider than 390.
4. **Menu's panel** is a full-width sheet hanging from the bar's lower edge (`left: 0; right: 0`), not a `role="menu"` (it holds links; the arrow
   keys of "Keyboard polish" belong to the account menu, task 32). It is hidden above 720 px even when open, so a widened window never shows a stray panel.
5. **The Sync toast's re-anchor** is `.wrap { position: static }` at 720 px and below, not a new width or a fixed position: no size literal.
6. **The 72 px cap**: `bar at 900` prints 900. A scroll width never reads under the client width, so the case proves "no wider than 900", not slack.
7. **Fonts.** A case waits up to 30 s for a loaded face of the first family of `--font-body` (Inter today) and fails without one.
8. **`/login`** is walked by removing the context's cookies before the first load; the `/workspace` case opens a fixture conversation
   (`?c=22222222-2222-4222-8222-222222222201`) over `fulfillView` answers for the four sources, sample text only.
9. **Commit order.** The task-5 spec is its own commit (8979e1c) so the RED run could name a clean commit; the spec's Activity and Announcements
   lookup fix rides in the task-13 commit.
10. **Not run here:** the route cases other than the `/` re-measure, because tasks 14 to 16 belong to the other workers; the 22 of task 13 are green.

## Follow-up: the two scroll boxes, and the bar's icons by name

After merging `origin/feat/styling-22` (W-70's task 14 and W-69's task 15), `phone-width.spec.ts` changed in two ways.
`route /course/IST.466/grades [<theme>]` reads the first `[data-scroll-box="gradebook"]` and `route /planner [<theme>]` reads
`[data-planner-board="true"]`: each must have `scrollWidth` above `clientWidth`, printed on the case's line. Activity and Announcements are found
by role and a name that allows the count badge (`getByRole('button', { name: 'Activity' })`, a substring match, not exact), no longer by `title`.
Account, Search, Courses sidebar and Menu carry no badge and are found by role with their exact name, which does not depend on `title`.
A regular expression anchored on the word was tried first in an earlier attempt and did not match in the box, so the substring match is the default taken.

Spec list: `Total: 54 tests in 1 file`. `npx vitest run test/walk22-lib.test.ts`: 48 passed. Harness run on the committed tree (`"dirty": false`, commit
96a9fcc), `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route /course/IST.466/grades |route /planner |open state|reachability|bar at|sidebar toggle|popout assignment"`:
run **20261009T001508Z**, exit 0, `passed`, `26 passed`, 0 failed. The four box lines:

```
route /planner [dark]: box scrollWidth=764 clientWidth=368
route /planner [light]: box scrollWidth=764 clientWidth=368
route /course/IST.466/grades [dark]: box scrollWidth=620 clientWidth=345
route /course/IST.466/grades [light]: box scrollWidth=620 clientWidth=345
```

## Resume 2: the mount, the marks, the sweep

Start checks (each by itself, all exit 0 and one line): `data-theme='light'` in `globals.css`, `.errorNotice` and `.tip` in `tokens.module.css`,
`motion-control` and `size-target` in `globals.css`, `attemptText` in `queries.grades.ts`, `ThemeMenu.tsx` present on `origin/feat/styling-22`.

### Task 10, the mount (6509975)

One `<ThemeMenu />` line in `TopNav.tsx`, in the account menu between the desktop update row and Sign out. `cd web && npx vitest run test/ThemeMenu.test.tsx test/TopNav.update.test.tsx test/TopNav.fold.test.tsx`:
3 files, 47 passed, exit 0. `grep -c "<ThemeMenu" web/src/components/shell/TopNav.tsx` prints 1. `TopNav.search` and `TopNav.workspace` tests also pass.

### Task 31, `icons.tsx` (6e023d3), pushed by itself

`Mark` (five marks: caret right, down, left, close, arrow up right), `MarkedLabel` and `MARK_CHAR` (six characters by name) are in
`icons.tsx`; the bell and Sync are redrawn on the 256 grid (Phosphor regular paths) and `SyncButton.tsx`'s own 24-grid icon is gone
(`grep -c 'viewBox="0 0 24 24"' web/src/components/shell/SyncButton.tsx` prints 0). `Mark.module.css` sizes a mark at `1em`.
`git grep -c "export const MARK_CHAR" -- web/src/components/shell/icons.tsx` prints one line. `cd web && npx vitest run test/marks.test.tsx test/TopNav.search.test.tsx test/SyncButton.test.tsx test/Bell.test.tsx test/ItemPopout.test.tsx test/SubmissionBlock.test.tsx test/AssignmentPopout.test.tsx test/token-audit.test.ts`:
8 files, 208 passed, exit 0; the six old files unedited. (`marks.test.tsx` was written with the component and not run red on its own; I did not stash the component to show it.)
Mark characters before my own files of this task: `41 20`.
The Phosphor paths are written from memory of the regular weight set and checked only by a test that each path is non-empty and distinct;
nobody has looked at the drawn marks yet (the PM's shots 03, 06 and 28 are the first look).

### Task 17, the sweep of the shell cluster

`shell.json` is `{}` (every file at 0, taken out of the JSON). Printed lines:

```
Baseline sum (shell.json)      0
Weight check (shell, popout)   (nothing, exit 1)
Time check (shell paths)       (nothing, exit 1)
Field check                    5 2 2
No-select check (5 files)      5 0 0
Strength check                 8 5
Ring check (shell, popout)     17 0 0
Red files (components/shell)   Bell.module.css, CourseSidebar.module.css, TopNav.module.css
Notice files (popout)          components/popout/Popout.module.css
```

`git grep -c "cursor: progress"` over shell and popout: `Popout.module.css:1`, `SearchPanel.module.css:1`, `SyncButton.module.css:1`.
`@starting-style`: Popout (2: the backdrop and the panel), Bell, NavSearch, SyncButton, TopNav (2: `.dd` and the phone menu), five files.
`overscroll-behavior: contain`: Bell, SearchPanel, TopNav, Popout, four files. `backdrop-filter` in Popout: 0. `outline: none|0` in shell and popout: nothing (exit 1).
`var(--color-panel)` in CourseSidebar 1, `var(--radius-control)` in SyncButton 1, `var(--shadow-mark)` in TopNav 1.
`cd web && npm test`: 167 files, 3301 passed, exit 0. `npm run typecheck` exit 0. `npx eslint . --max-warnings 0` exit 0.
`ScreenStub.tsx` (no importer) and `.stub`, `.stubTitle`, `.stubMeta` are deleted; `.stubBody` is swept. `TopNav.tsx:154`'s `padding: 0` is the class `.ddHeadFlush`.

Defaults taken in the sweep: the Field and Strength rules for a disabled select/field carry `:disabled:not([aria-busy='true'])`
for `SearchPanel`'s `.courseSelect` now (the other rules follow with task 37); the nav-search pill keeps the one ring and the field inside it is
`outline-color: transparent` rather than `outline: none` (the Ring check counts the latter as a removed ring); `--size-nav-search-width` (240px) is used for the
three 240 px literals of the shell (account menu, search field, course select) because it is the only declared name for that value.

### Task 28, type (my part)

`CourseSidebar` `.head` and `SearchPanel` `.modeBtn, .modeBtnActive` take `--font-body` (weights `--font-weight-medium` and `--font-weight-semibold`), `SubmissionBlock` `.attemptNo` takes
`--font-body` and keeps its weight. The popout's "seen" stamp loses `tokens.mono` (the sha keeps it). `git grep -c "font-family: var(--font-heading)" -- <the three>` prints nothing (exit 1);
`grep -c "tokens.mono" web/src/components/popout/SubmissionBlock.tsx` prints 1; Weight check over shell and popout prints nothing. Tests: SubmissionBlock, CourseSidebar, audit, type-tokens: all passed.

### Task 29, panels leave

RED: `cd web && npx vitest run test/useExit.test.tsx` before `useExit.ts` existed failed to resolve the import (1 file failed, no tests). GREEN: 8 passed. The hook is
`const [exit, exitRef] = useExit(open, token?)` (the ref apart from the state, as `usePopover` does since R-51: the React Compiler lint reported 6 `react-hooks/refs` errors when they travelled in one object).
It reads the panel's computed `--motion-exit` (the popout: `--motion-exit-lg`) when `open` goes false; 0 or unreadable means removed in that render.
Panels using it: the account menu, the phone Menu (`TopNav.tsx`), Bell, Activity, the search popover (`NavSearch.tsx`; search's field goes at once, a new expansion is a new field), the Sync toast
(`SyncButton.tsx`, keeping the words the toast had), and the popout where `ItemPopout` hosts it (`PopoutShell` gained `leaving` and `onPanelNode`; it calls `onClose` in the same tick).
The row's command (10 test files) passed: 11 files with the audit, 225 passed, exit 0, the pre-existing files unedited. Printed lines:

```
git grep -c "var(--motion-exit)" -- web/src/components/shell        Bell 2, NavSearch 2, SyncButton 2, TopNav 4   (four files)
git grep -c "var(--motion-exit-lg)" -- web/src/components/popout    Popout.module.css 3                            (one file)
git grep -c "var(--ease-in)" -- shell popout                        the same five files
Exit tokens                                                          3 0
Time check over the shell paths                                      (nothing, exit 1)
```
`cd web && npm test`: 168 files, 3309 passed; `npm run typecheck` 0; `npx eslint . --max-warnings 0` 0; Audit green (shell.json stays `{}`).

### Task 30, smooth sidebar and search

`web/test/shell-motion.css.test.ts` first: RED 7 failed, 1 passed (the width transition, the keyframes' `width`, no transform on the drawer, no sign case); GREEN 8 passed with `NavSearch.css.test.ts`, `CourseSidebar.test.tsx`, `TopNav.search.test.tsx` and the audit (134 passed, exit 0; the three old files unedited).
`git grep -n -E "(transition|animation)[a-z-]*:[^;]*width" -- web/src/components/shell` prints nothing (exit 1); Time check prints nothing. The closed drawer is `translateX(100%)` (today's `row-reverse`); the test fails when `--sidebar-side` moves and the sign does not.
Harness `-g "open state 7|sidebar toggle|bar at"` on c9827fc: run 20261009T010533Z, 6 failed, all at the font check (see the finding under task 32): not a result for task 30. After the one-line override described there the same cases are covered by the final run below.

### Task 32, keyboard polish

RED: `shell-keyboard.test.tsx` (import of `SkipLink` unresolved) and `SyncButton.toast-timer.test.tsx` (3 failed: pointer, focus, Dismiss). GREEN: 9 files, 199 passed with the five old files unedited
(`SyncButton`, `TopNav.search`, `TopNav.update`, `TopNav.workspace`, `Bell`), `TopNav.fold` and the audit. `cd web && npm test`: 171 files, 3335 passed; typecheck 0; eslint 0.
`grep -c "Skip to content" "web/src/app/(app)/layout.tsx"` prints 1; `git grep -c "title=" -- TopNav.tsx Bell.tsx ActivityMenu.tsx NavSearch.tsx` prints nothing (exit 1); `grep -c "title={title}" web/src/components/shell/SyncButton.tsx` prints 1.
Built: `SkipLink.tsx`, `useEscapeFocus.ts`; the account menu focuses its first row on open and takes Down, Up, Home and End (wrapping); Escape returns focus to the Account, Bell, Activity and Menu buttons; Dismiss focuses Sync;
the toast's timer waits while the pointer or focus is on it (kept as "the toast that is held", so a toast removed under the pointer cannot leave the next one held); five icon buttons lose their `title` and carry `data-tip` and `tokens.tip`.
The Dismiss case is in `SyncButton.toast-timer.test.tsx` (it needs the Sync stubs), not in `shell-keyboard.test.tsx`.

`phone-width.spec.ts` `reachability` now presses Tab (the first stop is "Skip to content") and Enter (focus is on `main#content`) before the old steps. Harness `-g "reachability"`: run **20261009T012754Z**, exit 0, `2 passed`, 0 failed
(on the tree with the globals override below, which was not committed).

Two findings in W-67's files, not fixed by me:

1. **`globals.css` line 24: the fonts `@import` is dropped by the production build.** The built CSS holds no `fonts.googleapis.com` import and `document.fonts.size` is 0 in the box, so the page runs on its fallback faces and
   `phone-width.spec.ts`'s font check ("a face of Source Sans 3 with status loaded") fails every case that reads a width. Isolated with four builds: the `main` Inter import survives; an import whose URL holds
   `Source+Serif+4:opsz,wght@8..60,600` is dropped (the comma and the `..` range), while `Source+Sans+3:wght@400;500`, a two-family URL and `Source+Serif+4:wght@600` all survive. The fix is one value in
   `direction-d.json`'s `fontsHref` and `globals.css`: `family=Source+Serif+4:wght@600` (the Direction check compares `fontsHref`). For my harness runs I applied that one-line change to the working tree only, ran, and restored the file; `git status` on `globals.css` is clean.
2. **`tokens.module.css` `.tip` doubles the accessible name.** `content: attr(data-tip)` is part of the name Chromium computes, so "Courses sidebar" became "Courses sidebarCourses sidebar" and `getByRole('button', { name: 'Courses sidebar', exact: true })` found nothing. The clean fix is
   `content: attr(data-tip) / ''` (alt text for the generated content). Until then the four buttons carry an `aria-label` equal to their name (with the count: "Activity 3"), which wins over the generated content; Search already had one.

### Task 34, captions and codes (my part)

`SubmissionBlock.tsx:175` prints `submission.attemptText` (inside the `submission.attemptStatus &&` it had), and `SubmissionBlock.test.tsx:146` reads `'last attempt: needs grading'`, the one line the brief lets me edit
(the test and the component were changed together, so there is no separate RED run for this one). `grep -c "submission.attemptText"` prints 1, `grep -c "last attempt: needs grading"` prints 1,
`git diff --numstat origin/main...HEAD -- web/test/SubmissionBlock.test.tsx` prints `1 1` (after the commit; see below). `npx vitest run test/SubmissionBlock.test.tsx test/status-vocabulary.test.ts`: 2 files, 29 passed.

### Task 36, larger click targets (my part)

`web/test/shell-targets.css.test.ts` first: RED 3 failed, 2 passed; GREEN 5 passed. `Popout.module.css` `.close::after` and, inside `(max-width: 480px)`, `TopNav.module.css` `.brand::after` are `--size-target` square, centred, absolutely positioned;
neither rule gains a `min-width`, `min-height` or padding. `npx vitest run test/shell-targets.css.test.ts test/ItemPopout.test.tsx test/TopNav.fold.test.tsx` plus the audit and `shell-motion`: 128 passed, exit 0.

### Task 37, busy says busy (my part)

The six `controlsDisabled` sites of `AssignmentPlannerBlock.tsx` take `aria-busy={pending}` and `SyncButton.tsx` takes `aria-busy={busy}`.
`git grep -c -E "aria-busy=\{(pending|busy)\}" -- web/src/components/popout/AssignmentPlannerBlock.tsx web/src/components/shell/SyncButton.tsx` prints `…AssignmentPlannerBlock.tsx:6` and `…SyncButton.tsx:1`;
`grep -c "aria-busy" web/src/components/shell/TopNav.tsx` prints 1 (the update row's). `Popout.module.css` `.control` gets the switched-off look on `:disabled:not([aria-busy='true'])` (flat grey, `cursor: not-allowed`, opacity 1); a busy one stays at half strength with `cursor: progress`.
`SearchPanel.module.css` `.courseSelect` already carries its pair (task 17). Busy sites with the other workers' files not yet merged: `24 7` (my seven are among the 7). `cd web && npm test`: 172 files, 3340 passed; typecheck 0; eslint 0.

### Task 31, my own files (after the `icons.tsx` commit)

The five characters in `components/popout/` are drawn by marks: `PopoutShell.tsx` (the close cross), `AssignmentDetailBody.tsx` ("Grades" caret right keeping its `→`, "Open in Blackboard" arrow up right) and
`SessionPopout.tsx` ("Open" arrow up right, "Open in Classwork" caret right keeping its `→`). The two string labels are drawn through `MarkedLabel`: `STAGED_LABEL` in the link of `SubmissionBlock.tsx`
(the typed span of the course with no link stays typed, as `SubmissionBlock.test.tsx:265` needs) and `SYNC_COPY.openInbox` in `SyncButton.tsx`.
Mark characters before my files `41 20`, after `36 17` (5 characters in 3 files, as the row says). `grep -c "<MarkedLabel"`: `SubmissionBlock.tsx` 1, `SyncButton.tsx` 1; `grep -c "{STAGED_LABEL}</span>" web/src/components/popout/SubmissionBlock.tsx` 1.
`npx vitest run test/marks.test.tsx test/TopNav.search.test.tsx test/SyncButton.test.tsx test/Bell.test.tsx test/ItemPopout.test.tsx test/SubmissionBlock.test.tsx test/AssignmentPopout.test.tsx test/SessionPopout.test.tsx`: 8 files, 128 passed, the six old files unedited.
`cd web && npm test`: 172 files, 3340 passed; typecheck 0; eslint 0.

### Findings after the merge of W-67's task 16, and the full run

* The fonts `@import` finding under task 32 is closed by W-67's `fonts-href.test.ts` and the `<link>` in the root layout (merged before the run below); no override was needed for it.
  The `.tip` doubling of the accessible name (finding 2) is not closed: the `aria-label`s stay.
* One more regression of mine, found by the full run and fixed in 18523f3: the drawn icon labels (`.tip::after`, opacity 0 but still in the scrollable overflow) widened the nav to 411 px at 390 px with search open.
  They are not drawn at 720 px and under (`.bar .ic[data-tip]::after { display: none }`, held by a case in `TopNav.fold.test.tsx`).
* **Full run, `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts`, run 20261009T015506Z, commit 5e699f8, `"dirty": false`: exit 1, `2 failed`, `52 passed`.** The two failures are
  `route / [dark]` and `route / [light]`: `page scrollWidth=402`. The element is W-69's: the Upcoming work strip on Home (`UpcomingTracker.module.css`, the `.day` buttons reach right=400 and the strip is not held to the pane's width at 390 px).
  I did not touch it. The earlier full run 20261009T014210Z (before the label fix) was `4 failed, 50 passed`: the same two and `open state 7 search` in both themes.
* Printed in the same run: `unfolded bar at 721: nav scrollWidth=815` (it was 851 in Inter), `bar at 390 longest label: nav scrollWidth=390`, `bar at 900 longest label: nav scrollWidth=900`.

## Round 2

**R2-8 (HIGH), `useEscapeFocus.ts`.** The hook moved focus to its button on any Escape while its popover was open, so an Escape pressed in the search field (opened with Ctrl+K over an open bell) was stolen before NavSearch's own guard ran.
It now moves focus only when focus is inside the popover's anchor (its button and its panel) or nowhere (the body); `usePopover` is untouched.
RED, written first in `web/test/shell-keyboard.test.tsx` (bell, Activity and the account menu open, Ctrl+K, Escape in the field: search folds, focus is on the Search icon and not on the popover's button): `Test Files 1 failed`, `Tests 3 failed | 15 passed (18)`.
GREEN: see the gates below.
GREEN: the row's six files (`shell-keyboard`, `TopNav.search`, `Bell`, `TopNav.update`, `TopNav.workspace`, `TopNav.fold`): 6 files, 75 passed, 0 failed, the old files unedited. The existing Escape case for Bell and Activity now focuses each button before its press, as a real press does
(in jsdom `fireEvent.click` does not move focus, and the second button's Escape would otherwise belong to the first). `cd web && npm test`: 174 files, 3351 passed; typecheck 0; eslint 0; `test/token-audit.test.ts` 89 passed.
Recorded, no change: `Bell.module.css` `.panel` repeats `dd`'s arrive and leave rules because the brief's own checks pin Bell's copy; declined.

## Last stage (tasks 26 and 27)

First acts, on the tree after merging `origin/feat/styling-22` (5496140 and the Phase 23 follow-ups): Baseline sum `{F=/\.json$/}` prints `0`; Mark characters `0 0`; Busy sites `24 24`; Time check over `"web/src/*.css" ":(exclude)web/src/app/globals.css"` prints nothing (exit 1).
`git grep -c "attr(data-tip) / ''" origin/feat/styling-22 -- web/src/styles/tokens.module.css` printed nothing (exit 1): W-67 has not made the drawn label silent, so the `aria-label` workaround on the icon buttons stays, and is owed (named below).

### Task 26, the frame with scrolling panes (64f8d45)

`web/test/pane-scroll.test.tsx` first: RED, `usePaneScroll` unresolved (1 file failed, no tests); GREEN, 6 passed (a new pathname puts the pane at 0; Back puts back the `scrollTop` the page had when it was left, and Forward the same;
a page it has not kept starts at 0; nothing reaches `localStorage` and the only key written is `bb2dash.pane-scroll` in `sessionStorage`; with no pane the hook does nothing). The hook (`usePaneScroll.ts`) is used by a small client wrapper,
`ContentPane.tsx`, which is the page's one `main` (`id="content"`, `tabIndex={-1}`, so "Skip to content" still lands on it). The key is the pathname, so a change of query alone (a tab, a week, `?item=`) neither resets nor is remembered apart;
Back and Forward are told from a `popstate`; a restore keeps asking for up to 60 animation frames until the page's data makes it tall enough, and the reader's wheel or touch ends the wait. Default taken: per pathname, not per history entry.

Printed checks: `grep -c "position: sticky"` on `TopNav.module.css` 0 and on `CourseSidebar.module.css` 0; `grep -c "min-height: 100dvh"` on `Shell.module.css` 0; `grep -c "height: 100dvh"` 1; `grep -c "scrollbar-gutter: stable"` 1; `grep -c "overscroll-behavior: contain"` 1.
`cd web && npx vitest run test/pane-scroll.test.tsx test/CourseSidebar.test.tsx test/Workspace.layout.test.tsx test/TopNav.fold.test.tsx` passed (with the audit and `shell-motion`: 6 files, 160 passed), the old files unedited.
`cd web && npm test`: 181 files, 3381 passed; typecheck 0; eslint 0 (after moving the scroll writes into a helper, because the React Compiler lint read `node.scrollTop = …` inside the hook as a change to the `pane` ref); audit 89 passed.
`.main > * { flex-shrink: 0 }` is a default I added: in a pane of fixed height a column flex child that scrolls on its own (the planner board, a table's wrapper) would otherwise be squeezed to fit instead of making the pane scroll.

Harness, `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts`: run **20261009T031826Z**, commit 64f8d45, `"dirty": false`, exit 0, `"result": "passed"`, **`54 passed`**; `grep -c "pane scrollWidth=" <run>/stdout.log` prints **24**.
The old layout specs, `node scripts/walk-box.mjs web/e2e/workspace-layout.spec.ts web/e2e/workspace-acceptance-helpers.spec.ts`: run **20261009T032456Z**, commit cebba3f (after task 27), clean, exit 0, `9 passed`.

What the frame does in a real browser (a throwaway probe spec, not committed, run 20261009T032610Z, 1440 by 900, after the pane was scrolled to its end): on `/`, `/planner`, `/inbox`, `/grades`, `/materials`, `/workspace`, the Stream of IST.352, IST.466's Grades and the A1 popout URL the document is exactly the window,
`scrollHeight` 900 = `innerHeight` 900 and no sideways scroll; the bar's top edge is at 0; the content pane starts at the bar's bottom (52.9) and ends at 900; the side panel fills the same height (847.1) and does not scroll with the pane. The pane scrolls by itself where there is more to see
(Home by 502 px, Planner by 302, Grades by 4,074, Materials by 13,180, the Stream by 1,763); Inbox, Workspace and IST.466 Grades were short at that moment (0 to scroll). At 1440 px the planner board fits (1,103 of 1,103) and it scrolls sideways inside the pane at 390 px (the 764 of 368 line of the phone-width run).
I did not look at pictures (no shots are allowed in a worker's run); these are measurements. Nothing was found in another worker's file.

## Idle bar width for task 27

`unfolded bar at 721: nav scrollWidth=815` (run 20261009T031826Z: 815 px, the idle label, search collapsed, in Source Sans 3; it was 851 in Inter). Also printed in that run: `bar at 390 longest label: nav scrollWidth=390`, `bar at 900 longest label: nav scrollWidth=900`.
W-67: `BAR_IDLE_WIDTH` is 815, so `BAR_IDLE_WIDTH + CONTROLS_WIDTH` is 953 and `MIN_WIDTH` rounds up to 960.

### Task 27, my part (cebba3f)

`TopNav.module.css` `.bar` is `app-region: drag` with `padding-right: max(var(--size-28), calc(100vw - env(titlebar-area-width, 100vw)))` (a browser falls back to the 28 px); the bar's controls (`.brand`, `.link`, `.menu`, `.ic`) and the panels that open from it (`.dd`, `.navMenu`; Bell's and Activity's panels compose `dd`) are `no-drag`;
`SyncButton.module.css` marks `.button` and the alert and toast box `.stack` `no-drag`, and `NavSearch.module.css` marks the pill, its field and its results popover (`.root`) `no-drag`; and `:global(body:has([aria-modal='true'])) .bar` takes the drag region off while a dialog is open. No `data-desktop` hook.
Printed: `grep -c "app-region: drag"` 1; `grep -c "no-drag"` 3; `grep -c "aria-modal"` 2 (the comment names it too); `grep -c "titlebar-area-width"` 1. `cd web && npm test` 181 files, 3381 passed; typecheck 0; eslint 0; audit 89 passed.
Not seen by any test, and for acceptance step 5: a menu row and the popout's close button pressed in the real window.

## ui-ux-pro-max (tasks 26 and 27)

The skill was loaded at the start; `MASTER.md` was in hand from the earlier tasks of this session (`:263` "the window waits" and `:216` the `scroll-padding-top` line are overtaken by D-1, brief lines 2376 and 2379). Search: `"scroll container fixed header focus not obscured" --domain ux -n 2` returned Focus Not Obscured (Minimum and Enhanced):
"offset sticky UI with scroll-padding". Set aside: its `scroll-padding-top: var(--header-height)` example, because the frame removes the case it answers (the bar no longer lies over a scrolling page; `html`'s `scroll-padding-top` goes in W-67's line of task 26).

## Owed

* The `aria-label` workaround on the five icon buttons stays until W-67 changes `tokens.module.css` `.tip` to `content: attr(data-tip) / ''`.
* `scroll-padding-top` in `globals.css` (W-67) and `CourseTimeline.module.css:29` (W-70) now wait for their lines of task 26.

### Round 2, P-1: the icon buttons are named by their own text again (3c519a5)

After W-67's 422067c (`content: attr(data-tip) / ''`; `git grep -c` on `tokens.module.css` prints one line) the `aria-label`s this phase added are off the Courses sidebar, Activity, Announcements and Account buttons; Search's `aria-label="Search"` was on `main` and stays.
No `title=` is left in the four files (`git grep -c "title=" …` prints nothing). The old files are unedited: `shell-keyboard`, `TopNav.search`, `TopNav.update`, `TopNav.workspace`, `TopNav.fold`, `Bell`: 6 files, 75 passed.
`cd web && npm test`: 182 files, 3402 passed; typecheck 0; eslint 0; audit 89 passed.
The case `unfolded bar at 721` (labels are drawn from 721 px) now reads the five buttons' names from the browser's accessibility tree. Printed by the box's Chromium: `- button "Search"`, `- button "Courses sidebar"`, `- button "Activity 44"`, `- button "Announcements"`, `- button "Account"`: each its own text, with the count (44) where there is one, none doubled.
Harness `-g "reachability|open state|bar at|sidebar toggle|unfolded"` on the committed tree: run **20261009T033814Z**, commit 3c519a5, `"dirty": false`, exit 0, `20 passed`.

## Visual round

Run 20261009T034707Z's shots were opened with the Read tool for `01-home-dark.png` only (the badge); the other items were settled by measurement in the box (no shots from a worker's run).

* **V-1 (6042f66), the unread badge.** `.badge` is now `top: calc(var(--size-underline-mark) * -1)` and `right: calc(var(--size-8) * -1)`: the red pill, its on-accent ink and its chip radius are as before, and it hangs past the button's upper right edge instead of lying over the glyph. Tokens only; audit 89 passed.
  The case `unfolded bar at 721` measures it in the browser. Printed (run 20261009T040741Z): `activity badge [left,top,right,bottom]: 735.1,8.5,753.1,22.5; icon: 720.1,17.5,738.1,35.5; covers 4.6% of the icon` (a two-digit count, 44; the limit is a third). When the button holds no badge the line says `activity badge: none (no unseen count to measure)`.
  The bell's badge is the same class (`Bell.module.css` composes `badge` from `TopNav.module.css`), so it moved with it; it holds no count today and was not measured.
* **V-2 (73b9fb2), the seen time.** The stamp takes the submission line's `.note` class (`font-size: var(--text-xs)`, the body face), as its neighbours do. `web/test/submission-seen.css.test.ts` pins it (RED with the class taken off: 1 failed; GREEN 2 passed); `SubmissionBlock.test.tsx` unedited and green.

### The bar between 721 and 815 px (V-3)

## The bar between 721 and 815 px

Measured by the case `unfolded bar at 721`, after it sets the window to 800 by 900 on `/` (run 20261009T040741Z): `bar at 800: {"documentScrollWidth":815,"innerWidth":800,"navScrollWidth":815,"scrollXAfterScrollTo100":15}`.
So the document can still scroll sideways, by the 15 px the idle bar overflows by, and `window.scrollTo(100, 0)` moves `scrollX` by 15: the Account button can be brought into view, as on `main` (the frame holds the document's height at the window's, not its width: the bar's overflow still propagates to the viewport).
The shot of the courses drawer at 800 px simply is not scrolled. **I changed nothing**: the band is as the brief records it. The case now asserts that the page scrolls sideways by exactly the bar's overflow (up to the 100 px asked), so a later change that made the overflow unreachable would fail it.
Whether the fold moves to 820 px is Stack's call, as the brief says.

### The popout's foot (V-4)

`Popout.module.css` `.backdrop` is `position: fixed; inset: 0; overflow-y: auto` with the panel at its top (`align-items: flex-start`) and a padding under it, exactly as on `main` (`git show origin/main:…` shows the same four declarations). The case `popout assignment` now scrolls the backdrop to its end in a 1440 by 900 window and asserts the panel's bottom is inside the window.
Printed, both themes: `popout assignment [dark] foot: {"windowHeight":900,"backdropClientHeight":900,"backdropScrollHeight":1022,"backdropScrolledTo":122,"panelBottomAfterScroll":878}`. The content is 122 px taller than the window and is reached by scrolling the backdrop (wheel, or the scrollbar of the themed block); the foot lies 22 px above the window's edge once scrolled. As on `main`. I changed nothing; the shot shows the first windowful, as the walk is not scrolled.

### Which attribute says a button's panel is open

All five already say it, as `aria-expanded`, `"true"` while open and `"false"` otherwise: Search (`NavSearch.tsx:141`, the field open), Courses sidebar (`TopNav.tsx:218`, `sidebarOpen`: the rail or the drawer), Activity (`ActivityMenu.tsx:66`), Announcements (`Bell.tsx:71`) and Account (`TopNav.tsx:242`). None is `aria-pressed`. Nothing was added.

### ui-ux-pro-max (visual round)

Loaded at the start of the round and `MASTER.md` was in hand (read earlier this session). No new search: the items are a position, a class, and two measurements. Advice set aside: none.

### Gates

`cd web && npm test`: 183 files, 3404 passed; typecheck 0; eslint 0; audit 89 passed.

Full run on the committed and pushed tree, `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts`: run **20261009T041719Z**, commit 4b77389, `"dirty": false`, exit 0, `"result": "passed"`, `54 passed`; the badge and the 800 px lines above are printed again in it.

### V-15, the popout's panel draws no ring (33519ca)

`Popout.module.css` `.panel:focus-visible` (the ring on the dialog `PopoutShell` focuses by script) is deleted, and no `outline: none` takes its place: the global rule leaves a `role="dialog"` container out, and the first Tab inside shows the ring on a real control.
Read of every `focus-visible` rule in the shell and the popout: the others are controls, menu rows, a field, or `CourseSidebar` `.rail:focus-visible` (an `aside` with `tabIndex={-1}`, not a dialog), and they keep theirs. No test of mine pinned the deleted rule.
Ring check `37 0 0`; `git grep -c -E "outline:\s*(none|0)\b"` over shell and popout prints nothing; `cd web && npm test` 187 files, 3426 passed; typecheck 0; eslint 0; audit 89 passed.
`node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts -- -g "17 assignment-popout|18 session-popout"`: run **20261009T062419Z**, commit 33519ca, `"dirty": false`, exit 0, `4 passed`.

## Round 3

Each finding was written test first, in the new files of mine (`pane-scroll.test.tsx`, the new `ItemPopout.reopen.test.tsx`); no pre-existing test changed.

* **S-1 (b879662), `cameBack` sticks.** RED: `pane-scroll.test.tsx` with the item-popout path and the planner's week links: `Tests 2 failed | 9 passed (11 with the S-6 cases)`. The fix: a `popstate` sets the flag only when the address's pathname differs from the committed one (`cameBack.current = window.location.pathname !== committed.current`), so a Back that keeps the pathname leaves nothing to restore and a push navigation always starts at 0. GREEN: 9 passed (S-1's three cases, and the six before).
* **S-6 (8f87d85), the wrong key in the gap.** RED: the gap case and the restoring-writes case failed (`Tests 2 failed`, with S-1's two before its fix: 4 failed | 7 passed). The fix: the position is saved under `committed.current`, a ref set by the pathname effect, and the pane's reports are ignored while `putBack` is still asking (`restoring`, cleared when it reaches the position, runs out of frames, is stopped by the reader's wheel or touch, or is cleaned up). GREEN: 11 passed.
* **S-5 (8dd7965), a popout reopened during its exit.** RED: `ItemPopout.reopen.test.tsx`, `Tests 2 failed` (another item inside the exit: focus not in the dialog; the same item reopened: focus not in the dialog). The fix: `PopoutShell` gets `itemKey` and runs its opener-and-focus bookkeeping on every (re)open (an effect on `leaving` and `itemKey`: it remembers what focus was on unless it is already in the panel, and moves focus in); the hand-back to the opener stays on unmount. A different item is a reopen, not a remount, so closing B gives focus to B's opener. GREEN: 2 passed; with `ItemPopout`, `AssignmentPopout`, `SessionPopout` and `useExit`: 46 passed.
* **S-9, left.** Not done, and said so: `NavSearch`'s `wasExpanded` and `generation` do not retain content, they count expansions so a new one is a new field, so one `useExit` that returned the retained value would simplify only `SyncButton` and `ItemPopout`, and S-5 had already reshaped `ItemPopout`. Not all three come out simpler, so I changed none of them.

Gates: the seven files of the row plus the new one: 8 files, 100 passed. `cd web && npm test` 188 files, 3433 passed; typecheck 0; eslint 0; audit 89 passed.
Full run on the committed and pushed tree, `node scripts/walk-box.mjs web/e2e/phone-width.spec.ts`: run **20261009T064052Z**, commit 8dd7965, `"dirty": false`, exit 0, `54 passed`.
