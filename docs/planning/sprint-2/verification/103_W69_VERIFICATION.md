# Phase 22 · W-69 verification (screens A: Home, planner, tracker, Inbox, Announcements)

Branch `feat/styling-22-screens-a`, worktree `bb2dash-wt-22-screens-a`, started from `origin/feat/styling-22` ea91c9a.
Spawn 1 does task 15 and the tokens table. Task 18 (the sweep) waits for W-67's task 8.

## Task 15: the planner board scrolls inside itself; rows 01-04 fit at 390 px (R-46)

### Start check

* `git cat-file -e origin/feat/styling-22:web/e2e/phone-width.spec.ts` -> exit 0.
* `git cat-file -e origin/feat/styling-22:web/test/TopNav.fold.test.tsx` -> exit 0.

### RED

* `cd web && npx vitest run test/planner-css.test.ts test/planner-phone-width.css.test.ts` -> exit 1,
  `2 failed | 27 passed`. The two failures were the new file's: "gives the board no min-width of its own, in any
  block" and "puts the 760px floor on the day tracks at 900px and below". `planner-css.test.ts` was green.
* Harness run `20261008T235104Z` (`web/e2e/phone-width.spec.ts`, the four routes, both themes), exit 1,
  4 failed, 4 passed, on the tree before any CSS change:

  | route | page `scrollWidth` | result |
  |---|---|---|
  | `/` [dark] and [light] | 444 | failed |
  | `/planner` [dark] and [light] | 771 | failed |
  | `/inbox` [dark] and [light] | 390 | passed |
  | `/announcements` [dark] and [light] | 390 | passed |

  Run `20261008T234740Z` found no tests: the row's pattern has `\|` for the table-cell escape of a pipe, which
  Playwright's JavaScript regular expression reads as a literal pipe. See the defaults.

### The fix

* `PlannerWeek.module.css`, the `(max-width: 900px)` block: `min-width: 760px` on `.board` is gone; the block now
  sets `grid-template-columns: var(--planner-gutter) repeat(7, minmax(101px, 1fr))`. 48 + 7 x 101 + 7 gaps + 2 of
  padding is 764 px, the old floor rounded up to a whole pixel per track. `.board` keeps `overflow-x: auto`; there
  is no vertical scroller; `.block`'s `overflow`, `padding` and `line-height` are untouched (A3).
* `Today.module.css` and `UpcomingTracker.module.css`: a `(max-width: 720px)` block makes `.sub` wrap
  (`white-space: normal`). On Home the Courses caption ("Open = items due this week ...") was `nowrap` and 410 px
  wide, which put the page at 444 px. `.sub` is the caption of both stylesheets' section heads.
* No size or colour literal was added anywhere: `760px` became `101px` in the same file, so the count of
  `PlannerWeek.module.css` stays 35 and `screens-a.json` is not changed.

### GREEN

* Harness run `20261008T235442Z`, exit 0, `result` `passed`, `8 passed (27.0s)`. Printed `page scrollWidth`:
  `/` 390 / 390, `/planner` 390 / 390, `/inbox` 390 / 390, `/announcements` 390 / 390 (dark / light).
  The spec of that run held no assertion on the board's own width: the run printed the page's width only. A later run by
  W-68, `20261009T001508Z`, printed `route /planner [dark]: box scrollWidth=764 clientWidth=368` (the same in light).
* The deterministic checks are in the section "Checks" below.

## Tokens my sweep needs

Every name below is new, from an allowed family, at today's value. Where a value is exactly one `globals.css`
already declares, the sweep uses that name and the value is not listed: `font-size: 11px` is `--text-xs`
(`PlannerWeek.module.css:770`). `1px`, `2px` and the A3 and A5 entries need no token. The space tokens are not
whole pixels (`--space-1` is 2.8px), so no pixel gap or padding maps to one. A name that D's 34 already hold is not
asked for: `--size-check` (13px) is not this cluster's 13px (a month label's height), and `--size-scrollbar` (10px)
is not the caret's 10px.

A `--color-mix-*` name stands for the colour of the `color-mix()` in its row, so the light block redeclares it. In
the name, `surface` is `var(--color-surface)` and `transparent` is `transparent`. The Time check and the font
weights: the only literal `font-weight` in the cluster is `NeedsAttention.module.css:51` (600).

