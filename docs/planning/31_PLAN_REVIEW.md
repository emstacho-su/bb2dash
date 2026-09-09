# 31. Plan review: is 30_PHASED_PLAN ready for Stack to start Phase 0 tomorrow

Date: 2026-09-08. Agent: P2 (critic). Read in full: `00_AGENT_BRIEF.md`, `30_PHASED_PLAN.md`, `22_D3_risk_and_scope_review.md`, `20_D1_gui_direction.md`, `21_D2_architecture_direction.md`, `10_R1_gui_binding_audit.md`, `11_R2_data_inventory.md`, `12_R3_pipeline_and_runtime.md`. Spot-checked in the repo: `db/migrations/` (nine files, 001 through 009, no 010+), `skills/` (two skills, `bb-course-map` and `bb-course-pull`), `ingest/` (no `transform/`, no `classify_rules.sql`), `ingest/bb_crawler.js` announcement mapping. Spot-checked read-only against `goultdzqcavefcgnifdy` on 2026-09-08: RLS policies on `sync_runs`, `bb_raw` and the planner tables; `bb_files` linkage per course; `courses.parent_course_id`; `readings` columns; the Sep 14 to Sep 27 work window.

Everything marked verified was read in this repo or returned by SQL today. Everything else is my judgment and is marked.

## Verdict in one paragraph

The plan is the best document in this round. Its conflict resolutions are correct, its sequencing instincts are right, and it is the only file that priced anything against Stack's calendar. It is not ready to start tomorrow without four edits, one of which is a hard blocker: work item 0.4 asks the browser crawler, which holds only the publishable key and therefore resolves to the `anon` role, to insert into `sync_runs` and `sync_stage_runs`, and `anon` has no policy on either table (verified). As written, D3's "highest-value code change in the project" cannot execute. The other three are a content transform consumed in Phase 3 and created in Phase 4, course cards that Phase 4 decorates but no phase builds, and a Phase 3 MVP check that names a file that does not exist. Everything else is capacity: four of six phases are loaded at roughly twice the builder budget the plan itself adopted, and the plan has no cut order, which means the cuts will be made at 1am on the deadline instead of now.

---

## 1. Dependency check

I walked every work item in Phases 0 through 6 against every table, view, column, skill and screen it names. Eleven problems. V1 through V4 are real blockers; V5 through V8 will cost an evening each when hit; V9 through V11 are ordering hygiene that costs a confusing hour.

### V1. The crawler cannot write the run-status rows that item 0.4 requires. Blocker.

Item 0.4 says: "Where: `ingest/bb_crawler.js`, in `crawl()` and `runAll()`. Open a `sync_runs` row with `status = 'running'` before the first fetch and a `sync_stage_runs` row per course."

`bb_crawler.js` runs in the Blackboard page context and posts with the publishable key as both `apikey` and `Authorization: Bearer` (line 90, verified). An unsigned publishable key resolves to `anon`. Verified from `pg_policies` today:

| Table | Policy | Role | Command |
|---|---|---|---|
| `bb_raw` | `bb_raw_anon_insert` | anon | INSERT |
| `bb_raw` | `bb_raw_owner_all` | authenticated | ALL |
| `sync_runs` | `sync_runs_owner_all` | authenticated | ALL |

There is no anon policy on `sync_runs`, and migration 010 creates `sync_stage_runs` with the same authenticated-only pattern D2 mandates. So the insert fails with a policy error, silently, inside a script whose entire defect is that it fails silently.

Three fixes exist and only one is right. Adding an anon insert and update policy on `sync_runs` widens exactly the world-writable append surface D3 failure mode 10 names, and an update policy on a status column lets anyone mark any run `ok`. Signing the crawler in with the Supabase email and password puts Stack's database credentials into a page served from `blackboard.syracuse.edu`, which is worse. The right fix is the one D2 section 7.3 already describes for `bb-sync`: the Claude session, which authenticates through the MCP as the owner, opens the `sync_runs` row before it calls `bb.runAll`, and closes it from the returned per-course log afterwards.

Fix: split item 0.4 in two. Item 0.4a stays in `bb_crawler.js` and is crawler-side only: per-course try/catch, per-course status pushed into the returned `log` array, the empty-term guard (throw when `mine.length === 0`, line 92), the truncation warnings at lines 33 and 62, and `termName`, `userId` and the calendar window moved to `.env`. Item 0.4b is a new step in `ingest/CADENCE_RUNBOOK.md`: the session opens `sync_runs` with `status = 'running'`, `started_at`, `trigger` and the `run_id` before the crawl, writes one `sync_stage_runs` row per course from the log, and closes the run `ok`, `partial` or `failed` with the envelope. That step becomes the body of `bb-sync` in Phase 4 item 4.7, which is where the plan already puts the sentence "owns the `running` `sync_runs` row". Phase 0 MVP checks 2 and 3 still pass, and check 3 becomes more honest: killing the session mid-crawl leaves the row in `running`, which is exactly the state the app must render as interrupted.

### V2. Phase 3 item 3.4 consumes a content transform that Phase 4 item 4.1 creates. Blocker.

Item 3.4's third precondition is "re-run the content transform, because `bb_content.modified_at` tops out at 2026-09-02 while two crawls landed on 9/8 and neither refreshed the tree". There is no content transform. Phase 0 item 0.6 implements exactly one stage and it is `stageAssignments`; `stageContent` is item 4.1, five to seven weeks after the Materials screen ships.

Fix: move `stageContent` out of item 4.1 and into item 3.4 as a named sub-item. It is the stage with the least reconciliation judgment in it (`bb_content` is an agent-owned mirror with no planner state and a unique `path` per course, verified), so it is the cheapest stage to write second, and the Materials screen is the only surface that depends on a fresh tree. Item 4.1 keeps the sentence about checking `slim()` against a live payload, and moves it to 3.4 with the stage.

### V3. `bb_files.superseded_by` is created in Phase 3 and written by nothing.

