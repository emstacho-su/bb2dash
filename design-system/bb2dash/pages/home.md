# Home Page Overrides

> **PROJECT:** bb2dash
> **Generated:** 2026-10-08 15:01 by the ui-ux-pro-max skill, then edited by hand to direction D, and again after the three critics reviewed the pass.
> **Page type:** Dashboard. The day at a glance: Upcoming work, the course cards, what needs attention.
> **App files:** `web/src/app/(app)/Today.tsx`, `Today.module.css`, `NeedsAttention.*`, `web/src/components/tracker/UpcomingTracker.*`

> **IMPORTANT:** Rules in this file **override** the Master file (`design-system/bb2dash/MASTER.md`).
> Only what differs from the Master is here.

---

## Page-Specific Rules

### Layout

- No change. The content column fills what the side panel leaves; there is no max width on the shell (DECISIONS 2026-09-14). The generated "max width 1200px, centred sections" is dropped.
- The course cards stay a two-column grid, one column at 820px and under.

### Spacing and typography

- No overrides. The seven spacing tokens and the seven sizes are pinned.

### Colour

- Upcoming work is the one place the urgency scale is drawn as bars: exam `#ff0000`, project the second red, quiz white (black in light), then two greys. Round badges carry the letter, so a type is never told by colour alone.
- Today is the ink at weight 600 over a 2px red underline. The picked day is a filled grey column inside a neutral 600 outline.
- A course card's meeting days are neutral 700 against neutral 800. The due dot is the ink.

### Components

- **Day column:** hover takes `--color-hover` (the token, in place of its own 6% mix). A press takes `--color-active`. Picking a day eases its fill and outline over `--motion-state`. The bars do not grow in; they are drawn.
- **Course card:** it is a link, so it reacts: the fill goes up 4% and the edge goes to `--shadow-hover`. No lift and no drop shadow. A press goes to `--color-surface-press`, a token, so the module writes no new mix. The card does not drag: `-webkit-user-drag: none`.
- **The strip's scrollbar:** it keeps its own rule (`scrollbar-width: thin`, two colour tokens). `upcoming-tracker-css.test.ts` pins it, and it is the strip's visible slider. So it stays a thinner, square bar with arrow buttons, the one bar on the page that is not the app's own. Making it match changes two assertions of that test (decision 6).
- **A course card's week strip:** a meeting day and a plain day differ by tone alone, at about 2 to 1. One tone, filled for a meeting day and hollow for a plain one, is a taste call that waits (decision 6; drawn on the tile under Proposed).
- **Folds and pagers:** today they are text characters. One icon family is the Master's rule; replacing them needs his word.

---

## States

- **Loading:** the line that says the courses are loading waits 240ms and fades in once. This is the one loading line the default build changes, because its class dresses that line and nothing else. Under reduced motion it keeps the wait and drops the fade. Card-shaped still rows that hold the grid's height need his word.
- **Empty day:** one muted sentence today. The empty-state form of the Master (a title, a sentence, one action, no box of its own) needs his word and his wording.
- **The legends:** the lines that explain the strip, the dot and the Undated list are set as product copy today. Moving them out of the margin is a call for him (the entry `copy-captions`).
- **Stale:** the "as of" and "courses stale" notes stay as they are. A figure is never animated and never shown without its source.

---

## Recommendations

- Truncate a course title with an ellipsis only where the full title is one click away (the card is the link).
- Sample data on a tile or a test page is named as a sample.
- Nothing on Home slides, pulses or counts up.
