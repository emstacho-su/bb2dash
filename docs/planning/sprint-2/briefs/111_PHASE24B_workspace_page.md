# Phase 24b: Workspace assistant, the page. A lobby, a composer with attachments, routines, scope and depth, formatted answers with sources, a side panel for sources, files and memory

Date 2026-10-08 · PM: the Fable session · Product manager: Stack · Requirements: Stack's ask of
2026-10-08 (the tag the PM assigns to brief 109) · Answers on record:
`109a_PHASE24_open_questions.md` · **Gate: Phase 22 and Phase 24a are both on `main`** · Branch
`feat/workspace-page-24b` · Worktree `bb2dash-wt-24b` · Neither is cut yet · Workers W-81 to W-83
(24a ends at W-80) · No migration: the page uses 24a's objects, and 198 and 199 stay slack · One PR
in bb2dash · Verification file `docs/planning/sprint-2/verification/111a_PHASE24B_VERIFICATION.md`,
called 111a below · Status: **drafted with brief 109 on Stack's answers of 2026-10-08.** It is frozen
at its gate, after a re-read against Phase 22 as merged: every token name, class name and line number
of Phase 22 below is read again then.

**The design is carried out with the `ui-ux-pro-max` skill, in Phase 22's design language.** Dark by
default with a light version; black, grey and white with `#ff0000` as the one accent; pill buttons;
square bordered cards (brief 103 on `feat/styling-22` at 3d02033, lines 57-58 and 386-389). The
project's rules hold: CSS Modules and custom properties, no Tailwind, no new UI framework, no literal
where a token exists.

**Facts re-read for this brief, 2026-10-08, read-only.**

* Today's page is one text box and one button, plain-text answers, a conversation list and a thread
  (`web/src/components/workspace/Composer.tsx:85-93`, `MessageList.tsx:10-16`,
  `web/src/app/(app)/workspace/Workspace.tsx:334`). It becomes one column under 720 px
  (`Workspace.module.css:33`).
* `web/package.json:17-26` holds eight runtime packages. None renders Markdown or cleans HTML.
* The web app sends no Content-Security-Policy (a grep of `web/src` and `web/next.config.*` for the
  header name and `img-src` gives 0 hits).
* `web/e2e/accept21.spec.ts` and `accept.lib.ts` read ten data attributes: `data-turn`, `data-tier`,
  `data-answer-text`, `data-used`, `data-turn-line`, `data-column-empty`, `data-workspace-offline`,
  `data-request-id`, `data-channel`, `data-workspace-stream`.
* `web/test/Workspace.layout.test.tsx:61-68` lists six stylesheets by hand.
  `web/e2e/workspace-layout.spec.ts` loads `MessageList.module.css` by its class names (map R1).
* Phase 22's walk guard aborts the write RPCs `workspace_ask` and `workspace_cancel` and any RPC that
  is not on its read list (brief 103 at 3d02033, lines 674-675; `web/e2e/walk22.lib.ts:164` on
  `feat/styling-22-walkbox`). Its row 12 fixture answers reads of four Workspace objects (line 182).
* The reference screenshots were opened for this brief: `Replit Web 24.png`, `Replit Web 26.png` and
  the three in `Replit Web Adding a skill/`, all in his Downloads folder. They are pictures of another
  product. Their layout and features are the model. No name and no wording is copied from them.

## Why

Stack, 2026-10-08: "the Replit Web keyword png's in my downloads should serve as both ui and feature
inspiration." Phase 24a makes the assistant work behind today's page. It cannot add one control,
because Phase 22 is sweeping the page's files (ruling W-1). So after 24a he still cannot attach a
file, choose a course, a routine or a depth, read a formatted answer, open a source, or see and
delete what is remembered. This phase is those controls, on the screens his pictures show:

* a greeting over one large composer, with a plus menu, a dashed scope chip, an effort menu and a send
  button (the first numbered picture);
* a plus menu with an attachments group and a starting-points group, the second opening a searchable
  list with group headings and one-line descriptions, and the picked entry shown as a removable chip
  (the three menu pictures);
* a row of shortcuts, example prompts with a refresh, and recent work with a "view all" link (the
  first numbered picture);