Item 3.4 adds `superseded_by` and `v_bb_files_current` per D2 migration 018. D2 assigns that column's ownership to the `bb-classify-files` skill and its `stageClassify` pass. Item 4.7 explicitly cuts `bb-classify-files` from the roster, and item 5.4 offers the classification pass as one of three optional slack items of which Stack picks "zero or one". So the column exists and stays null, and MVP-1 check 6 ("Open the Materials list for IST.466. It does not show four schedule versions and two rosters") fails.

Fix: add to item 3.4 an explicit one-line UPDATE setting `superseded_by` on `bb_files` 16, 40 and 58 to the current schedule row and on 35 to 37, recorded in `db/seed/006_superseded.sql`. R2 punch list 12 names all five rows, so this is data entry, not judgment. Verified today that none of those four rows carries an `assignment_id`, so nothing in Phase 2 item 2.4 breaks by ignoring the column until Phase 3.

### V4. Item 4.8 puts a grade slot on course cards that no phase builds. Blocker for MVP-2 check 5.

Item 4.8 is "The course card grade slot. Where: the Today screen. Two lines: a group and section badge, and 'graded N of M items'. Effort S." Phase 1 says "No course cards". Phase 2 adds no screens. Phase 3 builds a course page, which is a different surface. So Phase 4 item 4.8 is scoped as a two-line edit to a component that does not exist, and MVP-2 check 5 says "Every course card shows 'graded N of M items'".

Fix: pick one. Either promote 4.8 to "the course card row on Today, six cards from `v_course_display`, with a two-line slot", which is M and not S and needs a place in the increment-two budget, or delete 4.8 and MVP-2 check 5 and let the graded count live on the Phase 3 course page, where a header already exists. Given the Phase 4 capacity picture in section 4, I recommend the second, with the card row moving to Phase 5 item 5.4 as a fourth optional slack item.

### V5. The group and section badge in item 4.8 has no table.

D1 rank 8 and R2 section 8b both establish that `courses.bb_group_id` and `bb_group_set_id` are single-valued and that IST.466 holds two groups from two different group sets, so the badge needs D2's migration 022 `course_groups`. The plan schedules no such migration and does not list it under "not building".

Fix: state in item 4.8 that the badge renders `courses.group_notes` verbatim as text after item 0.5(b) corrects it, and add `course_groups` to section 11 as deferred to January. Rendering the corrected `group_notes` string is honest and free; a typed table for two rows is not worth a migration this term.

### V6. `announcements.author` is added in Phase 0 and can never be filled.

Item 0.3 adds `announcements.author text` and credits R1 matrix A ("no author column exists; the crawler drops the creator the endpoint returns"). Verified in `bb_crawler.js`: the announcement map is `{ id, title, created, modified, start, isRead, body }` and the creator field is never read. So the column's only writer would be `stageAnnouncements` in item 4.1, reading a payload key that no crawl has ever posted. R1's own fix is "add the creator field to the crawler's announcement map and re-run", and no work item does that.

Fix: add the creator field to item 0.4a. It is one key in one object literal in the file that is already being edited, and every crawl from Sep 13 onward then carries it. Without that line, the column is decoration.

### V7. Item 1.4 adopts a DDL that references a view Phase 1 does not create.

Item 1.4 says "DDL from D2 section 3 migration 016, minus the effort columns until 1.3's `base` is read". D2's migration 016 reads `join v_assignment_effort e on e.id = a.id` and takes `e.category`, `e.glyph`, `e.effort`, `e.is_override` and `e.multiplier_applied` from it. `v_assignment_effort` is D2 migration 015, which also creates `v_course_points_median`. The plan's item 1.3 creates only the `effort_base` table. So a builder pasting D2's 016 gets a missing-relation error, and the fix is not obvious because the plan says the category and glyph come "from `effort_base`" without saying the join changed.

Fix: in item 1.4, write the one line that matters: the assignment arm joins `effort_base b on b.type = a.type` and selects `b.category` and `b.glyph`; `v_assignment_effort`, `v_course_points_median` and the `effort`, `is_override` and `multiplier_applied` columns are not created in Phase 1 and arrive only if item 5.4's effort option is taken.

### V8. The Phase 0 transform driver produces `Attention` values with nowhere to put them.

Item 0.6 delivers "the `Change` / `Attention` / `StageResult` / `Ctx` types from D2 section 4.3" and the envelope fold, and Phase 0 explicitly excludes `attention_items`, correctly, per D3 sequencing trap 7. D2's driver inserts attention rows into the table. Nothing says what the Phase 0 driver does with them.

Fix: state in item 0.6 that until migration 017 lands, the driver folds `attention[]` into the summary under a fourth key, `summary.attention`, alongside `counts`, `changes` and `errors`. The `sync_runs_summary_envelope` constraint checks for the presence of three keys and permits extras (verified against the DDL in D2 migration 010), so this needs no schema change and gives item 4.2 a backfill source for the first attention rows.

### V9. Within-increment ordering that the plan leaves implicit.

Three places where two items in the same phase have a hard order and the plan does not say so. Item 0.2 (migration 010) must be applied before item 0.4b writes a `sync_runs.status`. Item 4.3 (migration 018, `bb_gradebook`) must be applied before item 4.1's `stageGradebook` runs, and both sit in increment one with 4.1 listed first. Item 3.4 (migration 015, `superseded_by`) must precede item 3.7 (migration 016), because `search_corpus()` filters on `f.superseded_by is null`.

Fix: add a one-line "apply order within this phase" note to Phases 0, 3 and 4.

### V10. The migration renumbering note in item 0.3 is wrong and will cause a wrong DDL to be applied.

Item 0.3 says "Note the D2 numbering shifts by three from here on because 012 is cancelled and 010/011 are renumbered to match the files that actually land." It does not shift by three, and it does not shift uniformly. The actual mapping is:

| Plan migration | D2 migration | What it is |
|---|---|---|
| 010 | 010 | sync contract, minus `request_id` and the 012 FK |
| 011 | 014 | planner-owned columns |
| 012 | 015 | `effort_base`, table only, no effort views |
| 013 | 016 | `v_work_items`, minus the effort columns |
| 014 | 017 | `v_course_display` |
| 015 | 018 | `bb_files.superseded_by`, `v_bb_files_current` |
| 016 | 019 | corpus FTS |
| 017 | 011 | `attention_items` |
| 018 | 013 | `bb_gradebook` and its three views |
| 019 | new | `courses.ai_assist_allowed` |
| cancelled | 012 | `agent_requests` |

