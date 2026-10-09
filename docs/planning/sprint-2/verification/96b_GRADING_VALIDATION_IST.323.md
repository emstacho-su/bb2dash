# 96b — V-1 grading validation: IST.323

Sitting date: 2026-09-29 · Export read: `96a_GRADING_SCHEMA_EXPORT_2026-09-29.md` · Syllabus: `bb_file:151` (`323Fall26V1.4.docx`, v1.4 of 9/22/26)

Other sources: `bb_file:8` (`CourseIntro-Fall2026-BA.pptx`), `bb_file:3` (`Student Policies and Services - syllabus appendix August 2026 .docx`, which carries the IST-323 M002 attendance policy and calls itself "an official part of this course's syllabus").

Export note: §6 says §1 resolves IST.323 to `bb_file:2`, but the §1 table printed `bb_file:151`. This file cites 151 throughout, as §6 directs.

Export §6 questions for this course: Q2 (participation link) is row IST.323-27; Q3 (fp-proposal 13 vs 11) is rows IST.323-24 and IST.323-25.

## Amendments (PM, 2026-09-29)

* IST.323-04 (letter_scale stored/value: the human list → prod's exact `letter_scale::text`, what the recheck returns).
* IST.323-08 (stored/value → false/true: the recheck is a `like` test; the notes text moved to `why`).
* IST.323-24 (change_to 11 → keep 13), IST.323-25 (change_to 14 → keep 18), new IST.323-57 (fp_proposal points 11 → 13) and IST.323-58 (fp_log points 3 → 1): Stack 2026-09-29 re-cut the parts instead (B-12); the Blackboard proposal column is 13 = proposal 11 + final log 2, the column stays 13 and linked to part 18, and Final Project stays 20.
* IST.323-15 and IST.323-16 (keep 11 / keep 3 → matches, no call): they state what the syllabus says; after the re-cut their rows hold 13 and 1, which IST.323-57 and -58 recheck.
* IST.323-05: `stored` / `value` set to null only: Phase 17 migration `119_strip_ai_policy_passages` (applied 2026-09-29) cleared `ai_policy` in every course. Citation and quote left as written; the spot-check mismatch on them is waived by Stack (DECISIONS 2026-09-29).
* IST.323-06: recheck reads the note before the ` | ` citation separator (`split_part`), so the keep holds once 106 appends the P-75 citation (PM, 2026-09-30).
* New IST.323-59 (fp_log count_expected 2 → 1), IST.323-60 (fp-log-final component 19 → 18), IST.323-61 (fp_log note); IST.323-35 becomes matches with no call. B-12 follow-through found by the code review (PM, 2026-09-30).

## Reconciliation table

| id | target | field | stored | materials say | citation | verdict | call | why |
|---|---|---|---|---|---|---|---|---|
| IST.323-01 | grading_schemes IST.323 | method | points | points table, total possible 104 | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-02 | grading_schemes IST.323 | total_points | 104.00 | 104 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-03 | grading_schemes IST.323 | graded_out_of | 100.00 | graded out of 100 | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-04 | grading_schemes IST.323 | letter_scale | A 94 … D 65, D- 60, F 0 (11 steps) | same 11 cut-offs | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-05 | grading_schemes IST.323 | ai_policy | tool with disclosure; not in tests, quizzes, defense; FP permissive | same | `bb_file:8#unit:13` | matches | keep | — |
| IST.323-06 | grading_schemes IST.323 | notes | 104 / 100; instructor may curve/adjust | letters reflect the class as a whole; instructor may adjust | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-07 | grade_components IST.323 / participation | points | 5.00 | 5 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-08 | grade_components IST.323 / participation | notes | discussion, questions, demos; laptop misuse => 0 | also: each absence beyond two lowers participation one letter; three excused-absence kinds | `bb_file:3#unit:1` | materials_say_more | change_to (notes + absence rule) | Accepted session recommendation: the appendix is part of the syllabus; record the rule as a note only (Q2). |
| IST.323-09 | grade_components IST.323 / quizzes | normalize_to | 5.00 (aggregation normalized) | total quiz score normalized to 5 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-10 | grade_components IST.323 / quizzes | count_expected | 10 | schedule lists Quiz #1 to Quiz #10 | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-11 | grade_components IST.323 / quizzes | item points (quiz-01…05) | 10.00 each (5 rows) | only "quizzes may vary in length" | `bb_file:151#unit:1` | not_in_materials | keep | Accepted session recommendation: raw item points come from Blackboard; normalization makes them relative. |
| IST.323-12 | grade_components IST.323 / sitn_group | points | 5.00 | 5 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-13 | grade_components IST.323 / individual_presentation | points | 15.00 | 15 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-14 | grade_components IST.323 / final_project | points | 20.00 | 20 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-15 | grade_components IST.323 / fp_proposal | points | 11.00 | proposal 11 points | `bb_file:151#unit:1` | matches | — | Superseded by row 57 (B-12 re-cut). |
| IST.323-16 | grade_components IST.323 / fp_log | points | 3.00 (count 2: 1 + 2) | log 3 points: checkpoint 1, completed 2 | `bb_file:151#unit:1` | matches | — | Superseded by row 58 (B-12 re-cut). |
| IST.323-17 | grade_components IST.323 / fp_defense | points | 6.00 | defense 6 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-18 | grade_components IST.323 / exams | points | 30.00 (3 × 10) | 3 exams, 10 points each | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-19 | grade_components IST.323 / labs | points | 20.00 (4 × 5) | 4 required labs, 5 pts each | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-20 | grade_components IST.323 / extra_credit_lab | points | 4.00, is_extra_credit true | 1 extra credit lab, 4 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-21 | grading_schemes IST.323 | check: top-level non-EC points = graded_out_of | 100 | 5+5+5+15+20+30+20 = 100 | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-22 | grade_components IST.323 (all) | drop_lowest | 0 on every component | no drop or lowest-score rule anywhere | — | not_in_materials | keep | Accepted session recommendation: no document states a drop, so none is applied. |
| IST.323-23 | assignments IST.323/assignment-1 | component_id | — (no points) | only "Assignment #1 given" (Week 1); session reads it as Presentation Choice, 0 points | `bb_file:151#unit:1` | not_in_materials | mark_ungraded | Stack: Assignment #1 is named in the syllabus but is named something else in practice; go with the first assignment requiring a submission. |
| IST.323-24 | assignments IST.323/fp-proposal | points_possible | 13.00 | proposal 11; completed log (2) submitted with it | `bb_file:151#unit:1` | differs | keep | Stack 2026-09-29: re-cut the parts 13 / 1 instead (B-12); the column stays 13. |
| IST.323-25 | grade_column_links IST.323 / _3569973_1 | component_id | 18 | column holds proposal 11 + completed log 2 (two children of 14) | `bb_file:151#unit:1` | differs | keep | Stack 2026-09-29: re-cut the parts 13 / 1 instead (B-12); the column stays linked to part 18. |
| IST.323-26 | assignments IST.323/presentation-choice | points_possible | 100.00, no component, column excluded | carries no points | `bb_file:151#unit:1` | differs | mark_ungraded | Accepted session recommendation: the syllabus says it carries no points; keep the column excluded. |
| IST.323-27 | assignments IST.323/participation | component_id / points_possible | 10 / 5.00 | participation 5 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-28 | grading_schemes IST.323 | check: all top-level points = total_points | 104 | 100 + extra credit 4 = 104 | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-29 | grade_components IST.323 / final_project | check: children sum to parent | 11 + 3 + 6 = 20 | 11 + 3 + 6 = 20 | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-30 | assignments IST.323/exam-1 | component_id / points_possible | 15 / 10.00 | 10 points each | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-31 | assignments IST.323/exam-2 | component_id / points_possible | 15 / 10.00 | 10 points each | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-32 | assignments IST.323/exam-3 | component_id / points_possible | 15 / 10.00 | 10 points each | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-33 | assignments IST.323/fp-defense | component_id / points_possible | 20 / 6.00 | defense 6 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-34 | assignments IST.323/fp-log-checkpoint | component_id / points_possible | 19 / 1.00 | checkpoint 1 point | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-35 | assignments IST.323/fp-log-final | component_id / points_possible | 19 / 2.00 | completed log 2 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-36 | assignments IST.323/fp-packet | component_id | 14 (no points) | packets assigned; no points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-37 | assignments IST.323/individual-presentation | component_id / points_possible | 13 / 15.00 | 15 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-38 | assignments IST.323/lab-1 | component_id / points_possible | 16 / 5.00 | 5 pts each | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-39 | assignments IST.323/lab-2 | component_id / points_possible | 16 / 5.00 | 5 pts each | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-40 | assignments IST.323/lab-3 | component_id / points_possible | 16 / 5.00 | 5 pts each | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-41 | assignments IST.323/lab-4 | component_id / points_possible | 16 / 5.00 | 5 pts each | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-42 | assignments IST.323/lab-extra-credit | component_id / points_possible | 17 / 4.00 | extra credit lab 4 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-43 | assignments IST.323/quiz-01 | component_id | 11 | Quiz #1 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-44 | assignments IST.323/quiz-02 | component_id | 11 | Quiz #2 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-45 | assignments IST.323/quiz-03 | component_id | 11 | Quiz #3 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-46 | assignments IST.323/quiz-04 | component_id | 11 | Quiz #4 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-47 | assignments IST.323/quiz-05 | component_id | 11 | Quiz #5 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-48 | assignments IST.323/quiz-06 | component_id | 11 | Quiz #6 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-49 | assignments IST.323/quiz-07 | component_id | 11 | Quiz #7 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-50 | assignments IST.323/quiz-08 | component_id | 11 | Quiz #8 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-51 | assignments IST.323/quiz-09 | component_id | 11 | Quiz #9 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-52 | assignments IST.323/quiz-10 | component_id | 11 | Quiz #10 in schedule | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-53 | assignments IST.323/sitn-group-presentation | component_id / points_possible | 12 / 5.00 | 5 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-54 | grade_column_links IST.323 / _3560527_1 | component_id | 13 | Individual Presentation, 15 points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-55 | grade_column_links IST.323 / _3560541_1 | component_id | 16 | Lab #1, one of 4 required labs | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-56 | grade_column_links IST.323 / _3598132_1 | excluded | true | Presentation Choice carries no points | `bb_file:151#unit:1` | matches | keep | — |
| IST.323-57 | grade_components IST.323 / fp_proposal | points | 11.00 | proposal 11 + final log 2 in one 13-point column | — | differs | change_to 13 | B-12 re-cut: the Blackboard proposal column is 13 = proposal 11 + final log 2; Final Project stays 20. |
| IST.323-58 | grade_components IST.323 / fp_log | points | 3.00 | checkpoint 1 (the final log 2 moves into part 18) | — | differs | change_to 1 | B-12 re-cut: the Blackboard proposal column is 13 = proposal 11 + final log 2; Final Project stays 20. |

## Questions

* **id:** IST.323-Q1
* **question:** How is "normalize all your answers to … a total quiz score out of 5" computed when quizzes vary in length: the sum earned over the sum possible, or the mean of per-quiz percentages?
* **what it blocks:** IST.323-09, IST.323-11
* **evidence found:** `bb_file:151#unit:1` "a total quiz score out of 5 points"; `bb_file:8#unit:16` "will normalize the total points to 5 points"
* **options:** (a) sum earned ÷ sum possible × 5; (b) mean of per-quiz % × 5
* **recommendation:** (a). The slide speaks of normalizing "the total points".
* **default if unanswered:** (a), `tentative`
* **Stack's answer:** Go with sum of points earned over sum of possible × 5.
* **date:** 2026-09-29
* **DECISIONS row?:** yes

* **id:** IST.323-Q2
* **question:** How does "each absence beyond two reduces your participation grade by one letter" apply to a 5-point manual component?
* **what it blocks:** IST.323-08
* **evidence found:** `bb_file:3#unit:1` "Each absence beyond two reduces your participation grade by one letter."
* **options:** (a) note only, the instructor applies it in the posted score; (b) computed deduction per extra absence
* **recommendation:** (a). The materials don't define a letter in points on a 5-point item.
* **default if unanswered:** (a)
* **Stack's answer:** Note only.
* **date:** 2026-09-29
* **DECISIONS row?:** yes

* **id:** IST.323-Q3
* **question:** The final letter is assigned relative to the class, and disruption "will reduce your final grade". Should the computed standing be labelled an estimate?
* **what it blocks:** IST.323-06
* **evidence found:** `bb_file:151#unit:1` "reflecting the performance of the class as a whole"; "Your disruption will reduce your final grade."
* **options:** (a) label the standing an estimate; (b) show it plainly, since adjustments arrive in the instructor's final grade
* **recommendation:** (a)
* **default if unanswered:** (a)
* **Stack's answer:** No estimate; this will simply be reflected in the grade he assigns at the end of the semester.
* **date:** 2026-09-29
* **DECISIONS row?:** yes

## Machine block

```yaml
- id: IST.323-01
  target:
    table: grading_schemes
    key: {course_id: "IST.323"}
    field: method
  stored: points
  materials: "Points table with a total possible of 104"
  citation: "bb_file:151#unit:1"
  quote: "Total Possible | 104 points"
  verdict: matches
  call: keep
  value: points
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus grades on a points table."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select method from grading_schemes where course_id = 'IST.323'"
- id: IST.323-02
  target:
    table: grading_schemes
    key: {course_id: "IST.323"}
    field: total_points
  stored: 104.00
  materials: "104 points possible"
  citation: "bb_file:151#unit:1"
  quote: "Total Possible | 104 points"
  verdict: matches
  call: keep
  value: 104.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus total matches."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select total_points from grading_schemes where course_id = 'IST.323'"
- id: IST.323-03
  target:
    table: grading_schemes
    key: {course_id: "IST.323"}
    field: graded_out_of
  stored: 100.00
  materials: "Graded out of 100"
  citation: "bb_file:151#unit:1"
  quote: "(Graded out of 100)"
  verdict: matches
  call: keep
  value: 100.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus states the denominator."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select graded_out_of from grading_schemes where course_id = 'IST.323'"
- id: IST.323-04
  target:
    table: grading_schemes
    key: {course_id: "IST.323"}
    field: letter_scale
  stored: "[{\"min\": 94, \"letter\": \"A\"}, {\"min\": 90, \"letter\": \"A-\"}, {\"min\": 87, \"letter\": \"B+\"}, {\"min\": 83, \"letter\": \"B\"}, {\"min\": 80, \"letter\": \"B-\"}, {\"min\": 77, \"letter\": \"C+\"}, {\"min\": 73, \"letter\": \"C\"}, {\"min\": 70, \"letter\": \"C-\"}, {\"min\": 65, \"letter\": \"D\"}, {\"min\": 60, \"letter\": \"D-\"}, {\"min\": 0, \"letter\": \"F\"}]"
  materials: "A 94-100, A- 90, B+ 87, B 83, B- 80, C+ 77, C 73, C- 70, D 65, D- 60, F <60"
  citation: "bb_file:151#unit:1"
  quote: "D | 1.000 | 65 – 69.9"
  verdict: matches
  call: keep
  value: "[{\"min\": 94, \"letter\": \"A\"}, {\"min\": 90, \"letter\": \"A-\"}, {\"min\": 87, \"letter\": \"B+\"}, {\"min\": 83, \"letter\": \"B\"}, {\"min\": 80, \"letter\": \"B-\"}, {\"min\": 77, \"letter\": \"C+\"}, {\"min\": 73, \"letter\": \"C\"}, {\"min\": 70, \"letter\": \"C-\"}, {\"min\": 65, \"letter\": \"D\"}, {\"min\": 60, \"letter\": \"D-\"}, {\"min\": 0, \"letter\": \"F\"}]"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "All eleven cut-offs match the syllabus grading table."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select letter_scale::text from grading_schemes where course_id = 'IST.323'"
- id: IST.323-05
  target:
    table: grading_schemes
    key: {course_id: "IST.323"}
    field: ai_policy
  stored: null
  materials: "AI as a tool with disclosure; not in tests, quizzes or the defense; Final Project more permissive"
  citation: "bb_file:8#unit:13"
  quote: "AI may not be used during tests, quizzes, or the in-class Final Project defense."
  verdict: matches
  call: keep
  value: null
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The course-intro deck states the same policy."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select ai_policy from grading_schemes where course_id = 'IST.323'"
- id: IST.323-06
  target:
    table: grading_schemes
    key: {course_id: "IST.323"}
    field: notes
  stored: "104 points possible, graded out of 100 (4 pts extra-credit lab). Instructor reserves right to curve/adjust letter grades."
  materials: "Letters reflect the class as a whole; instructor may adjust an individual's letter"
  citation: "bb_file:151#unit:1"
  quote: "I reserve the right to adjust a specific student's final letter grade"
  verdict: matches
  call: keep
  value: "104 points possible, graded out of 100 (4 pts extra-credit lab). Instructor reserves right to curve/adjust letter grades."
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The notes restate the syllabus grading paragraph."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select split_part(notes, ' | ', 1) from grading_schemes where course_id = 'IST.323'"
- id: IST.323-07
  target:
    table: grade_components
    key: {course_id: "IST.323", code: participation}
    field: points
  stored: 5.00
  materials: "Class Participation 5 points"
  citation: "bb_file:151#unit:1"
  quote: "Class Participation | 5 points"
  verdict: matches
  call: keep
  value: 5.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus points table matches."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'participation'"
- id: IST.323-08
  target:
    table: grade_components
    key: {course_id: "IST.323", code: participation}
    field: notes
  stored: false
  materials: "Two free absences; each absence beyond two lowers participation one letter; excused only for athletics letter, MySlice religious observance, SOS-documented illness or emergency"
  citation: "bb_file:3#unit:1"
  quote: "Each absence beyond two reduces your participation grade by one letter."
  verdict: materials_say_more
  call: change_to
  value: true
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Accepted session recommendation: the appendix is part of the syllabus; record the rule as a note only (Q2). Notes text for 106: Discussion, questions during presentations, demos; laptop misuse => 0. Each absence beyond two reduces your participation grade by one letter (note only, not computed)."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%Each absence beyond two reduces your participation grade by one letter%' from grade_components where course_id = 'IST.323' and code = 'participation'"
- id: IST.323-09
  target:
    table: grade_components
    key: {course_id: "IST.323", code: quizzes}
    field: normalize_to
  stored: 5.00
  materials: "Quiz total normalized to 5 points (sum earned / sum possible x 5, per Q1)"
  citation: "bb_file:151#unit:1"
  quote: "a total quiz score out of 5 points"
  verdict: matches
  call: keep
  value: 5.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus normalizes quizzes to 5 points."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select normalize_to from grade_components where course_id = 'IST.323' and code = 'quizzes'"
- id: IST.323-10
  target:
    table: grade_components
    key: {course_id: "IST.323", code: quizzes}
    field: count_expected
  stored: 10
  materials: "Schedule lists Quiz #1 through Quiz #10"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #10 Due before class"
  verdict: matches
  call: keep
  value: 10
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Ten quizzes appear in the syllabus schedule."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count_expected from grade_components where course_id = 'IST.323' and code = 'quizzes'"
- id: IST.323-11
  target:
    table: grade_components
    key: {course_id: "IST.323", code: quizzes}
    field: item points_possible (quiz-01..05)
  stored: 5
  materials: "Raw item points not stated; only that quizzes vary in length"
  citation: "bb_file:151#unit:1"
  quote: "Quizzes may vary in length."
  verdict: not_in_materials
  call: keep
  value: 5
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Accepted session recommendation: raw item points come from Blackboard; normalization makes them relative."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count(*) from assignments where component_id = 11 and points_possible = 10 and id in ('IST.323/quiz-01', 'IST.323/quiz-02', 'IST.323/quiz-03', 'IST.323/quiz-04', 'IST.323/quiz-05')"
- id: IST.323-12
  target:
    table: grade_components
    key: {course_id: "IST.323", code: sitn_group}
    field: points
  stored: 5.00
  materials: "Security in the News Group Presentation 5 points"
  citation: "bb_file:151#unit:1"
  quote: "Security in the News Group Presentation | 5 Points"
  verdict: matches
  call: keep
  value: 5.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus points table matches."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'sitn_group'"
- id: IST.323-13
  target:
    table: grade_components
    key: {course_id: "IST.323", code: individual_presentation}
    field: points
  stored: 15.00
  materials: "Individual Presentation 15 points"
  citation: "bb_file:151#unit:1"
  quote: "Assignment: Individual Presentation | 15 points"
  verdict: matches
  call: keep
  value: 15.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus points table matches."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'individual_presentation'"
- id: IST.323-14
  target:
    table: grade_components
    key: {course_id: "IST.323", code: final_project}
    field: points
  stored: 20.00
  materials: "Final Project 20 points"
  citation: "bb_file:151#unit:1"
  quote: "Assignment: Final Project | 20 points"
  verdict: matches
  call: keep
  value: 20.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus points table matches."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'final_project'"
- id: IST.323-15
  target:
    table: grade_components
    key: {course_id: "IST.323", code: fp_proposal}
    field: points
  stored: 11.00
  materials: "The proposal is 11 points"
  citation: "bb_file:151#unit:1"
  quote: "The proposal (11 points)."
  verdict: matches
  why: "Superseded by the B-12 re-cut (IST.323-57 / -58): the syllabus figure stands as evidence; the row's post-106 value is rechecked there."
  decided_by: Stack
  decided_on: 2026-09-29
- id: IST.323-16
  target:
    table: grade_components
    key: {course_id: "IST.323", code: fp_log}
    field: points
  stored: 3.00
  materials: "Running log 3 points: checkpoint 1, completed log 2"
  citation: "bb_file:151#unit:1"
  quote: "The running log (3 points)."
  verdict: matches
  why: "Superseded by the B-12 re-cut (IST.323-57 / -58): the syllabus figure stands as evidence; the row's post-106 value is rechecked there."
  decided_by: Stack
  decided_on: 2026-09-29
- id: IST.323-17
  target:
    table: grade_components
    key: {course_id: "IST.323", code: fp_defense}
    field: points
  stored: 6.00
  materials: "In-class defense 6 points"
  citation: "bb_file:151#unit:1"
  quote: "The in-class defense (6 points)."
  verdict: matches
  call: keep
  value: 6.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus sets the defense at 6."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'fp_defense'"
- id: IST.323-18
  target:
    table: grade_components
    key: {course_id: "IST.323", code: exams}
    field: points
  stored: 30.00
  materials: "3 exams, 10 points each, 30 points"
  citation: "bb_file:151#unit:1"
  quote: "Exams (3 exams, 10 points each) | 30 points"
  verdict: matches
  call: keep
  value: 30.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus points table matches."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'exams'"
- id: IST.323-19
  target:
    table: grade_components
    key: {course_id: "IST.323", code: labs}
    field: points
  stored: 20.00
  materials: "4 required labs, 5 points each, 20 points"
  citation: "bb_file:151#unit:1"
  quote: "4 Required Labs | 20 points (5 pts each)"
  verdict: matches
  call: keep
  value: 20.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus points table matches."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'labs'"
- id: IST.323-20
  target:
    table: grade_components
    key: {course_id: "IST.323", code: extra_credit_lab}
    field: points
  stored: 4.00
  materials: "1 extra credit lab, 4 points"
  citation: "bb_file:151#unit:1"
  quote: "1 Extra Credit Lab | 4 points"
  verdict: matches
  call: keep
  value: 4.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus points table matches; it is the 4 above 100."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'extra_credit_lab'"
- id: IST.323-21
  target:
    table: grading_schemes
    key: {course_id: "IST.323"}
    field: "check: top-level non-extra-credit points sum"
  stored: 100
  materials: "5+5+5+15+20+30+20 = 100, graded out of 100"
  citation: "bb_file:151#unit:1"
  quote: "(Graded out of 100)"
  verdict: matches
  call: keep
  value: 100
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The required components sum to the denominator."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select sum(points) from grade_components where course_id = 'IST.323' and parent_id is null and not is_extra_credit"
- id: IST.323-22
  target:
    table: grade_components
    key: {course_id: "IST.323", code: "*"}
    field: drop_lowest
  stored: 0
  materials: "not in materials"
  citation: null
  quote: null
  verdict: not_in_materials
  call: keep
  value: 0
  reason_code: NOT_IN_MATERIALS
  why: "Accepted session recommendation: no document states a drop, so none is applied."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count(*) from grade_components where course_id = 'IST.323' and drop_lowest <> 0"
- id: IST.323-23
  target:
    table: assignments
    key: {id: "IST.323/assignment-1"}
    field: component_id
  stored: null
  materials: "Only 'Assignment #1 given' (Week 1). Read per Stack as the first assignment requiring a submission: Presentation Choice (due 9/9), which carries no points."
  citation: "bb_file:151#unit:1"
  quote: "Assignment #1 given"
  verdict: not_in_materials
  call: mark_ungraded
  value: null
  reason_code: STACK_OVERRIDE
  why: "Assignment 1 is named in the syllabus however it is named something else in practice; go with the first assignment requiring a submission."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/assignment-1'"
- id: IST.323-24
  target:
    table: assignments
    key: {id: "IST.323/fp-proposal"}
    field: points_possible
  stored: 13.00
  materials: "Proposal 11; completed log (2) is submitted with the proposal in one .docx"
  citation: "bb_file:151#unit:1"
  quote: "The proposal (11 points)."
  verdict: differs
  call: keep
  value: 13.00
  reason_code: STACK_OVERRIDE
  why: "Stack 2026-09-29: re-cut the parts 13 / 1 instead (B-12); the column stays 13"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points_possible from assignments where id = 'IST.323/fp-proposal'"
- id: IST.323-25
  target:
    table: grade_column_links
    key: {course_id: "IST.323", column_id: "_3569973_1"}
    field: component_id
  stored: 18
  materials: "Column holds proposal (11) and completed log (2), children of final_project"
  citation: "bb_file:151#unit:1"
  quote: "the completed log is submitted with your proposal (2 points)"
  verdict: differs
  call: keep
  value: 18
  reason_code: STACK_OVERRIDE
  why: "Stack 2026-09-29: re-cut the parts 13 / 1 instead (B-12); the column stays linked to part 18 (fp_proposal, 13 after IST.323-57)"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from grade_column_links where course_id = 'IST.323' and column_id = '_3569973_1'"
- id: IST.323-26
  target:
    table: assignments
    key: {id: "IST.323/presentation-choice"}
    field: points_possible
  stored: 100.00
  materials: "Presentation Choice carries no points"
  citation: "bb_file:151#unit:1"
  quote: "This assignment carries no points."
  verdict: differs
  call: mark_ungraded
  value: 100.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Accepted session recommendation: the syllabus says it carries no points; keep the column excluded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points_possible from assignments where id = 'IST.323/presentation-choice'"
- id: IST.323-27
  target:
    table: assignments
    key: {id: "IST.323/participation"}
    field: component_id
  stored: 10
  materials: "Class Participation 5 points"
  citation: "bb_file:151#unit:1"
  quote: "Class Participation | 5 points"
  verdict: matches
  call: keep
  value: 10
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Export Q2: the link now carries a syllabus citation."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/participation'"
- id: IST.323-28
  target:
    table: grading_schemes
    key: {course_id: "IST.323"}
    field: "check: top-level points sum = total_points"
  stored: 104
  materials: "100 + extra credit 4 = 104"
  citation: "bb_file:151#unit:1"
  quote: "Total Possible | 104 points"
  verdict: matches
  call: keep
  value: 104
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "All top-level components sum to total_points."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select sum(points) from grade_components where course_id = 'IST.323' and parent_id is null"
- id: IST.323-29
  target:
    table: grade_components
    key: {course_id: "IST.323", code: final_project}
    field: "check: children sum to parent"
  stored: 20
  materials: "11 + 3 + 6 = 20"
  citation: "bb_file:151#unit:1"
  quote: "Assignment: Final Project | 20 points"
  verdict: matches
  call: keep
  value: 20
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Proposal, log and defense sum to the Final Project."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select sum(points) from grade_components where course_id = 'IST.323' and parent_id = 14"
- id: IST.323-30
  target:
    table: assignments
    key: {id: "IST.323/exam-1"}
    field: "component_id / points_possible"
  stored: "15 / 10.00"
  materials: "Exams worth 10 points each"
  citation: "bb_file:151#unit:1"
  quote: "are worth 10 points each on your final grade"
  verdict: matches
  call: keep
  value: "15 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to exams at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/exam-1'"
- id: IST.323-31
  target:
    table: assignments
    key: {id: "IST.323/exam-2"}
    field: "component_id / points_possible"
  stored: "15 / 10.00"
  materials: "Exams worth 10 points each"
  citation: "bb_file:151#unit:1"
  quote: "are worth 10 points each on your final grade"
  verdict: matches
  call: keep
  value: "15 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to exams at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/exam-2'"
- id: IST.323-32
  target:
    table: assignments
    key: {id: "IST.323/exam-3"}
    field: "component_id / points_possible"
  stored: "15 / 10.00"
  materials: "Exams worth 10 points each"
  citation: "bb_file:151#unit:1"
  quote: "are worth 10 points each on your final grade"
  verdict: matches
  call: keep
  value: "15 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to exams at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/exam-3'"
- id: IST.323-33
  target:
    table: assignments
    key: {id: "IST.323/fp-defense"}
    field: "component_id / points_possible"
  stored: "20 / 6.00"
  materials: "In-class defense 6 points"
  citation: "bb_file:151#unit:1"
  quote: "The in-class defense (6 points)."
  verdict: matches
  call: keep
  value: "20 / 6.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to fp_defense at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/fp-defense'"
- id: IST.323-34
  target:
    table: assignments
    key: {id: "IST.323/fp-log-checkpoint"}
    field: "component_id / points_possible"
  stored: "19 / 1.00"
  materials: "Log checkpoint 1 point"
  citation: "bb_file:151#unit:1"
  quote: "A checkpoint is due Friday, October 30 (1 point"
  verdict: matches
  call: keep
  value: "19 / 1.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to fp_log at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/fp-log-checkpoint'"
- id: IST.323-35
  target:
    table: assignments
    key: {id: "IST.323/fp-log-final"}
    field: "component_id / points_possible"
  stored: "19 / 2.00"
  materials: "Completed log 2 points, submitted with the proposal"
  citation: "bb_file:151#unit:1"
  quote: "the completed log is submitted with your proposal (2 points)"
  verdict: matches
  why: "Superseded by the B-12 re-cut (IST.323-60): the completed log's 2 points ride the 13-point proposal column, so the row moves to fp_proposal."
  decided_by: Stack
  decided_on: 2026-09-29
- id: IST.323-36
  target:
    table: assignments
    key: {id: "IST.323/fp-packet"}
    field: component_id
  stored: 14
  materials: "Packets assigned in Week 2; no points attached"
  citation: "bb_file:151#unit:1"
  quote: "Final Project packets assigned"
  verdict: matches
  call: keep
  value: 14
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Final Project event with no points on either side."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/fp-packet'"
- id: IST.323-37
  target:
    table: assignments
    key: {id: "IST.323/individual-presentation"}
    field: "component_id / points_possible"
  stored: "13 / 15.00"
  materials: "Individual Presentation 15 points"
  citation: "bb_file:151#unit:1"
  quote: "Assignment: Individual Presentation | 15 points"
  verdict: matches
  call: keep
  value: "13 / 15.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to individual_presentation at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/individual-presentation'"
- id: IST.323-38
  target:
    table: assignments
    key: {id: "IST.323/lab-1"}
    field: "component_id / points_possible"
  stored: "16 / 5.00"
  materials: "Required labs 5 points each"
  citation: "bb_file:151#unit:1"
  quote: "4 Required Labs | 20 points (5 pts each)"
  verdict: matches
  call: keep
  value: "16 / 5.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to labs at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/lab-1'"
- id: IST.323-39
  target:
    table: assignments
    key: {id: "IST.323/lab-2"}
    field: "component_id / points_possible"
  stored: "16 / 5.00"
  materials: "Required labs 5 points each"
  citation: "bb_file:151#unit:1"
  quote: "4 Required Labs | 20 points (5 pts each)"
  verdict: matches
  call: keep
  value: "16 / 5.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to labs at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/lab-2'"
- id: IST.323-40
  target:
    table: assignments
    key: {id: "IST.323/lab-3"}
    field: "component_id / points_possible"
  stored: "16 / 5.00"
  materials: "Required labs 5 points each"
  citation: "bb_file:151#unit:1"
  quote: "4 Required Labs | 20 points (5 pts each)"
  verdict: matches
  call: keep
  value: "16 / 5.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to labs at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/lab-3'"
- id: IST.323-41
  target:
    table: assignments
    key: {id: "IST.323/lab-4"}
    field: "component_id / points_possible"
  stored: "16 / 5.00"
  materials: "Required labs 5 points each"
  citation: "bb_file:151#unit:1"
  quote: "4 Required Labs | 20 points (5 pts each)"
  verdict: matches
  call: keep
  value: "16 / 5.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to labs at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/lab-4'"
- id: IST.323-42
  target:
    table: assignments
    key: {id: "IST.323/lab-extra-credit"}
    field: "component_id / points_possible"
  stored: "17 / 4.00"
  materials: "1 extra credit lab, 4 points"
  citation: "bb_file:151#unit:1"
  quote: "1 Extra Credit Lab | 4 points"
  verdict: matches
  call: keep
  value: "17 / 4.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to extra_credit_lab at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/lab-extra-credit'"
- id: IST.323-43
  target:
    table: assignments
    key: {id: "IST.323/quiz-01"}
    field: component_id
  stored: 11
  materials: "Quiz #1 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #1 Due before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-01'"
- id: IST.323-44
  target:
    table: assignments
    key: {id: "IST.323/quiz-02"}
    field: component_id
  stored: 11
  materials: "Quiz #2 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #2 Due before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-02'"
- id: IST.323-45
  target:
    table: assignments
    key: {id: "IST.323/quiz-03"}
    field: component_id
  stored: 11
  materials: "Quiz #3 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #3 Due before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-03'"
- id: IST.323-46
  target:
    table: assignments
    key: {id: "IST.323/quiz-04"}
    field: component_id
  stored: 11
  materials: "Quiz #4 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #4 Due before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-04'"
- id: IST.323-47
  target:
    table: assignments
    key: {id: "IST.323/quiz-05"}
    field: component_id
  stored: 11
  materials: "Quiz #5 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #5 Due on before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-05'"
- id: IST.323-48
  target:
    table: assignments
    key: {id: "IST.323/quiz-06"}
    field: component_id
  stored: 11
  materials: "Quiz #6 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #6 Due on before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-06'"
- id: IST.323-49
  target:
    table: assignments
    key: {id: "IST.323/quiz-07"}
    field: component_id
  stored: 11
  materials: "Quiz #7 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #7 Due on before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-07'"
- id: IST.323-50
  target:
    table: assignments
    key: {id: "IST.323/quiz-08"}
    field: component_id
  stored: 11
  materials: "Quiz #8 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #8 Due before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-08'"
- id: IST.323-51
  target:
    table: assignments
    key: {id: "IST.323/quiz-09"}
    field: component_id
  stored: 11
  materials: "Quiz #9 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #9 Due before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-09'"
- id: IST.323-52
  target:
    table: assignments
    key: {id: "IST.323/quiz-10"}
    field: component_id
  stored: 11
  materials: "Quiz #10 in the schedule"
  citation: "bb_file:151#unit:1"
  quote: "Quiz #10 Due before class"
  verdict: matches
  call: keep
  value: 11
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Blackboard quiz linked to quizzes."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/quiz-10'"
- id: IST.323-53
  target:
    table: assignments
    key: {id: "IST.323/sitn-group-presentation"}
    field: "component_id / points_possible"
  stored: "12 / 5.00"
  materials: "Security in the News Group Presentation 5 points"
  citation: "bb_file:151#unit:1"
  quote: "Security in the News Group Presentation | 5 Points"
  verdict: matches
  call: keep
  value: "12 / 5.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to sitn_group at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.323/sitn-group-presentation'"
- id: IST.323-54
  target:
    table: grade_column_links
    key: {course_id: "IST.323", column_id: "_3560527_1"}
    field: component_id
  stored: 13
  materials: "Individual Presentation 15 points"
  citation: "bb_file:151#unit:1"
  quote: "Assignment: Individual Presentation | 15 points"
  verdict: matches
  call: keep
  value: 13
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The column is the individual presentation."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from grade_column_links where course_id = 'IST.323' and column_id = '_3560527_1'"
- id: IST.323-55
  target:
    table: grade_column_links
    key: {course_id: "IST.323", column_id: "_3560541_1"}
    field: component_id
  stored: 16
  materials: "Lab #1, one of four required labs"
  citation: "bb_file:151#unit:1"
  quote: "4 Required Labs | 20 points (5 pts each)"
  verdict: matches
  call: keep
  value: 16
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The column is a required lab."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from grade_column_links where course_id = 'IST.323' and column_id = '_3560541_1'"
- id: IST.323-56
  target:
    table: grade_column_links
    key: {course_id: "IST.323", column_id: "_3598132_1"}
    field: excluded
  stored: true
  materials: "Presentation Choice carries no points"
  citation: "bb_file:151#unit:1"
  quote: "This assignment carries no points."
  verdict: matches
  call: keep
  value: true
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "An unscored column stays excluded."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select excluded from grade_column_links where course_id = 'IST.323' and column_id = '_3598132_1'"
- id: IST.323-57
  target:
    table: grade_components
    key: {course_id: "IST.323", code: fp_proposal}
    field: points
  stored: 11.00
  materials: "Proposal 11 and the completed log 2 are submitted and graded in one 13-point column"
  citation: null
  quote: null
  verdict: differs
  call: change_to
  value: 13.00
  reason_code: STACK_OVERRIDE
  why: "B-12 re-cut: the Blackboard proposal column is 13 = proposal 11 + final log 2; Final Project stays 20"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'fp_proposal'"
- id: IST.323-58
  target:
    table: grade_components
    key: {course_id: "IST.323", code: fp_log}
    field: points
  stored: 3.00
  materials: "Log checkpoint 1; the completed log 2 moves into the proposal part"
  citation: null
  quote: null
  verdict: differs
  call: change_to
  value: 1.00
  reason_code: STACK_OVERRIDE
  why: "B-12 re-cut: the Blackboard proposal column is 13 = proposal 11 + final log 2; Final Project stays 20"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.323' and code = 'fp_log'"
- id: IST.323-59
  target:
    table: grade_components
    key: {course_id: "IST.323", code: fp_log}
    field: count_expected
  stored: 2
  materials: "After the re-cut the part holds only the 1-point log checkpoint"
  citation: null
  quote: null
  verdict: differs
  call: change_to
  value: 1
  reason_code: STACK_OVERRIDE
  why: "B-12 re-cut follow-through (code review 2026-09-30): the completed log's 2 points count inside the 13-point proposal column, so fp_log keeps one slot, the checkpoint."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count_expected from grade_components where course_id = 'IST.323' and code = 'fp_log'"
- id: IST.323-60
  target:
    table: assignments
    key: {id: "IST.323/fp-log-final"}
    field: component_id
  stored: 19
  materials: "The completed log (2 points) is submitted with the proposal, in the one 13-point column"
  citation: "bb_file:151#unit:1"
  quote: "the completed log is submitted with your proposal (2 points)"
  verdict: differs
  call: change_to
  value: 18
  reason_code: STACK_OVERRIDE
  why: "B-12 re-cut follow-through (code review 2026-09-30): the row shares column _3569973_1 with fp-proposal, which the re-cut makes worth 13 on component 18."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.323/fp-log-final'"
- id: IST.323-61
  target:
    table: grade_components
    key: {course_id: "IST.323", code: fp_log}
    field: notes
  stored: false
  materials: "Re-cut 13 / 1 (B-12)"
  citation: null
  quote: null
  verdict: differs
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "Notes text for 106: B-12 re-cut (2026-09-29): this part is the 1-point log checkpoint only; the completed log's 2 points count inside the 13-point proposal column (fp_proposal)."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%B-12 re-cut (2026-09-29): this part is the 1-point log checkpoint only%' from grade_components where course_id = 'IST.323' and code = 'fp_log'"
```
