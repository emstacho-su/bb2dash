# bb2dash phased plan: what gets built, by when, and what ships at the end of each phase

Date: 2026-09-08. Agent: P1 (planning). Inputs read in full and in this order: `22_D3_risk_and_scope_review.md`, `20_D1_gui_direction.md`, `21_D2_architecture_direction.md`, `10_R1_gui_binding_audit.md`, `11_R2_data_inventory.md`, `12_R3_pipeline_and_runtime.md`. Skimmed: `gui research context/gui/README.md`, `ingest/CADENCE_RUNBOOK.md`. Verified in the repo today: `db/migrations/001..009` (nine files, no 010+), `skills/` holds two skills, `ingest/` holds no transform, current branch is `feat/phase3-ingest-cadence`, and `assignment_type` in `001_schema.sql` lines 20 to 24 has 19 values, not 18.

Owner on every work item below is Stack-with-Claude-Code unless the item says otherwise. Three items are Stack alone and are marked so, because they are settings clicks and questions Claude cannot answer.

---

## The plan on one screen

| Phase | Dates | MVP in one line |
|---|---|---|
| 0. Make the data trustworthy | Sep 8-13 (term week 3) | Nothing on screen, but a signed-in client can read typed tables, a crawl that dies says so, and five wrong facts are corrected. |
| 1. The morning list | Sep 14-20 (week 4) | Open one page and see every dated assignment and reading across all seven shells for the next 14 days, change a status, and trust the sync age. |
| 2. The shell earns itself | Sep 21-Oct 4 (weeks 5-6) | The same page runs as a Windows desktop app that opens this week's PDF in Acrobat and reveals it in Explorer without touching Blackboard. |
| 3. The course and its materials | Oct 5-18 (weeks 7-8) | Pick a course, see its week, its session topics, its readings, its files, and its AI policy, and open any file in three clicks. |
| 4. The sync loop made honest | Oct 19-Nov 22 (weeks 9-13) | After a crawl the app says what changed and what needs Stack, in typed rows he can resolve, and one button starts the crawl. |
| 5. Freeze, use, and read the grades | Nov 30-Dec 15 (weeks 15-17) | The app carries the final cluster with no new code, and every grade Blackboard has actually posted is visible in one place with the date it was seen. |
| 6. Professional-side stub | after Dec 15 | A named list of integration points and a go or no-go, not a design. |

Term week 14 (Nov 23-29) is Thanksgiving and is deliberately empty of build work. Phase 5 has no build week; it is a use-and-fix window by design.

## Revision 2, post-review

This is revision 2. All fifteen edits in `31_PLAN_REVIEW.md` section 7 are applied. The phase windows and the MVP one-liners above are unchanged; what changed is what sits inside four of the phases.

The four that matter. Item 0.4 was split into 0.4a and 0.4b, because the browser crawler holds only the publishable key, resolves to `anon`, and `anon` has no policy on `sync_runs` or `sync_stage_runs`, so as written D3's "highest-value code change in the project" could not execute; the authenticated Claude session now owns the run row, through `CADENCE_RUNBOOK.md` from Sep 13 and through `bb-sync` from November. `stageContent` moved from Phase 4 into Phase 3 item 3.4, which was consuming it five to seven weeks before it existed, and `bb_files.superseded_by` gained an explicit UPDATE because the skill D2 assigned it to is cut. The Phase 4 course card slot was deleted along with its MVP check, because it was a two-line edit against a component no phase builds; it is now Phase 5 item 5.4's first option. And Phase 3's MVP check 1 no longer names an ECN reading PDF, because ECN has three files, zero reading-linked, and never will have one.

Also applied: item 0.6 shrunk to `stageCourses` with `stageAssignments` moved whole into 4.1, taking Phase 0 from roughly 25 hours to 15, plus the `summary.attention` fold and a single 30-minute reap threshold; the Phase 0 checklist gained a signed-in-versus-signed-out read test and the transform double-run test and lost the crawl-kill to the exit criterion; section 3a now carries the plan-to-D2 migration mapping, replacing a "shifts by three" sentence that was wrong; item 1.4 states the `effort_base` join that D2's DDL does not have; item 1.1 gained `persistQueryClient` and the offline and paused-database states; Phases 1, 3 and 4 gained cut orders and apply orders; section 11 gained six declines; item 3.3 gained the tentative-session marker; item 0.5 gained the six orphaned Storage objects; item 5.2's gate moved from December to the first week of November; and conflict 3 now states the `app/src/renderer/` layout rule and that a passing spike is a January decision, not a Phase 2 reversal.

