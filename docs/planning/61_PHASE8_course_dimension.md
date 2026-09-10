# Phase 8 — Course dimension (Google Classroom-style course page)

Date: 2026-09-10. PM: the Fable session. Product manager: Stack. Requirements: R-01, R-02, R-03,
R-04, R-05, R-06, R-22 from `60_REQUIREMENTS_v2.md`. Phase branch `feat/course-dimension`, one PR.
Runs **in parallel with Phase 9** (`62_PHASE9_sync_loop.md`); the seam between them is frozen in
§Seams. Three Opus workers on isolated worktrees / branches cut from the phase branch; PM
integrates.

**Base.** Cut from `origin/main` (Phase 7 merged via PR #6: migrations 021–025, the `web/`
vitest harness).

**Migration numbers reserved for this phase: 026–029.** Phase 9 owns 030–039. Never take a number
outside the range; if the phase needs more, ask the PM.

## Why

The course page today is a week-rail timeline with an inert sub-bar. Stack wants a course to
open like Google Classroom: a Stream feed, Classwork grouped by Blackboard's own folders, a
Grades tab, an Info tab. The audit (`60_REQUIREMENTS_v2.md` §2) also found two drops from the
artboards (per-course tracker, course-card note) and the popouts never ported.

## Contract (frozen — all workers build against this)

### Routes (Next.js app router, `web/src/app/(app)/course/[id]/`)

| Route | Tab | Content |
|---|---|---|
| `/course/[id]` | redirects to `/course/[id]/stream` | |
| `/course/[id]/stream` | Stream | per-course tracker (R-02) + feed (below) |
| `/course/[id]/classwork` | Classwork | Blackboard folder tree; `?view=timeline` shows the existing week-rail timeline (moved, unchanged) |
| `/course/[id]/grades` | Grades | placeholder pane this phase: "Grades arrive with Phase 10" + link to `/grades`; no numbers |
| `/course/[id]/info` | Info | T-05 |

`CourseSubBar` tabs become `<Link>`s with `aria-current`. The sub-bar's meeting/room/Blackboard
metadata stays. A shared `course/[id]/layout.tsx` renders the sub-bar once.

### Stream feed (`v_course_stream`, migration 027)

One view, one row per post, newest first, read by `queries.course.ts`:

```
v_course_stream (
  course_id     text,
  post_kind     text,        -- 'announcement' | 'material' | 'assignment_posted' | 'assignment_due'
  posted_at     timestamptz, -- sort key
  ref_kind      text,        -- 'announcement' | 'bb_file' | 'bb_content' | 'assignment'
  ref_id        text,
  title         text,
  body          text,        -- announcement body (plain), file/content path, or assignment description
  meta          jsonb        -- {is_read} | {bucket, file_name, mime_type} | {due_on, points_possible, type, status}
)
```

* `announcement`: every `announcements` row; `posted_at = coalesce(posted_at, captured_at)`;
  `meta.is_read`.
* `material`: every `v_bb_files_current` row, `posted_at = coalesce(bb_modified_at, downloaded_at,
  captured_at)`; plus every `bb_content` row with `item_kind in ('document','link','file')` that
  has no `bb_files` row, `posted_at = coalesce(modified_at, captured_at)`.
* `assignment_posted`: every `assignments` row with `source = 'blackboard'`, `posted_at =
  coalesce(available_from, created_at)`.
* `assignment_due`: every `v_work_items` row with `item_kind = 'assignment'` and `due_on` not
  null, `posted_at = due_on::timestamptz` (America/New_York midnight), status from the view.
  Shown in the feed only when `due_on` is within ±14 days of today (client filter).

Course scoping: a display course may span shells (GEO 103 lecture + recitation); the view
carries the shell `course_id`; the client filters by `v_course_display.shell_ids`, same as
today's Course screen.

### Classwork tree (`v_content_tree`, migration 027)

