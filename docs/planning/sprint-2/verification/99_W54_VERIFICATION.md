# 99 — W-54 verification note (Phase 19, screens and desktop)

Worker W-54 · branch `feat/content-history-19-screens` · worktree
`bb2dash-wt-content-history-19-screens`. Owns the "W-54" row of brief 99 §Workers. Tasks:
**19, 20, 21, 22, 23, 24**. Fixtures only: no database read or write, no prod change.

All web checks run from `C:/Users/stack/projects/bb2dash-wt-content-history-19-screens/web`, all
desktop checks from `.../desktop`. `npm ci` exited 0 in both.

## Starting counts (branch at 92b3af9, before any change)

| Suite | Command | Result |
|---|---|---|
| web | `npx vitest run` | `Tests  2221 passed (2221)` |
| desktop | `npx vitest run` | `Tests  695 passed (695)` |

---

## Task 19 — `web/src/lib/sync-run-state.ts` (R-41)

Pure: `runStateWord`, types `StreamState` / `StreamStateName` / `RunStateWord`,
`normalizeStreams`, `neverSyncedLine`. `runStateWord` takes the row's `{status, interrupted}`
rather than the bare status, because "interrupted" is a `failed` run with 137's `interrupted`
set. `interrupted` on any other status changes nothing. `normalizeStreams` drops an element that
is not an object, names no stream, or carries a state outside `fresh | stale | never`; it never
throws, and a column that is absent gives `[]`.

Check: `npx vitest run test/sync-run-state.test.ts`

* RED (test written first, module absent):
  `Error: Failed to resolve import "@/lib/sync-run-state" from "test/sync-run-state.test.ts". Does the file exist?`
  → `Test Files  1 failed (1)` · `Tests  no tests`
* GREEN: `Test Files  1 passed (1)` · `Tests  22 passed (22)`
  (23 after task 20 added the "no list at all" case below)

---

## Task 20 — `freshnessLine` uses it; `SyncStatus` carries `notes`, `interrupted`, `streams`

`queries.sync.ts`: one import, three fields on `SyncStatus`, three lines in `normalizeSyncStatus`,
and `freshnessLine` now takes its run-state word from `runStateWord` and appends
`neverSyncedLine(status.streams)` only when `stalenessLine` returns null. `stalenessLine`'s body is
untouched. A row without the three columns normalises to `notes: null`, `interrupted: false`,
`streams: []`, and the line is the string `main` returns.

`neverSyncedLine` also accepts `null` / `undefined`: the query cache is persisted to localStorage
(`query-provider.tsx`), so a `SyncStatus` object written by the previous build can be restored
with no `streams` key at all. It reads as "none", and nothing throws.

Check (d): `git diff --numstat main -- web/src/lib/queries.sync.ts` → `14	6	web/src/lib/queries.sync.ts`
(first field 14, limit 15).

Check (a): `npx vitest run test/queries.sync.test.ts test/NeedsAttention.test.tsx test/Inbox.test.tsx`

* RED (tests added, `queries.sync.ts` still as on `main`), `npx vitest run test/queries.sync.test.ts`:
  `Tests  7 failed | 28 passed (35)`. The seven are the new-behaviour cases, for example
  `expected 'last synced 4 hrs ago' to be 'last synced 4 hrs ago · history never…'` and
  `expected 'last synced 4 hrs ago · last run fail…' to be 'last synced 4 hrs ago · last sync int…'`.
  The three "same string as `main`" cases (no `streams` key; each status with the new columns
  absent; a stale stage beside a never-synced stream) **passed against `main`'s code**, which is
  what shows the strings are `main`'s.
* GREEN: `Test Files  3 passed (3)` · `Tests  119 passed (119)`

The three fixtures the brief names, as asserted:

| Fixture | Line |
|---|---|
| every `freshness` row fresh, `streams` holding `history` `never` | `last synced 4 hrs ago · history never synced` |
| a `freshness` row stale 2 days, `streams` holding `history` `never` | ends `· files stale 2 days`, contains no `never synced` |
| no `streams` key | `last synced 4 hrs ago · files stale 2 days` (the string `main` returns) |

Also asserted: a reaped run reads `last synced 4 hrs ago · last sync interrupted` and never
`last run failed`; a running run with `history` `never` reads `sync running · history never synced`.

---

## Task 21 — the Stream shows "New" / "Changed" and the crawl date, keyed per run (R-38)

**Deviation from the brief, for the PM and Stack.** The brief (written 2026-09-24) says
`CourseStream.tsx` renders material posts and only needs "the label, the date and the key". On this
branch it does not: round 3 (R3-4, DECISIONS 2026-09-29, "the Stream **becomes** the week
timeline") removed the day-grouped post feed, and `CourseTimeline` reads only the announcement arm
of `v_course_stream`. On `main` no material post is drawn anywhere on the Stream, so there was no
row to add a label to.

What is built, inside W-54's two files only (`CourseTimeline*` is not W-54's): a block **"New and
changed materials"** between the Upcoming strip and the timeline.

