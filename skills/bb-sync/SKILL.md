---
name: bb-sync
model: sonnet
description: 'Run one Blackboard sync end to end for a queued agent_requests row. Checks the Blackboard session, claims the request, crawls every current-term course with bb.runAll, waits while the scheduled transform folds the crawl into the typed tables, closes the request, and reports what changed and what needs Stack in plain language. Use when Stack pastes claude --model sonnet "/bb-sync <id>" from the app Sync button (the desktop Sync button runs it), or says run a sync / sync Blackboard. Runs on Sonnet; its first step checks the model.'
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

- Stack's logged-in Chrome through Claude in Chrome — the only browser; never open a second
  browser or ask for a separate login. One tab on Blackboard Ultra, with `installCrawler` from
  `ingest/bb_crawler.js` loaded as `window.__bb`. (The built-in Playwright browser is a separate
  profile that is not logged in; Step 1's login check still applies to the Chrome tab.)
- Supabase `bb2dash` (ref `goultdzqcavefcgnifdy`) through the Supabase MCP for every read and write.
- Stack's user id for the crawler: `_21025199_1`. Term: `Fall 2026`.

Post a one-line status after every step. A sync takes minutes; a silent run looks stalled.

## Step −1 — Model check (before anything else)

Syncs run on **Sonnet** (Stack, 2026-09-30). The reliable way onto it is how the session starts:
the desktop Sync button and the web app's copied command both launch
`claude --model sonnet "/bb-sync <id>"`. This skill's frontmatter also says `model: sonnet`, but
Claude Code does **not** apply a skill's `model:` in auto mode (skills reference), which is how
Stack runs it, so the frontmatter cannot be relied on (request 389, 2026-09-30, reached this step on
Opus). Read your own model from your system prompt.

- **A Sonnet model** → say `model: <id> — ok` and go on.
- **Anything else** → relaunch on Sonnet and stop. Do not claim the request, open Blackboard or
  write anything first; the request stays `queued`, so the new session claims it and nothing runs
  twice. Run, from the repo root:

  ```bash
  node scripts/sync-on-sonnet.mjs <id>
  ```

  It opens a new Windows Terminal in the repo running `claude --model sonnet '/bb-sync <id>'`
  (exit 0). Then tell Stack in one line: "This session is on `<model>`; I reopened sync <id> on
  Sonnet in a new terminal — use that window. This one can be closed." Do nothing else here.
  If the script exits non-zero (no Windows Terminal, a bad id), say so and give him the two manual
  ways instead: type `/model sonnet` here and run `/bb-sync <id>` again, or start
  `claude --model sonnet "/bb-sync <id>"` in any terminal.

  **Exception:** if Stack says in this session to go ahead on the current model, continue here
  without relaunching, and name the model in step 6's report.

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

insert into attention_items (kind, ref, question, suggested)
values ('stack_must_confirm', 'chrome-login-required',
        'Blackboard session expired; log in and re-run the sync',
        to_jsonb('claude "/bb-sync <new request id>"'::text))
on conflict do nothing;
```

Then tell Stack in one line: the session expired, log in to Blackboard and press Sync again. The
`on conflict do nothing` is load-bearing — migration 041's unique key means a second expiry while
the first is still open is the same row, not a second one. The ref is this Chrome tab's own: the
container's login item is `sync-login-required`, and the container's login check never closes this
one.

## Step 2 — Claim the request and register the run

```sql
update agent_requests
   set state = 'claimed', claimed_at = now(), claimed_by = 'bb-sync session',
       run_id = gen_random_uuid()
 where id = $1 and state = 'queued'
returning id, kind, scope, run_id;
```

One update does both: it claims the request and registers the crawl's `run_id`. Keep the
`run_id` it returns; step 3 crawls under it. Registration is what authorises the fold: the
scheduled transform folds **only** crawls whose `run_id` sits on an owner-claimed request, and an
unregistered crawl is quarantined, never folded. The same update opens the run's `sync_runs` row
as `running` (trigger `agent_requests_open_sync_run`, migration 135), so Home reads "sync running"
from this moment.

No row back means someone already claimed it or Stack cancelled it: say so and stop rather than
running a second crawl. With no id at all, insert one already claimed and registered, so the run
is still auditable:

```sql
insert into agent_requests (kind, scope, state, claimed_at, claimed_by, run_id)
values ('sync', 'all', 'claimed', now(), 'bb-sync session', gen_random_uuid())
returning id, run_id;
```

Always a fresh run id: never reuse one from an earlier crawl. An id the transform has already
quarantined is refused (SQLSTATE 42501) and the claim does not happen.

## Step 3 — Crawl

In the logged-in tab, with `runId` set to the `run_id` step 2 returned:

```js
const { run_id, log } = await bb.runAll({ termName: 'Fall 2026', runId });
```

One `bb_raw` row per course plus a memberships row and a calendar row, all under the registered
run id; the `run_id` that comes back is the same id (if it is not, stop and report). PASS: 7 course
rows and the calendar row, every POST status 201. The calendar row is posted last, and it is the
only thing that makes the transform fold a registered run (migration 136: no idle timer), so a
crawl that stops part-way is never folded half-done. **Never** interrupt a run part-way and call
it done.

Report the per-course log line by line.

**If the crawl fails.** If `runAll` throws or the tab closes, report it and leave the request `claimed`; 136's terminal rule closes it within 30 minutes and raises the one Inbox item.
Then stop: do not run step 4, 4b or 5, and do not close the request yourself. The terminal rule
closes a request, and raises its Inbox item, only while the request is still `claimed`; a request
this skill closed would leave Stack no Inbox item. Nothing is retried under the same run id either:
the next sync is a new request with a new one. Tell Stack in one line where the crawl stopped and
that the Sync button frees itself within about half an hour.

## Step 4 — Wait for the transform

The run already has its `sync_runs` row: step 2 opened it as `running`. The cron folds it within
two minutes of the calendar row landing. Poll every 30 seconds, up to ten minutes:

```sql
select id, run_id, status, interrupted, started_at, finished_at, summary, open_attention
  from v_sync_status;
```

- `status = 'running'` for this crawl's `run_id`: the fold has not happened yet; keep waiting and
  post a progress line.
- `interrupted` is true for this `run_id`: the terminal rule has already reaped the run, closed the
  request and raised its Inbox item. Tell Stack: "the sync was marked interrupted; nothing was
  folded; press Sync to run it again." Then stop: no step 4b, no step 5.
- `status in ('ok','partial','failed')` for this `run_id` and `interrupted` false: done, go to
  step 4b.
- Ten minutes and the row is still `running`: the tick is not folding. Do not run the transform
  by hand and do not invent one — check `select * from cron.job` and `cron.job_run_details`, and
  that `bb_raw` holds this run's `calendar` row; report what you find, and leave the request
  `claimed`.
- `partial` means some stage failed. Read `sync_stage_runs` for that `sync_run_id` and name the
  failing stage and its `error` in the report. A partial run is still a real result.

## Step 4b — Pull the files (course and submission)

Once the transform has closed, the catalogue names every file Blackboard is showing — course
materials from `stage_files`, Stack's own handed-in work from `stage_attempts` — but not the bytes.
All of them sit behind the same session cookie the crawl used, so this is the one thing only a
logged-in tab can do, and it has to happen before that tab goes away.

Course files used to be pulled outside the sync, by hand, from the cadence runbook. They are not
any more: a sync that catalogues a file and leaves it unopenable is a sync that has to be finished
by a human later, and the Inbox `data_gap` raised in the meantime is a nag about the sync's own
unfinished work. **Everything with no bytes is pulled here, before the sync reports.**

**The embedding key, first.** The pull ends by embedding what it stored, which needs the legacy
anon JWT in `SB_ANON_JWT` (`embed-corpus` has `verify_jwt` on; the `sb_publishable_` key is
refused). A terminal the desktop app opens does not have it set, so load it from the desktop
app's own config, which already holds it, whenever it is missing. In Git Bash, once per run,
before the scripts below:

```bash
export SB_ANON_JWT="${SB_ANON_JWT:-$(node -e "try{process.stdout.write(require(process.env.APPDATA+'/bb2dash/config.json').supabaseAnonKey||'')}catch{}")}"
case "$SB_ANON_JWT" in eyJ*) echo "SB_ANON_JWT: set";; *) echo "SB_ANON_JWT: missing";; esac
```

Never print the value. `missing` means the config has no key: say so in step 6 and let the
pull run anyway (it stores and extracts, and names what it could not embed).

**The manifest.** Save this array to `<scratch>/manifest.json`. `null` back → say "no files to
pull" and go to step 5.

```sql
select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name,
         'relpath', bb_file_relpath(f.id), 'mime', f.mime_type, 'source_url', f.source_url,
         'bucket', f.bucket, 'attempt_id', f.attempt_id) order by f.id)
  from bb_files f
 where f.storage_path is null and f.superseded_by is null
   and f.source_url is not null and not bb_file_is_outside_link(f.source_url);
