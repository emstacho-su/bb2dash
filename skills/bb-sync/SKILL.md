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

## Step 0 — Apply Stack's Inbox answers first

A crawl raises new Inbox questions; the answered ones should be applied and archived before that
happens, so the Inbox never mixes old answers with new questions. Run `/inbox-apply` (the skill
in `skills/inbox-apply/SKILL.md`) with no argument: it files its own `inbox_feedback` request,
processes `v_inbox_queue`, records each decision, archives the rows and reports. Then continue
here. Skip it only when `select count(*) from v_inbox_queue` is 0, or when an `inbox_feedback`
request is already `claimed` (another session is on it); say which in the status line.

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

## Step 3 — Crawl

In the logged-in tab:

```js
const { run_id, log } = await bb.runAll({ termName: 'Fall 2026' });
```

One `bb_raw` row per course plus a memberships row and a calendar row, all under one new `run_id`.
PASS: 7 course rows and the calendar row, every POST status 201. The calendar row is posted last and
is what the transform's crawl-complete detection looks for, so **never** interrupt a run part-way and
call it done.

Record the `run_id`. Report the per-course log line by line.

**Do not pass `runId` and register before the crawl.** `runAll` accepts one, and registering first
is the order the authorisation rule would prefer — but it is not safe yet, and the reason is in the
driver: `transform_tick` (migration 044) folds a **registered** run as soon as one of its `bb_raw`
rows is more than three minutes old, with no completeness check. Register first, and a slow crawl
(version 4 walks three requests per submitted column, plus a full-item GET per assessment, so it is
slower still than version 3's single probe) can be folded with one course
landed; `run_transform` is idempotent, so the remaining six are then dropped for good. Register-first
becomes correct the moment the tick requires the `calendar` row for a registered run — a Phase 9
driver change, not this phase's. Until then step 3a below is the order, and migration 039's grace
window covers the gap exactly as it always has.

## Step 3a — Register the run id, immediately (authorises the fold)

The scheduled transform folds **only** crawls whose `run_id` sits on an owner-claimed request
(`agent_requests.run_id`, migration 035). An unregistered crawl is quarantined, never folded.
Do this the moment `bb.runAll` returns, before anything else:

```sql
update agent_requests set run_id = $run_id where id = $1 and state = 'claimed';
```

REST equivalent with the owner's JWT: `PATCH /rest/v1/agent_requests?id=eq.<id>` with body
`{"run_id":"<uuid>"}`. If this update touches no row, stop and report: the request is no longer
claimed and the crawl will be quarantined by the next tick (harmless, but nothing lands).

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

## Step 4b — Pull the submission files (Phase 10a; scripted since 2026-09-22)

Once the transform has closed, `stage_attempts` has catalogued every file Blackboard says Stack
handed in — but not the bytes. They are behind the same session cookie the crawl used, so this is
the one thing only a logged-in tab can do, and it has to happen before that tab goes away. It is
runbook step 4's procedure with `--bucket my_submissions`: a browser half, then `ingest/pull_files.mjs`.

**The manifest.** Save this array to `<scratch>/manifest.json`. `null` back → say "no new
submission files" and go to step 5.

```sql
select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name,
         'relpath', bb_file_relpath(f.id), 'mime', f.mime_type, 'source_url', f.source_url,
         'bucket', f.bucket, 'attempt_id', f.attempt_id) order by f.id)
  from bb_files f
 where f.bucket = 'my_submissions' and f.classified_by = 'blackboard'
   and f.storage_path is null and f.superseded_by is null;
```

**Half one — the browser.** One call per row in the logged-in tab, the snippet runbook step 4 uses:

```js
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 60000 }),
  page.evaluate((u) => { const a = document.createElement('a'); a.href = u; a.download = '';
    document.body.appendChild(a); a.click(); a.remove(); }, source_url + '?xythos-download=true'),
]);
await dl.saveAs(`${downloads}/${id}_${dl.suggestedFilename()}`);
```

Since crawler v4 (Phase 12b) `source_url` is Blackboard's own durable `bbcswebdav/xid-<n>_1` link,
read from the attempt detail's `file.permanentUrl` — the same kind of URL step 4 already pulls, and
it behaves the same way. Before v4 it was a REST download route the crawler built, which no student
session could open; that is why this step has never had a row to pull. **401/403** = the session
died mid-sync: stop, report it, leave the row alone (the next sync picks it up, `storage_path` is
still null). **404** = the file is gone from Blackboard: leave the row and report it.

**Half two — the script.** `--dry-run` first to see the keys, then for real:

```
node ingest/pull_files.mjs --manifest <scratch>/manifest.json --downloads <scratch>/downloads \
     --bucket my_submissions --out <scratch>/4b.sql
```

It checks size and magic bytes, mirrors to `course context/<relpath>`, POSTs to Storage
`bb-files/<key>` with the publishable key in `SB_ANON_KEY` (never the service key, no `x-upsert`),
extracts the text into `bb_file_text` — Stack's own documents belong in the corpus — and writes one
`update bb_files …` per file to `--out`. The key is `bb_file_relpath(id)`, which since migration 052
carries an `attempt-<digits>/` segment, so it can never land on the key of a file Stack staged under
the same name. `--bucket my_submissions` is what keeps this run off course rows; omitting it makes
it a course-file run instead.

Then run `<scratch>/4b.sql` through `execute_sql` — the script never writes `bb_files` itself. Its
update sets `mime_type = coalesce(mime_type, <observed>)`, not the observed type: since migration
085 the catalogue row already carries what Blackboard declared (`file.mimeType`) and a bbcswebdav
download often answers `application/octet-stream`. Read the script's per-row JSON lines for the
report; a line with `error` did not land.

Rules that apply to this step and no other:

- **A 409 is not "done".** Something already occupies that key and this step does not know what, so
  it must not point a Blackboard row at bytes it did not write. The script fails such a row
  (`Storage key already occupied`) and emits no SQL for it. Name it in the report; the next sync
  retries it and a human decides whether the object there is the same file.
- Rows with `classified_by = 'stack'` are files **Stack** staged in bb2dash. They have no
  `source_url`, the manifest query excludes them, and they are never touched here.
- Never `insert` a `bb_files` row from this step. `stage_attempts` is the only writer of submission
  catalog rows; this step only fills in bytes on rows it already created.
- Report the count in step 6 as "N submitted file(s) now downloadable", **and name every row you
  could not pull, with the reason** (session expired, 409 on the Storage key, download failed).
  Since migration 054 the transform no longer raises an Inbox `data_gap` for a submission file
  whose bytes have not arrived — it would fire in the same transaction that catalogued it and
  nothing would ever clear it — so this summary line is the only place a stuck submission file is
  reported. Do not skip it when the count is zero: say "all N pulled".

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
- **Course** file bytes are not downloaded here. That is `CADENCE_RUNBOOK.md` step 4 — the same
  script, run without `--bucket`, outside the sync. **Submission** file bytes are different: they
  need the same logged-in tab the crawl used and nothing else can reach them, so step 4b above does
  them while the session is still alive.
