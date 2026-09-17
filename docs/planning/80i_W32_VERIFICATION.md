# W-32 verification — Home, Inbox, Materials, status menus (Phase 12b)

Worker: W-32. Branch `fix/page-pass-12b-pages`, worktree `bb2dash-wt-12b-pages`.
Date: 2026-09-17. Rows: H-1, H-2, H-3, H-4 (web half), H-5, H-6, G-2 (Home-card half),
S-1 (web half), I-2, I-3, M-1, M-3 + P-materials-2 (label half).

**All twelve rows done. Nothing blocked.**

## Gates

| gate | result |
|---|---|
| `npm run typecheck` | clean, before every push |
| `npm run build` | compiled successfully, before every push |
| `npm test` (vitest) | **1555 passed, 97 files** — up from `main`'s **1342 / 87**. Count never dropped at any commit. |

Suite count per commit: 1342 (base) → 1360 → 1388 → 1393 → 1399 → 1405 → 1413 → 1428 →
1445 → 1480 → 1502 → 1530 → 1555.

One commit per row, pushed as each finished:

| commit | row |
|---|---|
| `2ff1135` | H-1 |
| `4cf9af6` | H-2 |
| `289823a` | H-3 |
| `d9797ea` | H-5 |
| `77d4627` | H-6 |
| `8895988` | H-4 |
| `e802adc` | G-2 |
| `677a97a` | S-1 |
| `bfdfd26` | I-2 |
| `2ed5255` | I-3 |
| `81947d2` | M-1 |
| `be1e2ea` | M-3 |

---

## H-1 — type colour tokens (P-home-1)

**Was:** `--type-*-bg` was one purple ramp plus a grey — five steps of the same hue, told
apart only by lightness, which on a 14-column bar reads as one smear.

**Now:** five hues at a deliberately common luminance, so the category is carried by
colour and the bar heights stay the only thing lightness means.

| type | bg | luminance | vs dark card `#232532` | vs white | white on it |
|---|---|---|---|---|---|
| reading | `#137e92` teal | 0.1714 | 3.20:1 | 4.74:1 | 4.74:1 |
| assignment | `#725fde` violet | 0.1704 | 3.19:1 | 4.76:1 | 4.76:1 |
| quiz | `#9d6811` amber | 0.1711 | 3.20:1 | 4.75:1 | 4.75:1 |
| project | `#1a8352` green | 0.1706 | 3.19:1 | 4.76:1 | 4.76:1 |
| exam | `#c8435a` rose | 0.1703 | 3.19:1 | 4.77:1 | 4.77:1 |

Minimum pairwise CIE76 ΔE = **42.4**.

The luminance band (0.170–0.172) is the intersection of two requirements: ≥ 3:1 against
the card (WCAG 1.4.11 — a bar segment carries meaning) and ≥ 4.5:1 for the glyph letter
on the chip (WCAG AA). Above the band the letter fails; below it the segment does.

**Test:** `web/test/type-tokens.contrast.test.ts`, 18 assertions. It parses
`src/app/globals.css` itself and resolves `var()` chains, so the contract cannot drift
from the values, and a Phase 13 restyle that expresses the tokens as ramp names is still
measured.

**RED → GREEN:** 7 of 18 failed on the old ramp — five ΔE pairs
(`reading/assignment 15.9`, `reading/quiz 24.7`, `assignment/quiz 16.6`,
`quiz/project 14.7`, `project/exam 24.3`) plus the ramp-shape check
(`chromaSpread 41.8` was less than `lightnessSpread 44.5`). 18/18 after.

### "light and dark" — how it was read

The app is dark-only today: `globals.css` sets `color-scheme: dark` and has no
`prefers-color-scheme` block or `[data-theme]` hook anywhere. Rather than invent a whole
light theme for five tokens (Phase 13 owns taste), the same five hues are **proven on
both grounds**: the test measures every segment against `--color-surface` AND against
white, and all five clear 3:1 on each. Phase 13 can flip the surface without re-picking
the palette. **PM: if Stack wanted a literal light-mode token set, that is a one-line
addition to `globals.css` plus a second block in the test — say so and it is done.**

### One place the row's wording could not be met literally

The row asks for "≥ 3:1 against its neighbour". That is unachievable for five colours:
four adjacent 3:1 steps need an 81× span of (L + 0.05) and the whole sRGB range spans
21×. Telling five colours apart by *lightness* is precisely the one-hue ramp being
replaced, so hue distance (CIE76 ΔE ≥ 30) is the measure used instead. The reasoning is
written into the test's header, not just here.

