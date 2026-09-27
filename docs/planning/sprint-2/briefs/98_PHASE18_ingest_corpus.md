# Phase 18 — Ingest and corpus: files pulled and embedded in the sync, attempts and announcements settled, search labels honest

Date 2026-09-24 · PM: the Fable session · Product manager: Stack
Requirements: R-60, R-61, R-62, R-63, R-66, R-67, R-68, R-69, R-70, R-72, R-73, R-74, R-75, R-77; S2-rag-1
PM-added steps: P-22, P-23, P-24, P-26, P-27, P-28, P-36, P-81, P-82, P-89, P-90, P-91, P-92, P-96, P-97
Branch `feat/ingest-corpus-18` · Worktree `bb2dash-wt-18` · Migration range **120–129** · One PR per phase (no exception taken)
Status: **PROVISIONAL until Stack answers 93 §5** (B-8, B-32, B-33, B-34, B-35, B-36, B-37, B-38, B-40) and approves `94_SPRINT2_PHASES.md`.
Per DECISIONS 2026-09-24 ("a brief may not cite a default as decided before then"), every default below is a proposal;
each becomes a DECISIONS row dated the day Stack answers, never the day this brief was drafted.

B-numbers are the item numbers of `93_SPRINT2_RESEARCH_SYNTHESIS.md` §5. Its §1.4 prose cites "B-39" for the
per-item URL and "B-33" for the iCal job; by §5's own list those are **B-38** and **B-32**. This brief uses §5.
Starts after Phase 15 merges (its runner, test role and search_path pin); runs beside Phases 16 and 17; Phase 19
starts after it (94 §2 rule 3).

## Why

Sprint 1 built the file pipeline in pieces and left the joins to hand work. `ingest/pull_files.mjs` stores, mirrors and
extracts, but only after a browser download, and embedding is a hand `embed-corpus` loop (R-60). Step 4b has never pulled
a file inside a `/bb-sync`; course files are pulled outside the sync on request, and on 2026-09-23 the Playwright
download event crashed the MCP browser, so files 155–157 came in by curl on signed CDN links. Stack's S2-rag-1 asks that
"all materials should be chunked and embedded". Prod says that is true today by hand (84 current files, 784 units,
1,545 parts, 0 units without an embedding) except file 68, a GEO.103 `.doc` with no text (R-61). Nothing checks it, and
nothing keeps it true after the next pull.

The same corpus has honesty defects Stack can see. ⌘K headlines speaker-note text with no label on three live units
(R-62, a CLAUDE.md hard rule). Materials and search return both copies of the IST.323 syllabus (files 2 and 151) and of
the IST.466 Week 3/4 schedule (74 and 149) (R-63). Week and session links on files were written once at seed time (16
weeks, 2 sessions), so the timeline prints "no files" on 143 of 145 sessions (R-67). Ten GEO.103 textbook chapters read
"On Blackboard — not pulled yet" (R-68). All 88 assignments have a null `bb_url` (R-69). The crawler's own probes are
still open: attempt feedback is read under the wrong key (R-66), no announcement has an author (R-70), meeting times have
no Blackboard source (R-73), and R-17's `slim()` clause was never closed (R-75). The iCal job writes an "ok" row every
day with no data (R-72). The search docs describe old shapes (R-74), and the palette's latency was last measured on 534
units (R-77).

Why now: Phase 14's container runner inherits this phase's fetch and embed step instead of rebuilding them (P-36, P-92).
`stage_files` is re-created once here before Phase 19 re-creates `stage_content` (DECISIONS 2026-09-17, row 158). The
five open Blackboard facts need Stack's Duo session, so they share one probe sitting (P-27). Phase 15's runner makes the
post-embed checks runnable from disk (P-24).

## Stack's calls this brief rests on

Every row is **PROVISIONAL**: the default is built unless Stack answers otherwise (DECISIONS 2026-09-23, and the
2026-09-24 row that forbids citing a default as decided).

| B | question (93 §5) | default taken | tasks that change if he answers otherwise |
|---|---|---|---|
| B-8 | S2-rag-1: must/should, acceptance, surface, who embeds | must; a background check the PM runs after each corpus change, no UI this sprint; embedding runs as a step of the pull (no new cron job); a committed eval runner with the golden set re-validated first | a UI surface → a new Phase 17 item (tasks 1, 3 unchanged); a drain instead → task 3 becomes a migration in this range plus a Vault-held anon JWT, task 15 loses its embed line |
| B-32 | iCal feed job (Q24) | retire: unschedule `bb2dash-ical-poll`, amend R-15's clause | keep → task 14 is replaced by a parser over the registered `kind = 'calendar'` payload (node-ical), after Stack pastes the share link |
| B-33 | GEO.103 textbook chapters (Q25) | ebooks behind Orange Instant Access → Off-platform; the phys.org link recorded; Huber (46) stays tagged | chapters really on Blackboard → migration 125 sets only reading 45's url; screenshot 06 changes |
| B-34 | two live copies; the three IST.352 decks (Q26) | keep both copies current (17/15, 18/19); link decks 31 / 47 / 32 to sessions 129 / 130 / 131 | supersede instead → 120 gains those rows; 123 drops the three hand links |
| B-35 | week and session links for files (Q27) | yes, its own ingest item outside V-1, per-course rules, one Inbox question when a file fits several sessions | no → tasks 10 and 11's session step drop (124 keeps the supersession step); task 24 still ships |
| B-36 | announcement author (Q28) | probe on the next sync; expect a resolvable `creatorUserId`; resolve from the course's teacher ids, then one `/users/{id}` per miss, cached per run; drop the author segment only if nothing is there | no new endpoint → task 18 resolves teacher ids only, the rest stay "not recorded"; nothing present → task 18's fallback drops the segment |
| B-37 | course files pulled inside the sync (Q29) | in the skill now, with the scripted signed-CDN fetch; Phase 14's runner inherits it | outside the sync → task 15 changes only runbook step 4; task 17 reads its counts after a runbook pull |
| B-38 | per-item Blackboard links (Q30) | build `bb_url` now from the public Ultra template; the tab confirms, it does not gate | wait for the tab → task 13 waits for 98a §2 (task 23 unchanged) |
| B-40 | one logged-in probe sitting (P-27) | with the next sync: announcement shape, per-item URL, meeting times, `feedbackToUser`, group-attempt files | separate sittings → tasks 18, 19 and 26 wait for their own; task 16 runs once per sitting |

One more PROVISIONAL dependency is Phase 15's, not this phase's: **B-42** (a `BB2DASH_TEST_DB_URL` connection string for a
`db_test_runner` role). Every `db/tests` check below runs through Phase 15's runner under that credential, and tasks 21
and 22's live runs read it. Neither the role nor `scripts/db-test.mjs` exists on 2026-09-24 (prod `pg_roles`, repo `main`
a5042fa); if Stack answers B-42 otherwise, those checks run through `execute_sql` with the same expected values.

Under B-34's default the two documents Blackboard itself posts in two live places (15/17, 18/19) keep **both** copies
current, so "one current copy" in this brief means one copy of each *replaced* document, not of every document.

## Contract (frozen when Stack approves the phase plan)

### Routes and screens

No new route and no new screen. Visible changes, all through existing screens:

* `/materials`: one current copy of each replaced document (R-63; 15/17 and 18/19 stay two copies under B-34's
  default); GEO.103 chapter tags (R-68, B-33's default).
* ⌘K palette (`web/src/components/shell/CommandPalette.tsx`, unchanged): notes text reaches it labelled (R-62, server side).
* Assignment popout (`?item=assignment:…`), `/course/[id]/assignment/[...assignmentId]` and the `/planner` popover:
  "Open in Blackboard ↗" opens the item's own Ultra page when `assignments.bb_url` is set (R-69).
* `/course/[id]/classwork?view=timeline`: session rows show linked files; no "no files" line on a course with no
  session-linked files (R-67).
* Bell and `/announcements`: the author segment shows a name (R-70), or goes (B-36 fallback).

### RPC signatures

Grants are read from `pg_proc.proacl` at write time and re-asserted unchanged unless stated. The search functions'
`search_path` is the value Phase 15's pin gave them (prod today: `proconfig` null; pgvector lives in schema `extensions`).

| function (full signature) | mode | grants | migration |
|---|---|---|---|
| `public.hybrid_search_file_text(q text, query_embedding vector, p_model text default 'gte-small', p_course text default null, p_limit integer default 10, rrf_k integer default 50, p_min_similarity double precision default null, p_include_superseded boolean default false) returns table(file_id bigint, text_id bigint, course_id text, bucket file_bucket, file_name text, unit_kind text, unit_no integer, score double precision, similarity double precision, snippet text, part_no integer, snippet_source text)` — body replaced, arguments and columns unchanged | SECURITY INVOKER | as today (PUBLIC, anon, authenticated, service_role) or as Phase 15 left them | 121 |
| `public.search_file_text(q text, p_course text default null, p_limit integer default 20, p_include_superseded boolean default false) returns table(file_id bigint, text_id bigint, course_id text, bucket file_bucket, file_name text, unit_kind text, unit_no integer, rank real, snippet text)` — body replaced | SECURITY INVOKER | as above | 121 |
| `public.supersede_replaced_files(p_run_id uuid, p_sync_run_id bigint) returns jsonb` → `{examined, superseded, asked, older_run}` (new) | SECURITY DEFINER, `set search_path = public, pg_temp` | revoke all from public, anon, authenticated; execute to service_role | 122 |
| `public.file_week_no(p_course_id text, p_path text, p_file_name text) returns smallint` (new) | IMMUTABLE, INVOKER, `public, pg_temp` | revoke from public, anon; execute to authenticated, service_role | 123 |
| `public.link_file_sessions(p_sync_run_id bigint) returns jsonb` → `{files_examined, weeks_set, sessions_linked, ambiguous, attention_raised}` (new) | SECURITY DEFINER, `public, pg_temp` | service_role only | 123 |
| `public.stage_files(p_run_id uuid, p_sync_run_id bigint) returns jsonb` — re-created from 074's body; `counts` gains `superseded_auto` and `session_links` | SECURITY DEFINER, `public, pg_temp` | service_role only (038) | 124 |
| `public.assignment_bb_url(p_course_id text, p_item_id text) returns text` (new) | STABLE, INVOKER, `public, pg_temp` | revoke from public, anon; execute to authenticated, service_role | 126 |
| `public.stage_assignments(p_run_id uuid, p_sync_run_id bigint) returns jsonb` — re-created from 084's body | SECURITY DEFINER, `public, pg_temp` | service_role only | 126 |
| `public.stage_courses(p_run_id uuid, p_sync_run_id bigint) returns jsonb` — re-created from 034's body (its only definition), **only if** 98a §3 finds meeting data | SECURITY DEFINER, `public, pg_temp` | service_role only | 129 |

Rules the bodies must keep:

* **Notes label (121).** A returned `snippet` either holds no text from at or after the unit's first `[notes]` marker,
  or starts with `[notes] ` and holds only text after it. A slice that spans the marker is headlined on the side that
  covers the tsquery (the pre-marker side on a tie). Row 41's cover-and-rank order and `part_no` meaning are unchanged.
* **Auto-supersession (122).** For a current `bb_files` row F (not `stack`, not `my_submissions`) whose `content_id` is
  in the newest registered crawl of its course while its `source_url` is not: if that item now carries exactly one file
  whose current row G ≠ F, set `F.superseded_by = G.id` and append a note naming the run. Several candidates, or a match
  by file name alone across items, raise one `stack_must_confirm` through `raise_attention(...)` and write nothing.
  Only the newest registered crawl writes (037's guard). It runs before the missing marker.
* **Week and session (123).** `file_week_no` holds the per-course rules Stack confirms under B-35. Drafted from R-67 (2):
  GEO.103.lecture `Week N`; IST.323 `Lecture #N - Week N`; IST.352 `WKnn`; no rule for IST.466 (its Wk tags name schedule
  versions), ECN.304, IST.471 or GEO.103.recitation. `link_file_sessions` fills only null `week_no` / `session_id` on
  current, non-`stack`, non-`my_submissions` rows. It links through `reading_id → readings.for_date = sessions.session_date`
  (`link_confidence` 1.0), else through a week with exactly one session (0.8, PM's constants, named in the migration). A
  week with several sessions gets one question, settled on a later fold exactly as 086 settles reading links.
  `storage_path` and `local_path` are never written.
* **bb_url (126).** `assignment_bb_url` returns `<origin of courses.bb_url>/ultra/courses/<courses.bb_id>/outline/assessment/test/<bb_item_id>?courseId=<courses.bb_id>&gradeitemView=details`
  when a `bb_content` row for `(course_id, bb_item_id)` has `bb_type = 'resource/x-bb-asmt-test-link'` (37 rows today),
  and null otherwise (1 survey-link, 3 with no content row, 16 column-only) until 98a §2 shows another segment. The
  match is an `exists` test, never a join: 3 of the 37 test items carry two `bb_content` rows each (the rename ghosts
  P-25 collapses in Phase 19), and a join would double-count them. The stage writes it only where `bb_url is null` and
  never overwrites an Inbox-confirmed value. A new column's insert carries `bb_item_id = column.contentId`. Template
  source: `research/92_RESEARCH_sprint2_ingest-data.md:320`; origin from `courses.bb_url` (all seven are
  `https://blackboard.syracuse.edu/ultra/courses/<bb_id>/outline` on 2026-09-24).

### Tables and migrations

Additive only. Each file is dry-run inside `begin; … rollback;`, then applied with `apply_migration` under the file's
name, and the repo file stays byte-identical to what was applied. No table is created. Nothing here touches
`stage_content`, `bb_content`'s keys, `transform_tick`, `run_transform`, `stage_gaps`, `v_course_stream` or `v_content_tree`.

| # | file | creates / changes |
|---|---|---|
| 120 | `db/migrations/120_supersede_file_chains.sql` | data: `bb_files` 2 → 151 and 74 → 149 (`superseded_by`, note citing `bb_raw` run 3b5174b8 and row 171); a guard raises unless exactly 2 rows change (P-26) |
| 121 | `db/migrations/121_search_notes_label.sql` | `create or replace` of both search functions under the notes rule (R-62). **Only if** task 8's rule fires, it also adds `bb_text_embeddings.part_fts tsvector` (new), filled by a BEFORE INSERT trigger from `bb_file_text` through `part_range` (a generated column cannot read another table, so this departs from 93 §1.10's "generated column"; 91 R-77 (2) allows the trigger), backfilled, and read at both `to_tsvector` sites (R-77) |
| 122 | `db/migrations/122_supersede_replaced_files.sql` | `supersede_replaced_files` (R-63) |
| 123 | `db/migrations/123_file_week_session_links.sql` | `file_week_no`, `link_file_sessions`; hand links 31→129, 47→130, 32→131 (B-34); backfill `link_file_sessions(null)` with a guard on its counts (R-67) |
| 124 | `db/migrations/124_stage_files_rules.sql` | `stage_files` re-created: 074's steps plus the supersession step (before the missing pass) and the session step (after `link_reading_files`) |
| 125 | `db/migrations/125_geo103_reading_routes.sql` | data: `readings.on_blackboard = false` for 39, 41, 44, 49, 52, 58, 59, 60, 61, 62; `readings.url` for 45 from `bb_content` 114; notes cite B-33 (R-68) |
| 126 | `db/migrations/126_assignment_bb_url.sql` | `assignment_bb_url`; `stage_assignments` re-created; backfill (R-69) |
| 127 | `db/migrations/127_retire_ical_poll.sql` | `cron.unschedule('bb2dash-ical-poll')`; `ical_poll` / `ical_collect` and `app_settings.ical_*` left in place (R-72) |
| 128 | `db/migrations/128_db_test_runner_phase18_grants.sql` | **only if** Phase 15's `db_test_runner` (new in Phase 15; absent from prod `pg_roles` on 2026-09-24) lacks what this phase's tests and `token_budget.py` read (select on `bb_files`, `bb_file_text`, `bb_text_embeddings`, `readings`, `assignments`, `bb_content`; execute on the search functions); otherwise unused |
| 129 | `db/migrations/129_stage_courses_meetings.sql` | **only if** 98a §3 finds meeting times: `stage_courses` writes `meetings` under source + confidence (a differing confirmed row raises a conflict, never an overwrite); otherwise unused |

### Scripts, environment and payload contracts

* `ingest/fetch_signed.mjs` (new, pure, importable by the Phase 14 runner): `SIGNED_HOST_SUFFIX = '.content.blackboardcdn.com'`,
  `MAX_HOPS = 3`; `validateHops(hops)`; `resolveSignedUrl(get, durableUrl)` walks redirects one hop at a time through an
  injected `get(url) → {status, headers}` (Playwright's `APIRequestContext.get(u, { maxRedirects: 0 })`); `downloadTo(fetchImpl,
  signedUrl, destPath)` writes to a temp file, then renames, with copy-then-unlink on `EXDEV`. A signed URL is never cached
  past one run. Outcomes: `ok` · `session_expired` (401/403 on hop 1) · `gone` (404) · `refused` (hop count or host).
* `ingest/pull_files.mjs` gains `--fetch` (each manifest row carries `hops: string[]` recorded by the browser half; the
  last is the signed URL; the script validates and downloads it), `--restale` (rows noted `stored bytes may be stale`:
  a new Storage key, never an overwrite; `--out` gets one `begin; delete from bb_file_text where file_id = …; insert …;
  update bb_files …; commit;` per row, note cleared) and `--no-embed`. After a non-dry run that posted any unit it runs
  the embed step.
* `ingest/embed_corpus.mjs` (new): `node ingest/embed_corpus.mjs [--check] [--max-parts 3] [--budget 60]`. It loops
  `embed-corpus` until `remaining_parts = 0`, retrying 546/503 within the call budget. It exits 1 on a non-empty `failed`
  or an exhausted budget. `--check` sends `dry_run: true`, prints `missing_parts_before=<n>` and exits 1 when n > 0.
* `SB_ANON_JWT` (new env name): the legacy anon JWT that `embed-corpus` and `search` need (`verify_jwt` on).
  `embed_corpus.mjs` and `eval_search.mjs` refuse a value that starts `sb_publishable_`. `SB_ANON_KEY` keeps its meaning
  for Storage and REST inserts.
* `ingest/token_budget.py` (new): `uv run --with tokenizers --with "psycopg[binary]" python ingest/token_budget.py`.
  It reads `BB2DASH_TEST_DB_URL` (Phase 15), rebuilds each current part's embedded input (header + `part_range` slice)
  and tokenizes it with `thenlper/gte-small`'s tokenizer. It prints `parts=<n> max_tokens=<n> over_budget=<n>` and exits 1
  when any part exceeds 512 tokens, [CLS] and [SEP] included.
* `ingest/eval_search.mjs` (new) over `ingest/eval/golden_set.json` (new; rows `{qid, course, query, type, truth:
  {text_ids, file_ids}, answer_phrase}`, the ten queries of `EVAL_EMBEDDING_POC.md` §2). It runs each query in `fts`,
  `vector` and `hybrid` with limit 10 and scores hit@1/3/10 and MRR. It writes `ingest/eval/reports/<YYYY-MM-DD>.json`,
  prints `scored=30` and exits 1 if hybrid MRR < 0.900 (PM's bar; the 2026-09-09 baseline is 0.950).
* Crawler envelope v5 (`ingest/bb_crawler.js`): `payload.crawler = { version: 5, probe: { announcementKeys: { <bb course id>:
  string[] }, idShaped: [{ key, value }], misses: { <key-list name>: number } } }`. A mapped announcement carries
  `authorUserId` beside `author` / `authorSource`. `GET /learn/api/v1/users/{id}` is called at most once per distinct
  unresolved id per run. `ATTEMPT_FIELD_KEYS.feedback` tries `feedbackToUser` first; attempt prose stays under `results[].text`.

### Files

New: `ingest/fetch_signed.mjs`, `ingest/fetch_signed.test.mjs`, `ingest/embed_corpus.mjs`, `ingest/embed_corpus.test.mjs`,
`ingest/token_budget.py`, `ingest/test_token_budget.py`, `ingest/eval_search.mjs`, `ingest/eval_search.test.mjs`,
`ingest/eval/golden_set.json`, `ingest/eval/reports/<date>.json`, `db/migrations/120`–`127` (128, 129 conditional),
`db/tests/phase18_120_supersede_file_chains.sql`, `db/tests/phase18_121_search_contract.sql`,
`db/tests/phase18_122_supersede_rule.sql`, `db/tests/phase18_123_file_sessions.sql`, `db/tests/phase18_124_stage_files_replay.sql`,
`db/tests/phase18_125_geo103_reading_routes.sql`, `db/tests/phase18_126_assignment_bb_url.sql`,
`db/tests/phase18_127_ical_retired.sql`, `db/tests/phase18_post_embed_checks.sql`, `db/tests/phase18_golden_truth.sql`
(+ `phase18_129_stage_courses_meetings.sql` if 129), `db/fixtures/phase18/announcements_v5.json`,
`web/src/lib/blackboard-link.ts`, `web/test/blackboard-link.test.ts`, `web/test/course-timeline-files.test.tsx`,
`docs/planning/sprint-2/evidence/98a_PROBE_SITTING.md`, `docs/planning/sprint-2/verification/98c_W48_VERIFICATION.md`,
`docs/planning/sprint-2/verification/98d_W49_VERIFICATION.md`, `docs/planning/sprint-2/verification/98e_W50_VERIFICATION.md`,
`docs/planning/sprint-2/verification/98f_W51_VERIFICATION.md`, `docs/planning/sprint-2/walks/walk-18/*.png` (the
`evidence/`, `verification/` and `walks/` folders under `sprint-2/` are new too; DECISIONS 2026-09-22 names them).

Changed: `ingest/pull_files.mjs`, `ingest/pull_files.test.mjs`, `ingest/bb_crawler.js`, `ingest/CADENCE_RUNBOOK.md`,
`skills/bb-sync/SKILL.md`, `skills/bb-course-pull/SKILL.md`, `EVAL_EMBEDDING_POC.md` (one line), `DATA_SYNTAX.md`,
`db/fixtures/phase12b/attempts_v4.json`, `db/fixtures/phase12b/README.md`, `db/tests/phase12b_load_fixture.sql`
(regenerated by `db/fixtures/phase12b/build_load_sql.js`), `web/test/crawler.attempts.test.ts`,
`web/test/crawler.announcements.test.ts`, `web/test/fixtures.phase12b.test.ts`,
`web/src/components/popout/AssignmentDetailBody.tsx`, `web/src/components/planner/PlannerItemPopover.tsx`,
`web/src/app/(app)/course/[id]/classwork/CourseScreen.tsx`, `web/src/lib/queries.search.ts` (comments only),
`supabase/functions/search/index.ts` (header comment only), `web/test/AssignmentPopout.test.tsx`,
`web/test/PlannerItemPopover.test.tsx`. B-36 fallback only: `web/src/lib/queries.announcements.ts`,
`web/src/components/shell/Bell.tsx`, `web/src/components/announcements/AnnouncementsList.tsx`, `web/test/Bell.test.tsx`
(`:313–319`) and `web/test/AnnouncementsList.test.tsx` (`:171–174`), whose "author is not recorded" cases assert
`'ECN 304 · not recorded · Sep 13'` today.
PM only: `project-state/STATUS.md`, `DECISIONS.md`, `ORCHESTRATOR.md`, `docs/planning/sprint-2/briefs/100_PHASE14_containers.md`
(P-28; new, written in Stage C, not on disk on 2026-09-24), this brief, and the installed skill copy
`C:/Users/estac/.claude/skills/bb-sync/SKILL.md` (outside the repo; task 16 copies the branch's file over it before the
gate). Not changed: `supabase/functions/embed-corpus/index.ts`
(no redeploy), `web/src/lib/supabase/database.types.ts` (no RPC signature changes; `assignments.bb_url` already exists).
Worker ownership is disjoint; see §Workers.

### Seams

* **Phase 15 → 18.** The runner `node scripts/db-test.mjs` (new in Phase 15, not on disk at `main` a5042fa; 94 §3's
  name, which brief 95 freezes) runs every `db/tests/*.sql` inside begin…rollback and exits non-zero on any FAIL (P-99).
  Credential `BB2DASH_TEST_DB_URL` for the `db_test_runner` role (P-31, P-100; both new in Phase 15, and PROVISIONAL on
  Phase 15's B-42). The search_path pin on `hybrid_search_file_text` and `search_file_text` (121 copies
  Phase 15's value). Any new function sets its own `search_path`, so the advisor count Phase 15 brought to 0 stays 0.
* **Phase 17 ↔ 18 (parallel).** R-56 (17) closes the `files_without_bytes` gaps that `stage_gaps` raises before the
  in-sync pull lands bytes; this phase does not re-create `stage_gaps`. R-58 / P-72 (17) decide whether `stage_files`'
  new `superseded_auto` / `session_links` counts become Activity lines. R-47's staging proof is 17's. 17 owns the
  `v_course_stream` / `v_content_tree` migrations. Both phases touch `AssignmentDetailBody.tsx`, `PlannerItemPopover.tsx`
  and `CourseScreen.tsx`: this phase edits only the named hunks, and the second phase to merge rebases. On B-36's
  fallback only, W-51 also edits `web/src/lib/queries.announcements.ts` and `web/src/components/shell/Bell.tsx` (Phase
  17's W-47 files, brief 97 T-23), `web/src/components/announcements/AnnouncementsList.tsx`, and the not-recorded
  cases of `web/test/Bell.test.tsx` and `web/test/AnnouncementsList.test.tsx`, under the same named-hunk rule.
* **18 → 19.** `stage_files` is re-created once here; 19 re-creates `stage_content` and does not touch `stage_files`.
  This phase leaves `stage_content`'s body unchanged (task 11 checks it with md5). 126 reads `bb_content.bb_type`, which
  already carries Blackboard's handler, so R-69 does not wait for 19's `contentHandler` carry (P-95); 19's key change must
  keep `bb_type`. 19's driver migration may drop the `ical_collect()` call from `transform_tick`, which 127 makes a no-op.
* **18 → 14.** The runner imports `ingest/fetch_signed.mjs` (passing Playwright's request context) and runs
  `ingest/embed_corpus.mjs` after its pull (P-36; P-92 closes P-37 by reference). It injects crawler v5. Its sync image
  needs `uv` plus `extract_text.py`'s three libraries, and not antiword or tokenizers (both PM-run here). Task 27 writes
  these names into brief 100.
* **Sprint 1 objects kept as they are:** 074's `stage_files` steps, `link_reading_files` (086's settle pattern),
  `raise_attention(p_sync_run_id bigint, p_kind text, p_course_id text, p_entity text, p_ref text, p_field text, p_from jsonb,
  p_to jsonb, p_question text, p_suggested jsonb) returns boolean`, 084's `stage_assignments` steps, `bb_file_relpath`
  (reads `week_no`; stored keys are never rewritten), `v_bb_files_current`, the three RPCs' superseded filter,
  `embed-corpus` v5, `match_file_text`.

### Must respect

Quotes dated `[YYYY-MM-DD]` are verbatim from `project-state/DECISIONS.md` (checked by fixed-string match, 2026-09-24);
quotes from other files name the file.

* [2026-09-24] "No product call in them is adopted here: each gets its own row, dated the day Stack answers, and a brief may not cite a default as decided before then"
* [2026-09-09] "Workflow SOP: dev on branches, push per completed task, **one PR per phase**, merge only on Stack's word"
* [2026-09-10] "Parallel phases get **non-overlapping migration ranges** (Phase 8 = 026–029, Phase 9 = 030–039) allocated in the briefs"
* [2026-09-14] "**Every task carries an executable check** (test, SQL assertion, curl, screenshot diff) the worker runs itself, plus one demo line for the acceptance script; a task without a check is not a task"
* [2026-09-17] "**Deferred: `bb_content` key change** for IST.466's duplicate folder paths (P-data-1) to the next phase that touches `stage_content`" — this phase does not touch it.
* [2026-09-22] "**The manual file pull (CADENCE_RUNBOOK step 4) runs from the Playwright browser:** `page.waitForEvent('download')` around an anchor click on the durable bbcswebdav URL saves the bytes; sha256, the local mirror, the Storage POST (publishable key, no `x-upsert`), `extract_text.py` under `uv run --with python-docx --with python-pptx --with openpyxl`, and `POST /rest/v1/bb_file_text` follow from a script. Storage keys drop `#`; a re-upload of an already-stored file gets its own key and supersedes the older row; a 404 marks the row superseded by its replacement" — its first sentence would be superseded by this phase's row (PROVISIONAL, B-37); the rest stands.
* [2026-09-15] "Submission bytes are pulled by a new **bb-sync step 4b** in the logged-in tab (Playwright download → sha256 → Storage at `bb_file_relpath` → mirror → row update); `stage_attempts` only catalogues the files (`bucket = 'my_submissions'`, `classified_by = 'blackboard'`, `attempt_id`)" — "Playwright download" becomes the scripted fetch under the same row (PROVISIONAL, B-37); the chain after it stands.
* [2026-09-24] "v3 §4 D-7 (the dropped OneDrive mirror) does **not** forbid the skill's copy into `course context/` (`bb-sync` step 4b, `ingest/pull_files.mjs`; rows 2026-09-15 and 2026-09-22)"
* [2026-09-22] "**The file pull lives in the repo: `ingest/pull_files.mjs` (+ `node --test ingest/pull_files.test.mjs`)**, replacing the session scratchpad script. The browser half stays a Playwright snippet in its header; the script never writes `bb_files` itself and hands the owner one `update` per file"
* [2026-09-15] "A pulled-back submission file's Storage key carries an **`attempt-<id>/` segment** (`bb_file_relpath`, 052); a staged file keeps `<course>/my_submissions/<slug>/<file>`; step 4b never treats a Storage 409 as done"
* [2026-09-15] "`my_submissions` rows are **exempt from `stage_files`' missing marker (053) and from `stage_gaps`' "bytes never stored" gap when they carry an `attempt_id` (054)**; step 4b reports files it could not pull in its own summary"
* [2026-09-15] "`bb_files` anon INSERT is tightened to refuse `bucket = 'my_submissions'` and any `classified_by` of `stack` or `blackboard`; the Storage `bb_files_anon_insert` policy (bytes only) is **left as is**"
* [2026-09-09] "`embed-corpus` persists per-part, not per-unit" · [2026-09-09] "Embeddings in their own table keyed `(text_id, model, part_no)`, not a column on `bb_file_text`"
* [2026-09-10] "`part_range` is defined in **code points** (`Array.from(text)`), matching Postgres `char_length`/`substring`; `embed-corpus` v5 chunks that way, 023 clamps the one historical overrun instead of re-embedding"
* [2026-09-10] "`[notes]` handling for sliced snippets is server-side: prefix `[notes] ` when the marker precedes the slice; whole-unit fallback headlines only the text before the marker (024)" — amended by this phase's row.
* [2026-09-10] "Hybrid `snippet` is the **matched passage**, plain text: `ts_headline` with `StartSel`/`StopSel` emptied over the best embedding part's slice for FTS-arm hits, that slice's head for vector-only hits; `snippet_source` says which"
* [2026-09-10] "Keyword-arm snippets are cut from a part whose slice **covers the tsquery** — the highest-`ts_rank` covering part, vector-best part as tiebreak, lowest `part_no` last — else `ts_headline` over the whole unit; `part_no` = the part the snippet was cut from (null for the fallback) (migrations 024–025)"
* [2026-09-10] "Keyword-mode (`search_file_text`) headline is plain text too (`StartSel`/`StopSel` emptied, 024); `limit` applied inside `fused` before the joins" · [2026-09-10] "MCP excerpt label depends on **mode** first, `snippet_source` second"
* [2026-09-10] "Accepted +25% query time (≈22 → 27 ms, limit 12) for the ranked cover rule; the stored per-part `tsvector` that would remove it is backlog, not this phase"
* [2026-09-10] "Superseded files are dropped **before ranking** in all three search RPCs (`p_include_superseded boolean default false`); `search` v4 / MCP / web expose `include_superseded`, sent only when true"
* [2026-09-10] "`superseded_by` seeded by data migration 022 for exactly the four stale IST.466 rows 018 named, matched by **sha256** and justified from `bb_files.notes` + `bb_raw`; 16 vs 40 deliberately NOT ordered (two locations of the same Sep 3 document — both point at 66)"
* [2026-09-11] "Only the newest crawl may declare a file missing (`stage_files` replay guard, 037)"
* `docs/planning/sprint-1-hub/briefs/62_PHASE9_sync_loop.md:71` (`stage_files` contract): "Never touch rows with `classified_by = 'stack'` or a non-null `superseded_by`."
* `62_PHASE9_sync_loop.md:67` (`stage_courses` contract): "`meetings` only when the row is `source = 'blackboard'`" and "syllabus-sourced rows are never overwritten" — 129, if built, reads this as "conflict, never overwrite" (91 R-73 Notes).
* `docs/planning/sprint-1-hub/briefs/80c_PHASE12B_page_pass.md:145`, Stack's answer 17: "GEO.103's daily reading-question documents and the readings **are files on Blackboard**." — B-33's default departs from it for the ten textbook chapters only (91 R-68 (1)); the articles keep it.
* [2026-09-02] "Every fact row carries `source` + `confidence`" · [2026-09-10] "Inbox resolutions carry a free-text `resolution_note` ("why") and are applied by the next transform, never directly" · [2026-09-14] "`attention_items` dedupes only while `state = 'open'` (041)"
* [2026-09-03] "Crawler holds only the publishable key; insert-only RLS"
* [2026-09-15] "**Reversal adopted (Requirements v2 §5): new Blackboard endpoints** — the crawler adds `…/gradebook/columns/{col}/attempts` and `…/gradebook/attempts/{id}/files`, records per-column HTTP status instead of throwing, and carries a `keys` probe on the first raw attempt; every `kind = 'course'` payload gains `crawler.version = 3`" — `/users/{id}` is not covered and needs its own row (B-36).
* [2026-09-15] "`announcements.author` stays "not recorded" through Phase 11" — Phase 11 has closed.
* [2026-09-17] "**Crawler v4 reads attempts the way Blackboard's own UI does:** column → my grade row → attempts under that grade → attempt detail with `studentSubmissionFiles` (`80f_ATTEMPTS_ENDPOINT.md`)"
* [2026-09-15] "the popout shows **submission status, attempts and files, never a score**; Blackboard's attempt `receipt` is stored in `bb_attempts` but **not rendered**"
* [2026-09-15] "The phase's only real crawl is **step (0) of Stack's acceptance script**, run with the new crawler before merge; workers build and test on fixtures cut from the 9/14 payloads plus a synthetic attempts payload in the frozen shape"
* [2026-09-10] "Sync cadence: **Stack triggers**, the app does the rest; no scheduled crawl, no reminders" · [2026-09-10] "The transform folds **only crawls registered on an owner-claimed `agent_requests` row** (`agent_requests.run_id`, migration 039); unregistered `bb_raw` runs are quarantined once, never folded; `bb_raw` unique on `(run_id, kind, bb_course_id)`"
* [2026-09-14] "iCal responses are collected by `ical_collect()` on every 2-minute tick, not by the daily poll (044)" · [2026-09-14] "Google Calendar push is **due dates only** on one dedicated calendar; meetings are not pushed (supersedes Requirements v2 §6.2 #1)"
* [2026-09-10] "Course resolution from `bb_raw` uses `courses.bb_id` first, `bb_course_id` as fallback" · [2026-09-10] "IST.466's duplicate content paths left as first-wins (5 rows counted, none invented)"
* [2026-09-13] "One `FileOpenAction` component owns the file Open ladder on every screen; `fileHonesty` answers `unknown` ("Not stored") for fields a source does not carry rather than asserting there is no route"
* [2026-09-16] "**Direction: after development, bb2dash migrates from this laptop into containers (R-28).** Phase 12's OneDrive file mirror is **dropped**"
* [2026-09-24] "STATUS's known-issue rows that sprint 1 fixed are struck through with the fixing migration named, not deleted"
* CLAUDE.md: "Search UIs must scrub/label PPTX `[notes]` speaker-note markers and `Page N` headers." · "Migrations are additive and numbered (`db/migrations/NNN_name.sql`); apply to prod via `mcp__Supabase__apply_migration` with the same name, and keep the repo file byte-identical to what was applied." · "Edge functions: `verify_jwt` is on — use the legacy anon JWT, not the `sb_publishable_` key."
* `docs/planning/sprint-1-hub/60_REQUIREMENTS_v2.md:269` (§5, cited by 91 R-70): "No new Blackboard endpoints this term | R-17 (attempts), R-20 (creator field) | Crawler change reviewed; `bb_raw` envelope versioned" — `/users/{id}` needs its own reversal row (B-36).

## MVP (in Stack's words)

What Stack wrote, and where:

* S2-rag-1 (91 §3, `91_REQUIREMENTS_v3.md:1539`): "rag testing (all materials should be chunked and embedded)". His
  why, must/should, acceptance and must-not fields are still "_to confirm_"; B-8 proposes them.
* GEO readings (80c P-materials-2, `80c_PHASE12B_page_pass.md:84`): "off-platform but in bb should be pulled and changed
  to in library if possible, external if possible as well".
* GEO readings (80c answer 17, `:145`): "GEO.103's daily reading-question documents and the readings **are files on
  Blackboard**." B-33's default reads the ten chapters as the exception to this; he confirms or reverses it.

Everything below is **PM wording (PROVISIONAL)**, built from 93 §5's defaults B-8, B-33, B-34, B-36, B-37 and B-38, not
Stack's words. After one sync from the phase branch, every file Blackboard shows is stored, extracted and embedded
before the sync reports, with no hand step and no browser download event. ⌘K never shows speaker notes as slide text.
Materials and search show one current copy of each replaced document (the IST.323 syllabus, the IST.466 schedule); the
two documents Blackboard posts in two live places keep both copies. Each Blackboard test's "Open in Blackboard" opens its
own page. Announcements name who posted them, or the line goes. The GEO.103 textbook chapters read "Off-platform". A
committed check says the corpus is whole, and a committed eval says hybrid search still finds the ten known answers.

## Definition of done

Definition of done = the SOP gates below + Stack's acceptance script, walked on the Vercel preview, signed off once at
the PR (DECISIONS 2026-09-14). SOP gates (PM ticks each with its evidence in the PR body):

- [ ] **Plan gate:** Stack has answered 93 §5 (or said "defaults") and approved `94_SPRINT2_PHASES.md`; this Contract is
      frozen and its PROVISIONAL rows are rewritten to his answers before any worker starts.
- [ ] Every row of §Task list passes its check; evidence (test output, SQL result, screenshot path) is in the worker's
      `98c`–`98f` verification note or `98a`. Each code task's check was run and seen **failing first** (RED), and the
      RED output is in the same note.
- [ ] `web`: `npm run typecheck`, `npm run build`, `npx vitest run` → 0 failures, test count not below `main`'s.
      `mcp-server`: `npm test` → 0 failures (search result shapes unchanged). `node --test ingest/*.test.mjs` → 0 failures.
      `node scripts/db-test.mjs` → exit 0. `desktop/` is untouched.
- [ ] `/code-review main high`: CRITICAL and HIGH cleared. `/security-review` is **required**: new outbound fetches
      (signed-CDN host allowlist), a new Blackboard endpoint (`/users/{id}`), four SECURITY DEFINER bodies, a URL
      rendered from the database into an `href`, and owner SQL that deletes and reinserts text units.
- [ ] `get_advisors` (security): `function_search_path_mutable` → 0.
- [ ] `project-state/STATUS.md` (shipped, corpus counts, known-issue rows struck with their migration), `DECISIONS.md`
      (the 15 rows below on defaults) and `ORCHESTRATOR.md` updated in the PR. Brief 100 edited (task 27).
- [ ] Workers pushed per task on their branches; the PM merged them into `feat/ingest-corpus-18`; nothing committed to
      `main`. Every migration applied under its file name after a begin…rollback dry run, repo file byte-identical to
      what `list_migrations` shows.
- [ ] PR open on `feat/ingest-corpus-18`; Vercel preview URL answers 200. Stack sees the preview before merge.
- [ ] **Merge and the `search` redeploy only on Stack's word** in that conversation; otherwise the phase stops at
      "ready when you say so".

DECISIONS rows owed (each tagged `Phase 18 · <id>`, each dated the day Stack answers its B-number, per the 2026-09-24
row): R-60 scripted fetch replaces row 171's download method, and course files are pulled inside the sync (B-37) · P-92 the embed step is the pull's script call, no cron job, and Phase 14
inherits it · S2-rag-1 is a PM-run background check with no UI this sprint (B-8) · R-61 R-16's OCR clause is closed and
coverage lives under S2-rag-1 · R-62 row 43 amended · R-63 auto-supersession rule, with 17/15 and 18/19 kept current
(B-34) · R-67 v2 §5 reversal adopted outside V-1 (B-35) · R-68 GEO chapters off-platform (B-33) · R-69 `bb_url` composed
in SQL (B-38) · R-70 `/users/{id}` reversal, or the author segment dropped (B-36) · R-66 attempt prose lives in
`bb_attempts.raw` only and the three prose columns are v3-only · R-72 iCal poll retired and R-15 amended (B-32) · R-73
meetings record named · R-75 R-17's `slim()` clause closed · R-77 re-measured, with the outcome.

Stack's acceptance script (he walks it on the preview; the B-number after a step is the default it shows, and the step
changes if he answers otherwise):

0. From `bb2dash-wt-18`, he presses Sync (or runs `claude "/bb-sync <id>"`), logs in to Blackboard in the Playwright tab
   when asked, and stays about 15 minutes while the PM opens five things in that tab (task 16; B-40).
1. He reads the sync report: "N file(s) pulled and embedded", and no file named as not pulled (B-37).
2. `/materials` → IST.323: one syllabus, `323Fall26V1.4.docx`. IST.466: the Wk4xyz schedule, not the Wk3 one (P-26).
3. ⌘K "supplicant": the IST row shows "speaker notes hidden" (or "This slide is speaker notes only — hidden.") and no
   notes sentence as slide text (R-62).
4. `/planner` → an IST.323 due item → "Open in Blackboard ↗" opens that item's own Ultra page, not the course outline
   (B-38).
5. The bell: each announcement shows a person's name (or no author segment at all, if B-36's fallback ran) (B-36).
6. `/materials` → GEO 103: the ten textbook chapters read "Off-platform" with the syllabus link; the phys.org article
   opens (B-33).
7. IST.352 → Classwork → Timeline: 8/26, 8/31 and 9/2 each list their SA&D deck (B-34, B-35).
8. The PM shows him `98a` (five `## §` answers) and today's eval report (hybrid MRR ≥ 0.900; B-8).

What proves each requirement:

* R-60: task 17's three counts are 0 after an in-sync pull, and task 15's greps show the download event is gone.
* R-61: file 68 `extracted`, and `phase18_post_embed_checks.sql` (a)–(c) PASS.
* R-62: `phase18_121_search_contract.sql` PASS, and `phase18_post_embed_checks.sql` (d) PASS on the three live leaks.
* R-63: 2 → 151 and 74 → 149 on prod; `phase18_122_supersede_rule.sql` reproduces exactly those two from the crawl.
* R-66: `_3610995_1`'s attempt keeps its `instructorFeedback`; the crawler header has neither "STILL UNVERIFIED" nor
  "ALSO NOT" (task 19's two greps).
* R-67: `phase18_123_file_sessions.sql` and `phase18_124_stage_files_replay.sql` PASS; screenshot 07.
* R-68: the ten readings are `on_blackboard = false`, and reading 45 has its url.
* R-69: 37 per-item URLs; `blackboard-link.test.ts` green; screenshots 03 and 04.
* R-70: no announcement present in the gate crawl has a null author after its fold (or, on the fallback,
  `AUTHOR_NOT_RECORDED` is gone from `web/src`).
* R-72: `bb2dash-ical-poll` is gone from `cron.job`.
* R-73: 98a §3 answers it, and its DECISIONS row (or 129's test) exists.
* R-74: task 25's grep counts are all 0.
* R-75: its DECISIONS row, plus the crawler header grep.
* R-77: four medians in `98c`, and the ≤ 1.25× rule holds.
* S2-rag-1: tasks 1, 3, 21 and 22 green on prod data.

## Task loops

The phase cycle (the sprint 1 shape, 80c §Task loops), with the check that closes each step:

| # | step | executable check | owner |
|---|---|---|---|
| L1 | Stack answers 93 §5 and approves 94; the PM rewrites §Stack's calls and freezes the Contract | no row of §Stack's calls still reads "default taken" without his answer beside it | PM + Stack |
| L2 | Phase 15 merged: runner, test role, search_path pin | `node scripts/db-test.mjs` exits 0 on `main` | PM |
| L3 | Worktrees `bb2dash-wt-18` and the four worker worktrees cut from `feat/ingest-corpus-18` | `git worktree list` shows the five; each worker branch pushed | PM |
| L4 | Per task: write the check, run it and see it **fail**, build, run it and see it **pass**, push `feat(18-<n>): …`, paste both outputs into the verification note | each §Task list row has a RED and a GREEN line in `98a` or `98c`–`98f` | workers |
| L5 | PM check of each finished row; a row that fails goes back to its worker with the failing output | the row's check re-run by the PM gives the same result | PM |
| L6 | **Sync gate and probe sitting** (task 16) once tasks 2–5 and 15 are merged into the phase branch; first the PM copies `skills/bb-sync/SKILL.md` from `feat/ingest-corpus-18` over the installed `C:/Users/estac/.claude/skills/bb-sync/SKILL.md`, which is the copy `/bb-sync` loads | task 16's checks: the installed-copy `cmp` → exit 0 before the sync, then the three gate checks | Stack + PM |
| L7 | Post-gate tasks 17–22 and 26; integrate; full suites | §DoD test-suite box | PM + workers |
| L8 | PM walk (task 28), gates and docs (task 29), PR with preview | §DoD SOP boxes | PM |
| L9 | **Stack's acceptance script** on the preview; merge and `search` redeploy only on his word | each numbered step ticked by Stack | Stack |

## Task list

Checks name a test file with its command, a SQL assertion with its expected value, a count, a screenshot or an HTTP
status. `<run>`, `<request>` and `<date>` are filled from the gate sync and written into `98a`. No check contains a
shell pipe (a `|` inside a table cell is ambiguous when copied): greps are `grep -c` / `grep -cF` on one file, or
`git grep` with its exit status. "Today" counts were read at `main` a5042fa on 2026-09-24, so every grep check is RED
before its task.

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 1 | **RED baseline**, written before any fix: `db/tests/phase18_post_embed_checks.sql`, every assertion scoped to current files (`superseded_by is null`, P-89), asserts (a) every current file with `text_status <> 'na'` has ≥ 1 `bb_file_text` row; (b) every current `na` file shares `sha256` with a current `extracted` file (17 ↔ 15), or its id is in the test's own named-exception list, which is empty; (c) for every unit of a current file and model `gte-small`: `part_no` runs `1..n` with no missing number, part 1 starts at 0, the last part ends at `char_length(text)`, and each part starts at or before the previous part's end (parts **overlap** by design, embed-corpus `PART_OVERLAP = 200`; 761 of 1,545 do today, so "start = previous end" would be wrong); anti-join WHERE on the join key only; (d) hybrid `supplicant` on units 750 and 738, `subrequirements` on 482, keyword `supplicant` on 738 and 750, and the lowest-`text_id` multi-part `[notes]` unit, each come back labelled under Contract rule 121. The SQL runner cannot embed text, so hybrid calls pass the unit's own stored part-1 embedding as `query_embedding`; the label rule must hold whichever part the tiebreak picks | P-24, P-89, R-61, R-62, S2-rag-1 | W-48 | `node scripts/db-test.mjs` before task 7 → the `phase18_post_embed_checks.sql` line reads FAIL and names `supplicant` (d) and file 68 (b); after tasks 7 and 20 → PASS, exit 0 | "This check fails today on the leak you'd see in ⌘K; by the end it passes." |
| 2 | `ingest/fetch_signed.mjs` + test (Contract §Scripts) | P-22, P-36, R-60 | W-49 | `node --test ingest/fetch_signed.test.mjs` → 0 failures; the cases cover 2-hop and 3-hop chains accepted, a final host outside `.content.blackboardcdn.com` refused, a 4th hop refused, 401/403 → `session_expired`, 404 → `gone`, and `EXDEV` → copy-then-unlink | "Downloads no longer depend on the browser's download event." |
| 3 | `ingest/embed_corpus.mjs` + test | P-23, P-92, P-82, S2-rag-1 | W-49 | `node --test ingest/embed_corpus.test.mjs` → 0 failures (loops to `remaining_parts` 0; 546/503 retried within budget; non-empty `failed` → exit 1; `--check` sends `dry_run: true`; `sb_publishable_` refused); live `node ingest/embed_corpus.mjs --check` → `missing_parts_before=0`, exit 0 | "Embedding is one command, and the pull runs it for you." |
| 4 | `pull_files.mjs`: `--fetch`, `--restale`, the embed step, `--no-embed`; header without the download-event snippet | P-22, P-23, R-60 | W-49 | `node --test ingest/pull_files.test.mjs` → 0 failures, with the 17 existing tests kept and new cases for `--fetch` (hop validation), `--restale` (one transaction per row, new key) and the embed call (once after ≥ 1 unit; never on `--dry-run` / `--no-embed`); `grep -cF "waitForEvent('download'" ingest/pull_files.mjs` → 0 (today 1: the header's `page.waitForEvent('download', { timeout: 60000 })`, which the old pattern with a closing paren never matched) | "Same script; it now fetches the bytes itself." |
| 5 | Crawler **v5 probe**: `CRAWLER_VERSION = 5`; `crawler.probe` (announcement keys, id-shaped values, `misses` per key list); `creatorUserId` added to `AUTHOR_KEYS`; a bare id kept as `authorUserId`; `feedbackToUser` first for attempt feedback | R-70, R-66, P-97 | W-50 | `cd web && npx vitest run test/crawler.announcements.test.ts test/crawler.attempts.test.ts test/fixtures.phase12b.test.ts` → 0 failures (a bare `_123_1` creator → `author: null, authorUserId: '_123_1'`; `feedbackToUser: {rawText}` → its text; an unknown shape → `misses` + 1); `grep -c "const CRAWLER_VERSION = 5;" ingest/bb_crawler.js` → 1 | "The next sync records what Blackboard really sends instead of dropping it." |
| 6 | Migration 120 (P-26) + its test | P-26, R-63 | W-48 | `phase18_120_supersede_file_chains.sql` PASS; `select id, superseded_by from bb_files where id in (2,74) order by id` → `(2,151)`, `(74,149)`; `select count(*) from search_file_text('syllabus','IST.323',50,false) where file_id = 2` → 0 | "IST.323 shows one syllabus: V1.4." |
| 7 | Migration 121: notes rule in both search functions (+ `part_fts` only if task 8 says so) + `phase18_121_search_contract.sql` | R-62, R-77 | W-48 | `phase18_121_search_contract.sql` PASS: `pg_get_function_arguments` and `pg_get_function_result` of both functions equal the literals the test file holds, copied from prod before 121 (Postgres prints the defaults with casts, e.g. `p_model text DEFAULT 'gte-small'::text`, so the §RPC signatures prose is not the literal), `prosecdef` is false, `proconfig` equals Phase 15's pin and `proacl::text` equals the value recorded in `98c` before 121; post-embed (d) PASS | "⌘K never passes a professor's speaker notes off as slide text." |
| 8 | R-77 re-measure: W10 B3's probe, `EXPLAIN (ANALYZE, BUFFERS)`, warm, limit 12, "final exam date" and "attendance policy", 5 runs each, before 121 and after | R-77 | W-48 | `98c` §R-77 holds the lines `before_final_median_ms=<n>`, `before_attendance_median_ms=<n>`, `after_final_median_ms=<n>`, `after_attendance_median_ms=<n>` and either `part_fts=built` or `part_fts=not_built`: `grep -c "_median_ms=" docs/planning/sprint-2/verification/98c_W48_VERIFICATION.md` → 4, `grep -c "^part_fts=" docs/planning/sprint-2/verification/98c_W48_VERIFICATION.md` → 1; each after-median ≤ 1.25 × its before-median; `part_fts=built` exactly when a before-median ≥ 50 ms (PM's line, open item 5). The DECISIONS row is the PM's, counted in task 29 (workers never touch `project-state/`) | "Search is still fast; here are the numbers." |
| 9 | Migration 122 + `phase18_122_supersede_rule.sql` | R-63 | W-48 | PASS: with 2 and 74 un-superseded inside the transaction, the function over the newest registered crawl writes exactly 2 rows (2→151, 74→149); a replay writes 0; 31/32/47 and 155/156 unchanged; `stack` rows unchanged; an older run writes 0; a name-only match raises exactly 1 attention row and writes 0 | "A re-uploaded file replaces the old copy on the next sync by itself." |
| 10 | Migration 123 + `phase18_123_file_sessions.sql` | R-67 | W-48 | PASS: after `link_file_sessions(null)`, 0 current course files have `week_no` null where `file_week_no(course_id, path, file_name)` is not null; 0 pre-existing `week_no` / `session_id` values changed; 0 `storage_path` / `local_path` changed; every unlinked file with ≥ 2 candidate sessions has exactly 1 open attention row; replay writes 0. Prod: `select count(*) from bb_files where (id, session_id) in ((31,129),(47,130),(32,131))` → 3 | "A session row shows the files for that class." |
| 11 | Migration 124 + `phase18_124_stage_files_replay.sql` | R-63, R-67 | W-48 | PASS: a replay of the newest registered crawl changes 0 `bb_files` rows; `counts` has keys `superseded_auto` and `session_links`; identity args = `p_run_id uuid, p_sync_run_id bigint`; `select md5(prosrc) from pg_proc where proname = 'stage_content'` equals the value recorded in `98c` before 124 | "Every sync now does both on its own." |
| 12 | Migration 125 + its test | R-68 | W-48 | PASS; `select count(*) from readings where id in (39,41,44,49,52,58,59,60,61,62) and on_blackboard` → 0; `select (select url from readings where id = 45) = (select url from bb_content where id = 114)` → true | "GEO chapters say Off-platform; the phys.org article opens." |
| 13 | Migration 126 + `phase18_126_assignment_bb_url.sql` | R-69 | W-48 | PASS (a synthetic new column with `contentId` inserts with `bb_item_id` and `bb_url` set; a confirmed `bb_url` is never overwritten; replay writes 0); `select count(*) from assignments where bb_url like 'https://blackboard.syracuse.edu/ultra/courses/%/outline/assessment/test/%gradeitemView=details'` → 37 (38 if 98a §2 confirms the survey segment) | "Every Blackboard test links to its own page." |
| 14 | Migration 127 + `phase18_127_ical_retired.sql` | R-72 | W-48 | `select count(*) from cron.job where jobname = 'bb2dash-ical-poll'` → 0; `select count(*) from cron.job where jobname in ('bb2dash-transform-tick','bb2dash-calendar-push')` → 2; `select count(*) from sync_runs where source = 'ical'` 48 h after apply equals the value recorded in `98c` at apply | "The daily 'ok' row with no data behind it is gone." |
| 15 | bb-sync step 4b becomes "Pull the files", for course and submission rows. The browser half walks hops with `page.context().request.get(u, { maxRedirects: 0 })`; the script half runs `pull_files.mjs --fetch` for course rows, then `--bucket my_submissions`, then `--restale`, then `embed_corpus.mjs --check`. Step 5's `result` gains `files_pulled` and `files_not_pulled`; step 6 names every row not pulled; the "Course file bytes are not downloaded here" rule goes. `CADENCE_RUNBOOK.md` step 4 and `skills/bb-course-pull/SKILL.md` follow | R-60, P-22, B-37 | W-49 | `grep -cF "waitForEvent('download'"` → 0 in each of `skills/bb-sync/SKILL.md` (today 1, :155), `ingest/CADENCE_RUNBOOK.md` (today 1, :64) and `skills/bb-course-pull/SKILL.md` (today 0); `grep -cF "bb.downloadAll" skills/bb-course-pull/SKILL.md` → 0 (today 1, :35); `grep -cF "file bytes are not downloaded here" skills/bb-sync/SKILL.md` → 0 (today 1, the Rules bullet); `grep -cF "pull_files.mjs --fetch" skills/bb-sync/SKILL.md` → ≥ 1; `grep -cF "embed_corpus.mjs --check" skills/bb-sync/SKILL.md` → ≥ 1 | "The sync pulls every new file before it reports." |
| 16 | **Sync gate and probe sitting** (after tasks 2–5 and 15 are on the phase branch). Before the gate the PM copies `skills/bb-sync/SKILL.md` from `feat/ingest-corpus-18` over `C:/Users/estac/.claude/skills/bb-sync/SKILL.md`: `/bb-sync` loads that installed copy (a plain directory, byte-identical to `main` a5042fa's file on 2026-09-24), not the worktree's, so without the copy the gate would run the old step 4b and task 17 would read `files_not_pulled` as null. If the PR does not merge, the PM restores `main`'s copy. Stack runs one `/bb-sync` from `bb2dash-wt-18`. In the same tab the PM records `98a_PROBE_SITTING.md`, with captured bodies scrubbed as 80f did: `## §1` raw announcement shape and creator ids · `## §2` one per-item Ultra URL from Blackboard's own UI (a survey too, if one exists) · `## §3` whether any student view returns meeting times · `## §4` the `feedbackToUser` shape on IST.352 column `_3610995_1` · `## §5` whether an IST.352 group attempt lists files | P-27, B-40, R-60, R-66, R-69, R-70, R-73 | PM + Stack | before the sync, from `bb2dash-wt-18`: `cmp skills/bb-sync/SKILL.md C:/Users/estac/.claude/skills/bb-sync/SKILL.md` → exit 0; if the PR does not merge, after the restore: `cmp C:/Users/estac/projects/bb2dash/skills/bb-sync/SKILL.md C:/Users/estac/.claude/skills/bb-sync/SKILL.md` (the main checkout's file) → exit 0; the gate: `select count(*) from bb_raw where run_id = '<run>' and kind = 'course' and (payload->'crawler'->>'version')::int = 5` → 7; `select state from agent_requests where id = <request>` → `done`; `grep -c '^## §' docs/planning/sprint-2/evidence/98a_PROBE_SITTING.md` → 5 | "One sync and one sitting settle five questions." |
| 17 | R-60 in-sync proof, read from the gate sync | R-60 | PM | after step 4b: `select count(*) from bb_files where superseded_by is null and storage_path is null` → 0; `select count(*) from bb_files where superseded_by is null and notes like '%stored bytes may be stale%'` → 0 (72 and 144 re-pulled); `select (result->>'files_not_pulled')::int from agent_requests where id = <request>` → 0; `node ingest/embed_corpus.mjs --check` → `missing_parts_before=0` | "Nothing Blackboard shows is missing its bytes or its embeddings." |
| 18 | R-70 author, from 98a §1: `authorUserId` resolves against the payload's `teachers[].userId` (the ids `course_staff.bb_user_id` holds), then at most one `/learn/api/v1/users/{id}` per distinct miss per run (P-96); a failure counts in `probe.misses` and never throws. **Fallback (B-36), only if §1 shows no creator id:** W-51 drops the author segment | R-70, P-96, P-97, B-36 | W-50 (fallback W-51) | `cd web && npx vitest run test/crawler.announcements.test.ts` → 0 failures on `db/fixtures/phase18/announcements_v5.json` (a teacher id resolves with 0 fetches; two posts by one unknown id → exactly 1 fetch; a 403 → `author: null` plus a miss); after the gate run's fold, `select count(*) from announcements a where a.author is null and exists (select 1 from bb_raw b, jsonb_array_elements(b.payload->'announcements') e where b.run_id = '<run>' and b.kind = 'course' and e->>'id' = a.bb_item_id)` → 0 (scoped to the crawl, because `stage_announcements` (034) fills `author` only for rows a crawl carries; 19 of 19 are null today). Fallback: `git grep -c AUTHOR_NOT_RECORDED -- web/src` → no output, exit 1 (today `queries.announcements.ts:2`; a plain "not recorded" grep would also hit `DATE_NOT_RECORDED`, which stays); `cd web && npx vitest run test/Bell.test.tsx test/AnnouncementsList.test.tsx` → 0 failures (the not-recorded cases rewritten to 'course · date') | "The bell names who posted." |
| 19 | R-66 / R-75: key lists cut to the names 98a §4 and v5's `probe` recorded (both submitted names kept); `attempts_v4.json`, `RAW_DETAIL` and the regenerated `phase12b_load_fixture.sql` updated; header rewritten (R-75 closure: the gradebook column is the source of due dates and points). If 98a §5 shows group-attempt files, the chain reads them (plus a fixture case) | R-66, R-75, R-60, P-97 | W-50 | `cd web && npx vitest run test/crawler.attempts.test.ts test/fixtures.phase12b.test.ts` → 0 failures; `phase12b_085_stage_attempts_v4.sql` PASS (via `node scripts/db-test.mjs`); `grep -cF "STILL UNVERIFIED" ingest/bb_crawler.js` → 0 (today 1, :71) and `grep -cF "ALSO NOT" ingest/bb_crawler.js` → 0 (today 1, :74; the header's second "NOT VERIFIED" is split across :74–75, so a one-line grep for it never matches); after the next sync `select count(*) from bb_attempts where column_id = '_3610995_1' and raw->'text'->>'instructorFeedback' is not null` → ≥ 1 | "The one attempt with written feedback now keeps it." |
| 20 | File 68 by hand: `antiword` → one unit in `extract_text.py`'s output shape → `POST /rest/v1/bb_file_text` → owner `update bb_files set text_status = 'extracted'` → `embed_corpus.mjs` | R-61, S2-rag-1 | PM | `select text_status from bb_files where id = 68` → `extracted`; `select count(*) from bb_file_text where file_id = 68` → ≥ 1; post-embed (a)–(c) PASS; `--check` → `missing_parts_before=0` | "The last GEO document without text is now searchable." |
| 21 | `ingest/token_budget.py` + `ingest/test_token_budget.py` | P-81, R-61, S2-rag-1 | W-49 | `uv run --with tokenizers --with pytest python -m pytest ingest/test_token_budget.py -q` → 0 failed, ≥ 2 passed (a synthetic 512-token input passes; a 513-token input fails, [CLS] and [SEP] counted); live `uv run --with tokenizers --with "psycopg[binary]" python ingest/token_budget.py` → `over_budget=0`, exit 0. A non-zero count stops the task: the count and the five longest parts go to Stack as an open item, and there is no chunker change in this phase | "Every stored part fits the model's 512-token window." |
| 22 | Golden set + truth test + eval runner | P-90, P-91, P-89, S2-rag-1 | W-49 | `node --test ingest/eval_search.test.mjs` → 0 failures (scoring `EVAL_EMBEDDING_POC.md` §3's recorded hybrid ranks gives MRR 0.950; a drift guard proves `golden_set.json` and `phase18_golden_truth.sql` list the same qids and truth ids); `phase18_golden_truth.sql` PASS (every truth id current; its unit contains `answer_phrase`; Q7's truth, files 16/40/58/66 in `EVAL_EMBEDDING_POC.md` §2 and all superseded today, moves to 149, the current schedule after 120, whose text carries "Deloitte to Visit"; Q10's moves off file 2 to 151, whose text carries "You may use AI tools" (13 stays in the truth only if one of its units carries the row's `answer_phrase`; prod 2026-09-24: none does)); live `node ingest/eval_search.mjs --out ingest/eval/reports/<date>.json` → `scored=30`, hybrid MRR ≥ 0.900, exit 0 | "Ten real questions, re-asked by a committed script: hybrid still finds the answers." |
| 23 | `web/src/lib/blackboard-link.ts` (`blackboardLink(assignment, course)` → href + scope `item` / `course`) used by `AssignmentDetailBody.tsx` (footer and `SubmissionBlock`'s `blackboardUrl`) and `PlannerItemPopover.tsx` | R-69 | W-51 | `cd web && npx vitest run test/blackboard-link.test.ts test/AssignmentPopout.test.tsx test/PlannerItemPopover.test.tsx` → 0 failures (item URL preferred; a non-https value, or one whose origin differs from the course's `bb_url`, falls back to the course link; `javascript:` refused); `git grep -c "no stable per-item URL" -- web/src` → no output, exit 1 (today 2 files: `AssignmentDetailBody.tsx:227`, `PlannerItemPopover.tsx:302`) | "Open in Blackboard opens the assignment, not the course." |
| 24 | R-67 interim: `CourseScreen.tsx` prints no "no files" line on a course with 0 session-linked files | R-67 | W-51 | `cd web && npx vitest run test/course-timeline-files.test.tsx` → 0 failures (0 linked files → no sub-line on any session; ≥ 1 → per-session counts as today) | "No more 'no files' on every session." |
| 25 | R-74 docs: `queries.search.ts` comments state each mode's shape (fts: rank + whole-unit plain headline; vector: `part_no` of the nearest part, similarity, text; hybrid: score, `snippet_source`, `part_no` the snippet was cut from); `DATA_SYNTAX.md` :78 and :88–91 (W-48); search header (W-51); one line in `EVAL_EMBEDDING_POC.md`'s known-issue paragraph (W-49) | R-74 | W-51, W-48, W-49 | `grep -cF "to each result row" web/src/lib/queries.search.ts` → 0 (today 1, :20); `grep -cF "lowest-numbered" supabase/functions/search/index.ts` → 0 (today 1, :13); `grep -cF "(v4)" supabase/functions/search/index.ts` → 0 (today 1, :1); `grep -cF "highlighted snippet" DATA_SYNTAX.md` → 0 (today 1, :78); after Stack's merge and the PM's redeploy, the deployed `search` source (`get_edge_function`) is byte-equal to the repo file | "The docs say what each search mode returns." |
| 26 | R-73 closure from 98a §3. No meeting data → a DECISIONS row naming the syllabus and announcement mapping as the record. Data found → 129 + its test | R-73 | PM (129: W-48) | no-data branch: `grep -c "Phase 18 · R-73" project-state/DECISIONS.md` → 1 and `select count(*) from meetings where source = 'blackboard'` → 7; data branch: `phase18_129_stage_courses_meetings.sql` PASS (a differing confirmed row raises a conflict; 0 overwritten) | "Class times come from the syllabus, and we know whether Blackboard has any." |
| 27 | P-28: brief 100's seams name what the runner inherits | P-28 | PM | `grep -cF "ingest/fetch_signed.mjs" docs/planning/sprint-2/briefs/100_PHASE14_containers.md` → ≥ 1; `grep -cF "ingest/embed_corpus.mjs"` (same file) → ≥ 1; `grep -cF "waitForEvent('download'"` (same file) → 0 | "Containers reuse this phase's fetch and embed, not a copy." |
| 28 | PM walk on the Vercel preview, logged in, into `docs/planning/sprint-2/walks/walk-18/`: `01-materials-ist323-syllabus.png` (IST.323 syllabus bucket lists `323Fall26V1.4.docx`, not `323Fall26V1.3.1.docx`) · `02-palette-supplicant.png` (the IST row shows "speaker notes hidden" or the notes-only line, no notes sentence) · `03-popout-bb-link.png` (IST.323 Lab 1 popout: "Open in Blackboard ↗" with no "(course)" suffix) · `04-planner-popover-bb-link.png` (same item on `/planner`) · `05-bell-authors.png` (bell open, each row's "course · author · date" line carries a name, and no row reads "not recorded"; on B-36's fallback, no author segment at all) · `06-materials-geo-chapters.png` (GEO.103 chapters tagged "Off-platform"; reading 45 shows its phys.org link) · `07-ist352-timeline.png` (`/course/IST.352/classwork?view=timeline`: 8/26, 8/31, 9/2 each list their SA&D deck) · `08-announcements-authors.png` (`/announcements`, all courses: the same author rule as 05 on every row) | R-62, R-63, R-67, R-68, R-69, R-70 (visible parts) | PM | `ls docs/planning/sprint-2/walks/walk-18/` lists exactly the eight file names above; `curl -s -o /dev/null -w "%{http_code}" <preview URL>` → 200 (a protected preview is fetched with `vercel curl`, same expected status) | "Each of these is on the preview for you." |
| 29 | Gates and docs: DECISIONS (15 rows), STATUS, ORCHESTRATOR, PR | SOP gates (no id of its own; closes the DECISIONS rows every id above owes) | PM | `grep -c "Phase 18 · " project-state/DECISIONS.md` → 15 on defaults; `/code-review main high` → 0 open CRITICAL/HIGH; `get_advisors` `function_search_path_mutable` → 0; every command in §DoD's test-suite box (`npm run typecheck` … `node scripts/db-test.mjs`) → 0 failures; the PR is open and its preview answers 200 | "Ready when you say so." |

## Workers

Workers commit and push per task (`feat(18-<n>): …`), never touch `project-state/`, and write their evidence to their
verification note. W-48 applies migrations under the file's name after a begin…rollback dry run. The PM integrates and
resolves the shared-file rebase with Phase 17.

| worker | stream | branch · worktree | owns (disjoint) | tasks |
|---|---|---|---|---|
| W-48 | db | `feat/ingest-corpus-18-db` · `bb2dash-wt-18-db` | `db/migrations/120_*.sql` … `129_*.sql`; every `db/tests/phase18_*.sql` except `db/tests/phase18_golden_truth.sql`; `DATA_SYNTAX.md`; `docs/planning/sprint-2/verification/98c_W48_VERIFICATION.md` | 1, 6–14, 25 (DATA_SYNTAX), 26 (129 only) |
| W-49 | ingest + corpus | `feat/ingest-corpus-18-ingest` · `bb2dash-wt-18-ingest` | `ingest/fetch_signed.mjs`, `ingest/pull_files.mjs`, `ingest/embed_corpus.mjs`, `ingest/eval_search.mjs` and their `.test.mjs`; `ingest/token_budget.py`, `ingest/test_token_budget.py`; `ingest/eval/`; `db/tests/phase18_golden_truth.sql`; `ingest/CADENCE_RUNBOOK.md`; `skills/bb-sync/SKILL.md`; `skills/bb-course-pull/SKILL.md`; `EVAL_EMBEDDING_POC.md`; `docs/planning/sprint-2/verification/98d_W49_VERIFICATION.md` | 2–4, 15, 21, 22, 25 (EVAL line) |
| W-50 | crawler | `feat/ingest-corpus-18-crawler` · `bb2dash-wt-18-crawler` | `ingest/bb_crawler.js`; `web/test/crawler.announcements.test.ts`, `web/test/crawler.attempts.test.ts`, `web/test/fixtures.phase12b.test.ts`; `db/fixtures/phase12b/`; `db/tests/phase12b_load_fixture.sql`; `db/fixtures/phase18/`; `docs/planning/sprint-2/verification/98e_W50_VERIFICATION.md` | 5, 18, 19 |
| W-51 | web | `feat/ingest-corpus-18-web` · `bb2dash-wt-18-web` | `web/src/lib/blackboard-link.ts`; `web/test/blackboard-link.test.ts`; `web/test/course-timeline-files.test.tsx`; `web/test/AssignmentPopout.test.tsx`; `web/test/PlannerItemPopover.test.tsx`; the named hunks of `web/src/components/popout/AssignmentDetailBody.tsx`, `web/src/components/planner/PlannerItemPopover.tsx`, `web/src/app/(app)/course/[id]/classwork/CourseScreen.tsx`; comments in `web/src/lib/queries.search.ts`; the header comment of `supabase/functions/search/index.ts`; fallback only: `web/src/lib/queries.announcements.ts`, `web/src/components/shell/Bell.tsx`, `web/src/components/announcements/AnnouncementsList.tsx`, `web/test/Bell.test.tsx`, `web/test/AnnouncementsList.test.tsx`; `docs/planning/sprint-2/verification/98f_W51_VERIFICATION.md` | 18 (fallback), 23–25 |

PM session: tasks 16, 17, 20, 26 (DECISIONS branch), 27–29; `98a`; `walks/walk-18/`; the `search` redeploy at merge.
Order: 1 → (2, 3, 5, 6) → 4 → 7 → (9, 10) → 11 → (12–14, 23–25) → 15 → **16 (gate)** → 17–22 → 26–29. Task 8's
"before" measurement is taken before 7 is applied.

## Out of scope

* `stage_content`, `bb_content`'s unique key, `contentHandler` carry, rename ghosts, per-crawl content history, the
  transform driver and register-first, Classwork descriptions (R-64, R-65, R-71, R-76, P-25, P-94, P-95, P-98): **Phase 19**.
* `stage_gaps` and gap self-closing (R-56), Activity wording for new counts (R-58, P-72), the Stream and content-tree
  views, the staging proof (R-47): **Phase 17**.
* The container runner, its image, a scheduled sync (R-81–R-96): **Phase 14**. V-1 grading rows: **Phase 16**. The
  harness store: **Phase 20**. Any styling: **Phase 22**.
* Showing attempt feedback on a screen; any UI for corpus coverage (B-8): not scheduled this sprint.
* A pg_cron embed drain; turning `verify_jwt` off on `embed-corpus`; changing, redeploying or re-chunking `embed-corpus`;
  a model change.
* `.doc` / OCR automation in `extract_text.py`; re-OCR of file 69 (see open items).

## Open items for Stack

Items the B-numbers leave open, each with the default this brief builds:

1. **File 62** (IST.352 instructor bio): gone from Blackboard with no successor (R-63 (4)). Not in 93 §5, so this is a
   new question. Default (PROVISIONAL): it stays current with its missing note; no supersession.
2. **`.doc` / OCR automation** (R-61 (5)). Default: not automated. A future `na` file fails check (b) and is converted
   by hand, as 68 is.
3. **File 69** (noisy pypdf text, R-61 (2)). Default: not re-OCR'd this phase.
4. **Parts over 512 tokens**, if task 21 finds any. Default: report the count and the five longest; a chunker change
   would re-embed the corpus and is a later call.
5. **PM thresholds**: R-77's build line (a before-median ≥ 50 ms), the eval bar (hybrid MRR ≥ 0.900), and
   `link_confidence` 1.0 / 0.8. Say if any should differ.
6. **Per-course week rules** as drafted in the Contract (GEO `Week N`, IST.323 `Lecture #N - Week N`, IST.352 `WKnn`,
   none elsewhere): confirm with B-35.
7. **The one survey-linked assignment**: keeps the course-level link until 98a §2 shows its Ultra segment.
8. **Q10's golden truth** loses file 2 with migration 120. Default (PROVISIONAL): the truth becomes 151 (V1.4), whose
   text carries the same answer; file 13 drops out of Q10's truth unless its text carries the answer phrase.

## Session prompt (copy-paste)

> `/bb2dash-pm` Start Phase 18 (ingest and corpus). Read
> `docs/planning/sprint-2/briefs/98_PHASE18_ingest_corpus.md`. Before anything else, confirm that my answers to
> `93_SPRINT2_RESEARCH_SYNTHESIS.md` §5 (B-8, B-32 to B-38, B-40; B-42 for Phase 15's runner) are recorded, rewrite the
> brief's §Stack's calls to them, and show me any task whose check changed. Confirm Phase 15 is merged and
> `node scripts/db-test.mjs` exits 0 on `main`. Then create the worktree `bb2dash-wt-18` on `feat/ingest-corpus-18`, cut the
> four worker branches in §Workers, and spawn one Opus worker per stream with its disjoint file set and its task rows.
> Every task starts with its check failing. Stop and tell me when tasks 2–5 and 15 are on the phase branch: I will run
> the sync gate (task 16) and stay for the probe sitting. After the gate, finish tasks 17–29, walk the preview into
> `walks/walk-18/`, open the PR and stop at "ready when you say so". Do not merge, apply anything outside 120–129, or
> redeploy `search` until I say so.