* a right panel with three tabs, a search field and a collapse button (the second numbered picture).

A plan-first toggle and voice input are in the pictures and are **out of scope**, by ruling W-9.

## What 24b delivers

Each line is a check that fails on `main` after 24a.

1. `/workspace` with no conversation shows the lobby. Today it shows an empty thread
   (`thread.ts:304-309`).
2. Ask sends the chosen course, depth, routine, format and attachments through `workspace_ask_with`.
   Today's page calls `workspace_ask` (`queries.workspace.ts:684-687`).
3. Deep applies to one question, then the menu reads Auto again.
4. A routine that needs a file keeps Ask off until a file is attached, and says why in one line.
5. A formatted answer shows headings, lists and tables. For any input the rendered tree holds no
   `img`, `a`, `iframe`, `script` or `style` element and no `href` or `src`.
6. A label in an answer is a numbered chip only when that request has the source row. Otherwise it is
   plain text.
7. The Sources tab lists an answer's sources; the Files tab lists his uploads with their state; the
   Memory tab lists what is remembered, deletes any item in two steps, and edits the About me note.
8. A file from his device is picked or dropped, checked, stored, registered and shown with its state
   until it reads "indexed".
9. Up to three example prompts are built from his real upcoming work, by title and date. With no such
   row, the example row is absent.
10. After the page marks a turn stopped, a later piece of text for that request changes nothing.
11. At 390 px: one column, no sideways page scroll, the composer docked, and a wide table scrolls
    inside its own box.
12. With memory jobs on, a conversation quiet for 15 minutes shows one item in the Memory tab, and
    deleting it leaves nothing for search.

## Contract

### Routes and screens

`/workspace` is the lobby. `/workspace?c=<uuid>` is the thread. NEW `?panel=sources|files|memory`
opens the side panel on a tab (`web/src/components/workspace/route.ts`).

| screen | states |
|---|---|
| Lobby | each block loading; ready; no upcoming work (the example row is absent); no conversations (one line); service offline (the line shows, Ask still queues) |
| Composer | empty; chips set; a routine needs a file (Ask off, one line); an upload is not read yet (Ask off); refused (the two frozen sentences); a request is open (the button reads Stop and Enter sends nothing, as `Composer.tsx:85-93`) |
| Turn | queued; searching (new line, from claimed until the `sources` event or the first text); streaming; done; done with nothing matched (fixed line); done with a failed search (fixed line); failed; stopped; joined late |
| Sources tab | no answer picked; loading; rows, cited first; nothing matched; the read failed |
| Files tab | no uploads; uploading; waiting; reading; ready; failed with its reason and Try again; one index status line |
| Memory tab | About me: empty, editing, saved, failed. The list: empty, rows, the two-step Delete, failed |
| Material picker | loading; by course; filtered; none found; the limit of five reached |

**The shell.** `Workspace.tsx` keeps reading the rows and holding the one channel
(`Workspace.tsx:334`) and renders NEW `Lobby.tsx` or NEW `Thread.tsx`. The grid is a rail of
conversations, a column capped at 80ch, and the panel. Under 1024 px the panel is a sheet. Under
720 px, today's step, the rail is one too. Sheets and the picker reuse `PopoutShell` (focus moved in,
Esc, focus handed back: `web/src/components/popout/PopoutShell.tsx:31-37`).

**The lobby.** A greeting with no name in it, one large composer, the six routines as shortcuts, up to
three example prompts with a refresh, and recent conversations with a link to all of them.

**The composer** (`Composer.tsx`, rewritten). A text box; a row of chips; NEW `PlusMenu.tsx` with
three entries (attach from materials, upload from device, use a routine, the last opening a list with
a search field, group headings and one-line descriptions); a dashed course chip ("all courses" first,
then the classes of `v_course_display`); NEW `DepthMenu.tsx` (Auto, Quick, Standard, Deep, starting
on Auto); Ask or Stop. Menus use `usePopover` (`web/src/components/shell/usePopover.ts:29`).

* Deep applies to that question, then the menu returns to Auto (W-9). Quick and Standard stay until
  he changes them (default taken, listed in 109a).
* A routine chip and a course chip stay for the conversation. They are restored from the last
  request's row in `workspace_request_options`.