---

## H-2 — the tracker scrolls the whole term (P-home-2, answer 11)

**Was:** exactly `visibleDays` columns, sized to fill the container. Nothing to scroll;
only ◂ ▸ moved the 56-day horizon.

**Now:** one column per day of the range the items actually span, scrolling across them,
opening anchored on today, arrows still paging by whole screens.

**`anchor.ts` additions (all pure):** `trackerRange`, `rangeLength`, `maxStripAnchor`,
`clampStripAnchor`, `pageStripAnchor`, `stripWindow`, `buildTrackerStrip`.
`buildTrackerWindow` keeps its contract and now shares one `describeDay()` with the
strip, so the Monday rule and the month label cannot fork.

* **Range** = first dated item → last, today always on it, never shorter than one
  screenful, never past `horizonDays`. A column past the fetch would render empty and
  read as "nothing due", which the data does not support — so `horizonDays` stays
  meaningful instead of becoming dead weight.
* **Opens at today:** the self-managed anchor and selection are now `null` = "follow
  today" rather than a date seeded once, which also *preserves* the midnight fix — a tab
  left open across midnight moves to the new today by itself.
* **Column width:** `calc(100% / var(--tracker-columns))` where the variable is the
  VISIBLE count. A flex item's percentage resolves against the container's content box,
  not its scroll width, so 14 fill the view and the rest overflow.
* **Scroll ↔ anchor:** the anchor drives `scrollLeft`; free scrolling moves the view and
  the arrows but never the saved anchor. A `programmatic` ref stops the effect's own
  scroll being read as a drag. No feedback loop.
* Bars scale to the whole strip, so scrolling does not re-scale them under the reader's
  eye. The two counters describe the window on screen.

**Backward compatibility:** `UpcomingTrackerProps` is unchanged. The course Stream
(`CourseStream.tsx:176`) passes the same props and `test/course-stream.test.tsx` is green
untouched.

**Tests:** 23 new in `tracker.anchor.test.ts` (53 total in that file), 5 new in
`UpcomingTracker.test.tsx`. Six existing tests encoded the old "exactly N columns exist"
contract and were rewritten to the new one — columns are addressed by date now, via a
`columnOn(iso)` helper, not by position. No test was deleted.

---

## H-3 — one card, needs-attention last (P-home-3, P-home-5)

`UpcomingTracker`'s section is now a `cardLg` holding the heading, the strip, the window
line and the day panel; the panel dropped its own card and keeps its identity with a
hairline rule. `<NeedsAttentionRow/>` moved from third-from-top to last in `Today.tsx`.

**Test:** `web/test/TodayLayout.test.tsx` renders the whole screen with its query layer
stubbed and asserts **structure, not appearance**: the strip and the panel resolve to the
same nearest card ancestor (one card, not two), the heading is inside it, the
needs-attention section is last in document order and still present.

**Discriminating:** before the change the strip had no card ancestor at all, so
`expect(stripCard).not.toBeNull()` is what fails on the old markup.

---

## H-4 — `in_workload` on every workload/Undated read (P-home-6, P-home-7), web half

**Audit result: the filter was already right everywhere it has to be.**

| reader | state |
|---|---|
| `queries.today.ts` dated window | `.eq('in_workload', true)` ✔ |
| `queries.today.ts` Undated tray | `.eq('in_workload', true)` ✔ |
| `CourseStream.tsx:154` | `item.in_workload !== false` client-side ✔ |
| `usePlannerWeekData.ts:147` | reads through `useWorkItemsWindow`, inherits it ✔ |
| `queries.course.ts` | unfiltered — **deliberate**, see below |
| `queries.popout.ts` | unfiltered — **deliberate**, see below |

`queries.course.ts` backs both the Stream and Classwork. Classwork is a folder tree of
everything Blackboard holds, so filtering it would hide real content; the Stream filters
the rows itself. `queries.popout.ts` is the series strip — a sibling listing by
`series_key`, not a workload sum. Both are on a documented exemption list.

**`in_workload` already exists** (migration 016) and is already in `database.types.ts`
(`v_work_items.in_workload: boolean | null`, line 3581). W-30's 073 **redefines** the
column, it does not add it — **no local row-type extension was needed**.

What was missing was anything holding it in place: a dropped filter shows as twelve
phantom rows, not an error. Added:

* the request recorder in `queries.today.request.test.ts` now captures `.eq()` filters,
  and both Home reads assert theirs exactly;
* `web/test/work-items.workload-filter.test.ts` walks `src/` for every
  `.from('v_work_items')` and requires each to constrain the column or sit on the
  exemption list with a written reason. The list is kept honest both ways — an entry
  that stops reading the view fails too.

**Discriminating:** the predicate looks for `.eq('in_workload'` or a comparison, never a
bare mention, because every read names the column in its select list. Verified by
stripping the filter from a copy of `queries.today.ts`: predicate flips `true → false`.

---

## H-5 — the Home course card is a link (P-home-8)

The card was a bare `<div>` with card styling: it looked clickable, and there was no
keyboard route to a course from Home at all. It is now a `<Link>` to
`/course/<display_id>` — display_id, not a shell id, so GEO 103's merged card opens its
own page — with the id percent-encoded. Nothing inside is interactive, so one link
swallows nothing. It carries `aria-label="Open IST 323 — Intro to Cybersecurity"`, and
the CSS gives back what an `<a>` owes: `color: inherit`, no underline, a hover state and
a focus ring.

**RED → GREEN:** 6 new assertions in `test/CourseCard.test.tsx` failed with *"Unable to
find an element with role 'link'"*; 13/13 in that file after.

---

## H-6 — navigating closes the sidebar, without writing the preference (P-home-9, answer 10)

Two bugs, not one. Opening a course left the in-flow rail over the page it had just
opened; and the branch that *did* close it (overlay mode) went through `close()`, which
persists — so tapping a course on a phone quietly recorded `'closed'` and the rail stayed
down on every later visit.

`SidebarProvider` gains **`closeForNavigation()`**: the same close, minus the memory.
`close()` keeps persisting, because the toggle, Escape and the scrim are choices Stack
made. `CourseSidebar`'s route effect now runs in both modes and compares the pathname
against the one it last saw, so a mount is not read as a move — otherwise the rail would
never show on a cold load.

**RED → GREEN:** 4 of 6 new assertions failed (the in-flow rail stayed open; **both**
modes wrote the key). 24/24 in that file after, including the existing tests that the
toggle still persists.

---

## G-2 (Home-card half) — the grade slot (P-home-10, answer 12)

New `web/src/app/(app)/CourseGradeFigure.tsx`.

### The prop contract

```ts
export interface CourseGradeFigure {
  label: string;            // "Blackboard", "Graded so far" — two or three words
  value: string | null;     // the formatted figure, e.g. "14.8 / 104"
  absence: string | null;   // why there is none; required when `value` is null
  asOf: string | null;      // already formatted; null when not applicable
  display?: string | null;  // a letter/display grade published alongside
}

// on CourseCard:
grades?: readonly CourseGradeFigure[];   // defaults to []
```

Everything is **already formatted** — no numerator, denominator or method — because the
card must not be in a position to do arithmetic. A producer fills `value` **or** fills
`absence`, never both and never neither (asserted).

### What is wired, and what is the slot

* **Wired now:** `blackboardGradeFigure(pickCourseGrade(rows, course.shell_ids))`, using
  the Phase 10a helpers, so the card and `/grades` read the same row and cannot disagree
  — including picking the shell that publishes a total for a merged course. The two
  absences stay apart: `not synced yet` (about us) vs `publishes no total` (about the
  course).
* **The slot:** the graded-so-far figure is appended as a **second array entry** by the
  PM once Stack picks the method from `80e_GRADE_METHOD_COMPARISON.md`. **Nothing in the
  component changes when it is** — there is a test that renders two figures to prove it.
  The slot is marked as such in `Today.tsx`'s `cardGrades()`, with the reason this screen
  must not compute one (Home and `/grades` would drift).

Honesty: while the gradebook read is in flight or has failed, the card shows **no figure
at all** — "not synced yet" is a claim about the data that neither state supports.

**Tests:** `test/CourseGradeFigure.test.tsx` (10) + a `Home — the course card grade slot`
block in `TodayLayout.test.tsx` (5).

---

## S-1 (web half) — one status vocabulary (P-grades-7)

**Was:** two vocabularies, and nobody read the one the PM froze. `queries.today.ts`
declared a nine-option menu labelled "not started" / "missed" / "n/a"; `CourseScreen`
spelled its own by replacing underscores; the popout read the query layer's map; and
`lib/progress-status.ts` was **imported by nothing at all**.

