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
  `/` 390 / 390, `/planner` 390 / 390, `/inbox` 390 / 390, `/announcements` 390 / 390 (dark / light). The
  `/planner` case also asserts the board's `scrollWidth` above its `clientWidth` (read from
  `[data-planner-board="true"]`), and it passed.
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
