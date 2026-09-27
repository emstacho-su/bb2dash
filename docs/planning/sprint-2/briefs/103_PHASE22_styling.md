# Phase 22 — Styling: tokens, light and dark, the phone-width nav, Stack's direction

Date 2026-09-24 · PM: the Fable session · Product manager: Stack
Requirements: R-53, R-46; S2-styling-1
PM-added steps: P-15, P-16, P-17, P-76, P-77, P-78, P-79
Branch `feat/styling-22` · Worktree `bb2dash-wt-22` · Migration range: **none** (no number reserved, 94 §1)
One PR per phase. **One exception, provisional:** tasks 1–2 (P-15, P-16, test files only) ride Phase 17's PR, as
its last commits after its workers merge, under B-6's default ("the token audit lands early as a test-only
ratchet"). No DECISIONS row covers this yet; the
row is written on the day Stack answers B-6 (93 §6). If Phase 17 merges without them, they are the first commits
on this branch and the exception disappears.
Status: **PROVISIONAL until Stack answers 93 §5** (B-6, B-23, B-24) and approves `94_SPRINT2_PHASES.md`.

B-numbers are the item numbers of `93_SPRINT2_RESEARCH_SYNTHESIS.md` §5. This brief is Phase 13 (R-21) re-listed by
Stack as S2-styling-1: it **supersedes the Contract of `../parked/81_PHASE13_styling.md`**; 81 stays the record of
Stack's 2026-09-14 DoD and the 2026-09-16 carry-ins C-1..C-3. Runs **last** (94 §2 rule 5), after Phases 16, 17,
18, 19, 14 and 21 have merged, so every sprint-2 screen, the Workspace page included, exists before it starts.

**Answered by delegation 2026-09-27.** Stack delegated the 93 §5 answers and the plan approval to the PM; the DECISIONS rows of 2026-09-27 hold them. Of this brief's B-numbers (B-6, B-23, B-24), every one resolved to its default. The phase's PM strikes PROVISIONAL where a row says default and rewrites the B-table row where it says changed, at the session's start (ORCHESTRATOR §6).

## Why

R-53 is R-21's definition of done, fixed on 2026-09-14 and never started: every screen on signed-off tokens, in
light and dark, each approved by Stack. Sprint 1 skipped Phase 13 on 2026-09-22 ("skipped, not cancelled") and
Stack re-listed it on 2026-09-23 as S2-styling-1 under "cleaning", which places it after the builds and inside
this sprint. Today (`main` a5042fa) `web/src/app/globals.css` holds one dark `:root` block with
`color-scheme: dark` hard-coded (line 164); there is no light theme, no `data-theme`, no toggle and no stored
choice. Colour escapes the token file in a handful of places (`layout.tsx:12` themeColor `'#161826'`, the
`CourseSidebar.module.css:161` rgba scrim, `color-mix()` tints in 9 modules plus `tokens.module.css`), and
`desktop/src/main/window.ts:233` paints `'#12131a'` where the app paints `#161826`. Sizes are the real work:
91 §1 counts 441 px declarations in 31 of 36 non-token modules (175 of them 1px/2px, 53 font sizes) and 26
`style=` sites in 14 TSX files. Nothing checks any of it. Two text pairs already miss WCAG AA on today's dark
block (PM measurement from `globals.css`, 2026-09-24): `--color-neutral-600` on the card at 3.52:1 (18 text
declarations in 12 modules) and `--color-danger` on `--color-danger-bg` over the card at 3.94:1 (every error
notice).

R-46 is C-1, carried since the Phase 10b walk (DECISIONS 2026-09-16): at 390 px the document was 636 px wide on
`/course/IST.466/grades`. The top bar never folds (at ≤720 px it only tightens padding and hides Search, the only
visible entry to it), `GradebookTable`'s `.wrap` has no scroll container, and `PlannerWeek`'s `.board` carries
`min-width: 760px` on the same element as its `overflow-x`, so `/planner` scrolls the page too. The Bell and
Activity panels are 360 px wide, anchored 36 px from the right, and would hang off the left edge once the bar fits.
C-1 needs the nav redesign, so it stays here; under B-23's default (PROVISIONAL) C-2 (R-36) and C-3 (R-50) ship
earlier in Phases 16 and 17.