**Now:** `queries.today.ts` re-exports `progress-status` instead of declaring anything.
`STATUS_OPTIONS` is **deleted** rather than re-exported — it named a nine-value menu, and
a name that lies is worse than one that is missing. `progress-status.ts` itself is
untouched.

### The retired-value bug this exposed

The Postgres enum keeps all nine values and migration 078 folds the rows, so until it
runs `assignment_progress` still holds `planned`, `waived` and `not_applicable`. **A
controlled `<select>` whose value matches no option renders as its FIRST option** — so a
`waived` row displayed "not opened", and the next edit to anything on that row would have
written it.

New `<StatusOptions value={...}>` renders the six plus, **only when the row holds one**, a
**disabled** entry showing that value's fold. The control then shows "excused", offers no
way to pick it, and nothing is rewritten by being looked at.

**Tests:** `test/StatusSelect.test.tsx` (13) covers all three retired values on all three
counts. `test/status-vocabulary.test.ts` (4) scans `src/` so a fifth screen cannot start
the drift again: no hard-coded retired value, no second label map, no `STATUS_OPTIONS` —
comments stripped first, with one documented exemption for `queries.grades.ts`, which
glosses Blackboard's own `submission_status` ("UNOPENED" → "not opened"), a different
vocabulary about a different column.

### The `AssignmentPopout.tsx` hunk — exactly this, and nothing else

```diff
@@ -19,7 +19,11 @@
 import { useEffect, useRef, useState } from 'react';
 import Link from 'next/link';
 import tokens from '@/styles/tokens.module.css';
-import { courseCodeFromId, STATUS_LABEL, STATUS_OPTIONS } from '@/lib/queries.today';
+import { courseCodeFromId } from '@/lib/queries.today';
+// S-1 (P-grades-7): the one status vocabulary, and the one menu that knows
+// what to do with a retired value still stored on a row.
+import { statusLabel } from '@/lib/progress-status';
+import { StatusOptions } from '@/components/tracker/StatusSelect';
 import { useCourse, type ProgressStatus } from '@/lib/queries';

@@ -57,7 +61,7 @@ function formatDate(iso: string | null): string {
 function statusText(status: string | null | undefined): string {
   const key = status ?? 'not_started';
-  return STATUS_LABEL[key as ProgressStatus] ?? key.replace(/_/g, ' ');
+  return statusLabel(key as ProgressStatus) ?? key.replace(/_/g, ' ');
 }

@@ -367,11 +371,7 @@ export function AssignmentPopout({ assignmentId }: { assignmentId: string }) {
               onChange={(e) => commit({ status: e.target.value as AssignmentProgress['status'] })}
             >
-              {STATUS_OPTIONS.map((option) => (
-                <option key={option} value={option}>
-                  {STATUS_LABEL[option]}
-                </option>
-              ))}
+              <StatusOptions value={status as ProgressStatus} />
             </select>
           </label>
```

3 hunks, +7 −7. The grade props W-31 passes elsewhere in that file are untouched.

### Planner files still on the old constants

**None. There never were any.** `web/src/components/planner/`, `planner-week.ts`,
`planner-events*.ts` and `queries.planner*.ts` import no status constants and spell no
status labels — verified by grep across the whole tree. The planner's quick-edit reaches
status through `StatusSelect`, so it picked up the six for free.

---

## I-2 — what each Inbox answer does (P-inbox-2, answer 16)

The controls said "Accept Blackboard" / "Keep mine" / "Save" / "Dismiss" and nothing
else, so the only way to know what pressing one would do to a given row was to read
`apply_resolutions()`. And most of the queue is rows nothing applies to at all — 45
course-map seeds, 2 staff-name conflicts, an ambiguous gradebook column — which looked
identical to the 7 due-date conflicts that do.

`queries.sync.ts` gains `outcomeText(item, action)` plus `outcomeApplies()`,
`isAssignmentRef()`, `fieldPhrase()`, `fieldValueText()`, `APPLIED_FIELDS`,
`RECORDED_ONLY` and `INBOX_APPLY_HELP`.

`outcomeApplies()` mirrors **migration 042 branch for branch**: kind ∈ {conflict,
stack_must_confirm, missing}, `entity = 'assignment'`, a `ref` that is an assignment id,
`field` ∈ {due_at, due_date, points_possible, bb_url} — with "Keep mine" the exception,
since it writes `confidence` alone and needs no field. `isAssignmentRef()` rejects the
prefixed pseudo-refs (`column:`, `staff:`, `course_field:`, `map_gap:`) because
`apply_resolutions()` looks `ref` up in `assignments.id` and those match nothing.

