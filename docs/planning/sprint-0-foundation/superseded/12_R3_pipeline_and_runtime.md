# R3. Pipeline and runtime: how data actually gets from Blackboard to a pixel

Date: 2026-09-08. Researcher R3. Scope: the path a fact takes from Blackboard to a GUI element, every
manual or fragile step on that path, and the technical constraints a desktop shell plus a Claude Code
agent layer impose on the app design. R1 covers GUI bindings, R2 covers the data inventory; this
document does not re-derive either.

Everything marked "verified" was read in code, SQL, or a run log in this repo. Everything marked
"inference" is my judgment and should be treated as a hypothesis with a named test.

---

## 1. The pipeline as it exists on 2026-09-08

Seven stages. Only two of them are code. The other five are a person and a language model doing the
same thing carefully each time.

### Stage 0. Stack logs in

Trigger: Stack, by hand, at a keyboard. Runtime: the built-in Claude browser on his Windows machine
(tab `seed`). Credentials: NetID plus Duo, entered by Stack; `NOTES.md` caveat 11 states Claude never
enters credentials. Freshness: the session expires overnight, so this recurs at least daily.
`ingest/CADENCE_RUNBOOK.md` opens by saying the first action of any scheduled task is a login check
that stops with "SESSION EXPIRED" rather than guessing.

This is the hard gate on the entire pipeline. Nothing downstream of it can be automated past it,
because every Blackboard endpoint the crawler uses is authorized by the session cookie
(`ingest/bb_crawler.js` line 28, `fetch(base + u, { credentials: 'include' })`).

### Stage 1. Crawl into `bb_raw`

Trigger: a Claude session calling `bb.runAll({termName: 'Fall 2026'})` in the logged-in tab, after
pasting `installCrawler` from `ingest/bb_crawler.js` in as `window.__bb` (CADENCE_RUNBOOK "Inputs").
Runtime: page context of the Blackboard tab. Credentials held: the Blackboard session cookie
(implicitly, via the browser) and the Supabase publishable key, passed into `installCrawler` as
`anonKey` and used in `post()` (line 90) as both `apikey` and `Authorization: Bearer`.

What it hits, all under `https://blackboard.syracuse.edu`:

| Purpose | Endpoint | Function |
|---|---|---|
| Course list | `/learn/api/v1/users/{userId}/memberships` | `memberships()` line 88 |
| Course detail, teachers, schedule, announcements, grade categories | `/learn/api/v1/courses/{C}` and `/memberships`, `/schedule`, `/announcements`, `/gradebook/categories` | `crawl()` lines 77-81 |
| My grades, all columns | `/learn/api/v1/courses/{C}/gradebook/grades?userId=...` with `expand=lastAttempt,attemptsLeft,submissionStatus,column,...` | `grades()` line 70 |
| Content tree | `/learn/api/v1/courses/{C}/contents/{id}/children?@view=Summary&limit=100`, recursing containers | `walk()` line 61 |
| Full item (body plus embedded files) | `/learn/api/v1/courses/{C}/contents/{id}` | `walk()` line 67, `refreshEmbeds()` line 104 |
| Calendar | `/learn/api/v1/calendars` and `/calendars/calendarItems?since=&until=` | `calendar()` line 89 |

It posts one `bb_raw` row per course plus one for memberships and one for calendar, all under a fresh
`run_id` from `crypto.randomUUID()`. `bb_raw` is insert-only for anon (migration `002_raw_landing.sql`
line 16) and immutable by design.

Verified fragilities in this file, found by reading it line by line:

1. `j()` (line 28) handles a non-2xx by returning `{ __status }`, but a 200 that is not JSON throws.
   A session that expires mid-crawl typically returns an HTML login page, so `r.json()` rejects,
   `crawl()` has no try/catch, and `runAll()` aborts with an exception after some courses have already
   posted. The result is a partial `run_id` in `bb_raw` that looks like a normal run to anything
   reading it later. Nothing marks a run complete.
2. `post()` returns the fetch response and `runAll` records `.status` into a local `log` array
   (lines 93-95) that is returned to the caller and never persisted. A 401 or a policy failure shows up
   only if the operator reads the returned object. There is no server-side record that a run started.
3. `runAll` filters memberships by exact string equality on `termName` (line 92). If Syracuse renames
   the term, `mine` is empty and the run posts memberships and calendar and reports success with zero
   courses.
4. The calendar window is hardcoded to `2026-08-01` through `2027-01-15` (line 91). Term-bound
   constant, must be edited next term.
5. `walk()` has a `guard++ < 1000` iteration cap and `pageAll` gives up past `offset > 5000`
   (lines 33, 62). Silent truncation, no warning.
6. `userId` (`_21025199_1`, see `.env.example`) is passed in by the operator. The grades endpoint needs
   it; a wrong value returns someone else's empty result rather than an error.

Freshness after this stage: `bb_raw` is exactly as fresh as the last time Stack sat down and a Claude
session ran the crawl. Per `DB_PROFILE_2026-09-08.json`, `bb_raw` holds 3 runs per course, latest
2026-09-08T17:29Z.

### Stage 2. `bb_raw` to typed tables