Fix: replace the sentence in item 0.3 with that table, placed once in section 3 or in a new short section between sections 3 and 4.

### V11. Phase 2 MVP check 5 tests a capability no work item builds.

"Unplug the network. The app still opens and still shows the last list it fetched." That is `persistQueryClient` with the localStorage persister, which D2 section 1.3 specifies and which item 1.1 does not mention when it lists TanStack Query v5. Nothing else in Phases 1 or 2 provides a cold-start cache.

Fix: add "`persistQueryClient` with the localStorage persister" to item 1.1's stack list, or rewrite the check as "Unplug the network. The app opens, shows an explicit offline state, and does not render a blank screen or an infinite spinner." I prefer adding the persister: it is a five-line change, it is the same mechanism that covers D3 failure mode 6 (Supabase free-tier pause), and offline-on-open is the difference between an app Stack trusts in a lecture hall and one he does not.

### Checked and clean

For the record, these read like violations and are not. Item 2.4 reads `bb_files.assignment_id` before `v_bb_files_current` exists, which is safe because none of the five superseded IST.466 rows carries an `assignment_id` (verified). Item 3.1 needs `courses.parent_course_id`, which exists and is set only on `GEO.103.recitation -> GEO.103.lecture` (verified), so D2's `v_course_display` DDL groups correctly. Item 4.2 reads `v_course_map_latest`, which exists. Item 5.2 reads `v_gradebook_latest` and `v_assignment_grade` from item 4.3, and `v_assignment_grade` still references the `assignment_progress` fact columns, which is consistent with deferring the drop to item 5.4. Nothing anywhere in the plan reads `v_upcoming` or `v_overdue`, as the handoff notes promise.

---

## 2. Traceability of the highest-ranked findings

### The twelve the researchers themselves ranked highest

| # | Finding and who ranked it | Plan item | Verdict |
|---|---|---|---|
| 1 | No `bb_raw` to typed transform exists (R3 section 6 item 4, "the number one item on this list"; D2 handoff, "the single largest piece of work"; D3 claim 1) | 0.6 driver plus 4.1 stages | Closed, but the Phase 0 half is mis-sized. See section 4 |
| 2 | Crawler fails silently (R3 section 6 item 3; D3 failure mode 1, "the highest-value code change in the project") | 0.4 | Scheduled and broken. See V1 |
| 3 | No grade computation, no `v_course_grade` (R1 gap 1; R2 rank 1; R3 section 6 item 16) | 4.3 store, 5.2 display, conflict 1 | Closed by deferral, and the deferral is right. D3 claims 3 and 4 measured two academic scores and one `isCalc` column reading 5 of 104 |
| 4 | Readings absent from the work list (R1 gap 4, "the highest-leverage small change in the audit"; D1 rank 4; R2 rank 8) | 1.4 `v_work_items` | Closed |
| 5 | `sync_runs.summary` has no contract (R1 gap 3; R2 section 5; R3 section 4.4) | 0.2 | Closed |
| 6 | No `attention_items`, so needs-attention cannot be fed (R3 section 4.2; D1 rank 2, "the feature that makes bb2dash better than Blackboard"; R2 rank 3) | 4.2 plus 4.4 | Closed, correctly sequenced behind the transform |
| 7 | Auth gates every read and write (R1 T-14, promoted to task zero by D1; D2 section 2, "the one thing worth doing this week regardless") | 0.1 | Closed. See the MVP note in section 3 |
| 8 | Effort map incomplete and duplicated (R1 gap 8; D1 section 3; D2 migration 015) | 1.3 table only; ladder deferred to 5.4 | Partially closed. The table lands, the ladder does not. Justified: 0 of 65 rows carry `est_minutes` or `planned_start` (D3 claim 7) |
| 9 | `bb_files.session_id` on 2 of 64 (R1 gap 2; D1 rank 10; R2 section 2 coverage constraint) | Declined in Phase 3, offered as one of three "pick zero or one" options in 5.4 | Effectively declined, and the plan should say so plainly. `bb-classify-files`, the skill that would do it, is cut in 4.7. The drop is justified: no screen in the plan depends on it |
| 10 | `bb_file_text` unused, 534 units and 949k characters, zero GUI references (D1 rank 1; R2 rank 2) | 3.7 | Closed, and it is the item most likely to be cut under Phase 3 overload. See section 4 |
| 11 | IST.466 group numbers swapped (R2 punch list 1; D3 claim 6, "CONFIRMED, exact swap"; D1 open question 1, "the single most consequential data conflict") | 0.5(b) | Closed, blocked on Stack's answer, correctly isolated so the rest of Phase 0 proceeds |
| 12 | Academic integrity and the AI policies (D3 failure mode 9, "under-weighted in all three research files", impact "categorically worse than any bug") | 3.8 display, 4.6 column and skill enforcement | Closed. This is the plan's best single judgment call |

### The specific checklist

