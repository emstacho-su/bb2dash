# bb2dash — Project State

> Updated upon each PR. Last update: **2026-09-15**, Phase 10a grades PR open (`feat/grades-10a`:
> gradebook mirror `bb_gradebook` + `bb_attempts`, five grade views, `/grades` and the course
> Grades tab, popout submission block, staged-upload drop zone, crawler v3 with the attempts
> probe, bb-sync step 4b; migrations 046–056 live). Phase 9 merged 2026-09-15 (PR #10), Phase 8
> 2026-09-14 (PR #8). Convention: see root `CLAUDE.md`.

## Where the product is

**Backend foundation complete and live; GUI v1 deployed; retrieval polished; course page rebuilt Classroom-style (Phase 8); sync loop live (Phase 9); gradebook mirrored and shown as Blackboard's numbers (Phase 10a, PR open).**
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
| Raw capture | `bb_raw` crawls via `ingest/bb_crawler.js` **v3** (anon insert, unique per run/kind/shell; `crawler.version = 3` envelope; attempts + attempt-files probe with a `keys` list; `runAll({ runId })`); last pull 2026-09-14 (run `bf2f81e5-…`, made with v2 — no `attempts` key yet). Folded automatically: `transform_tick()` on pg_cron every 2 min stages only crawls registered on an owner-claimed `agent_requests` row; unregistered runs are quarantined once |
| Typed warehouse | migrations 001–056 (repo numbering; see note below); 7 courses, 66+ assignments, 145 sessions, planner tables; `attention_items`, `agent_requests`, `app_settings`; **`bb_gradebook`** (append-per-run mirror, 45 rows from the 9/14 crawl, one `isCalc` total: IST.323 5/104), **`bb_attempts`** (empty until the first v3 crawl); 20 public views `security_invoker`, anon revoked |
| Gradebook mirror (10a) | `stage_gradebook` + `stage_attempts` in `run_transform` after `stage_assignments`; `v_gradebook_latest` (`column_kind` item / attendance / total / calc_other / letter, `assignment_id`, `linked_assignments`, `counts_toward_grade`), `v_assignment_grade`, `v_course_grade`, `v_attempts_latest`, `v_assignment_attempts`; registered runs only; reconciliation 45/45 columns and scores against `bb_raw`; every figure carries `seen_at`, nothing summed |
| Effort model | migration 015 `effort_base` (19 types) + 016 `v_work_items` (152 items, effort + source) |
| Document corpus | 64 files (100% in Storage + local mirror + sha256), 534 text units extracted; 4 stale IST.466 files marked `superseded_by` (migration 022) → `v_bb_files_current` = 60 |
| Search: FTS | tsvector+GIN on file text / content / announcements; `search_file_text(…, p_include_superseded)` |
| Search: vectors | 1,195 gte-small embeddings (384-dim), 100% coverage; `part_range` = code points, audit clean (023); `match_file_text()`, `hybrid_search_file_text()` (`p_min_similarity` floor, single-source `similarity`, **matched-passage `snippet` + `part_no` + `snippet_source`**, superseded filter — migrations 012–013, 021, 024–025); keyword snippets come from the highest-`ts_rank` part that actually contains the query, ~27 ms at limit 12 |
| Edge functions | `embed-corpus` **v5** (resume-safe batch embedder; chunks by code point), `search` **v5** (retrieval API; **default mode: hybrid**; optional `min_similarity` floor; optional `include_superseded`) |
| Retrieval MCP | `mcp-server/` — stdio MCP server for Claude Code: `search_materials` (+ `include_superseded`) / `get_material_text` / `list_courses`; 86 vitest tests |
| GUI (`web/`) | Next.js 16 + TS, Supabase Auth. Screens: Today (56-day fetch, 14 visible, ◂ ▸ paging; needs-attention row from `v_sync_status`), Course = Stream / Classwork (Blackboard folder tree, `?view=timeline` keeps the week rail) / Grades (placeholder until Phase 10) / Info, Materials, ⌘K search, `?item=` assignment + session popouts, **courses sidebar** (☰ toggles it; on the right, `--sidebar-side` flips; overlay drawer under 1024px), **Inbox** (`/inbox`, resolve + why-note per row), Sync button (enqueues `agent_requests`, copies `claude "/bb-sync <id>"`), Activity list, **Grades** (`/grades` by course: "Blackboard's number, as of <seen_at>" / "Blackboard publishes no total" / "not synced yet"; item rows with status pill, `score / possible`, seen, feedback disclosure; uncounted attendance, letter and non-total calculated columns in a collapsed group), **course Grades tab** (same table for the course's shells), **popout submission block** (status, attempt N of M, pulled-back and staged files with a sha256 match chip; no score), **staged-upload drop zone** (popout + Classwork rows → Storage + `bb_files` row, "Staged in bb2dash — attach in Blackboard ↗"; no control reads "Submit"); vitest 530 tests |
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
   `docs/planning/41_RECONCILIATION_gui_vs_retrieval-mcp.md`). Four screens built by parallel
   Opus workers in isolated worktrees: Today (14-day effort tracker), Course (week rail + lanes +
   AI policy), Materials (signed-URL Open ladder), ⌘K hybrid search (0.80 "keyword match" label +
   speaker-notes scrubbing; verified compatible with search v3 — same result columns). Full tree
   typecheck + build green after the merge. Recovered local planning round in `docs/planning/`.
   Merged 2026-09-10 (`aef5dee`); W-9 RLS hardening landed right after as migration 020.
7. **Phase 7 — Retrieval polish** (`feat/retrieval-polish`, 2026-09-10; brief and frozen
   contract in `docs/planning/50_PHASE7_retrieval_polish.md`, evidence in
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
   second one (the tick never closes `kind = sync` rows).
10. **Phase 10a — Grades: mirror, screens, submissions** (`feat/grades-10a`, PR open, 2026-09-15;
   brief + frozen contract + Stack's ten answers in `docs/planning/67_PHASE10A_grades.md`,
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
   `run_id` after the crawl again (register-first would let the tick fold a slow crawl partially). `bb_url` still null:
   assessment items carry no `detail` in the crawl (crawler change, later). First fold of the 9/8 and 9/2 crawls: 93 attention rows
   (conflict 11, data_gap 14, missing 16, stack_must_confirm 52), zero duplicates on replay, a
   resolution applied end-to-end in all three shapes. Web: Inbox, needs-attention row, Sync
   button, Activity (vitest 117 tests); crawler announcements mapper (creator key unverified until a live crawl);
   `skills/bb-sync` (claim → crawl → register run_id → wait → close). Runbook steps 3 and 5
   automated. Stopped/deferred: `stage_courses` never writes `meetings` (no schedule payload
   shape seen yet); `announcements.author` null until the crawler key is confirmed live.

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

## What's next — Requirements v2 (`docs/planning/60_REQUIREMENTS_v2.md`)

Stack confirmed the post-Phase 7 direction on 2026-09-10 after five rounds of clarification;
`60_REQUIREMENTS_v2.md` (R-01..R-26) supersedes every earlier backlog. Phase order (§4 there):

| Phase | Name | Brief | Status |
|---|---|---|---|
| 8 | Course dimension (Classroom-style course page) | `61_PHASE8_course_dimension.md` | **merged** (PR #8, 2026-09-14) — courses sidebar on the right added after Stack's preview review |
| 9 | Sync loop (automated transform, Inbox, `bb-files` bucket → private) | `62_PHASE9_sync_loop.md` | **merged** (PR #10, 2026-09-15) after Stack's first live end-to-end sync |
| 10a | Grades: gradebook mirror, Grades screens, submission pull-back, staged upload | `67_PHASE10A_grades.md` | **PR open** (`feat/grades-10a`, 2026-09-15; migrations 046–056 live). Stack's acceptance script starts with one real sync using crawler v3 |
| 10b | Grades: methodology model + what-if | `68_PHASE10B_grade_model.md` | after October scores **and** V-1 sign-off; numbers from the 046–059 slack |
| V-1 | Grading schema validation (stream, Stack + a materials-only session) | `63_GRADING_VALIDATION.md`, `64_GRADING_SCHEMA_EXPORT_2026-09-14.md` | added 2026-09-14; parallel with 10a; gate for 10b. Launch: `scripts/validate-grading.ps1` |
| V-2 | Session archival, context tagging, RAG hand-off (R-27; stream in `~/agentic-harness`) | `66_SESSION_ARCHIVAL_RAG.md` | added 2026-09-14; parallel with 10a |
| 11 | Planner + Google Calendar push, announcements bell/page, data gaps | `69_PHASE11_planner.md` | **in progress** in a parallel PM session (`feat/planner-11`, migrations 060–069) |
| 12 | Electron shell | — | |
| 13 | Styling pass | — | last |

**MVP, definition of done, task loops (2026-09-14, PR #11):** every remaining phase and stream
now has an explicit MVP in Stack's words, a DoD checklist (SOP gates + his acceptance script +
research-derived items), and a looped task table with an executable check per task — in each
brief (`62`, `63`, `66`, `67`, `68`, `69`, `80`, `81`) and indexed in
`docs/planning/70_MVP_INDEX.md`, whose §5 lists the open questions Stack answers when each
phase's PM session freezes its Contract. Research behind them: `docs/planning/research/`.

Migration ranges: Phase 8 = 026–029, Phase 9 = 030–045 (030–040 plus its review-fix rounds 041–045), Phase 10 = 046–059
(10a took 046–056; 057–058 slack; 10b takes its numbers after 059; **059 held for V-1's reconciliation**),
Phase 11 = 060–069, Phase 12 = 070–079 if needed. Both phase branches cut from `main`
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
`bb_attempts` owner-only, stage functions `service_role` only.
Remaining advisor items: 21 `auth_rls_initplan` warnings on migration 020's policies (wrap
`auth.uid()` in `(select …)`), 7 pre-existing mutable search_path functions.

## Known issues / operational notes

* **Attempts key names are unverified** until the first crawler-v3 sync (Stack's acceptance step
  0). `bb_attempts.raw->'keys'` and `bb_content`'s `detailSource` probe name the real keys; the
  candidate lists in `bb_crawler.js` are then cut to one name each
  (`66_W17_VERIFICATION.md` §10). Until then `bb_attempts` is empty and the popout shows
  Blackboard's `lastAttempt` timestamp only.
* Mirrored scores are stored `numeric(9,3)`: ECN.304 Attendance 83.33333 renders as 83.333 (one
  value of 45, third decimal of a percentage). Widening the column means recreating the five
  views that depend on it; deferred unless a score needs to be bit-exact.

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
