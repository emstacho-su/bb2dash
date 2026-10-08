# Phase 24 draft brief: the challenger's findings (2026-10-08)

An independent read of `109_PHASE24_workspace_assistant.md` and `109a_PHASE24_open_questions.md` as drafted. Verdict: **needs-changes**. Each finding is applied or struck, with a reason, when the brief is frozen. Nothing here is built yet.

## Findings

### [must-fix] brief-draft.md: Database objects row 190; tasks 5, 6, 7; W-76 file set

**Problem.** Migration 190 breaks a Phase 21 unit that every checkout runs against prod, and nobody owns or ports it. 190 adds five columns and new column grants to workspace_requests. The 140 unit pins that table's exact column list, its defaults, and 'exactly these twelve' column writes. The brief moves only 'the two count lines' and ports 'the day 192 is applied'. Those two pins are also name lists, not counts.

**Evidence.** db/tests/phase21_140_workspace_tables.sql:66-69 (columns), :101 (defaults), :323-338 (twelve writes). db/tests/phase21_142_workspace_runner.sql:152-158 and :655-657. db/tests/phase21_143_review_round.sql:153-159 and :716-718. db/tests/README.md:3 says the units assert the production database.

**Fix.** Leave workspace_requests untouched. Put the options in a new table keyed by request id, with its own owner policy and column grants, so the 140 unit stays green on both sides of the apply. Add the two name lists and the two PASS counts to W-76's set. Say task 7 is a second bb2dash PR and needs its DECISIONS row. If the columns stay, add the three 140 pins to W-76 and move the port to the day 190 lands.

### [must-fix] brief-draft.md: check 11, task 19, content table row 'Blackboard file'; open-questions.md Q10

**Problem.** Running the embed loop on every files pass turns one part that cannot embed into a failed sync every day. An embed error closes the sync as failed. A failed sync never files the Inbox apply request, so Phase 23's automatic apply stops. Today the loop runs only after new units, so the damage ends with that pass.

**Evidence.** sync/src/report.ts:115-122 (an embed error sets state failed). sync/src/loop.ts:93 (apply request only when done). ingest/embed_corpus.mjs:119 (exit 1 when a unit fails). sync/test/report.test.ts:90. sync/test/files.test.ts:226, 305, 336-347 pin 'never on none'.

**Fix.** On a pass that posted no unit, an embed failure is a report line and a log line, never the sync's error. Add sync/src/report.ts and sync/test/report.test.ts to W-78's set. New check: with unitsPosted 0 and embed() exit 1, the pass closes done and the apply request is filed. Say this in Q10.

### [must-fix] open-questions.md Q7; brief-draft.md security table rows 'Prompt content' and 'Browser'; task 27

**Problem.** Rendering Markdown while retrieved text sits in the prompt opens a leak the brief denies. A poisoned document can make the answer carry an image or link whose address holds text from the prompt: the About me note, other passages, notes. A browser fetches an image by itself. The web app sends no Content-Security-Policy. The brief says the only harm is a wrong answer. Q7 also reverses two more rows than it names, one of them Stack's own answer of the day before.

**Evidence.** grep for Content-Security-Policy, img-src and connect-src over web/src and web/next.config.* gives 0 hits. brief-draft.md:277. project-state/DECISIONS.md:438 (answers render as text) and :448 (Stack, 2026-10-07: strip bold markers). web/src/components/workspace/thread.ts:150 withoutBoldMarkers; web/test/Workspace.thread.test.ts:391.

**Fix.** Contract: no image element is ever rendered; a link shows as text and is never fetched; only an app-internal source chip is clickable. Test: an answer holding an image link renders no img and makes no request. Correct the boundary row. Q7 names rows 438 and 448 and says withoutBoldMarkers and its test go.

### [must-fix] brief-draft.md: The question's path, step 7; task 13

**Problem.** The runner's search text can be far longer than either server accepts, so automatic retrieval fails on exactly the long questions. A question may be 8,000 characters. A short follow-up gets the earlier message put in front. Both servers refuse a query over 2,000 characters. The page would then say a store did not answer when nothing is down.

**Evidence.** db/migrations/140_workspace_tables.sql:41-45 (8000). mcp-server/src/tools/schemas.ts:9 and :12-19. agentic-harness mcp-server/src/tools/schemas.ts:19 and :29-33. Step 7 names no cut.

**Fix.** retrieve.ts cuts the search text to 2,000 characters: the question first, then as much of the earlier message as fits. A test reads both limits. A refused call is reported as refused, not as a store that is down.

### [should-fix] brief-draft.md: steps 7, 9, 11, 13; row 191; task 6; check 10

