# R1 GUI binding audit: what the artboards display vs what the database holds

Date: 2026-09-08. Agent: R1 (research). Sources read: `gui research context/gui/README.md`, `00-mvp-plan.dc.html`, `13-home-v2.dc.html`, `14-course-v2.dc.html`, `03-lecture.dc.html`, `04-assignment.dc.html`, `support.js`, `12-home-options.dc.html` (ids only), `db/migrations/001..009`, `db/seed/002`, `docs/planning/DB_VIEWS_2026-09-08.sql`, `docs/planning/DB_PROFILE_2026-09-08.json`, `DATA_SYNTAX.md`, `PHASE2_FINDINGS.md`, `NOTES.md`, `ingest/bb_crawler.js`.

## How to read this

Every data-bearing element in the five current artboards gets one row. Status vocabulary as briefed: AVAILABLE (populated for all courses), PARTIAL (populated but with named holes), DERIVABLE (data exists, needs a view or computation), MISSING-INGEST (Blackboard has it, we do not capture it), MISSING-INPUT (only Stack or a new table can supply it), NOT-A-DATA-ITEM.

Two facts to hold while reading. First, `support.js` is only the Claude Design runtime bundle; it carries no shared components and no sample data. Every sample row lives inline in each artboard's `<script data-dc-script>` block, in `renderVals()`. So the artboards' `raw`, `rawItems`, `courses` and `W` arrays are the binding contract, and I read them as such. Second, the artboards were composed against the 2026-09-02 snapshot; several things they call unknown are now known (IST.352 and IST.466 grading are both resolved), and several things they show as populated are still empty (session file links, scores).

Counts quoted are from `DB_PROFILE_2026-09-08.json` unless marked inferred.

## Baseline coverage the whole matrix leans on

| Fact | Number today | Where it hurts |
|---|---|---|
| `assignments` rows | 66 | |
| with `due_at` (exact clock time) | 31 of 66 | tracker times, "3:45p" labels |
| with `due_date` only | 31 of 66 | day-granular placement is fine, time labels are not |
| with no date at all | 9 of 66 | cannot be placed in the tracker, week rail, or "next due" |
| with `points_possible` | 40 of 66 | effort multiplier, week-rail rings, "N pts" chips |
| with `bb_column_id` | 29 of 66 | grade join, "bb column _812…" |
| with `description` | 66 of 66 | assignment popout Instructions is fully fed |
| `assignment_progress` rows | 65 of 66 | `v_upcoming` coalesces, so effectively complete |
| progress rows with a score | 5 | every grade surface |
| `sessions` | 145 (all with topic and `week_no`) | zero for IST.471 and GEO.103.recitation |
| `meetings` | 11 patterns | zero for IST.471 |
| `readings` | 86 (76 with `for_date`) | IST.466's 10 are undated |
| `reading_progress` | 75 of 86 readings | 11 readings have no progress row |
| `announcements` | 11 (2 with `is_read` true) | zero for GEO.103 (either shell) |
| `bb_files` | 64 | `session_id` on 2, `assignment_id` on 29, `week_no` on 16 |
| `bb_file_text` | 534 units across 63 of 64 files | popout bodies could be fed from this |
| `bb_content` | 139 (`assignment_id` on 21) | no session link at all |
| `grading_schemes` | 6 of 7 courses | GEO.103.recitation has no row |
| `grade_components` | 35 | `assignments.component_id` coverage not profiled |
| `sync_runs` | 12, `summary` free-form jsonb | needs-attention conflict count |
| `v_course_grade` | does not exist | every Grade field |

The 9 undated assignments, identified from the per-course-per-type table: GEO.103.recitation quiz (1), GEO.103.recitation discussion_post (1), IST.323 homework (1), IST.323 presentation (1), IST.323 group_presentation (1), IST.466 project (1), IST.352 project (1 of 2), ECN.304 quiz (1 of 3), IST.471 paper (1 of 2, the A7 final reflection that run 10 records as having no gradebook column yet).

## Matrix A: top nav and chrome (T-16), present on 13 and 14

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| `nav.nv` brand, Home / Planner / Grades / Materials | none | routing | NOT-A-DATA-ITEM |
| ☰ Courses button, `toggleCourses` | none | UI state | NOT-A-DATA-ITEM |
| Courses pop-down, `sc-for {{ courses }}` → `c.code` | display code "IST 323" | `courses.subject`, `courses.number` | AVAILABLE. `courses.id` uses dots; the space form is a render rule. GEO's two shells must be merged to one row (00 assumptions line 98) |
| … `c.title` | course name | `courses.title_short` | AVAILABLE (7 of 7) |
| … `c.openLabel` ("due this week →") | count of items due Mon-Sun | computed from `v_upcoming` | DERIVABLE |
| Bell button badge `.bd` = "3" | unread announcement count | `announcements.is_read` | AVAILABLE. 11 rows, 2 read, so 9 unread today, not 3. `is_read` is nullable, so the predicate must be `is_read is distinct from true` |
| Bell popout row: course chip ("IST 466") | course code | `announcements.course_id` → `courses` | AVAILABLE |
| Bell popout row: author ("Corsello", "Larche", "Wilson", "Croad") | announcement author | no column exists | MISSING-INGEST. `announcements` (001 + 004) has id, course_id, posted_at, title, body, bb_item_id, captured_at, is_read. `bb_crawler.js` line 85 maps only id/title/created/modified/start/isRead/body from `/learn/api/v1/courses/{C}/announcements`; the creator field is dropped at the crawler, not at the DB. Cheap fallback: join `course_staff` instructor name (DERIVABLE, wrong when a TA posts) |
| Bell popout row: date ("Tue 9/1") | post date | `announcements.posted_at` | AVAILABLE |
| Bell popout row: headline text | one-line summary | `announcements.title` plus first line of `body` | AVAILABLE (title nullable in schema; profile does not report title coverage, flag) |
| Bell popout row: unread dot / dimmed row | read state | `announcements.is_read` | AVAILABLE |
| "3 unread" label | same count as badge | as above | AVAILABLE |
| "Mark all read" | write | `update announcements set is_read = true` | AVAILABLE as a write path; needs the T-14 auth story, and a decision on whether this is Blackboard's read state or Stack's |
| "See all 8 →" | total announcements | `count(announcements)` | AVAILABLE (11 today) |
| GEO 103 bell row in the mockup | | GEO has 0 announcements in either shell | not backed by data; treat that row as illustrative |
| User / account button | none | single user | NOT-A-DATA-ITEM |

## Matrix B: Home v2 (`13-home-v2.dc.html`)

### B1. Page header

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| `card-kicker` "Thursday · September 3, 2026 · Week 2 of 16" | today's date; term week number; total weeks | clock plus `terms.start_date` = 2026-08-24, `terms.end_date` = 2026-12-15 | DERIVABLE. `floor((current_date - terms.start_date)/7) + 1`. Note the dates span 16.4 weeks, so "of 16" needs a stated convention |
| `<h1>` "Today" | none | | NOT-A-DATA-ITEM |
| "Mockup 13" tag, Options / Plan buttons | none | artboard chrome, drop in the app | NOT-A-DATA-ITEM |

