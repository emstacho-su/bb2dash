# 103 · Phase 22 review record

Phase 22, brief `docs/planning/sprint-2/briefs/103_PHASE22_styling.md`, task 23. The PM's file. Three gates are
recorded here, each under its own heading: `/code-review main high` on the four sweeps, `/code-review main high`
on the integrated branch, and `/security-review`. A finding's last cell is its state: `fixed` with the commit,
`declined` with who declined and why, `not a defect` with why, or `sent` while its worker still holds it. At the
PR no row reads `sent`.

Severities are the PM's. The review tool returns findings without one.

## /code-review main high (sweeps pushed)

Run 2026-10-09 (UTC) by the PM, from inside the worktree of the branch under review. No tree held all four
sweeps at that point, so the review read a scratch branch, `review/styling-22-sweeps`, cut from `feat/styling-22`
at ca52b96 in a worktree of its own (`bb2dash-wt-22-review`) with the three other worker branches merged into it
locally: `feat/styling-22-shell` at 159f760, `feat/styling-22-screens-a` at c6fa8cb and
`feat/styling-22-screens-b` at 5a2b835. Its head was 42fda7a. It was never pushed. The branch and the worktree
were removed after the review: `git branch --list "review/styling-22-sweeps"` and
`git ls-remote --heads origin "review/styling-22-sweeps"` both print nothing.

On that tree, before the review: `npm ci`, `npm test` (177 files, 3364 passed), `npm run typecheck`,
`npx eslint . --max-warnings 0` and `npm run build`, each exit 0. The brief's named checks printed: Baseline sum
0; New names `34 0 0`; Ring check `38 0 0`; Field check `5 5 5`; Strength check `13 0`; No-select check
`10 0 0`; Busy sites `24 24`; Mark characters `0 0`; Weight check and Time check nothing; Red files the nine
named files; five pre-existing web tests modified, the five the brief allows; no test deleted, no desktop test
and no old spec touched, no package file changed, no PNG added. One check missed its target: Notice files
printed 14 where 13 is asked (row P-2 below).

The review read 174 files of `main...HEAD` and returned ten findings. Two more rows are the PM's own, found on
the same tree, and one came from a worker's report.