**Problem.** No rule says what the 24 KiB block drops. An unscoped question gives 8 materials passages plus 3 from each of up to 8 collections: 32 passages of up to 1,500 characters, about twice the block. Similarity may not be compared across stores, so the order is undefined, and check 10 rests on it. Also a 41st source row is refused: 32 automatic rows plus one model search of 10 passes 40, and the second put would fail.

**Evidence.** brief-draft.md:182-183, 194-196, 248, 381. db/migrations/143_workspace_review_round.sql:141-144 cuts tool calls and never refuses.

**Fix.** State the order: materials by rank up to a byte share, then notes round-robin by collection. The runner caps at 40 before the put. The function cuts and never raises, as 143 does. Test both.

### [should-fix] brief-draft.md: step 7 Scope, check 3, task 14; open-questions.md Q6

**Problem.** Course scope does not fit the data. There are seven course rows and six class collections. One class has two course rows, lecture and recitation, and search_materials takes one course id. No course-to-collection table is in the brief. 'The one course id the question names' has no rule, and ids are dotted and case-sensitive. The gate check covers another course but not a search that names no course.

**Evidence.** db/migrations/001_schema.sql:49-50 and DATA_SYNTAX.md:31-32 (seven ids, two under GEO.103). mcp-server/src/tools/schemas.ts:20-29 (one optional course, case-sensitive). Q6 lists six collections.

**Fix.** One table in code: class chip, its course ids, its notes collection, tested against list_courses. The runner searches each course id of the class. The gate allows that set and denies a materials search with no course when the turn has one. Drop or define 'the course the question names'. Say that reads by id are not scoped.

### [should-fix] brief-draft.md: step 8, task 11, Risks 'Text parsing', REJECTED structuredContent

**Problem.** Document text can fool the parser. Both servers print the excerpt raw under the field lines. A slide or note holding a line shaped like a hit heading or a text_id field yields a fake hit, a wrong chip and a wrong source row. A round trip on clean fixtures will not show it. The rejection of structuredContent holds only for the model's calls: the runner is its own MCP client and would receive it.

**Evidence.** mcp-server/src/format.ts renderHit, about lines 115-131 (heading, field lines, blank line, raw excerpt). agentic-harness mcp-server/src/format.ts:167-181.

**Fix.** Read field lines only between a heading and its excerpt line. Require the hit count to equal the header's count, else drop the result. workspace_sources_put keeps a materials row only when its text id and file id exist together. Add a hostile-excerpt case to task 11.

### [should-fix] brief-draft.md: Keep (check 13, tasks 3, 9, 20, 21, row 194), security table 'Outward flow'; open-questions.md Q2, Q3

**Problem.** Keep is the largest piece he did not ask for, and its risk is understated. A kept answer is model text built from course documents. It lands in the store his Claude Code sessions search, and those sessions have write tools, so a poisoned document gets a path past 'a wrong answer'. The note also leaves the laptop when realm sync is on. Q3 says only 'private'. Passages can hold [notes] speaker notes and the block's renderer is not told to keep that warning.

**Evidence.** brief-draft.md:276-277. agentic-harness README.md:56-61 (realms pushed by the nightly job; stack-laptop on DryRun, 2026-09-29) and docs/portable.md:30. `gh repo view emstacho-su/agentic-harness --json visibility -q .visibility` prints PUBLIC, which is where task 24 lands. mcp-server/src/format.ts NOTES_WARNING; root CLAUDE.md rule on [notes].

**Fix.** Ask 'Keep in this phase, yes or no' as its own line. If no, tasks 9 and 20 and half of 21 fall away and 194 stays slack. If yes: the note opens with a fixed line saying it is model-written from course material and is data; Q3 lists where it travels; task 3 also reads HARNESS_REALMS. evidence.ts carries the [notes] warning per passage, with a test.

### [should-fix] brief-draft.md: Files by owner; Workers table; Seams row 'Phase 22's standing checks'

**Problem.** The owner sets are incomplete, so they cannot be shown disjoint. Tests the redesign breaks have no owner. Phase 22's walk fixture has no owner here, and the page will read more than 'three new objects'.

**Evidence.** web/test: Workspace.empty.test.tsx (pins the empty thread the lobby replaces), Workspace.test.tsx, Workspace.thread.test.ts, Workspace.failures, .rereads, .service, three use-workspace-stream tests, workspace-harness.tsx. web/e2e: walk21*.ts, workspace-acceptance-helpers.spec.ts. web/package-lock.json. After 22: web/e2e/walk22.lib.ts, phone-width.spec.ts, theme-walk.spec.ts (brief 103 at c42924f, lines 486-487: guardWrites22 aborts any RPC off its read allowlist). mcp-server/scripts/smoke.mjs, src/format.ts, README.md. sync/src/report.ts.

