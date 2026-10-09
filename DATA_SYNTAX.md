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
| `bb_content` | Blackboard content tree node (as you see it); one row per Blackboard item, unique on `(course_id, bb_item_id)` (131); two items may share a path | Blackboard |
| `bb_material_history` | per-crawl history: one row per content item or file that appeared, changed or vanished in a registered crawl (132) | transform (`material_history_record`) |
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
  asks one question (ref `session_link/<file id>`), unless Stack already answered it or the file
  names a lecture number (`file_lecture_no(path, file_name)`, 162): then it takes the week's only
  session that is not an exam, or, when the week has as many lecture numbers as such sessions, the
  session at its rank (0.8; a linked sibling that disagrees, or a lone lecture in a week of two
  sessions, still asks; an open question the rule clears is archived with
  `decision.closed_itself`). Stack's answer counts in state `resolved`, `dismissed` or `archived`
  (163; an archived row that closed itself is not an answer). `link_confidence` is written only where it is
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
* **The store behind uploads and memory** (migrations 190–198: a second vector table with its HNSW
  index, one search over three kinds, the model rule): see "The pgvector store, scoped to bb2dash"
  under Workspace.

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

* **`v_course_stream`** (027; filters and keys 110; material posts from history 133) — the course
  Stream, one row per post, 8 columns `course_id, post_kind, posted_at, ref_kind, ref_id, title,
  body, meta`. Announcement `meta` = `{is_read, is_unread}`; `is_unread` is the bell's predicate
  (`read_at is null and is_read is distinct from true`, 063). File `meta` = `{bucket, file_name,
  mime_type, storage_path, source_url, change, run_id}`. Since 133 a material post is one
  `bb_material_history` row that appeared or changed (`meta.change` = `appeared | changed`,
  `meta.run_id` = the crawl, `posted_at` = its `seen_at`); see "Content identity and history"
  below. Left out: `my_submissions` files, files whose `notes` carry `missing_since_run=`,
  superseded files, and `bb_content` nodes with `detail.missing_since`.
* **`v_content_tree`** (027; two columns appended by 111) — Classwork, 19 columns. `missing_since
  uuid` is `bb_content.detail->>'missing_since'` cast: the sync run that first found the node gone
  from Blackboard (the P-98 vanish convention), a projection, not a stored column. `notes` is the
  joined current file's `bb_files.notes`. A node with `missing_since` set is a **ghost** when a
  live node in the same course shares its `bb_item_id`, otherwise **stale**. Since 130 and 131
  there are no ghosts: 130 merged them into their live twins and 131's key
  `(course_id, bb_item_id)` keeps a rename on the item's own row.
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

## Content identity and history (migrations 130–134)

* **Key** (131) — `bb_content` is unique on `(course_id, bb_item_id)`
  (`bb_content_course_item_key`); the old `(course_id, path)` key is dropped and a plain index
  `bb_content_course_path_idx (course_id, path)` serves path lookups. `parent_id` comes from the
  payload's `parentId`. A rename updates the row and appends the old path to
  `detail.previous_paths` (jsonb array of strings, oldest first; 130 wrote the merged ghosts'
  paths there); `detail.previous_ids` is carried.
* **`stage_content(p_run_id)`** (131) — only the newest registered crawl writes (043/056
  predicate); returns `inserted, updated, unchanged, missing, missing_cleared, title_fallbacks,
  duplicate_paths, unresolved_courses, unresolved_items, items, courses, older_run, run_id`.
  `updated` counts rows where a stored field changed; an unchanged row keeps its `run_id`.
* **`bb_material_history`** (132) — append-per-run, kept in full through the term. Columns `id,
  run_id, course_id, entity ('content' | 'file'), bb_item_id, file_name ('' for content),
  bb_file_id, change ('appeared' | 'changed' | 'vanished'), changed_fields, title, path, seen_at,
  recorded_at`; unique `(run_id, entity, course_id, bb_item_id, file_name)`. Content is keyed
  `(course_id, bb_item_id)` and changes on title, path, url or modified; files are keyed
  `(course_id, bb_item_id, file_name)` from `embeddedFiles` and `detail.file` and change on url.
  Each crawl is diffed against the newest registered crawl folded `ok`/`partial` with an older
  row for the course; a course's first crawl is a baseline with no rows. RLS: the owner reads;
  only `material_history_record(p_run_id)` (service_role) writes.