### B2. Upcoming work tracker header

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| `{{ totalN }}` items | count over the 56-day window | `v_upcoming` filtered to window | DERIVABLE |
| `{{ totalEff }}` effort pts | sum of effort score | see Deep dive 1 | DERIVABLE, blocked on effort inputs |
| "8 weeks" | window length | constant (56 days in `renderVals`) | NOT-A-DATA-ITEM |
| Legend R / A / Q / P / E | `assignment_type` → 5 display categories | `assignments.type` | PARTIAL. `13-home-v2`'s `CAT` map covers reading, form, discussion, homework, quiz, presentation, project, paper, exam. It uses `discussion`, but the enum value is `discussion_post`. It omits `lab` entirely (14 adds it). Across the enum, 7 of 66 rows fall outside even the T-15 text: `other` (3), `checkpoint` (2), `meeting` (1), `evaluation` (1). Add `attendance` and `participation` to the map for completeness even though neither has rows yet |
| ◂ ▸ paging, "Open planner →" | none | UI state, routing | NOT-A-DATA-ITEM |

### B3. Tracker day column (`sc-for {{ days }}`, 56 columns, 14 visible)

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| `d.monLabel` (month name on the 1st) | date | clock | NOT-A-DATA-ITEM |
| `d.countLabel` (items due that day) | count per day | `v_upcoming` grouped by `coalesce(due_at::date, due_date)` | DERIVABLE |
| `d.segs` (one bar per item, `h = eff * 7`, `bg` by category) | per-item effort and category | `assignments.type` plus effort score | DERIVABLE, blocked on effort |
| `d.dowLabel`, `d.dn`, weekend tinting | date | clock | NOT-A-DATA-ITEM |
| `d.weekStart` Monday rule | date | clock | NOT-A-DATA-ITEM |
| `d.colBg` / `d.ring` selection | selected index | UI state | NOT-A-DATA-ITEM |
| Footer "Sep 3–9 · {{ wk1N }} items · {{ wk1Eff }} pts" | per-week rollups | same as above | DERIVABLE |

Note on the window: the tracker renders 56 days from today, but `v_upcoming` has no upper bound and filters out `submitted`, `graded`, `excused`, `not_applicable`, `waived`, `missed` (migration 009). That is right for "upcoming work" and wrong for a calendar strip, since a submitted item silently vanishes from the bar rather than showing as done. The app will want either a second view or a `show_completed` flag.

### B4. Tracker detail panel (`sc-for {{ selItems }}`)

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| `{{ selLabel }}` ("Thu, Sep 9") | selected date | clock | NOT-A-DATA-ITEM |
| `{{ selCount }}` due, `{{ selEffort }}` effort pts | per-day rollups | as B3 | DERIVABLE |
| `it.g` glyph + `it.bg` / `it.fg` | type → category | `assignments.type` | PARTIAL (see legend row above) |
| `it.course` ("IST 323") | course code | `courses` via `v_upcoming.course_id` | AVAILABLE |
| `it.title` | title | `v_upcoming.title` (= `assignments.title`) | AVAILABLE |
| `it.time` ("3:45p", "before 3:30p", "11:59p", "deadline", "2:00p · in class") | clock time, or a rule phrase, or a channel hint | `assignments.due_at` (31 of 66), `assignments.due_rule`, `assignments.submission` | PARTIAL. The 35 rows with no `due_at` can only render a `due_rule` phrase; `due_rule` coverage is not in the profile, flag it. "· in class" needs `submission = 'in_class'`; that column's coverage is also unprofiled |
| `it.effLabel` ("3 pt") | effort score | Deep dive 1 | DERIVABLE |
| `it.startBy` ("Mon 9/7" / "day of") | suggested start date | Deep dive 2 | DERIVABLE |
| `it.status` ("not started", "planned", "in progress") | planner status | `assignment_progress.status` via `v_upcoming.status` | AVAILABLE. Display strings need an enum-to-label map (`not_started` → "not started") |
| `it.sampleDisplay` "sample" chip | whether the row is illustrative | not a runtime concept | NOT-A-DATA-ITEM. See Deep dive 10 for what the sample rows imply |
| "status is click-to-edit (T-06)" | write path | `assignment_progress` update | AVAILABLE as a write; needs auth |
| Empty state "Nothing due" | count = 0 | | NOT-A-DATA-ITEM |

### B5. Needs attention (collapsed row 5a) and its expanded list

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| "1 overdue" count | past-due, still open | `v_overdue` | AVAILABLE, but two definitions are in play. The README says "due < now and status ≠ submitted"; `v_overdue` requires status in (`not_started`, `planned`, `in_progress`), which excludes the 3 rows currently marked `missed`. Under `v_overdue` the count today is smaller than the honest one. Pick one and write it down |
| "1 conflict" count | reconciliation conflicts | `sync_runs.summary` | MISSING-INPUT in practice. `summary` is free-form jsonb and its shape varies per run: run 2 has `conflicts_with_confirmed_seed` (array of 3 prose strings), runs 7/8/11 use `gaps_open`, run 10 uses `stack_must_confirm: 7`, run 12 uses `observations` and `lessons`. There is no stable key and no structured before/after. Cheapest fix is a typed `sync_conflicts` table (run_id, entity, entity_id, field, seed_value, bb_value, resolved_at, resolution) written by the transform |
| "2 missing" count | grading scheme unknown | README says `grading_method = 'unknown'` | The predicate now returns 0. All 6 `grading_schemes` rows are non-unknown and `confidence = confirmed` (IST.352 weighted_pct, IST.466 points/1020). The real "missing" signal has moved: GEO.103.recitation has no `grading_schemes` row at all (6 rows, 7 courses), 26 of 66 assignments have no `points_possible`, and 9 have no date. Redefine the count |
| "1 deadline" count | non-graded dated obligations | `assignments` where `points_possible is null` and type in (`other`, `form`) | DERIVABLE, needs a definition. The example (IST 323 Orange Inclusive Access opt-out, 9/14) does exist as a row per PHASE2 |
| "last sync today 09:14" | most recent run | `max(sync_runs.ran_at)` | AVAILABLE (12 runs, latest 2026-09-08T17:37Z) |
| Expanded overdue row text ("unopened, marked missed") | BB submission state plus planner status | `assignments.bb_submission_status` (UNOPENED on 16 rows) plus `assignment_progress.status` | AVAILABLE |
| Expanded conflict row text ("due moved 9/2 → 9/9, syllabus v1.3.1 vs Blackboard") | old value, new value, both sources, syllabus version | nothing structured; the prose lives in `sync_runs.summary` strings, and the syllabus version string exists only inside `assignments.source_ref` text | MISSING-INPUT. Same fix as the conflict count |
| Expanded missing row text ("Grading schemes unknown for IST 352 and IST 466") | | stale as of today | rewrite against the live predicate |
| Expanded deadline row text | title plus date | `assignments` | AVAILABLE |
| "Override if done in class" / "Resolve" links | write paths | `assignment_progress`, conflict resolution | AVAILABLE / MISSING-INPUT respectively |