* At most five attachments a question, the limit `workspace_ask_with` enforces.

**Routines.** The page reads `workspace_routines` (id, grp, title, description, needs, sort, enabled)
and never its instructions. `needs` gates Ask on the page; the database refuses the same case (23514).

**Example prompts.** NEW pure `web/src/lib/workspace-examples.ts` over the page's own read of
`v_work_items` (the columns of `web/src/lib/queries.today.ts:123-127`): the next 14 days, up to nine
candidates, three shown, the refresh stepping through them. A prompt names a real item by title and
date. Pressing one fills the composer and sends nothing. No rows, no row: no invented example, ever.

**Attaching from materials.** NEW `MaterialPicker.tsx` over `v_bb_files_current`, grouped by course,
with a filter field. A pick becomes a chip.

**Uploading from his device.** A file input and a drop target. NEW
`web/src/lib/workspace-upload-rules.ts` checks the type and the size before anything is sent: six
types (pdf, docx, pptx, xlsx, plain text, Markdown) and 20,971,520 bytes, 24a's limits. Then the
order 24a fixes: the object into the bucket `workspace-uploads`, a signed URL of 7 days,
`workspace_upload_register`. The chip and the Files row read `workspace_documents` again every 5 s
while a row is not `indexed` or `failed` (the pattern of `web/src/lib/workspace-poll.ts`). A failed
row keeps Remove and Try again; Try again signs a new URL and calls `workspace_upload_retry`. Delete
calls `workspace_document_delete`, then removes the object with the key it returns. He may tag an
upload with a course (an update of `course_id`).

**Formatted answers, with no new dependency.**

* NEW pure `web/src/lib/answer-format.ts` turns text into blocks. NEW `AnswerBody.tsx` turns blocks
  into React elements: paragraphs, three heading levels, lists, pipe tables, code, bold, italic,
  quote.
* **No image is ever drawn and no link is fetched.** An image form or a link form renders as its
  text. There is no `img`, no `a` and no raw HTML sink. `web/test/raw-html.audit.test.ts` is not
  edited and stays green.
* The parser never throws. An unclosed form shows as text while the answer streams. Blocks are kept
  between flushes.
* `withoutBoldMarkers` goes (`thread.ts:150`) with its test (`web/test/Workspace.thread.test.ts:391`).
* The composer sends `format: "rich"`. A stored answer of a request with no options row, or with
  `plain`, is shown as plain text, as today.

**Sources.** 24a's labels carry ids: `[M<id>]`, `[U<id>]`, `[R<id>]` and `[P]`. NEW pure
`web/src/lib/workspace-citations.ts` turns a label into a numbered chip only when the request's
`workspace_sources` holds that row; the number is the row's `ord`. Anything else stays text. A chip is
a button, never a link: it opens the panel at its row. A row shows its kind, its course, its title,
its page, slide or sheet, and Open:

* a course file through `FileOpenAction` (`web/src/components/materials/FileOpenAction.tsx:70-76`):
  the file opens and the row names the page. It lands on the page itself only if probe Q-2 passes;
* an upload through a short-lived signed link (the call of `web/src/lib/queries.materials.ts:136`);
* a remembered item in the Memory tab;
* the planner feed as an app link to `/planner`.

The row shows no passage text: 24a stores none. The line of tool names under an answer goes.

**The fixed lines.** Nothing matched, and the search failed, are read from
`workspace_turns.retrieval_state` and worded in `web/src/lib/workspace-labels.ts`. A test holds each
equal to the runner's sentence in `workspace/src/lines.ts`, so the two cannot drift.

**The index status line** on the Files tab reads `v_workspace_index_status`: how many course units,
uploads and remembered items wait or failed, and when a course file was last indexed. No number is
shown that the row does not hold.

**Stop.** After the page marks a turn stopped, a later `delta` for that request changes nothing
(`web/src/lib/use-workspace-stream.ts`, `thread.ts`).

**Memory, switched on.** This PR changes one line outside `web/`: the compose default of
`WORKSPACE_MEMORY_JOBS` becomes `on`, because the list and the delete control now exist (answer 1).

