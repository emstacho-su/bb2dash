# Phase 19 — Content identity, per-crawl history and sync honesty

Date 2026-09-24 · PM: the Fable session · Product manager: Stack · Requirements: R-38, R-41 (the
run-state half), R-64, R-65, R-71, R-76 · PM-added steps: P-25, P-94, P-95, P-98 · Branch
`feat/content-history-19` · Worktree `bb2dash-wt-content-history-19` · Migration range **130–139** ·
One PR per phase (DECISIONS 2026-09-09; no exception) · Depends on: Phases 17 and 18 merged to `main`
(94 §2 rule 3) and Phase 15's SQL test runner · Status: **PROVISIONAL until Stack answers 93 §5
(B-18, B-19, B-20, B-39)** and approves `94_SPRINT2_PHASES.md`.

## Why

Sprint 1 shipped the course Stream "w/o diffs" (`60_REQUIREMENTS_v2.md:252`) and deferred the
`bb_content` key change "to the next phase that touches `stage_content`" (DECISIONS 2026-09-17).
This is that phase: the only one in sprint 2 that re-creates `stage_content` (94 §2 rule 2). R-64:
`bb_content` is keyed `(course_id, path)`, so IST.466's newest crawl carries 35 items that fold to 30
rows and files 17 and 19 never reach Classwork, and every rename leaves a ghost. On 2026-09-24 there
are 16 `(course_id, bb_item_id)` pairs (32 rows), one live and one stamped `missing_since` each, and
the 3 ghost rows hold the only IST.352 Knowledge Check assignment links. R-71 and R-38: nothing
records what a crawl added, changed or removed. `stage_content` reports every row it sees as
"updated" (192 on sync 62) and overwrites `run_id`, and `v_course_stream` posts every current file
and node (94 material posts) with no crawl reference. Stack asked for the Stream to carry "new/changed
materials". R-76 rides here because any change to how descriptions are captured is a `stage_content`
edit. Its default is to close it (B-39).

R-65 and the run-state half of R-41: `transform_tick` (044) folds a registered crawl once its newest
`bb_raw` row is three minutes old, with no completeness check. That is why the skill registers the
run only after `bb.runAll` returns (DECISIONS 2026-09-15). `run_transform` opens and closes its
`sync_runs` row in one transaction, so all 35 rows have `started_at = finished_at`, Home never sees
"running", and the reaper has nothing to reap. When a crawl dies, its request stays `claimed` and the
Sync button says "syncing…" indefinitely. Phase 14's `sync_register_run` must be written against a
driver that folds only complete crawls (94 §3 "19 → 14"), so this phase settles those semantics first.

The work goes into one phase because the same function, `stage_content`, carries the key change, the
change count, the newest-crawl guard and the history. P-98 sets one vanish convention for the history
and the ghost collapse, and 93 §4 names this "sequencing debt". The phase runs after 17, whose
`v_course_stream` and `v_content_tree` migrations are the live bodies this phase builds on, and after
18, which re-creates `stage_files` once and must not touch `stage_content`.

## Stack's calls this brief rests on

| B | Question (93 §5) | Default taken here | Tasks that change if he answers otherwise | State |
|---|---|---|---|---|
| B-18 | Stream material diffs (Q9) | One post per file or content item new or changed in a registered crawl, from an append-per-run history table, full history kept. 93 placed the build "in the ingest phase with R-71". 94 moved it here because the table is written beside `stage_content` under the 2026-09-17 row | "A view over `bb_raw`, no table": T-7 becomes a view migration and T-8 to T-10 read it. "Keep every current file on the Stream": T-9 is dropped and R-38 closes by a DECISIONS row. "Prune after N crawls": T-7 adds a prune step and a DECISIONS retention row | PROVISIONAL |
| B-19 | Stale Classwork nodes (Q10) | 93's default is "hidden, with a toggle for the three really gone; nothing deleted" (the hide and toggle ship in Phase 17, R-39). *PM reading, not part of the default:* the 16 ghost rows are **merged into their live twin** (R-64 still missing (2), P-25). The merge deletes 16 rows after carrying their links, paths and children. They are second copies of items Blackboard still lists, so no item Blackboard lists loses its row. It still departs from the default's literal "nothing deleted" and needs Stack's yes. After the merge 5 stale rows remain (3 gone, 2 re-created in WK05 under new ids), not the 3 in the question | "Keep the ghost rows": T-3 is dropped, T-4 builds a partial unique index `where detail->>'missing_since' is null` and the upsert infers it, and the Classwork toggle then shows 21 | PROVISIONAL |
| B-20 | Freshness and heartbeat (Q11) | 93's B-20 default covers only Phase 9's thresholds and the two-stage late/missing heartbeat (Phase 17, P-71). *The terminal rule is not in the batch.* It is R-65 still missing (2), which names two options, and the PM picks one here: "running" from claim, and "interrupted" once a claimed crawl has not completed after 30 minutes (the existing reaper interval). The request is then closed as failed and one Inbox item is raised. No attempts column is added, although 93 §1.4 suggests one for R-65: the rule never retries, so there is nothing to count. P-104's counter is Phase 14's | A shorter cut-off, such as the heartbeat's roughly 10 minutes, changes one constant in 136 and the fixtures of T-2 and T-14. "Fold an incomplete crawl as partial" replaces T-14's terminal branch with a `run_transform` call and a partial label | PROVISIONAL |
| B-39 | Item descriptions on Classwork (Q31) | No. Close with a DECISIONS row. `stage_content` keeps capturing them in `detail->'description'` (11 rows). If they are ever shown, they are sanitised first | Yes adds one task after T-4. W-52 re-creates `v_content_tree` with `description` appended. W-54 renders it as React text in Classwork, never HTML, with T-22 as the guard. R-76 grows from S to M | PROVISIONAL |

## Contract (frozen when Stack approves the phase plan)

### Routes and screens

No new route. Changed:

* `/course/[id]/stream` (`web/src/app/(app)/course/[id]/stream/CourseStream.tsx`). Material posts
  come only from `bb_material_history`: one post per file or node **appeared** or **changed** in a
  registered crawl. Each post is dated by that crawl and labelled "New" or "Changed". Vanished items
  are not posted. The React key gains the run id, because one file can post once per crawl it
  changed in.
* `/course/[id]/classwork`. No code change is expected. The data change adds IST.466's five same-path
  nodes (files 17 and 19 appear under them) and leaves IST.352 with one WK01. Phase 17's
  stale-node toggle lists what is really gone.
* Home sync line (`NeedsAttention.tsx:96`) and Inbox header (`Inbox.tsx:252`), both through
  `freshnessLine`. They read "sync running" from the moment a sync is claimed, and "last sync
  interrupted" instead of "last run failed" for a reaped run.
* Desktop toast (C-7 rule 1). An interrupted run toasts "Sync interrupted".
* Activity menu. Material lines name up to three items.

### RPC signatures

No function here is callable by `anon` or `authenticated`. Every function pins
`set search_path = public, pg_temp`, except the pure helper, which pins `''`. Grants are re-asserted
at the foot of each migration, as prod holds them.

