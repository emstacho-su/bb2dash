# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/bb2dash/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, follow the rules below.

---

**Project:** bb2dash
**Generated:** 2026-10-08 15:01 by the ui-ux-pro-max skill, then edited by hand the same day until it describes direction D ("Charcoal") as Stack picked it. The generator's own colours, fonts, spacing, shadows, component CSS, page pattern and script-driven motion are gone. The list of what was overridden, and why, is the last section. Edited again after three critics reviewed the pass: every sentence here now says what the app does, or says that it waits.
**Category:** Personal academic dashboard: a productivity tool for one student (the generator said "Smart Home/IoT Dashboard").
**Design dials:** Variance 2/10 (minimal) | Motion 2/10 (subtle) | Density 8/10 (dense, dashboard)
**Source of truth for values:** `direction-d.json` beside the tile (both maps). This file explains them. If the two disagree, the JSON wins.
**Source of truth for what is built:** `component-changes.json` and `REFINEMENT.md`, section 4. This file describes the whole direction. A line marked **waits** is not in the default build.
**Stack:** Next.js 16 and React 19, CSS Modules and custom properties. No Tailwind, no UI framework, no new dependency of any kind.
**Platform:** Desktop web, and the Electron 44 desktop shell on Windows 11. A phone-width layout exists and is kept working.

---

## Global Rules

### Colour

Dark is the default. Light is available. The palette is black, grey and white with one hue.

| Role | Token | Dark | Light |
|------|-------|------|-------|
| Ground | `--color-bg` | `#050505` | `#f4f4f4` |
| Panel (the side panel) | `--color-panel` | `#111111` | `#e9e9e9` |
| Card | `--color-surface` | `#1d1d1d` | `#ffffff` |
| Card, held | `--color-surface-press` | text at 8% over the card | text at 8% over the card |
| Text | `--color-text` | `#f2f2f2` | `#111111` |
| Muted text | `--color-muted` | text at 64% | text at 68% |
| The ink (called accent) | `--color-accent` | `#fafafa` | `#0a0a0a` |
| Divider | `--color-divider` | white at 30% | black at 16% |
| Hover wash | `--color-hover` | text at 7% | text at 6% |
| Pressed wash | `--color-active` | text at 13% | text at 11% |
| The one hue | `--color-accent-500` | `#ff0000` | `#ff0000` |
| Words on the one hue | `--color-on-accent` | `#000000` | `#000000` |
| Error words | `--color-danger` | `#ff8f85` | `#a31515` |
| Error tint | `--color-danger-bg` | `#ff0000` at 16% | `#ff0000` at 8% |
| Scrollbar thumb | `--color-scrollbar` | neutral 600 | neutral 600 |
| Scrollbar thumb, pointer on it | `--color-scrollbar-hover` | neutral 400 | neutral 400 |

Neutral ramp, 100 to 900. 100 is the strong end on either ground.
Dark: `#fafafa #e6e6e6 #d1d1d1 #bababa #a3a3a3 #969696 #6b6b6b #3a3a3a #262626`.
Light: `#0a0a0a #1f1f1f #333333 #474747 #595959 #696969 #848484 #d6d6d6 #efefef`.

**Red is opt-in.** `--color-accent` is the ink, and every accent step but 500 points at the neutral step of the same number. A rule is red only when it names `--color-accent-500`. Red marks three things: where you are (the current page, today, the current course), what is most urgent (exam, and a second red for project) and what is unread. Red is never text.

**Work types are one urgency scale:** exam `#ff0000`, project `#ff6257` (light `#a80000`), quiz white (light `#111111`), assignment `#b5b5b5` (light `#484848`), reading `#7a7a7a` (light `#808080`).

Components name tokens. No rule in a module holds a raw colour, and no rule in a module writes a new `color-mix()`: a tint that a rule needs is a token in `globals.css` (the token audit counts every mix in a module).

### Typography

- **Headings:** Source Serif 4 at 600 (`--font-heading`, `--font-heading-weight`).
- **Body:** Source Sans 3 at 400, 500, 600 and 700 (`--font-body`).
- **Figures:** Source Code Pro at 400 (`--font-mono`).
- **Loaded by:** the one Google Fonts `@import` in `globals.css`, with `display=swap`. No font package and no `next/font` (brief 103).
- **Sizes (pinned by tests, they do not move):** 11, 12.5, 13.5, 15, 17, 20 and 28px (`--text-xs` to `--text-2xl`). Body is 15px at line height 1.55. Headings are line height 1.12 with tracking -0.015em.
- **Figures line up already.** Source Sans 3 and Source Serif 4 as served set figures on one width, so no rule asks for tabular figures. Scores, points and course codes are in the mono face.
- **Titles balance:** `text-wrap: balance` on headings and on Inbox and popout titles.
- **Hierarchy in a dense screen comes from weight and colour before size:** a title at 600, a value at 400 in the text colour, a label in small capitals in neutral 500, a note in the muted colour.
- **Waits (decision 2):** the serif for titles only, with small labels and controls in the body face; dates and times out of the mono face; nothing under 11px; the fonts served by the app. Drawn on the tile under Proposed.

