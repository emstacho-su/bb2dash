# 80h — W-31 (grades) verification note

Phase 12b, branch `fix/page-pass-12b-grades`, worktree `bb2dash-wt-12b-grades`.
Rows from §Item task list of `80c_PHASE12B_page_pass.md`: **G-0** (the gate), the
method-independent rows **G-3, G-4, G-5, G-6**, the collapsible half of **G-2**, and — after
Stack's pick on 2026-09-17 — **G-1** and the header-figure half of **G-2**. All done.

Baseline on the branch before any of this work: **87 test files, 1342 tests, all passing.**

---

## G-0 — grade-method comparison suite (P-grades-3, P-grades-1 method) — **done, gate open**

### What was built

| file | what it is |
|---|---|
| `web/src/lib/grade-so-far.ts` | the two new pure functions, `pointsRatio` and `weightedSoFar`, over one input shape (latest gradebook rows + `grade_components` + column → part links). No I/O, no clock, no mutation. |
| `web/test/grade-fixtures/types.ts` | the fixture shape, declared locally so the fixtures survive whatever G-1 deletes |
| `web/test/grade-fixtures/builders.ts` | terse fixture builders |
| `web/test/grade-fixtures/fixtures/01…18-*.ts` | **18 fixtures**, one file each, every one carrying its hand-written derivation as a comment |
| `web/test/grade-fixtures/methods.ts` | the methods behind one signature; the **only** file that imported `grade-model/` |
| `web/test/grade-fixtures/report.ts` | scoring and the markdown |
| `web/test/grade-fixtures/comparison.test.ts` | the run; wrote `docs/planning/80e_GRADE_METHOD_COMPARISON.md` |

> The three files above were **deleted by G-1** once Stack had picked: `80e` is frozen as the
> record, and regenerating it with fewer columns would falsify it. The folder was renamed from
> `grade-method-comparison/` to `grade-fixtures/`, and what remains — `types.ts`, `builders.ts`
> and the eighteen fixture files — is now the permanent regression set that
> `web/test/graded-so-far.test.ts` runs against the shipped function.

### Executable check (the brief's: "≥ 12 fixtures, each asserts its hand-derived truth")

```
$ npx vitest run test/grade-method-comparison    # at the gate, before G-1
 Test Files  1 passed (1)
      Tests  112 passed (112)
```

18 fixtures ≥ 12. Each one is asserted three ways:

1. `%s states a truth its own written-out arithmetic reproduces` — the fixture's `derivation()`
   is the arithmetic of the comment written out in TypeScript, calling **none** of the three
   implementations, and it must reproduce the declared `truth.pct` to ten decimal places. A
   fixture whose truth does not follow from its own arithmetic cannot pass.
2. `%s is labelled dummy data…` — every fixture's `courseId` must start `DUMMY.`, so no figure
   in this suite can be mistaken for Blackboard's. Nothing here renders anywhere.
3. every method × fixture returns a well-formed outcome.

### Fixture coverage against the brief's list

| the brief asks for | fixture |
|---|---|
| weighted scheme | F01 |
| points scheme | F02 |
| drop-lowest | F03 |
| zero-point completion columns | F04 |
| extra credit (score > possible) | F05 |
| one part wholly ungraded | F06 |
| an unlinked column | F07 |
| an exempt item | F08 |
| a course with nothing graded | F09 |
| mixed point scales inside one part | F10 |
| a rank-weighted exam part | F11 (the engine supports `rank_weighted`) |
| one modelled on each real course's scheme shape | F12 ECN.304 · F13 GEO.103 · F14 IST.352 · F15 IST.323 · F16 IST.466 · F17 IST.471 |
| *(added by review — see below)* | F18 weighted sub-parts under an unweighted heading |

### Headline result (full table in `80e_GRADE_METHOD_COMPARISON.md`)

| method | stated a number | mean abs error | max abs error | invented a grade | refused a real grade |
|---|---|---|---|---|---|
| Points ratio | 16 of 16 | 3.9354 | 20.4545 (F10) | F17 | none |
| Weighted so far | 16 of 16 | 3.0340 | 20.4545 (F10) | none | none |
| 10b engine | 13 of 16 | 0.1154 | 1.5000 (F16) | none | F12, F13, F14 |
| 10b engine, gates off | 16 of 16 | 0.0000 | 0.0000 | none | none |

