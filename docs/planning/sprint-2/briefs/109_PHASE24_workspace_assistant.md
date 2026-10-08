# Phase 24a: Workspace assistant, behind the page. Sessions from the database, a planning turn and an answering turn, one bb2dash retrieval store, uploads, the planner and grades feed, memory

Date 2026-10-08 · PM: the Fable session · Product manager: Stack · Requirements: Stack's ask of
2026-10-08 (no id in `91_REQUIREMENTS_v3.md`; proposed tag S2-workspace-2, the PM assigns it at the
freeze) · Answers on record: `109a_PHASE24_open_questions.md` · Branch `feat/workspace-24` · Worktree
`bb2dash-wt-24` · Workers W-76 to W-80 (W-67 to W-70 and W-75 are Phase 22's, W-71 to W-74 are used;
brief 103 on `feat/styling-22` at 3d02033, line 129) · Migration range **190 to 199** (190 to 197 are
written here, 198 and 199 are slack) · Test compose project `bb2dash-wt24` · Verification file
`docs/planning/sprint-2/verification/109c_PHASE24_VERIFICATION.md`, called 109c below · Status: **ready
to freeze on Stack's answers of 2026-10-08.** Three things stay provisional until their probe passes:
the planning turn (P-4), a turn with no MCP server (P-1) and a turn that stores no session (P-2).

**Two briefs, two PRs.** This brief is Phase 24a, everything behind the page. Brief
`111_PHASE24B_workspace_page.md` is Phase 24b, the redesigned page, cut only after Phase 22 and 24a are
on `main`. Stack chose that shape (answer 11 in 109a). Beside 24a's PR, by the PM's default and his to
object to: a companion PR in bb2dash-stack (the umbrella declares secret names and its doctor pins
them) and one test-only port PR to `main`, as Phases 21 and 23 had.

**Facts re-read for this brief, 2026-10-08, read-only.**

* The shared checkout is clean on `main` at a58be34 (`git status --porcelain | wc -l` gives 0).
* `ls db/migrations | tail -1` gives `186_inbox_apply_notices.sql`. No file numbered 187 or above
  exists on any of 30 local and remote-tracking refs or in six worktrees (`git ls-tree` over
  `for-each-ref`, no fetch). Prod has no migration named 187 to 199 (one SELECT on
  `supabase_migrations.schema_migrations`, 2026-10-08). 187 to 189 are Phase 23's slack (root
  `CLAUDE.md`). So 190 to 199 is the next free block of ten.
* Prod, same SELECT: one bucket, `bb-files`, private, limit 52,428,800 bytes. `workspace_runner`
  executes exactly `workspace_begin`, `workspace_claim`, `workspace_finish`, `workspace_heartbeat`,
  `workspace_stream`. `authenticated` may execute `hybrid_search_file_text` (one overload).
  `storage.objects` carries the trigger `protect_objects_delete`. 982 text units, 0 without an
  embedding. 41 requests, 11 conversations.
* Phase 22 is building today. `feat/styling-22` is at 3d02033 (4 ahead of `main`),
  `feat/styling-22-foundation` at a1afeae (7 ahead, newest commit 15:22 local),
  `feat/styling-22-walkbox` at 9a1b862 (28 ahead). None changes a file under
  `web/src/app/(app)/workspace/` or `web/src/components/workspace/`, and none changes a path this brief
  gives a worker (`git diff --name-only main...<branch>` over those paths prints nothing).
* `workspace/src/turn.ts:345, 368-376`: the tier comes from `routeTier` and the provider's input is the
  claim alone. `workspace/src/providers/claude-cli.ts:72-75, 416, 474`: a later turn resumes the CLI's
  own session.
* `workspace/src/hooks/gate-rules.ts:13-24`: four allowed tools and two notes collections.
* `workspace/src/config.ts:37-45, 69-73, 87-89`: one turn at a time, 8 minutes, 96 KiB replay, one
  argument under 131,072 bytes, cap 0.01 to 1.00.
* `compose.yaml:181, 217, 222-226, 273-274`: the Workspace builds from the harness `mcp-server`
  folder, mounts the volume `workspace-claude-home` and four secrets, one of them
  `harness_database_url`.
* `docker/workspace/init-firewall.sh:100-103` lists two database secrets, and
  `docker/apply/fork-firewall.mjs:40-44` replaces that exact text to make the apply firewall.
* `apply/src` imports six `workspace/src` modules (`config`, `errors`, `providers/claude-cli`,
  `stream-json`, `db`, `alive`: `apply/src/claude.ts:18-21`, `config.ts:16-17`, `db.ts:8`,
  `healthcheck.ts:12`, `main.ts:18-21`). Its bundle leaves packages external
  (`apply/package.json:12`) and its image copies `workspace/src` and `mcp-server/`
  (`docker/apply/Dockerfile:39, 46-49`).
* `supabase/functions/search/index.ts:75-79` builds its client with the service role for any caller
  that passes the JWT check.
* `sync/src/files.ts:248-252` runs the embed loop only when a unit was posted;
  `sync/src/report.ts:115-119` turns an embed error into a failed sync; `sync/src/loop.ts:93` files
  the Inbox apply request only after a sync that closed done.
* `web/src/lib/graded-so-far.ts:47` imports from `queries.grades.ts`, which loads React Query and the
  browser client (`queries.grades.ts:29-30`).
* `web/src/lib/use-workspace-stream.ts:262-275` registers two events, `delta` and `done`.
* bb2dash-stack (read-only, `main` at c4a54f8) declares the Workspace's secret names itself
  (`compose.yaml:214-215, 229-233`), pins them in its doctor (`doctor/lib/constants.mjs:16-24`,
  `doctor/workspace.test.mjs:36`) and holds the acceptance run's fixed list of host actions
  (`scripts/lib/accept-actions.mjs:290-304`).

Every other file and line cited below was read for this brief unless a sentence says "not checked".
The PM re-reads each at the cut before the freeze. No docker command was run and nothing was written
to any database.

## Why

Stack wrote on 2026-10-08: "Regarding the workspace section, the Replit Web keyword png's in my
downloads should serve as both ui and feature inspiration. Once you complete the visual passes (or
while they are going in parallel), I want you to redesign the features and functionality to upgrade the
workspace section so that it begins functioning properly as a personalized chatbot connected to my
materials and rag db with RAG pulling (as well as the upsertion pipeline) automated."

Phase 21 built the transport and the fence, and both held: 40 requests and no infrastructure error
(reading of 2026-10-08 16:12 UTC, map R4). What it did not build is what the sentence asks for.

* **Retrieval is not automatic.** The runner has no retrieval step; the model searches only when it
  chooses to (`turn.ts:368-376`).
* **A conversation lives in files on a container volume.** A follow-up resumes the CLI's transcript
  (`claude-cli.ts:416, 474`; `compose.yaml:217`). He asked for session storage in the database.
* **It cannot see the planner or a grade** (DECISIONS 2026-10-05, O-4).
* **It cannot take a file**: `workspace_ask` carries text only
  (`db/migrations/140_workspace_tables.sql:269`).
* **Nothing it produces is kept or indexed.** No embed code exists in `workspace/src` or migrations
  140 to 143 (map R3).
* **It has barely been used.** 37 of 40 requests were test scripts (map R4).

The backend rule of 2026-10-07 stands: each model turn is one `claude -p` process of the pinned CLI
(2.1.289) on his subscription. No API key, never `--bare`, never the Agent SDK.

## Stack's answers

His words are in quotes. The rest are options he chose, or calls listed to him as taken that he did
not object to. The full record, with each question's options, is `109a_PHASE24_open_questions.md`.

| # | question | his answer, 2026-10-08 | what it decides here |
|---|---|---|---|
| 1 | what it remembers by itself | Automatic summaries: each finished conversation is summarised and stored by a cheap background turn, listed where he can delete any of them, plus an "About me" note he writes that it reads on every question | Memory; `workspace_profile`; the job functions. The list and the delete control are 24b's, so memory writing stays off until 24b |
| 2 | where memory lives | "inside this app only. We also need to ensure that the RAG DB with the chunked materials (syllabi, assignments, etc), using a cheap model to orchestrate those retrievals, while a higher level model then takes the context, the prompt, any other attached documents (add this feature if it isnt one). I also want a bb2dash specific rag databse and session storage (for scalability purposes) so ensure that is implemented during this phase if it is not already." | One store in the bb2dash project; the two turns; attachments; sessions from the database |
| 3 | attaching a file | "pick from materials as default, option to browse and select from device." A file from his device is private to the Workspace: indexed in bb2dash's own store, findable in later conversations, not shown on Materials or course pages | `workspace_request_attachments`; the bucket; the `workspace-ingest` service. The controls are 24b's |
| 4 | the planner | "Yes and it should. Planner should also be ingested into the RAG db or called as an explicit data feed for the assistant." | `workspace_planner_feed`, a structured read on every answer (ruling W-6 takes the feed, the second of his two forms) |
| 5 | grades | "It can have access to grades." | Posted scores in the feed. The "graded so far" figure stays on the Grades screen (see The planner and grades feed) |
| 6 | session storage | The database is the source. Every turn rebuilds its context from bb2dash's database; nothing that matters lives on the container | No `--resume`; the transcript volume is no longer read |
| 7 | his class notes in the vault's store | Leave notes out. It uses course materials, uploads, the planner and grades, and its own memory only | The `rag` server, its secret and its tool leave the container |
| 8 | when nothing of his matches | It answers from general knowledge and says plainly that it found nothing of his | The `empty` retrieval state and its fixed sentence |
| 9 | study routines | All five to start: Quiz me, Study guide, Explain this file, Summarise a reading, Plan my week | `workspace_routines`, six seeded rows |
| 10 | graded work | "Drafting help": a routine that drafts or rewrites text for an assignment. His decision, recorded, not argued here | The sixth routine, `draft-help` |
| 11 | delivery | Two parts: everything behind the page in one PR, then the redesigned page in a second PR after Phase 22 is on `main` | This brief and brief 111 |
| 12 | formatted answers (taken) | Answers are formatted (headings, lists, tables). No image is ever drawn and no link is fetched | The `format` option. Rendering is 24b's |
| 13 | depth (taken) | A depth menu: Auto, Quick, Standard, Deep, starting on Auto | The `depth` option and `depth.ts` |
| 14 | usage (taken) | The ceiling stays as it is, one question at a time | Plan 0.05 plus answer 0.95 inside the 1.00 cap; one answer at a time across runners |
| 15 | indexing (taken) | New course files are indexed on every sync; a failed one retries at the next sync; the page shows how many wait | The sync's embed rule; `v_workspace_index_status` |
| 16 | what it may write (taken) | Nothing except its own memory, each answer's source list and the index of his uploads | No write path to planner state, a grade or a fact table |

**The PM's rulings on top of those answers.** They bind the design; where a ruling and his words
differ, his words win. The briefs cite them by number.

* **W-1.** Two briefs and two PRs. 24a leaves today's page working and better and touches no page
  file, no CSS module and neither layout check (Seams has the rule in full).
* **W-2.** One retrieval store, in the bb2dash project. Nothing is read from `harness-memory`; the
  `rag` server, its secret and its tool leave the container.