* **One vanish convention** (P-98) — a vanish is always the run that first missed the item:
  `bb_content.detail->>'missing_since'`, `bb_files.notes` `missing_since_run=<uuid>`, and
  `bb_material_history.run_id` on a `vanished` row. 132 restamped the two older stamps that
  disagreed.
* **Activity** (134) — `sync_change_lines` reads the `history` stage: "N new material(s): A, B,
  C (+k more)", "N material(s) changed: …", "N material(s) no longer in Blackboard: …".
* **Round 2** (138, 139) — `material_history_record` still writes every history row, but its
  counts and `sample` cover materials only (file rows, and document or link nodes no file row of
  the run covers); `path` is a changed field only when the item's own parent or title changed;
  a `/sessions/` url compares as null; `older_run` is true once a newer registered crawl has
  been folded. `stage_content` re-keys a re-created item: one new item and one stored row the
  run does not carry, on the same path with the same `item_kind`, share the row (old id to
  `detail.previous_ids`, link and children kept), counted as `rekeyed`.

## Workspace (migrations 140-143, 190-198)

The Workspace is a chat: a question is a row the browser writes, an answer is a row the container
runner writes, and a queue row joins them. Read-only v1: nothing here can write planner state or a
fact table. Conversations are archived, never deleted (no delete policy on any of the four tables).

**Tables** (140). Every `created_at` / `updated_at` is `timestamptz not null default now()`.

* **`workspace_conversations`** — `id uuid` pk, `created_at`, `updated_at` (trigger
  `set_updated_at()`; since 143 it fires only when `title` or `claude_session_id` changes, so
  archiving or restoring a chat, archiving one that is already archived, or a title set to itself
  leaves `updated_at` alone and does not move the chat in the list; an answer moves it because
  `workspace_finish` writes `updated_at` itself), `title text` 1–120 characters (the first line of
  the first question, cut at 120; the owner may edit it), `claude_session_id text` (null, or
  lower-case uuid-shaped by check: the CLI session the next turn resumes), `archived boolean`
  default false.
