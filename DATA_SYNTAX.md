# bb2dash — Data Syntax (Phase 1)

Canonical store: Supabase project **bb2dash** (`goultdzqcavefcgnifdy`, us-east-1, Postgres 17).
Schema source of truth: `db/migrations/001_schema.sql`. Seeds: `db/seed/00[2-4]_*.sql`.
Everything below is reproducible from those files against an empty Postgres 16+.

## Why it is shaped this way

The six courses use four structurally different grading models, so grading is stored as
declarative rules, not a single "weight" column:

| Course | Method | The rule the forecaster has to understand |
|---|---|---|
| ECN.304 | weighted_pct | 3 exams **rank-weighted** 30/25/20; quizzes averaged with lowest dropped |
| GEO.103 | weighted_pct | Six flat buckets; ~5 unannounced quizzes, lowest dropped |
| IST.323 | points | 104 pts graded out of 100; quizzes **normalized** to 5; extra-credit lab; final project is a 3-part sum |
| IST.471 | qualitative | 70% supervisor evaluation, 30% assignment compliance |
| IST.352 | unknown | No syllabus in folder |
| IST.466 | unknown | Buckets known, weights not |

Second rule: **facts vs. state are separate tables.** `assignments` holds what the syllabus /
Blackboard says. `assignment_progress` holds what *you* say (status, planned dates, scores).
A phase-2 sync can rewrite `assignments` freely without touching your planner.

Third rule: **every fact row carries `source` and `confidence`**, so reconciliation knows what it
may overwrite. `confirmed` = explicit in the source. `tentative` = item explicit, date or detail
inferred. `inferred` = existence inferred (placeholders like "quiz series").

## Identifier conventions

* `courses.id` = the short names you defined: `ECN.304`, `GEO.103.lecture`, `GEO.103.recitation`,
  `IST.323`, `IST.352`, `IST.466`, `IST.471`.
* `courses.bb_course_id` = Blackboard shell id: `ECN.304.M001.FALL26`.
* `assignments.id` = `<course>/<kebab-slug>`; recurring instances get a zero-padded sequence:
  `IST.323/quiz-03`, `IST.323/lab-1`, `GEO.103/exam-2`. GEO items use the `GEO.103/` prefix
  regardless of whether they live in the lecture or recitation shell.
* `series_key` groups recurring instances (`IST.323/quiz`) so "recurring vs one-off" is a query,
  not a guess. `recurrence` is the enum; `sequence_no` orders within the series.
* `grade_components.code` is stable snake_case per course (`exams`, `quizzes`, `fp_proposal`).
  Sub-components point at a parent via `parent_id` (IST 323 final project).

## Tables

| Table | One row per | Owned by |
|---|---|---|
| `terms` | semester | seed |
| `courses` | Blackboard course shell | seed → Blackboard |
| `course_staff` | instructor/TA/sponsor per course | seed → Blackboard |
| `meetings` | weekly meeting pattern (day_of_week 0=Sun) | seed → Blackboard |
| `sessions` | dated class meeting with topic | seed → Blackboard |
| `grading_schemes` | course grading method, letter scale, late/AI policy | seed → Blackboard |
| `grade_components` | gradebook bucket with weight/points + aggregation rule | seed → Blackboard |
| `assignments` | deliverable or graded event | seed → Blackboard / iCal |
| `assignment_progress` | your planner state for an assignment | **you** (sync may fill score) |
| `readings` | assigned reading | seed → Blackboard |
| `reading_progress` | your reading state | **you** |
| `announcements` | Blackboard announcement | Blackboard |
| `bb_content` | Blackboard content tree node (as you see it) | Blackboard |
| `sync_runs` | provenance log per capture | sync jobs |
| `bb_raw` | raw crawl payload per (run, course) | crawler |
| `bb_files` | harvested file: bucket, links, hash, storage + local paths | bb-course-pull |
| `bb_file_text` | extracted text unit (slide/page/doc/sheet) per file | bb-course-pull |
| `course_maps` | versioned per-course pull plan (jsonb) | bb-course-map |
| `bb_text_embeddings` | vector embedding per (text unit, model, part) | embed job (pending) |
| `planner_events` | something you put on your week: event, task, out of office, focus time, working location, appointment slot | **you** |
| `planner_event_series` | one repeat rule a set of planner occurrences was expanded from | **you** |

