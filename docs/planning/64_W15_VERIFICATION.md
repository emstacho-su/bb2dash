# W-15 verification — Phase 9 database + scheduler

Date: 2026-09-10 (UTC 2026-09-11). Worker: W-15, branch `feat/sync-loop-db`, worktree
`bb2dash-wt-sl-db`. Brief: `docs/planning/62_PHASE9_sync_loop.md` §Workers W-15, plus three
mid-phase PM corrections (course resolution, view security, `bb_raw` authorisation) and W-16's
frozen resolution shapes.

Everything below was run against prod (`goultdzqcavefcgnifdy`). Numbers are what the database
returned, not what the brief expected; where the two differ the difference is called out.

---

## 1. Migrations applied

| File | Applied as | What it does |
|---|---|---|
| `030_bucket_private.sql` | `030_bucket_private` | `bb-files` Storage bucket → `public = false` |
| `031_attention_items.sql` | `031_attention_items` | the Inbox queue + `resolution_note` / `applied_at` + course-map seeds |
| `032_agent_requests.sql` | `032_agent_requests` | durable app→agent queue, kinds `sync` / `transform` |
| `033_announcements_columns.sql` | `033_announcements_columns` | `author`, `read_at`, `modified_at` |
| `034_transform_stages.sql` | `034_transform_stages` | `stage_courses/assignments/announcements/files/gaps` + helpers |
| `035_transform_driver.sql` | `035_transform_driver` | `run_transform`, `transform_tick`, `ical_poll`, `app_settings`, `v_sync_status`, pg_cron |
| `036_views_security_invoker.sql` | `036_views_security_invoker` | 11 pre-existing views → `security_invoker`, revoked from `anon` |
| `037_stage_files_replay_guard.sql` | `037_stage_files_replay_guard` | only the newest crawl may mark a file missing, + correction of what the bug wrote |
| `038_advisor_fixes.sql` | `038_advisor_fixes` | transform functions off the REST surface; RLS init-plan on this phase's three tables |
| `039_tick_quarantine_grace.sql` | `039_tick_quarantine_grace` | no quarantine while the owner has a sync in flight; oldest-first folding |

Repo files are byte-identical to what was applied. Migrations 001–029 were not touched.
036–039 are additions to the brief: 036 and the `bb_raw` authorisation work in 035 came from the
PM mid-phase; 037 and 039 are bugs this phase's own verification exposed, fixed in range.

---

## 2. Migration 030 — the bucket is private

Before (2026-09-10, unauthenticated `curl`, no headers):

```
GET /storage/v1/object/public/bb-files/IST.352/lecture_slides/Introduction to SA&D - Part 1.1.pptx
→ HTTP 200   (the file downloads)
```

After:

```
GET  …/object/public/bb-files/IST.352/…Part 1.1.pptx  → HTTP 400
body: {"statusCode":"404","error":"Bucket not found","message":"Bucket not found","code":"NoSuchBucket"}
GET  …/object/bb-files/IST.352/…Part 1.1.pptx          → HTTP 400   (no token)
```

`select public from storage.buckets where id = 'bb-files'` → `false`.

**Not verified here:** that Materials "Open" still works. Minting a signed URL needs the owner's
JWT, which this session does not hold. Signed URLs are issued by the Storage API and do not
depend on bucket publicity, and `web/src/lib/queries.materials.ts:136` already uses
`createSignedUrl`, so no change is expected — but it is a live check for the PM at integration.

---

## 3. Migration 031 — `attention_items` and the seeds

Seeded idempotently from `v_course_map_latest`:

| Source | Rows | Brief expected |
|---|---|---|
| `course_fields` with `stack_must_confirm = true` **and** a null value | **17** | ~17 ✓ |
| `gaps` with `owner = 'stack'` | **28** | ~44 ✗ — 28 is the real count (49 gap entries exist in total; 28 carry `owner = 'stack'`) |
| total | **45** across 7 courses | |

Per course: ECN.304 1, GEO.103.lecture 5, GEO.103.recitation 3, IST.323 9, IST.352 4, IST.466 8,
IST.471 15.

