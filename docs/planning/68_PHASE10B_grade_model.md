# Phase 10b — Grades: methodology model, what-if, score history

Date: 2026-09-14 (brief); Contract drafted by the PM session 2026-09-16, **frozen once Stack's
answers below are in**. Product manager: Stack. Requirements: R-11 (b)+(c), R-12 from
`60_REQUIREMENTS_v2.md`. Phase branch `feat/grades-10b` (worktree `bb2dash-wt-grades-10b`), one
PR. **Migrations 057–058; review rounds 080–089** (059 stays V-1's; 060–066 are Phase 11,
067–072 Phase 11b, 073–079 Phase 12).

**Preconditions (checked 2026-09-16):**

1. Phase 10a is on `main` — **yes** (PR #13, `5b84b01`).
2. `bb_gradebook` holds more than ten non-attendance scores — **yes**: 18 scored item columns
   (IST.352 10, IST.323 5, IST.471 2, ECN.304 1; IST.466 and GEO 103 none).
3. `65_GRADING_VALIDATION_SUMMARY.md` shows every course signed off — **no, and waived**. Stack,
   2026-09-16: V-1 is stubbed for later; it is a data-accuracy task, not a product feature, so
   it no longer gates 10b. Consequence: the model runs on **unvalidated** rules and says so
   (question 3), and the unlinked-column problem V-1 would have fixed is handled in this phase
   (question 2).

## Why

Blackboard's total is whatever the professor configured, often nothing. Stack wants his own
standing computed from the syllabus rules, labelled as a model, and a way to ask "what do I
need on the rest to get an A-". The rules already exist as declarative rows
(`grading_schemes.method`, `grade_components.aggregation`); 10b is the engine and the screen.

## Stack's decisions (2026-09-14, `70_MVP_INDEX.md` §1.4)

* What-if: **both** hypothetical-score entry on ungraded items **and** a target solver.
* Trust: **agrees with Blackboard's total within rounding** wherever Blackboard publishes a
  total and the method is a plain weighted or points sum; any difference is explained on
  screen (which component, which rule).
* Persistence: **one saved scenario per course**, resettable.
* Non-computable methods (IST.471 `qualitative`, courses whose grade depends on `manual`
  components with no score): **show only Blackboard's number**; the model is hidden there.
  (Question 1 asks whether the `manual` half of this still holds; see the numbers there.)
* Score-change history (from 10a's append-per-run mirror) surfaces here.

## MVP (in Stack's words)

On a course's Grades tab, next to Blackboard's number, see "our model: 87.4% (B+)" with a
one-line explanation of how it was computed and, where Blackboard also publishes a total, why
the two differ (or that they agree). Type a hypothetical score on any ungraded item and watch
the standing move; type a target letter and see the average needed on the remaining work. The
scenario is still there tomorrow. IST.471 shows nothing but Blackboard's number.

## Open questions for Stack (2026-09-16)

PM's recommendation is option A in each. The Contract below is written for the A answers; a B
answer changes the parts named in the last column.

| # | Question | A (recommended) | B | B changes |
|---|---|---|---|---|
| Q1 | **Manual components.** Five of six courses carry a `manual` component with no score today: ECN.304 participation 10 %, GEO 103 attendance + section participation 20 %, IST.323 participation 5 pts, IST.352 attendance 15 %. The 2026-09-14 rule hides the model in every one of them, which leaves only IST.466 — and it has no scores yet | **Model the rest and show the gap**: "graded work only — participation (10 %) not scored yet". What-if takes an assumed % for the manual component; the solver counts it as remaining work. Hidden only for a qualitative/unknown method (IST.471) or when nothing rule-linked is graded | Keep the rule: any unscored `manual` component hides the model for that course | engine gains `not_computable('manual_unscored')`; `component_pcts` and its UI go |
| Q2 | **Unlinked Blackboard columns.** A score counts in the model only through `assignments.component_id`, which is V-1's data. Today IST.323 Lab #1 arrived as a new row beside the seeded `lab-1`, IST.323's Final Project proposal column is tied to two rows, IST.352 Project #2A and #3 are unlinked — October's lab and project scores would sit outside the model | **"Counts toward…" picker** on an unlinked scored row (course Grades tab): a component, or "Not graded". Saved in a bb2dash-owned `grade_column_links` table that syncs never touch; the model reads it before `assignments`. V-1 later folds the links into `assignments` | **List only**: "N scored columns aren't linked to a rule", left out of the model until V-1 runs | `grade_column_links`, its trigger and `LinkColumnControl` go; `link_source` is always `assignment` |
| Q3 | **Unvalidated rules.** No course is signed off, and 9 assignment→component links are `tentative` or `inferred` | **Compute everywhere** with one course-level badge "rules not yet validated" beside "Our model". The DoD's `tentative` guard is dropped | Hide any component with a link that is not `confirmed` (mutes IST.323 individual presentation, IST.466 major cases and AI team assignment, GEO section participation, …) | engine gains a per-component `muted` state and a `tentative_link` flag on items |
| Q4 | **Headline number.** | **Graded so far** is the headline, with "zeros on the rest" and "best case" on one line under it. IST.323's Blackboard total is a running total (its formula says `"running": true`), and graded-so-far reproduces it: 9.8 (Exam #1) + 5.0 (quizzes) = 14.8 | **Zeros on the rest** is the headline | label order only |

### PM calls (say so if wrong)

1. **Running total is read, not asked.** Blackboard's total formula carries `"running": true|false`;
   `v_grade_model_total.bb_running` parses it. Only IST.323 publishes a total today. No column is
   added to `grading_schemes` (V-1's table stays untouched), so the DoD's "recorded per-course
   field" is this view column.
2. **IST.323 extra credit raises earned, never possible**: graded out of 100, so up to 104 % —
   what its syllabus says ("104 points possible, graded out of 100"). No clamping.
3. **Target**: a letter picker per course, default **A-**, saved with the scenario.
4. **What-if and the solver live on the course Grades tab only**; `/grades` shows the model line
   read-only.
5. **Score history** is a small disclosure on a row whose score changed across syncs (5 columns
   today, at most two runs each), not a sparkline.
6. **`fast-check`** (pinned exact, devDependency) runs the property suite.
7. **Placeholder rows.** An assignment linked to a component with no Blackboard column yet (ECN.304
   Exams 1–3; 31 rows across courses today) shows under the table as "Not in Blackboard yet" so a
   hypothetical can be typed on it. Acceptance step 4 needs this: ECN.304 has no exam columns.
8. **Late penalties are not modelled.** The model uses Blackboard's posted score, which already
   carries any penalty.

## Contract (draft 2026-09-16 — frozen when the answers above are recorded)

Grounded in prod as of 2026-09-16: registered gradebook runs `bf2f81e5-…` (9/14) and
`c877b0cc-…` (9/16); `v_gradebook_latest` = 41 item columns (18 scored), 5 attendance (3 scored),
1 total, 1 letter. One Blackboard total: IST.323 `Total Score`, `calc = CUSTOM`, possible 104,
5.0 on 9/14 and 14.8 on 9/16, formula `BBCalColElem(sum: … proportional categories …,
"running": true)`. Scheme methods: `weighted_pct` (ECN.304, GEO.103.lecture, IST.352), `points`
(IST.323 104/100, IST.466 1020/1020, letter scale **in points**), `qualitative` (IST.471).
GEO.103.recitation has no scheme; `courses.parent_course_id` maps it to the lecture. Extra
credit: component `IST.323/extra_credit_lab` and assignment `IST.323/lab-extra-credit` carry
`is_extra_credit`. Enum values: method `weighted_pct|points|qualitative|unknown`; aggregation
`sum|average|average_drop_lowest|rank_weighted|normalized|single|manual|unknown`; confidence
`confirmed|tentative|inferred`.

### Migration allocation

| # | File | Owner | Contents |
|---|---|---|---|
| 057 | `057_grade_scenarios_and_links.sql` | W-20 | `grade_scenarios`, `grade_column_links` (+ same-course trigger), RLS, grants |
| 058 | `058_grade_model_views.sql` | W-20 | `v_grade_model_items`, `v_grade_model_total`, `v_gradebook_history` |
| 059 | — | V-1 | still held; 10b never takes it |
| 080–089 | — | PM | review-fix rounds |

Every migration: dry-run in `begin; … rollback;` via `execute_sql`, applied with
`apply_migration` under the file's name, repo file byte-identical; new tables RLS
owner-scoped with `(select auth.uid()) = public.app_owner()` (the initplan-safe form); revoke
all from `public, anon`; views `with (security_invoker = true)` and `revoke all … from anon`
(036's guard). Never touch 001–056 or 060–066. **10b writes no transform function, no
`stage_*`, and nothing in `assignments`, `assignment_progress`, `grading_schemes`,
`grade_components` or `bb_gradebook`.**

### 057 — scenario and link tables (owner state, never touched by syncs)

```sql
create table grade_scenarios (
  course_id      text primary key references courses(id) on delete cascade, -- the scheme course (GEO: lecture)
  item_scores    jsonb not null default '{}'::jsonb,  -- {"<item_key>": number >= 0}
  component_pcts jsonb not null default '{}'::jsonb,  -- {"<component code>": number 0..1}, manual components only
  target_letter  text,                                -- null = 'A-'
  updated_at     timestamptz not null default now(),
  constraint grade_scenarios_item_scores_shape check (
    jsonb_typeof(item_scores) = 'object'
    and not jsonb_path_exists(item_scores, '$.* ? (@.type() != "number" || @ < 0)')),
  constraint grade_scenarios_component_pcts_shape check (
    jsonb_typeof(component_pcts) = 'object'
    and not jsonb_path_exists(component_pcts, '$.* ? (@.type() != "number" || @ < 0 || @ > 1)')),
  constraint grade_scenarios_target_letter check (target_letter is null or char_length(target_letter) between 1 and 3),
  constraint grade_scenarios_size check (pg_column_size(item_scores) + pg_column_size(component_pcts) < 65536)
);

create table grade_column_links (
  course_id    text    not null references courses(id),       -- the shell the column lives in
  column_id    text    not null,                              -- bb_gradebook.column_id
  component_id bigint  references grade_components(id) on delete cascade,
  excluded     boolean not null default false,                -- "Not graded"
  updated_at   timestamptz not null default now(),
  primary key (course_id, column_id),
  constraint grade_column_links_one_target check ((component_id is not null) <> excluded)
);
```

Trigger `grade_column_links_same_course` (before insert/update, `security invoker`,
`search_path = public, pg_temp`): refuses a `component_id` whose `grade_components.course_id` is
not `coalesce(courses.parent_course_id, courses.id)` of the row's shell. Grants: select, insert,
update, delete to `authenticated`; all to `service_role`.

### 058 — model views

```
v_grade_model_items   -- one row per model item, per scheme course
  scheme_course_id text      -- coalesce(courses.parent_course_id, course id)
  item_key         text      -- 'col:<shell_course_id>:<column_id>' | 'asg:<assignment id>'
  assignment_id    text      -- the single linked assignments row, else null
  shell_course_id  text
  column_id        text      -- null for a placeholder
  component_id     bigint    -- grade_column_links.component_id when a link row exists and not excluded,
                             -- else the linked assignment's component_id, else null
  link_source      text      -- 'override' | 'assignment' | null
  excluded         boolean   -- grade_column_links.excluded (false when no link row)
  name             text      -- column name, or assignments.title for a placeholder
  possible         numeric   -- column possible, or assignments.points_possible for a placeholder
  score            numeric   -- effective_score (null for a placeholder)
  is_exempt        boolean
  column_kind      text      -- 'item' | 'attendance' | 'placeholder'
  is_extra_credit  boolean   -- assignment flag or component flag
  link_confidence  text      -- assignments.confidence of the linked row (for Q3 = B only)
  due_at           timestamptz
  seen_at          timestamptz
```

Rows: (a) every `v_gradebook_latest` row with `column_kind in ('item','attendance')`;
(b) every `assignments` row with `component_id is not null` and no `v_gradebook_latest` row for
its `bb_column_id` (`column_kind = 'placeholder'`). Total, letter and `calc_other` columns never
appear.

```
v_grade_model_total   -- one row per scheme course whose shells publish a total
  scheme_course_id, shell_course_id, column_id, name, score, possible, seen_at,
  bb_running boolean   -- true / false when raw->'formula'->>'formula' matches '"running"\s*:\s*(true|false)', else null

v_gradebook_history   -- per (shell_course_id, column_id): the first registered observation and
                      -- every later registered run whose effective_score differs from the run before
  shell_course_id, column_id, name, run_id, seen_at, score, possible, previous_score
```

"Registered" means the run has a `sync_runs` row (047's predicate). Today the history view
returns 5 columns with a change.

### Engine (`web/src/lib/grade-model/`, W-19) — pure, deterministic, no I/O

`types.ts` and `labels.ts` are committed by the PM on the phase branch before the worker
branches are cut; `index.ts` is committed as signatures that throw `not implemented (W-19)`.
W-19 implements; W-20 builds against the types and never edits these three files.

```ts
export type Method = 'weighted_pct' | 'points' | 'qualitative' | 'unknown';
export type Aggregation = 'sum' | 'average' | 'average_drop_lowest' | 'rank_weighted'
  | 'normalized' | 'single' | 'manual' | 'unknown';
export type Projection = 'graded_so_far' | 'zeros_on_rest' | 'best_case';

export interface LetterStep { readonly min: number; readonly letter: string }
export interface SchemeInput {
  readonly courseId: string; readonly method: Method;
  readonly totalPoints: number | null; readonly gradedOutOf: number | null;
  readonly letterScale: readonly LetterStep[];
}
export interface ComponentInput {
  readonly id: number; readonly code: string; readonly name: string; readonly parentId: number | null;
  readonly weightPct: number | null; readonly points: number | null; readonly countExpected: number | null;
  readonly aggregation: Aggregation; readonly dropLowest: number; readonly rankWeights: readonly number[] | null;
  readonly normalizeTo: number | null; readonly isExtraCredit: boolean;
}
export interface ItemInput {
  readonly key: string; readonly componentId: number | null; readonly linkSource: 'override' | 'assignment' | null;
  readonly excluded: boolean; readonly name: string; readonly possible: number | null; readonly score: number | null;
  readonly exempt: boolean; readonly kind: 'item' | 'attendance' | 'placeholder';
  readonly isExtraCredit: boolean; readonly dueAt: string | null;
}
export interface BlackboardTotal {
  readonly score: number | null; readonly possible: number | null; readonly running: boolean | null; readonly seenAt: string;
}
export interface Scenario {
  readonly itemScores: Readonly<Record<string, number>>;
  readonly componentPcts: Readonly<Record<string, number>>;   // component code → 0..1
}
export interface ModelInput {
  readonly scheme: SchemeInput | null; readonly components: readonly ComponentInput[];
  readonly items: readonly ItemInput[]; readonly scenario: Scenario; readonly blackboardTotal: BlackboardTotal | null;
}

export type NotComputableReason = 'no_scheme' | 'qualitative_method' | 'unknown_method'
  | 'unknown_aggregation' | 'nothing_graded';
export type DeltaReason = 'bb_running_total' | 'ungraded_counted_as_zero' | 'drop_lowest_pending'
  | 'extra_credit' | 'manual_component' | 'unlinked_column' | 'unexplained';

export interface Standing {                     // unrounded; display rounds once
  readonly pct: number; readonly earned: number; readonly denominator: number; readonly letter: string | null;
}
export interface ComponentResult {
  readonly componentId: number; readonly code: string; readonly name: string;
  readonly state: 'graded' | 'partly_graded' | 'ungraded' | 'pending_manual';
  readonly earned: number; readonly gradedCap: number; readonly cap: number;
  readonly usesHypothetical: boolean; readonly capacityFromKnownItems: boolean;
}
export interface Agreement {
  readonly status: 'agrees' | 'differs'; readonly modelValue: number; readonly blackboardValue: number;
  readonly unit: 'points' | 'pct'; readonly delta: number; readonly reasons: readonly DeltaReason[];
}
export type ModelResult =
  | { readonly state: 'not_computable'; readonly reason: NotComputableReason }
  | { readonly state: 'computed'; readonly standings: Readonly<Record<Projection, Standing>>;
      readonly components: readonly ComponentResult[]; readonly unlinkedScoredKeys: readonly string[];
      readonly usesHypotheticals: boolean; readonly agreement: Agreement | null };

export type TargetResult =
  | { readonly state: 'needed'; readonly letter: string; readonly targetPct: number; readonly averageNeeded: number;
      readonly remainingCount: number; readonly remainingShare: number }
  | { readonly state: 'unreachable'; readonly letter: string; readonly bestCase: Standing }
  | { readonly state: 'secured'; readonly letter: string; readonly worstCase: Standing }
  | { readonly state: 'no_remaining_work'; readonly letter: string; readonly current: Standing }
  | { readonly state: 'not_computable'; readonly reason: NotComputableReason };

// index.ts
export function projectCourse(input: ModelInput): ModelResult;
export function solveTarget(input: ModelInput, letter: string): TargetResult;
export function letterFor(pct: number, scheme: SchemeInput): string | null;
export const DEFAULT_TARGET_LETTER = 'A-';
```

**Semantics (frozen).**

* **Item fraction** `f = score / (normalizeTo ?? possible)`. Items with `possible` null or 0 are
  *bookkeeping*: never in arithmetic (IST.352's zero-point knowledge checks). Exempt and
  `excluded` items are removed from numerator and capacity. A scenario value on an item counts
  as its score in every projection and marks results `usesHypothetical`; scenario keys that
  match no ungraded item are ignored.
* **Capacity** `cap`: `weightPct` (weighted_pct) or `points` (points). A parent with children
  computes from its children in capacity units (IST.323 `final_project` = proposal + log +
  defense). Extra credit (component or item flag) adds to earned and never to any capacity or
  denominator.
* **Denominator**: weighted_pct → Σ `cap` of non-extra-credit top-level components (100 today);
  points → `gradedOutOf ?? totalPoints ?? Σcap`.
* **Placeholders**: when a component has more items than `countExpected`, placeholders are
  dropped first, latest `dueAt` first (IST.323's seeded `lab-1` beside the real Lab #1 column).
* **Per aggregation**, with `r` the value applied to ungraded slots (`null` = graded so far,
  `0` = zeros on the rest, `1` = best case, `f` = solver):

| aggregation | graded so far (`r = null`) | with `r` on ungraded slots |
|---|---|---|
| `single` | `cap·f` if graded, else excluded | `cap·r` |
| `sum` | earned `cap·Σs/Σp_exp`, gradedCap `cap·Σp_graded/Σp_exp`; `Σp_exp` = `points` under the points method, else Σ`possible` over known linked items (`capacityFromKnownItems: true`) | ungraded known items and missing slots at `r` |
| `average` | earned `cap·mean(f_graded)`, gradedCap `cap` once anything is graded | slots = max(`countExpected`, known items); mean with `r` |
| `average_drop_lowest` | as `average` after dropping the `dropLowest` lowest graded fractions, only while graded count > `dropLowest` | slots filled with `r`, then the lowest `dropLowest` dropped (a missed quiz is the one dropped) |
| `rank_weighted` | `cap·mean(f_graded)` (ranks are unknowable while exams are ungraded) | slots = `rankWeights.length`; fractions sorted descending; `cap·Σ wᵢf₍ᵢ₎/Σw` |
| `normalized` | earned `cap·mean(f_graded)`, gradedCap `cap` once anything is graded — Blackboard's proportional category (IST.323 9/16: quizzes 5.0) | slots = `countExpected`; mean with `r` |
| `manual` | mean `f` of linked items with `possible > 0` when any is graded; else the scenario's `componentPcts[code]`; else `pending_manual` (excluded) | pending → `r` |
| `unknown` | course → `not_computable('unknown_aggregation')` | — |

* **Standings**: graded so far = `Σearned / ΣgradedCap`; zeros on the rest = `Σearned(r=0) /
  denominator`; best case = `Σearned(r=1) / denominator`; all × 100, never rounded inside the engine.
  `nothing_graded` when `ΣgradedCap = 0` and the scenario is empty. `qualitative` / `unknown`
  method and a missing scheme short-circuit to `not_computable`.
* **Letter**: highest step with `min ≤ value`, compared unrounded. A scale whose largest `min`
  exceeds 100 is in points and is compared against `pct · denominator / 100` (IST.466).
* **Agreement** (runtime; real scores only — the scenario never touches it): only when a
  Blackboard total with a score exists. `running = true` → compare the graded-so-far earned
  value (points method: points; weighted_pct: pct) with Blackboard's score (or score/possible·100);
  `running = false` → compare zeros on the rest; `running = null` → compare zeros on the rest and
  add `bb_running_total`. **Agrees** when `|delta| ≤ 0.5` on a 100-unit denominator (scaled for
  others). **Differs** lists every reason whose condition holds: `unlinked_column` (a scored,
  non-bookkeeping, non-excluded item with no component), `manual_component` (a manual component
  pending or scored), `extra_credit` (extra-credit earned > 0), `drop_lowest_pending` (a
  drop-lowest component whose graded count ≤ `dropLowest`), `ungraded_counted_as_zero`
  (`running = false` and ungraded capacity > 0); `unexplained` only when none holds.
* **Solver**: target = the letter's `min` (converted for a points scale). Remaining = ungraded,
  non-exempt, non-extra-credit slots without a scenario value, plus pending manual components.
  None → `no_remaining_work`. `projection(r=1) < target` → `unreachable`; `projection(r=0) ≥
  target` → `secured`; otherwise bisect `r ∈ [0,1]` until `hi − lo < 1e-6` and return `hi`, so
  feeding `averageNeeded` back always reaches the target. `remainingShare` = remaining capacity ÷
  denominator.

### Labels (`web/src/lib/grade-model/labels.ts`, frozen strings)

| Key | Text |
|---|---|
| `MODEL_LABEL` | Our model |
| `UNVALIDATED_BADGE` | rules not yet validated |
| `PROJECTION_LABEL` | graded so far · zeros on the rest · best case |
| `AGREES_TEXT` | Agrees with Blackboard's number |
| `DIFFERS_TEXT` | Differs from Blackboard's number by {delta} {unit}: |
| `NOT_COMPUTABLE_TEXT` | `qualitative_method` "Model not computed — this course is graded qualitatively" · `no_scheme` "Model not computed — no grading rules recorded" · `unknown_method` / `unknown_aggregation` "Model not computed — a grading rule is unknown" · `nothing_graded` "Model not computed yet — nothing that counts has been graded" |
| `DELTA_REASON_TEXT` | `bb_running_total` "Blackboard's running-total setting could not be read" · `ungraded_counted_as_zero` "Blackboard counts ungraded work as zero" · `drop_lowest_pending` "a drop-lowest rule is not applied yet" · `extra_credit` "extra credit is counted" · `manual_component` "a component the instructor scores by hand" · `unlinked_column` "a Blackboard column is not linked to a syllabus rule" · `unexplained` "no known reason" |
| `PENDING_MANUAL_TEXT` | {name} ({share}) not scored yet |
| `SOLVER_TEXT` | needed "For {letter} (≥ {min}) you need {avg} average on the {n} remaining items ({share} of the grade left)." · unreachable "{letter} is out of reach — the most you can finish with is {best} ({bestLetter})." · secured "{letter} is secured — even zeros on the rest leave {worst} ({worstLetter})." · no_remaining_work "Nothing is left to grade — the course stands at {current} ({letter})." |
| `WHAT_IF_LABEL` | what if |
| `PLACEHOLDER_GROUP` | Not in Blackboard yet |
| `LINK_LABEL` / `LINK_NOT_GRADED` | Counts toward… / Not graded |
| `RESET_LABEL` | Reset scenario |

Display rounding happens once, in the component: percentages 1 decimal, points up to 2.

### Web (W-20)

**`web/src/lib/queries.grade-model.ts`** (conventions of `queries.grades.ts`: generated row types,
`gradeModelKeys`, `*Options()` → `queryOptions`, throw on error, no fabricated fallbacks):

| Export | Reads / writes | Notes |
|---|---|---|
| `gradingSchemeOptions(schemeCourseId)` | `grading_schemes` + `grade_components` | |
| `gradeModelItemsOptions(schemeCourseId)` | `v_grade_model_items` | |
| `gradeModelTotalOptions(schemeCourseId)` | `v_grade_model_total` | |
| `gradeScenarioOptions(schemeCourseId)` | `grade_scenarios` | null row = empty scenario |
| `gradeHistoryOptions(shellIds)` | `v_gradebook_history` | |
| `useSaveScenario()` | upsert `grade_scenarios` | optimistic; on blur / Enter, not per keystroke |
| `useResetScenario()` | delete the course's row | |
| `useLinkColumn()` | upsert / delete `grade_column_links` | invalidates items + model |
| `toModelInput(scheme, components, items, scenario, total)` | pure | tested; GEO's two shells in one input |
| `schemeCourseIdFor(display)` | pure | the shell with no `parent_course_id` |

Input validation at the boundary: a what-if value parses as a finite number, `0 ≤ v ≤ possible`
(an extra-credit item's own possible included); a component % is `0..100` in the UI, stored
`0..1`; anything else shows a field error and is not saved.

**Components (CSS Modules + existing tokens):**

| Where | What |
|---|---|
| `components/grades/ModelStanding.tsx` | under `CourseGradeHeader`, inside a container labelled **Our model** (`data-model`): headline `pct (letter)` + "graded so far", one line "zeros on the rest x · best case y", the "rules not yet validated" badge, a one-line explanation from `components` ("3 of 8 parts graded: quizzes, exams; participation (5 pts) not scored yet"), the agreement line from the enum, the unlinked count; or the `NOT_COMPUTABLE_TEXT` for its reason. `/grades` and the course tab both render it |
| `components/grades/WhatIfCell.tsx` | course tab only: on an ungraded row, an input labelled "what if" in the score cell; a typed value renders in the accent colour with a per-row revert (×); never styled like a Blackboard score |
| `components/grades/PlaceholderRows.tsx` | course tab only: "Not in Blackboard yet" group under the table, one row per `placeholder` item with the same cell |
| `components/grades/ManualComponentInput.tsx` | course tab only: per pending manual component, "assume __ %" |
| `components/grades/TargetSolver.tsx` | course tab only: letter select from the scheme's scale (default saved or A-), the `SOLVER_TEXT` sentence for the state |
| `components/grades/ScoreHistory.tsx` | a "history" disclosure on a row with ≥ 2 history rows: "— → 9.0 → 9.5 · seen 14 Sep, 16 Sep" |
| `components/grades/LinkColumnControl.tsx` | course tab only: on a scored, unlinked item row, "Counts toward…" select (components of the scheme + "Not graded") |
| `GradebookTable.tsx` | gains optional `whatIf`, `history`, `links` props; `/grades` passes only `history` |
| `CourseGrades.tsx` / `GradesScreen.tsx` | fetch, `toModelInput`, `projectCourse`, render; course tab adds solver + Reset scenario |

**Tests** (`web/test/`): `queries.grade-model.test.ts` (request shapes, `toModelInput` incl.
GEO, orphan scenario keys ignored); `ModelStanding.test.tsx` (computed, every not-computable
reason, agrees / differs with each reason text, badge, every percentage inside the labelled
container); `WhatIfCell.test.tsx` (type, revert, validation, "what if" label); `TargetSolver.test.tsx`
(four states); `ScoreHistory.test.tsx` (three-run fixture); `LinkColumnControl.test.tsx`;
`CourseGrades.model.test.tsx` (real engine, mocked queries: a saved scenario restores after
remount, Reset deletes). Grep assertions as tests: no `.from('assignments' | 'assignment_progress'
| 'bb_gradebook' | 'grading_schemes' | 'grade_components')` followed by
`insert|update|upsert|delete` in files this phase adds; no `service_role` / `sb_secret` in
`web/src`.

**SQL tests** (`db/tests/phase10b_*.sql`, rolled back against prod): anon sees 0 rows of both
tables and three views; a non-owner uid sees 0; the check constraints refuse a string score, a
negative score, a component pct of 1.5; the trigger refuses a component from another course;
`v_grade_model_items` row count = item + attendance latest columns + placeholders;
`v_grade_model_total.bb_running = true` for IST.323; `v_gradebook_history` = 5 changed columns;
no `pg_proc.prosrc` outside 057/058 references `grade_scenarios` or `grade_column_links`.

### Engine tests (W-19, `web/test/grade-model/`)

* **L1** one table-driven file per aggregation, incl. IST.323 `final_project` children and the
  placeholder-drop rule.
* **L2** property suite (`fast-check`, ≥ 200 runs, seed printed on failure, `FC_SEED` honoured):
  monotone in every score and in `r`; `0 ≤ pct ≤ best case`, above 100 only via extra credit;
  drop-lowest never lowers when a score rises; `rank_weighted` invariant under exam order and
  weights summing to `cap`; same input → deep-equal output with a deep-frozen input; the scenario
  never changes `agreement`.
* **L3** fixtures `fixtures/<course>.json` for ECN.304, GEO.103 (lecture + recitation items),
  IST.323, IST.352, IST.466, IST.471 at three states (start / mid / all graded), hand-computed
  expected standings with the derivation written in the fixture; plus IST.323's live 9/14 (5.0)
  and 9/16 (14.8) states cut from prod rows.
* **L4** agreement: every fixture with a Blackboard total agrees or lists a reason; no fixture
  reaches `unexplained`; IST.323 9/14 and 9/16 **agree**.
* **L5** solver round-trip on ECN.304 (`rank_weighted`) and GEO reading quizzes
  (`average_drop_lowest`): `projection(averageNeeded) ≥ target`; `unreachable`, `secured` and
  `no_remaining_work` fixtures.
* Coverage ≥ 90 % lines on `web/src/lib/grade-model/`.

### Honesty rules

Every number bb2dash computes sits inside the "Our model" container with the unvalidated badge;
Blackboard's figures keep 10a's labels and `seen_at`. A what-if value is never styled as a
Blackboard score. `null` is `—`, never 0; pending manual components are named, never zeroed.
The agreement uses real scores only. Nothing is rounded before display.

## Seams (frozen)

* **10a** owns the mirror and its five views; 10b reads them and adds three views of its own.
  `GradebookTable` and `CourseGradeCard` are extended through optional props; their 10a tests
  keep passing unchanged.
* **V-1 (stubbed)** owns `grading_schemes`, `grade_components`, `assignments.component_id`;
  10b reads them and never writes. `grade_column_links` is Stack's override layer that V-1
  folds in later.
* **Phase 9** owns the transform; 10b adds no stage and edits no transform function.
* **Phase 11b** (next, not started) owns 067–072 and the planner routes; no shared file.

## Definition of done

Source: Stack's answers (`70_MVP_INDEX.md` §1.4) + research `research/73_RESEARCH_phase10b_grade_model.md`
§5, amended 2026-09-16 for V-1's stub.

- [ ] **Stack's acceptance script (on the preview):** (1) IST.323 tab: Blackboard's 14.8 / 104
      beside "Our model" with its one-line explanation and the agreement line; (2) type a
      hypothetical on an ungraded item and watch the standing move, reload, it is still there,
      revert the row, then Reset scenario; (3) pick a target letter and read the average needed,
      then pick one out of reach and one already secured; (4) ECN.304: hypotheticals on Exam 1 and
      Exam 2 (placeholder rows) re-order the rank weights and move the total; (5) IST.471 shows
      only Blackboard's number with "Model not computed — this course is graded qualitatively";
      (6) link one unlinked column and see the model take it in; (7) open a row's history. All
      seven ticked.
- [ ] All live methods implemented (`weighted_pct`, `points` with `graded_out_of` and extra
      credit, `rank_weighted`, `average_drop_lowest`, `normalized`, `sum` with children, `single`,
      `average`); `qualitative` / `unknown` return `not_computable`, never 0; pending `manual`
      components are named, never zeroed.
- [ ] L1–L5 green; coverage ≥ 90 % on the engine.
- [ ] **Agreement**: IST.323 agrees on both live states; every fixture agrees or names a reason;
      the reason renders from the enum, never free text.
- [ ] Blackboard's running-total setting is read from the formula (`v_grade_model_total.bb_running`),
      never guessed; the agreement uses it.
- [ ] Solver returns `needed`, `unreachable`, `secured`, `no_remaining_work`; round-trip holds.
- [ ] What-if writes only `grade_scenarios` (one row per course, survives reload); links write only
      `grade_column_links`; grep assertions green; SQL shows syncs never reference either table.
- [ ] Non-computable courses show Blackboard's number and the not-computable sentence.
- [ ] Every computed figure sits in the "Our model" container with the unvalidated badge; RTL
      assertion.
- [ ] Letter thresholds read from `letter_scale` (points scales converted); no rounding before display.
- [ ] Score history renders from `v_gradebook_history` (5 columns today).
- [ ] RLS: anon and non-owner see 0 rows of the new tables and views.
- [ ] SOP gates: typecheck/build/test green in `web/` and `mcp-server/`; `/code-review main high`
      HIGH cleared; `/security-review`; STATUS + DECISIONS + ORCHESTRATOR updated; Vercel preview posted.

## Task loops

| # | task | executable check | demo line (Stack) | owner |
|---|---|---|---|---|
| 1 | Verify preconditions; draft Contract; Stack's answers | answers recorded here | — | PM |
| 2 | Commit `types.ts`, `labels.ts`, `index.ts` stubs; cut worker branches | typecheck green on the phase branch | — | PM |
| 3 | Aggregations `single`, `sum` (+children), `average`, `normalized` | L1 | — | W-19 |
| 4 | `average_drop_lowest`, `rank_weighted`, `manual`, placeholders | L1 | — | W-19 |
| 5 | `projectCourse`, standings, letters, not-computable paths | L1 + L3 | "IST.471 shows only Blackboard's number" | W-19 |
| 6 | Property suite | L2 green, seed printed on a forced failure | — | W-19 |
| 7 | Agreement + delta reasons | L4; IST.323 9/14 and 9/16 agree | "the model and Blackboard agree, or it tells me why not" | W-19 |
| 8 | Solver | L5 | "I pick A- and see what I need" | W-19 |
| 9 | 057 tables + trigger + RLS | SQL tests | — | W-20 |
| 10 | 058 views | SQL tests; counts vs live | — | W-20 |
| 11 | `queries.grade-model.ts` + adapter | vitest | — | W-20 |
| 12 | `ModelStanding` on both screens | RTL | "Our model beside Blackboard's number" | W-20 |
| 13 | What-if cells, placeholders, manual input, persistence, Reset | RTL + remount test | "I type a score, reload, it is still there" | W-20 |
| 14 | `TargetSolver` | RTL four states | — | W-20 |
| 15 | `LinkColumnControl` | RTL + SQL trigger test | "I link Lab #1 and the model takes it" | W-20 |
| 16 | `ScoreHistory` | RTL three runs | "I see when a score changed" | W-20 |
| 17 | Integrate, regenerate types, live smoke, gates, docs, preview | SOP list | — | PM |
| 18 | **Stack's acceptance script** | — | the seven steps above | Stack |

## Out of scope

Grades on Home cards; multiple named scenarios; any write to V-1's tables; late-penalty or curve
modelling; professor-facing anything; a sparkline.

## Workers

Branches cut from `feat/grades-10b` after this brief and the three engine files are committed;
worktrees under `C:/Users/estac/projects/`. Workers commit and push to their own branch, never
to the phase branch or `main`, and never touch `project-state/`.

* **W-19 engine** (`feat/grades-10b-engine`, worktree `bb2dash-wt-gm-engine`):
  `web/src/lib/grade-model/**` (not `types.ts` / `labels.ts`), `web/test/grade-model/**`,
  `fast-check` devDependency. No database writes (read-only SQL to cut fixtures), no components.
* **W-20 db + web** (`feat/grades-10b-web`, worktree `bb2dash-wt-gm-web`): migrations 057–058,
  `db/tests/phase10b_*.sql`, `queries.grade-model.ts`, the components and screen edits, their
  tests, verification note `docs/planning/68a_W20_VERIFICATION.md` (shape of
  `51_W10_VERIFICATION.md`: migration versions + md5, SQL test output, RLS check, advisor diff).
  Until W-19 lands, container tests use a fake `projectCourse` returning typed `ModelResult`
  fixtures.

## Integration (PM)

Merge W-19, then W-20; regenerate `database.types.ts`; `npm ci` (new devDependency); typecheck +
build + tests in `web/` and `mcp-server/`; live smoke on prod (IST.323's model agrees with 14.8;
IST.471 not computable); `/code-review main high` + `/security-review`; STATUS, DECISIONS,
ORCHESTRATOR updated; Vercel preview; Stack's acceptance script; stop at the PR.