### Spacing (pinned by tests, they do not move)

| Token | Value |
|-------|-------|
| `--space-1` | 2.8px |
| `--space-2` | 5.6px |
| `--space-3` | 8.4px |
| `--space-4` | 11.2px |
| `--space-6` | 16.8px |
| `--space-8` | 22.4px |
| `--space-12` | 33.6px |

`--nav-height` 52px, `--sidebar-width` 260px, `--content-max` 1240px. This is the app's own 0.7 scale. It is not a 4px grid, and the pass does not change it.

### Shape

| Token | Value | Used for |
|-------|-------|----------|
| `--radius-xs` | 1px | the brand mark, a checkbox |
| `--radius-sm` | 3px | small chips, planner blocks |
| `--radius-md` | 4px | cards, fields |
| `--radius-lg` | 6px | large cards, floating panels |
| `--radius-control`, `--radius-chip` | 999px | buttons, tags, chips, round badges |
| `--radius-bar` | 4px | bars of Upcoming work |
| `--radius-day` | 8px | a day column |
| `--size-check` | 13px | a checkbox the app draws |
| `--size-focus`, `--size-focus-gap` | 2px, 2px | the focus ring and its gap |
| `--size-scrollbar` | 10px | a scrollbar |

The top bar is square with a rule under it. Buttons are pills. Cards are square or nearly square with a clear edge.

### Elevation

| Token | Dark | Light | Means |
|-------|------|-------|-------|
| `--shadow-sm` | 1px ring, neutral 700 | 1px ring, neutral 800 | a card at rest |
| `--shadow-hover` | 1px ring, neutral 500 | 1px ring, neutral 600 | a card under the pointer |
| `--shadow-md` | the ring and a drop | the ring and a soft drop | a raised card |
| `--shadow-lg` | a deep drop, no ring | a deep drop, no ring | a floating panel, which draws its own divider edge |

A drop shadow means the thing floats over the page. Hover never adds one.

---

## Motion

A small number of quiet transitions. No decoration: no illustration, gradient, glow, parallax or scroll effect. CSS transitions and keyframes only.

| Token | Value | Used for |
|-------|-------|----------|
| `--motion-press` | 80ms | a press: scale on a pill |
| `--motion-state` | 120ms | hover, a field in focus, picked, ticked: a colour eases |
| `--motion-enter` | 180ms | a menu, a popover or a toast arriving; the side panel and the search field, which keep the motion they have |
| `--motion-enter-lg` | 240ms | the popout arriving |
| `--motion-delay` | 240ms | how long a loading line waits before it shows |
| `--motion-shift` | 6px | the one distance a panel travels as it arrives |
| `--motion-spin` | 900ms | one turn of a progress mark |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | what arrives, and every state change |
| `--ease-linear` | `linear` | a progress mark |
| `--motion-control` | the one transition list | every control: `transition: var(--motion-control)` |
| `--motion-exit`, `--motion-exit-lg`, `--ease-in` | 120ms, 160ms, `cubic-bezier(0.4, 0, 1, 1)` | **waits.** What leaves. Declared only when panels may leave (decision 3). |

Rules:

1. What this pass makes move, moves by `transform` and `opacity`. Colour is the one other thing that eases (fill, edge, text, underline, shadow colour). Two motions the app already has animate width and are the exceptions: the side panel opening and closing, and the search field growing. They keep their motion and read the tokens. Changing them waits (decision 3).
2. Leaving is shorter than arriving, where a thing leaves at all. In the default build panels arrive and do not leave with motion.
3. A panel opens from its trigger: `transform-origin` at the corner nearest the button.
4. Nothing loops and nothing decorates. The two progress marks the app already has (Sync while a sync runs, search while it searches) are the only loops, at one speed. Under reduced motion both stand still; the words beside them stay.
5. One or two things move in a view at most.
6. Under `prefers-reduced-motion` nothing eases, slides, fades or turns. One thing is kept: the wait before a loading line, so a fast answer still never flashes it. The line then shows with no fade.
7. The focus ring does not ease. The theme switch does not animate.
8. No state waits for a transition to end. A second press in the middle of one lands in the new state.
9. No rule outside `globals.css` writes a time or a curve of its own (the Time check).

