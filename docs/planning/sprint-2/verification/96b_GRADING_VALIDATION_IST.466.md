# 96b — V-1 grading validation: IST.466

Sitting date: 2026-09-29 · Export read: `96a_GRADING_SCHEMA_EXPORT_2026-09-29.md` · Syllabus: `bb_file:39` (`IST466M3 Fall2026 Syllabus.docx`, "Version: M3- August 25, 2026")

Other sources: `bb_file:21` (`IST466 Ethics Cases Spring 2026.docx`, filed under "Ethics Cases Fall 2026"), `bb_file:149` (`IST466M3 Schedule Fall2026-Wk4xyz.docx`, M003, v. Sept 17; `bb_file:150` is a near-copy), `bb_file:36` (`Ethics vs IST466_Fall 2026_M3.pptx`), `bb_file:20` and `bb_file:38` (the two copies of the ethics rubric deck), `bb_file:33` (the Student Policies appendix).

Export §6 questions for this course: Q1 (IST.466 attendance) is rows IST.466-22 to -24 and -29; Q4 is rows IST.466-29 and -30; Q5 is rows IST.466-15 and -16; Q11 is row IST.466-36; Q12 is row IST.466-13. The Major Case Group number in component 24's notes (#3 → #2, migration 105) is team membership, not grading, and was not assessed.

## Reconciliation table