```

One query, both kinds. `source_url is not null` is what drops the rows Stack staged in bb2dash
himself: they have no Blackboard URL and nothing here ever touches them. `bb_file_is_outside_link`
(migration 161) drops **outside links** — a row whose `source_url` is an outside site (cbo.gov,
sec.gov, …), catalogued with its text and never with bytes: they are not files to pull, and they
never count in `files_not_pulled`. The script's own gate
splits the rest — a run with `--bucket my_submissions` writes only submission rows, a run without
it only course rows — so the two passes below can never write each other's rows.

**Half one — Chrome saves each file; a script collects it.** A `bbcswebdav` URL does not serve
bytes: it redirects to a short-lived signed URL on Blackboard's CDN. Claude in Chrome cannot read a
redirect or fetch across origins (Ultra wraps `fetch`), so let Chrome do what it does for Stack —
save the file to his Downloads folder — and move it from there. **Never copy, retype or paste a
signed `*.content.blackboardcdn.com` URL** (it is a credential, ~2 KB long); nothing below needs it.

Once, before the first row: `mkdir -p <scratch>/downloads`, and park the tab on
`https://blackboard.syracuse.edu/ultra/course` (the "park page"). Then, **one row at a time**:

1. `since=$(node -e "console.log(Date.now())")`.
2. Navigate the tab to `<source_url>?xythos-download=true` (Blackboard answers that flag with an
   attachment, so Chrome saves the file; use `&` if `source_url` already holds a `?`).
