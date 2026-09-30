# 96b — V-1 grading validation: ECN.304

Sitting date: 2026-09-29 · Export read: `96a_GRADING_SCHEMA_EXPORT_2026-09-29.md` · Syllabus: `bb_file:23` (`ECN 304 F26 Syllabus_M001.pdf`; grading on page 2 = unit 2, AI policy on page 3 = unit 3)

The corpus holds no other ECN.304 grading material. The Blackboard announcements behind the quiz 2 and quiz 3 point values (`_1668519_1`, `_1670694_1`) are not in it. Quotes from the PDF collapse its column spacing (e.g. "Participation            10%" is quoted as "Participation 10%").

Export §6 questions for this course: Q1 (ECN.304 attendance) is rows ECN.304-15 and -16; Q8 (quiz averaging) is row ECN.304-08 and ECN.304-Q1; Q10 (rank weights) is rows ECN.304-11 to -13.

## Amendments (PM, 2026-09-29)

* ECN.304-02 (letter_scale stored/value: the human list → prod's exact `letter_scale::text`, what the recheck returns).
* ECN.304-03 (ai_policy stored/value → null: prod's `grading_schemes.ai_policy` is null since migration 119_strip_ai_policy_passages, 2026-09-29).
* ECN.304-04 (stored/value → false/true: the recheck is a `like` test; the notes text moved to `why`).
* ECN.304-26 (stored/value → false/true: the recheck is a `like` test; the notes text moved to `why`).
* ECN.304-15 (note → "Attendance is posted regularly and counts as posted (Stack, 2026-09-29).", recheck follows it; no link): Stack's post-sitting answer; stored/value → false/true, the recheck being a `like` test.

## Reconciliation table

| id | target | field | stored | materials say | citation | verdict | call | why |
|---|---|---|---|---|---|---|---|---|
| ECN.304-01 | grading_schemes ECN.304 | method | weighted_pct | five weighted tasks totalling 100% | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-02 | grading_schemes ECN.304 | letter_scale | A 93 … C- 70, D 60, F 0 (10 steps) | same 10 cut-offs | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-03 | grading_schemes ECN.304 | ai_policy | AI only for reviewing course materials; else none unless stated | same | `bb_file:23#unit:3` | matches | keep | — |
| ECN.304-04 | grading_schemes ECN.304 | notes | grade formula; rank weighting; lowest quiz dropped | also: exams can't be made up without an urgent, documented reason | `bb_file:23#unit:2` | materials_say_more | change_to (notes + make-up rule) | Stack: note. |
| ECN.304-05 | grade_components ECN.304 / participation | weight_pct | 10.00 | Participation 10% | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-06 | grade_components ECN.304 / quizzes | weight_pct | 15.00 | Average Quiz Grade 15% | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-07 | grade_components ECN.304 / quizzes | drop_lowest | 1 | lowest quiz grade dropped | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-08 | grade_components ECN.304 / quizzes | aggregation | average_drop_lowest | average quiz grade after dropping the lowest | `bb_file:23#unit:2` | matches | keep | Stack Q1: per-quiz percentages, lowest dropped, the average is the share of the 15% earned. |
| ECN.304-09 | grade_components ECN.304 / quizzes | count_expected | — | quiz count not stated | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-10 | grade_components ECN.304 / exams | weight_pct | 75.00 | 30 + 25 + 20 | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-11 | grade_components ECN.304 / exams | rank_weights | [30, 25, 20] | highest 30%, median 25%, lowest 20% | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-12 | grade_components ECN.304 / exams | count_expected | 3 | 3 non-cumulative exams | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-13 | grade_components ECN.304 / exams | drop_lowest | 0 | lowest exam weighted 20%, not dropped | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-14 | grading_schemes ECN.304 | check: top-level weights = 100 | 100 | 10 + 15 + 75 = 100 | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-15 | grade_components ECN.304 / participation | notes | attend and participate; single Attendance column | attendance expected every class; the column-to-grade link isn't stated | `bb_file:23#unit:2` | materials_say_more | change_to (notes: counts as posted) | Stack 2026-09-29: one of the few classes whose attendance is updated regularly; it counts right away, as posted. No link. |
| ECN.304-16 | assignments ECN.304/attendance | component_id / points_possible | 1 / 100.00 | attendance is part of participation | `bb_file:23#unit:2` | not_in_materials | keep | Stack: leave as 0 but don't count towards the grade until attendance has actually been uploaded. |
| ECN.304-17 | assignments ECN.304/exam-1 | component_id | 3 | one of 3 exams | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-18 | assignments ECN.304/exam-2 | component_id | 3 | one of 3 exams | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-19 | assignments ECN.304/exam-3 | component_id | 3 | one of 3 exams | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-20 | assignments ECN.304/quiz-01 | component_id / points_possible | 2 / 10.00 | quiz sizes not stated | — | not_in_materials | keep | Stack: Blackboard is source. |
| ECN.304-21 | assignments ECN.304/quiz-02 | component_id / points_possible | 2 / 8.00 | quiz sizes not stated | — | not_in_materials | keep | Stack: Blackboard is source. |
| ECN.304-22 | assignments ECN.304/quiz-3 | component_id / points_possible | 2 / 7.00 | quiz sizes not stated | — | not_in_materials | keep | Stack: Blackboard is source. |
| ECN.304-23 | assignments ECN.304/quiz-4 | component_id / points_possible | 2 / 10.00 | quiz sizes not stated | — | not_in_materials | keep | Stack: Blackboard is source. |
| ECN.304-24 | assignments ECN.304/quiz-series | component_id | 2 (no points, inferred) | a placeholder, not a quiz | `bb_file:23#unit:2` | not_in_materials | mark_ungraded | Stack: the placeholder can likely be dropped now that actual quizzes are uploaded. |
| ECN.304-25 | grade_column_links ECN.304 / _3621234_1 | component_id | 2 | Quiz 4 is a quiz | `bb_file:23#unit:2` | matches | keep | — |
| ECN.304-26 | grade_components ECN.304 / exams | notes | rank weights; three exams | rank weights need all three exams | `bb_file:23#unit:2` | matches | change_to (notes + provisional rule) | Stack Q2 (a): not yet graded until Exam 1; average of taken exams fills 75% until all three are in. |

## Questions

* **id:** ECN.304-Q1
* **question:** Is the "average quiz grade" an average of per-quiz percentages, or points earned over points possible? The quizzes differ in size (10, 8, 7, 10).
* **what it blocks:** ECN.304-07, ECN.304-08, ECN.304-20 to ECN.304-24
* **evidence found:** `bb_file:23#unit:2` "Lowest quiz grade will be dropped in the calculation of average quiz grade"
* **options:** (a) average of per-quiz percentages, lowest percentage dropped; (b) points earned over points possible, after dropping the lowest-percentage quiz
* **recommendation:** (a); the syllabus averages grades, not points
* **default if unanswered:** (a), `tentative`
* **Stack's answer:** Quiz grades will be looked at by percentage, with the average (after the drops) calculating what percentage of the 15% for quizzes I actually earn towards my final grade.
* **date:** 2026-09-29
* **DECISIONS row?:** yes

* **id:** ECN.304-Q2
* **question:** How are the rank-weighted exams shown before all three are taken?
* **what it blocks:** ECN.304-11, ECN.304-26
* **evidence found:** `bb_file:23#unit:2` "The highest exam grade will be weighted 30%, the median grade 25%"; the rule needs three grades
* **options:** (a) not yet graded until Exam 1 posts; then the average of the exams taken fills 75% until all three are in, when 30/25/20 applies; (b) not graded until all three are in, standing computed over the other 25%
* **recommendation:** (a)
* **default if unanswered:** (a)
* **Stack's answer:** a.
* **date:** 2026-09-29
* **DECISIONS row?:** yes

## Machine block

```yaml
- id: ECN.304-01
  target:
    table: grading_schemes
    key: {course_id: "ECN.304"}
    field: method
  stored: weighted_pct
  materials: "Five weighted tasks totalling 100%"
  citation: "bb_file:23#unit:2"
  quote: "Your course grade is based on your performance on the following tasks"
  verdict: matches
  call: keep
  value: weighted_pct
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus grades by percentage weights."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select method from grading_schemes where course_id = 'ECN.304'"
- id: ECN.304-02
  target:
    table: grading_schemes
    key: {course_id: "ECN.304"}
    field: letter_scale
  stored: "[{\"min\": 93, \"letter\": \"A\"}, {\"min\": 90, \"letter\": \"A-\"}, {\"min\": 87, \"letter\": \"B+\"}, {\"min\": 83, \"letter\": \"B\"}, {\"min\": 80, \"letter\": \"B-\"}, {\"min\": 77, \"letter\": \"C+\"}, {\"min\": 73, \"letter\": \"C\"}, {\"min\": 70, \"letter\": \"C-\"}, {\"min\": 60, \"letter\": \"D\"}, {\"min\": 0, \"letter\": \"F\"}]"
  materials: "A >=93, A- 90, B+ 87, B 83, B- 80, C+ 77, C 73, C- 70, D 60-69.9, F <60"
  citation: "bb_file:23#unit:2"
  quote: "D 60% – 69.9%"
  verdict: matches
  call: keep
  value: "[{\"min\": 93, \"letter\": \"A\"}, {\"min\": 90, \"letter\": \"A-\"}, {\"min\": 87, \"letter\": \"B+\"}, {\"min\": 83, \"letter\": \"B\"}, {\"min\": 80, \"letter\": \"B-\"}, {\"min\": 77, \"letter\": \"C+\"}, {\"min\": 73, \"letter\": \"C\"}, {\"min\": 70, \"letter\": \"C-\"}, {\"min\": 60, \"letter\": \"D\"}, {\"min\": 0, \"letter\": \"F\"}]"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "All ten cut-offs match the syllabus."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select letter_scale::text from grading_schemes where course_id = 'ECN.304'"
- id: ECN.304-03
  target:
    table: grading_schemes
    key: {course_id: "ECN.304"}
    field: ai_policy
  stored: null
  materials: "AI permitted for reviewing course materials; none otherwise unless an item says so"
  citation: "bb_file:23#unit:3"
  quote: "artificial intelligence is permitted on the following: reviewing course materials"
  verdict: matches
  call: keep
  value: null
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus states the same policy."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select ai_policy from grading_schemes where course_id = 'ECN.304'"
- id: ECN.304-04
  target:
    table: grading_schemes
    key: {course_id: "ECN.304"}
    field: notes
  stored: false
  materials: "Exams may not be made up without an urgent, legitimate, documented reason"
  citation: "bb_file:23#unit:2"
  quote: "Exams may not be made up unless an urgent and legitimate reason"
  verdict: materials_say_more
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "Note. Notes text for 106: Existing notes + 'Exam make-up only with an urgent, legitimate, documented reason (note only, not computed).'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%Exam make-up only with an urgent, legitimate, documented reason%' from grading_schemes where course_id = 'ECN.304'"
- id: ECN.304-05
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: participation}
    field: weight_pct
  stored: 10.00
  materials: "Participation 10%"
  citation: "bb_file:23#unit:2"
  quote: "Participation 10%"
  verdict: matches
  call: keep
  value: 10.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'ECN.304' and code = 'participation'"
- id: ECN.304-06
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: quizzes}
    field: weight_pct
  stored: 15.00
  materials: "Average Quiz Grade 15%"
  citation: "bb_file:23#unit:2"
  quote: "Average Quiz Grade 15%"
  verdict: matches
  call: keep
  value: 15.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'ECN.304' and code = 'quizzes'"
- id: ECN.304-07
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: quizzes}
    field: drop_lowest
  stored: 1
  materials: "Lowest quiz grade dropped"
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
- id: ECN.304-08
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: quizzes}
    field: aggregation
  stored: average_drop_lowest
  materials: "Average quiz grade after dropping the lowest"
  citation: "bb_file:23#unit:2"
  quote: "Lowest quiz grade will be dropped in the calculation of average quiz grade"
  verdict: matches
  call: keep
  value: average_drop_lowest
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Quiz grades will be looked at by percentage, with the average (after the drops) calculating what percentage of the 15% for quizzes I actually earn towards my final grade."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select aggregation from grade_components where course_id = 'ECN.304' and code = 'quizzes'"
- id: ECN.304-09
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: quizzes}
    field: count_expected
  stored: null
  materials: "Quizzes throughout the semester; count not stated"
  citation: "bb_file:23#unit:2"
  quote: "will be administered throughout the semester"
  verdict: matches
  call: keep
  value: null
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus gives no count, and none is stored."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count_expected from grade_components where course_id = 'ECN.304' and code = 'quizzes'"
- id: ECN.304-10
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: exams}
    field: weight_pct
  stored: 75.00
  materials: "Highest 30% + median 25% + lowest 20%"
  citation: "bb_file:23#unit:2"
  quote: "Highest Exam Grade 30%"
  verdict: matches
  call: keep
  value: 75.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The three exam weights sum to 75."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'ECN.304' and code = 'exams'"
- id: ECN.304-11
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: exams}
    field: rank_weights
  stored: "[30, 25, 20]"
  materials: "Highest 30%, median 25%, lowest 20%"
  citation: "bb_file:23#unit:2"
  quote: "The highest exam grade will be weighted 30%, the median grade 25%"
  verdict: matches
  call: keep
  value: "[30, 25, 20]"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Export Q10: the rank weights are confirmed by the syllabus."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select rank_weights::text from grade_components where course_id = 'ECN.304' and code = 'exams'"
- id: ECN.304-12
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: exams}
    field: count_expected
  stored: 3
  materials: "3 non-cumulative exams"
  citation: "bb_file:23#unit:2"
  quote: "There will be 3 non-cumulative exams."
  verdict: matches
  call: keep
  value: 3
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus count."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count_expected from grade_components where course_id = 'ECN.304' and code = 'exams'"
- id: ECN.304-13
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: exams}
    field: drop_lowest
  stored: 0
  materials: "The lowest exam is weighted 20%, not dropped"
  citation: "bb_file:23#unit:2"
  quote: "and the lowest grade 20%."
  verdict: matches
  call: keep
  value: 0
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Export Q10: no exam is dropped."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select drop_lowest from grade_components where course_id = 'ECN.304' and code = 'exams'"
- id: ECN.304-14
  target:
    table: grading_schemes
    key: {course_id: "ECN.304"}
    field: "check: top-level weights sum to 100"
  stored: 100
  materials: "10 + 15 + 30 + 25 + 20 = 100"
  citation: "bb_file:23#unit:2"
  quote: "Lowest Exam Grade 20%"
  verdict: matches
  call: keep
  value: 100
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The weights sum to 100."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select sum(weight_pct) from grade_components where course_id = 'ECN.304' and parent_id is null"
- id: ECN.304-15
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: participation}
    field: notes
  stored: false
  materials: "Attendance expected every class; how the column becomes the grade is not stated"
  citation: "bb_file:23#unit:2"
  quote: "I expect everyone to attend and actively participate in every class."
  verdict: materials_say_more
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "Stack 2026-09-29: \"This is one of the few classes that has attendance updated regularly. For this class it can count right away.\" Notes text for 106: Existing notes + 'Attendance is posted regularly and counts as posted (Stack, 2026-09-29).'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%Attendance is posted regularly and counts as posted%' from grade_components where course_id = 'ECN.304' and code = 'participation'"
- id: ECN.304-16
  target:
    table: assignments
    key: {id: "ECN.304/attendance"}
    field: "component_id / points_possible"
  stored: "1 / 100.00"
  materials: "Attendance is part of participation; the column link itself is not stated"
  citation: "bb_file:23#unit:2"
  quote: "I expect everyone to attend and actively participate in every class."
  verdict: not_in_materials
  call: keep
  value: "1 / 100.00"
  reason_code: STACK_OVERRIDE
  why: "Leave as 0 but don't count towards the grade until attendance has actually been uploaded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'ECN.304/attendance'"
- id: ECN.304-17
  target:
    table: assignments
    key: {id: "ECN.304/exam-1"}
    field: component_id
  stored: 3
  materials: "One of 3 exams"
  citation: "bb_file:23#unit:2"
  quote: "There will be 3 non-cumulative exams."
  verdict: matches
  call: keep
  value: 3
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to exams."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'ECN.304/exam-1'"
- id: ECN.304-18
  target:
    table: assignments
    key: {id: "ECN.304/exam-2"}
    field: component_id
  stored: 3
  materials: "One of 3 exams"
  citation: "bb_file:23#unit:2"
  quote: "There will be 3 non-cumulative exams."
  verdict: matches
  call: keep
  value: 3
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to exams."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'ECN.304/exam-2'"
- id: ECN.304-19
  target:
    table: assignments
    key: {id: "ECN.304/exam-3"}
    field: component_id
  stored: 3
  materials: "One of 3 exams"
  citation: "bb_file:23#unit:2"
  quote: "There will be 3 non-cumulative exams."
  verdict: matches
  call: keep
  value: 3
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to exams."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'ECN.304/exam-3'"
- id: ECN.304-20
  target:
    table: assignments
    key: {id: "ECN.304/quiz-01"}
    field: "component_id / points_possible"
  stored: "2 / 10.00"
  materials: "not in materials"
  citation: null
  quote: null
  verdict: not_in_materials
  call: keep
  value: "2 / 10.00"
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Blackboard is source."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'ECN.304/quiz-01'"
- id: ECN.304-21
  target:
    table: assignments
    key: {id: "ECN.304/quiz-02"}
    field: "component_id / points_possible"
  stored: "2 / 8.00"
  materials: "not in materials"
  citation: null
  quote: null
  verdict: not_in_materials
  call: keep
  value: "2 / 8.00"
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Blackboard is source."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'ECN.304/quiz-02'"
- id: ECN.304-22
  target:
    table: assignments
    key: {id: "ECN.304/quiz-3"}
    field: "component_id / points_possible"
  stored: "2 / 7.00"
  materials: "not in materials"
  citation: null
  quote: null
  verdict: not_in_materials
  call: keep
  value: "2 / 7.00"
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Blackboard is source."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'ECN.304/quiz-3'"
- id: ECN.304-23
  target:
    table: assignments
    key: {id: "ECN.304/quiz-4"}
    field: "component_id / points_possible"
  stored: "2 / 10.00"
  materials: "not in materials"
  citation: null
  quote: null
  verdict: not_in_materials
  call: keep
  value: "2 / 10.00"
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Blackboard is source."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'ECN.304/quiz-4'"
- id: ECN.304-24
  target:
    table: assignments
    key: {id: "ECN.304/quiz-series"}
    field: component_id
  stored: 2
  materials: "A series placeholder with no points, not a quiz"
  citation: "bb_file:23#unit:2"
  quote: "will be administered throughout the semester"
  verdict: not_in_materials
  call: mark_ungraded
  value: null
  reason_code: STACK_OVERRIDE
  why: "Quiz series placeholder can likely be dropped now that there are actual quizzes uploaded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'ECN.304/quiz-series'"
- id: ECN.304-25
  target:
    table: grade_column_links
    key: {course_id: "ECN.304", column_id: "_3621234_1"}
    field: component_id
  stored: 2
  materials: "Quiz 4 is a quiz"
  citation: "bb_file:23#unit:2"
  quote: "Average Quiz Grade 15%"
  verdict: matches
  call: keep
  value: 2
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The column is a quiz."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from grade_column_links where course_id = 'ECN.304' and column_id = '_3621234_1'"
- id: ECN.304-26
  target:
    table: grade_components
    key: {course_id: "ECN.304", code: exams}
    field: notes
  stored: false
  materials: "Rank weights need all three exam grades"
  citation: "bb_file:23#unit:2"
  quote: "The highest exam grade will be weighted 30%, the median grade 25%"
  verdict: matches
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "a. Notes text for 106: Existing notes + 'Until all three exams are graded: not yet graded before Exam 1; then the average of the exams taken fills the full 75 percent.'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%the average of the exams taken fills the full 75 percent%' from grade_components where course_id = 'ECN.304' and code = 'exams'"
```