Views: `v_upcoming` (not-yet-due, not finished), `v_overdue` (past due, still open),
`v_course_corpus` (files/stored/with-text per course+bucket), `v_course_map_latest`,
`v_file_layout` (canonical storage/local paths + needs_move), `v_embedding_status`.

## Search layer (migrations 010–013, 021, 024–025, 121)

Two retrieval tiers over the corpus, both scoped by course when wanted:

* **Full-text** — generated `tsvector` + GIN on `bb_file_text.text`, `bb_content` (title+body),
  `announcements` (title+body). Query with `search_file_text(q, course, limit,
  include_superseded)` → one row per matching text unit: `rank` (`ts_rank`) and a plain-text
  `snippet` (`ts_headline` with no markup) over the whole unit, on one side of its `[notes]`
  marker only (121, below). It returns no `part_no`.
* **Vector** — `bb_text_embeddings` holds `vector(384)` (gte-small, migration 011) per
  `(text_id, model, part_no)` with an HNSW cosine index. `embed-corpus` fills it; whether every
  current unit has its parts is checked by `db/tests/phase18_post_embed_checks.sql` (Phase 18),
  not quoted here as a count. Corpus chunks are embedded with a `"{course} {bucket} — {file_name}: "` context
  header; queries are embedded raw. Query with `match_file_text(query_embedding, model,
  course, limit, include_superseded)` or, preferred, `hybrid_search_file_text(q,
  query_embedding, ...)` (RRF over FTS + vector, deduped to one row per text unit).
* **`part_range`** is a 0-based half-open range of CHARACTERS (code points, matching Postgres
  `char_length`/`substring` — not JS UTF-16 units) into `bb_file_text.text`, excluding the
  context header. It is the slice that was embedded, and the slice a snippet is cut from.
* **Snippets per mode (021, 024–025, 121)** — plain text, no markup, in every mode.
  * `match_file_text` (vector): `part_no` of the nearest part, `similarity`, and the text.
  * `hybrid_search_file_text`: `score` (RRF), `similarity`, the MATCHED PASSAGE as `snippet`,
    `part_no` = the part the snippet was cut from (null for the whole-unit fallback), and
    `snippet_source`: `fts_headline` (`ts_headline` over the highest-ranking part whose slice
    covers the tsquery; null part → the whole unit), `vector_part` (the nearest part's head),
    `unit_head` (defensive fallback).
  * **Speaker notes (121).** A snippet either holds no text from at or after the unit's first
    `[notes]` marker, or starts with `[notes] ` and holds only text after it. A slice (or unit)
    that spans the marker is headlined on the side that covers the tsquery, the pre-marker side
    on a tie; a vector hit shows the pre-marker side; an empty side never wins.
* **Superseded files (018 + 021 + 022, 120, 122)** — `bb_files.superseded_by` points at the newer
  version; all three functions take `p_include_superseded boolean default false` and drop those
  rows before ranking. `v_bb_files_current` is the chain heads. Since Phase 18 the fold writes it
  itself: `supersede_replaced_files(run_id, sync_run_id)` (122, called by `stage_files` before
  its missing pass, 124) supersedes a file whose Blackboard item now carries exactly one other
  file, and asks one `stack_must_confirm` question (ref `supersede/<file id>`) when the item
  carries several, or when only the file name matches under another item. Only the newest
  registered crawl writes. 120 closed the two hand chains 2 → 151 (IST.323 syllabus) and
  74 → 149 (IST.466 schedule).
* **File weeks and sessions (123, 124)** — `file_week_no(course_id, path, file_name)` holds the
  per-course week rules (GEO.103.lecture `Week N`, IST.323 `Lecture #N - Week N`, IST.352
  `WKnn`; null elsewhere). `link_file_sessions(sync_run_id)` fills only null `week_no` /
  `session_id` on current, non-`stack`, non-`my_submissions` files: through the linked reading's
  date (`link_confidence` 1.0), else the week's only session (0.8); a week with several sessions
  asks one question (ref `session_link/<file id>`). `link_confidence` is written only where it is
  null. `stage_files`' `counts` carry `superseded_auto` and `session_links` (each the function's
  jsonb). Storage keys are never rewritten.
