# 92 — Sprint 2 research: styling

Date 2026-09-24 · Researcher: Sonnet (Stage B) · Scope: R-53, R-46, R-50, R-36 (screen side) and §3 S2-styling-1, §2 P-15..P-17, §6 questions 14, 15, 23

## 0. Summary

Nothing in the styling cluster changes shape; the research sharpens mechanism and blocks one instinct. The token system, the light/dark toggle and the audit must all be hand-rolled (Node/regex, run as vitest, matching `web/test/audits.test.ts`'s own pattern) — D-19 declines "new dependencies for styling," and `web/` already ships zero CSS tooling (no `stylelint`, no `postcss` as a project dependency), so the natural industry answer (`stylelint-declaration-strict-value`) is off the table unless Stack reverses that decline. The light/dark switch should reuse the exact architecture the sidebar already proved works — an inline boot script stamping `html[data-theme]` before first paint, read by CSS, owned by React after mount — rather than inventing a second mechanism or adding `next-themes`. The contrast test (`type-tokens.contrast.test.ts`) cannot survive a light block as written: its custom-property reader is file-wide last-wins, so a `:root[data-theme="light"]` block would silently overwrite the dark assertions (P-17 is load-bearing, not optional polish). The nav-fold question (Q15) has a concrete answer buried in the repo's own numbers: TopNav already changes behaviour at 720px, hiding the only visible Search entry, so a *new* fold breakpoint at "about 640px" (Q15's stated default) would strand Search in a dead zone between 640 and 720; the fold should replace the existing 720px step, not sit below it. Favicon is the smallest, cleanest item: `web/src/app/favicon.ico` is a plain file-convention drop, no route group interference, confirmed against Next 16's own docs. R-36's screen-side option is genuinely cheap (a sentence, no engine change) and should not wait for Phase 13 — it has no token dependency. The "three directions" step (S2-styling-1) maps well onto a tool already in this environment: three static Artifact pages, each the same half-dozen components under one candidate token block in both themes, let Stack pick without a code branch or a deploy. Total size: **L** (R-53 carries nearly all of it), with R-46 M, R-50 S, R-36 (screen side) S, and the three-direction step folded into R-53's own size. Biggest risk: shipping the toggle and the audit as if they were direction-independent infrastructure, then discovering the contrast test's parser or the audit's allowlist wasn't actually frozen first, and re-running an entire loop.

## 1. R-53 · Every screen on signed-off tokens, light and dark, Stack-approved

### 1. Standard practice

A token-based light/dark system that a careful team ships today has four moving parts, and all four are boring by design:

* **Tokens as CSS custom properties**, one role-named set (`--color-bg`, `--color-text`, …) redefined per theme, never a second class hierarchy. `globals.css` already does this for the single dark theme (`:root { --color-bg: #161826; … }`).
* **Theme selection** read once, applied via a `data-*` attribute (or class) on `<html>`, with `prefers-color-scheme` as the *only* signal until the user overrides it, and the override persisted. The 2026 write-ups agree on the shape: read `localStorage` first, fall back to the media query, fall back to a hard default — and do it in a script that runs before the stylesheet paints, not in a `useEffect`.
* **No flash.** The standard fix is a synchronous inline `<script>` in `<head>`, before any CSS, that sets the attribute. React never renders the attribute itself (no `useState` for theme at the root) so there is nothing for hydration to reconcile.
* **`color-scheme`** set to match the active theme so native form controls and scrollbars follow it — Chrome and Firefox both render date pickers, checkboxes and the scrollbar track in dark chrome whenever the page declares `color-scheme: dark`, independent of the page's own CSS, so a stale `color-scheme: dark` under a light theme is a real, visible bug, not a nitpick (MDN, `color-scheme` property).

Token *enforcement* (no literal colour or size outside the token files) is normally a lint rule, run in CI, not a human habit. The standard tool is a Stylelint plugin that whitelists `var(--x)` and fails on a literal hex/rgb/px.

### 2. Open-source examples

* **[pacocoursey/next-themes](https://github.com/pacocoursey/next-themes)** — the reference implementation of the no-flash pattern above. What to borrow: not the package (new dependency, declined) but its *shape* — a script injected before the rest of the page, checked in order `localStorage → prefers-color-scheme → default`, writing a `data-theme` attribute and the matching `color-scheme` value in the same tick. bb2dash's own `SidebarProvider` boot script is architecturally the same pattern already; the theme boot script should be its sibling, not a new idea.
* **[AndyOGo/stylelint-declaration-strict-value](https://github.com/AndyOGo/stylelint-declaration-strict-value)** — the standard-practice tool for "no literal colour/size outside tokens." What to borrow is the *rule shape*, not the package: it scopes by property pattern (e.g. `/color$/`), whitelists `var()` and named keywords (`inherit`, `transparent`, `currentColor`), and can expand shorthand (`border` → `border-color`) so a shorthand declaration can't smuggle a literal past the check. `web/test/audits.test.ts`'s hand-rolled scanner should copy exactly this allow-list shape (a regex per property class, an explicit keyword exemption list) even though it can't copy the dependency.
* **[jakobcornell/grade-calculator](https://github.com/jakobcornell/grade-calculator)** — not a styling example, cited here only for the general "compute from a frozen source of truth, don't hand-copy it" discipline its weight model follows (relevant because `type-tokens.contrast.test.ts` already does this correctly: it reads `globals.css` itself rather than a copied palette, so "change a token and this test is the thing that fails" — P-17 should preserve that property, not replace it with a second source of truth per theme).

### 3. Known pitfalls

* **`color-scheme` left static.** MDN: the property "sets the default colors of scrollbars and other interaction UI, as well as the default colors of form controls." `globals.css:164` hard-codes `color-scheme: dark`; a light theme that doesn't also flip this value gets dark scrollbars and dark date pickers on a white page (MDN, `color-scheme`).
* **Flash from a `useEffect`-driven toggle.** Every 2026 write-up found converges on the same root cause: React can't read `localStorage` during SSR, so a toggle implemented as client state repaints after first paint. The fix is the boot script, not a `useState` with a `suppressHydrationWarning` band-aid (Next.js GitHub Discussion #64391; goilerplate.com, "Dark mode without the flash: the right way in 2026").
* **A file-wide "last value wins" token reader breaks the instant a second theme block exists.** This is not hypothetical for bb2dash — `type-tokens.contrast.test.ts`'s own `readCustomProperties()` is exactly this: one `Map`, one regex over the whole file, last declaration of a given `--name` wins. A `:root[data-theme="light"]` block placed after `:root` would silently replace every dark value the test currently asserts against, and the suite would go on passing while checking the wrong theme. This is P-17's entire justification, verified directly against the test file (lines 62–71 read one `Map` for the whole document).
* **Contrast math that doesn't handle `color-mix()`.** `globals.css` already composes several tokens with `color-mix(in srgb, …)` (`--color-divider`, `--color-muted`); a light block will need more of these for shadows/scrims. `parseHex()` in the existing test throws on anything that isn't a plain 6-digit hex, so `color-mix()` outputs need pre-resolution (either evaluate the composite ahead of time and assert on the literal, or extend the parser) — otherwise the light block's mixed tokens fail the test not because they're inaccessible but because the parser can't read them at all (verified against `type-tokens.contrast.test.ts:62-104`).

### 4. Mapping onto this stack

* `web/src/app/globals.css` — add a `:root[data-theme="light"]` block beside the existing dark `:root`, keep `@media (prefers-color-scheme: light)` as the *unattended* fallback only (no explicit choice made yet), same as the sidebar's `localStorage` vs. viewport-default split.
* A new tiny module, sibling to `web/src/lib/sidebar-preference.ts` (not found in this pass but referenced by R-53's own seams list), e.g. `web/src/lib/theme-preference.ts`: reads/writes `localStorage['bb2dash.theme']`, exposes the boot-script source as a string the root layout inlines — mirrors `SidebarProvider`'s pattern exactly.
* `web/src/app/layout.tsx` (the *root* layout, not `(app)/layout.tsx`) — the inline script must run here so `/login`, `/privacy`, `/terms` and `not-found` get it too; `themeColor` in metadata should read the same source rather than being hard-coded.
* `web/test/audits.test.ts` — add the token/hard-code scan here, following its existing `walk()` + cached-read pattern (P-15); this is the file the tool search already surfaced as "the pattern."
* `web/test/type-tokens.contrast.test.ts` — rewrite `readCustomProperties()` to key on `(selector, propertyName)` instead of `propertyName` alone, so `:root` and `:root[data-theme="light"]` are read as two independent maps (P-17); extend `resolveToken`/`parseHex` to evaluate simple two-stop `color-mix(in srgb, A P%, B)` calls against already-resolved tokens.
* `TopNav.tsx:125-147` (the user menu, already identified as the toggle's home in R-53's own seams) — a three-state control (see §6 below), using the existing `usePopover` hook rather than a new one.
* `desktop/src/main/window.ts:233` — background colour corrected to track the same token rather than its own literal `#12131a`.
* No migrations, no RPCs, no edge functions — this is entirely `web/` and (one line) `desktop/`.

### 5. Size and seams

**L.** Seams: runs after S2-workspace-1/materials-1/home-2 screens exist (inventory must include them); C-1 (R-46) and C-3 (R-50) leave Phase 13 only on Stack's word and are sized separately in this doc; C-2 (R-36) likewise. P-15/P-16/P-17 are sub-steps of this same R-number and should land as their own early commits (see §6).

### 6. What the research changes about the requirement

* **Sharpens "token audit tooling"**: the requirement (and P-15/P-16) should say explicitly *hand-rolled vitest scanner, not stylelint* — not as a style preference but because D-19 forbids the dependency and none of `stylelint`/`postcss`/`css-tree` exists in `web/`'s dependency tree today (verified: `web/package.json` lists no `stylelint`; `require.resolve('postcss')` and `require.resolve('css-tree')` both fail from `web/`). This should be a line in the Contract, not left to the worker to discover.
* **Sharpens P-17 from "read each theme block separately" to a concrete rewrite target**: key the property map on `(selector, name)`, and resolve at least one level of `color-mix()`, because the light block will need composited tokens (shadows, scrims) from day one, not just flat hex.
* **Adds** (research-added, see below): reuse the sidebar's exact boot-script architecture for the theme attribute, a 3-state Auto/Light/Dark toggle rather than a bare switch, and driving `color-scheme` from the same attribute.

## 2. R-46 · No horizontal page scroll at 390 px on any route

### 1. Standard practice

The two competing responsive-nav patterns are: (a) collapse everything behind a single menu control below a breakpoint (simplest, what most production sites with under ~7 links do), and (b) "Priority+" — keep as many links visible as fit, sweep the rest into a "More" menu, recompute on resize. Government and enterprise design systems (USWDS) use pattern (a): a single `usa-menu-btn` toggles the whole nav below the system's configured breakpoint, with a focus trap while open and `aria-expanded`/`aria-controls` wired to the toggle (designsystem.digital.gov, Header component). Pattern (b) exists because large nav sets (10+ items, mega-menus) can't afford to hide everything; a small fixed link set — bb2dash has exactly five — gets no benefit from the extra complexity.

### 2. Open-source examples

* **[USWDS Header](https://designsystem.digital.gov/components/header/)** — what to borrow: the accessibility shape, not the markup. A `<button aria-expanded="false" aria-controls="…">Menu</button>` toggling a `nav[aria-label="Primary navigation"]`, Escape and focus-out closing it, Tab/Enter/Space fully reachable. bb2dash's `usePopover` hook (already the mechanism behind Bell, ActivityMenu and the user menu) is the right primitive to reuse for this exact contract rather than hand-writing a new focus trap.
* **[jayfreestone/priority-plus](https://github.com/jayfreestone/priority-plus)** — what to borrow, narrowly: nothing structural (it's built for a nav that needs to *dynamically* decide how many items fit, using `IntersectionObserver`, which is overkill for five links that only ever need one of two states: "all visible" or "all folded"). Worth reading for the failure mode it solves — width-based JS measurement is expensive and racy — as the reason a plain CSS breakpoint (not a runtime measurement) is the right call here.
* **CSS-Tricks, ["The Priority+ Navigation Pattern"](https://css-tricks.com/the-priority-navigation-pattern/)** — cited by the search result as the canonical writeup of why teams reach for the pattern at all (many items, no natural cutoff); useful as the negative case that confirms bb2dash's five fixed links don't need it.

### 3. Known pitfalls

* **A breakpoint that only "tightens padding" without giving the hidden content anywhere to go.** This is not a general web pitfall, it's the bug already sitting in `TopNav.module.css`: at ≤720px the bar hides `.cmdk` (Search) with nothing replacing it — a menu that doesn't exist yet. Confirmed directly: `TopNav.module.css` at the ≤720px query only tightens padding and hides Search, and the requirement's own measurement (636px content at 390px viewport) predates any fold at all.
* **`overflow-x` on the wrong element.** `PlannerWeek.module.css` applies `min-width: 760px` to `.board` — the *same* element that carries `overflow-x` (line 99 sets the scroll container, line 830 sets the min-width) — which is why the inner scroll can leak into a page scroll: the scrolling element and the width-forcing element must be the same box only when the *ancestor* is what should stay fixed-width, otherwise the min-width propagates up through a non-scrolling parent. The fix pattern (an inner wrapper carries `min-width`, the outer carries `overflow-x`) is standard CSS scroll-container practice, not something needing a citation — but worth stating explicitly in the Contract since it's exactly backwards today.
* **Table overflow on `th`/`td` instead of a wrapper**, breaking `display: table` semantics (this repo already has a test guarding exactly this: `GradesTables.layout.test.tsx`, and 10b's post-mortem on `display: flex` on `th`/`td` misaligning every Grades table is the same class of mistake, recorded in DECISIONS 2026-09-16).

### 4. Mapping onto this stack

* `TopNav.tsx` / `TopNav.module.css` — replace the ≤720px "tighten + hide Search" step with a single fold at the *same* 720px breakpoint (see §6), using `usePopover` for the menu button's open/close/focus behaviour (already imported by `Bell.tsx`, `ActivityMenu.tsx` and the user menu in the same file).
* `GradebookTable` — a horizontal-scroll wrapper around (not inside) both tables; `GradesTables.layout.test.tsx` already forbids `display: flex` on `th`/`td`, so the wrapper must not touch cell display.
* `PlannerWeek.module.css:99,830` — move `min-width: 760px` off `.board` onto an inner element, leaving `.board` (or its parent) as the pure `overflow-x` container, so `/planner` scrolls inside itself, not the page.
* Bell/Activity panels (currently 360px fixed) — `min(360px, calc(100vw - 28px))`, no new file.
* A new viewport-width test (390px) across the 14 routes + `?item=` popout + open menus, asserting `scrollWidth <= innerWidth` — this needs the logged-in Playwright harness (`P-7`, already PM-added and listed as a dependency in R-46's own seams).

### 5. Size and seams

**M**, confirmed. Seams: `SidebarProvider` (`SIDEBAR_BREAKPOINT` 1024, must not collide with the new fold breakpoint), `usePopover` reshape shared with R-51's ESLint/coverage cluster (same file touched twice — do it once), P-7's browser-walk harness as a hard dependency for the executable check. Size moves to **M+** if the Playwright harness has to be built in the same PR rather than reused (already flagged in the requirement itself).

### 6. What the research changes about the requirement

* **Sharpens Q15's default breakpoint.** The requirement's own "Still missing" already says the fold "must not collide with ☰"; the research adds the concrete number: fold at the *existing* 720px step (where Search already vanishes today) rather than a new ~640px breakpoint, because a second, lower breakpoint leaves a 640–720px band where Search is hidden and no menu exists to reach it — verified as the current, live behaviour of `TopNav.module.css`. See Q15 below.
* **Adds** an explicit pitfall line to the Contract: the wrapper carrying `min-width` and the wrapper carrying `overflow-x` on `PlannerWeek` must be different elements, not the same one as today.

## 3. R-50 · Every route serves a favicon; no /favicon.ico 404

### 1. Standard practice

Next.js's App Router has a dedicated, code-free convention for this: drop `favicon.ico` in the root `app` route segment and the framework injects the `<link rel="icon">` itself; no metadata object, no manual tag. The docs are explicit that a *generated* favicon isn't supported — `icon`/`apple-icon` route files (`.js`/`.ts`/`.tsx`, using `ImageResponse`) are the only programmatic path, and even then "you cannot generate a favicon icon" — `favicon.ico` must be a literal file (Next.js docs, `app-icons.mdx`, fetched via Context7 2026-09-24). This resolves the requirement's own open question about whether a generated route is needed: it isn't, a straight `.ico` copy is the only correct shape for this file name.

### 2. Open-source examples

Not applicable as a "borrow a pattern" case — this is a one-file framework convention with no interesting implementation to study. The Next.js documentation snippet itself (below) is the only artifact worth citing:

```
### favicon, icon, and apple-icon > Image files (.ico, .jpg, .png) > favicon
Add a `favicon.ico` image file to the root `/app` route segment.
```
— [vercel/next.js docs, `app-icons.mdx`](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.mdx)

### 3. Known pitfalls

* **Route groups don't create a segment.** `(app)` is a route-group folder (parentheses), which Next explicitly excludes from the URL and from file-convention scoping — so `favicon.ico` belongs at `web/src/app/favicon.ico`, sibling to the *root* `layout.tsx`, not inside `(app)/`. The requirement's own "Still missing" already gets this right; the research confirms it against Next's own docs rather than inference.
* **`apple-icon` is a separate convention.** Not mentioned in the requirement at all — iOS "Add to Home Screen" reads `apple-icon.png` (or an `apple-icon` route), not `favicon.ico`. Low priority for bb2dash (no evidence Stack installs it to a phone home screen; the desktop shell is Electron, not iOS), but cheap enough to fold in at the same time as the favicon file lands, since the icon asset already exists at `desktop/build/icon.png`.

### 4. Mapping onto this stack

* `web/src/app/favicon.ico` — copy of `desktop/build/icon.ico`, ideally trimmed to 16/32/48px entries per the requirement's own note (the live file today is 256px-upscaled and heavier than it needs to be).
* Optionally `web/src/app/icon.png` and `web/src/app/apple-icon.png` from `desktop/build/icon.png` — no code, file convention only.
* `web/src/proxy.ts:20` already excludes `.ico`/`.png` from the session proxy — confirmed no auth work needed, nothing to change there.
* No migrations, no server code.

### 5. Size and seams

**S**, confirmed. Seams: rides with R-46 and R-36 as the other two Phase-13 carry-ins (C-1..C-3); needs only Stack's word on "eclipse-ring is final" vs. "wait for the direction" (Q14, unchanged by this research — see §6).

### 6. What the research changes about the requirement

* **Confirms, does not change**, the requirement's plan (a literal `.ico` file copy, no generated route) — worth recording because it forecloses a plausible worker misstep (reaching for `icon.tsx` + `ImageResponse` when a flat file is both simpler and the only supported option for the `favicon` name specifically).
* **Adds** (research-added, low priority): `apple-icon.png` alongside the favicon, same asset, same PR, since the source PNG already exists and the marginal cost is one more file-convention drop.

## 4. R-36 · Rank-weighted ECN.304 exams state their 30/25/20 rule (screen side)

*Scope note: this entry's "screen side" is the display/copy half only — `GradedSoFarFigure.tsx`, `labels.ts`, the sentence under the figure. The per-exam weight once every exam is scored (option M) needs `slotAggregate` to return an item→weight assignment, which is engine work outside a styling researcher's scope and is flagged below as a seam, not sized here.*

### 1. Standard practice

Showing *why* a computed number is what it is, without cluttering the primary view, is a progressive-disclosure problem: NN/g's framing is to show, by default, only what users need frequently, and defer the rest — but critically, "hiding complexity should never obscure *required* information — only defer optional depth" (nngroup.com, "Progressive Disclosure," fetched 2026-09-24). A rule that changes what a number *means* (here: exams are averaged only once all three are graded, and unevenly) is required information, not optional depth — it belongs in the primary view as a plain sentence, not behind a click. This matches the option-S framing already in the requirement ("one sentence under the full-size figure").

Grading tools that show weighted categories converge on the same two choices: state the weights as a fact near the number (a caption, not a tooltip), and don't fabricate detail the data doesn't support yet (an unscored exam has no "current" weighted contribution to show).

### 2. Open-source examples

* **[jakobcornell/grade-calculator](https://github.com/jakobcornell/grade-calculator)** — what to borrow: its weight model treats a category's weight as a *relative* number, not required to be a "true" percentage of anything until all categories exist — directly analogous to `rank_weighted`'s 30/25/20 only becoming a real percentage once all three exams are scored. Its choice to print only the aggregate (no partial weighted breakdown before the data is complete) is the right instinct for `GradedSoFarFigure.tsx`: don't show a would-be weight before every exam is graded (the requirement's own "Notes" already reaches this conclusion; the calculator's design independently confirms it as standard practice, not a bb2dash-specific caution).
* **Canvas LMS `assignment_groups` API** ([canvas.instructure.com/doc/api/assignment_groups.html](https://canvas.instructure.com/doc/api/assignment_groups.html)) — what to borrow: the shape of the metadata a weighted-group UI needs to *state* the rule (`group_weight`, `drop_lowest`, `drop_highest`, `never_drop`) as plain fields separate from the score. bb2dash already has this shape in `grade_components.rank_weights` — the research confirms the sentence should read those fields directly (as the requirement's "Seams" already specifies: "never a hard-coded string") rather than needing a new data model.

### 3. Known pitfalls

* **Stating a rule that implies more precision than the data has.** The requirement's own evidence (ECN.304 Exam 1 due 2026-10-01, none graded yet) means any sentence shipped today can only state the *rule*, never a live weighted contribution — conflating "the rule is 30/25/20" with "your current weighted score is X" would be exactly the kind of fabricated-precision CLAUDE.md already forbids ("No fabricated numbers anywhere").
* **Wording drift from the frozen source.** `labels.ts` today holds only three picker strings (confirmed: the requirement's own "State today" already checked this); a new sentence must be added there, not inlined in the component, or Phase 13's later token/copy pass has two places to find grading language.

### 4. Mapping onto this stack

* `web/src/lib/grade-model/labels.ts` — add the rule sentence as a named export, built from `grade_components.rank_weights` (read at render time, not hand-typed), matching the existing "never a hard-coded string" seam.
* `web/src/components/grades/GradedSoFarFigure.tsx:38-53` — render the sentence under the figure only when `NodeOutcome`'s component is `rank_weighted` (the data already carries this per the requirement's own "State today").
* No `rank-weighted.ts` / `evaluate.ts` / `slotAggregate` changes for the screen-side option — that's option M, a seam to the grades/engine cluster, not this researcher's scope.
* Tests: a unit test on the label builder, an RTL test asserting the sentence renders only for `rank_weighted` components (both already named in the requirement's own "Still missing").

### 5. Size and seams

**S** (screen-side / option-S only, confirmed against the requirement's own "Size S covers option (S)" note). Seams: option M (per-exam weight once scored) needs `slotAggregate` engine work — out of scope here, flagged for the grades researcher; the real-data walk depends on ECN.304 Exam 1 posting and being linked (A-2/A-3, V-1 cluster), which is unrelated to shipping the sentence itself since the sentence needs no live score.

### 6. What the research changes about the requirement

* **Splits** the requirement more explicitly along the line it already gestures at: ship the screen-side sentence (S, no dependency on V-1 or a posted exam) now, independent of Phase 13/S2-styling-1 placement, since it is copy-and-data work, not tokens — it does not need to wait behind the styling direction at all. The existing "Must respect" rows don't forbid this; the requirement is filed under "styling" only because C-2 (Phase 13's parked row) named it there in 2026-09-16, before Phase 13 was parked.
* **Confirms** the requirement's own instinct (in its "Notes") that a would-be per-exam weight before every exam is scored would be a projection, and grounds it in the progressive-disclosure "don't hide required information, don't invent optional depth" framing.

## 5. S2-styling-1 · Styling (the three-direction proposal method)

### 1. Standard practice

The "three directions, pick one" step the Phase 13 brief already names ("Direction proposals (three, on a design canvas)") is a named, decades-old design deliverable: **style tiles**, created by Samantha Warren specifically to solve the problem of presenting visual direction *before* full comps exist. The standard shape: three tiles, each showing colour + type + a few representative UI fragments (never full page layouts), so a stakeholder reacts to the *system* rather than to one screen's particular content — and, critically, exactly three, because "stakeholders would often want to mix the elements between concepts, taking the header from Option A, the footer from Option C" when given fewer or more (A List Apart, "Style Tiles and How They Work"; Palantir, "Style Tiles: The Complete Guide"). This is precisely the shape Stack's Phase 13 brief already specified two years of project-time ago, independently.

### 2. Open-source examples

* **Samantha Warren's original style-tile format**, as documented in [A List Apart, "Style Tiles and How They Work"](https://alistapart.com/article/style-tiles-and-how-they-work/) — what to borrow: the *contents* of a tile (colour swatches, type specimens, a button, an icon or two — not a full nav bar or a full page), and the rule of exactly three concepts shown side by side, never sequentially.
* **[Palantir, "Style Tiles: The Complete Guide"](https://www.palantir.net/blog/all-about-style-tiles)** — what to borrow: their framing of style tiles as a *conversation* tool, not a final deliverable — the client reacts to fragments and names what they like/dislike about each, which then gets recombined into one direction. This maps directly onto Stack's own DoD wording ("Stack approves each" screen, one at a time, after the direction is picked) — the three-tile step is upstream of that, not a shortcut past it.

### 3. Known pitfalls

* **Full-fidelity mockups presented as "directions."** Both sources warn against showing three complete page layouts instead of three fragment sets — it invites debate about layout and content (already frozen — Phase 13 is explicitly "no layout, copy, or behaviour change") instead of about colour, type and tone, which is the only thing actually undecided.
* **No live toggle in the proposal step.** If the three directions are only static screenshots, Stack can't check them against `prefers-color-scheme` or a real toggle interaction before picking — worth building each tile as a real, small HTML page with its own token block and a working toggle, not an image.

### 4. Mapping onto this stack

* This step needs **no code in `web/`** and should not be built as a route inside the app (Phase 13's own "Out of scope" already forbids new screens for anything except C-1..C-3). The Artifact tool available in this environment is a direct fit: publish one page (or three) with the same half-dozen representative fragments — the top nav bar, a primary button, the `GradedSoFarFigure`, a `GradebookTable` row, a `PlannerWeek` block, a Materials card — rendered three times under three different token blocks, each with a working light/dark toggle, so Stack compares them side by side and ticks one. Nothing here touches the repo, the deploy, or Stack's production data — it is copy-paste of real component markup (or close facsimiles) with token values swapped, published privately for Stack's review only.
* Once picked, the winning token block becomes `globals.css`'s new `:root` / `:root[data-theme="light"]` content directly — the proposal artifact and the real tokens should share the same variable *names* from the start, so the "pick one" step produces a literal diff, not a translation exercise.
* The screen inventory this step must cover (per R-53's own seams) already includes screens that don't exist yet at proposal time (S2-workspace-1, S2-materials-1, S2-home-2) — the three-tile fragments should be chosen from *existing* screens only; new screens get the chosen direction applied when they're built, not re-litigated.

### 5. Size and seams

Folded into R-53's **L** sizing (this is R-53's own task-loop step 2, not a separate phase of work) — call out as its own **S** sub-task only for scheduling purposes (it can start the moment token *candidates* exist, independent of the audit/toggle plumbing).

### 6. What the research changes about the requirement / S2-styling-1's still-to-confirm fields

* **Sharpens "on a design canvas"** (the brief's own phrase, previously unexplained) into a named, sourced method — style tiles, exactly three, fragments not full pages — with a concrete, no-new-dependency way to run it in this environment (Artifact pages) rather than an external design tool.
* **Adds**: build each tile as a small working page (real toggle, real `prefers-color-scheme` behaviour), not a static image, so the light/dark decision is tested at proposal time, not re-discovered during the per-route loops.

## Research-added requirements

| # | Title | Why | Size | For |
|---|---|---|---|---|
| RA-1 | Reuse the sidebar's inline boot-script architecture for `html[data-theme]` | Two independent FOUC-prevention mechanisms (one for the sidebar, one for theme) would duplicate exactly the pattern DECISIONS 2026-09-14 already solved once ("the attribute is written during HTML parse … there is no hydration mismatch to suppress"); a second, different mechanism is a place for the two to drift | S | R-53 |
| RA-2 | Three-state Auto/Light/Dark toggle, not a bare switch, default Auto (`prefers-color-scheme`), persisted only on an explicit non-Auto pick | Matches the requirement's own "prefers-color-scheme … and an explicit toggle" wording, which names two mechanisms, not one overriding the other; a bare light/dark switch with no Auto state can't express "I haven't chosen, follow the OS" once the user has touched it | S | R-53 |
| RA-3 | Drive `--color-scheme` off the same `data-theme` attribute, replacing `globals.css:164`'s hard-coded `color-scheme: dark` | MDN: the property governs native form-control and scrollbar colours independent of the page's own CSS; a light theme under a static `dark` value gets visibly wrong native widgets | S | R-53 |
| RA-4 | 390px check asserts every nav item is still *reachable* (present somewhere in the DOM, focus-reachable), not only that `scrollWidth <= innerWidth` | A folded/hidden nav can pass a scroll-width check while silently dropping a link nobody can reach without a mouse-drag; USWDS's own accessibility notes (focus trap, `aria-expanded`, Tab/Enter/Space reachability) are the bar a menu-based fold should be held to | S | R-46 |
| RA-5 | `apple-icon.png` alongside `favicon.ico`, same source asset, same PR | Cheap (`desktop/build/icon.png` already exists), and Next's file convention treats it as a wholly separate icon from `favicon.ico`/`icon.png` — free to add once the PR already touches this exact directory | S | R-50 |

## Questions for Stack

Only where this research changes the §6 default; questions 14 and 23's placement/plumbing questions are otherwise confirmed as written and are not repeated here.

1. **Q15 (nav fold breakpoint) — sharpened default.** Original default: fold below "about 640px." Research default: fold at the *existing* 720px step (replace, don't add to, the breakpoint where Search already disappears today), using a menu button built on `usePopover`. **Why:** a new, lower breakpoint leaves a 640–720px band where Search is already hidden today and no menu exists yet to reach it — verified directly against `TopNav.module.css`'s live ≤720px rule. This is a smaller change than it looks (same breakpoint number, different behaviour at it) and removes a broken intermediate state rather than adding one.
2. **Q23 (token audit / theme plumbing land early; toggle location) — sharpened mechanism, same placement.** Original default: audit lands early as a test-only ratchet; toggle sits in the TopNav user menu. Research default: same placement, plus — the toggle is 3-state (Auto/Light/Dark, default Auto) rather than a bare switch, it reuses the sidebar's exact boot-script mechanism (not a new one, not `next-themes`), and `color-scheme` is driven from the same attribute. **Why:** the requirement's own wording already names two signals (`prefers-color-scheme` *and* "an explicit toggle"), which only cleanly coexist with a 3-state control; the sidebar's boot script is a proven, already-decided pattern (DECISIONS 2026-09-14) that a second, bespoke mechanism would needlessly duplicate.

## Sources

* [MDN — `color-scheme` CSS property](https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme) — fetched (search result) 2026-09-24
* [pacocoursey/next-themes (GitHub)](https://github.com/pacocoursey/next-themes) — fetched 2026-09-24
* [AndyOGo/stylelint-declaration-strict-value (GitHub)](https://github.com/AndyOGo/stylelint-declaration-strict-value) — fetched 2026-09-24
* [Next.js docs — `favicon`, `icon`, and `apple-icon` file conventions](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.mdx) — fetched via Context7 2026-09-24
* [USWDS — Header component](https://designsystem.digital.gov/components/header/) — fetched 2026-09-24
* [jayfreestone/priority-plus (GitHub)](https://github.com/jayfreestone/priority-plus) — fetched 2026-09-24
* [CSS-Tricks — "The Priority+ Navigation Pattern"](https://css-tricks.com/the-priority-navigation-pattern/) — search result 2026-09-24
* [A List Apart — "Style Tiles and How They Work"](https://alistapart.com/article/style-tiles-and-how-they-work/) — search result 2026-09-24
* [Palantir — "Style Tiles: The Complete Guide"](https://www.palantir.net/blog/all-about-style-tiles) — search result 2026-09-24
* [jakobcornell/grade-calculator (GitHub)](https://github.com/jakobcornell/grade-calculator) — fetched 2026-09-24
* [Canvas LMS — Assignment Groups API docs](https://canvas.instructure.com/doc/api/assignment_groups.html) — search result 2026-09-24
* [Nielsen Norman Group — "Progressive Disclosure"](https://www.nngroup.com/articles/progressive-disclosure/) — fetched 2026-09-24
* Repo facts verified directly (not web sources): `web/src/app/globals.css`, `web/src/components/shell/TopNav.tsx` / `.module.css`, `web/test/audits.test.ts`, `web/test/type-tokens.contrast.test.ts`, `web/package.json` (no `stylelint`/`postcss`/`css-tree` in the dependency tree), `docs/planning/sprint-2/91_REQUIREMENTS_v3.md` (R-36, R-46, R-50, R-53, §3 S2-styling-1, §4 D-19/D-20, §6 Q14/Q15/Q23), `docs/planning/sprint-2/parked/81_PHASE13_styling.md`, `project-state/DECISIONS.md` (2026-09-14 sidebar boot-script row) — all read 2026-09-24 in this repo.