| Item | Where in the plan | Verdict |
|---|---|---|
| Readings in the tracker | 1.4 `v_work_items` union arm; Phase 1 MVP check 3 names ECN's 9/8 and 9/15 readings | Closed |
| `bb_files` session and week backfill | Excluded from Phase 3 with reasoning; 5.4 option two | Deferred with a phase, but the deferral is a decline in practice because 4.7 cuts `bb-classify-files` and 5.4 permits at most one of three options. Say "not this term" and stop calling it optional |
| Crawler run-status wrapper | 0.4 | Scheduled, cannot execute as written. V1 |
| Transform code | 0.6 plus 4.1 | Closed, split correctly, mis-sized. Section 4 |
| `sync_runs` envelope | 0.2, with `NOT VALID` to grandfather the twelve existing rows | Closed |
| `attention_items` | 4.2, D2 migration 011 DDL, `overdue` correctly dropped from the kind vocabulary | Closed |
| Auth and disable signups | 0.1, Stack alone, five minutes | Closed |
| Effort ladder and `effort_base` | 1.3 seeds 19 rows with `base`, `category`, `glyph`, `in_workload`; only `category` and `glyph` are read; the five-rung ladder is not built | Table closed, ladder deferred to 5.4 behind open question 14. Correct call. `effort_override`, added in 0.3, is a column nothing reads all term; harmless at one line |
| IST.466 group swap | 0.5(b), losing value preserved in `courses.notes` | Closed, blocked on open question 2 |
| `courses.location` | 0.5(a) plus 0.5(e), the rule that `meetings.location` always wins, written into `DATA_SYNTAX.md` | Closed, and the plan is right to spend a SQL statement rather than one of Stack's answers |
| Per-course AI policy block | 3.8 display half, 4.6 column plus skill enforcement, open question 13 gates the enforcement style | Closed |
| iCal feed capture | Not in any phase; named in section 11 as "not on this list and not in any phase either"; open question 12 | Explicitly declined with a named re-entry condition (a fetch that returns events). Correct, and it matches D3's "do not treat it as a plan input until someone has seen events come back" |
| Announcement author | 0.3 adds the column | Column scheduled, producer not. V6 |
| FTS over `bb_file_text` | 3.7, migration 016, with the `Page N` header strip and the `[notes]` rule both mandatory | Closed, and the two display rules are the right ones |
| The two attendance columns | 4.3 `bb_gradebook.is_attendance`; 4.8 no attendance figure; 5.2 excluded from any headline, shown as a chip if at all; open question 17 | Closed |
| The nine dateless assignments | 1.7 collapsed tray; open question 6 | Closed |

Two of sixteen fail. Both are one-line fixes in files already being edited.

---

## 3. MVP test: can Stack verify each phase in ten minutes, and does it give him something new

### Phase 0

Verifiable: mostly. Delivers something new: no, by design, and the plan says so. That is the phase's real risk, and the handoff notes already name it.

Check 3 ("Kill a crawl halfway on purpose") is not a ten-minute desk check. It needs a NetID login, a Duo push, a running crawl and a deliberate kill. It belongs in the Sunday Sep 13 exit criterion, not the checklist. Check 6 needs a `<run-id>`, which needs a crawl, same problem.

The bigger miss is that the phase's stated goal is "make it possible for a signed-in renderer to read typed tables at all" and no check tests a read. Check 1 verifies signups are off and one user exists; nothing verifies that user's JWT can `select` from `assignments`. That is precisely D3 sequencing trap 1 ("build the renderer against the MCP or a service key in dev and it will work perfectly in development and 401 on day one"), and the plan quotes the trap without testing for it.

Rewrites:

1. Keep as is.
2. New check 2: "In the browser console on any page, create a supabase-js client with the publishable key, `signInWithPassword` as your new user, and `select id, title from assignments limit 5`. Five rows come back. Sign out and run the same select. It returns zero rows and no error." That is the whole auth contract, provable in three minutes, and it is the one thing Phase 0 exists for.
3. Old check 2 becomes check 3, unchanged.
4. New check 4, replacing the crawl-kill: "Run `node ingest/transform/run.js --run-id <any existing bb_raw run_id> --dry-run` twice. Both print the same change list and both write nothing. Then run it once for real and once more: the second summary's `changes` array is empty." That is item 0.6's own stated acceptance test and it is currently not in the checklist at all.
5. Checks 4, 5 and 7 renumber unchanged.
6. Move the crawl-kill to the exit criterion, phrased as: "The Sunday Sep 13 crawl leaves a `sync_runs` row with a `status`, a `started_at`, a `finished_at`, seven `sync_stage_runs` rows, and a three-key summary. Kill the following crawl after three courses; that row reads `running` or `partial` and never `ok`."

### Phase 1

Verifiable: yes, except check 5, and check 7 is correctly separated as the exit criterion. Delivers something new: yes, unambiguously. This is the strongest MVP in the plan.

Check 5 ("turns amber past 24 hours") cannot be verified in ten minutes without waiting a day. Rewrite: "Set the newest `sync_runs.finished_at` back 25 hours with one UPDATE, reload, and the line reads amber with the right age; put it back." Check 2 should name what to compare: "Open Blackboard, look at IST.323, IST.466 and ECN.304 for the same fourteen days, and confirm every dated item is on the list or in the undated tray." Verified today, the Sep 14 to Sep 27 window holds 7 assignment rows and 8 dated readings, so this is a fifteen-row comparison, not a fifty-row one, and it will take four minutes.

Worth recording against D3's own number: D3 sized MVP-0 at "13 assignment items and 12 dated readings, verified. Twenty-five rows", counting from Sep 8. Counting from the ship date, Sep 14, it is fifteen rows. The screen is even smaller than the plan thinks, which strengthens the list-not-chart decision and weakens any argument for adding a second surface to Phase 1.

### Phase 2

Verifiable: yes, except check 5. Delivers something new: yes, opening a course file in Acrobat from the app without touching Blackboard is the shell's one irreplaceable job.

Check 3 ("Click any item that has a file behind it") should name a target, because `assignment_id` coverage is lopsided. Verified for the Sep 21 to Oct 18 window: 15 of the 17 assignment-linked files are IST.466, one is IST.323, one is IST.471, and ECN.304 and both GEO shells have zero. Rewrite: "Open the IST.466 case item due in this window. Its spec opens in Acrobat from the mirror. Then open an ECN.304 item and confirm it shows no Open button rather than an Open button that does nothing."

Check 5 tests the query persister, which no item builds. See V11.

### Phase 3

Verifiable: no. Check 1 names a file that does not exist, and check 1 is the phase's whole point. Delivers something new: yes.

Check 1 is "get to this week's ECN reading PDF or the IST.323 lecture deck, opened in its real application, in three clicks". Verified today: ECN.304 has three files in total, one syllabus and two lecture decks (`National Debt_v3HO.pptx` week 1, `Social Security_v3HO.pptx` week 3), and zero files carry a `reading_id`. Across the whole corpus only 13 files are reading-linked, 10 of them IST.466 and 3 GEO.103.lecture. R2 section 7 already says ECN's readings are external links with nothing downloadable, and D3 corrected the count to 29 of 38 carrying a URL. There is no ECN reading PDF, there never will be, and by term weeks 7 and 8 the two ECN decks on disk are four and six weeks old.

