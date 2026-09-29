# 96b — V-1 grading validation: IST.471

Sitting date: 2026-09-29 · Export read: `96a_GRADING_SCHEMA_EXPORT_2026-09-29.md` · Syllabus: `bb_file:26` (`IST 471 Syllabus.pdf`; page n = unit n)

Other sources: `bb_file:61` (`Site Supervisor Evaluation.pdf`), `bb_file:59` (`form-internship-proposal-agreement-1.pdf`, the registrar's blank form). Stack's submitted proposal (`bb_file:141`) was read only to look for the grading-basis choice. The extraction does not show the checkbox, and none of its personal details are reproduced here.

Export §6 questions for this course: Q7 (letter scale stops at C-) is row IST.471-02 and IST.471-Q1.

## Reconciliation table

| id | target | field | stored | materials say | citation | verdict | call | why |
|---|---|---|---|---|---|---|---|---|
| IST.471-01 | grading_schemes IST.471 | method | qualitative | two percentage weights, 70% + 30% | `bb_file:26#unit:5` | differs | change_to weighted_pct | Stack: change to weighted. |
| IST.471-02 | grading_schemes IST.471 | letter_scale | A 93 … C 74, C- 71 (8 steps) | same 8 steps; nothing below 71 | `bb_file:26#unit:5` | matches | change_to (extend below C-) | Stack Q1: figure out a scale below with the ranges known; he doesn't expect below a B. Extrapolated on the syllabus's 3-point step: D+ 68, D 65, D- 62, F below 62. |
| IST.471-03 | grading_schemes IST.471 | ai_policy | template placeholder unfilled, so no AI unless permitted | same | `bb_file:26#unit:6` | matches | keep | — |
| IST.471-04 | grading_schemes IST.471 | notes | 70/30; no supervisor evaluation => no credit; penalties up to the professor | same; the registrar form offers letter or pass/fail | `bb_file:26#unit:4` | matches | change_to (notes + letter basis) | Stack Q2: letter grade. |
| IST.471-05 | grade_components IST.471 / work_quality | weight_pct | 70.00 | 70% | `bb_file:26#unit:5` | matches | keep | — |
| IST.471-06 | grade_components IST.471 / assignments | weight_pct | 30.00 | 30% | `bb_file:26#unit:5` | matches | keep | — |
| IST.471-07 | grading_schemes IST.471 | check: top-level weights = 100 | 100 | 70 + 30 = 100 | `bb_file:26#unit:5` | matches | keep | — |
| IST.471-08 | grade_components IST.471 / work_quality | aggregation | manual | the supervisor's evaluation form, returned to the faculty supervisor | `bb_file:26#unit:4` | not_in_materials | change_to single | Stack: suggestions (earned ÷ possible × 70, from the Assignment 6 column). |
| IST.471-09 | grade_components IST.471 / assignments | aggregation | manual | complete, timely, correctly formatted assignments | `bb_file:26#unit:5` | not_in_materials | change_to sum | Stack: suggestions (earned ÷ possible × 30, over Assignments 1–5 and 7). |
| IST.471-10 | grade_components IST.471 / work_quality | notes | site supervisor evaluation (Assignment 6); instrument described | no credit without the evaluation | `bb_file:26#unit:4` | materials_say_more | change_to (notes + not-yet-graded) | Stack: that category would have to remain ungraded until something is entered into grades. |
| IST.471-11 | grade_components IST.471 / assignments | notes | Assignments 1-7; columns 1-6 = 130 raw points | Assignments 1–5 and 7 after the relink | `bb_file:26#unit:3` | differs | change_to (notes rewritten) | Follows IST.471-17: Assignment 6 now feeds work_quality, so the 30% runs on Assignments 1–5 (30 raw) plus 7. |
| IST.471-12 | assignments IST.471/a1-proposal | component_id / points_possible | 22 / 5.00 | Assignment 1 is a requirement; points not stated | `bb_file:26#unit:3` | not_in_materials | keep | Stack: Blackboard as source. |
| IST.471-13 | assignments IST.471/a2-introductions | component_id / points_possible | 22 / 5.00 | Assignment 2 is a requirement; points not stated | `bb_file:26#unit:3` | not_in_materials | keep | Stack: Blackboard as source. |
| IST.471-14 | assignments IST.471/a3-first-impressions | component_id / points_possible | 22 / 5.00 | Assignment 3 is a requirement; points not stated | `bb_file:26#unit:3` | not_in_materials | keep | Stack: Blackboard as source. |
| IST.471-15 | assignments IST.471/a4-learning-agreement | component_id / points_possible | 22 / 5.00 | Assignment 4 is a requirement; points not stated | `bb_file:26#unit:3` | not_in_materials | keep | Stack: Blackboard as source. |
| IST.471-16 | assignments IST.471/a5-faculty-visit | component_id / points_possible | 22 / 10.00 | Assignment 5 is a requirement; points not stated | `bb_file:26#unit:4` | not_in_materials | keep | Stack: Blackboard as source. |
| IST.471-17 | assignments IST.471/a6-site-evaluations | component_id | 22 | the supervisor's evaluation of the work; required for credit | `bb_file:26#unit:4` | differs | change_to 21 | Stack: relink to work_quality; that category would have to remain ungraded until something is entered into grades. |
| IST.471-18 | assignments IST.471/a7-final-reflection | component_id | 22 (no column yet) | Assignment 7: Final Reflection | `bb_file:26#unit:4` | matches | keep | — |

## Questions

* **id:** IST.471-Q1
* **question:** The syllabus scale stops at C- (≥ 71). What happens below 71?
* **what it blocks:** IST.471-02
* **evidence found:** `bb_file:26#unit:5`, scale runs "93- A 100" down to "71- C- 73"; nothing below
* **options:** (a) show "below C- (not on the syllabus scale)" with no letter; (b) extend the scale; (c) ask the professor
* **recommendation:** (a)
* **default if unanswered:** (a)
* **Stack's answer:** Figure out a scale for below with the ranges you do know. However this class is the class for my for-credit internship and I don't expect to get anything below a B. (Applied: the syllabus's 3-point step extended to D+ 68, D 65, D- 62, F below 62; `tentative` because derived.)
* **date:** 2026-09-29
* **DECISIONS row?:** no

* **id:** IST.471-Q2
* **question:** Letter grade or pass/fail?
* **what it blocks:** IST.471-02, IST.471-04
* **evidence found:** `bb_file:59#unit:1` "Letter grade (A-F) OR Pass/Fail (Undergrads Only)"; the extracted text of the submitted proposal does not show the choice
* **options:** (a) letter grade; (b) pass/fail
* **recommendation:** none; only Stack knows
* **default if unanswered:** (a), `tentative`
* **Stack's answer:** Letter grade.
* **date:** 2026-09-29
* **DECISIONS row?:** no

## Machine block

```yaml
- id: IST.471-01
  target:
    table: grading_schemes
    key: {course_id: "IST.471"}
    field: method
  stored: qualitative
  materials: "Two percentage weights, 70% and 30%"
  citation: "bb_file:26#unit:5"
  quote: "Quality of professional work in the internship 70%"
  verdict: differs
  call: change_to
  value: weighted_pct
  reason_code: STACK_OVERRIDE
  why: "Change to weighted."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select method from grading_schemes where course_id = 'IST.471'"
- id: IST.471-02
  target:
    table: grading_schemes
    key: {course_id: "IST.471"}
    field: letter_scale
  stored: "A 93, A- 90, B+ 87, B 84, B- 81, C+ 77, C 74, C- 71"
  materials: "A 93-100, A- 90-92, B+ 87-89, B 84-86, B- 81-83, C+ 77-80, C 74-76, C- 71-73; nothing below 71"
  citation: "bb_file:26#unit:5"
  quote: "71- C- 73"
  verdict: matches
  call: change_to
  value: "A 93, A- 90, B+ 87, B 84, B- 81, C+ 77, C 74, C- 71, D+ 68, D 65, D- 62, F 0"
  reason_code: STACK_OVERRIDE
  why: "Figure out a scale for below with the ranges you do know. However this class is the class for my for-credit internship and I don't expect to get anything below a B."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: tentative
  recheck: "select letter_scale::text from grading_schemes where course_id = 'IST.471'"
- id: IST.471-03
  target:
    table: grading_schemes
    key: {course_id: "IST.471"}
    field: ai_policy
  stored: "Limited and Specified AI Use template with the permitted-assignment placeholder unfilled; operative default: no AI use on any assignment unless the instructor grants documented permission."
  materials: "Template placeholder left unfilled; if no instructions are given, no AI is permitted"
  citation: "bb_file:26#unit:6"
  quote: "[insert specific assignment, quiz or exam names"
  verdict: matches
  call: keep
  value: "Limited and Specified AI Use template with the permitted-assignment placeholder unfilled; operative default: no AI use on any assignment unless the instructor grants documented permission."
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The stored summary matches the syllabus."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select ai_policy from grading_schemes where course_id = 'IST.471'"
- id: IST.471-04
  target:
    table: grading_schemes
    key: {course_id: "IST.471"}
    field: notes
  stored: "70% quality of professional work (site supervisor evaluation); 30% assignments. No supervisor evaluation => no credit. Penalties up to the professor."
  materials: "Same; the registrar form offers letter or pass/fail"
  citation: "bb_file:26#unit:4"
  quote: "Failure to receive the site supervisor's evaluation form will result in no credit"
  verdict: matches
  call: change_to
  value: "Existing notes + 'Grading basis: letter grade (Stack, 2026-09-29).'"
  reason_code: STACK_OVERRIDE
  why: "Letter grade."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%Grading basis: letter grade%' from grading_schemes where course_id = 'IST.471'"
- id: IST.471-05
  target:
    table: grade_components
    key: {course_id: "IST.471", code: work_quality}
    field: weight_pct
  stored: 70.00
  materials: "Quality of professional work 70%"
  citation: "bb_file:26#unit:5"
  quote: "Quality of professional work in the internship 70%"
  verdict: matches
  call: keep
  value: 70.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'IST.471' and code = 'work_quality'"
- id: IST.471-06
  target:
    table: grade_components
    key: {course_id: "IST.471", code: assignments}
    field: weight_pct
  stored: 30.00
  materials: "Complete, timely, correctly formatted assignments 30%"
  citation: "bb_file:26#unit:5"
  quote: "Complete, timely submission, and correctly formatted assignments 30%"
  verdict: matches
  call: keep
  value: 30.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'IST.471' and code = 'assignments'"
- id: IST.471-07
  target:
    table: grading_schemes
    key: {course_id: "IST.471"}
    field: "check: top-level weights sum to 100"
  stored: 100
  materials: "70 + 30 = 100"
  citation: "bb_file:26#unit:5"
  quote: "Quality of professional work in the internship 70%"
  verdict: matches
  call: keep
  value: 100
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The weights sum to 100."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select sum(weight_pct) from grade_components where course_id = 'IST.471' and parent_id is null"
- id: IST.471-08
  target:
    table: grade_components
    key: {course_id: "IST.471", code: work_quality}
    field: aggregation
  stored: manual
  materials: "The supervisor rates the work on the evaluation form; how it becomes a score is not stated"
  citation: "bb_file:61#unit:2"
  quote: "Please give a number grade and comments if applicable"
  verdict: not_in_materials
  call: change_to
  value: single
  reason_code: STACK_OVERRIDE
  why: "Suggestions: earned / possible x 70 from the Assignment 6 column; not yet graded until posted."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select aggregation from grade_components where course_id = 'IST.471' and code = 'work_quality'"
- id: IST.471-09
  target:
    table: grade_components
    key: {course_id: "IST.471", code: assignments}
    field: aggregation
  stored: manual
  materials: "Graded on complete, timely, correctly formatted submission; how points combine is not stated"
  citation: "bb_file:26#unit:5"
  quote: "Complete, timely submission, and correctly formatted assignments 30%"
  verdict: not_in_materials
  call: change_to
  value: sum
  reason_code: STACK_OVERRIDE
  why: "Suggestions: earned / possible x 30 over Assignments 1-5 and 7; not yet graded until posted."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select aggregation from grade_components where course_id = 'IST.471' and code = 'assignments'"
- id: IST.471-10
  target:
    table: grade_components
    key: {course_id: "IST.471", code: work_quality}
    field: notes
  stored: "Site supervisor evaluation (Assignment 6). Instrument: Site Supervisor Evaluation.pdf - 8 competencies rated 1-5, 8 IM&T outcomes, 4 narrative questions."
  materials: "No credit without the supervisor's evaluation"
  citation: "bb_file:26#unit:4"
  quote: "Failure to receive the site supervisor's evaluation form will result in no credit"
  verdict: materials_say_more
  call: change_to
  value: "Existing notes + 'Fed by the Assignment 6 column (_3599888_1, 100 pts), earned / possible x 70; shown as not yet graded until a score is entered.'"
  reason_code: STACK_OVERRIDE
  why: "That category would have to remain ungraded until something is entered into grades."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%shown as not yet graded until a score is entered%' from grade_components where course_id = 'IST.471' and code = 'work_quality'"
- id: IST.471-11
  target:
    table: grade_components
    key: {course_id: "IST.471", code: assignments}
    field: notes
  stored: "Assignments 1-7. Blackboard carries columns for 1-6 only (5+5+5+5+10+100 = 130 raw points); Assignment 7 Final Reflection has no column yet."
  materials: "Assignments 1-7 are the course requirements; Assignment 6 is the supervisor's evaluation"
  citation: "bb_file:26#unit:3"
  quote: "Assignment 1: Submit your Proposal to Blackboard."
  verdict: differs
  call: change_to
  value: "Assignments 1-5 and 7. Blackboard columns for 1-5 (5+5+5+5+10 = 30 raw points); Assignment 7 has no column yet; Assignment 6 feeds work_quality. Earned / possible x 30; not yet graded until posted."
  reason_code: STACK_OVERRIDE
  why: "Follows IST.471-17: the relink moves Assignment 6 out of this component."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like 'Assignments 1-5 and 7.%' from grade_components where course_id = 'IST.471' and code = 'assignments'"
- id: IST.471-12
  target:
    table: assignments
    key: {id: "IST.471/a1-proposal"}
    field: "component_id / points_possible"
  stored: "22 / 5.00"
  materials: "Assignment 1 is a requirement; its points are not stated"
  citation: "bb_file:26#unit:3"
  quote: "submit it as Assignment 1 in Blackboard"
  verdict: not_in_materials
  call: keep
  value: "22 / 5.00"
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Blackboard as source."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.471/a1-proposal'"
- id: IST.471-13
  target:
    table: assignments
    key: {id: "IST.471/a2-introductions"}
    field: "component_id / points_possible"
  stored: "22 / 5.00"
  materials: "Assignment 2 is a requirement; its points are not stated"
  citation: "bb_file:26#unit:3"
  quote: "Assignment 2: Sharing Introductions with classmates."
  verdict: not_in_materials
  call: keep
  value: "22 / 5.00"
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Blackboard as source."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.471/a2-introductions'"
- id: IST.471-14
  target:
    table: assignments
    key: {id: "IST.471/a3-first-impressions"}
    field: "component_id / points_possible"
  stored: "22 / 5.00"
  materials: "Assignment 3 is a requirement; its points are not stated"
  citation: "bb_file:26#unit:3"
  quote: "Assignment 3: First Impressions."
  verdict: not_in_materials
  call: keep
  value: "22 / 5.00"
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Blackboard as source."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.471/a3-first-impressions'"
- id: IST.471-15
  target:
    table: assignments
    key: {id: "IST.471/a4-learning-agreement"}
    field: "component_id / points_possible"
  stored: "22 / 5.00"
  materials: "Assignment 4 is a requirement; its points are not stated"
  citation: "bb_file:26#unit:3"
  quote: "Assignment 4: The First 30 hours. The Learning Agreement."
  verdict: not_in_materials
  call: keep
  value: "22 / 5.00"
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Blackboard as source."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.471/a4-learning-agreement'"
- id: IST.471-16
  target:
    table: assignments
    key: {id: "IST.471/a5-faculty-visit"}
    field: "component_id / points_possible"
  stored: "22 / 10.00"
  materials: "Assignment 5 is a requirement; its points are not stated"
  citation: "bb_file:26#unit:4"
  quote: "Assignment 5: The faculty supervisor's visit, call, or email."
  verdict: not_in_materials
  call: keep
  value: "22 / 10.00"
  reason_code: BLACKBOARD_AUTHORITATIVE
  why: "Blackboard as source."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.471/a5-faculty-visit'"
- id: IST.471-17
  target:
    table: assignments
    key: {id: "IST.471/a6-site-evaluations"}
    field: component_id
  stored: 22
  materials: "The supervisor's evaluation of the intern's work; required for any credit"
  citation: "bb_file:26#unit:4"
  quote: "Give the site supervisor evaluation form to your site supervisor."
  verdict: differs
  call: change_to
  value: 21
  reason_code: STACK_OVERRIDE
  why: "Relink to work_quality; that category would have to remain ungraded until something is entered into grades."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.471/a6-site-evaluations'"
- id: IST.471-18
  target:
    table: assignments
    key: {id: "IST.471/a7-final-reflection"}
    field: component_id
  stored: 22
  materials: "Assignment 7: Final Reflection is a course requirement"
  citation: "bb_file:26#unit:4"
  quote: "Assignment 7: Final Reflection"
  verdict: matches
  call: keep
  value: 22
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A listed assignment; it has no column or points yet."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.471/a7-final-reflection'"
```