3. Read where the tab is with this snippet, which never returns a CDN URL:

   ```js
   (() => { const h = location.hostname, bb = h === 'blackboard.syracuse.edu';
     const text = document.body ? document.body.innerText.slice(0, 3000) : '';
     return JSON.stringify({ host: h, type: document.contentType, path: bb ? location.pathname : null,
       notFound: bb && /not found|no permission|do not have permission/i.test(text) }); })()
   ```

   | Where the tab is | Meaning | Do |
   |---|---|---|
   | still the page it was on (the park page) | Chrome took it as a download | step 4 |
   | `host` ends `.content.blackboardcdn.com` (an inline PDF) | the file is showing, not saved | run the save snippet below, then step 4 |
   | NetID, `login.microsoftonline.com`, or a Blackboard login page | **`session_expired`** | stop step 4b (below) |
   | Blackboard with `notFound`, or a `path` holding `/READ_ONLY/` (another course's copy) | **`gone`** | report the row; next row |
   | anything else | **`refused`** | report the row with the host; next row |

   The save snippet, run on the CDN page, verbatim except the id. It fetches the page's own URL
   (same origin, so it works there) and hands the bytes to Chrome's Downloads as `bb2dash-<id>`.
   The tool does not wait for the promise, so it usually answers `{}` — that is not a failure;
   step 4's collector is the check (verified live 2026-10-01: `{}` back, file saved, collected).
   The tool's own "Tab Context" line prints the CDN URL; never repeat it anywhere.

   ```js
   (async () => {
     const ID = 161;                                  // this row's bb_files id: digits only
     const ext = ({ 'application/pdf': '.pdf' })[document.contentType] || '';
     const r = await fetch(location.href);
     if (!r.ok) return 'fetch failed: ' + r.status;
     const blob = await r.blob();
     const a = document.createElement('a');
     a.href = URL.createObjectURL(blob); a.download = 'bb2dash-' + ID + ext;
     document.body.appendChild(a); a.click(); a.remove();
     setTimeout(() => URL.revokeObjectURL(a.href), 60000);
     return 'saved ' + blob.size + ' bytes';
   })()
   ```

4. Collect it:

   ```
   node ingest/collect_download.mjs --id <id> --name "<file_name>" --since $since \
        --to <scratch>/downloads [--from <Chrome's download folder>] [--timeout 60]
   ```

   `--from` defaults to `%USERPROFILE%\Downloads`; pass it if Stack's Chrome saves elsewhere. It
   waits for a finished file saved since `$since` whose name is the row's (exact, Chrome's ` (n)`
   copy, Chrome's `_` for `:?*"<>|`, or the snippet's `bb2dash-<id>`), and **moves** it to
   `<scratch>/downloads/<id>_<name>`. Exit 0 → collected. Exit 2 (`no download`) → report the row
   with the `saved_since` names it printed: a file there under a different name is this row's bytes
   saved under Blackboard's name, left in Stack's Downloads — name it so he can delete it. If Chrome showed a "Save as" dialog or a "download multiple files" prompt, tell Stack, since only
   he can answer it. Exit 3 (more than one candidate) → nothing was moved; report the row and the
   names it printed. Exit 4 → that destination already holds a file; report it.
