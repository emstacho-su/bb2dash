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