Where motion is allowed: hover and press feedback; a field's edge on focus; a menu or popover opening; the popout opening; a toast arriving; a loading line fading in once; the side panel and the search field as they are. Nowhere else.

---

## Component Specs

The samples show the shape of a rule. Values come through tokens: a weight or a size that is not written here is the token the sweep names for it (brief 103, Weight check), and no sample is to be pasted with a literal added.

### Buttons

```css
.btn {
  font-family: var(--font-body);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: var(--motion-control);
  user-select: none;
}
.btn:active:not(:disabled) { transform: scale(0.98); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btnPrimary { color: var(--color-bg); background: var(--color-accent); border-color: var(--color-accent); }
.btnPrimary:hover:not(:disabled) { background: var(--color-neutral-200); border-color: var(--color-neutral-200); }
.btnPrimary:disabled { background: var(--color-neutral-800); border-color: var(--color-neutral-800); color: var(--color-neutral-600); opacity: 1; }

.btnSecondary { background: var(--color-neutral-900); border-color: var(--color-neutral-600); }
.btnSecondary:hover:not(:disabled) { background: var(--color-neutral-800); }
.btnGhost:active:not(:disabled) { background: var(--color-active); }
```

One primary button per view. Danger is the secondary button with its words in `--color-danger`. No button is red. No button lifts on hover.

### Cards

```css
.card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);        /* the edge */
}
/* only a card that is a link reacts to the pointer; its hover fill is the rule the app has */
.courseCard { transition: var(--motion-control); -webkit-user-drag: none; }
.courseCard:hover { box-shadow: var(--shadow-hover); }
.courseCard:active { background: var(--color-surface-press); }
```

A card that does nothing has no hover and no pointer.

### Fields, selects, checkboxes

```css
.input {
  background: var(--color-bg);                  /* a well */
  border-color: var(--color-neutral-600);
  border-radius: var(--radius-md);
  caret-color: var(--color-accent);
  transition: var(--motion-control);
}
.input:hover { border-color: var(--color-neutral-400); }
.input:focus-visible { border-color: var(--color-accent); outline-offset: calc(var(--size-underline) * -1); }   /* the ring sits on the hairline edge */
/* waits for the PM's ruling on aria-busy: until a busy field says so, off cannot be told from busy */
.input:disabled:not([aria-busy="true"]) { background: var(--color-neutral-900); border-color: var(--color-neutral-800); color: var(--color-neutral-600); cursor: not-allowed; }

/* globals.css: one rule reaches all six checkboxes, and weighs nothing, so a module's class still wins */
:where(input[type="checkbox"]) { appearance: none; width: var(--size-check); height: var(--size-check); border: var(--size-underline) solid currentColor; border-radius: var(--radius-xs); }
```

A select is a field with `cursor: pointer`. The list it opens is Windows' own in the default build; the app drawing it **waits** (decision 4). A checkbox is drawn by the app. Most fields have a visible label over them; the search field and the status selects are named by `aria-label` alone today, and that is left as it is.

### Focus

```css
:focus-visible { outline: var(--size-focus) solid var(--color-accent); outline-offset: var(--size-focus-gap); }
```

One ring everywhere: 2px of the ink. The gap is 2px outside a control, 2px inset on a row or cell that sits flush in a clipped box, and back by the hairline on a field, so a focused field shows 2px of ink. No rule removes the ring without drawing the same ring another way. `html { scroll-padding-top: var(--nav-height) }` keeps a focused control out from under the sticky bar.

### Floating panels: menus, popovers, toasts, the popout

```css
.dd {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg), 0 0 0 var(--size-underline) var(--color-divider);
  transform-origin: top right;                 /* the corner nearest its button */
  overscroll-behavior: contain;                /* where the panel scrolls */
  transition: opacity var(--motion-enter) var(--ease-out), transform var(--motion-enter) var(--ease-out);
}
@starting-style { .dd { opacity: 0; transform: scale(0.97); } }
```

The popout fades in and rises by `--motion-shift` over `--motion-enter-lg`; its backdrop is a plain scrim with no blur. A toast sits under the control that raised it, never takes focus and uses `role="status"`. It fades in and drops by `--motion-shift`. When it leaves is the app's own rule and this pass does not touch it: a plain toast leaves on the app's timer (`TOAST_MS`, 15 seconds), and a toast that asks for something, the only kind with Dismiss, stays until dismissed. Escape and a press outside close a menu. **Waits:** focus going back to the button that opened a menu, and to Sync after Dismiss (row 28); panels leaving with motion (decision 3).

