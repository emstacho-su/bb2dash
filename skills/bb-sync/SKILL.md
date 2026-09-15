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
crawl is to watch `v_sync_status` until that has happened, then report.

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
- File bytes are not downloaded here. That is `CADENCE_RUNBOOK.md` step 4, and it stays manual until
  Electron.
