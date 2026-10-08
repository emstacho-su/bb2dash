# Grades Page Overrides

> **PROJECT:** bb2dash
> **Generated:** 2026-10-08 15:01 by the ui-ux-pro-max skill, then edited by hand to direction D, and again after the three critics reviewed the pass.
> **Page type:** Data view. One card per course: the "graded so far" figure, Blackboard's own total, and the gradebook rows.
> **App files:** `web/src/app/(app)/grades/`, `web/src/components/grades/` (CourseGradeCard, GradedSoFarFigure, GradebookTable, ReportCardStrip, GradeModel)

> **IMPORTANT:** Rules in this file **override** the Master file (`design-system/bb2dash/MASTER.md`).
> Only what differs from the Master is here.

---

## Page-Specific Rules

### Layout

- No change. The report-card strip scrolls sideways in its own box under the themed scrollbar. Tables keep their table cells.

### Typography

- Scores and points are in the mono face. Dates and counts in the body face line up already, because the face sets its figures on one width. The Seen column sets a date in the mono face today; moving dates to the body face is a taste call that waits (decision 2).
- Table heads are small capitals and do not select. Whether they stay in the serif is a taste call for him (the entry `labels-in-the-body-face`); nothing is changed here.

### Colour

- No red on this page except the error notice. A grade is never coloured by how good it is: no green, no red, no scale. The letter sits in an outlined pill in the ink.
- "Counts toward grade" is an outlined pill. A status is a grey pill.

### Components

- **The figure:** shown, never animated. No count-up, no bar that fills. It is one deterministic number and it appears whole.
- **Item link and "Open course":** the global link: ink words over a thin grey underline that turns to the ink under the pointer and dims to 0.7 while held.
- **Rows:** a row is not a control and has no hover. Only the item's name is the link.
- **Folds:** the open and closed marks are text characters today. One icon family is the Master's rule; replacing them needs his word.
- **The feedback mark:** keeps `cursor: help` and its title.
- **The submission note:** it prints Blackboard's status code as it comes, in capitals with underscores, after "last attempt:". Putting it into words is a call for him (the entry `copy-captions`).
- **A link-column control while it saves:** it is disabled then and has no rule for it today. It takes the busy look (half strength, the wait pointer) once `aria-busy` is ruled in (the entry `busy-says-busy`). It never takes the flat grey box.

---

## States

- **Nothing graded yet:** one muted sentence today, in the card. The empty-state form needs his word; if it comes, it has no action here, because there is nothing he can do about it.
- **Loading:** Its loading line shows at once today. It waits 240ms and fades in once only when the `data-loading` attribute is ruled in (the entry `loading-attribute`, the PM's call).
- **What the figure leaves out** is named under it, always. That is content, not a state, and it does not move.

---

## Recommendations

- Nothing here projects, predicts or suggests. No what-if control is drawn.
- Keep the "as of" time beside every figure that came from Blackboard.
