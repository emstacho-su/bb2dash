# W-12 verification — Phase 8 database (migrations 026–029)

Date: 2026-09-10. Worker: W-12 (database), branch `feat/course-dimension-db`.
Brief: `61_PHASE8_course_dimension.md` §Workers → W-12. Prod: `goultdzqcavefcgnifdy`.

Every migration was dry-run inside `begin; … rollback;` via `execute_sql` before being applied
with `apply_migration` under the file's basename. The repo files are byte-identical to what was
applied.

| Repo file | Applied as | What it does |
|---|---|---|
| `db/migrations/026_stage_content.sql` | `026_stage_content` | `stage_content(p_run_id uuid) returns jsonb` + `bb_content_detail_merge()` helper |
| `db/migrations/027_course_views.sql` | `027_course_views` | `v_course_stream`, `v_content_tree` |
| `db/migrations/028_card_note.sql` | `028_card_note` | `courses.card_note` + `v_course_display` recreated to carry it |
| `db/migrations/029_stage_content_grants.sql` | `029_stage_content_grants` | takes `stage_content` off the `authenticated` REST surface (advisor follow-up) |

Migration numbers 026–029 only. Nothing in 001–025 was edited. No `sync_runs` or
`sync_stage_runs` row was written (verified below).

---

## 1. Three things the contract could not have known — read these first

### 1.1 The brief's course-resolution rule resolves nothing (deviation, applied)

The brief says `stage_content` resolves `course_id` via
`courses.bb_course_id = bb_raw.bb_course_id`. On this data that join matches **0 of 7** rows:

| `bb_raw.bb_course_id` | `courses.bb_id` | `courses.bb_course_id` | `courses.id` |
|---|---|---|---|
| `_569316_1` | `_569316_1` | `GEO.103.M001.FALL26` | GEO.103.lecture |
| `_569318_1` | `_569318_1` | `GEO.103.M003.FALL26` | GEO.103.recitation |
| `_570144_1` | `_570144_1` | `IST.352.M001.FALL26` | IST.352 |
| `_570160_1` | `_570160_1` | `IST.466.M003.FALL26` | IST.466 |
| `_570161_1` | `_570161_1` | `IST.471.M800.FALL26` | IST.471 |
| `_571529_1` | `_571529_1` | `IST.323.M002.FALL26` | IST.323 |
| `_572517_1` | `_572517_1` | `ECN.304.M001.FALL26` | ECN.304 |

`bb_raw.bb_course_id` is Blackboard's internal shell id, which is `courses.bb_id`.
`ingest/bb_crawler.js` posts `m.id` (the shell id) as `bb_course_id`; the registrar-style code
lives in the payload as `payload->'course'->>'name'`, not as `courseId` (which is a numeric
`19406.1271` form).

**Applied:** the function matches `courses.bb_id` first and falls back to `courses.bb_course_id`,
so the brief's literal wording still works if a future writer posts the registrar code. Shells
that resolve to no `courses` row are skipped and counted (`unresolved_courses`,
`unresolved_items`) — never guessed. Both counts are 0 for this run.

### 1.2 `(course_id, path)` cannot represent IST.466 (stopped, not guessed)

The upsert key is the existing `bb_content_course_id_path_key` unique constraint. IST.466
publishes **two** sibling lessons named `Information`, `Assignments` and `Content` under the same
course root (positions 2/3/4 and 9/10/11), plus two identically-pathed children. Five items of
the run therefore collide on a key the contract freezes:

| course | path | ids in crawl order |
|---|---|---|
| IST.466 | `"Ethics vs." Criteria for Presentations` | `_12939625_1`, `_12939632_1` |
| IST.466 | `Information` | `_12939627_1`, `_12939634_1` |
| IST.466 | `Assignments` | `_12939628_1`, `_12939636_1` |
| IST.466 | `Content` | `_12939629_1`, `_12939635_1` |
| IST.466 | `Information / Class Introduction - August 24, 2026` | `_12939643_1`, `_12939654_1` |