### B6. Course cards (3c), `sc-for {{ courses }}`

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| `c.code` | display code | `courses.subject`, `.number` | AVAILABLE |
| `c.title` | short name | `courses.title_short` | AVAILABLE. The card text is shorter than the stored value for IST.352 ("Info Analysis of Org Systems" vs "Info Analysis of Organization Systems"), so the card needs a truncation rule, not a new column |
| `c.meet` ("MW 3:45–5:05", GEO's "MW 10:35–11:30 · F 11:40–12:35") | weekday pattern and times | `meetings.day_of_week`, `.start_time`, `.end_time` | PARTIAL. 11 patterns cover 6 shells; IST.471 has none. GEO needs a union across the lecture and recitation shells, which is the same merge the pop-down needs |
| `c.room` ("Hinds 010", GEO's "Watson · Maxwell 108") | room | `meetings.location`, falling back to `courses.location` | PARTIAL, plus a live conflict: `meetings.location` for GEO.103.recitation says "Maxwell Hall 140" while `courses.location` says "Maxwell Hall 108" and the artboard says 108. NOTES caveat 3 flags the recitation room as assumed. Surface it rather than picking silently |
| IST 471 card showing "Online / SU ITS" | no meeting pattern | `courses.location` = 'Online', `courses.kind` = 'internship' | DERIVABLE fallback |
| `c.nextDate` ("Wed 9/9") | earliest upcoming due date for the course | `min(coalesce(due_at, due_date))` over `v_upcoming` per course | DERIVABLE, degraded by the 9 undated rows |
| `c.nextText` ("2 quiz · 1 assignment") | typed counts on that date | group by the display category on `nextDate` | DERIVABLE. Categories are the 5-way glyph map, so the same enum-coverage caveat applies |
| `c.grade` ("10 / 10 pts", "scheme unknown", "—", "attendance 100", "weights unknown", "0 / 150 hrs") | current grade per grading method | `v_course_grade` does not exist | see Deep dive 3. Effectively MISSING today for all 7 shells |
| `c.open` (Open = items due this week) | count in the current Mon-Sun window | `v_upcoming` per course | DERIVABLE, see Deep dive 4 |
| `c.note` one-liner | heterogeneous | `courses.group_notes` (IST.466's "Ethics Group #2 · Major Case Group #3" is verbatim `group_notes`), `courses.notes`, `grade_components.notes` (ECN's "lowest dropped"), or a computed status rollup (IST.352's "3 marked missed · 2 awaiting grade") | PARTIAL. Four different sources feed one slot with no precedence rule. Define the precedence or split the slot |
| `c.meetDots` `m.bg` (M-F strip, meeting days filled) | which weekdays the course meets | `meetings.day_of_week` in 1..5 | PARTIAL, see Deep dive 5 |
| `c.meetDots` `m.dot` (dot = something due that weekday) | due-date presence per weekday this week | `v_upcoming` bucketed by weekday | DERIVABLE |
| `c.meetDots` `m.l` ("MTWTF") | constant | | NOT-A-DATA-ITEM |
| Section subtitle "Open = items due this week · strip = meeting days, dot = something due" | | static copy | NOT-A-DATA-ITEM |

## Matrix C: Course page v2 (`14-course-v2.dc.html`)

### C1. Course sub-bar

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| Course code + title | | `courses` | AVAILABLE |
| Stream / Grades / Materials / Info tabs | | routing | NOT-A-DATA-ITEM |
| "MW 3:45–5:05 · Hinds 010 · Croad" | meeting pattern, room, instructor surname | `meetings` plus `course_staff` where `role = 'instructor'` | PARTIAL. 6 of 7 shells have meetings; every shell except GEO.103.recitation has an instructor row (the recitation has only a TA, Cheyenne Morris) |
| "Blackboard" button | deep link | `courses.bb_url` | AVAILABLE (migration 004 set all 7) |
| Courses pop-down with per-course counts and an "open" marker | due-this-week counts, current course | as Matrix A | DERIVABLE |

### C2. Sticky week rail 1-16 (option 6b)

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| `w.n` (1..16) | term week numbers | `terms.start_date` (2026-08-24) | DERIVABLE. `sessions.week_no` is populated on all 145 rows and agrees, so either source works for the 5 shells that have sessions; the rail must not depend on sessions, because IST.471 and GEO.103.recitation have zero |
| `w.range` ("Aug 24 – 28") | week bounds | derived from term start | DERIVABLE |
| `w.bg` current week | clock | | NOT-A-DATA-ITEM |
| `w.ring` "graded item due that week" | whether a `points_possible > 0` assignment is due in the week (artboard footer states this rule verbatim) | `assignments.points_possible` | PARTIAL. 26 of 66 rows have null `points_possible`, so a graded item can be missed by the ring: all 3 ECN.304 exams, both GEO.103.lecture exams and the final, all 4 GEO.103.recitation items, 8 of 10 IST.323 quizzes. Under this rule GEO.103 gets zero rings for the entire semester |
| `w.opacity` past-week dimming, `w.nowDisplay` "this week" tag | clock | | NOT-A-DATA-ITEM |
| "ring = graded due" caption | | static | NOT-A-DATA-ITEM |
| "Current" anchor, `showAll`, `showCurrent`, `earlierLabel` | UI state | | NOT-A-DATA-ITEM |

### C3. Per-course tracker

Identical component to B2-B4 with `where course_id = $1`. Same field list, same statuses. One extra: `rawItems` in 14 includes `lab` in `EFF` and `CAT` where 13 does not, which confirms the effort map must be maintained in one place, not per screen.

### C4. Lecture lane (`w.lectures`)

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| `l.date` ("Mon 9/7") | session date | `sessions.session_date` | PARTIAL. 145 sessions across 5 shells; IST.471 and GEO.103.recitation have zero, so their lecture lane is empty by construction. Run 7's `gaps_open` names "no recitation sessions rows" explicitly |
| `l.title` ("Cryptography 1 · Lab #1 in-class session") | topic | `sessions.topic` | AVAILABLE where sessions exist (`with_topic` equals `n` in every profile row) |
| `l.tag` ("lab", "exam", "presentations") | session kind | `sessions.kind` (enum covers lecture, exam, lab, presentation, practice, guest, no_class, discussion, other) | AVAILABLE where sessions exist |
| `l.tag` variant "quiz #1 graded 10/10" | a grade event landing on a session date | `assignment_progress.score` / `.score_max` joined by date | PARTIAL. Only 5 progress rows carry a score |
| `l.meta` "Chap 3.1–3.3" | readings for that class date | `readings.for_date`, `.citation` | PARTIAL. 76 of 86 readings have `for_date`; IST.466's 10 have none, and IST.352 has exactly 1 reading row |
| `l.meta` "2 files on Blackboard" | file count for the session | `bb_files.session_id` | MISSING-INPUT in effect: populated on 2 of 64 rows, both ECN.304 lecture decks (linked by run 8). A week-level fallback via `bb_files.week_no` reaches 16 of 64. This is the single biggest structural hole on this screen |
| `l.meta` "Hinds 010" | room | `meetings.location` | AVAILABLE for 6 shells |
| "No session" empty state | | | NOT-A-DATA-ITEM |
| Lane header "sessions · readings · files" | | static | NOT-A-DATA-ITEM |

### C5. Assignment lane (`w.assignments`)

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| `a.date` ("Wed 9/9 · 3:45p", "Fri 10/2") | due date and optional time | `due_at` / `due_date` | PARTIAL (31 / 31 / 9 split) |
| `a.g` glyph + colors | type category | `assignments.type` | PARTIAL (enum coverage) |
| `a.title` | | `assignments.title` | AVAILABLE |
| `a.status` chip | planner status | `assignment_progress.status` | AVAILABLE |
| `a.meta` "Blackboard" | submission channel | `assignments.submission` (enum, default `unknown`) | coverage unprofiled, flag |
| `a.meta` "3 attempts" | attempts allowed | not on `assignments`; the crawler captures `attemptsAllowed` into the content payload and `bb_content.detail` is populated on 139 of 139 rows | DERIVABLE from `bb_content.detail->>'attemptsAllowed'` joined via `bb_content.assignment_id` (21 links), otherwise MISSING-INGEST-to-typed |
| `a.meta` "10 pts", "5 pts" | points | `assignments.points_possible` | PARTIAL (40 of 66) |
| `a.meta` "unscored" | zero-point graded item | `points_possible = 0` | AVAILABLE where points are set. Note the run-2 conflict: IST.323 presentation-choice is 100 in Blackboard, 0 in the syllabus, kept as 0 |
| `a.meta` "moved to 9/9 in v1.3.1" | provenance of a changed date | | MISSING-INPUT, same conflict gap as B5 |
| `a.meta` "first come, first served" | free text | `assignments.description` (66 of 66) or `due_rule` | AVAILABLE |
| "Nothing due" empty state | | | NOT-A-DATA-ITEM |
| Both lanes / Lectures / Assignments radio, mode labels, tail label | UI state | | NOT-A-DATA-ITEM |

## Matrix D: Lecture popout (`03-lecture.dc.html`)

Left rail in this file is superseded by the top nav (README "Still open"); I audit only the popout `aside`.

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| Kicker "IST 323 · Week 3 · Wed Sep 9 · 3:45–5:05 · Hinds 010" | course, week no, date, meeting window, room | `courses`, `sessions.week_no`, `sessions.session_date`, `meetings` | AVAILABLE for the 5 shells with sessions |
| `<h2>` topic | | `sessions.topic` | AVAILABLE |
| Tag "lab" | | `sessions.kind` | AVAILABLE |
| Tag "syllabus v1.3.1 · confirmed" | source, confidence, syllabus version string | `sessions.source` and `sessions.confidence` give the two enum halves; there is no `sessions.source_ref`, so "v1.3.1" has nowhere to live (only `assignments` has `source_ref`) | PARTIAL. Add `sessions.source_ref`, or accept `sessions.notes` |
| "bb_content: Course Content / Week 3" | Blackboard folder path for the session | `bb_content.path` exists on all 139 rows, but nothing links a session to a content node (`bb_content` has `assignment_id`, no `session_id`) | DERIVABLE by title/date/week matching, or add `bb_content.session_id`. Today: MISSING link |
| Prev / next session buttons ("← Wed 9/2", "Mon 9/14 Exam #1 →") | adjacent sessions with their kind | `sessions` ordered by date | AVAILABLE |
| Materials header "3 files · 2 on disk" | file count and local presence | `bb_files` filtered by session | MISSING-INPUT: `bb_files.session_id` on 2 of 64 |
| File row: type badge (PPT / PDF / DOC / URL) | mime | `bb_files.mime_type` | AVAILABLE |
| File row: name | | `bb_files.file_name` | AVAILABLE |
| File row: "Blackboard · 4.2 MB · modified 9/8" | size, modified date | `bb_files.bytes`, `bb_files.bb_modified_at` (backfilled by migration 005 where a content node matched) | AVAILABLE, `bb_modified_at` coverage unprofiled |
| File row: "on disk" vs "Blackboard only" | local mirror presence | `bb_files.local_path`, `.downloaded_at`, `.storage_path` | AVAILABLE by column; run 12 validated 60 of 60 local files by sha256, so coverage is effectively complete (inferred; profile does not count `local_path`) |
| File row: Open button | open a local file from the desktop shell | filesystem | NOT-A-DATA-ITEM, but a hard runtime requirement: it is the main reason the product is a desktop shell rather than a web app |
| File row: Download button | remote fetch | `bb_files.source_url` | AVAILABLE, with the standing caveat that only durable `bbcswebdav` rid/xid URLs survive |
| "Locate folder" link | local directory | `v_file_layout.local_relpath` | AVAILABLE |
| Footer path "OneDrive – … / IST.323 / week-03" | canonical relative path | `v_file_layout` / `bb_file_relpath()` (migration 008) | AVAILABLE |
| Readings for this session: citation, "required" | | `readings.citation`, `.required`, joined on `for_date = session_date` | PARTIAL (76 of 86 dated; IST.466 0 of 10) |
| Readings checkbox | write | `reading_progress.status` | AVAILABLE (75 rows exist, all `not_started`; 11 readings lack a progress row and need one on first write) |
| Linked assignments list: "due 3:45p", title, status | assignments tied to this session | no FK from `assignments` to `sessions`; derive by `due_at::date = session_date` or via `bb_content.assignment_id` | DERIVABLE. Note the mockup merges "Quiz #1 · Quiz #2" into one row, which is a render choice |
| Notes / running log textarea (T-10) | free text per session | no `notes` table | MISSING-INPUT (new table; T-10 already names it) |
| Footer "Sources: 323Fall26V1.3.1.docx Week 3 · bb_content run 3e12fd89" | provenance | `sessions.source` / `.notes`, `bb_content.run_id` (added in 004) | PARTIAL |

Can `bb_file_text` feed this popout? Yes, and it is underused. 534 units across 63 of 64 files (295 slide, 219 page, 17 doc, 3 sheet), with `unit_kind` and `unit_no` so a deck can be shown slide by slide inline rather than only as a "download" row. That is the cheapest way to give the lecture popout real content while `session_id` linkage is still missing, provided the file can be attached to the session by week.

## Matrix E: Assignment popout (`04-assignment.dc.html`)

| GUI element | Field(s) needed | Source today | Status |
|---|---|---|---|
| Kicker "IST 323 · Labs · 1 of 4" | course, component name, position in series | `courses`, `grade_components.name` via `assignments.component_id`, `assignments.sequence_no` and `series_key` | PARTIAL. 35 components exist with names and `count_expected`; `assignments.component_id` coverage is not in the profile and must be measured before this is trusted |
| `<h2>` title | | `assignments.title` | AVAILABLE |
| Tag "lab" | | `assignments.type` | AVAILABLE |
| Tag "confirmed · syllabus" | | `assignments.confidence`, `.source` | AVAILABLE |
| "IST.323/lab-1 · bb column _812…" | row id and Blackboard column | `assignments.id`, `.bb_column_id` | PARTIAL (29 of 66 have a column id) |
| Due card: "Wed Sep 23" | | `due_date` | PARTIAL |
| Due card sub: "time not in syllabus" | the absence of a clock time | `due_at is null` | AVAILABLE as a derived state; this is exactly the 35-row hole rendered honestly, which is the right pattern |
| Points card: "5" | | `points_possible` | PARTIAL (40 of 66) |
| Points card sub: "Labs · 4 × 5 = 20" | component name, expected count, bucket points | `grade_components.name`, `.count_expected`, `.points` | AVAILABLE for the 35 components, gated on `component_id` |
| Submit via card: "Blackboard" | | `assignments.submission` | coverage unprofiled |
| Submit via sub: "late = not accepted" | | `grading_schemes.late_policy` (present for all 6 schemes) | AVAILABLE for 6 of 7 courses; GEO.103.recitation has no scheme row |
| Session card: "Wed 9/9", "in-class lab, 14 days to report" | related session | no assignment-to-session link | DERIVABLE by date and `sessions.kind = 'lab'`, otherwise MISSING link column |
| Your plan: status radio (7 options) | | `assignment_progress.status` | AVAILABLE. The mockup shows 7 of the 9 enum values; `not_applicable` and `waived` are omitted, which is fine as a display choice but should be deliberate |
| Your plan: Priority select | | `assignment_progress.priority` (enum low/normal/high/critical) | AVAILABLE as a column; every row is at the default today |
| Your plan: Planned start / finish | | `assignment_progress.planned_start`, `.planned_finish` | AVAILABLE as columns; all null today |
| Your plan: Estimate "120 min" | | `assignment_progress.est_minutes` | AVAILABLE as a column; all null today. Note this is not the same thing as the T-15 `effort_override`, and both are wanted |
| Your plan: Notes | | `assignment_progress.notes` | AVAILABLE |
| Instructions paragraph | | `assignments.description` | AVAILABLE, 66 of 66 rows have one. This is the best-covered text field in the schema |
| Materials list | files for this assignment | `bb_files.assignment_id` | PARTIAL. 29 of 64 files linked, but distribution is lopsided: IST.466 17 of 27, IST.323 8 of 15, IST.471 3 of 4, IST.352 1 of 8, ECN.304 0 of 3, GEO.103.lecture 0 of 6, GEO.103.recitation 0 of 1 |
| Material sub "also linked from the 9/9 session" | cross-link | needs `bb_files.session_id` | MISSING-INPUT |
| External row "jblearning.com Virtual Lab (external)" tagged "on disk" | an external link, not a file | `bb_content` has 2 `externallink`, 4 lti and 3 `courselink` rows | DERIVABLE from `bb_content`, not `bb_files`. The mockup mislabels a URL as "on disk"; the app needs a third material kind (link) with its own affordance |
| Series strip: 5 tiles, title + date + status, "+4 pts" | series members | `assignments.series_key`, `.sequence_no`, `assignment_progress.status`, `.is_extra_credit` | AVAILABLE. IST.323 labs are a real series of 5 including the extra-credit lab, and all 5 carry `points_possible` |
| Footer "Source: 323Fall26V1.3.1.docx Week 5 · last seen in Blackboard today 09:14" | | `assignments.source_ref`, `assignments.bb_last_seen` (both added by 004) | PARTIAL, neither coverage is profiled |

Can `bb_file_text` feed the assignment popout? Partly. `assignments.description` already fills the Instructions block for all 66 rows, so the popout's prose does not need extraction. What `bb_file_text` adds is the body of the spec document itself (for example IST.466's 5 `assignment_spec` files, 4 of which have text), which would let the popout show the rubric inline rather than as a download. Worth doing after the linkage gaps are closed, not before.

## Matrix F: task items T-01 to T-17 (`00-mvp-plan.dc.html`)

| Task | Data the plan sheet names | Source today | Status |
|---|---|---|---|
| T-01 Planner / week view | `sessions`, `v_upcoming`, `assignment_progress` | 145 sessions (0 for IST.471 and GEO.103.recitation), `v_upcoming` live, `planned_start`/`planned_finish` all null | PARTIAL. The "planned work windows" half of the screen has no data until Stack enters it (MISSING-INPUT for that lane) |
| T-02 Materials library | `bb_content`, `bb_files` (+ `local_path`) | 139 content nodes with non-null `path`, 64 files, `local_path` added by 005 and validated by run 12 | AVAILABLE. The best-fed of the added screens |
| T-03 Announcements inbox | `announcements` | 11 rows, `is_read` present, 0 for GEO.103 | AVAILABLE except the author field (MISSING-INGEST) |
| T-04 Sync and data health | `sync_runs`, confidence columns | 12 runs; `summary` unstructured; `confidence` present on every fact table | PARTIAL. Run list and confidence rollups work today; conflict resolution does not |
| T-05 Course info tab | `course_staff`, `meetings`, `grading_schemes` | 12 staff (2 without email, 5 without office hours), 11 meeting patterns (none for IST.471), 6 of 7 schemes | PARTIAL. `grading_schemes.letter_scale` is a jsonb column the profile does not report on; measure it before promising a letter grade anywhere |
| T-06 Status quick-edit everywhere | `assignment_progress` | all columns exist | AVAILABLE as a write path, gated on T-14 |
| T-07 Grade forecaster | `grade_components` | 35 components with `aggregation`, `drop_lowest`, `rank_weights`, `normalize_to`, `count_expected` | The rules are AVAILABLE and genuinely complete; the inputs are not (5 scores). Forecasting hypotheticals is possible immediately, reporting an actual grade is not |
| T-08 Readings tracker | `readings`, `reading_progress` | 86 readings, 76 dated, 75 progress rows | PARTIAL. IST.466's 10 readings are undated, and roughly 22 GEO items are OIA ebooks with no bytes |
| T-09 Internship hours log | new table `internship_hours` | does not exist | MISSING-INPUT. Blocks the IST.471 card's "0 / 150 hrs" grade slot |
| T-10 Per-lecture notes | new table `notes` | does not exist | MISSING-INPUT. Blocks the lecture popout's running-log textarea |
| T-11 Series view | `assignments.series_key` | populated (IST.323 quiz, lab, exam series; ECN quiz; GEO exam; IST.352 quiz and project; per the profile's `series` flag) | AVAILABLE |
| T-12 Command palette | all | | AVAILABLE |
| T-13 Local file mapping | `bb_files.local_path` | shipped in 005, mirror verified | AVAILABLE, ahead of its "Later" priority |
| T-14 Auth before browser | RLS | permissive `authenticated` policy plus anon insert-only policies | NOT-A-DATA-ITEM (infrastructure), but a hard prerequisite for every write element above |
| T-15 Effort score | `assignments.type`, `points_possible`, `assignment_progress.effort_override` (new) | see Deep dive 1 | PARTIAL plus one MISSING column |
| T-16 Top navbar + pop-down | `courses`, `announcements.is_read` | 7 courses, 11 announcements | AVAILABLE |
| T-17 Daily schedule (Planner day view) | `meetings`, `sessions` | 11 patterns, 145 sessions | PARTIAL. IST.471 has neither, GEO.103.recitation has a meeting pattern but no sessions, so a Friday recitation shows a time block and no topic |

## Deep dive 1: the effort score (T-15)

The formula, from the plan sheet and the README: base score by `assignment_type` (reading 1, form 1, discussion_post 1.5, homework/activity 2, quiz 3, lab/presentation 4, project/paper/group_presentation 6, exam 8, final_exam 10), multiplied by `points_possible ÷ course median points` when known and clamped to 0.5-2.0, with a manual `effort_override` on `assignment_progress` winning outright.

Input 1, `assignments.type`: AVAILABLE, 66 of 66 rows. But the mapping is incomplete in three ways. The artboards use the key `discussion` where the enum value is `discussion_post`. `13-home-v2` omits `lab` entirely (5 rows); `14-course-v2` includes it. And neither the artboards nor the T-15 text assigns a base score to `checkpoint` (2 rows), `meeting` (1), `evaluation` (1) or `other` (3), which is 7 of 66 rows with no score at all, plus `attendance` and `participation` which have no rows yet but are in the enum. Fix: put the map in one table or one module, cover all 18 enum values, and default unknown types to a stated value rather than `undefined`.

Input 2, `points_possible`: PARTIAL, 40 of 66. Per course: IST.323 17 of 27, IST.352 9 of 11, IST.466 7 of 9, IST.471 6 of 7, ECN.304 1 of 6, GEO.103.lecture 0 of 3, GEO.103.recitation 0 of 3. Per type the holes cluster on exactly the heavy items: exam 4 of 9, final_exam 0 of 1, quiz 6 of 17, other 0 of 3, activity 0 of 1.

Input 3, course median points: this is the input that actually fails. A median needs a reasonable population of non-null `points_possible` within the course. IST.323 (17 values), IST.352 (9), IST.466 (7) and IST.471 (6) are fine. ECN.304 has exactly one value, so its median equals that one item and every other ECN item multiplies to 1.0 or to that item's own ratio, which is noise. Both GEO shells have zero values, so no median exists and the multiplier must be skipped entirely. Conclusion: the multiplier is usable for 4 of 7 shells, degenerate for 1, and impossible for 2. It must be optional per course, not a global switch, and the UI should not imply the multiplier applied when it did not.

A second-order problem: point scales are not comparable across courses (IST.466 totals 1020 across 9 assignments, IST.323 totals 104 across 27). Dividing by the course median is the right normalization, so cross-course bar heights on Home stay honest, but only where a median exists. Where it does not, base scores alone are used and GEO items will systematically read lighter than IST items of the same weight.

Input 4, `assignment_progress.effort_override`: the column does not exist. `001_schema.sql` defines `assignment_progress` with status, priority, planned_start, planned_finish, est_minutes, submitted_at, graded_at, score, score_max, letter, feedback, notes, updated_at, and no migration adds an override. MISSING-INPUT plus a one-line schema add. Note that `est_minutes` already exists and is a different quantity (wall-clock minutes, shown in the assignment popout's Estimate field); do not overload it.

Suggested SQL shape:

```sql
create table effort_base (type assignment_type primary key, base numeric(4,2) not null);
create view v_course_points_median as
  select course_id, percentile_cont(0.5) within group (order by points_possible) as med,
         count(points_possible) as n
  from assignments where points_possible is not null and points_possible > 0
  group by course_id;                       -- n < 3 means "do not apply the multiplier"
create view v_assignment_effort as
  select a.id, a.course_id,
         coalesce(p.effort_override,
           b.base * case when m.n >= 3 and a.points_possible > 0
                         then least(2.0, greatest(0.5, a.points_possible / m.med))
                         else 1 end) as effort,
         (p.effort_override is not null) as is_override,
         (m.n >= 3 and a.points_possible > 0) as multiplier_applied
  from assignments a
  join effort_base b on b.type = a.type
  left join v_course_points_median m on m.course_id = a.course_id
  left join assignment_progress p on p.assignment_id = a.id;
```

## Deep dive 2: suggested start date

`start = due − (ceil(effort ÷ 2) − 1) days`, matching `selItems` in both trackers. Pure function of effort and the due date, so it inherits both gaps: no effort for the 7 unmapped types, no start for the 9 undated assignments. DERIVABLE.

One design flaw worth naming: the arithmetic is calendar-naive. An 8-point exam due Monday 10/12 gets a start of Friday 10/9, and a 10-point final gets a 4-day lead that can run straight through Thanksgiving. The database already knows better: `sessions.kind = 'no_class'` has 17 rows across 5 courses (ECN 3, GEO.lecture 4, IST.323 4, IST.352 3, IST.466 3), which is enough to skip breaks. Cheap improvement, worth flagging to the planners rather than fixing silently.

## Deep dive 3: the Grade field on course cards, and `v_course_grade`

`v_course_grade` does not exist (stated at the bottom of `DB_VIEWS_2026-09-08.sql`). Nothing in the schema computes a grade. What it would take, per method:

Points courses, IST.323 (`total_points` 104, `graded_out_of` 100) and IST.466 (1020 / 1020). Shape: `sum(progress.score) / sum(points_possible of items with a score)` for the current standing, and `sum(score) / graded_out_of` for the projected floor. Needs `points_possible` on the graded items (IST.323 17 of 27, IST.466 7 of 9) and needs scores. Today IST.323 has essentially one graded item (Quiz #1, 10/10) and the card's "10 / 10 pts" is exactly that. Feasible now, nearly empty.

Weighted courses, ECN.304, GEO.103.lecture, IST.352. Shape: for each `grade_components` row, aggregate its items per the `aggregation` rule (`average_drop_lowest` with `drop_lowest`, `rank_weighted` with `rank_weights`, `single`, `sum`, `normalized` with `normalize_to`, `manual`), then weight by `weight_pct` and renormalize over the components that have at least one graded item. The rules are all present and correct in the 35 `grade_components` rows, including ECN's `[30,25,20]` rank weights and both drop-lowest quiz buckets. Two blockers. First, the join from item to bucket is `assignments.component_id`, whose coverage the profile does not report at all, so it is unmeasured and probably partial. Second, the `manual` components have no item rows to aggregate: ECN participation (10 pct), GEO lecture_attendance (5) and section_participation (15), IST.352 attendance (15). Blackboard already knows those numbers (PHASE2 records ECN Attendance 100 and GEO Absences 0), but they live in `bb_raw` and were never transformed into typed rows. That is 30 pct of GEO's grade and 15 pct of IST.352's sitting outside the model.

Qualitative, IST.471 (70 pct supervisor evaluation, 30 pct assignment compliance). There is no numeric grade to compute, and the card sensibly shows "0 / 150 hrs" instead, which is the internship hours from T-09, a table that does not exist. MISSING-INPUT.

GEO.103.recitation has no `grading_schemes` row at all, so it cannot render even a "scheme unknown" state derived from the method; the absence has to be handled as its own case.

The cheapest close by a wide margin: Blackboard already computes the total. `bb_crawler.js` line 70 requests every gradebook column with `includeNoGradeItems=true` and maps `isCalculatedColumnGrade`, `calculationType`, `aggregationModel`, `effectiveScore`, `score` and `displayGrade`. Those payloads are already in `bb_raw` (7 courses times 3 runs). A transform that lifts the calculated Total or Weighted Total column into a `course_grade_snapshot` table gives every card a real number in one migration, with our own `grade_components` engine kept for the T-07 forecaster rather than for the displayed number. Recommend that split explicitly.

Also note the artboard already anticipates three non-numeric states ("scheme unknown", "weights unknown", the placeholder dash). Two of the three are now stale, since IST.352 and IST.466 both have confirmed schemes as of the 9/3 pulls. The states worth keeping are "no graded items yet" and "no scheme row" (recitation).

## Deep dive 4: "Open = items due this week"

Definition needed: a Monday-to-Sunday window anchored on today, counted from `v_upcoming` per course. DERIVABLE, no new columns. Three caveats. The 9 undated assignments can never appear. `v_upcoming` excludes `missed`, so an item that came due this week and was missed drops out of "Open", which is arguably right for a work counter and arguably wrong for a "what is live in this course" counter. And the pop-down in Matrix A uses the same number, so it must be one view, not two queries.

## Deep dive 5: the M-F strip

`meetDays` and `dueDays` are separate 5-element arrays in the artboard. `meetDays` maps cleanly to `meetings.day_of_week` in 1..5 and is AVAILABLE for 6 of 7 shells: ECN Tue/Thu, GEO.103.lecture Mon/Wed, GEO.103.recitation Fri, IST.323 Mon/Wed, IST.352 Mon/Wed, IST.466 Tue/Thu. IST.471 has no meetings row, and its card correctly renders an empty strip. GEO's card needs the union of the lecture and recitation shells, which is the same two-shells-one-card merge the pop-down and the sub-bar need; it is worth solving once, in a `v_course_display` view, rather than three times in the UI.

`dueDays` is DERIVABLE from `v_upcoming` bucketed by weekday within the current week, subject to the same undated-row loss.

The strip has no notion of `sessions.kind = 'no_class'`, so a holiday Monday still shows as a meeting day. 17 no_class sessions exist and could suppress it. Flag, do not assume.

## Deep dive 6: needs-attention typed counts and `sync_runs.summary`

Restating the four counts against live data:

Overdue: AVAILABLE via `v_overdue`, with the definition mismatch noted in B5. Pick `v_overdue`'s definition and update the README, or widen the view.

Conflict: the blocker. `sync_runs.summary` is jsonb with no contract. Across the 12 rows the conflict-ish information appears under at least five different key names: `conflicts_with_confirmed_seed` (run 2, three prose strings), `gaps_open` (runs 7, 8, 10, 11; sometimes an array of strings, once the integer 10), `stack_must_confirm` (run 10, integer 7), `observations` (run 12, five prose strings), `lessons` (run 12). Nothing carries a structured (entity, field, seed value, blackboard value) tuple, which is exactly what the expanded row needs to render "due moved 9/2 → 9/9". Recommendation: a `sync_conflicts` table written by the transform, with a `resolved_at` so the count is "open conflicts" and the T-04 screen has something to resolve. This single change unblocks the count, the expanded row, the "Resolve" link, and most of T-04.

Missing: the specified predicate (`grading_method = 'unknown'`) now matches zero rows. Redefine as a union of concrete data holes, each of which is countable today: courses without a `grading_schemes` row (1), assignments without a date (9), assignments without `points_possible` (26), readings without `for_date` (10), files without an `assignment_id` or `session_id` (35 and 62). Those are the things Stack can actually act on.

Deadline: needs a definition. The exemplar (textbook opt-out) is an `assignments` row with no points. A predicate of `points_possible is null and type in ('other','form')` picks it up; confirm with Stack whether "deadline" should also include administrative dates that have no assignment row at all (in which case it is MISSING-INPUT and wants its own small table).

Last sync time: AVAILABLE.

## Deep dive 7: `announcements.is_read`

The column exists (migration 004) and 2 of 11 rows are true. The crawler reads Blackboard's own `readStatus.isRead` (line 85), so the value has been meaning "read in Blackboard", not "read in bb2dash". The bell's unread badge, the unread-first ordering, the per-row dot and "Mark all read" all write or read this one nullable boolean. Two decisions for the planners: whether a sync may overwrite a locally-set `is_read` (under the project's facts-versus-state rule it should not, which argues for a separate `announcement_progress` or at least a `read_at` owned by Stack), and how to treat null (unread, per the `is distinct from true` predicate). Also worth noting for expectations: GEO.103 has zero announcements in either shell, so the bell will never show the GEO row the mockup displays.

## Deep dive 8: session lanes, `sessions.week_no` and `bb_files.session_id`

`sessions.week_no` is fully populated: every profile row reports `with_week` equal to `n`, across all 145 sessions and all 24 course-kind groups. The lane and the week rail can rely on it where it exists. Where it does not exist at all: IST.471 (0 sessions, an online internship with no meeting pattern either) and GEO.103.recitation (0 sessions, called out as an open gap in run 7's summary). For those two, the week rail must fall back to `terms.start_date` arithmetic and the lecture lane renders empty for all 16 weeks. That is honest but bleak; GEO.103.recitation at least has a confirmed Friday meeting pattern, so a synthetic session row per Friday would fill the lane at low cost if Stack wants it.

`bb_files.session_id` is the real hole: 2 of 64, both ECN.304 lecture decks linked during run 8. `bb_files.week_no` reaches 16 of 64 (ECN 2, GEO.lecture 4, IST.323 4, IST.352 4, IST.466 2), which is the only usable fallback and covers a quarter of the corpus. `bb_files.assignment_id` is better at 29 of 64 but answers a different question. Consequence: the lecture popout's Materials section and the lane's "N files" meta are unfed for 5 of 7 courses. Closing this is mostly a classification pass, not new ingest: the files are already downloaded, their text is already extracted, and `bb_file_relpath()` already encodes a week folder convention. A per-course agent pass that sets `week_no` from filename and path, then `session_id` from `(course_id, week_no, bucket in ('lecture_slides','readings'))`, would move this from 2 to most of 64 without touching Blackboard.

## Deep dive 9: what the popouts show, and whether `bb_file_text` can feed them

Covered per-row in Matrices D and E. Summary judgment. The assignment popout is close to fully feedable today: title, type, confidence, source, due, points, submission, late policy, the whole planner block and the Instructions prose all resolve to existing columns, and `description` is populated on 66 of 66 rows. What it lacks is the material list (29 of 64 files linked), the session cross-link (no FK), and the conflict provenance line.

The lecture popout is the weaker of the two: the session facts (date, week, topic, kind, room, neighbors) are all present, but the two sections that give it a reason to exist (Materials and Readings for this session) are gated on `bb_files.session_id` (2 of 64) and `readings.for_date` (76 of 86, none for IST.466). The Notes textarea needs a table that does not exist.

`bb_file_text` (534 units, 63 of 64 files, with `unit_kind` and `unit_no`) is a genuinely underexploited asset. It can render a deck's slides or a spec's pages inline in either popout, and it is the obvious substrate for a T-12 search. It cannot substitute for the missing linkage: without `session_id` or `assignment_id` you can extract text but not know which popout to put it in.

## Deep dive 10: everything tagged "sample" in the artboards

`13-home-v2` marks 9 of its 28 tracker rows `sample: true`: ECN "Ch. 2 Poverty & inequality" (reading), GEO "Population Bomb → Population Bust" (reading), IST.466 "Ethics case prep Team 2" (reading), IST.323 "Chap 3.1-3.3 Cryptography 1" (reading), IST.352 "Knowledge Check 09/09" (quiz), GEO "Ch. 4 reading", IST.466 "Ethics case written analysis" (paper), IST.352 "Project milestone 1" (project), IST.471 "A3 Mid-term reflection". `14-course-v2` marks 6 rows sample, all of them readings. The pattern is unmistakable and it is a finding, not decoration: seven of the fifteen sample rows are readings.

That is because the tracker is bound to `v_upcoming`, which reads `assignments` only. The 86 rows in `readings` are a different table with no `due_at`, no status beyond `reading_progress.status`, and no representation in `v_upcoming`. Yet the tracker legend leads with "R reading", the effort map scores readings at 1, and readings are the single largest source of daily workload in the corpus (86 rows against 66 assignments). Either `v_upcoming` grows a union arm over `readings` (using `for_date` as the due date, `reading_progress.status` as the status, effort 1, glyph R), or the R category on Home is decorative. This is the highest-leverage small change in the audit and it is not currently listed as a task item anywhere.

The other sample rows are ordinary data gaps: IST.352's project milestone and IST.466's written analysis are assignments that exist but are undated or unlinked; IST.471 A3 exists with a date.

Separately, `14-course-v2`'s `W` array (16 weeks of IST.323 lectures and assignments) is unmarked but is plainly hand-composed from the syllabus, and it contains items with more precision than the DB currently holds, notably per-week lecture `meta` strings that combine chapter readings, file counts and lab-environment notes. Planners should not read those strings as evidence that the joins exist.

## Top 10 gaps, ranked by how many GUI elements they block

1. No grade computation, no `v_course_grade`. Blocks: the Grade field on 6 course cards, the entire Grades nav destination, screens 05 and 06, T-07's actual-versus-forecast display, and the lecture lane's "quiz #1 graded 10/10" tag. Cheapest close: transform the calculated Total / Weighted Total gradebook column already sitting in `bb_raw` into a `course_grade_snapshot` table, and keep the `grade_components` engine for what-if only. One migration plus one SQL transform, no new crawl.

2. `bb_files.session_id` populated on 2 of 64 (and `week_no` on 16 of 64). Blocks: the lecture popout Materials section entirely, the lane meta "N files on Blackboard", the "3 files · 2 on disk" header, "also linked from the 9/9 session" in the assignment popout, and the session half of T-02. Cheapest close: an offline classification pass over the existing corpus setting `week_no` from path and filename, then `session_id` by (course, week, bucket). No Blackboard access needed.

3. `sync_runs.summary` has no contract. Blocks: the needs-attention conflict count, the expanded conflict row, the "Resolve" link, most of T-04, and the "moved to 9/9 in v1.3.1" provenance meta on assignment rows. Cheapest close: a typed `sync_conflicts` table with a `resolved_at`, written by the transform that already detects conflicts.

4. Readings are absent from `v_upcoming`. Blocks: the R glyph and its legend entry on both trackers, 7 of the 15 sample rows, honest day-load bars on Home, and T-08's timeline lane. Cheapest close: a union arm in a new `v_workload` view (assignments plus readings), leaving `v_upcoming` alone for compatibility.

5. `points_possible` null on 26 of 66, with no median at all for either GEO shell and only one value for ECN. Blocks: the T-15 multiplier for 3 of 7 shells, the week rail's graded-due rings (GEO gets zero rings all semester), the "N pts" chips on assignment lane rows, and points-based grade math. Cheapest close: a crawl-side fill from the gradebook columns already captured (`possible` is in the crawler's `grades()` map) for the 29 items with a `bb_column_id`, then Stack fills the syllabus-only items by hand.

6. No assignment-to-session and no content-to-session link. Blocks: the lecture popout's Linked assignments list, its "bb_content: Course Content / Week 3" line, the assignment popout's Session card, and any "what happens in class on this date" rollup. Cheapest close: add `bb_content.session_id` and derive assignment-session pairs by `due_at::date = session_date`, which is free but lossy for the 35 rows without `due_at`.

7. `assignment_progress.effort_override` does not exist, and neither do `internship_hours` (T-09) or `notes` (T-10). Blocks: manual effort correction everywhere the tracker appears, the IST.471 card's hours grade slot, and the lecture popout's running log. Cheapest close: three small schema additions, all MISSING-INPUT by nature since only Stack supplies the values.

8. The `assignment_type` to effort and glyph map is incomplete and duplicated per artboard. Blocks: correct bar heights and glyphs for 7 of 66 rows (`other`, `checkpoint`, `meeting`, `evaluation`) plus the `lab` and `discussion_post` naming mismatches, on both trackers and both lane renderers. Cheapest close: one `effort_base` table covering all 18 enum values, read by every surface.

9. 9 assignments have no date, and 35 have no clock time. Blocks: placement in both trackers, the week rail, "next due", "Open", the M-F dots, and the `it.time` label. Cheapest close: the Blackboard iCal feed already identified in DATA_SYNTAX (Calendar share link, no browser session needed) for the items with columns, plus Stack for the 6 that genuinely have no announced date.

10. Announcement author is not captured, and GEO has no announcements. Blocks: the author element in every bell row and in T-03's list. Cheapest close: add the creator field to the crawler's announcement map (the endpoint already returns it) and re-run; until then fall back to the course instructor from `course_staff`, which is right for 5 of the 5 courses that actually have announcements.

Just outside the ten, worth carrying forward: GEO.103.recitation has no `grading_schemes` row and no sessions; IST.471 has no meetings and no sessions; `assignments.component_id` coverage is unmeasured and gates the assignment popout's Points sub-line and all weighted grade math; `grading_schemes.letter_scale` coverage is unmeasured and gates any letter display; T-14 auth gates every write element in Matrices B, D and E.

## Things that surprised me

`assignments.description` is populated on 66 of 66 rows, which makes the assignment popout's Instructions block the best-fed prose element in the entire GUI, better than anything on Home. Meanwhile the corresponding lecture-side content is nearly unfed. The two popouts are not at similar readiness and should not be scheduled as one unit.

The artboards' three "unknown grading" states are already stale. IST.352 is `weighted_pct` confirmed and IST.466 is `points` / 1020 confirmed as of the 9/3 pulls, so two of the six course cards would render text that no longer matches the DB, and the needs-attention "2 missing" count would render 0.

`T-13 Local file mapping` is marked Later on the plan sheet but is effectively done: `local_path` shipped in migration 005 and run 12 verified 60 of 60 files by sha256. Conversely `T-15 Effort score` is marked Must and is missing a column.

## Open questions for Stack

1. Grade display: is it acceptable for v1 to show Blackboard's own calculated Total on the course cards and Grades screen, with our `grade_components` engine reserved for the T-07 what-if forecaster? That is one transform away versus several weeks of aggregation work.
2. `announcements.is_read`: should a sync be allowed to overwrite a read state you set in bb2dash, or do you want your own read state separate from Blackboard's? Today one nullable boolean serves both meanings.
3. Overdue definition: `v_overdue` excludes items you have marked `missed` (3 rows today), so they disappear from the needs-attention count. Should missed items keep counting as overdue until you resolve them?
4. "Missing" count: the specified predicate (grading method unknown) now matches nothing. Do you want it redefined as concrete data holes (no scheme row, no date, no points, no file link), and if so which of those actually deserve your attention on Home?
5. Readings in the tracker: should reading rows appear as R bars alongside assignments, given there are 86 of them against 66 assignments? If yes, do they use `readings.for_date` as the due date and `reading_progress.status` as the status?
6. GEO.103.recitation: it has a confirmed Friday meeting pattern but zero session rows and no grading scheme. Do you want synthetic Friday sessions generated so the lane is not empty for 16 weeks, or should the recitation stay folded into the GEO lecture card entirely?
7. IST.471 has no meetings, no sessions, and a qualitative grading method. Should its course page drop the lecture lane and week rail altogether and show assignments plus the T-09 hours log instead?
8. Suggested start dates currently count calendar days and will happily route work through Thanksgiving. Should the lead time skip `no_class` sessions and weekends?
9. GEO.103.recitation room: `meetings.location` says Maxwell Hall 140, `courses.location` and the mockup say Maxwell 108, and NOTES caveat 3 flags the section assignment as assumed. Which is right?
10. The M-F strip fills meeting days without checking for holidays. Should a `no_class` session blank that day's block?
11. The course card note line currently draws on four different sources. What is the precedence you want: group memberships first, then status rollups, then grading caveats, then course notes?
12. Effort override versus estimate: `est_minutes` already exists on `assignment_progress` and the assignment popout exposes it. Is `effort_override` a separate number you want to set, or would you rather the effort score derive from your minute estimate when you have entered one?

## Handoff notes

The next stage should not miss these.

`support.js` contains no application code. Anyone told to "reuse the components in support.js" will find only the Claude Design runtime. The real component contract is the `renderVals()` block in each artboard, and the two trackers (13 and 14) are the same component with different scope and slightly different effort maps, which is itself evidence the map must be centralized.

`v_upcoming` is not a calendar. It hides completed and missed work by design (migration 009). Any screen that draws a strip of days rather than a queue of work needs a second view.

Three of the four needs-attention counts and the entire Grade column depend on data-shape changes, not on UI work. If the app phase is scheduled UI-first, Home ships with a working tracker, a working bell and three broken counters.

Coverage numbers that the profile does not contain, and that should be measured before anyone commits to the assignment popout or the Info tab: `assignments.component_id`, `assignments.submission`, `assignments.due_rule`, `assignments.source_ref`, `assignments.bb_last_seen`, `announcements.title`, `bb_files.local_path`, `grading_schemes.letter_scale`. Each of them backs at least one visible element.

Every write element in this audit (status quick-edit, priority, planned dates, estimate, notes, reading checkboxes, mark-all-read, conflict resolution) is gated on T-14. The current RLS posture is a permissive policy for `authenticated` plus anon insert-only policies for the crawler. A desktop shell holding the publishable key can read nothing typed and write nothing until that is decided.

GEO.103's two shells need one merge rule used by the pop-down, the course card, the sub-bar and the M-F strip. Solve it once in a view.
