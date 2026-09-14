# R-V1 research — grading schema validation (V-1)

Opus researcher, 2026-09-14, ~30 min, read-only. Brief: `70_MVP_INDEX.md` §2. Stream:
`63_GRADING_VALIDATION.md`; claim under test: `64_GRADING_SCHEMA_EXPORT_2026-09-14.md`.

## 1. Comparables / references

1. **Great Expectations** — an *Expectation Suite* is a versioned JSON file of named assertions; a
   *Checkpoint* runs it and emits Validation Results plus human-readable **Data Docs**. One
   artifact serves the machine re-run and the human review.
   [Checkpoint](https://docs.greatexpectations.io/docs/0.18/reference/learn/terms/checkpoint/) ·
   [Data Docs](https://docs.greatexpectations.io/docs/0.18/reference/learn/terms/data_docs/)
2. **dbt tests** — generic tests in YAML, *singular* tests as SQL returning the failing rows,
   contracts as schema enforcement. Our arithmetic invariants are singular tests.
   [docs](https://docs.getdbt.com/docs/build/data-tests)
3. **Soda Core (SodaCL)** — one YAML assertion per check, compiled to SQL against the live DB, run
   in CI on every PR with results posted back.
   [CI guide](https://docs.soda.io/soda-documentation/soda-v3/use-case-guides/quick-start-dev)
4. **Account-reconciliation SOP** — a log with *preparer* and *reviewer* sign-off, itemised
   *reconciling items* with cause, and a tamper-evident who/when/why against original evidence.
   [checklist](https://scryai.com/blog/account-reconciliation-review-checklist/) ·
   [audit trail](https://www.taxbatchpro.com/blog/bank-statement-audit-trail)
5. **Dual extraction + adjudication** (PRISMA/Cochrane; Label Studio review queues) — two passes,
   disagreements adjudicated and the resolution recorded, every exclusion shipped *with a reason*,
   low-confidence items routed to a human rather than auto-accepted.
   [UNC](https://guides.lib.unc.edu/systematic-reviews/extract-data) ·
   [Label Studio](https://docs.humansignal.com/guide/quality)
6. **Canvas / registrar gradebook QA** — the standing instruction is literally "make sure
   assignment group weights match the syllabus" and "the Total column reflects the calculation
   described in your syllabus". V-1's job, done by hand, every term.
   [Penn](https://infocanvas.upenn.edu/instructors/setting-up-the-gradebook/) ·
   [FSU](https://support.canvas.fsu.edu/kb/article/1110-canvas-gradebook-best-practices/)

## 2. Patterns to copy

**Verdict row = human table + machine block.** Keep `63`'s markdown table for reading; append to
each verdict file a YAML block of the same rows so a later automated pass can re-check without
re-reading prose (GE's suite-as-JSON + docs-as-HTML split):

    - id: IST.323-03
      target: {table: assignments, key: "IST.323/fp-proposal", field: points_possible}
      stored: 13
      materials: 11
      citation: {bb_file: 2, unit: 7, quote: "Proposal (11 pts)"}
      verdict: differs        # matches | differs | not_in_materials | materials_say_more
      call: change_to         # keep | change_to | ask_professor | mark_ungraded
      value: 11
      reason_code: SYLLABUS_AUTHORITATIVE
      why: "syllabus itemises 11/3/6; the BB column bundles the 2-pt log"
      decided_by: stack
      decided_on: 2026-09-1x
      confidence_after: confirmed
      recheck: "select points_possible from assignments where id='IST.323/fp-proposal'"

**Citation format:** `bb_file:<id>#unit:<n>` plus a verbatim quote short enough to re-find with
`search_materials`. A row whose verdict is not `not_in_materials` and carries no quote is invalid
— the "supporting evidence" rule from reconciliation practice.

**Questions block** (end of each verdict file; mirrors *reconciling items* / open-item aging):
`id · question · what it blocks · evidence found · options · session's recommendation · default if
unanswered · Stack's answer · date · DECISIONS row?`. That puts the §4 seed questions and the new
logic questions (no-total courses, the two OCR-only files, week/session classification) into one
queue with an owner and a state instead of a paragraph.

**Reason codes for "why"** (closed set, one per row, free text alongside):
`SYLLABUS_AUTHORITATIVE` · `BLACKBOARD_AUTHORITATIVE` · `SUPERSEDED_DOC` (the 120-pt rubric deck)
· `BOOKKEEPING_COLUMN` (BB column not part of the grade) · `ROLLS_UP_TO_PARENT` ·
`NOT_IN_MATERIALS` · `OCR_UNREADABLE` · `PROF_TO_CONFIRM` · `ROUNDING_TOLERANCE` ·
`STACK_OVERRIDE` (Stack's knowledge of the class, no document).

## 3. Anti-patterns

* **Rubber-stamping.** Every export row already says `confidence = confirmed` and none was ever
  checked — the failure reviewer sign-off exists to prevent. `confirmed` must become a dated,
  cited claim (`verified_on`), not a trusted enum.
* **Silent overrides.** A `STACK_OVERRIDE` with no `why` is unauditable. Cochrane's rule: the list
  of exclusions ships with reasons; ours is the list of assignments marked ungraded.
* **Unverifiable citations.** Paraphrase, a bare file name, or a quote absent from the corpus.
  Every quote must survive a `search_materials` round-trip.
* **Auto-accepting the confident half.** The risky rows are the ones that look fine (`matches`)
  but were never quoted. Sample them.
* **Sign-off drift.** Deciding in chat and never writing the row back; migration and repo file
  drifting apart (happened once — see the AUDIT doc).

## 4. Standard operating procedure

Make the pass a **checkpoint**, not a conversation. (a) Freeze the claim: the export is the
baseline, regenerable by the same query. (b) Express acceptance as **assertions on the export**,
GE/Soda style, one named check each — not prose. (c) Per course, the session proposes rows with
citations (preparer), Stack decides (reviewer), both recorded on the row. (d) Corrections become
one additive migration, then **the identical assertion set re-runs against prod** — a validation
pass that cannot be re-run after correction is not one. (e) Ship the assertions as
`db/tests/grading_invariants.sql` so later syncs re-check them for free.

## 5. Proposed DoD checklist

- [ ] `65_GRADING_VALIDATION_<course>.md` for all seven courses (GEO lecture + recitation may share one).
- [ ] Every row has a `verdict`; every non-`matches` row has `call`, `reason_code`, `why`, `decided_on`.
- [ ] `differs` rows with no Stack call = **0**; `ask_professor` rows listed in the summary with status.
- [ ] Every row whose verdict is not `not_in_materials` carries `bb_file` + unit + verbatim quote; spot-check 3 quotes per course via `search_materials`.
- [ ] Machine block in every verdict file, parses as YAML, row ids unique.
- [ ] All ten §4 export questions answered or explicitly `PROF_TO_CONFIRM`.
- [ ] Questions block per course; each question has Stack's answer or a recorded default, and a DECISIONS row where it sets policy.
- [ ] SQL: `weighted_pct` courses — parent `sum(weight_pct) = 100`.
- [ ] SQL: `points` courses — `sum(points) = grading_schemes.total_points`.
- [ ] SQL: child components sum to their parent.
- [ ] SQL: no assignment with `points_possible > 0` and `component_id is null` unless explicitly marked ungraded.
- [ ] SQL: every `assignments.component_id` resolves to a component of the *same* course.
- [ ] SQL: `confidence = 'confirmed'` implies `notes` holds a `bb_file:` citation and a verification date.
- [ ] Migration `0NN_grading_reconciliation.sql` applied to prod; repo file byte-identical.
- [ ] All invariants re-run green **after** the migration; output pasted in the PR.
- [ ] `65_GRADING_VALIDATION_SUMMARY.md`: counts per verdict, corrections as plain statements, open professor questions.

## 6. Open questions for Stack

1. YAML machine block, or is the markdown table enough? (The block is what makes a later automated re-check possible.)
2. `verified_on` — new column on `grading_schemes` / `grade_components`, or kept inside `notes`?
3. Rows you answer from memory: `STACK_OVERRIDE` + `confirmed`, or `tentative` until a document backs them?
4. Do `ask_professor` rows block V-1 sign-off, or ship `tentative` so 10b can start?
5. Invariants in `db/tests/*.sql` run by hand, or wired into sync/CI so they re-check every term?
