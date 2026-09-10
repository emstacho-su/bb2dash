# Cadence runbook — validate, diff, bridge

This is the procedure run by hand on 2026-09-08 (`ingest/VALIDATION_RUN_2026-09-08.md`). It is
written to become a scheduled task: every step is standalone, idempotent, and reports progress.
Blackboard sessions expire overnight, so the task's first action is always a login check; if the tab
is on NetID / microsoftonline, it stops and reports SESSION EXPIRED instead of guessing.

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
3. **Diff live vs catalog.**
   - Files: for every content item in the run, `bb.embedsDeep(item)` + file-type items → compare to
     `bb_files.source_url` by (course, content_id, file_name). New → insert; changed rid → patch URL and
     mark stale bytes; gone → note in `bb_files.notes`, never delete.
   - Gradebook: columns in the run vs `assignments.bb_column_id`; new columns → link by title or
     insert with `source='blackboard'`; `submissionStatus`/`displayGrade`/`feedback` drift →
     `assignment_progress` (status, score, graded_at, feedback).
   - Content: items deleted/re-created (new `contentId` for the same title) → update `bb_item_id`.
   - Announcements: `bb_item_id` not in `announcements` → insert; parse dates/quizzes into
     `assignments` when the text is explicit (e.g. "Quiz 2 on Thursday 9/10").
   - Calendar: new items → sessions/assignments as appropriate.
4. **Pull new files.** `bb.downloadAll(urls)` in ONE call; claim `<uuid>.tmp` by size + magic + text;
   PowerShell move into `course context/<relpath>`; stage → sha256 → Storage POST (no `x-upsert`) →
   `extract_text.py` → `bb_file_text`; set `storage_path`/`local_path` from `bb_file_relpath(id)`.
5. **Record.** `insert into sync_runs (source, scope, summary, notes)` with counts + observations +
   conflicts. PASS: `needs_move = 0`, no `storage_path is null`, no `/sessions/` URLs.
6. **Report to Stack.** What changed in plain language (new due dates, grades posted, items
   re-created, files added) and anything he must confirm. Grades are facts; planner state is his.

## Rules carried from the skills
- Blackboard overwrites only tentative/inferred rows or nulls; conflicts go to `sync_runs.summary`.
- Never change rows with `classified_by = 'stack'`.
- Durable URLs only; deep-scan every item; one download call per batch; progress line per step.