The plan inherited this sentence from D3's MVP-1 acceptance without re-measuring, which is ironic given how much of the plan is D3 re-measuring R1 and R2. Rewrite check 1: "From a cold open, reach the current IST.466 HBR case PDF or the IST.323 lecture deck for this week, opened in its real application, in three clicks and without touching Blackboard." And rewrite the exit criterion's "check 1 passes for a course other than IST.323" as "for IST.466 or GEO.103", since those are the only other courses with reading bytes on disk.

Check 5 ("Open IST.352. The AI policy is on the page, in the professor's words, without scrolling") is excellent, keep verbatim.

Missing: nothing in the checklist tests item 3.7, which is a whole work item and D1's rank 1 feature. Add: "Press cmd-K, search a phrase you remember from a lecture deck, and get the file, course and slide number back in under a second, with no `[notes]` text and no `Page N` headers in the snippet."

### Phase 4

Verifiable: partly. Delivers something new: yes.

Check 1 ("Within a minute the app shows '4 changes, 1 needs you'") presumes a crawl that produces four changes. Rewrite: "Run a crawl. The Activity screen's change count and change list match what `ingest/transform/run.js` printed to the terminal, and the attention count matches `select count(*) from attention_items where state = 'open'`." Check 2 needs two crawl cycles and belongs in the exit criterion, where the plan has already put almost the same sentence. Check 5 depends on V4. Check 6 ("Open IST.352 and ask the agent to summarize a reading. It refuses and quotes the syllabus") is the best check in the document; keep it exactly.

Add a check for item 4.1, which is the phase's L item and is otherwise untested: "Run the transform twice against the same `run_id`. The second run's summary has zero changes and raises no duplicate attention rows."

### Phase 5

Verifiable: checks 2 through 5 yes, check 1 no. Delivers something new: only check 2, and only if the gate opens. That is correct and deliberate.

Check 1 ("Every day from Nov 30 to Dec 13, the app opens and the list is right") is a two-week observation, not a ten-minute test. Move it to the exit criterion. Check 5 ("`pg_dump` from the previous Sunday is on disk in OneDrive and restores") should say how: "`pg_restore --list` on the dump enumerates every typed table, and a restore into a scratch database returns the same row counts as `DB_VIEWS`." A restore you have never attempted is not a backup.

### Phase 6

Verifiable and appropriately shaped. No change.

---

## 4. Capacity check

The plan adopts D3's estimate as binding: six to ten focused hours a week, weekends, with term weeks 5, 6, 9, 11, 15 and 16 largely lost, and one increment per week as the unit of delivery. I priced each item at S equals one to two hours, M equals four to six, L equals ten to fourteen. Those are generous for a builder with Claude Code and stingy for a builder who also has to review, debug and context-switch, which is D3's own caveat.

| Phase | Window | Items | Budget at 6 to 10 h/wk | Estimate | Load |
|---|---|---|---|---|---|
| 0 | Sep 8-13, 6 days inside the heaviest week of the term | 5S, 1M, 1L | 6 to 10 h | 19 to 30 h | 2.5x to 3x |
| 1 | Sep 14-20, Tue to Sun after Monday's exam | 4S, 3M | 6 to 10 h | 16 to 26 h | 2.5x |
| 2 | Sep 21-Oct 4, two weeks both carrying exams | 3S, 2M | 10 to 14 h realistic | 11 to 18 h | 1.3x |
| 3 | Oct 5-18, the two lightest weeks | 3S, 4M, 1L | 12 to 20 h | 29 to 44 h | 2.2x |
| 4 | Oct 19-Nov 22, five weeks, two lost, one slack | 2S, 6M, 1L | 18 to 30 h | 36 to 54 h | 1.8x |
| 5 | Nov 30-Dec 15 | 2S, 1M gated, freeze | ample | fits | 0.5x |

Every build phase is over, and Phases 0, 1 and 3 are over by more than double. The plan's own rule, "one increment per week is the unit, and every phase in this plan carries at most two", is not what the item lists actually contain: Phase 3 carries eight items and Phase 4 carries nine.

This does not mean the plan is wrong. It means the plan has no cut order, so the cuts will happen under deadline pressure on Oct 17 and Nov 28, which is when a builder cuts the wrong thing. Four specific moves fix most of it.

Move one, and it is the most important. Item 0.6 is the single L in a six-day phase that sits inside the eleven-deadline week. Shrink it rather than moving it: Phase 0 delivers the driver, `reconcile()`, the four types, the `sync_runs` and `sync_stage_runs` lifecycle writes, the envelope fold, the fixtures and the `node --test` idempotency assertion, with `stageCourses` as the one implemented stage instead of `stageAssignments`. `stageCourses` folds seven rows of course metadata with almost no reconciliation judgment; `stageAssignments` folds 66 rows, owns the confirmed-versus-tentative predicate and carries the re-created-item logic that item 4.1 is already going to write anyway ("`stageAssignments`, already written in Phase 0, gains the re-created-item case"). Moving `stageAssignments` whole into 4.1 costs nothing, because 4.1 was going to touch it regardless, and it takes Phase 0 from roughly 25 hours to roughly 15. That is still over, but the remaining items are 0.1 at five minutes, 0.5 as five SQL statements and 0.7 as one `pg_dump`, so the honest week is closer to eight hours.

Move two. Phase 1 needs a named minimum. Items 1.1, 1.4, 1.5 and 1.6 are MVP-0 and are not negotiable against Sep 20. Items 1.2 and 1.7 are droppable to the Sep 21 to 27 week without touching a single MVP-0 check: 1.2's `window.desktop` bridge has no consumer until Phase 2, and 1.7's undated tray affects MVP-0 check 2 only in the sense that nine items would be genuinely absent rather than collapsed, which is one sentence of copy on the header until the tray lands. Item 1.3 stays because it is one CREATE TABLE and one INSERT and item 1.4 joins it.

