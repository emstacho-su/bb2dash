# 96b — V-1 grading validation: IST.352

Sitting date: 2026-09-29 · Export read: `96a_GRADING_SCHEMA_EXPORT_2026-09-29.md` · Syllabus: `bb_file:27` (`IST 352 Syllabus Fall 2026.docx`)

Other sources: `bb_file:28` (`IST 352 Class Schedule Fall 2026.docx`, "Current Class Schedule v-1"), `bb_file:30` (`Welcome & Course Introduction.pptx`), `bb_file:70` (`Origins of Software.pptx`, knowledge-check agenda), `bb_file:72` (`Managing the Information Systems Project.pptx`, Moving Tasks exercise), `bb_file:155` / `bb_file:156` (the class's Moving Tasks group-work write-ups).

Export §6 questions for this course: Q6 (knowledge checks → component 33) is rows IST.352-23 to -31; the seven reading items under the same rule are rows IST.352-32 to -38.

The syllabus numbers its items #1, #2, #4, #5, #6 (there is no #3); the weights still total 100, so no component is missing.

Doubling check (Stack, row C): Moving Tasks (`_3615326_1`, 9/16) and Moving Tasks - Processes (`_3619706_1`, 9/23) are separate columns; `bb_file:155` and `bb_file:156` are class write-ups of the exercise, not gradebook items. `team-request` and `team-and-project-selection` are alternative paths on `bb_file:30#unit:4`, not one item twice. `project-1a`'s re-created column appears once (`_3607154_1`). The 16 zero-point items each have their own column and date. Nothing is doubled.

## Amendments (PM, 2026-09-29)

* IST.352-02 (letter_scale stored/value: the human list → prod's exact `letter_scale::text`, what the recheck returns).
* IST.352-03 (ai_policy stored/value → null: prod's `grading_schemes.ai_policy` is null since migration 119_strip_ai_policy_passages, 2026-09-29).
* IST.352-04 (stored/value → false/true: the recheck is a `like` test; the notes text moved to `why`).
* IST.352-13 (stored/value → false/true: the recheck is a `like` test; the notes text moved to `why`).
* IST.352-12 (note → "Bonus items add to earned points only (note only, not computed: the figure applies no 100 percent cap)."): the figure applies no cap; stored/value → false/true, the recheck being a `like` test.

## Reconciliation table

| id | target | field | stored | materials say | citation | verdict | call | why |
|---|---|---|---|---|---|---|---|---|
| IST.352-01 | grading_schemes IST.352 | method | weighted_pct | percentage weights totalling 100% | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-02 | grading_schemes IST.352 | letter_scale | A 93 … D+ 67, D 63, D- 60, F 0 (12 steps) | same 12 cut-offs | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-03 | grading_schemes IST.352 | ai_policy | zero tolerance, all stages | zero tolerance, all stages | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-04 | grading_schemes IST.352 | notes | team grades may differ; one make-up; electronic only | also: late −20% of total per day; re-grade within one week; disruption affects grade | `bb_file:27#unit:1` | materials_say_more | change_to (notes + three rules) | Stack: note only. |
| IST.352-05 | grade_components IST.352 / research | weight_pct | 5.00 | 5% | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-06 | grade_components IST.352 / project_deliverables | weight_pct | 60.00 | 60% | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-07 | grade_components IST.352 / project_final | weight_pct | 10.00 | 10% | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-08 | grade_components IST.352 / peer_assessment | weight_pct | 10.00 | 10% | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-09 | grade_components IST.352 / attendance | weight_pct | 15.00 | 15% | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-10 | grading_schemes IST.352 | check: top-level weights = 100 | 100 | 5+60+10+10+15 = 100 | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-11 | grade_components IST.352 (all) | drop_lowest | 0 on every component | no drop rule anywhere | — | not_in_materials | keep | Stack: keep. |
| IST.352-12 | grade_components IST.352 / project_deliverables | notes (bonus) | bonus items listed, counting unstated | Event Model, Activity Diagram, Project Plans marked "Bonus Material" | `bb_file:27#unit:1` | materials_say_more | change_to (notes + bonus rule) | Stack Q2: bonus adds to earned only; note only, not computed: the figure applies no 100 percent cap. |
| IST.352-13 | grade_components IST.352 / attendance | notes | knowledge checks + reading confirmations feed this; one make-up | only the make-up rule is stated; no scored column exists | `bb_file:27#unit:1` | not_in_materials | change_to (notes + not-yet-graded) | Stack Q1 (a): show as not yet graded and compute over the other 85%. |
| IST.352-14 | assignments IST.352/role-of-systems-analyst | component_id / points_possible | 29 / 5.00 | Research – Role of Systems Analyst, 5% | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-15 | assignments IST.352/project-1a | component_id / points_possible | 30 / 10.00 | a Project Assignment deliverable | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-16 | assignments IST.352/project-assignment-2a-project-resources-risks | component_id / points_possible | 30 / 10.00 | a Project Assignment deliverable | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-17 | assignments IST.352/project-assignment-3-business-case | component_id / points_possible | 30 / 10.00 | Business Case (Short Version) listed | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-18 | assignments IST.352/project-assignment-4-project-charter | component_id / points_possible | 30 / 10.00 | Project Charter listed | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-19 | assignments IST.352/project-assignment-5-communication-plan | component_id / points_possible | 30 / 10.00 | Communication Plan listed | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-20 | assignments IST.352/project-assignment-6-hl-processes | component_id / points_possible | 30 / 10.00 | High-Level Processes listed | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-21 | assignments IST.352/project-assignment-7-interview-questions | component_id / points_possible | 30 / 10.00 | a Project Assignment deliverable | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-22 | assignments IST.352/term-project | component_id | 30 (no points) | the team project the deliverables build | `bb_file:27#unit:1` | matches | keep | — |
| IST.352-23 | assignments IST.352/knowledge-check-2026-08-26 | component_id / points_possible | 33 / 0.00 | knowledge checks appear only as agenda items | `bb_file:70#unit:2` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-24 | assignments IST.352/knowledge-check-2026-08-31 | component_id / points_possible | 33 / 0.00 | as IST.352-23 | `bb_file:70#unit:2` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-25 | assignments IST.352/knowledge-check-2026-09-02 | component_id / points_possible | 33 / 0.00 | as IST.352-23 | `bb_file:70#unit:2` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-26 | assignments IST.352/knowledge-check-09-09-2026 | component_id / points_possible | 33 / 0.00 | as IST.352-23 | `bb_file:70#unit:2` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-27 | assignments IST.352/knowledge-check-09-14-26 | component_id / points_possible | 33 / 0.00 | as IST.352-23 | `bb_file:70#unit:2` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-28 | assignments IST.352/knowledge-check-09-16-2026 | component_id / points_possible | 33 / 0.00 | as IST.352-23 | `bb_file:70#unit:2` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-29 | assignments IST.352/knowledge-check-09-21-26 | component_id / points_possible | 33 / 0.00 | as IST.352-23 | `bb_file:70#unit:2` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-30 | assignments IST.352/knowledge-check-09-23-26 | component_id / points_possible | 33 / 0.00 | as IST.352-23 | `bb_file:70#unit:2` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-31 | assignments IST.352/knowledge-check-09-28-26 | component_id / points_possible | 33 / 0.00 | as IST.352-23 | `bb_file:70#unit:2` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-32 | assignments IST.352/reading-ch1 | component_id / points_possible | 33 / 0.00 | readings link to attendance only through the make-up report | `bb_file:27#unit:1` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-33 | assignments IST.352/reading-ch1-all | component_id / points_possible | 33 / 0.00 | as IST.352-32 | `bb_file:27#unit:1` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-34 | assignments IST.352/reading-ch2 | component_id / points_possible | 33 / 0.00 | as IST.352-32 | `bb_file:27#unit:1` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-35 | assignments IST.352/reading-chapter-3 | component_id / points_possible | 33 / 0.00 | as IST.352-32 | `bb_file:27#unit:1` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-36 | assignments IST.352/reading-chapter-4 | component_id / points_possible | 33 / 0.00 | as IST.352-32 | `bb_file:27#unit:1` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-37 | assignments IST.352/reading-chapter-6-pp-91-98 | component_id / points_possible | 33 / 0.00 | as IST.352-32 | `bb_file:27#unit:1` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-38 | assignments IST.352/read-chapter-7-pp-108-111 | component_id / points_possible | 33 / 0.00 | as IST.352-32 | `bb_file:27#unit:1` | not_in_materials | keep | Stack: leave them as 0 for now. |
| IST.352-39 | assignments IST.352/moving-tasks | component_id | — (0.00) | in-class HL project-plan exercise | `bb_file:72#unit:21` | not_in_materials | mark_ungraded | Stack: ensure it isn't doubled but leave it as ungraded (checked: separate column from -40). |
| IST.352-40 | assignments IST.352/moving-tasks-processes | component_id | — (0.00) | no document names a Processes follow-up | `bb_file:72#unit:21` | not_in_materials | mark_ungraded | Stack: ensure it isn't doubled but leave it as ungraded (checked: separate column from -39). |
| IST.352-41 | assignments IST.352/team-and-project-selection | component_id | — (0.00) | form-your-own-team path, due Sept 1 | `bb_file:30#unit:4` | not_in_materials | mark_ungraded | Stack: ensure it isn't doubled but leave it as ungraded (checked: an alternative to -42, not a duplicate). |
| IST.352-42 | assignments IST.352/team-request | component_id | — (no points) | request-a-team path, due Aug 30 | `bb_file:30#unit:4` | not_in_materials | mark_ungraded | Stack: ensure it isn't doubled but leave it as ungraded (checked: an alternative to -41, not a duplicate). |

## Questions

* **id:** IST.352-Q1
* **question:** Attendance and class contribution (15%) has no scored gradebook column; everything linked to it is worth 0. How does the app show it?
* **what it blocks:** IST.352-09, IST.352-13, IST.352-23 to IST.352-38
* **evidence found:** `bb_file:27#unit:1` "Attendance, Class Contribution | 15%"; "Missing attendance will affect your final grade." No scored column in the export.
* **options:** (a) show it as not yet graded and compute standing over the other 85%; (b) assume full credit until an absence is recorded; (c) ask the professor
* **recommendation:** (a); it doesn't invent a score
* **default if unanswered:** (a)
* **Stack's answer:** a.
* **date:** 2026-09-29
* **DECISIONS row?:** yes

* **id:** IST.352-Q2
* **question:** How do the "Bonus Material" deliverables (Event Model, Activity Diagram, Project Plans) count?
* **what it blocks:** IST.352-06, IST.352-12
* **evidence found:** `bb_file:27#unit:1` "Event Model (Bonus Material)"; the counting is not stated
* **options:** (a) add to earned points only, capping project_deliverables at 100%; (b) add them like any other deliverable; (c) ask the professor
* **recommendation:** (a), `tentative`
* **default if unanswered:** (a), `tentative`
* **Stack's answer:** A sounds correct.
* **date:** 2026-09-29
* **DECISIONS row?:** yes

## Machine block

```yaml
- id: IST.352-01
  target:
    table: grading_schemes
    key: {course_id: "IST.352"}
    field: method
  stored: weighted_pct
  materials: "Percentage weights totalling 100%"
  citation: "bb_file:27#unit:1"
  quote: "Total | 100%"
  verdict: matches
  call: keep
  value: weighted_pct
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus grades by percentage weights."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select method from grading_schemes where course_id = 'IST.352'"
- id: IST.352-02
  target:
    table: grading_schemes
    key: {course_id: "IST.352"}
    field: letter_scale
  stored: "[{\"min\": 93, \"letter\": \"A\"}, {\"min\": 90, \"letter\": \"A-\"}, {\"min\": 87, \"letter\": \"B+\"}, {\"min\": 83, \"letter\": \"B\"}, {\"min\": 80, \"letter\": \"B-\"}, {\"min\": 77, \"letter\": \"C+\"}, {\"min\": 73, \"letter\": \"C\"}, {\"min\": 70, \"letter\": \"C-\"}, {\"min\": 67, \"letter\": \"D+\"}, {\"min\": 63, \"letter\": \"D\"}, {\"min\": 60, \"letter\": \"D-\"}, {\"min\": 0, \"letter\": \"F\"}]"
  materials: "A 93-100, A- 90-92, B+ 87-89, B 83-86, B- 80-82, C+ 77-79, C 73-76, C- 70-72, D+ 67-69, D 63-66, D- 60-62, F below 60"
  citation: "bb_file:27#unit:1"
  quote: "D - (60-62)"
  verdict: matches
  call: keep
  value: "[{\"min\": 93, \"letter\": \"A\"}, {\"min\": 90, \"letter\": \"A-\"}, {\"min\": 87, \"letter\": \"B+\"}, {\"min\": 83, \"letter\": \"B\"}, {\"min\": 80, \"letter\": \"B-\"}, {\"min\": 77, \"letter\": \"C+\"}, {\"min\": 73, \"letter\": \"C\"}, {\"min\": 70, \"letter\": \"C-\"}, {\"min\": 67, \"letter\": \"D+\"}, {\"min\": 63, \"letter\": \"D\"}, {\"min\": 60, \"letter\": \"D-\"}, {\"min\": 0, \"letter\": \"F\"}]"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "All twelve cut-offs match the syllabus table."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select letter_scale::text from grading_schemes where course_id = 'IST.352'"
- id: IST.352-03
  target:
    table: grading_schemes
    key: {course_id: "IST.352"}
    field: ai_policy
  stored: null
  materials: "All generative-AI tools prohibited at all stages"
  citation: "bb_file:27#unit:1"
  quote: "Zero tolerance for artificial intelligence use."
  verdict: matches
  call: keep
  value: null
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus states the same policy."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select ai_policy from grading_schemes where course_id = 'IST.352'"
- id: IST.352-04
  target:
    table: grading_schemes
    key: {course_id: "IST.352"}
    field: notes
  stored: false
  materials: "Late work loses 20% of total points per day; re-grade requests within one week; repeated disruption affects the final grade"
  citation: "bb_file:27#unit:1"
  quote: "penalty of 20% of total points for each day being late"
  verdict: materials_say_more
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "Note only. Notes text for 106: Existing notes + 'Late: minus 20 percent of total points per day late; re-grade requests within one week of return; repeated disruption affects the final grade (notes only, not computed).'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%minus 20 percent of total points per day late%' from grading_schemes where course_id = 'IST.352'"
- id: IST.352-05
  target:
    table: grade_components
    key: {course_id: "IST.352", code: research}
    field: weight_pct
  stored: 5.00
  materials: "Research - Role of Systems Analyst 5%"
  citation: "bb_file:27#unit:1"
  quote: "Research – Role of Systems Analyst | 5%"
  verdict: matches
  call: keep
  value: 5.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'IST.352' and code = 'research'"
- id: IST.352-06
  target:
    table: grade_components
    key: {course_id: "IST.352", code: project_deliverables}
    field: weight_pct
  stored: 60.00
  materials: "Project Assignments Deliverables 60%"
  citation: "bb_file:27#unit:1"
  quote: "Project Plans (Bonus Material) | 60%"
  verdict: matches
  call: keep
  value: 60.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'IST.352' and code = 'project_deliverables'"
- id: IST.352-07
  target:
    table: grade_components
    key: {course_id: "IST.352", code: project_final}
    field: weight_pct
  stored: 10.00
  materials: "Project Presentation / Final Version of Deliverables 10%"
  citation: "bb_file:27#unit:1"
  quote: "Project Presentation / Final Version of Project Deliverables | 10%"
  verdict: matches
  call: keep
  value: 10.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'IST.352' and code = 'project_final'"
- id: IST.352-08
  target:
    table: grade_components
    key: {course_id: "IST.352", code: peer_assessment}
    field: weight_pct
  stored: 10.00
  materials: "Project Self / Peer Assessment 10%"
  citation: "bb_file:27#unit:1"
  quote: "Project Self / Peer Assessment | 10%"
  verdict: matches
  call: keep
  value: 10.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'IST.352' and code = 'peer_assessment'"
- id: IST.352-09
  target:
    table: grade_components
    key: {course_id: "IST.352", code: attendance}
    field: weight_pct
  stored: 15.00
  materials: "Attendance, Class Contribution 15%"
  citation: "bb_file:27#unit:1"
  quote: "Attendance, Class Contribution | 15%"
  verdict: matches
  call: keep
  value: 15.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'IST.352' and code = 'attendance'"
- id: IST.352-10
  target:
    table: grading_schemes
    key: {course_id: "IST.352"}
    field: "check: top-level weights sum to 100"
  stored: 100
  materials: "5+60+10+10+15 = 100"
  citation: "bb_file:27#unit:1"
  quote: "Total | 100%"
  verdict: matches
  call: keep
  value: 100
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The weights sum to 100."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select sum(weight_pct) from grade_components where course_id = 'IST.352' and parent_id is null"
- id: IST.352-11
  target:
    table: grade_components
    key: {course_id: "IST.352", code: "*"}
    field: drop_lowest
  stored: 0
  materials: "not in materials"
  citation: null
  quote: null
  verdict: not_in_materials
  call: keep
  value: 0
  reason_code: NOT_IN_MATERIALS
  why: "Keep."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count(*) from grade_components where course_id = 'IST.352' and drop_lowest <> 0"
- id: IST.352-12
  target:
    table: grade_components
    key: {course_id: "IST.352", code: project_deliverables}
    field: notes
  stored: false
  materials: "Three deliverables marked Bonus Material; how they count is not stated"
  citation: "bb_file:27#unit:1"
  quote: "Event Model (Bonus Material)"
  verdict: materials_say_more
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "A sounds correct. Notes text for 106: Existing notes + 'Bonus items add to earned points only (note only, not computed: the figure applies no 100 percent cap).'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: tentative
  recheck: "select notes like '%Bonus items add to earned points only%' from grade_components where course_id = 'IST.352' and code = 'project_deliverables'"
- id: IST.352-13
  target:
    table: grade_components
    key: {course_id: "IST.352", code: attendance}
    field: notes
  stored: false
  materials: "Only the make-up rule is stated; no scored gradebook column exists"
  citation: "bb_file:27#unit:1"
  quote: "This option can only be used once during the semester."
  verdict: not_in_materials
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "a. Notes text for 106: Existing notes + 'No scored gradebook column: shown as not yet graded; standing computed over the other 85 percent.'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%shown as not yet graded%' from grade_components where course_id = 'IST.352' and code = 'attendance'"
- id: IST.352-14
  target:
    table: assignments
    key: {id: "IST.352/role-of-systems-analyst"}
    field: "component_id / points_possible"
  stored: "29 / 5.00"
  materials: "Research - Role of Systems Analyst, 5%"
  citation: "bb_file:27#unit:1"
  quote: "Research – Role of Systems Analyst | 5%"
  verdict: matches
  call: keep
  value: "29 / 5.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The research assignment feeds the research component."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/role-of-systems-analyst'"
- id: IST.352-15
  target:
    table: assignments
    key: {id: "IST.352/project-1a"}
    field: "component_id / points_possible"
  stored: "30 / 10.00"
  materials: "A Project Assignment deliverable"
  citation: "bb_file:27#unit:1"
  quote: "Project Assignments Deliverables"
  verdict: matches
  call: keep
  value: "30 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Project Assignment belongs to the deliverables component."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/project-1a'"
- id: IST.352-16
  target:
    table: assignments
    key: {id: "IST.352/project-assignment-2a-project-resources-risks"}
    field: "component_id / points_possible"
  stored: "30 / 10.00"
  materials: "A Project Assignment deliverable"
  citation: "bb_file:27#unit:1"
  quote: "Project Assignments Deliverables"
  verdict: matches
  call: keep
  value: "30 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Project Assignment belongs to the deliverables component."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/project-assignment-2a-project-resources-risks'"
- id: IST.352-17
  target:
    table: assignments
    key: {id: "IST.352/project-assignment-3-business-case"}
    field: "component_id / points_possible"
  stored: "30 / 10.00"
  materials: "Business Case (Short Version) is a listed deliverable"
  citation: "bb_file:27#unit:1"
  quote: "Business Case (Short Version)"
  verdict: matches
  call: keep
  value: "30 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A listed deliverable."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/project-assignment-3-business-case'"
- id: IST.352-18
  target:
    table: assignments
    key: {id: "IST.352/project-assignment-4-project-charter"}
    field: "component_id / points_possible"
  stored: "30 / 10.00"
  materials: "Project Charter is a listed deliverable"
  citation: "bb_file:27#unit:1"
  quote: "Project Charter"
  verdict: matches
  call: keep
  value: "30 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A listed deliverable."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/project-assignment-4-project-charter'"
- id: IST.352-19
  target:
    table: assignments
    key: {id: "IST.352/project-assignment-5-communication-plan"}
    field: "component_id / points_possible"
  stored: "30 / 10.00"
  materials: "Communication Plan is a listed deliverable"
  citation: "bb_file:27#unit:1"
  quote: "Communication Plan"
  verdict: matches
  call: keep
  value: "30 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A listed deliverable."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/project-assignment-5-communication-plan'"
- id: IST.352-20
  target:
    table: assignments
    key: {id: "IST.352/project-assignment-6-hl-processes"}
    field: "component_id / points_possible"
  stored: "30 / 10.00"
  materials: "High-Level Processes is a listed deliverable"
  citation: "bb_file:27#unit:1"
  quote: "High-Level Processes"
  verdict: matches
  call: keep
  value: "30 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A listed deliverable."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/project-assignment-6-hl-processes'"
- id: IST.352-21
  target:
    table: assignments
    key: {id: "IST.352/project-assignment-7-interview-questions"}
    field: "component_id / points_possible"
  stored: "30 / 10.00"
  materials: "A Project Assignment deliverable"
  citation: "bb_file:27#unit:1"
  quote: "Project Assignments Deliverables"
  verdict: matches
  call: keep
  value: "30 / 10.00"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A Project Assignment belongs to the deliverables component."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/project-assignment-7-interview-questions'"
- id: IST.352-22
  target:
    table: assignments
    key: {id: "IST.352/term-project"}
    field: component_id
  stored: 30
  materials: "The team project that the deliverables build"
  citation: "bb_file:27#unit:1"
  quote: "Project Assignments Deliverables"
  verdict: matches
  call: keep
  value: 30
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "A placeholder for the team project, with no points."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.352/term-project'"
- id: IST.352-23
  target:
    table: assignments
    key: {id: "IST.352/knowledge-check-2026-08-26"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Knowledge checks appear only as class agenda items"
  citation: "bb_file:70#unit:2"
  quote: "Knowledge Check (5 min.)"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/knowledge-check-2026-08-26'"
- id: IST.352-24
  target:
    table: assignments
    key: {id: "IST.352/knowledge-check-2026-08-31"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Knowledge checks appear only as class agenda items"
  citation: "bb_file:70#unit:2"
  quote: "Knowledge Check (5 min.)"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/knowledge-check-2026-08-31'"
- id: IST.352-25
  target:
    table: assignments
    key: {id: "IST.352/knowledge-check-2026-09-02"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Knowledge checks appear only as class agenda items"
  citation: "bb_file:70#unit:2"
  quote: "Knowledge Check (5 min.)"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/knowledge-check-2026-09-02'"
- id: IST.352-26
  target:
    table: assignments
    key: {id: "IST.352/knowledge-check-09-09-2026"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Knowledge checks appear only as class agenda items"
  citation: "bb_file:70#unit:2"
  quote: "Knowledge Check (5 min.)"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/knowledge-check-09-09-2026'"
- id: IST.352-27
  target:
    table: assignments
    key: {id: "IST.352/knowledge-check-09-14-26"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Knowledge checks appear only as class agenda items"
  citation: "bb_file:70#unit:2"
  quote: "Knowledge Check (5 min.)"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/knowledge-check-09-14-26'"
- id: IST.352-28
  target:
    table: assignments
    key: {id: "IST.352/knowledge-check-09-16-2026"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Knowledge checks appear only as class agenda items"
  citation: "bb_file:70#unit:2"
  quote: "Knowledge Check (5 min.)"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/knowledge-check-09-16-2026'"
- id: IST.352-29
  target:
    table: assignments
    key: {id: "IST.352/knowledge-check-09-21-26"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Knowledge checks appear only as class agenda items"
  citation: "bb_file:70#unit:2"
  quote: "Knowledge Check (5 min.)"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/knowledge-check-09-21-26'"
- id: IST.352-30
  target:
    table: assignments
    key: {id: "IST.352/knowledge-check-09-23-26"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Knowledge checks appear only as class agenda items"
  citation: "bb_file:70#unit:2"
  quote: "Knowledge Check (5 min.)"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/knowledge-check-09-23-26'"
- id: IST.352-31
  target:
    table: assignments
    key: {id: "IST.352/knowledge-check-09-28-26"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Knowledge checks appear only as class agenda items"
  citation: "bb_file:70#unit:2"
  quote: "Knowledge Check (5 min.)"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/knowledge-check-09-28-26'"
- id: IST.352-32
  target:
    table: assignments
    key: {id: "IST.352/reading-ch1"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Readings link to attendance only through the one-time make-up report"
  citation: "bb_file:27#unit:1"
  quote: "one-page report summary for the reading assignment"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/reading-ch1'"
- id: IST.352-33
  target:
    table: assignments
    key: {id: "IST.352/reading-ch1-all"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Readings link to attendance only through the one-time make-up report"
  citation: "bb_file:27#unit:1"
  quote: "one-page report summary for the reading assignment"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/reading-ch1-all'"
- id: IST.352-34
  target:
    table: assignments
    key: {id: "IST.352/reading-ch2"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Readings link to attendance only through the one-time make-up report"
  citation: "bb_file:27#unit:1"
  quote: "one-page report summary for the reading assignment"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/reading-ch2'"
- id: IST.352-35
  target:
    table: assignments
    key: {id: "IST.352/reading-chapter-3"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Readings link to attendance only through the one-time make-up report"
  citation: "bb_file:27#unit:1"
  quote: "one-page report summary for the reading assignment"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/reading-chapter-3'"
- id: IST.352-36
  target:
    table: assignments
    key: {id: "IST.352/reading-chapter-4"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Readings link to attendance only through the one-time make-up report"
  citation: "bb_file:27#unit:1"
  quote: "one-page report summary for the reading assignment"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/reading-chapter-4'"
- id: IST.352-37
  target:
    table: assignments
    key: {id: "IST.352/reading-chapter-6-pp-91-98"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Readings link to attendance only through the one-time make-up report"
  citation: "bb_file:27#unit:1"
  quote: "one-page report summary for the reading assignment"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/reading-chapter-6-pp-91-98'"
- id: IST.352-38
  target:
    table: assignments
    key: {id: "IST.352/read-chapter-7-pp-108-111"}
    field: "component_id / points_possible"
  stored: "33 / 0.00"
  materials: "Readings link to attendance only through the one-time make-up report"
  citation: "bb_file:27#unit:1"
  quote: "one-page report summary for the reading assignment"
  verdict: not_in_materials
  call: keep
  value: "33 / 0.00"
  reason_code: STACK_OVERRIDE
  why: "Leave them as 0 for now."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id || ' / ' || points_possible from assignments where id = 'IST.352/read-chapter-7-pp-108-111'"
- id: IST.352-39
  target:
    table: assignments
    key: {id: "IST.352/moving-tasks"}
    field: component_id
  stored: null
  materials: "In-class HL project-plan exercise; separate column (_3615326_1, 9/16) from Moving Tasks - Processes"
  citation: "bb_file:72#unit:21"
  quote: "Detail a high-level (HL) project plan for moving from Syracuse, NY"
  verdict: not_in_materials
  call: mark_ungraded
  value: null
  reason_code: STACK_OVERRIDE
  why: "Ensure it isn't doubled but leave it as ungraded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.352/moving-tasks'"
- id: IST.352-40
  target:
    table: assignments
    key: {id: "IST.352/moving-tasks-processes"}
    field: component_id
  stored: null
  materials: "No document names a Processes follow-up; separate column (_3619706_1, 9/23) from Moving Tasks"
  citation: "bb_file:72#unit:21"
  quote: "Detail a high-level (HL) project plan for moving from Syracuse, NY"
  verdict: not_in_materials
  call: mark_ungraded
  value: null
  reason_code: STACK_OVERRIDE
  why: "Ensure it isn't doubled but leave it as ungraded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.352/moving-tasks-processes'"
- id: IST.352-41
  target:
    table: assignments
    key: {id: "IST.352/team-and-project-selection"}
    field: component_id
  stored: null
  materials: "Form-your-own-team path, due Sept 1; an alternative to the team request, not a duplicate"
  citation: "bb_file:30#unit:4"
  quote: "will email the names of the team members, which project option"
  verdict: not_in_materials
  call: mark_ungraded
  value: null
  reason_code: STACK_OVERRIDE
  why: "Ensure it isn't doubled but leave it as ungraded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.352/team-and-project-selection'"
- id: IST.352-42
  target:
    table: assignments
    key: {id: "IST.352/team-request"}
    field: component_id
  stored: null
  materials: "Request-a-team path, due Aug 30; an alternative to team selection, not a duplicate"
  citation: "bb_file:30#unit:4"
  quote: "want to be assigned to a group will notify me by August 30"
  verdict: not_in_materials
  call: mark_ungraded
  value: null
  reason_code: STACK_OVERRIDE
  why: "Ensure it isn't doubled but leave it as ungraded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'IST.352/team-request'"
```