A walk spec that reads a panel's rect or takes its picture runs with `reducedMotion: 'reduce'`, so the panel is at rest on its first frame.

### Scrollbars

```css
@media (hover: hover) and (pointer: fine) {
  ::-webkit-scrollbar { width: var(--size-scrollbar); height: var(--size-scrollbar); }
  ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-thumb { background-color: var(--color-scrollbar); background-clip: padding-box; border: 2px solid transparent; border-radius: var(--radius-control); }
  ::-webkit-scrollbar-thumb:hover { background-color: var(--color-scrollbar-hover); }
}
```

In `globals.css`, where the 2px is allowed. 10px, no arrow buttons, a clear track, and only where a pointer is the way in. The Upcoming strip keeps its own rule, which a test pins: it stays a thinner, square bar with arrows until that test is changed (decision 6).

### States

- **Loading:** the words wait 240ms, then fade in once. The default build does this for the line on Home. Every other loading line needs one attribute (`data-loading`), which is the PM's to rule. Still rows that hold the space of what is coming **wait** (decision 4). No shimmer.
- **Empty:** today one muted sentence. A title, one sentence and one action, with no box of its own, **waits** (decision 4).
- **Error:** the shared error notice: the danger tint, the danger words, a bar down the left edge and the word "Error". An error is never delayed and never fades in.
- **Cannot be used:** one strength, opacity 0.5, on every disabled rule. Each rule keeps the pointer it has: `not-allowed` on a button, `progress` on the four that are disabled only while they work (Sync, a status select, the popout's controls, a pending planner block).
- **Busy is not off.** In this app nearly every disabled control is a busy one: 24 of its 43 disabled sites are disabled on a pending save alone. So the flat grey "off" look for a field or a select is written on `:disabled:not([aria-busy="true"])`, and it **waits** for the PM's ruling that puts `aria-busy` on the busy ones (the entry `busy-says-busy`). A busy control sits at half strength with `cursor: progress`, and its words say what it is doing ("requesting…").

### Chrome

`user-select: none` and `-webkit-user-drag: none` on the controls of the chrome: the brand, the top bar's links and icons, Sync, menu rows and menu heads, buttons, tab and mode groups, the side panel's rows, small capital labels, table heads and day columns. Never on the bar or on a menu's box: results, announcements, Activity lines and a toast hang from the bar and must stay copyable. Content selects.

### The window (waits, decision 1)

The app's top bar as the window's title bar, with Windows' own three buttons in the app's colours; the window as a frame whose panes scroll; a context menu in fields; a page for a load that fails. Drawn on the tile, first fragment. None of it is in Phase 22.

---

## Style Guidelines

**Style:** Minimalism and Swiss style (the one part of the generated output that fits, and it came back for all four queries): clean, functional, high contrast, grid-based, essential.

**Key effects:** quiet hover, sharp edges in place of soft shadows, a clear type hierarchy, fast loading.

### Page pattern

An application shell, not a landing page: a top bar with six pages, a course side panel, one content column. There is no hero and no call to action. One line of the generated pattern is kept because the app already lives by it: a figure is labelled as current only when it is backed by a source, with the time it was read ("as of") and a stale state.

---

## Anti-Patterns (Do NOT Use)

- Red as text, a red button, a red focus ring, or red for anything but where you are, most urgent and unread.
- A second hue.
- A gradient, a glow, a blur, an illustration, parallax or a scroll effect.
- A hover that lifts, grows or moves a thing.
- A transition on `all`. A new transition on width, height or position.
- Anything that loops for decoration. A shimmer on a skeleton.
- A count-up on a figure. A grade is shown, never animated.
- An animation library, an icon package or a font package.
- Emoji as icons.
- A state that changes with no feedback, and a loading word that flashes.
- An error or an empty line that waits or fades in. Only a loading line waits.
- A busy control dressed as a switched-off one.
- `user-select: none` on a container whose children hold words to copy.
- A dashed box around an empty state: it reads as a drop zone.
- A focus ring removed and not replaced.
- A made-up number anywhere.

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] Every colour, radius, shadow, time and curve is a token. No time or curve is written outside `globals.css`.
- [ ] No module gains a `color-mix()` or a size literal.
- [ ] Red appears only as a mark, and only for the three things it means.
- [ ] Every control has hover, press, focus and switched-off states, in dark and in light.
- [ ] One focus ring: 2px of the ink.
- [ ] `cursor: pointer` on what acts, `not-allowed` on what is off, `progress` on what is busy. No busy control is dressed as off.
- [ ] Text contrast 4.5:1 and marks 3:1, measured in each theme separately.
- [ ] What the pass makes move, moves by transform and opacity.
- [ ] `prefers-reduced-motion` stops every transition and animation, and keeps the wait before a loading line.
- [ ] Every box that scrolls shows the themed scrollbar, in the real window, in both themes.
- [ ] No sideways page scroll at 390px. Wide tables scroll inside their own box.
- [ ] None of the 18 layout tokens changed. The planner's geometry is as it was.
- [ ] No new dependency.

