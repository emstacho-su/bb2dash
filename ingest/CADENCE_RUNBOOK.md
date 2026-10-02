# Cadence runbook — validate, diff, bridge

This is the procedure run by hand on 2026-09-08 (`ingest/VALIDATION_RUN_2026-09-08.md`). It is
written to become a scheduled task: every step is standalone, idempotent, and reports progress.
Blackboard sessions expire overnight, so the task's first action is always a login check; if the tab
is on NetID / microsoftonline, it stops and reports SESSION EXPIRED instead of guessing.

**Status: every step of this loop is now automated or part of the sync.** Steps 1 and 2 are cheap
checks a human or a session still runs; steps 3, 5 and 6 are automated and struck through below;
**step 4 moved into the sync** and is no longer a separate manual pass. The whole loop is: Stack
presses Sync in the app → `claude "/bb-sync <id>"` runs steps 1–2 → `transform_tick()` on pg_cron
does step 3 and step 5 → `bb-sync` step 4b pulls every file with no bytes, course and submission
alike → `bb-sync` does step 6. See `skills/bb-sync/SKILL.md`.

**How step 4 got here.** Phase 10a (2026-09-15) first carved submission files out of it, because
only the logged-in tab can reach them. Course files stayed outside the sync, pulled by hand on
request — which meant a sync could catalogue a file, raise an Inbox `data_gap` saying it cannot be
opened, and leave both for a human. The pull is the sync's own unfinished work, so it now finishes
it. The byte fetch no longer uses Playwright's `download` event either: that crashed the MCP browser
on 2026-09-23 and cost a sync three files. `ingest/fetch_signed.mjs` walks the `bbcswebdav` redirect
chain to its signed CDN URL instead, and `ingest/pull_files.mjs --fetch` downloads it. Since
2026-10-01 the sync runs only in Stack's logged-in Chrome (Claude in Chrome), which cannot walk a
redirect: Chrome saves each file to Downloads and `ingest/collect_download.mjs` moves it to where
`pull_files.mjs` (no `--fetch`) looks. The hop walk stays for a Playwright caller.

## Inputs
- Logged-in Blackboard tab (Stack's Chrome through Claude in Chrome, the only browser) with `installCrawler` from
  `ingest/bb_crawler.js` loaded as `window.__bb`.
- Supabase `bb2dash` (ref goultdzqcavefcgnifdy), publishable key for REST/Storage, MCP `execute_sql`
  for reads/updates.
- Device: `$HOME/mnt/Downloads`, OneDrive `bb2dash/course context/`, PowerShell for moves,
  `C:\Users\stack\projects\bb2dash` for git.

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
4. ~~**Pull new COURSE files.**~~ **MOVED INTO THE SYNC (2026-09-29).** Course files are no longer
   a separate manual pass: `bb-sync` step 4b pulls every `bb_files` row with no bytes — course
   materials and Stack's submissions alike — while the logged-in tab is still alive, and the sync
   reports what it pulled and what it could not. See `skills/bb-sync/SKILL.md` step 4b for the
   procedure and `ingest/pull_files.mjs` for the script.

   What changed, and why it is worth knowing: the browser half no longer downloads anything. A
   `bbcswebdav` URL 302s to a signed CDN URL on another origin with no CORS, so page JavaScript
   cannot read it and the pull used Playwright's download event — which crashed the MCP browser on
   2026-09-23 and left that sync unable to store three catalogued files. The browser now only walks
   the redirect chain (`ingest/fetch_signed.mjs`, `resolveSignedUrl`, one hop at a time with
   `maxRedirects: 0`) and records the hops; `ingest/pull_files.mjs --fetch` downloads the signed
   URL itself, because a signed URL carries its own authorisation and needs no session. The chain is
   bounded at three hops and must end on `.content.blackboardcdn.com`.
   **Superseded for the sync on 2026-10-01:** Claude in Chrome has no request API, so step 4b now
   navigates the tab to `<source_url>?xythos-download=true`, lets Chrome save the file, and
   collects it with `ingest/collect_download.mjs` (SKILL.md step 4b, Half one).

   For the record: the first scripted run was 12 files on 2026-09-22 (Inbox request 38); before the
   script the procedure claimed `<uuid>.tmp` files by size and magic bytes and moved them into
   `course context/<relpath>` by hand.

5. ~~**Record.**~~ **AUTOMATED (Phase 9; register-first since Phase 19, migrations 135 and 136).**
   The `sync_runs` row is opened when the sync request is claimed: `bb-sync` step 2 claims the
   request and sets its `run_id` in one update, and the trigger `agent_requests_open_sync_run`
   inserts the row as `running`, so Home reads "sync running" while the crawl is still going.
   `transform_tick()` folds a registered run only once its `calendar` row has landed (the crawler
   posts it last), never on an idle timer. `run_transform` adopts that same row and closes it with
   `status`, `finished_at` and the `summary` envelope (`{stages, changes, attention_raised,
   errors}`); each stage writes its own `sync_stage_runs` row (nine, with `history`), which is what
   `v_data_freshness`, `v_sync_status.streams` and the app's freshness line read. A crawl that dies
   leaves the `running` row and a `claimed` request. After 30 minutes the tick's terminal rule
   marks the run `failed` with `interrupted_at` set and notes ending `interrupted (reaped)`, closes
   the request as `failed` and raises one Inbox item. Nothing is retried and an interrupted crawl
   is never folded: press Sync again. Do not `insert into sync_runs` by hand.
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