Seven additional one-line changes from review section 3, which the reviewer did not promote into the ordered list but which fix checks that provably cannot be done in ten minutes: Phase 1 checks 2 and 5 (name the three courses to compare, and set `finished_at` back 25 hours rather than waiting a day), Phase 2 check 3 (name IST.466 and ECN.304, since `assignment_id` coverage is 15 of 17 IST.466 in that window), Phase 3 check 7 (added, because nothing tested item 3.7 and an untested item is the first thing cut), Phase 4 checks 1 and 2 (compare against the transform's own output; add the double-run test; move the resolve-survives-a-run test to the exit criterion), and Phase 5 checks 1 and 4 (move the two-week observation to the exit criterion; make the backup check an actual restore). Phase 1's "25 rows" was also corrected to fifteen, counting from the Sep 14 ship date rather than Sep 8.

What the edits did and did not do to the load, priced at the review's own rates of one to two hours for S, four to six for M and ten to fourteen for L. Phase 0 drops from roughly 19 to 30 hours against a 6 to 10 hour week to roughly 15 to 22, because item 0.6 shrank by more than the 0.4 split added. Phase 4 drops from roughly 36 to 54 to roughly 31 to 44 once item 4.9 is dropped from the slack week, which is where the review projected it. Phase 2 and Phase 5 were never over. Phase 1 and Phase 3 are still at roughly twice the budget and their cut orders only take them to about 1.9, and Phase 3 in particular did not improve: edit 2 moved `stageContent` into item 3.4 at the same time edit 10 moved item 3.6 out, and the two roughly cancel, so the review's 1.5 projection for Phase 3 assumed a subtraction without its matching addition. The remaining lever in Phase 3 is item 3.2, the course page, which is the phase's L and is exercised by four MVP checks, so it cannot be cut, only scoped down on the day. Say that out loud now: if Oct 18 arrives with the course page half-built, ship the week rail and the lecture lane and defer the layout-switch-by-course-shape for IST.471, which is the only part of 3.2 that no MVP check tests except check 4.

Two things I did not do. The reviewer's new section was added as "3a" rather than as a new section 4 with everything renumbered, because every cross-reference in this file and in the final message to Stack points at sections by number and a global renumber would break them for no gain. And `assignments.bb_url` was not scheduled: review section 6 lists it as "neither scheduled nor declined", and I declined it in place, in item 4.9, where the popout's deep link stays course-level this term. Nothing else in the edit list was skipped.

---

## 1. What this plan is anchored to

Today is Tuesday 2026-09-08, term week 3 of 16. `terms.end_date` is 2026-12-15. Fourteen weeks remain and the data is worthless the day after the last final (D3 section 4).

The deadline clusters that decide the phase boundaries, all from D3 section 4's grouping of `assignments` by term week:

| Term week | Dates | Items | What lands | Effect on the plan |
|---|---|---|---|---|
| 3 | Sep 7-13 | 11 | Heaviest week of the term, and it is now | Phase 0 is SQL and settings, the work with the least design judgment |
| 4 | Sep 14-20 | 3 | IST.323 Exam 1 on 9/14 | Phase 1 builds Tue to Sun after Monday's exam |
| 5-6 | Sep 21-Oct 4 | 6 | GEO.103 Exam 1, IST.466 group presentation (100 pts), ECN.304 Exam 1 on 10/01 | Phase 2 is one increment across two calendar weeks |
| 7-8 | Oct 5-18 | 4 | Lightest window of the term (week 8 has one item) | Phase 3 gets the two best weeks |
| 9 | Oct 19-25 | 3 | IST.466 major case presentation (150 pts), IST.323 Exam 2 | Phase 4 opens with a lost week |
| 11 | Nov 2-8 | 4 | GEO.103 Exam 2, ECN.304 Exam 2 | Second lost week inside Phase 4 |
| 13 | Nov 16-22 | 1 | IST.466 major case presentation (150 pts) | Phase 4 slack week |
| 15-16 | Nov 30-Dec 13 | 9 | IST.323 final project, checkpoint, labs and both exams; ECN.304 Exam 3 on 12/08; IST.466 paper; IST.471 supervisor evaluation | Phase 5 is a freeze |
| 17 | Dec 14 | 2 | GEO.103 final exam | Term ends |

Three dates are treated as binding, from D3 section 4, and I am not arguing with any of them.

Sep 20 is MVP-0's deadline. Miss it and the app misses the first exam cluster and the first month of the term.

Oct 18 is MVP-1's deadline. Miss it and the two 150-point IST.466 presentations and IST.323 Exam 2 are managed out of Blackboard as usual.

Nov 29 is MVP-2's deadline. Anything not shipped by Nov 29 will not be used this term and should be planned as a January feature.

The builder-capacity estimate is also binding: six to ten focused hours a week concentrated on weekends, with weeks 5, 6, 9, 11, 15 and 16 largely lost, giving roughly ten productive weeks of which eight produce something shippable, and an honest unit of delivery of one increment per week (D3 section 4). Every phase below is sized against that number, not against how much fits on a page. Phase 3 carries two increments across its two clean weeks; Phase 4 carries two increments plus one droppable item parked in its slack week. Revision 2 moved work out of Phases 0, 3 and 4 for exactly this reason, and each phase now states its cut order in advance rather than leaving the cuts to be made at 1am on the deadline.

One number to sanity-check every screen against, from D3 section 1: `v_upcoming` holds 43 rows in total, 20 of them in the next 30 days, `v_overdue` holds 2, and there are 86 readings. The entire live workload surface of this application is 43 assignment rows plus 86 readings. Everything in the GUI preview was drawn against sample rows denser than reality.

---

## 2. The three conflicts, resolved

### Conflict 1. Grade display: what does the card show, and when does any grade feature enter the plan

Decision. No grade number, percentage or letter appears anywhere in the product before Phase 5, which starts Nov 30. From Phase 4 the course card's grade slot reads a count, "graded N of M items", and nothing else. The gradebook store is built in Phase 4 anyway, because storing is cheap and the history is what makes November's decision possible. The `grade_components` engine is not built this term at all.

Reasoning. R1 deep dive 3 and R2 section 13 rank 1 both recommend Blackboard's own calculated Total as the cheap close that "gives every card a real number in one migration". D3 claim 4 checked it: exactly one column across all seven shells has `isCalc = true`, it is IST.323's `Total Score`, and it currently reads 5 of a possible 104. No other shell exposes a Total or a Weighted Total, GEO.103.lecture's entire gradebook is one column named Absences, and ECN.304's is two. D3 claim 3 goes further and measures the underlying store: `effectiveScore` is non-null on 9 of 37 columns, four of those nine are attendance or absence markers, and the actual academic scores in the whole system today are IST.323 Quiz #1 at 10 and ECN.304 Quiz 1 at 9. So the "one migration, seven real numbers" close delivers one card reading 4.8 percent, one card reading "attendance 100" which means present so far and not an A (R2 punch list 10), one card reading 0 of 100 from what is probably a Qwickly placeholder (R2 punch list 9), and four blanks. That is worse than a count, and it is exactly the fabricated number D3's MVP-0 acceptance test 6 forbids. D1's own reshape of the slot concedes the point halfway by adding "graded N of M items" as line two; I am keeping line two and deleting line one until there is something to put in it. The schema is not in dispute and I adopt D2 migration 013 verbatim in Phase 4, including `bb_gradebook.is_attendance` and the append-per-run shape that buys grade history for free, and including D2's naming of the view `v_course_grade` so the GUI contract in `gui research context/gui/README.md` does not move. What moves is only the week a percentage reaches a pixel: November, with real inputs, exactly as D3 section 3 says. Whether that number is Blackboard's or ours is a Phase 5 decision made against data that exists, not a September guess.

### Conflict 2. Agent seam: `agent_requests` queue versus spawn a slash command only

Decision. Spawn only. No `agent_requests` table, no D2 migration 012, no queue badge, no four-word state machine, this term. The affordance is one control labelled "Refresh from Blackboard" that copies `claude "/bb-sync"` to the clipboard and shows a toast, and best-effort spawns `wt.exe -d <repo> cmd /k claude "/bb-sync"` when the Electron bridge is present. It ships in Phase 4 and is three lines in `app/src/main/agent.ts` plus a button.

Reasoning. D1 section 5 and D2 section 3 migration 012 both specify a durable request row with `claimed_at`, `state`, `claimed_by`, a compare-and-swap claim, a badge that changes tone after an hour, and contextual ask buttons across five screens. D3 section 3 calls that fleet infrastructure for a fleet of one, and the argument that decides it is Duo: every request kind in D1's fixed list (sync everything, refresh this course, pull files, re-map a course) requires a live Blackboard session, a live session requires a Duo push, and a Duo push requires Stack at the keyboard with his phone (R3 stage 0, `ingest/CADENCE_RUNBOOK.md` opening paragraph). So the durability the row buys is the ten seconds between the click and the terminal window opening. D1's strongest argument for the row is the badge that says "no agent session has picked this up", which is monitoring for an asynchronous system that is not asynchronous here. D2 section 7.2 concedes the same shape from the other side by ranking the clipboard fallback as "the path that always works and the one to build first". What is not in dispute and is fully preserved is the return direction of the seam: `attention_items` in Phase 4 is where anything needing Stack lands (D3 handoff, D1 rank 2), and the fixed `summary` envelope on `sync_runs` in Phase 0 is where run reports land (D2 migration 010, R3 section 4.4). Both directions are covered without a queue. The cost if this is wrong is one migration: D2's 012 is already written and can be applied in an evening the moment a request kind appears that the CLI genuinely fulfils without Stack present, which is realistically only the three browser-free skills (`bb-transform`, `bb-classify-files`, `bb-grade-snapshot`) invoked headlessly, and that is a January question.

### Conflict 3. Shell timing: full Electron layout from day one versus a Vite renderer behind a bridge with Electron in week two

Decision. D3's route. Phase 1 ships a plain Vite renderer on a pinned `localhost:5174` with every desktop-only capability behind a `window.desktop` bridge that has a working browser mock. Phase 2, starting Sep 21, adds `app/src/main/` and `app/src/preload/` around an unchanged renderer. Electron remains the committed shell for the end product; only the week the scaffold lands moves.

Reasoning. D2 section 1.1 commits to Electron on four grounds and I keep all four: the OneDrive mirror watcher is Node work, the transform must run in the CLI and optionally in the app from one file with no sidecar, a single-language project halves the surface where Claude Code makes mistakes, and `CLAUDE.md` requires anything visual to run on a local port for Stack's review. The third and fourth grounds are the ones that matter here, and note that the fourth is an argument for exactly what D3 proposes: D2 section 8 already requires the renderer to run in an ordinary browser and already requires `lib/bridge.ts` to have a mock on day one, or half the screens throw on load in the review path. So the Phase 1 renderer is not a throwaway prototype that Phase 2 discards; it is the precise artifact D2's own dev workflow demands, and Phase 2 is additive. Against that, D3 section 3 prices an Electron scaffold with a preload bridge, a dev and build split, fs and shell IPC and Windows packaging at one to two weeks of a builder's evenings before a single new pixel of course data appears, against a hard Sep 20 date thirteen days out and a six-to-ten-hour week. On that arithmetic the scaffold is a third of the entire pre-deadline budget spent on chrome. The only capability genuinely deferred by two weeks is opening a file from the OneDrive mirror in its native application, which is the shell's one irreplaceable job (D3 section 3, shell justification item 1) and which is not in MVP-0's scope anyway.

Two consequences worth stating rather than leaving to be discovered. Item 1.1 lays the directory out as `app/src/renderer/` from the first commit, per D2 section 1.2, so that Phase 2 adds `app/src/main/` and `app/src/preload/` beside it rather than restructuring; a builder in a hurry will put `main.tsx` at `app/src/main.tsx` and then lose an afternoon to the collision with `app/src/main/`. And D2 section 1.1 commits to Electron with exactly one named condition that reverses it, while D2's handoff says to run SPIKE-BB-WEBVIEW before `feat/app-shell` merges; this plan overrides that, and says so here rather than silently. If the spike is ever run and Tauri passes where Electron fails, that is a January decision and not a Phase 2 reversal, because D2's grounds 1 through 4 do not depend on the outcome.

Related and decided here so it does not float: SPIKE-BB-WEBVIEW (D2 section 5.2) does not gate Phase 2 and is not on the critical path of any phase. Electron is committed on D2's items 1 through 4, none of which depend on the spike outcome. D3 section 3 is right that a success is a bonus and a failure is late and unhelpful, and D3 claim 11 is right that the strong "MSAL blocks embedded webviews" form is unverifiable while the hedged form is fair. Run it whenever Stack is bored; if it passes, in-app download interception is a January project that would delete `CADENCE_RUNBOOK.md` step 4 outright.

---

## 3. Where I sided with D3 over R1 and R2 arithmetic

Every item here is a place where a research file's number would have produced a different plan, and D3's re-measurement changed the schedule.

The Blackboard Total. R1 deep dive 3 states it "gives every card a real number in one migration"; R2 ranks it the number one under-used asset. D3 claim 4 measured one calculated column in one course reading 5 of 104. Consequence: the grade card moves from Phase 1 or 2 to Phase 5, and the grade store becomes a data-retention item rather than a display feature.

The gradebook's real contents. R2 section 8a reports 37 live columns with `effectiveScore` and `feedback` and reads as a rich store standing behind five hand-written rows. D3 claim 3 measured `effectiveScore` non-null on 9 of 37, four of those attendance or absence markers, leaving two academic scores. Consequence: the feedback inbox (D1 rank 7, two rows of real instructor text) is not a phase; it is a byproduct of Phase 4's `bb_gradebook` and appears when there is feedback to show.

Coverage R1 declared unmeasured. R1 repeatedly cautions that `assignments.component_id`, `source_ref`, `submission`, `bb_files.local_path` and `announcements.title` are unprofiled and must be measured before anything is promised. D3 section 2 measured them: `component_id` 60 of 66, `source_ref` 66 of 66, `title` 11 of 11, `local_path` 64 of 64, `submission` unknown on only 6 of 66. Consequence: the assignment popout is better fed than R1 concluded, so it is scheduled early in Phase 3 rather than gated behind a measurement pass, and the Open-on-disk button in Phase 2 is known to work on 64 of 64 files rather than inferred to.

The reading Open affordance. R2 section 7 says ECN.304's 38 readings "are all external URLs". D3 section 2 measured 29 of 38 carrying a URL and 9 carrying none. Consequence: Phase 3's reading row needs the three-way resolution D1 rank 4 specifies (local file, then URL, then an explicit "ebook, open in Blackboard" state for the 23 GEO Orange Instant Access chapters) plus a fourth honest state for the 9 ECN rows with no route at all.

`course_maps` versions. R2 section 4 describes "versions 1 and 2 per course". D3 handoff found IST.352 at version 3 in the database with no v2 file in `maps/` at all. Consequence: anything reading the maps in a later phase reads the `course_maps` table through `v_course_map_latest`, never the repo folder, and the divergence is noted rather than reconciled.

The GEO.103.recitation room. R1 open question 9 asks Stack whether the room is Maxwell 140 or 108. D3 section 2 found `courses.group_notes` already answers it verbatim with a source citation and a date ("confirmed 2026-09-03 from the section syllabus; the seed's 'Maxwell Hall 108' was wrong") and `meetings.location` already says 140. Consequence: Phase 0 work item 0.5 applies a one-line UPDATE and tells Stack, rather than spending one of his answers on it. This is the template for a class of bug, so Phase 0 also adopts D3 sequencing trap 11's rule that `meetings.location` always wins over `courses.location`.

Two attention tables or one. R1 deep dive 6 proposes `sync_conflicts`; R3 section 4.2 and D3 section 2 propose `attention_items` with a wider `kind` vocabulary that also absorbs `stack_must_confirm` from `course_maps`. D3 handoff says build one, not both. Consequence: Phase 4 builds `attention_items` only, on D2's migration 011 DDL, and `sync_conflicts` never exists.

The tracker window. R1 section B2 and the artboards specify 56 days across eight weeks. D3 section 3 measured weekly assignment counts for term weeks 4 through 13 of 3, 4, 2, 3, 1, 3, 2, 4, 1, 1. Consequence: 56 days is on the not-building list, 14 days is the window everywhere, and readings are in the window or ECN.304 renders as a course with nothing to do.

The needs-attention counts. R1 section B5 specifies four typed counts. D3 section 3 shows conflict needs a table that needs a transform that does not exist, missing is bound to `grading_method = 'unknown'` which is not a real column name (`grading_schemes.method` is, and all six rows are `weighted_pct`, `points` or `qualitative`), and deadline has no agreed definition. Consequence: Phase 1 ships the last-sync line and nothing else; the row itself waits for Phase 4, after the transform that fills it, per D3 sequencing trap 7.

One correction that is not D3's but changes a table. R1 deep dive 1 and D2 migration 015 both say the `assignment_type` enum has 18 values; D1 section 3 says 19 and lists them. Migration `001_schema.sql` lines 20 to 24 has 19. Consequence: `effort_base` is seeded with 19 rows in Phase 1 and D1's list is authoritative over D2's insert statement.

---

## 3a. Migration numbering: this plan's numbers against D2's

D2 section 3 numbers its migrations 010 through 019 in the order it argues them, and this plan applies them in the order the phases need them, with 012 cancelled by conflict 2 and one new file at the end. The numbering does not shift by a constant and it does not shift uniformly, so a builder pasting "D2's migration 016" into the file this plan calls 013 gets the wrong DDL. This table is the mapping. Nine files land this term, 010 through 019 with no 012 gap, because the plan's numbers are contiguous by construction and only the D2 column jumps.

| This plan's file | D2's migration | What it is | Phase |
|---|---|---|---|
| `010_sync_contract.sql` | 010 | `sync_runs` columns, `sync_stage_runs`, `v_data_freshness`, minus `request_id` and the 012 foreign key | 0 |
| `011_planner_columns.sql` | 014, in part | `assignment_progress.effort_override` only; D2's two `announcements` columns are declined | 0 |
| `012_effort_base.sql` | 015, in part | `effort_base` table and its 19 seed rows only; no effort views | 1 |
| `013_work_items.sql` | 016 | `v_work_items`, minus the effort columns | 1 |
| `014_course_display.sql` | 017 | `v_course_display` with `room_disputed` | 3 |
| `015_files_current.sql` | 018 | `bb_files.superseded_by`, `link_confidence`, `v_bb_files_current` | 3 |
| `016_corpus_fts.sql` | 019 | `tsvector` column, GIN index, `search_corpus()` | 3 |
| `017_attention_items.sql` | 011 | `attention_items`, `overdue` dropped from the kind vocabulary | 4 |
| `018_gradebook.sql` | 013 | `bb_gradebook`, `v_gradebook_latest`, `v_assignment_grade`, `v_course_grade` | 4 |
| `019_ai_policy.sql` | new | `courses.ai_assist_allowed` | 4 |
| not applied | 012 | `agent_requests` | cancelled by conflict 2 |

D2's later list (020 `session_notes`, 021 `internship_hours`, 022 `course_groups`, 023 `bb_content.session_id` and `sessions.source_ref`, 024 `pgvector`, 025 dropping the `assignment_progress` fact columns) is untouched this term except 025, which is offered as a Phase 5 slack item. Every file here repeats the `enable row level security` plus `_owner_all` for `authenticated` pattern, or the app silently cannot read the table (D2 section 2).

---

## 4. Phase 0. Make the data trustworthy

Target window: Tue Sep 8 to Sun Sep 13, term week 3. Days, not weeks. This is the heaviest week of the term (11 items), which is precisely why Phase 0 is the phase with the least design judgment in it: it is settings toggles, five SQL statements, one migration and one code skeleton, and none of it needs a screen.

Goal: make it possible for a signed-in renderer to read typed tables at all, and make a crawl that dies tell the truth about it.

### MVP, verifiable in ten minutes

1. Open the Supabase dashboard, Auth, Providers, Email. "Allow new users to sign up" is off, and exactly one user exists, Stack's.
2. In a browser console on any page, create a supabase-js client with the publishable key, `signInWithPassword` as the new user, and run `select id, title from assignments limit 5`. Five rows come back. Sign out and run the same select. It returns zero rows and no error. That is the whole auth contract, provable in three minutes, and it is the one thing Phase 0 exists for: D3 sequencing trap 1 is that a renderer built against the MCP works perfectly in development and 401s on day one, and no other check in this phase tests a read.
3. Run `select status, started_at, finished_at, summary ? 'counts' from sync_runs order by id desc limit 3`. The newest row has a status, a start and a finish, and a summary with the three-key envelope.
4. Run `node ingest/transform/run.js --run-id <any existing bb_raw run_id> --dry-run` twice. Both print the same change list and both write nothing. Then run it once for real and once more: the second summary's `changes` array is empty. That is item 0.6's own stated acceptance test.
5. Run `select location from courses where id = 'GEO.103.recitation'`. It says Maxwell Hall 140.
6. Run `select count(*) from readings r left join reading_progress p on p.reading_id = r.id where p.reading_id is null`. It returns 0.
7. `courses.group_notes` for IST.466 matches whichever answer Stack gave, and the losing value is preserved in the row's notes rather than deleted.

The crawl-kill test is not here, because it needs a NetID login, a Duo push, a running crawl and a deliberate kill, which is not a ten-minute desk check. It is in the exit criterion below.

### Work items

0.1 Disable public signups and create the auth user. Where: Supabase dashboard for project `goultdzqcavefcgnifdy`, no repo change. Owner: Stack alone, five minutes. Effort S. Closes: D2 section 2, "the one thing in this document worth doing this week regardless of what gets built", and D2 open question 1. The hole is live today: every typed table carries `create policy <t>_owner_all for all to authenticated using (true) with check (true)` (`001_schema.sql` lines 303-313), the publishable key is committed on purpose in `ingest/AGENT_BRIEF.md`, and Supabase enables email signup by default, so a stranger who finds the repo can create an account and read and write everything.

0.2 Migration 010, the sync contract. Where: `db/migrations/010_sync_contract.sql`, DDL exactly as D2 section 3 migration 010 writes it: `sync_runs` gains `run_id`, `status` with the four-value check, `started_at`, `finished_at`, `trigger`, plus the `sync_runs_summary_envelope` constraint marked NOT VALID so the existing 12 rows are grandfathered; `sync_stage_runs` is created; `v_data_freshness` is created. Drop the `request_id` column and the 012 foreign key, since conflict 2 kills `agent_requests`. Effort M. Closes: D3 failure mode 1 and sequencing trap 6, R3 section 4.4, R2 section 5 (twelve rows, five different shapes for conflict information), D2 section 3.

0.3 Migration 011, the planner-owned column. Where: `db/migrations/011_planner_columns.sql`, one line from D2 migration 014: `assignment_progress.effort_override numeric(4,2)`. Effort S. Closes: R1 deep dive 1 and gap 7 (`effort_override` does not exist, confirmed by D3 claim 7 against `information_schema.columns`). D2's other two columns, `announcements.read_at` and `announcements.author`, are not added: section 11 declines an announcements surface for the term, and a column nothing reads all term is decoration. Item 0.4a still adds the creator field to the crawler's announcement map, so every crawl from Sep 13 onward carries it in `bb_raw` and a January bell has history to draw on instead of starting from nothing. Note that `effort_override` is itself a column nothing reads before Phase 5 item 5.4; it stays because it is one line in a migration that is being written anyway and because retrofitting it later means a second migration on a live planner table.

0.4a The crawler's own failure reporting. Where: `ingest/bb_crawler.js`, in `crawl()` and `runAll()`. Wrap each course in try/catch and push a per-course status into the `log` array that `runAll` already returns; add the empty-term guard (throw when `mine.length === 0`, line 92); emit a warning rather than silence when the truncation caps at lines 33 and 62 are hit; move `termName`, `userId` and the calendar window into config read from `.env`; and add the creator field to the announcement map, which today is `{ id, title, created, modified, start, isRead, body }` and drops the creator the endpoint returns. Effort S. Closes: D3 failure mode 1, called "the highest-value code change in the project" and confirmed line by line in claim 10 (one occurrence of `try` in 660 lines, not in `crawl()` or `runAll()`; `log` built locally at lines 93 to 96 and never persisted; silent truncation at lines 33 and 62), R3 stage 1 fragilities 1 through 3, D2 section 5.3, R1 matrix A and gap 10 (the author element in every bell row).

0.4b The authenticated session owns the run row. Where: a new step in `ingest/CADENCE_RUNBOOK.md`, between its current steps 1 and 2. Before calling `bb.runAll`, the Claude session inserts a `sync_runs` row with `status = 'running'`, `started_at`, `trigger` and the `run_id` it is about to use; after the call it writes one `sync_stage_runs` row per course from the returned log, asserts seven of seven courses seen, and closes the run `ok`, `partial` or `failed` with the three-key envelope. Effort S. Why this is not in the crawler: `bb_crawler.js` posts with the publishable key as both `apikey` and `Authorization: Bearer` (line 90), an unsigned publishable key resolves to `anon`, and `anon` has no policy on `sync_runs` or on `sync_stage_runs`, both of which carry only the `authenticated` `_owner_all` pattern (verified in `pg_policies`; `bb_raw` has `bb_raw_anon_insert`, `sync_runs` has only `sync_runs_owner_all`). Adding an anon insert and update policy would widen the world-writable append surface D3 failure mode 10 names and would let anyone mark any run `ok`; signing the crawler in would put Stack's database credentials into a page served from `blackboard.syracuse.edu`. The Claude session already authenticates through the MCP as the owner, so it is the only writer that can hold the contract. This step becomes the body of `bb-sync` in Phase 4 item 4.7, which is where the plan already says the skill "owns the `running` `sync_runs` row". A session killed mid-crawl leaves the row in `running`, which is exactly the state the app must render as interrupted.

0.5 The six data corrections. Where: SQL through the Supabase MCP, recorded as `db/seed/005_corrections.sql` so they are reproducible. (a) `courses.location` for GEO.103.recitation set to Maxwell Hall 140, and NOTES caveat 3 closed, per D3 section 2. (b) The IST.466 group swap applied in whichever direction Stack answers, with the losing value written to `courses.notes` rather than overwritten, per D3 claim 6 which confirmed the exact swap between `bb_raw` `payload->'groups'` (`Ethics Groups 3` id `_299090_1`, `Major Case Group 2` id `_299093_1`) and `courses.group_notes`. (c) Insert the 11 missing `reading_progress` rows at `not_started`, per R2 punch list 15 and D1 modification 3. (d) Mark the three `score_max = 0` progress rows as ungraded so nothing divides by zero later, per R2 punch list 4, naming `IST.352/knowledge-check-2026-08-26`, `IST.352/reading-ch1`, `IST.352/reading-ch1-all`. (e) Write down the rule that `meetings.location` wins over `courses.location` everywhere, in `DATA_SYNTAX.md`, per D3 sequencing trap 11. (f) Delete the six orphaned Storage objects in the `bb-files` bucket, which is possible for the first time because item 0.1 creates the signed-in session: `003_bb_files_bucket.sql` line 4 already grants `bb_files_auth_all on storage.objects for all to authenticated`, and anon has no delete policy, which is why they have sat there since 2026-09-03 (R2 punch list 13, R3 section 6 item 13, D2 section 2's correction to R3). Effort S.

0.6 The transform skeleton. Where: new `ingest/transform/` exactly as D2 section 4.1 lays it out (`run.js`, `index.ts`, `stages/`, `sql/`, `fixtures/`), plain ESM with TypeScript types, invoked as `node ingest/transform/run.js --run-id <uuid> [--course X] [--stage Y] [--dry-run]`. Phase 0 delivers the driver, the `Change` / `Attention` / `StageResult` / `Ctx` types from D2 section 4.3, the `reconcile()` primitive that encodes the reconciliation predicate once (`allowed := row.confidence in ('tentative','inferred') OR row.<field> is null`), the `sync_runs` and `sync_stage_runs` lifecycle writes, the envelope fold, fixtures copied from two real `bb_raw` payloads, and the `node --test` idempotency assertion, which is the acceptance test: run it twice against a fixture and assert the second summary has zero changes.

Exactly one stage is implemented and it is `stageCourses`, not `stageAssignments`. `stageCourses` folds seven rows of course metadata with almost no reconciliation judgment in it, which is enough to prove the driver, the lifecycle and idempotency end to end. `stageAssignments` folds 66 rows, owns the confirmed-versus-tentative predicate and carries the re-created-item logic, and item 4.1 was going to touch it regardless, so writing it whole there costs nothing and keeps the heaviest week of the term free of the plan's hardest reconciliation call. This is the single largest sizing correction the review made: it takes Phase 0 from roughly 25 hours to roughly 15.

Two behaviours the driver needs that D2 assumes a later migration provides. Until migration 017 creates `attention_items`, the driver folds its `attention[]` array into the summary under a fourth key, `summary.attention`, alongside `counts`, `changes` and `errors`. The `sync_runs_summary_envelope` constraint checks for the presence of three keys and permits extras, so this needs no schema change, and it gives item 4.2 a backfill source for the first attention rows instead of discarding every attention value the transform produces between Sep 13 and late October. And the driver's first write on every run is the reap D2 migration 010 specifies: any `sync_stage_runs` or `sync_runs` row still in `running` with `started_at` older than 30 minutes is presumed dead and is marked `failed`. Thirty minutes is the threshold everywhere in this plan, in the database and in the UI both; D1 section 4 proposes fifteen for the UI and D2 proposes thirty for the database, and one threshold stated in two places with two numbers is how they drift.

Effort L, and it is the one L item in Phase 0; it is scoped to one stage on purpose. Closes: R3 stage 2 and handoff ("there is no transform script... any plan that assumes it does is wrong", confirmed by D3 claim 1 which also confirms `ingest/classify_rules.sql` cited by `ingest/FILE_HARVEST_SPEC.md` section 4 does not exist), D2 section 4 and handoff ("the single largest piece of work in this document"). The `reconcile()` guarded list must include `assignment_progress` and `reading_progress` as tables the transform has no code path to write, which is how D3 failure mode 8's ownership boundary is enforced from the first line rather than retrofitted.

0.7 The weekly database backup. Where: a `pg_dump` into the OneDrive folder, scheduled or run by hand each Sunday alongside the cadence run. Effort S, five minutes once. Closes: D3 failure mode 11, not raised anywhere else. Every typed table exists in exactly one place today.

### The data this phase depends on being true

Nothing. Phase 0 reads no data it does not correct. The one dependency is external: item 0.5(b) cannot be applied until Stack answers the IST.466 group question, and the rest of Phase 0 proceeds without it.

### Explicitly not in this phase

No renderer, no screen, no `app/` directory. No `attention_items` (D3 sequencing trap 7: the transform that populates it does not exist yet, and building the table first ships an empty row that reads as broken). No `bb_gradebook`. No `v_work_items`. No file classification pass. No `assignment_progress` table split (see the note below). No transform stage other than `stageCourses`: `stageAssignments` is Phase 4, `stageContent` is Phase 3, and the rest are Phase 4. No `announcements.read_at` or `announcements.author` column, per section 11's decline. No work item here requires a crawl; the exit criterion uses the Sunday Sep 13 crawl that Stack runs anyway, and MVP check 4 runs against a `bb_raw` run_id that already exists.

One deliberate departure from D3. D3 sequencing trap 8 says split `assignment_progress` before the first app write path ships, not after; D2 section 3 item 025 says move the read path to `v_assignment_grade` now and drop the fact columns later, because a botched data move on the one table with human-entered content is the worst possible first migration. I am siding with D2 here and I owe the evidence. The substantive risk D3 names is the agent clobbering Stack's planner state, and that risk closes in Phase 0 item 0.6 the moment `reconcile()` lists `assignment_progress` as a table with no write path, which is earlier than either proposal's migration. What is left after that is five hand-written score rows sitting in vestigial columns, which is untidy rather than dangerous. The columns get dropped in Phase 5 or in January, once `v_assignment_grade` has been proven in the UI.

### Exit criterion

All seven MVP checks pass, and the Sunday Sep 13 crawl leaves a `sync_runs` row with a `status`, a `started_at`, a `finished_at`, seven `sync_stage_runs` rows and a three-key summary that a screen could render without interpretation. Then kill the following crawl after three courses: that row reads `running` or `partial` and never `ok`.

Apply order within this phase: 0.1 before anything that reads or writes as `authenticated`, which is 0.4b, 0.5 and 0.6; migration 010 (item 0.2) before 0.4b writes a `sync_runs.status`; 0.4a before 0.4b, since 0.4b consumes the per-course log 0.4a produces.

---

## 5. Phase 1. The morning list

Target window: Mon Sep 14 to Sun Sep 20, term week 4. IST.323 Exam 1 is Monday 9/14, so the build window is Tuesday to Sunday. This phase has a hard external deadline of Sep 20 (D3 section 4).

Goal: replace the morning Blackboard check with one page that shows everything due in the next 14 days across all seven shells, assignments and readings together.

### MVP, verifiable in ten minutes

This is D3 section 6's MVP-0 acceptance checklist, adopted without changes.

1. Cold open at `localhost:5174` shows the date, the term week, and every dated item in the next 14 days across all 7 shells, in under 3 seconds.
2. Open Blackboard, look at IST.323, IST.466 and ECN.304 for the same fourteen days, and confirm every dated item is on the list or in the undated tray. Nothing is silently absent. The Sep 14 to Sep 27 window holds 7 assignment rows and 8 dated readings, so this is a fifteen-row comparison and takes about four minutes.
3. Readings appear. ECN.304 shows its three 9/8 and five 9/15 readings, not an empty course.
4. Change a status; reload; the change persisted; run a sync afterwards and it still persisted.
5. Set the newest `sync_runs.finished_at` back 25 hours with one UPDATE, reload, and the sync line reads amber with the right age. Put it back. Waiting a day is not a ten-minute check.
6. No fabricated number appears anywhere. No grade, no percent, no effort figure whose inputs are missing.
7. Stack opens this instead of Blackboard on three consecutive mornings.

Test 7 is the exit criterion and it is not decoration. D3 failure mode 12 names "the app gets built and not opened" as the largest failure mode in the project and the only defence as each increment changing a daily behaviour and being used for three consecutive mornings before the next increment starts.

### Work items

1.1 The renderer scaffold and the sign-in screen. Where: new `app/` workspace per D2 section 1.2, React 18 plus Vite plus TypeScript, `react-router` in hash mode, `@supabase/supabase-js` v2 with types generated into `app/src/renderer/lib/db.types.ts`, TanStack Query v5 with `persistQueryClient` and the localStorage persister, CSS custom properties plus CSS Modules and no Tailwind (D2 section 1.3, on the specific ground that the artboards are self-contained HTML whose markup is the spec and porting one to CSS Modules keeps the mapping one to one). Vite pinned to port 5174 so the review URL never changes. The persister is five lines and it is not optional: it is the only cold-start cache anywhere in Phases 1 and 2, it is what makes Phase 2 MVP check 5 testable, and it is the same mechanism that covers D3 failure mode 6, the Supabase free-tier pause, which is most likely to bite across Thanksgiving and winter break, which is exactly when Phase 5 runs. With it, two error states are explicit rather than blank: an offline open shows the last fetched list with its true age and an offline banner, and a paused or unreachable project shows "the database is waking up" rather than a blank screen or an infinite spinner. The sign-in screen ships first, not last: reads require a signed-in session, so without it Stack opens localhost and sees an empty app (D2 section 8). Screen: Sign in. Effort M. Closes: R1's T-14 promoted to task zero by D1 section 6 build order, R3 section 5 option A, D3 sequencing trap 1 ("build the renderer against the MCP or a service key in dev and it will work perfectly in development and 401 on day one").

1.2 The `window.desktop` bridge with a browser mock. Where: `app/src/renderer/lib/bridge.ts` and `app/src/shared/bridge.ts`. Three capabilities declared and all three mocked: open a file becomes copy-path-to-clipboard, reveal a folder becomes a toast, spawn a terminal becomes copy-command-to-clipboard. Effort S. Closes: conflict 3 above, D3 section 3's recommendation verbatim, D2 section 8's requirement that half the screens must not throw on load in the review path.

1.3 Migration 012, `effort_base`. Where: `db/migrations/012_effort_base.sql`. One table keyed on `assignment_type`, seeded with all 19 enum values, carrying `base`, `category`, `glyph` and D1's `in_workload` boolean. Values from D1 section 3's table, which is the authoritative list; `other` gets 2 rather than 0 or undefined so the three `other` rows never render a zero-height bar, and `meeting`, `attendance` and `participation` get `in_workload = false` because attendance is not something Stack schedules time for. Phase 1 reads only `category` and `glyph`; `base` is seeded and unread until the effort question is answered. Effort S. Closes: R1 gap 8 and deep dive 1 (the map is duplicated and divergent across `13-home-v2.dc.html` line 106 and `14-course-v2.dc.html` line 102, uses `discussion` where the enum says `discussion_post`, and leaves 7 of 66 rows with no score), D3 sequencing trap 3, D1 section 3.

1.4 Migration 013, `v_work_items`. Where: `db/migrations/013_work_items.sql`, DDL from D2 section 3 migration 016, minus the effort columns until 1.3's `base` is read. Assignments union readings, with `item_kind`, `due_on` as `coalesce(due_at::date, due_date)`, `undated` as a boolean flag, and `status` coalesced to `not_started` through LEFT JOINs. The one line that matters, because pasting D2's DDL unchanged produces a missing-relation error: the assignment arm joins `effort_base b on b.type = a.type` and selects `b.category` and `b.glyph`, where D2's version joins `v_assignment_effort e on e.id = a.id` and takes `e.category`, `e.glyph`, `e.effort`, `e.is_override` and `e.multiplier_applied` from it. `v_assignment_effort` and `v_course_points_median` are D2's migration 015 and are not created in Phase 1; they and the three effort columns arrive only if Phase 5 item 5.4's effort option is taken. `v_upcoming` and `v_overdue` are left in place and the app is forbidden from reading either. Effort M. Closes: R1 gap 4 and deep dive 10 (86 readings against 66 assignments, seven of fifteen sample rows in the artboards are readings, `v_upcoming` reads `assignments` only so the R legend entry is decorative), D3 sequencing trap 2, D2 section 3 migration 016, D1 section 1.1 first change. Note that D1 calls this view `v_workload` and D2 calls it `v_work_items`; I take D2's name because D2 wrote the DDL, and I take D1's argument that nothing should read `v_upcoming` afterwards.

1.5 The Today screen. Where: `app/src/renderer/routes/Today.tsx` plus one query function per binding in `app/src/renderer/lib/queries/`. One page: header with the date, the term week derived from `terms.start_date` = 2026-08-24, and one line reading "synced N hours ago" that turns amber past 24 hours; then a flat list of the next 14 days, each row showing course code, title, glyph, date, and either a clock time from `due_at` or the `due_rule` phrase, with no invented "11:59p" for the 18 rows that have neither (R1 section B4, D1 section 1.1); then a collapsed "undated" tray for the 9 items with neither `due_at` nor `due_date`. Effort M. Closes: D3 section 6 MVP-0, R1 sections B1 through B4.

1.6 The status write path. Where: `app/src/renderer/lib/queries/progress.ts`. Click-to-edit on `assignment_progress.status` and `reading_progress.status`, optimistic against one TanStack Query cache so the same row cannot show two statuses on two surfaces (D2 section 1.3). Effort S. Closes: R1 T-06, R2 section 9 feature 1, D1 table T-06.

1.7 The undated tray. Where: same screen. A single collapsed row reading "9 items with no date", expanding to the list. The nine are named in R2 punch list 6. Effort S. Closes: R3 stage 5 (both `v_upcoming` and `v_overdue` key on `coalesce(due_at::date, due_date)` so an item with both null is in neither view and is silently invisible everywhere), D1 section 1.1 second change.

### Cut order if Sep 20 is at risk

Decided now, so it is not decided at 1am on Sep 19. Drop item 1.2 first: the `window.desktop` bridge has no consumer until Phase 2 and can be written in the Sep 21 to 27 week without touching a single MVP-0 check. Drop item 1.7 second: without the tray, the nine undated items are genuinely absent rather than collapsed, so MVP-0 check 2 needs one sentence of header copy saying so until the tray lands. Items 1.1, 1.4, 1.5 and 1.6 are MVP-0 itself and do not move. Item 1.3 stays regardless, because it is one CREATE TABLE and one INSERT and item 1.4 joins it.

### The data this phase depends on being true

`assignments` 66 rows with `title` and `type` on all of them (verified, R1 baseline). `assignments.description` on 66 of 66 (verified, R2 section 9), though Phase 1 does not render it. `readings` 86 rows with `for_date` on 76 (verified, R2 section 7), so the tray absorbs the 10 undated IST.466 HBR cases. `reading_progress` complete at 86 rows after Phase 0 item 0.5(c). `terms.start_date` = 2026-08-24 and `end_date` = 2026-12-15 (verified, R1 section B1). `sync_runs` carrying an honest `status` after Phase 0 item 0.2. Auth working after Phase 0 item 0.1.

### Explicitly not in this phase

No Electron. No effort score, no bar chart, no day columns: D3 section 6 sized this window at 13 assignment items and 12 dated readings counting from Sep 8, but counting from the ship date the Sep 14 to Sep 27 window holds 7 assignment rows and 8 dated readings, so the screen is a fifteen-row list. That is smaller than the plan's first revision assumed, which strengthens the list-not-chart decision and removes any argument for adding a second surface to this phase. No grades of any kind. No course cards. No week rail. No popouts. No materials. No bell or announcements. No needs-attention row, only the last-sync line (D3 section 3: three of the four counts cannot be fed). No search. No `attention_items`. No agent affordance.

### Exit criterion

Stack opens bb2dash instead of Blackboard on three consecutive mornings, Sep 18, 19 and 20. If he does not, Phase 2 does not start until we find out why (D3 section 6, acceptance test 7).

---

## 6. Phase 2. The shell earns itself

Target window: Mon Sep 21 to Sun Oct 4, term weeks 5 and 6. Two calendar weeks carrying one increment, because the window holds GEO.103 Exam 1, the IST.466 group presentation and ECN.304 Exam 1 on 10/01.

Goal: turn the page into a Windows desktop application that can do the two things a browser tab genuinely cannot.

### MVP, verifiable in ten minutes

1. `npm run dev:electron` opens a window titled bb2dash showing the same list, with no browser chrome.
2. Sign in once, quit the app, reopen it. Still signed in, and `userData/session.enc` exists and is not readable as plain text.
3. Open the IST.466 case item due in this window. Its spec opens in Acrobat from the mirror. Then open an ECN.304 item and confirm it shows no Open button rather than an Open button that does nothing. Naming the courses matters because `assignment_id` coverage is lopsided: of the 17 assignment-linked files in the Sep 21 to Oct 18 window, 15 are IST.466, one is IST.323, one is IST.471, and ECN.304 and both GEO shells have zero.
4. Click Reveal. Explorer opens with the file selected.
5. Unplug the network. The app still opens and still shows the last list it fetched, with the sync line reading its true age.
6. Open `localhost:5174` in Chrome. Every screen still renders; open-file has become a copy-path toast and nothing throws.

Check 6 is not optional polish. It is the `CLAUDE.md` review path, and if it breaks, Stack cannot review visual work.

### Work items

2.1 The Electron main process and preload. Where: `app/src/main/index.ts`, `app/src/preload/index.ts`, `app/electron.vite.config.ts`. Window, single instance, menu, `contextBridge` exposing exactly the three Phase 1 capabilities and nothing else. Effort M. Closes: brief decision 1, D2 section 1.1 and 1.4, D3 section 3's shell justification.

2.2 Open and reveal from the mirror. Where: `app/src/main/files.ts` and `app/src/main/mirror.ts`. Resolve the mirror root once (config, defaulting to `%OneDrive%\.fall2026\.projects2026\bb2dash\course context`), `shell.openPath` for a local file, `shell.showItemInFolder` for reveal, `shell.openExternal` for `courses.bb_url` and `bb_files.source_url`. Fall back to the Supabase Storage URL when a local read fails, and never write into the mirror. Effort M. Closes: D3 section 3 shell justification item 1 (`local_path` is 64 of 64, verified in D3 claim 2, so this works on day one), R1 matrix D file row Open, D3 failure mode 5 (OneDrive renames conflicts to `name-DESKTOP-XXXX.ext` and leaves cloud-only placeholders that read as zero-byte, so the fallback is required, and `course context/` should be marked Always keep on this device).

2.3 The encrypted session store. Where: `app/src/main/session.ts`. `safeStorage.encryptString` of the Supabase session into `userData/session.enc`, exposed to the renderer as a three-method `auth.storage` adapter, with `localStorage` as the browser-mode fallback. Effort S. Closes: D3 section 3 shell justification item 2, D2 section 2, R3 section 5 option A.

2.4 The file-to-item join, minimum viable. Where: `app/src/renderer/lib/queries/files.ts`. Join `bb_files.assignment_id` (29 of 64, verified R2 section 3) so an item that has a spec or a deck shows an Open button and one that does not shows nothing. Do not render "0 files" where the truth is "we have not linked them" (D1 section 1.2). Effort S. Closes: R1 matrix E materials list, D1 section 1.4.

2.5 The dev and review loop. Where: `app/package.json` scripts. `npm run dev` for Vite on 5174, `npm run dev:electron` pointing at it, `npm run types` regenerating `db.types.ts` from the Supabase MCP in the same commit as any migration that changed the schema. Effort S. Closes: D2 section 8, `CLAUDE.md` workflow rule.

### The data this phase depends on being true

`bb_files.local_path` populated on 64 of 64 and validated by sha256 on 60 of 60 in run 12 (verified, D3 claim 2 and R1 "things that surprised me"). `bb_files.storage_path` on 64 of 64 (verified, R2 section 3) so the fallback has somewhere to go. `bb_files.assignment_id` on 29 of 64, with the lopsided distribution R1 matrix E records (IST.466 17 of 27, IST.352 1 of 8, ECN.304 0 of 3, GEO.103.lecture 0 of 6), which is why item 2.4 is scoped to "show it where it exists".

### Explicitly not in this phase

No installer, no code signing, no auto-update, no Squirrel, no SmartScreen fight (D3 failure mode 7: high pain if built, zero if not; run from the repo or a shortcut to the unpacked exe). No embedded Blackboard webview and no BrowserView (conflict 3 above). No `chokidar` mirror watcher: `stat` on demand is enough at 64 files, and the watcher is a Phase 3 item only if a screen needs it. No new data work at all; Phase 2 touches no migration.

### Exit criterion

Stack has opened a course file from inside bb2dash, in its real application, at least once during a normal study session, and the browser review path at 5174 still renders every screen.

---

## 7. Phase 3. The course and its materials

Target window: Mon Oct 5 to Sun Oct 18, term weeks 7 and 8. These are the two lightest weeks of the term (week 7 has three items, week 8 has one), so this phase carries two increments. Hard external deadline of Oct 18 (D3 section 4, MVP-1).

Goal: give every course a page that answers "what happens in this class, what should I have read, and where is the file", with the AI policy visible on it.

### MVP, verifiable in ten minutes

This is D3 section 6's MVP-1 acceptance, extended by two checks.

1. From a cold open, reach the current IST.466 HBR case PDF or the IST.323 lecture deck for this week, opened in its real application, in three clicks and without touching Blackboard. The first revision of this check named an ECN reading PDF, inherited from D3 section 6's MVP-1 acceptance. There is no such file and there never will be: ECN.304 has three files in total, one syllabus and two lecture decks (`National Debt_v3HO.pptx` week 1 and `Social Security_v3HO.pptx` week 3), zero files carry a `reading_id`, and R2 section 7 already says ECN's readings are external links with nothing downloadable. Across the whole corpus only 13 files are reading-linked, 10 of them IST.466 and 3 GEO.103.lecture.
2. The course page for GEO.103 shows one course, not two shells.
3. Click a day in the course's week. It shows that day's items, the session topic from `sessions.topic`, and the room from `meetings`.
4. Open IST.471. The page does not render sixteen empty week cells; it renders an assignment list and says why there is no timeline.
5. Open IST.352. The AI policy is on the page, in the professor's words, without scrolling.
6. Open the Materials list for IST.466. It does not show four schedule versions and two rosters.
7. Press cmd-K, search a phrase you remember from a lecture deck, and get the file, course and slide number back in under a second, with no `[notes]` text and no `Page N` headers in the snippet.

### Work items

3.1 Migration 014, `v_course_display`. Where: `db/migrations/014_course_display.sql`, DDL from D2 section 3 migration 017 including the `room_disputed` flag. GEO.103's lecture and recitation shells merge into one display course, and the merge is solved once rather than in the pop-down, the card, the sub-bar and the M-F strip separately. Effort S. Closes: R1 deep dive 5 (four surfaces need the same merge), D3 sequencing trap 4, D1 section 6.

3.2 The course page. Where: `app/src/renderer/routes/Course.tsx`. Sub-bar with meeting pattern, room and instructor from `course_staff where role = 'instructor'`, plus the Blackboard deep link from `courses.bb_url` which is set for all 7 shells (migration 004). Week rail 1 to 16 derived from `terms.start_date` and never from `sessions`, because IST.471 and GEO.103.recitation have zero sessions (R1 deep dive 8). Ring means something is due, and a filled centre dot means an exam or a project sits in that week, both type-based and therefore honest for all seven shells on day one; the artboard's "ring = graded item due" rule gives GEO.103 zero rings for the entire semester because both GEO shells have zero non-null `points_possible` (R1 section C2, D1 section 1.2). Layout switches by course shape: a course with no sessions drops the lecture lane rather than rendering sixteen empty cells. Effort L, and it is the phase's first increment. Closes: R1 matrix C, D1 section 1.2.

3.3 The session and day detail. Where: same route, a panel not a popout. Kicker with course, `sessions.week_no`, `session_date`, the meeting window from `meetings` and the room; topic; `sessions.kind` tag; previous and next session; readings for the date via `readings.for_date = session_date`; linked assignments derived by `due_at::date = session_date`. Drops the Materials block, the `bb_content` path line and the Notes textarea, all of which are gated on links that do not exist. One rule that is one CSS class and one column in the query and must not be skipped: sessions with `confidence <> 'confirmed'` render with a tentative marker. Eight sessions are tentative today and all eight are known date problems, four IST.466 rows including a 12/5 that falls on a Saturday and the 10/20 versus 10/22 pair labelled MON/WEDS, plus four IST.352 rows (R2 punch list 11, verified still eight). Without the marker the course page shows a class on a Saturday with full confidence, which is the same class of bug as the Maxwell 108 room and violates this plan's own rule that every number reaching a pixel must be able to say where it came from. Effort M. Closes: D1 section 1.3 (the v1 Session panel), R1 matrix D, R2 punch list 11.

3.4 The Materials list, its content stage and its four preconditions. Where: `app/src/renderer/routes/CourseMaterials.tsx`, `ingest/transform/stages/content.ts`, `db/migrations/015_files_current.sql` and `db/seed/006_superseded.sql`. The migration adds `bb_files.superseded_by` and `link_confidence` and creates `v_bb_files_current`, per D2 section 3 migration 018.

Sub-item (a), `stageContent`. This stage moves here from Phase 4 item 4.1, because item 3.4's third precondition consumes it and Phase 4 is five to seven weeks after this screen ships. It is the cheapest stage to write second: `bb_content` is an agent-owned mirror with no planner state and a `path` that is unique per course, so there is almost no reconciliation judgment in it. It carries with it the check D2 section 4.3 flags: R2 section 1 reports that `bb_content.detail` holds only `file` and `url` keys and concludes `dueDate`, `points`, `gradebookColumnId` and `attemptsAllowed` are dropped before insert, while `bb_crawler.js` line 55 appears to keep all four, so the loss may be in the hand-written insert rather than the crawler and the fix may be free. Verify against a live payload before changing the crawler. Effort M.

Sub-item (b), the four preconditions D1 section 1.5 names, all of which must land with the screen. Fix the 11 rows titled `ultraDocumentBody` with a fallback to the parent path segment (R2 punch list 2, and the eleven are named there). Set `bb_files.superseded_by` explicitly, in `db/seed/006_superseded.sql`: rows 16, 40 and 58 point at the current IST.466 schedule row and row 35 points at row 37. R2 punch list 12 names all five, so this is data entry rather than judgment, and it is required because the skill D2 assigns the column to, `bb-classify-files`, is cut in item 4.7, so nothing else would ever write it and MVP-1 check 6 would fail against a column that exists and stays null. None of those four rows carries an `assignment_id`, so Phase 2 item 2.4 is unaffected by ignoring the column until now. Re-run the content transform from sub-item (a), because `bb_content.modified_at` tops out at 2026-09-02 while two crawls landed on 9/8 and neither refreshed the tree (R2 handoff, confirmed by D3 claim 12). Surface `bb_files.notes` on hover, since 45 of 64 rows carry hand-written provenance that nothing reads (R2 section 3). Effort M.

Closes: R1 T-02, D1 section 1.5, R2 sections 1 and 3, R2 punch lists 2 and 12.

3.5 The reading Open affordance, four ways. Where: `app/src/renderer/components/ReadingRow.tsx`. Resolution order: local file (13 readings have bytes), then URL (29 have one, of which ECN.304 accounts for 29 of its 38), then an explicit "ebook, open in Blackboard" state for the 23 GEO.103 Orange Instant Access chapters that have neither and never will, then a fourth plain state for the 9 ECN rows with no route at all. Do not render an Open button that does nothing. Effort S. Closes: D1 rank 4, R2 section 7, and D3 section 2's correction to R2's "all external URLs".

Item 3.6, the assignment popout, has moved to Phase 4 as item 4.9, in the Nov 16 to 22 slack week. It was the only item in this phase that no MVP-1 check exercises, and of the two untested items it is the weaker: item 3.7 gives Stack a capability he has nowhere else, full text search across 949,000 characters of course material, while 3.6 gives a nicer rendering of `assignments.description`, which he can already read in the Phase 1 list. Moving it takes these two weeks from roughly 2.2 times the budget to roughly 1.5.

3.7 Corpus search. Where: `db/migrations/016_corpus_fts.sql` and a cmd-K overlay. D2 section 3 migration 019's `tsvector` generated column, GIN index and `search_corpus()` function, filtered to `superseded_by is null`. Two display rules are mandatory: strip the running `Page N` headers and case-number watermarks that PDF extraction leaves on every HBR page, and label or strip the `[notes]` marker that PPTX extraction uses for the professor's speaker notes, because a snippet can otherwise show private instructor commentary as slide text. Effort S for the query, M with the overlay. Closes: D1 rank 1, R2 section 2 (534 units, roughly 949,000 characters, zero GUI references today). This is retrieval over files Stack already has access to, which D3 failure mode 9 explicitly distinguishes from generating content about them; the AI-policy gate in Phase 4 does not apply to it.

3.8 AI policy on the page, display half. Where: the course page. Render `grading_schemes.ai_policy` verbatim, in the professor's words, on every course page. Six of seven courses have a row. This is the free half of the Phase 4 work item and it rides here because the course page is where the text first has a home; it extends to the assignment panel when item 4.9 lands. Effort S.

### Cut order if Oct 18 is at risk

Item 3.6 has already been moved out, above. The next thing to go is item 3.7, corpus search, and MVP-1 check 7 goes with it. Nothing else in this phase is droppable: items 3.1 through 3.5 and 3.8 are each exercised by an MVP-1 check, and item 3.4's superseded-file UPDATE is the difference between check 6 passing and a column that exists and stays null. Apply order within this phase: migration 015 (item 3.4) before migration 016 (item 3.7), because `search_corpus()` filters on `f.superseded_by is null`.

### The data this phase depends on being true

`sessions` 145 rows, every one with a topic and a `week_no` (verified, R1 baseline and R2 section 10), and zero for IST.471 and GEO.103.recitation, which is why item 3.2 switches layout by shape. `meetings` 11 clean patterns covering six of seven shells (verified, R2 section 10). `course_staff` 12 rows with office hours null on 5 and email null on 2, shown as gaps rather than hidden (R2 section 10). `bb_content` 139 rows with a non-null `path` unique per course (verified, R2 section 1), refreshed by item 3.4. `grading_schemes` 6 rows for 7 courses, all confirmed, all carrying `late_policy` and `ai_policy` (verified, R2 section 6); GEO.103.recitation has none by design and its grading rolls into the lecture shell. `readings.for_date` on 76 of 86.

### Explicitly not in this phase

No `bb_files.session_id` backfill and therefore no per-session file count. At 2 of 64 the count is wrong or absent for five of seven courses and "0 files" where the truth is "we have not linked them" is worse than nothing (D3 sequencing trap 5, D1 section 1.2, R1 deep dive 8). Section 11 declines the backfill for the term. No `bb_content.session_id` and no `sessions.source_ref` (D2 item 023, R1 gap 6): item 3.3 drops the `bb_content` path line and the "syllabus v1.3.1" provenance line, and this is where that is made explicit rather than left implicit. No grades, no grade slot, no `bb_gradebook`. No `attention_items` or inbox. No effort score or tracker. No planner day or week view. No lecture Notes textarea, which needs a `session_notes` table (D2 item 020). No synthetic GEO.103.recitation sessions unless Stack asks.

### Exit criterion

Stack has used the course page to prepare for a class at least twice, and check 1 passes for IST.466 or GEO.103, which are the only courses other than IST.323 with reading bytes on disk.

---

## 8. Phase 4. The sync loop made honest

Target window: Mon Oct 19 to Sun Nov 22, term weeks 9 through 13. Five calendar weeks holding two increments, because week 9 (IST.466 major case presentation at 150 points, IST.323 Exam 2) and week 11 (GEO.103 Exam 2, ECN.304 Exam 2) are largely lost and week 13 carries the second IST.466 presentation. The usable weeks are Oct 26 to Nov 1 and Nov 9 to Nov 15, with Nov 16 to 22 as slack. Hard external deadline of Nov 29 (D3 section 4, MVP-2).

Goal: after a crawl, the app says what changed and what needs Stack, in rows he can resolve, and one button starts the next crawl.

### MVP, verifiable in ten minutes

Adapted from D3 section 6's MVP-2 acceptance.

1. Run a crawl. The Activity screen's change count and change list match what `ingest/transform/run.js` printed to the terminal, and the attention count matches `select count(*) from attention_items where state = 'open'`.
2. Run the transform twice against the same `run_id`. The second run's summary has an empty `changes` array and raises no duplicate attention rows, which is what the unique key in migration 017 is for.
3. Kill a crawl halfway. The app shows it as `partial`, not as success, and a run stuck in `running` for more than thirty minutes reads "no result, probably interrupted" rather than showing an indefinite spinner, matching the reap threshold item 0.6 writes.
4. Click Refresh from Blackboard. A terminal opens in the repo with `claude "/bb-sync"` typed, or the command is on the clipboard with a toast saying so.
5. Open IST.352 and ask the agent to summarize a reading. It refuses and quotes the syllabus.

Resolving an attention item and confirming it survives the next run needs two crawl cycles, so it is in the exit criterion rather than here.

### Work items, increment one (week of Oct 26)

4.1 The transform, remaining stages. Where: `ingest/transform/stages/`. `stageGradebook`, `stageAnnouncements`, `stageAssignments` and `stageFiles`, all on the Phase 0 driver, all idempotent, all keyed on `run_id`, all writing their own `sync_stage_runs` row. `stageCourses` shipped in Phase 0 and `stageContent` shipped in Phase 3 item 3.4(a); this item is the remainder. `stageGradebook` reads `effectiveScore` and `displayGrade->>'score'` and never `score`, which is null on all 37 column objects and is the single most expensive mistake available to whoever writes this (R2 section 8a and handoff, D1 rank 3, D3 claim 3). It stamps `assignments.bb_last_seen`, stale today on 29 rows at 9/2 and null on 32 (R2 punch list 8). `stageAssignments` is written whole here rather than in Phase 0: it folds 66 rows, it owns the confirmed-versus-tentative predicate, and it carries the re-created-item case, which is match on `(course_id, title, type)` when `bb_item_id` no longer resolves, re-point rather than insert a duplicate, and keep the old id in `notes` (D3 failure mode 3, which records that this has already happened twice: IST.352 Project 1A re-created with content `_13195312_1` and column `_3607154_1`, and the IST.466 schedule doc going Wk2x, Wk2xy, W3 in two weeks). Effort L. Closes: R3 section 6 item 4 ("the number one item on this list"), D2 section 4, D3 sequencing trap 7.

4.2 Migration 017, `attention_items`. Where: `db/migrations/017_attention_items.sql`, DDL from D2 section 3 migration 011, including the unique key on `(kind, course_id, ref, field, state)` that makes re-running the transform safe, and excluding `overdue` as a kind because overdue is a query over `v_work_items` and duplicating it gives two sources for one count. The `kind` vocabulary is `conflict`, `missing`, `stack_must_confirm`, `deadline`, `data_gap`. Seeded from three places: the transform for conflicts, `course_maps` for the 17 `course_fields` entries with `stack_must_confirm: true` and a null value plus the 44 `gaps` entries where `owner = 'stack'`, and an on-open scan for concrete holes (courses with no `grading_schemes` row, assignments with no date, readings with no `for_date`). Read the `course_maps` table through `v_course_map_latest`, never the `maps/` folder, because IST.352 is at version 3 in the database with only a v1 file in the repo (D3 handoff). Effort M. Closes: R1 deep dive 6, R2 section 4 and section 5, R3 section 4.2, D1 rank 2, D3 handoff ("build `attention_items`, and only after the transform that writes it exists").

4.3 Migration 018, `bb_gradebook`. Where: `db/migrations/018_gradebook.sql`, DDL from D2 section 3 migration 013 including `is_attendance` set by the transform on a name match, plus `v_gradebook_latest`, `v_assignment_grade` and `v_course_grade` under D2's names. Append per run, so October and November grades accumulate a history and "Quiz 1 went from ungraded to 9/10 today" is a query rather than a lost event. Effort M, and D3 section 3 prices the mirroring itself at an afternoon. Closes: R2 section 13 rank 1, D3 section 3's "what is worth doing, and it is a transform not a screen", conflict 1 above.

### Work items, increment two (week of Nov 9)

4.4 The Inbox. Where: `app/src/renderer/routes/Inbox.tsx`, plus the collapsed row on Today. One list grouped by kind, each row carrying the question, the source citation, a suggested answer where one exists, and a resolve action that writes `attention_items.state` and `resolution` as jsonb. Renamed from "Needs attention" to Inbox, because it is a queue Stack clears rather than a status light (D1 section 1.1). Stack's answers are never written directly into agent-owned tables: the app writes the resolution and the transform applies it on the next run, and a resolved item reads "answered, will apply on next sync" until it does (D1 section 5). Effort M. Closes: D1 rank 2 and section 5, R2 section 4 feature 1 ("the highest-value screen in the whole inventory that the GUI does not have").

4.5 The run report and the Refresh button. Where: `app/src/renderer/routes/Activity.tsx`. Last run, its status, and the newest run's `summary->'changes'` rendered as a plain-language list. Freshness read from `v_data_freshness` per stage, not one global timestamp: grades and announcements go stale in hours while meetings, staff and grading schemes go stale in a term, and a static surface never shows a sync indicator because doing so trains Stack to ignore all of them (R3 section 2, D1 section 4, D2 section 6). The Refresh from Blackboard control does what conflict 2 decided: clipboard first, terminal spawn best-effort, and a plain sentence saying the crawl runs inside a logged-in tab because nobody can automate past Duo. Effort M. Closes: R1 T-04, D1 section 4, D2 section 6, D3 failure mode 2.

4.6 The per-course AI-policy block. Where: `db/migrations/019_ai_policy.sql` adding `courses.ai_assist_allowed boolean`, plus enforcement text in every `skills/*/SKILL.md`, plus the display work already shipped in Phase 3 item 3.8. This is the work item D3 failure mode 9 raises and it lands here because this is the last phase in which any generative feature could ship, and because an enforcement gate has to exist before the first skill that needs it rather than alongside it. The first revision justified the placement by pointing at `bb-announce-extract`, which item 4.7 now cuts; that removes the in-phase consumer but not the requirement. Nothing in this plan summarizes or drafts course content, and the boolean is what keeps that true when something eventually does, whether that is a "what is in this week's slides" digest or announcement extraction in January. Verified from `grading_schemes.ai_policy`: IST.352 is "Zero tolerance: all generative-AI tools prohibited at every stage (research, brainstorming, outlining, polishing, any content)"; ECN.304 is default-deny, meaning no AI use is permitted for an item with no stated instructions; IST.471's iSchool appendix leaves the permitted list blank with the same default-deny fallback; IST.323 permits AI with disclosure and requires an Appendix B log on the final project. The block does three things: surfaces `ai_policy` on every course page and assignment panel, sets `ai_assist_allowed` per course from the syllabus text, and makes every skill refuse summarization and drafting for a course where it is false, quoting the policy rather than silently declining. Effort S for the column and the display, M for the skill enforcement across the roster. Closes: D3 failure mode 9, which notes this is under-weighted in all three research files and that the impact if it goes wrong is a grade and a record, which is categorically worse than any bug in the project. Cataloguing dates and mirroring files Stack already has access to is uncontroversial and stays unrestricted; generating content about those files is what the policies address, and that is the line the boolean draws.

4.7 The skills roster. Where: `skills/`. Two new skills and one amendment. `bb-sync` (browser; runs the login check, opens the `running` `sync_runs` row per Phase 0 item 0.4b, calls `bb.runAll`, posts `bb_raw`, invokes the transform, closes the run with the envelope, and writes a `stack_must_confirm` attention item on SESSION EXPIRED so a failed run is visible in the GUI instead of invisible). `bb-transform` (no browser, wraps `node ingest/transform/run.js`). And an amendment to `bb-course-pull` so it opens a `sync_runs` row with the envelope. Every SKILL.md states the rule that it never writes `assignment_progress`, `reading_progress` or a `bb_files` row with `classified_by = 'stack'`, because skills are read in isolation. Effort S. Closes: D2 section 7.3, minus `bb-classify-files`, `bb-grade-snapshot`, `planner-triage` and `bb-announce-extract`, none of which is needed by any screen this term.

`bb-announce-extract` is cut, and it is the cut that changes what item 4.6 is about. It is the only skill in the roster that no MVP-2 check exercises, its output surface (`attention_items.suggested`) works fine when fed by the transform alone, and R2 section 10's argument for it, that announcements are the only route to ECN.304's unannounced quizzes, is a January feature rather than a November one. Item 4.6 therefore no longer has an in-phase summarization consumer, which does not weaken it: the block is a precondition, and it must be in place before the first skill that drafts or summarizes ships, whenever that is.

Item 4.8 is deliberately absent. An earlier revision put a course card grade slot here, scoped as a two-line edit at effort S, against a component no phase builds: Phase 1 says "No course cards", Phase 2 adds no screens, and Phase 3 builds a course page, which is a different surface. Building the card row properly is six cards from `v_course_display` with a two-line slot, which is M and does not fit increment two. So the graded count is one line in item 4.3's read path, rendered in the Phase 3 course page header where a header already exists, and the card row moves to Phase 5 item 5.4 as its first optional slack item.

### Work item, slack week (Nov 16 to 22)

4.9 The assignment popout, moved here from Phase 3 item 3.6. Where: `app/src/renderer/components/AssignmentPanel.tsx`. This is the best-fed surface in the product and it ships whole: `description` on 66 of 66 with a median of 86 characters, `component_id` on 60 of 66 so the "Labs, 4 x 5 = 20" sub-line resolves, `series_key` giving ten real series including IST.323 quizzes 1 through 10, `grading_schemes.late_policy` on all six schemes, and the full planner block including `est_minutes`, `priority`, `planned_start`, `planned_finish` and `notes`. Landing it here rather than in Phase 3 also means it can render the score, the feedback text and the "Blackboard says SUBMITTED, you marked in progress" disagreement from `v_assignment_grade`, which did not exist in October. Two removals: "3 attempts", because `attemptsAllowed` does not survive into `bb_content.detail`, and "moved to 9/9 in v1.3.1", because the structured conflict record now exists in `attention_items` and the popout can link to it instead of restating prose. One standing limitation: "Open in Blackboard" points at the course, labelled as such, because `assignments.bb_url` is null on all 66 rows and this plan does not schedule the fix (R2 punch list 7; deep links stay course-level this term). It also picks up item 4.6's `ai_policy` display. Effort M. Closes: R1 matrix E, D1 section 1.4, D3 section 2 (R1's caution about unmeasured coverage is stale), D1 rank 7 (the feedback that nothing in the GUI shows today).

### Cut order if Nov 29 is at risk

`bb-announce-extract` is already out of item 4.7. The next thing to go is item 4.9, which is in the slack week precisely so that it can be dropped without moving anything else. After that, item 4.5's per-stage freshness degrades to a single last-sync line, which is what Phase 1 already ships. Items 4.1, 4.2, 4.3, 4.4, 4.6 and 4.7 do not move: 4.1 through 4.4 are MVP-2 itself, 4.6 is the academic-integrity gate, and 4.7 is what makes a crawl repeatable.

Apply order within this phase: migration 018 (item 4.3) before item 4.1's `stageGradebook` runs, and migration 017 (item 4.2) before the transform writes its first attention row. Both migrations therefore precede 4.1 even though 4.1 is listed first.

### The data this phase depends on being true

`bb_raw` payloads carrying `gradebook`, `announcements`, `content`, `groups` and `schedule` per course, three runs deep (verified, R2 section 8). The gradebook's real value living in `effectiveScore` and `displayGrade.score` with `score` null on all 37 columns (verified, R2 section 8a, D3 claim 3). `course_maps` holding 44 gaps and 46 `course_fields` of which 17 carry `stack_must_confirm: true` with a null value (verified, R2 section 4). `grading_schemes.ai_policy` present on all six rows (verified, D3 failure mode 9). A `sync_runs` row that says `running` before the first fetch, from Phase 0.

### Explicitly not in this phase

No `agent_requests` table (conflict 2). No grade percentage anywhere (conflict 1). No `grade_components` engine, no what-if projection, no letter grades. No effort score or bar chart unless Stack has answered that he will enter `est_minutes`, in which case it is a Phase 5 slack item and not a Phase 4 commitment. No embeddings and no `pgvector`. No `bb_files.session_id` backfill. No announcement extraction and no announcements or bell surface (section 11). No Planner day or week view. No in-app chat, no streaming agent output, no agent write path into `assignment_progress` or `reading_progress` under any circumstance including a one-time backfill.

### Exit criterion

A crawl run on Sun Nov 22 produces a run report Stack reads instead of reading a transcript, and at least one `attention_items` row has been raised, resolved by Stack, applied by the transform, and stayed resolved through the following run.

---

## 9. Phase 5. Freeze, use, and read the grades

Target window: Mon Nov 30 to Mon Dec 15, term weeks 15 through 17. Nine assignment items land in weeks 15 and 16 (IST.323 final project, checkpoint, labs and both exams; ECN.304 Exam 3 on 12/08; IST.466 paper at 100 points; IST.471 supervisor evaluation at 100 points) and two more on Dec 14 (GEO.103 final exam). This is the phase the whole plan exists to serve, and it contains no new features by design.

Goal: the app carries the heaviest fortnight of the term without a code change, and the grade question is finally answered against data that exists.

### MVP, verifiable in ten minutes

1. Open the Grades view. Every score Blackboard has actually posted is listed, per course, with the date it was seen and the instructor's feedback text where there is any.
2. Nothing on that view is computed by us. Every number carries the label "Blackboard's number, as of <date>".
3. For IST.471 the view says the grade is not computable and why, rather than showing a zero.
4. `pg_restore --list` on the previous Sunday's dump enumerates every typed table, and a restore into a scratch database returns the same row counts as `DB_VIEWS_2026-09-08.sql` plus whatever the term added. A restore you have never attempted is not a backup.

"The app opens every day from Nov 30 to Dec 13 and no new screen has appeared" is a two-week observation, not a ten-minute test, so it is the exit criterion.

### Work items

5.1 The freeze. Where: nowhere. No migration is applied and no feature merges between Nov 30 and Dec 13 unless something is broken. Effort S, and it is the hardest item in the plan to actually do. Closes: D3 section 4 ("anything not shipped by Nov 29 will not be used this term"), D3 failure mode 12.

5.2 The grade read-out, if and only if there is data. Where: `app/src/renderer/routes/Grades.tsx`, reading `v_gradebook_latest` and `v_assignment_grade` from Phase 4 item 4.3. One row per graded item, not per course: score, possible, the date it was seen, and `feedback` where it exists. Per-course headline only where `is_calc` is true, which today is IST.323 alone. Attendance columns excluded from any headline and shown, if at all, as a separate chip, because ECN.304 Attendance reading 100 of 100 means present so far and GEO.103.recitation reading 0 of 100 is probably a Qwickly placeholder. An explicit not-computable state for IST.471's qualitative 70/30 model, where any number is fiction. Gate: run the query in the first week of November, not December. Build the screen only if `bb_gradebook` holds more than ten non-attendance scores. Running the gate in November rather than December is the whole point of moving it: if it fails, the answer is not to skip the screen quietly, it is to tell Stack in November that no grade surface is coming this term, so he does not spend December waiting for one. The store stays worth building either way, because the history cannot be backfilled. Effort M. Closes: conflict 1 above, D3 section 3 ("revisit the display in November with real inputs, and only then decide between Blackboard's number and ours"), R2 sections 6 and 8a, D1 section 1.5.

5.3 The term-end snapshot. Where: a `pg_dump` plus a copy of the OneDrive mirror, both dated, both off the working set. Effort S. Closes: D3 failure mode 11, and the plain fact from D3 section 4 that the data is worthless the day after the last final, which makes the archive the only thing with residual value.

5.4 Optional slack items, in priority order, only if Phase 4 finished early and only one of them. Effort M each. Pick zero or one.

First, the course card row on Today, displaced from Phase 4 item 4.8: six cards from `v_course_display`, each with a two-line slot carrying "graded N of M items" from `v_course_grade.graded_items` and a group and section badge rendering `courses.group_notes` verbatim as text, after item 0.5(b) has corrected it. The badge renders a string and not a typed table on purpose: `courses.bb_group_id` and `bb_group_set_id` are single-valued and IST.466 holds two groups from two different group sets (R2 section 8b, D1 rank 8), so a correct badge would need D2's migration 022 `course_groups`, and a migration for two rows is not worth it this term. No percentage, no letter, no attendance figure on the card, ever (conflict 1 above, R2 punch list 9 and 10).

Second, the 14-day effort bar over `v_work_items` with `effort_base.base` and D2's `v_assignment_effort` and `v_course_points_median`, gated entirely on Stack having answered that he will enter `est_minutes` (D3 open question 6: if not, the tracker becomes a plain item count, which saves a week and loses nothing real).

Third, dropping the vestigial `assignment_progress.score`, `score_max`, `letter`, `graded_at`, `submitted_at` and `feedback` columns now that `v_assignment_grade` has been proven in the UI (D2 item 025).

The `bb_files.week_no` and `session_id` classification pass was a fourth option in the first revision and has been removed; see section 11, where it is declined for the term.

### The data this phase depends on being true

That grades actually landed in October and November. This is the phase's whole premise and it is unverifiable today: two academic scores exist across seven courses as of Sep 8 (D3 claim 3). Item 5.2's gate is written as a query rather than an assumption for exactly that reason.

### Explicitly not in this phase

Everything. No new screens, no new migrations, no refactors, no dependency upgrades, no styling pass. The styling pass that `gui research context/gui/README.md` lists as still open is a January item.

### Exit criterion

The app opened and the list was right every day from Nov 30 to Dec 13, and no new screen appeared in that window. The term ends on Dec 15 with the snapshot on disk and a written note of what Stack actually used versus what got built, which is the input to any January decision.

---

## 10. Phase 6. The professional-side stub

Target window: after Dec 15. No dates, because the term is over and the deadline pressure that shaped every phase above is gone.

Goal: name the integration points for the Styberg and ITS internship side, so a January decision is a decision rather than a discovery. No design, no schema, no screens.

### MVP, verifiable in ten minutes

Stack reads a two-page memo and can answer one question: is the professional side a January project, a summer project, or never. The memo names tables, not features.

### What generalizes, named only

The obligation-and-plan pair. `assignments` holds facts with a due date, a type, a source and a confidence; `assignment_progress` holds Stack's status, priority, planned dates, estimate and notes; `v_work_items` unions them with a second kind. That triple is domain-neutral already. A work deliverable is an obligation with a date and a status, and the only school-specific column on `assignments` is `points_possible`, which is nullable and null on 26 of 66 rows today anyway.

The sync and trust layer. `sync_runs`, `sync_stage_runs`, `v_data_freshness` and the three-key summary envelope describe any ingest from any source. Nothing in them mentions Blackboard.

The attention queue. `attention_items` with kinds `conflict`, `missing`, `stack_must_confirm`, `deadline` and `data_gap` is a general "the system knows it does not know" queue. Its `course_id` foreign key is the only school-specific thing about it.

The document corpus. `bb_files`, `bb_file_text`, the storage bucket, the local mirror layout from `bb_file_relpath()`, and `search_corpus()` describe a filed, hashed, text-extracted document set with a local mirror. The `bb_` prefix is the only thing tying them to Blackboard, and renaming is cosmetic.

The effort primitives. `effort_base` keys on `assignment_type`, which is school-flavoured, but the base-and-category shape is not.

### What a `domain` column would touch

If `courses` gains `domain text check (domain in ('school','work'))` rather than a second container table, the change reaches: every table carrying a `course_id` foreign key, which today is `assignments`, `readings`, `sessions`, `meetings`, `announcements`, `bb_files`, `bb_content`, `grading_schemes`, `grade_components`, `course_staff`, `course_maps` and `attention_items`; both view layers, since `v_work_items` and `v_course_display` would need a domain filter or a domain column passed through; the top nav, which would need a switch or a merged view and a decision about whether Today shows both domains at once; and `effort_base`, if work items get their own types. RLS policies do not change, because there is one user and every policy is already `to authenticated using (true)`. The naming does change: a professional container is not a course, so `courses` would be doing double duty under a name that lies, which is the kind of thing that costs a week eighteen months later.

### What stays school-specific and does not generalize

`ingest/bb_crawler.js` and the `bb_raw` payload shape, which are bound to `/learn/api/v1` and to a Blackboard session cookie. `grading_schemes` and `grade_components`, including all six aggregation behaviours. `terms` and every piece of week-number arithmetic that hangs off `terms.start_date`. `sessions` and `readings`, which describe a class meeting and an assigned text. The academic values in the `assignment_type` enum (`exam`, `final_exam`, `quiz`, `lab`, `discussion_post`, `participation`). The AI-policy block from Phase 4 item 4.6, which is a syllabus concept.

One thing that is already professional-side and is worth naming: IST.471 is the ITS internship, it has no meetings and no sessions, its grading is qualitative 70/30, and `internship_hours` (D2 item 021) is the table it wants. If the professional side ever happens, IST.471 is the natural first tenant of it, and the 150-hour requirement is the natural first feature.

### Explicitly not in this phase

No migration. No `domain` column applied. No screens. No decision made on Stack's behalf.

### Exit criterion

Stack has read the memo and said January, summer, or never.

---

## 11. What we are deliberately not building this term

A grade engine with rank-weighted and normalized aggregation. The engine is six aggregation behaviours (`manual` 7, `single` 16, `sum` 8, `average_drop_lowest` 2, `rank_weighted` 1, `normalized` 1, measured by D3 section 2 and correcting R2 section 6), two of which are single instances and both hard: ECN.304's exams at `rank_weights [30,25,20]` are order-dependent and non-linear in any individual exam, and IST.323's quizzes normalize to 5 across 10 expected items. Seven `manual` components cannot be computed from item scores at all, and IST.471's qualitative model makes any number fiction. R2 calls it effort L; D3 says it would consume a month. The decisive argument is not cost, it is that there is nothing to compute: two real scores exist across seven courses in week 2, most courses will not post a grade before October, and an engine built in September operates on an empty set and cannot be tested.

`pgvector` and embeddings. The corpus is 534 rows and 949,271 characters, verified. That is roughly a quarter of a model context. An `ilike` scan is instantaneous and stays instantaneous if the corpus triples. `pgvector` costs an extension, an embedding pipeline, a chunking decision, a re-embedding story on every new file and an API bill, to make a sub-millisecond query faster. Phase 3 item 3.7 uses Postgres full-text search, which is itself probably over-build here. A second reason: the corpus carries PPTX speaker notes inline, so a semantic index would happily surface the professor's private notes in a result.

A local SQLite cache. The whole typed layer is roughly three megabytes serialised. Fetch on open, hold in memory via TanStack Query, persist to `localStorage` for cold start and offline. `better-sqlite3` is a native module and reintroduces a rebuild step this project does not currently have (D3 section 3, R3 section 3.5).

An embedded Blackboard login on the critical path. It would delete `CADENCE_RUNBOOK.md` step 4 outright along with the `<uuid>.tmp` claim heuristic and the PowerShell move, which is the single largest simplification available to the ingest pipeline. It is also weekly pain rather than daily pain, it removes a step that already works, and it is the highest-risk component in the build: an Entra plus Duo flow inside a third-party Chromium is exactly the configuration the WebView2 conditional-access issue tracker is full of, and if it fails it fails late and unhelpfully. Timebox a 90-minute spike whenever Stack is bored, treat a success as a bonus, and never let anything on the critical path assume it (D3 section 3, D2 section 5.2, R3 section 3.2).

An installer, code signing and auto-update. Squirrel installers, code signing and SmartScreen warnings are a multi-day detour for a single machine. Run from the repo with `npm run dev:electron`, or a shortcut to the unpacked exe (D3 failure mode 7). This is contingent on Stack's answer to how he wants to launch the app; if he insists on a taskbar-pinned exe, `electron-builder` producing an unpacked directory plus a shortcut is the cheapest thing that satisfies it, and still not an installer.

The 56-day, eight-week tracker window. Verified weekly assignment counts from term week 4 through 13 are 3, 4, 2, 3, 1, 3, 2, 4, 1, 1. An eight-week horizontal bar chart of a two-item week is whitespace with a legend. Fourteen days is the window everywhere, and readings are in it or ECN.304 renders as a course with nothing to do (D3 section 3).

An in-app chat assistant. Ruled out by Stack's decision 2 in `00_AGENT_BRIEF.md`, and reinforced by conflict 2 above. The CLI is the agent; the GUI is the read and plan surface. No streaming output, no reply pane, and no request kind that the CLI side does not actually implement, because a button that files a request nothing handles is worse than no button (D1 section 5).

Also not building, for the record: `sync_conflicts` as a second table beside `attention_items` (D3 handoff); a Planner day or week view, since `planned_start` and `planned_finish` are null on all 65 progress rows so the work-windows lane is an empty column with a hint (D1 table T-01); T-09 internship hours, T-10 session notes, T-11 series strip as a separate screen, and the Grades nav destination as anything more than Phase 5's read-out; a scheduled crawl task, because a scheduled Claude task reports SESSION EXPIRED on most firings (D3 failure mode 2, R3 section 3.3); anything built on the Blackboard `calendarItems` endpoint, which R2 section 8c verified is 23 gradebook echoes with null locations and creation timestamps masquerading as due dates; and the public GitHub repo, which stays private this term because `bb_file_text` carries PPTX speaker notes, the IST.466 roster files carry 28 and 29 classmates' names, the HBR cases are licensed, and the committed publishable key plus the anon insert policies is a world-writable append endpoint (D3 failure mode 10).

Six more declines, each one line, because an item that is neither scheduled nor declined is an item that gets built at 1am.

No announcements or bell surface this term. Eleven announcements exist, nine unread, zero for either GEO shell, and the extraction feature that would have justified the screen is itself cut from item 4.7. `announcements.read_at`, `announcements.author` and open question 15 move to January with it, which is why Phase 0 item 0.3 adds neither column. Item 0.4a still teaches the crawler to capture the creator field, so a January bell has history rather than starting empty. This was the largest structural omission in the first revision: two columns and a transform stage were landing for a screen no phase built.

No `bb_files.week_no` and `session_id` classification pass. The first revision offered it as one of three optional Phase 5 slack items, which was a decline dressed as an option, because item 4.7 cuts `bb-classify-files`, the skill that would perform it. Say it plainly: not this term. No screen in this plan depends on it, and it needs no Blackboard access whenever it is picked up (D3 sequencing trap 5, R1 gap 2).

No new Blackboard endpoints. R2 section 12 lists gradebook attempts with per-attempt feedback and rubric results, group members, rubrics, discussions, course messages and full Ultra document bodies. The crawler's surface is frozen this term except for the two changes in item 0.4a, the announcement creator field and the config move.

`gradeCategories` is evaluated and unused. The 9/2 run returned untranslated i18n keys with null weights and both 9/8 runs returned null entirely, which R2 section 8a calls a regression worth investigating before anyone builds on it. Nothing builds on it, so it is closed rather than left hanging.

No `bb_content.session_id` and no `sessions.source_ref` (D2 item 023, R1 gap 6). Phase 3 item 3.3 drops the two elements that would need them.

No `course_groups` table (D2 item 022). IST.466 holds two groups from two group sets and `courses.bb_group_id` is single-valued, so the typed fix is real, but Phase 5 item 5.4 renders the corrected `courses.group_notes` string instead, which is honest and free. January.

The iCal feed is not on this list and is not in any phase either. It is the only genuinely unattended data path available (R3 section 3.3, D2 section 6 lane 1) and it costs one visit to the Blackboard calendar settings gear, but nobody has ever seen it return an event. It is captured as an open question, and it becomes a plan input the day a fetch returns events and not before (D3 handoff).

---

## 12. Open questions for Stack

Deduplicated across all six upstream files. Questions whose answer does not change this plan have been dropped, including R1 question 9 on the GEO.103.recitation room, which the database already answers with a source citation and which Phase 0 item 0.5(a) simply corrects.

### Answer before Phase 0, which means this week

1. May I disable public email signups on the Supabase project and create your one auth user from the dashboard? Today every policy is `to authenticated using (true)`, the publishable key is committed on purpose, and Supabase enables signup by default, so anyone who finds the repo can create an account and read and write the whole database. This is a settings toggle and it blocks every phase. (D2 open question 1 and 3, R3 open question 3, D3 open question 5.)

2. IST.466 groups. Blackboard's `payload->'groups'` says Ethics Groups 3 (`_299090_1`) and Major Case Group 2 (`_299093_1`); your `courses.group_notes` says Ethics Case Group #2 and Major Case Group #3. The numbers are exactly swapped. Which is right? This selects which HBR case you present and which of the 10/20-versus-10/22 and 11/17-versus-11/19 slots is yours, and the app will show whichever it reads with full confidence. (D3 open question 4, D1 open question 1, R2 open question 1.)

3. Migrations: may I apply the same rule to schema changes that you apply to main, meaning I write the DDL in `db/migrations/NNN_name.sql` on the branch, show it to you, and apply it to Supabase only when you say so in that conversation? A `git revert` does not un-apply DDL. (D2 open question 5.)

3a. The browser crawler holds only the publishable key, which resolves to `anon`, and `anon` has no policy on `sync_runs`, so the crawler cannot write its own run-status row. The fix (item 0.4b) moves that write into the Claude session that runs the crawl, which means the run-status contract lives in `ingest/CADENCE_RUNBOOK.md` from Sep 13 and moves into the `bb-sync` skill in November. Any objection to the runbook carrying it in the meantime? The alternative, an anon insert and update policy on `sync_runs`, would let anyone who finds the repo mark any run `ok`. (Review open question 2.)

4. The morning question. When you open bb2dash at 8am on a Tuesday, what is the first thing you want answered? This plan assumes it is "what is due and what needs me" and builds Phase 1 as a work list. If the honest answer is "what happens in class today and what should I have read", Phase 1 is a day schedule instead and the whole shape changes. This is the single highest-leverage question in the list. (D1 open question 21.)

### Answer before Phase 1, which means by Sep 14

5. Readings in the main work list, yes or no? ECN.304 has 38 readings against 6 assignments. Without readings, ECN reads as a course with nothing to do, and weeks 4 through 13 average three items across all seven courses. This changes what Phase 1 looks like more than any other single decision. (D3 open question 3, D1 open question 7, R1 open question 5.)

6. The nine undated assignments: visible in a collapsed tray, or hidden until dated? Three are yours to resolve (SitN group and date, individual presentation), three should arrive from Blackboard (IST.471 a7, IST.466 AI team assignment, IST.352 term project), three are deliberate placeholders. (D1 open question 9, R2 open question 6.)

7. The two permanently overdue rows: `IST.352/team-request` due 8/30 and `IST.466/ethics-vs-activity` due 9/1, both still `not_started`. Were they done? They sit red from launch day otherwise. (D1 open question 5, R2 open question 4.)

8. Overdue definition: `v_overdue` excludes the three items you marked `missed`, so they vanish from the count. Should missed items keep counting until you resolve them? (D1 open question 6, R1 open question 3.)

9. Are you willing to have no grade surface at all until November? Two real academic scores exist in the entire gradebook today, and only IST.323 exposes a computed Total, reading 5 of 104. If yes, Phases 1 through 4 get materially simpler and nothing real is lost. (D3 open question 1, D1 open question 3, D2 open question 6, R1 open question 1.)

10. Can Phase 1 ship as a localhost Vite page you open in your browser, with Electron wrapping it starting Sep 21? The end product stays a desktop app; this only decides whether week one produces a usable list or an empty window. (D3 open question 2.)

11. How does the app get launched: `npm run dev:electron` in the repo each time, or a built executable pinned to your taskbar? This decides whether packaging is in scope at all this term. (D3 open question 8.)

### Later, before Phase 3 or Phase 4

12. Can you grab the Blackboard Ultra calendar iCal share URL? It is the only unattended refresh path in the whole architecture and it costs one visit to the calendar settings gear. Nothing in this plan depends on it, and nothing will until a fetch returns actual events. (D2 open question 2, R3 open question 2, D1 open question 17.)

13. AI policy enforcement. IST.352 is zero tolerance at every stage; ECN.304 and IST.471 are default-deny. Do you want the app and the skills to hard-block summarization and drafting for those courses, warn you, or stay silent and leave it to you? Needed before Phase 4 item 4.6. (D3 open question 7.)

14. Will you actually enter `est_minutes` or an effort override for four consecutive weeks? All 65 progress rows are null on every planner field today. If not, say so now and the effort tracker becomes a plain item count, which saves a week and loses nothing real. Needed before Phase 5 item 5.4. (D3 open question 6, D1 open question 8, R2 open question 5.)

15. The announcements and bell surface is in no phase, and section 11 now declines it for the term. Do you want one, or do we move it to January along with `announcements.read_at`, `announcements.author` and the read-state question (should the bell believe Blackboard's `is_read`, or your own app-side `read_at`, which means you clear an announcement twice if you read it in Blackboard first)? Eleven announcements exist, nine unread, none for either GEO shell. My recommendation is January. If you want it this term it is an S item in Phase 4 increment two and it displaces item 4.9. (D2 open question 7, D1 open question 10, R3 open question 5, review open question 1.)

16. How often do you want the app to prompt you to sync during a class day? The default in this plan is once at app open and never again in a session, with no timers and no badge that counts up. (D2 open question 9, D1 open question 19, R3 open question 7.)

17. GEO.103.recitation's Attendance column reads 0 of 100 with an attempt recorded 9/4. Qwickly placeholder, or a real zero? Needed before Phase 5 item 5.2, not before. (R2 open question 2, D1 open question 4.)

18. Public repo before December, yes or no? If yes, key rotation, dropping the anon insert policies, and a second look at the roster files and the mirror all have to be scheduled. This plan assumes no. (D3 open question 10, D2 open question 11, R3 open question 6.)

19. Do you want to spend 90 minutes on SPIKE-BB-WEBVIEW? You have to be present for the Duo push. If it passes, the file harvest loses its worst three steps; if it fails, we stop wondering. Nothing in this plan depends on the answer. (D2 open question 4, R3 open question 1.)

20. IST.471: no meetings, no sessions, qualitative 70/30 grading, no supervisor name, no start date, no weekly hours. Phase 3 drops its week rail and lecture lane. Is an hours log in scope at all this term, and if so will you enter the start date and schedule? (D1 open question 11, R1 open question 7, R2 open question 7.)

21. Five superseded IST.466 documents are marked superseded only in `bb_files.notes` prose. May Phase 3 add a `superseded_by` column and hide them from Materials by default with a "show all versions" toggle? (D1 open question 20.)

22. PPTX text extraction includes the professor's speaker notes inline with a `[notes]` marker, and Phase 3's search will surface them. Stripped from snippets, labelled, or shown as-is? (D1 open question 16, R2 open question 10.)

---

## Handoff notes

For whoever builds from this, in the order they will trip over it.

Phase 0 has no visible output and it is the phase most likely to get skipped under time pressure. Skipping it produces D3's exact failure: a renderer that works perfectly against the MCP in development and returns 401 on day one, a freshness line that reports "synced 2 hours ago" for a crawl that died after three courses, and a first app write path that lands on a table the agent still writes to.

The three MVP deadlines are external and they do not move. Sep 20, Oct 18, Nov 29. Every phase boundary above is placed to hit one of them with the lightest available week doing the work.

One increment per week is the unit, and no phase in this plan carries more than two plus a droppable item in a slack week. Anything phrased as "the tracker plus the course page plus auth" is a three-week item pretending to be a sprint (D3 section 4). Each build phase states its cut order before the phase starts; use it rather than improvising one on the deadline.

The transform is the largest single piece of work in the whole project and it is split three ways: Phase 0 item 0.6 (driver, `reconcile()`, the lifecycle writes, the envelope fold, fixtures, and `stageCourses` alone), Phase 3 item 3.4(a) (`stageContent`, because the Materials screen consumes it), and Phase 4 item 4.1 (the rest). Do not let the Phase 0 part grow back: it exists to make the run lifecycle real and to prove idempotency against a fixture, not to fold everything, and swapping `stageAssignments` for `stageCourses` is what keeps the heaviest week of the term free of the plan's hardest reconciliation call.

Nothing in this plan reads `v_upcoming` or `v_overdue`. Both stay in the database for compatibility and both are forbidden to the app, because two views meaning almost the same thing is how the pop-down count and the card's Open count end up disagreeing on the same screen.

Every number that reaches a pixel must be able to say where it came from. No grade before Phase 5, no effort figure before Stack has entered inputs, no "last seen in Blackboard today" while `assignments.bb_last_seen` is stale on 29 rows and null on 32, no "0 files" where the truth is "we have not linked them", and no invented "11:59p" for the 18 rows that carry neither a `due_at` nor a `due_rule`.

The single largest failure mode is not technical. The app gets built and not opened. Every phase's exit criterion is written as a use test rather than a build test for that reason, and Phase 1's exit criterion is three consecutive mornings. If it fails, stop and find out why before starting Phase 2.