**Fix.** Give each file an owner row. PM for the accept, walk21 and Phase 22 fixture files. W-79 for the web tests. W-77 for the three mcp-server files. W-78 for report.ts.

### [should-fix] brief-draft.md: DoD mcp-server line; tasks 2, 5, 6, 8, 9, 10, 13, 22

**Problem.** Five checks cannot run as written. (a) A bare `npm run smoke` exits 2 with no key, the server will list four tools not five, and a full run prints result text that must not be pasted. (b) Task 22 says 'inside the test container' but the image holds neither workspace/eval nor the golden file. (c) Tasks 5, 6, 8 and 9 need each migration on prod first, and no task row applies 190 to 194. (d) Task 13's bound is one byte high. (e) Task 2 does not say how the image starts without a runner loop.

**Evidence.** mcp-server/scripts/smoke.mjs:36, :66-71, :172; three files in mcp-server/src/tools today. docker/workspace/Dockerfile:39-42 and :144-148; ingest/ is outside its build context. db/tests/README.md:3. Linux allows 131,071 bytes plus the NUL; workspace/src/config.ts:72-73. docker/workspace/entrypoint.sh:46 execs the given command after the firewall.

**Fix.** (a) `npm run build`, then `SUPABASE_SERVICE_ROLE_FILE=<any non-empty file> node scripts/smoke.mjs --tools-only`, expect four names. (b) Say how the script and golden file get in, and that it prints qids only. (c) Add apply rows: PM, Stack's word, dry run, advisors. (d) 'under 131,072'. (e) Run the service with another command so the firewall stays and no loop starts; name the model; filler and questions are synthetic.

### [should-fix] brief-draft.md: Facts re-read (lines 26-29), header line 11, Seams rows on Phase 22, Data attributes, DoD Contract

**Problem.** The Phase 22 facts are one commit stale. The branch moved and the brief was re-frozen, so every cited line number is off. A second Phase 22 branch exists and is not mentioned. The audit baseline that W-79's lib files touch is the wrong one. The 'seven' attributes are ten, and one is the empty-thread line that check 14 removes.

**Evidence.** `git rev-list --left-right --count main...feat/styling-22` gives 0 2; head c42924f. Brief 103 there: workers line 88, row 12 fixture 129, layout rule 442-444, W-70's folders 571-575, W-75's files 576-577, integrate 897; lines 396-397 put web/src/lib/ in the foundation cluster. feat/styling-22-walkbox at 432291c, 15 commits, 9 files. web/e2e/accept21.spec.ts and accept.lib.ts read 10 distinct data attributes; accept21.spec.ts:144 and walk21.spec.ts:157 assert data-column-empty="start".

**Fix.** Re-read at the freeze and correct the lines. Name foundation.json. Say ten, and list the two start-line assertions as amended. State that `just accept 21` is not expected green after 24: its proofs want the model's own tool call (acceptance/21/manifest.json:82, :124).

### [should-fix] brief-draft.md: Seams row 'Phase 23 (apply)'; DoD apply line; task 18

**Problem.** The apply image can break while its tests stay green. Apply bundles workspace/src with packages left external, against its own node_modules. If the import closure of the six modules gains the MCP SDK or a retrieval file, the bundle carries an import its image cannot resolve. Vitest resolves from the dev tree and will not see it.

**Evidence.** docker/apply/Dockerfile:34-41. apply/package.json build script uses --packages=external. apply/src/main.ts:21 imports childEnv and spawnClaude from providers/claude-cli.js, which imports gate-rules, replay and stream-json.

**Fix.** Seam rule: the import closure of the six modules gains no new package. DoD: `cd apply && npm run typecheck && npm run build`, then a grep for modelcontextprotocol in the bundle gives 0.

### [should-fix] brief-draft.md: step 15, Side panel, MVP paragraph ('each one opens')

**Problem.** 'Each one opens' is not true as specified. The open control takes file routes, not a page or slide. No route opens a vault note from the page: the page cannot read the notes store and get_document stays off.

**Evidence.** web/src/components/materials/FileOpenAction.tsx:70-76. grep for #page= in web/src gives 0. brief-draft.md:459 and :270.

**Fix.** Reword: a materials chip opens the file and names its page or slide; a note chip shows title and collection and does not open. Or add a PDF page anchor as its own task.

### [should-fix] brief-draft.md: step 7, New fixed lines, task 2, task 13

**Problem.** The first week will feel slow and noisy. Every turn pays retrieval, also a one-word follow-up. No rule says what the model does on zero hits. A store that is down costs every turn the full 10 s, with no backoff. Nothing says the runner still starts when a server child cannot. The first call after a start can pass 10 s. A child that died is never restarted.