**Test role.** Phase 15's `db_test_runner` (brief 95, migration 100) holds execute on exactly the
functions the suite calls, and write grants on exactly the tables it writes. It already holds
`run_transform(uuid, text)` and `transform_tick()`. Each Phase 19 migration grants it only what that
migration's own test file needs: execute on `stage_content(uuid)` and
`bb_content_path_history(jsonb, jsonb, text, text)` (131), `material_history_record(uuid)` (132) and
`sync_change_lines(jsonb)` (134), plus `insert, update, delete` on any table its fixtures write that
100 does not already cover. Each grant is named in the migration. 100's guard block must still pass:
no `service_role` membership, and nothing on `vault`, `storage`, `auth`, `cron` or `net`. The
trigger function needs no grant, because firing a trigger checks no `EXECUTE` privilege.

| Function | Migration | Full signature | Security | Grants |
|---|---|---|---|---|
| `stage_content` (re-created, signature frozen by DECISIONS 2026-09-10) | 131 | `public.stage_content(p_run_id uuid) returns jsonb` | definer; owner guard kept (`auth.uid()` null or `app_owner()`) | revoke all from `public, anon, authenticated`; execute to `service_role` (prod ACL on 2026-09-24 is `postgres, service_role` only; 029 revoked `authenticated`) |
| `bb_content_path_history` (new) | 131 | `public.bb_content_path_history(p_old jsonb, p_new jsonb, p_old_path text, p_new_path text) returns jsonb`, `language sql immutable`, `set search_path = ''` | invoker | revoke all from `public, anon, authenticated`; execute to `service_role` |
| `material_history_record` (new) | 132 | `public.material_history_record(p_run_id uuid) returns jsonb` | definer; same owner guard | revoke all from `public, anon, authenticated`; execute to `service_role` |
| `sync_change_lines` (re-created from the live body Phase 17's R-58 left) | 134 | `public.sync_change_lines(p_stages jsonb) returns jsonb`, `immutable` | invoker | revoke all from `public, anon`; execute to `authenticated, service_role` (as 051) |
| `sync_request_open_run` (new trigger function) | 135 | `public.sync_request_open_run() returns trigger` | definer | revoke all from `public, anon, authenticated` |
| `run_transform` (re-created from live) | 135 | `public.run_transform(p_run_id uuid, p_trigger text default 'manual') returns bigint` | definer | revoke all from `public, anon, authenticated`; execute to `service_role` (as 051) |
| `transform_tick` (re-created from 044) | 136 | `public.transform_tick() returns jsonb` | definer | revoke all from `public, anon, authenticated`; execute to `service_role` (as 044) |

Behaviour frozen here:

* **`stage_content`**
  * Upserts on `(course_id, bb_item_id)`.
  * `parent_id` comes from the payload's `parentId`. A `parentId` with no row in that course (the
    course root) gives null.
  * The missing pass is keyed on `bb_item_id` and scoped to the courses the run carried.
    `detail->>'missing_since'` is cleared when an item returns, as today.
  * Only the **newest registered crawl** writes, using the predicate of 043 and 056. An older run
    writes nothing and returns `older_run: true` (DECISIONS 2026-09-11 and 2026-09-15).
  * A row is updated only when a stored field differs. `updated` counts those rows; the new
    `unchanged` counts the rest.
  * A path change appends the old path to `detail->'previous_paths'` (via
    `bb_content_path_history`). `detail->'previous_ids'` is carried as it is. `bb_content_detail_merge`
    stays in place, unused.
  * `bb_type` stays the payload's `type`, which is the crawler's `typeOf()` (`ingest/bb_crawler.js:457`
    at `main` a5042fa): `contentHandler.id` or the `contentDetail` key. **P-95 is already met by this
    column**, so no new column is added. On 2026-09-24, 175 of 218 rows carry it. The other 43 are
    Ultra documents whose payload `type` is null (026 maps a null type to `document`), so there is
    nothing to carry for them. Phase 18's `assignment_bb_url` (126) reads `bb_type`, so the re-created
    function keeps writing it.
  * Return keys `inserted, updated, missing, title_fallbacks, duplicate_paths, unresolved_courses,
    unresolved_items, items, courses, run_id` are kept. `duplicate_paths` now counts shared paths
    that are **kept**. New keys: `unchanged, missing_cleared, older_run`.
* **`material_history_record(p_run_id)`**
  * Diffs this run's `bb_raw` course rows against the **predecessor**: the newest registered crawl
    that has a real (non-`unregistered`) `sync_runs` row and an older `bb_raw` row for the same course.
  * Content is keyed on `(course_id, item id)`. Files are keyed on `(course_id, item id, file name)`
    from `embeddedFiles`.
  * A content item has **changed** when `title`, `path`, `url` or `modified` differs. A file has
    changed when its url differs. `changed_fields` names which.
  * **Vanished** is recorded only for courses the run carried.
  * A course with no predecessor is a **baseline** and writes no rows.
  * Nothing is written when a history row already exists for a newer registered crawl
    (`older_run: true`).
  * Idempotent: `on conflict do nothing`.
  * Returns `{appeared, changed, vanished, baseline_courses, older_run, sample}`, where `sample` holds
    up to three `{change, entity, title}` per change kind.
* **`sync_change_lines`**
  * The content-tree line ("N new item(s) in the course content tree") and the content-missing line
    are replaced by three lines from `p_stages->'history'`: "N new material(s): A, B, C (+k more)",
    "N material(s) changed: …" and "N material(s) no longer in Blackboard: …".
  * Every other line is carried byte for byte from the live body, including Phase 17's steady-state
    convention (P-72).
* **Trigger `agent_requests_open_sync_run`**
  * Definition: `after insert or update of state, run_id on public.agent_requests for each row when
    (new.kind = 'sync' and new.state = 'claimed' and new.run_id is not null)`, executing
    `sync_request_open_run()`.
  * If the run id already has a quarantine row (`sync_runs.scope = 'unregistered'`), it raises
    `42501` and the registration is refused.
  * Otherwise, if no real `sync_runs` row exists, it inserts one:
    `(run_id, status 'running', started_at clock_timestamp(), trigger 'manual', source 'blackboard', scope 'all')`.
* **`run_transform`**
  * Locks the run's real `sync_runs` row with `for update`. A finished row is returned unchanged
    (idempotence as 051). A `running` row opened at claim is **adopted**, and its `trigger` is set
    from `p_trigger`. With no row, it inserts one as 051 does.
  * Calls `material_history_record(p_run_id)` after `stage_files` and records it as stage `history`
    in `sync_stage_runs`. A failure there makes the run `partial`. On Phase 15's P-8 fixture, where
    one stage is forced to raise, the history stage must not fail too:
    `phase9_transform_states.sql` asserts exactly one `failed` stage row.
  * `finished_at = clock_timestamp()`.
  * The order of the other eight stages is unchanged.