The fourth row is **a variant of the third, not a fourth candidate**: the same engine with its
two silencing rules bypassed — the unsure-link muting side-stepped by confirming the links in
the *input*, the unscored-hand-graded gate by calling `evaluateModel`, the engine's own ungated
entry point (the same door Phase 10b's L4 test uses). **No engine code was changed.** It is in
the report because the table shows those two rules are the only places the engine's arithmetic
parts company with a hand-derived grade, and the decision is better made knowing what fixing
them is worth.

Fixtures that separate the methods:

* **F03** (drop-lowest) and **F10** (mixed point scales in one part) split the engine from both
  slim methods by 15 and 20.5 points.
* **F07** (unlinked column, 7 points) and **F15** (IST.323's normalised category, 13.5 vs 7.8)
  split the points ratio from the weighted calculation.
* **F12, F13, F14** split the engine from both the other way: it says nothing at all where a
  true grade exists, which is what the preview does on three of the six real course shapes.
* **F16** is the engine's only wrong number: muting an unsure link drops a graded 135/150.
* **F17** is the points ratio's disqualifier: it prints 100 % for a qualitatively graded course.

### Honesty

No fabricated numbers: every fixture is invented data on a real *scheme shape*, labelled DUMMY
in its own file and asserted to be so by the suite. Nothing in `web/test/grade-fixtures/`
is imported by any component. `80e` is generated, deterministic (no clock, no randomness) and
carries a "do not edit by hand" line.

**Nothing was deleted at this point.** Stack read `80e`, picked, and the work resumed at G-1
below.

Commit: `d63ad3c` `fix(G-0): grade-method comparison suite and 80e, the gate before any removal`.

---

## G-3 — the course title is the link (P-grades-2) — **done**

`CourseGradeCard` takes an optional `titleHref` and wraps the title in it, **inside** the level-2
heading, so the card still announces itself by the course's name. `/grades` passes
`/course/<display_id>` — the brief's backend check says the course, not its Grades tab — and no
longer renders the "Course tab →" ghost button. The course's own Grades tab passes no href (a
link from a page to itself is noise) and keeps its "All courses →" button, which is a different
control.

**RED → GREEN.** Four new cases in `web/test/GradesScreen.test.tsx`:

```
$ npx vitest run test/GradesScreen.test.tsx          # before the fix
 × makes the course title itself a link to that course
 × keeps the link inside the level-2 heading, so the card still announces itself
 × encodes a display id that needs it
 × no longer draws a separate "Course tab" button
AssertionError: expected <a href="/course/IST.323/grades"></a> to be null
      Tests  4 failed | 10 passed (14)

$ npx vitest run test/GradesScreen.test.tsx          # after
      Tests  14 passed (14)
```

Gate: typecheck, build and **1452 tests / 88 files** green. Commit `9c35f1d`.

---

## G-4 — "graded" and "last attempt: COMPLETED" (P-grades-6) — **done**

The rule lives once, in `submissionLabel` (`web/src/lib/queries.grades.ts`), so both call sites —
the gradebook table and the popout's submission block — get it. `attemptStatus` is null when the
attempt repeats the column literally (GRADED beside GRADED) or in substance (COMPLETED beside
GRADED or SUBMITTED). Research counted 16 rows on prod reading that way.

Nothing else is suppressed: NEEDS_GRADING beside GRADED means a further attempt is waiting, and
COMPLETED beside UNOPENED contradicts the column. Both still show, and both are asserted.

**RED → GREEN.** Six new cases across three files:

```
$ npx vitest run test/queries.grades.test.ts test/GradebookTable.test.tsx \
      test/SubmissionBlock.test.tsx                  # before the fix
 × drops a COMPLETED attempt beside a GRADED column — it adds nothing
 × drops a COMPLETED attempt beside a SUBMITTED column — it adds nothing
 × does not repeat a COMPLETED attempt beside a GRADED status
 × does not repeat a COMPLETED attempt beside a SUBMITTED status
 × renders one label for a GRADED column whose last attempt is COMPLETED
 × does the same for a SUBMITTED column whose last attempt is COMPLETED
AssertionError: expected 'COMPLETED' to be null
AssertionError: expected <span class="_note_13f0d1"></span> to be null
      Tests  6 failed | 82 passed (88)

$ … same command                                     # after
      Tests  88 passed (88)
```

Gate: typecheck, build and **1465 tests / 88 files** green. Commit `dcc1a43`.

---

## G-5 — history and feedback move into the popout (P-grades-8, P-grades-9) — **done**

`SubmissionBlock` now renders the instructor's feedback in full (escaped by React, `pre-wrap` so
their line breaks survive) and this column's score history behind the same `ScoreHistory`
disclosure as before. It reads one column's rows through a new `assignmentHistoryOptions` in
`queries.grades.ts` — one column, not a whole course, and in the module that survives whatever
G-1 decides. A failed read says so rather than looking like "no history".