---

## Generated advice that was overridden

The skill's generator ran with: `"academic productivity dashboard schedule content hub dark mode monochrome professional" --design-system --variance 2 --motion 2 --density 8 -p "bb2dash"`. Three other queries gave the same style and other colours.

| Generated | Kept or replaced with | Why |
|-----------|----------------------|-----|
| Category "Smart Home/IoT Dashboard" | A personal academic dashboard | The matcher took "dashboard" and "home". The product is a student's planner and content hub. |
| Slate ground `#0F172A`, card `#1B2336`, status-green accent `#22C55E`, border `#475569`, destructive `#EF4444` | Stack's palette: black, grey, white and `#ff0000` | His words: "Accent colors should be grey, white, and #ff0000 red". |
| Fira Code headings, Fira Sans body | Source Serif 4, Source Sans 3, Source Code Pro | The faces he picked. |
| Spacing 2, 4, 8, 12, 16, 24, 32px | The app's 2.8 to 33.6px scale | The seven spacing tokens are pinned by tests. |
| Shadows: soft drops at 5 to 15% black | A 1px ring for a card, a deep drop for a floating panel only | A 10% black shadow cannot be seen on `#050505`. He picked cards "with a clear edge". |
| Buttons: 8px corners, 12px 24px padding, `transition: all 200ms ease`, hover `opacity 0.9` and `translateY(-1px)`, white words on green | Pills, the app's padding, named properties over 120ms, no lift | Pills are his pick. A lift on hover is decoration. `transition: all` is what the skill's own animation rules warn against. |
| Cards: 12px corners, 24px padding, `cursor: pointer` and a hover lift with a larger shadow on every card | 4 and 6px corners, the app's padding, pointer and hover only on a card that is a link, an edge and no lift | Square cards are his pick. A card that does nothing should not look like it does. |
| Inputs: `outline: none` with a 3px soft glow, 16px text | The 2px ink ring, the app's text size | The glow is under the skill's own focus rule (a ring of 2px or more at 3:1). 16px is a phone floor against zoom. |
| Modals: 16px corners, white, `backdrop-filter: blur(4px)` | The popout: 6px corners, card fill, a plain scrim | No blur: it is an effect, and the scrim alone is enough. |
| Motion: a GSAP ScrollTrigger scroll reveal, 300 to 400ms | CSS transitions and one keyframe, 80 to 240ms, no scroll effects | No new dependency. "Minimal motion animations" is read as quiet and purposeful. |
| Page pattern "Real-Time / Operations Landing": hero, metrics, how it works, start a trial | An application shell | There is nothing to sell and nobody to convert. |
| "Anti-patterns: slow updates, no automation" | The list above | Not about this product. |
| "Always use transitions (150 to 300ms)" | 80ms for a press, 120ms for a state, none for the theme switch or the focus ring | The skill's own timing rule says not to treat one range as universal. |
| Checklist: responsive at 375, 768, 1024, 1440 | Shot at 390 and 1280, measured at 768 and 1024 | 390 is the project's phone width. |
| Checklist: icons from Heroicons or Lucide; `import { Bell } from '@phosphor-icons/react'` (icons#33, icons#94) | The inline Phosphor paths the app has, and two more of the same family for the bar's bell and Sync if he says yes | No icon package. The skill's choice of icon and weight is kept; its import line is not. |
| Toasts: auto-dismiss after 3 to 5 seconds, never one that stays (ux#82) | The app's own timer, 15 seconds, and a toast with Dismiss stays | One kind of toast carries a command to copy, and one asks for his hand. This pass changes how a toast arrives, not when it leaves. |
| `scroll-behavior: smooth` on `html` (ux#1) | No smooth scroll | A page that glides to an anchor is motion with no cause he asked for. The quiet reading. |
| Use `next/font`, no external font link (nextjs#22) | The one Google Fonts `@import` | Brief 103 rules `next/font` out by name. It is on the list as a call for him (decision 2). |
| Custom title bar: extend the client area and set a drag region; no hand-drawn caption buttons (winui#55) | Kept as written, for the desktop task that waits | It is the same advice in Electron's terms: `titleBarOverlay` keeps Windows' own three buttons. |