Move three. Phase 3 is 2.2x over on the two best weeks of the term, and MVP-1's six checks only exercise items 3.1, 3.2, 3.3, 3.4, 3.5 and 3.8. Items 3.6 and 3.7 are tested by nothing. Of those two, item 3.7 gives Stack a capability he does not have anywhere (full text search across 949,000 characters of course material), while item 3.6 gives a nicer rendering of `assignments.description`, which he can already read in the Phase 1 list. So the cut is 3.6, not 3.7. Move item 3.6 to the Nov 16 to 22 slack week in Phase 4 and say in Phase 3 that 3.7 is the next thing to go if Oct 18 is at risk.

Move four. Phase 4 is 1.8x over on roughly three usable weeks. Two cuts get it close. Drop `bb-announce-extract` from item 4.7: it is the only skill in the roster that no MVP-2 check exercises, its output surface (`attention_items.suggested`) works fine when fed by the transform alone, and R2's argument for it (announcements are the only route to ECN's unannounced quizzes) is a January feature, not a November one. And apply the V4 fix by moving item 4.8 out. That brings 4.7 from M to S and removes an M, netting roughly eight to twelve hours, which is about what item 3.6 costs coming in.

### On the specific question: is five weeks for Phase 4 and two for Phase 3 the right balance

The calendar allocation is right and the load allocation is wrong, in the direction the plan does not notice.

Oct 19 to 25 and Nov 2 to 8 are genuinely lost. Week 9 carries the IST.466 major case presentation at 150 points plus IST.323 Exam 2, and week 11 carries GEO.103 Exam 2 plus ECN.304 Exam 2. Writing both off is correct and I would not argue with it. So Phase 4's five calendar weeks are Oct 26 to Nov 1, Nov 9 to 15, and Nov 16 to 22 as slack, which is two working weeks plus one reserve.

But Phase 3's two weeks are the only two clean weeks in the entire remaining term (week 7 has three items, week 8 has one), and the plan loads them at 2.2x while loading Phase 4's usable weeks at 1.8x. Per usable week, Phase 3 is the more overloaded of the two. The imbalance is not five versus two; it is that the two clean weeks are carrying eight items including the plan's second L, while the phase with three usable weeks carries nine. Moving item 3.6 from Phase 3 into Phase 4's Nov 16 to 22 slack, and moving items 4.7's announce-extract and 4.8 out of Phase 4 entirely, evens both to roughly 1.5x, which is as good as this calendar gets. I would not try to get below 1.5x by cutting further, because the remaining items are each tested by an MVP check.

One thing the plan gets exactly right and should keep under pressure: Phase 5 has no build week, and the Nov 23 to 29 Thanksgiving week is empty. Every instinct under deadline will be to fill both. Do not.

---

## 5. The three conflict decisions

### Conflict 1, no grade number before Phase 5. Agree, without reservation.

The evidence is decisive and it is D3's, not the plan's. R1 deep dive 3 asserts that lifting the Blackboard Total "gives every card a real number in one migration"; R2 ranks it the number one under-used asset. D3 claim 4 measured it: one `isCalc = true` column exists across all seven shells, IST.323's `Total Score`, reading 5 of a possible 104. D3 claim 3 measured the substrate: `effectiveScore` non-null on 9 of 37 columns, four of the nine attendance or absence markers, leaving IST.323 Quiz #1 at 10 and ECN.304 Quiz 1 at 9. Two academic scores across seven courses. The "one migration, seven numbers" close delivers one card reading 4.8 percent, one reading "attendance 100" which means present so far, one reading 0 of 100 from a probable Qwickly placeholder, and four blanks. The plan's judgment that this is worse than a count is correct, and its observation that D1 concedes the point halfway by adding "graded N of M items" as line two is a fair reading of D1 section 1.1.

Building `bb_gradebook` in Phase 4 anyway, append-per-run, is the right call for a reason the plan states and should state louder: the history is the only thing that makes November's decision possible, and history cannot be backfilled. If the store lands in November instead, the November decision is made against one snapshot.

One refinement. The Phase 5 gate ("build this in the first week of December only if a query over `bb_gradebook` returns more than ten non-attendance scores") should run in early November, not December. If it fails in November, the answer is not to skip the screen quietly; it is to tell Stack in November that no grade surface is coming, so he does not spend December waiting for one. The store stays worth building either way.

### Conflict 2, spawn only, no `agent_requests`. Agree.

The Duo argument is the right argument and it is airtight for the request kinds D1 actually lists. Sync everything, refresh this course, pull files and re-map a course all need a live Blackboard session, a live session needs a Duo push, and a Duo push needs Stack holding his phone. The durability that a row buys is the ten seconds between the click and the terminal opening. D1's strongest counter, the badge that says "no agent session has picked this up", is monitoring for asynchrony that does not exist here, and the plan is right to name it as such.

The one thing D2 offers that would have changed my answer is section 7.2's note that three skills are genuinely browser-free and could run headlessly: `bb-transform`, `bb-classify-files` and `bb-grade-snapshot`. If all three were in the roster, a queue would have real fulfillers and the case would be closer. But item 4.7 cuts two of the three, and the third is a thin wrapper Stack can invoke directly. So the queue would have exactly one possible client and a human sitting next to it. Spawn only.

What the decision costs, and the plan should say it in one sentence rather than leave it implicit: if Stack clicks Refresh, the terminal fails to spawn, the clipboard toast is dismissed, and he closes the app, nothing anywhere records that he wanted a sync. At one user with a staleness line on the next open, that is acceptable. It would not be at two.

The escape hatch the plan names is right and cheap: D2's migration 012 is written and can be applied in an evening if a browser-free request kind ever appears.

### Conflict 3, Vite renderer first, Electron on Sep 21. Agree, strongly, and the plan's argument is better than D3's.

D3's case is an arithmetic one: one to two weeks of scaffold against a thirteen-day deadline and a six-to-ten-hour week. That is persuasive. The plan's addition is the decisive part and D2 supplied it against itself: D2 section 8 already requires the renderer to run standalone in an ordinary browser, because `CLAUDE.md` says anything visual runs on a local port and waits for Stack's OK, and D2 section 1.1's fourth ground for Electron is precisely that this constraint forces a clean bridge boundary. So the Phase 1 renderer is not a prototype that Phase 2 throws away; it is the artifact D2's own dev workflow demands. Phase 2 is additive by construction.