| # | Sev | Where | Finding | Owner | State |
|---|---|---|---|---|---|
| R2-1 | HIGH | `web/e2e/theme-walk.spec.ts` | The Activity and Announcements buttons were found by `title`, which task 32 takes off both buttons, so four cases (rows 23 and 24, both themes) would time out on the merged tree | W-67 | fixed, 934fe25: found by role and name |
| R2-2 | HIGH | `web/e2e/theme-walk.spec.ts` | `motion off under reduced motion` expected `--motion-exit` to read exactly `0ms`; the production build's minifier writes `0s` | W-67 | fixed, 9d4d95f: the case reads a time, and a zero in either form passes |
| R2-3 | HIGH | `web/src/app/layout.tsx`, `web/src/lib/theme-preference.ts` | `viewport.themeColor` is the fixed dark ground and the light value is stamped once per document load. Next keys the viewport tree on the request, so a client navigation can put a fresh dark meta in place: a dark browser bar over a light page, and, after task 27, dark window buttons on a light title bar | W-67 | fixed, da7719c. It reproduced: after Light was picked and a bar link followed, run 20261009T030405Z printed the metas as `["#f4f4f4","#050505"]` (Next inserts a fresh dark meta beside the stamped one). The boot script now keeps every `theme-color` meta on the stamped ground through an observer on the head; run 20261009T031847Z printed `["#f4f4f4","#f4f4f4"]`, 5 passed. The assertion stays in `25 account-menu [light]` (b9d3976) |
| R2-4 | MEDIUM | `web/src/app/(app)/course/[id]/info/CourseInfo.tsx` | The card-note field is disabled on a compound expression with no `aria-busy`, so the new switched-off rule painted it grey during every save | W-70 | fixed, 4420f1a, with `CourseInfo.busy.test.tsx`. PM ruling of this round: a control that one of the five switched-off rules can reach, and whose `disabled` holds a pending flag beside something else, carries `aria-busy` for that flag. W-69 read its files for the same (6c8ec25: none to change beyond the popover's status select, which it had done); W-67 reads its own as R2-4c (30ba51e: its sites are listed in its notes) |
| R2-5 | MEDIUM | `web/src/components/shell/ThemeMenu.tsx`, `web/src/lib/theme-preference.ts` | Another tab's pick reaches this tab's menu through the `storage` event and nothing re-stamps the page: the checked row and the page disagree | W-67 | fixed, ab0a9fc: the boot script re-stamps on a `storage` event for the key or a cleared storage; the menu follows a later change from another tab |
| R2-6 | MEDIUM | `web/src/app/(app)/materials/MaterialsBrowser.tsx` | The reading-route links rendered their label raw, with a typed arrow beside rows that draw the mark | W-70 | fixed, 4719a7e, with `MaterialsBrowser.marks.test.tsx`. The second site the review named, `SubmissionBlock.tsx:99`, is the one label the brief keeps typed (`SubmissionBlock.test.tsx:265`): not a defect |
| R2-7 | none | `web/e2e/theme-walk.spec.ts` | `31 frame-scrolled` asserts a frame the tree did not have | W-67 | not a defect: the case is written at task 16 and goes green with task 26, as the brief orders; the worker's run left it out by name |
| R2-8 | HIGH | `web/src/components/shell/useEscapeFocus.ts` | The hook moved focus to its button on any Escape while its popover was open. With the bell open and an Escape pressed in the search field, focus went to the bell and search stayed open | W-68 | fixed, 73f56dc: focus returns only when it is inside the popover's own anchor or nowhere; three new cases. `usePopover` keeps the shape R-51 gave it, as the brief asks, so the reviewer's proposal to add a parameter to it was not taken |
| R2-9 | LOW | `web/src/app/layout.tsx`, `web/src/app/globals.css` | The fonts `@import` is dead in the build and its URL is held twice; the preconnect to `fonts.googleapis.com` carries `crossOrigin`, which the stylesheet request cannot reuse | W-67 | fixed, 07c6d6d, for the preconnect and a comment over the `@import`. The `@import` string stays: the brief's Direction check reads it, and `fonts-href.test.ts` holds the copies equal. `next/font`, which the reviewer names, is out by D-2 |
| R2-10 | LOW | `web/src/components/shell/Bell.module.css`, `ThemeMenu.module.css` | `.panel` composes `dd` and repeats its arrive and leave rules; `ThemeMenu`'s `.row` rewrites `.ddRow` | PM | declined by the PM, LOW: the brief's own checks pin Bell's copy (`var(--motion-exit)` in exactly four shell files, `@starting-style` in exactly five), and a compose from W-67's module into W-68's would cross the owner sets for a cosmetic gain |
| P-1 | MEDIUM | `web/src/styles/tokens.module.css` `.tip` | The drawn label's `content: attr(data-tip)` joined each icon button's accessible name; W-68 worked round it with an `aria-label` per button (found by W-68) | W-67, then W-68 | W-67's half fixed, e82a36c: `content: attr(data-tip) / ''`. W-68's half fixed, 3c519a5: the workaround is off the four buttons that gained it in this phase. Run 20261009T033814Z read the five names from the browser's accessibility tree: Search, Courses sidebar, Activity with its count, Announcements, Account, none doubled |
| P-2 | LOW | `web/src/styles/tokens.module.css:262` | A comment quotes the compose line, so the Notice files command prints 14 files, not 13 | W-67 | fixed, d84b012: the command prints 13 |
| P-3 | LOW | `web/src/app/(app)/Today.module.css` | A wrap rule for the course-card stats that its own author called a guess | W-69 | fixed, f0302a2: the rule moved the page by 0 px (402 with and without it) and is out; run 20261009T022831Z, 2 passed at 390 |

The reviewer also noted that the branch did not yet touch `project-state/STATUS.md`. That is task 24, in the
same PR.

Found outside the review, in the same stretch, and recorded here because it changed a mechanism the brief
names. Since task 8 no web font was requested by a built app: Turbopack drops an `@import` whose URL holds `..`,
and direction D's `fontsHref` asks Source Serif 4 for the optical-size range `8..60`. Every harness run failed at
the font check. W-67 found it and fixed it (2a29b5e): the same Google Fonts stylesheet is linked from the root
layout. The PM confirmed the cause on a local build, where no built stylesheet named `fonts.googleapis.com`.

## Visual round (the PM's pre-walk, before the second review)

Not one of the three gates; recorded here because its findings went to the same workers as a numbered round.
On 2026-10-09 (UTC) the PM ran the whole theme walk with shots on the integrated branch at 1862098, run
`20261009T034707Z`: 64 passed, 31 dark and 31 light shots, the no-writes fingerprint the same before and
after. Two independent checkers opened all 62 shots and judged each against direction D. No shot was in the
wrong theme, none was unreadable, and red was never the colour of words. What they found, by where it went:

| # | Where | Finding | Owner | State |
|---|---|---|---|---|
| V-1 | top bar | The unread badge covered most of the Activity icon | W-68 | fixed, 6042f66: 4.6% of the icon covered with a two-digit count |
| V-2 | the popout's submission line | The "seen" time had grown to about 15 px when `tokens.mono` came off it (task 28) | W-68 | fixed, 73b9fb2 |
| V-3 | the bar at 800 px | The Account icon is cut off: the idle bar is 815 px | W-68 | measured, nothing changed: the document is 815 wide in an 800 window and still scrolls sideways, as on `main`. Brief 103 records the band as not fixed. Put to Stack as taste call T-12 |
| V-4 | the assignment popout | Its foot is below the window's edge | W-68 | not a defect: the backdrop scrolls, as on `main`, and the foot is reached |
| V-5 | `theme-walk.spec.ts` rows 19 and 23 | The shot was taken while the panel still read "Loading…" | W-67 | sent |
| V-6 | the Inbox footer | "Apply answers" was not a pill and its switched-off look was a faint outline | W-69 | fixed, c8c2d84 |
| V-7 | Home's today list at 820 px and under | The status select shows only its caret | W-69 | not this phase: `main` has the same grid rule (four tracks for five children). Known, not this phase |
| V-8 | the planner wizard | The step markers had lost their pill | W-69 | fixed, 956a554: direction D halved the radius token they used |
| V-9 | the series scope dialog | Native radio buttons, checked in blue | W-67 | sent |
| V-10 | the Grades report-card strip | The strip's scroll box clipped the card's new edge | W-70 | fixed, d0e0c59 |
| V-11 | the Stream | The "scroll up for weeks" button was in the browser's own face | W-70 | fixed, 516a07d (`main`'s rule set no face) |
| V-12 | the Stream | The tentative and attendance tags had gone square: their own `calc` on `--radius-md` | W-70 | fixed, c1ac1a3; the dashes are `main`'s and stay |
| V-13 | the gradebook's Seen column | The stamp had lost its size and tone with `tokens.mono` | W-70 | fixed, be4e30e |
| V-14 | the bar's icon labels | A drawn label stays up behind its own open panel | W-67 | sent |
| V-15 | the popouts | The focus ring is drawn round the whole dialog when it opens from a link | W-67 | sent |

Same on `main`, or not chosen by Stack, so not built here; each goes under "Known, not this phase" in
`WALK.md`: the blank gap under the wizard's title field and its fields stopping short of the panel; the first
hour label on the rule under the Events row; the Inbox's empty line under a failed read; the browser's own
caret, calendar and clock glyphs on selects and date fields (D-4); the disclosure triangle on "N earlier"
(D-3 added no mark where no character stood); table columns that do not line up between course blocks on
`/grades`; the assignment page marking Stream as the current tab.
