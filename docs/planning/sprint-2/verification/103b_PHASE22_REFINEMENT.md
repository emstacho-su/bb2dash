# Phase 22, the refinement pass on direction D

Date: 2026-10-08. Run with the ui-ux-pro-max skill, after the direction was built as a tile and before the visual build starts. This is a design pass. No app code was changed. Everything it wrote is in this folder.

The pass was written once, then reviewed by three independent critics, then reworked. This is the reworked write-up. Section 12 lists every point the critics raised and what was done with it.

## 1. His words

Stack, 2026-10-08:

> "Tell phase 22 to use /ui-ux-pro-max during its design execution to sharpen the visual aspects to make this feel like a high-end full production centralized content and schedule interface dashboard. The end goal of the graphic design is to have a sleek, modern tech design with minimal motion animations and graphics. This still feels like an electron app and I want it to feel like a professional grade application."

And then:

> "insert the /ui-ux-pro-max skill usage requirement as a new pass prior to the beginning of the visual build. This should be a separate refinement pass after the current phase of work builds."

This run is that pass.

What did not move: direction D ("Charcoal"), dark by default with a light version, black, grey and white with `#ff0000` as the one hue, red opt-in and never text, the five work types as one urgency scale, Source Serif 4 at 600, Source Sans 3 and Source Code Pro, the square top bar, pill buttons, square cards with a clear edge, the Upcoming work block. The 18 layout tokens and the planner's geometry are as they were.

Three readings I took where the brief left room. Each is a default, and each is easy to turn.

1. **What the default build is.** A token, or a declaration on a rule that already exists, can be built by the phase's own workers with no word from Stack: a `transition`, a `:active` rule, `user-select`, `cursor`, the scrollbar block. It moves no box. Anything that needs markup, script, layout, spacing, a type size or the desktop shell beyond its background waits for a word. The default build does **not** fit brief 103 as it is frozen: the brief freezes 55 entries, six token families and the expected lines of its checks. So its label is "fits once the brief is amended", and section 11 is the amendment.
2. **"Minimal motion animations and graphics"** is read as a few quiet, purposeful transitions and no decoration. If he meant more motion than that, or a small set of icons, it is decision 3.
3. **"Transform and opacity only"** is read as: what the pass makes move, moves by transform and opacity. A colour also eases on hover and press, because hover feedback is a colour change. It repaints one element and lays nothing out. Setting `--motion-state` to 0ms makes it instant if he wants the strict reading.

## 2. The skill, as it was run

The skill was invoked through the Skill tool in both rounds and `SKILL.md` was read in full: its rule categories, the quick reference, the how-to steps, the pre-delivery checklist and the professional-UI rules.

### Step 1, the requirements

| | |
|---|---|
| Product type | Productivity tool: a personal academic dashboard. Schedule, content, grades, an Inbox of questions and a chat workspace in one place. Not a landing page. |
| Audience | One student. Daily use, long sittings, often in the evening. A laptop, in the Electron desktop shell and in a browser. Pointer and keyboard. |
| Style keywords, from his words | high-end, full production, centralized content and schedule dashboard, sleek, modern tech, minimal motion, minimal graphics, professional grade, not an Electron app |
| Stack | Next.js 16.3.4 (App Router), React 19.3.0, TanStack Query, CSS Modules and custom properties (`web/package.json`). No Tailwind, no UI framework. Desktop: Electron 44.4.1 (`desktop/package.json`). |
| Platform | Desktop web and Electron on Windows 11. A phone-width layout exists and is kept working. |

### Step 2, the design system

Four generator runs, all with `--variance 2 --motion 2` and `--density 7` or `8`:

| Query | Style it chose | Colours it chose | Faces it chose |
|---|---|---|---|
| academic productivity dashboard schedule content hub dark mode monochrome professional | Minimalism and Swiss | slate with status green | Fira Code, Fira Sans |
| productivity task calendar tool dark minimal | Minimalism and Swiss | teal with orange, light | Inter |
| education student planner dashboard | Minimalism and Swiss | rose with gold, light | Fira Code, Fira Sans |
| monochrome black white red accent dashboard | Minimalism and Swiss | grey with indigo, dark | Fira Code, Fira Sans |

The style came back the same four times and fits (`style#1`). Nothing else it produced could be used as it was. The first run was persisted with `--persist --output-dir` here and `--page` for home, planner, grades, inbox and workspace. I then rewrote `MASTER.md` and the five page files by hand until they describe direction D, and rewrote them again after the review so that each sentence says what the app does or says that it waits. `MASTER.md` ends with a table of every generated recommendation that was overridden and why. In short:

| Generated | Why it was overridden |
|---|---|
| Category "Smart Home/IoT Dashboard" | Wrong product. The matcher took "dashboard" and "home". |
| Slate and green palette | His palette wins: black, grey, white and `#ff0000`. |
| Fira Code and Fira Sans | The faces he picked win. |
| A 2 to 32px spacing scale | The seven spacing tokens are pinned by tests. |
| Soft drop shadows at 5 to 15% | Cannot be seen on `#050505`. He picked a clear edge. |
| Buttons with `transition: all`, a hover lift, 8px corners | Pills are his pick. A lift is decoration. The skill's own animation rules warn against `all`. |
| Every card a pointer with a hover lift | A card that does nothing must not look as if it does. |
| Inputs with `outline: none` and a soft glow | Under the skill's own focus rule. The 2px ink ring stays. |
| Modal with `backdrop-filter: blur(4px)` | No blur. |
| A GSAP ScrollTrigger scroll reveal | No dependency, no scroll effect. CSS only. |
| Page pattern "Real-Time / Operations Landing" | There is no landing page. One line of it is kept: a figure is called current only with its source and its time. |
| Page files: "max width 1200px", "minimal glow", "auto-advance slides" | No max width on the shell (DECISIONS 2026-09-14). No glow. Nothing auto-advances. |
| Toasts leave after 3 to 5 seconds and never stay (ux#82) | The app holds a plain toast 15 seconds and keeps one that asks for something. One kind carries a command to copy. The pass changes how a toast arrives, not when it leaves. |
| `scroll-behavior: smooth` on `html` (ux#1) | A page that glides to an anchor is motion he did not ask for. |
| An icon package import (icons#33, icons#94) | No package. The skill's choice of icon and weight is kept as inline paths. |

### Step 3 and step 4, focused searches

54 searches in two rounds, one intent each. The scripts are `work/skill-search.js` and `work/skill-search-round2.js`, and the full results, with each row's number in the skill's own CSV, are in `work/skill-searches.json` and `work/skill-searches-round2.json`. The search output does not print row numbers, so the scripts look them up by the row's name.

Round 1, 38 searches:

| Domain | Query | Hits | What came back |
|---|---|---|---|
| ux | keyboard focus visible ring | 4 | #28 Focus States, #101, #100 Focus Not Obscured, #41 Keyboard Navigation |
| ux | focus not obscured sticky | 4 | #101, #100, #2 Sticky Navigation, #102 Focus Appearance |
| ux | dropdown menu keyboard | 4 | #41, #45 Skip Links, #63, #28. Nothing about menus. |
| ux | modal dialog escape close | 1 | #28 only |
| ux | loading skeleton spinner | 4 | #78 Loading Indicators, #47, #19 Content Jumping, #10 Loading States |
| ux | empty state message action | 4 | #79 Empty States, #3, #5, #119 |
| ux | disabled state button | 4 | #4, #31 Disabled States, #3, #5 |
| ux | form label error feedback | 4 | #61, #80, #33, #44 |
| ux | toast notification dismiss | 1 | #82 Toast Notifications |
| ux | hover feedback cursor pointer | 4 | #29 Hover States, #11 Hover vs Tap, #103, #94 |
| ux | animation duration easing | 4 | #8 Duration Timing, #14 Easing Functions, #12 Continuous Animation, #9 Reduced Motion |
| ux | reduced motion | 4 | #9, #7 Excessive Motion, #99 Motion Sensitivity, #8 |
| ux | navigation active state | 4 | #3 Active State, #5, #2, #30 Active States |
| ux | z-index stacking | 2 | #18, #15 Z-Index Management |
| ux | scroll nested regions | 3 | #1, #69, #99. Off the subject. |
| ux | truncation ellipsis tooltip | 3 | #84, #113, #116 Compact Label Overflow |
| ux | tabular numbers data | 3 | #86, #91, #96. Off the subject. |
| ux | badge chip label wraps | 4 | #116, #118 Contextual Live Badge Updates, #54, #114 Compact Label Semantics |
| ux | live badge count screen reader | 4 | #118, #42, #109, #39 |
| ux | rapid chip animation interrupted | 4 | #119 Cancellable State Transitions, #12, #115, #116 |
| style | dark mode | 1 | #7 Dark Mode (OLED) |
| style | minimalism swiss | 1 | #1 Minimalism and Swiss Style |
| style | monochrome editorial | 4 | #56, #66, #47, #69. None is a dashboard style. |
| typography | dashboard data dense | 4 | #42 Dashboard Data (the Fira pair), #47, #51, #65 |
| typography | serif heading sans body editorial | 4 | #59, #4, #35, #14 News Editorial |
| google-fonts | Source Serif 4; Source Sans 3 | 4 each | All three of his faces are in the dataset. My lookup found no row number for them. |
| icons | icon button accessible label | 4 | #105 icon-context-accessibility, and three off the subject |
| icons | chevron caret disclosure | 0 | No match. |
| web | focus keyboard | 3 | #17, #18, #31. This domain is phone app guidance. Set aside. |
| react | suspense streaming loading | 3 | #5 Suspense Boundaries, #9, #6 |
| react | rerender memo list | 4 | #19, #20, #21, #24 |
| stack nextjs | font loading | 4 | #5 Handle loading states, #22 Use next/font, #23, #24 |
| stack nextjs | loading suspense streaming | 4 | #10 Use streaming, #5, #17, #41 |
| stack nextjs | link prefetch navigation | 4 | #43, #42, #44, #22 |
| stack react | transition state update | 4 | #3, #57, #2, #1 |
| stack react | focus ref accessibility | 4 | #44 Manage focus properly, #58, #26, #43 |
| product | productivity dashboard education | 4 | #16 Productivity Tool, #9 Educational App, #7, #24 |

Round 2, 16 searches, for what the review added:

| Domain | Query | Hits | What came back |
|---|---|---|---|
| stack winui | title bar custom window | 4 | #55 Extend client area into the title bar: a drag region, and no hand-drawn caption buttons. The other three are off the subject. |
| stack wpf | window chrome title bar | 0 | No match. |
| stack winui | context menu right click | 4 | Off the subject. No verified match. |
| ux | toast auto dismiss duration | 4 | #82 Toast Notifications (3 to 5 seconds), #8, #108, #96 |
| ux | loading button disabled async | 4 | #32 Loading Buttons, #31 Disabled States, #10, #4 |
| ux | nested scroll chaining | 3 | #1 Smooth Scroll, #69, #99. Off the subject. |
| ux | text selection drag | 4 | #103 Dragging Movements, and three off the subject |
| ux | icon style consistent stroke | 2 | Off the subject. The Quick Reference's `icon-style-consistent` stands. |
| ux | pointer target size | 4 | #104 Target Size (Minimum), #22, #1, #103 |
| ux | error retry offline | 4 | #80 Error Recovery, #44, #55, #109 |
| ux | visual hierarchy weight size | 4 | #74 Font Size Scale, and three off the subject |
| ux | color only indicator shape | 4 | #37 Color Only, #36, #28, #107 |
| icons | bell notification | 1 | #33 bell, at the regular weight |
| icons | refresh sync arrows | 3 | #94 arrows-clockwise, at the regular weight, #70, #69 |
| typography | label uppercase small | 2 | Off the subject. |
| ux | layout shift scrollbar | 4 | #19 Content Jumping, #75 Font Loading, #17, #18 |

An earlier try, `menu popover dropdown dismiss` in ux, returned nothing.

**Rules I rely on, by id.** From the dataset: `ux#28`, `ux#102`, `ux#100`, `ux#41`, `ux#45`, `ux#78`, `ux#19`, `ux#10`, `ux#79`, `ux#31`, `ux#32`, `ux#29`, `ux#30`, `ux#8`, `ux#14`, `ux#12`, `ux#9`, `ux#7`, `ux#99`, `ux#119`, `ux#82` (overridden), `ux#3`, `ux#116`, `ux#114`, `ux#118`, `ux#104`, `ux#80`, `ux#74`, `ux#37`, `style#1`, `style#7`, `icons#105`, `icons#33`, `icons#94`, `nextjs#22`, `nextjs#5`, `nextjs#10`, `react#44` (stack), `react#5` (domain), `winui#55`, `product#16`, `product#9`. From the Quick Reference, by name: `state-transition`, `duration-timing`, `motion-consistency`, `transform-performance`, `exit-faster-than-enter`, `modal-motion`, `easing`, `excessive-motion`, `motion-meaning`, `interruptible`, `cancellable-state-transitions`, `scale-feedback`, `press-feedback`, `tap-feedback-speed`, `cursor-pointer`, `loading-buttons`, `focus-states`, `focus-appearance`, `focus-not-obscured`, `reduced-motion`, `color-not-only`, `web-target-size`, `skip-links`, `keyboard-nav`, `disabled-states`, `empty-states`, `loading-states`, `progressive-loading`, `content-jumping`, `toast-accessibility`, `heading-line-balance`, `elevation-consistent`, `state-clarity`, `icon-style-consistent`, `dark-mode-pairing`, `effects-match-style`, `blur-purpose`, `primary-action`, `font-loading`, `nav-state-active`, `escape-routes`, `platform-adaptive`, `system-controls`, `error-recovery`, `scroll-behavior`.

**No verified match, so general guidance was used and is labelled as such.** Menus and popovers: the WAI-ARIA menu button pattern, with the Quick Reference's `escape-routes` and `modal-motion`. Scrollbars, nested scroll boxes and scroll chaining: no rule in the dataset beyond `scroll-behavior`. Disclosure icons: `icon-style-consistent` only. Chrome that does not select or drag, and a native context menu: no rule; these are desktop conventions, checked against `platform-adaptive`. A custom title bar: one verified match, `winui#55`, written for another toolkit and saying the same thing.

**Set aside as phone-only.** `safe-area-awareness`, `haptic-feedback`, `bottom-nav-limit`, `bottom-nav-top-level`, `tab-bar-ios`, `top-app-bar-android`, `dynamic-type`, `touch-target-size` at 44pt (the 24px `web-target-size` applies in its place), `touch-spacing`, `touch-density`, `touch-friendly-input`, `input-type-keyboard`, `tap-delay`, `gesture-conflicts`, `standard-gestures`, `system-gestures`, `swipe-clarity`, `drag-threshold`, `gesture-nav-support`, `gesture-feedback`, `orientation-support`, `mobile-first`, the 16px phone floor of `readable-font-size`, and the `web` domain. The skill scopes its "Common Rules for Professional UI" and its long checklist to phone apps by its own notice; section 9 says which lines carry over.

**Set aside by the quiet reading and the no-dependency rule.** `spring-physics`, `stagger-sequence`, `shared-element-transition`, `continuity`, `navigation-direction`, `hierarchy-motion`, `parallax-subtle`, `number-tabular` (the faces already do it, see section 12), the whole `gsap` domain, and the `landing` domain.

## 3. Diagnosis: why it still feels like an Electron app

The app was not run for this pass. The evidence is the source in `bb2dash-wt-22` and the screenshots in the walk folders. The counts come from searches of the stylesheets and from `work/count-app.js`. Ten causes, each one true of this app. They are in the order he would meet them, and the first three are the ones no stylesheet reaches.

1. **A default window frame, and Electron's default menu one key away.** `desktop/src/main/window.ts:251-264` sets no `titleBarStyle` and no `titleBarOverlay`. `autoHideMenuBar: true` (line 261) hides the File, Edit, View, Window, Help menu until Alt is pressed, and the comment at 258-260 says so. Nothing in `desktop/src` touches `nativeTheme`, so the Windows bar above the page follows Windows, not the app: a light bar over a black page whenever the two differ. No `context-menu` handler exists either, so a right click does nothing, in a text field too. Under that bar the app is a website navigation bar: a brand word and six text links.
2. **The window opens in a colour that is not the app's.** `window.ts:256` and the update prompt paint `#12131a`, and `web/src/app/layout.tsx:12` sets `themeColor: '#161826'`. Both are the old navy. The window is destroyed and rebuilt at every open (`window.ts:243-245`), so the wrong first frame would show each time. Brief 103 already fixes this in tasks 9 and 11. It is listed here because it is a cause, not because it needs a new item.
3. **The whole document scrolls, chrome and all.** `Shell.module.css:2` is `min-height: 100dvh` and the bar is `position: sticky` (`TopNav.module.css:5`). The Inbox shot in walk-17 is 4,783px tall and Grades 4,303px. In `walk-21/08-desktop.png` the page's scrollbar runs the full height of the window, beside the top bar. STATUS, Known issues, adds that the shell is 1px taller than its window on every screen, so that scrollbar is always there with 1px of travel.
4. **Default scrollbars.** Of eleven scroll boxes one is themed, the Upcoming strip (`UpcomingTracker.module.css:66-81`), and one hides its bar. The page, all seven vertical boxes and two sideways ones use the browser's bar: the side panel, the popout, the bell, the search results, the Activity menu, the message column, the series dialog, the report-card strip and the planner week. `08-desktop.png` shows two of them, wide and with arrow buttons, one cutting the rounded corner of the answer box. When a floating list reaches its end, the page behind it starts to scroll.
5. **States snap.** 47 CSS modules hold 53 `:hover` rules. `transition` appears in one file (`CourseSidebar.module.css:31, 163`), and it animates `width`. `:active` exists only in `tokens.module.css:130, 137`: the top bar's links and icons, Sync, the tabs, the rows and the day columns have no pressed state at all. A menu is mounted and unmounted (`TopNav.tsx:151`) and appears with no origin.
6. **Default form controls.** 12 native selects styled by four different rules, drawn with the browser's arrow and Windows' list (walk-17 shots 09, 12 and 02). Native date fields with the browser's calendar glyph. Four text areas with the browser's corner grip (`resize: vertical`, for example `Composer.module.css:19`). Six checkboxes, five of them the browser's default; only `PlannerWeek.module.css:750` sets `accent-color`.
7. **The chrome behaves like a document, and its tooltips are Windows'.** No rule sets `user-select: none`: dragging across the top bar selects its words. No rule stops a link from dragging: every link in the bar, each side panel row and each course card is an anchor, and a press and a pull lifts a ghost of the link. 49 elements carry a `title` attribute, which gives the delayed system tooltip, and for the icon buttons that is the only visible name.
8. **Focus and switched-off differ from control to control.** 26 rules repeat the ring with four gaps: 2px twelve times, -2px eleven, 1px twice, 0 once. Three rules remove it and change a 1px edge colour in its place (`StatusSelect.module.css:19-22`, `Popout.module.css:226`, `NavSearch.module.css:61`), which is under the 2px a focus mark needs. A disabled control is at opacity 0.45, 0.55 or 0.6, with three different cursors. And in this app disabled nearly always means busy: 24 of the 43 `disabled={...}` sites are disabled on a pending save alone, and only one control says `aria-busy` (the update row, `TopNav.tsx:166`).
9. **Loading flashes and empty is a bare line.** There is no `loading.tsx` under `web/src/app`, so a route change shows nothing until the new screen answers. Loading is the word "loading…" in a paragraph (`QueryState.tsx:62`, `Today.tsx:268`) that is then replaced by content of another height. An empty place is one muted sentence (`Inbox.module.css:100`, `MessageList.module.css:81`, `walk-21/02-empty.png`).
10. **Mixed icons, and type set as a document.** The bar draws four outlined icons on a 256 grid, one filled one (the bell, `icons.tsx:12-18`) and a Sync arrow on a 24 grid from another set (`SyncButton.tsx:238`). Folds, pagers, close and outbound marks are text characters: 41 of them in 20 files (`Today.tsx:326`, `PlannerWeek.tsx:114`, `CourseGradeCard.tsx:136`). A bold serif is set on controls and table heads, dates and timestamps are in the code face, and a 10px capital label sits over almost every figure: 60 font sizes are literals off the token scale, 38 of them 9 or 10px. The fonts arrive through a CSS `@import` (`globals.css:18`) and swap in after the first paint.

Four more, found by the review and true of the app:

- **The screens caption themselves like a developer's notes.** Legends and how-to lines are set as product copy (`Today.tsx:252`, `UpcomingTracker.tsx:498` and `:510`, `PlannerWeek.tsx:254`), and Blackboard's status code is printed as it comes, in capitals with underscores (`GradebookTable.tsx:238`, `SubmissionBlock.tsx:175`).
- **The app's own mark stays in the old colours.** `desktop/build/icon.png`, `icon.ico` and `tray-16.png`, and `web/src/app/favicon.ico` and `apple-icon.png`, are a lavender ring on navy. After direction D the taskbar, the window's corner and the tray carry the one hue the direction removed.
- **No screen for a load that fails.** The shell retries on a backoff and then leaves a blank window (`window.ts:172-176`, `211-213`).
- **The page shifts sideways** by the scrollbar's width between a page that scrolls and one that does not (the Workspace and `/login` do not).

## 4. The refinement list

**The sixteen rows of the default build make the page behave better. They do not change what it is.** With all sixteen built, the app is still a website navigation bar sitting under a Windows bar, with Electron's menu on Alt and the whole page scrolling, chrome included. That is the web page in a frame, and it is the cause he named. It is rows 17 and 18, it needs his word, and it is decision 1.

The list is in two tables, each ordered by how much a row changes the feel. The ids are the entries of `component-changes.json`, which holds the full wording, the files and the owner of each.

### The default build: fits once brief 103 is amended (section 11). No word from Stack needed.

Seen at rest on every screen first, then what is felt under the pointer, then the small things.

| # | What changes | Where | Kind | Owner | Skill rule |
|---|---|---|---|---|---|
| 1 | Scrollbars in the theme, on the page and in every box: 10px, no arrows, a round thumb. `scrollbars-themed` | `globals.css`, one block inside `@media (hover: hover) and (pointer: fine)`, three tokens | token, CSS | W-67, task 8 | `effects-match-style`, `dark-mode-pairing`; general guidance |
| 2 | A select reads as a field. A checkbox is drawn by the app, by one rule that reaches all six. `select-as-field`, `checkbox-drawn` | StatusSelect, Popout, SearchPanel, `tokens.module.css`; `globals.css` | CSS, one token | W-67, W-68, W-69 | `consistency`, `state-clarity` |
| 3 | The controls of the chrome do not select and do not drag. Content does. `chrome-no-select` | TopNav, SyncButton, CourseSidebar, `tokens.module.css`, tabs, table heads, Today's card | CSS | all four | `platform-adaptive`; general guidance |
| 4 | One focus ring: 2px of the ink, three gaps, and the three rules that removed it get it back. `focus-ring-one` | `globals.css` and 30 rules in 16 modules | token, CSS | all four | `focus-states`, `focus-appearance`, ux#28, ux#102 |
| 5 | Hover says one thing: a wash on rows, a grey underline on a top bar link, a stronger edge and no lift on a card. `hover-grammar` | TopNav, Today, UpcomingTracker, SearchPanel, PlannerWeek; `--shadow-hover` | token, CSS | W-68, W-69 | `state-clarity`, `elevation-consistent`, ux#29 |
| 6 | A control that cannot be used is at one strength, 0.5. Each rule keeps its pointer, so busy stays busy. `disabled-one-look` | seven `:disabled` rules | CSS | W-67, W-68, W-69 | `disabled-states`, `loading-buttons`, ux#31, ux#32 |
| 7 | States ease and no longer snap: one line, `transition: var(--motion-control)`, on every control. `motion-tokens`, `state-transitions` | `globals.css` `:root` and a reduce block; about twenty rules | token, motion | all four | `state-transition`, `motion-consistency`, ux#8, ux#29 |
| 8 | Every control answers a press: a pill scales to 0.98, a row or icon takes the active wash, a named text link dims. `press-states` | the same modules; `--color-surface-press` | CSS, motion, one token | W-67, W-68, W-69, W-70 | `press-feedback`, `scale-feedback`, ux#30 |
| 9 | A floating panel arrives from its trigger, with `@starting-style`. `panels-arrive` | TopNav `.dd`, NavSearch, SyncButton `.toast`, Bell, PlannerItemPopover, InboxApplyButton, Popout; the two walk specs | motion | W-68, W-69 | `modal-motion`, `easing`, `motion-meaning`, ux#14 |
| 10 | Titles break evenly. `titles-balance` | `globals.css`, InboxCard, Popout | type rule, no size | W-67, W-68, W-69 | `heading-line-balance` |
| 11 | Home's loading line waits 240ms, then fades in once, so a fast answer never flashes it. `loading-never-flashes` | `Today.module.css` `.muted` | motion | W-69 | `loading-states`, ux#78 |
| 12 | The theme switch is instant: two frames are marked and transitions are off inside them. `theme-switch-instant` | `globals.css`; the theme stamp of tasks 9 and 10; one test case | motion; **script, so the PM rules** | W-67 | `excessive-motion`, `motion-meaning` |
| 13 | The last two effects go: the fading rule and the popout's blur. `decoration-out` | `tokens.module.css` `.rule`, Popout `.backdrop` | CSS | W-67, W-68 | style#1, `blur-purpose` |
| 14 | A floating list keeps the wheel at its end. `scroll-chaining` | five scroll boxes; not the side panel | CSS | W-68, W-69 | `scroll-behavior`; general guidance |
| 15 | A focused control is not left under the sticky bar. `focus-not-under-bar` | `globals.css` `html`, one line | CSS | W-67 | `focus-not-obscured`, ux#100 |
| 16 | The six lines that hold a time today read the tokens. `time-tokens-shell` | CourseSidebar, NavSearch, SyncButton | token | W-68 | `motion-consistency`, `duration-timing` |

Sixteen rows, eighteen entries. All but row 12 are CSS alone. Together they add 18 token names, one line to about twenty rules, and five small blocks to `globals.css`. None changes a layout token or a size. None adds a `color-mix()` or a size literal to a module: the three rules that first did are rewritten (section 12). None edits a vitest file that exists, except the one new case row 12 adds to `ThemeMenu.test.tsx`, a file the phase is writing anyway. Row 9 changes how the two new walk specs must be written.

### Waits for a word

"His word" is Stack's. "PM" means the product manager can rule alone.

| # | What changes | Where | Kind | Size | Whose word |
|---|---|---|---|---|---|
| 17 | **One desktop task.** The app's top bar is the window's title bar, with Windows' own three buttons in the app's colours. A context menu in fields, the app's own short menu, a page for a load that fails, the update prompt in D. `desktop-title-bar`, `desktop-shell-details` | `desktop/src/main/window.ts`, `index.ts`, TopNav `.bar`, `globals.css` | desktop shell | medium, once row 18 is settled | his; decision 1 |
| 18 | The window is a frame and the panes scroll inside it. Removes the 1px. `app-frame-panes` | `Shell.module.css`, TopNav, CourseSidebar | layout | large; its own task | his; decision 1 |
| 19 | The bar's bell and Sync at the weight of its other four icons. `icons-bar-one-weight` | `icons.tsx`, `SyncButton.tsx`: two inline paths | markup | small | his; decision 3 |
| 20 | The app's own mark in direction D. `app-mark` | five image files | image | small | his; decision 6 |
| 21 | Type: the serif for titles only; dates and times out of the code face; a floor of 11px; the fonts served by the app. `labels-in-the-body-face`, `type-floor`, `fonts-with-the-app` | eight rules; 38 size literals; `layout.tsx` | type | small to medium | his; decision 2 |
| 22 | The text characters used as marks become five inline SVGs. `icons-text-characters` | `icons.tsx`, 20 files | markup | medium | his; decision 3 |
| 23 | Still rows hold the space while a list loads, and a route change shows them at once. And every loading line waits, not Home's alone. `states-loading-skeleton`, `loading-attribute` | `QueryState.tsx`, a `loading.tsx` per route; one attribute at nine sites | markup | medium; the attribute alone is small | his for the rows; PM for the attribute; decision 4 |
| 24 | An empty place gets a form: a title, a sentence, one action, no box of its own. `states-empty` | five `.empty` rules and their screens | markup, spacing | medium | his; decision 4 |
| 25 | The list a select opens is drawn by the app, where the engine can. A text area grows and loses its grip. `select-list-drawn`, `textarea-grows` | one `@supports` block; four text-area rules | CSS, behaviour | medium | his; decision 4 |
| 26 | Panels also leave, in two thirds of the time. `menus-leave` | TopNav, Bell, ActivityMenu, NavSearch, SyncButton, PopoutShell; three held tokens | behaviour | small; two tests bind | his; decision 3 |
| 27 | The bar's icon buttons name themselves with the app's own small label. `tooltips-drawn` | the six controls of the bar | markup | small | his |
| 28 | The keyboard in the shell: a skip link, a menu that acts like one, focus that comes back. A toast's timer waits while he reads it. `keyboard-in-the-shell`, `toast-waits` | `layout.tsx`, `usePopover.ts`, the menus, `SyncButton.tsx` | markup, behaviour | medium | his |
| 29 | A busy control says busy, so off can get its own look: a flat grey field. `busy-says-busy` | `aria-busy` at about 24 sites; two rules | markup | medium | PM |
| 30 | The legends and how-to lines leave the margin, and Blackboard's status code is put into words. `copy-captions` | six TSX sites | copy | small | his; decision 6 |
| 31 | Four pointer targets reach 24px. `pointer-targets` | Popout `.close`, the phone brand mark, the planner's done box and title | spacing | small | his; decision 6 |
| 32 | The two width animations the app has become transform and opacity. `width-animations` | CourseSidebar `.rail`, NavSearch | motion | small | his; decision 3 |
| 33 | In a course card's week strip a plain day is an outline and a meeting day is filled. `week-strip-shape` | `Today.module.css` | CSS | small | his; decision 6 |
| 34 | The Upcoming strip's scrollbar becomes the app's own. `tracker-scrollbar` | `UpcomingTracker.module.css`; `upcoming-tracker-css.test.ts:30-33` | CSS, one test | small | PM; decision 6 |
| 35 | The page stops shifting sideways between a page that scrolls and one that does not. `page-gutter-stable` | `globals.css` `html`, one line | CSS that moves boxes | small | PM; decision 6 |

Nineteen rows, 25 entries: 21 need his word and 4 the PM's ruling.

## 5. The motion spec

### Tokens

| Token | Value | For | Declared by the default build |
|---|---|---|---|
| `--motion-press` | 80ms | a press | yes |
| `--motion-state` | 120ms | hover, a field in focus, picked, ticked | yes |
| `--motion-enter` | 180ms | a menu, a popover, a toast arriving; the side panel and the search field as they are | yes |
| `--motion-enter-lg` | 240ms | the popout arriving | yes |
| `--motion-delay` | 240ms | the wait before a loading line shows | yes |
| `--motion-shift` | 6px | the one distance a panel travels as it arrives | yes |
| `--motion-spin` | 900ms | one turn of a progress mark (Sync turns in 1.1s and search in 0.7s today) | yes |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | what arrives, and state changes | yes |
| `--ease-linear` | `linear` | a progress mark | yes |
| `--motion-control` | the one transition list | `transition: var(--motion-control)` on a control | yes |
| `--motion-exit` | 120ms | a menu, a popover, a toast leaving | **held** until row 26 is a yes |
| `--motion-exit-lg` | 160ms | the popout leaving | **held** |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | what leaves | **held** |

No rule outside `globals.css` writes a time, a curve or an easing keyword of its own. Two scales stay as plain numbers in the rules: 0.98 for a press and 0.97 for a panel. The three held names are used by the leave rules alone, and brief 103 forbids a declared name no rule uses, so the default build does not declare them. The tile declares them because it shows the leaving; they sit in `direction-d.json` under `tileOnly`, outside the two maps the build writes.

### Where motion is allowed

| Place | What happens | Tokens | In the default build |
|---|---|---|---|
| Hover | fill, edge or text colour eases | `--motion-state`, `--ease-out` | yes |
| Press | a pill scales to 0.98; a row takes the active wash | `--motion-press` | yes |
| Focus | the ring appears at once, with no motion; a field's edge colour eases | `--motion-state` for the edge only | yes |
| A menu or popover | fades in and grows from 0.97 at the corner nearest its trigger | `--motion-enter`, `--ease-out` | arriving yes; leaving waits (row 26) |
| The popout | fades in and rises by `--motion-shift`; the scrim fades | `--motion-enter-lg` | arriving yes; leaving waits |
| A toast | fades in and drops by `--motion-shift` from under its control. It leaves on the app's own timer (`TOAST_MS`, 15 seconds). A toast that asks for something, the only kind with Dismiss, stays until dismissed. This pass changes how a toast arrives, not when it leaves. | `--motion-enter` | arriving yes |
| A loading line | waits, then fades in once | `--motion-delay`, `--motion-enter` | Home's line yes; the others need one attribute (row 23) |
| The side panel, and the search field | as today: the panel's width eases and the field's width grows. They read the tokens. | `--motion-enter`, `--ease-out` | times yes (row 16); what they animate waits (row 32) |
| A progress mark | Sync's arrows while a sync runs, the search ring while it searches: one turn in `--motion-spin` | `--motion-spin`, `--ease-linear` | yes (row 16) |
| The theme switch | **none**. Decided. | | yes (row 12) |
| Changing page, changing week, a list reordering, a figure changing | **none** | | |

### Rules

1. What the pass makes move, moves by `transform` and `opacity`. Colour is the one other thing that eases. Two motions the app already has animate width, and they are the two he meets most: the side panel opening and closing (`CourseSidebar.module.css:31`) and the search field growing (`NavSearch.module.css:55, 65`). They are the exceptions. They keep their motion and read the tokens; changing them is row 32, and it is put to him in decision 3.
2. Leaving is shorter than arriving, two thirds, where a thing leaves with motion at all. In the default build nothing does.
3. A panel opens from its trigger.
4. Nothing loops and nothing decorates. The two progress marks the app already has are the exception. They are status, not ornament. Under reduced motion both stand still. Sync already does. The search ring turns once in 2s for that reader today (`NavSearch.module.css:94-96`); the pass stops it, the word "Searching…" stays, and the dead rule is deleted. If he wants the slow turn kept, the reduce block's animation line loses `!important`.
5. At most one or two things move in a view. One panel is open at a time. An error or an empty line never waits and never fades: only a loading line does.
6. Under `prefers-reduced-motion` nothing eases, slides, fades or turns. One thing is kept: the wait before a loading line, so the flash the pass removes does not come back for that reader. The line then shows whole, with no fade.
7. No state waits for a transition to end. A second press in the middle of one lands in the new state.
8. The desktop shell runs with hardware acceleration off (`desktop/src/main/index.ts:401`, his call of 2026-09-30). The motion was measured in a test browser only. If the popout stutters in the real window, `--motion-enter-lg: 0ms` makes it simply there: one token, no rule change.

## 6. The design system

`design-system/bb2dash/MASTER.md` and `design-system/bb2dash/pages/` (`home.md`, `planner.md`, `grades.md`, `inbox.md`, `workspace.md`), in this folder. Generated by the skill, then rewritten by hand to describe direction D. `direction-d.json` stays the source of the values; the Master explains them. After the review every sentence in them says what the app does, or carries the word **waits** and the row it waits on. The code samples are headed "the shape of a rule": they name tokens and write no weight, size or mix that the brief's checks would reject.

## 7. What changed on the tile

The earlier tile is kept as `tile-d.before.html`, with its four pictures in `before/shots/`. The refined one is `tile-d.html`, with its pictures in `shots/` and 46 close looks in `shots/look/` (44 from `look-refine.js`, 2 from `work/measure-tile.js`). The pass is one rerunnable list: `refine-d.js` reads `before/` and writes `template.html`, `direction-d.json` and `component-changes.json`; the list itself is in `refine/`, in the order of section 4.

Three new fragments:

- **The window**, first on the page. The desktop window drawn twice, side by side, each a picture of a 1280 by 800 window with sample data. First as the default build leaves it: Windows' own bar above the app's bar, and the page scrollbar running the full height beside the bar. Second as rows 17 and 18 would make it: one bar, the three window buttons at its end, the side panel fixed, one pane scrolling under the bar. Every size in a drawing is in window pixels, so it is true at any width. This is where decision 1 points.
- **States**, after Buttons. A loading block, an empty state with no box of its own, switched-off controls with one busy control beside them, and a list that scrolls.
- **Proposed, not applied**, above the swatches. Five rows, each a thing as the build will leave it beside what the pass proposes: labels and controls in the body face; dates and times in the body face; nothing under 11px; the bar's icons at one weight; a plain day as an outline. This is where decisions 2, 3 and 6 point.

What is live or changed in the fragments that were there:

- **Every control eases, and answers a press.** Move over the top bar, the buttons, the day columns, a course card. Hold Save: it gives by 2%.
- **One focus ring.** Tab through the page. The box the four course cards sit in now leaves room for the ring.
- **Hover.** A top bar link shows a grey underline where the red one would be. A course card's edge goes one step stronger and nothing lifts.
- **Scrollbars.** The page itself, the list under States, and the boxes that scroll sideways at phone width. The Upcoming strip's bar is the one left as it was, and a note under the strip says so.
- **The chrome's controls do not select and do not drag.** Drag across the top bar, then across the Inbox title. A toast's words can still be selected.
- **A drawn checkbox.** Tick the task in Planner blocks.
- **Live controls.** Account opens the account menu, with the three theme rows of brief 103, which work. Menu in the phone bar opens the six pages. Sync raises a toast that stays until Dismiss or a second press, as the app's toast of that kind does. The popout closes and comes back and keeps its space. A day column and a search mode can be picked.
- **The theme switch is instant.** Switch with a menu open: no control lags behind the page.

**Marked on the page.** A small outlined mark, "needs your word", sits on the window's second drawing, on the Proposed fragment, on the Loading and Empty cards and under the search panel, whose course list is drawn by the app. The opening lines of the tile name all of them, and say that a menu and the popout fading out as they close is the one more thing that waits and cannot carry a mark.

Four changes to the tile's tools, each in my copies only. `tile-lib.js` allows the two new token families. `build-tile.js` reads `tileOnly` from the direction file, for the three names the tile declares and the build does not. `shoot-tile.js` waits for an animation that ends before it takes its picture. `look-refine.js` takes the close looks and measures what a still picture cannot show.

## 8. Checks run

| Run | Result |
|---|---|
| `node refine-d.js` | 55 entries before, 51 added, 106 in all: 18 for the default build, 21 that need his word, 4 more for the PM to rule, 8 the tile's own. 21 new token names: 18 in the dark map, 3 held in `tileOnly`. Dark map 125 names, light map 77. |
| `node build-tile.js d` | built; 128 tokens on the tile (95 of `globals.css`, 33 new: 12 of direction D, 18 of the default build, 3 the tile's alone), 77 redeclared in light |
| `node check-tile.js d` | exit 0. 294 rows: 138 pass, 0 fail, 0 warn, 156 info. Before the pass: 260 rows, 138 pass. |
| `node shoot-tile.js d` | exit 0. 60 rows: 40 pass, 0 fail, 0 warn, 20 info. Four pictures: 1280 by 5,083 and 390 by 9,669, dark and light. |
| `node look-refine.js` | exit 0. 108 rows: 64 pass, 0 fail, 44 info (the pictures). |
| `node work/measure-tile.js` | no sideways page scroll at 1280, 1024, 768 and 390px; 63 controls with the pointer cursor, 5 switched off with `not-allowed`, 1 busy with `progress`; 27 headings, no skipped level |
| `node work/probe-round2.js` | the two redrawn icons draw as meant; a box with `overscroll-behavior: contain` and no overflow of its own swallows the wheel in Chromium 153; a checkbox rule written with `:where()` loses to a one-class rule |
| the Time check, on the app as it is | prints six lines, all in `web/src/components/shell/`: the target after row 16 is no output |

What `look-refine.js` measured, in both themes. The window is drawn twice at 1280 by 800: as built the scrollbar starts 32 window pixels down, under the Windows bar and beside the app bar; with the task it starts 52 down, under the one bar, which holds 138 pixels of window buttons. The proposals change a face, a size and a shape and nothing else. The page and the sample list each draw a 10px scrollbar. A held press makes the pill 2% narrower. Ten kinds of control show the same 2px ring, and a course card's ring has its 4px of room. The account menu was seen part-way in on 8 frames and part-way out on 7. Escape puts focus back on the button. The theme switch gives the main button its new fill in the same task, with the mark gone afterwards. The toast takes no focus, is still there after 4.3 seconds with focus on Dismiss, its 164 characters can be selected, and Dismiss by keyboard hides it and puts focus on Sync. The course list opens as the app's own list, under its select. A top bar link computes to `user-select: none` and the bar itself to `auto`. Five kinds of link compute to `-webkit-user-drag: none`. The busy Sync has the wait pointer at half strength and says `aria-busy`. The popout keeps its 197.7px while it is away. Tab walks the six links of the phone Menu in order.

With reduced motion asked for: no transition runs and the menu is whole on its first frame. The loading block keeps its 240ms wait with a duration of 0s; played again it was not there until 247ms, then whole, with no frame part-way. The course list and its arrow do not ease: 26 open frames, none part-way, the arrow in one position. Before the fix the list was part-way on 10 of 26 frames.

Contrast. The pairs the new rules draw all pass. The scrollbar thumb is now 5.70:1 on a dark card and 4.52:1 on the light panel, from 3.16 and 3.08. Two rows are still thin, inside the checker's own 0.3 margin of the 3:1 a mark needs, and the checker prints direction pairs as INFO, so its 0 warn does not say so: the grey underline under a top bar link the pointer is on (3.16:1 in dark), and the proposed week strip's tone (3.16:1 in dark, which is the tone a meeting day has today). Two older rows say "would fail": a meeting day against a plain day in the week strip, at 2.13:1 in dark and 2.57:1 in light. They were on the tile before this pass. Row 33 answers them with a shape and is his call.

## 9. The pre-delivery checklist, line by line

The skill scopes its long checklist to phone apps. The lines that carry over to a desktop web product are answered; the rest are marked set aside. This is the final review of the refined tile.

### The short checklist

| Line | Result |
|---|---|
| Run focused searches only for concerns present | Done: 54 searches in two rounds, section 2. |
| Run through Quick Reference 1 to 3 | Done, below. |
| Test on 375px and landscape | 390px, the project's phone width: pass, the three new fragments included. Landscape: set aside. |
| Verify reduced motion; Dynamic Type at largest | Reduced motion: pass, measured, the select's list included. Dynamic Type: set aside. |
| Check dark mode contrast independently | Pass. `check-tile.js` measures each theme by itself. |
| Touch targets 44pt; safe areas | Set aside. The 24px web floor is below. |

### Quick Reference 1, accessibility

| Rule | Result |
|---|---|
| `color-contrast` | Pass. 138 rows, 0 fail; the new pairs pass. Two thin rows are named in section 8. |
| `focus-states`, `focus-appearance` | Pass. One 2px ring in the ink, 15:1 or better, and it is no longer cut off on the course cards. |
| `alt-text` | Not applicable: no image. The two window drawings are `role="img"` with a name that says what each shows. |
| `aria-labels`, `icon-context` | Pass. Every icon button has a name; icons and the badge are hidden from a reader; the badge's name is a whole phrase. |
| `keyboard-nav` | Pass on the tile. In the app the account menu says it is a menu and does not act like one: row 28. |
| `form-labels` | Pass on the tile. In the app the search field and the status selects are named by `aria-label` alone; left as it is. |
| `skip-links` | Not on a tile. Missing in the app: row 28. |
| `heading-hierarchy` | Pass. 27 headings, no skipped level. |
| `color-not-only` | **Partial, as inherited.** The picked theme is a tick, the current page an underline, an error has its word, a work type its letter. A meeting day and a plain day in the week strip differ by tone alone: row 33, drawn under Proposed. |
| `dynamic-type` | Set aside. Its web cousin, text that follows the reader's own font size, does not hold: sizes are in px and pinned. Page zoom works. |
| `reduced-motion` | Pass, measured. The wait before a loading line is kept on purpose. |
| `voiceover-sr` | Not tested with a screen reader. Roles and states are in the markup. |
| `escape-routes` | Pass. Escape and a press outside close a menu; the popout has its close; the toast has Dismiss. |
| `keyboard-shortcuts` | Not on the tile. The app's own are untouched. |
| `focus-not-obscured` | Pass on the tile. In the app: row 15, one line, in the default build. |
| `dragging-alternative`, `consistent-help`, `redundant-entry`, `accessible-authentication`, `auto-rotation-controls` | Not applicable to what the tile draws. |
| `web-target-size` | **Partial.** Four targets are under 24px: the popout's close (28 by 23), the brand mark at phone width (9 by 9), the planner's done box (12 by 12) and title (14 tall). Row 31. |
| `contextual-live-badge-updates` | Pass for the static badge. The app's live behaviour is untouched. |

### Quick Reference 2, touch and interaction

| Rule | Result |
|---|---|
| `touch-target-size`, `touch-spacing`, `haptic-feedback`, `safe-area-awareness`, the gesture rules, `tap-delay` | Set aside. |
| `hover-vs-tap` | Pass. Nothing is reachable by hover alone. |
| `loading-buttons` | Pass. Drawn now: a busy Sync, disabled, at half strength, with the wait pointer and the words "requesting…". |
| `error-feedback` | Pass. The error notice sits at the thing that failed, and no error is delayed. |
| `cursor-pointer` | Pass. 63 controls with the pointer, 5 switched off with `not-allowed`, 1 busy with `progress`, the text field with the text cursor. |
| `press-feedback` | Pass, measured. |
| `no-precision-required` | **Partial.** The 12px done box. Row 31. |

### Quick Reference 3, performance

| Rule | Result |
|---|---|
| `image-optimization`, `image-dimension`, `lazy-load-below-fold` | Not applicable: no image. |
| `font-loading` | **Partial.** `display=swap` avoids invisible text, and the swap is a visible change after the first paint. `next/font` would end it; brief 103 rules it out. Row 21. |
| `font-preload`, `critical-css`, `lazy-loading`, `bundle-splitting` | Next's defaults; untouched. |
| `third-party-scripts` | Pass. None. |
| `reduce-reflows`, `main-thread-budget` | Pass for what the pass adds: nothing new animates a layout property. The app's two width animations remain: row 32. Not measured in the real shell, which has no GPU compositing: section 5, rule 8. |
| `content-jumping` | Pass on the tile: a hover, a press and a panel move nothing, and the popout keeps its space. In the app a loading word still gives way to content of another height: row 23. The page still shifts by the scrollbar's width between two kinds of page: row 35. |
| `progressive-loading` | Shown as still rows; needs his word. |
| `input-latency`, `tap-feedback-speed` | Pass. A press answers in 80ms. |
| `virtualize-lists`, `debounce-throttle`, `offline-support`, `network-fallback` | Not in this pass. A load that fails has no screen in the desktop shell: row 17. |

### The long checklist, the lines that carry over

| Line | Result |
|---|---|
| No emoji as icons | Pass. |
| All icons from one family and style | **Fail, as inherited.** A filled bell, a Sync arrow from another set, a text character for close. Rows 19 and 22; row 19 is drawn under Proposed. |
| Pressed states do not shift layout | Pass. Transform and colour only. |
| Semantic theme tokens throughout | Pass. No literal colour in any rule, and no new mix in a module rule. |
| All tappable elements give pressed feedback | Pass. |
| Timing uses shared tokens | Pass on the tile. In the app six lines hold a literal today: row 16, and the Time check. |
| Disabled states clear and inert | Pass. Busy is told apart from off by its pointer and its words. |
| Focus order matches visual order; labels descriptive | Pass by reading the markup. Not tested with a reader. |
| Text contrast 4.5:1 in both themes, primary and secondary | Pass. |
| Dividers and states distinguishable in both themes | Pass. Looked at in both. |
| Scrim measured against the real background | Not measured: the tile draws no backdrop. |
| Both themes tested | Pass. |
| Scroll content not hidden behind sticky bars | Not on a tile. Row 15 for the app. |
| Verified on small phone, large phone, tablet | 390 and 1280 shot; 768 and 1024 measured with no sideways scroll. No landscape. |
| Gutters adapt | Pass. 16px at 390, 33.6px at 1280. |
| A 4 or 8 spacing rhythm | **By decision, no.** The app's own 0.7 scale, which tests pin. |
| Long text keeps a measure | Pass. Notes are capped at 44 to 68 characters. |
| Icon controls announce their state | Pass. `aria-expanded`, `aria-checked`, `aria-pressed` and `aria-busy` are set and kept. |
| Reduced motion and larger text without breakage | Reduced motion: pass. Larger text: not tested. |
| Toasts leave in 3 to 5 seconds | **Overridden.** The app's 15 seconds stays, and a toast that asks stays. Row 28 would make its timer wait while he reads. |
| Safe areas, gestures, authentication, auto-rotation, failed forms | Set aside or not applicable. |

## 10. Decisions for the product manager

Six. Each has a place to look and the default I took. They are in the order of what changes the feel most.

| # | The call | Where to look | Default taken |
|---|---|---|---|
| 1 | **The window.** Scope, and the cause he named. Rows 17 and 18. The app's bar as the title bar, and the app as a frame whose panes scroll. | The tile, first fragment, The window: two drawings side by side. | Neither is in Phase 22: brief 103 keeps Electron to the window's background, and row 18 is a layout change. I recommend both as the next work after the visual build, row 18 before or with row 17. |
| 2 | **Type.** Taste and scope. Row 21. The serif for titles only; dates and times out of the code face; nothing under 11px; the fonts served by the app. Against the four references this is the largest difference at rest. | The tile, Proposed, the first three rows. | None applied. The faces are his. |
| 3 | **How much motion, and how much graphics.** Taste. (a) Built as the quiet reading: 80 to 240ms, colour eases, panels arrive from their trigger, nothing loops. (b) Panels also leave: row 26. (c) The side panel and the search field animate width, and they are the two motions he meets most: row 32. (d) "Minimal graphics" is read as none. The references put one small icon beside every row and action; the tile has none outside the top bar. Does he mean none, or a small set in one weight? The bar's own icons do not match today: rows 19 and 22. | Move over the top bar; hold Save; open Account, press Escape; close the popout. Proposed, the fourth row, for the icons. | (a) as built. (b) the tile shows both; the build does arriving only. (c) both stay, on the new tokens. (d) no new icons, and the bar's stay as they are. If he meant more motion, the next step up is a fade between pages. If less, `--motion-state: 0ms`. |
| 4 | **Controls and states the app would draw.** Scope: markup, spacing and a few new words. Rows 23, 24 and 25. Still rows while a list loads; an empty place as a form; the list a select opens. | The tile, States, the first two cards, beside the bare line under Notices. The search panel's course list. | The build restyles the closed select and makes Home's loading line wait. The rest waits. |
| 5 | **Amendment 3 to brief 103.** The PM's own ruling; no word from Stack. Without it the build runs the brief as frozen and builds none of rows 1 to 16. It also holds four small rulings: the theme switch's mark (script), `data-loading` (row 23), `aria-busy` (row 29) and the Time check. | Section 11. | Written out there, ready to paste. |
| 6 | **Six small calls, one row each.** (a) The Upcoming strip keeps an old-style scrollbar because a test pins it: row 34. (b) The week strip tells a meeting day by tone alone: row 33. (c) The app's mark is still lavender on navy: row 20. (d) The screens explain themselves in the margin: row 30. (e) Four pointer targets are under 24px: row 31. (f) The page shifts by a scrollbar's width: row 35. | (a) the note under Tracker chips, and the strip at a narrow width. (b) Proposed, the last row. (c) the taskbar. (d) to (f) are not on the tile. | Each is left as it is. (a) and (f) are the PM's to rule; the others are his. |

The cost of decision 1, so it can be weighed. Row 17: the `BrowserWindow` options at `desktop/src/main/window.ts:251-264` (`titleBarStyle: 'hidden'` and `titleBarOverlay`), `app-region` on TopNav's bar, and four things that would each be seen if left out. (a) The overlay's colours are fixed when the window is built, so a light theme needs main to listen for `did-change-theme-color` and call `setTitleBarOverlay`, with the colour map pinned by a new test. (b) The page scrollbar would lie under the three buttons, so row 18 comes before or with it. (c) `/login`, `/privacy`, `/terms`, not-found and a failed load have no bar to drag: a drag strip in `globals.css` and a failed-load page. (d) Page zoom changes the bar's height against the buttons. The desktop tests that load `window.ts` bind: `shell.spec.ts:80-89` stays green only if `autoHideMenuBar` stays and a menu stays installed, and `window.test.ts` and `deeplink.test.ts` need no edit only if nothing new runs at import. Row 18: `.shell` at the window's height, the bar no longer sticky, `.main` scrolling by itself. The browser restores a document's scroll position on Back, not a pane's, so that is done by hand, and every layout test and walk is run again. There is no smaller step worth taking: `nativeTheme.themeSource = 'dark'` would make Auto dark for good in the desktop app.

Not in a decision because the default is plain: tooltips (27) and the keyboard items (28) wait, and each is one row of section 4.

## 11. Hand-off: what amendment 3 of brief 103 must say

The build runs from the brief. As it is frozen, its own checks would fail on the refined `direction-d.json`, or skip the new names. This is the PM's ruling. It needs no word from Stack.

1. **Token families.** New names are allowed in `--motion-*` and `--ease-*` as well as the six families the brief has.
2. **G-2, scope.** `component-changes.json` holds 106 entries. In scope after the amendment: the 55, and the 18 this pass marks for the default build, 73 in all. 25 wait and are named (21 for his word, 4 for the PM). 8 are the tile's own. The label is "fits once the brief is amended", not "in scope". Each new entry carries an `owner` by the brief's file sets; the 55 keep their four keys and the brief's own table.
3. **The checks' expected lines.** The Direction check prints `125 0 77 0 true` (the dark map holds 125 names and the light map 77). The New names check lists 30 names and prints `30 0 <n>` at task 8 and `30 0 0` at task 20: the brief's 12, and `--motion-press`, `--motion-state`, `--motion-enter`, `--motion-enter-lg`, `--motion-delay`, `--motion-shift`, `--motion-spin`, `--ease-out`, `--ease-linear`, `--motion-control`, `--color-scrollbar`, `--color-scrollbar-hover`, `--color-surface-press`, `--shadow-hover`, `--size-focus`, `--size-focus-gap`, `--size-scrollbar` and `--size-check`. The three held names (`--motion-exit`, `--motion-exit-lg`, `--ease-in`) are not in the dark map and are not declared; they sit under `tileOnly`, which no check reads.
4. **The evidence folder.** `direction-d.json`, `component-changes.json` and `tile-d.html` in `docs/planning/sprint-2/evidence/103_style_tiles/` are replaced by the three in this folder. This write-up and the design system files join them.
5. **What lands in W-67's task-8 commit**, ahead of the sweeps, as `.errorNotice` does, because a sweep worker may not edit `globals.css`: all 18 tokens; the scrollbar block; the one checkbox rule; the reduced-motion block; the theme-switching rule; `scroll-padding-top` on `html`; `text-wrap: balance` on the headings; the transition on `a`.
6. **Theme mechanism gains `data-theme-switching`.** Set on the root by `ThemeMenu` on a pick and by the boot script's system-change listener, removed two frames later, never set by the boot stamp. One case in `ThemeMenu.test.tsx`. It is script, so by this pass's own reading it is a ruling and not plain CSS. Without it rows 1 to 16 still work, and a theme switch shows 120ms of easing.
7. **A named Time check**, beside the Weight check, run by each sweep and at task 20. It prints nothing when no time literal, no `cubic-bezier(` or `steps(`, and no easing keyword in a transition or animation value is left outside `globals.css`. A JS timer is not style and is not counted. The scales 0.98 and 0.97 stay plain numbers. The command, from `critic-buildability/time-check.sh`:

   `git grep -n -E '(^|[^a-zA-Z0-9_.#-])[0-9]*\.?[0-9]+m?s([^a-zA-Z0-9_%-]|$)|cubic-bezier\(|steps\(|(transition|animation)[a-z-]*:[^;]*[ ,](ease|ease-in|ease-out|ease-in-out|linear)([ ,;]|$)' -- 'web/src/*.css' ':(exclude)web/src/app/globals.css'`

   Run on the tree as it is, it prints six lines, all W-68's: `CourseSidebar.module.css:31` and `:163`, `NavSearch.module.css:55`, `:82` and `:95`, `SyncButton.module.css:45`. Row 16 takes them to zero.
8. **The token audit.** No row of the default build adds a `color-mix()` or a size literal to a module. The three rules that first did are rewritten: `.btnGhost:active` takes `--color-active`; a held course card takes the new token `--color-surface-press`, declared in `globals.css`, which the audit does not scan; a planner event's hover outline names the block's own edge colour and the size token the sweep gives the edge. Row 5 takes one mix out of `UpcomingTracker.module.css`.
9. **The two new walk specs.** `phone-width.spec.ts` and `theme-walk.spec.ts` each open with `test.use({ reducedMotion: 'reduce' })`. The config stays unedited. A panel now mounts see-through and scaled: a 360px panel anchored right reads left 40.8 at mount and 30 at rest, so a rect read on the first frame would pass a panel up to 10px off the edge, and `toBeVisible` passes at opacity 0. With the reduce block the rect is at rest on the first frame. So that the motion itself has a proof, `theme-walk.spec.ts` gains one case that runs with motion on and finds the account menu's opacity under 1 on its first frame. That takes its frozen titles from 60 to 61, and "60 passed" to "61 passed" in tasks 16 and 22; the shot count stays `30 30 0`. If the PM would rather not reopen the frozen 60, the same proof can be a CSS test that reads the seven panel rules for `@starting-style`.
10. **Acceptance step 5 gains three lines.** In the real window, in both themes: every box that scrolls shows the app's scrollbar (the walk box's headless browser draws none, so nothing automated sees it). In the second desktop instance: open the popout, the account menu and the bell, and write down whether any of them stutters; the fallback is `--motion-enter-lg: 0ms`. And log `process.versions.chrome` once: the test browser here was Chromium 153, no Electron binary is installed in either checkout, and by its release pattern Electron 44 carries about Chromium 152. The four newer features the list uses are older than that (`@starting-style` 117, `transition-behavior` 117, `field-sizing` 123, `appearance: base-select` 135), and each is guarded.
11. **Two attributes the PM may rule in with the amendment or leave.** `data-loading` on QueryState's loading branch and the eight literal loading lines, with one rule in `globals.css` (row 23, entry `loading-attribute`): then every loading line waits, not Home's alone. `aria-busy` on a control that is disabled only while it works (row 29, entry `busy-says-busy`): then off can be told from busy and a switched-off field gets its flat grey look.
12. **What does not change.** The 18 layout tokens, the planner's geometry, the A3 allowlisted declarations, the 54 cases of `phone-width.spec.ts`, and every vitest file that exists today. `upcoming-tracker-css.test.ts`, `NavSearch.css.test.ts` and `planner-css.test.ts` stay green if `.tracker`, the composes rule and `.block`'s overflow are left alone, and they are.

## 12. The review: what the critics found and what was done

Three critics read the first version: one for whether it feels like a professional application, one for restraint and access, one for whether the build session can carry it out. 34 fixes and 16 missing items. I verified each against the tile or the source before acting. All 34 fixes are applied. Two are applied in a different form than asked: the checkbox rule, and `.toastActions`, where two critics asked for opposite things. One is taken further than asked: the disabled look.

### Does it feel like a professional application

| | Finding | Done |
|---|---|---|
| must | The list and the decisions put the cause he named last. | Applied. Section 4 opens with the plain sentence, the table is split in two and each is ordered by feel, the window is rows 17 and 18 and decision 1 with its cost. |
| must | Nothing on the tile shows a window. | Applied. The window is the first fragment, drawn twice at 1280 by 800. Decision 1 points at it. |
| must | `user-select: none` on `.bar` and `.dd` makes what hangs from the bar impossible to copy. | Applied. The rule is on the controls. Measured: a link is `none`, the bar is `auto`, and a toast's 164 characters can be selected. `.toastActions` stays in the list, as the third critic asked: it holds two controls and no words. |
| must | Three rules add a `color-mix()` inside a module; the token audit fails on that. | Applied. Two are written with tokens that exist, one takes a new token. The count of new names is corrected: 21, of which the build declares 18. |
| should | Inside the default build, what is seen at rest sits below what is felt under the pointer. | Applied. Scrollbars, selects and checkboxes, the chrome, the ring, hover and the disabled strength come first. |
| should | Links still drag. | Applied. `-webkit-user-drag: none` beside `user-select` on the same rules, and on the course cards. Measured on five kinds of link. |
| should | The bar's icons do not match, and the row that fixes them is bundled with 41 text characters. | Applied. Split into rows 19 and 22. Row 19 is drawn under Proposed, with the two icons redrawn as inline paths. |
| should | The drawn select opens upward and its arrow hugs the word. | Applied, both lines. Measured: the list is under its select. |
| should | The empty state sits in a dashed box. | Applied. No edge. |
| should | The type call is last and has no picture. | Applied. Decision 2, with three rows under Proposed. Dates and times are added to the proposal. Nothing applied. |
| should | Tabular figures change nothing: the faces already set them. | Applied. Measured again here: 1111 and 0000 are 79.53px with the property and without it. Struck from the cause, the row, the entry, the Master and three page files. |

### Restraint and access

| | Finding | Done |
|---|---|---|
| must | The loading entry would fade in errors and empty lines too. | Applied. Nothing is composed. The default build changes Home's one line, whose class dresses that line alone. The rest is one attribute, for the PM. |
| must | Reduced motion did not reach the select's list or its arrow. | Applied, as a separate rule inside the `@supports` block. `look-refine.js` now reads both pseudo-elements and watches the list open: 0 frames part-way, from 10. |
| must | The toast's time is wrong, and the sample drops keyboard focus. | Applied. The Master and section 5 say the app's 15 seconds and that a toast with Dismiss stays. The sample has no timer, and Dismiss gives focus back to Sync. |
| should | The disabled entry turns Sync's wait cursor into "not allowed". | Applied and taken further, below. |
| should | `a:active` would dim 48 anchors. | Applied. The dim is on the text-link classes by name. |
| should | The Upcoming strip keeps its arrow buttons. | Applied as asked: decision 6 (a) with its test, the default is to leave it, and the tile says so under the strip. |
| should | The scrollbar thumb is thin on contrast and the checker does not say so. | Applied. Neutral 600 and 400. The two rows still thin are named in section 8. |
| should | Two motion rules say things the build will not do. | Applied. Rule 1 names the two exceptions and decision 3 puts them to him. Rule 4 says the search ring stops under reduced motion and the dead rule is deleted. |
| should | The focus ring on the course cards is cut off on the tile. | Applied. Measured: 4px of reach, 4px of room. |

### Can the build session carry it out

| | Finding | Done |
|---|---|---|
| must | The default build is not in scope as brief 103 stands, and there is no hand-off. | Applied. Section 11, twelve points. |
| must | The token set does not fit the default build, and nothing checks times. | Applied. The Time check is point 7. `--motion-spin` and `--ease-linear` are added, the six lines are row 16, the three exit names are held, the three mixes are gone. |
| must | The loading entry cannot be built as written. | Applied, with the first row of the table above. |
| must | The disabled entry would restyle controls that are busy, not off. | Applied and taken further. I surveyed all 43 `disabled={...}` sites: 15 are disabled on `pending`, 6 on `controlsDisabled`, 3 on `busy`, and fields are among them (LoginForm, InboxCard, CourseInfo, the popout's planner block). So the flat grey look could not go on `.input:disabled` either, as the critic allowed: every save would flash it. The default build now makes only the strength one value. The off look is written on `:disabled:not([aria-busy="true"])` and waits with row 29. |
| must | The walk specs would be weakened by panels that arrive. | Applied. Point 9, and the entry. One thing to weigh there: the motion case takes the frozen 60 titles to 61. |
| must | `user-select: none` on the two containers. | Applied, with the third row of the first table. Taken out of the Master's Chrome section too. |
| must | The tile shows four things the default build leaves out, with no mark. | Applied. The mark "needs your word" is on all of them, and the opening lines say that panels leaving is the one that cannot carry it. |
| should | No owner per entry. | Applied. Each of the 51 new entries has an `owner`. |
| should | A shared `.check` cannot reach the five bare checkboxes. | Applied in a different form. One rule in `globals.css`, as asked, but wrapped in `:where()`: written as `input[type='checkbox']` it would outweigh the planner's own class and take its 12px away. Probed. `--size-check` is 13px, the browser's own size. |
| should | Four things the title bar entry leaves out. | Applied. They are in the entry and in the cost of decision 1. The `data-desktop` hook is dropped. |
| should | The smaller desktop step breaks Auto; the context menu and the own menu are not spelled out. | Applied. The smaller step is dropped and the reason is printed. The entry names `context-menu` with role items, a built menu that is never null, and that `autoHideMenuBar` stays. |
| should | Three behaviours the app does not have are stated as facts; the samples write literals. | Applied. Each is corrected or marked as waiting on a row. The samples name tokens and are headed "the shape of a rule". |
| should | The shell runs with the GPU off and the motion was measured in a test browser. | Applied. Point 10 and rule 8, with the one-token fallback. |
| should | The scrollbars have no automated proof and no guard for touch. | Applied. The block sits in `@media (hover: hover) and (pointer: fine)` and the entry says the proof is the PM's look. |

### Missing, as the critics saw it

| Item | Done |
|---|---|
| The diagnosis misses four causes and the dragging. | Added: cause 7 names the dragging, and four more follow cause 10. |
| The screens caption themselves like a developer's notes. | Added as row 30. Checked in the source: it is true at all six sites. |
| The app's own mark stays in the old colours. | Added as row 20. I opened `desktop/build/icon.png`: a lavender ring on navy. |
| No screen for a load that fails. | Added to row 17. |
| "Graphics" was not put to him. | Added to decision 3 (d). |
| `scroll-padding-top` is one CSS line buried in a markup item. | Split out as row 15, in the default build. It changes where a hash link lands, so the walk shots are its proof. |
| Two pointer targets can reach 24px with a hit area and no box moved. | Noted in row 31 and not moved into the build. The done box's larger area would lie over the title beside it, and a tick is a write. It needs a look in the real planner. |
| Under reduced motion the loading flash comes back. | Applied. The wait is kept and the fade dropped. Measured: not there until 247ms, then whole. |
| The week strip tells a meeting day by tone alone. | Added as row 33 and drawn under Proposed. |
| A toast's timer does not stop while he reads it. | Added to row 28. |
| Links still drag. | Applied, above. |
| Scroll chaining. | Added as row 14, in the default build, on the five boxes that float. Not on the side panel: probed in Chromium 153, a box with this declaration and no overflow of its own swallows the wheel, so a short course list would stop the page. |
| The page shifts by the scrollbar's width. | Added as row 35, the PM's call, because it moves boxes. |
| Tabular figures on body would reach the planner's block text. | Moot: the line is struck. |
| The Workspace page file delays "queued". | Fixed in the page file: a word that answers a press shows at once. |
| Electron's Chromium could not be read. | Still true. Point 10 asks the build to log it once. |

## 13. What I could not do

- **Run the app.** No dev server, no desktop shell, no install: the house rules. The diagnosis rests on the source and on the committed screenshots. Nothing was measured in the real window.
- **Read Electron's Chromium version.** The Electron binary is installed in neither checkout.
- **Feel the motion.** It was measured frame by frame, not watched by a person, and not in a window without a GPU. The durations are a starting point for his eye.
- **Draw the window at full size.** The two drawings are pictures at about half scale. They show where the bars and the scrollbar are, not how the window feels to drag.
- **Test with a screen reader, or at 200% text.**
- **Run the token audit or the Time check on the built rules.** They are not built. The Time check was run on the tree as it is, and the rules were read against the audit's own scanner.
- **Make the generator produce direction D.** It cannot take a palette or faces as input. Its output was replaced by hand, as the brief for this pass said to.
- **Find skill rules for menus, scrollbars, scroll chaining, a context menu and disclosure icons.** No verified match. General guidance stands in and is labelled.
- **Publish the tile.** `tile-d.html` is ready to take the earlier page's place. I did not publish it.
