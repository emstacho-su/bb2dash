# bb2dash — Project State

> Updated upon each PR. Last update: **2026-09-22** (**sprint 1 closed** — see "Sprint 1 — closed"; planning docs reorganised by sprint under `docs/planning/`, index in `docs/planning/README.md`; Phase 13 skipped; sprint 2 intake open). Earlier the same day: Inbox feedback loop, automation half: `/inbox-apply` skill, migration 090 archived state live, first run archived 31 rows, Inbox "Apply answers" button; **PR open**, [PR #23](https://github.com/emstacho-su/bb2dash/pull/23) on `feat/inbox-apply`; row 16 under "What has been done"). Before that, **2026-09-21** (Phase 12b **tail PR open**: recurring planner events, planner popover + assignment page, migrations 082–083, 088–089 live; row 15 under "What has been done"). Earlier the same day (post-merge reconciliation, PR #21): Phase 12b fine-tooth-comb pass MVP **merged**, [PR #20](https://github.com/emstacho-su/bb2dash/pull/20), `6f20a00`, 2026-09-17, production deployed; row 14 under "What has been done"; its post-MVP tail — recurring events, small popover — waits for Stack's go; the crawler v4 proof sync has not run yet). Earlier on 2026-09-17: Phase 12 Electron shell **merged**, PR #19. Before that, 2026-09-16 (post-merge reconciliation), Phase 10b grade model + what-if **merged**
> ([PR #15](https://github.com/emstacho-su/bb2dash/pull/15), `c1e471d`, production deployed: engine `web/src/lib/grade-model/`, "Our model" on `/grades` and the
> course Grades tab, what-if + target solver + "Counts toward…" picker + score history;
> migrations 057–058 and 080–081 live; V-1 stubbed by Stack, so the model leaves out parts with
> unsure links; PM browser walk 7/7 + round 3 done; merged after 11b; phase worktrees and every merged
> branch, local and remote, removed). Phase 11b planner events **merged** the same day ([PR #14](https://github.com/emstacho-su/bb2dash/pull/14)
> + display follow-up PR #16: `planner_events` created on `/planner` and pushed to the `bb2dash`
> calendar; migrations 067–069 live; `calendar-push` v5 live). Phase 10a grades **merged** earlier the same day (PR #13:
> gradebook mirror `bb_gradebook` + `bb_attempts`, five grade views, `/grades` and the course
> Grades tab, popout submission block, staged-upload drop zone, crawler v3 with the attempts
> probe, bb-sync step 4b; migrations 046–056 live; Stack's 9/16 sync verified the mirror side).
> Phase 11 planner + calendar + bell **merged** the same day (PR #12: `/planner` week grid,
> Google Calendar push, announcements bell and page; migrations 060–066 live; Stack signed off
> the six-step acceptance script on 2026-09-16). Phase 9 merged 2026-09-15 (PR #10), Phase 8
> 2026-09-14 (PR #8). Convention: see root `CLAUDE.md`.

## Where the product is

**Backend foundation complete and live; GUI v1 deployed; retrieval polished; course page rebuilt Classroom-style (Phase 8); sync loop live (Phase 9); gradebook mirrored and shown as Blackboard's numbers, submissions catalogued, staged uploads (Phase 10a); planner week grid, Google Calendar push and announcements bell (Phase 11); planner events created in bb2dash and pushed to Google (Phase 11b); grade model, what-if and target solver on the Grades screens (Phase 10b).**
The Blackboard → Supabase pipeline, typed warehouse, document corpus, and two-tier search API
are all in prod. The Next.js hub app (`web/`) — all four v1 screens — is merged to `main`
(PR #4) and deployed to Vercel at `https://web-xi-ten-uy9xk6c6p0.vercel.app`; the owner account
has signed in successfully. RLS is owner-scoped (W-9, migration 020). Search now returns the
passage that matched (not the unit head) and hides superseded document versions by default
(Phase 7, live in prod). Phase 6 is fully closed: Stack signed off the live screens and
disabled signups on 2026-09-10.

Live in prod (Supabase `bb2dash`, ref `goultdzqcavefcgnifdy`):

| Layer | State |
|---|---|
| Raw capture | `bb_raw` crawls via `ingest/bb_crawler.js` **v3** (anon insert, unique per run/kind/shell; `crawler.version = 3` envelope; attempts + attempt-files probe with a `keys` list; `runAll({ runId })`); last pull 2026-09-16 (run `c877b0cc-…`, 48 gradebook columns — made with v2 from the `main` checkout, so no `attempts` key yet). Folded automatically: `transform_tick()` on pg_cron every 2 min stages only crawls registered on an owner-claimed `agent_requests` row; unregistered runs are quarantined once |
| Typed warehouse | migrations 001–058, 060–069, 073–089 (repo numbering; see note below; all on `main` and live); **`grade_scenarios`** (one saved what-if per scheme course) and **`grade_column_links`** (Stack's column → part links and "Not graded"), both owner-only, never touched by a sync; views `v_grade_model_items` (77 items: 41 item + 5 attendance + 31 placeholder on 9/16), `v_grade_model_total` (`bb_running` read from the total's formula; IST.323 true), `v_gradebook_history` (5 changed columns); 7 courses, 80 assignments, 145 sessions, planner tables; `attention_items`, `agent_requests`, `app_settings` (+ `gcal_*`, `web_base_url`), `calendar_events` mirror (keyed `(source, ref_id)` since 068), `calendar_push_runs`, `v_calendar_push_items` (assignment + planner arms), **`planner_events`** (owner-only, own IANA zone per row, 0 rows until Stack creates some), `v_announcements_unread`; **`bb_gradebook`** (append-per-run mirror: 45 rows from the 9/14 crawl + 48 from 9/16; IST.323 total 14.8/104), **`bb_attempts`** (empty until the first v3 crawl); every public view `security_invoker`, anon revoked |
| Gradebook mirror (10a) | `stage_gradebook` + `stage_attempts` in `run_transform` after `stage_assignments`; `v_gradebook_latest` (`column_kind` item / attendance / total / calc_other / letter, `assignment_id`, `linked_assignments`, `counts_toward_grade`), `v_assignment_grade`, `v_course_grade`, `v_attempts_latest`, `v_assignment_attempts`; registered runs only; reconciliation 45/45 columns and scores against `bb_raw` on the 9/14 crawl; every figure carries `seen_at`, nothing summed |
| Effort model | migration 015 `effort_base` (19 types) + 016 `v_work_items` (152 items, effort + source) |
| Document corpus | 64 files (100% in Storage + local mirror + sha256), 534 text units extracted; 4 stale IST.466 files marked `superseded_by` (migration 022) → `v_bb_files_current` = 60 |
| Search: FTS | tsvector+GIN on file text / content / announcements; `search_file_text(…, p_include_superseded)` |
| Search: vectors | 1,195 gte-small embeddings (384-dim), 100% coverage; `part_range` = code points, audit clean (023); `match_file_text()`, `hybrid_search_file_text()` (`p_min_similarity` floor, single-source `similarity`, **matched-passage `snippet` + `part_no` + `snippet_source`**, superseded filter — migrations 012–013, 021, 024–025); keyword snippets come from the highest-`ts_rank` part that actually contains the query, ~27 ms at limit 12 |
| Edge functions | `embed-corpus` **v5** (resume-safe batch embedder; chunks by code point), `search` **v5** (retrieval API; **default mode: hybrid**; optional `min_similarity` floor; optional `include_superseded`), `calendar-push` **v5** (Google Calendar upsert/delete by deterministic event id — `bb…` for due dates, `pe…` for planner events; planner body carries the kind in the title, a per-kind colour, `✓` on a done task, `dateTime` + `timeZone` or an all-day date pair; both sides read page by page, a partial read aborts; `verify_jwt` off, `x-push-secret` from Vault; fired by pg_cron `bb2dash-calendar-push` when `app_settings.gcal_dirty`) |
| Retrieval MCP | `mcp-server/` — stdio MCP server for Claude Code: `search_materials` (+ `include_superseded`) / `get_material_text` / `list_courses`; 86 vitest tests |
| GUI (`web/`) | Next.js 16 + TS, Supabase Auth. Screens: Today (56-day fetch, 14 visible, ◂ ▸ paging; needs-attention row from `v_sync_status`), Course = Stream / Classwork (Blackboard folder tree, `?view=timeline` keeps the week rail) / Grades (Phase 10a) / Info, Materials, ⌘K search, `?item=` assignment + session popouts, **courses sidebar** (☰ toggles it; on the right, `--sidebar-side` flips; overlay drawer under 1024px), **Inbox** (`/inbox`, resolve + why-note per row), Sync button (enqueues `agent_requests`, copies `claude "/bb-sync <id>"`), Activity list, **Grades** (`/grades` by course: "Blackboard's number, as of <seen_at>" / "Blackboard publishes no total" / "not synced yet"; item rows with status pill, `score / possible`, seen, feedback disclosure; uncounted attendance, letter and non-total calculated columns in a collapsed group), **course Grades tab** (same table for the course's shells), **popout submission block** (status, attempt N of M, pulled-back and staged files with a sha256 match chip; no score), **staged-upload drop zone** (popout + Classwork rows → Storage + `bb_files` row, "Staged in bb2dash — attach in Blackboard ↗"; no control reads "Submit"), **Planner** (`/planner?week=`, Mon–Sun week grid: class blocks with room + session topic, due items by New York wall clock or nested in their class block, Assignments band, today + now-line, quick-edit, click-to-popout; **planner events** (Phase 11b): click an empty half-hour slot or an Events-band cell → `PlannerEventForm` (six kinds, zone picker, in-person or online location, notes, course), per-kind blocks placed by New York wall clock with a zone chip for other zones, task checkbox, Events band for all-day, edit/delete from the block), **bell** (unread badge from `v_announcements_unread`; opening marks seen), **Announcements** (`/announcements`, all courses newest-first), public `/privacy` + `/terms` (for the Google consent screen), **grade model** (Phase 10b: "Our model" line under Blackboard's number on `/grades` and the course tab — graded so far, zeros on the rest, best case, agreement with Blackboard from an enum, or a not-computed sentence naming why; course tab adds what-if cells (points, or % on pointless placeholders), "Not in Blackboard yet" placeholder rows, target solver, Reset scenario, "Counts toward…" picker, score history); vitest 1336 tests |
| Auth | one user (`emstacho@syr.edu`, uid `fd0b7c9d…`) created; **RLS owner-scoped** (migration 020, W-9 done) — every authenticated policy is `auth.uid() = public.app_owner()`, owner resolved by email; signups still to be disabled |

## What has been done (by phase)

1. **Phase 1 — data syntax + syllabus seed** (pre-repo, 2026-09-02): schema design, 6 grading
   models as declarative rules, facts-vs-state separation, source/confidence on every row.
2. **Phase 2 — Blackboard capture** (2026-09-02/03): crawler over Ultra's internal JSON API,
   course maps, full file harvest + text extraction via bb-course-map / bb-course-pull skills.
3. **Phase 3 — audit + search schema** ([PR #1](https://github.com/emstacho-su/bb2dash/pull/1),
   merged 2026-09-09): extract audit (`AUDIT_2026-09-09.md`), backfilled drifted migrations
   005–009, migration 010 search layer.
4. **Phase 4 — embedding POC** ([PR #2](https://github.com/emstacho-su/bb2dash/pull/2),
   merged 2026-09-09): gte-small via edge functions, $0; corpus fully embedded; eval verdict
   in `EVAL_EMBEDDING_POC.md` — hybrid hit@1 9/10 vs FTS 1/10; hybrid is the hub default.
5. **Phase 5 — Retrieval MCP** ([PR #5](https://github.com/emstacho-su/bb2dash/pull/5), merged
   2026-09-09, by the concurrent session): migrations 012–013 (`hybrid_search_file_text` gains a
   `p_min_similarity` vector-arm floor and a real, single-source `similarity` column), `search`
   edge function v3 (forwards `min_similarity`, de-dups vector parts per unit), and `mcp-server/`.
6. **Phase 6 — GUI v1** (`feat/gui-v1`, [PR #4](https://github.com/emstacho-su/bb2dash/pull/4)
   open, 2026-09-09/10): stack decided Next.js on Vercel + Supabase Auth, no Docker (Docker-first
   local plan superseded — see reconciliation doc). Migrations **014–019** (planner columns,
   effort model, work items, course display, files-current, sync contract — renumbered from
   012–017 on 2026-09-10 after merging main; see
   `docs/planning/sprint-0-foundation/41_RECONCILIATION_gui_vs_retrieval-mcp.md`). Four screens built by parallel
   Opus workers in isolated worktrees: Today (14-day effort tracker), Course (week rail + lanes +
   AI policy), Materials (signed-URL Open ladder), ⌘K hybrid search (0.80 "keyword match" label +
   speaker-notes scrubbing; verified compatible with search v3 — same result columns). Full tree
   typecheck + build green after the merge. Recovered local planning round in `docs/planning/`.
   Merged 2026-09-10 (`aef5dee`); W-9 RLS hardening landed right after as migration 020.
7. **Phase 7 — Retrieval polish** (`feat/retrieval-polish`, 2026-09-10; brief and frozen
   contract in `docs/planning/sprint-0-foundation/50_PHASE7_retrieval_polish.md`, evidence in
   `51_W10_VERIFICATION.md`). Two Opus workers on their own branches/worktrees, PM-integrated.
   **021** `matched_snippets`: `hybrid_search_file_text` returns the passage that matched —
   `ts_headline` (plain text) over the best embedding part's slice for FTS-arm hits, that slice's
   head for vector-only hits — plus `part_no` / `snippet_source`; all three search RPCs gain
   `p_include_superseded boolean default false`, filtering before ranking. **022**
   `supersede_stale_files`: seeds `bb_files.superseded_by` for the four stale IST.466 documents
   (schedules 58→16→66, 40→66; roster 35→37), matched by sha256, justified from `notes`/`bb_raw`.
   **023** `part_range_repair`: clamps the one overrun (text 276, an astral-plane emoji) and
   asserts the invariant. `embed-corpus` v5 chunks over code points (root cause). `search` v4
   accepts `include_superseded`. MCP server + ⌘K palette consume the new fields; `web/` gets its
   first test harness (vitest + Testing Library). `/code-review` (high) then confirmed against
   prod that 021 cut keyword-arm snippets from the *vector-best* part, which often did not contain
   the keyword (5 of 10 rows for "attendance policy"); **024** `snippet_fixes` picks a part whose
   slice covers the tsquery (whole-unit headline otherwise; `part_no` = the part the snippet was
   cut from, null for the fallback), trims torn leading words, keeps `[notes]` labelled when the
   marker precedes the slice, limits before the joins, and makes the keyword-mode headline plain
   text; **025** `snippet_part_rank` ranks covering parts by `ts_rank` (vector-best part breaks
   ties). `/security-review`: no findings. Live-verified after 025: "final exam date" on the
   16-part IST.323 syllabus returns part 16 ("Scheduled Final Exam Day 12/15/26") instead of the
   instructor's office hours; "attendance policy" has 0 of 10 snippets missing the keyword;
   superseded schedules absent by default, present with the flag. Tests: web 40, mcp-server 88.
8. **Phase 8 — Course dimension** (PR #8, **merged 2026-09-14**): three Opus
   workers (W-12 db, W-13 tabs, W-14 shared) on worker branches, PM-integrated. Migrations
   **026–029**: `stage_content(run_id)` (idempotent fold of `bb_raw` content into `bb_content`,
   title fallback for `ultraDocumentBody`, run once → 11 junk titles down to 1), `v_course_stream`
   + `v_content_tree` (security_invoker, anon revoked), `courses.card_note` (280-char check) with
   `v_course_display` recreated as security_invoker, `stage_content` off the REST surface. Web:
   `/course/[id]/{stream,classwork,grades,info}` routes, `UpcomingTracker` extracted with 56/14
   paging, route-driven popouts (`?item=assignment:<id>` / `session:<id>`), Home card note,
   Materials → Classwork link. `database.types.ts` regenerated. Review round: 10 findings fixed
   (cache fan-out for status edits, card-note draft/280 cap, planner form no longer wiped
   mid-type, tree nests by `parent_id`, tracker loading/error states, guarded queries, midnight
   roll-over, typed client, one `FileOpenAction` ladder); security review clean. Stack's preview review: the
   content column left a gap on the right (1240px cap, uncentered) → ☰ pop-down replaced by a
   courses sidebar, main fills the width; vitest 265 tests. Findings routed to Phase 9:
   `bb_raw.bb_course_id` is `courses.bb_id` (not `bb_course_id`); every view from 001–025 runs
   as owner and bypasses RLS (fix = migration in Phase 9's range). Parked: IST.466 publishes two
   identical folder paths; the `(course_id, path)` key keeps one (5 rows counted as duplicates).
9. **Phase 9 — Sync loop** (`feat/sync-loop`, PR #10 open, 2026-09-10/14): two Opus workers (W-15 db +
   scheduler, W-16 web + ingest), PM-integrated. Migrations **030–039**: bucket private (030),
   `attention_items` + seeds (031), `agent_requests` (032), announcements `author`/`read_at`/
   `modified_at` (033), SQL transform stages `stage_courses/assignments/announcements/files/gaps`
   + `bb_resolve_course()` (034), `run_transform` / `transform_tick` / reaper / `ical_poll` /
   `app_settings` / `v_sync_status` + pg_cron (035), **11 views → security_invoker** (036),
   `stage_files` replay guard (037), advisor fixes (038), registered-run authorisation + `bb_raw`
   unique index + quarantine grace (039), freshness view ignores skipped/quarantined rows (040,
   post-security-review). Review round (041–044): open-only dedupe index, "Keep mine" answers
   stand until Blackboard's value changes, `applied_at` only when a fact was written,
   missing-file marker measured across registered crawls and reversible, `ical_collect()` on
   every tick (pg_net ttl is 6 h), `apply_resolutions()` run by transform requests, Activity
   list filters ical and quarantine rows, Inbox shows resolve errors. Live sync 2026-09-14 (run 35:
   7 courses, 17 items raised, answers applied by a transform request within one tick) found two
   follow-ups, fixed in-PR: **045** `question_date_text` (date-only due dates in conflict text
   printed a day early) and the Sync button reuses an open `sync` request instead of filing a
   second one (the tick never closes `kind = sync` rows). `bb_url` still null:
   assessment items carry no `detail` in the crawl (crawler change, later). First fold of the 9/8 and 9/2 crawls: 93 attention rows
   (conflict 11, data_gap 14, missing 16, stack_must_confirm 52), zero duplicates on replay, a
   resolution applied end-to-end in all three shapes. Web: Inbox, needs-attention row, Sync
   button, Activity (vitest 117 tests); crawler announcements mapper (creator key unverified until a live crawl);
   `skills/bb-sync` (claim → crawl → register run_id → wait → close). Runbook steps 3 and 5
   automated. Stopped/deferred: `stage_courses` never writes `meetings` (no schedule payload
   shape seen yet); `announcements.author` null until the crawler key is confirmed live.
10. **Phase 10a — Grades: mirror, screens, submissions** (`feat/grades-10a`, [PR #13](https://github.com/emstacho-su/bb2dash/pull/13), **merged 2026-09-16**;
   brief + frozen contract + Stack's ten answers in `docs/planning/sprint-1-hub/briefs/67_PHASE10A_grades.md`,
   evidence in `66_W17_VERIFICATION.md`). Two Opus workers (W-17 db + ingest, W-18 web) on
   their own branches and worktrees, PM-integrated from a phase worktree. Migrations **046–051**:
   `bb_gradebook` + `stage_gradebook` (append per run, keyed `(run_id, course_id, column_id)`,
   reads `effectiveScore`, classifies `column_kind`), the three gradebook views, `classifier`
   gains `blackboard`, `bb_files.source_url` nullable + `attempt_id` + anon insert refuses
   submissions, `bb_attempts` + `stage_attempts` + two attempt views (files catalogued into
   `bb_files` under `my_submissions`, bytes pulled by bb-sync step 4b), `run_transform` gains the
   two stages and the Activity feed three grade sentences. Live on the 9/14 crawl: 45 columns
   mirrored, 7/7 courses reconcile by count and score, replay inserts 0. Crawler v3: attempts
   endpoint with a `keys` probe, assessment-field probe (`detailSource`), versioned envelope,
   `runId` on `runAll`; the key names stay unverified until Stack's acceptance crawl (every
   login needs his Duo). Web: `queries.grades.ts` (tested helpers for every state), `/grades`,
   course Grades tab, `GradebookTable`, `CourseGradeCard`, `SubmissionBlock`, `UploadDropZone`,
   Materials shows staged rows; `database.types.ts` regenerated; typecheck/build green, vitest
   530 (after round 2), mcp-server 88. Fixtures for 3 courses + a synthetic attempts payload under
   `db/fixtures/phase10a/`; SQL tests under `db/tests/` roll back against prod. Review round
   (`/code-review main high`, ten confirmed findings; the `/security-review` skill cannot launch
   in this shell, so the PM's manual pass covered the upload path, RLS, grants, invoker views and
   the 049 check): **052–056** — `bb_file_relpath` gives pulled-back files an `attempt-<id>/`
   segment so they cannot collide with a staged file of the same name, and 049's check no longer
   passes on two nulls (052); `stage_files` never marks a `my_submissions` row missing (053);
   `stage_gaps` does not raise a gap for a pulled-back file whose bytes are still to come (054);
   `v_assignment_attempts.attempts_allowed` encodes unlimited from `attempts_left = -1` and
   `stage_attempts` parses attempt dates tolerantly (055); `stage_gradebook` counts score changes
   only when the run is the newest crawl (056). Web: the popout's grade query filters on
   `assignment_id` (the view has no `id` — a blocker caught before any preview), `attemptsAllowed`
   helper, orphaned Storage objects removed on a failed insert, `useId` for the drop zone, the
   staging code split into `queries.submissions.ts`, typed client throughout. bb-sync registers
   `run_id` after the crawl again (register-first would let the tick fold a slow crawl partially).
   **Acceptance 2026-09-16:** Stack's sync (run `c877b0cc`) folded 48 columns, posted 5 new
   grades and moved IST.323's total to 14.8/104, all shown on `/grades`; it ran the v2 crawler
   from the `main` checkout, so the attempts probe and step 4b wait for the first post-merge
   sync. Stack: "looks good for now", then "merge".
11. **Phase 11 — Planner, Google Calendar push, bell** (`feat/planner-11`, [PR #12](https://github.com/emstacho-su/bb2dash/pull/12), **merged 2026-09-16**; brief
   and frozen Contract in `docs/planning/sprint-1-hub/briefs/69_PHASE11_planner.md`, evidence in `69a_W21_VERIFICATION.md`).
   Two Opus workers (W-21 db + calendar, W-22 web) on their own branches, PM-integrated in a separate
   worktree because the main checkout was Phase 10a's. Migrations **060–066**: `calendar_events`
   mirror + `calendar_event_id()` + `v_calendar_push_items` (event instant resolved in SQL: `due_at`,
   else class start for a date-only project/exam/final_exam, else 11:59 PM New York; absence from
   the newest folded crawl computed per course) (060); `app_settings.gcal_*`, `calendar_push_runs`,
   statement trigger marking the calendar dirty on any `assignments` change (061);
   `calendar_push_tick()` on its own pg_cron job one minute off the transform tick, `calendar_push_now()`
   (062); `v_announcements_unread` + `mark_announcements_seen()` over 033's `read_at` (063); Vault
   doors `calendar_secret_set` / `calendar_secrets`, service_role only (064); 065 corrects
   `absent_from_blackboard` to compare `bb_last_seen` with the crawl row's `captured_at` (the
   Contract had said the fold's `started_at`, which flagged 22 of 64 items absent) and uses the
   schema's `0 = Sunday` weekday convention; 066 (code-review round) ties the in-flight lock to
   the run (`gcal_push_run_id`), clears `gcal_dirty` when the tick picks the work up rather than
   when the push ends (a change landing mid-push is no longer lost), and adds
   `app_settings.web_base_url` for the event links. Edge function `calendar-push` v3 (fetch
   client, no SDK; `status: confirmed` in every event body because Google keeps a deleted id in a
   cancelled state and a bare patch would leave a re-added item invisible; orphan rows whose `calendar_id` changed are deleted from the old calendar; insert / patch / delete diff against the mirror; zero
   writes when unchanged; `privateExtendedProperty app=bb2dash`; fixed `colorId` per course).
   `scripts/google-consent.mjs` (loopback OAuth, PKCE, stores four secrets through the RPC; Stack
   runs it once). Web: `/planner`, bell, `/announcements`, `/privacy`; `database.types.ts`
   regenerated. R-16 recorded the Inbox way: SITN presentation `2026-11-04 15:45` (Stack's choice,
   applied by a transform request); IST.466 Group #3 day within each presentation pair is not
   published, rows stay tentative. Tests: web 467 (from 345), function 31 (`node --test`). After Stack's walk (round 4): the band is labelled "Assignments", a due item inside its own course's class window renders as a chip inside that class block, hover or focus raises an overlapped block, and every due card is clickable as a whole and opens the assignment popout. Push set today: 62 of 64 dated workload items; the two IST.323 final-project rows that share one Blackboard item are counted absent (see Known issues) and are not pushed.
   **Live proof done 2026-09-15** (`69a` §9): Stack's Cloud project lives under his Gmail (SU's
   Workspace blocks student projects), the calendar in `emstacho@g.syr.edu`; consent stored via
   the script; run 1 inserted 62, run 2 zero writes, run 3 one patch + one delete, repair run
   after the cancelled-id fix patched 62 once, then zero writes again; Google-side count by
   extended property = 62 = mirror. `gcal_enabled` is true; the push runs on its own tick from
   here on. Announcement `author` stays
   "not recorded": the live crawl carries no creator key and the crawler is 10a's file this sprint.
12. **Phase 11b — Planner events** (`feat/planner-events-11b`, [PR #14](https://github.com/emstacho-su/bb2dash/pull/14), **merged 2026-09-16**; brief, frozen
   Contract with Stack's five answers, PM kickoff notes K-1..K-11 and the round 2 table in
   `docs/planning/sprint-1-hub/briefs/69b_PHASE11B_planner_events.md`; evidence in `69c_W23_VERIFICATION.md`). Two Opus
   workers (W-23 db + push, W-24 web), PM-integrated from a phase worktree while Phase 10b ran in
   another PM session. Migrations **067–069**: `planner_events` (six kinds, instants + own IANA
   zone checked by trigger against `pg_timezone_names`, all-day rows as local midnights with an
   exclusive end, in-person or http(s)-only online location, `done` for tasks only, optional course,
   owner-only RLS on four verbs, dirty trigger) (067); `calendar_events` renamed to `(source,
   ref_id)` and `v_calendar_push_items` v2 with a planner arm computing summary, zone, dates and the
   week link in SQL (068, applied inside a cut-over: push off → 068 → v4 → one push with zero writes
   on the 64 existing events → push on, 3 min 37 s); the zone lookup skipped on an update that keeps
   the zone (069, round 2: a task tick 47 ms → 0.1–0.5 ms). `calendar-push` v4 then **v5** (round 2:
   paged reads that abort on a partial side, mirror write errors thrown, writer split into
   `store.ts`); kind colours Event 9 / Task 1 / Out of office 4 / Focus time 8 / Working location 2 /
   Appointment slot 5, pending Stack's nod. **Live proof 2026-09-16** on the real calendar (runs
   17–24): 9 SQL-inserted test rows (one per kind + Los Angeles + all-day + online) → 9 inserts,
   zero-write re-run, time move + ✓ on a ticked task (2 patches), timed→all-day + cleared location
   (2 patches), 9 deletes, zero-write re-run; due-date events 0 writes in every run; end state Google
   64 = mirror 64, no planner rows. Web: `planner-zone.ts` (Intl-only, Temporal `compatible` fold/gap
   rule), `planner-events.ts` (validation mirroring 067), `planner-events-grid.ts` (New York
   placement, per-day segments, 08:00–22:00 clamp), `queries.plannerEvents.ts` (optimistic, per-row
   rollback), `PlannerEventForm`, blocks, Events band, roving-tabindex slots; `database.types.ts`
   regenerated after 068. Review: `/code-review main high` 15 findings → 13 fixed in round 2
   (R2-1..R2-13), the missing docs are this update, and 068's rename is recorded in DECISIONS as a
   one-off exception to "additive"; `/security-review` no findings. Tests: web 790 (from 652),
   function + consent 51 (from 31), mcp-server 88. **Browser acceptance walk 2026-09-16** (PM in
   Playwright on the preview, at Stack's request; Google side read through the push function's
   client because the browser held his personal Google account): all eight script steps pass —
   six kinds created from empty slots and the Events band, each on Google 5–118 s after saving,
   a time move and a ticked task patched, a Los Angeles event at noon New York with `timeZone`
   Los Angeles, the online link safe in both, six UI deletes gone from Google, due-date events 0
   writes in every run (runs 25–29), Google 64 = mirror 64 at the end. Two layout fixes from it:
   a zone chip no longer covers the title (block lines never shrink; chip and link share a line),
   and a half-hour block is one row led by its title (`isCompactSegment`). Three Phase 11 display
   issues the walk also found are fixed on the stacked follow-up `fix/planner-display` (merged as PR #16 right after #14): React #418 on every `/planner` load (the grid hydrates inside Suspense
   after the persisted query cache is restored, so its first client render had rows the server
   HTML lacked — confirmed on the preview by clearing the cache; `useHydrated` renders the same
   placeholder on both sides, then the grid), the "Assignments" band label clipped to "GNMENTS"
   (now vertical), and a due item nested in its class block drawn over its own title and status
   (class lines keep their height; the chip is two lines). Web tests 792.
13. **Phase 10b — Grade model, what-if, score history** (`feat/grades-10b`, [PR #15](https://github.com/emstacho-su/bb2dash/pull/15), **merged 2026-09-16**; brief,
   frozen Contract, Stack's four answers and rounds 1b/1c/2 in `docs/planning/sprint-1-hub/briefs/68_PHASE10B_grade_model.md`,
   evidence in `68a_W20_VERIFICATION.md`). Preconditions: 10a on `main` and 18 scored item columns
   held; **V-1 sign-off waived** — Stack stubbed V-1 as a data-accuracy task. Stack's answers: the
   strict rule stands (an unscored hand-graded part hides the model), a "Counts toward…" picker
   for columns no rule is attached to, parts with unsure links left out, graded-so-far headline.
   Two Opus workers: W-19 engine (`feat/grades-10b-engine`) and W-20 db + web
   (`feat/grades-10b-web`); W-19's stream stalled once and resumed from a PM checkpoint commit.
   Engine: pure TypeScript, one module per aggregation, `projectCourse` / `solveTarget` /
   `letterFor` / `itemStates`, L1 unit + L2 `fast-check` properties (seeded) + L3 fixtures for all
   six scheme courses (live 9/16 state + three synthetic states, derivations written) + L4
   agreement + L5 solver round-trip; coverage 100 % lines. It reproduces Blackboard's IST.323
   running total exactly (5.0 on 9/14, 14.8 on 9/16). Migrations **057** (`grade_scenarios`,
   `grade_column_links` + same-course trigger), **058** (the three model views), and after
   `/code-review main high` (15 findings; `/security-review` none) **080** (strict-jsonpath shape
   check — lax mode let arrays through — and `course_id` cascade) and **081** (`latest` CTE not
   materialized). Round-2 code fixes: an item linked to a parent part is unlinked and the picker
   offers leaf parts only; surplus placeholders drop earliest-due first (latest-first kept the
   seeded Lab #1 beside the real one); screens read what-if targets, muted parts and dropped
   placeholders from the engine's `itemStates()`; scenario saves serialized per course (a
   lost-update race); "Not graded" honoured in the table; top-level part counts; `database.types.ts`
   scoped to 10b's objects (a regeneration had picked up Phase 11b's live `planner_events`).
   Contract corrections recorded in DECISIONS: `normalize_to` is a part's target, not a per-item
   denominator; a pointless confirmed placeholder takes a what-if as a percentage. Tests: web
   1196 (from 652), mcp-server 88. **Browser walk (PM, 2026-09-16, logged-in Playwright on the preview):** all seven
   acceptance steps pass; prod restored to 0 scenarios / 0 links. Round 3 fixed four findings
   Stack chose (grades-table cells had `display: flex`, misaligning every Grades table since 10a —
   production included; parts counted as graded from real scores only; a left-out part names the
   unsure items to confirm via `ItemStates.unsureItemKeys`; history formatted like the score cell)
   and re-walked them on the redeployed preview; three findings carried to Phase 13 (phone-width
   overflow, per-exam rank weights, favicon). **What Stack sees today:** no course computes without an action
   of his — IST.323, ECN.304, IST.352 and GEO 103 name their unscored hand-graded parts, IST.466
   has nothing graded, IST.471 is qualitative.

14. **Phase 12b — Fine-tooth-comb pass** (`fix/page-pass-12b`, [PR #20](https://github.com/emstacho-su/bb2dash/pull/20), **MVP merged 2026-09-17**; brief, Stack's 18
   answers, MVP, DoD and the 28-row item task list in `docs/planning/sprint-1-hub/briefs/80c_PHASE12B_page_pass.md`;
   research `docs/planning/sprint-1-hub/research/80c_RESEARCH_phase12b_findings.md`; evidence `80d` walk, `80e` grade-method
   comparison, `80f` attempts endpoint, `80g`–`80k` worker notes). Input was Stack's list of 33
   bugs and changes by page plus 8 PM carry-ins (41 intake ids): five Sonnet researchers, one batch of
   questions, then five Opus workers (W-30 db + shell, W-31 grades, W-32 home / inbox / materials,
   W-33 planner, W-34 sweep), PM-integrated. **Home:** five distinct type colours, tracker scrolls the
   whole dated range and opens at today, strip + today in one card, needs-attention last, series
   placeholders and other teams' IST.466 cases out of Undated (kept in Materials), course cards link,
   sidebar closes on navigation without touching the preference, course card shows Blackboard's number
   and graded so far. **Planner:** Assignments band collapsed by default with counts, rows grow by what
   overlapping items need (`planner-rows.ts`, one `slotToPx`), no inner scrollbars, wrapped text, PR
   #16's three CSS risks fixed. **Inbox:** each button says what it does for that row ("recorded only"
   where nothing applies), rows show source, age and a link, `v_inbox_feedback` hook for a later agent.
   **Grades:** Stack read the dummy-data comparison (`80e`) and kept the 10b engine's arithmetic with
   the what-if layer and both silencing rules removed — one deterministic "graded so far" per course
   with the parts it leaves out named under it; courses collapse; title is the link; feedback and
   history in the popout; feedback mark on the row. **Status:** six offered values everywhere
   (`progress-status.ts`); `graded` sets itself when a score is new or changed. **Materials:** buckets
   collapse, readings under date headers, off-platform label split, "How to access" opens the syllabus.
   **Ingest:** crawler **v4** reads attempts the way Blackboard's UI does (v3's endpoint answers empty
   for a student). Migrations **073–079, 084–087** live, each byte-identical to its repo file.
   `/code-review main high`: 10 findings, 8 fixed, 1 docs, 1 checked on prod; `/security-review`: none
   ≥ 8/10. Tests: web 1582 (1342 on `main`; ~360 cases left with the deleted what-if layer), desktop
   549, mcp-server 88; `npm run lint` works again (ESLint CLI). PM browser walk in `80d` (three
   passes). **Live proof owed:** Stack's next sync (v4) should fill `bb_attempts` and `my_submissions`.
   **State on 2026-09-21:** no sync since the merge (last crawl 2026-09-17 15:35 UTC, made before it;
   `bb_attempts` 0 rows); a sync request queued that day (id 33) was cancelled at Stack's word.
   Phase worktrees and branches removed; the two `chore/checkpoint-skill*` local branches were
   already contained in `main` and were deleted.

15. **Phase 12b tail — recurring events + planner popover** (`fix/page-pass-12b-tail`, PR open 2026-09-21;
   frozen contract, round 2 table and the walk in `80c` §Post-MVP tail, `80l`–`80n` worker notes, `80o` walk).
   Three Opus workers (W-35 db, W-36 recurrence web, W-37 popover), PM-integrated; W-36 as integrator.
   **T-1 recurring (P-planner-6):** the web expands a rule (daily / weekly / monthly, mandatory end date,
   ≤ 52) into ordinary `planner_events` rows with `planner-recurrence.ts`, so the calendar push is
   untouched; **082** `planner_event_series` + `series_id` / `series_detached` + a 52-row cap; **083**
   RPCs `planner_series_create` / `_update` / `_delete` (`'following'` splits the series, `'all'` rewrites
   the non-detached future rows, ids preserved so Google sees patches); **088** the split moves detached
   rows too, an emptied series is deleted, `until_date` follows the moved rows. Form gains Repeats + Ends
   on with a live count; a series row's edit or delete asks "This event / This and following / All events";
   the rule is not editable after creation (delete following, create anew); ↻ mark on series blocks.
   **T-2 popover (P-planner-5):** on `/planner` a due item opens a small anchored popover (status select,
   points, Blackboard link, "See full details →"); the full details are a page,
   `/course/[id]/assignment/[...assignmentId]`, sharing one body component with the `?item=` popout;
   every other screen keeps the popout. **089** (found by the walk, pre-existing): `v_work_items.due_on`
   took the UTC date of `due_at`, so every 11:59 PM deadline sat one day late on the planner and the Home
   tracker — 22 assignments moved to their New York day. Gates: `/code-review main high` 10 findings all
   fixed (round 2), `/security-review` none; PM browser walk 2026-09-21 (`80o`): series create → this
   event → this and following → all-events delete, all proven on prod and Google (push run 42 inserted 4;
   test rows deleted), popover and page walked. Tests: web 1812 (from 1582), mcp-server 88, desktop 549.
   Known: deleting a series' last detached row plainly leaves an empty series row (`80o` W-3).
16. **Inbox feedback loop, automation half — `/inbox-apply`** (`feat/inbox-apply`, [PR #23](https://github.com/emstacho-su/bb2dash/pull/23), **merged 2026-09-22**;
   plan `~/.claude/plans/inbox-apply-skill.md`; Stack's brief in the bb-sync session for request 34).
   The worker migration 077 left a queue for. **090** `attention_items.state = 'archived'` + `archived_at`,
   `archived_by`, `decision`; `archive_attention_item()` (refuses open and already-archived rows);
   `v_inbox_queue` (every resolved / dismissed row not yet archived, note or not);
   `attention_keep_stands()` honours archived rows so a kept staff name is not re-raised. A state, not
   a table, because 041's do-not-re-ask rules key off rows still being present. Live under the same
   name; `db/tests/inbox_apply_090_attention_archive.sql` PASS. (Phase 14 had pencilled in 090–099;
   it starts at 091.) **Skill** `skills/inbox-apply/SKILL.md` (+ `~/.claude/skills/` copy): Sonnet
   context agents (answer, current row, Blackboard facts, course precedent, grading rule, prior
   decisions) → one Opus change agent under rules (only assignments / assignment_progress /
   course_staff / group_notes / applied_at; new questions via `raise_attention()`; merges and code
   changes flagged, never done) → the session records one vault note per item
   (`projects/bb2dash/decisions/inbox-<id>.md`, `collection: bb2dash-inbox-decisions`, ingested into
   the rag store) + `docs/inbox-decisions/<date>.md`, then archives. **bb-sync step 0** runs it before
   the crawl. **First run** = request 35 (kind `inbox_feedback`): 31 rows archived (7 changed, 24
   recorded only), raised 528 (ECN.304 quiz-2 vs quiz-02 may be one quiz) and 535 (IST.466 Ethics /
   Major Case group numbers disagree across group_notes, the assignment rows and DECISIONS.md).
   **Web:** Inbox "Apply answers" button (files `inbox_feedback`, copies `claude "/inbox-apply <id>"`,
   one open request at a time) and an `archived (n)` group; archived rows leave the live list.
   **Later the same day**, on Stack's authority ("use context to answer or simply write outdated"), the
   worker closed every remaining open item: 101 in one run (12 tentative columns confirmed under their
   components, IST.323 lab-1 merged with its Blackboard row, 17 course-map seeds "already reflected",
   the rest outdated with the reason on the row; seven questions only Stack can answer carry a
   `FLAG for Stack` in their notes) and the 14 file-byte gaps by actually pulling the files through the
   Playwright browser (12 stored + text extracted + embedded; 117 and 118 are gone from Blackboard,
   superseded by the Week 4 schedules). Inbox: 0 open, 134 archived; 134 decision notes in the vault
   collection `bb2dash-inbox-decisions`.

**Migration numbering note.** Prod's `schema_migrations` recorded the GUI migrations under their
pre-reconciliation names (`012_planner_columns` … `017_sync_contract`) next to main's
`012_hybrid_similarity` / `013_hybrid_similarity_single_source`. Same DDL, live once; the repo
names it 014–019. This is a name-level artifact, NOT drift — a rebuild in README order reproduces
prod. **Do not re-apply 014–019.**

## GUI phase close-out (all done)

0. ~~Reconcile `feat/gui-v1` with main's Retrieval-MCP phase~~ — done 2026-09-10 (merge + renumber).
0a. ~~Merge PR #4 to `main`~~ — done 2026-09-10 (`aef5dee`); `main` is the single source of truth.
1. ~~Create the Vercel project~~ — done; deployed at `https://web-xi-ten-uy9xk6c6p0.vercel.app`
   (Root Directory `web`, the two `NEXT_PUBLIC_` env vars). Owner has logged in.
2. ~~**Stack: visual sign-off**~~ — **done 2026-09-10**: Stack confirmed the Today/Course/
   Materials/search screens render live data end-to-end.
3. ~~**Stack: disable signups**~~ — **done 2026-09-10** per Stack (a dashboard setting, not
   visible from SQL, so not independently verified here). Site URL → the Vercel origin for
   password-reset/confirmation links: set at the same time if not already.
4. ~~**W-9: RLS hardening**~~ — **done 2026-09-10** (migration 020). The 21 permissive
   `authenticated using(true)` policies (STATUS earlier estimated ~25; the real count is 21) are
   now `auth.uid() = public.app_owner()`, plus `storage.objects` `bb_files_auth_all` owner-scoped
   (bucket + owner). `app_owner()` resolves the owner **by email** (recreation-proof). The five
   anon INSERT-only paths and service_role are untouched. Verified: owner sees all rows, any other
   uid sees zero, anon insert + `search` edge function both still work. **Signups still to be
   disabled** (item 3) before any public URL carries data.

## Sprint 1 — closed 2026-09-22

**Dates** 2026-09-10 → 2026-09-22 (13 days). **PRs** #7–#23 (17 merged). **Migrations** 026–090
(059 held for V-1; 070–072 unused). **Docs** `docs/planning/sprint-1-hub/` (index: `docs/planning/README.md`).

**Shipped:** Classroom-style course page (8) · automated sync loop + Inbox (9) · gradebook mirror,
Grades screens, submissions, staged upload (10a) · grade model → replaced by one "graded so far" figure
(10b → 12b) · planner week grid, Google Calendar push, bell + Announcements (11) · planner events pushed
to Google (11b) · Electron shell, tray, toasts, Sync button (12) · fine-tooth-comb pass over every page,
six statuses, crawler v4 attempts (12b) · recurring events, planner popover + assignment page, due-day
fix (12b tail) · `/inbox-apply` worker + Apply answers, Inbox drained to 0 (#23).

**Proven live at close:** sync request 34 (2026-09-22, crawler v4, no dry run): 26 attempts across 5
courses, 55 gradebook columns, 21 items auto-graded; calendar push mirror 68 = Google; production
`main` = PR #23; desktop app on the production URL.

**Open at close (carried into sprint 2 planning):**
* ~~Submission bytes not pulled~~ — **fixed in this close-out PR**: `bb-sync` step 4b is now the
  scripted pull (`ingest/pull_files.mjs --bucket my_submissions`, two-way bucket gate, Blackboard's
  declared mime kept, a 409 fails a submission; tests 12 → 17). The two v4-catalogued files
  (IST.352 Role of Systems Analyst, IST.471 proposal agreement) were pulled through a logged-in tab
  on 2026-09-22: stored, mirrored, 3 text units extracted and embedded.
* V-1 grading validation still stubbed (`059` held); 21 placeholders without points; IST.323's
  13-point proposal column counts toward two parts.
* V-2 session archival (R-27) planned in `~/agentic-harness`, not started here.
* Phase 13 styling **skipped** by Stack; C-1..C-3 parked (`docs/planning/sprint-2/parked/81_PHASE13_styling.md`).
* Phase 14 containers brief + 6 research files ready; Stack places it in the sprint 2 list.
* Known issues below: empty series row after a plain delete of a series' last row; IST.466 duplicate
  content paths (P-data-1); `numeric(9,3)` scores (declined); 7 mutable `search_path` functions.
* Desktop unpacked build rebuilt from `main` at close (it lacked 12b's extra navigation guard).

## What's next — Sprint 2

Stack closes sprint 1 to add development phases before any styling. Planning runs the Phase 12b way:
his list → ids → triage → researchers → one batch of questions → briefs. Intake file:
`docs/planning/sprint-2/90_SPRINT2_INTAKE.md`. Migration range from **091**.

## Sprint 1 record — Requirements v2 (`docs/planning/sprint-1-hub/60_REQUIREMENTS_v2.md`)

Stack confirmed the post-Phase 7 direction on 2026-09-10 after five rounds of clarification;
`60_REQUIREMENTS_v2.md` (R-01..R-26) supersedes every earlier backlog. Phase order (§4 there):

| Phase | Name | Brief | Status |
|---|---|---|---|
| 8 | Course dimension (Classroom-style course page) | `61_PHASE8_course_dimension.md` | **merged** (PR #8, 2026-09-14) — courses sidebar on the right added after Stack's preview review |
| 9 | Sync loop (automated transform, Inbox, `bb-files` bucket → private) | `62_PHASE9_sync_loop.md` | **merged** (PR #10, 2026-09-15) after Stack's first live end-to-end sync |
| 10a | Grades: gradebook mirror, Grades screens, submission pull-back, staged upload | `67_PHASE10A_grades.md` | **merged** (PR #13, 2026-09-16; migrations 046–056 live). Mirror verified by Stack's 9/16 sync; the attempts probe and step 4b run on the first post-merge sync |
| 10b | Grades: methodology model + what-if | `68_PHASE10B_grade_model.md` | **merged** (PR #15, 2026-09-16; migrations 057–058, 080–081 live; PM browser walk 7/7 + round 3) |
| V-1 | Grading schema validation (stream, Stack + a materials-only session) | `63_GRADING_VALIDATION.md`, `64_GRADING_SCHEMA_EXPORT_2026-09-14.md` | **stubbed for later** (Stack, 2026-09-16: a data-accuracy task, no longer a gate for 10b); reconciliation migration stays 059; it should fold `grade_column_links` into `assignments` and fill placeholder points. Launch: `scripts/validate-grading.ps1` |
| V-2 | Session archival, context tagging, RAG hand-off (R-27; stream in `~/agentic-harness`) | `66_SESSION_ARCHIVAL_RAG.md` | added 2026-09-14 |
| 11 | Planner + Google Calendar push, announcements bell/page, data gaps | `69_PHASE11_planner.md` | **merged** (PR #12, 2026-09-16; migrations 060–066 live, calendar push live and proven; Stack signed off the six-step script) |
| 11b | Planner events created in bb2dash and pushed to the `bb2dash` calendar | `69b_PHASE11B_planner_events.md` | **merged** (PR #14 + display follow-up PR #16, 2026-09-16; migrations 067–069 live, `calendar-push` v5 live, live proof and browser walk done) |
| 12 | Electron shell, tray, desktop notifications, Sync button runs the command | `80_PHASE12_electron.md` | **merged** (PR #19, 2026-09-17; Stack walked acceptance steps 1–5 and the tray on the unpacked build and said merge; the three toasts are still to be seen live, after the first real sync or posted grade). His first launch found one bug, fixed before merge: the app was named `bb2dash-desktop`, so it read its config from the wrong `%APPDATA%` folder (`productName` now pins `bb2dash`). Shipped: `desktop/` package, Electron 44.4.1, unpacked build `desktop/dist/win-unpacked/bb2dash.exe`; window + single instance + tray (close hides), navigation allowlist, poller with on-disk watermark and the three toasts, Sync button runs `claude '/bb-sync <id>'` in Windows Terminal (`syncDryRun` prints it instead); `core/` has no `electron` import (R-28). 535 unit + 19 e2e tests; `/code-review main high` 10 findings fixed (brief §Round 2), `/security-review` none ≥ 8/10; zero changes under `web/`; no migrations. Notes: `80a`, `80b`, `80d`. **Not yet proven, only Stack can:** real Windows toasts, a real `wt.exe` sync run, the clipboard copy inside the shell, staying signed in after hours in the tray. Carried to 12b: `web/src/lib/supabase/proxy-session.ts` drops refreshed auth cookies on its two redirect branches; low-priority hardening: police `will-redirect` / `will-frame-navigate` |
| 13 | Styling pass | `docs/planning/sprint-2/parked/81_PHASE13_styling.md` | **skipped** (Stack, 2026-09-22: more development phases first); its carry-ins C-1..C-3 (phone-width overflow, rank weights shown per exam, favicon) stay parked in the brief |
| 12b | Fine-tooth-comb pass over every page and feature | `80c_PHASE12B_page_pass.md` | **MVP merged** (PR #20, 2026-09-17; migrations 073–079, 084–087 live; gates run; PM walk in `80d`); **tail merged** ([PR #22](https://github.com/emstacho-su/bb2dash/pull/22), 2026-09-21: T-1 recurring events + T-2 popover and assignment page; migrations 082–083, 088–089 live; walk in `80o`); v4 proof sync **done 2026-09-22** (request 34: 26 attempts, 55 gradebook columns, 21 auto-graded); P-data-1 deferred, P-db-3 declined |
| — | Inbox feedback loop, automation half (`/inbox-apply`, Apply answers button) | `skills/inbox-apply/SKILL.md` | **merged** (PR #23, 2026-09-22; migration 090 live; Inbox 0 open / 134 archived) |
| 14 | Containers (R-28): every local process in Docker | `docs/planning/sprint-2/82_PHASE14_containers.md` + `docs/planning/sprint-2/research/82_RESEARCH_phase14_R1…R6` | planned 2026-09-16; **sprint 2 candidate** — Stack decides its place in the sprint 2 list; migration range 091–099 |

**MVP, definition of done, task loops (2026-09-14, PR #11):** every remaining phase and stream
now has an explicit MVP in Stack's words, a DoD checklist (SOP gates + his acceptance script +
research-derived items), and a looped task table with an executable check per task — in each
brief (`62`, `63`, `66`, `67`, `68`, `69`, `80`, `81`) and indexed in
`docs/planning/sprint-1-hub/70_MVP_INDEX.md`, whose §5 lists the open questions Stack answers when each
phase's PM session freezes its Contract. Research behind them: `docs/planning/sprint-1-hub/research/`.

Migration ranges: Phase 8 = 026–029, Phase 9 = 030–045 (030–040 plus its review-fix rounds 041–045), Phase 10 = 046–059
(10a took 046–056; **10b took 057–058**; **059 held for V-1's reconciliation**), Phase 11 = 060–066,
Phase 11b = 067–072 (used 067–069; 070–072 free), Phase 12 = 073–079 if needed, Phase 10b review rounds = 080–081; **Phase 12b = 073–089** (MVP 073–079, 084–087; tail 082–083, 088–089 — the range is used up); **090 = inbox-apply**; sprint 2 starts at **091**. Both phase branches cut from `main`
(Phase 7 is merged). The professional-side stub is dropped (Stack, 2026-09-10).

Phase 7 leftovers folded into the plan: automatic `superseded_by` on re-uploaded files and the
remaining near-duplicates (bb_files 17, 18/19, IST.352 31/32/47) → Phase 9 `stage_files`;
`web/` test coverage for Today/Course/Materials → Phase 8's workers add screen tests as they
touch those screens; stored per-part `tsvector` on `bb_text_embeddings` → only when the palette
feels slow, not before.

**Security:** `bb-files` bucket private (030, anonymous GET 400); all public views
`security_invoker` with anon revoked (036); transform folds only owner-registered crawls (039);
`bb_files` anon INSERT refuses `my_submissions` rows and any `classified_by` of `stack` or
`blackboard` (049) — the Storage-side anon INSERT is deliberately unchanged (bytes with no
catalogue row are invisible; the pull step uploads with the publishable key); `bb_gradebook` /
`bb_attempts` owner-only, stage functions `service_role` only; `grade_scenarios` /
`grade_column_links` owner-only with the initplan-safe `(select auth.uid())` form, the three model
views `security_invoker` and revoked from anon (`/security-review` of Phase 10b: no findings).
Remaining advisor items: 21 `auth_rls_initplan` warnings on migration 020's policies (wrap
`auth.uid()` in `(select …)`), 7 pre-existing mutable search_path functions.

## Known issues / operational notes

* **(Superseded by Phase 12b: the strict rule is gone; every course with a graded item shows "graded so far" and names what it leaves out. A scored column linked to no part — ECN.304 Quiz 2 and Attendance on 2026-09-17 — is named under the figure until Stack places it with "Counts toward…".)** Before 12b: the grade model (10b) showed on no course until Stack acted. The
  strict rule (his answer 1) hides it where a `manual` part is unscored: IST.323 Class
  Participation, ECN.304 Participation, IST.352 Attendance / Class Contribution, GEO 103's two
  attendance parts. ECN.304 computes if he links its Attendance column (85.7) to Participation.
  IST.466 needs a first score or a what-if value; its Major Cases and AI Team Assignment are left
  out while their links are unsure.
* **IST.323's 13-point proposal column** bundles the 11-point proposal and the 2-point final log
  (one column cannot count toward two parts), so once graded and linked the agreement reads
  "no known reason". V-1 data; not a code fix.
* **21 placeholders carry no points** (V-1 data). Confirmed ones in fraction-based parts take a
  what-if as a percentage; `sum` parts (IST.323 `fp-packet`, IST.352 `term-project`) and unsure
  series placeholders take none.
* **Post-merge reconciliation (2026-09-16, after PR #15):** every repo migration is recorded on prod
  (70 files = 70 bb2dash rows). 046–058, 067–069 and 080–081 are byte-identical; Phase 11's 060–066
  match once the repo file's final newline is dropped (applied without it — no content drift). Prod's
  `schema_migrations` also holds six `create_rag_*` / `rag_search_*` / `drop_rag_schema_relocated_to_harness_memory`
  rows from the harness RAG store before it moved to `harness-memory`; they are not bb2dash migrations.
  No prod migration after 081, so `database.types.ts` on `main` is current. No open PRs; only `main`
  remains locally and on GitHub.
* **Phase 11b merged first** (PR #14 and #16, 2026-09-16). Phase 10b's branch then merged `main`,
  regenerated `database.types.ts` from prod (both phases' objects) and reconciled the three docs;
  the migrations never overlapped and no source file was shared.

* **Attempts: v3's endpoint answers empty for a student (2026-09-17 sync, 21 of 21 columns); crawler v4 (Phase 12b, `80f`) walks grade → attempts → detail. Proof is the first v4 sync.** Older note — attempts key names were unverified until the first crawler-v3 sync — the next `/bb-sync`
  from the `main` checkout. `bb_attempts.raw->'keys'` and `bb_content`'s `detailSource` probe
  name the real keys; the candidate lists in `bb_crawler.js` are then cut to one name each
  (`66_W17_VERIFICATION.md` §10). Until then `bb_attempts` is empty and the popout shows
  Blackboard's `lastAttempt` timestamp only.
* Mirrored scores are stored `numeric(9,3)`: ECN.304 Attendance 83.33333 renders as 83.333 (one
  value of 45, third decimal of a percentage). Widening the column means recreating the five
  views that depend on it; deferred unless a score needs to be bit-exact.
* `IST.323/fp-proposal` and `IST.323/fp-log-final` share one `bb_item_id` / `bb_column_id`;
  `stage_assignments` re-stamps neither row's `bb_last_seen`, so `v_calendar_push_items` counts
  both absent and the calendar push skips them (conservative, nothing deleted). A Phase 9 staging
  question for the next transform touch; details in `69a_W21_VERIFICATION.md` §4.1.
* `calendar-push` is the one edge function with `verify_jwt` off; it authenticates the tick's
  `x-push-secret` header. Nothing else should call it.
* **Planner events are real the moment they are saved**, on the preview as on prod: the push puts
  them on Stack's Google calendar within two minutes. There is no staging calendar; tests use mocks
  and live proofs delete their rows in the same sitting.
* Planner events are never pruned by date, so the push set grows; reads are paged since v5 (R2-1).
  A creation on a DST fall-back hour takes the earlier instant (Temporal `compatible`); Postgres
  would pick the later, which is why SQL never converts a planner wall clock.
* ~~`calendar_events` grants `TRUNCATE` to `authenticated`~~ — fixed by 076 (it was 79 grants across `public`, to anon and authenticated; all revoked, default privileges too).
* The kind colours are W-23's pick (DECISIONS 2026-09-16) until Stack confirms them on the walk.

* IST.466 publishes two sibling content branches with identical `path`s; `bb_content`'s
  `(course_id, path)` key holds one, so Classwork shows one branch. Needs a key change
  (`bb_item_id`-based) in a later phase.
* **Merge Phase 8 before Phase 9.** Migration 036 asserts every public view is
  `security_invoker`; `v_course_display` gets that from Phase 8's 028. Prod holds both already;
  the rule keeps a fresh replay of `db/migrations` in README order working.

* Migration 020's RLS policies call `auth.uid()` per row (advisor `auth_rls_initplan`, 21
  policies); a later migration should rewrite them as `(select auth.uid()) = …`.
* `bb_crawler.js` generates `run_id` inside `runAll`; the skill registers it right after the
  crawl returns and migration 039's grace window covers the gap. A `runId` parameter on
  `runAll` would let the skill register first (one-line change, next time the crawler is touched).

* Sandboxed Claude sessions cannot reach `*.supabase.co` (org egress policy) — invoke edge
  functions server-side via `pg_net` (`net.http_post`); pg_net is enabled and load-bearing.
* Edge CPU budget caps embedding at ~8–9 parts per invocation; `embed-corpus` resumes per-part.
* ~~`part_range` on text 276 is one char long~~ — fixed (023 + `embed-corpus` v5, Phase 7).
* `bb_raw` run 19 (2026-09-08 crawl) still lists the IST.466 "Wk2x" root item that the notes
  say was removed on 9/8 — the crawl ran earlier that day. Harmless; the next crawl clears it.
* Hybrid `snippet` length is a word budget (`MaxWords=40`, two fragments), not a char budget:
  observed 81–791 chars. Clients truncate for display.
* A matched-passage snippet cut from part ≥2 of a PPTX unit would start *after* the `[notes]`
  marker; since 024 the function prefixes `[notes] ` to such a snippet (and the whole-unit
  fallback headlines only the text before the marker) so the marker-based client scrubbers
  still label it. Verified on synthetic fixtures only — 51 units carry `[notes]` today and none
  is multi-part. The ingest cadence work (backlog 1) should re-run that check after every crawl.
* Hybrid keyword snippets recompute `to_tsvector` per covering part at query time: 27 ms at
  limit 12 on the 534-unit corpus. See backlog 5 for the stored-tsvector fix.
* Function search-path advisor warnings (pre-existing pattern) on the search RPCs.
* Never ship the service key to a browser; anon key is insert-only by design.