Why now and in this shape (94 §1, the phase map's "why"): last, after every sprint-2 screen exists; three style
tiles, Stack's pick, the tokens applied on every screen in both themes, the top-nav fold at the existing 720 px
step, walked per screen. The token audit itself changes nothing on screen, so it lands early as a test-only
ratchet (P-15, P-16): tasks 1–2 land as the last commits of Phase 17's PR, after its workers merge, so the ratchet
binds every phase that merges after it (16 and 18 when they merge later, since 94 §2 rule 2 runs them beside 17;
then 19, 14 and 21) and keeps those phases from adding hard-codes the sweep would then have to undo
(PROVISIONAL: B-6 for the tiles and the audit's timing, B-24 for the 720 px fold).

## Stack's calls this brief rests on

All three are **PROVISIONAL**: the defaults of 93 §5, taken under DECISIONS 2026-09-23 until Stack answers, and
under DECISIONS 2026-09-24 no product call here is adopted before its own row ("a brief may not cite a default as
decided before then"). Every Contract clause below that rests on one of them carries its B-number in brackets.
Worker ids W-67..W-70 follow brief 102's W-63..W-66 (W-66 is Phase 21's web worker, so this phase starts at W-67).

| B | Question (93 §5) | Default taken | Tasks that change if he answers otherwise |
|---|---|---|---|
| B-6 | S2-styling-1: must or should, placement, how directions are shown, the toggle, when the audit lands, C-1 | **Should**, last in the sprint; three style-tile directions as live Artifact pages; a three-state Auto / Light / Dark control in the top-nav account menu, named as an exception to "no behaviour change"; the token audit lands early as a test-only ratchet; C-1 stays with styling | "Must": order only, no task changes. No toggle (follow the OS only): task 10 drops, task 9 keeps the boot script without storage, P-77 closes by a DECISIONS row. Toggle elsewhere: task 10's mount line moves to that file's owner. Audit waits: tasks 1–2 open this branch and the header exception goes. Directions shown another way: task 6 changes; an in-app page would be a new screen and needs a row against 81:79-80. C-1 leaves: tasks 5, 12–15 and 21 move to Phase 17 with P-79. |
| B-23 | Phase 13 carry-ins (Q14): which of C-1..C-3 ship early | C-2's rule line (R-36) ships in Phase 16 and C-3's favicon (R-50, with P-80's `apple-icon.png`) in Phase 17, using the eclipse-ring icon; **C-1 stays here** | "All three wait": two tasks join this phase: new `web/src/app/favicon.ico` + `web/src/app/apple-icon.png` in the picked direction (W-67; check `curl -s -o /dev/null -w "%{http_code} %{content_type}" <preview>/favicon.ico` → `200 image/x-icon`) and R-36's rule sentence in `web/src/lib/grade-model/labels.ts` + `web/src/components/grades/GradedSoFarFigure.tsx` (W-70, with its RTL test; `labels.ts` joins W-70's set). The inventory is unchanged. |
| B-24 | Phone-width nav (Q15) | Fold the page links (five today, six once Phase 21 adds Workspace) and Search into one Menu at the **existing 720 px step** (replacing today's "tighten and hide Search" step), reachable by keyboard | "Wrap to two rows": task 12 becomes a two-row bar at ≤720 px with Search as an icon button; P-79's menu cases become "each link and Search visible and focusable with no menu"; the nav-menu open-state case leaves `phone-width.spec.ts` (52 cases → 50). A different breakpoint: task 2's frozen breakpoint set changes and a DECISIONS row records it. |

**B-42** (93 §5 item 42, the test runner's database credential and migration 100's `db_test_runner` role;
PROVISIONAL) is not a call this brief rests on. No check here runs `scripts/db-test.mjs`, reads
`BB2DASH_TEST_DB_URL` or needs that role: the phase has no migration and no `db/tests` file, and its only
database contact, the no-writes SQL of tasks 21 and 22, is a read-only select through `execute_sql`. Whatever
Stack answers, no task, count or gate in this brief changes.

## Contract (PROVISIONAL until B-6, B-23 and B-24 are answered; frozen when Stack approves the phase plan)

### Routes and screens

**No new route.** Two new controls, both named exceptions to 81:50's "no layout, copy, or behaviour change":
(1) the **Menu** button and its panel at ≤720 px (C-1, B-24); (2) the **theme control** inside the account menu
(B-6). Everything else in this phase is a token swap: a literal replaced by a token keeps its value, and only
the picked direction's colours, font family and weights, radii and shadows change what Stack sees.

Screen inventory (the walk's 29 surfaces; each is shot and ticked in light and in dark, 58 lines). "Sweep" is the
worker whose files render it.

| NN | Surface | How the walk reaches it | Sweep |
|---|---|---|---|
| 01 | Home (tracker, today panel, course cards, Undated, needs attention) | `/` | W-69 |
| 02 | Planner week | `/planner` | W-69 |
| 03 | Inbox | `/inbox` | W-69 |
| 04 | Announcements | `/announcements`, with the same `mark_announcements_seen` RPC POST as row 23 intercepted | W-69 |
| 05 | Grades, all courses | `/grades` | W-70 |
| 06 | Materials | `/materials` | W-70 |
| 07 | Course Stream | `/course/IST.471/stream` | W-70 |
| 08 | Course Classwork | `/course/IST.471/classwork` | W-70 |
| 09 | Course Grades | `/course/IST.466/grades` (the C-1 page) | W-70 |
| 10 | Course Info | `/course/IST.466/info` | W-70 |
| 11 | Assignment page | `/course/IST.471/assignment/IST.471/a1-proposal` | W-70 |
| 12 | Workspace | `/workspace` (new in Phase 21, not on `main` today: `web/src/app/(app)/workspace/page.tsx`, `web/src/app/(app)/workspace/Workspace.tsx`, `web/src/app/(app)/workspace/Workspace.module.css` and `web/src/components/workspace/`, as brief 102 §Files lists them) | W-70 |
| 13 | Login | `/login`, signed out | W-67 |
| 14 | Privacy | `/privacy` | W-67 |
| 15 | Terms | `/terms` | W-67 |
| 16 | Not found | `/no-such-page` | W-67 |
| 17 | Assignment popout | `/course/IST.471/classwork?item=assignment:IST.471/a1-proposal` | W-68 |
| 18 | Session popout | `/planner`, click the first class block of the week | W-68 |
| 19 | Planner item popover | `/planner`, click the first due item | W-69 |
| 20 | Planner event form | `/planner`, click an empty slot; closed without saving | W-69 |
| 21 | Series scope dialog | `/planner` over an intercepted fixture week holding one series row; cancelled before any write | W-69 |
| 22 | Command palette | ⌘K, query `syllabus` | W-68 |
| 23 | Bell dropdown | bell icon; the `mark_announcements_seen` RPC POST (`**/rest/v1/rpc/mark_announcements_seen`) is intercepted | W-68 |
| 24 | Activity dropdown | activity icon | W-68 |
| 25 | Account menu with the theme control | account icon | W-68 (menu), W-67 (control) |
| 26 | Courses sidebar | rail at 1280 px; drawer and scrim at 800 px | W-68 |
| 27 | Nav menu (new) | 390 px, Menu open | W-68 |
| 28 | Sync toast | Sync pressed with the `agent_requests` POST and poll intercepted | W-68 |
| 29 | Error notice | `/grades` with its read forced to fail (P-7's forced failed read) | W-70 (`GradesScreen.module.css` `.state`; `QueryState.tsx` renders it) |

**The fold (R-46; PROVISIONAL, B-24).** At `max-width: 720px` the bar hides `.links` and `.cmdk` and shows a text button
"Menu" (never the ☰ glyph, which stays the course-sidebar toggle) with `aria-expanded` and
`aria-controls="primary-nav-menu"`. The panel `#primary-nav-menu` lists every `NAV_LINKS` entry in order (six: Home,
Planner, Inbox, Grades, Materials and the Workspace entry brief 102 adds after Materials), the active
one with `aria-current="page"`, then a "Search" button that dispatches `bb2dash:command-palette` (the event
`TopNav.tsx` already sends). Escape closes it and returns focus to Menu; an outside click or a pathname change
closes it; Menu and the account menu close each other; ☰ closes Menu; Menu never writes `html[data-sidebar]` or
`localStorage['bb2dash.sidebar']`. At ≤720 px the brand word, wrapped in a `.brandWord` span, gets `.sr-only`'s
declarations (`globals.css:219-230`, which has no media query and is W-67's file, so it is copied, not edited)
inside `TopNav.module.css`'s `(max-width: 720px)` block (the mark stays and the link's accessible name stays
"bb2dash"; PROVISIONAL, open item 2):
at 390 px the bar row is 362 px and brand, Menu, Sync, the four icons and gaps come to about 375 px (PM estimate from the rules in `TopNav.module.css` and `SyncButton.module.css`, not measured).
Above 720 px the bar renders as today. The hook is `usePopover` as Phase 17's R-51 leaves it; this phase does not
reshape it again.

**Panels and wide content at ≤720 px.** Seven open states, frozen here and counted by task 13, each lie inside the
viewport at 390 px (bounding rect `left ≥ 0`, `right ≤ innerWidth`): (1) Bell `.panel` (`Bell.module.css`),
(2) `.ddActivity` and (3) `.ddUser` with the theme control (`TopNav.module.css`), (4) the nav panel
`#primary-nav-menu`, (5) SyncButton `.toast` and (6) `.toastError` (`SyncButton.module.css`), (7) the
CommandPalette `.panel` (`CommandPalette.module.css`) opened from the Menu's Search.
Task 13 runs before Stack's pick, so its case (3) measures `.ddUser` as W-68's branch renders it then, without the
theme control (W-68 mounts `ThemeMenu` at task 10, which follows task 8); the same case with the control inside
the menu is proven at task 21, on the phase preview.
`phone-width.spec.ts` intercepts `**/rest/v1/rpc/mark_announcements_seen` and the `agent_requests` POST and poll in
every case, as `theme-walk.spec.ts` does for rows 04, 23 and 28.
`GradebookTable`: one horizontal scroll container around both tables (on `.wrap` or an inner element), nothing on
`th` / `td`. `PlannerWeek`: `.board` keeps `overflow-x: auto` (`planner-css.test.ts:49` unchanged) and loses its
own `min-width`; the 760 px floor at ≤900 px moves onto its grid tracks or an inner element, so the board scrolls
and the page does not.

**Theme mechanism (P-76, P-77, P-78; the control and its place are PROVISIONAL, B-6).** `THEME_BOOT_SCRIPT`,
`THEME_BG`, `THEME_COLOR`, `THEME_STORAGE_KEY` and `resolveTheme` are new exports of the new module below.

* `html[data-theme]` always holds a resolved value, `light` or `dark`. It is stamped by `THEME_BOOT_SCRIPT` from
  `web/src/lib/theme-preference.ts` (new), inlined as the first child of `<body>` in the **root** layout
  `web/src/app/layout.tsx` (not `(app)/layout.tsx`, or `/login`, `/privacy`, `/terms` and not-found are missed).
  Same shape as `SIDEBAR_BOOT_SCRIPT`: built from compile-time constants, no interpolated input, React never
  renders the attribute.
* Storage: `localStorage['bb2dash.theme']` ∈ {`light`, `dark`}; absent means Auto. Written only on an explicit
  Light or Dark pick; picking Auto removes the key. A throwing or junk read means Auto (the deliberate best-effort
  of `sidebar-preference.ts`).
* Auto resolves `matchMedia('(prefers-color-scheme: light)')`: light when it matches, else dark. While in Auto, a
  `change` on that query re-stamps the attribute without a reload.
* CSS: exactly two theme blocks in `globals.css`, `:root` (dark; also what a page without JavaScript shows,
  PROVISIONAL, open item 5) and
  `:root[data-theme='light']`, with `color-scheme: dark` in the first and `color-scheme: light` in the second. No
  `@media (prefers-color-scheme)` copy of the light block: the boot script resolves Auto before paint, and one
  light block is what the audit and the contrast reader read.
* `ThemeMenu` (new, `web/src/components/shell/ThemeMenu.tsx`): three `menuitemradio` rows Auto / Light / Dark with
  `aria-checked`, rendered inside the account menu. It reads storage only when the menu opens, after hydration,
  so it needs no `useHydrated` placeholder.
* `<meta name="theme-color">`: `viewport.themeColor` in the root layout becomes the two-entry media array
  `THEME_COLOR` exported by `theme-preference.ts`; an explicit pick sets every `theme-color` meta's content to
  `THEME_BG[resolved]`.
* Desktop: `windowBackground(nativeTheme.shouldUseDarkColors)` from `desktop/src/main/window-background.ts` (new)
  replaces the `'#12131a'` literal (`window.ts:233`); it returns the dark or light `--color-bg` value (new
  exports `DARK`, `LIGHT`), pinned by test to `globals.css`. `nativeTheme` is Electron's existing API; before the
  page paints the window follows Windows (PROVISIONAL, open item 4).

**Token set rules (R-53).** Every custom property `main` declares keeps its name. New names are allowed in the
families `--color-*`, `--shadow-*`, `--text-*`, `--size-*` and `--radius-*`, declared in `:root`, and every
`--color-*` / `--shadow-*` is redeclared in the light block (the light block's set of those names equals the dark
block's). The ramps are redefined in light so a step keeps its distance from the ground (`--color-neutral-100` is
the strong end on either ground). The direction may change (PROVISIONAL, open item 1) colour, font family and
weights (through the existing Google Fonts `@import` at `globals.css:18`; no npm font package, no `next/font`),
radii and shadows. It does **not** change these
values, which hold layout: `--space-1..12`, `--nav-height`, `--content-max`, `--sidebar-width`, `--sidebar-side`,
the `--text-*` sizes, and the planner geometry mirrored by `web/src/lib/planner-rows.ts`.

**Token audit (P-15, P-16).** A hand-rolled vitest scan (D-19 rules out stylelint, postcss and css-tree; none is a
direct dependency of `web/`, and postcss and css-tree, present in `web/package-lock.json` only transitively
(postcss through `next` and `vite`, css-tree through `jsdom`), are not imported). Scope: every file under `web/src`
ending `.css`, `.module.css`, `.ts` or `.tsx`, except `web/src/app/globals.css`. `tokens.module.css` **is
audited**: the PM's record of Stack's answer (70 §1.8, "recorded verbatim in intent"; 81:17-19) says "outside
`globals.css`"; 81:44-45 adds `tokens.module.css` as a second exemption that the answer does not contain, so it is
dropped. Per file it counts:

1. colour literals in declaration values: `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`,
   `lch()`, `oklab()`, `oklch()` and CSS named colours such as `white` (the keywords `transparent`,
   `currentColor`, `inherit`, `initial`, `unset` and `revert` are not counted); in `.ts` / `.tsx`, a string
   literal that is a colour (on `main` exactly one: `layout.tsx:12`'s `'#161826'`);
2. every `color-mix(` outside `globals.css` (a tint is a colour the token set does not name);
3. size literals, `<number>px` or `<number>rem`, in a declaration value (custom-property declarations in a
   module included, e.g. `--planner-gutter: 62px`), unless allowlisted;
4. TSX `style=` keys that are not custom properties. Custom-property keys count 0, in both spellings `main` uses:
   `'--x'` and the computed `['--x' as string]` (`PlannerBoard.tsx:95`, `:250`). A `style={name}` whose `name` is
   a `const` object literal in the same file (`PlannerBoard.tsx:358` `style`, `:367` `body`) is scanned as that
   literal; any other `style={expression}` counts 1;
5. unresolved references: a `var(--x)` whose name is declared nowhere (`globals.css`, the same module, or a TSX
   style key). This is 81's "undefined custom property" pass; it is **0 on `main` today** (PM scan, 1,461
   references; re-run by the critic 2026-09-24, same result) and must stay 0.

Allowlist, frozen at task 2 in `web/test/token-audit.allowlist.ts` (new) and not edited after:
**A1** `@media` width conditions use a value from {620px, 640px, 720px, 820px, 900px, 1023.98px} (today's 14 width
queries; custom properties cannot sit in a media condition without a PostCSS dependency); any other value fails.
**A2** the values `1px` and `2px`, with or without a leading minus (21 signed ones in modules on `main`, and
`.sr-only`'s `margin: -1px` that task 12 copies), in any property (hairlines, outlines, nudges). **A3** declarations a test pins
literally or a TS constant mirrors, one entry each as (file, selector, property, value, reason), with the test
asserting the value still equals its constant: e.g. `PlannerWeek.module.css` `.block` `line-height: 14px`
(`planner-css.test.ts:111`, `PLANNER_BLOCK_LINE_PX` = 14), `.board` `--planner-slot: 24px`
(`PLANNER_BASE_SLOT_PX` = 24), `.block` `padding: 3px 5px` (top + bottom = `PLANNER_BLOCK_PADDING_PX` = 6; all
three constants in `web/src/lib/planner-rows.ts`). **A4** the hexes of `THEME_BG` / `THEME_COLOR` in
`web/src/lib/theme-preference.ts`, pinned equal to the two `--color-bg` values. Comments are never counted.

The ratchet: per-file counts live in `web/test/token-audit.baseline/` (new), one JSON per cluster (`foundation`,
`shell`, `screens-a`, `screens-b`), and a cluster map of path prefixes in `web/test/token-audit.test.ts`. The
prefixes follow the owner sets under §Files (`foundation` = W-67's paths, `shell` = W-68's, `screens-a` = W-69's,
`screens-b` = W-70's). The test fails when a file's count is above its baseline, when it is below it (a stale
baseline is lowered in the same commit), when a file with a non-zero count belongs to no cluster, or when
unresolved references are above 0. It runs in `npm test` (`vitest run`, whose `include` is
`test/**/*.test.{ts,tsx}`). bb2dash has no CI workflow (no `.github/` on `main`) and v3 D-20 declines "a registry
or CI" (Phase 14's P-50 narrows that to image registry and image-build CI, which adds none here), so `npm test` is
where it fails; that settles 81:34 ("fails the build") and 81:58 ("runs in CI").

**Contrast (P-17).** `web/test/css-tokens.ts` (new) reads `globals.css` into one map per selector; the light map
is the dark map overlaid by the light block. It follows `var()` chains and resolves one level of
`color-mix(in srgb, A p%, B)` where B is a colour or `transparent`, composited over the ground a pair names.
`type-tokens.contrast.test.ts` keeps its assertions (≥ 4.5 chip text, ≥ 3 segment on the card, dE ≥ 30, chroma
spread) and runs them per block, the light ground being the light block's `--color-surface` instead of the
`'#ffffff'` stand-in. `theme-contrast.test.ts` (new) holds the frozen pair list, measured in both blocks:

* Text, ≥ 4.5:1: `--color-text` on `--color-bg` and on `--color-surface`; `--color-muted` on both;
  `--color-accent` on both; `--color-danger` on `--color-surface`; `--color-danger` on `--color-danger-bg` over
  `--color-surface` (3.94 today); `--color-neutral-300`, `-400`, `-500` and `-600` on `--color-surface` (`-600`
  is 3.52 today); `--color-accent-100` on `--color-accent-800` (the badge); each `--planner-<kind>-fg` on its
  `--planner-<kind>-bg` over `--color-surface` (six kinds); each `--type-<cat>-fg` on its `--type-<cat>-bg`.
* Non-text, ≥ 3:1: each `--type-<cat>-bg` on `--color-surface`; `--color-accent` on `--color-bg` (focus ring,
  active-link underline).

### RPC signatures

None. This phase creates, alters and calls no RPC, view, table, policy or edge function. Its only database contact
is read-only: task 21's SQL assertion that the walks wrote nothing.

### Tables and migrations

| Number | File | Creates |
|---|---|---|
| none | — | Nothing. No number is reserved (94 §1). A task that finds it needs a migration stops; the PM takes the next free block of ten under 94 §2 rule 6 and records it in DECISIONS before anything is applied. |

### Files

New (full paths): `web/src/lib/theme-preference.ts`; `web/src/components/shell/ThemeMenu.tsx`;
`web/src/components/shell/ThemeMenu.module.css`; `web/src/app/NotFound.module.css` (replaces the three `style=`
sites in `not-found.tsx`); `web/test/token-audit.scan.ts`; `web/test/token-audit.test.ts`;
`web/test/token-audit.allowlist.ts`; `web/test/token-audit.baseline/foundation.json`,
`web/test/token-audit.baseline/shell.json`, `web/test/token-audit.baseline/screens-a.json`,
`web/test/token-audit.baseline/screens-b.json`; `web/test/css-tokens.ts`; `web/test/theme-tokens.test.ts`;
`web/test/theme-contrast.test.ts`; `web/test/theme-preference.test.ts`; `web/test/ThemeMenu.test.tsx`;
`web/test/TopNav.fold.test.tsx`; `web/test/planner-phone-width.css.test.ts`;
`web/test/gradebook-phone-width.css.test.ts`; `web/e2e/phone-width.spec.ts` and `web/e2e/theme-walk.spec.ts`
(inside Phase 17's P-7 walk harness, `web/e2e/`, which brief 97 §Files (its `web/e2e/playwright.config.ts`
entry) and brief 97 §Seams (its "Phase 22 (last)" bullet) name as the folder this brief assumes; both run with
`-c e2e/playwright.config.ts`, the config that same brief 97 §Files entry names, and both write their screenshots by explicit path into
`docs/planning/sprint-2/walks/walk-22/`, because that config writes to `walk-17/` and is **not edited** here; the
specs write screenshots only when `WALK_SHOTS=1`, which the PM sets at tasks 21–22, so a worker's harness run
writes none and workers never commit under `docs/planning/sprint-2/walks/`); `desktop/src/main/window-background.ts`; `desktop/test/unit/window-background.test.ts`;
`docs/planning/sprint-2/evidence/103_style_tiles/tile-a.html`,
`docs/planning/sprint-2/evidence/103_style_tiles/tile-b.html`,
`docs/planning/sprint-2/evidence/103_style_tiles/tile-c.html` (the `evidence/` folder is new);
`docs/planning/sprint-2/walks/walk-22/WALK.md` and its PNGs `docs/planning/sprint-2/walks/walk-22/NN-<surface>-<theme>.png`
and `3N-phone-*.png` (named in tasks 21–22); `docs/planning/sprint-2/verification/103_W67_VERIFICATION.md`,
`docs/planning/sprint-2/verification/103_W68_VERIFICATION.md`,
`docs/planning/sprint-2/verification/103_W69_VERIFICATION.md`,
`docs/planning/sprint-2/verification/103_W70_VERIFICATION.md` (each its own worker's; the `verification/` folder
is new); `docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md`.

Changed, by owner (the four sets are **disjoint**; a file not listed is not touched):

* **W-67 foundation:** `web/src/app/globals.css`, `web/src/app/layout.tsx`, `web/src/styles/tokens.module.css`,
  `web/src/app/login/Login.module.css`, `web/src/app/login/LoginForm.tsx`, `web/src/app/login/page.tsx`,
  `web/src/app/privacy/page.tsx`, `web/src/app/terms/page.tsx`, `web/src/app/not-found.tsx`,
  `web/test/type-tokens.contrast.test.ts`, `web/vitest.config.mts` (coverage entries for the two new modules, only
  if R-51 left `coverage.include` an explicit list), `desktop/src/main/window.ts`, `desktop/test/unit/window.test.ts` (its electron mock gains
  `nativeTheme: { shouldUseDarkColors: true }` and nothing else); plus every new file above except
  those listed under W-68..W-70 and the PM (so: `theme-preference.ts`, `ThemeMenu.*`, `NotFound.module.css`, the
  three `token-audit.*` modules and `token-audit.baseline/foundation.json`, `css-tokens.ts`, the four theme tests, `web/e2e/theme-walk.spec.ts`,
  `window-background.ts` and its test, `103_W67_VERIFICATION.md`).
* **W-68 shell and phone width:** every file in `web/src/components/shell/` except `ThemeMenu.*` (`TopNav.tsx`,
  `TopNav.module.css`, `Bell.tsx`, `Bell.module.css`, `ActivityMenu.tsx`, `SyncButton.tsx`, `SyncButton.module.css`,
  `CourseSidebar.tsx`, `CourseSidebar.module.css`, `CommandPalette.tsx`, `CommandPalette.module.css`,
  `SidebarProvider.tsx`, `usePopover.ts`, `icons.tsx`, `ScreenStub.tsx`); `web/src/app/(app)/Shell.module.css`;
  `web/src/app/(app)/layout.tsx`; everything in `web/src/components/popout/`;
  `web/src/components/shared/QueryState.tsx`; new `web/test/TopNav.fold.test.tsx`, `web/e2e/phone-width.spec.ts`;
  `web/test/token-audit.baseline/shell.json` from task 1 on.
* **W-69 screens A:** `web/src/app/(app)/page.tsx`, `Today.tsx`, `Today.module.css`, `NeedsAttention.tsx`,
  `NeedsAttention.module.css`, `CourseGradeFigure.tsx`; `web/src/app/(app)/planner/`, `inbox/`, `announcements/`;
  `web/src/components/planner/`, `tracker/`, `inbox/`, `announcements/`; new
  `web/test/planner-phone-width.css.test.ts`; `web/test/token-audit.baseline/screens-a.json`.
* **W-70 screens B:** `web/src/app/(app)/course/`, `grades/`, `materials/`, `workspace/`;
  `web/src/components/grades/`, `materials/`, `workspace/` (Phase 21's `ConversationList`, `MessageList`,
  `Composer`, `TierBadge`, `ServiceStatus` and their modules, token sweep only); new
  `web/test/gradebook-phone-width.css.test.ts`; `web/test/token-audit.baseline/screens-b.json`.
* **PM:** the tiles, `walks/walk-22/`, `103_PHASE22_REVIEW.md`, `project-state/STATUS.md`, `DECISIONS.md`,
  `ORCHESTRATOR.md`, this brief. Workers never touch `project-state/`. Nobody edits `web/e2e/playwright.config.ts`,
  `web/e2e/login.mjs`, `web/package.json`, `web/package-lock.json`, `desktop/package.json` or any `db/` file.

Two crossings, resolved by order, not by shared edits: W-68 adds the one `<ThemeMenu />` line to `TopNav.tsx`
after W-67's `ThemeMenu` commit is on the phase branch; W-67 creates all four baseline JSONs at task 1 and each
passes to its owner from then on. No pre-existing test file is edited except `type-tokens.contrast.test.ts` and the electron mock line of
`desktop/test/unit/window.test.ts`.

### Seams

* **Phase 17 (brief 97):** tasks 1–2 ride its PR (B-6); its P-7 harness hosts both e2e specs and supplies the
  logged-in session (`web/e2e/login.mjs` → `web/e2e/.auth/state.json`, gitignored; Phase 17 deletes it at its end,
  so this phase re-runs `login.mjs` once per host it walks, each worker preview before that worker's first harness
  run and the phase preview once before task 21, as the task-list preamble says, and deletes the file again at
  task 24), the preview base URL (`WALK_BASE_URL`) and the forced failed read; its R-51 reshape of `usePopover` is reused as
  is; its R-50 favicon and P-80 `apple-icon.png` and Phase 16's R-36 rule line are already shipped (B-23,
  PROVISIONAL; if Stack says all three wait, the B-23 row above adds them here); its
  S2-home-2 and S2-materials-1 changes are in the screens this phase sweeps. Tasks 1–2 land as the last commits of
  Phase 17's PR, after its workers merge, so brief 97's workers never meet the ratchet (brief 97 §Seams, "Phase 22
  (last)" bullet: "They touch no file listed in §Files"). From task 1 on, any literal a later phase adds fails
  `npm test` unless it becomes a token or the baseline is raised in the open. The worker sets that edit `web/src`
  in the phases that can merge after it are brief 96 W-43 and brief 98 W-51 (when Phases 16 and 18 merge after
  17), brief 99 W-54 and brief 102 W-66 (no worker set in brief 100 or brief 101 lists a `web/src` path; brief
  100 W-58's is the separate `bb2dash-stack` repo). Those four sets do not hold `web/test/token-audit.baseline/`,
  so the baseline is the PM's to update when their PRs merge: where a phase's change moves a file's count (up or down,
  since a count below its baseline also fails), the PM changes that cluster's baseline JSON in the phase's
  integration commit, before its PR merges. The allowlist stays frozen (P-16); only the baseline moves.
* **Phase 21 (brief 102):** the Workspace page is inventory row 12 and W-70's sweep. Brief 102 builds it on
  "existing tokens only, both themes readable, no new colours", adds one `NAV_LINKS` entry (Workspace, after
  Materials) and changes nothing else in `TopNav.tsx`. Its two folders, `web/src/app/(app)/workspace/` and
  `web/src/components/workspace/`, are in `screens-b`'s prefixes from task 1 on, so its files start at a
  baseline of 0 and any literal it adds must become a token or be raised by the PM at Phase 21's integration
  (the Phase 17 bullet above).
* **94 §3**, row "16, 17, 18, 21 → 22": every screen exists and the token audit baseline is already in `npm test`
  when this phase starts.
* **Sprint 1 objects kept as they are:** `SIDEBAR_BOOT_SCRIPT` and `sidebar-preference.ts` (the pattern the theme
  script copies; not edited), `html[data-sidebar]`, `--sidebar-side`, `SIDEBAR_BREAKPOINT` 1024 (the fold at 720 sits
  below it; ☰ keeps `aria-controls="course-sidebar"`), `GradesTables.layout.test.tsx` (cells stay cells),
  `planner-css.test.ts` and `planner-rows.ts` (geometry), `useHydrated`, `progress-status.ts` labels (copy).
* **Desktop:** the window background is the one line outside `web/` (B-6 / 91 §6 Q23 default: "the desktop window
  background is only corrected to match the tokens"). Electron keeps `minWidth: 900`, so C-1 does not reach it.
  Containers (Phase 14) never touch the renderer (v3 D-20 excludes containerizing the Electron GUI).

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
* [2026-09-24] "**Sprint 2 is planned on stated defaults, all provisional:** … No product call in them is adopted here: each gets its own row, dated the day Stack answers, and a brief may not cite a default as decided before then"

Frozen brief lines this phase inherits (81, 2026-09-14 and 2026-09-16; 80c, 2026-09-16), verbatim:

* 81:17-19 "Definition of done: **every screen on tokens, light + dark, Stack approves each** — no hard-coded colours or sizes outside `globals.css`; both themes render; a per-screen preview checklist he ticks."
* 81:50 "No layout, copy, or behaviour change: the screen tests from earlier phases pass unchanged."
* 81:67-69 "They are **named exceptions** to the DoD's "no layout, copy, or behaviour change" rule; each needs its own check and a line in the acceptance checklist."
* 81:73 (C-1, Expected) "no horizontal page scroll at 390 px on every route; wide tables scroll inside their own container"
* 81:79-80 "New screens, behaviour changes (except C-1 to C-3 above), Tailwind or any UI framework, new dependencies."
* 80c:47 "Phase 13's C-1..C-3 stay in 13 unless Stack moves them." (B-23's default moves C-2 and C-3 out; that is
  PROVISIONAL until his answer and its DECISIONS row.)

## MVP (in Stack's words)

Stack's own words for this phase are two: "styling", which he wrote for S2-styling-1 on 2026-09-23, filed under
"cleaning" (91 §3.3; his other four fields there still read "_to confirm_"); and the DECISIONS 2026-09-14 row
recorded as "Stack's answer" to the MVP questionnaire: "Styling direction is decided **after functionality is
achieved**; Phase 13's DoD is fixed now (every screen on tokens, light + dark, Stack approves each)". *PM wording,
not his:* the PM's record of that answer (`docs/planning/sprint-1-hub/70_MVP_INDEX.md` §1.8, line 82, under §1's
"Recorded verbatim in intent") reads: "**Every screen on tokens, light + dark, Stack approves each**: no
hard-coded colours or sizes outside `globals.css`; both themes; per-screen preview checklist." The parked brief's MVP line (81:23-24) is headed "in
Stack's words" but traces to no recorded answer, so it is treated as PM wording. *PM wording, built on the B-6
and B-24 defaults, for Stack to confirm or rewrite:* "I picked one of three style tiles. On the preview every
screen and overlay on the checklist is in that direction, in light and in dark, and I ticked each pair. The
account menu lets me choose Auto, Light or Dark and remembers what I chose; Auto follows Windows. At phone width
nothing scrolls sideways: a Menu button holds the pages and Search, and wide tables and the planner week
scroll inside their own boxes."

## Definition of done

SOP gates:

- [ ] `cd web && npm run typecheck && npm run build && npm test` → exit 0, 0 failures, test count not below
      `main`'s; `npm run lint` → exit 0 with a warning count not above `main`'s (0 once Phase 17's T-23 has put
      `--max-warnings 0` in force); `npm run test:coverage` → exit 0 (Phase 17's T-22 thresholds still hold).
- [ ] `cd desktop && npm run typecheck && npm test` → 0 failures. `mcp-server/` is not touched:
      `git diff --name-only origin/main...HEAD -- mcp-server | wc -l` → 0.
- [ ] `/code-review main high`: every CRITICAL and HIGH finding fixed or declined by Stack, recorded in
      `103_PHASE22_REVIEW.md` (task 23).
- [ ] `/security-review`: **required**, because the phase adds an inline script to the root layout of every page
      and reads a stored value into it (`localStorage['bb2dash.theme']`).
- [ ] STATUS, DECISIONS and ORCHESTRATOR updated in the PR. DECISIONS rows owed: Phase 22 carries R-21's DoD and
      C-1 (81's Contract superseded, Phase 13's number retired); the picked direction (B-6); the theme control as a
      named exception, its three states and its storage key; `tokens.module.css` audited, not exempt; the frozen
      allowlist categories A1–A4; the ratchet in `npm test` in place of CI; the fold at 720 px (B-24); tasks 1–2
      riding Phase 17 (if they did); the desktop background line outside `web/`.
- [ ] PR open from `feat/styling-22`; its Vercel preview answers 200 on `/login`; Stack walks the preview (anything
      visual goes in front of him before merge, SOP). Commits pushed per task, never batched.
- [ ] The PM stops at "ready when you say so": merge to `main` only on Stack's word in that conversation
      (DECISIONS 2026-09-09, SOP).

Steps 1, 2 and 6 rest on B-6 and step 5 on B-24 (PROVISIONAL).

Stack's acceptance script (he walks it on the preview, Chrome, laptop):

1. Open the account menu: Auto is checked. Switch Windows between light and dark mode: the app follows without a
   reload.
2. Pick Light, reload: still light. Open `/login` in a private window: it follows Windows (nothing stored there).
3. Walk `docs/planning/sprint-2/walks/walk-22/WALK.md`: open each of the 29 surfaces in light and in dark and tick
   each line you accept (58 lines), beside the PM's screenshot of the same surface.
4. DevTools device toolbar at 390 px wide: Home, `/planner` and `/course/IST.466/grades` never scroll sideways;
   the planner week and the IST.466 table scroll inside their own boxes. Tick the C-1 line.
5. At 390 px: Tab to Menu, Enter opens it, Tab reaches Home, Planner, Inbox, Grades, Materials, Workspace and
   Search in turn, Escape closes it and focus is back on Menu. ☰ still opens the courses drawer. Bell and Activity open
   fully on screen.
6. Launch the unpacked desktop build with Windows in light mode: the window opens on the light background with no
   dark frame first. Tick the toggle line.
7. Say yes on the PR, or name the surface to redo.

What proves each requirement in scope:

* **R-53:** the four baseline JSONs sum to 0, unresolved references 0, the allowlist unchanged since task 2
  (tasks 16–20); `theme-contrast.test.ts` and `type-tokens.contrast.test.ts` green in both blocks (task 8); 58
  walk screenshots (task 22); 60 ticked lines in `WALK.md` (task 25).
* **R-46:** `phone-width.spec.ts` → 52 passed, 0 failed on the preview (task 21), after it failed first on
  `/course/IST.466/grades` (task 5).
* **S2-styling-1:** three tiles committed and the "Phase 22 direction" DECISIONS row (tasks 6–7).
* **P-15:** `token-audit.test.ts` runs in `npm test` and its fixture cases pass (task 1).
* **P-16:** `git diff --numstat` of the allowlist since task 2 prints nothing (task 2).
* **P-17:** the fixture case "a light block does not move the dark ground" passes (task 3).
* **P-76:** the boot-script cases of `theme-preference.test.ts` (task 9) and 0 hydration messages in the theme
  walk (task 22).
* **P-77:** `ThemeMenu.test.tsx` (task 10).
* **P-78:** the `color-scheme` cases of `theme-tokens.test.ts` (task 8).
* **P-79:** the reachability cases of `phone-width.spec.ts` (task 21).

## Task list

Commands run from the repo root unless they start with `cd`. `:walk_start` is the UTC timestamp the spec prints
when it starts. "Harness run" means `cd web && WALK_BASE_URL=<URL> npx playwright test -c
e2e/playwright.config.ts <spec>` with a `web/e2e/.auth/state.json` that `login.mjs` saved against
the host of that same `<URL>`: the saved session is host-only (`web/src/lib/supabase/` sets no cookie `domain`),
so a harness run always uses a `state.json` saved against the URL it targets. `login.mjs` reads `WALK_BASE_URL`
and opens `${WALK_BASE_URL}/login` (brief 97 §Task list, T-01), so it is run with that variable and no other
argument. For a worker task (5, 13, 14, 15) `<URL>` is that worker
branch's own Vercel preview URL: before each worker's first harness run the PM runs
`cd web && WALK_BASE_URL=<that preview URL> node e2e/login.mjs`, signs in, and copies the resulting
`web/e2e/.auth/state.json` into that worker's worktree. For the PM's tasks 21–22 `<URL>` is the phase preview URL:
once, before task 21, the PM runs `cd web && WALK_BASE_URL=<phase preview URL> node e2e/login.mjs` in
`bb2dash-wt-22` and signs in, and tasks 21 and 22 both use that file; they are also the only runs with
`WALK_SHOTS=1` set, so they alone write screenshots. Before any harness run,
`node -e "const s=require('./web/e2e/.auth/state.json');console.log(s.cookies.some(c=>c.domain==='<host of URL>'))"`
→ `true` (on `false` the PM signs in again and the run does not start). Task 24's
`test -e web/e2e/.auth/state.json` → exit 1 is run in all five worktrees. Workers sync by merge, never by
rebasing a pushed branch: the PM merges W-68's task-5 commit into `feat/styling-22`, and W-69 and W-70 merge
`feat/styling-22` into their branches before tasks 14–15. The page-width half of tasks 14–15 also needs W-68's
fold: it runs after the PM has merged W-68's task-12 commit into `feat/styling-22` and W-69 and W-70 have merged
`feat/styling-22` into their branches again. The phone-width spec's test titles are frozen so `-g` selects them,
52 cases in all: `route <path> [<theme>]` for the path of each inventory row 01–16 (the first path in its "How the
walk reaches it" cell), in that order (16 × 2); `popout assignment [<theme>]` (1 × 2); `open state <n> <name>
[<theme>]` (the seven of §Contract, run on `/`, 7 × 2); `reachability [<theme>]` (1 × 2); `sidebar toggle` (1);
`unfolded bar at 721` (1: viewport 721 × 900, prints `nav[aria-label="Primary"]` `scrollWidth` and asserts only
that the nav is visible, so it passes whatever width it prints; task 5 reads the number). "No-writes SQL" is, run read-only through
`execute_sql` with the run's `:walk_start`:
`select (select count(*) from agent_requests where created_at >= :walk_start) + (select count(*) from planner_events where created_at >= :walk_start or updated_at >= :walk_start) + (select count(*) from planner_event_series where created_at >= :walk_start) + (select count(*) from announcements where read_at >= :walk_start) + (select count(*) from assignment_progress where updated_at >= :walk_start) + (select count(*) from attention_items where resolved_at >= :walk_start)`
(all seven columns confirmed on prod 2026-09-27 by a read-only `information_schema.columns` select). Inside the table below, `\|` is Markdown's escaped pipe: the command
is typed with a plain `|`. "Baseline sum" is
`node -e "const fs=require('fs'),d='web/test/token-audit.baseline',F=/^shell\.json$/;let s=0;for(const f of fs.readdirSync(d).filter(f=>F.test(f)))for(const n of Object.values(JSON.parse(fs.readFileSync(d+'/'+f,'utf8'))))s+=n;console.log(s)"`
with `F` set to the cluster's file name (shown here for `shell`) or to `/\.json$/` for all four.

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 1 | Token audit ratchet: `token-audit.scan.ts` (pure scanner), `token-audit.test.ts` (scans `web/src`, compares with the four baseline JSONs, cluster map, unresolved pass), baselines written from the live tree | P-15, R-53 | W-67 (rides Phase 17's PR, B-6) | `cd web && npx vitest run test/token-audit.test.ts` → 0 failures; its fixture cases count exactly `#fff` 1, `rgba(0,0,0,.5)` 1, `color-mix(in srgb, var(--a) 10%, transparent)` 1, `white` 1, `padding: 13px` 1, `style={{ padding: 0 }}` 1, `const s = { padding: 0 }` + `style={s}` 1, `style={pick()}` 1, and 0 for `var(--color-text)`, `transparent`, `currentColor`, `/* #fff */`, `style={{ '--x': v }}`, `style={{ ['--x' as string]: v }}`, `const s = { ['--x' as string]: v }` + `style={s}`; a fixture `var(--nope)` → unresolved 1; live tree unresolved → 0; `layout.tsx` counts 1 on `main` (its `'#161826'`) | "`npm test` now fails if anyone adds a hard-coded colour or size." |
| 2 | Freeze the allowlist A1–A4 in `token-audit.allowlist.ts`; `tokens.module.css` audited | P-16, R-53 | W-67 (rides with 1) | `cd web && npx vitest run test/token-audit.test.ts` → 0 failures, including "breakpoint set equals {620, 640, 720, 820, 900, 1023.98}" and "every A3 entry matches a live declaration and equals its TS constant" (0 stale); at the PR, `git diff --numstat <task-2 sha> HEAD -- web/test/token-audit.allowlist.ts \| wc -l` → 0 (sha in `103_W67_VERIFICATION.md`) | — |
| 3 | Block-aware token reader `css-tokens.ts`; `type-tokens.contrast.test.ts` runs per block | P-17 | W-67 | `cd web && npx vitest run test/type-tokens.contrast.test.ts test/theme-tokens.test.ts` → 0 failures, including: appending `:root[data-theme='light'] { --color-surface: #ffffff; }` to the fixture leaves the dark map's `--color-surface` = `#232532`; the reader composites in floating point and rounds only when it prints a hex: `color-mix(in srgb, #e9e9ed 16%, transparent)` over `#232532` prints `#434450` (0.16 × `#e9e9ed` + 0.84 × `#232532`, today's `--color-divider` on the card); contrast is computed from the unrounded composite: on a fixture holding a verbatim copy of the `:root` block of `main` a5042fa's `globals.css`, inline in `theme-tokens.test.ts` and never re-read from the live file (task 8 changes both pairs there), the reader reports `--color-neutral-600` on `--color-surface` = 3.52 and `--color-danger` on `--color-danger-bg` over `--color-surface` = 3.94 (two decimals) | — |
| 4 | Inventory confirmed: no stub screen, route count as frozen | R-53 | PM | `grep -rl "ScreenStub" web/src/app \| wc -l` → 0; `find web/src/app -name page.tsx \| wc -l` → 16 (15 on `main` a5042fa plus Phase 21's `workspace/page.tsx`) | — |
| 5 | `phone-width.spec.ts` written first and run RED on W-68's first branch preview (before tasks 12–15) | R-46, P-79 | W-68 | harness run of `e2e/phone-width.spec.ts` against W-68's first branch preview → exit ≠ 0, ≥ 1 failed, `route /course/IST.466/grades [dark]` among the failures with its `scrollWidth` (> 390) printed; in the same run the frozen case `unfolded bar at 721` (viewport 721 × 900, unfolded) passes and prints `nav[aria-label="Primary"]` `scrollWidth` (the unfolded bar's content width; above 721 means the bar overflows; open item 3 turns on this number); `grep -c "route /course/IST.466/grades" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → ≥ 1 and `grep -c "Primary.*721" docs/planning/sprint-2/verification/103_W68_VERIFICATION.md` → ≥ 1 (the pasted output) | — |
| 6 | Three style tiles as Artifact pages (fragments: top bar with Menu, buttons, graded-so-far figure, a gradebook row, the five tracker chips, one planner block per kind, an Inbox row, an error notice, a popout header), each with a live Auto / Light / Dark control and the real token names; HTML committed | S2-styling-1, R-53 | PM | `ls docs/planning/sprint-2/evidence/103_style_tiles/tile-*.html \| wc -l` → 3; `node -e "const fs=require('fs');const n=[...new Set(fs.readFileSync('web/src/app/globals.css','utf8').match(/--color-[a-z0-9-]+(?=\s*:)/g))];for(const t of 'abc'){const s=fs.readFileSync('docs/planning/sprint-2/evidence/103_style_tiles/tile-'+t+'.html','utf8');console.log(t,n.filter(x=>!s.includes(x+':')).length)}"` → `a 0`, `b 0`, `c 0`; for each tile `grep -c "prefers-color-scheme" <tile>` → ≥ 1 and `grep -c "data-theme" <tile>` → ≥ 1 (the live control); the three published Artifact URLs, one per line, in the task's commit message (`git log -1 --format=%B -- docs/planning/sprint-2/evidence/103_style_tiles \| grep -c "claude.ai"` → 3) | "I opened three tiles and flipped each between Auto, Light and Dark." |
| 7 | Stack picks a tile (gate before task 8) | S2-styling-1 | Stack + PM | `grep -cE "Phase 22 direction.*tile [abc]" project-state/DECISIONS.md` → 1 on the phase branch (the row names the tile and is dated the day Stack picks) | "I picked tile …" |
| 8 | Token set for the pick: `:root` (dark) and `:root[data-theme='light']`, `color-scheme` per block, the new names the sweep needs (at today's values), the two sub-AA pairs fixed | R-53, P-78 | W-67 | `cd web && npx vitest run test/theme-tokens.test.ts test/theme-contrast.test.ts test/type-tokens.contrast.test.ts` → 0 failures: the light block lacks 0 of `:root`'s `--color-*` / `--shadow-*` names; `color-scheme` is `dark` / `light`; the 18 layout tokens (the 11 of `--space-1..12`, `--nav-height`, `--content-max`, `--sidebar-width`, `--sidebar-side`, plus `--text-xs`, `-sm`, `-base`, `-md`, `-lg`, `-xl`, `-2xl`) equal `main`'s values; every frozen pair ≥ 4.5 (text) or ≥ 3 (non-text) in both blocks | "Home on the preview wears the picked colours." |
| 9 | `theme-preference.ts`, `THEME_BOOT_SCRIPT` in the root layout, `THEME_COLOR` for `viewport.themeColor` | P-76, P-78, R-53 | W-67 | `cd web && npx vitest run test/theme-preference.test.ts` → 0 failures: `resolveTheme` table (stored light, stored dark, none + OS light, none + OS dark, junk, storage throws); the script, run in jsdom for each case, stamps the expected `data-theme` and writes no storage; `THEME_BG.dark` / `.light` equal the blocks' `--color-bg`; `grep -c "#161826" web/src/app/layout.tsx` → 0; `grep -c "__html: THEME_BOOT_SCRIPT" web/src/app/layout.tsx` → 1 | — |
| 10 | `ThemeMenu` (Auto / Light / Dark) and its mount in the account menu | P-77, R-53 | W-67 (component), W-68 (mount) | `cd web && npx vitest run test/ThemeMenu.test.tsx` → 0 failures: three `menuitemradio`, Auto checked with no key; Light → `data-theme="light"`, key `light`, every `theme-color` meta = `THEME_BG.light`; Auto → key removed, attribute follows a mocked `matchMedia` and re-stamps on its `change`; Dark stays dark on an OS change; a throwing storage still stamps; `grep -c "<ThemeMenu" web/src/components/shell/TopNav.tsx` → 1 | "Account menu → Light, reload, still light; Auto follows Windows." |
| 11 | Desktop window background from the tokens | R-53 | W-67 | `cd desktop && npx vitest run test/unit/window-background.test.ts test/unit/window.test.ts` → 0 failures (`DARK` / `LIGHT` equal the two `--color-bg` values read from `../web/src/app/globals.css`; `windowBackground(true)` = `DARK`, `(false)` = `LIGHT`); `grep -c "12131a" desktop/src/main/window.ts` → 0 | "The desktop window opens on the app's own background." |
| 12 | Nav fold at the 720 px step, brand word hidden at ≤720 px | R-46, P-79 | W-68 | `cd web && npx vitest run test/TopNav.fold.test.tsx` → 0 failures: Menu `aria-expanded` false → true, `aria-controls="primary-nav-menu"`; the panel holds one link per `NAV_LINKS` entry (6), in order, with `aria-current` on the active one, then Search dispatching `bb2dash:command-palette`; Escape closes and focus returns to Menu; a pathname change closes it; Menu and the account menu close each other; ☰ closes Menu and keeps `aria-controls="course-sidebar"`; CSS cases: the `(max-width: 720px)` block hides `.links` and `.cmdk` and shows Menu, and Menu is `display: none` outside it; the `(max-width: 720px)` block gives `.brandWord` `clip-path: inset(50%)` and no rule outside it does; the brand link's accessible name is "bb2dash" (`getByRole('link', { name: 'bb2dash' })` finds exactly 1) | "At phone width the bar shows Menu; it lists every page and Search." |
| 13 | The seven open states of §Contract (Bell, Activity, account menu, nav menu, Sync toast, Sync error toast, command palette) inside the viewport at ≤720 px; Bell and Activity panels capped at `min(360px, calc(100vw - 28px))` (91 R-46) | R-46 | W-68 | harness run of `e2e/phone-width.spec.ts` with `-g "open state"` → 14 passed, 0 failed (7 × 2 themes), each asserting the panel's rect `left ≥ 0` and `right ≤ innerWidth` at 390 px (case 3 measures `.ddUser` before W-68's task-10 mount; task 21 re-runs it with the theme control inside); `phone-width.spec.ts` intercepts `**/rest/v1/rpc/mark_announcements_seen` and the `agent_requests` POST and poll in every case, as `theme-walk.spec.ts` does for rows 04, 23 and 28 | "Bell and Activity open fully on a phone." |
| 14 | Gradebook scrolls inside its own box | R-46 | W-70 | `cd web && npx vitest run test/GradesTables.layout.test.tsx test/gradebook-phone-width.css.test.ts` → 0 failures (the layout test unedited; the new one asserts the wrapper rule has `overflow-x: auto` and no `th` / `td` rule gains `overflow` or `display`); harness run of `e2e/phone-width.spec.ts` with `-g "route /course/IST.466/grades "` → 2 passed, 0 failed (page `scrollWidth` ≤ 390; wrapper `scrollWidth` > `clientWidth`) | "IST.466 Grades at phone width: the table slides inside its box." |
| 15 | Planner board scrolls inside itself | R-46 | W-69 | `cd web && npx vitest run test/planner-css.test.ts test/planner-phone-width.css.test.ts` → 0 failures (no `min-width` on `.board` in any block; the 760 px floor on its tracks or an inner element); harness run of `e2e/phone-width.spec.ts` with `-g "route /planner "` → 2 passed, 0 failed (page `scrollWidth` ≤ 390; `.board` `scrollWidth` > `clientWidth`) | "The week slides at phone width; the page does not." |
| 16 | Sweep the foundation cluster (tokens module, login, privacy, terms, not-found, ThemeMenu) | R-53 | W-67 | baseline sum with `F=/^foundation\.json$/` → 0 and `cd web && npm test` → 0 failures | — |
| 17 | Sweep the shell cluster (scrim to a token, the two `TopNav` `style=` sites to classes, popouts, `QueryState`) | R-53 | W-68 | baseline sum with `F=/^shell\.json$/` → 0 and `cd web && npm test` → 0 failures | — |
| 18 | Sweep screens A (Home, planner, tracker, Inbox, Announcements; the 8 `PlannerBoard.tsx` `style=` sites keep only `--` keys) | R-53 | W-69 | baseline sum with `F=/^screens-a\.json$/` → 0 and `cd web && npm test` → 0 failures | — |
| 19 | Sweep screens B (course tabs, assignment page, Grades, Materials, Workspace; dead `GradeModel.module.css` classes may be deleted instead) | R-53 | W-70 | baseline sum with `F=/^screens-b\.json$/` → 0 and `cd web && npm test` → 0 failures | — |
| 20 | Integrate: full suites, all baselines zero, old tests edited only where §Files allows, no new dependency | R-53 | PM | `cd web && npm run typecheck && npm run build && npm test && npm run test:coverage` → 0 failures, exit 0; `cd desktop && npm run typecheck && npm test` → 0 failures; baseline sum with `F=/\.json$/` → 0; `git diff --diff-filter=M --name-only origin/main...HEAD -- web/test \| grep -cE "\.test\.tsx?$"` → 1 (`type-tokens.contrast.test.ts`; the baseline JSONs are not test files, so the count is the same whether tasks 1–2 rode Phase 17 or not); `git diff --diff-filter=M --numstat origin/main...HEAD -- desktop/test` → exactly one line, reading `1`, `0`, `desktop/test/unit/window.test.ts` (task 11's electron mock line added, nothing removed); `git diff --name-only origin/main...HEAD -- web/e2e/playwright.config.ts web/e2e/login.mjs \| wc -l` → 0; `git diff --numstat origin/main...HEAD -- web/package.json web/package-lock.json desktop/package.json desktop/package-lock.json \| wc -l` → 0 | — |
| 21 | 390 px walk green on the preview, no writes | R-46, P-79 | PM (runs W-68's spec) | harness run, with `WALK_SHOTS=1` and the phase-preview session saved just before it (preamble), of `e2e/phone-width.spec.ts` against the phase preview → 52 passed, 0 failed (16 routes × 2 themes, 1 popout × 2, 7 open states × 2, reachability × 2, ☰ still toggles `html[data-sidebar]` × 1, `unfolded bar at 721` × 1); no-writes SQL with this run's `:walk_start` → 0; screenshots `docs/planning/sprint-2/walks/walk-22/30-phone-home.png` (brand mark, Menu, Sync and four icons in one row, no horizontal scrollbar), `31-phone-nav-menu.png` (Home, Planner, Inbox, Grades, Materials, Workspace, Search listed), `32-phone-course-grades.png` (table cut at its box edge with its own scrollbar), `33-phone-planner.png` (week cut at the board edge), `34-phone-bell.png` and `35-phone-activity.png` (both panel edges inside the screen) | "At 390 px nothing scrolls sideways." |
| 22 | Theme walk: 58 screenshots | R-53, P-76 | PM (runs W-67's spec) | harness run, with `WALK_SHOTS=1` and the session saved before task 21, of `e2e/theme-walk.spec.ts` against the phase preview → 58 passed, 0 failed (each case: `html[data-theme]` = its theme, computed `body` background = `THEME_BG[theme]`, 0 console messages matching `/hydrat\|#418/`); no-writes SQL with this run's `:walk_start` → 0; `ls docs/planning/sprint-2/walks/walk-22/[0-2][0-9]-*-light.png \| wc -l` → 29 and the same for `-dark.png` → 29, each named `NN-<surface>-<theme>.png` with `NN` and the surface from the inventory table, and showing that surface open on its theme's ground | — |
| 23 | Gates: `/code-review main high`, `/security-review` | R-53 | PM | `grep -cE "^## /(code-review main high\|security-review)$" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 2 (both gates ran and are recorded); `grep -c "\| open \|" docs/planning/sprint-2/verification/103_PHASE22_REVIEW.md` → 0 (every CRITICAL / HIGH row reads fixed or declined-by-Stack) | — |
| 24 | STATUS, DECISIONS (rows owed, see DoD), ORCHESTRATOR; PR with preview | R-53, R-46, S2-styling-1 | PM | `git diff --name-only origin/main...HEAD -- project-state \| wc -l` → 3; `gh pr view feat/styling-22 --json state -q .state` → `OPEN`; `curl -s -o /dev/null -w "%{http_code}" <preview>/login` → 200 (through `vercel curl` if deployment protection answers 401); `test -e web/e2e/.auth/state.json` → exit 1 (the walk session deleted) | — |
| 25 | Stack's acceptance walk | R-53, R-46, S2-styling-1 | Stack | `grep -c "^- \[x\]" docs/planning/sprint-2/walks/walk-22/WALK.md` → 60 (58 surface lines, the C-1 line, the toggle line) and `grep -c "^- \[ \]" docs/planning/sprint-2/walks/walk-22/WALK.md` → 0 | "I walked every screen in light and dark and said yes." |

## Workers

| Worker | Stream | Branch · worktree | Owns (Contract §Files has the full list) | Tasks |
|---|---|---|---|---|
| W-67 | Foundation: audit, tokens, theme, desktop, public pages | `feat/styling-22-foundation` · `bb2dash-wt-22-foundation` | `globals.css`, root `layout.tsx`, `tokens.module.css`, `login/`, `privacy/`, `terms/`, `not-found.tsx`, `theme-preference.ts`, `ThemeMenu.*`, the audit, token and theme tests, `e2e/theme-walk.spec.ts`, `desktop/src/main/window*.ts` and their tests | 1, 2, 3, 8, 9, 10 (component), 11, 16 |
| W-68 | Shell and phone width | `feat/styling-22-shell` · `bb2dash-wt-22-shell` | `web/src/components/shell/` except `ThemeMenu.*`, `(app)/Shell.module.css`, `(app)/layout.tsx`, `components/popout/`, `QueryState.tsx`, `TopNav.fold.test.tsx`, `e2e/phone-width.spec.ts` | 5, 10 (mount), 12, 13, 17 |
| W-69 | Screens A | `feat/styling-22-screens-a` · `bb2dash-wt-22-screens-a` | Home files, `planner/`, `inbox/`, `announcements/` (routes and components), `tracker/`, `planner-phone-width.css.test.ts` | 15, 18 |
| W-70 | Screens B | `feat/styling-22-screens-b` · `bb2dash-wt-22-screens-b` | `course/`, `grades/`, `materials/`, `workspace/` (routes and components), `gradebook-phone-width.css.test.ts` | 14, 19 |

Order: tasks 1–2 first (on Phase 17's branch, or this one); W-67's task 3 and W-68's task 5 next; tasks 6–7 run
with Stack while W-68, W-69 and W-70 do the direction-free C-1 work (12–15; task 13's case 3 runs without the
theme control, which W-68 mounts at task 10 after the pick, §Contract); task 8 gates every sweep (16–19).
Workers commit and push per task (`feat(22-T8): …`), run their own checks, write RED → GREEN evidence in their
`103_W<nn>_VERIFICATION.md`, lower their own baseline JSON in the commit that removes the literals, and never
touch `project-state/`. Merges into `feat/styling-22` are all merges (a pushed branch is never rebased). First
the interim merges, each made once its commit is pushed and followed by the workers who need it merging
`feat/styling-22` into their own branches: W-68's task-5 commit (before W-69's and W-70's tasks 14–15), W-68's
task-12 commit (before the page-width half of tasks 14–15), W-67's task-8 commit (before the sweeps 17–19) and
W-67's task-10 component commit (before W-68's mount). Then the final merges: W-67 first, then W-68, W-69, W-70.
The PM then runs tasks 20–24.

## Out of scope

* New screens or routes; any behaviour or copy change beyond the Menu fold and the theme control (81:79-80).
* The favicon, `apple-icon.png` (R-50, P-80) and R-36's rank-weight rule line: Phases 17 and 16 under B-23;
  per-exam weights (R-36 option M) stay parked.
* `usePopover`'s reshape and the React-compiler lint work (R-51): Phase 17.
* The Workspace page's behaviour, storage and transport (S2-workspace-1): Phase 21; only its tokens are swept here.
* Planner geometry (row heights, `slotToPx`, lanes), the courses-sidebar mechanics (`data-sidebar`,
  `--sidebar-side`, the 1024 px drawer), the grade figures and every status label.
* Electron beyond the window background: tray, toasts and R-108's proofs (Phase 17), packaging (D-6).
* Tailwind, any UI framework, stylelint, postcss, css-tree, next-themes, `next/font`, any new npm dependency
  (D-19); CI (D-20).
* Any migration, view, RPC, policy or edge function; any write to prod during the walks.
* Editing Phase 17's walk harness (`web/e2e/playwright.config.ts`, `web/e2e/login.mjs`, its specs).

## Open items for Stack

Only what B-6, B-23 and B-24 leave open; each has the default this brief builds to.

1. **What a direction may change.** Default: colour, font family and weights, radii and shadows; spacing, the
   type sizes and the planner geometry keep today's values, so 81:50's "no layout change" holds and the planner
   tests stay unedited. If you want a new type scale, it needs its own row and the planner geometry is reopened.
2. **The brand word at phone width.** Default: hidden at ≤720 px (the mark stays), because the bar is estimated
   about 13 px too wide at 390 px with it. Say if you would rather keep it and let the Sync label go icon-only.
3. **Widths just above the fold.** Unfolded, the bar needs its links, the 180 px Search box, Sync and four icons
   in one row: about 950 px with today's five links and about 1,040 px with Phase 21's Workspace link (PM
   estimate from the CSS rules, not measured; task 5 measures it). Between 721 px and that width the bar is wider
   than the window, and the desktop's 900 px minimum sits in that band. R-46 asks only for 390 px, so the default
   keeps B-24's fold at 720 px and records the measured width. If you want no sideways scroll at any width, the
   fold moves to 1023.98 px (the courses drawer's step, already in the frozen set) and the Search box narrows to
   fit at 1024 px: one DECISIONS row, and task 21 gains 900 px and 1024 px cases.
4. **The desktop window before the page paints.** Default: it follows Windows (Auto). If you pick the theme
   opposite to Windows, the window shows the other ground for one frame at launch; accepted rather than adding a
   desktop-side setting.
5. **Pages without JavaScript.** Default: they show the dark theme (the `:root` block); Auto and the toggle
   need the boot script, and a second, media-query copy of the light block is not worth keeping in sync for it.

## Session prompt (draft; Stage D finalises it in ORCHESTRATOR, 94 §5 Session E)

> `/bb2dash-pm` Start Phase 22 (styling: R-53, R-46, S2-styling-1, P-15..P-17, P-76..P-79). Read
> `docs/planning/sprint-2/briefs/103_PHASE22_styling.md` in full. Confirm Phases 16, 17, 18, 19, 14 and 21 are
> merged, that `web/src/app/(app)/workspace/page.tsx` exists on `main`, and whether tasks 1–2 already landed with
> Phase 17 (if not, they are this branch's first commits). Record my answers to B-6, B-23 and B-24 against the
> brief's table and put open items 1–5 to me; wait for them. Then cut `feat/styling-22` in `bb2dash-wt-22` and
> spawn W-67..W-70 (Opus) in their own worktrees on their disjoint files in the brief's order, running
> `web/e2e/login.mjs` against each host before its first harness run (the task-list preamble): W-67's task 3 and
> W-68's task 5 (RED on the first preview) first; publish the three style tiles (task 6) and wait for my pick
> while W-68..W-70 do tasks 12–15; task 8 after my pick gates the sweeps (16–19). Make the interim merges the
> Workers "Order" paragraph lists, then integrate W-67 → W-70, run `login.mjs` against the phase preview, walk
> both specs on it with `WALK_SHOTS=1`, run `/code-review main high` and `/security-review`, update STATUS,
> DECISIONS and ORCHESTRATOR, open the PR with the preview link and `WALK.md`, and stop at "ready when you say so".