Trigger: a Claude session following `ingest/CADENCE_RUNBOOK.md` step 3. Runtime: SQL issued through
the Supabase MCP `execute_sql`, which authenticates as the project owner and bypasses RLS.
Credentials: whatever the MCP holds; not in the repo.

This is the weakest link and it is worth being blunt about it. There is no transform script. The repo
contains `db/migrations/001..009` and `db/seed/`, and nothing else that touches `bb_raw`.
`PHASE2_FINDINGS.md` says "SQL transforms populate the typed tables" but those statements exist only
in the transcripts of past sessions. `ingest/FILE_HARVEST_SPEC.md` section 4 step 2 cites
`ingest/classify_rules.sql` as the deterministic rule pass; that file is not in `ingest/`. The rule
pass that actually exists is the `classify_bb_file()` function in migration `005_file_corpus.sql`
line 46, which runs once at migration time against the rows present then.

So every one of these is a judgment call re-made by hand each run, per CADENCE_RUNBOOK step 3:
matching new gradebook columns to `assignments.bb_column_id` by title, deciding whether a
`submissionStatus` change should move `assignment_progress.status`, deciding whether a due-date change
on a `confirmed` row is a conflict or an update, parsing announcement prose into assignment rows
("Quiz 2 on Thursday 9/10", validation run 2026-09-08), and re-pointing `bb_item_id` when an
instructor deletes and re-creates an item (IST 352 Project 1A, new content `_13195312_1` and column
`_3607154_1`).

The reconciliation rule itself is prose in four places (`NOTES.md` caveat 6, `DATA_SYNTAX.md`
"Reconciliation rule", `CADENCE_RUNBOOK.md` "Rules carried from the skills", both SKILL.md files) and
is not encoded anywhere. Inference: this is the single highest-value thing to turn into code, because
it is per-class-day work and it sits between Blackboard truth and every freshness-sensitive element in
the GUI.

### Stage 3. File harvest

Trigger: `skills/bb-course-pull/SKILL.md` invoked by Stack or an orchestrating session, after
`bb-course-map`. Runtime: four of them in one procedure, which is why it breaks. Browser page context
for the embed refresh and `bb.downloadAll`; Windows PowerShell for moves; the cloud Linux workspace
for hashing and `ingest/extract_text.py`; SQL through the MCP for the row updates.

The chain, from `bb-course-pull` steps 0 through 4:

1. Re-fetch every content item and deep-scan every string field for `data-bbfile`
   (`bb.embedsDeep`, `bb_crawler.js` line 46). Body-only scanning misses attachments hidden under
   `contentDetail.<asmt>.test.assessment.instructions`. This cost IST 471 all four of its files and
   IST 323 two example decks (`HARVEST_RUN_2026-09-03.md`, `VALIDATION_RUN_2026-09-08.md`).
2. Keep only durable `bbcswebdav/pid-...-rid-N_1/xid-N_1` URLs. A `/sessions/...` URL returns 403 the
   next day (`durableUrl`, line 38).
3. `bb.downloadAll(urls)` fires hidden anchor clicks 1.5 s apart (line 99). Files land in
   `C:\Users\estac\Downloads` under whatever name Blackboard gives them.
4. Claim the landed files. Under concurrency the browser writes `<uuid>.tmp` and never renames, so the
   claim rule is size plus magic bytes plus a text signature (`ingest/AGENT_BRIEF.md` line 45,
   `HARVEST_RUN_2026-09-03.md` lesson 1: size alone misfiled two files). Same-name collisions across
   courses get a `(1)` suffix that has to be reasoned about.
5. PowerShell `Move-Item -Force` into `course context/<relpath>`. The Linux device shell cannot delete
   inside mounted folders, so PowerShell is mandatory for this step.
6. Stage back to the cloud, `sha256sum`, POST to `/storage/v1/object/bb-files/<relpath>` with the
   publishable key and no `x-upsert` (anon is insert-only), run `extract_text.py`, insert
   `bb_file_text`, then update `bb_files` via the MCP and check `v_file_layout.needs_move = 0`.

Failure modes already recorded: 6 orphaned Storage objects that cannot be deleted because anon has no
delete policy (`HARVEST_RUN_2026-09-03.md` final line, `VALIDATION_RUN_2026-09-08.md` observation 3);
Storage keys rejecting `#` and curly quotes; a stale `rid` after an instructor re-upload (2 of 6 in the
IST 352 pilot, `sync_runs` id 3); `bb_files` 45 with `source_url` literally `undefined` (`sync_runs`
id 9). About 22 GEO readings are OIA ebooks with no bytes at all.

### Stage 4. Typed tables

Verified state from `DB_VIEWS_2026-09-08.sql`: courses 7, meetings 11, sessions 145,
grading_schemes 6, grade_components 35, assignments 66, assignment_progress 65, readings 86,
announcements 11, bb_content 139, bb_files 64, bb_file_text 534, course_maps 15, sync_runs 12.
`grading_schemes` has 6 rows for 7 courses; GEO.103.recitation has none.

This is the only layer the GUI should ever read. It is the only layer with a stable shape.