* **`workspace_messages`** — `id uuid` pk, `conversation_id` → conversations (cascade),
  `parent_message_id` → messages (set null; an answer's parent is its question), `role`
  (`user` | `assistant`), `request_id` → requests (set null; set on an answer), `tier`
  (`low` | `mid` | `high`), `provider` (`claude-cli` | `ollama` | `frontier-api`), `model` (the
  full model id the CLI reported for the turn when the stream names one, else the alias),
  `content text` default `''`, at most 100000 characters, and at most 8000 on a `user` row,
  `tool_calls jsonb` default `[]`, `finished boolean` default false, `error_code`, `cost_usd
  numeric(10,4)`, `duration_ms integer`, `created_at`. A question is stored trimmed, with
  `finished = true`; `tier`, `provider`, `model` and `request_id` are null on it.
* **`workspace_requests`** — the queue. `id bigint` identity pk, `created_at`, `conversation_id` →
  conversations (cascade), `user_message_id` → messages (cascade), `state` default `queued`,
  `claimed_at`, `claimed_by`, `finished_at`, `attempts integer` default 0, `error_code`. Unique
  partial index `workspace_requests_one_open (conversation_id) where state in ('queued',
  'claimed')`: one open request per conversation.
* **`workspace_runner_heartbeat`** — one row, `id smallint` = 1 by check, `polled_at`, `runner`.
  Empty until the service first runs.

**`tool_calls`** is a json array of at most 20 elements in call order, each `{ "tool": text,
"query": text | null, "scope": text | null, "ok": boolean }`. `tool` is the name after the last
`__` (`search_materials`, `get_material_text`, `list_courses`, `search_context`); `query` is the
call's `q` or `query`, cut at 200 characters; `scope` is the rag `collection`, the materials
`course`, or `text_id` as text; `ok` is false for a denied, failed or unanswered call. The database
checks the array and its length, not the elements.

**`cost_usd`** is the CLI's `total_cost_usd` as reported: Claude Code's own list-price estimate,
not a charge. On a resumed turn it is the session's running total, restarting after an abnormal
exit. Never summed, never shown, not comparable across turns.

**Request states.** `queued` → `claimed` → `done` | `failed`, and `queued` | `claimed` →
`cancelled` (Stop). A `queued` request does not expire. `error_code`, on the request row and on the
answer, is null or one of eight: `budget_exceeded`, `timeout`, `stale_claim`,
`provider_not_configured`, `cli_error`, `cancelled`, `usage_limit`, `sign_in_expired`. The page
chooses its sentence from the request row's code.

**`v_workspace_status`** (140 and 143, `security_invoker`) — always exactly one row: `polled_at`,
`runner` (the heartbeat, both null before the first one), `open_requests integer` and
`oldest_open_at` (the queued and claimed requests), and last `polled_age_seconds integer` (143):
the whole seconds from `polled_at` to the server's `now()`, rounded down, never negative, null
before the first heartbeat. Offline = no heartbeat, or one older than 120 s, measured as
`polled_age_seconds` plus the time since the page read it; the browser's wall clock is never
compared with `polled_at`.

**The browser's functions** (140; `security invoker`, `search_path = public, pg_temp`):

* **`workspace_prompt_max()`** → `integer`, 8000 (`authenticated`, `service_role`). The web holds
  the same number as `WORKSPACE_PROMPT_MAX`.
* **`workspace_ask(p_conversation_id uuid, p_text text)`** → `jsonb` `{conversation_id,
  message_id, request_id}` (`authenticated`). Creates the conversation when the id is null, then
  the user message and a `queued` request. Raises **22023** for text that is empty or over 8000
  characters after trimming, and for nothing else; a second open request in the conversation raises
  **23505** from `workspace_requests_one_open`.
* **`workspace_cancel(p_request_id bigint)`** → `boolean` (`authenticated`). `queued` or `claimed`
  → `cancelled`, with `error_code = 'cancelled'` and `finished_at` on the request row; true when a
  row changed.

**The runner's functions** (142; `security definer`, executable by `workspace_runner` only). A
refusal one raises itself is **22023**, in a message that starts with the function's name.

* **`workspace_claim(p_runner text)`** → at most one row `(request_id bigint, conversation_id
  uuid, user_message_id uuid, prompt text, claude_session_id text, prior_tier text, history
  jsonb)`. First sweeps claims older than 10 minutes to `failed` / `stale_claim` (request row and
  answer). Then (143) finishes an answer still unfinished although its request closed
  (`cancelled`, `failed` or `done`) more than 10 minutes ago: `finished = true` and the request's
  own `error_code`, nothing else written and nothing broadcast. The 10 minutes are strict
  (`finished_at < now() - interval '10 minutes'`): a request closed exactly 10 minutes ago waits
  for a later poll. The runner kills a turn at 480 s and makes its last finish try at most 110 s
  later, so no finish of a live turn is still on its way; one that came later would still store
  its text on a cancelled request. A closed request with no `finished_at` is left alone. Then
  claims the oldest `queued` request (`for update skip locked`, `attempts + 1`).
  `history` is the last 20 messages before the request's own user message, oldest first, as
  `[{role, content}]` (`[]` for a first question; the question itself is `prompt`). `prior_tier`
  is the tier of the conversation's latest answer, null when there is none. It does not stamp the
  heartbeat.
* **`workspace_begin(p_request_id bigint, p_tier text, p_provider text, p_model text)`** → `uuid`,
  the new answer's id (`finished = false`, parent = the question, `model` = the alias). Refuses a
  request that is not `claimed`, and a second call for one request.
* **`workspace_stream(p_request_id bigint, p_seq integer, p_delta text)`** → `boolean`. False,
  sending nothing, unless the request is still `claimed`. An empty delta sends nothing and consumes
  no `seq`. Refuses a delta over 16000 characters and a `seq` below 1.
* **`workspace_finish(p_request_id bigint, p_state text, p_content text, p_tool_calls jsonb,
  p_error_code text, p_cost_usd numeric, p_duration_ms integer, p_claude_session_id text, p_model
  text)`** → `void`. `p_state` is `done` or `failed`. Since 143 it refuses (22023) a request that
  is not `claimed` or `cancelled`, so a request already `done` or `failed` cannot be finished
  again and its stored answer cannot be written over. A cancelled request stays cancelled and its
  answer gets `cancelled`; a claimed request takes `p_state`, `finished_at` and `p_error_code`.
  Content is cut at 100000 characters and `p_tool_calls` to its first 20 elements, neither refused
  for length. A non-null `p_model` replaces the alias. The conversation's `claude_session_id` is
  stamped, null when `p_claude_session_id` is not uuid-shaped, and its `updated_at` is set to
  `now()` by the function itself (the trigger is silent when the session id stays the same).
* **`workspace_heartbeat(p_runner text)`** → `void`. Upserts the one heartbeat row; called every
  30 s.

**Realtime** (141). Private Broadcast topic `workspace:<conversation uuid>`, two events:
`delta` `{request_id, seq, delta}` (`seq` starts at 1 and rises by 1 per flush) and `done`
`{request_id, message_id, state}`; `realtime.send` adds an `id` key to each. Policy
`workspace_owner_receive` on `realtime.messages` lets the owner SELECT broadcast rows while
`realtime.topic()` is `workspace:%` (which also covers `workspace:lobby`). There is no insert
policy: clients only receive. A missed broadcast costs live text, never the answer; the stored row
is the record.

**Access.** RLS: the owner (`(select auth.uid()) = (select public.app_owner())`) reads all four
tables; `anon` holds nothing. `authenticated`'s writes are **column-level** (the first such grants
here): insert `title` and update `title`, `archived` on conversations; insert `conversation_id`,
`role`, `content`, `finished` on messages (policy: `role = 'user' and finished`); insert
`conversation_id`, `user_message_id` and update `state`, `error_code`, `finished_at` on requests
(policies: insert `queued` only, and only naming a `user` message of the same conversation; update
only `queued` | `claimed` → `cancelled` with `error_code = 'cancelled'`). It can never
write `claude_session_id`, `tier`, `provider`, `model`, `tool_calls`, `cost_usd`, `claimed_by` or
`attempts`. **`workspace_runner`** (142) is a login role, noinherit, nobypassrls, `statement_timeout
= 15s`, with no table, view or sequence privilege in `public`: it reaches the queue only through
its five functions. Its password is set out of band and is in no file. `db_test_runner` holds
`insert, update, delete` on the four tables and the role `workspace_runner` with inherit false, for
the `phase21_*` units.