| id | target | field | stored | materials say | citation | verdict | call | why |
|---|---|---|---|---|---|---|---|---|
| IST.466-01 | grading_schemes IST.466 | method | points | point scale up to 1020 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-02 | grading_schemes IST.466 | total_points | 1020.00 | 150+300+150+100+100+120+100 = 1020; A tops at 1020 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-03 | grading_schemes IST.466 | graded_out_of | 1020.00 | grade table runs to 1020 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-04 | grading_schemes IST.466 | letter_scale | A 930 … D 600, F 0 (10 steps) | same 10 cut-offs | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-05 | grading_schemes IST.466 | ai_policy | no course AI statement; appendix applies | appendix lists three AI options, none chosen; syllabus has no statement | `bb_file:33#unit:1` | matches | keep | — |
| IST.466-06 | grading_schemes IST.466 | notes | component summary; no deduction rule | also: up to 20-point deduction per class for disrespect | `bb_file:39#unit:1` | materials_say_more | change_to (notes + deduction) | Stack: note only. |
| IST.466-07 | grade_components IST.466 / participation | points | 100.00 | up to 100 points for participation | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-08 | grade_components IST.466 / participation | aggregation | sum | 10 points × 10 ethics presentations | `bb_file:39#unit:1` | matches | change_to normalized | Stack: participation is likely tracked as a set value per class; use the syllabus points, scoring earned ÷ possible from the gradebook column, scaled to 100. |
| IST.466-09 | grade_components IST.466 / participation | count_expected | 10 | 10 ethics presentations | `bb_file:39#unit:1` | matches | change_to null | Follows row 08: scored from the gradebook column, not counted per presentation. |
| IST.466-10 | grade_components IST.466 / participation | normalize_to | — | 100 points | `bb_file:39#unit:1` | materials_say_more | change_to 100 | Follows row 08: scale to the syllabus 100. |
| IST.466-11 | grade_components IST.466 / participation | notes | 10 per presentation; presenters earn none that day | presenters earn no participation when they present, so the practical max is 90 | `bb_file:21#unit:1` | materials_say_more | change_to (notes + 90 cap) | Stack Q2 (b): show the syllabus 100; the 90 cap is a note. |
| IST.466-12 | grade_components IST.466 / major_cases | points | 300.00 | Major Project 300, two cases of 150 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-13 | grade_components IST.466 / major_cases | notes (rank scoring) | 150/140/130/120/110/100 by place | 150 first … 100 sixth, in each section | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-14 | grade_components IST.466 / major_cases | count_expected | 2 | two cases | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-15 | grade_components IST.466 / ethics_presentations | points | 100.00 | syllabus and cases doc: 100; rubric deck: 120 | `bb_file:39#unit:1` | differs | keep | Stack Q3 (following Q2): the syllabus figure governs. |
| IST.466-16 | grade_components IST.466 / ethics_presentations | notes | 40 min, up to 100, <30 min capped at 65 | cap matches; rubric deck (120) is filed with the Ethics vs. exercise | `bb_file:21#unit:1` | matches | change_to (notes + rubric) | Stack Q3: record the 120 rubric as not governing this item. |
| IST.466-17 | grade_components IST.466 / ethics_practice | points | 50.00 | up to 50 for the practice | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-18 | grade_components IST.466 / ethics_vs | points | 120.00 | Ethics vs. Presentation 120 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-19 | grade_components IST.466 / letter_of_gratitude | points | 100.00 | Letter of Gratitude 100 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-20 | grade_components IST.466 / ai_team_assignment | points | 100.00 | AI Team Assignment 100 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-21 | grade_components IST.466 / attendance | points | 150.00 | up to 150 for attendance | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-22 | grade_components IST.466 / attendance | aggregation | sum | 5 per class (syllabus); counts on starred classes (schedule) | `bb_file:149#unit:1` | differs | change_to normalized | Stack: the schedule keeps changing and attendance isn't required at every class; go with what the gradebook posts. |
| IST.466-23 | grade_components IST.466 / attendance | count_expected | 30 | "per class" vs "1 out of 15 classes"; 8 classes starred | `bb_file:149#unit:1` | differs | change_to null | Follows row 22: gradebook-driven, no fixed count. |
| IST.466-24 | grade_components IST.466 / attendance | normalize_to | — | 150 points | `bb_file:39#unit:1` | materials_say_more | change_to 150 | Follows row 22 and the row 08 rule: scale to the syllabus 150. |
| IST.466-25 | grading_schemes IST.466 | check: top-level points = total_points | 1020 | 1020 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-26 | grade_components IST.466 / ethics_practice + ethics_presentations | parent_id | — (flat) | grouped as Team Ethics Presentation (150) | `bb_file:39#unit:1` | materials_say_more | keep | Stack: keep them flat for now. |
| IST.466-27 | assignments IST.466/ai-team-assignment | component_id / points_possible | 36 / 100.00 | AI Team Assignment 100 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-28 | assignments IST.466/attendance | component_id / points_possible | 26 / 150.00 | up to 150 for attendance | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-29 | assignments IST.466/attendance-35625001 | component_id | — (100-pt column) | one attendance item only | — | not_in_materials | change_to 26 | Stack delegated ("likely merge"): merged into attendance under the row 08 rule; unposted columns add nothing to either side. |
| IST.466-30 | assignments IST.466/class-participation | component_id | — (150-pt column) | participation is 100 | `bb_file:39#unit:1` | differs | change_to 23 | Stack: participation is likely a set value per class; normalize the gradebook column to the syllabus 100. |
| IST.466-31 | assignments IST.466/ethics-team-2-practice | component_id / points_possible | 28 / 50.00 | practice up to 50 | `bb_file:21#unit:1` | matches | keep | — |
| IST.466-32 | assignments IST.466/ethics-team-2-presentation | component_id / points_possible | 25 / 100.00 | presentation up to 100 | `bb_file:21#unit:1` | matches | keep | — |
| IST.466-33 | assignments IST.466/ethics-vs-activity | component_id / points_possible | 34 / 120.00 | Ethics Exercise 120 | `bb_file:36#unit:1` | matches | keep | — |
| IST.466-34 | assignments IST.466/letter-of-gratitude | component_id / points_possible | 35 / 100.00 | Letter of Gratitude 100 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-35 | assignments IST.466/major-case-2-kickoff | component_id | — (no points) | SU IT presents the case; no points | `bb_file:149#unit:1` | matches | keep | — |
| IST.466-36 | assignments IST.466/major-project-1-synchrony | component_id / points_possible | 24 / 150.00 | each case up to 150 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-37 | assignments IST.466/major-project-2-su-it | component_id / points_possible | 24 / 150.00 | each case up to 150 | `bb_file:39#unit:1` | matches | keep | — |
| IST.466-38 | assignments IST.466/synchrony-case-kickoff | component_id | — (no points) | Synchrony presents the case; no points | `bb_file:149#unit:1` | matches | keep | — |