```
v_content_tree (
  course_id   text,
  content_id  bigint,        -- bb_content.id
  parent_id   bigint,
  bb_item_id  text,
  path        text,          -- ' / '-separated breadcrumb, unique per course
  depth       int,           -- array_length(string_to_array(path,' / '),1)
  title       text,          -- title fallback applied (see stage_content)
  item_kind   text,
  bb_type     text,
  state       text,          -- Ultra progress: Started | Completed | None
  url         text,
  modified_at timestamptz,
  assignment_id text,
  file_id     bigint,        -- v_bb_files_current.id when a file row joins on (course_id, content_id = bb_item_id), else null
  file_name   text,
  storage_path text,
  bucket      text
)
```

A `bb_content` node with several files yields several rows (one per file); the client groups by
`content_id`. Ordering: by `path` (folders before their children by construction).

### `stage_content(p_run_id uuid)` (migration 026) — the seam with Phase 9

A SQL function, `security definer`, owner-executable, that folds the `content` array of every
`bb_raw` row `where run_id = p_run_id and kind = 'course'` into `bb_content`, idempotently:

* Upsert key `(course_id, path)` (existing unique). `course_id` resolves via
  `courses.bb_course_id = bb_raw.bb_course_id`.
* Title fallback: when the payload title is `ultraDocumentBody` or blank, use the last segment
  of the parent path plus ` (document)`, or `Untitled document` at root.
* Sets `bb_item_id`, `parent_id` (by parent path), `item_kind`, `bb_type`, `url`, `state`,
  `modified_at`, `body`, `detail`, `run_id`, `captured_at = now()`.
* Re-created items (same `path`, new `bb_item_id`): update `bb_item_id`, keep the row; note the
  old id in `detail->'previous_ids'`.
* Items absent from the run are **not** deleted; they get `detail->>'missing_since' = run_id` if
  not already set.
* Returns `jsonb` counts `{inserted, updated, missing, title_fallbacks}`.
* Never touches `bb_files`, `assignments`, or any `*_progress` table.

W-12 runs it once against the latest run (`6b122650-…`, 2026-09-08) so Classwork ships on fresh
data. Phase 9's driver calls it per run from then on. Phase 9 must not redefine it; if Phase 9
needs a change, it is a new migration in Phase 9's range that `create or replace`s it.

### `courses.card_note` (migration 028)

`alter table courses add column card_note text;` Owner-editable from the course Info tab (inline
edit, saves on blur) and rendered as the one-line note on the Home course card (decision 3c).
`v_course_display` must be recreated to carry it (check the view's column list; recreate, don't
alter).

### Tracker component (`web/src/components/tracker/UpcomingTracker.tsx`)

Extracted from `Today.tsx` with **no visual change** on Home. Props, frozen:

```ts
type UpcomingTrackerProps = {
  items: WorkItem[];              // v_work_items rows, already course-filtered by the caller
  horizonDays?: number;           // default 56
  visibleDays?: number;           // default 14
  anchor?: string;                // 'YYYY-MM-DD' first visible day; default today
  onAnchorChange?: (iso: string) => void;
  selectedDay?: string; onSelectDay?: (iso: string) => void;
  onStatusChange: (item: WorkItem, status: ProgressStatus) => void;
  pendingItemId?: string | null;
  title?: string;                 // 'Upcoming work' | 'Upcoming work · IST 323'
};
```

`◂ ▸` page by `visibleDays`; scrollbar hidden; Monday rule; month label on the 1st; click-to-
detail panel beneath; legend. Home passes all courses' items for 56 days; the course Stream
passes that course's shells' items. `useWorkItemsWindow` gains a 56-day range.

### Popouts (`web/src/components/popout/`)

Route-driven panels opened by `?item=assignment:<id>` or `?item=session:<id>` on any screen
(Home, course tabs, Materials). `AssignmentPopout`: description, component sub-line
(`grade_components` title + points), series strip (`series_key` siblings with status), late
policy (`grading_schemes.late_policy`), AI policy verbatim, planner block (status select,
priority, planned dates, est_minutes, notes → `assignment_progress`), "Open in Blackboard ↗"
(course URL, labelled as course-level), link to `/course/[id]/grades`. **No score, no submission
block this phase** (Phase 10 adds them). `SessionPopout`: the existing `SessionPanel` content plus
readings for the date and linked files. Both close with Esc and the ✕; focus returns to the
opener.

### Info tab

