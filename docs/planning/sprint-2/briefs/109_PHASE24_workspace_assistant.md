# Phase 24a: Workspace assistant, behind the page. Sessions from the database, a planning turn and an answering turn, one bb2dash retrieval store, uploads, the planner and grades feed, memory

Date 2026-10-08 · PM: the Fable session · Product manager: Stack · Requirements: Stack's ask of
2026-10-08 (no id in `91_REQUIREMENTS_v3.md`; proposed tag S2-workspace-2, the PM assigns it at the
freeze) · Answers on record: `109a_PHASE24_open_questions.md` · Branch `feat/workspace-24` · Worktree
`bb2dash-wt-24` · Workers W-76 to W-79 and W-85 (W-80 to W-84 are the Phase 23 follow-ups', brief 110
on `fix/phase23-followups` at d558994, line 13; W-67 to W-70 and W-75 are Phase 22's, W-71 to W-74 are
used; brief 103 on `feat/styling-22` at 3d02033, line 129) · Migration range **190 to 199** (190 to
197 are written here, 198 and 199 are slack) · Test compose project `bb2dash-wt24` · Verification file
`docs/planning/sprint-2/verification/109c_PHASE24_VERIFICATION.md`, called 109c below · Status: **ready
to freeze on Stack's answers of 2026-10-08, after the challenge round of the same day** (27 findings,
each placed in the second appendix). Four things stay provisional until their probe passes: the
planning turn (P-4), a turn with no MCP server (P-1), a turn that stores no session (P-2) and the
parser's own user in the ingest container (P-10).

**Worker numbers.** Ruling W-14 starts this phase at W-76. Brief 110 was written the same afternoon
and took W-80 to W-84, so this phase's umbrella worker is W-85 and 24b's three are W-86 to W-88. That
is the default taken in the challenge round; the PM confirms it at the freeze, before any worker
branch is cut. Brief 110's own sentence "W-76 to W-79 are Phase 24's" (its line 610) stays true.

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
* `apply/src` imports seven `workspace/src` modules: `config`, `errors`, `providers/claude-cli`,
  `stream-json`, `db`, `alive` and `hooks/gate-rules` (`apply/src/claude.ts:18-21`, `config.ts:9-17`,
  `db.ts:8`, `healthcheck.ts:12`, `main.ts:18-21`, `mcp-sql/server.ts:25-26`,
  `hooks/gate-rules.ts:19`, `hooks/tool-gate.ts:33-37`). The seventh is the tool gate of the one
  Claude process that can write: `tool-gate.ts` loads `runGate` from the runner's file and any
  failure of that import is a denial of every call (`tool-gate.ts:40-41`). Its bundle leaves packages
  external (`apply/package.json:12`), its image copies `workspace/src` and `mcp-server/`
  (`docker/apply/Dockerfile:39, 46-49`), and no test of apply runs the built gate (`apply/test/`
  holds `process.test.ts` and `pure.test.ts` only).
* Brief 110 (the Phase 23 follow-ups) is on `fix/phase23-followups` at d558994, committed 15:39 local
  on 2026-10-08. It takes workers W-80 to W-84 (its line 13) and migrations 187 and 188 with 189 held
  (its line 14), and its seam row says "Neither phase edits a file under `docker/apply/`" (its line
  491). This brief gives W-79 files there (Files by owner), so that sentence is wrong and is the PM's
  to correct in brief 110.
* `docker/workspace/entrypoint.sh:46` drops to `node` with an empty capability set before the runner
  starts. A process started after that line cannot start a child as another user.
* `ingest/pull_files.mjs:89, 175-179`: `bytesLookValid` refuses anything under 1,000 bytes and
  anything that is not a PDF or a zip. `ingest/extract_text.py:38-43` reads four extensions and picks
  its reader from the file's extension.
* The web app holds no name of his: a grep of `web/src` for `user_metadata`, `display_name`,
  `full_name`, `first_name` and `given_name` gives 0 hits outside the generated types file.
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
| 8 | when nothing of his matches | It answers from general knowledge and says plainly that it found nothing of his | The `empty` retrieval state and its fixed sentence. The sentence speaks of his course files and uploads, so it stays true when his planner or the conversation is what answers him (What a failure looks like) |
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
8. With memory switched on, a conversation whose last answer came after the switch-on time and that
   has been quiet for 15 minutes gets one memory item; an older or an archived conversation gets
   none; deleting the item leaves no row for search in the same transaction. Today nothing from a
   conversation is embedded.
9. The container mounts no `harness_database_url`, the MCP config names one server and the gate allows
   two tools. Today: four secrets, two servers, four tools (`compose.yaml:222-226`,
   `mcp-config.ts:27-44`, `gate-rules.ts:13-18`).
10. When no passage and no remembered item matched and no attachment was read, the turn's retrieval
    state is `empty`, the answer exists and its first line is the fixed sentence. The sentence speaks
    of his course files and uploads only, so it is still true on a planner question that the feed
    answers. A question with an attached file that was read stores `attached_only` and gets no such
    line. Today no rule covers it.
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
18. A passage that holds a copied closing line, a copied planner block and a copied label leaves the
    assembled prompt with exactly one feed block and the same number of blocks. Today the replay
    marks a turn with a bare `[role]` line and nothing stops text from copying it (`replay.ts:28`).
19. As `authenticated`, a direct insert into `workspace_documents`, a direct update of its
    `signed_url` or `state`, and a direct insert into `workspace_request_options` each raise 42501;
    the same writes through the four browser functions succeed for the owner and write nothing for
    another signed-in user. Today the tables do not exist.
20. A CLI stderr line that holds 100 characters of the prompt gives a log line without them. Today
    the runner logs the first stderr line with only exact copies of the whole prompt taken out
    (`claude-cli.ts:357-364, 450`).
21. With 47 work rows and 32 score rows of synthetic text, the counts the challenge round read on
    prod on 2026-10-08 (see The planner and grades feed), the feed block leaves no row out. Today
    there is no feed.

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
   instructions; the attachments (kind, id, title, state); the About me note; the conversation's
   rolling summary and its through-point; the stored messages after that point, oldest first, a
   stopped or failed answer marked with its code; the tier of the last answer whose depth was auto;
   the course list (id, short title, display id); today's date in New York. The jsonb holds exactly
   these keys and a unit pins them (task 19).
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
9. **Assemble.** NEW `context/assemble.ts`, `context/budget.ts` and `context/fence.ts` build one
   prompt argument from stored rows and retrieved data, each block fenced and titled as data (see The
   fence), the question last.
10. **Store facts and sources.** NEW `workspace_turn_put(p_request_id, p_runner, p_facts, p_sources)`
    writes the `workspace_turns` row and the `workspace_sources` rows before the answering model
    starts, and sends the Realtime event `sources` `{request_id, state, found_n}` on
    `workspace:<conversation>`. Today's page registers `delta` and `done` only
    (`web/src/lib/use-workspace-stream.ts:262-275`), so it ignores the new event.
11. **Answering turn**, streamed as today through `workspace_stream`.
12. **Sources from the answering turn.** A unit the model opens by id becomes a source row of origin
    `tool`, taken from the call's input, in a second `workspace_turn_put` before finish. Nothing is
    parsed out of a tool result's text. **The limit that follows:** a hit of the model's own search
    that it does not open leaves no source row, although the search tool prints each hit's id
    (`mcp-server/src/format.ts:124`). The format rules tell the model what to do about it (How
    passages are labelled).
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
  the summary's through-point pass 12,000 bytes. 14,000 bytes sits just under the floor of the
  recent-turns block (14,400), the part every turn is sure to hold (Byte budget). If a question
  arrives first, that turn uses the
  summary it has and the newest messages that fit; the count of messages left out is logged. The
  summary's prompt forbids due dates, statuses and scores (see Memory).
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
  question, the rolling summary, the last turns, names and dates. That does not make it immune:
  earlier answers, the rolling summary and file titles can carry a document's words at second hand.
  What bounds it is the check on its output. A plan is at most 4 queries (6 on Deep), each cut to
  2,000 characters, with three known kinds, a course inside the scope and a window inside 180 days.
  Anything outside that is dropped or cut. So the worst a steered plan can do is a poor search, and
  the answering turn still gets the feed and the attachments.
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
Haiku answers with the passages. Auto behaves the same way whenever the router picks `low`
(`router.ts:124-125`). **This is a default he was not asked about** and it is the one place the build
departs from his sentence "using a cheap model to orchestrate those retrievals, while a higher level
model then takes the context": on these questions the cheap model answers and no model plans. Auto
is the only depth today's page can send, and the challenge round read 20 of 38 stored answers at tier
`low` on prod (4 `mid`, 14 `high`; most were test questions; not re-read in this pass). It is item 19
in 109a, his to object to. If he objects, the cheapest change is a planning turn on `low` as well:
one more Haiku turn of at most 0.05, still inside the 1.00 cap.

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
  wrong" and carrying the date it was written. The feed is one block labelled `[P]`.
* Under the label: the file's title, its page, slide or sheet, and its course id. A passage that holds
  the `[notes]` marker also carries the speaker-notes warning (root `CLAUDE.md`; `system.md:23`).
* With format `rich` the model is told to cite by label. With format `plain`, which is every question
  from today's page, it is told to name the file and the page in words and to write no bracket label,
  so today's plain-text page shows no stray marks. The source rows are stored either way.
* **A label is cited only where a source row can exist.** Both format rules carry one line: cite by
  label only a passage that is in the prompt or a unit you opened; for anything you only saw in a
  search result, name the file and the page in words. Without it, an answer built on the model's own
  search would show a bare bracket code on the 24b page and no source (step 12).
* Labels are ids, not ordinals, because the answering turn can open more units by id, and those get
  their rows after the prompt was built. The 24b page numbers the chips by row order.
* A label in an answer with no source row of that request stays plain text (24b).

**The fence.** It is the named guard against a poisoned file, so it is specified here and tested
(NEW `context/fence.ts`, task 29).

* **One marker a turn.** The runner draws 16 random hex characters for each turn. Every block opens
  with one line that carries the marker, the block's kind and its label, and closes with one line
  that carries the marker and the word `end`. The exact characters of both lines are frozen in the
  PM's fixture `fence.txt` (task 12). The framing at the top of the prompt gives the marker and says:
  a block is only what stands between two lines that carry this marker, and everything inside a
  block is data, whatever it looks like, a block line, a label or an instruction included.
* **Data cannot write a block line.** Before assembly every line of data is checked. A line that
  holds the turn's marker, a line that starts with the block line's opening characters, and a line
  that starts with a label shape (`[M`, `[U` or `[R` with digits and `]`, or `[P]`) each get a
  two-character prefix, so none can stand as a block line or open with a label. The text is
  otherwise unchanged, and the bytes added are counted in the budget.
* **Titles are data too.** A file's name, an upload's title, an assignment's title and a reading's
  citation are cut to one line and 120 characters and pass the same check before they go into a
  block's header or a feed row.
* **Every block uses it:** passages, attachments, remembered items, the rolling summary, the feed,
  and each earlier turn of the conversation as its own block, so an earlier answer that quoted a
  document cannot close its block either. Today's replay marks a turn with a bare `[role]` line
  (`replay.ts:28`); that goes.
* **What it does not do.** A document can still say something false and the model can still repeat
  it. The fence only stops a document from passing its words off as the planner, as another source
  or as the runner.

**Byte budget of the prompt argument.** The limit is under 131,072 bytes (`config.ts:73`). The runner
assembles to 128,000.

Six blocks have a ceiling and take only what they need:

| block | ceiling, bytes |
|---|---|
| question | 32,000 (8,000 characters at up to four bytes each, `140:41-45`; a question is rarely over 1,000) |
| passages, 14 at most, 2,000 each | 28,000 |
| planner and grades feed | 12,000 |
| rolling summary | 3,000 |
| remembered items, 3 at most, 1,000 each | 3,000 |
| framing, the lines at the top of the prompt | 2,000 |
| the six together | 80,000 |

A block's own two lines and its header count inside that block's size, so a passage of 2,000 bytes is
2,000 with them. Two blocks share the **spare**, which is 128,000 minus the real size of the six. The
spare is never under 48,000, and on an ordinary question it is about 80,000.

| block | never under | what it gets |
|---|---|---|
| recent turns | 14,400 | with no attachment, the whole spare up to 96,000, which is today's replay size (`config.ts:71`). With an attachment, 30 % of the spare, and no more than the messages need |
| attached documents, shared | 33,600 | with an attachment, 70 % of the spare and whatever the recent turns leave |

