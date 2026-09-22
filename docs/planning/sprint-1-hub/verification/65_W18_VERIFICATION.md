# W-18 verification — Phase 9 round 2, code-review fixes

Date: 2026-09-14. Worker: W-18b, branch `feat/sync-loop-fixes`, worktree `bb2dash-wt-sl-fixes`.
Continues W-18a, which applied migration 041 (finding F1) before its session dropped.

Findings fixed here: **F2, F3, F4, F5, F6, F7, F8, F9**. F1 was done in 041.
Everything below was run against prod (`goultdzqcavefcgnifdy`). The numbers are what the database
returned. Where a fix produces no visible change on today's data, that is said plainly rather
than dressed up.

---

## 1. Migrations applied

| File | Applied as | Findings |
|---|---|---|
| `041_attention_dedupe_open_only.sql` | `041_attention_dedupe_open_only` | F1, F3 (raise side) — W-18a |
| `042_apply_resolutions.sql` | `042_apply_resolutions` | F8 (extraction), F3 (apply side), F2, F6 |
| `043_stage_files_missing_marker.sql` | `043_stage_files_missing_marker` | F4 |
| `044_ical_collect_and_drain.sql` | `044_ical_collect_and_drain` | F5, F8 (drain side) |

045 was reserved and not needed. Migrations 001–040 were not touched.

Each was dry-run inside `begin; … rollback;` through `execute_sql` before `apply_migration`.

**Byte-identity.** Every function body in prod matches the repo file character for character
(the repo's committed blobs are LF; the working copies carry CRLF through `core.autocrlf`, the
same as every migration before them):

```sql
select proname, md5(prosrc), length(prosrc) from pg_proc
 where proname in ('apply_resolutions','stage_assignments','stage_files',
                   'ical_collect','ical_poll','transform_tick');
```

| function | md5(prosrc) | length | repo file md5 of the same span |
|---|---|---|---|
| `apply_resolutions` | `add2333175a3616aa690f24cd8d47d07` | 4064 | identical |
| `stage_assignments` | `9790948489e65ed4e4decd4228b6b3c8` | 17320 | identical |
| `stage_files` | `28af493f05224ce1ee09670d4b698188` | 10848 | identical |
| `ical_collect` | `0a001b0cf45ff5ac568fe4d5dbcf5183` | 3823 | identical |
| `ical_poll` | `fdb9e6e8d4146053c710ec374943448a` | 2628 | identical |
| `transform_tick` | `c109e1f8be0668ab65ec1f0a596846f7` | 7274 | identical |

