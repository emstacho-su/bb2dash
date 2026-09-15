# R-10b research — grade model, what-if, target solver

R-10b, 2026-09-14. Inputs: `70_MVP_INDEX.md` §1.1/§1.4/§2, R-12, `64_GRADING_SCHEMA_EXPORT`.
Covers the six live methods plus `qualitative`/`manual` (not computable).

## 1. Comparables

1. **Canvas What-If Scores** — type a hypothetical into the score cell, the total recalculates,
   real scores untouched, one course-wide reset
   ([API](https://developerdocs.instructure.com/services/canvas/resources/what_if_grades):
   `PUT /courses/:id/what_if_grades/reset`; stored per submission). Canvas also splits **current**
   (graded only) from **final** (ungraded = 0) — [the top source of student
   confusion](https://blog.uwgb.edu/catl/zeroing-in-on-canvas-gradebook-accuracy/).
2. **[RogerHub](https://rogerhub.com/final-grade-calculator/)** — closed-form solver
   `Required = (Goal − Current × (1 − FinalWeight)) / FinalWeight`, assuming the final is the *only*
   unknown and everything else rescales to fill its weight.
3. **Generic weighted calculators** ([CalculatorSoup](https://www.calculatorsoup.com/calculators/statistics/grade-calculator.php))
   — when entered weights sum < 100 %, solve `Needed = (Target − WeightedSum) / RemainingWeight`,
   printed *per letter threshold* rather than for one target.
4. **[Moodle natural weighting](https://docs.moodle.org/dev/Natural_weighting)** — the only public
   spec for the hard cases: weight = `item max ÷ container max`; contribution =
   `(grade/grademax) × item weight × container weight`; **drop-lowest runs on contributions, then
   weights are recomputed and contributions recalculated**; extra credit is "included in finalgrade
   calculations only, not grademax"; drop-lowest + extra credit together is
   [unsupported](https://stolafcarleton.teamdynamix.com/TDClient/1893/StOlaf/KB/ArticleDet?ID=142475).
5. **Blackboard Ultra overall grade** — a per-course toggle, "calculate grades based on points
   earned out of total graded points", decides running-total vs full-term denominator
   ([SIUE KB](https://kb.siue.edu/155580)). Our largest predictable delta source.

## 2. Patterns to copy

- **Edit in place on the 10a rows.** Typed values render in a distinct colour with a per-row
  *revert* plus one *Reset scenario* (Canvas's two-level revert). Persist one `grade_scenarios` row
  per course (JSONB `assignment_id → score`); never write to `assignments`/`assignment_progress`.
- **Never one number — always three.** "Blackboard 87.4 % (as of 14 Sep)", "Model, graded so far
  86.9 %", "Zeros on the rest 41.2 %". The bracket comes free from the same engine and removes the
  Canvas current-vs-final ambiguity.
- **Solver wording** from the calculators: "For **A- (≥ 90 %)** you need **93.2 % average** on the 4
  remaining items (35 % left)", plus two honest edge states: *not reachable — max possible 88.1 %*
  and *already secured even at 0 on the rest*.
- **Deltas itemised, not prose.** One row per cause from a closed enum: running-total mode,
  unlinked Blackboard column (the export has 8 `(none)` rows), `manual` component, drop-lowest not
  yet active, rounding.
- **Badge from the data's own confidence.** Any `tentative` `grade_components` row mutes the model
  to "estimate — schema not signed off"; `qualitative`/all-`manual` schemes show Blackboard only.

## 3. Anti-patterns

- **RogerHub's algebra does not generalise.** ECN.304 weights exams by *rank*, so the total is not
  linear in any one score. Bisect over the projector (monotone in every score) instead.
- **Silent clamping.** Gradescope's ceiling/floor are on by default and hide extra credit
  ([guides](https://guides.gradescope.com/hc/en-us/articles/22249389005709-Grading-submissions-with-rubrics)).
  IST.323 is 104 pts graded out of 100 — clamp explicitly, per component, at the letter scale.
- **Inventing semantics for combinations Moodle refuses** (drop-lowest + extra credit): declare the
  rule — extra credit raises earned, never possible — or decline.
- **Rounding intermediates.** Round once at display; rounding is what the agreement test measures.
- **Treating ungraded as 0 without saying so** — Canvas's mistake, in reverse.

## 4. SOP — test layers

- **L1 unit**, table-driven, one file per aggregation.
- **L2 property tests**, seeded and reproducible with the failing seed printed
  ([practice](https://tianpan.co/blog/2026-04-12-property-based-testing-for-llm-systems)):
  monotonicity (raising a score never lowers the total); bounds `0 ≤ total ≤ max_possible`;
  drop-lowest never lowers the total; effective weights sum to 1 *after* drops (Moodle recomputes);
  `rank_weighted` permutation-invariant in exam order; extra credit increase-only.
- **L3 fixture syllabi / golden master** — one committed JSON fixture per real scheme with
  hand-computed totals at three states (none / partial / all graded): characterization testing in
  Feathers' sense
  ([overview](https://understandlegacycode.com/blog/characterization-tests-or-approval-tests/)).
- **L4 agreement test** — per course with a mirrored `isCalc` total, assert
  `|model − blackboard| ≤ 0.5 pp` or a named enum reason; unexplained delta fails CI.
- **L5 solver round-trip** — feed the solver's answer back into the projector, assert `≥ target`.
- **L6** one Playwright pass per acceptance-script step.

## 5. Proposed DoD checklist

- [ ] All six methods implemented; `manual`/`qualitative` return `not_computable`, never 0.
- [ ] L1 unit tests green per aggregation, incl. child components (IST.323 `final_project`).
- [ ] L2 property suite green (six invariants), seeded, failing seed printed.
- [ ] L3 fixture per scheme (all six courses), hand-computed totals at three graded states.
- [ ] **Agreement test**: every course with a Blackboard total within 0.5 pp, or a named reason
      shown on screen; the test asserts both.
- [ ] Running-total vs full-term denominator is a recorded per-course field, not a guess.
- [ ] Solver round-trip green for a `rank_weighted` and a `drop_lowest` course.
- [ ] Solver returns *unreachable* and *already secured* states; both demoed.
- [ ] What-if entry on an ungraded item projects with no write to `assignments`.
- [ ] One saved scenario per course survives reload; per-row revert and course Reset both work.
- [ ] Delta explanations render from the enum — no free text.
- [ ] IST.471 shows Blackboard's number only, with the not-computable state visible.
- [ ] A `tentative` component mutes the model to the "schema not signed off" badge.
- [ ] No rounding before display; letter thresholds read from `grading_schemes`.
- [ ] Demo: a hypothetical Exam 1 in ECN.304 re-orders the rank weights and moves the total.

## 6. Open questions for Stack

1. Which courses use Blackboard's **running-total** setting? Without it, early-term deltas are large
   and every explanation is a guess — can you read it per course?
2. IST.323 extra-credit lab: does 4 pts raise *earned* only (Moodle's rule, so > 100 % possible), or
   is the course clamped at 100?
3. Target default — A- everywhere, or per-course targets?
4. If V-1 leaves a component `tentative`, does the model still compute (badged) or decline?
5. Does the projection open on **graded-so-far** or **zeros-on-the-rest**?