The gradebook table drops the history toggle entirely. It keeps the feedback disclosure **only**
for a column with no linked assignment: there is no popout to send the reader to, and the words
must not become unreachable. The whole-course history plumbing went with it from `GradesScreen`,
`GradesModelScreen`, `CourseGrades` and `useCourseGradeModel`.

Two accessible names were spelled out with `aria-label` rather than left to an adjacent
screen-reader span, which the name computation joins **without** a space: the toggles read
"Feedbackfrom Essay" and "historyof Quiz #3" today.

**`AssignmentPopout.tsx` is not edited.** The only change in its orbit is one line in its test's
mock of `@/lib/queries.grades` (`useAssignmentHistory: () => stub([])`, `test/AssignmentPopout.test.tsx:105`),
without which the real hook runs with no `QueryClient`. The status `<select>` W-32 owns is untouched.

**RED → GREEN.** Five new cases:

```
$ npx vitest run test/SubmissionBlock.test.tsx test/GradebookTable.test.tsx \
      test/ScoreHistory.test.tsx                     # before the fix
 × names the column it belongs to, for a screen reader
 × sends a linked row's feedback to the popout instead of showing it inline
 × shows the instructor's feedback in full, as text
 × carries the score history for this column
 × says so when the history read failed, rather than pretending there is none
      Tests  5 failed | 39 passed (44)

$ … same command                                     # after
      Tests  44 passed (44)
```

Tests that moved rather than disappeared: `ScoreHistory.test.tsx`'s "sits on the matching
gradebook row only" became the popout's placement cases; `GradesScreen.model.test.tsx`'s "shows
the history disclosure on the row that changed" became "shows no history disclosure on any row".
Net test count went **up**, not down.

Gate: typecheck, build and **1473 tests / 88 files** green. Commit `c220046`.

---

## G-6 — the feedback mark (P-grades-10) — **done**

A superscript `*` on the **item** cell, which is the cell that links to the details (Stack's
answer 6). Present exactly when the feedback is non-empty: Blackboard stores an untouched
feedback box as `''` as readily as `null`, so the predicate trims, and `''`, `'   '` and `null`
all show nothing.

`role="note"` plus `aria-label` rather than a bare asterisk — without a role the punctuation
reaches a screen reader as nothing useful. It reads "<item> has feedback"; a `title` says where
to read it. The name and its mark share one inline wrapper so the superscript hugs the name
instead of sitting a flex gap away; `.nameLine` declares no `display`, so it does not register as
a layout class in the R3-1 audit (`GradesTables.layout.test.tsx` still passes).

**RED → GREEN.** Three of seven new cases failed first — the four negative cases guarded the
"iff non-empty" half from the start:

```
$ npx vitest run test/GradebookTable.test.tsx        # before the fix
 × marks the item cell of a row that has feedback
 × puts the mark in the item cell, not the submission cell
 × marks an unlinked column too, beside its own disclosure
      Tests  3 failed | 22 passed (25)

$ npx vitest run test/GradebookTable.test.tsx        # after
      Tests  25 passed (25)
```

Gate: typecheck, build and **1479 tests / 88 files** green. Commit `c83da8d`.

---