`stage_content` keeps the **first occurrence in crawl order** — which is also the id
`bb_content` already held, so no row flipped identity — and reports the other five as
`duplicate_paths`. It does **not** invent a disambiguator (no id suffix, no `#2`), because that
would change the shape of `path`, which `v_content_tree` and W-13's Classwork tree both depend
on. Nothing is orphaned: the losing nodes' children resolve by parent **path** onto the kept
node.

**Open for the PM / a later phase.** Representing both branches needs a key change
(`(course_id, bb_item_id)`, or a disambiguated `path`), which is out of Phase 8's frozen
contract. Until then IST.466's Classwork tree shows one `Information` / `Assignments` /
`Content` branch, not two. The duplicate ids are visible in `bb_raw` and the count is in the
function's return value, so nothing is silently lost.

### 1.3 Every view in 001–025 bypasses RLS (pre-existing, reported, mostly not mine to fix)

Migration 020 scoped every table policy to `auth.uid() = public.app_owner()`, but the views were
created without `security_invoker`, so they run as their owner `postgres`, which has
`rolbypassrls = true`. Measured on prod **before** this work:

```
set role anon;
select count(*) from assignments;        -- 0    (RLS works)
select count(*) from v_work_items;       -- 152  (RLS bypassed)
select count(*) from v_bb_files_current; -- 60   (RLS bypassed)
```

`v_work_items`, `v_bb_files_current`, `v_upcoming`, `v_overdue`, `v_course_corpus`,
`v_file_layout`, `v_data_freshness`, `v_embedding_status`, `v_assignment_effort`,
`v_course_map_latest`, `v_course_points_median` are all still in this state — the whole planner
and file catalogue is readable with the publishable key. They are outside W-12's 026–029 range;
**this needs its own migration and a decision from Stack.**

What W-12 did do: all three views it owns (`v_course_stream`, `v_content_tree`, and
`v_course_display`, which 028 recreates anyway) are `security_invoker = true` with `anon`
revoked, and each arm that would otherwise read *only* through a pre-020 view is anchored to an
owner-scoped base table by a join that cannot change the row set (`courses` for the file arm,
`assignments` for the `assignment_due` arm). The security-definer-view advisor count went from
12 to 11.

---

## 2. `stage_content` — the run

Run `6b122650-49f3-4a70-a801-c177fbf27f1a` (crawl of 2026-09-08, 7 course rows, 142 content
items), executed once against prod after 026 was applied:

```
select public.stage_content('6b122650-49f3-4a70-a801-c177fbf27f1a');

{"inserted": 0, "updated": 137, "missing": 2, "title_fallbacks": 10,
 "duplicate_paths": 5, "unresolved_courses": 0, "unresolved_items": 0,
 "items": 142, "courses": 7,
 "run_id": "6b122650-49f3-4a70-a801-c177fbf27f1a"}
```

`inserted + updated = 137` = the run's distinct `(course_id, path)` pairs (142 items − 5
duplicate paths). Nothing was inserted because the 2026-09-02 pass had already created all 137
paths; 137 rows were refreshed onto the new run.

### 2.1 `bb_content` before / after

| measure | before | after |
|---|---|---|
| rows | 139 | 139 |
| `run_id` = 3e12fd89 (2026-09-02) | 139 | 2 |
| `run_id` = 6b122650 (2026-09-08) | 0 | **137** |
| rows with `parent_id` | 103 | **106** |
| rows with `url` | 27 | 27 |
| `title = 'ultraDocumentBody'` | 11 | **1** |
| titles from the fallback rule | 0 | **10** |
| rows with `assignment_id` | 21 | **21** (never touched) |
| `detail ? 'missing_since'` | 0 | **2** |
| `detail ? 'previous_ids'` | 0 | **1** |
| `detail ? 'description'` | 0 &dagger; | 9 |

&dagger; The 2026-09-02 pass never wrote a `description` key: all 9 rows that carry one are on
the new run, and neither row still on the old run has it.

Untouched, as the contract requires: `bb_files` 64, `assignments` 66, `assignment_progress` 65,
`reading_progress` 75, `sync_runs` rows for this run **0**, `sync_stage_runs` **0**.