* **`transform_tick`**
  1. A registered run (request `claimed` or `done`) folds **only when `bb_raw` holds its `calendar`
     row**. There is no idle branch for registered runs. 044's "never folded" test (`not exists` over
     `sync_runs` where `scope is distinct from 'unregistered'`, 044:236-237) gains
     `and s.status <> 'running'`. Without it, the row opened at claim would stop every registered
     run from folding. The drain's `v_was_folded` uses the same test.
  2. Quarantine is unchanged: the three-minute idle rule stays, for unregistered runs only.
  3. **Terminal rule**, replacing the reaper:
     * A `running` row whose `started_at` is older than 30 minutes becomes `status = 'failed'` with
       `interrupted_at = now()` and `finished_at = coalesce(finished_at, now())`, as 044 does.
       `notes` still **ends with** `interrupted (reaped)`, appended as 044 does, and the tick still
       returns `reaped`. Phase 15's `phase9_transform_states.sql` asserts both, so it stays green.
     * Its `claimed` sync request becomes `failed` with `result = {error: 'interrupted', sync_run_id}`.
     * A `claimed` sync request with no `run_id` and `claimed_at` older than 30 minutes becomes
       `failed` with `result = {error: 'interrupted before a run was registered'}`.
     * Each closed request raises exactly one item: `raise_attention(<reaped sync_runs id or null>,
       'stack_must_confirm', null, 'agent_request', 'agent_request:<id>', null, null, null,
       <question>, null)`.
     * Nothing is retried.
  4. The drain folds the newest **complete** registered run, meaning its calendar row is present.
  5. `ical_collect()` is kept.

  Return keys are kept, plus `interrupted_requests`.

### Tables and migrations