### Stage 5. Views

`v_upcoming`, `v_overdue`, `v_course_corpus`, `v_file_layout`, `v_course_map_latest` exist.
`v_course_grade`, which `gui research context/gui/README.md` binds course cards to, does not exist,
and no grade computation exists anywhere in the repo. Migration 009 rewrote `v_upcoming` to also
exclude `missed`.

One consequence worth naming because it is a view problem rather than a data problem: both
`v_upcoming` and `v_overdue` key on `coalesce(a.due_at::date, a.due_date)`, so an assignment with both
null is in neither. `DB_PROFILE_2026-09-08.json` shows several such rows (GEO.103.recitation quiz and
discussion_post, IST.323 homework, presentation and group_presentation, all with
`with_due_at = 0` and `with_due_date = 0`). Any GUI surface built only on these two views will silently
omit real work. R2 owns the count; the fix is a third view or a nullable-date lane.

### Stage 6. GUI

Trigger: Stack opens the app. Runtime: the desktop shell, section 3. Reads the views and typed tables
over PostgREST. Freshness: exactly the freshness of stage 2, which is exactly the freshness of stage 0.

---

## 2. Freshness sensitivity of GUI features

The design consequence is that some surfaces must show their age and some must not bother.

| Surface | Source | How stale can it be before it lies | Verdict |
|---|---|---|---|
| Submission status on an assignment | `assignments.bb_submission_status`, `assignment_progress.status` | Hours. Stack submits, Blackboard flips to SUBMITTED, the app still says not started | Highly sensitive |
| Grades posted | `assignment_progress.score/graded_at` | Hours to a day. ECN 304 Quiz 1 was posted as an instructor override and only found on the 9/8 pass | Highly sensitive |
| Announcements and the bell badge | `announcements`, `is_read` | Hours. Announcements carry facts nothing else carries: rooms, meeting times, "Quiz 2 on Thursday" | Highly sensitive |
| Due dates and new items | `assignments.due_at` | Hours to a day. IST 352 Project 1A was deleted and re-created with new ids between two runs | Highly sensitive |
| New files | `bb_files` | A day or two. Instructors post the week's deck the morning of class | Sensitive |
| Needs attention / conflicts | `sync_runs.summary` today | Only meaningful next to a last-sync timestamp | Sensitive by construction |
| Sessions and the week rail | `sessions.week_no` | Weeks, but revisions happen: IST 466's schedule doc went Wk2x, Wk2xy, W3 in two weeks | Semi-static |
| Meetings, rooms, staff | `meetings`, `course_staff` | A term | Static |
| Grading schemes and components | `grading_schemes`, `grade_components` | A term. All confirmed as of the 00 brief | Static |
| Materials layout and text | `bb_files`, `bb_file_text` | A term for old files | Static once stored |

Design rule that follows: every freshness-sensitive surface needs the last-sync timestamp in view or
one click away, and needs to degrade honestly when it is old. The Home v2 mockup already has this
("last sync today 09:14" in `13-home-v2.dc.html`). The static surfaces should never show a sync
indicator, because doing so trains Stack to ignore it.

---

## 3. Desktop shell: Tauri v2 versus Electron for this project

### 3.1 Reading the OneDrive mirror and opening files natively