### 2.2 Idempotency

Called again against the same run (twice in the rolled-back dry run, once more on prod after 029
landed), the result is identical except `missing`, which drops to 0 because the two absent rows
are already stamped:

```
{"inserted": 0, "updated": 137, "missing": 0, "title_fallbacks": 10,
 "duplicate_paths": 5, "items": 142, "courses": 7, ...}
```

`updated` counts rows matched-and-refreshed, not rows whose values changed — every call restamps
`run_id` and `captured_at`, so 137 is the steady state.

### 2.3 The 11 `ultraDocumentBody` titles

Ten are in the run and all ten took the fallback. The eleventh is not in the run at all — its
Blackboard item was removed between the two crawls — so it kept its old title and was stamped
missing instead. `stage_content` does not rewrite rows the run did not carry.

| course | resolved title | path |
|---|---|---|
| GEO.103.lecture | `GEO 103 - Syllabus (document)` | `GEO 103 - Syllabus and TA Discussion Section Guidelines / GEO 103 - Syllabus / ultraDocumentBody` |
| GEO.103.lecture | `Problems with Qwickly Attendance App? - Click Here (document)` | `Problems with Qwickly Attendance App? - Click Here / ultraDocumentBody` |
| GEO.103.lecture | `Gideon - "The End of Children" - The New Yorker (document)` | `Week 2 -Population and Scarcity … / Gideon - "The End of Children" - The New Yorker / ultraDocumentBody` |
| GEO.103.lecture | `Week II - Population Reading Questions (document)` | `Week 2 -Population and Scarcity … / Week II - Population Reading Questions / ultraDocumentBody` |
| IST.323 | `Final Project - START HERE (document)` | `Assignments / Final Project / Final Project - START HERE / ultraDocumentBody` |
| IST.352 | `Project Team Assignments (document)` | `Assignments / Project Team Assignments / ultraDocumentBody` |
| IST.352 | `Chapter 1 (document)` | `Weekly Modules / WK01 - Chapter 1 / The Systems Development Environment / Chapter 1 / ultraDocumentBody` |
| IST.352 | `Welcome & Course Introduction (document)` | `Weekly Modules / WK01 - Welcome / Welcome & Course Introduction / ultraDocumentBody` |
| IST.466 | `Major Case #1 - Synchrony (document)` | `Information / Major Case #1 - Synchrony / ultraDocumentBody` |
| IST.466 | `Student Policy and Procedures- Fall 2026 (document)` | `Student Policy and Procedures- Fall 2026 / ultraDocumentBody` |
| GEO.103.lecture | *(still `ultraDocumentBody`)* | `** Listen to Song & Read Lyrics before class, Monday, Aug. 31st ** Dolly Parton, "My Tennessee Mountain Home" (1973) / ultraDocumentBody` — **not in the run, marked `missing_since`** |

No item was at the tree root, so the `Untitled document` branch of the rule is untested against
real data.

### 2.4 The two missing rows and the one re-created item

Both missing rows are the Dolly Parton folder and its document in GEO.103.lecture, present on
2026-09-02 and gone on 2026-09-08. They are kept, not deleted, and carry
`detail->>'missing_since' = '6b122650-49f3-4a70-a801-c177fbf27f1a'`.

One item was re-created in Blackboard under the same path with a new id, and kept its history:

```
IST.352  Assignments / Project Assignment #1A - Project Description
  bb_item_id  _13195312_1
  detail->'previous_ids'  ["_13192249_1"]
```

### 2.5 Rules the brief left open, decided here

* `modified` arrives as **epoch milliseconds** (a JSON number), not an ISO string — all 142 items.
  Both forms are accepted; anything else lands as `null` rather than raising.
* `body` is the payload's `body` only. The payload's separate `description` (9 items, all with a
  null `body`) is preserved at `detail->'description'` so nothing is dropped, but it is not
  merged into `body`. Flip it in a Phase 9 migration if the Stream should search folder blurbs.