**America/New_York is not decoration:** `2026-09-25T03:59Z` is 11:59 PM on the **24th** in
New York, and printing the 25th moves a deadline by a day. A bare `'YYYY-MM-DD'` prints
as a day with no clock time, because giving it one invents a deadline. Both are asserted.

Everything that does not apply says Stack's words — *"Recorded only — nothing is changed
automatically."* A dismissal adds that the row closes and the sync stops asking. One line
at the top of the Inbox states the rule once (`INBOX_APPLY_HELP`).

**Tests:** 29 in `test/queries.sync.outcome.test.ts` over kind × field × action, plus 6
on the screen in `Inbox.test.tsx`, including one that every rendered control has a
sentence beside it ending in a full stop.

**Fixture fix:** `makeAttentionItem`'s ref was `'IST.323.quiz-2'` with a dot. All 83
assignment ids in prod are `<course>/<slug>`, and the ref is now what decides whether an
answer can apply, so a wrong-shaped fixture would have tested the wrong branch.

---

## I-3 — the Inbox row's anatomy (P-inbox-3)

In order now: **course code** (as the rest of the app writes it), **kind**, **age** via
`relativeTime` with the exact timestamp as its `title`, the **question**, the **change**
formatted under the field it belongs to, the **source as a sentence with a link**, and
the stage's payload as **labelled words**.

`sourceText()` — was `entity · ref · field · run #42`, four database values with
separators. Now: *"From the assignment “quiz-2” in IST 323, about its due date. Raised by
sync run #42."* Each prefixed pseudo-ref gets its own phrase (a gradebook column, a
course-record field, a gap in the course map, the staff list), because those are
different **kinds** of question and the difference is the first thing worth knowing.

`sourceHref()` links an assignment to its popout (`?item=`, which the `(app)` layout
mounts on every route, so it opens in place) and anything else naming a course to that
course. A pseudo-ref names no row bb2dash can show, so it falls back to the course rather
than producing a dead link.

`describeDetails()` replaces `JSON.stringify` for `suggested`, which is ad-hoc jsonb.
Keys become words, timestamps become New York dates, nulls become "none", booleans become
yes/no, one level of nesting unrolls onto the line, and two levels deep says `…` rather
than unrolling something unreadable.

**Tests:** 13 in `queries.sync.outcome.test.ts` (including the five **real payload shapes
pulled from prod**, asserting no brace or quote survives) and a rewritten
`Inbox — what a row shows` block (13) in `Inbox.test.tsx`, one of which asserts the whole
rendered screen contains no `{`, `}` or `"`.

---

## M-1 — sections fold, readings block by date (P-materials-1, P-materials-3)

**Folding:** new `web/src/lib/materials-collapse.ts`. Set of folded sections keyed
`<course>::<bucket>`, persisted as JSON, **every access in try/catch** — junk in storage
means everything opens, which is a correct answer. **Default OPEN**: the sections are
collapsible, not collapsed; a screen that hides its contents until you find the toggle is
a worse bug than the one being fixed. The stored set is adopted in a **mount effect**,
not read during render, so the first client render matches the HTML it is hydrating.
`toggleCollapsed` returns a **new** Set.

The head is a `<button aria-expanded>`, not a `<details>`, because the state must be owned
by React to be persisted and a native `<details>` would fight that on every re-render.

**Blocking:** `groupReadings()` blocks by `for_date`, date order, undated tail last — as
**two** groups:

| group | rule | today |
|---|---|---|
| **Case pool** | undated **and** `required = false` | IST.466's nine HBR cases |
| **No date yet** | undated **and** required | nothing |

That distinction is the point. The cases have no date because they are a **pool** the
course picks from — nine of the ten are assigned to other ethics groups (answer 7). A
*required* reading with no date is a **gap**. Calling both "no date" hides the gap;
calling both "case pool" invents a pool. The rule is the data, not a list of ids.

**All ten cases stay on the screen** — the pool is a grouping, not a filter (asserted).
Reading 89 ("Apple vs. The FBI") already carries `for_date = 2026-09-24` in prod, so it
sits under its own date header and **nine**, not ten, are in the pool. **PM: if Stack
wants all ten under one "Case pool" header regardless of 89's date, say so — it is a
one-line change to the rule.**

