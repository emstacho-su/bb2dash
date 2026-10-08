# Workspace Page Overrides

> **PROJECT:** bb2dash
> **Generated:** 2026-10-08 15:01 by the ui-ux-pro-max skill, then edited by hand to direction D, and again after the three critics reviewed the pass.
> **Page type:** Chat. A list of conversations beside one thread: questions, answers, the tools an answer used, and a composer.
> **App files:** `web/src/app/(app)/workspace/` (Workspace.module.css), `web/src/components/workspace/` (MessageList, Composer, ConversationList, ServiceStatus)

> **IMPORTANT:** Rules in this file **override** the Master file (`design-system/bb2dash/MASTER.md`).
> Only what differs from the Master is here.

---

## Page-Specific Rules

### Layout

- No change. `Workspace.layout.test.tsx` and `workspace-layout.spec.ts` hold: no module is added, renamed or removed in `components/workspace/`, and the message column keeps its `position` and `overflow-y`.
- The thread keeps its 80ch measure.

### Colour

- A question is set apart by a 2px rule in the ink on its reading edge. Not red: a question is not a place, an urgency or an unread mark.
- The model label is an outlined pill. The tools line is the mono face in neutral 400.
- The current conversation keeps a grey fill. It gets no red bar unless he adds it to the list of red marks.

### Components

- **Message column:** it scrolls inside itself, so its scrollbar is the first one he sees in the desktop shell. It is the themed one: 10px, no arrow buttons, a round thumb. Today it is the default bar with arrows, which cuts the column's rounded corners (STATUS, Known issues).
- **Composer:** the well, with a label a screen reader can find. Ask is the page's one primary button. The corner grip of the text area goes only if he says so (`field-sizing: content` lets it grow with the text, CSS alone).
- **Conversation rows:** hover takes the wash, a press the active wash, the 2px ring inset on focus. Archive is a quiet button. "Show archived" is a checkbox drawn by the app.
- **An answer as it arrives:** the words appear as they come. No typewriter effect, no blinking cursor, no dots that bounce. The state is said in words ("queued", then the answer). "Queued" answers a press, so it shows at once: the 240ms wait is for a line that says a screen is loading, never for a word that answers what he just did.

### Motion

- The column does not animate its scroll to the newest words. It stays where he put it unless he is already at the bottom.
- A new turn does not slide in. It is there.

---

## States

- **No conversation yet:** one muted sentence in an empty box today. In the Master's form: a title, one sentence, and the composer is the action, so no button is added. Needs his word.
- **Stopped, offline, refused:** each is one sentence in the muted colour or in the error notice, as the app has them. Their words do not change.
- **Loading the list:** Its loading line shows at once today. It waits 240ms and fades in once only when the `data-loading` attribute is ruled in (the entry `loading-attribute`, the PM's call).

---

## Recommendations

- Answers are plain text with line breaks kept. Do not style them as rich text.
- Keep the thread readable at 13.5px with line height 1.55. Density comes from the list, not from the answer.