## G-2 (collapsible half) — sections fold away and remember it (P-grades-1) — **done**

Stack's answer 4: each course's block collapses, and the groups inside collapse too. **Only the
collapsible half is built** — the header figure is method-dependent and waits on the G-0 pick.

New `web/src/lib/grades-sections.ts` holds the choice, following `sidebar-preference.ts`
deliberately:

* localStorage is best-effort; every read and write is wrapped, and the section's own default is
  a correct answer in a private window, with cookies blocked or with a full quota. These are the
  two places in the app where a swallowed error is intended, and the file says so.
* What comes back out of the browser is validated: junk values, an array, `null`, a bare string
  and unparseable text all read as "nothing stored".
* Only a **deviation** from a default is recorded, so changing a default in code still reaches
  sections nobody has touched — the shape `readStoredSidebar()` / `resolveSidebar()` already has.
* Every write is a read-modify-write of the whole record, so two components toggling different
  sections cannot overwrite each other.
* `useSectionState` reads storage only once `useHydrated()` says this render may, so the first
  client render matches the server's HTML (React error #418).

On `/grades`, each course card gains a Hide/Show control whose accessible name carries the course
("Hide IST 323"). Folding a course takes the gradebook and **leaves the heading and Blackboard's
number** — the summary is the reason to fold the rest. Blocks open by default; Stack asked for
"hidden on default" only on the planner (P-planner-1), not here. The
attendance-and-bookkeeping group persists too, under a key the course tab shares, so it is folded
the same way in both places; it stays closed by default, as it was. The course tab's single card
does not collapse — there is nothing to gain from hiding the only card on the page.

**RED → GREEN.** 13 new cases in `test/grades-sections.test.ts` (the module did not exist:
`Failed to resolve import "@/lib/grades-sections"`), and 8 component cases:

```
$ npx vitest run test/GradebookTable.test.tsx test/GradesScreen.test.tsx   # before
 × remembers being opened, under the key it was given
 × starts open when that is what was stored
 × opens every course block by default
 × folds the gradebook away and keeps the header
 × opens it again
 × remembers the choice under the course's own key
 × renders a course collapsed when that is what was stored
 × keeps each course block on its own key
      Tests  8 failed | 40 passed (48)

$ … same command                                                          # after
      Tests  48 passed (48)
```

Gate: typecheck, build and **1501 tests / 89 files** green. Commit `2f7e96a`.

**Follow-up in the same row.** A self-review found one real bug in `useSectionState`: after a
toggle the component held its own answer, and a change of `key` on the same instance kept showing
it. Navigating from one course's Grades tab to the next does exactly that — the route changes,
React reuses the tree, and only the key moves, so IST.352's group would have shown IST.323's
state. Fixed by resetting the local answer when the key changes, using React's
adjust-state-during-render pattern (cheaper than an effect: this render produces the right answer
instead of painting the stale one first). RED → GREEN with a `rerender` case in
`test/GradebookTable.test.tsx`; **1502 tests / 89 files** green.

---

## G-1 — Stack's pick, built (P-grades-3) — **done**

Stack, 2026-09-17: *"go with recommendation"* — keep the engine's arithmetic, remove the layer
around it. That is the `10b engine, gates off` row of `80e`, which reproduced every hand-derived
grade in the fixture set exactly (0.0000 mean, 0.0000 max).

### The production path

| file | what it is |
|---|---|
| `web/src/lib/graded-so-far.ts` | `gradedSoFar()` — the one way a grade reaches a screen. Pure, deterministic, no I/O. Returns the percentage **and what the percentage does not cover**. Also `gradedSoFarCardFigure()`, the Home-card formatter (G-2). |
| `web/src/lib/grade-figure-run.ts` | rows in, one figure per course out, with any engine exception caught into a sentence — this app has no error boundary, and a throw in render would blank Blackboard's numbers too |
| `web/src/components/grades/GradedSoFarFigure.tsx` | the one presentational component, used by `/grades` and the course Grades tab |
| `web/src/components/grades/useCourseLinkActions.ts` | the "Counts toward…" picker's wiring, all that survives of `useCourseModelActions` |
| `web/test/graded-so-far.test.ts` | the permanent regression suite (59 cases) |