`readingDateHeading` parses `'YYYY-MM-DD'` field by field: `new Date(iso)` reads a bare
date as UTC midnight and shows the day before anywhere west of Greenwich.

**Tests:** 19 in `test/materials.grouping.test.ts` (grouping + the storage rules,
including storage throwing on read and on write), 9 in `test/MaterialsCollapse.test.tsx`
(the screen: aria-expanded, rows hidden, one section at a time, survives a remount, still
renders when localStorage refuses).

---

## M-3 + P-materials-2 (label half) — the syllabus, and splitting "Off-platform"

**The tag split.** 41 rows read "Off-platform"; only 21 were. The other 20 were GEO 103
readings sitting on Blackboard that had never been pulled — a gap on our side, not a
property of the reading. `kind` cannot express this ('instruction' covers both), so
`ReadingRoute` now carries a `tag`:

| tag | when |
|---|---|
| `In library` | stored bytes |
| `External` | a source URL |
| `On Blackboard — not pulled yet` | `on_blackboard`, no file yet |
| `Off-platform` | textbook / publisher e-book |
| `No route` | nothing recorded |

**The syllabus.** `resolveSyllabusFiles()` decides which `bb_files` row IS each course's
syllabus. `courses.syllabus_path` is unreliable as a storage key, but its **basename** is
the file's real name and does match `bb_files.file_name`. Three rules, in order:

1. that basename among the course's `syllabus_policy` files;
2. failing that, the **lecture shell's** answer;
3. failing that, the course's **sole** candidate, if it has exactly one.

With two unmatched candidates it chooses **nothing** rather than guessing.

Against the seven real `courses` rows and ten real `syllabus_policy` files from prod:

| course | resolved file | by which rule |
|---|---|---|
| ECN.304 | 23 `ECN 304 F26 Syllabus_M001.pdf` | basename |
| GEO.103.lecture | 42 `GEO 103 (2026) - syllabus - FINAL.pdf` | basename |
| **GEO.103.recitation** | **42** (not its own file 22) | **lecture fallback** |
| IST.323 | 2 `323Fall26V1.3.1.docx` (not 3, the policy appendix) | basename |
| IST.352 | 27 `IST 352 Syllabus Fall 2026.docx` (not 73) | basename |
| IST.466 | 39 `IST466M3 Fall2026 Syllabus.docx` (not 33) | basename |
| IST.471 | 26 `IST 471 Syllabus.pdf` | basename |

The recitation case is the one the row called out: its own `syllabus_policy` file is the
discussion-section guide, a different document, and `syllabus_path` points at the
lecture's anyway.

The control opens it through the existing **`FileOpenAction` ladder**, so it is honest
about stored bytes, a source link or a dead end like every other file. `FileOpenAction`
and `OpenStoredButton` take optional `action`/`title`/`className` so a caller can say
what the errand is; the dead-end rungs keep their own wording, because those describe the
absence, not the errand.

The syllabus read is deliberately **outside** `loading` and `failed`: it decides one
action on one kind of row, and a syllabus we cannot resolve is not a materials browser we
cannot show.

**Tests:** 20 in `test/materials.syllabus.test.ts` (prod fixtures), 5 more in
`MaterialsCollapse.test.tsx` (the live control, its title, the reason text, and that the
two tags do not merge).

---

## What depends on W-30's migrations being live

Nothing here **breaks** without them; these are the behaviours that only become true once
they land.

| migration | what changes on this branch when it lands |
|---|---|
| **073** workload visibility + readings data | The `in_workload` filter is already sent by every workload read (H-4). Until 073 redefines the column, the three series placeholders and the case-pool readings **stay visible** in Undated. No code change needed either way — `in_workload` has existed since 016 and is already in `database.types.ts`. Reading 89's `for_date = 2026-09-24` is **already in prod**, so M-1's date header for it is live now. |
| **074** reading ↔ file link | GEO 103's readings move from `On Blackboard — not pulled yet` to `In library` **on their own** — that is the tag rule reacting to `bb_files.reading_id` being set. Nothing to change. The 21 textbook chapters stay `Off-platform`. |
| **078** status fold + auto-graded | Until it runs, rows still hold `planned` / `waived` / `not_applicable`, and `<StatusOptions>`'s disabled legacy entry is what keeps them displaying correctly. **After 078 the legacy entry simply stops appearing** — no code change, and `test/StatusSelect.test.tsx` keeps covering the transitional path. The auto-graded step is W-30's; `AUTO_GRADED_FROM` in `progress-status.ts` is the web-side mirror and is untouched. |