Sections, in order: Staff (`course_staff`: name, role, email, office, office hours; null shown as
"not recorded", never blank); Meetings (`meetingPatterns`, room dispute flag as today); Policies
(`grading_schemes.late_policy`, `ai_policy` verbatim, letter scale if present); Syllabus (the
`bb_files` row with `bucket = 'syllabus_policy'`, Open ladder); Groups (`courses.group_notes`
verbatim with the caption "as recorded; Blackboard disagrees for IST 466 — unresolved");
Card note (editable, R-04); Blackboard link.

### Honesty rules (unchanged)

No fabricated numbers. No grade figure anywhere this phase. Unknown = "not recorded". Snippets
of file text scrub `[notes]` and `Page N` (reuse `scrubSnippet`).

## Workers

### W-12 — database (branch `feat/course-dimension-db`, worktree `bb2dash-wt-cd-db`)

Migrations 026 (`stage_content`), 027 (`v_course_stream`, `v_content_tree`), 028 (`card_note` +
`v_course_display` recreate). Run `stage_content` on the latest run and record counts. Dry-run
every migration in `begin; … rollback;` via `execute_sql` first; apply with `apply_migration`
under the file's name; repo file byte-identical to what was applied. Verification note
`docs/planning/63_W12_VERIFICATION.md`: row counts before/after, the 11 `ultraDocumentBody`
titles resolved, tree sample for IST 323, stream sample for one course, RLS check (owner sees
rows, another uid sees zero) on every new view. Never touch 001–025.

### W-13 — course tabs (branch `feat/course-dimension-tabs`, worktree `bb2dash-wt-cd-tabs`)

`course/[id]/layout.tsx` + sub-bar routing; `stream/`, `classwork/`, `grades/`, `info/` pages;
`queries.course.ts` additions (`courseStreamOptions`, `contentTreeOptions`, `courseStaffOptions`,
`updateCardNote`); move the timeline into `classwork?view=timeline` unchanged. Imports
`UpcomingTracker` from W-14 (until W-14 pushes it, stub the import with Today's inline tracker
markup and swap at integration). Tests: stream row rendering per `post_kind`, tree grouping by
`content_id`, Info null-rendering, card-note save request shape. `npm run typecheck && npm run
build && npm test` green.

### W-14 — shared components (branch `feat/course-dimension-shared`, worktree `bb2dash-wt-cd-shared`)

`components/tracker/UpcomingTracker.tsx` extraction + paging (R-03); Home wired to it with a
56-day fetch (R-02 ready for W-13); `components/popout/` (R-05) + `?item=` handling in the app
layout; course-card note line (R-04); Materials per-course "Open in Classwork" link (R-06).
Tests: tracker paging math (anchor arithmetic, 56/14), popout open/close via query param,
card note render. Same green gates.

Push order matters: W-14 pushes `UpcomingTracker` within its first task so W-13 can consume it.

## Seams with Phase 9 (frozen)

* Phase 8 owns `stage_content`; Phase 9 calls it. Phase 9 owns every other stage and the driver.
* Phase 8 does not add `sync_runs` / `sync_stage_runs` rows. W-12's one-off run writes nothing
  there.
* Phase 8 reads `announcements` as it is; Phase 9 adds `author` / `read_at`. The Stream view
  reads `is_read` only. Phase 9's columns are additive.
* Neither phase edits `Today.tsx`'s sync row: Phase 9 replaces it with the needs-attention row;
  Phase 8's tracker extraction leaves that block untouched.
* Both phases regenerate `database.types.ts` at their own integration; the PM resolves the
  trivial conflict at the second merge.

## Out of scope this phase

Grades numbers, submission status, upload (Phase 10). Announcement creator field, read/unread
writes, bell (Phase 9 / Phase 11). Any transform stage other than content. Styling changes
beyond CSS Modules with existing tokens. Electron. Timeline redesign.

## Integration (PM)

Merge W-12 → W-14 → W-13 into `feat/course-dimension`; regenerate `database.types.ts`; typecheck,
build, test; Vercel preview deployment; live check of every tab for IST 323 and GEO 103 (two
shells); `/code-review` + `/security-review` (card_note is user input: length cap, plain text);
update STATUS + DECISIONS (records: Classroom-style course page; stage_content seam; migration
range allocation); open the PR; stop at "ready when you say so" — Stack merges after seeing the
preview.