**Privileges.** Every `security definer` function keeps `set search_path = public, pg_temp`, and
execute is revoked from `public, anon, authenticated` and granted to `service_role` after each
`create or replace` (038's rule). Checked inside the 042 dry run:

```sql
select count(*) from pg_proc p join pg_roles r on has_function_privilege(r.oid, p.oid, 'execute')
 where p.proname in ('apply_resolutions','stage_assignments') and r.rolname in ('anon','authenticated');
→ 0
```

No RLS policy was changed; owner-scoped RLS is exactly as migration 020 / 038 left it.

---

## 2. F2 — "Keep mine" was re-asked on every sync

Item 138 is a real open conflict: `IST.323/presentation-choice`, `points_possible`, bb2dash has
0, Blackboard says 100. The whole sequence below ran in one `begin; … rollback;`.

**Stack answers "Keep mine", and the answer is applied:**

```sql
update attention_items set state='resolved', resolved_at=now(),
       resolution='{"accept":"keep"}'::jsonb, resolution_note='syllabus says it is ungraded'
 where id = 138;
select apply_resolutions();
→ {"scanned": 2, "applied_keep": 1, "applied_value": 0, "applied_blackboard": 0,
   "unapplicable": 1, "unapplied": 0}

select id, points_possible, confidence from assignments where id = 'IST.323/presentation-choice';
→ IST.323/presentation-choice | 0.00 | confirmed        -- his value stands, confidence says so
```

**Fold again with Blackboard unchanged — the question is not re-asked:**

```sql
select stage_assignments('6b122650-49f3-4a70-a801-c177fbf27f1a', <new sync_runs id>);
→ counts: columns_seen 37, conflicts 7, conflicts_settled 1, attention_raised 0, …

select count(*) from attention_items
 where kind='conflict' and ref='IST.323/presentation-choice'
   and field='points_possible' and state='open';
→ 0
```

Before this round that fold raised a fresh open row on every single tick.

**Blackboard changes its mind (100 → 150) — the question comes straight back:**

```sql
-- inside the same rolled-back transaction, the gradebook column's `possible` is set to 150
select stage_assignments('6b122650-…', <new sync_runs id>);
→ counts: conflicts 8, conflicts_settled 0, attention_raised 1

select id, state, to_value from attention_items
 where kind='conflict' and ref='IST.323/presentation-choice' and field='points_possible';
→ 267 | open     | 150      -- the new disagreement
→ 138 | resolved | 100      -- the one he settled, untouched
```

That is the rule: settled while Blackboard holds still, re-asked the moment it moves.

---

## 3. F3 — `applied_at` was stamped on answers nothing had applied

Item 178 is a `course_staff` name conflict (ECN.304, "Chung-Chin Eugene Liu" vs "Chung-Chin
Liu"). Nothing in this phase writes `course_staff` from a resolution, so nothing can apply it.

```sql
update attention_items set state='resolved', resolved_at=now(),
       resolution='{"accept":"keep"}'::jsonb, resolution_note='the roster spells it Eugene'
 where id = 178;
select apply_resolutions();
→ {"scanned": 2, …, "unapplicable": 1}

select id, state, applied_at, resolution from attention_items where id = 178;
→ 178 | resolved | null | {"accept": "keep"}
```

`applied_at` stays null, so the Inbox chip keeps reading **"answered, applies on next sync"**,
which is the truth. Before, it flipped to "applied" while nothing had been written anywhere.

The answer kinds nothing applies today are listed in the header of migration 042 and in the
`comment on function apply_resolutions()`: course-map questions (`course_field:` / `map_gap:`),
`missing` on `grading_scheme`, `course_staff` conflicts, ambiguous-column conflicts
(`ref = 'column:<id>'`), `data_gap` rows (dismissal is the answer), and any resolution naming a
field outside `{due_at, due_date, points_possible, bb_url}`.

The raise side of F3 — dismissed and answered `missing` / `data_gap` items coming back as fresh
open rows on every fold — was fixed in 041 by `attention_answered()`, used by `raise_attention`
and `stage_gaps`.

The counts key `resolutions_noted_only` is gone and `resolutions_unapplicable` takes its place
(nothing in the web app read either; the only mention was in `64_W15_VERIFICATION.md`).

---

## 4. F4 — which crawl may declare a file missing, and taking the claim back

**Hole 1: the measure.** With both registered crawls put back in the "pending, never folded"
state the bug needs (`delete from sync_runs where run_id in (…)`, inside a rolled-back
transaction), 037's test and 043's test disagree:

```sql
select left(p.run_id::text, 8) as run,
       not exists (select 1 from sync_runs s where …)      as pre_043_says_newest,
       not exists (select 1 from agent_requests r where …) as post_043_says_newest
  from (values ('3e12fd89-…'::uuid), ('6b122650-…'::uuid)) p(run_id);
```

| run | captured | pre_043_says_newest | post_043_says_newest |
|---|---|---|---|
| `3e12fd89` (9/2) | 2026-09-02 20:26 | **true** ← wrong | false |
| `6b122650` (9/8) | 2026-09-08 17:29 | true | true |

039 folds pending crawls oldest first, so the 9/2 crawl would have gone first, called itself the
newest crawl in existence, and marked every file its older crawler build could not see as gone —
which is exactly the damage 037 had to correct by hand.

**Hole 2: the marker was one-way.** Three markers planted to imitate a crawl truncated mid-walk,
then one fold of the newest crawl:

```sql
update bb_files set notes = btrim(coalesce(notes || ' | ','') ||
       'missing_since_run=00000000-0000-0000-0000-000000000000') where id in (…3 rows…);
select count(*) from bb_files where notes like '%missing_since_run=00000000%';   → 3

select stage_files('6b122650-…', <new sync_runs id>);
→ counts: file_refs 61, matched_by_url 57, marked_missing 0, missing_cleared 3,
          missing_skipped_older_run false, protected_rows_untouched 2, deleted 0

select count(*) from bb_files where notes like '%missing_since_run=00000000%';   → 0
select notes from bb_files order by id limit 3;
→ 'IST 323 syllabus v1.3.1', null, null      -- the rest of each note survived intact
```

The one genuine marker in prod — `bb_files` id 62, "ist352 instructor bio.pdf", missing since run
`6b122650` — was **not** cleared, because no crawl has seen that file again. Folding the older
9/2 crawl still reports `missing_skipped_older_run true, marked_missing 0`.

---

## 5. F5 — the calendar body could never be collected

```sql
select setting from pg_settings where name = 'pg_net.ttl';   → "6 hours"
```

`ical_poll` was scheduled daily and was itself the collector, so the response it asked for at
06:17 was always deleted by pg_net hours before the next call looked for it.

Tested through the real path with a harmless URL, against prod:

```sql
update app_settings set ical_url = 'https://example.com', ical_request_id = null where id;

select ical_poll();
→ {"sync_run_id": 33, "status": "ok",
   "counts": {"collect": {"collected": false, "reason": "no request outstanding"},
              "requested": 236}}                    -- request issued 15:02:19.65Z

select transform_tick();
→ {"folded": 0, "reaped": 0, "requests_done": 0,
   "ical": {"collected": true, "status": "ok", "sync_run_id": 34,
            "counts": {"bytes": 559, "request_id": 236, "waited_seconds": 5,
                       "run_id": "3f125e62-ccd5-47f3-b2ed-54e72b1ecb18"}}}   -- 15:02:24.74Z

select run_id, kind, payload->>'url', left(payload->>'body', 40) from bb_raw where kind = 'ical';
→ 3f125e62-… | ical | https://example.com | <!doctype html><html lang="en"><head><ti
```

Five seconds from request to collected body, against a ttl of six hours. The stage row
(`stage='ical', status='ok'`) and the run's `summary.changes = ["Calendar feed fetched"]` were
written by `ical_collect`, and `app_settings.ical_last_status` came back 200.

**Cleanup.** Every artefact of that test was removed: the `bb_raw` ical row, `sync_runs` 33 and
34 with their stage rows, and `app_settings` back to `ical_url = null`, `ical_request_id = null`,
`ical_last_status = null`. `max(sync_runs.id)` is 27 again, `count(*) from bb_raw where kind =
'ical'` is 0. Stack's calendar feed URL has never been set and is still blank.

A tick with nothing outstanding writes no rows at all — `ical_collect` returns
`{"collected": false, "reason": "no request outstanding"}` before touching anything, which is
what keeps 720 ticks a day out of `sync_runs`.

---

## 6. F6 — `assignments.bb_url`, and why the count is still zero

The crawler's `slim()` (`ingest/bb_crawler.js`) copies a content item's link to `detail.url`, and
a document's attachment to `detail.file.url`. It never writes a top-level `url`, which is the
only thing `stage_assignments` step 2 read. Across both registered crawls:

```sql
with ci as (select cr.id as course_id, c->>'id' as item_id, c->>'url' as old_expr,
                   bb_abs_url(coalesce(c->>'url', c->'detail'->>'url',
                                       c->'detail'->'file'->>'url')) as new_expr
              from bb_raw b join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
                   lateral jsonb_array_elements(bb_jarray(b.payload->'content')) c
             where b.kind='course' and b.run_id in (select run_id from agent_requests
                                                     where kind='sync' and run_id is not null))
select count(*) content_items, count(old_expr) with_old_expr_url, count(new_expr) with_new_expr_url,
       count(*) filter (where exists (select 1 from assignments a
                                       where a.course_id=ci.course_id and a.bb_item_id=ci.item_id))
         as items_an_assignment_points_at,
       count(*) filter (where new_expr is not null and exists (
                 select 1 from assignments a where a.course_id=ci.course_id
                   and a.bb_item_id=ci.item_id and a.bb_url is null)) as would_set_a_url
  from ci;
```

| content_items | with_old_expr_url | with_new_expr_url | items_an_assignment_points_at | would_set_a_url |
|---|---|---|---|---|
| 286 | **0** | **58** | 41 | 0 |

So the old expression could never have matched anything, and the new one finds 58 links. The
re-run against the newest registered run (`6b122650-…`, inside the rolled-back transaction)
reported **`urls_set: 0`**, and that is honest, not a failure of the fix: the 58 links belong to
documents and web links, while every content item an assignment points at through `bb_item_id` is
assessment-typed and carries **no `detail` object at all** (`asmt_with_detail = 0` of 42
assessment items). Blackboard's own deep link to an assessment is not in what the crawler
captures today.

The fix is correct and costs nothing; `bb_url` will populate the moment an assignment's content
item carries a link. Capturing the Ultra assessment URL is a crawler change and belongs to
whoever next opens `bb_crawler.js` — flagged to the PM, not done here.

---

## 7. F8 — a queued `transform` request now applies answers

Before: the drain called `run_transform(newest run)`, which is idempotent, returned the existing
`sync_runs` id, ran no stage, and closed the request with that old run's summary. Answered Inbox
items sat unapplied. The Sync button did nothing for the Inbox.

End to end, in one rolled-back transaction, with 044 in place:

```sql
update attention_items set state='resolved', resolved_at=now(),
       resolution='{"accept":"blackboard"}'::jsonb,
       resolution_note='blackboard is right about the points' where id = 138;
-- before: applied_at null; assignments.points_possible = 0.00

insert into agent_requests (kind, scope, state, note)
values ('transform','all','queued','F8 dry-run: apply my Inbox answers');

select transform_tick();
→ {"folded": 0, "requests_done": 1, "requests_failed": 0, "reaped": 0,
   "ical": {"collected": false, "reason": "no request outstanding"}}

select id, state, applied_at is not null from attention_items where id = 138;
→ 138 | resolved | true
select id, points_possible, confidence from assignments where id='IST.323/presentation-choice';
→ IST.323/presentation-choice | 100.00 | confirmed

select state, result from agent_requests where note = 'F8 dry-run: apply my Inbox answers';
→ done | {"sync_run_id": 16, "run_id": "6b122650-…", "status": "ok",
          "folded_a_new_crawl": false,
          "resolutions": {"scanned": 1, "applied_blackboard": 1, "applied_keep": 0,
                          "applied_value": 0, "unapplicable": 0, "unapplied": 0},
          "summary": {…}}
```

`folded_a_new_crawl: false` says out loud that there was nothing new to fold and that what the
request actually did was apply one answer.

---

## 8. F7 and F9 — the web half

Both are covered by vitest; no fixture touches the network.

**F7** (`web/test/queries.sync.activity.test.ts`, 5 tests). The request asserts
`from('sync_runs')`, `.neq('source','ical')`, `.or('scope.is.null,scope.neq.unregistered')`,
`.order('id',{ascending:false})`, `.limit(8)`, and that a Postgres error is thrown rather than
rendered as an empty list. The flattener is given a fixture holding both noise kinds — an
`source='ical'` poll row and a `scope='unregistered'` quarantine row — plus two real runs, and
returns only the real runs' lines; `unseenCount` counts only those, so neither noise kind can
light the badge. Prod today holds exactly that shape: four `ical` rows (ids 23, 24, 25, 27) and
one quarantine row (id 18) against two real Blackboard runs (16, 17) — the newest eight
`sync_runs` rows were five parts noise.

**F9** (`web/test/Inbox.test.tsx`, 4 new tests, 21 in the file). A failed resolve renders exactly
one `role="alert"` on the row it came from, carrying the database's message ("row-level security
policy…"); the other row shows nothing. The controls stay enabled and clicking "Keep mine" again
calls `onResolve` with the same payload. Nothing is rendered when the last resolve succeeded.
`failureText` turns a PostgrestError — a plain object, not an `Error` — into its message, and an
unrecognisable value into "the database rejected the change" rather than "undefined".

---

## 9. Advisors

`get_advisors(security)` after all four migrations returns three findings, **none introduced by
this round**:

| Lint | Count | Status |
|---|---|---|
| `function_search_path_mutable` | 7 | Pre-existing: `set_updated_at`, `classify_bb_file`, `bb_file_relpath`, `suggested_start`, `search_file_text`, `match_file_text`, `hybrid_search_file_text` — all from migrations 001–025, outside this phase's range, and `hybrid_search_file_text` is explicitly out of scope (CLAUDE.md). None of this round's functions is listed; all six set `search_path = public, pg_temp`. |
| `authenticated_security_definer_function_executable` | 1 | `public.app_owner()` only — deliberate, recorded in `DECISIONS.md` (2026-09-10): `authenticated` must call it for RLS evaluation and it returns only the owner's own uid. |
| `auth_leaked_password_protection` | 1 | Supabase Auth setting, unrelated to this branch. |

---

## 10. Gates

```
npm run typecheck   → clean (tsc --noEmit)
npm run build       → clean; 8 routes built, /inbox static
npm test            → 9 files, 117 tests, all passing
```

(`web/node_modules` had to be installed in this worktree first — `npm ci`, 149 packages.)

---

## 11. For the PM

* `sync_change_lines()` was **not** changed, so the new counts `conflicts_settled` and
  `missing_cleared` do not produce Activity lines yet. They are in `sync_stage_runs.counts` and in
  `sync_runs.summary.stages`. Worth a line each when someone next touches the wording; it was not
  worth replacing a function outside these findings to add them.
* An answered item that nothing can apply is re-scanned by `apply_resolutions()` on every call
  (it is never stamped). That is a handful of rows and one index lookup each; it becomes free as
  soon as later phases give those kinds real writers.
* F6 leaves `assignments.bb_url` empty until the crawler captures an assessment's Ultra URL. See
  §6 — a crawler change, deliberately not made here.
* Nothing was merged and no PR was opened. Migrations 041–044 are applied to prod and the repo
  files match them byte for byte.