5. Navigate back to the park page before the next row.

**`session_expired`** means the session died mid-sync: stop step 4b, run what was already
collected through Half two, report the rest, and leave them alone — `storage_path` is still null,
so the next sync picks them up. Never log in for Stack. **`gone`** means the file is no longer
where the catalogue says: leave the row and report it; a human marks it `superseded_by` its
replacement. **`refused`** is reported and pulls nothing.

Do **not** use Playwright's `download` event or the built-in browser. The Playwright hop walk
(`pull_files.mjs --fetch` with `hops` from `fetch_signed.mjs`'s `resolveSignedUrl`) still works and
stays as a fallback **only** for a caller that has a Playwright-style request API with
`maxRedirects: 0` and a logged-in context — never this skill's Chrome tab.

**Half two — the script.** `--dry-run` first to see the keys, then the two passes and the check:

```
node ingest/pull_files.mjs --manifest <scratch>/manifest.json --downloads <scratch>/downloads \
     --out <scratch>/4b-course.sql
node ingest/pull_files.mjs --manifest <scratch>/manifest.json --downloads <scratch>/downloads \
     --bucket my_submissions --out <scratch>/4b-subs.sql
node ingest/embed_corpus.mjs --check
```

Without `--fetch` the script takes each row's bytes from `<scratch>/downloads/<id>_*` (a row
with nothing there reports `no download`). It checks size and magic bytes, mirrors to
`course context/<relpath>`, POSTs to Storage `bb-files/<key>` with the publishable key in
`SB_ANON_KEY` (never the service key, no `x-upsert`), extracts the text into `bb_file_text`, and
writes one `update bb_files …` per file to `--out`. Having posted new text it finishes by running
the embed loop itself, so what it stored is searchable when it returns; that needs the legacy anon
JWT in `SB_ANON_JWT`, and without it the run says so and leaves `ingest/embed_corpus.mjs` to you.
The key is `bb_file_relpath(id)`, which since migration 052 carries an `attempt-<digits>/` segment
for a submission, so it can never land on the key of a file Stack staged under the same name.

Then run each `.sql` through `execute_sql` — the script never writes `bb_files` itself. A
submission's update sets `mime_type = coalesce(mime_type, <observed>)`, not the observed type:
since migration 085 the catalogue row already carries what Blackboard declared (`file.mimeType`)
and a bbcswebdav download often answers `application/octet-stream`. Read the script's per-row JSON
lines for the report; a line with `error` did not land. A line with `textKept: true` landed: the file already had text units (an agent extracted them from the same file earlier, as with 163), so those were kept and only the bytes were stored.

**Stale bytes (`--restale`).** When an instructor re-uploads a file under the same item, the
transform keeps the row and appends `; stored bytes may be stale` to its notes. Re-pull those rows
in the same tab, before the embed check. Their manifest is its own query:

```sql
select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name,
         'relpath', bb_file_relpath(f.id), 'mime', f.mime_type, 'source_url', f.source_url,
         'bucket', f.bucket, 'storage_path', f.storage_path, 'sha256', f.sha256,
         'stale', true) order by f.id)
  from bb_files f
 where f.superseded_by is null and f.storage_path is not null
   and f.notes like '%stored bytes may be stale%'
   and not bb_file_is_outside_link(f.source_url);
```

Run Half one for these rows exactly as above, with `--to <scratch>/restale` on the collector
(`mkdir -p` it first), then:

```
node ingest/pull_files.mjs --manifest <scratch>/restale.json --downloads <scratch>/restale \
     --restale --out <scratch>/4b-restale.sql
# run <scratch>/4b-restale.sql through execute_sql
node ingest/pull_files.mjs --restale-post --downloads <scratch>/restale
```

Unchanged bytes only clear the note. Changed bytes get a **new** Storage key (a `restale-<sha12>/`
segment; the old object is never overwritten), and the `.sql` holds one `begin; … commit;` per row
that deletes the row's old text units and points it at the new key, guarded on the old sha. That
file carries only ids, keys and hashes, never document text: the new units wait on local disk
and `--restale-post` posts them over PostgREST, then embeds them. A `--restale-post` line saying
"owner SQL not run yet" means the `.sql` was skipped; run it and re-run `--restale-post`.
Each transaction first checks `storage.objects` for the new key (md5 eTag and size of the fetched
bytes) and aborts if they differ, so a re-run after a stopped run resumes a key it already filled
instead of refusing it. A `.sql` from an earlier run is never overwritten: the script writes
`<name>.<stamp>.sql` beside it and prints which. A row reported `not restaled … orphaned` has an
object at its new key and no SQL; the next run resumes it, or a human removes that object. Count the
re-pulled rows in `files_pulled` and any row with an `error` in `files_not_pulled`.

