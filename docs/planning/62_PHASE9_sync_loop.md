# Phase 9 — Sync loop (automated transform, Inbox, honest status)

Date: 2026-09-10. PM: the Fable session. Product manager: Stack. Requirements: R-07, R-08, R-09,
R-13, R-15, R-20 (crawler + table), R-26 (in-app) from `60_REQUIREMENTS_v2.md`. Phase branch
`feat/sync-loop`, one PR. Runs **in parallel with Phase 8** (`61_PHASE8_course_dimension.md`);
seams frozen there. Two Opus workers on isolated worktrees / branches cut from the phase branch;
PM integrates.

**Base.** Cut from `origin/feat/retrieval-polish` (main + Phase 7). PM merges `main` in when the
Phase 7 PR lands.

**Migration numbers reserved for this phase: 030–039.** Phase 8 owns 026–029.

## Why

Today a crawl lands in `bb_raw` and a human runs `CADENCE_RUNBOOK.md` step 3 by hand to fold it
into typed tables. `sync_stage_runs` has zero rows; `v_data_freshness` is empty; nothing tells
Stack what changed or what needs him. Stack's direction: he triggers the crawl, the app does
everything after — transform, Inbox items, notifications — and raises what it cannot decide.

**Day-one item, before anything else: the `bb-files` Storage bucket is still `public: true`**
(verified 2026-09-10). Professors' files are fetchable by anyone with a derivable path. Flip it.

## Contract (frozen)

### Migration 030 — bucket private

`update storage.buckets set public = false where id = 'bb-files';` The web app already mints
signed URLs (`createSignedUrl`); the runbook's Storage POSTs are unaffected (upload policy, not
public read). Verify: an unauthenticated GET of a known object path returns 400/403; Materials
Open still works.

### Migration 031 — `attention_items`

DDL from `21_D2_architecture_direction.md` migration 011, verbatim, with two additions:
`resolution_note text` (Stack's free-text "why"), and `applied_at timestamptz` (set by the
transform when a resolution has been applied). Kinds: `conflict`, `missing`, `stack_must_confirm`,
`deadline`, `data_gap`. Unique key on `(kind, coalesce(course_id,''), coalesce(ref,''),
coalesce(field,''), state)`. RLS owner-scoped like migration 020 (`auth.uid() = app_owner()`).

Seeds (one-off in the same migration, idempotent): the `course_maps` `course_fields` entries with
`stack_must_confirm = true` and a null value, and the `gaps` entries with `owner = 'stack'`, read
via `v_course_map_latest`. Expect ~17 + ~44 rows; report the real count.

### Migration 032 — `agent_requests`

DDL from D2 migration 012 minus the `sync_runs.request_id` FK. Kinds this phase: `sync`,
`transform` only (the check constraint lists only these two; widen later). States `queued`,
`claimed`, `done`, `failed`, `cancelled`. RLS owner-scoped.

### Migration 033 — announcements columns + crawler contract

`alter table announcements add column author text, add column read_at timestamptz, add column
modified_at timestamptz;` The crawler (W-16) captures the announcement's creator display name
and modified date; the worker verifies the exact JSON key on a live payload (the endpoint is
`/learn/api/v1/courses/{C}/announcements`) and documents it in the crawler header. `is_read`
continues to mirror Blackboard; `read_at` is bb2dash's own mark (Phase 11's bell writes it).

### Migration 034 — transform stages

Each stage is a SQL function `stage_<name>(p_run_id uuid, p_sync_run_id bigint) returns jsonb`,
`security definer`, idempotent on `run_id`, writing exactly one `sync_stage_runs` row (`stage`,
`status`, `counts`, `started_at`, `finished_at`, `error`) and never raising: errors are caught,
recorded as `status = 'failed'` with `error`, and returned.