**Wording.** Every string stays in `web/src/lib/workspace-labels.ts` and its test, because the pack
check reads the page's texts from that file (`acceptance/README.md:145-149`). It is PM wording, frozen
before worker branches are cut. The upload error codes it words are 24a's ten.

**Keyboard.** Enter asks and Shift+Enter breaks the line. Backspace in an empty box removes the last
chip. Arrows, Home, End and Esc work in menus and tabs, and focus returns to what opened them.

**Phone.** One column, no sideways page scroll, the composer docked, menus as sheets, tables and code
scrolling inside their own positioned box, targets of 44 px.

**Look.** Tokens only. Pill buttons, square bordered cards, the ink primary button. Red
(`--color-accent-500`) only marks where he is: the picked tab and the picked conversation (brief 103,
lines 386-389). A status is never told by red alone.

### The data it uses from 24a

The page writes through functions and reads through tables and views. **Every read is a select, never
an RPC**, so Phase 22's walk guard needs only new names on its read list.

* **Reads:** `workspace_conversations`, `workspace_messages`, `workspace_requests`,
  `v_workspace_status` (Phase 21); `v_work_items`, `v_course_display`, `v_bb_files_current`;
  and 24a's `workspace_routines`, `workspace_request_options`, `workspace_request_attachments`,
  `workspace_turns`, `workspace_sources`, `workspace_documents`, `v_workspace_memory`,
  `workspace_profile`, `v_workspace_index_status`.
* **Writes:** `workspace_ask_with`, `workspace_cancel`; the title and archived columns of a
  conversation (`140`, its column grants); `workspace_upload_register`, `workspace_upload_retry`,
  `workspace_document_delete`; the storage upload, signed URL and remove on `workspace-uploads`; an
  update of an upload's title and course; an update of `workspace_profile.about_me`.
* **Realtime:** `workspace:<conversation>` with `delta`, `done` and 24a's `sources`.
  `workspace:lobby` is held with no event, as today.
