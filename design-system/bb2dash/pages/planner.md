# Planner Page Overrides

> **PROJECT:** bb2dash
> **Generated:** 2026-10-08 15:01 by the ui-ux-pro-max skill, then edited by hand to direction D, and again after the three critics reviewed the pass.
> **Page type:** Schedule. A week grid of class meetings and his own events, with due items in a band on top.
> **App files:** `web/src/app/(app)/planner/`, `web/src/components/planner/` (PlannerWeek, PlannerBoard, PlannerEventBlock, PlannerItemPopover, PlannerEventForm, PlannerEventWizard)

> **IMPORTANT:** Rules in this file **override** the Master file (`design-system/bb2dash/MASTER.md`).
> Only what differs from the Master is here.

---

## Page-Specific Rules

### Layout

- **Nothing moves.** Row heights, `slotToPx`, the lanes and the day columns are pinned by tests and are out of scope for Phase 22. No rule here changes a size, a padding or a position.
- The week scrolls sideways inside its own box at narrow widths, under the themed scrollbar.

### Colour

- A class meeting is the strongest fill of the planner family (`--color-accent-2-800` at 78% over the card). The six kinds he adds himself sit under it in tone, each with its own edge. Out of office keeps its hatch, a working location its dashed edge and an appointment slot its dotted one, so the kinds read apart without colour.
- Today's day name is the ink over the red underline. The now line is `--color-accent-500` with no glow.

### Components

- **Event block:** it is clickable, so it shows it: under the pointer it gains a hairline inset outline in its own edge colour. Inset, so its box does not change. It is written as a box-shadow beside the block's own edge, with no mix and no new literal, and not as an outline: a working-location block and an appointment slot already use their outline to say what kind they are.
- **Done box:** drawn by the app at 12px, through the one checkbox rule of `globals.css`: a hairline edge in the block's text colour; ticked, it fills and a tick in the block's own fill scales in over `--motion-press`. Its hit area is under 24px. A larger invisible hit area would lie over the first pixels of the title beside it, and a tick is a write, so that needs his word and a look in the real planner.
- **Status select in a block:** a field like any other: neutral 600 edge, neutral 400 on hover, the 2px ring on focus (today its focus is a 1px edge colour with `outline: none`). While a pick is being saved it is busy, not off: half strength and the wait pointer, never the flat grey box.
- **Item popover:** arrives from the block it belongs to: fades in and grows from 0.97 at the side nearest the block, over `--motion-enter`. Written with `@starting-style`, since it is mounted when it opens.
- **Event form and wizard:** fields, selects and checkboxes as the Master draws them. Their checkboxes are bare inputs in a label, and the one rule in `globals.css` reaches them with no markup change. Delete is the secondary button with its words in the danger colour.
- **Series scope dialog:** when its list reaches its end the page behind does not start to scroll (`overscroll-behavior: contain`).

### Motion

- Changing week does not slide. The grid is replaced. A slide across seven columns is more motion than "minimal", and the grid is the heaviest thing on the page to move.
- No drag is animated beyond what the planner does today.

---

## States

- **Loading the week:** Its loading line shows at once today. It waits 240ms and fades in once only when the `data-loading` attribute is ruled in (the entry `loading-attribute`, the PM's call). A still grid that holds the week's height needs his word.
- **A week with nothing:** the grid is the empty state. No message is laid over it.
- **An error from the server:** the shared error notice, in the form the Master gives it.

---

## Recommendations

- The planner is the densest screen. Keep hover and focus marks inside the block (inset), never outside it, so nothing is clipped by a neighbour.
- Times line up already: the body face sets its figures on one width, so no rule is added for it. The planner budgets its lines by character count and nothing here changes a glyph's width.
- The line under the grid that explains it ("Times are as recorded", "Click an empty slot to add an event") is set as product copy. Moving it out of the margin is a call for him (the entry `copy-captions`).