* **W-3.** Sessions from the database. Each turn is its own `claude -p` process with a context built
  from stored rows. No `--resume`. The claim is safe for more than one runner later.
* **W-4.** Two model turns per question: a cheap one for retrieval, then the answering one. Each is
  one `claude -p` of the pinned CLI on his subscription.
* **W-5.** Attachments: a course file by pick, or a file from his device through a private bucket and
  a service that is not the sync and shares no network or volume with the Blackboard login.
* **W-6.** The planner and grades come as an explicit data feed, not as embedded text. The "graded so
  far" figure only if it can be the same computation the Grades screen runs. No write becomes possible.
* **W-7.** Memory: a background turn after a conversation has gone quiet, never while a question
  waits; a rolling summary for long conversations; a list he can delete from; remembered text marked
  as model-written and as data.
* **W-8.** Routines are data, not code.
* **W-9.** The page follows his screenshots in Phase 22's design language. Deep applies to one
  question. A plan-first toggle and voice input are out of scope.
* **W-10.** Indexing is automatic and observable, and an embed failure on a pass that added nothing
  never fails a sync.
* **W-11.** The earlier challenger's findings still bind where they still apply (the appendix places
  each).
* **W-12.** The project's rules are unchanged: additive numbered migrations, 140 to 143 frozen,
  secrets as files outside every repo, no Claude process on a network or volume with the Blackboard
  login, no model in the sync, no fabricated number on screen.
* **W-13.** An acceptance pack under `acceptance/24/`, written with 24a and extended by 24b.
* **W-14.** Workers continue the project's numbering from W-76.
* **W-S** is Phase 21's ruling: a running worker is never answered by message (ORCHESTRATOR section 3,
  learned in Phase 21).

## What "functions properly" means

Each line is a check that fails today. Each becomes a named test or an acceptance proof.

1. With a fake retriever, the answering prompt holds labelled passages before the question. Today the
   prompt is the claim's text alone (`turn.ts:372`).
2. No argv holds `--resume`, and a follow-up's prompt holds the earlier turns from stored rows. Today a
   later turn resumes the CLI's transcript (`claude-cli.ts:74`).
3. A Standard or Deep question starts two `claude -p` processes, the first on `haiku` with no tool and
   no MCP server. Today it starts one.
4. Every answered request has one `workspace_turns` row and its `workspace_sources` rows, holding ids,
   counts and timings and no passage text. Today the only trace is the tool-name line
   (`web/src/components/workspace/thread.ts:324-332`).
5. As `workspace_runner`: the feed for a claimed request returns due dates, statuses and posted scores;
   for an unclaimed request it raises 22023; a direct select on `assignment_progress` still raises
   42501. Today no such path exists.
6. A file put in the private bucket is read by a service with no model, and a later question's
   retrieval finds it (a source row of kind `upload`). Today no path exists (map R3, source 7).
7. An attached course file's text is in the answering prompt, cut to its budget. Today
   `workspace_ask` takes text only (`140:269`).
8. With memory switched on, a conversation quiet for 15 minutes gets one memory item; deleting it
   leaves no row for search in the same transaction. Today nothing from a conversation is embedded.
9. The container mounts no `harness_database_url`, the MCP config names one server and the gate allows
   two tools. Today: four secrets, two servers, four tools (`compose.yaml:222-226`,
   `mcp-config.ts:27-44`, `gate-rules.ts:13-18`).
10. When nothing of his matches, the turn's retrieval state is `empty`, the answer exists and its first
    line is the fixed sentence. Today no rule covers it.
11. A request with a course scope searches only that class's course ids, and the materials server
    refuses a model search outside them. Today a request carries no course.
12. `workspace_ask_with` stores a course, a depth, a routine, a format and up to five attachments;
    `workspace_ask(uuid, text)` still returns its three ids; `db/tests/phase21_140_workspace_tables.sql`
    passes unedited. Today the first function does not exist.
13. Ten turns in one conversation at the 1.00 cap: 10 `done`, 0 `budget_exceeded`, each stored cost
    the turn's own. Today the stored figure is the session's running total and read 0.80 at a seventh
    turn (map R4).
14. A files pass that posted no unit still runs the embed loop once, and an embed failure on such a
    pass closes the sync `done` with a report line and files the Inbox apply request. Today the loop is
    skipped (`files.ts:249`) and an embed error fails the sync (`report.ts:115-119`).
15. One row says how many course units, uploads and memory items wait or failed. Today
    `v_embedding_status` covers course units only (`db/migrations/010_search_layer.sql:84-93`).
16. After a Stop, the next answer's context shows the stopped turn as stopped. Today the next answer
    says the earlier reply was blank (map R4, known defects).
17. A Stop during the planning turn stores `cancelled` and starts no answering process.

## Contract

### The question's path

Files are under `workspace/src/` unless a path says otherwise. NEW marks an object or file that does
not exist today.

1. **Ask.** Today's page calls `workspace_ask(uuid, text)`, unchanged
   (`web/src/lib/queries.workspace.ts:684-687`). The 24b page calls NEW
   `workspace_ask_with(uuid, text, jsonb)`. A request with no options row means: depth auto, no scope,
   no routine, no attachment, format plain. So today's page keeps working with no web change.