**Phase 24a objects (migrations 190–198).** Everything below is additive; 198 drops one policy. A new
table in `public` starts with every command open to `anon` and `authenticated`, so each is revoked
first and then granted what the owner needs. Every policy names `app_owner()` in the initplan form.

* **`workspace_documents`** (190) — one row for each upload and each remembered item: `id bigint`,
  `kind` (`upload` | `memory`), `title` (1–200), `course_id` → `courses` (set null),
  `conversation_id` → conversations (cascade), `storage_key`, `mime` (the six types), `byte_size`
  (1–20971520), `sha256`, `state` (`stored`, `reading`, `text_ready`, `indexed`, `failed`,
  `deleting`), `error_code` (`too_large`, `bad_type`, `bad_bytes`, `no_text`, `extract_timeout`,
  `extract_failed`, `too_many_units`, `link_expired`, `download_failed`, `embed_failed`), `attempts`
  (0–3), `signed_url` and `signed_url_expires_at` (written and cleared together), `claimed_at`,
  `claimed_by` (the ingest lease), `created_at`, `updated_at`. Three CHECKs: `storage_key` holds
  lower-case letters, digits and `/ . _ -` only; `signed_url` is null or this project's host, the
  bucket's signed path, this row's own `storage_key`, then a query string; an upload's `sha256` is 64
  lower-case hex characters and its `storage_key` is `u/` + the hash. A unique index on `sha256`
  where `kind = 'upload'`, and one on `conversation_id` where `kind = 'memory'`. The owner selects
  and updates `title` and `course_id` (column grant); nothing else is written directly.