* One row per `v_course_stream` material post that carries `meta.change` (`appeared` → **New**,
  `changed` → **Changed**) and `meta.run_id`: the label, the title as text, `synced <day>` from
  `posted_at` (the crawl's `seen_at`, as a New York day, in a `<time>`), and on a file post the
  shared `FileOpenAction` ladder the timeline's file rows already use.
* React key: `material:<ref_kind>:<ref_id>:<run_id>:<change>`.
* A material row with no `change` or no `run_id` (the view **before 133**) is not posted, so until
  133 is on prod the Stream is exactly what `main` renders. A course with no post gets no block.
* The newest `MATERIAL_POSTS_SHOWN` (8, one named constant) are listed; the rest fold under a
  native `<details>` "N earlier". History is kept all term, and an unbounded list would push the
  timeline off the screen. Nothing is dropped.
* Two rows with the same key (one file carried by two content items in one crawl) post once.
* Existing tokens only: `tagAccent` (New), `tagOutline` (Changed), `kicker`, `btnGhost`,
  `--space-*`, `--text-*`, `--color-text`, `--color-neutral-500`. No new colour.
* `CourseStreamMeta` gains `change` and `run_id`.

Placement, the cap of 8 and the word "synced" are W-54's picks and are Stack's to change on the
preview. **Not viewed in a browser**: the checks below are jsdom renders on fixtures.

Check: `npx vitest run test/course-stream.history.test.tsx test/course-stream.test.tsx`

* RED (test first, `CourseStream.tsx` as on `main`): `Test Files  1 failed | 1 passed (2)` ·
  `Tests  15 failed | 8 passed (23)`, for example `TypeError: materialChangeLabel is not a function`
  and `Unable to find role="region" and name "New and changed materials"`.
* GREEN: `Test Files  2 passed (2)` · `Tests  24 passed (24)`

Asserted: New / Changed label; the crawl date (`02:30Z` on Oct 2 reads `Thu · Oct 1`, the New York
day); one file posted by two runs renders twice and the spied `console.error` has no "same key"
call; a pre-133 view adds no block; a title holding `<b>` and `<img onerror>` is text, with no such
element in the DOM; the existing "no post feed" assertion of `course-stream.test.tsx` still holds.

---

## Task 22 — Classwork keeps two nodes that share a path (R-64)

No production change, as the brief expected. `buildContentTree` folds on `content_id` and nests on
`parent_id`; `path` is never a key. `CourseClasswork.tsx` keys its rows on `contentId` and its
files on `fileId`, and `splitVanishedRows` pairs ghosts on `(course_id, bb_item_id)`, so two live
nodes that share a path are both drawn.

New `web/test/course-classwork.samepath.test.ts` (9 cases) on an IST.466-shaped fixture: two
sibling lessons titled "Information" with the same path, each with a same-path "Lecture" child,
files 17 and 19 under them.

Check: `npx vitest run test/course-classwork.samepath.test.ts test/course-classwork.test.ts test/CourseClasswork.test.tsx`

* RED: **none against the real code.** The test passed on its first run, because the builder
  already keeps same-path nodes. To show the test can fail, `foldContentRows` was temporarily made
  first-wins by `(course_id, path)` (what the old `bb_content` key did), then restored with
  `git checkout`: `npx vitest run test/course-classwork.samepath.test.ts` →
  `Test Files  1 failed (1)` · `Tests  6 failed | 3 passed (9)`.
* GREEN (code as committed): `Test Files  3 passed (3)` · `Tests  41 passed (41)`

---

## Task 23 — raw-HTML guard for Blackboard rich text (P-94, R-76)

New `web/test/raw-html.audit.test.ts`. It scans every `.ts/.tsx/.js/.jsx/.mjs/.cjs` file under
`web/src` and asserts:

1. `dangerouslySetInnerHTML=` appears in exactly one file, `src/app/(app)/layout.tsx`;
2. that one use is `dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT_SCRIPT }}`, a constant from
   `@/lib/sidebar-preference`, and nothing else;
3. no other raw-HTML sink exists anywhere in `web/src`: the object-key form
   `dangerouslySetInnerHTML:`, `.innerHTML =`, `.outerHTML =`, `.insertAdjacentHTML(`,
   `document.write(`, `.createContextualFragment(`. (Beyond the brief's grep; today there are none.)

It also tests its own scanner on a synthetic source map, so a pattern that stops matching fails.

Nothing had to be removed. Before the test was written the only hit on this branch was the layout;
`components/announcements/AnnouncementsList.tsx:8` names the word in a comment (no `=`), which is
not a use.

Check (a): `npx vitest run test/raw-html.audit.test.ts`

* RED: **none against the real tree**, which was already clean. To show the guard bites, a file
  `web/src/__w54_planted__.tsx` holding `<div dangerouslySetInnerHTML={{ __html: body }} />` was
  created, the test run, and the file deleted:
  `AssertionError: expected [ 'src/__w54_planted__.tsx', …(1) ] to deeply equal [ 'src/app/(app)/layout.tsx' ]`
  → `Test Files  1 failed (1)` · `Tests  1 failed | 5 passed (6)`.
* GREEN (tree as committed): `Test Files  1 passed (1)` · `Tests  6 passed (6)`

Check (d): `grep -rl "dangerouslySetInnerHTML=" web/src` → `web/src/app/(app)/layout.tsx` (one path).

---

## Task 24 — desktop toast for an interrupted run (R-41, C-7 rule 1)

* `desktop/src/core/types.ts`: `SyncStatusRow.interrupted?: boolean`. Optional, so the fixtures
  in `desktop/test/fixtures/rows.ts` (not W-54's file) still type-check, and because a row read
  before 137 does not carry the column.
* `desktop/src/core/poller/sources.ts`: `syncQuery()` →
  `select=id,run_id,status,started_at,finished_at,trigger,summary,interrupted`. `validateSyncRows`
  reads the column through a new `flag()` helper: absent or null is `false`, a non-boolean is a
  `RowShapeError` like every other shape this module refuses.
* `desktop/src/core/poller/reducer.ts`: a `failed` run with `interrupted === true` is titled
  **"Sync interrupted"**; any other `failed` run keeps "Sync failed". Body, route and key are
  unchanged. `LANDED_STATUSES` is untouched, so `running` still never toasts.

Two existing assertions in `sources.test.ts` changed because the Contract changed them: the `R1`
literal gained `,interrupted`, and the "accepts a real v_sync_status row" expectation gained
`interrupted: false`. Everything else is an addition.

Check: `npx vitest run test/unit/reducer.test.ts test/unit/sources.test.ts` (from `desktop/`)

* RED (tests first, `src` as on `main`): `Test Files  2 failed (2)` ·
  `Tests  11 failed | 83 passed (94)`, among them `titles a reaped run "Sync interrupted", not
  "Sync failed"` and `R1 selects interrupted, the column 137 appends (Phase 19)`.
* GREEN: `Test Files  2 passed (2)` · `Tests  94 passed (94)`

Asserted: interrupted → title "Sync interrupted" (key `sync:41`, route `/`); a failed run not
reaped, and a row with no `interrupted` key, → "Sync failed"; a `running` row toasts nothing with
or without the flag; the flag on an `ok` run changes nothing; the running row then the reaped row
of one sync toast exactly once between them; `syncQuery()` selects `interrupted`.

**For integration.** PostgREST answers 400 for a column a view does not have. A desktop build
carrying this `syncQuery()` must not run against prod before 137 is applied: the sync read would
fail every tick, and C-7 turns a failed read into "this tick changes nothing".

---

## Final gates (branch at 21b691d)

| Gate | Command | Result |
|---|---|---|
| web typecheck | `cd web && npm run typecheck` | exit 0 |
| web build | `npm run build` | exit 0; route table ends `└ ○ /terms` |
| web tests | `npx vitest run` | exit 0 · `Test Files  132 passed (132)` · `Tests  2287 passed (2287)` |
| desktop typecheck | `cd desktop && npm run typecheck` | exit 0 |
| desktop tests | `npx vitest run` | exit 0 · `Test Files  36 passed (36)` · `Tests  707 passed (707)` |

Test counts: web 2221 → 2287 (+66), desktop 695 → 707 (+12). Nothing was removed.

`git diff --numstat main -- web/src/lib/queries.sync.ts` → `14	6	web/src/lib/queries.sync.ts`.

`git diff --name-only main` lists only W-54's files and the PM's brief commit (92b3af9):
nothing under `db/`, `skills/`, `ingest/`, `project-state/`, `mcp-server/`, and not
`web/src/lib/supabase/database.types.ts`.

## Not done, and open points

* The Stream block was not looked at in a browser. Placement, the cap of 8 and the word "synced"
  need Stack's eye on the preview (task 21's deviation note).
* `web/src/app/(app)/course/[id]/stream/page.tsx` still describes the page as "the tracker over
  the day-grouped stream feed" in its comment. Stale since R3-4; not W-54's file.
* The interrupted toast keeps the failed toast's body ("No error detail was recorded." when the
  summary is null, which a reaped run's is) and its route (Home, because `attention_raised` is
  read from the summary). 136 raises the Inbox item outside the summary, so the toast does not
  lead to it. The brief asks for the title only; say if the body or the route should change.
* `freshnessLine` still opens with "last synced <when>" for a failed or interrupted run, as on
  `main` ("last synced 4 hrs ago · last sync interrupted"). `<when>` is the reap time, not a
  sync. Unchanged because a row without the new columns must return `main`'s string.