Both groups are raised as `kind = 'stack_must_confirm'`, not `data_gap`: the Inbox gives
`stack_must_confirm` a text/date input and `data_gap` only a Dismiss button, and every one of
these is a question only Stack can answer.

Re-running both seed inserts adds **0** rows.

**Deviation:** D2's `unique (kind, coalesce(course_id,''), …)` cannot be a table constraint —
Postgres constraints take no expressions — so it is a unique index over the same expression list
(`attention_items_dedupe_idx`), targeted by `ON CONFLICT`. Same semantics.

**Known limitation, for a later phase:** `state` is part of the dedupe key, so a conflict that is
raised → resolved → recurs → resolved again would collide on the second resolve. It cannot happen
until a resolved conflict recurs, and the fix (a `resolved_at`-bearing key, or archiving) is a
schema change nobody asked for this phase.

---

## 4. The two transform runs

`run_transform` was called by hand for the latest crawl first, then the 2026-09-02 crawl, as the
brief asks.

### Run 16 — `6b122650-49f3-4a70-a801-c177fbf27f1a` (2026-09-08), status **ok**

| Stage | Status | Counts |
|---|---|---|
| courses | ok | seen 7, unresolved 0, updated 0, staff inserted/linked/updated 0, schedule entries 0, meetings written 0 |
| content | ok | *(Phase 8's `stage_content`)* items 142, updated 137, inserted 0, missing 0, title fallbacks 10, duplicate paths 5 |
| assignments | ok | columns seen 37, skipped 2, ambiguous 1, inserted 7, conflicts 6, out-of-term dates 6, mirror updates 24, filled 0, overwritten 0 |
| announcements | ok | seen 11, inserted 0, updated 11, authors captured 0 |
| files | ok | refs 61, matched by url 57, inserted 0, url updated 0, name notes 4, session-scoped skipped 4, marked missing 1, protected untouched 2 |
| gaps | ok | courses without scheme 1, assignments without date 15, readings without date 10, files without bytes 0 |

`attention_raised` (genuinely new rows): **46**.

Activity lines written to `summary.changes`:

```
7 new gradebook column(s) added as tentative assignments
6 disagreement(s) with Blackboard left for you to settle
6 Blackboard due date(s) fall outside the term and were not applied
11 announcement(s) changed
1 file(s) are no longer in Blackboard
4 file(s) had no durable link and were skipped
26 gap(s) added to the Inbox
```

### Run 17 — `3e12fd89-1ac8-4ab1-bd2a-0dce984a90fc` (2026-09-02), status **ok**

| Stage | Status | Counts |
|---|---|---|
| courses | ok | seen 7, staff inserted 1, staff linked 2, staff conflicts 2, schedule entries 0 |
| content | ok | items 144, updated 139, inserted 0, title fallbacks 11 |
| assignments | ok | columns seen 36, skipped 2, ambiguous 1, repointed 1, inserted 0, conflicts 7, out-of-term 6, mirror updates 4 |
| announcements | ok | seen 8, inserted 0, updated 1 |
| files | ok | refs 25, matched by url 25, inserted 0, **marked missing 0** (corrected by 037; see §8) |
| gaps | ok | all four counts 0 |

`attention_raised`: **2** — the two staff-name conflicts, which only the 9/2 payload could raise
because the 9/8 crawler build sends no `teachers` array at all.

### No duplicates on the second run

This is the point of the exercise. The 9/2 run re-derives the same 7 assignment conflicts, the
same ambiguous column and the same 26 gaps, and adds **zero** rows for any of them:

* `assignments` stage: `conflicts 7`, `attention_raised 0`
* `gaps` stage: `attention_raised 0` (all four sub-counts 0)
* `files` stage: `attention_raised 0`

Only the two genuinely new staff conflicts were added. `attention_items` totals across both runs
plus the seeds: **93** rows — conflict 11, data_gap 14, missing 16, stack_must_confirm 52 — all
`state = 'open'`.

### `ultraDocumentBody` rows

`select count(*) from bb_content where title = 'ultraDocumentBody'` → **0**, out of 139 rows, with
11 rows carrying the "… (document)" / "Untitled document" fallback. Phase 8's `stage_content` did
that; the driver called it and wrapped its counts in a `content` stage row for both runs.

---

## 5. Conflicts, with from → to

All 11 open conflicts (truncated questions):

| course | ref | field | from | to |
|---|---|---|---|---|
| ECN.304 | `ECN.304/quiz-01` | due_at | 2026-09-01T19:30Z | 2026-09-03T21:16:59Z |
| ECN.304 | `staff:_34252_1` | name | Chung-Chin Eugene Liu | Chung-Chin Liu |
| GEO.103.lecture | `staff:_46233_1` | name | Bob Wilson | Robert Wilson |
| IST.323 | `column:_3569973_1` | bb_column_id | IST.323/fp-log-final, IST.323/fp-proposal | Final Project - Proposal and Appendices |
| IST.323 | `IST.323/presentation-choice` | points_possible | 0.00 | 100 |
| IST.466 | `IST.466/ethics-team-2-practice` | due_at | 2026-09-08 | 2021-05-28T15:01Z |
| IST.466 | `IST.466/ethics-vs-activity` | due_at | 2026-09-01 | 2022-09-08T09:00Z |
| IST.466 | `IST.466/ethics-team-2-presentation` | due_at | 2026-09-24 | 2022-09-20T15:06Z |
| IST.466 | `IST.466/major-project-1-synchrony` | due_at | 2026-10-20 | 2022-10-14T03:59Z |
| IST.466 | `IST.466/attendance` | due_at | *(null)* | 2021-11-18T12:30Z |
| IST.466 | `IST.466/class-participation` | due_at | *(null)* | 2021-11-18T12:00Z |

Six of these are the **out-of-term guard**. IST.466's shell still carries gradebook columns due in
2021 and 2022. The contract says a tentative row may be overwritten — which would have put
`IST.466/major-project-1-synchrony` on the tracker with a 2022 date. A due date outside
`[term start − 14d, term end + 31d]` is now never written whatever the row's confidence; it raises
a conflict and leaves the row alone. Without that guard, one planner row would have been corrupted
silently.

The **ambiguous column** case is also real data: gradebook column `_3569973_1` is stored on two
different IST.323 assignments (`fp-log-final` and `fp-proposal`). The stage refuses to guess which
one Blackboard means, writes nothing, and asks.

### The 7 new assignments (all `source = 'blackboard'`, `confidence = 'tentative'`)

`ECN.304/attendance`, `GEO.103.lecture/absences`, `GEO.103.recitation/attendance`,
`IST.323/participation`, `IST.466/attendance`, `IST.466/attendance-35625001`,
`IST.466/class-participation`. Each raised a `stack_must_confirm` naming the guessed type and
points. IST.466 has two distinct columns both named "Attendance", so the second id carries the
column-id suffix — deterministic, so a re-run matches by `bb_column_id` and inserts nothing.

Two columns were **skipped** as Blackboard's own computed columns, not deliverables:
IST.323 "Total Score" (`isCalc = true`) and "Final Letter Grade".

---

## 6. A resolution applied end-to-end

Run in a transaction and rolled back, so Stack's Inbox is exactly as the transform left it.
Three answers in the three shapes W-16 sends:

| item | resolution | result |
|---|---|---|
| conflict `IST.323/presentation-choice` / `points_possible` | `{"accept":"blackboard"}` | `points_possible` 0.00 → **100.00**, `confidence` → **confirmed**, `applied_at` set |
| missing `IST.323/sitn-group-presentation` / `due_at` | `{"value":"2026-10-15","value_type":"date"}` | `due_date` → **2026-10-15**, `confidence` → **confirmed**, `applied_at` set |
| stack_must_confirm `course_field:sitn_group` | `{"value":"Packet A group 3","value_type":"text"}` | nothing to write to, `applied_at` stamped so the chip clears; the answer stays in `resolution` + `resolution_note` |

Stage counts for that pass: `resolutions_applied_blackboard 1`, `resolutions_applied_value 1`,
`resolutions_noted_only 1`, `resolutions_unapplied 0`. Resolved rows with `applied_at` set: 3;
still unapplied: 0. The `points_possible` conflict was **not** re-raised afterwards — the values
now agree.

A `date` answer on a `due_at` field is written to `due_date`, not `due_at`: a day is not a moment,
and inventing a clock time would be a fabricated fact.

---

## 7. Scheduler

### Cron jobs

```
jobid jobname                  schedule      command                        username  active database
1     bb2dash-transform-tick   */2 * * * *   select public.transform_tick()  postgres  t      postgres
2     bb2dash-ical-poll        17 6 * * *    select public.ical_poll()       postgres  t      postgres
```

`pg_cron` was not installed before migration 035 and is installed by it. **Both jobs run as
`postgres`**, the role `apply_migration` runs as, which also owns every function they call — so
the `security definer` bodies execute with exactly the privileges they were written for.
`cron.job_run_details` shows the tick succeeding on schedule (runids 1–3 at 00:14, 00:16, 00:18).

### Reaper

```sql
insert into sync_runs (…, status, started_at, …) values (…, 'running', now() - interval '45 minutes', …);
select transform_tick();
```
→ `{"folded":0,"reaped":1,…}`; the row became `status = 'failed'`, `finished_at` set,
`notes = 'reaper test row | interrupted (reaped)'`. Rolled back.

### iCal

`app_settings.ical_url` is blank, so `ical_poll()` writes one `sync_stage_runs` row
`stage = 'ical', status = 'skipped', counts = {"reason":"app_settings.ical_url is blank"}` and
does nothing else, exactly as the contract says. When a URL is set the poll is **two-phase**,
because `pg_net` is asynchronous: one call collects the previous request's body into
`bb_raw(kind = 'ical')` and then issues the next. At a daily cadence the answer is always waiting.
`app_settings` carries `ical_request_id` / `ical_requested_at` / `ical_last_status` /
`ical_last_error` for that handshake. Parsing the body stays a later phase.

### `v_sync_status`

One row, columns as W-16 asked: `id, run_id, status, started_at, finished_at, trigger, summary,
open_attention, freshness`.

```
open_attention: {"missing":16,"conflict":11,"data_gap":14,"stack_must_confirm":52}
freshness:      7 entries — announcements, assignments, content, courses, crawl, files, gaps
```

iCal polls and quarantined crawls are excluded from "latest run" so Home cannot report either as a
sync; both still appear in `freshness` (the `crawl` row shows `last_attempt_failed = true`, which
is the quarantine of run `87440f01` — see §9).

---

## 8. The bug this verification found (migration 037)

Folding the 9/2 crawl **after** the 9/8 one inverted `stage_files`' missing test. The 9/2 crawler
build reports only attached files (25 refs) against the 9/8 build's 61, so 22 files that had been
seen minutes earlier were stamped `missing_since_run=3e12fd89…`.

Nothing was deleted and no fact was overwritten — the damage was 22 wrong notes and one wrong
Activity line — and both are corrected in 037 rather than left:

* `stage_files` now runs the missing pass only when the run is the newest folded so far, and
  reports `missing_skipped_older_run` when it declines. Predicate checked on both runs:
  `6b122650 = true`, `3e12fd89 = false`.
* The 22 notes are stripped by exact-substring removal; every other note on those rows is
  byte-identical to before. One legitimate marker remains, set by the 9/8 run.
* Run 17's `files` stage counts now carry `marked_missing 0`, `missing_skipped_older_run true`,
  `corrected_by 'migration 037'`, its `summary.changes` no longer claims 22 files went missing,
  and its `notes` record the correction.

---

## 9. Security

### `bb_raw` is not an authorisation (PM finding, migration 035 + 039)

`bb_raw` carries an anon INSERT policy with `with check (true)` — it must, because the crawler runs
in a browser holding only the publishable key — and `run_id` is a uuid the browser picks. So
"a complete run exists in `bb_raw`" proves nothing. The driver therefore folds only runs a
**registered** `agent_requests` row of kind `sync` names:

* `transform_tick()` iterates registered requests, never `bb_raw`.
* `run_transform()` raises otherwise, so a manual call cannot bypass it.
* an unregistered complete crawl is quarantined once — `sync_runs` row with
  `scope = 'unregistered'` plus `sync_stage_runs stage='crawl', status='skipped',
  error='unregistered run'` — and ignored forever.
* `bb_raw` gained `unique (run_id, kind, coalesce(bb_course_id,''))`, checked clean against all 24
  existing rows first, so a second course payload for one shell in one run is refused rather than
  winning by insertion order.

**Live proof, unprompted:** run `87440f01-…` (the superseded 17:27 duplicate of the 17:29 crawl on
9/8) was deliberately left unregistered. The cron quarantined it on its own: `sync_runs` id 18,
`status = 'failed'`, `scope = 'unregistered'`, with a `crawl / skipped / unregistered run` stage row.

**Injected proof.** As `anon`, two `bb_raw` rows under a random uuid against a guessable shell
(`_571529_1`), carrying a content item "Pay me", a gradebook column "Send bitcoin" worth 100 points
due 2026-10-01, and an announcement "Wire transfer required". Then `transform_tick()`:

```
{"folded":0,"quarantined":1,"reaped":0,"requests_done":0,"requests_failed":0}
bb_content delta 0   announcements delta 0   assignments delta 0
bb_files   delta 0   attention_items delta 0
sync_runs row: failed / unregistered
stage row:     crawl / skipped / unregistered run
```

And by hand: `select run_transform('aaaaaaaa-…','manual')` →
`run aaaaaaaa-… is not registered by an owner-authenticated sync request; refusing to fold it`.
Rolled back, so no residue in prod.

### Views were bypassing RLS (PM finding, migration 036)

A Postgres view runs as its **owner** unless created with `security_invoker`, and Supabase grants
`anon` SELECT on new relations in `public`. Migration 020 scoped every table to the owner and left
the views wide open. Measured as `anon` **before** 036, and after:

| view | anon before | anon after | owner after |
|---|---|---|---|
| `v_work_items` | 159 | denied | 159 |
| `v_assignment_effort` | 73 | denied | — |
| `v_file_layout` | 64 | denied | 64 |
| `v_bb_files_current` | 60 | denied | 60 |
| `v_upcoming` | 38 | denied | 38 |
| `v_course_corpus` | 26 | denied | — |
| `v_overdue` | 8 | denied | — |
| `v_course_map_latest` | 7 | denied | — |
| `v_course_points_median` | 7 | denied | — |
| `v_embedding_status` | 7 | denied | — |
| `v_data_freshness` | 6 | denied | 7 |

Eleven views switched to `security_invoker = true` and revoked from `anon`; no view body, column
list or dependency was touched. Already-invoker and left alone: `v_course_stream`,
`v_content_tree`, `v_course_display` (W-12's) and `v_sync_status` (mine). **All 15 public views are
now `security_invoker = true` with `anon` denied**, and 036 ends with a guard block that refuses
the migration if any public view is still owner-run, so the hole cannot quietly reopen.

Retrieval is unaffected: `search_file_text`, `match_file_text` and `hybrid_search_file_text`
reference no view (checked with `pg_get_functiondef` on each), so the `search` edge function and
the MCP server are untouched. The five anon INSERT policies are untouched.

### RLS on every new object

Owner = `fd0b7c9d-9153-4b25-afa7-09f1c3b69a8f` (`emstacho@syr.edu`), resolved by
`public.app_owner()`.

| relation | owner uid | another authenticated uid | anon |
|---|---|---|---|
| `attention_items` | 93 | 0 | 0 (no policy) |
| `agent_requests` | 2 | 0 | 0 (no policy) |
| `app_settings` | 1 | 0 | 0 (no policy) |
| `v_sync_status` | 1 | 0 | denied |
| every view in the table above | full | 0 | denied |

Owner-path smoke test as `authenticated`: inserting an `agent_requests` row (the Sync button) and
resolving an `attention_items` row (the Inbox) both succeed, and `v_sync_status` returns its row.

### Advisors

Run after every migration. **Security** — three findings, none introduced by this phase:

* `function_search_path_mutable` × 7 — all pre-existing (`set_updated_at`, `classify_bb_file`,
  `bb_file_relpath`, `suggested_start`, and the three search RPCs). Every function this phase adds
  carries an explicit `set search_path = public, pg_temp`.
* `authenticated_security_definer_function_executable` × 1 — `public.app_owner()` only. It was
  10 before migration 038: 034/035 had granted the nine transform functions to `authenticated`,
  which put each on the REST surface as `/rest/v1/rpc/<name>` with postgres's reach behind it. 038
  revokes them back to `service_role`; nothing needs a browser caller, because the app's path to a
  transform is an `agent_requests` row. `app_owner` stays granted on purpose — `authenticated`
  must call it for RLS evaluation and it only returns the owner's own uid (DECISIONS, 2026-09-10).
* `auth_leaked_password_protection` — a dashboard setting for Stack, unrelated.

**Performance:**

* `auth_rls_initplan` — 24 → **21** after 038. The three this phase added
  (`attention_items`, `agent_requests`, `app_settings`) now wrap their calls in scalar subqueries.
  **For the PM:** the remaining 21 are migration 020's policies, all with the same per-row
  `auth.uid() = public.app_owner()` pattern. Fixing them is one `drop policy` / `create policy`
  pair per table with an identical predicate, but it rewrites tables outside this phase's range
  while another worker is in the tree, so it belongs in its own change.
* `unindexed_foreign_keys` × 14 — **all pre-existing** (001–019). Both tables this phase adds have
  every foreign key indexed.
* `unused_index` × 5 — four pre-existing plus `agent_requests_sync_run_idx`, which is minutes old.

---

## 10. bb-sync registration step for the PM

`skills/bb-sync/SKILL.md` is W-16's file and was not edited. This is what it has to do, and the
exact call.

**The column:** `agent_requests.run_id uuid` (added in migration 035, indexed). It is the only
thing that authorises the transform to fold a crawl.

**The sequence:**

1. **Claim the request** (this also opens the quarantine grace window, so do it first):

   ```sql
   update agent_requests
      set state = 'claimed', claimed_at = now(), claimed_by = '<session label>'
    where id = <request id> and state = 'queued'
   returning id;
   ```
   REST equivalent, with the owner's JWT:
   `PATCH /rest/v1/agent_requests?id=eq.<id>&state=eq.queued`
   body `{"state":"claimed","claimed_at":"now()","claimed_by":"<session label>"}`

2. **Crawl:** `const { run_id } = await bb.runAll({ termName: 'Fall 2026' })`.

3. **Register the run id, immediately:**

   ```sql
   update agent_requests set run_id = '<run_id from runAll>' where id = <request id>;
   ```
   `PATCH /rest/v1/agent_requests?id=eq.<id>` body `{"run_id":"<uuid>"}`

4. **Wait** for `v_sync_status` to show that `run_id` with `status in ('ok','partial','failed')` —
   the cron folds it within two minutes — then close the request:

   ```sql
   update agent_requests
      set state = 'done', finished_at = now(), sync_run_id = <sync_runs.id>
    where id = <request id>;
   ```

5. On SESSION EXPIRED: `state = 'failed'` plus the `stack_must_confirm` attention item the brief
   describes. Do **not** leave the request `claimed`: a stale claim holds the quarantine window
   open for up to 30 minutes (harmless, but it delays the bookkeeping).

**Why step 3 comes after the crawl.** The brief and the PM both say "register before `runAll`",
which is the better order — but `ingest/bb_crawler.js` generates the run id *inside* `runAll`
(`const run_id = crypto.randomUUID()`) and only returns it at the end, so the skill cannot know it
beforehand. Migration 039 closes the gap from the driver side instead: the tick does not quarantine
anything while an owner sync is in flight, and an unregistered run is never *folded* either way, so
the authorisation rule is unchanged and only the bookkeeping waits.

**If W-16 would rather register first** (recommended when the crawler is next touched), it is a
one-line change:

```js
const runAll = async ({ termName = null, runId = null, since = …, until = … } = {}) => {
  const run_id = runId || crypto.randomUUID();
```

Then the skill generates the uuid, writes it in step 1, and passes `{ runId }` to `runAll`. No
database change is needed for that; step 3 simply becomes unnecessary.

---

## 11. Stopped, and why

**`stage_courses` does not write `meetings`.** The contract says to write `meetings` rows whose
`source = 'blackboard'` from `payload->'schedule'`. Against real data that is not implementable:

* the 2026-09-08 crawls carry **no `schedule` key at all** (that crawler build sends `groups`
  instead, and omits `teachers` and `gradeCategories` too);
* the 2026-09-02 crawl has the key and it is an **empty array for all 7 courses**.

No payload anywhere shows what a schedule entry looks like, so writing `meetings` would mean
guessing the shape of Stack's timetable. The stage counts `schedule_entries` (0 on both runs),
reports `meetings_written: 0` explicitly rather than omitting it, and raises a `data_gap` naming
the course the first time a non-empty schedule appears. Implement it in the phase that has a real
payload to read.

Two smaller items handled the same way:

* **`announcements.author` stays null.** The crawler slims each announcement to seven keys
  (`id`, `title`, `created`, `modified`, `start`, `isRead`, `body`) before posting, so no stored
  payload carries a creator and the exact JSON key cannot be verified without a live logged-in tab.
  That verification and the crawler change belong to W-16, who owns `ingest/bb_crawler.js`.
  `stage_announcements` already reads `author` (falling back to `creator` / `createdBy`) so it will
  start populating the moment the crawler sends it. `modified_at` **is** populated — `modified` is
  present on every announcement in run 6b122650.
* **`assignments.bb_url` is not set.** The contract sources it from the content item's `url`, and
  no content item in either run has one (`detail` only ever holds `file` and `url`, and `url` is
  null on all 21 assessment items). It stays null rather than being synthesised.

## 12. Other deviations worth knowing about

* **Course resolution.** `bb_raw.bb_course_id` holds Blackboard's internal shell id (`_569316_1`),
  which is `courses.bb_id` — not `courses.bb_course_id` (`IST.323.M002.FALL26`). The briefs say
  `bb_course_id`, which matches 0 of 7 shells. `bb_resolve_course()` tries `bb_id` first and falls
  back; `stage_courses` counts and raises for any shell it cannot resolve (0 on both runs). Agreed
  with W-12, who hit the same thing.
* **`assignments` has no `notes` column** (001/004/014 never added one), so the provenance the
  contract wants in `notes` — the transform's own trail, and an old column id on a re-pointed row —
  goes in `source_ref`.
* **`bb_files` is keyed `unique (bb_course_id, source_url)`**, not by the contract's
  `(course_id, content_id, file_name)`. `stage_files` matches URL first and identity second;
  identity-first would hit the unique constraint on the four rows whose `file_name` drifted (a
  stripped `#`, a curly apostrophe) while the URL held.
* **`course_staff`**: when Blackboard reports a teacher the course already has under a different
  name in the same role with no `bb_user_id`, the stage raises a conflict and inserts **nothing**.
  The contract's blind upsert-on-`bb_user_id` would have put "Bob Wilson" and "Robert Wilson" on
  the GEO.103 Info tab and called it a sync.
* **Session-scoped file links** (4 refs on the latest run, all IST.323 "Security in the News"
  decks) are not catalogued — they 403 once the Blackboard session ends — and each raises a
  `data_gap` naming the file, rather than being dropped silently.
* **Gaps are not auto-closed.** A `stage_gaps` row whose condition later stops holding stays open
  until Stack dismisses it. Auto-dismissing would collide with the dedupe key and take a decision
  out of his hands; it belongs in the Inbox work, not here.