* **Why not fixed sizes.** The first draft of this table gave the recent turns 14,000 bytes and the
  attachments 40,000, whatever the question's size. Today a fresh start replays up to 96 KiB
  (`config.ts:71`) and one stored answer may be 100,000 characters (`config.ts:78`), so a follow-up to
  a long answer could have held none of it. The challenge round also read 13 of 116 course files with
  text over 40,000 bytes on prod, the largest 130,773 (not re-read in this pass).
* **One message larger than its share.** Messages are taken newest first. No message takes more than
  half of the recent-turns block: a larger one keeps its start and its end, a quarter of the block
  each, with one line between that gives the bytes left out. A message that does not fit whole at
  the block's end is cut the same way when at least 64 bytes of it fit, which is today's rule
  (`replay.ts:22`), else left out. The count of messages left out is logged.
* **Attached text.** The files share the block in the order he attached them: an equal share each,
  and what a short file leaves goes to the next. A cut file is cut at a unit's end where one fits,
  and its block ends with one line: how many units were read of how many. For a cut course file that
  line also gives the ids of up to 40 units left out, so the model can open them with
  `get_material_text` inside its 10 reads. For a cut upload no tool reaches the rest (Out of scope),
  and the answer says the file was read in part.

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
| no passage and no remembered item matched, and no attachment was read | retrieval `empty` | an answer from general knowledge whose first line says that no passage of his course files or uploads matched |
| no passage and no remembered item matched, and an attachment was read | retrieval `attached_only` | an answer from the attached file, with no such line |
| an attachment is not read yet, failed, or was cut | the attachment's state | the answer names the file it could not read, or read in part |
| Stop, the time limit, the budget, the plan's limit, sign-in | the existing codes | today's sentences |

**What `empty` means, and what its sentence may say.** The feed is read on every answer, a follow-up
rests on the conversation, and both are his. So "nothing of his" would be a false first line on a
planner question, on a question about an attached file and on many short follow-ups, because the
search floor is 0.78 and unrelated English scores 0.753 to 0.767 (`mcp-server/src/config.ts:35-41`).
Three rules keep the line true:

* `empty` is stored only when no passage and no remembered item matched **and** no attachment's text
  was read. With an attachment read, the state is `attached_only` and no sentence is written.
* The sentence speaks of his course files and uploads only: it says that no passage of them matched
  this question. It never says that nothing of his was used. The wording is the PM's, frozen in
  `lines.ts` at task 12. His answer 8 asks that it say plainly that it found nothing of his; this is
  that sentence, kept true when the planner or the conversation is what answers him.
* A short follow-up is searched with the previous question after it (the fallback plan), so a
  follow-up to a course question usually finds the same passages again and stores `found`. One that
  finds nothing stores `empty` and gets the sentence, which is true as worded.

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
(`119`, `150`). `courses.id` is text and `bb_files.id` is bigint.

**Who may write what.** Row security is on for every table and anon is revoked. Every policy on every
new table names `app_owner()` in 140's initplan form, `workspace_routines` included: the frozen unit
refuses any policy on a `workspace_` table that does not
(`db/tests/phase21_140_workspace_tables.sql:153-160`), and it must pass unedited. The browser's direct
writes are three column updates and nothing else: an upload's `title` and `course_id`, and
`about_me`. Each has its column grant and an owner update policy, as 140 does for a conversation's
title (`140:351-355`). Every other write of the browser goes through four SECURITY DEFINER functions
(below), and the tables they write give `authenticated` select only. So a signed-in session cannot
skip a function's checks by writing the row itself: a direct insert, update or delete raises 42501
(check 19). The first draft marked the four as invoker with no write grant behind them, which would
have failed with 42501 on the first insert; column grants in 140's form would have let a direct write
pass the signed-link check, the cap of five attachments and a routine's `needs`.

| table or view | columns | browser | written by |
|---|---|---|---|
| `workspace_documents` | id bigint, kind (`upload`, `memory`), title, course_id, conversation_id, storage_key, mime, byte_size, sha256, state (`stored`, `reading`, `text_ready`, `indexed`, `failed`, `deleting`), error_code, attempts, signed_url, signed_url_expires_at, claimed_at, claimed_by, created_at, updated_at. One memory row per conversation. Two CHECKs: `storage_key` holds only lower-case letters, digits, `/`, `.`, `_` and `-`, so it needs no encoding; `signed_url` is null, or is the project host's signed path for this bucket, then this row's `storage_key`, then a query string | select; update of title and course_id | `workspace_upload_register`, `workspace_upload_retry`, `workspace_document_delete`, the ingest functions, `workspace_job_finish` |
| `workspace_document_text` | id bigint, document_id (cascade), unit_kind, unit_no, text, fts, embedded_at | select | `workspace_ingest_put_text`, `workspace_job_finish` |
| `workspace_text_embeddings` | text_id (cascade), part_no, part_range, model, embedding vector(384), an HNSW cosine index (the shape of `010:46-57` after 011) | none | the edge function `workspace-embed` |
| `v_workspace_memory` | document id, conversation_id, state, created_at, updated_at, summary | select | a view, security invoker |
| `workspace_profile` | id = 1, about_me (2,000 characters at most), memory_since (null until a runner first asks for memory jobs, then never moved), updated_at | select; update of about_me | the owner (`about_me`); `workspace_job_claim` (`memory_since`, once) |
| `workspace_conversation_state` | conversation_id, rolling_summary, summarised_through, job_claimed_at, job_claimed_by, job_failures, memory_opt_out, memory_written_at | select | the job functions, `workspace_document_delete` |
| `workspace_routines` | id, grp, title, description, needs (`nothing`, `file`, `course_or_file`), sort, enabled, instructions | select | the migration (six rows) |
| `workspace_request_options` | request_id (cascade), course_display_id, course_ids text[], depth (`auto`, `quick`, `standard`, `deep`), routine_id, format (`plain`, `rich`) | select | `workspace_ask_with` |
| `workspace_request_attachments` | request_id (cascade), ord (1 to 5), kind (`file`, `upload`), file_id, document_id (set null) | select | `workspace_ask_with` |
| `workspace_turns` | request_id (cascade), depth, tier, plan_state (`skipped`, `planned`, `fallback`), retrieval_state (`found`, `attached_only`, `empty`, `failed`), found_n, passages_n, memory_n, feed_rows, attachments (ids and states), prompt_bytes, plan_ms, retrieval_ms, plan_cost_usd, created_at | select | `workspace_turn_put` |
| `workspace_sources` | request_id (cascade), ord (1 to 40), kind (`material`, `upload`, `memory`, `feed`), origin (`auto`, `attached`, `tool`), file_id, text_id, document_id (set null), doc_text_id, course_id, unit_kind, unit_no, similarity, title | select | `workspace_turn_put` |
| `workspace_ingest_heartbeat` | id = 1, polled_at, runner | select | `workspace_ingest_heartbeat()` |
| `v_workspace_index_status` | one row; see Indexing and status | select | a view, security invoker |

`workspace_sources` never stores passage text. A row is kept only when its ids exist; a 41st row is
cut, never refused, as 143 cuts tool calls. A title is the file's name or the upload's title, so a row
stays readable after its upload is deleted.

**Functions.**

| function | runs as | who may execute | what it does |
|---|---|---|---|
| `workspace_ask_with(uuid, text, jsonb)` | definer | authenticated | **the owner check, first** (see below). Then calls the frozen `workspace_ask` and stores the options and attachments in the same transaction. Keys: `course` (a display id of `v_course_display`, expanded to its `shell_ids`, `017_course_display.sql`), `depth`, `routine`, `format`, `files`, `uploads`. Returns the same three ids. 22023 for the text's length and 23505 for a second open request, as today; 23503 for an unknown routine or upload; 23514 for a bad value, a sixth attachment, or a routine whose `needs` is not met |
| `workspace_upload_register(...)` | definer | authenticated | the owner check, first. Records an upload in state `stored`. Accepts only a signed URL on the project's host under this bucket's signed path that ends in the row's own `storage_key`; the table's CHECK holds the same rule, so no other writer can store another link |
| `workspace_upload_retry(bigint, text, timestamptz)` | definer | authenticated | the owner check, first. A `failed` upload, and only a `failed` one, goes back to `stored` with a fresh signed URL under the same rule |
| `workspace_document_delete(bigint, boolean)` | definer | authenticated | the owner check, first. A memory item: the row, its unit and its vector go in one transaction and `memory_opt_out` is set. An upload: two steps, see Delete under Uploads and extraction |
| `workspace_search(p_q, p_query_embedding, p_kinds, p_courses, p_limit, p_min_similarity)` | invoker | service_role | unions `hybrid_search_file_text` (`129_search_notes_label_materialize.sql:17-24`), once per course of the scope, with a NEW twin over the new tables. Each row: kind, the unit's id, file_id or document_id, course_id, title, unit, part, similarity, score, a passage of at most 2,000 characters from the matched part, and whether it holds the `[notes]` marker. With a scope, course materials and course-tagged uploads are filtered; untagged uploads and memory are always searched. A document in state `deleting` or `failed` is never returned. `authenticated` is not granted: the page never searches (brief 111, Reads), and the browser has no right on `workspace_text_embeddings`, so an invoker call would fail there |
| `workspace_attachment_read(p_kind, p_id, p_max_chars)` | invoker | service_role | an attached file's units in order, cut on the server, with the bytes read and the total |
| `workspace_ingest_claim(p_runner)`, `workspace_ingest_put_text(p_runner, ...)`, `workspace_ingest_finish(p_runner, ...)`, `workspace_ingest_heartbeat(p_runner)` | definer | `workspace_ingest_runner` | see Uploads and extraction. A runner holds one document at a time, and `put_text` and `finish` refuse (22023) a document that runner does not hold |
| `workspace_claim_v2`, `workspace_turn_context`, `workspace_turn_put`, `workspace_planner_feed`, `workspace_job_claim`, `workspace_job_finish` | definer | `workspace_runner` | the runner's six new functions. After 196 the role executes eleven SECURITY DEFINER functions and still holds no table, view or sequence grant |

**The owner check of the four browser functions.** Each is `security definer` with
`set search_path = public, pg_temp`, as 143 pins for the runner's (`143:89, 202`). Its first
statement raises 42501 unless `auth.uid()` equals `app_owner()`; a null uid is refused too, unlike
170's form, which lets a caller with no uid through for the service role
(`170_material_history_round3.sql:185-188`). Inside a definer function row security does not apply,
which is why the check is a refusal at the top and not a policy. `workspace_ask(uuid, text)` itself
stays invoker and frozen for today's page.

**Every new SECURITY DEFINER function revokes PUBLIC and anon** in its own migration and is granted to
one role. The two Phase 21 units list the definer functions `workspace_runner` can execute by any
route, PUBLIC included (`db/tests/phase21_142_workspace_runner.sql:151-158`,
`phase21_143_review_round.sql:152-159`), so a function left open to PUBLIC in 190, 193 or 194 would
break them before 196 is written. Whether Supabase's advisor lists a definer function that
`authenticated` may execute: not checked, no database read was taken for this pass. If it does, the
four are recorded in 109c with this reason.

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
* **One document a call.** `workspace-embed` requires `document_id` in its body and touches units of
  that document only, never a document in state `failed` or `deleting`. The rest of the body and
  the answer are `embed-corpus`'s, because the worker drives it with `runEmbedLoop` unchanged
  (`ingest/embed_corpus.mjs:74-125`): `limit`, `max_parts` and `dry_run` in; `inserted_rows`,
  `failed`, `remaining_parts` and `missing_parts_before` out. That loop stops at the first failed
  unit. If the function picked units across documents, one bad upload would block every later upload
  and every memory item.

**Migrations.** Additive and numbered. 190 to 197 are frozen once applied; a fix is 198 or 199.

| no. | file | holds |
|---|---|---|
| 190 | `190_workspace_store.sql` | `workspace_documents` with its two CHECKs, `workspace_document_text`, `workspace_text_embeddings`, `v_workspace_memory`; the three definer functions `workspace_upload_register`, `workspace_upload_retry`, `workspace_document_delete`, PUBLIC and anon revoked |
| 191 | `191_workspace_uploads_bucket.sql` | the bucket and its four owner policies on `storage.objects` |
| 192 | `192_workspace_search.sql` | `workspace_search` (service_role only), its twin over the new tables, `workspace_attachment_read` |
| 193 | `193_workspace_ingest_role.sql` | role `workspace_ingest_runner`, its four functions, `workspace_ingest_heartbeat`. **The file carries no password, ever**, in 142's words (`142:11-13`); its header says so |
| 194 | `194_workspace_ask_options.sql` | `workspace_routines` (six rows), `workspace_request_options`, `workspace_request_attachments`, the definer function `workspace_ask_with`, PUBLIC and anon revoked |
| 195 | `195_workspace_turn_state.sql` | `workspace_profile` (with `memory_since`), `workspace_conversation_state`, `workspace_turns`, `workspace_sources` |
| 196 | `196_workspace_runner_v2.sql` | the runner's six new functions, their grants, a guard that the role's list is the eleven |
| 197 | `197_workspace_index_status.sql` | `v_workspace_index_status`. It reads no storage table |
| 198, 199 | | slack |

