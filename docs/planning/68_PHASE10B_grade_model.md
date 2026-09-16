# Phase 10b — Grades: methodology model, what-if, score history

Date: 2026-09-14 (brief); **Contract frozen by the PM session 2026-09-16** with Stack's answers.
Product manager: Stack. Requirements: R-11 (b)+(c), R-12 from `60_REQUIREMENTS_v2.md`. Phase
branch `feat/grades-10b` (worktree `bb2dash-wt-grades-10b`), one PR. **Migrations 057–058;
review rounds 080–089** (059 stays V-1's; 060–066 are Phase 11, 067–072 Phase 11b, 073–079
Phase 12).

**Preconditions (checked 2026-09-16):**

1. Phase 10a is on `main` — **yes** (PR #13, `5b84b01`).
2. `bb_gradebook` holds more than ten non-attendance scores — **yes**: 18 scored item columns
   (IST.352 10, IST.323 5, IST.471 2, ECN.304 1; IST.466 and GEO 103 none).
3. `65_GRADING_VALIDATION_SUMMARY.md` shows every course signed off — **no, and waived**. Stack,
   2026-09-16: V-1 is stubbed for later; it is a data-accuracy task, not a product feature, so
   it no longer gates 10b. Consequence: the model leaves out any syllabus part whose link is
   unsure (answer 3) and gives Stack a picker for columns no rule is attached to (answer 2).

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
  **Reconfirmed 2026-09-16** (answer 1).
* Score-change history (from 10a's append-per-run mirror) surfaces here.

## MVP (in Stack's words)

On a course's Grades tab, next to Blackboard's number, see "our model: 87.4% (B+)" with a
one-line explanation of how it was computed and, where Blackboard also publishes a total, why
the two differ (or that they agree). Type a hypothetical score on any ungraded item and watch
the standing move; type a target letter and see the average needed on the remaining work. The
scenario is still there tomorrow. IST.471 shows nothing but Blackboard's number.

## Stack's answers (2026-09-16)

| # | Question | Answer | What it fixes in the Contract |
|---|---|---|---|
| 1 | Five of six courses carry a `manual` (hand-graded) component with no score: ECN.304 participation 10 %, GEO 103 attendance + section participation 20 %, IST.323 participation 5 pts, IST.352 attendance 15 %. Model the rest, or keep the strict rule? | **Keep the strict rule.** Any unscored `manual` component hides the model for that course | `not_computable('manual_unscored')` naming the parts; no assumed % for a manual component; the solver never treats one as remaining work |
| 2 | Blackboard columns with no syllabus rule attached (IST.323 Lab #1, IST.352 Project #2A and #3, IST.323's Final Project proposal column tied to two rows) | **Picker on the row**: "Counts toward…" a component, or "Not graded", saved in a bb2dash-owned table syncs never touch | `grade_column_links` (057), `link_source = 'override'`, `LinkColumnControl` |
| 3 | No course is signed off; 9 assignment→component links are `tentative` / `inferred` | **Hide unsure parts**: a component with an unsure link is left out of the model | per-component `muted` state, `muted_component` delta reason, the parts named on screen |
| 4 | Headline number | **Graded so far**, with "zeros on the rest" and "best case" on one line under it | `Projection` order |

### What the answers mean on screen today (PM's reading of prod, 2026-09-16)

| Course | Model today | Why | What makes it compute |
|---|---|---|---|
| IST.323 | not computed | Class Participation (5 pts) not scored; Blackboard posts it at term end | the participation score |
| ECN.304 | not computed | Participation (10 %) not scored | Stack links the **Attendance** column (85.7) to Participation, if that is what the syllabus means |
| IST.352 | not computed | Attendance, Class Contribution (15 %): its linked columns are 0-point knowledge checks | a scored column for it |
| GEO 103 | not computed | Lecture Attendance + Discussion Section Attendance & Participation (20 %); the Blackboard columns are absence counts, not scores | scored columns for both |
| IST.466 | nothing graded | no scores yet; Major Cases (300) and AI Team Assignment (100) would be left out as unsure | a first score or a what-if value; the picker confirms the two major-case links |
| IST.471 | not computed | graded qualitatively | never |

So on the preview no course shows "Our model" until Stack acts (a link, or a what-if value on
IST.466). The agreement with Blackboard's number cannot show on screen until IST.323's
participation posts; the arithmetic is proven by test instead (L4: the engine's graded-so-far over
IST.323's live 9/14 and 9/16 rows reproduces Blackboard's 5.0 and 14.8).

### PM calls (recorded 2026-09-16; Stack may overrule)

1. **Running total is read, not asked.** Blackboard's total formula carries `"running": true|false`;
   `v_grade_model_total.bb_running` parses it. Only IST.323 publishes a total today (`true`). No
   column is added to `grading_schemes` (V-1's table stays untouched).
2. **IST.323 extra credit raises earned, never possible**: graded out of 100, so up to 104 % —
   what its syllabus says ("104 points possible, graded out of 100"). No clamping.
3. **Target**: a letter picker per course, default **A-**, saved with the scenario.
4. **What-if, the solver and the picker live on the course Grades tab only**; `/grades` shows the
   model line (or the not-computed sentence) read-only.
5. **Score history** is a small disclosure on a row whose score changed across syncs (5 columns
   today, at most two runs each), not a sparkline.
6. **`fast-check`** (pinned exact, devDependency) runs the property suite.
7. **Placeholder rows.** An assignment linked to a component with no Blackboard column yet (ECN.304
   Exams 1–3; 31 rows across courses today) shows under the table as "Not in Blackboard yet" so a
   hypothetical can be typed on it. Acceptance step 5 needs this: ECN.304 has no exam columns.
8. **Late penalties are not modelled.** The model uses Blackboard's posted score, which already
   carries any penalty.
9. **The picker also confirms unsure links.** It shows on a scored unlinked column **and** on any
   column whose link is `tentative` / `inferred` (current component preselected, marked "unsure").
   Saving it writes a `grade_column_links` row, which the model treats as confirmed. A placeholder
   (no column) cannot be confirmed this way; it stays left out until V-1.
10. **Only counted items can mute a part.** A link's confidence mutes its component only when the
    item counts (possible > 0, not exempt, not excluded). The seeded "series placeholder" rows
    (`ECN.304/quiz-series`, `GEO.103/reading-quiz-series`, …) have no points and never mute.

## Contract (frozen 2026-09-16 — all workers build against this)

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
  course_id     text primary key references courses(id) on delete cascade, -- the scheme course (GEO: lecture)
  item_scores   jsonb not null default '{}'::jsonb,  -- {"<item_key>": number >= 0}
  target_letter text,                                -- null = 'A-'
  updated_at    timestamptz not null default now(),
  constraint grade_scenarios_item_scores_shape check (
    jsonb_typeof(item_scores) = 'object'
    and not jsonb_path_exists(item_scores, '$.* ? (@.type() != "number" || @ < 0)')),
  constraint grade_scenarios_target_letter check (target_letter is null or char_length(target_letter) between 1 and 3),
  constraint grade_scenarios_size check (pg_column_size(item_scores) < 65536)
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
  link_confidence  text      -- 'confirmed' for an override; else assignments.confidence; null when unlinked
  excluded         boolean   -- grade_column_links.excluded (false when no link row)
  name             text      -- column name, or assignments.title for a placeholder
  possible         numeric   -- column possible, or assignments.points_possible for a placeholder
  score            numeric   -- effective_score (null for a placeholder)
  is_exempt        boolean
  column_kind      text      -- 'item' | 'attendance' | 'placeholder'
  is_extra_credit  boolean   -- assignment flag or component flag
  due_at           timestamptz
  seen_at          timestamptz
```

Rows: (a) every `v_gradebook_latest` row with `column_kind in ('item','attendance')`;
(b) every `assignments` row with `component_id is not null` and no `v_gradebook_latest` row for
its `(course_id, bb_column_id)` (`column_kind = 'placeholder'`). Total, letter and `calc_other`
columns never appear.

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
export type Confidence = 'confirmed' | 'tentative' | 'inferred';
export type Projection = 'graded_so_far' | 'zeros_on_rest' | 'best_case';   // headline first

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
  readonly key: string; readonly componentId: number | null;
  readonly linkSource: 'override' | 'assignment' | null; readonly linkConfidence: Confidence | null;
  readonly excluded: boolean; readonly name: string; readonly possible: number | null; readonly score: number | null;
  readonly exempt: boolean; readonly kind: 'item' | 'attendance' | 'placeholder';
  readonly isExtraCredit: boolean; readonly dueAt: string | null;
}
export interface BlackboardTotal {
  readonly score: number | null; readonly possible: number | null; readonly running: boolean | null; readonly seenAt: string;
}
export interface Scenario { readonly itemScores: Readonly<Record<string, number>> }
export interface ModelInput {
  readonly scheme: SchemeInput | null; readonly components: readonly ComponentInput[];
  readonly items: readonly ItemInput[]; readonly scenario: Scenario; readonly blackboardTotal: BlackboardTotal | null;
}

export type NotComputableReason = 'no_scheme' | 'qualitative_method' | 'unknown_method'
  | 'unknown_aggregation' | 'manual_unscored' | 'nothing_graded';
export type DeltaReason = 'bb_running_total' | 'ungraded_counted_as_zero' | 'drop_lowest_pending'
  | 'extra_credit' | 'muted_component' | 'unlinked_column' | 'unexplained';

export interface Standing {                     // unrounded; display rounds once
  readonly pct: number; readonly earned: number; readonly denominator: number; readonly letter: string | null;
}
export interface ComponentResult {
  readonly componentId: number; readonly code: string; readonly name: string;
  readonly state: 'graded' | 'partly_graded' | 'ungraded' | 'muted';
  readonly earned: number; readonly gradedCap: number; readonly cap: number;
  readonly usesHypothetical: boolean; readonly capacityFromKnownItems: boolean;
}
export interface Agreement {
  readonly status: 'agrees' | 'differs'; readonly modelValue: number; readonly blackboardValue: number;
  readonly unit: 'points' | 'pct'; readonly delta: number; readonly reasons: readonly DeltaReason[];
}
export type ModelResult =
  | { readonly state: 'not_computable'; readonly reason: NotComputableReason;
      readonly unscoredManual: readonly string[] }            // component names; empty unless manual_unscored
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

* **Order of checks**: no scheme → `no_scheme`; method `qualitative` / `unknown` →
  that reason; any component `unknown` → `unknown_aggregation`; any **unscored manual** component
  → `manual_unscored` (names listed); otherwise compute, and `nothing_graded` when nothing is
  graded and the scenario gives no value.
* **Item fraction** `f = score / (normalizeTo ?? possible)`. Items with `possible` null or 0 are
  *bookkeeping*: never in arithmetic and never muting (IST.352's zero-point knowledge checks, the
  seeded series placeholders). Exempt and `excluded` items are removed from numerator and
  capacity. A scenario value on an ungraded item counts as its score in every projection and marks
  results `usesHypothetical`; scenario keys that match no ungraded item are ignored.
* **Muting (answer 3)**: a component is `muted` when any of its counted items has
  `linkConfidence ≠ 'confirmed'` (an override is confirmed). A muted component is left out of
  every projection — earned, graded capacity, capacity and denominator — and is named on screen.
  The manual check runs first: a muted manual component that is unscored still makes the course
  `manual_unscored`.
* **Capacity** `cap`: `weightPct` (weighted_pct) or `points` (points). A parent with children
  computes from its children in capacity units (IST.323 `final_project` = proposal + log +
  defense). Extra credit (component or item flag) adds to earned and never to any capacity or
  denominator.
* **Denominator**: weighted_pct → Σ `cap` of non-extra-credit, non-muted top-level components (100
  when nothing is muted); points → `gradedOutOf ?? totalPoints ?? Σcap`, less the `cap` of muted
  components.
* **Placeholders**: when a component has more counted items than `countExpected`, placeholders are
  dropped first, latest `dueAt` first (IST.323's seeded `lab-1` beside the real Lab #1 column).
* **Per aggregation**, with `r` the value applied to ungraded slots (`null` = graded so far,
  `0` = zeros on the rest, `1` = best case, `f` = solver):

| aggregation | graded so far (`r = null`) | with `r` on ungraded slots |
|---|---|---|
| `single` | `cap·f` if graded, else excluded | `cap·r` |
| `sum` | earned `cap·Σs/Σp_exp`, gradedCap `cap·Σp_graded/Σp_exp`; `Σp_exp` = `points` under the points method, else Σ`possible` over known counted items (`capacityFromKnownItems: true`) | ungraded known items and missing slots at `r` |
| `average` | earned `cap·mean(f_graded)`, gradedCap `cap` once anything is graded | slots = max(`countExpected`, known items); mean with `r` |
| `average_drop_lowest` | as `average` after dropping the `dropLowest` lowest graded fractions, only while graded count > `dropLowest` | slots filled with `r`, then the lowest `dropLowest` dropped (a missed quiz is the one dropped) |
| `rank_weighted` | `cap·mean(f_graded)` (ranks are unknowable while exams are ungraded) | slots = `rankWeights.length`; fractions sorted descending; `cap·Σ wᵢf₍ᵢ₎/Σw` |
| `normalized` | earned `cap·mean(f_graded)`, gradedCap `cap` once anything is graded — Blackboard's proportional category (IST.323 9/16: quizzes 5.0) | slots = `countExpected`; mean with `r` |
| `manual` | `cap·mean(f)` over its graded counted items (a column linked to it by override or assignment); none graded → the course is `manual_unscored` | graded items only; no slots |
| `unknown` | course → `not_computable('unknown_aggregation')` | — |

* **Standings**: graded so far = `Σearned / ΣgradedCap`; zeros on the rest = `Σearned(r=0) /
  denominator`; best case = `Σearned(r=1) / denominator`; all × 100, never rounded inside the engine.
* **Letter**: highest step with `min ≤ value`, compared unrounded. A scale whose largest `min`
  exceeds 100 is in points and is compared against `pct · denominator / 100` (IST.466).
* **Agreement** (runtime; real scores only — the scenario never touches it): only for a computed
  course with a Blackboard total that has a score. `running = true` → compare the graded-so-far
  earned value (points method: points; weighted_pct: pct) with Blackboard's score (or
  score/possible·100); `running = false` → compare zeros on the rest; `running = null` → compare
  zeros on the rest and add `bb_running_total`. **Agrees** when `|delta| ≤ 0.5` on a 100-unit
  denominator (scaled for others). **Differs** lists every reason whose condition holds:
  `unlinked_column` (a scored, counted, non-excluded item with no component), `muted_component`
  (a component is muted), `extra_credit` (extra-credit earned > 0), `drop_lowest_pending` (a
  drop-lowest component whose graded count ≤ `dropLowest`), `ungraded_counted_as_zero`
  (`running = false` and ungraded capacity > 0); `unexplained` only when none holds.
* **Solver**: target = the letter's `min` (converted for a points scale). Remaining = ungraded,
  counted, non-exempt, non-extra-credit slots of non-muted components without a scenario value.
  None → `no_remaining_work`. `projection(r=1) < target` → `unreachable`; `projection(r=0) ≥
  target` → `secured`; otherwise bisect `r ∈ [0,1]` until `hi − lo < 1e-6` and return `hi`, so
  feeding `averageNeeded` back always reaches the target. `remainingShare` = remaining capacity ÷
  denominator. A not-computable course returns `not_computable`.

### Labels (`web/src/lib/grade-model/labels.ts`, frozen strings)

| Key | Text |
|---|---|
| `MODEL_LABEL` | Our model |
| `PROJECTION_LABEL` | graded so far · zeros on the rest · best case |
| `WHAT_IF_NOTE` | includes what-if values |
| `AGREES_TEXT` | Agrees with Blackboard's number |
| `DIFFERS_TEXT` | Differs from Blackboard's number by {delta} {unit}: |
| `NOT_COMPUTABLE_TEXT` | `qualitative_method` "Model not computed — this course is graded qualitatively" · `manual_unscored` "Model not computed — {names} not scored yet" · `no_scheme` "Model not computed — no grading rules recorded" · `unknown_method` / `unknown_aggregation` "Model not computed — a grading rule is unknown" · `nothing_graded` "Model not computed yet — nothing that counts has been graded" |
| `MUTED_TEXT` | Left out: {names} — the link to the syllabus is unsure |
| `DELTA_REASON_TEXT` | `bb_running_total` "Blackboard's running-total setting could not be read" · `ungraded_counted_as_zero` "Blackboard counts ungraded work as zero" · `drop_lowest_pending` "a drop-lowest rule is not applied yet" · `extra_credit` "extra credit is counted" · `muted_component` "a part with an unsure link is left out" · `unlinked_column` "a Blackboard column is not linked to a syllabus rule" · `unexplained` "no known reason" |
| `SOLVER_TEXT` | needed "For {letter} (≥ {min}) you need {avg} average on the {n} remaining items ({share} of the grade left)." · unreachable "{letter} is out of reach — the most you can finish with is {best} ({bestLetter})." · secured "{letter} is secured — even zeros on the rest leave {worst} ({worstLetter})." · no_remaining_work "Nothing is left to grade — the course stands at {current} ({letter})." |
| `WHAT_IF_LABEL` | what if |
| `PLACEHOLDER_GROUP` | Not in Blackboard yet |
| `LINK_LABEL` / `LINK_NOT_GRADED` / `LINK_UNSURE` | Counts toward… / Not graded / unsure |
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

Input validation at the boundary: a what-if value parses as a finite number with `0 ≤ v ≤
possible` (an extra-credit item's own possible included); anything else shows a field error and
is not saved. A link write sends only `course_id`, `column_id` and either `component_id` or
`excluded: true`; the trigger is the authority on course membership.

**Components (CSS Modules + existing tokens):**

| Where | What |
|---|---|
| `components/grades/ModelStanding.tsx` | under `CourseGradeHeader`, inside a container labelled **Our model** (`data-model`): headline `pct (letter)` + "graded so far", one line "zeros on the rest x · best case y", "includes what-if values" when it does, a one-line explanation from `components` ("3 of 8 parts graded: quizzes, exams"), the `MUTED_TEXT` line when a part is left out, the agreement line from the enum, the unlinked count; or the `NOT_COMPUTABLE_TEXT` for its reason. `/grades` and the course tab both render it |
| `components/grades/WhatIfCell.tsx` | course tab only: on an ungraded row of a counted, non-muted item, an input labelled "what if" in the score cell; a typed value renders in the accent colour with a per-row revert (×); never styled like a Blackboard score |
| `components/grades/PlaceholderRows.tsx` | course tab only: "Not in Blackboard yet" group under the table, one row per `placeholder` item with the same cell |
| `components/grades/TargetSolver.tsx` | course tab only: letter select from the scheme's scale (default saved or A-), the `SOLVER_TEXT` sentence for the state |
| `components/grades/ScoreHistory.tsx` | a "history" disclosure on a row with ≥ 2 history rows: "— → 9.0 → 9.5 · seen 14 Sep, 16 Sep" |
| `components/grades/LinkColumnControl.tsx` | course tab only: "Counts toward…" select (the scheme's components + "Not graded") on a column row that is scored and unlinked, **or** whose link is `tentative` / `inferred` (current component preselected, marked "unsure"); in either table group |
| `GradebookTable.tsx` | gains optional `whatIf`, `history`, `links` props; `/grades` passes only `history`. A column linked by override renders among the item rows with 10a's "counts toward grade" tag |
| `CourseGrades.tsx` / `GradesScreen.tsx` | fetch, `toModelInput`, `projectCourse`, render; course tab adds solver + Reset scenario |

**Tests** (`web/test/`): `queries.grade-model.test.ts` (request shapes, `toModelInput` incl.
GEO, orphan scenario keys ignored); `ModelStanding.test.tsx` (computed, every not-computable
reason incl. the named `manual_unscored` sentence, agrees / differs with each reason text, muted
line, what-if note, every percentage inside the labelled container); `WhatIfCell.test.tsx` (type,
revert, validation, "what if" label, absent on muted items); `TargetSolver.test.tsx` (five
states); `ScoreHistory.test.tsx` (three-run fixture); `LinkColumnControl.test.tsx` (unlinked row,
unsure row preselected, Not graded); `CourseGrades.model.test.tsx` (real engine, mocked queries: a
saved scenario restores after remount, Reset deletes, a link turns a muted part on). Grep
assertions as tests: no `.from('assignments' | 'assignment_progress' | 'bb_gradebook' |
'grading_schemes' | 'grade_components')` followed by `insert|update|upsert|delete` in files this
phase adds; no `service_role` / `sb_secret` in `web/src`.

**SQL tests** (`db/tests/phase10b_*.sql`, rolled back against prod): anon sees 0 rows of both
tables and three views; a non-owner uid sees 0; the check constraints refuse a string score and a
negative score; the trigger refuses a component from another course and accepts a GEO recitation
column linked to a lecture component; `v_grade_model_items` row count = item + attendance latest
columns + placeholders, and an override flips `link_source` / `link_confidence`;
`v_grade_model_total.bb_running = true` for IST.323; `v_gradebook_history` = 5 changed columns;
no `pg_proc.prosrc` outside 057/058 references `grade_scenarios` or `grade_column_links`.

### Engine tests (W-19, `web/test/grade-model/`)

* **L1** one table-driven file per aggregation, incl. IST.323 `final_project` children, the
  placeholder-drop rule, muting, and the order of checks.
* **L2** property suite (`fast-check`, ≥ 200 runs, seed printed on failure, `FC_SEED` honoured):
  monotone in every score and in `r`; `0 ≤ pct ≤ best case`, above 100 only via extra credit;
  drop-lowest never lowers when a score rises; `rank_weighted` invariant under exam order and
  weights summing to `cap`; muting one component never changes another component's result; same
  input → deep-equal output with a deep-frozen input; the scenario never changes `agreement`.
* **L3** fixtures `fixtures/<course>.json` for ECN.304, GEO.103 (lecture + recitation items),
  IST.323, IST.352, IST.466, IST.471 at three states (start / mid / all graded), hand-computed
  expected results with the derivation written in the fixture; the live 2026-09-16 state of every
  course reproduces the "What the answers mean on screen today" table.
* **L4** agreement: every computed fixture with a Blackboard total agrees or lists a reason; no
  fixture reaches `unexplained`; the internal graded-so-far over IST.323's live 9/14 and 9/16 rows
  (participation set aside) equals Blackboard's **5.0** and **14.8**; an IST.323 fixture with
  participation scored agrees end to end.
* **L5** solver round-trip on ECN.304 (`rank_weighted`, participation scored) and GEO reading
  quizzes (`average_drop_lowest`, manual parts scored): `projection(averageNeeded) ≥ target`;
  `unreachable`, `secured` and `no_remaining_work` fixtures.
* Coverage ≥ 90 % lines on `web/src/lib/grade-model/`.

### Honesty rules

Every number bb2dash computes sits inside the "Our model" container; Blackboard's figures keep
10a's labels and `seen_at`. A what-if value is never styled as a Blackboard score, and a standing
that uses one says so. `null` is `—`, never 0. A not-computed course names why; a left-out part is
named. The agreement uses real scores only. Nothing is rounded before display.

## Seams (frozen)

* **10a** owns the mirror and its five views; 10b reads them and adds three views of its own.
  `GradebookTable` and `CourseGradeCard` are extended through optional props; their 10a tests
  keep passing unchanged.
* **V-1 (stubbed)** owns `grading_schemes`, `grade_components`, `assignments.component_id`;
  10b reads them and never writes. `grade_column_links` is Stack's override layer that V-1
  folds in later.
* **Phase 9** owns the transform; 10b adds no stage and edits no transform function.
* **Phase 11b** (not started) owns 067–072 and the planner routes; no shared file.

## Definition of done

Source: Stack's answers (`70_MVP_INDEX.md` §1.4 and the 2026-09-16 answers above) + research
`research/73_RESEARCH_phase10b_grade_model.md` §5, amended for V-1's stub.

- [ ] **Stack's acceptance script (on the preview):** (1) `/grades`: IST.323 shows Blackboard's
      14.8 / 104 and "Model not computed — Class Participation not scored yet"; IST.471 "graded
      qualitatively"; IST.352 and GEO 103 name their unscored hand-graded parts; (2) make one course
      compute the honest way — link ECN.304's Attendance column to Participation if that is what
      the syllabus means, or type a what-if value on IST.466 — and see "Our model" with its
      explanation and the zeros / best-case line; (3) type a hypothetical on an ungraded item, watch
      the standing move, reload, it is still there, revert the row, then Reset scenario; (4) pick a
      target letter and read the average needed, then one out of reach and one already secured;
      (5) ECN.304: percentage hypotheticals on Exam 1 and Exam 2 (placeholder rows, amendment A1)
      re-order the rank weights and move the standing; (6) IST.466: Major Cases shows as left out, confirm both major-case
      links with the picker and see Major Cases counted; (7) open a row's history. All seven ticked.
- [ ] All live methods implemented (`weighted_pct`, `points` with `graded_out_of` and extra
      credit, `rank_weighted`, `average_drop_lowest`, `normalized`, `sum` with children, `single`,
      `average`, `manual` from linked scores); `qualitative` / `unknown` / unscored `manual` return
      `not_computable`, never 0.
- [ ] L1–L5 green; coverage ≥ 90 % on the engine.
- [ ] **Agreement**: the engine reproduces IST.323's live 5.0 and 14.8; every computed fixture
      agrees or names a reason; the reason renders from the enum, never free text. On screen it
      appears once IST.323's participation posts.
- [ ] Blackboard's running-total setting is read from the formula (`v_grade_model_total.bb_running`),
      never guessed; the agreement uses it.
- [ ] Solver returns `needed`, `unreachable`, `secured`, `no_remaining_work`, `not_computable`;
      round-trip holds.
- [ ] Unsure links mute their part (counted items only); the part is named; a picker override
      un-mutes it.
- [ ] What-if writes only `grade_scenarios` (one row per course, survives reload); links write only
      `grade_column_links`; grep assertions green; SQL shows syncs never reference either table.
- [ ] Every computed figure sits in the "Our model" container; RTL assertion.
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
| 4 | `average_drop_lowest`, `rank_weighted`, `manual`, placeholders, muting | L1 | — | W-19 |
| 5 | `projectCourse`: order of checks, standings, letters | L1 + L3 | "IST.471 shows only Blackboard's number" | W-19 |
| 6 | Property suite | L2 green, seed printed on a forced failure | — | W-19 |
| 7 | Agreement + delta reasons | L4; IST.323 5.0 and 14.8 reproduced | "the model and Blackboard agree, or it tells me why not" | W-19 |
| 8 | Solver | L5 | "I pick A- and see what I need" | W-19 |
| 9 | 057 tables + trigger + RLS | SQL tests | — | W-20 |
| 10 | 058 views | SQL tests; counts vs live | — | W-20 |
| 11 | `queries.grade-model.ts` + adapter | vitest | — | W-20 |
| 12 | `ModelStanding` on both screens | RTL | "every course says Our model or why not" | W-20 |
| 13 | What-if cells, placeholders, persistence, Reset | RTL + remount test | "I type a score, reload, it is still there" | W-20 |
| 14 | `TargetSolver` | RTL five states | — | W-20 |
| 15 | `LinkColumnControl` | RTL + SQL trigger test | "I confirm a link and the part is counted" | W-20 |
| 16 | `ScoreHistory` | RTL three runs | "I see when a score changed" | W-20 |
| 17 | Integrate, regenerate types, live smoke, gates, docs, preview | SOP list | — | PM |
| 18 | **Stack's acceptance script** | — | the seven steps above | Stack |

## Out of scope

Grades on Home cards; multiple named scenarios; an assumed score for a hand-graded part; any write
to V-1's tables; confirming a placeholder's link; late-penalty or curve modelling;
professor-facing anything; a sparkline.

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

## Round 1b — Contract amendments from the build (PM, 2026-09-16)

W-20 finished first (migrations 057 `20260916202757`, 058 `20260916202956`, md5s match prod;
`68a_W20_VERIFICATION.md`) and reported three things the frozen Contract could not deliver on
today's data. `types.ts` and `labels.ts` do not change.

| # | Finding | Amendment | Owner | Check |
|---|---|---|---|---|
| A1 | 21 placeholders have **no `possible`** (V-1's data): ECN.304 Exams 1–3, GEO 103 exams, IST.323 Quizzes 4–10, … They are bookkeeping, so they get no what-if cell and acceptance step 5 has nothing to type in | A placeholder with `possible` null, a **`confirmed`** link, and a component whose aggregation uses fractions only (`single`, `average`, `average_drop_lowest`, `rank_weighted`, `normalized`) takes a what-if **as a percentage**: the scenario stores `v` (`0 ≤ v ≤ 100`) under its key and the engine uses `f = v / 100`. Without a value it stays bookkeeping (the aggregation's slots already cover it). `sum` placeholders with no points (IST.323 `fp-packet`, IST.352 `term-project`) and unconfirmed series placeholders stay bookkeeping | W-19 engine, W-20 cell ("what if __ %") | L1: ECN.304 exams 90 / 70 typed → rank order and standing as hand-computed; `sum` placeholder with no points ignores a scenario value; RTL: percent cell on a pointless confirmed placeholder only, validation 0–100 |
| A2 | The picker showed only on **scored** unlinked columns: IST.323's proposal column (tied to two rows) and IST.352 Project #2A / #3 cannot be linked before they are scored, so no what-if reaches them | The picker shows on every gradebook column with `possible > 0` that is **unlinked (scored or not)**, has an **unsure** link, or already has an **override** | W-20 | RTL: unscored unlinked column shows the picker; zero-point column does not |
| A3 | A part stays left out while **any** counted item is unsure; IST.466 has two unsure major-case columns | Acceptance step (6) reads "confirm **both** major-case links and see Major Cases counted" | PM | brief text |

Accepted as W-20 built them (the Contract was silent): `/grades` model data in
`GradesModelScreen.tsx`; "Not graded" is an override and counts as confirmed; the picker also on
columns Stack already linked, so a choice can be undone; a "Confirm link" button for an unsure
link; a link write sends both `component_id` and `excluded`; 057 adds an index on `component_id`
and `updated_at` triggers; display formatting and control labels in `grade-model-format.ts`.

## Round 1c — engine readings accepted at integration (PM, 2026-09-16)

W-19 finished (`4e2ea83`; 970 tests on its branch, engine coverage 100 % lines / 96.5 %
branches; IST.323 graded-so-far 5.0 and 14.8 exactly; the live table above reproduced). Its
calls where the Contract was silent or wrong, all accepted:

1. **Contract correction:** the item fraction is `score / possible`. `normalize_to` is the
   component's target (IST.323 quizzes: `normalize_to = 5.00` = its points), not a per-item
   denominator; reading it per item gave quizzes 10 instead of 5.0. The Semantics line
   `f = score / (normalizeTo ?? possible)` is superseded.
2. The solver leaves ungraded extra credit at 0 (never required work).
3. Once every exam is graded, `rank_weighted` applies its rank weights in graded-so-far too.
4. A points letter scale converts with `gradedOutOf ?? totalPoints` (the full-course total the
   thresholds were written for), not the muted-reduced denominator.
5. The 0.5 agreement band scales with a points course's total; a course that computes only
   through what-if values shows no agreement (real scores only).
6. Out-of-range scenario values are ignored, and so is any value on a `manual` part.
7. `nothing_graded` also covers a course where only extra credit is scored.
8. Children of a muted parent are muted.
9. A letter not on the scale is a caller error (`RangeError`); `grade-model-run.ts` turns it into
   an error state and falls back to a letter on the scale, so a stale saved target cannot break
   the tab.

Integration fix: `CourseGrades.model.test.tsx` put its synthetic percent placeholder in the same
single-item part as a real column; the real engine correctly drops a placeholder in excess of
`count_expected`, so the test now gives it a part of its own. Known limit (V-1 data, not code):
IST.323's 13-point proposal column bundles the 11-point proposal and the 2-point final log, so
once it is graded and linked the agreement reads `unexplained` — recorded in STATUS.

## Integration (PM)

Merge W-19, then W-20; regenerate `database.types.ts`; `npm ci` (new devDependency); typecheck +
build + tests in `web/` and `mcp-server/`; live smoke on prod (every course shows the state in the
"on screen today" table; IST.471 not computable); `/code-review main high` + `/security-review`;
STATUS, DECISIONS, ORCHESTRATOR updated; Vercel preview; Stack's acceptance script; stop at the PR.