`node ingest/embed_corpus.mjs --check` prints `missing_parts_before=<n>` and exits non-zero when
anything is unembedded. Report that number.

Rules that apply to this step and no other:

- **A 409 is not "done" for a submission.** Something already occupies that key and this step does
  not know what, so it must not point a Blackboard row at bytes it did not write. The script fails
  such a row (`key already occupied`) and emits no SQL for it. Name it in the report; the
  next sync retries it and a human decides whether the object there is the same file. A course
  key is derived from the catalogue, so a duplicate there is this same file and is accepted —
  unless the key was sanitised (a character Storage refuses, such as `#`, `’` or `é`, became `_`):
  another name may map to that key, so the row fails the same way and the reason names both spellings.
- Rows with `classified_by = 'stack'` are files **Stack** staged in bb2dash. They have no
  `source_url`, the manifest query excludes them, and they are never touched here.
- Never `insert` a `bb_files` row from this step. `stage_files` and `stage_attempts` are the only
  writers of catalog rows; this step only fills in bytes on rows they already created.
- Report the counts in step 6, **and name every row you could not pull, with the reason** (session
  expired, gone from Blackboard, refused, no download, more than one candidate, 409 on the Storage
  key). Since migration 054 the
  transform raises no Inbox `data_gap` for a submission file whose bytes have not arrived, so this
  summary is the only place a stuck submission is reported. Do not skip it when the count is zero:
  say "all N pulled".

## Step 5 — Close the request

```sql
update agent_requests
   set state = case when $status = 'failed' then 'failed' else 'done' end,
       finished_at = now(), sync_run_id = $sync_run_id,
       result = jsonb_build_object('run_id', $run_id, 'status', $status,
                                   'files_pulled', $files_pulled,
                                   'files_not_pulled', $files_not_pulled)
 where id = $1 and state = 'claimed';
```

`and state = 'claimed'` keeps this from overwriting a request the terminal rule already closed. If
the update touches 0 rows, say so in the report: the request was no longer `claimed`.

`files_pulled` and `files_not_pulled` are step 4b's two counts, written even when both are zero.
They are what makes "the sync left nothing unopenable" a fact someone can read back later instead
of a claim in a chat message.

Never leave a request `claimed`: a stale claim holds the tick's quarantine grace window open
(migration 039) for up to 30 minutes and delays the bookkeeping of any other crawl.

## Step 6 — Report to Stack, in plain language

Read `summary->'changes'` and `summary->>'attention_raised'` from the run, and the open counts from
`v_sync_status`. Then say, in his words rather than the schema's:

- What changed: every line of `summary.changes`, as written ("IST.323 Quiz 2 due date moved 9/2 to
  9/9", "ECN.304 added 1 announcement", "3 new files catalogued").
- What needs him: the typed counts, and the one-line question for anything new, with the reminder
  that the Inbox at `/inbox` is where they get answered.
- **The files:** how many were pulled, and **every row that was not, named, with the reason**.
  Never a bare total that hides a failure. Add `missing_parts_before` from
  `ingest/embed_corpus.mjs --check`, so "searchable" is something he can check rather than take on
  trust.
- What failed, if anything: the stage, the error, and whether a re-run would help.

Grades and due dates are facts from Blackboard. Planner state — `assignment_progress`,
`reading_progress` — is Stack's, and a sync never touches it. Say nothing that is not in the run.

## Rules carried from the phase

- Never write typed tables by hand from this skill. `run_transform` is the only writer of facts from
  `bb_raw`, and doing it twice is how the repo and prod drifted once already.
- Never resolve an `attention_items` row on Stack's behalf. Raising one is the agent's job; answering
  is his, in the Inbox.
- Durable URLs only, deep-scan every item — the crawler already does both; do not hand-edit payloads.
- **Every file the sync catalogues is pulled before the sync reports** — course materials and
  Stack's submissions alike, in step 4b, while the session is still alive. `CADENCE_RUNBOOK.md`
  step 4 is no longer a separate manual pass; it points here. Re-pulling a file whose stored bytes
  Blackboard has since replaced is not part of a sync and is still Phase 18's.