Both work. Electron gives you Node in the main process, so `fs`, `crypto.createHash('sha256')`,
`chokidar` for a watcher, and `shell.openPath()` / `shell.showItemInFolder()` are one-liners against
`C:\Users\estac\OneDrive - Syracuse University\.fall2026\.projects2026\bb2dash\course context\`.
Tauri needs the `fs` and `opener` plugins with a capability scope declared for that path, and a
runtime scope grant if the root is user-chosen. Both handle the spaces and leading dots in that path.

Small edge to Electron on effort, no edge on capability. Note that T-13 (map `bb_files` rows to local
paths, mark downloaded vs missing) is a file-watcher feature, and a watcher over a OneDrive folder
that syncs in the background is easier to reason about with `chokidar` than with the Tauri fs watch
plugin. Inference, not verified.

### 3.2 Hosting the Blackboard session inside the app

This is the interesting question, and the answer is that it is possible in both and should not be
attempted in v1.

Both shells can host a remote-origin webview with a persistent cookie jar. Electron uses a
`persist:` session partition, which the [session docs](https://www.electronjs.org/docs/latest/api/session)
describe as "a persistent session available to all pages in the app with the same partition", so a
login survives restarts. Tauri on Windows runs WebView2 with a per-app user data folder, which
persists cookies the same way.

Injecting the crawler differs. Electron's `webContents.executeJavaScript` returns the promise result
to the main process, so `bb.runAll()` could hand back its log array directly. Tauri's `webview.eval()`
is fire and forget; getting a value back from a remote origin means giving that origin IPC access
through a capability with a `remote.urls` entry, which the
[capabilities docs](https://v2.tauri.app/security/capabilities/) support but explicitly warn about.
Tauri can also inject via `initialization_script` before page load.

Downloads is where a shell would earn its keep. Both can intercept and choose the destination, which
would delete stage 3 steps 3 through 5 outright, along with the uuid.tmp claim heuristic and the
PowerShell move. Electron: `will-download` plus `item.setSavePath()`, with progress and completion
events. Tauri: `WebviewWindowBuilder::on_download`, added by
[commit 29ced5c closing issue 8157](https://github.com/tauri-apps/tauri/issues/8157) and documented on
[docs.rs](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html) with
`DownloadEvent::Requested` (returning false cancels) and `DownloadEvent::Finished`. Electron's API is
richer and better documented; Tauri's is sufficient.

The reason not to build on this in v1 is Duo and Entra. Syracuse routes login through
`microsoftonline` (CADENCE_RUNBOOK's expired-session check names it). Microsoft has been actively
reworking Entra sign-in around WebView2 on Windows, MSAL guidance steers away from embedded webviews,
and there are documented conditional-access failures inside WebView2 where the device identity is not
passed ([WebView2Feedback #550](https://github.com/MicrosoftEdge/WebView2Feedback/issues/550)). I could
not find a definitive statement that a third-party embedded webview is blocked for a Syracuse-style
Entra plus Duo flow, so this is an inference: it may work, it may fail with an unhelpful error, and it
may work today and break when Syracuse tightens a conditional-access policy. If it fails, the app is
still a fine read surface but the whole embedded-crawler design collapses.

Recommendation: architect the app as a read and plan surface over Supabase, and treat the in-app
Blackboard webview as an optional phase B module behind a flag. Test it with a 30-minute spike before
committing anything to it. That also matches decision 2 in the 00 brief, which puts the agent layer
outside the app for v1.

### 3.3 Scheduled jobs and whether the app must be open

Neither shell runs work when the app is closed unless something OS-level starts it: Windows Task
Scheduler, or an autostart entry (Tauri's autostart plugin, Electron's `app.setLoginItemSettings`)
plus a hidden window.

But the shell is not the constraint. The constraint is Duo. Any crawl needs a live Blackboard session,
and a live session needs Stack to push a phone notification. A nightly headless crawl is not
achievable in either shell, and the planned "Claude scheduled task running CADENCE_RUNBOOK" will
report SESSION EXPIRED on most of its firings unless it happens to run while Stack is logged in. The
runbook was written knowing this, which is why its first action is a login check.

The one genuinely credential-free recurring source is the Blackboard Ultra iCal feed, described in
`NOTES.md` "Recurring export path" and `DATA_SYNTAX.md`. Its URL has never been captured
(`PHASE2_FINDINGS.md` still-open item 6; `.env.example` has `BB_ICAL_FEED_URL=` empty). A token URL can
be fetched by a Supabase Edge Function on a pg_cron schedule with no browser and no shell, giving a
daily refresh of every due date across all seven courses. That is the highest-leverage automation
available to this project and it costs one trip to the Blackboard calendar share settings.

Practical scheduling design for v1: the app, when opened, checks the age of the newest `sync_runs` row
and shows a "sync is N hours old, run it" prompt. That is honest, needs no daemon, and is identical in
both shells.

### 3.4 Talking to Supabase

Identical in both. The client is `@supabase/supabase-js` over PostgREST either way, and the key
question is which key, which is section 5. One shell-specific note: the secret key path is worse in
Electron because the main process bundle is inside an asar archive, which is not encryption, but it is
not meaningfully better in Tauri either, since `strings` on a Rust binary finds a literal just as
easily. Neither shell makes a bundled secret key safe.

### 3.5 Local cache and offline

Not worth it in v1. The entire dataset is small: 66 assignments, 145 sessions, 139 content nodes,
64 files, and 534 text units totalling roughly 950,000 characters
(`DB_PROFILE_2026-09-08.json`, `bb_file_text` chars summed). The whole typed layer fits comfortably in
memory and serialises to a JSON snapshot of a few megabytes.

Recommendation: fetch on open, keep an in-memory store, write a JSON snapshot to app data for cold
start and for the case where the laptop is offline. Skip SQLite. Revisit only if full-text search
across `bb_file_text` becomes a feature, and even then prefer Postgres FTS server-side over shipping a
local index. If a local database is later needed, Tauri's
[SQL plugin](https://v2.tauri.app/plugin/sql/) covers SQLite through sqlx with a feature flag, and
Electron would use better-sqlite3, which is a native module and reintroduces a rebuild step this
project does not currently have.

### 3.6 Build and dev loop on Windows with Claude Code

Tauri requires the Rust MSVC toolchain and the Microsoft C++ Build Tools with "Desktop development
with C++" ([prerequisites](https://v2.tauri.app/start/prerequisites/)). That is a multi-gigabyte
install on Stack's machine and a Rust compile in the loop. Electron requires Node, which this project
already has.

This matters more than usual here because of the working agreement in `CLAUDE.md`: anything visual
runs on a local port and waits for Stack's OK. That workflow is a Vite dev server, which both shells
can point at, but Electron's reload is instant and Tauri's rebuilds the Rust side whenever the native
surface changes. It also matters because the existing code is JavaScript. `ingest/bb_crawler.js` is
660 lines of dense browser JS that could be reused verbatim inside an Electron webview via
`executeJavaScript`. Choosing Tauri adds Rust as a second language for the file, process and download
surfaces, and a second place for Claude Code to make mistakes.

### 3.7 Packaging and updates

Tauri produces a small installer because it uses the WebView2 runtime already present on Windows 10
1803 and later and on Windows 11 (verified on the prerequisites page). Electron bundles Chromium and
lands in the region of 80 to 150 MB. Tauri's [updater plugin](https://v2.tauri.app/plugin/updater/)
needs a generated signing keypair and either a static JSON manifest or an endpoint; Electron uses
electron-updater with a similar static provider.

For a single user on one machine, neither matters. Do not build an update pipeline in v1. Stack pulls
the branch and rebuilds, which is already how he works.

### 3.8 Recommendation

Electron for v1.

The reasons, in order of weight. First, everything the app has to do outside the window is Node work:
read a OneDrive mirror, hash files, watch a folder, open a file in its default program, spawn a
terminal running `claude`, and possibly host a Blackboard webview and capture its downloads. Electron
does all of that with no second language. Second, the existing crawler is JavaScript and stays
JavaScript. Third, `executeJavaScript` returning a value is the difference between a clean
crawl-inside-the-app design and a capability-plumbing exercise. Fourth, the dev loop is faster on the
machine where Claude Code actually runs, and Claude Code is more reliable in JS than in Rust plus JS.

The things Electron costs are size, RAM and a slightly worse default security posture, and all three
are close to irrelevant for one user on one machine with a database that already has a permissive
owner policy.

What would flip this to Tauri:

1. The app stays a pure read surface with no embedded webview, no spawned processes and no local file
   writes. Then none of the Electron advantages are exercised and the size and RAM win is free.
2. Stack wants this on a phone or tablet later. Tauri v2 targets iOS and Android; Electron does not.
3. RAM pressure on the laptop turns out to matter with Chrome, Teams and this app open at once.
4. The spike shows Entra or Duo accepts WebView2 (which is literally Edge) but rejects Electron's
   Chromium user agent. That single finding would be decisive for the embedded-login design and would
   outweigh everything above.
5. Stack wants Rust in the project for its own sake, which is a legitimate reason for a personal tool
   and I have no data on his appetite for it.

---

## 4. The agent layer: how the app and Claude Code share state

### 4.1 Who owns which table

The current split (facts in `assignments`, planner state in `assignment_progress`) is right in spirit
and muddled in one place. Proposed ownership, with the muddle called out:

| Owner | Tables |
|---|---|
| Agent writes, app reads | `bb_raw`, `bb_files`, `bb_file_text`, `bb_content`, `course_maps`, `courses`, `course_staff`, `meetings`, `sessions`, `readings`, `assignments`, `grading_schemes`, `grade_components`, `announcements`, `sync_runs` |
| App writes, agent reads and never overwrites | `assignment_progress`, `reading_progress`, plus the new `attention_items` and `agent_requests` in 4.2 |
| Contested today | `announcements.is_read`, and the grade-fact columns inside `assignment_progress` |

The two contested spots, and the fix for each:

`announcements.is_read` is written by the crawler from Blackboard's `readStatus.isRead`
(`bb_crawler.js` line 85) and added by migration `004_bb_identifiers.sql`. The GUI's bell popout has a
"mark all read" action (`gui research context/gui/README.md`, decision 4a). If the app writes that
column, the next sync overwrites it and the unread badge flaps. Fix: keep `is_read` as the read-only
Blackboard mirror and add an app-owned `read_at timestamptz`. The badge counts rows where
`read_at is null`, which means an announcement Stack read inside Blackboard still shows unread in the
app until he clears it there too. That is the honest behaviour for a planner.

`assignment_progress` currently holds both Stack's planner state (status, priority, planned dates,
notes) and Blackboard-reported facts (score, score_max, letter, graded_at, submitted_at, feedback).
The sync writes the second set, which is why `CADENCE_RUNBOOK` step 3 has to say "grades are facts,
planner state is his". Cleaner: move the Blackboard-reported grade facts into their own table, for
example `assignment_grades(assignment_id pk, score, score_max, letter, graded_at, submitted_at,
feedback, bb_submission_status, seen_at, run_id)`, and let `assignment_progress` become one hundred
percent app-owned. Then the ownership rule is a table boundary rather than a column-by-column
convention, and the agent can never clobber planner state by accident. This also gives the GUI an
honest place to show "Blackboard says SUBMITTED but you marked it in progress", which is a genuine
disagreement worth surfacing.

Also needed for T-15: `assignment_progress.effort_override`, which the plan sheet already names as a
new column and which is unambiguously app-owned.

### 4.2 The seam

Recommendation: a Supabase table, not a file queue.

A `docs/agent/` file queue sounds appealing because the agent lives in a repo, but it fails on two
counts here. The app would have to write into a git working tree that `CLAUDE.md` says lives on
branches and only reaches main when Stack asks, and the cloud Claude sessions that have done most of
this work do not share a filesystem with the desktop app reliably. Supabase is the one place both
sides already meet.

Two small tables carry the whole contract.

`agent_requests` is the app-to-agent direction:

```
agent_requests(
  id            bigint identity pk,
  created_at    timestamptz default now(),
  kind          text,        -- 'sync' | 'pull_course' | 'map_course' | 'resolve' | 'freeform'
  scope         text,        -- course id, assignment id, or 'all'
  params        jsonb,
  state         text,        -- 'queued' | 'claimed' | 'done' | 'failed' | 'cancelled'
  claimed_at    timestamptz,
  finished_at   timestamptz,
  sync_run_id   bigint references sync_runs(id),
  result        jsonb
)
```

`attention_items` is the agent-to-app direction for anything that needs a human:

```
attention_items(
  id           bigint identity pk,
  raised_at    timestamptz default now(),
  raised_by    bigint references sync_runs(id),
  kind         text,        -- 'conflict' | 'missing' | 'stack_must_confirm' | 'overdue' | 'deadline'
  course_id    text references courses(id),
  ref          text,        -- assignment id, bb_files id, whatever the item is about
  question     text,
  suggested    jsonb,
  state        text,        -- 'open' | 'resolved' | 'dismissed'
  resolved_at  timestamptz,
  resolution   jsonb
)
```

This matters because the GUI README currently binds needs-attention to "`sync_runs.summary`
conflicts". That will not work as a live surface: `summary` is free-form, every run so far has a
different shape (compare `sync_runs` ids 2, 8 and 12 in `DB_PROFILE_2026-09-08.json`), and there is
nowhere to record that Stack dealt with something. `attention_items` makes the needs-attention row a
query with typed counts, exactly the shape decision 5a asks for, and makes resolving one an app write.

### 4.3 How the app triggers a skill

The app cannot spawn a Claude Code session in v1. What it can do, in descending order of usefulness:

1. Insert an `agent_requests` row. This is durable and survives the app being closed. The scheduled
   Claude task and any interactive session read `where state = 'queued'` as their first step, before
   the login check. This is the primary mechanism.
2. Open a terminal in the repo with the command prefilled. In Electron this is a `child_process.spawn`
   of `wt.exe -d C:\Users\estac\projects\bb2dash cmd /k claude "..."`, or `cmd /c start` as a fallback.
   Stack still presses enter, and Duo still needs him anyway, so a human in the loop here costs
   nothing.
3. Copy the command to the clipboard and show a toast. The fallback when a terminal cannot be
   launched.

The pairing that actually works is 1 plus 2 together: the app writes the request row and opens the
terminal, so whichever way the session starts, the intent is already recorded.

### 4.4 The `sync_runs` contract

`sync_runs` today is `(id, ran_at, source, scope, summary jsonb, notes)` from migration 001 line 257.
It is provenance, written after the fact, with a shape that varies per run. Three additions plus one
envelope make it renderable.

Columns to add: `run_id uuid` (ties the row to the `bb_raw.run_id` of the same crawl),
`status text` (`running | ok | partial | failed`), `started_at`, `finished_at`,
`trigger text` (`manual | scheduled | app_request`), `request_id bigint references agent_requests(id)`.
The important one is `status` with a `running` value written at the start, because that is what makes
a crashed run visible instead of invisible. Today, a run that dies mid-crawl leaves nothing behind at
all.

The `summary` envelope, fixed shape, three arrays:

```json
{
  "counts": {
    "courses": 7, "assignments_inserted": 1, "assignments_updated": 4,
    "announcements_inserted": 3, "files_new": 3, "grades_posted": 2, "text_units": 11
  },
  "changes": [
    {"kind": "grade_posted", "course_id": "ECN.304", "ref": "ECN.304/quiz-01",
     "label": "Quiz 1 graded", "from": null, "to": "9/10"},
    {"kind": "item_recreated", "course_id": "IST.352", "ref": "IST.352/project-1a",
     "label": "instructor deleted and re-created; new column id"}
  ],
  "errors": []
}
```

Anything that needs Stack goes into `attention_items`, not into the envelope, so that it can be
resolved.

That gives the GUI its three answers with three trivial queries. Last sync is
`max(finished_at) where status in ('ok','partial')`. What changed is the newest run's
`summary->'changes'`. What needs Stack is `select kind, count(*) from attention_items where state =
'open' group by kind`. That is the smallest contract I can construct that supports the Home v2
needs-attention row and the sync-and-data-health screen (T-04) without either side guessing.

---

## 5. Auth and security posture for a single-user desktop client

The current state, verified: RLS is on for every typed table with a permissive
`for all to authenticated using (true) with check (true)` policy (migration 001 lines 303-313, and the
same pattern in 002, 003, 005, 006). Anon has insert-only policies on `bb_raw` (002 line 16),
`bb_files` (003 line 22), `bb_file_text` (007) and the `bb-files` storage bucket (003 line 3).
Authenticated has full access to that bucket (003 line 4). The publishable key is
`sb_publishable_DCtdYptOILBVKsKv-aHNAg_ruNCH_fe`, which is committed in `ingest/AGENT_BRIEF.md` line 21
on purpose. Per the current
[Supabase key model](https://supabase.com/docs/guides/api/api-keys), a publishable key resolves to
`anon` when unsigned and `authenticated` when a user is signed in, and only reaches what RLS allows; a
secret key resolves to `service_role` with BYPASSRLS and is blocked from browser user agents.

Three options, judged plainly.

Option A, Supabase Auth with an email login for the one account, session stored in the shell's OS
credential store. The app ships the publishable key, Stack signs in once, the JWT resolves to
`authenticated`, and the existing `*_owner_all` policies already grant exactly what the app needs.
Required RLS changes: none. Storage in Electron is `safeStorage`, which wraps DPAPI on Windows and
binds the ciphertext to the Windows user account; in Tauri it is the stronghold or keyring plugin.
Risk: the refresh token on disk is as good as the database to anyone who is already logged in as Stack
on that machine, which is a threat model that also has his OneDrive and his browser sessions. This is
the right answer, and it has a bonus: an authenticated session can finally delete the 6 orphaned
Storage objects that anon cannot touch.

Option B, keep anon and add a read policy gated on a shared secret, for example a header check against
`current_setting('request.headers')`. Risk: the secret ships in the binary, so the gate is
obfuscation, and the failure mode is the entire database readable by anyone who unpacks the app or
reads the repo. It also adds a policy that has to be maintained across every table. Not acceptable,
and it buys nothing over option A, which is less work.

Option C, a secret key held in a local-only backend (Tauri's Rust side, or Electron's main process).
Risk: it bypasses RLS entirely, so a bug or a compromise is total rather than scoped; it is extractable
from the binary with `strings` regardless of shell; and it is exactly the thing `NOTES.md` caveat 9 and
`CLAUDE.md` both forbid. Not acceptable, single user or not, because the same key can drop tables.

Recommendation: option A, and once it is in place, tighten two things. Drop the anon insert policies
if and when the crawl runs in an authenticated context, since their only reason to exist is that the
browser-side crawler holds nothing better. And before the repo goes public (phase 4 in `NOTES.md`),
recognise that the committed publishable key plus the anon insert policies is a world-writable append
endpoint into `bb_raw`, `bb_files`, `bb_file_text` and the storage bucket. Nobody can read anything
through it, so it is a spam and storage-quota risk rather than a data-leak risk, but it should be a
knowing decision rather than an oversight.

One more note for the shell. If the app ever hosts the Blackboard webview, that webview is a
third-party origin running in the app's process space. Electron must load it with
`nodeIntegration: false`, `contextIsolation: true` and a separate session partition, and must never
put the Supabase client on that origin's window. This is standard practice and worth writing down
before someone takes the shortcut.

---

## 6. Every manual step, ordered by how often it recurs

Recurrence is the ranking because a step that runs every class day and needs judgment is where the
data goes wrong.

### Per class day (or per crawl, currently several times a week)

1. Log into Blackboard with NetID and Duo. Cannot be automated. Everything else waits on it.
   The mitigation is not automation, it is making the app tell Stack when the data is stale enough to
   need a login.
2. Load `installCrawler` into the tab as `window.__bb`. Trivially automatable: bundle the crawler with
   the app or the skill and inject it, rather than pasting it.
3. Run `bb.runAll` and read the returned log array for non-201 statuses. Should become: write a
   `sync_runs` row with `status = 'running'` before the first fetch, wrap each course in try/catch,
   record per-course status, and close the row. Highest priority code change in the crawler.
4. Fold `bb_raw` into the typed tables with hand-written SQL: gradebook column matching,
   `submissionStatus` drift into progress, new columns, re-pointed `bb_item_id` after an instructor
   re-creates an item. This is the number one item on this list. It is per-class-day, it is entirely
   judgment today, it has no script in the repo, and every freshness-sensitive GUI element depends on
   it. It should become an idempotent transform, either SQL functions over `bb_raw` or a Postgres
   function invoked once per `run_id`, with the confirmed/tentative reconciliation rule encoded rather
   than recited.
5. Parse announcements into assignments when the text is explicit. Keep this one agent-owned; it is
   genuine language work. But its output should land in `attention_items` for confirmation rather than
   straight into `assignments`.
6. Decide conflict versus overwrite for each drifted field. Encode the rule, surface the residue.
7. Write the `sync_runs` row by hand with a shape invented on the spot. Fix with the envelope in 4.4.

### Weekly

8. Refresh embeds on every content item and diff against `bb_files`. Code exists
   (`bb.embedsDeep`, `bb.refreshEmbeds`); the diff and the insert or patch decision is manual.
9. Download the batch and claim the landed files out of a shared Downloads folder by size, magic bytes
   and text signature. This entire step disappears if the shell hosts the webview and intercepts
   downloads with a chosen save path. It is the second best automation available after item 4.
10. PowerShell `Move-Item` into the canonical layout, including renaming `(1)` collisions. Disappears
    with item 9.
11. Stage, hash, upload to Storage, extract text, insert `bb_file_text`, update `bb_files`. Mostly
    mechanical; should be one script rather than a sequence of tool calls across three runtimes.
12. Check `v_file_layout.needs_move = 0` and relayout drift. Already a view; needs a job that acts on
    it.
13. Clean up orphaned Storage objects. Currently blocked entirely: anon has no delete policy, so the 6
    orphans from 2026-09-03 are still there. Unblocked by option A auth.

### Per term, or rare

14. `bb-course-map` per course, and confirming grading schemes from syllabi. Correctly manual, done
    once, done.
15. Crawler constants: `termName: 'Fall 2026'`, the `since` and `until` calendar window,
    `BB_USER_ID`. Should move to config read from `.env` rather than call-site arguments.
16. Grade computation. Does not exist at any cadence. `v_course_grade` is referenced by the GUI and is
    not in the database, and the four grading models (rank-weighted exams, drop-lowest quizzes,
    normalize-to-5, qualitative 70/30) all live as declarative rows in `grade_components` waiting for
    an engine. This is per-term work that unblocks a per-week surface.
17. Capture the iCal feed URL. One-time, five minutes, and it is the only path to a genuinely
    unattended daily refresh of due dates.

If only three of these get built before the GUI ships, they should be 4, 3 and 16, in that order:
encode the transform, make runs self-reporting, and compute grades. Items 9 and 10 are the biggest
reduction in operator pain, but they affect materials rather than the numbers on the dashboard.

---

## Open questions for Stack

1. Do you want to try hosting the Blackboard login inside the app at all, or is the crawl staying in
   Claude's browser for good? A 30-minute spike answers whether Duo plus Entra tolerates an embedded
   webview, and the answer changes the shell recommendation and the whole file-harvest design.
2. Can you grab the Blackboard calendar iCal share URL this week? It is the only unattended data
   source available and it costs one visit to the calendar settings gear.
3. Are you willing to create a Supabase Auth user for yourself and sign in inside the app? That is
   option A in section 5, it needs no RLS changes, and every alternative is worse.
4. Is `assignment_progress` allowed to be split, moving Blackboard-reported grade facts out into
   `assignment_grades`? It makes the ownership rule a table boundary instead of a convention, but it
   touches a table you have been treating as yours.
5. When an announcement is marked read inside Blackboard but not in the app, which should the bell
   badge believe? My proposal is the app's own `read_at`, which means you clear it twice.
6. When the repo goes public, do you want the committed publishable key rotated and the anon insert
   policies dropped, or is an append-only public endpoint into `bb_raw` an acceptable risk?
7. How often do you actually want to sync during a class day? The answer changes whether the app
   nags at open, nags on a timer, or stays quiet.
8. Do you want Rust in this project? If yes, that alone is a defensible reason to pick Tauri and I
   would not argue with it.

## Handoff notes

- The transform from `bb_raw` to typed tables does not exist as code anywhere in this repo. Any plan
  that assumes it does is wrong. `ingest/classify_rules.sql`, referenced by
  `ingest/FILE_HARVEST_SPEC.md` section 4, is also absent; the rule pass that exists is
  `classify_bb_file()` in migration 005.
- `v_course_grade` does not exist and no grade math exists. The GUI binds course cards to it. Whoever
  plans the grades screens needs to plan the engine first, over `grade_components.aggregation`,
  `rank_weights`, `drop_lowest` and `normalize_to`.
- Assignments with both `due_at` and `due_date` null appear in neither `v_upcoming` nor `v_overdue`.
  Several exist today. Do not build the planner on those two views alone.
- Binding needs-attention to `sync_runs.summary` will not work. The summary shape varies per run and
  there is no way to record that an item was dealt with. Use `attention_items` from section 4.2.
- The scheduled Claude task cannot crawl unattended, because Duo. Plan the cadence around Stack being
  present, and put the unattended path on the iCal feed instead.
- If the shell hosts the Blackboard webview, `will-download` with an explicit save path deletes the
  uuid.tmp claim heuristic, the shared-Downloads collision rules and the PowerShell move in one move.
  That is the single largest simplification available to the ingest pipeline and it is the only strong
  argument for embedding the login.
- The crawler's failure behaviour is the quiet kind: partial runs look complete, an empty term filter
  looks like success, and post failures are visible only in a return value nobody stores. Fix that
  before trusting any freshness indicator in the GUI.

Sources checked for the shell and auth sections:
[Electron session docs](https://www.electronjs.org/docs/latest/api/session),
[Tauri v2 capabilities](https://v2.tauri.app/security/capabilities/),
[Tauri WebviewWindowBuilder on docs.rs](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html),
[tauri issue 8157, download handler](https://github.com/tauri-apps/tauri/issues/8157),
[Tauri v2 plugin index](https://v2.tauri.app/plugin/),
[Tauri v2 SQL plugin](https://v2.tauri.app/plugin/sql/),
[Tauri v2 updater plugin](https://v2.tauri.app/plugin/updater/),
[Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/),
[Supabase API keys](https://supabase.com/docs/guides/api/api-keys),
[WebView2Feedback issue 550, conditional access in WebView2](https://github.com/MicrosoftEdge/WebView2Feedback/issues/550),
[Entra auth flows moving to WebView2](https://techcommunity.microsoft.com/blog/windows-itpro-blog/now-generally-available-modernizing-microsoft-entra-id-auth-flows-with-webview2-/4476166).