Two things to hold onto. First, item 1.1 must lay the directory out as `app/src/renderer/` from the first commit, per D2 section 1.2, so that Phase 2 adds `src/main/` and `src/preload/` beside it rather than restructuring. The plan says "new `app/` workspace per D2 section 1.2", which covers this, but it is worth one explicit sentence because a builder in a hurry will put `main.tsx` at `app/src/main.tsx` and then spend an afternoon on the collision with `app/src/main/`. Second, the plan resolves SPIKE-BB-WEBVIEW off the critical path and I agree, but it should close the loop D2 left open: D2 section 1.1 commits to Electron with exactly one named condition that reverses it, and D2's handoff says "run the spike before `feat/app-shell` merges". The plan overrides that without saying so. It should say so: the spike does not gate Phase 2, and if it is ever run and Tauri passes where Electron fails, that is a January decision and not a Phase 2 reversal, because D2's grounds 1 through 4 do not depend on the outcome.

---

## 6. Missing items

The test is that every item any upstream file raised must be scheduled, deferred to a named phase, or explicitly declined. These are neither.

Worth scheduling, each one line or close to it:

The announcement creator field in `bb_crawler.js`. Covered in V6. Without it, item 0.3's column is dead.

The six orphaned Storage objects. R2 punch list 13 and R3 section 6 item 13 both name them; R3 notes they become deletable the moment anyone signs in, and D2 section 2 confirms `bb_files_auth_all` already grants it. Item 0.1 creates that session. Add one sentence to item 0.5: delete the six orphans while signed in.

The `sync_stage_runs` reaper. D2 migration 010 specifies it ("a `running` row with `started_at` older than 30 minutes is presumed dead, rendered as interrupted, and marked `failed` by the next run's first statement"). Phase 4 MVP check 3 tests the UI half at fifteen minutes; nothing writes the reap. Two inconsistencies in one: the threshold differs between D1 (15 minutes, UI) and D2 (30 minutes, database), and nobody owns the statement. Assign it to item 0.6's driver as its first write, and pick one number.

The offline and paused-database state. D3 failure mode 6 asks for an explicit "database is waking up" state rather than a blank screen, and notes the risk is meaningful across Thanksgiving and winter break, which is exactly when Phase 5 runs. Nothing in the plan mentions it. Fold it into the V11 fix.

Worth deferring with a named phase:

`course_groups`, D2 migration 022. See V5. January.

The bell and announcements screen. This is the largest structural omission in the plan and it is invisible because it is spread across three phases. Item 0.3 adds `announcements.read_at` (app-owned, for the badge) and `announcements.author`. Open question 15 says the read-state decision is "needed before the bell ships, which is Phase 4 at the earliest". Item 4.1 writes `stageAnnouncements`. And no phase builds an announcements surface, and section 11 does not decline one. So two columns and a transform stage land for a screen that never ships, and R2 section 10's point that announcements are the only route to ECN.304's unannounced quizzes goes unaddressed. Decide it one way or the other: either add the bell to Phase 4 increment two as an S item reading `announcements` with `read_at is null` for the badge, or put "no announcements surface this term" in section 11 and move `read_at`, `author` and open question 15 to January. I would decline it. Eleven announcements exist, nine unread, zero for either GEO shell, and the extraction feature that would justify the screen is itself cut.

Worth declining explicitly, one line each in section 11:

The eight tentative sessions. R2 punch list 11 names them: four IST.466 rows including a 12/5 that is a Saturday and the 10/20 versus 10/22 pair, plus four IST.352 rows. Verified today, still eight. Phase 3 item 3.3 renders `sessions.session_date` and `sessions.topic` as fact, so the course page will show a class on a Saturday with full confidence. The plan's own handoff rule is "every number that reaches a pixel must be able to say where it came from". Either render `confidence <> 'confirmed'` sessions with a marker, which is one CSS class and one column in the query, or say in Phase 3 that tentative dates render as confirmed this term and why. I would take the marker; it is genuinely one line and it is the same class of bug as the Maxwell 108 room.

`assignments.bb_url` null on all 66 rows. R2 punch list 7 says the fix is re-crawl, because the crawler has `contentId` and the transform never wrote a URL. Item 3.6 works around it by pointing at the course. Nothing schedules the fix and nothing declines it. One line in item 4.1's `stageAssignments`: compose `bb_url` from `courses.bb_url` plus `contentId`, or state that deep links stay course-level this term.

The `gradeCategories` regression. R2 section 8a: the 9/2 run returned untranslated i18n keys with null weights, and both 9/8 runs returned null entirely, which R2 calls "a regression worth one line of investigation before anyone builds on it". Nothing builds on it in this plan, which is the right answer, so decline it in one line rather than leaving it hanging.

New Blackboard endpoints. R2 section 12 lists attempts with per-attempt feedback, group members, rubrics, discussions, course messages and full Ultra document bodies, and the brief's gotchas name the attempts endpoint specifically. None is scheduled and none is declined. One sentence in section 11 covers all of them: no new Blackboard endpoints this term, the crawler's surface is frozen except for the announcement creator field and the config move.

`bb_content.session_id` and `sessions.source_ref`, D2 migration 023 and R1 gap 6. Item 3.3 drops the `bb_content` path line and the provenance line, which declines them implicitly. Make it explicit in Phase 3's not-building list.

Minor, and I would let them go: the IST.323 presentation-choice 100-versus-0 decision has no column to record it (R2 punch list 20), `bb_files` 45 carries a literal `undefined` in `source_url` (R3 stage 3), and both announcement bodies and Ultra document bodies are truncated at 4000 characters by the crawler's `slice` (R2 sections 1 and 12, verified in `bb_crawler.js`). None blocks a screen in this plan.

---

## 7. Edits to make to 30_PHASED_PLAN.md, in order

1. Section 4, item 0.4. Split into 0.4a and 0.4b. 0.4a is crawler-side only: per-course try/catch, per-course status in the returned log, the empty-term guard at line 92, warnings on the truncation caps at lines 33 and 62, `termName`, `userId` and the calendar window moved to `.env`, and the announcement creator field added to the map. 0.4b is a new step written into `ingest/CADENCE_RUNBOOK.md`: the authenticated Claude session opens the `sync_runs` row with `status = 'running'` before calling `bb.runAll` and closes it from the log afterwards, writing one `sync_stage_runs` row per course. Add the sentence that `anon` has no policy on either table, so the crawler cannot own the row.

