---
name: bb-sync
description: 'Run one Blackboard sync end to end for a queued agent_requests row. Checks the Blackboard session, claims the request, crawls every current-term course with bb.runAll, waits while the scheduled transform folds the crawl into the typed tables, closes the request, and reports what changed and what needs Stack in plain language. Use when Stack pastes claude "/bb-sync <id>" from the app Sync button, or says run a sync / sync Blackboard.'
---

# bb-sync

The app cannot crawl Blackboard: every endpoint the crawler uses is authorized by a session cookie
obtained through NetID plus a Duo push that only Stack can approve. So the Sync button in bb2dash
files a request and hands him a command; this skill is the other half of it.

**You do the crawl. You do not do the transform.** `transform_tick()` runs on pg_cron every two
minutes (migration 035), detects the completed crawl, and calls `run_transform`. Your job after the
crawl is to watch `v_sync_status` until that has happened, pull the submission files the transform
catalogued (step 4b — the only bytes this skill fetches, because only the logged-in tab can reach
them), and report.

Argument: the `agent_requests.id` from the command (`claude "/bb-sync 42"`). If Stack asks for a
sync with no id, create the request yourself in step 2 instead of claiming one.

## Inputs

- A browser tab logged into Blackboard Ultra: built-in browser preferred, Claude in Chrome as
  fallback, with `installCrawler` from `ingest/bb_crawler.js` loaded as `window.__bb`.
- Supabase `bb2dash` (ref `goultdzqcavefcgnifdy`) through the Supabase MCP for every read and write.
- Stack's user id for the crawler: `_21025199_1`. Term: `Fall 2026`.

Post a one-line status after every step. A sync takes minutes; a silent run looks stalled.

## Step 1 — Login check (always first, never skipped)

Probe the tab's `location.href` in page context. If it is on NetID, `login.microsoftonline.com`, or
any Blackboard login page, **stop**. Do not guess, do not retry, do not attempt credentials.

```sql
update agent_requests
   set state = 'failed', finished_at = now(),
       result = jsonb_build_object('error', 'SESSION EXPIRED')
 where id = $1;

insert into attention_items (kind, question, suggested)
values ('stack_must_confirm',
        'Blackboard session expired; log in and re-run the sync',
        to_jsonb('claude "/bb-sync <new request id>"'::text))
on conflict do nothing;
```

Then tell Stack in one line: the session expired, log in to Blackboard and press Sync again. The
`on conflict do nothing` is load-bearing — migration 031's unique key means a second expiry while
the first is still open is the same row, not a second one.

## Step 2 — Claim the request

```sql
update agent_requests
   set state = 'claimed', claimed_at = now(), claimed_by = 'bb-sync session'
 where id = $1 and state = 'queued'
returning id, kind, scope;
```

No row back means someone already claimed it or Stack cancelled it: say so and stop rather than
running a second crawl. With no id at all, insert one first
(`insert into agent_requests (kind, scope, state) values ('sync','all','claimed')`) so the run is
still auditable.

## Step 3 — Register the run id, then crawl

The scheduled transform folds **only** crawls whose `run_id` sits on an owner-claimed request
(`agent_requests.run_id`, migration 035). An unregistered crawl is quarantined, never folded. Since
crawler version 3 `runAll` accepts the id, so registration comes **first** and the window where a
crawl exists that nobody has claimed never opens.

Generate the id, write it, and only then crawl:

```sql
update agent_requests set run_id = '<uuid you generated>'
 where id = $1 and state = 'claimed'
returning id, run_id;
```

No row back means the request is no longer claimed: stop and report, rather than crawling into a
run that will be quarantined. REST equivalent with the owner's JWT:
`PATCH /rest/v1/agent_requests?id=eq.<id>` with body `{"run_id":"<uuid>"}`.

Then, in the logged-in tab:

```js
const { run_id, log } = await bb.runAll({ termName: 'Fall 2026', runId: '<the same uuid>' });
```

One `bb_raw` row per course plus a memberships row and a calendar row, all under that `run_id`.
PASS: 7 course rows and the calendar row, every POST status 201, and `run_id` equal to the uuid you
registered. The calendar row is posted last and is what the transform's crawl-complete detection
looks for, so **never** interrupt a run part-way and call it done.

Report the per-course log line by line.

*(An older crawler build generated the id inside `runAll` and could only be registered afterwards.
If `bb.runAll` ignores `runId` — check that the returned `run_id` is the one you passed — the tab is
running that build: register immediately after it returns instead, and say so in the report.)*

## Step 4 — Wait for the transform

The cron picks the run up within two minutes. Poll every 30 seconds, up to ten minutes:

```sql
select id, run_id, status, started_at, finished_at, summary, open_attention
  from v_sync_status;
```