* **`workspace_document_text`** (190) — the text units: `id`, `document_id` (cascade), `unit_kind`,
  `unit_no`, `text`, `fts` (generated, GIN `workspace_document_text_fts_idx`), `embedded_at` (null
  until the unit's vector is stored). Unique on `(document_id, unit_kind, unit_no)`. The owner selects.
* **`workspace_text_embeddings`** (190) — one vector for each part of such a unit: `text_id`
  (cascade), `part_no`, `part_range`, `model` (not null), `embedding extensions.vector(384)` (not
  null), `embedded_at`. Unique on `(text_id, model, part_no)`; HNSW cosine index
  `workspace_text_embeddings_hnsw`. The browser holds no privilege on it.
* **`v_workspace_memory`** (190, security invoker) — `document_id`, `conversation_id`, `state`,
  `created_at`, `updated_at`, `summary` for each remembered item.
* **The owner's functions** (SECURITY DEFINER, `search_path = public, pg_temp`, `authenticated` only,
  each refusing anyone but the owner first with 42501): `workspace_upload_register(p_sha256,
  p_title, p_mime, p_byte_size, p_signed_url, p_signed_url_expires_at, p_course_id)` → `{id, state,
  existing}` (an upsert on the hash: a second call returns the first row with `existing` true),
  `workspace_upload_retry(p_document_id, p_signed_url, p_signed_url_expires_at)` (a `failed` upload
  goes back to `stored`), `workspace_document_delete(p_document_id, p_object_removed)` (a memory item
  goes whole and sets `memory_opt_out`; an upload goes in two steps: `false` removes its units and
  vectors and leaves the row in `deleting` with its key, `true` drops a row in `deleting`), and
  `workspace_ask_with(p_conversation_id, p_text, p_options)` (194; calls `workspace_ask` and stores
  the options and attachments).
* **`workspace-uploads`** (191) — a private bucket, 20 MiB a file, six types, four owner policies on
  `storage.objects`; an object is put under `u/` + the SHA-256 of its bytes.
* **Search** (192, SECURITY INVOKER, `service_role` only): `workspace_search(p_q, p_query_embedding,
  p_kinds, p_courses, p_limit, p_min_similarity, p_model)`, its twin `hybrid_search_workspace_text`
  (ranks as `hybrid_search_file_text` does, uses no index) and `workspace_attachment_read(p_kind,
  p_id, p_max_chars)`.
* **The ingest worker** (193): login role `workspace_ingest_runner` (no table grant, password set out
  of band, in no file) and its four functions `workspace_ingest_claim`, `workspace_ingest_put_text`,
  `workspace_ingest_finish`, `workspace_ingest_heartbeat`; the table `workspace_ingest_heartbeat`
  (one row, `id = 1`). A claim hands over one document at a time, with a 10-minute lease and
  `for update skip locked`; a step is tried 3 times.
* **Options and routines** (194): `workspace_routines` (six rows: `quiz`, `study-guide`,
  `explain-file`, `summarise-reading`, `plan-week`, `draft-help`; `needs` is `nothing`, `file` or
  `course_or_file`), `workspace_request_options` (`course_display_id`, `course_ids`, `depth` `auto` |
  `quick` | `standard` | `deep`, `routine_id`, `format` `plain` | `rich`) and
  `workspace_request_attachments` (up to five, files first, then uploads).
* **Turn state** (195): `workspace_profile` (one row; `about_me` up to 2,000 characters, the owner's
  only direct write there; `memory_since`, stamped once by the first memory job claim),
  `workspace_conversation_state` (rolling summary and its through-point, the job lease and failures,
  `memory_opt_out`, `memory_written_at`), `workspace_turns` (one row for each answered request: ids,
  counts and timings, no text) and `workspace_sources` (at most 40 rows for each request: kind
  `material` | `upload` | `memory` | `feed`, origin `auto` | `attached` | `tool`, ids and a title,
  never a passage).
