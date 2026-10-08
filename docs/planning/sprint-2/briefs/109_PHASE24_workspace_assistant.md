# Phase 24: Workspace assistant. Retrieval before every answer, the composer and panels of the reference screens, upserts without a command

**DRAFT, NOT FROZEN.** Written 2026-10-08 by the synthesizer from five readers (R1 to R5) and three
architects (smallest, quality, experience). Nothing here is decided until Stack answers
`open-questions.md` and the PM freezes the Contract.

Date 2026-10-08 · PM: the Fable session · Product manager: Stack · Requirements: Stack's ask of
2026-10-08 (no id in `91_REQUIREMENTS_v3.md`; proposed tag S2-workspace-2, the PM assigns it at the
freeze) · Amends, only as Stack answers: DECISIONS 2026-09-27 B-5 (c), (e), (g) and 2026-10-05 O-1, O-5
and the scope calls row · Branch `feat/workspace-24` · Worktree `bb2dash-wt-24` · Workers W-76 to W-79
(W-67 to W-70 and W-75 are Phase 22's, W-71 to W-74 are used; brief 103 on `feat/styling-22`, line 85) ·
Migration range **190 to 199** · One PR in bb2dash. A second, small PR in agentic-harness only if task
24 is taken; that would be this phase's own exception to one PR per phase and needs its DECISIONS row,
as Phase 21's did · Test compose project `bb2dash-wt24` · Proposed brief path
`docs/planning/sprint-2/briefs/112_PHASE24_workspace_assistant.md` (107 to 111 are taken under
`docs/planning` and no file numbered 112 to 119 exists there on any of 25 refs; whether this phase
belongs to sprint 2 is the PM's call).

**Facts re-read for this draft, 2026-10-08, read-only.**

* The shared checkout is clean on `main` at a58be34 (`git status --porcelain | wc -l` gives 0, before
  and after).
* `ls db/migrations | tail` ends at `186_inbox_apply_notices.sql`. No file numbered 187 or above exists
  on any of 25 local and remote-tracking refs (`git ls-tree` over `for-each-ref`, no fetch). 187 to 189
  are Phase 23's slack (root `CLAUDE.md`). So 190 to 199 is the next free block of ten.
* `feat/styling-22` is at fd8e5fe, one docs commit ahead of `main` (`git rev-list --left-right --count
  main...feat/styling-22` gives `0 1`). `git diff --stat main...feat/styling-22` over the two Workspace
  folders, `workspace/`, `db/`, `sync/`, `mcp-server/`, `apply/`, `docker/` and `compose.yaml` prints
  nothing. No `feat/styling-22-screens-b` branch exists yet.
* `workspace/src/turn.ts:345-376`: the tier comes from `routeTier`, and the provider's input is built
  from the claim alone. `turn.ts:395`: a turn hands back the stored session id when the CLI reported
  none.
* `workspace/src/hooks/gate-rules.ts:13-24`: four allowed tools, two collections.
* `workspace/src/config.ts:71-73, 86-89`: replay 96 KiB, one argument 131,072 bytes, cap 0.01 to 1.00.
* `db/migrations/140_workspace_tables.sql:269-303, 353-356`: `workspace_ask(uuid, text)` is security
  invoker and the browser's grants are column-level.
* `db/migrations/143_workspace_review_round.sql:158-169`: `workspace_finish` stamps the session id it is
  given, null included, then sends `done` on `workspace:<conversation>`.
* `sync/src/files.ts:248-252`: the embed loop runs only when `unitsPosted > 0`.
* `apply/src` imports six `workspace/src` modules: `config`, `db`, `errors`, `stream-json`,
  `providers/claude-cli`, `alive` (`apply/src/claude.ts:18-21`, `config.ts:16-17`, `db.ts:8`,
  `healthcheck.ts:12`, `main.ts:18-21`). `apply/src` does not name `REPLAY_MAX_BYTES` (grep, 0 hits).
* The harness server's rendered lines are a declared contract, pinned by
  `test/transcript-contract.test.ts` (agentic-harness `mcp-server/src/format.ts:14-22, 167-181`). The
  same comment says Claude Code keeps only a tool result's text and drops `structuredContent`.
* The materials server renders `course`, `unit`, `text_id`, `file_id` and `similarity` per hit
  (`mcp-server/src/format.ts:118-127`).
* `web/package.json` holds no Markdown or sanitiser library (grep, 0 hits).
* `~/.claude/plans/` holds eight files and none is `abundant-gathering-wirth.md` (Glob). The harness
  store is its own Supabase project, `harness-memory` (agentic-harness `README.md:41-49, 178`).

Every other file and line cited below is a reader's or an architect's reading. The PM re-reads each in
the phase worktree at the cut before the freeze. No SQL and no docker command was run for this draft:
the synthesizer's task authorised neither, so every live count is quoted from R3 and R4.

## Why

Stack wrote on 2026-10-08: "Regarding the workspace section, the Replit Web keyword png's in my
downloads should serve as both ui and feature inspiration. Once you complete the visual passes (or
while they are going in parallel), I want you to redesign the features and functionality to upgrade the
workspace section so that it begins functioning properly as a personalized chatbot connected to my
materials and rag db with RAG pulling (as well as the upsertion pipeline) automated." In the same
message: "This app is functionally a dashboard interface for all of my classes."

Phase 21 built the transport and the fence, and both held: 40 requests, zero infrastructure errors
(R4). What it did not build is what this sentence asks for.

* **Retrieval is not automatic.** The runner has no retrieval step. The model searches only when it
  chooses to (`turn.ts:368-376`; R2).
* **His notes store is mostly fenced out.** Two collections pass the gate (`gate-rules.ts:24`). The
  store holds 33 (R3). His notes store was searched in 5 of 37 answers (R4).
* **The page has none of the reference screens' features.** One text box, one button, plain text, no
  course, routine or depth choice, no sources to open (R1, R5).
* **Nothing the Workspace produces reaches a store, and two upsert paths still need a command.** The
  Inbox exporter has no schedule, and an embed that failed waits for a later sync that posts text (R3).
* **It has barely been used.** 37 of 40 requests are the walk and acceptance scripts. Zero requests in
  the 11.7 hours before R4's reading, with the service up (R4).

The backend decision of 2026-10-07 stands: one `claude -p` turn of the pinned CLI on his subscription,
never an API key, never `--bare`, never the Agent SDK (DECISIONS line 442).

## What "functions properly" means

Each line is a check that fails today. Each becomes a named test or an acceptance proof.

1. With a fake retriever, the provider's prompt holds a labelled evidence block before the question.
   Today the prompt is the claim's text alone (`turn.ts:372`).
2. A search the runner makes itself, on a collection outside the list, is refused before any server sees
   it. Today the runner makes no search.
3. A question asked with one course chosen cannot search another course's materials. Today a request
   carries no course.
4. `workspace_ask_with` stores a course, a file, a routine, a depth and an outline flag, and
   `workspace_ask(uuid, text)` still returns its three ids. Today the first does not exist.
5. As `workspace_runner`: `workspace_sources_put` writes for a claimed request and raises 22023 for a
   done one; a select on `workspace_messages` still raises 42501; the role executes exactly seven
   SECURITY DEFINER functions and holds zero table privileges. Today the count is five.
6. A stored answer with sources shows a chip for each cited label and a count of passages read but not
   cited. An answer with no source row shows one fixed "nothing matched" line. Today the page has only
   the "Used:" line of tool names.
7. A turn that ended `cancelled` finishes with a null session id, and the next turn starts with
   `--session-id`, not `--resume`. Today the stored id is handed back (`turn.ts:395`).
8. After Stop, no later delta for that request changes the screen. Today text kept arriving (acceptance
   `REPORT.md:62`, R4).
9. Ten turns in one conversation at the 1.00 cap, each with a full evidence block: 10 `done`, 0
   `budget_exceeded`. Never run. The stored estimate already read 0.80 at a seventh turn (R4).
10. For each of the 9 cases in `ingest/eval/golden_set.json`, the expected unit is inside the evidence
    block, with no model run. Today there is no block.
11. A files pass that posted no unit still calls the embed loop once. Today it does not
    (`files.ts:249`).
12. A scheduled task files Inbox decisions and kept answers. Today no task is registered (R3).
13. An answer Stack keeps becomes one vault note in collection `bb2dash-workspace`, filed once. Today
    no path exists.
14. `/workspace` with no conversation shows the lobby: a composer, shortcuts and example prompts built
    from real rows. With no upcoming row the example row is absent. Today it shows an empty thread.

## Stack's calls this draft rests on

None is decided. Each row is a question in `open-questions.md` with the default the PM proposes.
Three defaults reverse a 2026-10-05 row in part and are marked.

| Q | question | default in this draft | tasks that change if he answers otherwise |
|---|---|---|---|
| 1 | new uploads | none; "attach" picks a file already in his materials | a later phase: bucket, extraction outside the sync, an attachments table |
| 2 | automatic memory, and delete | nothing automatic; he writes an "About me" note and presses Keep; Forget removes a kept note | adds migration 195, two runner functions, idle Haiku turns (the smallest architect's summaries) |
| 3 | where kept notes live | his notes store (`harness-memory`), through a vault note | tasks 9 and 20 become an embed path inside bb2dash's project; task 3's gate is dropped |
| 4 | writes | none: no planner, progress, grade or fact write | a later phase with propose-then-approve; nothing here changes |
| 5 | reading due dates | no tool; the lobby's example prompts carry a title and a date | adds one read tool, one view-backed function, one gate entry |
| 6 | which note collections | six class collections, `bb2dash-inbox-decisions`, `bb2dash-workspace`; `bb2dash` by tool only (**amends O-1**) | task 14's list and fixtures |
| 7 | formatted answers | yes: Markdown rendered to elements, raw HTML off (**reverses O-5, second half**) | task 27 keeps plain text; no new dependency |
| 8 | depth menu | yes: Auto, Quick, Standard, Deep (**reverses O-5, first half**) | column `tier_override` and the menu are dropped |
| 9 | usage per question | cap stays 1.00, one turn at a time, no background model turn | a config value; a daily cap is new work |
| 10 | retry speed for a failed embed | the next sync | adds a database timer (migration 196, a Vault entry) |

## Contract (draft)

### Routes and screens

* **`/workspace`, no `?c`: the lobby.** A greeting, one large composer, shortcut tiles (one per
  routine), up to three example prompts with a refresh, and recent conversations with "View all". An
  example prompt is built only from real rows: the next upcoming items (`v_work_items`) and the newest
  files (`v_bb_files_current`), named by title. No invented example. With no such rows the row is
  absent. All 10 conversations are archived today (R4), so "recent" needs its empty line.
* **`/workspace?c=<uuid>`: the thread.** A rail of conversations (title, last activity, Archive, rename),
  the turns, the composer docked at the bottom, a side panel that collapses.
* **Composer bar.** Text, a "+" menu, removable chips, a depth menu, an "Outline first" toggle, Ask or
  Stop. The "+" menu adds a course (one of the course rows, or all), a file from his materials, or a
  routine. Each choice shows as a chip.
* **An answer.** The body (formatted, pending question 7), citation chips, the tier badge, Copy, Keep,
  and the sources line. The "Used:" line stays.
* **Side panel, three tabs.** Sources (this answer's sources: cited first, then read and not cited; each
  with course or collection, page or slide, and Open). Materials (the existing search call, with "Ask
  about this"). You (the "About me" note, and kept answers with their state and Forget).
* **New turn line.** "Searching your materials and notes", from begin until the `sources` event.
* **New fixed lines.** A store that did not answer. Nothing matched. "Materials as of <time>" with the
  count of units still waiting, read from the database.
* **Under 720 px.** One column. The panel opens as a sheet.
* **Wording.** Every new string is PM wording, added to `web/src/lib/workspace-labels.ts` and its test.
  The strings above are placeholders until the freeze.
* **Data attributes.** The seven that `web/e2e/accept21.spec.ts` reads are kept (R1). New:
  `data-sources`, `data-source-ref`, `data-grounding`, `data-chip`.
* **Not built:** voice, a bottom mode bar, upload of a new file, delete of a conversation, "Ask again at
  another depth".

### The question's path

1. The composer calls `workspace_ask_with(p_conversation_id uuid, p_text text, p_options jsonb)`. It
   does what `workspace_ask` does and also stores the options on the request. `workspace_ask(uuid, text)`
   is untouched and still works.
2. The runner claims with `workspace_claim`, unchanged.
3. The runner calls `workspace_turn_options(p_request_id)`. It returns the options, the "About me" note
   and the conversation's last stored cost.
4. Tier: the request's `tier_override`, else `routeTier` as today. The router's cases file does not
   change.
5. Session: the stored session id is used unless the last turn was stopped or the last stored cost is
   at or above 0.60. Then the turn starts fresh and replays stored history.
6. `workspace_begin`, unchanged.
7. **Retrieval, new, between begin and spawn** (`turn.ts:360-377`). The flush timer starts first, so a
   Stop is seen within 2 s.
   * Search text: the question. When it is at most 80 characters and an earlier user message exists,
     that message goes in front. No model call.
   * Scope: the request's course, else the one course id the question names, else all.
   * Calls, in parallel, 10 s in total: one `search_materials` (hybrid, limit 8, the scope's course),
     and one `search_context` per in-scope collection (limit 3 each). With a file chosen, the runner
     reads that file's units in order with `get_material_units` in place of the materials search.
   * The runner is an MCP client of the same two servers `buildMcpConfig()` names
     (`workspace/src/mcp-config.ts:27-44`), kept alive for the runner's life. One new dependency:
     `@modelcontextprotocol/sdk` 1.30.0, the version `mcp-server/package-lock.json:128-129` resolves.
   * Every call the runner makes passes `decide()` in-process first. One rule covers the model's calls
     and the runner's.
   * A store that fails or times out is named in the block and on the page. The turn goes on.
8. `retrieval/parse.ts` reads the servers' text into hits. The empty-result form is zero hits, and its
   list of other collections is dropped. One parser serves the runner's calls and the model's own tool
   results, because the CLI's stream carries text only.
9. `retrieval/evidence.ts` renders at most 24 KiB. Each passage is cut at 1,500 characters and labelled
   by its own id: `[M<text_id>]` for materials, `[N<chunk_id>]` for notes. The block is fenced as source
   text, not instructions. Similarity is never compared across the two stores: the models differ.
10. Byte budget. A fresh start: 72 KiB replay, 24 KiB block, a question of up to 32,000 bytes, total
    130,304, under 131,072. `REPLAY_MAX_BYTES` drops from 96 to 72 KiB. A resumed turn sends the block
    and the question only.
11. `workspace_sources_put(p_request_id, p_sources)` stores the source rows before the model starts and
    sends `sources` on `workspace:<conversation>`. It stores ids, labels, a unit and a similarity. For a
    note it also stores the note's title. It never stores passage text.
12. `claude -p` runs with today's argv. Four differences: the allowed list gains
    `mcp__bb2dash__get_material_units`; the routine's prompt file, the outline rule and the fenced
    "About me" note are appended to the system prompt; `WORKSPACE_TURN_COURSE` is set in the child's
    environment; `system.md` gains the citing rules and loses its plain-text rule if question 7 says
    yes.
13. The model may still call its read tools. The gate refuses a materials search for another course
    than the turn's. Each tool result's text goes through the same parser, and its hits are stored as
    sources with origin `tool` in a second put before finish.
14. `workspace_stream` and `workspace_finish`, unchanged. After a Stop the runner hands back a null
    session id.
15. The page shows a label as a numbered chip only when a source row of that request matches it. An
    unmatched label stays plain text. A chip opens the file at its unit through the materials open
    control (`web/src/components/materials/FileOpenAction.tsx:70`, the quality architect's reading).

A routine id never becomes a path. The runner maps it through a fixed list of ids in code and refuses
any other.

### The content's path into each store

| content | store | path | what this phase changes |
|---|---|---|---|
| Blackboard file | materials (bb2dash project, gte-small) | sync downloads, extracts, posts units, embeds | the embed loop runs on every files pass, so a failed embed is retried by the next sync; a view gives the page the real newest `embedded_at` and the count of units with no part |
| Vault note, class note | notes (`harness-memory`, bge-small) | harness nightly ingest | nothing |
| Session note | notes | SessionEnd hook, then ingest | nothing here; the transcript sweep is task 24, in the harness |
| Checkpoint | notes | host task at logon | nothing here; a timed collect is task 24, in the harness |
| Inbox decision | notes | `scripts/inbox-decisions-pr.mjs`, written for a scheduled task that was never registered (its lines 15-16) | a registered task runs it |
| Kept answer | notes, collection `bb2dash-workspace` | new: Keep writes a `workspace_keeps` row; a host exporter renders the vault note, runs the harness ingest for that folder and marks the row filed | all of it |
| "About me" note | bb2dash project, `workspace_settings` | new: he types it; the runner reads it per turn | all of it |
| Source rows of an answer | bb2dash project, `workspace_sources` | new: the runner writes them through one function | all of it |
| A new upload | none | not built (question 1) | nothing |

Forget: the owner marks a keep row. The exporter deletes the vault note and stamps the row. The store
drops the note at the nightly `--prune` (`nightly-ingest.sh:134`, R3), so up to a day later. Not
checked: whether the harness can prune one folder on demand.

The two stores stay two. Both models are 384 dimensions and must never share an index (harness
`README.md:83-89`, R3). No store moves.

### Database objects

All additive. 140 to 143 are not edited, and no existing function is replaced.

| migration | objects |
|---|---|
| `190_workspace_ask_options.sql` | table `workspace_routines` (id, grp, title, description, sort, enabled), seeded with six rows; columns on `workspace_requests`: `course_id`, `file_id`, `routine_id`, `tier_override` (low, mid, high or null), `plan_first`; table `workspace_settings` (one row: `about_me`, at most 2,000 characters); function `workspace_ask_with(uuid, text, jsonb)`, security invoker; the column grants it needs |
| `191_workspace_sources.sql` | table `workspace_sources` (request_id, ord, origin `auto` or `tool`, store, label, course_id, file_id, text_id, unit_kind, unit_no, collection, external_id, chunk_id, title, similarity); at most 40 rows a request; owner-only select |
| `192_workspace_runner_v2.sql` | `workspace_turn_options(bigint)` and `workspace_sources_put(bigint, jsonb)`, SECURITY DEFINER, granted to `workspace_runner` only |
| `193_workspace_corpus_status.sql` | view `v_workspace_corpus_status` (newest `embedded_at`, units waiting), security invoker |
| `194_workspace_keeps.sql` | table `workspace_keeps` (message_id, state, kept_at, filed_at, forgotten_at); `workspace_keep(uuid)` and `workspace_forget(uuid)`, security invoker; `workspace_keeps_unfiled(integer)` and `workspace_keep_filed(...)`, service_role only, the pattern of `182_inbox_decision_filing.sql:109-117` |
| 195 to 199 | slack. 195 is held for automatic summaries (question 2), 196 for an embed timer (question 10) |

* Keeps is last on purpose. If task 3's gate fails or Stack cuts it, nothing is renumbered.
* The six routine ids are the PM's wording at the freeze. Proposed: `quiz`, `study-guide`, `explain`,
  `summarise`, `compare`, `tidy-draft`. None exists on disk today: no study skill is installed (R5).
* `db/tests/phase21_142_workspace_runner.sql:151` and `phase21_143_review_round.sql:152` pin "the
  five". They become seven in the same PR. Every checkout runs those units against prod, so the day 192
  is applied a one-line, test-only PR carries the new count to `main` (Phase 21's task 6a, PR #65).
* Not read: the key types of `courses.id` and `bb_files.id`, and whether 141's Realtime policy names
  events. W-76 reads both at the cut.

### The security boundary, before and after

| | before (Phase 21) | after (this draft) |
|---|---|---|
| Runner's database reach | five SECURITY DEFINER functions, no table grant | seven, no table grant. The two new ones read the claimed request's options and write source rows for a request the runner holds |
| Planner state and fact tables | out of reach | out of reach. No change |
| Model's tools | four read tools; built-in tools off | five read tools (adds `get_material_units`); built-in tools off |
| Notes collections | `bb2dash`, `bb2dash-inbox-decisions` | plus six class collections and `bb2dash-workspace` (question 6). `get_document` stays off |
| Course scope | none | a turn with a course cannot search another course's materials |
| Who searches | the model, through the CLI hook | the model through the hook, and the runner through the same `decide()` in-process, with its own test |
| MCP servers' lifetime | children of the CLI, one turn | also children of the runner for the container's life. Same two credentials, same holders, a longer window |
| Secrets, firewall, networks, volumes, compose | four secret files; default deny | no change. `docker/workspace/init-firewall.sh` is not edited, so apply's generated copy does not change |
| Writes by an assistant | none | none by the model. The runner writes source rows. Stack's own press writes a keep row |
| Outward flow | none | a kept answer, text the model wrote from course documents, becomes a vault note his other agents can read. The exporter writes inside the vault only, never under the public repo |
| Prompt content | question, replay | plus retrieved text, fenced as data. A poisoned document can reach an answer. The harm is a wrong answer: there is still no write tool |
| Browser | `workspace_ask`, `workspace_cancel` | plus `workspace_ask_with`, `workspace_keep`, `workspace_forget`; owner-only policies on each new table |
| Host | Inbox exporter by hand | one scheduled task runs two exporters with the service key file the Inbox exporter already reads. It opens a pull request and never merges |

The sync still holds no model. No Claude process shares a network or a volume with the Blackboard
login. `/security-review` is required: the phase touches user input, a role's functions and an
exporter that holds the service key.

### Files by owner

* **W-76, db:** `db/migrations/190_*.sql` to `194_*.sql`; `db/tests/phase24_*.sql`; the count lines of
  the two `phase21_*` units; the Workspace section of `DATA_SYNTAX.md`.
* **W-77, runner and tools:** everything under `workspace/` except `workspace/eval/`. New:
  `src/retrieval/mcp-client.ts`, `parse.ts`, `retrieve.ts`, `evidence.ts`, `src/options.ts`,
  `src/sources.ts`, `prompts/routines/*.md`, their tests. Changed: `src/turn.ts`, `src/db.ts`,
  `src/config.ts`, `src/hooks/gate-rules.ts`, `src/providers/claude-cli.ts`, `src/stream-json.ts`,
  `prompts/system.md`, `package.json`. In `mcp-server/`: `src/tools/get-material-units.ts`,
  `src/tools/schemas.ts`, `src/client.ts`, `src/server.ts`, their tests. `docker/workspace/Dockerfile`
  only if the image must copy a new folder.
* **W-78, ingest and exports:** `sync/src/files.ts` (one condition) and its test;
  `scripts/workspace-notes-export.mjs`, `scripts/lib/workspace-note-render.mjs`, their tests;
  `scripts/register-exports.ps1`; `workspace/eval/run.mjs`.
* **W-79, web:** new files under `web/src/lib/` from the start: `queries.workspace-ask.ts`,
  `queries.workspace-sources.ts`, `queries.workspace-lobby.ts`, `workspace-sources.ts`,
  `workspace-citations.ts`, their tests. After Phase 22 is on `main`: `web/src/app/(app)/workspace/`,
  `web/src/components/workspace/`, `web/src/lib/use-workspace-stream.ts`,
  `web/test/Workspace.layout.test.tsx`, `web/e2e/workspace-layout.spec.ts`, `web/package.json` if
  question 7 says yes. `web/src/lib/queries.workspace.ts` is at 789 of 800 lines (R1) and gains no
  query.
* **PM:** `web/src/lib/workspace-labels.ts` and its test (wording frozen before worker branches are
  cut), `web/src/lib/supabase/database.types.ts`, `web/test/token-audit.baseline/screens-b.json` if a
  count moves, `acceptance/24/` (three files), `web/e2e/accept24.spec.ts`, `web/e2e/accept21.spec.ts` if
  an attribute it reads must change, `project-state/`, root `CLAUDE.md`, the verification file 112a.
* **Nobody:** `db/migrations/140` to `186`, `docker/workspace/init-firewall.sh`, `docker/apply/`,
  `desktop/`, the `sync` block of `compose.yaml`.

## MVP (in plain words)

Stack opens Workspace and sees one box and a few real suggestions. He can pick a course, one of his
files, a study routine and how deep to think, or pick nothing. He asks. The Workspace searches his
course files and his notes by itself before it answers. The answer shows which pages and notes it
used, and each one opens. If nothing in his materials matched, it says so in one fixed line.

He can tell it about himself in a short note, and it reads that note every time. He can keep an answer.
A kept answer becomes a note in his notes store, so the Workspace and his other sessions can find it
later, and he can make it forget one.

New Blackboard files, Inbox decisions and kept answers reach the stores without a command. The page
says how fresh his materials are, from the real timestamp.

Nothing he asks can change his planner, his progress, a grade or a fact. It still runs on his
subscription with no API key, and it still answers only while his laptop is awake with Docker running.

## Definition of done

**SOP gates**

- [ ] `web/`: `npm run typecheck`, `npx eslint . --max-warnings 0`, `npm run build`, `npx vitest run`,
      `npm run test:coverage` all exit 0; test count not below `main`'s at the cut.
- [ ] `workspace/`: `npm run typecheck`, `npx vitest run` green; line coverage of `src/` at least 80 %.
- [ ] `mcp-server/`: `npx vitest run` green; `npm run smoke` passes and lists five tools.
- [ ] `apply/`: `npx vitest run` gives 0 failures; `node docker/apply/fork-firewall.mjs --write` then
      `git diff --exit-code docker/apply` exits 0.
- [ ] `sync/`: its suite green with the new case.
- [ ] SQL: `node scripts/db-test.mjs --only <file>` prints PASS for each `phase24_*` unit and for the
      two amended `phase21_*` units; the three standing units still pass.
- [ ] Supabase advisors: no new security finding on the new objects.
- [ ] `/code-review main high` and `/security-review`: CRITICAL and HIGH addressed, recorded in 112a.
- [ ] `desktop/` untouched: `git diff --stat origin/main...HEAD -- desktop` prints nothing.

**Contract**

- [ ] Each of the 14 checks under "What functions properly means" has a named test or proof, and each
      is green.
- [ ] The token audit passes with every new style on Phase 22's tokens. No literal is added.
- [ ] `web/e2e/accept21.spec.ts` still passes, or is amended in this PR with the reason in 112a.

**Live**

- [ ] The PM's walk in a real browser, both themes, at 390 px and at desktop width, with the test
      runner as the only runner on the queue (see Seams).
- [ ] Stack has seen the preview and said OK. This phase is visual.
- [ ] After his merge word and the cut-over: `just accept 24` is green. Green counts as acceptance
      (ORCHESTRATOR section 3, step 9).

**Docs, same PR**

- [ ] STATUS, DECISIONS (one row per answered question, one for the migration block, one for each
      reversal), ORCHESTRATOR's phase table, root `CLAUDE.md`'s Workspace paragraph.

## Task list

Paths are from the bb2dash root. "Runner on `<file>`" means `node scripts/db-test.mjs --only <file>`
and its `PASS` line. Test file names are proposals: the worker may rename one and says so in its
verification section. Order: 1, then (2, 3, 4), then (5 to 9 beside 10 to 18 beside 19 to 22 beside
23), then 25, then 26 to 29, then 30 to 35. Task 24 runs beside and gates nothing.

| # | task | owner | deterministic check |
|---|---|---|---|
| 1 | Stack answers `open-questions.md`; the PM freezes this brief and cuts `feat/workspace-24` | PM + Stack | `grep -c "Phase 24 ·" project-state/DECISIONS.md` gives at least 10 |
| 2 | Probe on the pinned CLI in the phase worktree, by direct recordings, no runner on the queue: ten resumed turns at cap 1.00 with a 24 KiB filler block each; a hook that reports whether it sees `WORKSPACE_TURN_COURSE`; the SDK client lists both servers' tools inside the image and answers two calls 60 s apart | W-77 + PM | `cd workspace && npx vitest run test/probe24-fixtures.test.ts` passes on the recorded streams with 10 result lines; each turn's cost and the count of `error_max_budget_usd` are written in 112a. 0 keeps `--resume`; above 0 the PM rules a fresh session for every turn before task 13 |
| 3 | Vault gate: the `projects` realm's remote is private | PM | `gh repo view <that remote> --json visibility -q .visibility` prints `PRIVATE`. Otherwise tasks 9 and 20 are struck, task 21 registers the Inbox exporter alone, and Stack is told |
| 4 | New wording frozen in `workspace-labels.ts` and its test, on the phase branch, before worker branches are cut | PM | `cd web && npx vitest run test/workspace-labels.test.ts` gives 0 failures |
| 5 | Migration 190 and its unit | W-76 | Runner on `phase24_190_ask_options.sql`: options stored; an unknown routine raises 23503; a depth outside low, mid, high raises 23514; `workspace_ask(uuid, text)` still returns three ids |
| 6 | Migrations 191 and 192, their units, and the two `phase21_*` counts moved to seven | W-76 | the three units PASS with `runner_definer_functions` = 7; a put for an unclaimed request raises 22023; a 41st source row is refused; as `workspace_runner` a select on `workspace_messages` raises 42501 |
| 7 | The port PR: the new count on `main` the day 192 is applied | PM + W-76; Stack's merge word | on `main` after the merge, Runner on `phase21_142_workspace_runner.sql` PASS |
| 8 | Migration 193 and its unit | W-76 | Runner on `phase24_193_corpus_status.sql`: one row; `embedded_newest` equals `max(embedded_at)`; `units_waiting` equals the count of units with no part |
| 9 | Migration 194 and its unit | W-76 | Runner on `phase24_194_keeps.sql`: a second keep of one message raises 23505; the two exporter functions refuse `authenticated`; the runner's count is still 7 |
| 10 | `mcp-server`: `get_material_units(file_id, unit_from, unit_to)`, read-only, with the 20,000-character cut. **Cut first if the phase runs long:** the file chip then filters search hits by `file_id` | W-77 | `cd mcp-server && npx vitest run` green; `npm run smoke` lists five tools |
| 11 | `retrieval/parse.ts` | W-77 | a round trip through the real `formatSearchResults` of `mcp-server/src/format.ts`; the harness fixture of `transcript-contract.test.ts` at the harness commit recorded in 112a; the empty-result form gives zero hits |
| 12 | `retrieval/mcp-client.ts` with the in-process gate | W-77 | a call with collection `stack` never reaches the fake server; a materials call for another course than the turn's never reaches it |
| 13 | `retrieve.ts`, `evidence.ts`, the constants, the 72 KiB replay | W-77 | a property test holds the prompt at or under 131,072 bytes at every maximum; a store that times out at 10 s is named in the block and the turn still answers |
| 14 | Gate: the widened list, the course rule, the fifth tool | W-77 | `npx vitest run test/gate-rules.test.ts test/claude-argv.test.ts`: another course's search exits 2; `stack` exits 2; the argv differs from today's only where the Contract says |
| 15 | Options, override, rotation at 0.60, null session after a Stop: `turn.ts`, `db.ts`, `options.ts` | W-77 | `npx vitest run test/turn-options.test.ts test/turn.test.ts`: a lookup prompt with override high begins as high; `router-cases.json` is unedited and green; a cancelled finish carries a null session id; a last cost of 0.60 starts with `--session-id` |
| 16 | Sources: `sources.ts`; `stream-json.ts` hands each tool result's text on | W-77 | `npx vitest run test/sources.test.ts`: tool hits become origin `tool` rows; no payload holds passage text; `parseLine` and `readInit` keep their signatures |
| 17 | System prompt, six routine files, the fenced "About me" note | W-77 | `npx vitest run test/routines.test.ts test/system-prompt.test.ts`: the seeded ids equal the file names; an id outside the list is refused, never opened as a path |
| 18 | Apply still builds on the changed modules | W-77 | `cd apply && npx vitest run` gives 0 failures; the firewall diff of the DoD exits 0 |
| 19 | Sync: the embed loop on every files pass | W-78 | the sync suite's new case: with `unitsPosted` 0, `embed()` is called once; with nothing missing the loop ends 0 after one call |
| 20 | Notes exporter and renderer | W-78 | `node --test scripts/workspace-notes-export.test.mjs`: a note with `collection: 'bb2dash-workspace'`; filed once; re-filed after a rewrite; deleted on forget; no path outside the vault is written |
| 21 | `scripts/register-exports.ps1`: one task, the Inbox exporter and the notes exporter, at logon and every 6 hours | W-78; run on Stack's word | `(Get-ScheduledTask -TaskName 'Bb2dash-Exports').Triggers.Count` gives 2 |
| 22 | Retrieval eval, no model run: `workspace/eval/run.mjs` over the 9 golden cases | W-78 + PM | run inside the test container: prints `in evidence: n of 9` and exits 0 only at 9; the output is pasted in 112a |
| 23 | Web data layer, may start at once | W-79 | `cd web && npx vitest run test/queries.workspace-ask.test.ts test/workspace-sources.test.ts test/workspace-citations.test.ts`; `git diff --stat origin/main...HEAD -- "web/src/app/(app)/workspace" web/src/components/workspace` prints nothing while Phase 22 is open |
| 24 | Harness follow-up, other repo, should: a timed checkpoint collect in the jobs container and the transcript sweep on the host (R3, sources 3 and 4) | PM | the jobs log no longer prints "skipped in the jobs container"; a host task for the sweep exists. Gates nothing here |
| 25 | Gate: Phase 22 is on `main`; `origin/main` merged into the phase branch; W-79's page branch cut | PM | `git merge-base --is-ancestor <Phase 22's merge commit> HEAD; echo $?` gives 0 |
| 26 | Lobby and composer bar | W-79 | `npx vitest run test/Workspace.lobby.test.tsx test/ComposerBar.test.tsx`: no example row without rows; each chip removes; Ask sends the options |
| 27 | Answer body, citation chips, Copy, Keep, the sources line | W-79 | `npx vitest run test/AnswerBody.test.tsx test/raw-html.audit.test.ts`: an unmatched label stays text; the audit's count of raw HTML sites is `main`'s |
| 28 | Side panel; the `sources` handler and the stop guard in `use-workspace-stream.ts` | W-79 | `npx vitest run test/SidePanel.test.tsx test/use-workspace-stream.stop.test.tsx`: a delta after the page marked the turn stopped changes nothing |
| 29 | Layout: both checks updated for the new modules and the full-height thread | W-79 | `npx vitest run test/Workspace.layout.test.tsx` and `node scripts/walk-box.mjs web/e2e/workspace-layout.spec.ts` exit 0 |
| 30 | Integrate: worker branches merged, types regenerated, full suites, token baseline, advisors | PM | the SOP gates of the DoD |
| 31 | Walk windows, on Stack's word: the live service stopped, the test container the only runner, the PM's walk, the live service back | PM | before and after: `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` is unchanged; `select count(*) from workspace_requests where state in ('queued','claimed')` gives 0 at the end |
| 32 | Reviews | PM | both commands run; findings and fixes in 112a |
| 33 | Acceptance pack and its browser test | PM | `acceptance/24/` holds `manifest.json`, `playbook.md`, `proofs.json`; `web/e2e/accept24.spec.ts` exists; the pack check passes (its command is read from `acceptance/README.md` at the cut) |
| 34 | Docs, the PR, the preview for Stack. Stop at "ready when you say so" | PM | `gh pr view --json state -q .state` prints `OPEN` |
| 35 | After his merge word: cut-over, one service at a time, each alone, with no sync open (`workspace`, then `apply`, then `sync`), then `just accept 24` | PM | the run's `REPORT.md` reads green |

## Workers

Workers are Opus, commit and push per task, never touch `project-state/`, and hand the PM a
verification section that quotes each task's red run and green run. A worker that meets an unclear
point states its default and takes it. Nobody answers a running worker by message (ruling W-S).

| worker | stream | branch | worktree | owns (disjoint) | tasks |
|---|---|---|---|---|---|
| W-76 | db | `feat/workspace-24-db` | `bb2dash-wt-24-db` | `db/migrations/190` to `194`, `db/tests/phase24_*.sql`, the two count lines, `DATA_SYNTAX.md`'s Workspace section | 5, 6, 8, 9 |
| W-77 | runner and tools | `feat/workspace-24-runner` | `bb2dash-wt-24-runner` | `workspace/` except `workspace/eval/`; the named `mcp-server/` files | 2, 10 to 18 |
| W-78 | ingest and exports | `feat/workspace-24-ingest` | `bb2dash-wt-24-ingest` | `sync/src/files.ts` and its test, the three new `scripts/` files and their tests, `workspace/eval/` | 19 to 22 |
| W-79 | web | `feat/workspace-24-web`, then `feat/workspace-24-page` after task 25 | `bb2dash-wt-24-web` | the new `web/src/lib/` files; after task 25 the two Workspace folders, the stream hook, the two layout checks | 23, 26 to 29 |
| PM | integration | `feat/workspace-24` | `bb2dash-wt-24` | labels, types, baseline, acceptance pack, state docs, 112a | 1, 3, 4, 7, 24, 25, 30 to 35 |

W-76 applies nothing to prod. The PM applies each migration on Stack's word after a `begin; ...
rollback;` dry run, under the file's name, byte-identical (Phase 21's worker apply was refused by its
permission layer, brief 102 line 1422). W-78's eval waits for W-77's task 13 on the phase branch.

## Seams

| with | seam | rule here |
|---|---|---|
| **Phase 22 (styling, in progress)** | W-70 owns `web/src/app/(app)/workspace/` and `web/src/components/workspace/` for a token sweep. Its frozen brief says it adds, renames or removes no `.module.css` there and keeps `.column`'s position (brief 103 on fd8e5fe, lines 376-378, 495-497, 782). Its integration task checks for no new dependency (line 783). Its tokens for the red accent are not on `main` yet | **The page waits for 22's merge. Everything else is built beside it.** Until 22 is on `main`, this phase creates or edits nothing under the two Workspace folders, no `.module.css`, no `web/package.json`, no `web/test/Workspace.layout.test.tsx`, no `web/e2e/workspace-layout.spec.ts`, no `web/test/token-audit.baseline/` file. It may add new files under `web/src/lib/` with their tests, and everything in `db/`, `workspace/`, `mcp-server/`, `sync/`, `scripts/`. Phase 22's branch touches none of those folders today (the diff above), and its only planned files there are W-75's own new ones (`scripts/walk-box.mjs`, `scripts/walk-box.test.mjs`, `docker/walk/entry.sh`; lines 500-501). Task 25 is the gate. The page is then written on 22's tokens only. Stack allowed the parallel start in his own sentence |
| Phase 22's standing checks | after its merge, its walk fixture intercepts reads of four Workspace objects (brief 103, line 126) and its phone-width spec covers `/workspace` | this phase's page reads three new objects. W-79 extends those fixtures in this PR and keeps the walk's counts green, or records the new count |
| The live Workspace | `bb2dash-workspace-1` answers from the one queue. `workspace_claim` takes the oldest queued request, whoever asks | **one runner on the queue at a time.** A test runner beside the live one would take his real questions. The test container `bb2dash-wt24` runs only inside a walk window, with the live service stopped, on Stack's word, the service named in every command. Migrations 190 to 194 are additive, so the live runner keeps working after each apply |
| Phase 21 (frozen) | migrations 140 to 143, `workspace_ask(uuid, text)`, the argv test, the seven data attributes, the router's cases | none edited. New functions, new columns, new files. The argv test changes only by the Contract's four differences |
| Phase 23 (apply) | `apply/src` imports six `workspace/src` modules and its image copies the folder (`docker/apply/Dockerfile:39`, R2) | new code goes in new files. A change to one of the six keeps its exports. Apply's suite and the firewall diff are in the DoD. Apply is rebuilt alone at the cut-over |
| The `sync` container | it holds the Blackboard login. One line of `sync/src/files.ts` changes | no model enters the sync. The image is rebuilt once, at the cut-over, alone, with no sync open, the `docker inspect` guard read before and after. The `bb-profile` volume is never touched |
| The harness | the `rag` server, its text contract, the vault, the nightly ingest | read-only consumer of the server. The exporter writes vault notes the way the Inbox exporter does. No harness file changes in this PR. Task 24 is a separate harness PR and gates nothing |
| Phase 15 | `scripts/db-test.mjs`, `db_test_runner` | the new units run through it. Table grants for the units follow brief 95, as 140 did |
| Code freeze | Nov 30 to Dec 13: no merge, no prod apply (ORCHESTRATOR section 2) | the merge lands before Nov 30 or after Dec 13 |

## Out of scope

* Upload of a new file (question 1). Voice. A bottom mode bar. "Ask again at another depth".
* Any write to `assignment_progress`, `reading_progress`, a grade or a fact table. Any propose-then-approve
  path (question 4).
* A planner or grades tool for the assistant (question 5).
* Automatic memory: learned facts, conversation summaries (question 2).
* A model call before the answer: no query rewrite, no classifier (the quality architect's rewrite
  turn is rejected: one more turn on his subscription for every follow-up).
* `get_document` (O-3 stands), the `stack` collection, and every collection outside question 6's list.
* Delete of a conversation. Rename and Archive only.
* A database timer for embeds (question 10), an ingest status table, a new role, a new secret.
* Moving either store. A second embedding model. A reranker.
* Read-only logins for the two MCP servers (DECISIONS line 421 stands for this phase).
* The local and frontier providers stay stubs.
* The notes store's own freshness on the page. It lives in another project and the page cannot read it.
* Growing the golden set past its 9 cases.

## Risks

* **The cap on a resumed session is not settled.** Brief 102 says the cap counts the call's own spend
  (lines 537-538). The stored figure is the session's running total (lines 546-549) and read 0.80 at a
  seventh turn (R4). R4 found no reading of a ninth or tenth turn. Evidence blocks make each turn larger.
  Task 2 settles it before any runner code. Rotation at 0.60 holds either way.
* **Evidence piles up in a resumed session.** Each turn adds up to 24 KiB to the CLI's transcript.
  Rotation bounds it. If task 2 shows a cost climb the PM does not accept, every turn starts fresh.
* **The "blank reply" after a Stop.** That the resumed session causes it is an architect's reading, not
  checked. Check 7 fixes the mechanism; the walk shows whether the defect is gone.
* **Whether a hook process sees the turn's environment is not checked.** Task 2 reads it. If it does
  not, the course rule moves into the hook's settings file per turn, a PM ruling.
* **Two runners, one queue.** See Seams. A mistake here answers his real question on test code.
* **Text parsing.** The harness lines are a pinned contract. The materials lines are not. The round-trip
  test in task 11 is what holds them.
* **Up to eight note searches for an unscoped question** (question 6's default). Most class collections
  hold one to eight documents today (R3). The 10 s limit and the named failed store bound the cost.
* **Kept answers carry course text out of the app.** Task 3 is a gate, not a note. Not checked today:
  whether the `projects` realm's remote is private.
* **The sync rebuild at the cut-over.** Small code, sensitive container. Not checked: why
  `bb2dash-sync-1` restarted about 15:18Z today (R3).
* **Size.** 35 tasks, four workers, five migrations. The cut order if it runs long: task 10, the
  Materials tab, tasks 9 and 20 (Keep), the outline toggle. Retrieval, sources, scope and the lobby
  are the phase.
* **Phase 22 slips.** The page then waits. The backend can merge behind today's page only if the PM
  splits the PR, which breaks one PR per phase and needs Stack's word.
* **The metering plan is still paused, not gone** (brief 102, lines 79-83). Unchanged risk.
* **Not known:** who asked the three unscripted questions of 2026-10-08 (R4); where
  `HARNESS_CHECKPOINT_REPOS` is set (bb2dash-stack was not read); the sync suite's file names; the pack
  check's command.

## Open items for Stack

Ten, in `open-questions.md`, each with its default. The project's SOP says substantial new scope goes
to Stack before building, and he verifies before development begins (root `CLAUDE.md`). So nothing in
this brief is built before he answers. One word, "defaults", is an answer, as it was on 2026-10-05.
Each answer becomes a DECISIONS row dated the day he gives it.