* `embeddedFiles` is ignored — files are Phase 9's `stage_files`.
* `missing_since` is **cleared** when an item reappears; a row present in the run is not missing.
* An unrecognised Blackboard type would land as `item_kind = 'other'`. None occurred: all ten
  types in the run map exactly onto the kinds `bb_content` already used
  (`folder`, `learning_module`, `file`, `document`, `test`, `survey`, `link`, `course_link`, `lti`).
* `assignment_id` is never written by this stage.

---

## 3. `v_content_tree`

151 rows over 139 nodes (57 of them carrying a current file). A node with several files yields
several rows, as the contract requires — IST.466 is 39 rows over 30 nodes.

| course | rows | nodes | rows with a file | max depth |
|---|---|---|---|---|
| ECN.304 | 13 | 13 | 3 | 3 |
| GEO.103.lecture | 21 | 21 | 6 | 3 |
| GEO.103.recitation | 2 | 2 | 1 | 1 |
| IST.323 | 32 | 31 | 15 | 4 |
| IST.352 | 34 | 32 | 7 | 5 |
| IST.466 | 39 | 30 | 21 | 3 |
| IST.471 | 10 | 10 | 4 | 2 |

### IST 323 sample (`order by path`, first 20 rows)

| depth | title | kind | state | file | bucket | assignment_id |
|---|---|---|---|---|---|---|
| 1 | Assignments | folder | None | — | — | — |
| 2 | Final Project | folder | None | — | — | — |
| 3 | Final Assignment Packets | folder | None | — | — | — |
| 4 | IST323_Packet_A_Meridian_Pharmacy.docx | file | None | 10 | project_materials | — |
| 3 | Final Project - Proposal and Appendices | test | None | — | — | `IST.323/fp-proposal` |
| 3 | Final Project - START HERE | folder | None | — | — | — |
| 4 | **Final Project - START HERE (document)** | document | None | — | — | — |
| 3 | Log Checkpoint Assignment | test | None | — | — | `IST.323/fp-log-checkpoint` |
| 3 | Price Sheet and Appendix Samples | folder | None | — | — | — |
| 4 | Appendix A SAMPLE and Guidance: Risk Ranking | file | None | 12 | project_materials | — |
| 4 | Appendix B SAMPLE and Guidance: AI Use Statement | file | None | 13 | project_materials | — |
| 4 | Appendix C SAMPLE and Guidance: Running Log | file | None | 14 | project_materials | — |
| 4 | Vendor Price Sheet | file | None | 11 | project_materials | — |
| 2 | Individual Presentation Selection | survey | None | — | — | `IST.323/presentation-choice` |
| 2 | Individual Security Presentation | course_link | None | — | — | — |
| 2 | Labs | folder | None | — | — | — |
| 3 | Instructions for getting access to the J&B Learning Labs | file | None | 9 | lab_materials | — |
| 2 | Security in the News Group Presentation | test | None | **64** | assignment_spec | `IST.323/sitn-group-presentation` |
| 2 | Security in the News Group Presentation | test | None | **65** | assignment_spec | `IST.323/sitn-group-presentation` |
| 1 | Lecture Slides | folder | Started | — | — | — |

The two `Security in the News` rows are the same `content_id` with two files — exactly the
"group by `content_id`" case W-13 has to handle. Ordering by `path` places every folder
immediately before its children, so the tree needs no recursive query on the client.

---

## 4. `v_course_stream`

159 rows across all courses, newest first.

| post_kind | rows | oldest | newest |
|---|---|---|---|
| announcement | 11 | 2026-08-11 | 2026-09-08 |
| material | 66 | 2026-07-17 | 2026-09-08 |
| assignment_posted | 25 | 2026-09-02 | 2026-09-08 |
| assignment_due | 57 | 2026-08-26 | 2026-12-15 |

`material` = 60 current files + 6 Blackboard content nodes that no `bb_files` row claims. Three
IST.466 nodes whose only file rows are superseded (roster 35, schedules 58 and 16 — migration
022) are in neither arm, which is the honest result: their replacements (37, 66) are already in
the feed under their own nodes. Reading `bb_files` rather than `v_bb_files_current` in that
`not exists` is the contract's wording and produces this.