Two applies move a fact that a unit on `main` pins against prod (`db/tests/README.md:3`): 193 adds a
member to `db_test_runner` (`db/tests/phase15_100_db_test_runner_role.sql:76`), and 196 changes the
runner's function list (`phase21_142_workspace_runner.sql:151-158`,
`phase21_143_review_round.sql:152-159`). Both are applied on one day, with one test-only port PR to
`main` that day, as PR #65 and PR #77 did.

### Uploads and extraction

* **The bucket.** NEW `workspace-uploads`: private, 20,971,520 bytes a file, six types. Four are
  parsed: pdf, docx, pptx and xlsx, which is what `ingest/extract_text.py:38-43` reads. Two are read
  as text with no parser: plain text and Markdown. Four owner policies in the form of
  `020_rls_owner_scoped.sql:141-143`. A migration can create a bucket here:
  `003_bb_files_bucket.sql:2` did.
* **The order.** The browser puts the file in the bucket under a key the page makes (lower-case
  letters, digits, `/`, `.`, `_` and `-` only), makes a signed URL (7 days) and calls
  `workspace_upload_register`. The row starts in state `stored`. None of this has a control before
  24b; 24a proves it in tests and in the acceptance run.
* **Where extraction runs.** NEW compose service `workspace-ingest`, behind `profiles: [workspace]`,
  on its own NEW network `ingest-net`, with no volume, a read-only root and a tmpfs of 96 MB for the
  one file it is reading and that file's units. `mem_limit` is 1 GiB and `pids_limit` is 128, so a
  zip bomb in a 20 MB file ends in `extract_failed` and does not take memory from the sync in the
  Docker VM; P-11 measures the largest file against both. It holds no model, no Claude token and no
  service key. Its two secrets are files: NEW `workspace_ingest_db_url` (role
  `workspace_ingest_runner`: four functions, no table grant, through the session pooler) and the
  existing `supabase_anon_jwt` (`compose.yaml:262-263`), which is the public key the embed call
  needs. Its firewall is generated from the Workspace's by a fork script of its own and allows
  tcp/443 to the project host and tcp/5432 to its pooler, nothing else: not `api.anthropic.com`.
* **Two users inside it.** The parser is the part most likely to meet a hostile file, and for a PDF
  it is `pdftotext`, a C++ program (`ingest/extract_text.py:8`). So it does not run as the worker's
  user. The image has two users, `node` for the worker and `extract` for the parser. The entrypoint,
  still root, raises the firewall, adds one rule that drops every packet a process of `extract`
  sends, and starts two processes with an empty capability set each: the parser's loop as `extract`
  and the worker as `node`. It has to start both: after that drop no process can start a child as
  another user (`docker/workspace/entrypoint.sh:46` is the same drop). The two secrets are mounted
  with mode 0400 for `node`, so `extract` cannot read them. The two meet in the tmpfs folder: the
  worker writes the file there, the parser calls `extractUnits` and writes the units back as one JSON
  file, and the worker reads at most 64 MB of it, as data. **Not checked:** whether this Docker
  honours a mode and an owner on a file secret, and whether the firewall's owner match loads. P-10
  decides both before the freeze. If P-10 fails, the parser moves to a second service,
  `workspace-extract`, with no network, no secret, the same limits and one exchange volume it shares
  with `workspace-ingest` alone, and the PM rules that before the freeze.
* **Why that place is safe, and how far that goes.** No Claude process and no Blackboard login shares
  a network or a volume with this service. It holds no model, no Claude token and no service key. An
  image test in the form of `docker/apply/image.test.mjs:130-138` pins the network, the absent
  volumes, the two secrets, the two limits and the two users. That is the claim. The blast radius is
  written out here, because this container's job is to read bytes nobody vetted:
  * **A file that takes over the parser** runs as `extract`, with no secret and no network. It can
    return wrong text for the file being read and for later files until the container restarts, and
    use memory and processes up to the limits. Nothing else.
  * **A file that also reaches the worker's user** can read the role's DSN file and the public anon
    key. With them it can claim waiting uploads, one at a time, and read each one's signed link, so
    the bytes of his private uploads. It can write wrong index text for the document it holds. It
    can call `search` and read course passages, as anyone holding that public key can (109a, item
    18). And it can send data out by the three ways Phase 21 recorded: another site on an allowed
    Cloudflare address, DNS, and `net.http_post` through the role's login (STATUS, deferred
    hardening, lines 800-812). It cannot read planner state, a grade, a conversation or a remembered
    item, reach a model, or write anything but the text of the document it holds.
  * Phase 21 left those three ways open for the Workspace "for now", and the question was put to
    Stack, not accepted on his behalf (DECISIONS 2026-10-07, the allowlist row and his answers row).
    There, nothing runs code he did not write. Here a parser reads bytes nobody vetted, so the same
    gaps weigh more. **This is a default he was not asked about:** item 20 in 109a, his to object to.
* **The steps.**
  1. `workspace_ingest_claim(p_runner)` (skip locked) hands over one document and its signed URL, and
     hands over nothing while that runner still holds one inside its 10-minute lease.
     `workspace_ingest_put_text` and `workspace_ingest_finish` refuse a document the caller does not
     hold.
  2. The worker checks the link again before it downloads: `https`, the project's host, the bucket's
     signed path, ending in the row's `storage_key`. It follows no redirect (P-7).
  3. It downloads to tmpfs under a name made from the document's id and the registered type's
     extension, never the upload's own name: the extractor picks its reader from the extension
     (`extract_text.py:38-43`).
  4. **A parsed type.** The size, then the first bytes with `bytesLookValid`
     (`ingest/pull_files.mjs:175-179`: a PDF's or a zip's first bytes, and at least 1,000 bytes). The
     parser extracts with `extractUnits` (`pull_files.mjs:493-497`), whose `run` argument carries
     the 300 s limit, as the sync passes it today (`sync/src/files.ts:47, 307-311`), so `ingest/` is
     not edited.
  5. **A text type.** No parser runs and `bytesLookValid` is not called: it refuses both types and
     any file under 1,000 bytes (`pull_files.mjs:89, 175-179`). The worker's own rule is: valid
     UTF-8, no NUL byte, at least one character that is not white space. The file is then one unit
     of kind `doc`, number 1. A failed rule is `bad_bytes`, or `no_text` for white space alone.
  6. Either way, more than 1,000 units or 1.5 million characters is refused, and the units go in
     through `workspace_ingest_put_text` (state `text_ready`).
  7. The worker runs `runEmbedLoop` (`ingest/embed_corpus.mjs:74`) against `workspace-embed` with the
     document's id, then calls `workspace_ingest_finish`, which accepts `indexed` only when every
     unit of the document has its `embedded_at`. `finish` clears the signed URL on `indexed` and on
     `failed` alike. The same loop embeds a memory item's unit.
  8. A download, an extraction or an embed is tried 3 times before the row is `failed`.
* **Error codes of a failed upload**, fixed here so 24b can word them: `too_large`, `bad_type`,
  `bad_bytes`, `no_text`, `extract_timeout`, `extract_failed`, `too_many_units`, `link_expired`,
  `download_failed`, `embed_failed`.
* **Delete, in two steps.** `workspace_document_delete(id, false)` cuts retrieval at once: the units
  and the vectors go in that transaction, the signed URL is cleared, and the row stays in state
  `deleting` with its `storage_key`, which the call returns. The browser removes the object, because
  SQL cannot (`protect_objects_delete` guards `storage.objects`, read on prod 2026-10-08), and then
  calls `workspace_document_delete(id, true)`, which drops the row and is accepted only for a row in
  `deleting`. If the tab closes or a call fails between the two, the row in `deleting` is the retry
  handle: the first call can be made again and returns the same key, the 24b page lists the row with
  Try again, and the status row counts it. No file is left in the bucket with nothing holding its
  key, and the count reads no storage table. The second call takes the browser's word that the
  object is gone; only the owner's own session can make it. Deleting an upload does not rewrite an
  answer already given: a stored answer keeps what it quoted, since the browser has no update or
  delete on messages (`140:196`).
* **A poisoned document.** Its text reaches the answering turn inside a fenced block (The fence) and
  is never in the planning turn's input. The answering turn has two read tools over course materials
  and nothing that writes, sends or fetches. Sources come from ids, never from text. Logs hold no
  text. The 24b page draws no image and fetches no link. So the worst its text can do is a wrong
  answer, or, once memory is on, a wrong remembered item, which is marked as model-written, carries
  its date and can be deleted. What its bytes could do to the parser is the other half, above.

### The planner and grades feed

`workspace_planner_feed(p_request_id, p_runner, p_from, p_to)` returns one jsonb. It refuses (22023)
unless the request is claimed by `p_runner`. It is read on every answer, whatever the plan says: the
plan may only move the window. The default window is 7 days back to 28 days ahead.

**What the function itself enforces**, so the role cannot read a wider range by asking for one:

* **The window.** `p_from` and `p_to` are clamped inside the function to 180 days either side of
  today in New York. Null means the default.
* **The courses.** The function reads the request's own stored scope
  (`workspace_request_options.course_ids`) and filters by it. It takes no course argument. No scope
  means all his courses.
* **The columns.** The jsonb holds exactly the keys below, and a unit pins that (task 19).

**What it returns.**

* `work`, from the rows of `v_work_items` (`089_work_items_due_on_new_york.sql:47-105`) whose
  `due_on` is in the window, nearest today first, then the undated rows: item_kind, item_id,
  course_id, title, type, due_at, due_on, undated, status, points_possible, in_workload. The view has
  two arms, so this reads **readings as well as assignments**: a reading's row carries its citation
  as the title and its status from `reading_progress` (`089:79-105`).
* `scores`, from `v_gradebook_latest` (`047_gradebook_views.sql:43-94`), `column_kind = 'item'`,
  **only where a score or a grade is posted** (`display_score` or `display_grade` is not null):
  course_id, column_id, name, possible, display_score, display_grade, grades_released, is_exempt,
  submission_status, seen_at, assignment_id. Scores are **not windowed**: a score posted for work due
  two months ago is still his score. They are ordered by `seen_at`, newest first.
* `as_of`, and a fixed marker saying the "graded so far" figure is on the Grades screen.
* Left out: feedback text, totals and calculated columns, effort, suggested start, a column with no
  score posted, and every column of `assignment_progress` and `reading_progress` except status.
* At most 60 work rows and 60 score rows.

**The block in the prompt: 12,000 bytes, one line a row.** The runner renders the jsonb as text: one
header line that names the columns, then one line a row with the values separated by ` | `, and no
key repeated. A work line holds the kind (one letter), the course, the due date in New York with its
time when there is one, the status, the type, the points, in workload (one letter) and the title. A
score line holds the course, the name, the score, the points possible, the grade, released (one
letter), exempt (one letter), the submission status and the date seen. Ids are not printed: the model
has no use for them. A title is cut to 120 characters and one line (The fence). The format is frozen
in the PM's fixture `feed-block.txt` (task 12).

