# bb2dash — Project State

> Updated upon each PR. Last update: **2026-09-15**, Phase 11 planner + calendar + bell **PR open**
> (`feat/planner-11`: `/planner` week grid, Google Calendar push, announcements bell and page;
> migrations 060–066 live; the live calendar proof waits on Stack's one-time Google consent).
> Phase 10a is in flight in parallel on `feat/grades-10a` (migrations 046–051 live). Phase 9
> merged 2026-09-15 (PR #10), Phase 8 2026-09-14 (PR #8). Convention: see root `CLAUDE.md`.

## Where the product is

**Backend foundation complete and live; GUI v1 deployed; retrieval polished; course page rebuilt Classroom-style (Phase 8); sync loop live (Phase 9); planner week grid, Google Calendar push and announcements bell built (Phase 11, PR open).**
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
| Raw capture | `bb_raw` crawls via `ingest/bb_crawler.js` (anon insert, unique per run/kind/shell); last pull 2026-09-08. Folded automatically: `transform_tick()` on pg_cron every 2 min stages only crawls registered on an owner-claimed `agent_requests` row; unregistered runs are quarantined once |
| Typed warehouse | migrations 001–045 on `main`, 046–051 (Phase 10a) and 060–066 (Phase 11) live from the in-flight branches (repo numbering; see note below); 7 courses, 80 assignments, 145 sessions, planner tables; `attention_items`, `agent_requests`, `app_settings` (+ `gcal_*`, `web_base_url`), `calendar_events` mirror, `calendar_push_runs`, `v_calendar_push_items`, `v_announcements_unread`; every public view `security_invoker`, anon revoked |
| Effort model | migration 015 `effort_base` (19 types) + 016 `v_work_items` (152 items, effort + source) |
| Document corpus | 64 files (100% in Storage + local mirror + sha256), 534 text units extracted; 4 stale IST.466 files marked `superseded_by` (migration 022) → `v_bb_files_current` = 60 |
| Search: FTS | tsvector+GIN on file text / content / announcements; `search_file_text(…, p_include_superseded)` |
| Search: vectors | 1,195 gte-small embeddings (384-dim), 100% coverage; `part_range` = code points, audit clean (023); `match_file_text()`, `hybrid_search_file_text()` (`p_min_similarity` floor, single-source `similarity`, **matched-passage `snippet` + `part_no` + `snippet_source`**, superseded filter — migrations 012–013, 021, 024–025); keyword snippets come from the highest-`ts_rank` part that actually contains the query, ~27 ms at limit 12 |
| Edge functions | `embed-corpus` **v5** (resume-safe batch embedder; chunks by code point), `search` **v5** (retrieval API; **default mode: hybrid**; optional `min_similarity` floor; optional `include_superseded`), `calendar-push` **v2** (Google Calendar upsert/delete by deterministic event id; `verify_jwt` off, `x-push-secret` from Vault; fired by pg_cron `bb2dash-calendar-push` when `app_settings.gcal_dirty`) |
| Retrieval MCP | `mcp-server/` — stdio MCP server for Claude Code: `search_materials` (+ `include_superseded`) / `get_material_text` / `list_courses`; 86 vitest tests |
| GUI (`web/`) | Next.js 16 + TS, Supabase Auth. Screens: Today (56-day fetch, 14 visible, ◂ ▸ paging; needs-attention row from `v_sync_status`), Course = Stream / Classwork (Blackboard folder tree, `?view=timeline` keeps the week rail) / Grades (placeholder until Phase 10) / Info, Materials, ⌘K search, `?item=` assignment + session popouts, **courses sidebar** (☰ toggles it; on the right, `--sidebar-side` flips; overlay drawer under 1024px), **Inbox** (`/inbox`, resolve + why-note per row), Sync button (enqueues `agent_requests`, copies `claude "/bb-sync <id>"`), Activity list, **Planner** (`/planner?week=`, Mon–Sun week grid: class blocks with room + session topic, due items by New York wall clock, all-day band, today + now-line, quick-edit), **bell** (unread badge from `v_announcements_unread`; opening marks seen), **Announcements** (`/announcements`, all courses newest-first), public `/privacy` (for the Google consent screen); vitest 450 tests |
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
   second one (the tick never closes `kind = sync` rows). `bb_url` still null:
   assessment items carry no `detail` in the crawl (crawler change, later). First fold of the 9/8 and 9/2 crawls: 93 attention rows
   (conflict 11, data_gap 14, missing 16, stack_must_confirm 52), zero duplicates on replay, a
   resolution applied end-to-end in all three shapes. Web: Inbox, needs-attention row, Sync
   button, Activity (vitest 117 tests); crawler announcements mapper (creator key unverified until a live crawl);
   `skills/bb-sync` (claim → crawl → register run_id → wait → close). Runbook steps 3 and 5
   automated. Stopped/deferred: `stage_courses` never writes `meetings` (no schedule payload
   shape seen yet); `announcements.author` null until the crawler key is confirmed live.

10. **Phase 11 — Planner, Google Calendar push, bell** (`feat/planner-11`, PR open, 2026-09-15; brief
   and frozen Contract in `docs/planning/69_PHASE11_planner.md`, evidence in `69a_W21_VERIFICATION.md`).
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
   `app_settings.web_base_url` for the event links. Edge function `calendar-push` v2 (fetch
   client, no SDK; orphan rows whose `calendar_id` changed are deleted from the old calendar; insert / patch / delete diff against the mirror; zero
   writes when unchanged; `privateExtendedProperty app=bb2dash`; fixed `colorId` per course).
   `scripts/google-consent.mjs` (loopback OAuth, PKCE, stores four secrets through the RPC; Stack
   runs it once). Web: `/planner`, bell, `/announcements`, `/privacy`; `database.types.ts`
   regenerated. R-16 recorded the Inbox way: SITN presentation `2026-11-04 15:45` (Stack's choice,
   applied by a transform request); IST.466 Group #3 day within each presentation pair is not
   published, rows stay tentative. Tests: web 450 (from 345), function 28 (`node --test`). Push set today: 62 of 64 dated workload items; the two IST.323 final-project rows that share one Blackboard item are counted absent (see Known issues) and are not pushed.
   **Waiting on Stack:** Google Cloud project (under his Gmail; SU's Workspace blocks student
   projects), OAuth client, `node scripts/google-consent.mjs` choosing `emstacho@g.syr.edu`; then the
   PM flips `gcal_enabled` and records the three-run proof. Announcement `author` stays
   "not recorded": the live crawl carries no creator key and the crawler is 10a's file this sprint.

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
| 9 | Sync loop (automated transform, Inbox, `bb-files` bucket → private) | `62_PHASE9_sync_loop.md` | **PR #10 open** (migrations 030–044 live, reviewed); Stack adds planning docs before merge |
| 10 | Grades and submissions | `67_PHASE10A_grades.md` | 10a in flight on `feat/grades-10a` (046–051 live), parallel with 11; 10b after October scores + V-1 |
| V-1 | Grading schema validation (stream, Stack + a materials-only session) | `63_GRADING_VALIDATION.md`, `64_GRADING_SCHEMA_EXPORT_2026-09-14.md` | added 2026-09-14; parallel with 10a; gate for 10b. Launch: `scripts/validate-grading.ps1` |
| V-2 | Session archival, context tagging, RAG hand-off (R-27; stream in `~/agentic-harness`) | `66_SESSION_ARCHIVAL_RAG.md` | added 2026-09-14; parallel with 10a |
| 11 | Planner + Google Calendar push, announcements bell/page, data gaps | `69_PHASE11_planner.md` | **PR open** (`feat/planner-11`, migrations 060–066 live); live calendar proof after Stack's consent step |
| 12 | Electron shell | — | |
| 13 | Styling pass | — | last |

**MVP, definition of done, task loops (2026-09-14, PR #11):** every remaining phase and stream
now has an explicit MVP in Stack's words, a DoD checklist (SOP gates + his acceptance script +
research-derived items), and a looped task table with an executable check per task — in each
brief (`62`, `63`, `66`, `67`, `68`, `69`, `80`, `81`) and indexed in
`docs/planning/70_MVP_INDEX.md`, whose §5 lists the open questions Stack answers when each
phase's PM session freezes its Contract. Research behind them: `docs/planning/research/`.

Migration ranges: Phase 8 = 026–029, Phase 9 = 030–045 (030–040 plus its review-fix rounds 041–045), Phase 10 = 046–059,
Phase 11 = 060–069 (060–066 used), Phase 12 = 070–079 if needed. Both phase branches cut from `main`
(Phase 7 is merged). The professional-side stub is dropped (Stack, 2026-09-10).

Phase 7 leftovers folded into the plan: automatic `superseded_by` on re-uploaded files and the
remaining near-duplicates (bb_files 17, 18/19, IST.352 31/32/47) → Phase 9 `stage_files`;
`web/` test coverage for Today/Course/Materials → Phase 8's workers add screen tests as they
touch those screens; stored per-part `tsvector` on `bb_text_embeddings` → only when the palette
feels slow, not before.

**Security:** `bb-files` bucket private (030, anonymous GET 400); all public views
`security_invoker` with anon revoked (036); transform folds only owner-registered crawls (039).
Remaining advisor items: 21 `auth_rls_initplan` warnings on migration 020's policies (wrap
`auth.uid()` in `(select …)`), 7 pre-existing mutable search_path functions.

## Known issues / operational notes

* `IST.323/fp-proposal` and `IST.323/fp-log-final` share one `bb_item_id` / `bb_column_id`;
  `stage_assignments` re-stamps neither row's `bb_last_seen`, so `v_calendar_push_items` counts
  both absent and the calendar push skips them (conservative, nothing deleted). A Phase 9 staging
  question for the next transform touch; details in `69a_W21_VERIFICATION.md` §4.1.
* `calendar-push` is the one edge function with `verify_jwt` off; it authenticates the tick's
  `x-push-secret` header. Nothing else should call it.

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