`assignment_due` posts at **local midnight in America/New_York**, and the offset follows DST
correctly: `2026-08-26 → 04:00Z` (EDT), `2026-12-15 → 05:00Z` (EST).

GEO 103 spans two shells, and the view carries the shell id as the contract requires: 12 posts
on `GEO.103.lecture` + 3 on `GEO.103.recitation` = 15 for the display course. W-13 unions them
via `v_course_display.shell_ids`.

### IST 323 sample (posts already published, newest first)

| post_kind | posted (local) | ref | title | meta |
|---|---|---|---|---|
| assignment_due | 2026-09-10 00:00 | `IST.323/presentation-choice` | Individual Presentation Selection (topic + date) | `{type: form, due_on: 2026-09-10, status: not_started, points_possible: 0}` |
| assignment_due | 2026-09-09 00:00 | `IST.323/quiz-02` | Quiz #2 | `{type: quiz, due_on: 2026-09-09, status: not_started, points_possible: 10}` |
| assignment_due | 2026-09-09 00:00 | `IST.323/quiz-01` | Quiz #1 | `{type: quiz, due_on: 2026-09-09, status: graded, points_possible: 10}` |
| material | 2026-09-08 13:35 | `bb_file 65` | Week2SecInNews.pptx | `{bucket: assignment_spec, file_name: …, mime_type: …pptx}` |
| material | 2026-09-08 13:35 | `bb_file 64` | Week1SecInNews.pptx | `{bucket: assignment_spec, …}` |
| assignment_posted | 2026-09-02 16:11 | `IST.323/quiz-01` | Quiz #1 | `{type: quiz, due_on: 2026-09-09, status: graded, points_possible: 10}` |
| assignment_posted | 2026-09-02 16:11 | `IST.323/fp-proposal` | Final Project: Security Program Proposal + Appendices | `{type: project, due_on: 2026-12-03, …}` |
| material | 2026-09-02 15:41 | `bb_file 5` | Lecture3 - Chap 2 - Planning, Policy, and Risk | `{bucket: lecture_slides, …}` |

**Note for W-13.** Without the ±14-day client filter the whole `assignment_due` tail sorts above
everything else, because a December due date is "newer" than any real post. The unfiltered top of
the feed is December's exam, not this week's material. The filter the contract already specifies
is load-bearing, not cosmetic. `status: graded` above is planner state, not a score — no grade
figure is exposed by the view.

Meta shapes, as built:

* `announcement` → `{is_read}`
* `material` / `bb_file` → `{bucket, file_name, mime_type}`
* `material` / `bb_content` → `{bucket: null, file_name: null, mime_type: null, item_kind, url}`
  (the contract lists three meta shapes for four kinds; the file keys are present and explicitly
  null so a client can read them uniformly, and `item_kind`/`url` are added because a link post
  has nothing else to open)
* `assignment_posted` / `assignment_due` → `{due_on, points_possible, type, status}`

---

## 5. `courses.card_note` and `v_course_display`

`v_course_display` recreated (dropped and rebuilt, not altered). The 017 column list is unchanged
in order and `card_note` is appended:

| # | column | type |
|---|---|---|
| 1 | display_id | text |
| 2 | code | text |
| 3 | title | text |
| 4 | shell_ids | array |
| 5 | meetings | jsonb |
| 6 | room_disputed | boolean |
| 7 | bb_url | text |
| 8 | **card_note** | **text** |

Nothing else in the database referenced the view (checked `pg_depend`/`pg_rewrite` before the
drop). All six display rows still render, `room_disputed` still flags ECN 304 and GEO 103, and
`card_note` is taken from the parent shell only — a note on `GEO.103.lecture` shows on the GEO
103 card; the recitation shell has no card of its own.

`card_note` is capped at 280 characters by `courses_card_note_len`. A 281-character write is
rejected:

```
ERROR: 23514: new row for relation "courses" violates check constraint "courses_card_note_len"
```

**The cap is an addition to the brief, not something it asked for.** W-13 should mirror it as a
`maxLength` on the Info-tab input so the owner sees the limit instead of a Postgres error. The
value is stored verbatim — it is rendered as text, never HTML, so escaping is the renderer's job
and sanitising in the database would silently rewrite what the owner typed.