2. **Claim.** NEW `workspace_claim_v2(p_runner)` keeps 143's two sweeps and its `for update skip
   locked` (`db/migrations/143_workspace_review_round.sql:217-258`) and adds three things. It takes a
   transaction-level advisory lock. It first closes, as `failed` / `stale_claim`, any request still
   `claimed` under the same `p_runner`: a runner asks for a claim only when it holds no turn
   (`runner.ts:151-168`), so such a row is its own dead turn. It returns nothing while another request
   is `claimed`. `workspace_claim(text)` stays as it is and is no longer called by the new runner.
3. **Context.** NEW `workspace_turn_context(p_request_id, p_runner)` returns one jsonb and refuses
   (22023) unless the request is claimed by `p_runner`. It holds: the options; the routine's
   instructions; the attachments; the About me note; the conversation's rolling summary and its
   through-point; the stored messages after that point, oldest first, a stopped or failed answer marked
   with its code; the tier of the last answer whose depth was auto; the course list (id, short title,
   display id); today's date in New York.
4. **Depth to tier.** NEW `depth.ts`: quick is `low`, standard is `mid`, deep is `high`, auto is
   `routeTier(question, lastAutoTier)`. `router.ts` and its cases file do not change. A Deep choice
   does not stick, because rule 3 of the router (`router.ts:127`) is given the last auto tier, not the
   last answer's tier.
5. **Begin.** `workspace_begin`, unchanged. The stream timer starts here (`turn.ts:362-363`), so a Stop
   is seen within 2 s in every later stage.
6. **Planning turn.** Only when the tier is `mid` or `high` and the budget is at least 0.10. See The
   two turns.
7. **Retrieve.** NEW `retrieve.ts` runs the plan, or the fallback plan, through one child process of
   the materials package, 10 s in all. See The stores.
8. **Feed.** `workspace_planner_feed`, on every answer.
9. **Assemble.** NEW `context/assemble.ts` and `context/budget.ts` build one prompt argument from
   stored rows and retrieved data, each block fenced and titled as data, the question last.
10. **Store facts and sources.** NEW `workspace_turn_put(p_request_id, p_runner, p_facts, p_sources)`
    writes the `workspace_turns` row and the `workspace_sources` rows before the answering model
    starts, and sends the Realtime event `sources` `{request_id, state, found_n}` on
    `workspace:<conversation>`. Today's page registers `delta` and `done` only
    (`web/src/lib/use-workspace-stream.ts:262-275`), so it ignores the new event.
11. **Answering turn**, streamed as today through `workspace_stream`.
12. **Sources from the answering turn.** A unit the model opens by id becomes a source row of origin
    `tool`, taken from the call's input, in a second `workspace_turn_put` before finish. Nothing is
    parsed out of a tool result's text.
13. **Finish.** `workspace_finish`, unchanged, always with a null session id. `tool_calls` carries the
    runner's own steps in the stored four-key shape (`search` with its course scope, `planner_feed`)
    followed by the model's calls, so today's line under an answer shows them with no web change
    (`web/src/lib/queries.workspace.ts:393-408`).
14. **Idle work.** When the queue is empty the runner may run one background job. See Memory.

### Sessions

* **Every turn is a new CLI session.** The argv always carries `--session-id <new uuid>`. The resume
  arm of `planSession` and `shouldRetryAsFresh` go (`claude-cli.ts:50-57, 154-156`).
  `workspace_conversations.claude_session_id` is written null by every finish and read by nothing.
* **The context is rebuilt from the database each time**: the recent turns inside a byte budget, the
  rolling summary, the About me note, the retrieved passages, the attached documents and the feed.
  Nothing a turn needs is on the container.
* **A long conversation keeps a rolling summary** in NEW `workspace_conversation_state`. It is
  rewritten by a background turn when the messages older than the newest 14,000 bytes and newer than
  the summary's through-point pass 12,000 bytes. If a question arrives first, that turn uses the summary
  it has and the newest messages that fit; the count of messages left out is logged.
* **The transcript volume.** `--no-session-persistence` is added to the argv if P-2 passes, and the
  service's mount of `workspace-claude-home` (`compose.yaml:217`) is replaced by a tmpfs at the same
  path. If P-2 fails on the pinned CLI, the mount stays and `cleanupPeriodDays` drops from 30 to 1
  (`workspace/claude/settings.json:2`). Either way nothing reads the named volume after the cut-over.
  It still holds up to 30 days of old transcripts with tool results. Nobody in this phase removes it;
  removing it is the PM's step on Stack's word.
* **More than one runner later.** The claim is atomic (`143:245-258`), one request may be open per
  conversation (`140`, index `workspace_requests_one_open`), finish refuses a request that is not
  claimed or cancelled (`143`, the refusal in `workspace_finish`), and every NEW runner function checks
  `claimed_by`. `workspace_claim_v2` also holds answers to one at a time across runners, which is
  answer 14. Only one runner runs in this phase. A second one needs its own heartbeat row
  (`workspace_runner_heartbeat` allows `id = 1` only, `140`), which is a later migration.
* **Two runners must never share a name.** The name is `workspace@<hostname>` (`config.ts:285`) and the
  `workspace` service sets no `hostname` (`compose.yaml:173-239`), so each container has its own. A
  test pins that the compose block names none: with a shared name, one runner's claim would close the
  other's turn.

### The two turns

**Who searches: the cheap turn writes a plan and the runner carries it out.** Ruling W-4 left this to
the design. The reasons:

* No retrieved passage and no attachment text is ever in the planning turn's input. It sees the
  question, the rolling summary, the last turns, names and dates. A poisoned file cannot steer it.
* Hits reach the runner as data from its own search call, so document text cannot forge a hit (W-11).
* One real question to Haiku with tools ran 65.0 s and 13 calls (map R4). A plan is one short turn.
* A planning turn that fails falls back to a plain search. It never fails the answer.

**Planning turn** (NEW `plan.ts`, `prompts/plan.md`). Model `haiku`, no tool, no MCP server.

* Input: the question, the rolling summary, the last turns (6,000 bytes), the course list, the scope,
  the attachments' titles and today's date.
* Output: one JSON object, `{"queries": [{"q", "kinds", "course"}], "feed": {"from", "to"}}`. At most 4
  queries, 6 on Deep. `kinds` is a subset of `material`, `upload`, `memory`. `course` is null or one
  course id, inside the scope when the request has one. The object is checked by hand; no new package.
* Limits: 20 s and 0.05. Text that is not that object, a timeout or a budget stop gives the fallback
  plan. `sign_in_expired` or `usage_limit` fails the request with that code and starts nothing more.
* The fallback plan, which is also Quick's plan: one query, the question as written, all three kinds,
  the scope's courses, the default feed window. When the question is 80 characters or fewer, as much
  of the previous user message as fits is put after it.

**Answering turn.** The routed or chosen model. It receives the assembled context and may call two
tools, `mcp__bb2dash__search_materials` and `mcp__bb2dash__get_material_text`. Why it keeps them: it
can look once more when the plan was thin, and it can read a whole unit it wants to quote. Both are the
tools Phase 21 proved under the gate. The materials server enforces the limits itself, from its
environment: at most 3 searches (4 when no planning turn ran), at most 10 reads, and with a scope a
search must name a course of the scope. A read by id is not scoped. `list_courses` is no longer
offered: the course list is in the context. A second search by the model covers course materials
only; uploads and memory reach an answer through the runner's retrieval and through attachments.

**Quick** is one turn. No model plans. The runner searches with his words (the fallback plan) and
Haiku answers with the passages. Auto behaves the same way whenever the router picks `low`.

**Argv, against `claude-cli.ts:83-122`.**

| element | today | 24a |
|---|---|---|
| session | `--session-id` or `--resume` | always `--session-id <new uuid>` |
| `--no-session-persistence` | absent | added if P-2 passes |
| `--allowedTools` | four names | answering turn: the two names above. Planning and summary turns: the flag is absent |
| `--disallowedTools` | six built-in tools and `mcp__rag__get_document` (`claude-cli.ts:23`) | the six built-in tools |
| `--mcp-config` | `/run/workspace/mcp.json` | answering turn: NEW `/run/workspace/mcp-<request id>.json`, one server `bb2dash` with the turn's limits in its `env`, mode 0600, removed after the turn. Planning and summary turns: NEW `/run/workspace/mcp-none.json`, no server |
| `--append-system-prompt` | `prompts/system.md` | answering turn: `system.md`, the format rule, the routine's instructions, the About me note. Planning turn: `plan.md`. Summary turn: `summary.md` |
| `--include-partial-messages` | present | answering turn only |
| `--max-budget-usd` | the budget | planning 0.05; answering the budget minus 0.05; summary 0.05 |
| prompt | the question, or replay and question | the assembled context, the question last |

Every other element is unchanged: `-p`, `--model`, `--tools ""`, `--permission-mode dontAsk`,
`--permission-prompts none`, `--strict-mcp-config`, `--setting-sources project`, `--settings`,
`--system-prompt-snapshot off`, `--output-format stream-json`, `--verbose`, `--include-hook-events`
and the `--` before the prompt. The assembled prompt opens with a framing line, so it never opens
with `/` (DECISIONS 2026-10-07, "a question that opens with `/` is passed framed"); a test pins that.

What changes with it:

* **Gate** (`hooks/gate-rules.ts:13-24`): `ALLOWED_TOOLS` is the two names. The collection rule goes.
* **Init check** (`stream-json.ts:142-165`): `checkInit` takes the servers and tools the turn's kind
  expects. Answering: exactly `bb2dash`, connected, the two tools. Planning and summary: no server and
  no tool whose name starts `mcp__`. `parseLine` and `readInit` keep their signatures: apply imports
  them (`apply/src/claude.ts:21`).
* **MCP config** (`mcp-config.ts:27-44`): loses `rag`.

**How passages are labelled.** Each block is fenced, titled, and says it is data, not instructions.

* A passage carries a label by its own id: `[M<id>]` for a course unit (`bb_file_text.id`), `[U<id>]`
  for a unit of an upload, `[R<id>]` for a remembered item, marked "written by the assistant, may be
  wrong". The feed is one block labelled `[P]`.
* Under the label: the file's title, its page, slide or sheet, and its course id. A passage that holds
  the `[notes]` marker also carries the speaker-notes warning (root `CLAUDE.md`; `system.md:23`).
* With format `rich` the model is told to cite by label. With format `plain`, which is every question
  from today's page, it is told to name the file and the page in words and to write no bracket label,
  so today's plain-text page shows no stray marks. The source rows are stored either way.
* Labels are ids, not ordinals, because the answering turn can open more units by id, and those get
  their rows after the prompt was built. The 24b page numbers the chips by row order.
* A label in an answer with no source row of that request stays plain text (24b).

**Byte budget of the prompt argument.** The limit is under 131,072 bytes (`config.ts:73`).

| block | bytes |
|---|---|
| question | 32,000 |
| attached documents, shared | 40,000 |
| passages, 14 at most, 2,000 each | 28,000 |
| recent turns | 14,000 |
| planner and grades feed | 6,000 |
| rolling summary | 3,000 |
| remembered items, 3 at most, 1,000 each | 3,000 |
| framing | 2,000 |
| total | 128,000 |

`REPLAY_MAX_BYTES` and `buildPrompt` retire (`config.ts:71`, `replay.ts:58-75`). The system prompt is
a separate argument: `system.md`, the format rule, a routine's instructions (4,000 characters at
most) and the About me note (2,000 characters at most).

**Cost and time.**

* Quick, and Auto on `low`: 1 turn. Standard and Deep, and Auto on `mid` or `high`: 2 turns.
* Against the ceiling: planning 0.05 plus answering 0.95 is today's 1.00 (`config.ts:87-89`). Under a
  budget of 0.10 the planning turn is skipped.
* The stored `cost_usd` becomes the answering turn's own. The running total was an effect of resuming
  one session (`140`, the comment on `cost_usd`). The planning turn's cost is in `workspace_turns`.
* Background turns are 0.05 each and outside any answer's cap. They never run while a question waits.
* One 480 s limit covers the whole request (`config.ts:45`): planning, retrieval and answering.
* A planning turn's real cost and time: not checked. P-4 measures both before anything is built on it.

**What a failure looks like to him.** The eight error codes stay (`errors.ts:9-18`). The finer states
live in `workspace_turns`. While the page is today's, the runner writes the fixed sentence itself as
the answer's first line (format `plain`), so it does not depend on the model. With format `rich` the
24b page shows the same sentence as a fixed line and the runner adds nothing. The sentences live in
NEW `lines.ts`.

| event | stored | he sees |
|---|---|---|
| the planning turn failed | plan `fallback` | an answer; the search used his question as written |
| the search failed | retrieval `failed` | an answer that says it could not search his files this time |
| nothing matched | retrieval `empty` | an answer from general knowledge that says it found nothing of his |
| an attachment is not read yet, failed, or was cut | the attachment's state | the answer names the file it could not read, or read in part |
| Stop, the time limit, the budget, the plan's limit, sign-in | the existing codes | today's sentences |

After three failed searches in a row the runner skips the search for 5 minutes and stores `failed`
for each question meanwhile, so a search function that is down does not cost every question 10 s.

### The stores and every database object

**One retrieval store, in the bb2dash project** (ruling W-2): the course materials it already holds
(`bb_file_text`, `bb_text_embeddings`), his uploads and the assistant's memory. All three are embedded
with `gte-small` at 384 dimensions, so cosine similarity orders hits across kinds. Nothing is read from
`harness-memory`.

All objects are NEW and additive. `workspace_requests` and migrations 140 to 143 are not altered, so
`db/tests/phase21_140_workspace_tables.sql` stays green on both sides of every apply. No table has a
foreign key to `bb_files` or `bb_file_text`: later strip migrations delete those rows
(`119`, `150`). `courses.id` is text and `bb_files.id` is bigint. Row security is on for every table,
with owner policies in 140's form, anon revoked, and column-level writes for the browser.

| table or view | columns | browser | written by |
|---|---|---|---|
| `workspace_documents` | id bigint, kind (`upload`, `memory`), title, course_id, conversation_id, storage_key, mime, byte_size, sha256, state (`stored`, `reading`, `text_ready`, `indexed`, `failed`), error_code, attempts, signed_url, signed_url_expires_at, claimed_at, claimed_by, created_at, updated_at. One memory row per conversation | select; update of title and course_id | `workspace_upload_register`, the ingest functions, `workspace_job_finish` |
| `workspace_document_text` | id bigint, document_id (cascade), unit_kind, unit_no, text, fts, embedded_at | select | `workspace_ingest_put_text`, `workspace_job_finish` |
| `workspace_text_embeddings` | text_id (cascade), part_no, part_range, model, embedding vector(384), an HNSW cosine index (the shape of `010:46-57` after 011) | none | the edge function `workspace-embed` |
| `v_workspace_memory` | document id, conversation_id, state, created_at, updated_at, summary | select | a view, security invoker |
| `workspace_profile` | id = 1, about_me (2,000 characters at most), updated_at | select; update of about_me | the owner |
| `workspace_conversation_state` | conversation_id, rolling_summary, summarised_through, job_claimed_at, job_claimed_by, job_failures, memory_opt_out, memory_written_at | select | the job functions, `workspace_document_delete` |
| `workspace_routines` | id, grp, title, description, needs (`nothing`, `file`, `course_or_file`), sort, enabled, instructions | select | the migration (six rows) |
| `workspace_request_options` | request_id (cascade), course_display_id, course_ids text[], depth (`auto`, `quick`, `standard`, `deep`), routine_id, format (`plain`, `rich`) | select | `workspace_ask_with` |
| `workspace_request_attachments` | request_id (cascade), ord (1 to 5), kind (`file`, `upload`), file_id, document_id (set null) | select | `workspace_ask_with` |
| `workspace_turns` | request_id (cascade), depth, tier, plan_state (`skipped`, `planned`, `fallback`), retrieval_state (`found`, `empty`, `failed`), found_n, passages_n, memory_n, feed_rows, attachments (ids and states), prompt_bytes, plan_ms, retrieval_ms, plan_cost_usd, created_at | select | `workspace_turn_put` |
| `workspace_sources` | request_id (cascade), ord (1 to 40), kind (`material`, `upload`, `memory`, `feed`), origin (`auto`, `attached`, `tool`), file_id, text_id, document_id (set null), doc_text_id, course_id, unit_kind, unit_no, similarity, title | select | `workspace_turn_put` |
| `workspace_ingest_heartbeat` | id = 1, polled_at, runner | select | `workspace_ingest_heartbeat()` |
| `v_workspace_index_status` | one row; see Indexing and status | select | a view, security invoker |

`workspace_sources` never stores passage text. A row is kept only when its ids exist; a 41st row is
cut, never refused, as 143 cuts tool calls. A title is the file's name or the upload's title, so a row
stays readable after its upload is deleted.

**Functions.**

| function | runs as | who may execute | what it does |
|---|---|---|---|
| `workspace_ask_with(uuid, text, jsonb)` | invoker | authenticated | calls the frozen `workspace_ask` and stores the options and attachments in the same transaction. Keys: `course` (a display id of `v_course_display`, expanded to its `shell_ids`, `017_course_display.sql`), `depth`, `routine`, `format`, `files`, `uploads`. Returns the same three ids. 22023 for the text's length and 23505 for a second open request, as today; 23503 for an unknown routine or upload; 23514 for a bad value, a sixth attachment, or a routine whose `needs` is not met |
| `workspace_upload_register(...)` | invoker | authenticated | records an upload. Accepts only a signed URL on the project's host under this bucket's signed path |
| `workspace_upload_retry(bigint, text, timestamptz)` | invoker | authenticated | a failed upload goes back to `stored` with a fresh signed URL |
| `workspace_document_delete(bigint)` | invoker | authenticated | the row, its units and its vectors go in one transaction; returns the storage key for the browser to remove. For a memory item it also sets `memory_opt_out` |
| `workspace_search(p_q, p_query_embedding, p_kinds, p_courses, p_limit, p_min_similarity)` | invoker | authenticated, service_role | unions `hybrid_search_file_text` (`129_search_notes_label_materialize.sql:17-24`), once per course of the scope, with a NEW twin over the new tables. Each row: kind, the unit's id, file_id or document_id, course_id, title, unit, part, similarity, score, a passage of at most 2,000 characters from the matched part, and whether it holds the `[notes]` marker. With a scope, course materials and course-tagged uploads are filtered; untagged uploads and memory are always searched |
| `workspace_attachment_read(p_kind, p_id, p_max_chars)` | invoker | service_role | an attached file's units in order, cut on the server, with the bytes read and the total |
| `workspace_ingest_claim`, `workspace_ingest_put_text`, `workspace_ingest_finish`, `workspace_ingest_heartbeat` | definer | `workspace_ingest_runner` | see Uploads and extraction |
| `workspace_claim_v2`, `workspace_turn_context`, `workspace_turn_put`, `workspace_planner_feed`, `workspace_job_claim`, `workspace_job_finish` | definer | `workspace_runner` | the runner's six new functions. After 196 the role executes eleven SECURITY DEFINER functions and still holds no table, view or sequence grant |

**How the runner searches.** The runner holds no key that can read the store. It starts one child of
the materials package, NEW `mcp-server/src/batch.ts` (in the image `/app/mcp-materials/dist/batch.js`),
with the same two environment values the materials server gets (`mcp-config.ts:33-36`). The child
reads the service key from its file, as the server does today. One JSON object goes in on stdin and one
comes out on stdout: per query `ok` and its hits as data, per attachment its state and its cut text.
Each call inside the child has an 8 s limit, so it answers inside the runner's 10 s with what it has.
A child that exits non-zero gives retrieval `failed` and the turn goes on. The field names are frozen
in the PM's fixture files (task 12). The batch entry is not an MCP tool: `mcp-server/src/server.ts:27-36`
still registers three tools, so host sessions and the apply container gain nothing, and memory stays
inside the app.

* The search text is cut to 2,000 characters before it is sent
  (`mcp-server/src/tools/schemas.ts:9`). A refused call is stored as refused, not as a store that is
  down.
* Merge: round-robin by rank across the queries, one row per id, floor 0.78
  (`mcp-server/src/config.ts:41`), keyword-only hits after the ones with a similarity. At most 14
  passages from materials and uploads together, and at most 3 remembered items.

**Edge functions**, both with `verify_jwt` on.

* NEW `workspace-search` embeds the query and calls `workspace_search` with the caller's own bearer.
  It holds no service key of its own, unlike `search` (`supabase/functions/search/index.ts:75-79`). An
  anon caller is refused by the function's grant. The batch entry calls it with the service key.
* NEW `workspace-embed` embeds units of `workspace_document_text` whose `embedded_at` is null, part by
  part and resumable, writing with the service role inside the function as `embed-corpus` does
  (`embed-corpus/index.ts:155-159`). Chunking comes from NEW `supabase/functions/_shared/chunk.ts`; a
  test finds its `findCut` and `chunk` textually equal to `embed-corpus/index.ts`'s.
  `embed-corpus` and `search` are not edited.

**Migrations.** Additive and numbered. 190 to 197 are frozen once applied; a fix is 198 or 199.

| no. | file | holds |
|---|---|---|
| 190 | `190_workspace_store.sql` | `workspace_documents`, `workspace_document_text`, `workspace_text_embeddings`, `v_workspace_memory`; `workspace_upload_register`, `workspace_upload_retry`, `workspace_document_delete` |
| 191 | `191_workspace_uploads_bucket.sql` | the bucket and its four owner policies on `storage.objects` |
| 192 | `192_workspace_search.sql` | `workspace_search`, its twin over the new tables, `workspace_attachment_read` |
| 193 | `193_workspace_ingest_role.sql` | role `workspace_ingest_runner`, its four functions, `workspace_ingest_heartbeat` |
| 194 | `194_workspace_ask_options.sql` | `workspace_routines` (six rows), `workspace_request_options`, `workspace_request_attachments`, `workspace_ask_with` |
| 195 | `195_workspace_turn_state.sql` | `workspace_profile`, `workspace_conversation_state`, `workspace_turns`, `workspace_sources` |
| 196 | `196_workspace_runner_v2.sql` | the runner's six new functions, their grants, a guard that the role's list is the eleven |
| 197 | `197_workspace_index_status.sql` | `v_workspace_index_status` |
| 198, 199 | | slack |

Two applies move a fact that a unit on `main` pins against prod (`db/tests/README.md:3`): 193 adds a
member to `db_test_runner` (`db/tests/phase15_100_db_test_runner_role.sql:76`), and 196 changes the
runner's function list (`phase21_142_workspace_runner.sql:151-158`,
`phase21_143_review_round.sql:152-159`). Both are applied on one day, with one test-only port PR to
`main` that day, as PR #65 and PR #77 did.

### Uploads and extraction

* **The bucket.** NEW `workspace-uploads`: private, 20,971,520 bytes a file, six types: pdf, docx,
  pptx, xlsx (what `ingest/extract_text.py:38` reads), plain text and Markdown. Four owner policies
  in the form of `020_rls_owner_scoped.sql:141-143`. A migration can create a bucket here:
  `003_bb_files_bucket.sql:2` did.
* **The order.** The browser puts the file in the bucket, makes a signed URL (7 days) and calls
  `workspace_upload_register`. The row starts in state `stored`. None of this has a control before
  24b; 24a proves it in tests and in the acceptance run.
* **Where extraction runs.** NEW compose service `workspace-ingest`, behind `profiles: [workspace]`,
  on its own NEW network `ingest-net`, with no volume, a read-only root and a tmpfs for the one file
  it is reading. It holds no model, no Claude token and no service key. Its two secrets are files:
  NEW `workspace_ingest_db_url` (role `workspace_ingest_runner`: four functions, no table grant,
  through the session pooler) and the existing `supabase_anon_jwt` (`compose.yaml:262-263`), which is
  the public key the embed call needs. Its firewall is generated from the Workspace's by a fork
  script of its own and allows tcp/443 to the project host and tcp/5432 to its pooler, nothing else:
  not `api.anthropic.com`.
* **Why that place is safe.** A file parser is the part most likely to meet a hostile file. Here it
  runs with no credential that can read or write his data beyond its own four functions, no path to a
  model, and no network or volume in common with the Blackboard login or with any Claude process. An
  image test in the form of `docker/apply/image.test.mjs:130-138` pins the network, the absent
  volumes and the two secrets.
* **The steps.** `workspace_ingest_claim` (skip locked) hands over one document and its signed URL.
  The worker downloads to tmpfs, checks the size and the first bytes (`bytesLookValid`,
  `ingest/pull_files.mjs:175`), extracts with `extractUnits` (`pull_files.mjs:493`) under the sync's
  300 s limit (`sync/src/files.ts:47`), refuses more than 1,000 units or 1.5 million characters, and
  stores the units through `workspace_ingest_put_text` (state `text_ready`). It then runs
  `runEmbedLoop` (`ingest/embed_corpus.mjs:74`) against `workspace-embed` and calls
  `workspace_ingest_finish`, which accepts `indexed` only when every unit of the document has its
  `embedded_at`, and clears the signed URL. The same loop embeds memory units. A download, an
  extraction or an embed is tried 3 times before the row is `failed`.
* **Error codes of a failed upload**, fixed here so 24b can word them: `too_large`, `bad_type`,
  `bad_bytes`, `no_text`, `extract_timeout`, `extract_failed`, `too_many_units`, `link_expired`,
  `download_failed`, `embed_failed`.
* **Delete.** `workspace_document_delete` removes the rows in one transaction. The browser then
  removes the object, because SQL cannot: `protect_objects_delete` guards `storage.objects` (read on
  prod today). An object whose removal failed is counted as an orphan.
* **A poisoned document.** Its text reaches the answering turn as a fenced block marked as data, and
  it never reaches the planning turn. The answering turn has two read tools over course materials and
  nothing that writes, sends or fetches. Sources come from ids, never from text. Logs hold no text.
  The 24b page draws no image and fetches no link. So the worst it can do is a wrong answer, or, once
  memory is on, a wrong remembered item, which is marked as model-written and can be deleted.

### The planner and grades feed

`workspace_planner_feed(p_request_id, p_runner, p_from, p_to, p_courses)` returns one jsonb. It
refuses (22023) unless the request is claimed by `p_runner`. It is read on every answer, whatever the
plan says: the plan may only move the window. The default window is 7 days back to 28 days ahead, and
the plan may set it within 180 days either side of today.

* `work`, from the rows of `v_work_items` (`089_work_items_due_on_new_york.sql:47-105`): item_kind,
  item_id, course_id, title, type, due_at, due_on, undated, status, points_possible, in_workload.
* `scores`, from `v_gradebook_latest` (`047_gradebook_views.sql:43-94`), `column_kind = 'item'` only:
  course_id, column_id, name, possible, display_score, display_grade, grades_released, is_exempt,
  submission_status, seen_at, assignment_id.
* `as_of`, and a fixed marker saying the "graded so far" figure is on the Grades screen.
* Left out: feedback text, totals and calculated columns, effort, suggested start, and every column of
  `assignment_progress` except status.
* At most 60 work rows and 60 score rows. The runner cuts the block to 6,000 bytes, farthest date
  first, and says how many rows were left out.

**The "graded so far" figure is not in the feed.** W-6 allows it only as the same computation the
Grades screen runs. That computation is TypeScript in the web app (`graded-so-far.ts:218`), it imports
a module that loads React Query and the browser client (`graded-so-far.ts:47`,
`queries.grades.ts:29-30`), and its input is built in the browser (`grade-model-input.ts:228`). The
runner's image holds none of that, and a server-side input would be a second path that could
disagree. So the feed carries scores as Blackboard shows them and points to the Grades screen. The
system prompt keeps its rule: the assistant never works out a grade, a projection or a what-if
(`system.md:19`).

**No write becomes possible.** The function is `stable`, reads fixed columns and writes nothing. The
role still holds no table grant, so a direct select on `assignment_progress` or `reading_progress` is
refused as before.

### Memory

* **The About me note.** One row in `workspace_profile`, written by him (24b), read into the system
  prompt of every answering turn.
* **The memory item.** A background Haiku turn (`prompts/summary.md`, no tool, no MCP server, 0.05)
  summarises a conversation 15 minutes after its last finished answer. One item per conversation,
  replaced on each run, 1,000 characters at most. It is built from the conversation's messages only,
  never from passages or attachment text. `workspace_job_finish` stores it as a `memory` document with
  one unit; the ingest worker embeds it on its next poll.
* **Jobs.** `workspace_job_claim(p_runner, p_kinds)` returns at most one job (`rolling` or `memory`)
  with a 5-minute lease, and returns nothing while any request is queued or claimed. During a job the
  loop keeps asking for a claim every 2 s (`runner.ts:151-156`); a claim kills the job within the kill
  grace (`claude-cli.ts:173`) and frees the lease. Three failures park a job until new messages
  arrive.
* **Off until 24b.** His answer puts the list and the delete control with the summaries. Those are
  24b's. So in 24a the runner asks for `rolling` jobs only, unless `WORKSPACE_MEMORY_JOBS=on`, and the
  compose default is `off`. 24b turns it on. The whole path is built and tested in 24a.
* **Delete.** `workspace_document_delete` removes the item from retrieval in the same transaction and
  sets `memory_opt_out`, so that conversation is not summarised again.
* **In a prompt** a remembered item is fenced, labelled `[R<id>]`, and marked as written by the
  assistant and as data.

### Routines as data

`workspace_routines` holds named instruction sets, not code. The runner reads the chosen routine's
`instructions` through `workspace_turn_context` and appends them to the system prompt. A routine id
is a key in a table and never becomes a path. The wording of `instructions` is the PM's, frozen with
the migration.

| id | what it does | needs |
|---|---|---|
| `quiz` | one question at a time from the scoped material; checks his answer; names the source | `course_or_file` |
| `study-guide` | a cited outline of the scope that ends with what the material did not cover | `course_or_file` |
| `explain-file` | walks the attached file in plain words, by page or slide | `file` |
| `summarise-reading` | summary, main claims, terms, check questions | `file` |
| `plan-week` | orders the next seven days from the feed, by title and date; no grade maths | `nothing` |
| `draft-help` | drafts or rewrites assignment text from his words, his draft and the instructions. Stack's decision of 2026-10-08, recorded | `nothing` |

`workspace_ask_with` refuses (23514) a routine whose `needs` the request does not meet. The plus menu
and the chip are 24b's.

### Indexing and status

* **Course files: on every sync pass.** The sync runs the embed loop on every files pass, not only
  after new units (`sync/src/files.ts:248-252`). On a pass that posted no unit, an embed failure is a
  report line and a log line, never the sync's error: a failed sync files no Inbox apply request
  (`sync/src/loop.ts:93`), so one unit that cannot embed must not stop the auto-apply every day. On a
  pass that did post units the rule is today's. The sync still holds no model.
* **Uploads: on upload. Memory: when written.** Both by the ingest worker's poll.
* **One status he can read**, `v_workspace_index_status`, one row: `course_units_waiting` and
  `course_last_embedded` (summed from `v_embedding_status`, `010:84-93`), `course_files_text_pending`
  (`bb_files.text_status`), `uploads_waiting`, `uploads_failed`, `upload_links_expired`,
  `memory_waiting`, `orphan_objects` (only if P-10 passes) and `ingest_polled_age_seconds`. The line
  on the page is 24b's.
* **Its limits.** All of it runs only while the laptop is awake with Docker running. Course files are
  indexed when a sync runs, not on a timer.

### Privacy rules for a public repository

* Logs of the runner, the ingest worker and the batch entry carry counts, ids, states and timings
  only. The hidden list of the CLI's stderr line (`claude-cli.ts:450`) covers the whole prompt
  argument and the system prompt.
* No recording, walk shot or eval output that holds text is committed. Probe recordings use synthetic
  filler and go through `workspace/test/scrub-recording.mjs`.
* Tests and fixtures use synthetic text, never a course file, a question or an answer of his.

### The security boundary, before and after

| item | before (Phase 21, on `main`) | after 24a |
|---|---|---|
| The model's tools | four read tools: three over materials, one over notes (`gate-rules.ts:13-18`) | answering turn: two materials tools with limits and scope. Planning and summary turns: none, and no MCP server |
| The notes store | the `rag` server, its DSN mounted (`compose.yaml:226`), its pooler allowed by the firewall | not built, not mounted, not allowed |
| Secrets in the Workspace container | four (`compose.yaml:222-226`) | three: `workspace_runner_db_url`, `claude_oauth_token`, `bb2dash_mcp_service_key`. One credential that could write remains |
| The service key, as used | the search function and two reads of course text | also `workspace-search` and the attachment read, so uploads and memory. Still no write call in the package |
| The runner's login | five functions, no table grant (`142:412-420`) | eleven functions, no table grant. It reads due dates, statuses and posted scores through one function, for a request it holds |
| Planner state, grades, facts | out of reach of the runner (`142:8-9`) | read through `workspace_planner_feed`, fixed columns. No write path |
| Who searches | the model, when it chooses | the runner, every question. The model may add 3 searches |
| The prompt | the question and a replay | plus passages, attachments, the feed and memory, each fenced as data |
| Sessions | CLI transcripts on a volume, kept 30 days (`settings.json:2`, `compose.yaml:217`) | none kept |
| A new service | none | `workspace-ingest`: a file parser with no model, no token, no service key, its own network, no volume |
| A new role | none | `workspace_ingest_runner`: four functions, no table grant |
| A link at rest | none | one signed URL per waiting upload, up to 7 days, readable by the owner and the ingest role, cleared at finish |
| Storage | bucket `bb-files` | plus the private bucket `workspace-uploads`, owner policies |
| The browser | `workspace_ask`, `workspace_cancel` | plus four functions and owner policies on each new table |
| The sync | embeds after new units | embeds on every pass. Still no model; its image is rebuilt once, at the cut-over |
| Memory | none | model-written summaries inside the bb2dash store, off until 24b |
| Outward flow | none | none. Nothing leaves the bb2dash project |

The sync still holds no model. No Claude process shares a network or a volume with the Blackboard
login. `/security-review` is required: the phase touches user input, two roles' functions, a storage
bucket and a file parser.

**Recorded, not fixed here.** `search` answers any caller with a valid JWT as the service role
(`search/index.ts:75-79`). Uploads and memory never pass through it. Fixing it is the PM's call, put
to Stack. `/run/workspace` is writable by the runtime user, so the per-request MCP config is in the
same class as today's `mcp.json` (STATUS, deferred hardening).

### Files by owner

The sets are disjoint. A file not listed has no owner in this phase and is not edited.

* **W-76, db:** `db/migrations/190_*.sql` to `197_*.sql`; `db/tests/phase24_*.sql`; the name-list
  lines of `db/tests/phase21_142_workspace_runner.sql`, `phase21_143_review_round.sql` and
  `phase15_100_db_test_runner_role.sql`; the Workspace section of `DATA_SYNTAX.md`.
* **W-77, runner:** everything under `workspace/` except `workspace/test/fixtures/contract24/`. New:
  `src/depth.ts`, `plan.ts`, `retrieve.ts`, `context/assemble.ts`, `context/budget.ts`,
  `turn-context.ts`, `sources.ts`, `jobs.ts`, `lines.ts`, `prompts/plan.md`, `prompts/summary.md`,
  `prompts/format-rich.md`, `prompts/format-plain.md`, their tests. Changed: `src/turn.ts`,
  `runner.ts`, `db.ts`, `config.ts`, `mcp-config.ts`, `hooks/gate-rules.ts`,
  `providers/claude-cli.ts`, `providers/types.ts`, `stream-json.ts`, `prompts/system.md`,
  `claude/settings.json`, `README.md`, the existing tests. Retired: `src/replay.ts`.
  `package.json` gains no dependency.
* **W-78, search and embed:** everything under `mcp-server/` (new `src/batch.ts`, `src/limits.ts`;
  changed `src/tools/search-materials.ts`, `src/tools/get-material-text.ts`, `src/config.ts`,
  `src/client.ts`, `README.md`, tests; `src/server.ts` unchanged); `supabase/functions/_shared/`,
  `supabase/functions/workspace-search/`, `supabase/functions/workspace-embed/`.
* **W-79, ingest, sync and containers:** new `workspace-ingest/` (the worker and its tests); new
  `docker/workspace-ingest/` (Dockerfile, ignore file, entrypoint, fork script, generated firewall,
  image test); `docker/workspace/` (the Dockerfile loses the `rag` stage and `mcp-rag.sh`, the
  firewall loses one secret name, its tests); `docker/apply/fork-firewall.mjs`,
  `docker/apply/init-firewall.sh` (generated) and `docker/apply/image.test.mjs` where a literal moves;
  `docker/grep-clean.test.mjs`; `compose.yaml` (the `workspace` block, the new service, and the
  top-level volume, network and secret entries; never the `sync` or `apply` blocks);
  `sync/src/files.ts`, `sync/src/report.ts`, `sync/src/loop.ts` and their tests.
* **W-80, umbrella (bb2dash-stack, branch `feat/workspace-24` there):** `compose.yaml` (declares
  `workspace_ingest_db_url`); `doctor/lib/constants.mjs`, `doctor/doctor.mjs`, the doctor tests;
  `README.md`; `.env.example`; the allow-list of the secrets helper; `scripts/lib/accept-actions.mjs`
  and its test.
* **PM:** `workspace/test/fixtures/contract24/` (the frozen shapes), `acceptance/24/`,
  `acceptance/manifest.schema.json`, `web/e2e/accept24.spec.ts`,
  `web/src/lib/supabase/database.types.ts`, root `CLAUDE.md`, `project-state/`, 109c, every prod
  apply and edge function deploy.
* **Nobody:** `db/migrations/001` to `186`; every file under `web/src/app/(app)/workspace/` and
  `web/src/components/workspace/`; every `.module.css`; `web/test/Workspace.layout.test.tsx`;
  `web/e2e/workspace-layout.spec.ts`; every other file under `web/src/`; `apply/src/`; `ingest/`;
  `supabase/functions/search/`, `embed-corpus/`, `calendar-push/`; `desktop/`; `acceptance/21/` and
  `web/e2e/accept21.spec.ts`; the harness repository; the `bb-profile` volume.

**Seam inside the phase.** W-77, W-78 and W-79 meet at fixed paths: `/app/workspace/`,
`/app/mcp-materials/dist/index.js`, `/app/mcp-materials/dist/batch.js`,
`/run/workspace/mcp-<request id>.json`, `/run/workspace/mcp-none.json`; the environment names
`BB2DASH_MAX_SEARCHES`, `BB2DASH_MAX_READS`, `BB2DASH_COURSES`, `WORKSPACE_MEMORY_JOBS`; and the JSON
shapes in the PM's fixture folder. `workspace/test/mcp-config.test.ts` pins the paths, as it does
today.

## MVP (in plain words)

After 24a the Workspace page looks the same and answers better. Every question is searched for him
across his course files before the answer is written, so an answer no longer depends on the model
deciding to look. A follow-up knows the conversation because the conversation is read from the
database each time; a restart or a new container loses nothing. It can see what is due, what he marked
done and the scores Blackboard has posted, and it cannot change any of them. It no longer reads the
notes store. When nothing of his matches, it says so first and then answers from general knowledge.

Behind the page, what the new page needs is in place and tested: a private place for files from his
device, read by a small separate service; attaching a course file; the six routines; the depth
choice; the About me note; memory. Memory stays switched off until the new page lets him see and
delete what is remembered. Answers stay plain text until the new page.

It still runs on his subscription with no API key. It answers, and indexes, only while his laptop is
awake with Docker running. Course files are indexed when a sync runs.

## Definition of done

**SOP gates**

- [ ] `workspace/`: `npm run typecheck`, `npx vitest run` green; line coverage of `src/` at least 80 %.
- [ ] `mcp-server/`: `npm run typecheck`, `npx vitest run` green; `npm run build`, then
      `SUPABASE_SERVICE_ROLE_FILE=<any non-empty file> node scripts/smoke.mjs --tools-only` lists three
      tool names.
- [ ] `workspace-ingest/`: typecheck and its suite green; line coverage at least 80 %.
- [ ] `sync/`: its suite green with the new cases.
- [ ] `apply/`: `npm run typecheck && npm run build && npx vitest run` green; the bare imports of
      `apply/dist/*.js` are `main`'s set (no new package); `node docker/apply/fork-firewall.mjs --check`
      exits 0.
- [ ] `supabase/functions/`: `node --test supabase/functions/_shared/chunk_test.ts` passes (Node, as
      `calendar-push/push_test.ts:6` runs; Deno is not on this machine).
- [ ] `web/`: `npm run typecheck`, `npx eslint . --max-warnings 0`, `npm run build`, `npx vitest run`
      all exit 0; `git diff --stat origin/main...HEAD -- web/src` lists only
      `web/src/lib/supabase/database.types.ts`.
- [ ] Lint with no warnings wherever a package has a lint script.
- [ ] SQL: `node scripts/db-test.mjs --only <file>` prints `PASS` for each `phase24_*` unit, for the
      three amended units and for `phase21_140_workspace_tables.sql` unedited; the whole suite ends
      with no failing unit that passes from `main` the same day.
- [ ] Images: the `workspace`, `workspace-ingest` and `apply` images build in the test compose project;
      `node --test docker/workspace/init-firewall.test.mjs docker/grep-clean.test.mjs
      docker/apply/image.test.mjs docker/workspace-ingest/image.test.mjs` passes.
- [ ] Supabase advisors: no new security finding on the new objects.
- [ ] `/code-review main high` and `/security-review`: CRITICAL and HIGH addressed, recorded in 109c.
- [ ] `desktop/` untouched: `git diff --stat origin/main...HEAD -- desktop` prints nothing.

**Contract**

- [ ] Each of the 17 checks under "What functions properly means" has a named test or proof, green.
- [ ] `git diff --name-only origin/main...HEAD -- "web/src/app/(app)/workspace"
      web/src/components/workspace "*.module.css" web/test/Workspace.layout.test.tsx
      web/e2e/workspace-layout.spec.ts` prints nothing.
- [ ] `grep -c harness_database_url compose.yaml` gives 0.
- [ ] Every probe has one pass or fail line in 109c, and no task was built on a failed one.

**Live**

- [ ] The PM's walk on today's page, in a real browser, with the test runner the only runner on the
      queue (see Seams): a course question, a follow-up, a planner question, a question nothing
      matches, a Stop.
- [ ] After his merge word and the cut-over: `just accept 24` is green. Green counts as acceptance
      (ORCHESTRATOR section 3, step 9).

**Docs, same PR**

- [ ] STATUS, DECISIONS (the migration block, each PM ruling, the applies), ORCHESTRATOR's phase
      table, root `CLAUDE.md`'s Workspace paragraphs (see Decisions this brief amends).

## Task list

Paths are from the bb2dash root unless a row says bb2dash-stack. "Runner on `<file>`" means
`node scripts/db-test.mjs --only <file>` and its `PASS` line. Test file names are proposals: a worker
may rename one and says so in its verification section. Probes run the pinned CLI or the image with
another command, so the firewall is up and no runner loop starts; filler and questions are synthetic.
Order: 1 to 11, then 12, then (13 to 20 beside 23 to 26 beside 28 to 35 beside 36 to 39 beside 40),
with 21, 22 and 27 as their inputs land, then 41 to 47.

| # | task | owner | deterministic check |
|---|---|---|---|
| 1 | P-1: a turn with no MCP server (`mcp-none.json`) | W-77 + PM | `cd workspace && npx vitest run test/probe24-fixtures.test.ts`: the scrubbed recording's init line holds 0 servers and 0 tools named `mcp__*`, and its result is `success` |
| 2 | P-2: no session is stored. The image's `claude --help` lists `--no-session-persistence`; with the config folder on tmpfs one turn starts and leaves no file under `/home/node/.claude/projects` | W-77 + PM | the help line count is at least 1 and the file count after the turn is 0, both written in 109c. A fail keeps the volume and sets `cleanupPeriodDays` to 1 |
| 3 | P-3: ten fresh turns at cap 1.00, each with a full assembled context | W-77 + PM | 10 result lines `success`, 0 `error_max_budget_usd`; each `total_cost_usd` is under 1.00 and is not a running total; turn 10 states a fact given only in turn 1 |
| 4 | P-4: the planning turn on 20 synthetic questions | W-77 + PM | at least 19 valid plans, median under 8 s, every cost under 0.05. A fail tries `--json-schema`, then the PM rules before task 30 |
| 5 | P-5: a prompt argument of 128,000 bytes | W-77 + PM | the CLI starts and a result line is read |
| 6 | P-6: limits through the per-request MCP `env` | W-77 + W-78 | a fourth search returns an error result and the turn still ends `success` |
| 7 | P-7: a signed URL of the bucket downloads through the ingest firewall with no redirect to another host | W-79 + PM | one download of a synthetic object returns 200 with every hop on the project host |
| 8 | P-8: a second edge function opens a `gte-small` session at 3 parts a call | W-78 + PM | one call embeds 3 parts of a synthetic unit and returns 200 |
| 9 | P-9: the service key forwarded by `workspace-search` reaches the database as `service_role`; an anon bearer is refused | W-78 + PM | with the key: rows of all three kinds from synthetic data. With the anon JWT: an error and zero rows |
| 10 | P-10: the owner can count the bucket's objects through a security-invoker view | W-76 + PM | the count equals the number of synthetic objects. A fail drops `orphan_objects` from 197 |
| 11 | P-11: a 20 MB synthetic PDF extracts inside 300 s in the ingest image | W-79 + PM | the time is written in 109c and is under 300 s |
| 12 | Freeze: the brief, the shapes (`workspace/test/fixtures/contract24/*.json`: the plan, the batch request and answer, the turn context, the feed) and the routine wording; worker branches cut | PM | `node -e` parses each fixture; `git worktree list \| grep -c "feat/workspace-24"` gives 5 in bb2dash |
| 13 | Migration 190 and its unit | W-76 | Runner on `phase24_190_store.sql`: a delete leaves 0 units and 0 vectors; a second memory row for one conversation raises 23505; anon holds nothing |
| 14 | Migration 191 and its unit | W-76 | Runner on `phase24_191_bucket.sql`: the bucket row is private, 20971520 bytes, six types; four policies, all owner-scoped |
| 15 | Migration 192 and its unit | W-76 | Runner on `phase24_192_search.sql`: three kinds from synthetic rows; 0 rows for a deleted document; a scope leaves out another course's unit and keeps an untagged upload; 42501 as anon; no passage over 2,000 characters |
| 16 | Migration 193 and its unit; the `phase15_100` line | W-76 | Runner on `phase24_193_ingest_role.sql`: the role executes exactly its four functions and holds no table grant; `finish` refuses `indexed` while a unit has no `embedded_at` |
| 17 | Migration 194 and its unit | W-76 | Runner on `phase24_194_ask_options.sql`: options and five attachments stored; a sixth raises 23514; an unknown routine 23503; `explain-file` with no file 23514; `workspace_ask(uuid, text)` returns three ids; Runner on `phase21_140_workspace_tables.sql` PASS, unedited |
| 18 | Migration 195 and its unit | W-76 | Runner on `phase24_195_turn_state.sql`: an About me of 2,001 characters raises 23514; anon holds nothing; no column of `workspace_sources` or `workspace_turns` is named text, passage, content or snippet |
| 19 | Migration 196 and its unit; the two "five" lists become the eleven | W-76 | Runner on `phase24_196_runner_v2.sql`: the role's list is the eleven; the feed, the context and the put each raise 22023 for a request not claimed by the caller; a 41st source row is cut, not refused; a source row with an id that does not exist is dropped; `claim_v2` returns nothing while a request is claimed and closes the caller's own stale claim; as `workspace_runner` a select on `assignment_progress` raises 42501 |
| 20 | Migration 197 and its unit | W-76 | Runner on `phase24_197_index_status.sql`: exactly one row; `course_units_waiting` equals the units with no part |
| 21 | Prod applies, each on Stack's word after a `begin; ... rollback;` dry run, under the file's name, byte-identical, advisors read after: 190 to 192, 194, 195, 197 as they pass; 193 and 196 on one day | PM | `select name from supabase_migrations.schema_migrations where name ~ '^19[0-7]_'` lists eight names; each file's md5 equals the stored one, in 109c |
| 22 | The port PR to `main` the day 193 and 196 are applied: three name lists, test-only | PM + W-76; Stack's merge word | on `main` after the merge, Runner on `phase21_142_workspace_runner.sql`, `phase21_143_review_round.sql` and `phase15_100_db_test_runner_role.sql` each PASS |
| 23 | `_shared/chunk.ts` and `workspace-embed` | W-78 | `node --test supabase/functions/_shared/chunk_test.ts`: `findCut` and `chunk` equal `embed-corpus/index.ts`'s text; an astral character does not shift a part range |
| 24 | `workspace-search` | W-78 | its test: the query is cut to 2,000 characters; the caller's bearer is forwarded and no service key is read from the environment |
| 25 | The batch entry, `mcp-server/src/batch.ts` | W-78 | `cd mcp-server && npx vitest run test/batch.test.ts`: the answer matches the PM's fixture; a hit whose passage holds a line shaped like a label or an id field adds no hit; a refused query is `refused`, not an exit; nothing is printed but the one JSON object |
| 26 | Limits and scope in the materials server | W-78 | `npx vitest run test/limits.test.ts`: with no environment value nothing changes; a fourth search is an error result; with a scope a search for another course, or for none, is an error result; the smoke lists three names |
| 27 | Edge function deploys, on Stack's word, `verify_jwt` on | PM | `list_edge_functions` names both with `verify_jwt` true; P-8 and P-9 pass against the deployed code |
| 28 | `depth.ts` | W-77 | `cd workspace && npx vitest run test/depth.test.ts`: a short Auto follow-up after a Deep answer routes on the last auto tier; `router-cases` is unedited and green |
| 29 | Budget and assembly | W-77 | `npx vitest run test/assemble.test.ts`: a property test holds the prompt under 131,072 bytes at every maximum; a passage with the `[notes]` marker carries the warning; a stopped turn is shown as stopped; the prompt never opens with `/`; format `plain` holds no bracket label |
| 30 | `plan.ts` and `prompts/plan.md` | W-77 | `npx vitest run test/plan.test.ts`: 12 fixture outputs each give the expected plan or the fallback; a seventh query is dropped; a course outside the scope is dropped; the input holds no passage and no attachment text |
| 31 | `retrieve.ts` | W-77 | `npx vitest run test/retrieve.test.ts`: a child that exits 1 gives `failed` and the turn goes on; the search text is at most 2,000 characters; three failures skip the search for 5 minutes on a fake clock; 15 hits give 14 passages |
| 32 | Argv per turn kind, gate, init check, MCP config | W-77 | `npx vitest run test/claude-argv.test.ts test/tool-gate.test.ts test/mcp-config.test.ts test/stream-json.test.ts`: no argv holds `--resume`; the planning argv holds no `--allowedTools`; `mcp__rag__` appears nowhere in `src/` |
| 33 | `turn.ts` in stages, the new calls in `db.ts`, sources, the fixed lines | W-77 | `npx vitest run test/turn.test.ts test/sources.test.ts`: a Stop during the planning turn stores `cancelled` and spawns no answering process; an opened unit becomes an origin `tool` row from the call's input; `empty` puts the fixed sentence first on `plain` and not on `rich`; finish carries a null session id |
| 34 | Jobs in `runner.ts`, `jobs.ts`, `prompts/summary.md` | W-77 | `npx vitest run test/jobs.test.ts`: on a fake clock a claim mid-job kills it and frees the lease; with `WORKSPACE_MEMORY_JOBS` unset only `rolling` is asked for; the summary's input holds messages only; the loop never asks for a claim while a turn is in flight |
| 35 | `system.md`, the two format rules, their test | W-77 | `npx vitest run test/system-prompt.test.ts`: the rules on grades, on `[notes]`, on never inventing a number and on nothing matched are present; the notes rules are gone; `format-rich.md` forbids images and links |
| 36 | The ingest worker | W-79 | `cd workspace-ingest && npx vitest run`: bad first bytes give `bad_bytes`; 1,001 units give `too_many_units`; an expired link gives `link_expired`; three failed tries give `failed`; a log line holds ids, states and timings only |
| 37 | Its image, its firewall fork, its compose service | W-79 | `node --test docker/workspace-ingest/image.test.mjs`: networks are `ingest-net` only; no volume; the secrets are the two names; none of `bb-profile`, `course-files`, `claude_oauth_token`, `bb2dash_mcp_service_key`, `api.anthropic.com` is named; the generated firewall equals what its fork script produces |
| 38 | The Workspace image and compose block: `rag` out, the tmpfs, one database secret; the apply firewall regenerated | W-79 | `grep -c harness_database_url compose.yaml` gives 0; `node --test docker/workspace/init-firewall.test.mjs docker/grep-clean.test.mjs docker/apply/image.test.mjs` passes; `node docker/apply/fork-firewall.mjs --check` exits 0; the `workspace` block names no `hostname`; `cd apply && npm run typecheck && npm run build` exits 0 |
| 39 | Sync: the embed loop on every files pass; the report rule | W-79 | `cd sync && npx vitest run test/files.test.ts test/report.test.ts test/loop.test.ts`: with `unitsPosted` 0 the loop runs once; with `unitsPosted` 0 and an embed exit of 1 the pass closes `done`, the report holds the line and the apply request is filed; with `unitsPosted` above 0 an embed error still fails the sync |
| 40 | bb2dash-stack: the secret name, the doctor, the README, two host actions for the acceptance run (start the ingest service; read a proof again until it passes or a limit) | W-80 | in bb2dash-stack: `node --test doctor/doctor.test.mjs doctor/workspace.test.mjs scripts/accept-actions.test.mjs` passes; the doctor's Workspace row no longer names `harness_database_url` |
| 41 | Retrieval eval with no model: the 9 cases of `ingest/eval/golden_set.json` through the batch entry, on the host with the key file | PM | prints `in passages: n of 9` and qids only, exits 0 only at 9; the line is in 109c and no output with text is kept |
| 42 | Integrate: worker branches merged, types regenerated, full suites, advisors | PM | the SOP gates of the DoD |
| 43 | Walk windows, on Stack's word: the live Workspace stopped, the test project the only runner and the only ingest worker, the PM's walk, the live service back | PM | before and after: `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` is unchanged; `select count(*) from workspace_requests where state in ('queued','claimed')` gives 0 at the end |
| 44 | Reviews | PM | both commands run; findings and fixes in 109c |
| 45 | The acceptance pack: `acceptance/24/` (manifest, playbook, proofs) and `web/e2e/accept24.spec.ts`, on today's page | PM | `node --test acceptance/acceptance.test.mjs` passes |
| 46 | Docs, the PRs (bb2dash, bb2dash-stack). Stop at "ready when you say so" | PM | `gh pr view --json state -q .state` prints `OPEN` in both |
| 47 | After his merge word: the cut-over, one service at a time, each alone, with no question, apply request or sync open (`workspace`, `workspace-ingest`, `apply`, then `sync`), then `just accept 24` | PM | the run's `REPORT.md` reads green |

**The acceptance pack, 24a.** Written with the phase (`acceptance/README.md:64-77`) and extended by
24b. Its steps walk today's page: the page opens; a course question is answered with stored sources
and no model search needed; a lookup takes one turn; a Standard question takes a plan; a planner
question stores a `feed` source and the planner is as it was; a follow-up is answered with a null
session id; a question nothing matches stores `empty`; a Stop reaches the runner and the next answer
is `done`; a synthetic file is uploaded through the page's own session (no control exists before
24b), indexed, found by a question and deleted. Host proofs read ids, states and counts from
`workspace_turns`, `workspace_sources` and `workspace_documents`, never text. Step 1 stays a person's:
Usage credits are off.

## Workers

Workers are Opus, commit and push per task, never touch `project-state/`, and hand the PM a
verification section that quotes each task's red run and green run, in its own file beside 109c
(`109_W76_VERIFICATION.md` to `109_W80_VERIFICATION.md`). A worker that meets an unclear point states
its default and takes it. Nobody answers a running worker by message (ruling W-S). No worker applies a
migration or deploys a function: the PM does, on Stack's word.

| worker | stream | branch | worktree | owns (disjoint) | tasks |
|---|---|---|---|---|---|
| W-76 | db | `feat/workspace-24-db` | `bb2dash-wt-24-db` | migrations 190 to 197, the `phase24_*` units, three name lists, `DATA_SYNTAX.md`'s Workspace section | 10, 13 to 20, 22 |
| W-77 | runner | `feat/workspace-24-runner` | `bb2dash-wt-24-runner` | `workspace/` except the PM's fixture folder | 1 to 6, 28 to 35 |
| W-78 | search and embed | `feat/workspace-24-search` | `bb2dash-wt-24-search` | `mcp-server/`; the three new function folders | 6, 8, 9, 23 to 26 |
| W-79 | ingest, sync and containers | `feat/workspace-24-ingest` | `bb2dash-wt-24-ingest` | `workspace-ingest/`, `docker/workspace-ingest/`, `docker/workspace/`, the named `docker/apply/` files, `compose.yaml`, the three sync files and their tests | 7, 11, 36 to 39 |
| W-80 | umbrella | `feat/workspace-24` in bb2dash-stack | its own worktree there | the bb2dash-stack files listed above | 40 |
| PM | integration | `feat/workspace-24` | `bb2dash-wt-24` | the fixtures, the pack, types, state docs, 109c, applies and deploys | 12, 21, 27, 41 to 47 |

W-77 builds on the frozen fixtures until W-76's functions and W-78's batch entry are on the phase
branch. W-79's image work waits for W-77's task 32 and W-78's task 25 on the phase branch.

## Seams

| with | seam | rule here |
|---|---|---|
| **Phase 22 (styling, building now)** | Its W-70 sweeps `web/src/app/(app)/workspace/` and `web/src/components/workspace/` (brief 103 at 3d02033, lines 803-805 and task 19), adding, renaming or removing no `.module.css` there (lines 554-556) | **Ruling W-1, in full.** 24a leaves today's `/workspace` page working and better: automatic retrieval, sessions from the database and the planner feed all reach it. 24a touches NO file under `web/src/app/(app)/workspace/` or `web/src/components/workspace/`, no CSS module, and neither layout check (`web/test/Workspace.layout.test.tsx`, `web/e2e/workspace-layout.spec.ts`). Its only files under `web/` are the regenerated types file and the new `web/e2e/accept24.spec.ts`. The two phases share no source file, so either may merge first. Both append rows to STATUS and DECISIONS; the second to merge keeps both sets |
| **Phase 23 follow-ups** (`fix/phase23-followups`, worktree `bb2dash-wt-23f`, no commit yet) | Both change the apply image's inputs: 24a edits `workspace/src` and `mcp-server/src`, which that image copies (`docker/apply/Dockerfile:39, 46-49`), and the firewall script its firewall is generated from. Both use migration numbers | **The follow-ups merge first.** They are small, their numbers are 187 to 189, and they fix a live service. 24a then merges `origin/main` and re-does: `node docker/apply/fork-firewall.mjs --write` and `--check`; `cd apply && npm run typecheck && npm run build && npx vitest run`; the apply image build; `docker/apply/image.test.mjs`; the types file. No migration is renumbered. If 24a merges first instead, the follow-ups branch re-does the same list. Either way apply is rebuilt alone at the second cut-over, with no apply request open |
| **The apply image** | `apply/src` imports six `workspace/src` modules and bundles them with packages left external (`apply/package.json:12`) | The import closure of the six gains no package. The names apply imports keep their signatures: `CLAUDE_BIN`, `CLAUDE_CODE_VERSION`, `ConfigError`, `readOauthToken`, `readTextOrNull`, `Env`, `mapTurnEnd`, `CliExit`, `CliProcess`, `SpawnOptions`, `childEnv`, `spawnClaude`, `parseLine`, `readInit`, `dsnParts`, `createPgQuery`, `newPgClient`, `redactDsn`, `QueryFn`, `touchAlive`, `isAliveFresh`. The ingest worker imports `config`, `db` and `alive` the same way, so those three now have two consumers. The DoD builds apply, not only its tests |
| **The acceptance packs** | Pack 21's proofs want the model's own tool call, one of them the notes tool (`acceptance/21/manifest.json:82, 103-104, 124`) | After 24a's cut-over `just accept 21` is not expected green and is not run again. Phase 21 stays accepted (DECISIONS 2026-10-08). Pack 24 is the Workspace's acceptance from then on. 24a edits neither `acceptance/21/` nor `accept21.spec.ts`; 24b retires both, because it changes attributes they read |
| **The live Workspace** | `bb2dash-workspace-1` answers from the one queue, and any runner may take any queued question | **One runner on the queue at a time during tests, and one ingest worker.** The test project `bb2dash-wt24` runs only inside a walk window, with the live service stopped, on Stack's word, the service named in every command. `workspace_claim_v2` does not lift this rule. Migrations 190 to 197 are additive, so the live runner keeps working after each apply |
| **Phase 21 (frozen)** | migrations 140 to 143, `workspace_ask(uuid, text)`, the ten data attributes its tests read, the router's cases | none edited. New tables, new functions, new files. `workspace_claim(text)` keeps its grant, so the old image works until the cut-over |
| **The `sync` container** | it holds the Blackboard login; three of its source files change | no model enters the sync. Its image is rebuilt once, at the cut-over, alone, with no sync open. The `bb-profile` volume is never touched |
| **bb2dash-stack** | it declares the secret names, its doctor pins them, and it holds the acceptance run's host actions | a companion PR, opened with 24a's and merged after it, as Phases 21 and 23 did. PM default, Stack's to object |
| **The harness** | the Workspace image was built from the harness `mcp-server` folder | nothing is read from `harness-memory` and no harness file changes. The image still takes the pinned CA from the harness `certs` folder (`compose.yaml:182`) |
| **Phase 15** | `scripts/db-test.mjs`, `db_test_runner` | the new units run through it; `workspace_ingest_runner` is granted to `db_test_runner` with inherit false, as 142 did for the runner |
| **Code freeze** | Nov 30 to Dec 13: no merge and no prod apply (ORCHESTRATOR.md:114) | the merge and every apply land before Nov 30 or after Dec 13 |

## Out of scope

* Every page control: the composer's menus, chips, the panel, the upload button, the memory list.
  That is 24b.
* Any write to `assignment_progress`, `reading_progress`, a grade or a fact table, and any
  propose-then-approve path.
* The "graded so far" figure in the feed. A grade computed, projected or supposed by the assistant.
* Reading anything from `harness-memory`: class notes, Inbox decision notes, session notes.
  Scheduling the Inbox exporter (Phase 23's open item, untouched).
* A model call in the sync. A model or a Claude token in the ingest service.
* OCR, images, audio. A rerank turn. A second retrieval round by the runner.
* A second search tool for the answering model over uploads and memory.
* A timed embed catch-up for course files. A second runner, and the heartbeat row it would need.
* A read-only key in place of the service key (DECISIONS 2026-10-05 stands for the one that remains).
  A caller check in `search`.
* Deleting conversations (140 forbids it). A daily cap or an Off switch.
* Removing the old transcript volume. Dropping `platform: linux/amd64` from the image: its stated
  reason, the notes server's tokenizer, goes with this phase, but whether anything else needs it is
  not checked.
* Late text after a Stop (map R4): not diagnosed here; 24b guards the page against it.

## Risks

* **The planning turn is not proven.** Its time and cost on the pinned CLI are not checked. P-4 is
  task 4, before any runner code. If it fails twice the PM rules: Standard runs as Quick does, and
  Stack is told that no model plans retrieval.
* **Two CLI starts per question.** Standard and Deep pay two starts. Lookups route to one turn. P-4's
  bound is the guard.
* **Size.** Eight migrations, five workers, one new service. The cut order if it runs long: first the
  answering turn's own tools (then the server's limits and P-6 fall away); then xlsx and pptx
  uploads; then `orphan_objects`. Never cut: sessions from the database, the two turns, the feed,
  sources, the notes store's removal, the ingest service's isolation, the sync rule.
* **A unit on `main` fails against prod between an apply and the port PR.** 193 and 196 are applied
  on one day with the port PR ready, and that PR merges on his word the same day.
* **A standing unit that counts storage policies or public tables may move.** Not checked. W-76 reads
  the standing units at the cut and names any that pin such a count.
* **One stuck claim blocks the queue.** With answers held to one at a time, a claim left by another
  runner name blocks every question until the 10-minute sweep. The runner's own stale claim is closed
  at once. The cut-over is done with no question open.
* **The apply image.** It can break while its tests stay green. The seam rule and the build in the
  DoD hold it.
* **A poisoned document.** See Uploads and extraction. The worst case is a wrong answer or a wrong
  remembered item.
* **A signed URL at rest** for up to 7 days. Owner policy, the host and path check, cleared at finish.
* **An upload link that expires while the laptop sleeps.** The row fails with `link_expired`, is
  counted in the status row, and 24b's Try again signs a new one.
* **Labels on a plain page.** None are written with format `plain`. If a model writes one anyway it
  shows as text on today's page.
* **Phase 21's hardening list is unchanged**: the firewall's address allowlist on port 443, DNS,
  PUBLIC on pg_net (STATUS, deferred hardening).
* **The metering plan is still paused, not gone** (brief 102, Why). Two turns per question use more
  of the plan than one.
* **Not known:** whether P-2's flag exists on 2.1.289 (the host's CLI is newer); whether the CLI
  starts with its config folder on tmpfs; the planning turn's cost.

## Decisions this brief amends

Each has its DECISIONS row dated 2026-10-08. The earlier rows are quoted as written.

* **2026-10-05, O-1:** "the Workspace searches two collections of the notes store,
  `bb2dash-inbox-decisions` and `bb2dash`." Amended: it searches no notes store (answer 7, W-2). A
  question about an Inbox decision is no longer answered from a decision note.
* **2026-10-05, O-3:** "whole notes from the notes store stay off in v1." Moot: the server is gone.
* **2026-10-05:** "two write-capable credentials sit inside the Workspace container in v1: the bb2dash
  service key (read by the materials MCP server) and the notes store's DSN (read by the rag MCP
  server)." Amended: one remains, the service key.
* **2026-10-05, O-4:** "no planner or grades tool in v1, and no `workspace_reader` role." Amended: the
  runner reads due dates, statuses and posted scores through `workspace_planner_feed` (answers 4, 5).
  Still no tool for the model and no new reader role.
* **2026-10-06:** "`workspace_runner` is a third least-privilege database login ... it executes
  exactly five SECURITY DEFINER functions ... With its real DSN it is refused (42501) on
  `assignment_progress`, `reading_progress` and `workspace_messages`." Amended: eleven functions. The
  direct refusals stand.
* **2026-10-05, O-5:** "no model picker and no Markdown rendering in v1." Amended: a depth choice is
  stored per request (answer 13) and answers are formatted (answer 12); both reach the page in 24b.
* **2026-10-05, scope calls:** "`fable`, a Delete, a cap and a tier setting are each a later phase if
  Stack asks." Amended in one part: he asked for the depth menu.
* **2026-10-07:** "answers render as text ... and does not interpret Markdown." And **2026-10-07,
  Stack's answers:** "the page strips Markdown's bold markers." Both amended by answer 12, in 24b,
  with the rule that no image is drawn and no link is fetched.
* **2026-10-07, Reversal adopted:** "each question is answered by a container service (the runner)
  with one `claude -p` turn of the pinned, unmodified Claude Code CLI". Amended: one or two turns,
  each still one `claude -p` of the pinned CLI on his subscription (answer 2, W-4), and no session is
  resumed (answer 6, W-3).
* **2026-09-09:** "one PR per phase." Amended for this phase: two PRs, 24a and 24b (answer 11).
* **Root `CLAUDE.md`**, rewritten in 24a's PR: "A container runner answers each question with one
  `claude -p` turn"; "four read tools over the materials and the two bb2dash notes collections pass a
  gate, and the runner's database login cannot reach planner state (`assignment_progress`,
  `reading_progress`) or a fact table"; "through five SECURITY DEFINER functions"; and "the service
  mounts four secrets from `SECRETS_DIR` as files".
* **`db/migrations/142_workspace_runner_role.sql:8-9`** says the login "cannot read
  `assignment_progress`, `reading_progress` or any fact table". The file is frozen and stays as
  written; migration 196's header says what changed.

## Appendix: earlier findings and where each went

The first draft of this brief was challenged on 2026-10-08, before Stack answered
(`109b_PHASE24_draft_challenge.md`, removed in this commit; its text is in the branch's history at
4bf223e). Twenty findings and six questions. Each is placed here.

**Applied**

* **F-1.** *Options as columns on `workspace_requests` would break a Phase 21 unit.* Applied: the options
  live in new tables and `workspace_requests` is not altered (The stores; task 17). The name lists a
  new grant moves are owned by W-76 and ported the same day (tasks 16, 19, 22).
* **F-2.** *The embed loop on every pass can fail every sync.* Applied: Indexing and status; task 39.
* **F-3.** *Formatted output opens a leak path.* Applied: no image is drawn and no link is fetched (answer 12;
  `format-rich.md`, task 35; brief 111's renderer and its test). The two more rows it reverses are
  named under Decisions this brief amends.
* **F-4.** *The search text can pass 2,000 characters.* Applied: cut before sending, and a refused call is
  stored as refused (The stores; tasks 24, 31).
* **F-5.** *No packing rule, and a 41st source row.* Applied: the budget table, the merge order, and a put
  that cuts and never refuses (The two turns; The stores; task 19).
* **F-6.** *Course scope does not fit seven course rows.* Applied: a scope is a display id expanded to its
  course ids by `v_course_display`; the runner searches all of them; the materials server refuses a
  model search outside them or with none; a read by id is not scoped (The two turns; tasks 15, 26).
  "The course the question names" is dropped.
* **F-7.** *Document text can fool a parser.* Applied by removing the parser: hits arrive as JSON, a
  model-opened unit becomes a source from the call's input, and a row is kept only when its ids exist
  (The stores; tasks 19, 25, 33).
* **F-9.** *The owner sets were incomplete.* Applied: Files by owner here and in brief 111.
* **F-10.** *Five checks could not run as written.* Applied: the smoke command (DoD), the eval on the host
  printing qids only (task 41), apply rows for every migration (task 21), "under 131,072" (task 29),
  and probes that start no runner loop (Task list, opening).
* **F-11.** *The Phase 22 facts were stale.* Applied: re-read today at 3d02033, a1afeae and 9a1b862; the
  attributes are ten; pack 21 is not expected green (Seams).
* **F-12.** *The apply image can break while its tests pass.* Applied: the seam rule and the build (Seams; DoD).
* **F-13.** *"Each one opens" was not true.* Applied in brief 111: a course file opens and its page is named;
  an upload opens by signed link; a remembered item opens in the Memory tab.
* **F-15.** *The privacy rules were not written down.* Applied: Privacy rules; Sessions for the transcripts.
* **F-16.** *A status view would duplicate `v_embedding_status`.* Applied: 197 reads it for the course half.
* **F-17.** *Key types, and no foreign key to file rows.* Applied: The stores.
* **F-18.** *A Deep choice sticks.* Applied: the router gets the last auto tier (step 4), and Deep applies to
  one question (brief 111).

**Applied in part**

* **F-14.** *The first week would feel slow.* The warm-up and restart of long-lived MCP clients no longer
  apply: the runner starts one child per retrieval. Kept: the sentence for nothing matched, a failed
  search that does not fail the turn, and the 5-minute skip after three failures.
* **F-20.** *The list of things needing his word, and the limits of "without a command".* The limits are in
  the MVP. The scheduled Inbox exporter no longer applies: it is not in this phase.

**No longer applies**

* **F-8.** *Keep is the largest piece he did not ask for.* Keep and the vault note are not built: he chose
  automatic summaries, inside the app only (answers 1, 2). Two points carry over: remembered text is
  marked as model-written and as data, and a passage keeps its `[notes]` warning (The two turns).
* **F-19.** *The hook fallback would undo a hardening.* The scope is enforced by the materials server from a
  per-request config file under `/run/workspace`, not by the hook; no settings file changes.

**The six questions it said were missing**

* Keep at all: answered by 1 and 2. Nothing matches: answer 8. Routines and graded work: answers 9
  and 10. A split delivery if Phase 22 slips: answer 11.
* A scheduled task that pushes Inbox decision files: not asked, because the exporter left the phase.
* Whether Deep sticks: ruled by the PM (W-9, Deep applies to one question), listed in 109a under
  "Still open, with the default taken".