* **The runner's six new functions** (196, SECURITY DEFINER, `workspace_runner` only, which now
  executes eleven and still holds no table, view or sequence grant): `workspace_claim_v2`,
  `workspace_turn_context` (a jsonb of eleven keys), `workspace_turn_put`, `workspace_planner_feed`
  (a jsonb of eight keys; the window is clamped to 180 days either side of today in New York and the
  courses are the request's own stored scope), `workspace_job_claim` and `workspace_job_finish` (a
  rolling summary, or a remembered item written as an upsert on its conversation).

### The pgvector store, scoped to bb2dash

One retrieval store inside the bb2dash project, schema `public`, vector type from the `vector`
extension in schema `extensions`. It holds three kinds of content, all embedded with `gte-small` at 384
dimensions so cosine similarity orders hits across kinds: `material` (course files), `upload` and
`memory`. No second project and no schema of its own; nothing in it reads or copies the vault's
`harness-memory` store.

**Its objects.** `vector` (extension); `bb_file_text` and `bb_text_embeddings` with the HNSW cosine
index `bb_text_embeddings_hnsw` (course files); `search_file_text`, `match_file_text` and
`hybrid_search_file_text` (their searches); `v_embedding_status`; the edge functions `embed-corpus`
and `search`; and, new in 24a, `workspace_documents`, `workspace_document_text`,
`workspace_text_embeddings` with the index `workspace_text_embeddings_hnsw`, `v_workspace_memory`,
`workspace_upload_register`, `workspace_upload_retry`, `workspace_document_delete` (190),
`workspace_search`, `hybrid_search_workspace_text`, `workspace_attachment_read` (192),
`workspace_ingest_claim`, `workspace_ingest_put_text`, `workspace_ingest_finish`,
`workspace_ingest_heartbeat` and the table `workspace_ingest_heartbeat` (193), `workspace_job_finish`
(196), `v_workspace_index_status` (197) and the edge functions `workspace-embed` and
`workspace-search`. The five **content tables** are `bb_file_text`, `bb_text_embeddings`,
`workspace_documents`, `workspace_document_text` and `workspace_text_embeddings`.
`workspace_ingest_heartbeat` is the sixth table and holds no content.

**One search, the kind on every hit.** `workspace_search` returns rows of kind `material`, `upload` or
`memory`, never null, each with its unit id (`bb_file_text.id` with `file_id`, or
`workspace_document_text.id` with `document_id`), course, title, unit, part, `similarity`, `score`, a
passage of at most 2,000 characters and `has_notes`. It calls `hybrid_search_file_text` once for each
course of the scope and `hybrid_search_workspace_text`, and keeps at most `p_limit` rows of each kind.
With a scope, course materials and course-tagged uploads are filtered; untagged uploads and every
remembered item are always searched. A document in `deleting` or `failed` is never returned.

**The model rule, and its limit.** Every vector row names its `model` (not null) and the model is part
of the key `(text_id, model, part_no)`, so vectors of two models can stand side by side. The search
ranks one model at a time (`p_model`, default `gte-small`, handed to both arms). So a re-embed is
rows, not schema: write the corpus again under the new name, switch `p_model`, delete the old rows.
That holds for a model of **384 dimensions**; a model of another size needs a new column and a new
index (011 did that while the table was empty). `gte-small` stays; no model is changed in 24a.

**What the index does today.** Both vector columns have an HNSW cosine index. The hybrid searches
(`hybrid_search_file_text`, `hybrid_search_workspace_text`) measure every part in scope and keep the
best part of each unit: an exact comparison, never an index scan, and the ranking Phase 18 timed and
pinned. The index serves a nearest-first query with a limit, the shape of `match_file_text`
(mode `vector` of the `search` function). Moving the hybrid search onto the index is a change to two
function bodies in a new migration; the moment for it is when the hybrid search's timed median passes
the 60 ms ceiling of Phase 15.

**Every write is an upsert on a key, so a second write of the same thing changes no count.**

