# Phase 10b — Grades: methodology model, what-if, score history

Date: 2026-09-14 (brief); PM session TBD. Product manager: Stack. Requirements: R-11 (b)+(c),
R-12 from `60_REQUIREMENTS_v2.md`. Phase branch `feat/grades-10b`, one PR. Migration numbers
from the **041–059** range, after 10a's.

**Preconditions (all three, verified by the PM session before anything else):**

1. Phase 10a is on `main`.
2. `bb_gradebook` holds more than ten non-attendance scores (real October work).
3. `65_GRADING_VALIDATION_SUMMARY.md` shows **all seven courses signed off** and the V-1
   reconciliation migration applied. The model runs on validated rules only.

## Why

Blackboard's total is whatever the professor configured, often nothing. Stack wants his own
standing computed from the syllabus rules he has verified, labelled as a model, and a way to ask
"what do I need on the rest to get an A-". The rules already exist as declarative rows
(`grading_schemes.method`, `grade_components.aggregation`); 10b is the engine and the screen.

## Stack's decisions (2026-09-14, `70_MVP_INDEX.md` §1.4)

* What-if: **both** hypothetical-score entry on ungraded items **and** a target solver.
* Trust: **agrees with Blackboard's total within rounding** wherever Blackboard publishes a
  total and the method is a plain weighted or points sum; any difference is explained on
  screen (which component, which rule).
* Persistence: **one saved scenario per course**, resettable.
* Non-computable methods (IST.471 `qualitative`, courses whose grade depends on `manual`
  components with no score): **show only Blackboard's number**; the model is hidden there.
* Score-change history (from 10a's append-per-run mirror) surfaces here.

## MVP (in Stack's words)

On a course's Grades tab, next to Blackboard's number, see "our model: 87.4% (B+)" with a
one-line explanation of how it was computed and, where Blackboard also publishes a total, why
the two differ (or that they agree). Type a hypothetical score on any ungraded item and watch
the standing move; type a target letter and see the average needed on the remaining work. The
scenario is still there tomorrow. IST.471 shows nothing but Blackboard's number.

## Contract — to be frozen by the phase PM session before workers spawn

Must specify:

* The engine: a pure TypeScript module (`web/src/lib/grade-model/`) with one function per
  aggregation — `single`, `sum`, `average_drop_lowest`, `rank_weighted` (weights from
  `rank_weights`), `normalized` (to `normalize_to` / `count_expected`), `manual` (declines) —
  and the two methods `weighted_pct` and `points` (with `graded_out_of` and extra credit).
  Deterministic, no I/O, property-tested. Fixture syllabi for all six live methods.
* The agreement check as a runtime feature, not just a test: for each course with an `isCalc`
  total, compute, compare, and render the delta with its explanation.
* What-if state: `assignment_progress`-style planner table `grade_scenarios` (one row per
  course, jsonb of item → hypothetical), never overwritten by syncs (same rule as planner
  state). Migration number from 10a's range.
* Target solver semantics: "average on remaining graded-by-points work", with drop-lowest and
  rank-weighted rules honoured; wording frozen.
* Routes: extend `/course/[id]/grades` and `/grades`; the history sparkline per item.
* Labelling: "model" wording on every computed figure; letter from `letter_scale`.

## Seams (frozen)

10b reads V-1's validated rules and 10a's mirror; writes only `grade_scenarios`. No transform
changes.

## Definition of done

_Pending research (R-10b report) — filled in PR #11._

## Task loops

_Pending research (R-10b report) — filled in PR #11._

## Out of scope

Grades on Home cards; multiple named scenarios; changing any rule (V-1); professor-facing
anything.

## Workers (proposed)

* **W-19 engine** (`feat/grades-10b-engine`): the module, fixtures, property tests, agreement
  check.
* **W-20 web** (`feat/grades-10b-web`): scenario table + migration, what-if UI, target solver,
  history sparkline, screen tests.