* **Why 12,000 and not the first draft's 6,000.** The challenge round read prod on 2026-10-08, counts
  and bytes only (not re-read in this pass, which took no database read). 47 of 186 `v_work_items`
  rows fall in the default window and take 13,425 bytes as JSON with these eleven keys, 285 a row.
  `v_gradebook_latest` holds 66 rows of kind `item`, 32 of them with a score, and the 66 take 21,703
  bytes as JSON, 329 a row. About 35,000 bytes met a 6,000-byte block, so roughly 20 of 113 rows
  would have survived an ordinary day. One line a row, with no keys and no ids, is about 110 bytes
  for a work row and 100 for a score row (this brief's estimate from those averages, not measured),
  so 47 and 32 rows come to under 9,000 bytes.
* **Where the bytes come from.** The feed's ceiling rose by 6,000. On an ordinary question the spare
  is about 80,000, so nothing is squeezed. Only against a question of the full 32,000 bytes does the
  attachments' floor fall to 33,600, under the first draft's 40,000 (Byte budget).
* **The cut**, when the block would still pass 12,000 bytes: the undated work rows go first, then
  the score rows oldest first, then the work rows farthest from today. The block's last line says
  how many rows of each part were left out, and `feed_rows` in `workspace_turns` holds the count that
  went in. Check 21 holds the ordinary case: 47 and 32 rows, none left out.

**What the runner's login can read after 196**, every fact, by function. The first draft named one
function and four kinds of fact. This is the whole list, and the boundary table, the DECISIONS row and
the project guide's sentence say the same.

| function | what it hands back | read from |
|---|---|---|
| `workspace_claim_v2` | the claimed request's ids and its question's text | `workspace_requests`, `workspace_messages` |
| `workspace_turn_context` | the request's options; the routine's instructions; each attachment's kind, id, title and state; the About me note; the rolling summary; the conversation's stored messages; the last auto tier; the course list (id, short title, display id) | `workspace_request_options`, `workspace_routines`, `workspace_request_attachments`, `bb_files` (the file's name), `workspace_documents` (title, state), `workspace_profile`, `workspace_conversation_state`, `workspace_messages`, `courses` through `v_course_display` |
| `workspace_planner_feed` | assignments: title, type, due time and date, points possible, in workload, and the status from `assignment_progress`. Readings: citation, date, required, and the status from `reading_progress`. Gradebook item columns with a posted score: name, points possible, score, grade, released, exempt, submission status, date seen, the linked assignment's id | `v_work_items` (`assignments`, `v_assignment_effort`, `assignment_progress`, `readings`, `reading_progress`) and `v_gradebook_latest` (`bb_gradebook`, `sync_runs`, `assignments`) |
| `workspace_job_claim` | a job's kind, its conversation's id and the messages it is to summarise | `workspace_messages`, `workspace_conversation_state`, `workspace_conversations` |
| `workspace_turn_put`, `workspace_job_finish` | ids and counts only | they write the phase's own tables |

Each of the first four refuses a request or a job the caller does not hold. Course text itself is not
on this list: the runner's login cannot read `bb_file_text`, an upload's units or a vector, and gets
passages only from the batch child, which holds the service key. `courses` and `bb_files` are fact
tables, so the sentence "cannot reach a fact table" is amended, not kept (Decisions this brief
amends).

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

**The planner is not indexed, and memory must not become its second home.** The feed is never
embedded. But it rides on every answer, a remembered item is written from the conversation's
messages, and an answer may have quoted a due date or a score. A remembered item could then carry
last week's date or score into a later prompt, which is the stale copy ruling W-6 chose the feed to
avoid, and a second home for grades. Two rules:

* `prompts/summary.md` and the rolling-summary prompt forbid due dates, statuses and scores in a
  summary. A summary says what was worked on, not what the planner said.
* `prompts/system.md` gets one line in place of its line 21, which spoke of decision notes: a
  remembered item is dated and may be out of date, and the feed is the current figure.

Tasks 34 and 35 check that both sentences are present. A prompt rule lowers the chance and does not
remove it, which is why a remembered item also carries its date in the prompt.

### Memory

* **The About me note.** One row in `workspace_profile`, written by him (24b), read into the system
  prompt of every answering turn.
* **The memory item.** A background Haiku turn (`prompts/summary.md`, no tool, no MCP server, 0.05)
  summarises a conversation 15 minutes after its last finished answer. One item per conversation,
  replaced on each run, 1,000 characters at most. It is built from the conversation's messages only,
  never from passages or attachment text, and its prompt forbids due dates, statuses and scores (The
  planner and grades feed). `workspace_job_finish` stores it as a `memory` document with one unit; the
  ingest worker embeds it on its next poll.
* **Jobs.** `workspace_job_claim(p_runner, p_kinds)` returns at most one job (`rolling` or `memory`)
  with a 5-minute lease, and returns nothing while any request is queued or claimed. During a job the
  loop keeps asking for a claim every 2 s (`runner.ts:151-156`); a claim kills the job within the kill
  grace (`claude-cli.ts:173`) and frees the lease. Three failures park a job until new messages
  arrive.
* **Which conversations a memory job may take.** Only one whose last finished answer is later than
  `workspace_profile.memory_since`, that is not archived, and that is not opted out. `memory_since`
  is null until a runner first asks for `memory` jobs; that call stamps it with the time and it is
  never moved after. So switching memory on summarises nothing that was said before the switch.
  That matters because the Workspace has barely been used by him: 37 of 40 requests on 2026-10-08
  were test scripts (map R4), and without this rule the first quiet quarter of an hour after 24b
  would have turned test traffic into his memory. A `rolling` job is not held to this rule: a rolling
  summary is context for its own conversation and is never searched.
* **Test traffic stays out.** Memory is searched on every question, with or without a course scope,
  so one remembered test conversation would come back in his answers. Each step of the acceptance
  pack archives the conversation it opened, through the page, in the step that last uses it, as pack
  21's step 15 archives its own (`acceptance/21/manifest.json:271`). The one exception is the
  conversation whose remembered item 24b's step reads and deletes; that step archives it after the
  delete. The PM's walk does the same.
* **Off until 24b.** His answer puts the list and the delete control with the summaries. Those are
  24b's. So in 24a the runner asks for `rolling` jobs only, unless `WORKSPACE_MEMORY_JOBS=on`, and the
  compose default is `off`. 24b turns it on. The whole path is built and tested in 24a.
* **Delete.** `workspace_document_delete` removes the item from retrieval in the same transaction and
  sets `memory_opt_out`, so that conversation is not summarised again.
* **In a prompt** a remembered item is fenced, labelled `[R<id>]`, dated, and marked as written by
  the assistant and as data.

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
  `uploads_deleting` (rows left in state `deleting`, each a file whose removal did not finish),
  `memory_waiting` and `ingest_polled_age_seconds`. It reads no storage table: the first draft's
  `orphan_objects` counted objects in the bucket and hung on a probe; a row in `deleting` says the
  same thing and holds the key to retry with. The line on the page is 24b's.
* **Its limits.** All of it runs only while the laptop is awake with Docker running. Course files are
  indexed when a sync runs, not on a timer.

### Privacy rules for a public repository

* Logs of the runner, the ingest worker and the batch entry carry counts, ids, states and timings
  only (W-11).
* **No stderr text is logged.** Today the runner keeps the last 2,000 characters of the CLI's stderr,
  takes the first line that is not empty, replaces exact copies of the token and of the whole prompt,
  and logs 200 characters of what is left (`claude-cli.ts:177, 179, 241-243, 357-364, 450`). After
  24a the prompt argument holds course passages, attachment text and posted scores, and the system
  prompt holds the About me note. A prompt of up to 128,000 bytes never fits whole in 2,000
  characters, so a partial echo would pass straight into the log. The new line holds the exit code,
  the stderr's length, and a class: one of a short fixed list of known CLI messages (budget,
  sign-in, usage limit, and whatever P-1 to P-5 show), matched by pattern, or `other`. The matched
  text is never printed. `stderrForLog` goes, and the test that expects free CLI text in the log
  changes with it (`workspace/test/runner/result-grace.suite.ts:165`).
* The same rule holds for the three other places a child's words could reach a log: the batch
  child's stderr, a planning output that was rejected (its length and the reason's class, never its
  text), and the extractor's stderr in the ingest worker.
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
| The runner's login | five functions, no table grant (`142:412-420`) | eleven functions, no table grant. Through three of them, for a request or a job it holds, it reads: the conversation's messages; the course list and each attached file's name (`courses`, `bb_files`); and the feed's fixed columns of assignments, readings, both progress tables (status only) and posted scores. The whole list is under The planner and grades feed |
| Planner state, grades, facts | out of reach of the runner (`142:8-9`) | read through `workspace_planner_feed`, fixed columns, with the window and the course filter enforced inside the function; the course list and attached files' names through `workspace_turn_context`. No write path. A summary may not carry a due date, a status or a score into memory |
| Who searches | the model, when it chooses | the runner, every question. The model may add 3 searches |
| The prompt | the question and a replay under bare `[role]` lines (`replay.ts:28`) | plus passages, attachments, the feed and memory, each inside a block whose lines carry a marker drawn for that turn, with every line of data checked so it cannot write a block line or open with a label |
| Sessions | CLI transcripts on a volume, kept 30 days (`settings.json:2`, `compose.yaml:217`) | none kept |
| A new service | none | `workspace-ingest`: a worker and a file parser with no model, no token, no service key, its own network, no volume, a memory limit and a process limit. The parser runs as its own user with no secret and no network (P-10). What a hostile file could still do is written out under Uploads and extraction and put to Stack (109a, item 20) |
| A new role | none | `workspace_ingest_runner`: four functions, no table grant, one document held at a time. Its password is Stack's to set, never in a file or a chat (task 48) |
| A link at rest | none | one signed URL per waiting upload, up to 7 days, readable by the owner and the ingest role, held to this bucket and this row's key by a CHECK, checked again by the worker, cleared at finish whether the row ends `indexed` or `failed` |
| Storage | bucket `bb-files` | plus the private bucket `workspace-uploads`, owner policies |
| The browser | `workspace_ask`, `workspace_cancel` | plus four SECURITY DEFINER functions, each refusing anyone but the owner as its first statement; select on the new tables; three direct column updates (an upload's title and course, the About me note). No other direct write passes |
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
* **W-77, runner:** everything under `workspace/` except the PM's two paths,
  `workspace/test/fixtures/contract24/` and `workspace/test/probe24-fixtures.test.ts`. New:
  `src/depth.ts`, `plan.ts`, `retrieve.ts`, `context/assemble.ts`, `context/budget.ts`,
  `context/fence.ts`, `turn-context.ts`, `sources.ts`, `jobs.ts`, `lines.ts`, `prompts/plan.md`,
  `prompts/summary.md`, `prompts/rolling.md`, `prompts/format-rich.md`, `prompts/format-plain.md`,
  their tests. Changed: `src/turn.ts`, `runner.ts`, `db.ts`, `config.ts`, `mcp-config.ts`,
  `hooks/gate-rules.ts`, `providers/claude-cli.ts`, `providers/types.ts`, `stream-json.ts`,
  `prompts/system.md`, `claude/settings.json`, `README.md`, the existing tests. Retired:
  `src/replay.ts`. `package.json` gains no dependency. In `hooks/gate-rules.ts` the allowed list and
  the collection rule change; `runGate`, `GateDecision` and `GateOutcome` do not (Seams, the apply
  image).
* **W-78, search and embed:** everything under `mcp-server/` (new `src/batch.ts`, `src/limits.ts`;
  changed `src/tools/search-materials.ts`, `src/tools/get-material-text.ts`, `src/config.ts`,
  `src/client.ts`, `README.md`, tests; `src/server.ts` unchanged); `supabase/functions/_shared/`,
  `supabase/functions/workspace-search/`, `supabase/functions/workspace-embed/`.
* **W-79, ingest, sync and containers:** new `workspace-ingest/` (the worker, the parser's loop and
  their tests); new `docker/workspace-ingest/` (Dockerfile with the two users, ignore file,
  entrypoint, fork script, generated firewall with the owner rule, image test); `docker/workspace/`
  (the Dockerfile loses the `rag` stage and `mcp-rag.sh`, the firewall loses one secret name, its
  tests); four files under `docker/apply/`: `fork-firewall.mjs` (its text for the database secrets
  must follow the Workspace script, `fork-firewall.mjs:40-44`), `init-firewall.sh` (generated),
  `image.test.mjs` where a literal moves, and NEW `gate-built.test.mjs`; `docker/grep-clean.test.mjs`;
  `compose.yaml` (the `workspace` block, the new service, and the top-level volume, network and
  secret entries; never the `sync` or `apply` blocks); `sync/src/files.ts`, `sync/src/report.ts`,
  `sync/src/loop.ts` and their tests.
* **W-85, umbrella (bb2dash-stack, branch `feat/workspace-24` there):** `compose.yaml` (declares
  `workspace_ingest_db_url`); NEW `secrets.example/workspace_ingest_db_url`, an empty file, because
  two doctor tests hold that folder equal to the frozen names (`doctor/doctor.test.mjs:349-358`,
  `doctor/workspace.test.mjs:200-208`); `doctor/lib/constants.mjs` (the names become fourteen;
  `harness_database_url` stays, the umbrella's own services still mount it),
  `doctor/doctor.mjs`, the doctor tests; `README.md`; `.env.example`;
  `scripts/lib/accept-actions.mjs` and its test.
* **PM:** `workspace/test/fixtures/contract24/` (the frozen shapes and the scrubbed probe recordings)
  and `workspace/test/probe24-fixtures.test.ts`; `acceptance/24/`,
  `acceptance/manifest.schema.json`, `web/e2e/accept24.spec.ts`,
  `web/src/lib/supabase/database.types.ts`, root `CLAUDE.md`, `project-state/`, 109c, every prod
  apply and edge function deploy. Outside every repo, and a name not a secret: the new secret's name
  in the allow-list of `set-secret.ps1` in `SECRETS_DIR` (DECISIONS 2026-10-05; that file was not
  opened for this brief, because nothing under a secrets folder is).
* **Nobody:** `db/migrations/001` to `186`; every file under `web/src/app/(app)/workspace/` and
  `web/src/components/workspace/`; every `.module.css`; `web/test/Workspace.layout.test.tsx`;
  `web/e2e/workspace-layout.spec.ts`; every other file under `web/src/`; `apply/src/` and
  `apply/test/` (the follow-ups' W-81 owns the tests, brief 110); `ingest/`;
  `supabase/functions/search/`, `embed-corpus/`, `calendar-push/`; `desktop/`; `acceptance/21/`,
  `web/e2e/accept21.spec.ts`, `web/e2e/accept.lib.ts` and the `walk21*` files; the harness
  repository; the `bb-profile` volume.

**Seam inside the phase: what is frozen at task 12.** Nobody answers a worker mid-run, so two workers
who meet at a call must find its shape already fixed, or each takes its own default.

* **Paths:** `/app/workspace/`, `/app/mcp-materials/dist/index.js`,
  `/app/mcp-materials/dist/batch.js`, `/run/workspace/mcp-<request id>.json`,
  `/run/workspace/mcp-none.json`. `workspace/test/mcp-config.test.ts` pins them, as it does today.
* **Environment names:** `BB2DASH_MAX_SEARCHES`, `BB2DASH_MAX_READS`, `BB2DASH_COURSES`,
  `WORKSPACE_MEMORY_JOBS`.
* **Nineteen JSON files** in `workspace/test/fixtures/contract24/`, one sample each, with the SQL
  signature of every function among them in that folder's `README.md`:

| met by | file | the shape |
|---|---|---|
| W-77 alone | `plan.json` | the planning turn's output |
| W-77, W-78 | `batch-request.json`, `batch-answer.json` | the batch child's stdin and stdout |
| W-76, W-77 | `claim-v2.json` | what `workspace_claim_v2` returns. Today's claim returns seven columns (`143:199-201`) |
| W-76, W-77 | `turn-context.json` | `workspace_turn_context`'s jsonb |
| W-76, W-77 | `turn-put.json` | the two jsonb arguments of `workspace_turn_put`, facts and sources |
| W-76, W-77 | `planner-feed.json` | `workspace_planner_feed`'s jsonb |
| W-76, W-77 | `job-claim.json`, `job-finish.json` | what `workspace_job_claim` returns and what `workspace_job_finish` takes |
| W-76, W-78 | `search-row.json` | one row of `workspace_search` |
| W-76, W-78 | `attachment-read.json` | what `workspace_attachment_read` returns |
| W-76, W-79 | `ingest-claim.json`, `ingest-put-text.json`, `ingest-finish.json`, `ingest-heartbeat.json` | the four ingest functions, arguments and returns |
| W-78, W-79 | `embed.json` | the body and the answer of `workspace-embed`: `runEmbedLoop`'s protocol plus `document_id` |
| W-77, W-78 | `search-function.json` | the body and the answer of `workspace-search` |
| W-76, 24b | `ask-options.json` | the jsonb `workspace_ask_with` takes |
| W-77, 24b | `sources-event.json` | the Realtime event `sources` |

* **Three text files** beside them: `feed-block.txt` (the feed as the prompt holds it), `fence.txt`
  (the two block lines) and `lines.txt` (the fixed sentences of `lines.ts`).

## MVP (in plain words)

After 24a the Workspace page looks the same and answers better. Every question is searched for him
across his course files before the answer is written, so an answer no longer depends on the model
deciding to look. A follow-up knows the conversation because the conversation is read from the
database each time; a restart or a new container loses nothing. It can see what is due, what he marked
done and the scores Blackboard has posted, and it cannot change any of them. It no longer reads the
notes store. When no passage of his files matches, it says so first and then answers from general
knowledge; it does not say that when his planner or the conversation is what answers him.

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
      exits 0; `node --test docker/apply/gate-built.test.mjs` passes on the gate as built: exit 2 for
      an unknown tool, exit 0 for a listed materials tool, exit 2 for input that is not JSON. The
      typecheck catches a changed signature of the runner's gate module; this catches a changed
      behaviour.
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
      docker/apply/image.test.mjs docker/apply/gate-built.test.mjs
      docker/workspace-ingest/image.test.mjs` passes.
- [ ] Supabase advisors: no new security finding on the new objects. If the advisor lists the four
      browser functions as SECURITY DEFINER and open to `authenticated`, that line is recorded in
      109c with the reason given under The stores, and is not counted as a new finding.
- [ ] `/code-review main high` and `/security-review`: CRITICAL and HIGH addressed, recorded in 109c.
- [ ] `desktop/` untouched: `git diff --stat origin/main...HEAD -- desktop` prints nothing.

**Contract**

- [ ] Each of the 21 checks under "What functions properly means" has a named test or proof, green.
- [ ] `git diff --name-only origin/main...HEAD -- "web/src/app/(app)/workspace"
      web/src/components/workspace "*.module.css" web/test/Workspace.layout.test.tsx
      web/e2e/workspace-layout.spec.ts` prints nothing.
- [ ] `grep -c harness_database_url compose.yaml` gives 0.
- [ ] Every probe has one pass or fail line in 109c, written at the place the task list gives that
      probe, and no task was built on a failed one.
- [ ] The probe rows and the probe object are gone from prod: the counts before and after are equal
      and both are in 109c.

**Live**

- [ ] The PM's walk on today's page, in a real browser, with the test runner the only runner on the
      queue (see Seams): a course question, a follow-up, a planner question, a question nothing
      matches, a Stop. Each walk conversation is archived at its end.
- [ ] Stack has set the ingest role's password and its secret file (task 48).
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

**Order.** The first draft put probes 1 to 11 before the freeze and gave them to workers whose
branches are cut at the freeze. Six of them needed things built, applied or deployed later. The
order now:

1. **Before the freeze, the PM's, on today's image:** probes 1 to 6 and 10. Nothing they need is
   built later. Their scripts live in the session's scratch folder and are never committed. What is
   committed is each probe's scrubbed recording, under `workspace/test/fixtures/contract24/probes/`,
   and `workspace/test/probe24-fixtures.test.ts`, both the PM's.
2. **Task 12, the freeze.** Worker branches are cut.
3. **The streams, side by side:** 13 to 20 (W-76), 23 to 26 (W-78), 28 to 35 (W-77), 36 to 39 (W-79),
   40 (W-85).
4. **Gates inside the build:** probes 7, 8, 9 and 11. Each runs right after the task it needs, and
   the task named in its row waits for its line in 109c.
5. 21, 22, 27 and 48 as their inputs land. Then 41 to 47.

**Probe rows on prod.** P-7, P-8 and P-9 need one synthetic object in the new bucket and one
synthetic upload document with one unit. The PM writes them on Stack's word, in one sitting, and
removes them in the same sitting: the object through the app's own session in the PM's browser, the
rows by SQL. Before and after, one count each of `workspace_documents`, `workspace_document_text`,
`workspace_text_embeddings` and the bucket's objects; the two sets of counts are equal. 109c holds
the ids, the counts and the kinds, and no text. A search over course materials returns real text, so
P-9 prints counts and kinds only.

| # | task | owner | deterministic check |
|---|---|---|---|
| 1 | P-1: a turn with no MCP server (`mcp-none.json`). Before the freeze | PM | `cd workspace && npx vitest run test/probe24-fixtures.test.ts`: the scrubbed recording's init line holds 0 servers and 0 tools named `mcp__*`, and its result is `success` |
| 2 | P-2: no session is stored. The image's `claude --help` lists `--no-session-persistence`; with the config folder on tmpfs one turn starts and leaves no file under `/home/node/.claude/projects`. Before the freeze | PM | the help line count is at least 1 and the file count after the turn is 0, both written in 109c. A fail keeps the volume and sets `cleanupPeriodDays` to 1 |
| 3 | P-3: ten fresh turns at cap 1.00, each with a hand-built prompt of the budget's full size. Before the freeze | PM | 10 result lines `success`, 0 `error_max_budget_usd`; each `total_cost_usd` is under 1.00 and is not a running total; turn 10 states a fact given only in turn 1 |
| 4 | P-4: the planning turn on 20 synthetic questions, with the PM's draft of `plan.md`, which W-77 starts from. Before the freeze | PM | at least 19 valid plans, median under 8 s, every cost under 0.05. A fail tries `--json-schema`, then the PM rules before the freeze |
| 5 | P-5: a prompt argument of 128,000 bytes. Before the freeze | PM | the CLI starts and a result line is read |
| 6 | P-6: the pinned CLI hands a per-request MCP config's `env` to the server it starts, and an error result from a tool does not fail the turn. Run with a throwaway server of some twenty lines from the scratch folder: it returns one value read from its environment and answers its fourth call with an error result. Before the freeze | PM | the first tool result holds the value; the fourth is an error result; the turn's result is `success`. A fail: the PM rules before the freeze (the first cut in Risks, the answering turn loses its own tools). Task 26's test and the walk confirm it on the real server |
| 7 | P-7: a signed URL of the bucket downloads through the ingest firewall with no redirect to another host. **Runs after task 37 and after 191 is on prod; task 43 waits on it** | PM + W-79 | one download of the probe object returns 200 with every hop on the project host. A fail: the PM rules before task 43 |
| 8 | P-8: a second edge function opens a `gte-small` session at 3 parts a call. **Runs inside task 27, after `workspace-embed` is deployed and 190 is on prod; task 43 waits on it** | PM + W-78 | one call with the probe document's id embeds 3 parts of its unit and returns 200 |
| 9 | P-9: the service key forwarded by `workspace-search` reaches the database as `service_role`; an anon bearer is refused. **Runs inside task 27, after P-8 and after 192 is on prod; task 43 waits on it** | PM + W-78 | with the key: at least one row of kind `upload`, and a count for each kind; nothing but counts and kinds is printed or kept. With the anon JWT: an error and zero rows. The three kinds together are task 15's unit, on synthetic rows in a rolled-back transaction |
| 10 | P-10: the parser's own user. In a throwaway compose project with a dummy secret file and today's image: (a) a secret mounted with mode 0400 for the worker's user cannot be read by a second user; (b) a firewall rule with an owner match loads and drops that user's packets; (c) the root entrypoint starts one process as each user and both stay up. Before the freeze. (The first draft's P-10 counted the bucket's objects; `uploads_deleting` made it unnecessary) | PM | three pass or fail lines in 109c. A fail of any: the parser moves to the service `workspace-extract` (Uploads and extraction) and the PM rules that before the freeze |
| 11 | P-11: a 20 MB synthetic file of each parsed type extracts inside 300 s and inside the memory limit, in the ingest image. **Runs after task 37; task 43 waits on it** | PM + W-79 | four times and four peak memory figures in 109c, each under 300 s and under 1 GiB. A fail: the PM moves the limit or the size, and says which, before task 43 |
| 12 | Freeze: the brief; the nineteen JSON files and three text files of Seam inside the phase; the routine wording; worker branches cut | PM | `ls workspace/test/fixtures/contract24/*.json \| wc -l` gives 19 and `node -e` parses each; `git worktree list \| grep -c "feat/workspace-24"` gives 5 in bb2dash |
| 13 | Migration 190 and its unit | W-76 | Runner on `phase24_190_store.sql`: as the owner each of the three functions succeeds; as another signed-in uid each raises 42501 and writes nothing; as `authenticated` a direct insert into `workspace_documents` and a direct update of its `signed_url` or of its `state` each raise 42501; a signed URL on another host, under another bucket or ending in another key raises 23514; the first delete call leaves the row in `deleting` with 0 units and 0 vectors and returns the key, a second such call returns the same key, and the call with `true` drops the row and is refused for a row not in `deleting`; a second memory row for one conversation raises 23505; anon and PUBLIC hold nothing |
| 14 | Migration 191 and its unit | W-76 | Runner on `phase24_191_bucket.sql`: the bucket row is private, 20971520 bytes, six types; four policies, all owner-scoped |
| 15 | Migration 192 and its unit | W-76 | Runner on `phase24_192_search.sql`: three kinds from synthetic rows; 0 rows for a document in `deleting` or `failed`; a scope leaves out another course's unit and keeps an untagged upload; 42501 as anon and as `authenticated`; no passage over 2,000 characters |
| 16 | Migration 193 and its unit; the `phase15_100` line | W-76 | Runner on `phase24_193_ingest_role.sql`: the role executes exactly its four functions and holds no table grant; a second claim by a runner that holds a document returns nothing; `put_text` and `finish` raise 22023 for a document the caller does not hold; `finish` refuses `indexed` while a unit has no `embedded_at` and clears `signed_url` on `failed` as on `indexed`. And in `db/migrations/193_workspace_ingest_role.sql`: `grep -ciE "password +'"` gives 0 and `grep -c "CARRIES NO PASSWORD"` gives 1 |
| 17 | Migration 194 and its unit | W-76 | Runner on `phase24_194_ask_options.sql`: as the owner, options and five attachments are stored; a sixth raises 23514; an unknown routine 23503; `explain-file` with no file 23514; as another signed-in uid `workspace_ask_with` raises 42501 and writes nothing; as `authenticated` a direct insert into `workspace_request_options` or `workspace_request_attachments` raises 42501; every policy on the three tables names `app_owner()`; `workspace_ask(uuid, text)` returns three ids; Runner on `phase21_140_workspace_tables.sql` PASS, unedited |
| 18 | Migration 195 and its unit | W-76 | Runner on `phase24_195_turn_state.sql`: an About me of 2,001 characters raises 23514; `memory_since` is null and an update of it as `authenticated` raises 42501; anon holds nothing; no column of `workspace_sources` or `workspace_turns` is named text, passage, content or snippet |
| 19 | Migration 196 and its unit; the two "five" lists become the eleven | W-76 | Runner on `phase24_196_runner_v2.sql`: the role's list is the eleven; the feed, the context and the put each raise 22023 for a request not claimed by the caller; the context's jsonb and the feed's jsonb each hold exactly the keys of `turn-context.json` and `planner-feed.json`; a window of 400 days is clamped to 180 inside the feed; a request with a scope gets no row of another course; a gradebook column with no score posted is absent; a 41st source row is cut, not refused; a source row with an id that does not exist is dropped; `claim_v2` returns nothing while a request is claimed and closes the caller's own stale claim; the first job claim that asks for `memory` stamps `memory_since` and a later one does not move it; no memory job is handed out for a conversation whose last answer is older than the stamp, or that is archived, or opted out; as `workspace_runner` a select on `assignment_progress` raises 42501 |
| 20 | Migration 197 and its unit | W-76 | Runner on `phase24_197_index_status.sql`: exactly one row; `course_units_waiting` equals the units with no part; `uploads_deleting` counts a row in `deleting`; the view's definition names no table of the `storage` schema |
| 21 | Prod applies, each on Stack's word after a `begin; ... rollback;` dry run, under the file's name, byte-identical, advisors read after: 190 to 192, 194, 195, 197 as they pass; 193 and 196 on one day | PM | `select name from supabase_migrations.schema_migrations where name ~ '^19[0-7]_'` lists eight names; each file's md5 equals the stored one, in 109c |
| 22 | The port PR to `main` the day 193 and 196 are applied: three name lists, test-only | PM + W-76; Stack's merge word | on `main` after the merge, Runner on `phase21_142_workspace_runner.sql`, `phase21_143_review_round.sql` and `phase15_100_db_test_runner_role.sql` each PASS |
| 23 | `_shared/chunk.ts` and `workspace-embed` | W-78 | `node --test supabase/functions/_shared/chunk_test.ts`: `findCut` and `chunk` equal `embed-corpus/index.ts`'s text; an astral character does not shift a part range; the function's unit picker, a pure function under `_shared/`, refuses a body with no `document_id` and returns no unit of another document, or of one in `failed` or `deleting`; the answer's keys equal `embed.json`'s |
| 24 | `workspace-search` | W-78 | its test: the query is cut to 2,000 characters; the caller's bearer is forwarded and no service key is read from the environment |
| 25 | The batch entry, `mcp-server/src/batch.ts` | W-78 | `cd mcp-server && npx vitest run test/batch.test.ts`: the answer matches the PM's fixture; a hit whose passage holds a line shaped like a label or an id field adds no hit; a refused query is `refused`, not an exit; nothing is printed but the one JSON object |
| 26 | Limits and scope in the materials server | W-78 | `npx vitest run test/limits.test.ts`: with no environment value nothing changes; a fourth search is an error result; with a scope a search for another course, or for none, is an error result; the smoke lists three names |
| 27 | Edge function deploys, on Stack's word, `verify_jwt` on, after 190 and 192 are on prod. P-8 and P-9 run here, with the probe rows | PM | `list_edge_functions` names both with `verify_jwt` true; P-8 and P-9 each have a pass line in 109c; the probe rows are gone and the counts before and after are equal |
| 28 | `depth.ts` | W-77 | `cd workspace && npx vitest run test/depth.test.ts`: a short Auto follow-up after a Deep answer routes on the last auto tier; `router-cases` is unedited and green |
| 29 | Budget, assembly and the fence | W-77 | `npx vitest run test/assemble.test.ts test/fence.test.ts`: a property test holds the prompt under 131,072 bytes at every maximum; **the fence:** a passage that holds a copied closing line, a copied planner block and a copied label leaves exactly one feed block and the same number of blocks, and a title of 300 characters over two lines becomes one line of 120; **the floor:** at a spare of 48,000 a follow-up after a 30,000-byte answer holds that answer's first and last 3,600 bytes and the line that marks the cut; **the feed:** 47 work rows and 32 score rows of synthetic text leave no row out and match `feed-block.txt`; a cut course file's block lists the ids left out; a passage with the `[notes]` marker carries the warning; a remembered item carries its date; a stopped turn is shown as stopped; the prompt never opens with `/`; format `plain` holds no bracket label |
| 30 | `plan.ts` and `prompts/plan.md` | W-77 | `npx vitest run test/plan.test.ts`: 12 fixture outputs each give the expected plan or the fallback; a seventh query is dropped; a course outside the scope is dropped; the input holds no passage and no attachment text; a rejected output logs its length and a reason's class and none of its text |
| 31 | `retrieve.ts` | W-77 | `npx vitest run test/retrieve.test.ts`: a child that exits 1 gives `failed` and the turn goes on; a child that writes 100 characters to stderr leaves a log line with the length and none of the characters; the search text is at most 2,000 characters; three failures skip the search for 5 minutes on a fake clock; 15 hits give 14 passages |
| 32 | Argv per turn kind, gate, init check, MCP config, the stderr line | W-77 | `npx vitest run test/claude-argv.test.ts test/tool-gate.test.ts test/mcp-config.test.ts test/stream-json.test.ts test/runner.test.ts`: no argv holds `--resume`; the planning argv holds no `--allowedTools`; `mcp__rag__` appears nowhere in `src/`; a stderr line that holds 100 characters of the prompt gives a log line without them, a known budget message logs its class, and anything else logs `other`; `runGate(stdinText, rule)` still exits 2 for an unknown tool and for text that is not JSON. Then, in this task and not only in 38: `cd apply && npm run typecheck && npx vitest run` exits 0 |
| 33 | `turn.ts` in stages, the new calls in `db.ts`, sources, the fixed lines | W-77 | `npx vitest run test/turn.test.ts test/sources.test.ts`: a Stop during the planning turn stores `cancelled` and spawns no answering process; an opened unit becomes an origin `tool` row from the call's input; **three cases of nothing matched:** a planner question with no passage stores `empty` and its first line is the sentence, which names course files and uploads and not the planner; a question with an attached file that was read and no passage stores `attached_only` and has no such line; a short follow-up is searched with the previous question after it and, when the fake retriever answers that text, stores `found` with no such line. `empty` puts the sentence first on `plain` and not on `rich`; finish carries a null session id |
| 34 | Jobs in `runner.ts`, `jobs.ts`, `prompts/summary.md`, `prompts/rolling.md` | W-77 | `npx vitest run test/jobs.test.ts`: on a fake clock a claim mid-job kills it and frees the lease; with `WORKSPACE_MEMORY_JOBS` unset only `rolling` is asked for; the summary's input holds messages only; both prompts hold the sentence that forbids due dates, statuses and scores; the loop never asks for a claim while a turn is in flight |
| 35 | `system.md`, the two format rules, their test | W-77 | `npx vitest run test/system-prompt.test.ts`: the rules on grades, on `[notes]`, on never inventing a number and on nothing matched are present; the line on a remembered item (dated, the feed is the current figure) is present and the decision-note line is gone; the notes rules are gone; both format rules hold the line on citing by label only a passage in the prompt or a unit opened; `format-rich.md` forbids images and links |
| 36 | The ingest worker and the parser's loop | W-79 | `cd workspace-ingest && npx vitest run`: bad first bytes give `bad_bytes`; a 12-byte plain text file gives one unit of kind `doc`; a text file with a NUL byte gives `bad_bytes`; a docx is written to tmpfs under `.docx` whatever its title; a link on another host, or one that does not end in the row's key, is refused before any request; a redirect is not followed; 1,001 units give `too_many_units`; an expired link gives `link_expired`; three failed tries give `failed`; the embed call carries the document's id; a log line holds ids, states and timings only, and the extractor's stderr is never in one |
| 37 | Its image, its firewall fork, its compose service | W-79 | `node --test docker/workspace-ingest/image.test.mjs`: networks are `ingest-net` only; no volume; the secrets are the two names, mounted for the worker's user with mode 0400; `mem_limit` and `pids_limit` hold the brief's values; the image has the two users and the generated firewall holds the owner rule; none of `bb-profile`, `course-files`, `claude_oauth_token`, `bb2dash_mcp_service_key`, `api.anthropic.com` is named; the generated firewall equals what its fork script produces |
| 38 | The Workspace image and compose block: `rag` out, the tmpfs, one database secret; the apply firewall regenerated; the apply gate tested as built | W-79 | `grep -c harness_database_url compose.yaml` gives 0; `node --test docker/workspace/init-firewall.test.mjs docker/grep-clean.test.mjs docker/apply/image.test.mjs` passes; `node docker/apply/fork-firewall.mjs --check` exits 0; the `workspace` block names no `hostname`; `cd apply && npm run typecheck && npm run build` exits 0; then `node --test docker/apply/gate-built.test.mjs`: `apply/dist/hooks/tool-gate.js` exits 2 for an unknown tool, 0 for a listed materials tool and 2 for input that is not JSON |
| 39 | Sync: the embed loop on every files pass; the report rule | W-79 | `cd sync && npx vitest run test/files.test.ts test/report.test.ts test/loop.test.ts`: with `unitsPosted` 0 the loop runs once; with `unitsPosted` 0 and an embed exit of 1 the pass closes `done`, the report holds the line and the apply request is filed; with `unitsPosted` above 0 an embed error still fails the sync |
| 40 | bb2dash-stack: the secret name, its empty example file, the doctor, the README, two host actions for the acceptance run (start the ingest service; read a proof again until it passes or a limit) | W-85 | in bb2dash-stack: `node --test doctor/doctor.test.mjs doctor/workspace.test.mjs scripts/accept-actions.test.mjs` passes with fourteen names; `ls secrets.example \| grep -c workspace_ingest_db_url` gives 1 and the file is empty; the doctor's Workspace row no longer names `harness_database_url` |
| 41 | Retrieval eval with no model: the 9 cases of `ingest/eval/golden_set.json` through the batch entry, on the host with the key file | PM | prints `in passages: n of 9` and qids only, exits 0 only at 9; the line is in 109c and no output with text is kept |
| 42 | Integrate: worker branches merged, types regenerated, full suites, advisors | PM | the SOP gates of the DoD |
| 43 | Walk windows, on Stack's word, after probes 7, 8, 9 and 11 have their lines and Stack's step of task 48 is done: the live Workspace stopped, the test project the only runner and the only ingest worker, the PM's walk, each walk conversation archived, the live service back | PM | before and after: `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` is unchanged; `select count(*) from workspace_requests where state in ('queued','claimed')` gives 0 at the end; `select count(*) from workspace_conversations where id = any(<the walk's conversation ids>) and not archived` gives 0 |
| 44 | Reviews | PM | both commands run; findings and fixes in 109c |
| 45 | The acceptance pack: `acceptance/24/` (manifest, playbook, proofs) and `web/e2e/accept24.spec.ts`, on today's page. Each step archives the conversation it opened | PM | `node --test acceptance/acceptance.test.mjs` passes; one proof of the pack counts the run's conversations left unarchived and expects 0 |
| 46 | Docs, the PRs (bb2dash, bb2dash-stack). Stop at "ready when you say so" | PM | `gh pr view --json state -q .state` prints `OPEN` in both |
| 47 | After his merge word: the cut-over, one service at a time, each alone, with no question, apply request or sync open (`workspace`, `workspace-ingest`, `apply`, then `sync`), then `just accept 24` | PM | the run's `REPORT.md` reads green |
| 48 | **Stack's own step (MANUAL).** The ingest role's password and its secret file, on the precedent of 2026-10-05 for `workspace_runner`: a snippet on his laptop makes the password, he runs the one `alter role` line in an unsaved SQL editor tab, and the snippet stores the DSN as `workspace_ingest_db_url` in `SECRETS_DIR`. Nothing of it passes through a chat, a repo file or a migration. The PM hands him the snippet, adds the name (not a secret) to the allow-list of `set-secret.ps1` in that folder, and says so at the hand-over. After 193 is on prod, before task 43 | Stack; the PM prepares it | his step is done when `just doctor` in bb2dash-stack shows no missing secret. The login is proved to work later, inside task 43's window: the test ingest worker's first heartbeat row appears (`select count(*) from workspace_ingest_heartbeat` gives 1) |

**The acceptance pack, 24a.** Written with the phase (`acceptance/README.md:64-77`) and extended by
24b. Its steps walk today's page: the page opens; a course question is answered with stored sources
and no model search needed; a lookup takes one turn; a Standard question takes a plan; a planner
question stores a `feed` source and the planner is as it was; a follow-up is answered with a null
session id; a question nothing matches stores `empty`; a Stop reaches the runner and the next answer
is `done`; a synthetic file is uploaded through the page's own session (no control exists before
24b), indexed, found by a question and deleted in its two steps, leaving no row in `deleting`. Host
proofs read ids, states and counts from `workspace_turns`, `workspace_sources` and
`workspace_documents`, never text. Step 1 stays a person's: Usage credits are off.

**The pack leaves nothing in his memory or his list.** Each step archives the conversation it opened,
through the page, in the last step that uses it (Memory, Test traffic stays out), and one host proof
counts the run's conversations left unarchived and expects 0. Pack 21's step 15 is the model
(`acceptance/21/manifest.json:271`). Pack 21 itself stays in the tree untouched: the acceptance suite
uses it as its fixture (Seams).

## Workers

Workers are Opus, commit and push per task, never touch `project-state/`, and hand the PM a
verification section that quotes each task's red run and green run, in its own file beside 109c
(`109_W76_VERIFICATION.md` to `109_W79_VERIFICATION.md`, and `109_W85_VERIFICATION.md`). A worker that
meets an unclear point states its default and takes it. Nobody answers a running worker by message
(ruling W-S). No worker applies a migration or deploys a function: the PM does, on Stack's word. No
worker runs a probe alone: probes 1 to 6 and 10 are the PM's before the branches exist, and probes
7, 8, 9 and 11 are the PM's on a worker's pushed work.

| worker | stream | branch | worktree | owns (disjoint) | tasks |
|---|---|---|---|---|---|
| W-76 | db | `feat/workspace-24-db` | `bb2dash-wt-24-db` | migrations 190 to 197, the `phase24_*` units, three name lists, `DATA_SYNTAX.md`'s Workspace section | 13 to 20, 22 |
| W-77 | runner | `feat/workspace-24-runner` | `bb2dash-wt-24-runner` | `workspace/` except the PM's fixture folder and probe test | 28 to 35 |
| W-78 | search and embed | `feat/workspace-24-search` | `bb2dash-wt-24-search` | `mcp-server/`; the three new function folders | 23 to 26; its pushed work is what probes 8 and 9 run on |
| W-79 | ingest, sync and containers | `feat/workspace-24-ingest` | `bb2dash-wt-24-ingest` | `workspace-ingest/`, `docker/workspace-ingest/`, `docker/workspace/`, the four named `docker/apply/` files, `compose.yaml`, the three sync files and their tests | 36 to 39; its pushed work is what probes 7 and 11 run on |
| W-85 | umbrella | `feat/workspace-24` in bb2dash-stack | its own worktree there | the bb2dash-stack files listed above | 40 |
| PM | integration | `feat/workspace-24` | `bb2dash-wt-24` | the fixtures, the probe recordings and their test, the pack, types, state docs, 109c, applies and deploys | 1 to 12, 21, 27, 41 to 47; with Stack, 48 |

W-77 builds on the frozen fixtures until W-76's functions and W-78's batch entry are on the phase
branch. W-79's image work waits for W-77's task 32 and W-78's task 25 on the phase branch.

## Seams

| with | seam | rule here |
|---|---|---|
| **Phase 22 (styling, building now)** | Its W-70 sweeps `web/src/app/(app)/workspace/` and `web/src/components/workspace/` (brief 103 at 3d02033, lines 803-805 and task 19), adding, renaming or removing no `.module.css` there (lines 554-556) | **Ruling W-1, in full.** 24a leaves today's `/workspace` page working and better: automatic retrieval, sessions from the database and the planner feed all reach it. 24a touches NO file under `web/src/app/(app)/workspace/` or `web/src/components/workspace/`, no CSS module, and neither layout check (`web/test/Workspace.layout.test.tsx`, `web/e2e/workspace-layout.spec.ts`). Its only files under `web/` are the regenerated types file and the new `web/e2e/accept24.spec.ts`. The two phases share no source file, so either may merge first. Both append rows to STATUS and DECISIONS; the second to merge keeps both sets |
| **Phase 23 follow-ups** (brief 110 on `fix/phase23-followups` at d558994, worktree `bb2dash-wt-23f`; workers W-80 to W-84; migrations 187 and 188, 189 held) | **The apply image.** 24a edits `workspace/src` and `mcp-server/src`, which that image copies (`docker/apply/Dockerfile:39, 46-49`), and four files under `docker/apply/`: the fork script, the generated firewall, the image test, and the new test of the gate as built. The follow-ups edit `apply/src`, `apply/test/*` and the skills. **Shared files, by name:** in bb2dash, `acceptance/manifest.schema.json` (each adds actions), `acceptance/pack-check.mjs` and `acceptance/OPERATOR.md` (theirs only where they name the Workspace alone), `DATA_SYNTAX.md` (their Inbox section, this phase's Workspace section), the generated types file; in bb2dash-stack, `doctor/`, `README.md`, `.env.example`, `compose.yaml` and `scripts/lib/accept-actions.mjs`. Worker numbers and migration numbers do not overlap | **The follow-ups merge first.** They are small and they fix a live service. 24a then merges `origin/main`, keeps both sets in each shared file, and re-does: `node docker/apply/fork-firewall.mjs --write` and `--check`; `cd apply && npm run typecheck && npm run build && npx vitest run`; `node --test docker/apply/image.test.mjs docker/apply/gate-built.test.mjs`; the apply image build; the types file. **Who owns the files under `docker/apply/`:** this phase's W-79, all four, and nobody in the follow-ups. So brief 110's sentence "Neither phase edits a file under `docker/apply/`" is wrong, and the PM corrects it in brief 110 on its own branch before either phase's workers are cut. **Who regenerates the apply firewall second:** whoever merges second. If that is 24a, the list above. If 24a merges first, the follow-ups branch merges `main` and runs `--write`, then `git diff --exit-code docker/apply` (its own DoD line), which must print nothing. No migration is renumbered. Either way apply is rebuilt alone at the second cut-over, with no apply request open |
| **The apply image** | `apply/src` imports seven `workspace/src` modules and bundles them with packages left external (`apply/package.json:12`). The seventh, `hooks/gate-rules`, is a file W-77 rewrites, and it is the gate of the one Claude process that can write | The import closure of the seven gains no package. The names apply imports keep their signatures: from `config`, `CLAUDE_BIN`, `CLAUDE_CODE_VERSION`, `ConfigError`, `assertSubscriptionEnv`, `cleanSecret`, `readDbCa`, `readOauthToken`, `readTextOrNull`, `Env`, `ReadFile`; from `errors`, `mapTurnEnd`; from `providers/claude-cli`, `CliExit`, `CliProcess`, `SpawnOptions`, `childEnv`, `spawnClaude`; from `stream-json`, `parseLine`, `readInit`; from `db`, `dsnParts`, `createPgQuery`, `newPgClient`, `redactDsn`, `QueryFn`, `PgClientLike`; from `alive`, `touchAlive`, `isAliveFresh`; from `hooks/gate-rules`, `runGate(stdinText, rule)`, `GateDecision` and `GateOutcome` (an exit code and a line for stderr). `runGate` also keeps its behaviour: exit 2 with a reason for a denial, exit 2 for input it cannot read, exit 0 and nothing printed for an allowed call. A changed signature fails apply's typecheck. A changed behaviour would not, and a broken import makes the apply gate deny every call (`apply/src/hooks/tool-gate.ts:40-41`), which stops the Inbox auto-apply. So the gate is tested as built (`docker/apply/gate-built.test.mjs`, tasks 32 and 38, the DoD). The ingest worker imports `config`, `db` and `alive` the same way, so those three now have two consumers. The DoD builds apply, not only its tests |
| **The acceptance packs** | Pack 21's proofs want the model's own tool call, one of them the notes tool (`acceptance/21/manifest.json:82, 103-104, 124`). The acceptance suite uses pack 21 as its fixture (`acceptance/acceptance.test.mjs:38, 222, 364-667`), `pack-check.mjs:96-99` reads the questions from `web/e2e/walk21.lib.ts`, `web/e2e/accept.lib.ts:73-74` imports `walk21.lib` and `walk21.window`, and `scripts/accept-proofs.test.mjs:631` reads `acceptance/21/proofs.json` | After 24a's cut-over `just accept 21` is not expected green and is not run again. Phase 21 stays accepted (DECISIONS 2026-10-08). Pack 24 is the Workspace's acceptance from then on. 24a edits none of `acceptance/21/`, `accept21.spec.ts`, `accept.lib.ts` and the `walk21*` files. **Pack 21 is never removed:** 24b stops running it and keeps its files in place, because removing them would fail the acceptance suite and stop the shared library from compiling (brief 111, task 14) |
| **The live Workspace** | `bb2dash-workspace-1` answers from the one queue, and any runner may take any queued question | **One runner on the queue at a time during tests, and one ingest worker.** The test project `bb2dash-wt24` runs only inside a walk window, with the live service stopped, on Stack's word, the service named in every command. `workspace_claim_v2` does not lift this rule. Migrations 190 to 197 are additive, so the live runner keeps working after each apply |
| **Phase 21 (frozen)** | migrations 140 to 143, `workspace_ask(uuid, text)`, the ten data attributes its tests read, the router's cases | none edited. New tables, new functions, new files. `workspace_claim(text)` keeps its grant, so the old image works until the cut-over |
| **The `sync` container** | it holds the Blackboard login; three of its source files change | no model enters the sync. Its image is rebuilt once, at the cut-over, alone, with no sync open. The `bb-profile` volume is never touched |
| **bb2dash-stack** | it declares the secret names, its doctor pins them and the folder `secrets.example/` against them, and it holds the acceptance run's host actions. The follow-ups' W-83 edits the same doctor, README, `.env.example`, `compose.yaml` and action list | a companion PR, opened with 24a's and merged after it, as Phases 21 and 23 did. PM default, Stack's to object. The follow-ups' PR there merges first; W-85 then merges that `main` and keeps both sets of actions and both doctor rows |
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
* A second search tool for the answering model over uploads and memory, and a tool that reads further
  into an upload than the prompt held. A cut upload is named as read in part.
* A name-checking proxy in front of port 443, a closed DNS and a revoked `pg_net` for the ingest
  container. Phase 21's three open ways out apply to it as written (Uploads and extraction; 109a,
  item 20).
* A planning turn on Quick or on Auto's low tier (109a, item 19).
* Removing pack 21 from the tree, here or in 24b.
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
* **Size.** Eight migrations, five workers, one new service with two users in it. The cut order if it
  runs long: first the answering turn's own tools (then the server's limits and P-6 fall away); then
  xlsx and pptx uploads; then the list of ids at the end of a cut course file. Never cut: sessions
  from the database, the two turns, the feed, sources, the notes store's removal, the ingest
  service's isolation, the sync rule, the fence, the owner check of the browser functions, the rule
  that no stderr text is logged.
* **Probes that are gates.** Probes 7, 8, 9 and 11 run inside the build, so a fail lands after work
  was done. Each names the task that waits on it and the PM rules on a fail before that task. The
  seven that can run early do.
* **The ingest container reads bytes nobody vetted.** The parser has its own user with no secret and
  no network, if P-10 passes. A file that got past that to the worker's user could read his private
  uploads and send them out by the three ways Phase 21 left open. Written out under Uploads and
  extraction and put to Stack (109a, item 20). Not fixed here: a name-checking proxy.
* **Test traffic in his memory.** Held by the switch-on time, by skipping archived conversations and
  by the pack archiving its own. A test conversation left unarchived after 24b would be summarised;
  the pack's own proof counts those.
* **A summary may still carry a date or a score.** The two prompts forbid it and a remembered item is
  dated in the prompt. A prompt rule lowers the chance and does not remove it.
* **Worker numbers.** Two briefs took W-80 the same afternoon. This brief moved to W-85 and 111 to
  W-86 to W-88; the PM confirms the one numbering across 109, 110 and 111 before a branch is cut.
* **A unit on `main` fails against prod between an apply and the port PR.** 193 and 196 are applied
  on one day with the port PR ready, and that PR merges on his word the same day.
* **A standing unit that counts storage policies or public tables may move.** Not checked. W-76 reads
  the standing units at the cut and names any that pin such a count.
* **One stuck claim blocks the queue.** With answers held to one at a time, a claim left by another
  runner name blocks every question until the 10-minute sweep. The runner's own stale claim is closed
  at once. The cut-over is done with no question open.
* **The apply image.** It can break while its tests stay green, and its tool gate runs code from a
  file this phase rewrites. The seam rule, the build and the test of the gate as built hold it.
* **A poisoned document.** See Uploads and extraction. The worst its text can do is a wrong answer
  or a wrong remembered item. The fence is specified and tested, and it cannot make a model
  disbelieve a false sentence.
* **A signed URL at rest** for up to 7 days. Owner policy, the CHECK on the row, the worker's own
  check before it downloads, cleared at finish whether the row ends `indexed` or `failed`.
* **A delete that stops half way.** The row stays in `deleting`, is counted, and can be tried again.
  The second step takes the browser's word that the object is gone.
* **An upload link that expires while the laptop sleeps.** The row fails with `link_expired`, is
  counted in the status row, and 24b's Try again signs a new one.
* **Labels on a plain page.** None are written with format `plain`. If a model writes one anyway it
  shows as text on today's page.
* **Phase 21's hardening list is unchanged**: the firewall's address allowlist on port 443, DNS,
  PUBLIC on pg_net (STATUS, deferred hardening).
* **The metering plan is still paused, not gone** (brief 102, Why). Two turns per question use more
  of the plan than one.
* **Not known:** whether P-2's flag exists on 2.1.289 (the host's CLI is newer); whether the CLI
  starts with its config folder on tmpfs; the planning turn's cost; whether this Docker honours a
  mode and an owner on a file secret and loads the firewall's owner match (P-10); whether Supabase's
  advisor lists a definer function open to `authenticated`.
* **Not re-read in the challenge round's edits:** the prod counts it cites (47 of 186 work rows, 66
  and 32 gradebook rows and their byte sizes, 13 of 116 files over 40,000 bytes, 20 of 38 answers at
  tier `low`). They are the reviewers' reads of 2026-10-08. The edits took no database read. The PM
  re-reads them with the facts at the freeze.

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
  runner reads the planner and posted scores through `workspace_planner_feed` (answers 4, 5), and
  the course list and attached files' names through `workspace_turn_context`. Every column is listed
  under The planner and grades feed. Still no tool for the model and no new reader role.
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
* **2026-10-07, the same row, its second sentence:** "The "Used:" line under an answer names each
  tool and its scope, never the stored query and never a tool's result text". Amended in two steps.
  In 24a the line also shows the runner's own steps (`search` with its scope, `planner_feed`), still
  no query and no result text. In 24b the line goes and the sources row replaces it.
* **2026-10-07, Reversal adopted:** "each question is answered by a container service (the runner)
  with one `claude -p` turn of the pinned, unmodified Claude Code CLI". Amended: one or two turns,
  each still one `claude -p` of the pinned CLI on his subscription (answer 2, W-4), and no session is
  resumed (answer 6, W-3).
* **2026-10-07, the same row, two more sentences:** "four read tools over the two stores (the course
  materials, and the `bb2dash` and `bb2dash-inbox-decisions` collections of the notes store) are
  allowed and a gate checks every call". Amended: two read tools over one store, the gate still
  checking every call. And: "Two credentials that could write sit inside the container all the same,
  each read only by its own MCP server". Amended: one, the service key.
* **2026-10-06:** "the argv is frozen: the live recording showed every element behaving as the
  Contract says, and the per-answer cap holds." Amended: 24a changes the argv (The two turns, the
  argv table). It is frozen again once probes P-1 to P-6 have passed on the pinned CLI, and that is
  written as its own DECISIONS row then.
* **2026-09-29, P-92:** "`pull_files.mjs` runs `ingest/embed_corpus.mjs` after a non-dry run that
  posted any unit". Amended for the `sync` container: it runs the embed loop on every files pass
  (answer 15, W-10). `pull_files.mjs` itself, which the Windows fallback skill runs, keeps P-92's
  rule, because `ingest/` is not edited; a unit it leaves is embedded by the container's next pass.
* **2026-09-29, S2-rag-1:** "corpus coverage is a background check the PM runs after each corpus
  change, with no UI this sprint". Amended in one part: `v_workspace_index_status` (24a) and one
  status line on the page (24b). The background check stays the PM's.
* **2026-09-09:** "one PR per phase". Amended for this phase: two PRs, 24a and 24b (answer 11).
* **Root `CLAUDE.md`**, rewritten in 24a's PR: "A container runner answers each question with one
  `claude -p` turn"; "four read tools over the materials and the two bb2dash notes collections pass a
  gate, and the runner's database login cannot reach planner state (`assignment_progress`,
  `reading_progress`) or a fact table"; "through five SECURITY DEFINER functions"; and "the service
  mounts four secrets from `SECRETS_DIR` as files". The new sentence on the login says what it
  reads, not only what it cannot: eleven SECURITY DEFINER functions and no table grant; through
  them, for a request or a job it holds, the conversation, the course list, attached files' names
  and the feed's fixed columns (assignments, readings, the status of both progress tables, posted
  scores); no write outside the Workspace's own tables.
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

## Appendix 2: the challenge round of 2026-10-08, after his answers

Two reviews read this brief, brief 111 and 109a at 10f48f1: one for rules, security and privacy
(RSP-1 to RSP-12) and one for whether it can be built and whether it answers him (B-01 to B-15).
Twenty-seven findings. Each was checked against the documents and the code before anything was
changed. All twenty-seven were right and none was rejected. Four were applied with a change, and the
change is said. Where two findings said the same thing they are placed together.

**Must-fix**

* **RSP-1, B-08.** *apply imports a seventh runner module, its tool gate.* Applied: Facts; Seams, the
  apply image, where the kept names are now complete (the first list also missed
  `assertSubscriptionEnv`, `cleanSecret`, `readDbCa`, `ReadFile` and `PgClientLike`); the gate tested
  as built (`docker/apply/gate-built.test.mjs`, tasks 32 and 38, the DoD).
* **RSP-2, B-04.** *Four browser functions were invoker with no write grant behind them.* Applied:
  SECURITY DEFINER with the owner check first; two CHECKs on `workspace_documents`; the worker's own
  check of the link; and `workspace_search` narrowed to `service_role`, the same mistake in a fifth
  function (The stores; tasks 13, 15, 17; check 19).
* **RSP-3.** *The hidden list cannot cover a 128,000-byte prompt.* Applied: no stderr text is logged,
  for the CLI, the batch child, a rejected plan and the extractor (Privacy rules; tasks 30, 31, 32,
  36; check 20).
* **B-01.** *The feed did not fit its block.* Applied: one line a row, scores only where posted and
  not windowed, 12,000 bytes, the order of the cut (The planner and grades feed; Byte budget; task
  29; check 21).
* **B-02.** *"Found nothing of his" would be false on a planner question, an attached file and a
  follow-up.* Applied: `empty` defined, `attached_only` added, the sentence held to course files and
  uploads (What a failure looks like; task 33; check 10).
* **B-03.** *The named code cannot read plain text or Markdown.* Applied: the six types stay; the
  worker has its own rule for the two text types and names the temp file by the registered type
  (Uploads and extraction, steps 3 to 5; task 36).
* **B-05.** *Six probes could not run where the order put them.* Applied with a change: P-6 was
  restated so that it needs nothing built later and runs before the freeze with the PM's other
  probes; P-7, P-8, P-9 and P-11 are gates after the task each needs; the first draft's P-10 is gone
  and the number now names the parser's user (Task list, Order and Probe rows on prod).
* **B-06.** *The freeze covered five shapes.* Applied: nineteen JSON files and three text files;
  `workspace-embed` takes one document a call (Seam inside the phase; Edge functions; tasks 12, 23).
* **B-07.** *Removing pack 21 fails the acceptance suite.* Applied in brief 111: pack 21 is no longer
  run and stays in the tree (its task 14; Seams here).

**Should-fix**

* **RSP-4, B-09.** *Worker numbers collide with brief 110, and the seam row was stale.* Applied: W-85
  here and W-86 to W-88 in brief 111; the seam row rewritten with the shared files; this phase owns
  four files under `docker/apply/`. Brief 110's own sentence is on another branch and is the PM's to
  correct there.
* **RSP-5.** *A delete could leave a file with nothing holding its key.* Applied: two steps, with the
  row in `deleting` as the retry handle; `uploads_deleting` in place of `orphan_objects`; the signed
  URL cleared on `failed` too (Uploads and extraction; Indexing and status; tasks 13, 16, 20).
* **RSP-6.** *The safety claim for the ingest service was stronger than the code allows.* Applied with
  a change. The blast radius is written out and put to Stack (109a, item 20), the service has a
  memory and a process limit, and a runner holds one document at a time. The parser's second user is
  specified, but the worker cannot start it after its own drop of privileges
  (`docker/workspace/entrypoint.sh:46`), so the entrypoint starts both, and whether Docker keeps the
  secrets from the second user is a probe (P-10) with a named fallback.
* **RSP-7.** *The fence was not specified or tested.* Applied: The fence; task 29; check 18; the
  planning turn's first reason reworded.
* **RSP-8.** *The runner's role reads more than the record said.* Applied: the whole list by
  function; the window and the courses enforced inside the feed, which lost its course argument; the
  exact-keys case (The planner and grades feed; the boundary table; task 19; the DECISIONS row).
* **RSP-9.** *Memory would become the planner's second home.* Applied: the two summary prompts, the
  line in `system.md`, the date on a remembered item (The planner and grades feed; Memory; tasks 34,
  35; the DECISIONS row).
* **RSP-10.** *Test traffic would enter his memory.* Applied with a change. The switch-on time and the
  archived rule are in `workspace_job_claim`. The pack keeps its conversations out by archiving them
  through the page, as pack 21's step 15 does, and not by a host action: the host's database login
  is read-only (DECISIONS 2026-10-08, the acceptance run's review round, point 2). The probe rows
  have an owner and a count before and after.
* **RSP-11, B-12.** *No task set the new role's password or its secret file.* Applied: task 48,
  Stack's own; 193's header; the empty example file in bb2dash-stack. The allow-list of
  `set-secret.ps1` is in `SECRETS_DIR`, not in a repo, so it moved from the umbrella worker's files
  to the PM's step.
* **RSP-12.** *Five amended rows were not quoted.* Applied: Decisions this brief amends, and the
  DECISIONS rows of 2026-10-08, one of them new (the indexing rule).
* **B-10.** *Fixed budgets made a follow-up and a long attachment worse.* Applied: floors and a
  shared spare; the cut of one oversized message; the ids a cut course file leaves out (Byte budget;
  task 29).
* **B-11.** *A hit the model only saw leaves no source row.* Applied: the limit stated at step 12;
  one line in both format rules (How passages are labelled; task 35).
* **B-13.** *On Quick and on Auto's low tier no model plans.* Applied: The two turns; 109a, item 19.
* **B-14.** *A restart does not bring the new value.* Applied in brief 111 (its task 16).
* **B-15.** *The panel's search field and collapse button, and the greeting's name.* Applied in brief
  111 with a change: a filter field and a collapse button are in the contract; the filter pills and
  the name are under Out of scope with their reasons, and the name is also 109a's item 21.