* **Refusals:** 22023 (the text's length) and 23505 (a second open request) keep today's two
  sentences. 23503 and 23514 from `workspace_ask_with` get one sentence each.

### Files rewritten, kept and new

* **Rewritten:** `page.tsx` and the layout half of `Workspace.tsx`; `Composer.tsx`; `MessageList.tsx`
  (it keeps `useFollowTheEnd`); `ConversationList.tsx`; `TierBadge.tsx`; the markup of
  `ServiceStatus.tsx`; `thread.ts` where the tool-name line and the bold-marker strip go; the six CSS
  modules of the two folders.
* **Kept:** `route.ts` (one new parameter), `web/src/lib/queries.workspace.ts` (789 lines, at the cap,
  so it gains nothing), `workspace-poll.ts`, `workspace-clock.ts`, the logic of `ServiceStatus.tsx`.
* **New, `web/src/lib/`:** `queries.workspace-ask.ts`, `queries.workspace-sources.ts`,
  `queries.workspace-files.ts`, `queries.workspace-memory.ts`, `queries.workspace-routines.ts`,
  `answer-format.ts`, `workspace-citations.ts`, `workspace-examples.ts`,
  `workspace-upload-rules.ts`, each with its test.
* **New, `web/src/components/workspace/`:** `Lobby`, `ExamplePrompts`, `Thread`, `AnswerBody`,
  `PlusMenu`, `DepthMenu`, `MaterialPicker`, `SidePanel` and its three tabs, each with its module.
* **Changed elsewhere:** `web/src/lib/use-workspace-stream.ts` (the `sources` event, the stop guard);
  `web/src/lib/workspace-labels.ts` and its test; `compose.yaml` (one value).

### Tests, and what replaces the two layout checks

Both layout checks are kept and rewritten in this PR. Each row says what it pinned and what pins it
after.

| check | pins today | after 24b |
|---|---|---|
| `web/test/Workspace.layout.test.tsx` | every box that scrolls is positioned; its hand-written list of six stylesheets equals the folder's (lines 61-68) | the same rule, with the list read from the folder, and the screen mounted twice: the lobby, and a thread with the panel open |
| `web/e2e/workspace-layout.spec.ts` | the document is as tall as the window; each label's offset parent is the column; class names `column`, `turns`, `turn`, `question`, `answer`, `text`, `used` | the same two facts. `MessageList.module.css` keeps `column`, `turns`, `turn`, `question`, `answer`, `text`. The `used` case becomes the sources row. New cases: the composer stays docked, and a wide table at 390 px scrolls inside its box |

* **Tests this phase replaces or edits**, each with an owner below: `Workspace.empty.test.tsx` (it
  pins the empty thread the lobby replaces), `Workspace.test.tsx`, `Workspace.thread.test.ts`,
  `Workspace.failures.test.tsx`, `Workspace.rereads.test.tsx`, `Workspace.service.test.tsx`, the three
  `use-workspace-stream` tests, `workspace-harness.tsx`, `workspace-labels.test.ts`.
* **Data attributes.** Eight of the ten stay. `data-used` becomes `data-sources`.
  `data-column-empty="start"` becomes `data-lobby`. New: `data-source-ref`, `data-chip`,
  `data-retrieval`, `data-upload-state`.
* **Phase 22's standing checks.** Its row 12 fixture and its phone-width cases cover `/workspace`.
  The PM extends the fixture with the new reads and keeps its counts green, or records the new count.
  The token audit stays at zero for the two Workspace folders.
* **The acceptance pack.** `acceptance/24/` and `web/e2e/accept24.spec.ts` are extended with the page's
  steps. Pack 21 and `web/e2e/accept21.spec.ts` are retired in this PR: two attributes they read
  change, and the phase they accepted stays accepted (DECISIONS 2026-10-08). The `walk21*` files under
  `web/e2e/` are read at the cut; any that cannot run against the new page goes with them.

## MVP (in plain words)

Stack opens Workspace and sees one box, his six routines and a few suggestions made from his real
upcoming work. He can pick a course, attach a file from his materials or from his laptop, pick a
routine and say how deep to think, or pick nothing. He asks. While it looks through his files the
page says so. The answer is formatted, and each numbered source opens the file it came from or shows
where it is. If nothing of his matched, one fixed line says so.

A panel at the side shows that answer's sources, the files he has uploaded and whether each has been
read yet, and what the assistant remembers. He can delete any remembered item, and he can write a
short note about himself that it reads every time.

It draws no image and follows no link. It works by keyboard and on a phone, dark or light.

## Definition of done

**SOP gates**

- [ ] `web/`: `npm run typecheck`, `npx eslint . --max-warnings 0`, `npm run build`, `npx vitest run`
      and `npm run test:coverage` all exit 0; the test count is not below `main`'s at the cut.
- [ ] `git diff --stat origin/main...HEAD -- web/package.json web/package-lock.json` prints nothing.
- [ ] The token audit and the raw-HTML audit pass with their files as Phase 22 and `main` left them.
- [ ] `/code-review main high` and `/security-review`: CRITICAL and HIGH addressed, recorded in 111a.
      The security review is required: user input, a file upload, and a renderer.
- [ ] `git diff --stat origin/main...HEAD -- db workspace mcp-server supabase sync apply desktop`
      prints nothing.

**Contract**

- [ ] Each of the 12 checks under "What 24b delivers" has a named test or proof, green.
- [ ] Both layout checks pass as rewritten.

**Live**

- [ ] The PM's walk in a real browser, both themes, at 390 px and at desktop width, and in the desktop
      window, with one runner on the queue. No screenshot is committed.
- [ ] Stack has seen the preview and said OK. This phase is visual.
- [ ] After his merge word, with the Workspace restarted alone so memory jobs are on:
      `just accept 24` is green.

**Docs, same PR**

- [ ] STATUS, DECISIONS, ORCHESTRATOR's phase table, root `CLAUDE.md`'s Workspace paragraph.

## Task list

Test file names are proposals. Order: 1, 2, 3, then (4 to 6 beside 7 and 8 beside 9 and 10), then 11
to 16.

| # | task | owner | deterministic check |
|---|---|---|---|
| 1 | Gate: Phase 22 and 24a are on `main`; this brief re-read against both and frozen; the branch cut | PM | `git merge-base --is-ancestor <Phase 22's merge commit> HEAD; echo $?` and the same for 24a's each print 0 |
| 2 | Probes Q-1 to Q-5 (below) | PM + W-81 | one pass or fail line each in 111a |
| 3 | Wording frozen in `workspace-labels.ts` and its test, before worker branches are cut | PM | `cd web && npx vitest run test/workspace-labels.test.ts` passes, and its case comparing the two fixed sentences with `workspace/src/lines.ts` passes |
| 4 | `answer-format.ts` and `AnswerBody.tsx` | W-81 | `npx vitest run test/answer-format.test.ts test/AnswerBody.test.tsx`: for generated strings the tree holds no `img`, `a`, `iframe`, `script` or `style` and no `href` or `src`; an unclosed form is text; the parser throws for no input |
| 5 | The query modules, citations, examples, upload rules | W-81 | `npx vitest run test/queries.workspace-ask.test.ts test/workspace-citations.test.ts test/workspace-examples.test.ts test/workspace-upload-rules.test.ts`: a label with no row stays text; no rows give no example; a file of 20,971,521 bytes is refused before any request |
| 6 | The stream: the `sources` event and the stop guard | W-81 | `npx vitest run test/use-workspace-stream.stop.test.tsx`: a delta after the stopped mark changes nothing; an unknown event changes nothing |
| 7 | Composer, plus menu, depth menu, material picker | W-82 | `npx vitest run test/Composer.chips.test.tsx`: Ask sends the options; Deep returns to Auto after one question; a file routine with no file keeps Ask off; Backspace in an empty box removes the last chip |
| 8 | The lobby and example prompts | W-82 | `npx vitest run test/Workspace.lobby.test.tsx`: no upcoming rows, no example row; a press fills the box and calls nothing |
| 9 | The thread, the answer body in place, source chips, the searching line | W-83 | `npx vitest run test/Workspace.sources.test.tsx`: a chip is a button and never a link; `empty` shows the fixed line; a `plain` answer renders as plain text |
| 10 | The panel: Sources, Files with upload states, Memory with delete and About me | W-83 | `npx vitest run test/SidePanel.test.tsx`: each state of the table renders; Delete needs two presses; a failed upload shows its reason and Try again |
| 11 | Layout and phone: both checks rewritten | W-83 | `npx vitest run test/Workspace.layout.test.tsx`; `node scripts/walk-box.mjs web/e2e/workspace-layout.spec.ts` exits 0 |
| 12 | Audits and Phase 22's fixture | PM | `npx vitest run test/raw-html.audit.test.ts test/audits.test.ts` and Phase 22's token audit pass; its walk's counts are green or the new count is in 111a |
| 13 | Memory on: the compose value and its test | PM | `grep -c "WORKSPACE_MEMORY_JOBS" compose.yaml` gives 1 and the line reads `on`; `node --test docker/workspace/init-firewall.test.mjs docker/grep-clean.test.mjs` passes |
| 14 | The pack extended; pack 21 retired | PM | `node --test acceptance/acceptance.test.mjs` passes; `ls acceptance` shows no `21` |
| 15 | Integrate, reviews, the preview for Stack, the PR. Stop at "ready when you say so" | PM | the SOP gates; `gh pr view --json state -q .state` prints `OPEN` |
| 16 | After his merge word: the Workspace restarted alone with no question open, then `just accept 24` | PM | the run's `REPORT.md` reads green |

**Probes, before anything is built on them.**

* **Q-1.** A browser upload to the private bucket under the owner's policy, at the size limit.
* **Q-2.** Whether a signed PDF link honours `#page=N` in Chromium and in the desktop window. If it
  does, Open lands on the page; if not, the row names the page.
* **Q-3.** The file dialog and a drop inside the desktop shell's window.
* **Q-4.** Parsing a 100,000-character answer again on each 250 ms flush stays under 16 ms with
  blocks kept. If not, only the stored row is formatted and streaming text stays plain.
* **Q-5.** At the cut: Phase 22's real token and class names; whether its count of files that name the
  red step is a standing test; whether a module map can be read from a folder under vitest.

## Workers

Workers are Opus, commit and push per task, never touch `project-state/`, and hand the PM a
verification section with each task's red run and green run (`111_W81_VERIFICATION.md` to
`111_W83_VERIFICATION.md`, beside 111a). A worker with an unclear point states its default and takes
it. Nobody answers a running worker by message (ruling W-S).