* **Per-item Blackboard links (126)** — `assignment_bb_url(course_id, item_id)` composes a test
  item's Ultra page (`…/ultra/courses/<bb_id>/outline/assessment/test/<item>?courseId=<bb_id>&gradeitemView=details`)
  when `bb_content` has that item as `resource/x-bb-asmt-test-link`, else null.
  `stage_assignments` writes it into `assignments.bb_url` only where that is null.
* **Edge functions** (`supabase/functions/`): `embed-corpus` (batch embedder, part-level
  resume, `max_parts`/`skip_parts` fan-out controls) and `search` v4 (the hub's retrieval API:
  `{q, course?, mode: fts|vector|hybrid, limit?, min_similarity?, include_superseded?}`).
  **Hub default mode = hybrid** per `EVAL_EMBEDDING_POC.md` (hybrid/vector hit@1 9/10 vs FTS
  1/10 on conversational queries). Evidence for the 021–023 round:
  `docs/planning/sprint-0-foundation/51_W10_VERIFICATION.md`.

## Enums

* `assignment_type`: exam, final_exam, quiz, lab, homework, reading, presentation,
  group_presentation, project, paper, discussion_post, form, checkpoint, meeting, evaluation,
  activity, attendance, participation, other
* `progress_status` (the planner selector): not_started, planned, in_progress, submitted,
  graded, missed, excused, not_applicable, waived
* `aggregation_rule`: sum, average, average_drop_lowest, rank_weighted, normalized, single,
  manual, unknown
* `submission_channel`: blackboard, in_class, email, external_site, discussion_board, none, unknown
* `data_source`: syllabus, course_deck, blackboard, ical, manual, inferred
* `confidence_level`: confirmed, tentative, inferred

## Time handling

`due_at` / `event_start` are `timestamptz`, entered with explicit offsets: `-04` (EDT) through
2026-11-01 02:00, `-05` (EST) after. `due_date` is used when only the day is known. Query
`due_at at time zone 'America/New_York'` for local display.

## Planner events and recurrence (migrations 067–069, 082–083)

A `planner_events` row is something you put on your own week; nothing here links to an assignment
and ticking a task writes `done` on this table only. `starts_at` / `ends_at` are **instants**;
`time_zone` is the IANA zone the event was entered in and only decides how Google and the grid
display it. **SQL never converts a wall clock into an instant** — Postgres resolves a DST fall-back
the opposite way from Temporal's `compatible` rule, so the web converts once and stores the result.
A trigger enforces the zone rule (`UTC` or an `Area/Location` name the server knows; POSIX strings
such as `UTC+3` are refused) and the all-day shape (00:00 local at both ends, exclusive end).

**Recurrence.** `planner_event_series` holds only the rule — `freq` (`daily` / `weekly` /
`monthly`) and a mandatory `until_date`, the last local date an occurrence may start on. The
occurrences are ordinary `planner_events` rows carrying `series_id`, expanded by the web
(`planner-recurrence.ts`), never by SQL, so the Google push is untouched and Google gets real
events. A series holds at most **52** occurrences — `planner_series_max_occurrences()` in SQL,
`MAX_SERIES_OCCURRENCES` in the web — enforced by an after-statement trigger. The rule is not
editable after creation: to change it, delete "this and following" and create a new series.
Weekly means the same weekday; monthly the same day-of-month, skipping a month that lacks it.
No rule outlives its last occurrence: an after-statement trigger on `planner_events`
(`planner_events_delete_empty_series`, migration 102) deletes any series a delete left with no
occurrences, so the plain single-occurrence delete closes the rule too, not just the series RPCs.

