# R-10b research — grade model, what-if, target solver

Researcher R-10b, 2026-09-14. Inputs: `70_MVP_INDEX.md` §1.1/§1.4/§2, `60_REQUIREMENTS_v2.md` R-12,
`64_GRADING_SCHEMA_EXPORT_2026-09-14.md`. Scope: the six methods actually in use —
`weighted_pct`, `points` with `graded_out_of`, `rank_weighted` [30,25,20], `average_drop_lowest`,
`normalized`, `sum` with children, plus `qualitative`/`manual` (not computable).

## 1. Comparables

1. **Canvas What-If Scores** — student types a hypothetical into the score cell; the total
   recalculates, actual scores are untouched, and there is a course-wide reset
   ([API](https://developerdocs.instructure.com/services/canvas/resources/what_if_grades):
   `PUT /courses/:id/what_if_grades/reset`; what-if is stored per submission, and the docs warn
   "grade calculation is a costly operation"). Canvas also splits **current** (graded only) vs
   **final** (ungraded = 0) grade — [the top source of student
   confusion](https://blog.uwgb.edu/catl/zeroing-in-on-canvas-gradebook-accuracy/).
2. **[RogerHub Final Grade Calculator](https://rogerhub.com/final-grade-calculator/)** — closed-form
   target solver: `Required = (Goal − Current × (1 − FinalWeight)) / FinalWeight`, with the explicit
   assumption that the final is the *only* unknown category and everything else is rescaled to fill
   its weight.
3. **Generic weighted calculators** ([CalculatorSoup](https://www.calculatorsoup.com/calculators/statistics/grade-calculator.php),
   [calculator.net](https://www.calculator.net/grade-calculator.html)) — when entered weights sum
   to < 100 %, they solve `Needed = (Target − WeightedSum) / RemainingWeight` and print the needed
   score *per letter threshold*, not just one target.
4. **[Moodle natural weighting](https://docs.moodle.org/dev/Natural_weighting)** — the only public
   spec for the hard cases: weight = `item max ÷ container max`; contributions are
   `(grade/grademax) × item weight × container weight`; **drop-lowest runs on contributions, then
   weights are recomputed and contributions recalculated**; extra credit "is included in finalgrade
   calculations only, not grademax"; drop-lowest + extra credit in one category is
   [unsupported](https://stolafcarleton.teamdynamix.com/TDClient/1893/StOlaf/KB/ArticleDet?ID=142475).
5. **Blackboard Ultra overall grade** — a per-course toggle, "calculate grades based on points
   earned out of total graded points", decides running-total vs full-term denominator
   ([SIUE KB](https://kb.siue.edu/155580)). This single flag is the biggest predictable source of
   delta against our model.

## 2. Patterns to copy

- **Edit in place on the 10a rows.** Reuse the per-item row; a typed value renders in a distinct
  colour with a per-row *revert*, plus one *Reset scenario* for the course (Canvas's two-level
  revert). Persist as one `grade_scenarios` row per course (JSONB `assignment_id → score`), never
  into `assignments` or `assignment_progress`.
- **Never one number — always three.** "Blackboard: 87.4 % (as of 14 Sep)", "Model, graded so far:
  86.9 %", "If every remaining item scores 0: 41.2 %". The bracket (min-possible / max-possible)
  falls out of the same engine and kills the Canvas current-vs-final ambiguity.
- **Target solver wording**, taken from the generic calculators: "For **A- (≥ 90 %)** you need
  **93.2 % average** on the 4 remaining items (35 % of the grade left)." Show all reachable
  thresholds, plus the two honest edge states: *not reachable — max possible 88.1 %*, and
  *already secured even at 0 on the rest*.
- **Deltas as an itemised list, not prose.** One row per cause, from a closed enum:
  running-total mode, unlinked Blackboard column (the export lists 8 `(none)` rows), component is
  `manual`, drop-lowest not yet active (< 2 graded quizzes), rounding.
- **Badge the model from the data's own confidence.** `grade_components.source/confidence` is
  already per-row; any `tentative` component in a course mutes the model to "estimate — schema not
  signed off". Non-computable (IST.471 `qualitative`, all-`manual` schemes) shows Blackboard only.

## 3. Anti-patterns

- **RogerHub's algebra does not generalise.** ECN.304's three exams are weighted by *rank*, so the
  total is not linear in any single score; a closed-form solve is wrong. Solve by bisection over
  the projector instead (it is monotone in every score).
- **Silent clamping.** Gradescope's ceiling/floor are on by default and hide extra credit
  ([guides](https://guides.gradescope.com/hc/en-us/articles/22249389005709-Grading-submissions-with-rubrics)).
  IST.323 is 104 pts graded out of 100 — clamp at the letter scale, per component, explicitly.
- **Inventing semantics for unsupported combinations.** Moodle refuses drop-lowest + extra credit;
  we should too — declare the rule (extra credit raises earned, never possible) or decline.
- **Rounding intermediates.** Round once, at display; rounding is the agreement test's subject.
- **Treating ungraded as 0 without saying so** (Canvas's mistake in reverse).

## 4. Standard operating procedure — test layers

- **L1 unit**, table-driven, one file per aggregation.
- **L2 property tests** (seeded, reproducible generators; report the failing seed —
  [practice](https://tianpan.co/blog/2026-04-12-property-based-testing-for-llm-systems)):
  monotonicity (raising any score never lowers the total), bounds `0 ≤ total ≤ max_possible`,
  drop-lowest never lowers the total, effective weights sum to 1 *after* drops (Moodle recomputes),
  `rank_weighted` is permutation-invariant in exam order, extra credit is increase-only.
- **L3 fixture syllabi / golden master** — one committed JSON fixture per real scheme with
  hand-computed expected totals at three states (none / partial / all graded). This is
  characterization testing in Feathers' sense
  ([overview](https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/)).
- **L4 agreement test** — for every course with a mirrored `isCalc` total, assert
  `|model − blackboard| ≤ 0.5 pp` or a named reason from the enum; unexplained delta fails CI.
- **L5 solver round-trip** — feed the solver's answer back into the projector, assert `≥ target`.
- **L6** one Playwright pass per acceptance-script step.

## 5. Proposed DoD checklist

- [ ] Engine implements all six methods; `manual`/`qualitative` return `not_computable`, not 0.
- [ ] L1 unit tests green for each aggregation, incl. child components (IST.323 `final_project`).
- [ ] L2 property suite green (6 invariants above), seeded, failing seed printed.
- [ ] L3 fixture per scheme (ECN.304, GEO.103.lecture, IST.323, IST.352, IST.466, IST.471) with
      hand-computed totals at three graded states.
- [ ] **Agreement test**: every course with a Blackboard total is within 0.5 pp, or shows a named
      reason on screen; the test asserts both.
- [ ] Running-total vs full-term denominator is a recorded per-course field, not a guess.
- [ ] Solver round-trip test green for a `rank_weighted` and a `drop_lowest` course.
- [ ] Solver returns *unreachable* and *already secured* states, each demoed.
- [ ] What-if entry on any ungraded item updates the projection without writing to `assignments`.
- [ ] One saved scenario per course survives reload; per-row revert and course Reset both work.
- [ ] Delta explanation renders from the enum; zero free-text fabrication.
- [ ] IST.471 shows Blackboard's number only, with the not-computable state visible.
- [ ] A course with a `tentative` component shows the muted "schema not signed off" badge.
- [ ] No rounding before display; letter thresholds read from `grading_schemes`.
- [ ] Demo: Stack enters a hypothetical Exam 1 in ECN.304 and sees the rank re-order change the total.

## 6. Open questions for Stack

1. Which courses use Blackboard's **running-total** setting? Without it, early-term deltas are large
   and every explanation is a guess. Can you read the setting per course?
2. IST.323 extra-credit lab: does 4 pts raise *earned* only (Moodle's rule) so >100 % is possible,
   or is the course clamped at 100?
3. Target default — A- for every course, or per-course targets?
4. When V-1 leaves a component `tentative`, should the model still compute (badged) or decline?
5. Should the projection default to **graded-so-far** or **zeros-on-the-rest** on first open?
