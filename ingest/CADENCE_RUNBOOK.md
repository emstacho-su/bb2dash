# Cadence runbook — validate, diff, bridge

This is the procedure run by hand on 2026-09-08 (`ingest/VALIDATION_RUN_2026-09-08.md`). It is
written to become a scheduled task: every step is standalone, idempotent, and reports progress.
Blackboard sessions expire overnight, so the task's first action is always a login check; if the tab
is on NetID / microsoftonline, it stops and reports SESSION EXPIRED instead of guessing.

**Status after Phase 9 (2026-09-10): steps 3, 5 and 6 are automated and struck through below.**
Steps 1 and 2 are cheap checks a human or a session still runs; step 4 stays manual until Electron.
The whole loop is now: Stack presses Sync in the app → `claude "/bb-sync <id>"` runs steps 1–2 →
`transform_tick()` on pg_cron does step 3 and step 5 → `bb-sync` does step 6. See
`skills/bb-sync/SKILL.md`.

## Inputs
- Logged-in Blackboard tab (built-in browser, tab `seed`) with `installCrawler` from
  `ingest/bb_crawler.js` loaded as `window.__bb`.
- Supabase `bb2dash` (ref goultdzqcavefcgnifdy), publishable key for REST/Storage, MCP `execute_sql`
  for reads/updates.
- Device: `$HOME/mnt/Downloads`, OneDrive `bb2dash/course context/`, PowerShell for moves,
  `C:\Users\estac\projects\bb2dash` for git.

## Steps (post a one-line status after each)
1. **Crawl.** `await bb.runAll({termName: 'Fall 2026'})` → one `bb_raw` row per course + calendar under
   a new `run_id`. PASS: 7 course rows + calendar row for the run.
2. **Validate stored layers.** DB vs Storage (every `storage_path` exists, sizes match); local mirror
   (sha256 per `local_path`); `v_file_layout.needs_move = 0`; every extracted file has `bb_file_text`.
3. ~~**Diff live vs catalog.**~~ **AUTOMATED (Phase 9) — do not do this by hand.**
   `transform_tick()` runs on pg_cron every two minutes, detects the completed crawl, and calls
   `run_transform(run_id, 'scheduled')`, which runs the stages in migration 034: `stage_courses`,
   `stage_content`, `stage_assignments`, `stage_announcements`, `stage_files`, `stage_gaps`. They are
   idempotent, they never overwrite a `confirmed` row, and anything they cannot decide becomes an
   `attention_items` row that Stack answers in the app Inbox. Doing any of it by hand a second time is
   how the repo and prod drifted once already (see `AUDIT_2026-09-09.md`).
   - ~~Files: for every content item in the run, `bb.embedsDeep(item)` + file-type items → compare to
     `bb_files.source_url` by (course, content_id, file_name). New → insert; changed rid → patch URL and
     mark stale bytes; gone → note in `bb_files.notes`, never delete.~~ → `stage_files` (catalog only).
   - ~~Gradebook: columns in the run vs `assignments.bb_column_id`; new columns → link by title or
     insert with `source='blackboard'`; `submissionStatus`/`displayGrade`/`feedback` drift →
     `assignment_progress` (status, score, graded_at, feedback).~~ → `stage_assignments` for the
     column metadata. Scores and the gradebook table are Phase 10; nothing writes a grade yet, and
     `assignment_progress` is Stack's and is never written by a sync.
   - ~~Content: items deleted/re-created (new `contentId` for the same title) → update `bb_item_id`.~~
     → `stage_content` (Phase 8) plus the re-created-item rule in `stage_assignments`.
   - ~~Announcements: `bb_item_id` not in `announcements` → insert; parse dates/quizzes into
     `assignments` when the text is explicit (e.g. "Quiz 2 on Thursday 9/10").~~ → `stage_announcements`
     upserts the row, now with `author` and `modified_at`. Parsing prose into assignments stays out of
     the transform on purpose: it is language work, it belongs to a skill, and its output lands in
     `attention_items` for Stack to accept — never straight into `assignments`.
   - ~~Calendar: new items → sessions/assignments as appropriate.~~ → the calendar row is what marks a
     crawl complete; `ical_poll()` is scheduled daily and is skipped while `app_settings.ical_url` is
     blank.
4. **Pull new files. MANUAL — until Electron.** This is the one step no automation replaces yet:
   `bbcswebdav` URLs 302 to a cross-origin CDN with no CORS, so bytes cannot be fetched from page JS,
   and a browser download needs a real browser. `bb.downloadAll(urls)` in ONE call; claim `<uuid>.tmp`
   by size + magic + text; PowerShell move into `course context/<relpath>`; stage → sha256 → Storage
   POST (no `x-upsert`) → `extract_text.py` → `bb_file_text`; set `storage_path`/`local_path` from
   `bb_file_relpath(id)`. `stage_files` has already catalogued which rows need bytes: they are the
   `bb_files` rows with `storage_path is null`. An Electron shell with `will-download` plus
   `item.setSavePath()` deletes this step outright, which is the single largest simplification left in
   this project (`21_D2_architecture_direction.md` section 5).
5. ~~**Record.**~~ **AUTOMATED (Phase 9).** `run_transform` opens the `sync_runs` row before the first
   read and closes it with `status`, `finished_at` and the `summary` envelope
   (`{stages, changes, attention_raised}`); each stage writes its own `sync_stage_runs` row, which is
   what `v_data_freshness` and the app's freshness line read. A run that dies leaves a `running` row
   that the next tick reaps to `failed` after 30 minutes. Do not `insert into sync_runs` by hand.
6. **Report to Stack.** Done by the `bb-sync` skill from `summary->'changes'` and the open
   `attention_items` counts: what changed in plain language (new due dates, items re-created, files
   added) and anything he must confirm, which he answers in the app Inbox at `/inbox`. Grades are
   facts; planner state is his.

## Rules carried from the skills
- Blackboard overwrites only tentative/inferred rows or nulls; a conflict on a `confirmed` row
  becomes an `attention_items` row with `from_value` and `to_value` (migration 031), not a prose line
  in `sync_runs.summary`. `summary.changes` records what changed; `attention_items` records what
  needs a human.
- Never change rows with `classified_by = 'stack'`, and never write `assignment_progress` or
  `reading_progress` from a sync — that is Stack's planner state.
- Never resolve an `attention_items` row on Stack's behalf. The agent raises; he answers in `/inbox`;
  the next transform applies the resolution and stamps `applied_at`.
- Durable URLs only; deep-scan every item; one download call per batch; progress line per step.