## Questions

* **id:** IST.466-Q1
* **question:** Which classes count for attendance: every class at 5 points (30 × 5 = 150), or only the starred "1 out of 15" classes?
* **what it blocks:** IST.466-22, IST.466-23, IST.466-24, IST.466-29
* **evidence found:** `bb_file:39#unit:1` "up to 5 points for on-time attendance per class"; `bb_file:149#unit:1` "*indicates 1 out of 15 classes where attendance and participation counts." (8 classes starred)
* **options:** (a) 30 × 5; (b) 15 counted classes; (c) take whatever the gradebook posts, scaled to 150
* **recommendation:** keep 150 and ask the professor for the count
* **default if unanswered:** `tentative`
* **Stack's answer:** Schedule is ever changing, and I am not required to be at every class. Just simply go with what is posted in the gradebook for this. I haven't missed class thus far however I am not sure that the gradebook will be updated efficiently with this teacher.
* **date:** 2026-09-29
* **DECISIONS row?:** yes

* **id:** IST.466-Q2
* **question:** Presenters earn no participation on their own day, so a student can reach at most 90 of the 100 participation points. Which figure does the app show?
* **what it blocks:** IST.466-07, IST.466-11
* **evidence found:** `bb_file:39#unit:1` "up to 10 points for each of the 10 ethics presentations"; `bb_file:21#unit:1` "Students that are presenting do NOT earn participation points when they present."
* **options:** (a) show 90 as the practical cap; (b) show the syllabus 100 and note the cap; (c) ask the professor
* **recommendation:** (b)
* **default if unanswered:** (b)
* **Stack's answer:** b.
* **date:** 2026-09-29
* **DECISIONS row?:** no

* **id:** IST.466-Q3
* **question:** Does the 120-point "Rubrics for Ethics Case Presentation" deck govern the 100-point ethics case presentation?
* **what it blocks:** IST.466-15, IST.466-16
* **evidence found:** `bb_file:20#unit:1` "Rubrics for Ethics Case Presentation (120 pts.)", path "IST466/M1 Rubrics for Ethics Cases vs."; `bb_file:38#unit:1` same slide, filed under "Class Exercise - Fall 2026 Ethics!"; `bb_file:39#unit:1` "up to 100 points for a 40-minute ethics presentation"; `bb_file:36#unit:1` "Ethics Exercise (120 points)"
* **options:** (a) syllabus 100 governs, and the rubric is read as the Ethics vs. scoring guide; (b) the rubric's 120 governs, and the total becomes 1040; (c) ask the professor
* **recommendation:** (a)
* **default if unanswered:** (a), `tentative`
* **Stack's answer:** Pick according to my answer for Q2. (Applied: the syllabus figure governs, so (a).)
* **date:** 2026-09-29
* **DECISIONS row?:** no

* **id:** IST.466-Q4
* **question:** When a gradebook column's maximum differs from the syllabus value of the component it feeds, how is the component scored?
* **what it blocks:** IST.466-08, IST.466-10, IST.466-22, IST.466-24, IST.466-29, IST.466-30
* **evidence found:** none in materials (syllabus participation 100 vs a 150-point Blackboard column; one syllabus attendance item vs two Blackboard columns, 150 and 100)
* **options:** (a) earned ÷ possible across the component's posted columns, scaled to the syllabus points; (b) use raw column points; (c) ask the professor
* **recommendation:** (c), leaving the columns unlinked in the meantime
* **default if unanswered:** leave the columns unlinked (B-13)
* **Stack's answer:** Go with the syllabus points and assess my score based on the points scored over total points (from the gradebook column) scaled to the 100 points from the syllabus. (Extended to attendance at Stack's direction: "See previous answer to reason and decide on this one. Likely merge.")
* **date:** 2026-09-29
* **DECISIONS row?:** yes

## Machine block