| Name | Today's value | Where it is used |
|---|---|---|
| `--color-mix-text-4-surface` | `color-mix(in srgb, var(--color-text) 4%, var(--color-surface))` | `Today.module.css:101` (`.courseCard:hover` background) |
| `--color-mix-accent-14-surface` | `color-mix(in srgb, var(--color-accent) 14%, var(--color-surface))` | `PlannerWeek.module.css:125` (today's day head) |
| `--color-mix-accent-10-surface` | `color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))` | `PlannerWeek.module.css:202` (band toggle hover) |
| `--color-mix-accent-8-surface` | `color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))` | `PlannerWeek.module.css:233` and `:273` |
| `--color-mix-accent-10-transparent` | `color-mix(in srgb, var(--color-accent) 10%, transparent)` | `PlannerWeek.module.css:583` and `:805` |
| `--color-mix-accent-16-transparent` | `color-mix(in srgb, var(--color-accent) 16%, transparent)` | `PlannerWeek.module.css:587` |
| `--color-mix-accent-2-800-78-transparent` | `color-mix(in srgb, var(--color-accent-2-800) 78%, transparent)` | `PlannerWeek.module.css:352` and `:562` |
| `--color-mix-bg-55-transparent` | `color-mix(in srgb, var(--color-bg) 55%, transparent)` | `PlannerWeek.module.css:485` |
| `--color-mix-bg-45-transparent` | `color-mix(in srgb, var(--color-bg) 45%, transparent)` | `PlannerWeek.module.css:762` |
| `--color-mix-bg-80-transparent` | `color-mix(in srgb, var(--color-bg) 80%, transparent)` | `PlannerSeriesScopeDialog.module.css:17` (backdrop) |
| `--color-mix-text-45-transparent` | `color-mix(in srgb, var(--color-text) 45%, transparent)` | `StatusSelect.module.css:17` (border) |
| `--color-mix-text-6-transparent` | `color-mix(in srgb, var(--color-text) 6%, transparent)` | `UpcomingTracker.module.css:99` (`.day:hover`; amendment 3 row 5 may remove this mix, then the name goes unused) |
| `--font-weight-semibold` | `600` | `NeedsAttention.module.css:51` (`.count b`) |
| `--text-2xs` | `10px` | `Today.module.css:240`; `AnnouncementsList.module.css:69`; `PlannerWeek.module.css:129`, `:153`, `:714`, `:760`; `UpcomingTracker.module.css:117`, `:168` (font sizes) |
| `--text-3xs` | `9px` | `Today.module.css:216` (`.stripLabel` font size) |
| `--radius-3` | `3px` | `Today.module.css:199` (`.stripBar` radius) |
| `--size-planner-gutter` | `62px` | `PlannerWeek.module.css:98` (`--planner-gutter`) |
| `--size-planner-gutter-narrow` | `48px` | `PlannerWeek.module.css:849` (`--planner-gutter` at 900px and below) |
| `--size-planner-day-min` | `101px` | `PlannerWeek.module.css:850` (the day tracks' floor at 900px and below, task 15) |
| `--size-3` | `3px` | `Today.module.css:157`, `:188`, `:194` (gaps); `InboxCard.module.css:131` (gap); `PlannerWeek.module.css:227` (padding) |
| `--size-4` | `4px` | `Today.module.css:183`; `PlannerWeek.module.css:213`, `:390`, `:481`, `:483`, `:561`, `:611`, `:623`, `:686`, `:687`, `:757`; `UpcomingTracker.module.css:45`, `:51`, `:94`, `:177` (gaps, paddings, the hatch stop) |
| `--size-5` | `5px` | `Today.module.css:206`, `:207` (`.stripDot`); `InboxApplyButton.module.css:22` (padding) |
| `--size-6` | `6px` | `AnnouncementsList.module.css:40`, `:41` (dot); `PlannerItemPopover.module.css:59` (padding) |
| `--size-7` | `7px` | `AnnouncementsList.module.css:42` (margin), `:70` (padding) |
| `--size-8` | `8px` | `AnnouncementsList.module.css:33` (track); `PlannerWeek.module.css:296` (glow blur); `UpcomingTracker.module.css:73` (scrollbar height) |
| `--size-9` | `9px` | `Today.module.css:242` (caret width); `PlannerWeek.module.css:687` (hatch stop) |
| `--size-10` | `10px` | `NeedsAttention.module.css:29` (caret width), `:124` (padding calc); `InboxApplyButton.module.css:22` (padding) |
| `--size-12` | `12px` | `PlannerWeek.module.css:747`, `:748` (width, height) |
| `--size-13` | `13px` | `UpcomingTracker.module.css:116` (`.monthLabel` height) |
| `--size-14` | `14px` | `InboxApplyButton.module.css:45`, `:46` (width, height); `UpcomingTracker.module.css:125` (`.dayCount` height) |
| `--size-16` | `16px` | `Today.module.css:197` (`.stripBar` width) |
| `--size-22` | `22px` | `Today.module.css:198` (height), `:250` (track); `UpcomingTracker.module.css:208`, `:268` (tracks) |
| `--size-28` | `28px` | `InboxApplyButton.module.css:101` (`calc(100vw - 28px)`) |
| `--size-32` | `32px` | `PlannerWeek.module.css:65` (min-width) |
| `--size-38` | `38px` | `InboxApplyButton.module.css:63` (top) |
| `--size-54` | `54px` | `UpcomingTracker.module.css:88` (`.day` min-width) |
| `--size-60` | `60px` | `UpcomingTracker.module.css:268` (track) |
| `--size-66` | `66px` | `Today.module.css:250`; `UpcomingTracker.module.css:208` (tracks) |
| `--size-72` | `72px` | `NeedsAttention.module.css:77` (track); `PlannerEventForm.module.css:60` (min-height) |
| `--size-84` | `84px` | `NeedsAttention.module.css:77` (track) |
| `--size-96` | `96px` | `PlannerEventWizard.module.css:81` (track) |
| `--size-120` | `120px` | `UpcomingTracker.module.css:268` (track) |
| `--size-128` | `128px` | `Today.module.css:250`; `UpcomingTracker.module.css:208` (tracks) |
| `--size-150` | `150px` | `UpcomingTracker.module.css:208` (two tracks) |
| `--size-160` | `160px` | `PlannerEventWizard.module.css:37` (`minmax` floor) |
| `--size-180` | `180px` | `InboxCard.module.css:62` (`minmax` floor) |
| `--size-220` | `220px` | `PlannerEventForm.module.css:33` (flex basis) |
| `--size-280` | `280px` | `PlannerEventForm.module.css:42` (max-width) |
| `--size-300` | `300px` | `PlannerItemPopover.module.css:14` (width cap) |
| `--size-320` | `320px` | `InboxApplyButton.module.css:65`, `:101` (width, cap) |
| `--size-420` | `420px` | `PlannerSeriesScopeDialog.module.css:21` (width cap) |
| `--size-620` | `620px` | `PlannerEventForm.module.css:9` (max-width) |

Notes for task 8 and the sweep:

* `--size-planner-gutter` is the value of a custom property this cluster already declares (`--planner-gutter`), so
  the sweep may keep that property and give it `var(--size-planner-gutter)`. `--planner-slot: 24px` (A3) stays.
* Not in the table because they are not size, colour or weight literals: the four TSX inline style keys the audit
  counts (`Inbox.tsx:272`, `NeedsAttention.tsx:158` and `Today.tsx:224` carry `fontSize: 'var(--text-sm)'`,
  `Today.tsx:479` carries `textAlign: 'center'`, `UpcomingTracker.tsx:600` a computed `height`). The sweep moves
  them into a class or a custom-property key; no new token.
* The literals the sweep removes from a grid track are a decision for the sweep (a `minmax()` floor can read a
  token, or the track can be left as a `fr`); the table asks only for the values so either is possible.

## Checks

Each run by itself, output to a file, exit code read from the command.

| Check | Exit | Result |
|---|---|---|
| `cd web && npx vitest run test/planner-css.test.ts test/planner-phone-width.css.test.ts` | 0 | 2 files, 29 tests passed |
| `cd web && npx vitest run test/token-audit.test.ts` | 0 | 89 passed, 0 failed (baseline unchanged) |
| `cd web && npm test` | 0 | 161 files, 3125 tests passed |
| `cd web && npm run typecheck` | 0 | no output |
| `cd web && npx eslint . --max-warnings 0` | 0 | no output |
| `grep -c "^## Tokens my sweep needs$" docs/planning/sprint-2/verification/103_W69_VERIFICATION.md` | 0 | `1` |
| harness `-g "route / |route /planner |route /inbox |route /announcements "` (run `20261008T235442Z`) | 0 | 8 passed, 0 failed |

No pre-existing test failed on the contract; none was edited. The table above holds 52 names.

## Defaults taken

* The row's `-g "route / \|route /planner \|route /inbox \|route /announcements "` was run with the table-cell
  escapes removed (`route / |route /planner |route /inbox |route /announcements `), because Playwright reads
  `\|` as a literal pipe and finds no tests (run `20261008T234740Z`). The pattern selects the same eight cases.
* Home's overflow was fixed in `Today.module.css` and `UpcomingTracker.module.css` (W-69's files) with a
  `(max-width: 720px)` block on `.sub`; the allowlisted 720px breakpoint, no new literal.
* The 760 px floor became `minmax(101px, 1fr)` on seven tracks (764 px in all) rather than an inner element, since
  that is the smaller change and the brief names tracks first.
* Names in the table are numeric (`--size-N`) for plain lengths and named for the planner's three, so W-67 can
  merge a value another table asks for under the same name; W-67 chooses the final names.

## Resume 1: start checks

`git fetch origin`, `git merge origin/feat/styling-22` (clean). The row's five checks, each by itself, every one printed one
line and exited 0: `data-theme='light'` in `globals.css` (2), `^\.errorNotice` in `tokens.module.css` (2), `motion-control`
in `globals.css` (3), `size-target` in `globals.css` (1), `attemptText` in `queries.grades.ts` (2).

## Task 18: the sweep of screens A

Tokens are used under the names `globals.css` declares: `--color-mix-text-45-transparent` is an alias of `--color-text-45`
(not needed in this cluster after the sweep: the one use was `StatusSelect`'s hover, which now names
`--color-neutral-400`); `--text-2xs` 10px; `--text-3xs` 9px.

### RED, then GREEN

| Step | Command | Result |
|---|---|---|
| RED | `cd web && npx vitest run test/UpcomingTracker.urgency.test.tsx` (new file, written first) | exit 1, 3 failed, 1 passed (the mixed day passes on today's data order; the legend and the two stability cases fail) |
| GREEN | the same | exit 0, 4 passed |
| GREEN | `cd web && npx vitest run test/UpcomingTracker.urgency.test.tsx test/UpcomingTracker.test.tsx test/UpcomingTracker.scroll.test.tsx test/upcoming-tracker-css.test.ts` | 0 failures; the three old files unedited |

### The row's commands, before and after

| Command | Before the sweep | After |
|---|---|---|
| Baseline sum, `F=/^screens-a\.json$/` | 106 (sum of the old JSON) | `0` (the JSON is `{}`) |
| Weight check over `NeedsAttention.module.css` and `web/src/components/tracker` | 1 line (`NeedsAttention.module.css:51`) | prints nothing |
| Red files over inbox, announcements, planner, tracker | prints nothing | 4 lines: `Inbox.module.css`, `AnnouncementsList.module.css`, `PlannerWeek.module.css`, `UpcomingTracker.module.css` |
| Notice files over inbox, `Today.module.css`, `components/inbox`, `components/planner` | prints nothing | 5 lines: `Today.module.css`, `Inbox.module.css`, `InboxCard.module.css`, `PlannerEventForm.module.css`, `PlannerWeek.module.css` |
| `grep -c "var(--radius-day)"` / `"var(--radius-bar)"` in `UpcomingTracker.module.css` | 0 / 0 | 1 / 1 |
| Time check over the screens A paths | prints nothing | prints nothing |
| Field check | `5 0 0` | `5 2 2` (`StatusSelect`, `PlannerItemPopover` `.control`) |
| No-select check over `UpcomingTracker.module.css` and `Inbox.module.css` | | `2 0 0` |
| `grep -c "user-drag: none" "web/src/app/(app)/Today.module.css"` | 0 | 1 |
| Strength check | `7 7` (by the brief; the four files of W-69 were the 0.45/0.55/0.6 ones) | `7 3` (down by 4; the three left are W-67's `.btn:disabled` and W-68's `SyncButton` and `Popout`) |
| `git grep -c "cursor: progress"` over planner and tracker | 2 lines | 2 lines: `PlannerWeek.module.css:1`, `StatusSelect.module.css:1` |
| `grep -c "accent-color" PlannerWeek.module.css` | 1 | 0 |
| `grep -c "outline: none" StatusSelect.module.css` | 1 | 0 |
| `grep -c "var(--color-surface-press)" Today.module.css`; `grep -c "var(--motion-delay)" Today.module.css` | 0; 0 | 1; 1 |
| `git grep -c "@starting-style"` over `PlannerItemPopover.module.css`, `InboxApplyButton.module.css` | none | 2 lines, one each |
| Ring check, W-69's stylesheets only | | `14 0 0` |
| `npm test` | | exit 0, 165 files, 3242 tests |
| `npm run typecheck`; `npx eslint . --max-warnings 0` | | exit 0; exit 0 |
| `npx vitest run test/token-audit.test.ts` | | 0 failures |

### What the sweep did, and the defaults it took

* Every size literal is `var(--size-N)` (or the planner's three named ones, `--text-2xs`, `--text-3xs`, `--radius-3`); every
  `color-mix()` is the `--color-mix-*` token of its row; `NeedsAttention` `.count b` is `--font-weight-semibold`.
  `PlannerWeek.module.css` keeps A3's `--planner-slot: 24px`, `.block`'s `padding: 3px 5px` and `line-height: 14px`, and
  `.chip`'s padding; `StatusSelect`'s `padding: 3px 6px` and `.barArea`'s `height: 120px` stay.
* The four `style=` keys that were not custom properties are gone: the three `fontSize: 'var(--text-sm)'` on a button link
  became a descendant rule (`.headerMeta a`, `.panelFoot a`, `a.inboxLink`; an element selector outranks the composed
  `.btn` class whichever sheet the browser loads last), `Today.tsx`'s `textAlign` a class (`.stripHead`, composing
  `kicker`), `UpcomingTracker.tsx`'s bar `height` a custom property (`--seg-height`). `PlannerWeek.tsx`'s one `height` key
  stays (A5); `PlannerBoard.tsx`'s sites already held only `--` keys.
* Home's loading line (`.muted`) waits `--motion-delay` and fades in once, with its own `@keyframes arrives` in the module
  (a module's animation names are local). It carries `data-loading`, so `globals.css`'s reduced-motion rule keeps the wait
  and drops the fade. The attribute is on that one span only; H-5's "not needed" is about the other loading lines.
* `.statusSelect` fill is the well (`--color-bg`), as the text field's. The popover and the series dialog panels carry the
  scroll and arrival rules the entries name. `PlannerItemPopover` `.panel` grows from the top centre, or the bottom centre
  when `data-placement` is `above`.
* The Upcoming order: `LEGEND` reads exam, project, quiz, assignment, reading and `URGENCY_RANK` is read from it;
  `barOrder` sorts a day's items stably, least urgent first, so the last child (the top bar of the `column-reverse` area) is
  the most urgent. The item detail rows keep the order they arrive in.
* The popover `.control` and `.statusSelect` disabled rules keep the pointer they have (`default` for the first, which got
  `cursor: pointer` for the field look; `progress` for the second).
* Scrollbar: `.tracker`'s own rules stay for now (task 38); the one `8px` in `::-webkit-scrollbar` became `--size-8` so
  the baseline reaches 0 at this task.

## ui-ux-pro-max

Loaded with the Skill tool at the start of resume 1 and kept for the tasks of that resume (18, then 28 and 34 to 38, and 31).

* **Task 18.** Files read: `design-system/bb2dash/MASTER.md`, `pages/home.md`, `pages/planner.md`, `pages/inbox.md`, and
  `component-changes.json` (the `what` of every W-69 entry). Searches: none run. The design system the pass persisted
  already answers every question the sweep asks (colour, motion, states, focus), and the brief says the brief and
  `direction-d.json` win on a value; a fresh search would only return generic advice to set aside. Advice set aside, and the
  rule that won: the skill's "min 44x44 touch" and "16px body" rules (native/mobile scope; the brief pins the sizes and
  asks for the 24px target of task 36); "spring-physics" curves (the brief's `--ease-out` token); "toast auto-dismiss in
  3-5s" (not a W-69 rule; the app's own timer stays); the generated `transition: all` (the Master bans it).

## Task 28: type, titles and dates (W-69's part)

Files read again: `design-system/bb2dash/MASTER.md` typography section, `pages/planner.md`, `pages/inbox.md`; the brief's Type
rules. `PlannerItemPopover.module.css` `.title` (the popover's `h2`) takes the body face and keeps its weight token;
`InboxCard.module.css` `.value` takes the body face, so the two date panes leave the code face. The sha, course codes and
`.command` keep the code face. No size changed. Taste calls T-7 (the popover title, which is a title by its markup) are the
PM's.

| Check | Before | After |
|---|---|---|
| `git grep -c "font-family: var(--font-heading)" -- web/src/components/planner/PlannerItemPopover.module.css` | 1 line | prints nothing (exit 1) |
| `grep -c "font-family: var(--font-mono)" web/src/components/inbox/InboxCard.module.css` | 1 | 0 |
| Serif check restricted to W-69's two rules (`.title`, `.value`) | | `2 0 0` |
| Weight check over the screens A paths | prints nothing | prints nothing |

## Task 34: captions (W-69's part)

Four how-to lines left the page's visible text and became the `title` of what they explain; each sentence is still in its file.

| Sentence | Now the `title` of |
|---|---|
| "Open = items due this week · strip = meeting days, dot = something due" | the Courses `h2` (`Today.tsx`) |
| "line = Monday · click a day for detail" | the day strip's tablist (`UpcomingTracker.tsx`); "Window · ..." and "Scrolls ..." stay |
| "status is click-to-edit" | the detail panel's day heading (`UpcomingTracker.tsx`) |
| the planner's two lines, as one sentence ending "the grid shows New York time" | the week header's count line, through a new optional `captionTitle` prop of `WeekHeader` (`PlannerWeek.tsx` holds the string) |

The rules left dead by it are deleted: `PlannerWeek.module.css` `.legend` and `UpcomingTracker.module.css` `.detailHint`. The two
`.sub { white-space: normal }` blocks of task 15 stay, because `.sub` is still used (Home's Undated count, the tracker's caption).

| Check | Before | After |
|---|---|---|
| `grep -c "<span className={styles.sub}>Open = " "web/src/app/(app)/Today.tsx"` | 1 | 0 |
| `grep -c "styles.detailHint" web/src/components/tracker/UpcomingTracker.tsx` | 1 | 0 |
| `grep -c "className={styles.legend}" web/src/components/planner/PlannerWeek.tsx` | 1 | 0 |
| `grep -c "strip = meeting days" "web/src/app/(app)/Today.tsx"` | 1 | 1 |
| `grep -c "line = Monday" web/src/components/tracker/UpcomingTracker.tsx` | 1 | 1 |
| `grep -c "status is click-to-edit" web/src/components/tracker/UpcomingTracker.tsx` | 1 | 1 |
| `grep -c "the grid shows New York time" web/src/components/planner/PlannerWeek.tsx` | 1 | 1 |
| `npx vitest run test/UpcomingTracker.scroll.test.tsx test/UpcomingTracker.test.tsx test/TodayLayout.test.tsx test/PlannerWeek.test.tsx` | | exit 0, 4 files, 109 passed; the four files unedited |
| `npm test`; `npm run typecheck`; `npx eslint . --max-warnings 0` | | exit 0 (165 files, 3242 tests); exit 0; exit 0 |

## Task 35: the week strip

`Today.module.css`: `.stripBar` is a clear fill inside an inset ring in `--color-accent-700` (the tile's own choice); `.stripBarMeet`
is filled with that same token and draws no ring. Width, height and radius did not change. The label he chose, "Meeting days
as outline", reads the other way round; the build follows entry `week-strip-shape` and the tile (default 16, taste call T-10).

| Step | Command | Result |
|---|---|---|
| RED | `cd web && npx vitest run test/today-week-strip.css.test.ts` (new file, written first) | exit 1, 2 failed, 1 passed |
| GREEN | `cd web && npx vitest run test/today-week-strip.css.test.ts test/TodayLayout.test.tsx test/CourseCard.test.tsx` | exit 0, 3 files, 46 passed; the two old files unedited |
| Audit | `cd web && npx vitest run test/token-audit.test.ts` | exit 0 |
| Gates | `npm test`; `npm run typecheck`; `npx eslint . --max-warnings 0` | exit 0 (166 files, 3245 tests); exit 0; exit 0 |

## Task 36: the planner's done box and title (larger click targets)

A tick on the done box writes to Stack's planner, so the geometry is the careful part. What was built, and one departure:

* **Where the area is drawn.** The done box sits inside `.blockBody`, which has `overflow: hidden` and is as tall as the block's
  whole lines, so a `::after` drawn from the box would be clipped to the text area (about 14px) and gain nothing. So `TaskBox`
  wraps the box in a `<label class="eventDoneArea">` (`display: contents`, so the box is still a flex child of the head row and
  no box moves); the label is static, and its `::after` is placed in the block (`position: absolute`, which clips to its own
  edge). A press on the label toggles the box, as a label does, and the label stops the click as the box already did, so it never
  opens the event. Accessible names are unchanged (the box keeps its `aria-label`; the label has no text).
* **The done box's area.** It starts at the block's top-left corner and ends at the box's own right edge
  (`width: calc(var(--size-5) + var(--size-12))`). In a compact block (one row, the title to the right) its height is the block's
  full height (`100%`). In a taller block the title is on the row below, so the area stops at the box's own bottom edge
  (`calc(var(--size-3) + var(--size-underline) + var(--size-12))`, 16px) and never lies over the title. That is the one reading of
  default 5 that keeps "a press on the title's first pixel opens the event and writes nothing" true for both layouts.
* **The title's area.** `.eventTitle::after` fills the block (`inset: 0`; the title stays static so the block is its box). The
  done box and its area carry `z-index: 1`, so the box's centre is the box. The Join link (`.eventLink`) is `position: relative`
  so it stays above the title's area. `.eventChip` is `position: relative` so a band chip is a box the areas fill.
* **Not met, by default 5.** The area is 17px wide (5px of padding and the 12px box), under the 24px of `--size-target`; the width
  is the PM's to record in `WALK.md` under T-11. The measured proof is W-67's `planner targets` case of `theme-walk.spec.ts`
  (not on this branch yet); I did not run it.
* `.block`'s `overflow`, `padding: 3px 5px` and `line-height: 14px` are untouched.

| Step | Command | Result |
|---|---|---|
| RED | `cd web && npx vitest run test/planner-targets.css.test.ts` (new file, written first) | exit 1, 9 failed, 1 passed (the `.block` case) |
| GREEN | `cd web && npx vitest run test/planner-targets.css.test.ts test/planner-css.test.ts test/PlannerWeek.events.test.tsx` | exit 0, 3 files, 58 passed; `planner-css.test.ts` and `PlannerWeek.hydration.test.tsx` unedited |
| Audit | `cd web && npx vitest run test/token-audit.test.ts` | exit 0, 89 passed, 0 stale A3 entries |
| Gates | `npm test`; `npm run typecheck`; `npx eslint . --max-warnings 0` | exit 0 (167 files, 3255 tests); exit 0; exit 0 |

## Task 37: busy says busy (W-69's part)

`aria-busy={pending}` sits beside `disabled={pending}` at the nine sites of W-69, and two rules got the switched-off look on
`:disabled:not([aria-busy='true'])` (fill `--color-neutral-900`, edge `--color-neutral-800`, words `--color-neutral-600`, `cursor:
not-allowed`, opacity 1), while a busy control stays at half strength with `cursor: progress`.

| Command | Printed |
|---|---|
| `git grep -c -E "aria-busy=\{(pending\|busy)\}" -- web/src/components/inbox web/src/components/planner web/src/components/tracker "web/src/app/(app)/inbox"` | `InboxCard.tsx:2`, `PlannerEventForm.tsx:1`, `PlannerEventFormFields.tsx:2`, `PlannerSeriesScopeDialog.tsx:3`, `StatusSelect.tsx:1` (the five lines the row names) |
| `git grep -c -E ":disabled:not\(\[aria-busy=.true.\]\)" -- web/src/components/tracker web/src/components/planner` | `StatusSelect.module.css:1`, `PlannerItemPopover.module.css:1` |
| Strength check (all stylesheets) | `9 3` (the two new rules set opacity 1, which is allowed; the 3 left are W-67's and W-68's) |
| `npm test`; `npm run typecheck`; `npx eslint . --max-warnings 0` | exit 0 (167 files, 3255 tests); exit 0; exit 0 |

Default taken: `PlannerItemPopover.tsx` also gets `aria-busy={save.isPending}` on its status select. Its `disabled` is
`save.isPending || plannerUnavailable`, so it is not one of the 24 counted sites (the Busy sites command does not match it and
still prints the same count), but without the attribute the new switched-off look would flash a grey box at every save. A save is
busy; an unavailable planner is off.

## Task 38: the Upcoming strip's scrollbar

`.tracker` dropped `scrollbar-width`, `scrollbar-color` and its three `::-webkit-scrollbar` rules, so the app's one scrollbar block
draws it. The strip is never hidden (R3-1). The one pre-existing test edited is `web/test/upcoming-tracker-css.test.ts`, its
second case only (lines 30-34, now "leaves its bar to the app's one scrollbar block"): the first case is unchanged. The comment
in the stylesheet avoids the property names, because the row's grep reads comments.

| Step | Command | Result |
|---|---|---|
| RED | `cd web && npx vitest run test/upcoming-tracker-css.test.ts` (second case edited first) | exit 1, 1 failed, 1 passed |
| GREEN | `cd web && npx vitest run test/upcoming-tracker-css.test.ts test/UpcomingTracker.scroll.test.tsx test/UpcomingTracker.test.tsx` | exit 0, 3 files, 51 passed; the last two unedited |
| | `git grep -c -E "scrollbar-(width\|color)\|::-webkit-scrollbar" -- web/src/components/tracker/UpcomingTracker.module.css` | prints nothing (exit 1) |
| | `grep -c "does not hide the scrollbar" web/test/upcoming-tracker-css.test.ts` | `1` |
| Audit | `cd web && npx vitest run test/token-audit.test.ts` | exit 0 |
| Gates | `npm test`; `npm run typecheck`; `npx eslint . --max-warnings 0` | exit 0 (167 files, 3255 tests); exit 0; exit 0 |

## Task 31: marks (W-69's files)

Start check, after `git fetch origin` and a merge of `origin/feat/styling-22`: `git grep -c "export function Mark" origin/feat/styling-22 --
web/src/components/shell/icons.tsx` printed `...icons.tsx:2` (`Mark` and `MarkedLabel`), exit 0; `git grep -c "export const MARK_CHAR" ...` printed
`...icons.tsx:1`, exit 0. W-68's `icons.tsx` commit was in.

The 18 characters in 8 files are drawn by `Mark`; each keeps its character as clipped text inside the wrapper it had, so a caret
inside an `aria-hidden` wrapper stays hidden and every accessible name and text content is what it was. A right arrow after a link's
words is the caret right with `char={MARK_CHAR.arrowRight}`, so the character stands in `icons.tsx` alone.

| File | Characters | Now |
|---|---|---|
| `NeedsAttention.tsx` | fold caret, "Open inbox →" | `Mark` caretDown/caretRight in its `aria-hidden` span; `Mark` caretRight with `MARK_CHAR.arrowRight` |
| `Today.tsx` | Undated fold caret, "Open planner →" | the same; the button is still named from `Undated` |
| `PlannerBoard.tsx` | Assignments band chevron | `Mark` in its `aria-hidden` span |
| `PlannerWeek.tsx` | the two ghost pager marks | `Mark` caretLeft/caretRight in `.pageGhost` (inside an `aria-hidden` pager) |
| `PlannerWeekHeader.tsx` | the week pager | `Mark` caretLeft/caretRight (the links keep their `aria-label`) |
| `PlannerItemPopover.tsx` | close, "See full details →", "Blackboard ↗" | `Mark` close (the button keeps `aria-label="Close"`), caretRight, arrowUpRight |
| `UpcomingTracker.tsx` | the tracker pager | `Mark` caretLeft/caretRight (the buttons keep their `aria-label`) |
| `Inbox.tsx` | `InboxLink`'s default label | the label is built from `MARK_CHAR.arrowRight` and drawn through `MarkedLabel` |
| `InboxCard.tsx` | `sourceLinkLabel(item)` (a string from `inbox-row.ts`) | drawn through `MarkedLabel`; the string is unchanged |

| Command | Before (HEAD of this task) | After |
|---|---|---|
| Mark characters (whole tree) | `41 20` | `23 12` (the 23 in 12 files left are W-68's 5 in 3 and W-70's 18 in 9) |
| Mark characters, W-69's eight files | 18 in 8 | 0 in 0 |
| `grep -c "<MarkedLabel" web/src/components/inbox/InboxCard.tsx`; `... "web/src/app/(app)/inbox/Inbox.tsx"` | 0; 0 | 1; 1 |
| `npx vitest run test/TodayLayout.test.tsx test/Inbox.test.tsx test/PlannerItemPopover.test.tsx` | | exit 0, 3 files, 137 passed, unedited |
| `npm test`; `npm run typecheck`; `npx eslint . --max-warnings 0`; `npx vitest run test/token-audit.test.ts` | | exit 0 (170 files, 3318 tests); exit 0; exit 0; exit 0 |

## The harness run after the sweep and tasks 28 to 38

`node scripts/walk-box.mjs web/e2e/phone-width.spec.ts -- -g "route / |route /planner |route /inbox |route /announcements "` at commit
`d29cf61` (clean tree), run `20261009T012205Z`: exit 1, `tests failed`, 8 failed, 0 passed. **Not a layout failure.** Every case failed
at the same line before it measured anything: the spec's font wait (`phone-width.spec.ts:182`) timed out after 30 s with
`a face of Source Sans 3 with status "loaded"` (expected true, received false). The page measures no width, so no `page scrollWidth`
line was printed.

The face comes from the one Google Fonts `@import` that task 8 wrote into `globals.css` (W-67's file). The box could not load it, so
the cause is either the box's network (W-75's `scripts/walk-box.mjs`, `docker/walk/entry.sh`) or the `@import` URL; it is not an
element of a W-69 file. I did not edit either, and I ran the harness once, as the rules say. What this leaves unproven: that the four
routes still fit at 390px after the sweep (the last proof is run `20261008T235442Z`, before the sweep). The sweep moved no box, and
the unit proofs in this file pass (`planner-phone-width.css.test.ts`, the token audit at 0).