| worker | stream | branch | worktree | owns (disjoint) | tasks |
|---|---|---|---|---|---|
| W-81 | data layer | `feat/workspace-page-24b-data` | `bb2dash-wt-24b-data` | the nine new files under `web/src/lib/` and their tests; `use-workspace-stream.ts` and its three tests; `AnswerBody.tsx`, its module and its test | 2, 4 to 6 |
| W-82 | composer and lobby | `feat/workspace-page-24b-composer` | `bb2dash-wt-24b-composer` | `Composer`, `PlusMenu`, `DepthMenu`, `MaterialPicker`, `Lobby`, `ExamplePrompts`, their modules and tests; `Workspace.empty.test.tsx` | 7, 8 |
| W-83 | thread and panel | `feat/workspace-page-24b-thread` | `bb2dash-wt-24b-thread` | `page.tsx`, `Workspace.tsx`, `Workspace.module.css`, `Thread`, `MessageList`, `ConversationList`, `TierBadge`, `ServiceStatus`, `SidePanel` and its tabs, `thread.ts`, `route.ts`, their modules; both layout checks; `Workspace.test.tsx`, `Workspace.thread.test.ts`, `Workspace.failures.test.tsx`, `Workspace.rereads.test.tsx`, `Workspace.service.test.tsx`, `workspace-harness.tsx` | 9 to 11 |
| PM | integration | `feat/workspace-page-24b` | `bb2dash-wt-24b` | `workspace-labels.ts` and its test; the pack and `accept24.spec.ts`; pack 21, `accept21.spec.ts`, `workspace-acceptance-helpers.spec.ts` and the `walk21*` files; Phase 22's fixture and phone cases; the token baseline if a count moves; `compose.yaml`'s one value; state docs; 111a | 1 to 3, 12 to 16 |