### Both gates are off, and what replaced them

* **The strict rule is gone.** An unscored hand-graded part no longer hides the whole course. It
  is ordinary ungraded work: out of both sides of the figure, and **named underneath it**.
* **Muting is gone.** An unsure link no longer drops a graded score from the headline. Unsure
  links count; the row still says "unsure", and a scored column that counts toward **nothing**
  is named under the figure with a pointer to the picker.

Asserted directly in `test/grade-model/order-of-checks.test.ts` (the rows that used to expect
`manual_unscored` now expect a figure) and in `test/CourseGrades.model.test.tsx` (an unsure link
end to end, through the real query layer and the real engine).

### What each real course shape shows now

Read off the fixtures modelled on each of Stack's six courses — dummy scores, real scheme shapes:

| fixture | figure | counted | not counted yet | counts toward nothing |
|---|---|---|---|---|
| F12 ECN.304 | **83.3 %** | Exams, Quizzes | Participation | — |
| F13 GEO.103 | **90.0 %** | Reading Quizzes | Exams, Lecture Attendance, Discussion Section Attendance & Participation | — |
| F14 IST.352 | **93.3 %** | Projects | Attendance & Class Contribution, Readings | — |
| F15 IST.323 | **96.4 %** | Labs, Quizzes, Final project, Class participation | — | `labUnlinked` |
| F16 IST.466 | **87.0 %** | Major Cases, AI Team Assignment, Reading Responses | Ethics Presentation | — |
| F17 IST.471 | *no number* | — | — | — (graded qualitatively) |
| F18 weighted sub-parts | **77.1 %** | Final project, Exams | — | — |

