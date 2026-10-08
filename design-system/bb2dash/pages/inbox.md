# Inbox Page Overrides

> **PROJECT:** bb2dash
> **Generated:** 2026-10-08 15:01 by the ui-ux-pro-max skill, then edited by hand to direction D, and again after the three critics reviewed the pass.
> **Page type:** Review queue. Questions a sync could not decide, each a card with the two values, a reason field and the choices.
> **App files:** `web/src/app/(app)/inbox/` (Inbox.tsx, Inbox.module.css), `web/src/components/inbox/` (InboxCard, InboxApplyButton, use-inbox-keys)

> **IMPORTANT:** Rules in this file **override** the Master file (`design-system/bb2dash/MASTER.md`).
> Only what differs from the Master is here.

---

## Page-Specific Rules

### Layout

- No change. The apply bar stays sticky under the top bar.

### Colour

- The selected tab's underline is `--color-accent-500`: a tab is a place you are.
- The kind of question is the filled ink pill. Every other chip is a filled grey pill. Chips are content: they select.
- The two values sit in wells (`--color-bg`) inside the card, in the mono face. When a value is a date, whether it stays in the mono face is a taste call that waits (decision 2; drawn on the tile under Proposed).

### Components

- **Card focus:** the card is a keyboard stop (j and k move between cards). Its focus mark is the same 2px of the ink as everywhere, drawn as a ring around the card's own edge.
- **Choices:** one primary button per card (accept), the others secondary. Under each, one muted line says what the choice does. "None of these" stays a quiet button.
- **Reason field:** the well, with its label over it. Its placeholder is a hint, not the label.
- **Tabs:** hover is the ink for the words; a press takes the active wash. A tab does not select and does not drag.
- **Apply answers:** its disabled state covers three cases (it is running, it is looking for an open run, there is nothing to apply), so it takes the one strength and keeps its plain pointer. Its label says which case it is.

### Motion

- Answering a card does not animate the list. The card is replaced by its answered state, or it leaves with the tab's count. No row slides, collapses or reorders with motion: with fourteen cards in view that would be fourteen things moving.
- Undo stays where the app has it, on the answered row, and takes the secondary button's states. While the apply worker holds the queue it is switched off and its sentence says why.

---

## States

- **Empty tab:** one muted sentence today. In the Master's form: what is empty ("Nothing needs you"), what will fill it (the next sync), and one action (Sync now), left aligned on the card's own fill with no box of its own. This needs his word and his wording. The tile shows it under States, beside the bare line under Notices.
- **Loading:** Its loading line shows at once today. It waits 240ms and fades in once only when the `data-loading` attribute is ruled in (the entry `loading-attribute`, the PM's call).
- **A change that was not saved:** the shared error notice at the card, with what to do next.

---

## Recommendations

- A long file name inside a question wraps anywhere. It is never cut, because the name is the question.
- Keep the keyboard hints visible.