- `status = 'running'` for the crawl's `run_id`: keep waiting, post a progress line.
- `status in ('ok','partial','failed')`: done, go to step 5.
- Ten minutes with no `sync_runs` row for the `run_id` at all: the tick is not firing. Do not run
  the transform by hand and do not invent one — check `select * from cron.job` and
  `cron.job_run_details`, report what you find, and leave the request `claimed`.
- `partial` means some stage failed. Read `sync_stage_runs` for that `sync_run_id` and name the
  failing stage and its `error` in the report. A partial run is still a real result.

## Step 4b — Pull the submission files (new in Phase 10a)

Once the transform has closed, `stage_attempts` has catalogued every file Blackboard says Stack
handed in — but not the bytes. They are behind the same session cookie the crawl used, so this is
the one thing only a logged-in tab can do, and it has to happen before that tab goes away.

Find the rows that need bytes:

```sql
select f.id, f.course_id, f.file_name, f.source_url, f.attempt_id,
       bb_file_relpath(f.id) as relpath
  from bb_files f
 where f.bucket = 'my_submissions'
   and f.classified_by = 'blackboard'
   and f.storage_path is null
   and f.superseded_by is null
 order by f.course_id, f.file_name;
```

None → say "no new submission files" and go to step 5. Otherwise, for each row:

1. **Download** `source_url` in the logged-in tab, the way the file pull does it: start the
   navigation and take the file from Playwright's `waitForEvent('download')`, then `saveAs` into the
   scratch directory. A 401/403 means the session died mid-sync — stop, report it, and leave the row
   alone; the next sync picks it up because `storage_path` is still null.
2. **sha256** the saved file, and record its byte count and Content-Type.
3. **Upload** to Storage at `bb_file_relpath(id)`:
   `POST /storage/v1/object/bb-files/<relpath>` with `apikey` + `Authorization: Bearer` (the
   publishable key — never the service key) and the real Content-Type, and **no `x-upsert`**: anon
   is insert-only, so a changed file gets a new key rather than overwriting one. A 409 means the key
   already holds bytes; treat that as done and carry on to the row update.
4. **Mirror** to `course context/<relpath>` (PowerShell `Move-Item`, creating directories) so the
   local tree matches the bucket, exactly as step 4 of the runbook does for course files.
5. **Update the row** — this is what makes it visible in Materials and the popout:

```sql
update bb_files
   set storage_path  = 'bb-files/' || bb_file_relpath(id),
       local_path    = 'course context/' || bb_file_relpath(id),
       bytes         = $bytes,
       sha256        = $sha256,
       mime_type     = $mime,
       downloaded_at = now()
 where id = $id and storage_path is null;
```

Rules that apply to this step and no other:

- Rows with `classified_by = 'stack'` are files **Stack** staged in bb2dash. They have no
  `source_url` and are never touched here.
- Never `insert` a `bb_files` row from this step. `stage_attempts` is the only writer of submission
  catalog rows; this step only fills in bytes on rows it already created.
- Report the count in step 6 as "N submitted file(s) now downloadable", and name any that failed.

## Step 5 — Close the request

```sql
update agent_requests
   set state = case when $status = 'failed' then 'failed' else 'done' end,
       finished_at = now(), sync_run_id = $sync_run_id,
       result = jsonb_build_object('run_id', $run_id, 'status', $status)
 where id = $1;
```

Never leave a request `claimed`: a stale claim holds the tick's quarantine grace window open
(migration 039) for up to 30 minutes and delays the bookkeeping of any other crawl.

## Step 6 — Report to Stack, in plain language

Read `summary->'changes'` and `summary->>'attention_raised'` from the run, and the open counts from
`v_sync_status`. Then say, in his words rather than the schema's:

- What changed: every line of `summary.changes`, as written ("IST.323 Quiz 2 due date moved 9/2 to
  9/9", "ECN.304 added 1 announcement", "3 new files catalogued").
- What needs him: the typed counts, and the one-line question for anything new, with the reminder
  that the Inbox at `/inbox` is where they get answered.
- What failed, if anything: the stage, the error, and whether a re-run would help.

Grades and due dates are facts from Blackboard. Planner state — `assignment_progress`,
`reading_progress` — is Stack's, and a sync never touches it. Say nothing that is not in the run.

## Rules carried from the phase

- Never write typed tables by hand from this skill. `run_transform` is the only writer of facts from
  `bb_raw`, and doing it twice is how the repo and prod drifted once already.
- Never resolve an `attention_items` row on Stack's behalf. Raising one is the agent's job; answering
  is his, in the Inbox.
- Durable URLs only, deep-scan every item — the crawler already does both; do not hand-edit payloads.
- **Course** file bytes are not downloaded here. That is `CADENCE_RUNBOOK.md` step 4, and it stays
  manual until Electron. **Submission** file bytes are different: they need the same logged-in tab
  the crawl used and nothing else can reach them, so step 4b above does them while the session is
  still alive.