* **"This event"** needs no RPC: update the row and set `series_detached = true`. A detached row
  keeps its `series_id` (a check enforces that) and is skipped by every later series edit.
* **`planner_series_create(p_freq, p_until, p_rows)`** → the new series `uuid`.
* **`planner_series_update(p_series_id, p_scope, p_from, p_rows)`** → rows updated. `following`
  splits: a new series takes the old rule, the non-detached rows from `p_from` on move to it, the
  old `until_date` is shortened to the day before. `all` rewrites the non-detached future rows.
* **`planner_series_delete(p_series_id, p_scope, p_from)`** → rows deleted. `all` removes the
  future rows and the series row; **past occurrences stay** with `series_id` null.

All three are `security invoker` with `search_path = public, pg_temp`, executable by
`authenticated` only, and refuse (never skip) a row that is out of scope or detached. `p_rows` is
a jsonb array of 1–52 objects carrying the `planner_events` insert columns, shape-checked with
strict jsonpath; `starts_at` / `ends_at` must carry an explicit offset. Updates are **by id**, so
the Google mirror sees patches, never delete + insert.

## Course views, gap self-close and the scheduler heartbeat (migrations 110–116)

* **`v_course_stream`** (027; filters and keys 110) — the course Stream, one row per post, 8
  columns `course_id, post_kind, posted_at, ref_kind, ref_id, title, body, meta`. Announcement
  `meta` = `{is_read, is_unread}`; `is_unread` is the bell's predicate (`read_at is null and
  is_read is distinct from true`, 063). File `meta` = `{bucket, file_name, mime_type,
  storage_path, source_url}`. Left out: `my_submissions` files, files whose `notes` carry
  `missing_since_run=`, and `bb_content` nodes with `detail.missing_since`.
* **`v_content_tree`** (027; two columns appended by 111) — Classwork, 19 columns. `missing_since
  uuid` is `bb_content.detail->>'missing_since'` cast: the sync run that first found the node gone
  from Blackboard (the P-98 vanish convention), a projection, not a stored column. `notes` is the
  joined current file's `bb_files.notes`. A node with `missing_since` set is a **ghost** when a
  live node in the same course shares its `bb_item_id`, otherwise **stale**.
* **Gap self-close** (114) — `stage_gaps` questions (`suggested.source = 'stage_gaps'`) close
  themselves when the fact arrives: grading scheme recorded, assignment dated (`due_at`,
  `due_date` or `event_start`), reading dated, file stored or superseded.
  `close_cleared_gaps(p_sync_run_id, p_trigger)` (service_role only) archives each with
  `archived_by = 'stage_gaps'` and `decision = {closed_itself: true, rule, sync_run_id, trigger}`;
  `trigger` is `fold` (from `stage_gaps`, which reports `counts.gaps_closed`) or
  `bb_files_update` (the `bb_files_close_cleared_gaps_trg` statement trigger). A key that
  already closed itself in the last 24 h stays open with `suggested.reopened_within_24h = true`
  and is never machine-closed after that. `attention_answered()` ignores machine-closed rows, so
  a hole that reopens is asked again; a row Stack answered still counts.
* **`v_inbox_feedback`** was dropped by 116 (R-57). `agent_requests.kind = 'inbox_feedback'`
  stays: it is /inbox-apply's kind. /inbox-apply reads `v_inbox_queue` (090).
* **`v_scheduler_heartbeat`** (113) — two rows, `transform` (cron job `bb2dash-transform-tick`)
  and `calendar_push` (`bb2dash-calendar-push`), only for `app_owner()`'s JWT; empty for anyone
  else. Columns: `job, cron_jobname, tick_seconds` (120 for both), `last_tick_at` (newest
  `cron.job_run_details.start_time`), `last_ok_at` (transform: newest `succeeded` cron row;
  calendar_push: newest `calendar_push_runs` row with status `ok`, because the cron row says
  `succeeded` even when the push failed), `consecutive_failures` and `last_error` (failures since
  that last success, and the newest one's message; null when there are none), and `stage`:

  | stage | when (first match wins) |
  |---|---|
  | `off` | cron job inactive or missing; for calendar_push also `app_settings.gcal_enabled` false |
  | `failing` | `consecutive_failures >= 3` |
  | `missing` | never ticked, or the newest tick is more than 600 s old |
  | `late` | the newest tick is more than 240 s old (Home says nothing) |
  | `ok` | otherwise |

  The view is `security_invoker` over `private.scheduler_heartbeat()`, a SECURITY DEFINER function
  in schema `private` (not exposed by PostgREST; usage to `authenticated` and `service_role`
  only) because it reads `cron.*`. The rule itself is `private.heartbeat_stage(last_tick_at,
  now, consecutive_failures, active)`.

## Seed state (2026-09-02)

7 courses, 12 staff, 11 meeting patterns, 127 sessions, 25 grade components, 57 assignments,
75 readings. Weighted schemes sum to 100; IST 323 sums to 100 + 4 EC.

## What Phase 2 (Blackboard pass) must capture

Priority order, because these are the gaps the syllabi could not fill:

1. **IST.352 and IST.466 grading**: method, components, weights → `grading_schemes`,
   `grade_components`. IST.352 assignment list and due dates.
2. **Meeting times** for ECN.304, IST.352, IST.466 → `meetings` (set confidence=confirmed).
3. **GEO.103 recitation**: confirm M003 = Fri 11:40 Maxwell 108.
4. **IST.323**: your Security-in-the-News group + date; your Individual Presentation date once
   chosen; what "Assignment #1" is; your assigned Final Project organization (store in
   `assignments.description` of `IST.323/fp-packet`).
5. **IST.466**: which slot Group #3 has on 10/20–10/22 and 11/17–11/19; the 9/27 and 12/5
   date typos in the schedule doc.
6. **IST.471**: due dates for Assignments 1–7.
7. **Per assignment**: `bb_item_id`, `bb_url`, exact `due_at` (Blackboard gives clock times the
   syllabi don't), points_possible where missing.
8. **Grades already posted** → `assignment_progress.score/score_max/graded_at`, status=graded.
9. **Current status** of the three overdue rows and anything already submitted.
10. **Content tree** per course → `bb_content`; **announcements** → `announcements`.

Reconciliation rule: a Blackboard value overwrites a `syllabus`/`course_deck` value only when the
seed row is `tentative` or `inferred`, or when the field was null. Conflicts with a `confirmed`
seed row get logged in `sync_runs.summary` and surfaced to you rather than silently overwritten,
because syllabus versions change (IST 323 is already on v1.3.1).

## Recurring export path (for "export data regularly")

Blackboard Ultra publishes an **iCal feed** of the calendar (Calendar → settings gear → share /
"Get calendar link"). It carries every due date across all courses and needs no browser session.
That is the low-cost recurring source for `assignments.due_at`; the browser session is for
grades, content, announcements and anything the feed does not carry. Capture the feed URL during
phase 2 and store it in `sync_runs.notes` or a `.env`, never in the repo.
The daily `bb2dash-ical-poll` cron job was retired in migration 127 (Phase 18, R-72): it wrote an
"ok" `sync_runs` row every day with no data. `ical_poll()`, `ical_collect()` and
`app_settings.ical_*` are still defined.

## Access

Supabase MCP (Claude) has full access. RLS is enabled with a permissive policy for the
`authenticated` role; the service-role key bypasses RLS. If a dashboard client uses the anon
key, add Supabase Auth or an anon policy deliberately; do not ship the service key to a browser.