**Evidence.** agentic-harness mcp-server/src/db/index.ts:27-35 (pool of 4, 30 s idle, 15 s connect). brief-draft.md:182-190. No restart or warm-up wording in the Contract.

**Fix.** Warm both clients at start without blocking the poll loop. Restart a closed client on next use. After 3 failures in a row skip that store for 5 minutes and still name it. One Contract sentence for zero hits, pinned by the system-prompt test.

### [should-fix] brief-draft.md: Contract, The security boundary, tasks 2, 22, 31

**Problem.** The privacy rules for a public repository are not written down. Retrieval logging has no rule. Probe recordings are committed. The PM's walk has no shot rule. The CLI transcript volume will now hold every evidence block for 30 days.

**Evidence.** workspace/src/providers/claude-cli.ts:358-364 hides only the token and the question. compose.yaml keeps json-file logs, 10m by 3. workspace/claude/settings.json:2 (30 days). DECISIONS 2026-10-08 Phase 22 row: no screenshot is committed. DECISIONS.md:448: Phase 21's shots with course text stayed public.

**Fix.** Add to the Contract: retrieval logs carry counts, ids and timings only; the hidden list covers the whole prompt argument; no walk shot and no eval output with text is committed; recordings use synthetic filler and are scrubbed; name the transcript volume as a place course text and notes rest.

### [note] brief-draft.md: row 193, task 8

**Problem.** Migration 193 duplicates a view that exists. v_embedding_status already gives units, embedded units and the newest embed time per course, runs as its caller, and is in the generated types.

**Evidence.** db/migrations/010_search_layer.sql:84-93; 036_views_security_invoker.sql:45 and :57; web/src/lib/supabase/database.types.ts:3457.

**Fix.** Read it and sum, or say why not (superseded files, model filter). That saves a migration and a unit.

### [note] brief-draft.md: Database objects, 'Not read' line 260; rows 190, 191

**Problem.** Three 'not read' items can be closed, and the key rule is missing. A plain foreign key from a Workspace table to a file or text row would block a later strip migration.

**Evidence.** courses.id is text (001_schema.sql:50). bb_files.id is bigint (003_bb_files_bucket.sql:7). 141 names no event (141_workspace_realtime_policy.sql:24-28). 119:100 and 150:90 delete bb_file_text rows; 132_material_history.sql:70 uses on delete set null.

**Fix.** State the types. Use no foreign key to bb_files or bb_file_text, or on delete set null.

### [note] brief-draft.md: step 4, task 15; open-questions.md Q8

**Problem.** A Deep choice sticks. The router keeps the prior tier for a follow-up of 40 characters or fewer, and the prior tier is the last answer's stored tier. One Deep turn puts later short Auto turns on Opus.

**Evidence.** workspace/src/router.ts:127. db/migrations/143_workspace_review_round.sql:270 and :292-293.

**Fix.** workspace_turn_options returns the last routed tier for the router, or Q8 says the behaviour in one sentence.

### [note] brief-draft.md: Risks, 'Whether a hook process sees the turn's environment'

**Problem.** The stated fallback undoes a Phase 21 hardening. A per-turn settings file needs a settings path the node user can write. Today the settings are baked in the image and the turn folder is root's and read-only.

**Evidence.** workspace/src/config.ts:23. docker/workspace/Dockerfile:124-132.

**Fix.** Fallback: the runner writes a 0600 file under /run/workspace with the turn's course, and the gate reads it by the payload's session id. No settings change, no argv change.

### [note] open-questions.md: 'Not questions' list, Q10; brief-draft.md MVP paragraph

**Problem.** The list of things that need his word misses task 21. That task pushes Inbox day files to a public branch every 6 hours with no look first. 'Without a command' also holds only while the Blackboard login is alive and the laptop is awake.

**Evidence.** scripts/inbox-decisions-pr.mjs:3-5 and :10-13. `gh repo view emstacho-su/bb2dash --json visibility -q .visibility` prints PUBLIC. open-questions.md:158-165 lists three items.

**Fix.** Add the scheduled task as a fourth item. Add the two limits to the MVP sentence.

## Questions the batch did not ask

* Do you want Keep in this phase at all? It is the largest piece you did not ask for, and it sends text built from course documents out of the app.
* When nothing in your materials or notes matches, should it answer from general knowledge and say so, or decline?
* Which study routines do you want, and may one of them rewrite your own draft for graded work? You removed the courses' AI-use rules from the corpus on 2026-09-29 (migration 119), so this is yours to weigh.
* May a scheduled task on your laptop push Inbox decision day files to a public branch every 6 hours with no look first?
* After you choose Deep once, should short follow-ups stay on Deep, or go back to Auto?
* If Phase 22 slips, should the Workspace page wait, or should the backend merge first as a split PR?