2. Section 7, item 3.4. Add `stageContent` to this item and remove it from item 4.1. Add the explicit UPDATE that sets `bb_files.superseded_by` on rows 16, 40, 58 and 35, recorded as `db/seed/006_superseded.sql`.

3. Section 8, item 4.8, and the Phase 4 MVP check 5. Delete both, and move "the course card row on Today with a two-line slot, graded N of M and the group badge from `courses.group_notes`" to Phase 5 item 5.4 as a fourth optional item.

4. Section 7, MVP check 1 and the exit criterion. Replace the ECN reading PDF with the IST.466 HBR case PDF or the IST.323 deck, and replace "a course other than IST.323" with "IST.466 or GEO.103". ECN.304 has three files total, zero reading-linked, and its only two decks are weeks 1 and 3.

5. Section 4, item 0.6. Reduce to the driver, `reconcile()`, the four types, the lifecycle writes, the envelope fold, fixtures and the `node --test` idempotency assertion, with `stageCourses` as the one implemented stage. Move `stageAssignments` to item 4.1. Add the sentence that until migration 017 exists, `attention[]` folds into `summary.attention`. Add the `sync_stage_runs` reap as the driver's first write, at one stated threshold.

6. Section 4, MVP checklist. Add a check that a signed-in publishable-key client can select from `assignments` and a signed-out one cannot. Add the double-run idempotency check. Move the crawl-kill check into the exit criterion.

7. Add a short section between sections 3 and 4 holding the plan-to-D2 migration mapping table from V10 in this review, and delete the "shifts by three" sentence in item 0.3.

8. Section 5, item 1.4. State that the assignment arm joins `effort_base b on b.type = a.type` for `category` and `glyph`, and that `v_assignment_effort` and `v_course_points_median` are not created in Phase 1.

9. Section 5, item 1.1. Add `persistQueryClient` with the localStorage persister to the stack list, and add the paused-database and offline states to the same item. Then Phase 2 MVP check 5 is testable.

10. Add a "cut order" line to Phases 1, 3 and 4. Phase 1: drop 1.2 then 1.7 to the Sep 21 week if Sep 20 is at risk; 1.1, 1.4, 1.5 and 1.6 are MVP-0 and do not move. Phase 3: move 3.6 to Phase 4's Nov 16 to 22 slack week now, and drop 3.7 if Oct 18 is at risk. Phase 4: `bb-announce-extract` comes out of item 4.7 entirely.

11. Section 11. Add four declines, one line each: no announcements or bell surface this term, and move `announcements.read_at`, `announcements.author` and open question 15 to January with it; no new Blackboard endpoints beyond the creator field; `gradeCategories` is evaluated and unused; no `bb_content.session_id` or `sessions.source_ref`. And change the `bb_files.week_no` and `session_id` backfill from "optional slack item" to "not this term", since item 4.7 cuts the skill that would do it.

12. Section 7, item 3.3. Render `sessions.confidence <> 'confirmed'` with a marker. Eight sessions are tentative today, including a 12/5 that falls on a Saturday and the 10/20 versus 10/22 IST.466 pair.

13. Section 4, item 0.5. Add a sixth correction: delete the six orphaned Storage objects while signed in, which item 0.1 makes possible for the first time.

14. Section 9, item 5.2. Move the gate query from the first week of December to the first week of November, so that a "no grade surface this term" answer reaches Stack in time to matter.

15. Section 2, conflict 3. Add two sentences: item 1.1 lays out `app/src/renderer/` from the first commit so Phase 2 adds `src/main/` beside it, and if SPIKE-BB-WEBVIEW is ever run and Tauri passes where Electron fails, that is a January decision rather than a Phase 2 reversal.

---

## Open questions for Stack

1. The announcements and bell surface is in no phase and on no decline list. Do you want one this term, or do we move `announcements.read_at`, `announcements.author` and the read-state question to January? Eleven announcements exist, nine unread, none for either GEO shell.

2. Item 0.4 asks the browser crawler to write `sync_runs`, which its key cannot do. The fix moves that write into the Claude session that runs the crawl, which means the run-status contract lives in `CADENCE_RUNBOOK.md` from Sep 13 and in the `bb-sync` skill from November. Any objection to the runbook carrying it in the meantime?

3. The Phase 3 file-open test cannot use an ECN reading, because ECN has no reading files and never will. Is opening the current IST.466 case PDF or an IST.323 deck an equally good proof that the app replaced a Blackboard trip for you?

4. Four of six phases are loaded at roughly twice the six-to-ten-hour week. My proposed cuts are the assignment popout moving from Phase 3 to mid-November, the announcement-extraction skill dropping entirely, and the course cards moving to Phase 5. Do any of those three feel like the thing you actually wanted?

## Handoff notes

For whoever applies these edits, and for whoever builds afterwards.

The blocker is V1 and it is not a documentation problem. Until the run-status row has an authenticated writer, every freshness line in every phase is built on a contract nothing fills, and the plan's own worst-case story (a freshness line reading "synced 2 hours ago" for a crawl that died after three courses) survives Phase 0 intact.

Three of the four blockers are the same shape: an item consuming something a later item creates, in a plan whose section 3 is entirely about catching that class of error. The plan caught it everywhere it was about data coverage and missed it three times where it was about code and screens. Anyone editing should re-walk items rather than trusting the phase boundaries.

The plan's re-measurement discipline stopped one file short. It corrected R1 and R2 with D3's numbers, and then adopted D3's MVP-1 acceptance sentence without checking whether the file it names exists. It does not. Re-measure the acceptance checks, not just the work items.

Do not let the Phase 0 transform item grow back. D2 calls it the single largest piece of work in the project and the plan's own handoff says the Phase 0 half exists to make the run lifecycle real and prove idempotency against a fixture. Swapping `stageAssignments` for `stageCourses` preserves both of those and removes the reconciliation judgment from the heaviest week of the term.

Phase 5's emptiness is a feature and it will be the first thing sacrificed. It is the only phase in the plan that tests whether the previous four were worth building.
