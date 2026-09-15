# Phase 10b — Grades: methodology model, what-if, score history

Date: 2026-09-14 (brief); PM session TBD. Product manager: Stack. Requirements: R-11 (b)+(c),
R-12 from `60_REQUIREMENTS_v2.md`. Phase branch `feat/grades-10b`, one PR. Migration numbers
from the **046–059** range, after 10a's.

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

Source: Stack's answers (`70_MVP_INDEX.md` §1.4) + research `research/73_RESEARCH_phase10b_grade_model.md` §5.

- [ ] **Stack's acceptance script (on the preview):** (1) open a course with a Blackboard total and
      see "our model" beside it with a one-line explanation and the delta reason; (2) type a
      hypothetical score on an ungraded item and watch the standing move, reload, it is still
      there; (3) pick a target letter and read the average needed on remaining work; (4) in
      ECN.304, a hypothetical Exam 1 re-orders the rank weights and moves the total; (5) IST.471
      shows only Blackboard's number. All five ticked.
- [ ] All six live methods implemented (`weighted_pct`, `points` with `graded_out_of` and extra
      credit, `rank_weighted`, `average_drop_lowest`, `normalized`, `sum` with children);
      `manual` / `qualitative` return `not_computable`, never 0.
- [ ] L1 unit tests green per aggregation, including child components (IST.323 `final_project`).
- [ ] L2 property suite green: monotone in every score; bounded 0..max (or > 100 only via extra
      credit); drop-lowest never raises a total when a score falls; rank weights sum to the
      component weight; idempotent on unchanged input; seeded, failing seed printed.
- [ ] L3 fixtures for all six courses with hand-computed totals at three graded states
      (start of term, mid-term, all graded).
- [ ] **Agreement test**: every course with a Blackboard total is within 0.5 percentage points,
      or a named reason (from the delta enum) is shown on screen; the test asserts one of the two.
- [ ] Blackboard's running-total vs full-term denominator is a **recorded per-course field**
      (`grading_schemes.bb_running_total boolean`, set from the gradebook payload or by Stack),
      never a guess; the agreement test uses it.
- [ ] Target solver bisects over the projector (no closed form) with a round-trip test on a
      `rank_weighted` and a `drop_lowest` course; returns *unreachable* and *already secured*
      states, both demoed.
- [ ] What-if entry projects with no write to `assignments`; the only write is
      `grade_scenarios`, one row per course, surviving reload; per-row revert and course Reset.
- [ ] Delta explanations render from an enum (e.g. `bb_running_total`, `ungraded_counted_as_zero`,
      `drop_lowest_pending`, `extra_credit`, `manual_component`), never free text.
- [ ] Non-computable courses (IST.471; any course whose grade depends on a `manual` component
      with no score) show Blackboard's number only, with the not-computable state visible.
- [ ] A component still `tentative` after V-1 mutes the model to a "schema not signed off" badge
      (V-1 done = all seven signed off, so this is a guard, not an expected state).
- [ ] No rounding before display; letter thresholds read from `grading_schemes.letter_scale`.
- [ ] Score-change history per item renders from the append-per-run mirror (sparkline or list).
- [ ] SOP gates: typecheck/build/test green; `/code-review main high` HIGH cleared;
      `/security-review`; STATUS + DECISIONS + ORCHESTRATOR updated; Vercel preview posted.

## Task loops

| # | task | executable check | demo line (Stack) | owner |
|---|---|---|---|---|
| 1 | Verify the three preconditions (10a on main; >10 real scores; V-1 summary all signed) | SQL counts + file presence; stop if any fails | — | PM session |
| 2 | Engine: `weighted_pct` + `points` (+ extra credit, `graded_out_of`) | L1 tests; IST.323 104-of-100 fixture | — | W-19 |
| 3 | Engine: `average_drop_lowest`, `normalized`, `sum` with children | L1 tests; GEO/IST.323 fixtures | — | W-19 |
| 4 | Engine: `rank_weighted` | L1 test; ECN.304 fixture with three exam states | — | W-19 |
| 5 | `not_computable` paths | L1 test: IST.471, manual component → not 0 | "IST.471 shows only Blackboard's number" | W-19 |
| 6 | Property suite | L2 six invariants green, seed printed on failure | — | W-19 |
| 7 | `bb_running_total` field + migration | SQL: column present, populated for every course with an `isCalc` total | — | W-19 |
| 8 | Agreement check (runtime + test) | test asserts within 0.5 pp or a named reason, every course | "the model and Blackboard agree, or it tells me why not" | W-19 |
| 9 | Delta-reason enum + rendering | RTL test per enum value | — | W-20 |
| 10 | `grade_scenarios` table + migration + RLS | SQL: owner-only, one row per course, sync never touches it | — | W-20 |
| 11 | What-if entry + persistence + revert/reset | RTL test; reload test | "I type a score, reload, it is still there" | W-20 |
| 12 | Target solver (bisection) + states | round-trip test on rank_weighted + drop_lowest; unreachable/secured fixtures | "I pick A- and see what I need" | W-19 |
| 13 | History sparkline per item | RTL test from a fixture with three runs | "I see when a score changed" | W-20 |
| 14 | Tentative-component guard | RTL test: badge shown, model hidden | — | W-20 |
| 15 | Gates + docs + preview | SOP list | — | PM session |
| 16 | **Stack's acceptance script** | — | the five steps above | Stack |

Open questions from the research, for Stack (also in `70_MVP_INDEX.md` §5): which courses use
Blackboard's running-total setting (can he read it per course?); IST.323 extra credit — earned
raised above 100 % (Moodle's rule) or clamped at 100; target default A- everywhere or
per-course; if V-1 leaves a component `tentative`, compute with a badge or decline; does the
projection open on graded-so-far or zeros-on-the-rest.

## Out of scope

Grades on Home cards; multiple named scenarios; changing any rule (V-1); professor-facing
anything.

## Workers (proposed)

* **W-19 engine** (`feat/grades-10b-engine`): the module, fixtures, property tests, agreement
  check.
* **W-20 web** (`feat/grades-10b-web`): scenario table + migration, what-if UI, target solver,
  history sparkline, screen tests.
