# V-1 verdict fixture (test data only)

Test fixture for `scripts/test_v1_recheck.py` (brief 96, task 6). The values are made up for the
tests and are **not** a record of any sitting; the real verdict files live in
`docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_<course>.md`.

## Reconciliation table

| # | field | stored | materials say | source (bb_file/unit) | verdict | Stack's call | why |
|---|---|---|---|---|---|---|---|
| FIX.101-01 | proposal points | 11 | 11 | bb_file:2#unit:7 | matches | keep | syllabus lists it |
| FIX.101-02 | proposal weight | — | — | bb_file:2#unit:7 | matches | — | — |
| FIX.101-03 | fp-proposal points_possible | 13 | 11 | bb_file:2#unit:7 | differs | change_to 11 | syllabus itemises 11 |
| FIX.101-04 | fp-proposal component | 18 | 18 | bb_file:2#unit:7 | matches | keep | — |
| FIX.101-05 | presentation-choice column | excluded | bookkeeping | bb_file:2#unit:9 | materials say more | mark ungraded | bookkeeping column |
| FIX.101-06 | scheme total_points | 104 | not in materials | — | not in materials | ask professor | — |
| FIX.101-07 | extra-credit points | 4 | not in materials | — | not in materials | keep | Stack's knowledge |

## Machine block

```yaml
- id: FIX.101-01
  target: {table: grade_components, key: {course_id: FIX.101, code: proposal}, field: points}
  stored: 11
  materials: 11
  citation: "bb_file:2#unit:7"
  quote: "Proposal (11 pts)"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "the syllabus lists 11 points"
  decided_by: stack
  decided_on: 2026-09-30
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'FIX.101' and code = 'proposal'"
- id: FIX.101-02
  target: {table: grade_components, key: {course_id: FIX.101, code: proposal}, field: weight_pct}
  stored: null
  materials: null
  citation: "bb_file:2#unit:7"
  quote: "Proposal (11 pts)"
  verdict: matches
- id: FIX.101-03
  target: {table: assignments, key: {id: FIX.101/fp-proposal}, field: points_possible}
  stored: 13
  materials: 11
  citation: "bb_file:2#unit:7"
  quote: "Proposal (11 pts)"
  verdict: differs
  call: change_to
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "the syllabus itemises 11 / 3 / 6"
  decided_by: stack
  decided_on: 2026-09-30
  confidence_after: confirmed
  recheck: "select points_possible from assignments where id = 'FIX.101/fp-proposal'"
- id: FIX.101-04
  target: {table: assignments, key: {id: FIX.101/fp-proposal}, field: component_id}
  stored: 18
  materials: 18
  citation: "bb_file:2#unit:7"
  quote: "Proposal (11 pts)"
  verdict: matches
  call: keep
  value: 18
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "linked to the proposal part"
  decided_by: stack
  decided_on: 2026-09-30
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'FIX.101/fp-proposal'"
- id: FIX.101-05
  target: {table: grade_column_links, key: {course_id: FIX.101, column_id: _3600000_1}, field: excluded}
  stored: true
  materials: "bookkeeping column"
  citation: "bb_file:2#unit:9"
  quote: "Presentation choice (not graded)"
  verdict: materials_say_more
  call: mark_ungraded
  value: true
  reason_code: BOOKKEEPING_COLUMN
  why: "the sign-up column carries no grade"
  decided_by: stack
  decided_on: 2026-09-30
  confidence_after: confirmed
  recheck: "select excluded from grade_column_links where course_id = 'FIX.101' and column_id = '_3600000_1'"
- id: FIX.101-06
  target: {table: grading_schemes, key: {course_id: FIX.101}, field: total_points}
  stored: 104
  materials: null
  verdict: not_in_materials
  call: ask_professor
  reason_code: PROF_TO_CONFIRM
  why: "the syllabus names no total"
  decided_by: stack
  decided_on: 2026-09-30
  confidence_after: tentative
- id: FIX.101-07
  target: {table: grade_components, key: {course_id: FIX.101, code: extra-credit}, field: points}
  stored: 4
  materials: null
  citation: STACK_OVERRIDE
  verdict: not_in_materials
  call: keep
  value: 4
  reason_code: STACK_OVERRIDE
  why: "the professor announced it in class"
  decided_by: stack
  decided_on: 2026-09-30
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'FIX.101' and code = 'extra-credit'"
```