```yaml
- id: IST.466-01
  target:
    table: grading_schemes
    key: {course_id: "IST.466"}
    field: method
  stored: points
  materials: "Points scale topping at 1020"
  citation: "bb_file:39#unit:1"
  quote: "A.. | 1020-930"
  verdict: matches
  call: keep
  value: points
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus grades on a points scale."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select method from grading_schemes where course_id = 'IST.466'"
- id: IST.466-02
  target:
    table: grading_schemes
    key: {course_id: "IST.466"}
    field: total_points
  stored: 1020.00
  materials: "150+300+150+100+100+120+100 = 1020"
  citation: "bb_file:39#unit:1"
  quote: "A.. | 1020-930"
  verdict: matches
  call: keep
  value: 1020.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus items and grade table both total 1020."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select total_points from grading_schemes where course_id = 'IST.466'"
- id: IST.466-03
  target:
    table: grading_schemes
    key: {course_id: "IST.466"}
    field: graded_out_of
  stored: 1020.00
  materials: "Grade table runs to 1020"
  citation: "bb_file:39#unit:1"
  quote: "A.. | 1020-930"
  verdict: matches
  call: keep
  value: 1020.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The grade table's top equals the total."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select graded_out_of from grading_schemes where course_id = 'IST.466'"
- id: IST.466-04
  target:
    table: grading_schemes
    key: {course_id: "IST.466"}
    field: letter_scale
  stored: "A 930, A- 900, B+ 870, B 830, B- 800, C+ 770, C 730, C- 700, D 600, F 0"
  materials: "A 1020-930, A- 929-900, B+ 899-870, B 869-830, B- 829-800, C+ 799-770, C 769-730, C- 729-700, D 699-600, F 599-0"
  citation: "bb_file:39#unit:1"
  quote: "D.. | 699-600 | F. | 599- 0"
  verdict: matches
  call: keep
  value: "A 930, A- 900, B+ 870, B 830, B- 800, C+ 770, C 730, C- 700, D 600, F 0"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "All ten cut-offs match the syllabus grade table."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select letter_scale::text from grading_schemes where course_id = 'IST.466'"
- id: IST.466-05
  target:
    table: grading_schemes
    key: {course_id: "IST.466"}
    field: ai_policy
  stored: "No AI policy stated in the course syllabus; the syllabus lists an \"AI Team Assignment\" (100 pts). University academic-integrity appendix applies."
  materials: "Syllabus has no AI statement; the appendix lists three options without choosing one"
  citation: "bb_file:33#unit:1"
  quote: "Choose One of Three Options"
  verdict: matches
  call: keep
  value: "No AI policy stated in the course syllabus; the syllabus lists an \"AI Team Assignment\" (100 pts). University academic-integrity appendix applies."
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The stored text accurately says no course AI statement was chosen."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select ai_policy from grading_schemes where course_id = 'IST.466'"
- id: IST.466-06
  target:
    table: grading_schemes
    key: {course_id: "IST.466"}
    field: notes
  stored: "Component summary from bb_file 39; no deduction rule"
  materials: "Disrespectful students can lose up to 20 points per class"
  citation: "bb_file:39#unit:1"
  quote: "can receive a deduction of up to 20 points per class."
  verdict: materials_say_more
  call: change_to
  value: "Existing notes + 'Disrespect deduction: up to 20 points per class (note only, not computed).'"
  reason_code: STACK_OVERRIDE
  why: "Note only."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%up to 20 points per class (note only, not computed)%' from grading_schemes where course_id = 'IST.466'"
- id: IST.466-07
  target:
    table: grade_components
    key: {course_id: "IST.466", code: participation}
    field: points
  stored: 100.00
  materials: "Up to 100 points for participation"
  citation: "bb_file:39#unit:1"
  quote: "Up to 100 points for participation."
  verdict: matches
  call: keep
  value: 100.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus value; Stack Q2 (b) keeps 100 on display."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.466' and code = 'participation'"
- id: IST.466-08
  target:
    table: grade_components
    key: {course_id: "IST.466", code: participation}
    field: aggregation
  stored: sum
  materials: "10 points for each of 10 ethics presentations"
  citation: "bb_file:39#unit:1"
  quote: "up to 10 points for each of the 10 ethics presentations"
  verdict: matches
  call: change_to
  value: normalized
  reason_code: STACK_OVERRIDE
  why: "Class participation is likely tracked by assigning a set point value to each class. Go with the syllabus points and assess my score based on the points scored over total points (from the gradebook column) scaled to the 100 points from the syllabus."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select aggregation from grade_components where course_id = 'IST.466' and code = 'participation'"
- id: IST.466-09
  target:
    table: grade_components
    key: {course_id: "IST.466", code: participation}
    field: count_expected
  stored: 10
  materials: "10 ethics presentations"
  citation: "bb_file:39#unit:1"
  quote: "up to 10 points for each of the 10 ethics presentations"
  verdict: matches
  call: change_to
  value: null
  reason_code: STACK_OVERRIDE
  why: "Follows IST.466-08: scored from the gradebook column, not counted per presentation."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count_expected from grade_components where course_id = 'IST.466' and code = 'participation'"
- id: IST.466-10
  target:
    table: grade_components
    key: {course_id: "IST.466", code: participation}
    field: normalize_to
  stored: null
  materials: "Up to 100 points for participation"
  citation: "bb_file:39#unit:1"
  quote: "Up to 100 points for participation."
  verdict: materials_say_more
  call: change_to
  value: 100.00
  reason_code: STACK_OVERRIDE
  why: "Follows IST.466-08: scaled to the syllabus 100."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select normalize_to from grade_components where course_id = 'IST.466' and code = 'participation'"
- id: IST.466-11
  target:
    table: grade_components
    key: {course_id: "IST.466", code: participation}
    field: notes
  stored: "Up to 10 pts per each of the 10 ethics presentations for asking good questions; presenters do not earn participation that day. Syllabus."
  materials: "Presenters earn no participation on their own day, so the practical max is 90"
  citation: "bb_file:21#unit:1"
  quote: "Students that are presenting do NOT earn participation points when they present."
  verdict: materials_say_more
  call: change_to
  value: "Existing notes + 'Practical max 90 of 100 (own team presents once); display 100 per syllabus. Scored from gradebook column Class Participation, earned / possible x 100.'"
  reason_code: STACK_OVERRIDE
  why: "b."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%Practical max 90 of 100%' from grade_components where course_id = 'IST.466' and code = 'participation'"
- id: IST.466-12
  target:
    table: grade_components
    key: {course_id: "IST.466", code: major_cases}
    field: points
  stored: 300.00
  materials: "Major Project 300; two cases, up to 150 each"
  citation: "bb_file:39#unit:1"
  quote: "Major Project (300 points) This semester there will be two cases."
  verdict: matches
  call: keep
  value: 300.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.466' and code = 'major_cases'"
- id: IST.466-13
  target:
    table: grade_components
    key: {course_id: "IST.466", code: major_cases}
    field: notes
  stored: "Rank-scored within section: 1st 150, 2nd 140, 3rd 130, 4th 120, 5th 110, 6th 100."
  materials: "150 first place down to 100 sixth place, in each section"
  citation: "bb_file:39#unit:1"
  quote: "130 points to teams that finish in third place"
  verdict: matches
  call: keep
  value: "Rank-scored within section: 1st 150, 2nd 140, 3rd 130, 4th 120, 5th 110, 6th 100."
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Export Q12: the rank scoring is now cited to the syllabus."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%1st 150, 2nd 140, 3rd 130, 4th 120, 5th 110, 6th 100%' from grade_components where course_id = 'IST.466' and code = 'major_cases'"
- id: IST.466-14
  target:
    table: grade_components
    key: {course_id: "IST.466", code: major_cases}
    field: count_expected
  stored: 2
  materials: "Two cases"
  citation: "bb_file:39#unit:1"
  quote: "Each case analysis is worth up to 150 points."
  verdict: matches
  call: keep
  value: 2
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus states two cases."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count_expected from grade_components where course_id = 'IST.466' and code = 'major_cases'"
- id: IST.466-15
  target:
    table: grade_components
    key: {course_id: "IST.466", code: ethics_presentations}
    field: points
  stored: 100.00
  materials: "Syllabus and ethics-cases doc: 100; rubric deck: 120"
  citation: "bb_file:39#unit:1"
  quote: "Your team will receive up to 100 points for a 40-minute ethics presentation."
  verdict: differs
  call: keep
  value: 100.00
  reason_code: STACK_OVERRIDE
  why: "Pick according to my answer for Q2 (the syllabus figure governs)."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.466' and code = 'ethics_presentations'"
- id: IST.466-16
  target:
    table: grade_components
    key: {course_id: "IST.466", code: ethics_presentations}
    field: notes
  stored: "40-min team ethics case presentation, up to 100 pts (<30 min capped at 65). Part of \"Team Ethics Presentation (150)\" with practice. Syllabus."
  materials: "Cap of 65 matches; the 120-pt rubric deck is filed with the Ethics vs. exercise"
  citation: "bb_file:21#unit:1"
  quote: "eligible for a maximum of 65 out of 100 points"
  verdict: matches
  call: change_to
  value: "Existing notes + 'Rubric deck (bb_file 20/38, 120 pts) does not govern this item; filed with the Ethics vs. exercise.'"
  reason_code: STACK_OVERRIDE
  why: "Pick according to my answer for Q2 (the syllabus figure governs)."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%Rubric deck (bb_file 20/38, 120 pts) does not govern this item%' from grade_components where course_id = 'IST.466' and code = 'ethics_presentations'"
- id: IST.466-17
  target:
    table: grade_components
    key: {course_id: "IST.466", code: ethics_practice}
    field: points
  stored: 50.00
  materials: "Up to 50 points for the practice presentation"
  citation: "bb_file:39#unit:1"
  quote: "up to 50 points for a 30-minute practice presentation"
  verdict: matches
  call: keep
  value: 50.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.466' and code = 'ethics_practice'"
- id: IST.466-18
  target:
    table: grade_components
    key: {course_id: "IST.466", code: ethics_vs}
    field: points
  stored: 120.00
  materials: "Ethics vs. Presentation 120"
  citation: "bb_file:39#unit:1"
  quote: "Ethics vs. Presentation – 120 points"
  verdict: matches
  call: keep
  value: 120.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus and the Ethics vs. deck agree."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.466' and code = 'ethics_vs'"
- id: IST.466-19
  target:
    table: grade_components
    key: {course_id: "IST.466", code: letter_of_gratitude}
    field: points
  stored: 100.00
  materials: "Letter of Gratitude 100"
  citation: "bb_file:39#unit:1"
  quote: "Letter of Gratitude – 100 points"
  verdict: matches
  call: keep
  value: 100.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.466' and code = 'letter_of_gratitude'"
- id: IST.466-20
  target:
    table: grade_components
    key: {course_id: "IST.466", code: ai_team_assignment}
    field: points
  stored: 100.00
  materials: "AI Team Assignment 100"
  citation: "bb_file:39#unit:1"
  quote: "AI Team Assignment – 100 points"
  verdict: matches
  call: keep
  value: 100.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.466' and code = 'ai_team_assignment'"
- id: IST.466-21
  target:
    table: grade_components
    key: {course_id: "IST.466", code: attendance}
    field: points
  stored: 150.00
  materials: "Up to 150 points for attendance"
  citation: "bb_file:39#unit:1"
  quote: "Up to 150 points for attendance."
  verdict: matches
  call: keep
  value: 150.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select points from grade_components where course_id = 'IST.466' and code = 'attendance'"
- id: IST.466-22
  target:
    table: grade_components
    key: {course_id: "IST.466", code: attendance}
    field: aggregation
  stored: sum
  materials: "Syllabus: 5 per class; schedule: counts on starred classes, 1 of 15"
  citation: "bb_file:149#unit:1"
  quote: "*indicates 1 out of 15 classes where attendance and participation counts."
  verdict: differs
  call: change_to
  value: normalized
  reason_code: STACK_OVERRIDE
  why: "Schedule is ever changing, and I am not required to be at every class. Just simply go with what is posted in the gradebook for this. I am not sure that the gradebook will be updated efficiently with this teacher."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select aggregation from grade_components where course_id = 'IST.466' and code = 'attendance'"
- id: IST.466-23
  target:
    table: grade_components
    key: {course_id: "IST.466", code: attendance}
    field: count_expected
  stored: 30
  materials: "Syllabus: per class; schedule: 1 of 15, with 8 classes starred"
  citation: "bb_file:39#unit:1"
  quote: "A student earns up to 5 points for on-time attendance per class."
  verdict: differs
  call: change_to
  value: null
  reason_code: STACK_OVERRIDE
  why: "Follows IST.466-22: gradebook-driven, no fixed class count."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count_expected from grade_components where course_id = 'IST.466' and code = 'attendance'"
- id: IST.466-24
  target:
    table: grade_components
    key: {course_id: "IST.466", code: attendance}
    field: normalize_to
  stored: null
  materials: "Up to 150 points for attendance"
  citation: "bb_file:39#unit:1"
  quote: "Up to 150 points for attendance."
  verdict: materials_say_more
  call: change_to
  value: 150.00
  reason_code: STACK_OVERRIDE
  why: "Follows IST.466-22 and the IST.466-Q4 rule: scaled to the syllabus 150."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select normalize_to from grade_components where course_id = 'IST.466' and code = 'attendance'"
- id: IST.466-25
  target:
    table: grading_schemes
    key: {course_id: "IST.466"}
    field: "check: top-level points sum = total_points"
  stored: 1020
  materials: "150+300+150+100+100+120+100 = 1020"
  citation: "bb_file:39#unit:1"
  quote: "A.. | 1020-930"
  verdict: matches
  call: keep
  value: 1020
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The components sum to total_points."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select sum(points) from grade_components where course_id = 'IST.466' and parent_id is null"
- id: IST.466-26
  target:
    table: grade_components
    key: {course_id: "IST.466", code: ethics_practice}
    field: parent_id
  stored: null
  materials: "Practice 50 + presentation 100 grouped as Team Ethics Presentation (150)"
  citation: "bb_file:39#unit:1"
  quote: "Team Ethics Presentation (150 points)"
  verdict: materials_say_more
  call: keep
  value: null
  reason_code: STACK_OVERRIDE
  why: "Keep them flat for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count(*) from grade_components where course_id = 'IST.466' and code in ('ethics_practice', 'ethics_presentations') and parent_id is not null"
- id: IST.466-27
  target:
    table: assignments
    key: {id: "IST.466/ai-team-assignment"}
    field: "component_id / points_possible"
  stored: "36 / 100.00"
  materials: "AI Team Assignment 100"
  citation: "bb_file:39#unit:1"
  quote: "AI Team Assignment – 100 points"
  verdict: matches
  call: keep
  value: "36 / 100.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.466/ai-team-assignment'"
- id: IST.466-28
  target:
    table: assignments
    key: {id: "IST.466/attendance"}
    field: "component_id / points_possible"
  stored: "26 / 150.00"
  materials: "Up to 150 points for attendance"
  citation: "bb_file:39#unit:1"
  quote: "Up to 150 points for attendance."
  verdict: matches
  call: keep
  value: "26 / 150.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Export Q1: the link now carries a syllabus citation."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.466/attendance'"
- id: IST.466-29
  target:
    table: assignments
    key: {id: "IST.466/attendance-35625001"}
    field: component_id
  stored: null
  materials: "not in materials"
  citation: null
  quote: null
  verdict: not_in_materials
  call: change_to
  value: 26
  reason_code: STACK_OVERRIDE
  why: "Stack: 'See previous answer to reason and decide on this one. Likely merge.' Merged into attendance under the IST.466-Q4 rule; a column with no posted score adds nothing to earned or possible."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.466/attendance-35625001'"
- id: IST.466-30
  target:
    table: assignments
    key: {id: "IST.466/class-participation"}
    field: component_id
  stored: null
  materials: "Participation is 100 points; the gradebook column is 150"
  citation: "bb_file:39#unit:1"
  quote: "Up to 100 points for participation."
  verdict: differs
  call: change_to
  value: 23
  reason_code: STACK_OVERRIDE
  why: "Class participation is likely tracked by assigning a set point value to each class. Go with the syllabus points and assess my score based on the points scored over total points (from the gradebook column) scaled to the 100 points from the syllabus."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.466/class-participation'"
- id: IST.466-31
  target:
    table: assignments
    key: {id: "IST.466/ethics-team-2-practice"}
    field: "component_id / points_possible"
  stored: "28 / 50.00"
  materials: "Practice worth up to 50"
  citation: "bb_file:21#unit:1"
  quote: "Practice is worth up to 50 points."
  verdict: matches
  call: keep
  value: "28 / 50.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked at the documented value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.466/ethics-team-2-practice'"
- id: IST.466-32
  target:
    table: assignments
    key: {id: "IST.466/ethics-team-2-presentation"}
    field: "component_id / points_possible"
  stored: "25 / 100.00"
  materials: "Presentation worth up to 100"
  citation: "bb_file:21#unit:1"
  quote: "Presentation is worth up to 100 points."
  verdict: matches
  call: keep
  value: "25 / 100.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Export Q5: the ethics case presentation is governed by the syllabus and the cases doc (100)."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.466/ethics-team-2-presentation'"
- id: IST.466-33
  target:
    table: assignments
    key: {id: "IST.466/ethics-vs-activity"}
    field: "component_id / points_possible"
  stored: "34 / 120.00"
  materials: "Ethics Exercise 120 points"
  citation: "bb_file:36#unit:1"
  quote: "Ethics Exercise (120 points) Schedule"
  verdict: matches
  call: keep
  value: "34 / 120.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Export Q5: Ethics vs. is governed by the syllabus and its deck (120)."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.466/ethics-vs-activity'"
- id: IST.466-34
  target:
    table: assignments
    key: {id: "IST.466/letter-of-gratitude"}
    field: "component_id / points_possible"
  stored: "35 / 100.00"
  materials: "Letter of Gratitude 100"
  citation: "bb_file:39#unit:1"
  quote: "Letter of Gratitude – 100 points"
  verdict: matches
  call: keep
  value: "35 / 100.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.466/letter-of-gratitude'"
- id: IST.466-35
  target:
    table: assignments
    key: {id: "IST.466/major-case-2-kickoff"}
    field: component_id
  stored: null
  materials: "SU IT presents Major Case #2; no points"
  citation: "bb_file:149#unit:1"
  quote: "SU IT Dept. to present Major Case #2"
  verdict: matches
  call: keep
  value: null
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A class event, not a graded item."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.466/major-case-2-kickoff'"
- id: IST.466-36
  target:
    table: assignments
    key: {id: "IST.466/major-project-1-synchrony"}
    field: "component_id / points_possible"
  stored: "24 / 150.00"
  materials: "Each case up to 150"
  citation: "bb_file:39#unit:1"
  quote: "Each case analysis is worth up to 150 points."
  verdict: matches
  call: keep
  value: "24 / 150.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Export Q11: the link to major_cases is confirmed by the syllabus."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.466/major-project-1-synchrony'"
- id: IST.466-37
  target:
    table: assignments
    key: {id: "IST.466/major-project-2-su-it"}
    field: "component_id / points_possible"
  stored: "24 / 150.00"
  materials: "Each case up to 150"
  citation: "bb_file:39#unit:1"
  quote: "Each case analysis is worth up to 150 points."
  verdict: matches
  call: keep
  value: "24 / 150.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked at the syllabus value."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.466/major-project-2-su-it'"
- id: IST.466-38
  target:
    table: assignments
    key: {id: "IST.466/synchrony-case-kickoff"}
    field: component_id
  stored: null
  materials: "Synchrony presents the major project; no points"
  citation: "bb_file:149#unit:1"
  quote: "“Synchrony” -Major Project Presentation"
  verdict: matches
  call: keep
  value: null
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A class event, not a graded item."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.466/synchrony-case-kickoff'"
```