| Stage | Reads | Writes | Rules |
|---|---|---|---|
| `stage_courses` | `payload->'course'`, `->'teachers'`, `->'schedule'` | `courses` (title_bb, bb_url, bb_id), `course_staff` (upsert on `bb_user_id`; never delete), `meetings` only when the row is `source = 'blackboard'` | syllabus-sourced rows are never overwritten |
| `stage_content` | — | — | **Phase 8 owns it**; the driver calls `stage_content(p_run_id)` and wraps its counts in a stage row |
| `stage_assignments` | `payload->'gradebook'` (column metadata: `name`, `possible`, `due`, `contentId`, `columnId`, `submissionStatus`) and `->'content'` items with `type` matching asmt/test/assignment (`detail.dueDate`, `points`, `gradebookColumnId`) | `assignments` facts only: `due_at`, `points_possible`, `bb_column_id`, `bb_submission_status`, `bb_last_seen`, `bb_url` (content `url` when present) | Match by `bb_column_id`, then `(course_id, title, type)`. Overwrite only rows with `confidence in ('tentative','inferred')` or null fields. A differing value on a `confirmed` row raises `attention_items(kind='conflict', field, from_value, to_value)` and leaves the row alone. Re-created items (new `columnId`, same title/type): re-point, keep old id in `notes`. New columns with no match: insert with `source='blackboard'`, `confidence='tentative'`, and raise `stack_must_confirm`. **Never** touch `assignment_progress`. |
| `stage_announcements` | `payload->'announcements'` | `announcements` upsert on `(course_id, bb_item_id)`: title, body, posted_at, modified_at, is_read, author | Never delete |
| `stage_files` | `payload->'content'` embedded/attached files (`detail.file`, `embeddedFiles`) | `bb_files` **catalog only**: new `(course_id, content_id, file_name)` → insert with `source_url`, `mime_type`, `bucket = 'unclassified'`, `classified_by = 'rule'` via the existing `classify_bb_file()`; changed `source_url` on a known row → update + `notes` append; gone → `notes` append, never delete | No bytes: downloads stay in the runbook (step 4) until Electron. Never touch rows with `classified_by = 'stack'` or a non-null `superseded_by`. |
| `stage_gaps` | typed tables | `attention_items(kind='missing' \| 'data_gap')` | courses with no `grading_schemes` row; assignments with no date; readings with no `for_date`; files with `storage_path is null`; each keyed so re-runs are no-ops |

Applying resolutions: at the start of `stage_assignments`, every `attention_items` row with
`state='resolved'`, `applied_at is null`, `kind='conflict'` whose `resolution->>'accept'` is
`'blackboard'` gets its `to_value` written to the field and `confidence='confirmed'`; `'keep'`
sets `confidence='confirmed'` without a write; both set `applied_at`. Anything else stays
unapplied and visible.

### Migration 035 — driver, detection, reaper, cron

* `run_transform(p_run_id uuid, p_trigger text) returns bigint`: inserts `sync_runs(run_id,
  status='running', started_at, trigger, source='blackboard', scope='all')`, calls the stages in
  the order above, sets `status = 'ok'` if every stage is `ok`, `'partial'` if any failed,
  writes `summary = {stages: {...counts}, changes: [...plain-language lines], attention_raised:
  n}`, sets `finished_at`. Idempotent: a second call for a run that already has a non-running
  `sync_runs` row returns that id and does nothing.
* Crawl-complete detection: a `run_id` is complete when a `bb_raw` row with `kind='calendar'`
  exists for it (the crawler posts it last), or when its newest row is older than 3 minutes.
* `transform_tick()`: for each complete `run_id` in `bb_raw` with no `sync_runs` row, call
  `run_transform(run_id, 'scheduled')`. Then reap: `sync_runs` rows `running` with `started_at
  < now() - interval '30 minutes'` → `status='failed'`, `notes='interrupted (reaped)'`. Then
  claim: `agent_requests` rows `queued` with `kind='transform'` → `claimed`, run against the
  newest complete run, → `done`/`failed` with `result`.
* `create extension if not exists pg_cron;` (not installed today — verified) and
  `select cron.schedule('bb2dash-transform-tick', '*/2 * * * *', $$select transform_tick()$$);`
  Job runs as the migration's role; document which. The schedule line is in the migration so the
  repo reproduces prod.
* `ical_poll()` scheduled daily: reads `app_settings.ical_url` (new one-row table in this
  migration, owner-editable) and, while it is blank, writes a `sync_stage_runs` row
  `stage='ical', status='skipped'`. When set, `net.http_get` it and store the raw body in
  `bb_raw(kind='ical')`; parsing is a later phase.

### `v_sync_status` (migration 035)

One row: latest `sync_runs` (id, run_id, status, started_at, finished_at, trigger, summary), plus
`open_attention` counts by kind, plus the `v_data_freshness` rows as a jsonb array. The Home
row and the Inbox header read this and nothing else.

### Web surfaces