Before G-1, **four of those six** (F12, F13, F14, and IST.323's real shape) showed nothing at
all, and F16 showed 85.5 % with a graded 135/150 silently dropped. That is the whole point of
the row.

### Deleted

**Files** — `grade-model/{solve,agreement,states}.ts`, `grade-model-run.ts`,
`queries.grade-scenario.ts`, `ModelStanding.tsx`, `WhatIfCell.tsx`, `TargetSolver.tsx`,
`PlaceholderRows.tsx`, `useCourseModelActions.ts`, and `grade-so-far.ts`'s two candidate
calculations (they went with the comparison machinery).

**Suites** — `ModelStanding`, `WhatIfCell`, `TargetSolver`, `PlaceholderRows`,
`queries.grade-scenario`, `grade-model-explanation`, and in `test/grade-model/`: `solver`,
`muting`, `placeholders`, `percent-placeholders`, `item-states`, `properties.states`,
`agreement`, `labels`, and the **JSON fixture suite with its loader** — it asserted 10b's three
projections, `agreement`, `unscoredManual` and `muted` component states, none of which exist.

**Cut back, not deleted** — `types.ts` (no `Scenario`, `Projection`, `TargetResult`,
`BlackboardTotal`, `Agreement`, `DeltaReason`, `ItemStates`, `manual_unscored`, `muted`);
`items.ts` (no scenario, no placeholder rows); `tree.ts` / `evaluate.ts` (no muting);
`project.ts` (one projection, no whole-course denominator); `labels.ts` down to the three picker
strings; `grade-model-{input,view,format}.ts` and `queries.grade-model.ts` to their surviving
reads.

**The decision on `agreement` was mine, as the PM allowed.** It goes. It reads `zeros_on_rest`,
the muted state and the `manual_unscored` gate — keeping it would have blocked four of the six
removals for one sentence, and the card already shows Blackboard's number and ours side by side,
each labelled. That is the same information, honestly.

**80e is frozen, not regenerated.** It recorded a decision; re-running it with fewer columns
would falsify the record. Its fixtures live on as `web/test/grade-fixtures/`, now the regression
set, and the file carries the "do not edit by hand" line it always had.

### Test count

| point | files | tests |
|---|---|---|
| branch point (before W-31) | 87 | 1342 |
| after G-0, G-3..G-6, G-2 collapse | 89 | 1502 |
| after merging W-30/W-32/W-33 round 1 | 95 | 1596 |
| **after G-1's deletions** | 81 | 1236 |
| **after G-2's card formatter + the round-2 merge (final)** | **91** | **1506** |

The drop at G-1 is the deletion itself: ~360 cases whose subject no longer exists. Typecheck,
build and the full suite are green at every one of those points.

### Proposed DECISIONS row

> **2026-09-17 — Phase 10b's strict rule and what-if layer are reversed (P-grades-3, G-1).**
> Stack read `docs/planning/80e_GRADE_METHOD_COMPARISON.md` — eighteen dummy-data fixtures, each
> with a hand-derived grade, measured against four candidates — and picked the 10b engine's
> arithmetic with its two silencing rules removed. That configuration reproduced every
> hand-derived grade exactly; the raw points ratio was 3.9 points out on average and printed
> 100 % for a qualitatively graded course, and a slim weighted calculation was 3.0 out.
> **Reversed:** an unscored hand-graded part no longer hides a course's figure, and a syllabus
> link marked unsure no longer drops its graded scores from the headline. Both are now stated —
> the parts a figure does not cover are named under it, and a scored column linked to nothing is
> named with a pointer to the "Counts toward…" picker. **Removed with them:** what-if scores,
> the target solver, saved scenarios (`grade_scenarios` stays in the database, unused),
> placeholder rows, the "zeros on the rest" and "best case" projections, and the
> agrees-with-Blackboard sentence — the card shows both numbers side by side, each labelled,
> which is the same information without a second explanation to maintain. **Kept:** every
> per-part aggregation rule unaltered, the "Counts toward…" picker, `ScoreHistory` and
> `v_gradebook_history`. The eighteen fixtures are now the permanent regression suite
> (`web/test/graded-so-far.test.ts`); `80e` is frozen as the record of the decision.

---

## G-2 — the headline figure (P-grades-1, P-home-10) — **done**

`gradedSoFar()` returns the figure; `GradedSoFarFigure` renders it in each collapsible course
header on `/grades` and on the course Grades tab. It shows "Graded so far", the percentage
rounded once to one decimal, the letter, the "as of" from the newest `seen_at` among the rows
that went into it, and — only under a points scheme — the points fraction. Under a weighted
scheme the two sides are weight units, and printing "50.7 / 60" would be a mark the gradebook
does not contain, so it prints none.

Blackboard's own total renders beside ours in its own labelled box, never merged with it.

**Determinism** is a property test over generated inputs (`same input → equal output`, and the
input is never mutated), plus a per-fixture non-mutation check.

### The `CourseGradeFigure` prop contract (for the PM to wire)

W-32 owns the name `CourseGradeFigure` (`web/src/app/(app)/CourseGradeFigure.tsx`), so the
component here is **`GradedSoFarFigure`** and the result type is **`GradedSoFarResult`**. The
card seam is a pure formatter:

```ts
import { gradedSoFarCardFigure } from '@/lib/graded-so-far';

// in Today.tsx's cardGrades(course), as the second entry:
gradedSoFarCardFigure(figureFor(course))   //  →  { label, value, absence, asOf, display }
```

| field | value |
|---|---|
| `label` | always `'Graded so far'` |
| `value` | `'84.5%'`, or **null** when there is no figure |
| `absence` | **null** when `value` is set; otherwise the short reason — `nothing graded yet`, `graded qualitatively`, `no grading rules yet`, `grading rules not readable` |
| `asOf` | already formatted (`'Sep 16, 1:14 PM'`), null when there is no figure |
| `display` | the letter, or null |

Exactly one of `value` and `absence` is ever filled — asserted across every fixture, because
that invariant is what keeps a course with no grade off the card as a zero. The assignment to
W-32's `CourseGradeFigure` type is itself a test, so the seam cannot drift silently without the
suite failing to compile.

The figure the card shows is the same function `/grades` uses, so the two cannot disagree.

---

## Round 3 — `/code-review main high` findings in W-31's files

Both were in code G-1 had just written, and both were real.

**CR-8 — `graded-so-far.ts`: a dead shim and a duplicated gate.** `linksConfirmed()` existed to
work around muting, and said so in its own comment — but muting was removed from
`grade-model/tree.ts` in the same change that introduced it. Nothing has read a link's
confidence since, so it was copying every item of every course on every computation to produce
an identical input. And `gate()` had become branch-for-branch identical to `checks.ts`'s
`checkComputable()` once `manual_unscored` left both.

Fixed by composing the engine instead of restating it: `gradedSoFar` now calls `evaluateCourse`
(which runs the one order of checks and makes the `nothing_graded` decision) and `standingFor`.
What is left in the module is the part that is genuinely its own — the reading, and the parts
and columns the figure leaves out. `nothing_graded` is still lifted to a state of its own on the
way out, because "not marked yet" and "can never carry a percentage" are different things to
say. **The 59-case regression suite is unchanged and green**, which is the evidence that matters:
the arithmetic and every gate decision are identical, there is simply one copy of them now.

**CR-9 — `grade-figure-run.ts`: quadratic grouping on the Home path.** `groupItems` rebuilt each
course's list with `[...list, item]` per row, inside a `reduce` that mutated its own accumulator
Map. That is the trap review item R2-14 caught in 10b, and `groupByCourse` in
`queries.grade-model.ts` already documents the fix — but this copy had regressed to it, and the
PM's `use-course-figures.ts` now runs it on Home as well as `/grades`, over every course's
columns at once. Now one pass, arrays built locally, handed out as a `ReadonlyMap`. Guarded by a
new case over 300 interleaved rows across three courses: each gets its own rows, in input order,
and none of another's.

Commits `dc4b5f1` (CR-8) and `bf5a90d` (CR-9). Gate: typecheck, build and **1511 tests / 91
files** green, on a tree merged with `origin/fix/page-pass-12b` (including the PM's
`use-course-figures.ts`, which is kept and unchanged).

*Flakes seen once each and clean on every rerun, both filesystem/timing-sensitive on Windows and
neither in W-31's changes: W-33's `PlannerWeek.band` "hides the band contents with nothing
stored", and the two `service_role` audits that walk `src/` synchronously.*

---

## What G-1 would have removed under the other picks

Kept for the record, since the brief asked for it before Stack chose.

| Stack picks | what goes | what stays |
|---|---|---|
| **10b engine** (as built, or with its two gates relaxed) | `grade-so-far.ts`; the `points_ratio` and `weighted_so_far` rows of `METHODS`; their fixtures' expectations, not the fixtures themselves. What-if, the target solver, `PlaceholderRows` and the scenario table still go, per P-grades-3; the "Counts toward…" picker stays if the winner needs links. | all of `grade-model/`, `queries.grade-model.ts`, `grade-model-{input,run,view,format}.ts` |
| **weighted so far** | `web/src/lib/grade-model/` (24 files, ~1,750 lines), `grade-model-{input,run,view,format}.ts`, `queries.grade-model.ts`, `queries.grade-scenario.ts`, `ModelStanding`, `WhatIfCell`, `TargetSolver`, `PlaceholderRows`, `LinkColumnControl`, `useCourseGradeModel`, `useCourseModelActions`, `GradesModelScreen`, and ~268 engine tests in 32 files, plus the `engine_10b` and `engine_gates_off` rows of `METHODS` | `grade-so-far.ts`, `ScoreHistory`, `v_gradebook_history`. Tables `grade_scenarios` / `grade_column_links` and views `v_grade_model_*` are left in place unused — nothing is dropped from the database this phase (answer 3). |
| **points ratio** | as above, plus `weightedSoFar` from `grade-so-far.ts` | `pointsRatio`, `ScoreHistory`, `v_gradebook_history` |

### Two things G-1 had to carry (both done)

1. **`ScoreHistory` must survive in every outcome** — the desktop poller reads
   `v_gradebook_history` (`desktop/src/core/poller/sources.ts:47`). Its dependencies are now
   exactly three, all in 10b modules: `HISTORY_LABEL` and `historyText`
   (`grade-model-format.ts`), the `GradebookHistoryRow` type (`grade-model-input.ts`) and
   `GradeModel.module.css`. If those modules are retired, those move rather than being deleted —
   the two functions and the type into `queries.grades.ts`, the three `.history*` rules into a
   stylesheet beside the component. `columnItemKey` / `historyByColumn` (`grade-model-view.ts`)
   are **no longer** needed for the history: they keyed the whole-course map the table used, and
   the popout reads one column directly. The popout's own read (`assignmentHistoryOptions`) is
   already in `queries.grades.ts` and needs nothing.
2. **`gradeHistoryOptions` / `useGradeHistory` in `queries.grade-model.ts` now have no consumer**
   in `src/` — G-5 replaced the whole-course history read with the popout's per-column one. They
   are left in place, with their tests, for G-1 to remove along with the rest of that module, or
   to keep if the engine wins.

---

## Review round (after the rows were committed)

A review of the whole branch diff found nothing critical or high, confirmed the arithmetic of all
17 fixtures against `80e` by hand, and raised four smaller things. Three are fixed; one is left
for whoever owns the file.

1. **`weightedSoFar` lost a whole subtree (the one that mattered).** It rolled every item up to
   its *top-level* row and read only that row's `weight_pct`. A syllabus that hangs weighted
   sub-parts under an unweighted heading — "Final project" with a 10 % proposal and a 30 % report
   under it — therefore gave every graded item beneath it weight 0 on **both** sides: the figure
   silently became the other parts alone. No fixture reached it (F15 is the only sub-part fixture
   and it is a points scheme, so it never enters the weighted branch), which means `80e`'s
   headline for that method was measured on a set that could not see its worst case.
   **Fixed**: a "part" is now the outermost row that *carries* a weight, not simply a top-level
   row, so nested weights behave exactly as before and this shape is rescued. **F18** was added
   as the guard, and it is the one fixture whose numbers moved as a result: the old behaviour
   read 75.00 % against a true 77.14 %. The per-method table above is the re-run.
   A weighted scheme with no weights anywhere now says `no_weights` rather than `nothing_graded`
   — the gap is in the rules, not in the gradebook.
2. **"Has feedback" meant two things.** The table trimmed (`'   '` is not feedback); the popout
   used bare truthiness. A whitespace-only feedback box would have shown no `*` on the row and an
   empty "Feedback" panel in the popout. **Fixed**: `hasFeedback` now lives in `queries.grades.ts`
   beside `submissionLabel`, and both sites call it. Three cases added to `SubmissionBlock.test.tsx`.
3. **The mark's tooltip was wrong on an unlinked row** — it said "open the item to read it" where
   there is no item to open and the words are already inline underneath. **Fixed**: the tooltip
   follows `assignment_id`, with a case for each.
4. **`earned` / `denominator` carried two units under one name** — points for the ratios, weight
   units for the weighted calculation. Nothing renders them today, but a future caller printing
   "50.7 / 60" would be inventing a points figure the gradebook does not hold. **Fixed**: the
   result type carries `unit: 'points' | 'weight'`.
5. **Not fixed, and deliberately.** `web/src/lib/sidebar-preference.ts:14` still says it is "the
   one place in the app where a swallowed error is deliberate"; `grades-sections.ts` makes two.
   That file is not W-31's, and a one-line comment edit in a shared file is not worth a merge
   conflict with another worker. `grades-sections.ts`'s own header says "two of the few places",
   so the pair is at least self-describing. **For the PM to sweep at integration.**

After this round: typecheck, build and **1512 tests / 89 files** green.

## Honesty and scope

* **No fabricated numbers introduced.** Every fixture in the comparison suite is dummy data,
  labelled and asserted as such, and none of it is imported by a component. No screen gained a
  computed figure in this work — the header figure is G-2's other half and is not built.
* **Files W-31 does not own were not touched.** `AssignmentPopout.tsx`, `Today.tsx`, the tracker,
  planner, materials, inbox and the PM-owned `progress-status.ts` are unchanged on this branch.
  The only edit outside W-31's list is one mock line in `test/AssignmentPopout.test.tsx`
  (see G-5).
* **No new dependencies, no Tailwind.** Every style added is a CSS Module rule over existing
  custom properties.
* **`npm run lint` fails on this repo** for a reason that predates this branch: the script runs
  `next lint`, which Next 16 removed. `npm run typecheck`, `npm run build` and `npm test` are the
  gates that ran.
