# 96c — V-1 verdict file template (Phase 16)

The shape of every `docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_<course_id>.md`.
Supersedes brief 63's reconciliation table and its five-field questions row (DECISIONS 2026-09-29,
Phase 16, P-6 and P-75). Method: `docs/planning/sprint-1-hub/briefs/63_GRADING_VALIDATION.md`.
The claim under test is the newest `docs/planning/sprint-2/evidence/96a_GRADING_SCHEMA_EXPORT_<date>.md`.

Rules the confined session follows:

* Decide from the materials only. If they are silent, the verdict is `not_in_materials`; never fill a
  gap from general knowledge.
* Cite every document-backed row as `bb_file:<id>#unit:<n>` (the `file_id` and unit number that
  `search_materials` / `get_material_text` return) plus a quote under 15 words. No other citation form.
* A call Stack makes from his own knowledge is `reason_code: STACK_OVERRIDE`, `decided_by: Stack`,
  with his why in his words; it is written `confirmed`.
* Grading only: schemes, components, assignment links, points. Dates and file classification are not
  V-1's.
* Every row that is not `matches` needs `call`, `reason_code`, `why` and `decided_on`. A `differs` row
  without a call is an error.
* `recheck` is one SELECT returning one value, the value the row should hold once 106 is applied
  (for `keep`, the value it holds now). Nothing but a SELECT.

Closed sets:

* `verdict`: `matches` · `differs` · `not_in_materials` · `materials_say_more`
* `call`: `keep` · `change_to` · `ask_professor` · `mark_ungraded`
* `reason_code`: `SYLLABUS_AUTHORITATIVE` · `BLACKBOARD_AUTHORITATIVE` · `SUPERSEDED_DOC` ·
  `BOOKKEEPING_COLUMN` · `ROLLS_UP_TO_PARENT` · `NOT_IN_MATERIALS` · `OCR_UNREADABLE` ·
  `PROF_TO_CONFIRM` · `ROUNDING_TOLERANCE` · `STACK_OVERRIDE`
* `confidence_after`: `confirmed` · `tentative`
* `target.table`: `grading_schemes` (key: course_id) · `grade_components` (key: course_id + code) ·
  `assignments` (key: id) · `grade_column_links` (key: course_id + column_id)

---

# 96b — V-1 grading validation: <COURSE>

Sitting date: YYYY-MM-DD · Export read: `96a_GRADING_SCHEMA_EXPORT_<date>.md` · Syllabus: `bb_file:<id>`

## Reconciliation table

| id | target | field | stored | materials say | citation | verdict | call | why |
|---|---|---|---|---|---|---|---|---|
| ECN.304-01 | grade_components ECN.304 / quizzes | drop_lowest | 1 | lowest quiz dropped | `bb_file:23#unit:2` | matches | keep | — |

## Questions

One block per question the materials cannot settle, grading only (research 75's ten fields).

* **id:** ECN.304-Q1
* **question:** <what only Stack or the professor can answer>
* **what it blocks:** <row ids>
* **evidence found:** <citations, or "none in materials">
* **options:** <two or three>
* **recommendation:** <one option, with why>
* **default if unanswered:** <what 106 does if no answer: usually leave `tentative`>
* **Stack's answer:** <his words>
* **date:** YYYY-MM-DD
* **DECISIONS row?:** yes / no

## Machine block

```yaml
- id: ECN.304-01
  target:
    table: grade_components
    key: {course_id: ECN.304, code: quizzes}
    field: drop_lowest
  stored: 1
  materials: "Lowest quiz grade will be dropped"
  citation: "bb_file:23#unit:2"
  quote: "Lowest quiz grade will be dropped in the calculation of average quiz grade"
  verdict: matches
  call: keep
  value: 1
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus states the drop rule the component already stores."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select drop_lowest from grade_components where course_id = 'ECN.304' and code = 'quizzes'"
```