W-82 and W-83 type against W-81's modules from this Contract until they are on the phase branch.

## Seams

| with | seam | rule here |
|---|---|---|
| Phase 22 | it sweeps the two Workspace folders and freezes the tokens | 24b is cut only after Phase 22 is on `main`. It is written on Phase 22's tokens alone and adds no literal. Its fixture, its phone cases and its token baseline are the PM's to extend |
| Phase 24a | the objects, the labels, the `format` option, the upload order, the error codes, `lines.ts` | none edited. If the page needs a database change, it is a new migration in 198 or 199 and a ruling first |
| The live Workspace | one queue | one runner on the queue at a time during the walk, on Stack's word, as in 24a |
| The acceptance run | pack 24 grows; pack 21 goes | the host actions it needs are the ones 24a added to bb2dash-stack. A step that waits for a memory item uses the action that reads a proof again until it passes |
| The desktop shell | the page runs in its window | the walk includes it: the file dialog, a drop, an opened source (Q-2, Q-3) |

## Out of scope

A plan-first toggle. Voice input. The reference's start cards and bottom mode bar. A name in the
greeting. A Content-Security-Policy header. Maths typesetting and code colouring. Passage text beside
a source. Deleting a conversation. Upload progress in percent. A switch that turns memory off.
Asking again at another depth. Any change under `db/`, `workspace/`, `mcp-server/`, `supabase/`,
`sync/`, `apply/` or `desktop/`.

## Risks

* **Phase 22 moves before it merges.** 24b is cut after it is on `main`, and this brief is re-read
  then (task 1).
* **A leak through formatting.** The element list and the property test of task 4 hold it. No CSP
  header backs it up, so the renderer is the only guard.
* **Size.** The cut order: the example refresh, renaming a conversation, the routine search field,
  the drop target. Never cut: chips, sources, upload states, the memory delete, the About me note.
* **Pack 21 goes stale.** It is retired here, and the report says so.
* **Private text.** Fixtures are synthetic and no screenshot is committed.
* **Memory turns on at this cut-over.** From then a quiet conversation is summarised. He can delete
  any item, and a conversation whose item he deleted is not summarised again.
* **Not checked:** whether an opened PDF can land on a page (Q-2); the upload and the file dialog in
  the desktop window (Q-1, Q-3); the renderer's cost while streaming (Q-4).
