# 80h — W-31 (grades) verification note

Phase 12b, branch `fix/page-pass-12b-grades`, worktree `bb2dash-wt-12b-grades`.
Rows from §Item task list of `80c_PHASE12B_page_pass.md`: **G-0** (gate), then the
method-independent rows **G-3, G-4, G-5, G-6** and the collapsible half of **G-2**.
**G-1 and the header-figure half of G-2 are not started** — they wait on Stack's pick.

Baseline on the branch before any of this work: **87 test files, 1342 tests, all passing.**

---

## G-0 — grade-method comparison suite (P-grades-3, P-grades-1 method) — **done, gate open**

### What was built

| file | what it is |
|---|---|
| `web/src/lib/grade-so-far.ts` | the two new pure functions, `pointsRatio` and `weightedSoFar`, over one input shape (latest gradebook rows + `grade_components` + column → part links). No I/O, no clock, no mutation. |
| `web/test/grade-method-comparison/types.ts` | the fixture shape, declared locally so the fixtures survive whatever G-1 deletes |
| `web/test/grade-method-comparison/builders.ts` | terse fixture builders |
| `web/test/grade-method-comparison/fixtures/01…17-*.ts` | **17 fixtures**, one file each, every one carrying its hand-written derivation as a comment |
| `web/test/grade-method-comparison/methods.ts` | the three methods behind one signature, plus one measured variant; the **only** file that imports `grade-model/` |
| `web/test/grade-method-comparison/report.ts` | scoring and the markdown |
| `web/test/grade-method-comparison/comparison.test.ts` | the run; writes `docs/planning/80e_GRADE_METHOD_COMPARISON.md` |

### Executable check (the brief's: "≥ 12 fixtures, each asserts its hand-derived truth")

```
$ npx vitest run test/grade-method-comparison
 Test Files  1 passed (1)
      Tests  106 passed (106)
```

17 fixtures ≥ 12. Each one is asserted three ways:

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

### Headline result (full table in `80e_GRADE_METHOD_COMPARISON.md`)

| method | stated a number | mean abs error | max abs error | invented a grade | refused a real grade |
|---|---|---|---|---|---|
| Points ratio | 15 of 15 | 4.1739 | 20.4545 (F10) | F17 | none |
| Weighted so far | 15 of 15 | 3.2363 | 20.4545 (F10) | none | none |
| 10b engine | 12 of 15 | 0.1250 | 1.5000 (F16) | none | F12, F13, F14 |
| 10b engine, gates off | 15 of 15 | 0.0000 | 0.0000 | none | none |

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
in its own file and asserted to be so by the suite. Nothing in `web/test/grade-method-comparison/`
is imported by any component. `80e` is generated, deterministic (no clock, no randomness) and
carries a "do not edit by hand" line.

### Note for whoever runs G-1

`ScoreHistory` must survive in every outcome (the desktop poller reads `v_gradebook_history`).
It currently depends on three 10b modules: `grade-model-format.ts` (`HISTORY_LABEL`,
`historyText`), `grade-model-input.ts` (`GradebookHistoryRow`) and `grade-model-view.ts`
(`columnItemKey`, `historyByColumn`). If the engine's query layer is retired, those four
symbols move to `queries.grades.ts` rather than being deleted with it.

**Nothing has been deleted. Stack reads `80e` and picks; the PM resumes this worker with the
pick.**

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

## Not started — waiting on Stack

| row | why it is not started |
|---|---|
| **G-1** (P-grades-3) | deletes the losing method. Nothing may be removed before Stack reads `80e` and picks. No grade-model code has been deleted or altered by W-31. |
| **G-2, header figure half** (P-grades-1, P-home-10) | the figure *is* the winning method. The course-card half of G-2 is W-32's in any case. |

### What G-1 removes under each possible pick

| Stack picks | what goes | what stays |
|---|---|---|
| **10b engine** (as built, or with its two gates relaxed) | `grade-so-far.ts`; the `points_ratio` and `weighted_so_far` rows of `METHODS`; their fixtures' expectations, not the fixtures themselves. What-if, the target solver, `PlaceholderRows` and the scenario table still go, per P-grades-3; the "Counts toward…" picker stays if the winner needs links. | all of `grade-model/`, `queries.grade-model.ts`, `grade-model-{input,run,view,format}.ts` |
| **weighted so far** | `web/src/lib/grade-model/` (24 files, ~1,750 lines), `grade-model-{input,run,view,format}.ts`, `queries.grade-model.ts`, `queries.grade-scenario.ts`, `ModelStanding`, `WhatIfCell`, `TargetSolver`, `PlaceholderRows`, `LinkColumnControl`, `useCourseGradeModel`, `useCourseModelActions`, `GradesModelScreen`, and ~268 engine tests in 32 files, plus the `engine_10b` and `engine_gates_off` rows of `METHODS` | `grade-so-far.ts`, `ScoreHistory`, `v_gradebook_history`. Tables `grade_scenarios` / `grade_column_links` and views `v_grade_model_*` are left in place unused — nothing is dropped from the database this phase (answer 3). |
| **points ratio** | as above, plus `weightedSoFar` from `grade-so-far.ts` | `pointsRatio`, `ScoreHistory`, `v_gradebook_history` |

### Two things G-1 has to carry

1. **`ScoreHistory` must survive in every outcome** — the desktop poller reads
   `v_gradebook_history` (`desktop/src/core/poller/sources.ts:47`). It currently depends on four
   symbols in 10b modules: `HISTORY_LABEL` and `historyText` (`grade-model-format.ts`),
   `GradebookHistoryRow` (`grade-model-input.ts`), and `columnItemKey` / `historyByColumn`
   (`grade-model-view.ts`). If those modules are retired, those symbols move into
   `queries.grades.ts` rather than being deleted with them. The popout's own read
   (`assignmentHistoryOptions`) is already in `queries.grades.ts` and needs nothing.
2. **`gradeHistoryOptions` / `useGradeHistory` in `queries.grade-model.ts` now have no consumer**
   in `src/` — G-5 replaced the whole-course history read with the popout's per-column one. They
   are left in place, with their tests, for G-1 to remove along with the rest of that module, or
   to keep if the engine wins.

---

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