---

## 6. RLS — every new view, and the function

`app_owner()` = `fd0b7c9d-9153-4b25-afa7-09f1c3b69a8f`. Each probe is
`set local role authenticated; set local request.jwt.claims = '{"sub": …}'`.

| relation | owner uid | a different authenticated uid | anon |
|---|---|---|---|
| `v_course_stream` | **159** | **0** | permission denied for view |
| `v_content_tree` | **151** | **0** | permission denied for view |
| `v_course_display` | **6** | **0** | permission denied for view |
| `bb_content` (control) | 139 | 0 | 0 |
| `v_work_items` (pre-020 view, control) | 152 | **152** | 152 |

The last row is the pre-existing leak from §1.3, included so the contrast is on the record.

The owner can write a card note through RLS:

```
set local role authenticated; -- owner
update courses set card_note = 'Two shells: lecture + Friday recitation.' where id = 'GEO.103.lecture';
select card_note from v_course_display where display_id = 'GEO.103.lecture';
-- 'Two shells: lecture + Friday recitation.'   (rolled back)
```

`stage_content` refuses a non-owner JWT and is not reachable by `anon`:

```
-- authenticated, uid 00000000-…-0001
select public.stage_content('6b122650-…');
ERROR: 42501: stage_content: caller 00000000-0000-4000-8000-000000000001 is not the bb2dash owner

-- anon
select public.stage_content('6b122650-…');
ERROR: 42501: permission denied for function stage_content
```

After migration 029 the function is executable only by `service_role` and the `postgres` owner:
`postgres=X/postgres`, `service_role=X/postgres`. The owner guard stays as defence in depth for
the case where Phase 9 grants a caller-executed path.

---

## 7. Advisors

`get_advisors(security)` after 029. **No finding introduced by W-12 remains.**

| lint | level | count | whose |
|---|---|---|---|
| `security_definer_view` | ERROR | 11 | all pre-existing (001–025). Was 12 — `v_course_display` left the list when 028 recreated it with `security_invoker`. See §1.3 |
| `function_search_path_mutable` | WARN | 7 | all pre-existing (`set_updated_at`, `classify_bb_file`, `bb_file_relpath`, `suggested_start`, and the three search RPCs). Both new functions set `search_path` |
| `authenticated_security_definer_function_executable` | WARN | 1 | `app_owner()` only — accepted in DECISIONS on 2026-09-10. `stage_content` appeared here after 026 and was removed by 029 |
| `auth_leaked_password_protection` | WARN | 1 | pre-existing Auth setting |

---

## 8. Handover

**For W-13.** `v_course_stream` and `v_content_tree` are live and readable by the owner's JWT
today; regenerate `database.types.ts` to pick them up plus `v_course_display.card_note`. Apply
the ±14-day `assignment_due` filter (§4) or the feed opens on December. Group the tree by
`content_id` (§3). Mirror the 280-character `card_note` cap (§5).

**For W-15 / Phase 9.** `stage_content(p_run_id uuid) returns jsonb` is applied and matches the
frozen signature. Its return object carries the four contract keys plus `duplicate_paths`,
`unresolved_courses`, `unresolved_items`, `items`, `courses`, `run_id` — all additive. It is
executable by `service_role` and the `postgres` owner but **not** by `authenticated` (§7): a
SECURITY DEFINER `run_transform`, or pg_cron, reaches it without a grant; a caller-executed path
under the owner's JWT would need one GRANT in a Phase 9 migration. Course resolution now keys on
`courses.bb_id` (§1.1) — other Phase 9 stages reading `bb_raw` should use the same rule.

**For Stack / the PM, needing a decision.**

1. §1.3 — every view from 001–025 hands the whole planner and file catalogue to any caller,
   including `anon`. Outside W-12's migration range; needs its own migration.
2. §1.2 — IST.466's duplicated Blackboard branch cannot be represented under the frozen
   `(course_id, path)` key. One branch is shown; the collision is counted, not hidden.