* **Inbox** at `/inbox` (top-nav link between Planner and Grades): rows grouped by kind, each
  with course, question, from → to, source, suggested answer; resolve controls per kind
  (`conflict`: Accept Blackboard / Keep mine; `stack_must_confirm` and `missing`: a text/date
  input; `data_gap` and `deadline`: Dismiss); a required-optional **"why" note** field on every
  resolution written to `resolution_note`; state chip "answered, applies on next sync" until
  `applied_at` is set. Dismissed rows collapse under "dismissed (n)".
* **Home needs-attention row** replaces the sync line: typed counts (conflict / needs input /
  missing / deadline) + "last synced 3 hrs ago · grades stale 2 days"; click expands the top
  five with a link to Inbox. Reads `v_sync_status`.
* **Sync button** (top bar, next to ⌘K): inserts `agent_requests(kind='sync')`, copies
  `claude "/bb-sync <request id>"` to the clipboard, toast "command copied — run it in Claude
  Code with a logged-in Blackboard tab". Shows the request's state until done.
* **In-app notifications** (R-26 web half): a bell-adjacent "Activity" list of the latest
  `sync_runs.summary.changes` lines, newest first, with a seen marker in `localStorage`.
  (Announcement bell stays disabled; Phase 11.)

### Skill `skills/bb-sync/SKILL.md` and runbook

`bb-sync <request id>`: login check → claim the request → `await bb.runAll({termName})` → poll
`v_sync_status` until the run's `sync_runs` row is `ok|partial|failed` (the cron does the
transform) → mark the request `done` with the run id → report `summary.changes` and
`attention_raised` to Stack in plain language. On SESSION EXPIRED: request `failed`, raise
`attention_items(kind='stack_must_confirm', question='Blackboard session expired; log in and
re-run')`. `CADENCE_RUNBOOK.md`: step 3 struck through (automated), step 5 struck through
(automated), step 4 kept and labelled manual-until-Electron.

## Workers

### W-15 — database + scheduler (branch `feat/sync-loop-db`, worktree `bb2dash-wt-sl-db`)

Migrations 030–035. Dry-run each in `begin; … rollback;`; apply with `apply_migration` under the
file's name; byte-identical repo copy. Run `run_transform` against the latest run (`6b122650-…`)
and against the 9/2 run in order, and show the second run raises no duplicate attention rows.
Verification note `docs/planning/64_W15_VERIFICATION.md`: bucket check, per-stage counts, the
`ultraDocumentBody` rows gone (Phase 8's function, called here), conflicts raised with
from/to values, a resolution applied end-to-end, reaper test (insert a stale running row, tick,
observe failed), cron job listed in `cron.job`, RLS check on every new table/view. Never touch
001–029.

### W-16 — web + ingest (branch `feat/sync-loop-web`, worktree `bb2dash-wt-sl-web`)

Inbox screen, Home needs-attention row, Sync button, Activity list; `queries.sync.ts`
(`syncStatusOptions`, `attentionItemsOptions`, `resolveAttentionItem`, `createAgentRequest`);
crawler: announcements creator/modified fields, header comment bump; `skills/bb-sync/SKILL.md`;
runbook edits. Tests: Inbox grouping and resolve request bodies per kind (note field included),
needs-attention counts rendering, Sync button clipboard text, crawler `announcements` mapper
(pure function extracted for testability). `npm run typecheck && npm run build && npm test` green.
Fixtures for `v_sync_status` / `attention_items` live in the tests; live smoke at integration.

## Seams with Phase 8 (frozen)

See `61_PHASE8_course_dimension.md` §Seams. In short: Phase 8 owns `stage_content`; Phase 9
owns the driver and every other stage; Phase 9 owns the Home sync row; announcements columns
are additive.

## Out of scope this phase

Gradebook table and any grade or score (Phase 10). Attempts endpoint (Phase 10). Announcement
bell and page, `read_at` writes (Phase 11). File bytes download automation (Electron). Desktop
notifications (Electron). `bb_files` classification pass and OCR (Phase 11, R-16). Any change to
`hybrid_search_file_text` or the search edge function. Scheduled crawls of any kind.

## Integration (PM)

Merge W-15 → W-16 into `feat/sync-loop`; regenerate `database.types.ts`; typecheck/build/test;
trigger a real sync via the button + `bb-sync` from a logged-in tab and watch the cron fold it;
Vercel preview; `/code-review` + `/security-review` (agent_requests and attention_items are
owner-writable via RLS; resolution inputs validated; `security definer` functions have a fixed
`search_path`); update STATUS + DECISIONS (records: bucket private; pg_cron enabled and why;
transform-in-SQL over an edge function; resolution "why" notes); open the PR; stop at "ready
when you say so".