| what is written twice | the key | what the second write does |
|---|---|---|
| a part of a course unit | `(text_id, model, part_no)` | nothing: `embed-corpus` takes a duplicate as stored |
| the same file from his device | the SHA-256 of its bytes (unique among uploads) | nothing: `workspace_upload_register` returns the row that holds the hash |
| the units of one document | `(document_id, unit_kind, unit_no)` | `workspace_ingest_put_text` replaces the set in one transaction |
| a part of an upload's or a remembered item's unit | `(text_id, model, part_no)` | nothing: `workspace-embed` takes a duplicate as stored |
| a conversation's remembered item | one memory row for each conversation | the same summary writes nothing; a new one replaces the unit, removes its vectors and puts the document back in `text_ready` with attempts 0 |

**The queue and the status.** An upload moves `stored` → `reading` → `text_ready` → `indexed`, or ends
`failed`; a remembered item starts at `text_ready`. `v_workspace_index_status` (197, security invoker)
is one row with these columns: `course_units_indexed`, `course_units_waiting`, `course_last_embedded`,
`course_files_text_pending`, `uploads_indexed`, `uploads_waiting`, `uploads_failed`,
`upload_links_expired`, `uploads_deleting`, `memory_indexed`, `memory_waiting`, `memory_failed` and
`ingest_polled_age_seconds`. It reads no table of the `storage` schema. A course unit has no failed
state: one that could not be embedded still waits and is tried at the next sync.

**Direct touches.** Three older ones stand, one is closed by 24a, and 24a adds two (both the
page's). (1) The sync inserts a course file's units into `bb_file_text` over REST with the publishable
key, under the insert-only policy `bb_file_text_anon_insert` (007). (2) `get_material_text` reads one
course unit from `bb_file_text` over REST with the service key. (3) The owner's session holds the owner
policy on both course tables, for every command (020). (4) *Closed by 198:* the policy
`bb_text_embeddings_anon_insert` (010) let a holder of the publishable key insert a vector row; 198
drops it, and `embed-corpus` writes with the service role, which bypasses row security. (5) The page
reads remembered summaries through `v_workspace_memory`, a view over a table the owner's session may
read; that grant also lets the owner's session read the units of his own uploads, which no page code
does. (6) The page selects the catalog rows of `workspace_documents` and updates two columns of it,
`title` and `course_id`. No service built in 24a reads or writes a unit or a vector except through a
named function.

**The two exceptions that come through the public keys.** "Reached only with bb2dash's own
credentials" is not true without them: the publishable key may insert into `bb_file_text` (touch 1),
and any valid JWT, the public anon JWT included, reads course passages through `search` and may start
the two embedders, which write only vectors of text that is already stored. Uploads and memory never
pass through `search`.

**It reads no other project.** No foreign server and no foreign table exist; `dblink`,
`postgres_fdw` and `wrappers` are not installed; no function that names a store table calls out. The
proofs are `db/tests/phase24_store_proof.sql`.

**What would have to change to lift it into a project of its own.** The largest piece is on the course
side: `hybrid_search_file_text`, `match_file_text`, `search_file_text` and `v_embedding_status` join
`bb_files` for a unit's course, bucket, file name and whether the file was replaced, and
`bb_file_text.file_id` is a foreign key to it. A store in its own project would need those four values
on its own side, kept current by the sync. The upload and memory half has no such join. Five objects
span both sides, and a move splits each one or leaves it calling across:

| object | its store side | its app side |
|---|---|---|
| `workspace_document_delete` | removes a remembered item, its unit and its vectors | sets `memory_opt_out` in `workspace_conversation_state`, in the same transaction |
| `workspace_job_finish` | writes a remembered item and its unit | writes the job's columns in `workspace_conversation_state` |
| `workspace_turn_context` | reads an attached upload's title and state from `workspace_documents` | the runner's read of a request: options, messages, course list |
| `workspace_ask_with` | checks that an attached upload exists in `workspace_documents` | stores the request's options and attachments |
| `v_workspace_index_status` | counts the store's rows and reads `workspace_ingest_heartbeat` | reads `bb_files.text_status` for `course_files_text_pending` |

`workspace_documents` also carries two ids of app rows, `conversation_id` and `course_id`, which in a
move are plain ids, as are the foreign keys from an app row to a store row (an attachment's and a
source's `document_id`). A service holds function names and an address, not table names; the page holds
one table and two views besides (`workspace_documents`, `v_workspace_memory`,
`v_workspace_index_status`).

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