The schema changes are additive, with **two named exceptions**, each under its own DECISIONS row:
131 drops `bb_content_course_id_path_key`, and 130 deletes the 16 duplicate rows after carrying their
data. DECISIONS 2026-09-16 calls 068's key swap "A one-off exception to "migrations are additive"
… not a precedent", so this change carries its own row. Every file is dry-run in `begin; … rollback;`, then applied with
`mcp__Supabase__apply_migration` under the file's name, byte-identical to the repo. 130 and 131 are
applied back to back while no `sync` request is `queued` or `claimed`, and so are 135 and 136.
Immediately before 130 and before 135, `select count(*) from agent_requests where kind = 'sync' and
state in ('queued','claimed')` must return 0 (tasks 3 and 12). A file that re-creates a live
object opens with a `HOW THIS WAS BUILT` header citing the `pg_get_functiondef` / `pg_get_viewdef`
read it started from (051's rule).

| # | File | Creates / changes |
|---|---|---|
| 130 | `db/migrations/130_bb_content_ghost_collapse.sql` | **Data.** For each `(course_id, bb_item_id)` pair of one live and one `missing_since` row: `assignment_id` is carried to the live row where it is null (idempotent after Phase 17's P-11); the ghost's path is appended to the live row's `detail->'previous_paths'`; any child of the ghost is re-pointed; the ghost is deleted. A closing block raises if a pair remains (16 pairs on 2026-09-24) |
| 131 | `db/migrations/131_bb_content_item_key.sql` | `bb_item_id` set not null (0 nulls); unique `bb_content_course_item_key (course_id, bb_item_id)`; drop `bb_content_course_id_path_key`; index `bb_content_course_path_idx (course_id, path)`; `bb_content_path_history`; `stage_content` re-created; `comment on view v_content_tree` stops saying path is unique (027's file stays frozen); re-folds the newest registered crawl chosen by the 056 predicate, never a literal id. One transaction |
| 132 | `db/migrations/132_material_history.sql` | Table `bb_material_history` (below); RLS on; policy `bb_material_history_owner_read` for select to `authenticated` using `((select auth.uid()) = (select app_owner()))`; no write policy; anon revoked; `material_history_record`; backfill over registered folded crawls, oldest first |
| 133 | `db/migrations/133_course_stream_history.sql` | `create or replace view v_course_stream` from Phase 17's live body. The two material arms are replaced by history arms: files join `v_bb_files_current` on `bb_file_id`; nodes use 027's item kinds and not-claimed rule; Phase 17's `my_submissions` and missing filters are kept; `meta` gains `change` and `run_id`. The same 8 columns in the same order; the announcement and assignment arms and every `meta` key Phase 17 added are unchanged; `security_invoker`; anon revoked; authenticated select re-asserted |
| 134 | `db/migrations/134_sync_change_lines_materials.sql` | `sync_change_lines` from the live body, with the three material lines |
| 135 | `db/migrations/135_sync_run_open_at_claim.sql` | `sync_runs.interrupted_at timestamptz null`; `sync_request_open_run` + trigger; `run_transform` re-created |
| 136 | `db/migrations/136_transform_tick_register_first.sql` | `transform_tick` re-created; the cron job and its schedule are untouched |
| 137 | `db/migrations/137_sync_status_run_state.sql` | `v_sync_status` from the live body, appending `notes text` and `interrupted boolean` (`interrupted_at is not null`) after its last column; `security_invoker`; anon revoked; grants re-asserted |
| 138–139 | — | Unused slack. A phase that runs out takes the next free block of ten (94 §2 rule 6) |

`bb_material_history` (append-per-run, shaped like `bb_gradebook`, DECISIONS 2026-09-15):

| Column | Type | Rule |
|---|---|---|
| `id` | `bigint generated always as identity primary key` | — |
| `run_id` | `uuid not null` | the registered crawl the change was seen in |
| `course_id` | `text not null references courses(id) on delete cascade` | via `bb_resolve_course` |
| `entity` | `text not null check (entity in ('content','file'))` | — |
| `bb_item_id` | `text not null` | the node's Blackboard id; for a file, the node carrying it |
| `file_name` | `text not null default ''` | files only; `''` for content |
| `bb_file_id` | `bigint null references bb_files(id) on delete set null` | matched on `(bb_course_id, source_url)` after `stage_files` |
| `change` | `text not null check (change in ('appeared','changed','vanished'))` | vanished carries the run that first missed the item (P-98) |
| `changed_fields` | `text[] null` | changed only |
| `title` | `text not null` | as this crawl carried it (the predecessor's, for vanished) |
| `path` | `text null` | breadcrumb as carried |
| `seen_at` | `timestamptz not null` | `captured_at` of that course's `bb_raw` row in `run_id`; the Stream's `posted_at` |
| `recorded_at` | `timestamptz not null default now()` | — |

Unique `bb_material_history_key (run_id, entity, course_id, bb_item_id, file_name)`; index
`bb_material_history_course_run_idx (course_id, run_id)`. **Retention:** `bb_raw` and this table are
kept in full through the term (B-18), with no prune.

**One vanish convention (P-98).** A vanish is always the run id that first missed the item: in
`bb_content.detail->>'missing_since'`, in `bb_files.notes` as `missing_since_run=<uuid>`, and in
`bb_material_history.run_id` on a `vanished` row. No stored `missing_since*` column is added anywhere
(0 on tables today); Phase 17's 111 surfaces `detail->>'missing_since'` only as the view column
`v_content_tree.missing_since`.

### Files

New:

* `db/migrations/130_bb_content_ghost_collapse.sql` … `137_sync_status_run_state.sql` (the eight above).
* `db/tests/phase19_130_ghost_collapse.sql`, `db/tests/phase19_131_stage_content_item_key.sql`,
  `db/tests/phase19_132_material_history.sql`, `db/tests/phase19_133_course_stream_history.sql`,
  `db/tests/phase19_134_sync_change_lines.sql`, `db/tests/phase19_135_136_sync_driver.sql`,
  `db/tests/phase19_137_sync_status.sql`. Each follows Phase 15's frozen unit rules: `begin;` first,
  `rollback;` last, no top-level `commit`, and one result row whose first column ends in `: PASS`.
* `web/src/lib/sync-run-state.ts`: pure `runStateWord(status)` → `'sync running' | 'last run
  partial' | 'last run failed' | 'last sync interrupted' | null`. `queries.sync.ts` is 1,313 lines,
  so new logic goes in its own file (91 R-41 seams).
* `web/test/sync-run-state.test.ts`, `web/test/course-stream.history.test.tsx`,
  `web/test/course-classwork.samepath.test.ts`, `web/test/raw-html.audit.test.ts`.
* `docs/planning/sprint-2/verification/99_W52_VERIFICATION.md`, `99_W53_VERIFICATION.md`,
  `99_W54_VERIFICATION.md`, one per worker, recording RED then GREEN lines and SQL results.
* `docs/planning/sprint-2/walks/walk-19/01-ist466-classwork.png` … `06-inbox-interrupted.png` (PM).

Changed, by owner (the sets are disjoint):

* **W-52:** the five files `130`–`134` and their five tests; `DATA_SYNTAX.md` (the `bb_content` row
  names the key; one new `bb_material_history` row).
* **W-53:** the three files `135`–`137` and their two tests.
  * `skills/bb-sync/SKILL.md`: steps 2, 3, 3a and 4 only. Step 2 claims and sets `run_id` in one
    update; step 3 is `bb.runAll({ termName: 'Fall 2026', runId })`; step 3a is removed; step 4 waits
    on the running row. Step 4b and the embed step stay Phase 18's.
  * `ingest/CADENCE_RUNBOOK.md`: step 5 only.
  * `ingest/bb_crawler.js`: comment lines only (the `runAll({ runId })` header block, lines 83–95 at
    `main` a5042fa, and the comment above `runAll`). The v5 code is Phase 18's.
* **W-54:**
  * `web/src/lib/sync-run-state.ts`.
  * `web/src/lib/queries.sync.ts`: 10 added lines at most. `SyncStatus` gains `notes` and
    `interrupted`, `normalizeSyncStatus` reads them, and `freshnessLine` calls `runStateWord`.
  * `web/src/lib/course-dimension.ts`: `CourseStreamMeta` gains `change` and `run_id`.
  * `web/src/app/(app)/course/[id]/stream/CourseStream.tsx` and `.module.css`: the label, the date
    and the key, using existing tokens only.
  * The four new web tests, plus additions only to `web/test/queries.sync.test.ts`.
  * `desktop/src/core/types.ts` (`SyncStatusRow.interrupted`), `desktop/src/core/poller/sources.ts`
    (`syncQuery` selects `interrupted`) and `desktop/src/core/poller/reducer.ts` (the "Sync
    interrupted" title).
  * `desktop/test/unit/reducer.test.ts`, `desktop/test/unit/sources.test.ts`.
* **PM:** `web/src/lib/supabase/database.types.ts` (regenerated at integration; hand-narrowed
  interfaces kept), `project-state/STATUS.md`, `DECISIONS.md`, `ORCHESTRATOR.md`, the walk.

### Seams

* **Phase 15.**
  * Every `phase19_*.sql` runs through Phase 15's runner (`scripts/db-test.mjs` per 94 §3; brief 95
    freezes the name), which exits non-zero on any FAIL (P-99). It runs as the `db_test_runner` role.
  * Phase 15's `db/tests/phase9_transform_states.sql` (P-8) must stay PASS after 135 and 136. The
    reaper keeps `status = 'failed'` and the `interrupted (reaped)` note.
* **Phase 17.**
  * 133 re-creates Phase 17's `v_course_stream` migration (P-9). 131 only re-comments `v_content_tree`
    after 17's P-10 migration; its column list is 17's.
  * P-11's three link moves come first; 130 re-checks them.
  * R-39's hide and toggle are what Classwork shows after the collapse.
  * The heartbeat view (P-12, P-71), the thresholds and `freshnessLine`'s staleness half are 17's and
    untouched here. This phase adds only the run-state word.
  * 134 starts from the live `sync_change_lines` body that R-58 left.
* **Phase 18.**
  * `stage_files` is re-created once in 18 and **never touched here**. The history maps files by
    `(bb_course_id, source_url)`, which 18 keeps unique.
  * `bb_crawler.js` v5 and `skills/bb-sync` step 4b (pull and embed) are 18's.
  * The DECISIONS 2026-09-17 deferral binds Phase 18 not to touch `stage_content`.
  * 136 keeps `ical_collect()` in `transform_tick`. Phase 18's 127 unschedules the daily poll, which
    makes the call a no-op. Brief 98 says 19 *may* drop the call. It does not, so the tick changes
    only where R-65 needs it.
  * Phase 18's 126 reads `bb_content.bb_type` for R-69's URL. The key change keeps the column and
    its values (task 6).
* **Phase 14** (94 §3 "19 → 14"). `sync_register_run` adopts these semantics:
  * Registration is setting `agent_requests.run_id` while the request is `claimed`, and the trigger
    opens the running row.
  * A quarantined run is refused.
  * A registered run folds only on its calendar row.
  * The terminal rule is 30 minutes. Its Inbox item's ref is `agent_request:<id>`, so the runner's
    dead-letter item (R-83) collapses onto it through `attention_items_open_dedupe_idx`. That works
    only if the runner raises with the same kind (`stack_must_confirm`), a null course and a null
    field, because the index keys on `(kind, course_id, ref, field)` while `state = 'open'` (041).
  * The attempts counter (P-104) is 14's.
* **Sprint 1 objects.**
  * `stage_content` (026), `v_course_stream` / `v_content_tree` (027, byte-frozen), `v_sync_status`
    (035), `transform_tick` (044), `run_transform` / `sync_change_lines` (051), `raise_attention` and
    the open-dedupe index (041).
  * `v_data_freshness` (040) is untouched; a `history` stage row appears in it.
  * The views that gate on a `sync_runs` row (`v_gradebook_history`, `v_gradebook_latest`,
    `v_attempts_latest`, `v_calendar_push_items`) read per-run tables written only during a fold, so
    a claim-opened `running` row changes none of them.
  * The desktop reducer never toasts `running` (C-7 rule 1).

### Must respect

* 2026-09-10 — "Post-Phase 7 scope is `docs/planning/sprint-1-hub/60_REQUIREMENTS_v2.md`; course page is **Google Classroom-style** (Stream landing, Classwork by Blackboard folder, Grades, Info), timeline kept as a sub-view"
* 2026-09-10 — "Phase 8 owns `stage_content(uuid)`; Phase 9 owns the driver and every other stage and calls it, skipping with a recorded stage row if absent"
* 2026-09-10 — "IST.466's duplicate content paths left as first-wins (5 rows counted, none invented)". This phase supersedes it with its own row.
* 2026-09-17 — "**Deferred: `bb_content` key change** for IST.466's duplicate folder paths (P-data-1) to the next phase that touches `stage_content`"
* 2026-09-10 — "The transform folds **only crawls registered on an owner-claimed `agent_requests` row** (`agent_requests.run_id`, migration 039); unregistered `bb_raw` runs are quarantined once, never folded; `bb_raw` unique on `(run_id, kind, bb_course_id)`"
* 2026-09-15 — "bb-sync keeps **registering `run_id` after `bb.runAll` returns**, even though the crawler now accepts a `runId`; register-first waits until `transform_tick` requires the `calendar` row for registered runs". 136 meets its condition, and a new row records the change.
* 2026-09-15 — "One open `sync` request at a time: while a `queued`/`claimed` sync exists, the Sync button re-copies its command instead of inserting another row". Its Why says "the tick never touches `kind = 'sync'` (those need a browser)". The terminal rule departs from that, under its own row (R-109).
* 2026-09-10 — "Transform runs as SQL functions on **pg_cron inside Postgres** (`transform_tick` every 2 min), not as an edge function or a local hub"
* 2026-09-15 — "The calendar push has **its own pg_cron job** (`bb2dash-calendar-push`, `1-59/2`) and its own `calendar_push_runs` table; a statement trigger on `assignments` marks `app_settings.gcal_dirty`; Phase 9's `run_transform` / `transform_tick` are not redefined". The push stays separate; this phase re-creates both functions from their live definitions.
* 2026-09-11 — "Only the newest crawl may declare a file missing (`stage_files` replay guard, 037)"
* 2026-09-14 — "iCal responses are collected by `ical_collect()` on every 2-minute tick, not by the daily poll (044)". 136 keeps the call.
* 2026-09-15 — "`my_submissions` rows are **exempt from `stage_files`' missing marker (053) and from `stage_gaps`' "bytes never stored" gap when they carry an `attempt_id` (054)**". The history reads `embeddedFiles` from the content payload only, so a pulled-back submission is never recorded as appeared or vanished, and 133 keeps Phase 17's `my_submissions` filter.
* 2026-09-15 — "Score-change counts (`scores_new`, `scores_changed`) are computed **only when the folded run is the newest registered crawl** (056, reusing 043's predicate); older runs report 0 with `older_run: true`"
* 2026-09-15 — "Gradebook mirror `bb_gradebook` is **append-per-run**, keyed `(run_id, course_id, column_id)` … every `v_*` view reads only runs with a real `sync_runs` row"
* 2026-09-15 — "An event is **deleted only when the item no longer exists in Blackboard**". Its Why quotes Stack: "crawls are the source of truth being appended to the db".
* 2026-09-11 — "SECURITY DEFINER transform functions are not callable by `authenticated` (038); the app's only path to a transform is an `agent_requests` row"
* 2026-09-10 — "**All 15 public views are `security_invoker`** with anon revoked (migration 036, guard block refuses a future non-invoker view)"
* 2026-09-10 — "Hand-narrowed row interfaces kept for `v_course_stream` / `v_content_tree` / `v_course_display` after regenerating `database.types.ts`"
* 2026-09-13 — "`v_data_freshness` ignores `status = 'skipped'` rows and unregistered runs (migration 040; PM extended Phase 9's range by one number for it)"
* 2026-09-10 — "Sync cadence: **Stack triggers**, the app does the rest; no scheduled crawl, no reminders". The Inbox item is a report on a sync Stack started, not a reminder (D-10).
* 2026-09-16 — "`calendar_events` is keyed `(source, ref_id)`: 068 **renamed** `assignment_id` and swapped the primary key instead of adding columns, under a controlled cut-over". The same discipline applies to 130 and 131, back to back with no sync in flight.
* 2026-09-10 — "Parallel phases get **non-overlapping migration ranges** (Phase 8 = 026–029, Phase 9 = 030–039) allocated in the briefs"
* 2026-09-14 — "**Every task carries an executable check** (test, SQL assertion, curl, screenshot diff) the worker runs itself, plus one demo line for the acceptance script; a task without a check is not a task"
* 2026-09-23 — "**Sprint 2 planning proceeds stage to stage without a stop**; the PM stops only where Stack's input is required (his §3 fields, the question batch, the phase-plan approval) and otherwise proceeds on stated defaults, each recorded here when adopted"

## MVP (in Stack's words)

*PM wording, built from his answers; his own words are quoted.* Every clause that rests on B-18
(one post per change, dated by crawl), B-19 (the merge), B-20 (the 30-minute cut-off) or B-39
(descriptions not shown) is **PROVISIONAL** until he answers 93 §5. The course page stays "Google
Classroom style", and its Stream is what he asked for in sprint 1: "Announcements, new/changed
materials, assignments opening and due" (his answers, `60_REQUIREMENTS_v2.md` §6.1). A material
appears once, when a sync finds it new or changed, dated by that crawl, and not again unless it
changes again. Classwork is "By Blackboard folder" (same table), with each Blackboard item exactly
once: IST.466's five same-named items and its two missing files appear, IST.352's renamed week
folder appears once, and nothing Blackboard still lists is hidden. A sync always shows its true state.
From the moment it is claimed, Home says it is running. Only a complete crawl is folded. A crawl that
never finishes is called interrupted within about half an hour, never "failed" and never
"syncing…" indefinitely, and it leaves one Inbox item and a working Sync button. Item descriptions
stay captured but not shown (B-39). As his calendar answer put it, "crawls are the source of truth
being appended to the db" (DECISIONS 2026-09-15).

## Definition of done

SOP gates:

- [ ] `cd web && npm run typecheck && npm run build && npx vitest run` exits 0, with a test count
      not below `main`'s. `cd desktop && npm run typecheck && npx vitest run` exits 0.
      `mcp-server/` is untouched: `git diff --stat main -- mcp-server` prints nothing.
- [ ] `node scripts/db-test.mjs` exits 0. Every `db/tests/*.sql` passes, including Phase 15's
      `phase9_transform_states.sql` and `phase10a_stage_gradebook.sql`.
- [ ] Each task is committed and pushed to its worker branch when it completes (`feat(19-T<n>): …`,
      conventional commits). Nothing is committed to `main`. The merge happens only when Stack asks
      for it in that conversation.
- [ ] `/code-review main high`: CRITICAL and HIGH cleared, and the findings table is in the PR.
- [ ] `/security-review`: required (four definer functions new or re-created, a trigger on
      `agent_requests`, a new RLS table, grant changes). CRITICAL and HIGH are cleared.
- [ ] The Supabase security advisor reports 0 findings naming a Phase 19 object.
- [ ] All eight migrations are applied under their file names, byte-identical (task 25).
- [ ] `project-state/STATUS.md`, `DECISIONS.md` (nine rows, task 28) and `ORCHESTRATOR.md` are
      updated in the PR.
- [ ] The PR is open against `main` with its Vercel preview link. Stack's OK comes before merge,
      because this phase changes the Stream, Classwork and Home visually.
- [ ] `walk-19/01`–`06` exist as task 27 names them.

Stack's acceptance script, walked on the preview:

1. Open IST.466 → Classwork. The two "Information" lessons are both listed, with their own
   children, and "Ethics Criteria.pptx" and "LectureM3_IST466Fall 2026 (2).pptx" appear under their
   items.
2. Open IST.352 → Classwork. There is one WK01 folder. Phase 17's removed-items toggle lists only
   what Blackboard really removed.
3. Open any course Stream. Every material post says New or Changed and carries a crawl date. Files
   unchanged since the first crawl are not re-posted, and none of his own submissions shows as a
   material.
4. Press Sync and run it as usual. While it crawls, Home's sync line reads "sync running". When it
   lands, the line reads "last synced just now", and the Activity menu names what was new or changed.
5. Once, on purpose: press Sync and close the Blackboard tab when the first course line prints.
   Within 32 minutes (30, plus one tick), Home reads "last sync interrupted", the Inbox holds one
   item about it, the Sync button reads Sync again, and the desktop toast says "Sync interrupted".
6. Read the nine new DECISIONS rows in the PR and approve or amend them.

What proves each requirement:

* **R-38:** task 9's SQL (every material post traces to a history row) and screenshot 03.
* **R-41 (run states):** tasks 2, 12, 14, 15, 18, 19 and 23; screenshots 04–06. The thresholds and
  heartbeat half is Phase 17's (P-12, P-71), merged before this phase. STATUS marks R-41 met only
  when both halves are on `main`.
* **R-64:** tasks 3 and 4 (no duplicate pair, the path key gone, files 17 and 19 in the tree);
  screenshots 01 and 02.
* **R-65:** tasks 12–14 (open at claim, fold only when complete, terminal rule), 16 (register-first
  skill) and 26 (live proof).
* **R-71:** tasks 5, 7, 8 and 10 (real change count, the history table matching the `bb_raw` diff, one
  vanish convention, named Activity lines).
* **R-76:** closed by the DECISIONS row in task 28 (B-39); task 22 guards the "if ever shown" half.
* **P-25:** task 3. **P-94:** task 22. **P-95:** task 6. **P-98:** task 8.

## Task list

Checks run against prod after the task's migration is applied. `node scripts/db-test.mjs` is
Phase 15's runner, and brief 95 freezes its output: one line per unit, `PASS  <file>` or
`FAIL  <file>  <error>`, then `db-test: passed <p>, failed <f>, units <n>`, with exit 0 only when
`f = 0`. `--only <file>` runs one unit. Check forms: (a) a named test and its exact command; (b) SQL
with its expected value; (c) a screenshot path and what must be visible; (d) a count and the command
that produces it.

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 1 | Write `phase19_130_ghost_collapse.sql` and `phase19_131_stage_content_item_key.sql` first. Use a synthetic IST.466-shaped payload (two sibling lessons named Information with same-path children), a renamed node, a re-fold of the same run and an older crawl | R-64, R-71 | W-52 | (a) Before 130/131 are applied, `node scripts/db-test.mjs --only phase19_130_ghost_collapse.sql` and `--only phase19_131_stage_content_item_key.sql` each print `FAIL  <file>  …` and `db-test: passed 0, failed 1, units 1`, exit 1 (lines copied into `99_W52_VERIFICATION.md`). After tasks 3–4, each prints `db-test: passed 1, failed 0, units 1`, exit 0 | — |
| 2 | Write `phase19_135_136_sync_driver.sql` and `phase19_137_sync_status.sql` first. Fixtures: a claim with `run_id`; a claim naming a quarantined run; a registered run with course rows and no calendar row, aged 5 min; the same with its calendar row; a `running` row aged 31 min; a claimed request with no `run_id`, aged 31 min | R-65, R-41 | W-53 | (a) Before 135–137 are applied, `node scripts/db-test.mjs --only phase19_135_136_sync_driver.sql` and `--only phase19_137_sync_status.sql` each print `db-test: passed 0, failed 1, units 1`, exit 1 (lines in `99_W53_VERIFICATION.md`). After tasks 12–15, each prints `db-test: passed 1, failed 0, units 1`, exit 0 | — |
| 3 | 130 ghost collapse: carry links and paths, then delete the 16 ghost rows | R-64, P-25 | W-52 | (b) Recorded in `99_W52_VERIFICATION.md` immediately before 130: `select count(*) from agent_requests where kind = 'sync' and state in ('queued','claimed')` → 0; S₀ = `select count(*) from bb_content where detail->>'missing_since' is not null` (21 on 2026-09-24); D₀ = `select count(*) from (select course_id, bb_item_id from bb_content group by 1, 2 having count(*) > 1) d` (16); N₀ = `select count(*) from bb_content` (218). After 130: the D₀ query → 0; `select count(*) from bb_content where assignment_id is not null and detail->>'missing_since' is not null` → 0; the S₀ query → S₀ − D₀ (5 on 2026-09-24); the N₀ query → N₀ − D₀ (202) | "IST.352 Classwork has one WK01 folder" |
| 4 | 131 key swap, `stage_content` re-created, newest crawl re-folded | R-64 | W-52 | (b) `select count(*) from pg_constraint where conrelid = 'public.bb_content'::regclass and conname = 'bb_content_course_id_path_key'` → 0; the same query for `bb_content_course_item_key` → 1; `select count(*) from v_content_tree where file_id in (17, 19)` → 2 (both are current in `v_bb_files_current` on 2026-09-24 and have no node today); (a) `node scripts/db-test.mjs --only phase19_131_stage_content_item_key.sql` → `db-test: passed 1, failed 0, units 1` | "IST.466 Classwork shows both Information lessons and the two missing files" |
| 5 | `stage_content` counts real changes and writes only as the newest crawl (in 131) | R-71 | W-52 | (a) `phase19_131` PASS. Its blocks assert that a second fold of the same run returns `updated` = 0 and `unchanged` = item count, and that the older fixture run returns `older_run = true` and changes 0 rows | "a sync with nothing new says Nothing changed for content" |
| 6 | Keep `bb_type` = `contentHandler` through the re-fold (P-95 met, recorded) | P-95 | W-52 | (b) With `<run>` = the run 131 re-folds (its id recorded in `99_W52_VERIFICATION.md`): `select count(*) from bb_content b join (select bb_resolve_course(r.bb_course_id) as course_id, e->>'id' as bb_item_id, e->>'type' as type from bb_raw r cross join lateral jsonb_array_elements(r.payload->'content') e where r.run_id = '<run>' and r.kind = 'course') x on x.course_id = b.course_id and x.bb_item_id = b.bb_item_id where b.bb_type is distinct from x.type` → 0; `select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'bb_content' and column_name ilike '%handler%'` → 0 (no second column) | — |
| 7 | 132: `bb_material_history`, `material_history_record`, backfill | R-71, R-38 | W-52 | (a) `phase19_132` PASS (appeared, changed and vanished; baseline writes 0; older run writes 0; a re-run writes 0; `has_table_privilege('anon', 'public.bb_material_history', 'select')` is false; `set local role authenticated` with a non-owner `request.jwt.claims` sub reads 0 rows; its prod block runs the `bb_raw` diff of the newest registered folded crawl against its predecessor, and `except` in both directions against the history rows returns 0 rows); (b) `select has_function_privilege('authenticated', 'public.material_history_record(uuid)', 'execute')` → false | — |
| 8 | One vanish convention; retention recorded | P-98, R-71 | W-52 | (b) `select count(*) from bb_content b where b.detail->>'missing_since' is not null and exists (select 1 from bb_material_history h where h.run_id = (b.detail->>'missing_since')::uuid) and not exists (select 1 from bb_material_history h where h.entity = 'content' and h.change = 'vanished' and h.course_id = b.course_id and h.bb_item_id = b.bb_item_id and h.run_id = (b.detail->>'missing_since')::uuid)` → 0; `select count(*) from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.column_name like 'missing_since%'` → 0 | — |
| 9 | 133: the Stream's material posts come from history | R-38 | W-52 | (b) `select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = 'public.v_course_stream'::regclass and attnum > 0 and not attisdropped` → `course_id,post_kind,posted_at,ref_kind,ref_id,title,body,meta`; `select count(*) from v_course_stream s where s.post_kind = 'material' and not exists (select 1 from bb_material_history h where h.run_id::text = s.meta->>'run_id')` → 0; (a) `phase19_133` PASS (`security_invoker`, no anon select, `my_submissions` and missing items excluded) | "material posts say New or Changed, dated by crawl" |
| 10 | 134: Activity names up to three materials | R-71 | W-52 | (a) `phase19_134` PASS (fixture stages give the exact lines "2 new material(s): A, B" and "1 material(s) no longer in Blackboard: C"); `db/tests/phase10a_stage_gradebook.sql` PASS | "Activity says which files were new" |
| 11 | `DATA_SYNTAX.md` names the new key and the history table | R-64, R-71 | W-52 | (d) `grep -c 'bb_material_history' DATA_SYNTAX.md` → ≥ 1; `grep -c 'course_id, bb_item_id' DATA_SYNTAX.md` → ≥ 1 (both 0 at `main` a5042fa) | — |
| 12 | 135: running row opened at claim; `run_transform` adopts it and records `history` | R-65, R-41 | W-53 | (b) Immediately before 135: `select count(*) from agent_requests where kind = 'sync' and state in ('queued','claimed')` → 0; (a) `phase19_135_136` PASS (a claim with `run_id` opens exactly 1 `running` row; a registered run holding that row and its calendar row folds into the same row; a quarantined run id raises 42501; the fold keeps the same `sync_runs.id`; `finished_at > started_at`); (b) `select count(*) from pg_trigger where tgname = 'agent_requests_open_sync_run'` → 1; `select has_function_privilege('authenticated', 'public.sync_request_open_run()', 'execute')` → false | "Home says sync running as soon as the sync starts" |
| 13 | 136: a registered run folds only on its calendar row; the drain uses the same test | R-65 | W-53 | (a) `phase19_135_136` PASS (5-min-old run with no calendar row → 0 folds; with the calendar row → 1 fold; the drain skips an incomplete newest run; quarantine unchanged); `db/tests/phase9_transform_states.sql` PASS; (b) `select schedule from cron.job where jobname = 'bb2dash-transform-tick'` → `*/2 * * * *` | — |
| 14 | 136 terminal rule: interrupted, the request closed, one Inbox item | R-65, R-41 | W-53 | (a) `phase19_135_136` PASS (31-min `running` row → `failed`, `interrupted_at` not null, notes contain `interrupted (reaped)`, request `failed`, exactly 1 open item with ref `agent_request:<id>`; a second tick adds 0; a claimed request with no run id, aged 31 min → `failed` + 1 item) | "a dead sync frees the Sync button and leaves one Inbox item" |
| 15 | 137: `v_sync_status` carries `notes` and `interrupted` | R-41 | W-53 | (b) `select string_agg(attname, ',' order by attnum) like '%,notes,interrupted' from pg_attribute where attrelid = 'public.v_sync_status'::regclass and attnum > 0 and not attisdropped` → true; `select has_table_privilege('anon', 'public.v_sync_status', 'select')` → false; (a) `phase19_137` PASS | — |
| 16 | `skills/bb-sync/SKILL.md` goes register-first. It lands only after 136 is applied | R-65 | W-53 | (d) `grep -c '^## Step 3a' skills/bb-sync/SKILL.md` → 0; `grep -c 'Do not pass' skills/bb-sync/SKILL.md` → 0; `grep -c "runAll({ termName: 'Fall 2026', runId })" skills/bb-sync/SKILL.md` → 1 | — |
| 17 | Runbook step 5 and the crawler comments match the new driver (comments only) | R-65 | W-53 | (d) `grep -c 'opened when the sync request is claimed' ingest/CADENCE_RUNBOOK.md` → 1; `grep -c 'WHY THE SKILL STILL REGISTERS AFTER THE CRAWL' ingest/bb_crawler.js` → 0; `grep -c 'It is NOT yet safe' ingest/bb_crawler.js` → 0; (a) `cd web && npx vitest run test/crawler.announcements.test.ts test/crawler.attempts.test.ts` → 0 failures | — |
| 18 | `sync-run-state.ts` with fixtures for every state | R-41 | W-54 | (a) `cd web && npx vitest run test/sync-run-state.test.ts` → 0 failures (running → "sync running"; partial → "last run partial"; failed → "last run failed"; interrupted → "last sync interrupted"; ok → null; no row → "no sync recorded yet" from `freshnessLine`) | — |
| 19 | `freshnessLine` uses it; `SyncStatus` carries the two columns | R-41 | W-54 | (d) `git diff --numstat main -- web/src/lib/queries.sync.ts` → first field ≤ 10; (a) `cd web && npx vitest run test/queries.sync.test.ts test/NeedsAttention.test.tsx test/Inbox.test.tsx` → 0 failures | "Home reads last sync interrupted, not failed" |
| 20 | Stream shows the label and date, keyed per run | R-38 | W-54 | (a) `cd web && npx vitest run test/course-stream.history.test.tsx test/course-stream.test.tsx` → 0 failures (New/Changed label; crawl date; one file posted by two runs renders twice with a spied `console.error` never called for duplicate keys) | — |
| 21 | Classwork keeps two nodes that share a path | R-64 | W-54 | (a) `cd web && npx vitest run test/course-classwork.samepath.test.ts test/course-classwork.test.ts test/CourseClasswork.test.tsx` → 0 failures | — |
| 22 | Raw-HTML guard for Blackboard rich text | P-94, R-76 | W-54 | (a) `cd web && npx vitest run test/raw-html.audit.test.ts` → 0 failures; (d) `grep -rl "dangerouslySetInnerHTML=" web/src` → exactly one path, `web/src/app/(app)/layout.tsx` | — |
| 23 | Desktop toast for an interrupted run | R-41 | W-54 | (a) `cd desktop && npx vitest run test/unit/reducer.test.ts test/unit/sources.test.ts` → 0 failures (interrupted → title "Sync interrupted"; `syncQuery()` selects `interrupted`) | "the desktop says Sync interrupted" |
| 24 | Integrate: regenerate types, run the full suites | all | PM | (d) `grep -c 'bb_material_history: {' web/src/lib/supabase/database.types.ts` → 1; (a) `cd web && npm run typecheck && npm run build && npx vitest run` → exit 0; `cd desktop && npm run typecheck && npx vitest run` → exit 0; `node scripts/db-test.mjs` → exit 0 | — |
| 25 | Migrations recorded; advisors clean | all | PM | (b) `select count(*) from supabase_migrations.schema_migrations where name in ('130_bb_content_ghost_collapse', '131_bb_content_item_key', '132_material_history', '133_course_stream_history', '134_sync_change_lines_materials', '135_sync_run_open_at_claim', '136_transform_tick_register_first', '137_sync_status_run_state')` → 8; (b) for each of the eight, `select md5(statements[1]) from supabase_migrations.schema_migrations where name = '<name>'` equals `git show HEAD:db/migrations/<file> | md5sum` (the LF form, as `80k_W34_VERIFICATION.md` recorded it): 8 of 8 equal, table in the PR; (d) `get_advisors` (security) findings naming `bb_material_history`, `material_history_record`, `bb_content_path_history` or `sync_request_open_run` → 0 | — |
| 26 | First register-first sync, live (Stack runs it; the PM checks) | R-65 | Stack + PM | (b) `select s.started_at < (select min(b.captured_at) from bb_raw b where b.run_id = s.run_id) and s.finished_at > s.started_at from sync_runs s where s.source = 'blackboard' and s.scope = 'all' order by s.id desc limit 1` → true | "press Sync; it runs and lands as before" |
| 27 | PM walk on the preview | R-38, R-41, R-64 | PM | (c) `docs/planning/sprint-2/walks/walk-19/` holds exactly these six: `01-ist466-classwork.png` (both "Information" lessons expanded; "Ethics Criteria.pptx" and "LectureM3_IST466Fall 2026 (2).pptx" visible); `02-ist352-classwork.png` (one WK01 folder); `03-stream-history.png` (a material post labelled New with its crawl date); `04-home-sync-running.png` (during task 26: "sync running"); `05-home-interrupted.png` (after acceptance step 5: "last sync interrupted"); `06-inbox-interrupted.png` (the one Inbox item). (d) `ls docs/planning/sprint-2/walks/walk-19/*.png | wc -l` → 6 | — |
| 28 | Docs: nine DECISIONS rows, STATUS, ORCHESTRATOR | R-76, all | PM | (d) `grep -c '^| 2026-' project-state/DECISIONS.md` → `git show main:project-state/DECISIONS.md | grep -c '^| 2026-'` + 9. The rows: key swap and path constraint dropped; ghost merge; history table, retention and vanish convention; Stream material posts and the baseline; register-first (supersedes 2026-09-15); open at claim and quarantined runs refused; the terminal rule (departs from 2026-09-15's Why); R-76 closed (B-39, text-only if ever shown); P-95 met by `bb_type`. `git diff --stat main -- project-state/STATUS.md project-state/ORCHESTRATOR.md` → 2 files changed | "read the nine rows in the PR" |

Order: tasks 1–2, then 3 → 4 → 5–6 → 7 → 8 → 9–11 for W-52. W-53's task 12 applies 135, which calls
`material_history_record` (132). Prod order must equal name order, so 133 and 134 go first and task
12 follows task 10. W-53 then runs 13 → 14 → 15 → 16 → 17. W-54's tasks 18–23 use fixtures and run
from the start. Tasks 24–28 come last.

## Workers

| Worker | Stream | Branch | Worktree | Owns (disjoint) | Tasks |
|---|---|---|---|---|---|
| W-52 | content identity and history | `feat/content-history-19-content` | `bb2dash-wt-content-history-19-content` | `db/migrations/130`–`134`, `db/tests/phase19_130`–`134`, `DATA_SYNTAX.md`, `99_W52_VERIFICATION.md` | 1, 3–11 |
| W-53 | sync honesty (driver) | `feat/content-history-19-driver` | `bb2dash-wt-content-history-19-driver` | `db/migrations/135`–`137`, `db/tests/phase19_135_136_sync_driver.sql`, `db/tests/phase19_137_sync_status.sql`, `skills/bb-sync/SKILL.md` steps 2–4, `ingest/CADENCE_RUNBOOK.md` step 5, `ingest/bb_crawler.js` comments, `99_W53_VERIFICATION.md` | 2, 12–17 |
| W-54 | screens and desktop | `feat/content-history-19-screens` | `bb2dash-wt-content-history-19-screens` | `web/src/lib/sync-run-state.ts`, `queries.sync.ts` (10 added lines at most), `course-dimension.ts` (`CourseStreamMeta`), `CourseStream.tsx` + `.module.css`, the four new web tests, `web/test/queries.sync.test.ts` (additions), `desktop/src/core/types.ts`, `desktop/src/core/poller/sources.ts`, `desktop/src/core/poller/reducer.ts`, `desktop/test/unit/reducer.test.ts`, `desktop/test/unit/sources.test.ts`, `99_W54_VERIFICATION.md` | 18–23 |

The workers are Opus (DECISIONS 2026-09-23). Each commits and pushes per task
(`feat(19-T4): …`), never touches `project-state/`, and applies migrations only in number order
after a `begin; … rollback;` dry run. The PM owns `database.types.ts`, integration, the walk and the
docs (tasks 24–28).

## Out of scope

* `v_content_tree`'s column list, the stale-node hide and toggle, P-11's three link moves, the
  heartbeat (P-12, P-71), the per-class thresholds, the calendar-push notice (R-52), and
  `sync_change_lines`' steady-state convention (P-72) all belong to **Phase 17**.
* `stage_files`, supersession (R-63, P-26), week and session links (R-67), the scripted fetch and
  embed step (P-22, P-23, P-36), crawler v5's key names, step 4b of the skill, and R-69's per-item URL
  (which reads `bb_type`) all belong to **Phase 18**.
* `sync_claim`, `sync_register_run`, `sync_close`, the `sync_runner` role, the dead-letter attempts
  counter (P-104), the container runner and any scheduled sync (D-3 stays declined, B-45) belong to
  **Phase 14**.
* Styling the new labels beyond existing tokens belongs to **Phase 22**.
* A search arm over `bb_content`, rendering descriptions (B-39 = no), pruning `bb_raw`, and dropping
  `bb_content_detail_merge` (left in place, unused) belong to no phase.
* Writes to `assignment_progress` / `reading_progress`: none (D-2).

## Open items for Stack

* **B-18.** Default: the first crawl of each course is a baseline and posts nothing, so the Stream
  starts at the second registered crawl. Vanished items are not posted on the Stream; they are named
  in Activity. History is kept in full this term. Say so if the baseline should post every item once
  on its crawl date.
* **B-19.** 93's default: hidden, with a toggle for the three really gone; nothing deleted. **PM
  reading, PROVISIONAL, needs your yes:** the 16 ghost rows are merged into their live twins; their
  old paths are kept in `previous_paths` and the three links are carried. The removed-items toggle
  then shows 5 items: 3 gone and 2 re-created in WK05 under new ids. The alternative keeps all 21
  behind a partial unique key.
* **B-20.** 93's default covers Phase 9's thresholds and the heartbeat only. **PM pick for the
  terminal rule (PROVISIONAL, B-20):** a registered crawl that never completes is never folded.
  After 30 minutes it is "interrupted", the request fails, one Inbox item is raised and the Sync
  button is freed. The alternatives are a shorter cut-off, or folding it labelled partial.
* **B-39.** Default: descriptions stay captured (11 rows) and are not shown, and R-76 closes by a
  DECISIONS row. If shown, they appear as plain text on Classwork, never HTML.

## Session prompt (copy-paste)

> `/bb2dash-pm` Start Phase 19 (content identity, per-crawl history and sync honesty). Phases 15, 17
> and 18 are merged to `main`. Read `docs/planning/sprint-2/briefs/99_PHASE19_content_history.md`.
> Check that my answers to 93 §5 items B-18, B-19, B-20 and B-39 are recorded in DECISIONS. Where an
> answer differs from the default, re-cut the tasks the "Stack's calls" table names and show me the
> diff before building. B-19's merge and B-20's terminal rule are PM picks, not 93 defaults; build
> them only on Stack's explicit yes. Re-measure S₀, D₀ and N₀ (task 3) and files 17 and 19 (task 4)
> on prod.
> Cut `feat/content-history-19` and the three worker worktrees, and spawn W-52, W-53 and W-54 on
> Opus with their disjoint file sets. Stop at "ready when you say so" with the PR and its Vercel
> preview. Do not merge.