**Not a migration, but a cross-worker dependency:** `CourseGradeFigure.tsx` imports
`pickCourseGrade`, `courseGradeState`, `scoreText` and `formatSeenAt` from
`queries.grades.ts` (W-31's file). All four are frozen Phase 10a helpers, but **if W-31's
G-1 removal changes any of their signatures, the Home card is a caller to re-check.**

## Files touched

```
web/src/app/globals.css                                  H-1
web/src/components/tracker/anchor.ts                     H-2
web/src/components/tracker/UpcomingTracker.tsx           H-2, H-3
web/src/components/tracker/UpcomingTracker.module.css    H-2, H-3
web/src/components/tracker/StatusSelect.tsx              S-1
web/src/app/(app)/Today.tsx                              H-3, H-5, G-2
web/src/app/(app)/Today.module.css                       H-5, G-2
web/src/app/(app)/CourseGradeFigure.tsx            (new) G-2
web/src/components/shell/SidebarProvider.tsx             H-6
web/src/components/shell/CourseSidebar.tsx               H-6
web/src/lib/queries.today.ts                             S-1
web/src/components/popout/AssignmentPopout.tsx           S-1 (status <select> only)
web/src/app/(app)/course/[id]/classwork/CourseScreen.tsx S-1 (statusLabel only)
web/src/lib/queries.sync.ts                              I-2, I-3
web/src/app/(app)/inbox/Inbox.tsx                        I-2, I-3
web/src/app/(app)/inbox/Inbox.module.css                 I-2, I-3
web/src/lib/materials-collapse.ts                  (new) M-1
web/src/lib/queries.materials.ts                         M-1, M-3
web/src/app/(app)/materials/MaterialsBrowser.tsx         M-1, M-3
web/src/app/(app)/materials/Materials.module.css         M-1
web/src/components/materials/FileOpenAction.tsx          M-3
web/src/components/materials/OpenStoredButton.tsx        M-3
```

Nothing under `project-state/`, `db/migrations/`, `desktop/`, `web/src/lib/grade-model*`,
`web/src/components/grades/`, `web/src/components/planner/`,
`web/src/components/popout/SubmissionBlock.tsx` or
`web/src/lib/supabase/proxy-session.ts` was touched.

## New test files

```
web/test/type-tokens.contrast.test.ts        18
web/test/TodayLayout.test.tsx                10
web/test/CourseGradeFigure.test.tsx          10
web/test/work-items.workload-filter.test.ts   6
web/test/StatusSelect.test.tsx               13
web/test/status-vocabulary.test.ts            4
web/test/queries.sync.outcome.test.ts        42
web/test/materials.grouping.test.ts          19
web/test/materials.syllabus.test.ts          20
web/test/MaterialsCollapse.test.tsx          14
```

Existing files extended: `tracker.anchor.test.ts`, `UpcomingTracker.test.tsx`,
`CourseCard.test.tsx`, `CourseSidebar.test.tsx`, `queries.today.request.test.ts`,
`Inbox.test.tsx`, `factories.ts`, `MaterialsCourseLinks.test.tsx`.

---

# Round 2 — the PM browser walk (2026-09-17)

`origin/fix/page-pass-12b` merged in cleanly (no conflicts). Three findings assigned to
W-32; **all three fixed**, one commit each, TDD, each pushed as it went.

| gate | result |
|---|---|
| `npm run typecheck` | clean before every push |
| `npm run build` | compiled successfully before every push |
| `npm test` | **1672 passed, 103 files** (1555 at end of round 1; the merge brought W-30's and W-33's suites in) |

| commit | finding |
|---|---|
| `d3789f5` | F-1 |
| `7f95c24` | F-3 |
| `a1ad19c` | F-4 |

## F-1 (S-1) — the course Stream printed the raw enum

`CourseStream.tsx:99` built its label with `meta.status.replace(/_/g, ' ')`, so the post
line read "not started" while Home, the tracker, the popout and the planner chip said
"not opened" for the same item. It also had no idea `missed` means DNF or that a `waived`
row folds to excused. It now calls `statusLabel()` from `@/lib/progress-status`, keeping
the underscore fallback only for a value the enum does not carry.

**RED → GREEN:** 5 failures in `test/course-stream.test.tsx` → 22/22.

### The grep of `web/src`, in full — this was the only other site

Thirteen `replace(/_/g, ' ')` occurrences exist. One was the bug. The rest are **different
vocabularies and are correctly left alone**:

| file | what it spells | verdict |
|---|---|---|
| `CourseStream.tsx:96` | assignment `type` | not a status |
| `CourseClasswork.tsx:87` | content kind / `bbType` | not a status |
| `CourseScreen.tsx:455, 505` | session `kind` | not a status |
| `SessionPopout.tsx:82` | session `kind` | not a status |
| `AssignmentPopout.tsx:250, 282` | assignment `type`, `source` | not a status |
| `CommandPalette.tsx:297` | search `bucket` | not a status |
| `queries.materials.ts:177` | file bucket | not a status |
| `queries.sync.ts:597, 686` | Inbox field / key names | not a status |
| `CourseScreen.tsx:57` | planner status | **already correct** — asks `statusLabel()` first |
| `AssignmentPopout.tsx:64` | planner status | **already correct** — same shape |

Also checked and deliberately left: `GradebookTable.tsx:188` and
`SubmissionBlock.tsx:155, 191` render Blackboard's own `submission_status` /
`attempt.status` free text. That is a different vocabulary about a different column and
belongs to W-31.

### Why the round-1 scan missed it, and what now catches it

`status-vocabulary.test.ts` asked whether a file **imports** the vocabulary, against a
hand-kept list the Stream was not on. A list of files cannot catch a file nobody thought
of. It now also forbids the **shape**: a `.replace(/_/g, ' ')` whose subject is a status
and which has not asked `statusLabel()` first. Checked **per occurrence**, not per file,
because `session.kind.replace(...)` is legitimate and lives in the same files — the
first attempt at this was per-file and wrongly flagged `CourseScreen.tsx`.

Verified both directions: the old Stream line flags, the fixed line does not.

## F-3 (I-3) — a date in another year printed without it

`fieldValueText()` now takes `now` and adds `year: 'numeric'` **only when the value's
year differs from the current one**, so the ~90% of rows that are this term's stay
uncluttered. `outcomeText()` threads the same `now` through, so the sentences under the
buttons carry it too.

On the out-of-term rows the year IS the finding — a syllabus carried forward without its
dates changed is exactly why the transform raised them — and "Tue, Sep 20, 11:06 AM" made
a 2022 value read as this term's.

Asserted: the year appears for a past year **and a future one** ("different" is not
"older"); the comparison is made **in New York, not UTC** (`2027-01-01T04:00Z` is still
2026 here, and carries no year); and it tracks the reader's year rather than a hard-coded
one. `now` is injected rather than read from the clock so the suite does not quietly start
printing years on 1 January — the round-1 assertions were given a fixed `NOW` for the same
reason.

**RED → GREEN:** 4 failures → 46/46.

## F-4 (I-2) — the chip promised an apply that never comes

**One source of truth, as asked.** `resolvedAction(item)` reads an answered row back to
find which control produced it — the Inbox writes `{accept}` / `{value, value_type}` /
`{dismissed}` — and `appliesAutomatically(item)` hands that action to **`outcomeApplies`,
the very predicate the sentence under each button already uses**. A row can no longer say
"recorded only" beneath the control and "applies on next sync" beside the answer; there is
a test that walks four row shapes and asserts the two agree row for row.

The chip now reads, in order: `dismissed` → `applied` → `answered · recorded only` →
`answered, applies on next sync`.

Two further bugs fell out of that ordering:

* a **dismissed** row with no `applied_at` used to claim it would apply — dismissing *is*
  the answer, and nothing ever stamps it;
* **"Keep mine"** correctly keeps the promise even on a row with no writable field,
  because it writes `confidence` alone (migration 042's one exception).

An answer whose shape cannot be read — the 15 rows PM sessions answered directly in SQL —
is treated as recorded only. Claiming less than we know is the safe direction for a
promise.

**RED → GREEN:** 5 failures → 46/46 on the screen, 55/55 in the unit suite.

## Files touched in round 2

```
web/src/app/(app)/course/[id]/stream/CourseStream.tsx   F-1
web/src/lib/queries.sync.ts                             F-3, F-4
web/src/app/(app)/inbox/Inbox.tsx                       F-4
web/test/course-stream.test.tsx                         F-1
web/test/status-vocabulary.test.ts                      F-1 (the guard that missed it)
web/test/queries.sync.outcome.test.ts                   F-3, F-4
web/test/Inbox.test.tsx                                 F-4
```

F-2 (W-33) and F-5 (W-30) were not touched.
