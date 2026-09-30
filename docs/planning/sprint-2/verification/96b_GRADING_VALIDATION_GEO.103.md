# 96b — V-1 grading validation: GEO.103 (lecture + recitation)

Sitting date: 2026-09-29 · Export read: `96a_GRADING_SCHEMA_EXPORT_2026-09-29.md` · Syllabus: `bb_file:42` (`GEO 103 (2026) - syllabus - FINAL.pdf`; page n = unit n) and `bb_file:22` (`Discussion Section Syllabus Fall 2026.docx`, section M003)

GEO.103.lecture and GEO.103.recitation share this file (brief 63). The recitation has no scheme of its own; its grades roll into the lecture scheme.

Export §6 questions for this course: Q1 (GEO attendance columns) is rows GEO.103-17 and -18; Q9 (recitation has no scheme) is row GEO.103-16.

## Amendments (PM, 2026-09-29)

* GEO.103-02 (letter_scale stored/value: the human list → prod's exact `letter_scale::text`, what the recheck returns).
* GEO.103-03 (ai_policy stored/value → null: prod's `grading_schemes.ai_policy` is null since migration 119_strip_ai_policy_passages, 2026-09-29).
* GEO.103-04 (stored/value → false/true: the recheck is a `like` test; the notes text moved to `why`).
* GEO.103-25 (stored/value → false/true: the recheck is a `like` test; the notes text moved to `why`).
* GEO.103-06 (note reworded: excluded ("Not graded") until Stack relinks the column; a posted score does not count while excluded): P-3, "Not graded" is a link row; stored/value → false/true, the recheck being a `like` test.
* GEO.103-08 (note reworded: excluded ("Not graded") until Stack relinks the column; a posted score does not count while excluded): P-3, "Not graded" is a link row; stored/value → false/true, the recheck being a `like` test.
* GEO.103-17 (retargeted from `assignments.component_id` → null to `grade_column_links` (GEO.103.lecture, _3602583_1) `excluded` true; stored false = no row today): DECISIONS (Phase 16, P-3), "Not graded" is an excluded link row, which migration 105 inserts.
* GEO.103-18 (retargeted from `assignments.component_id` → null to `grade_column_links` (GEO.103.recitation, _3602445_1) `excluded` true; stored false = no row today): DECISIONS (Phase 16, P-3), "Not graded" is an excluded link row, which migration 105 inserts.
* GEO.103-17, -18: `stored` true — migration 105 applied the two "Not graded" links on 2026-09-30 (task 20: prod moved since the sitting).

## Reconciliation table

| id | target | field | stored | materials say | citation | verdict | call | why |
|---|---|---|---|---|---|---|---|---|
| GEO.103-01 | grading_schemes GEO.103.lecture | method | weighted_pct | six weighted items totalling 100% | `bb_file:42#unit:2` | matches | keep | — |
| GEO.103-02 | grading_schemes GEO.103.lecture | letter_scale | A 94 … C- 70, D 60, F 0 (10 steps) | same 10 cut-offs | `bb_file:42#unit:2` | matches | keep | — |
| GEO.103-03 | grading_schemes GEO.103.lecture | ai_policy | study aids allowed; no AI or technology in quizzes/exams | same | `bb_file:42#unit:10` | matches | keep | — |
| GEO.103-04 | grading_schemes GEO.103.lecture | notes | recitation rolls in; quizzes; TA rubric; section environment | also: repeated phone use can cost significant deductions or a zero on participation | `bb_file:42#unit:4` | materials_say_more | change_to (notes + phone rule) | Stack: note only. |
| GEO.103-05 | grade_components GEO.103.lecture / lecture_attendance | weight_pct | 5.00 | 5% Lecture Attendance | `bb_file:42#unit:2` | matches | keep | — |
| GEO.103-06 | grade_components GEO.103.lecture / lecture_attendance | notes | Qwickly; 3 free absences | 3 free; further absences deducted (amount not stated) | `bb_file:42#unit:3` | materials_say_more | change_to (notes + not-yet-graded) | Stack: likely not updated frequently; leave the Absences column ungraded; no estimate (Q2). |
| GEO.103-07 | grade_components GEO.103.lecture / section_participation | weight_pct | 15.00 | 15% Discussion Section: Attendance and Participation | `bb_file:42#unit:2` | matches | keep | — |
| GEO.103-08 | grade_components GEO.103.lecture / section_participation | notes | earned in section M003; TA sets criteria | A–F rubric; absences lower the grade | `bb_file:22#unit:1` | materials_say_more | change_to (notes + TA-posted grade only) | Stack Q1: use whatever the TA posts in the gradebook. |
| GEO.103-09 | grade_components GEO.103.lecture / reading_quizzes | weight_pct | 10.00 | 10% Reading Quizzes | `bb_file:42#unit:2` | matches | keep | — |
| GEO.103-10 | grade_components GEO.103.lecture / reading_quizzes | count_expected | 5 | five or so, unannounced | `bb_file:42#unit:3` | matches | keep | — |
| GEO.103-11 | grade_components GEO.103.lecture / reading_quizzes | drop_lowest | 1 | lowest score or a zero dropped | `bb_file:42#unit:3` | matches | keep | — |
| GEO.103-12 | grade_components GEO.103.lecture / exam_1 | weight_pct | 20.00 | 20% First Exam | `bb_file:42#unit:2` | matches | keep | — |
| GEO.103-13 | grade_components GEO.103.lecture / exam_2 | weight_pct | 20.00 | 20% Second Exam | `bb_file:42#unit:2` | matches | keep | — |
| GEO.103-14 | grade_components GEO.103.lecture / final_exam | weight_pct | 30.00 | 30% Final Exam | `bb_file:42#unit:2` | matches | keep | — |
| GEO.103-15 | grading_schemes GEO.103.lecture | check: top-level weights = 100 | 100 | 5+15+10+20+20+30 = 100 | `bb_file:42#unit:2` | matches | keep | — |
| GEO.103-16 | grading_schemes GEO.103.recitation | scheme row | none | section grade is 15% of the one course grade | `bb_file:22#unit:1` | matches | keep | — |
| GEO.103-17 | grade_column_links GEO.103.lecture / _3602583_1 | excluded | — (no row; the Absences column feeds component 4) | attendance is by absences; the column reads as a count | `bb_file:42#unit:3` | not_in_materials | mark_ungraded | Stack: likely not updated frequently. Leave as ungraded. |
| GEO.103-18 | grade_column_links GEO.103.recitation / _3602445_1 | excluded | — (no row; the Attendance column feeds component 5) | section grade is the TA's rubric grade | `bb_file:22#unit:1` | not_in_materials | mark_ungraded | Stack: same as A (likely not updated frequently; leave as ungraded). |
| GEO.103-19 | assignments GEO.103/exam-1 | component_id | 7 | first exam | `bb_file:42#unit:3` | matches | keep | — |
| GEO.103-20 | assignments GEO.103/exam-2 | component_id | 8 | second exam | `bb_file:42#unit:3` | matches | keep | — |
| GEO.103-21 | assignments GEO.103/final-exam | component_id | 9 | final exam | `bb_file:42#unit:3` | matches | keep | — |
| GEO.103-22 | assignments GEO.103/carbon-footprint-activity | component_id | 5 (no points) | results handed in during section | `bb_file:42#unit:5` | matches | keep | — |
| GEO.103-23 | assignments GEO.103/discussion-questions | component_id | 5 (no points, inferred) | reading prompts; nothing handed in | `bb_file:42#unit:3` | not_in_materials | mark_ungraded | Stack: ungraded. |
| GEO.103-24 | assignments GEO.103/reading-quiz-series | component_id | 6 (no points, inferred) | unannounced quizzes; none posted by week 5 | `bb_file:42#unit:3` | not_in_materials | keep | Stack: keep for now, but note that nothing exists 5 weeks into the semester. |
| GEO.103-25 | grade_components GEO.103.lecture / reading_quizzes | notes | ~5 unannounced; lowest (or a missed zero) dropped | same; no quiz posted as of 2026-09-29 | `bb_file:42#unit:3` | materials_say_more | change_to (notes + none posted) | Stack: note that nothing exists 5 weeks into the semester. |

## Questions

* **id:** GEO.103-Q1
* **question:** Section participation is graded on an A–F rubric. How does it become a share of the 15%?
* **what it blocks:** GEO.103-07, GEO.103-08, GEO.103-18
* **evidence found:** `bb_file:22#unit:1` "this is how we will determine your participation grade" (A–F descriptions); no numeric mapping
* **options:** (a) use the TA's posted gradebook value; (b) (a), but map a bare letter to the midpoint of its range; (c) ask the TA
* **recommendation:** (b), `tentative`
* **default if unanswered:** (a)
* **Stack's answer:** Use whatever the TA posts in the gradebook.
* **date:** 2026-09-29
* **DECISIONS row?:** yes

* **id:** GEO.103-Q2
* **question:** Lecture-attendance deductions beyond three absences are unspecified. Should the app estimate them?
* **what it blocks:** GEO.103-06, GEO.103-17
* **evidence found:** `bb_file:42#unit:3` "Any additional absences will lead to deductions from your lecture attendance grade."
* **options:** (a) no estimate, show only the posted score; (b) estimate a deduction per extra absence
* **recommendation:** (a)
* **default if unanswered:** (a)
* **Stack's answer:** no.
* **date:** 2026-09-29
* **DECISIONS row?:** no

## Machine block

```yaml
- id: GEO.103-01
  target:
    table: grading_schemes
    key: {course_id: "GEO.103.lecture"}
    field: method
  stored: weighted_pct
  materials: "Six weighted items totalling 100%"
  citation: "bb_file:42#unit:2"
  quote: "30% Final Exam"
  verdict: matches
  call: keep
  value: weighted_pct
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus grades by percentage weights."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select method from grading_schemes where course_id = 'GEO.103.lecture'"
- id: GEO.103-02
  target:
    table: grading_schemes
    key: {course_id: "GEO.103.lecture"}
    field: letter_scale
  stored: "[{\"min\": 94, \"letter\": \"A\"}, {\"min\": 90, \"letter\": \"A-\"}, {\"min\": 87, \"letter\": \"B+\"}, {\"min\": 83, \"letter\": \"B\"}, {\"min\": 80, \"letter\": \"B-\"}, {\"min\": 77, \"letter\": \"C+\"}, {\"min\": 73, \"letter\": \"C\"}, {\"min\": 70, \"letter\": \"C-\"}, {\"min\": 60, \"letter\": \"D\"}, {\"min\": 0, \"letter\": \"F\"}]"
  materials: "A 94-100, A- 90-93, B+ 87-89, B 83-86, B- 80-82, C+ 77-79, C 73-76, C- 70-72, D 60-69, F 0-59"
  citation: "bb_file:42#unit:2"
  quote: "D (60-69)"
  verdict: matches
  call: keep
  value: "[{\"min\": 94, \"letter\": \"A\"}, {\"min\": 90, \"letter\": \"A-\"}, {\"min\": 87, \"letter\": \"B+\"}, {\"min\": 83, \"letter\": \"B\"}, {\"min\": 80, \"letter\": \"B-\"}, {\"min\": 77, \"letter\": \"C+\"}, {\"min\": 73, \"letter\": \"C\"}, {\"min\": 70, \"letter\": \"C-\"}, {\"min\": 60, \"letter\": \"D\"}, {\"min\": 0, \"letter\": \"F\"}]"
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "All ten cut-offs match the syllabus."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select letter_scale::text from grading_schemes where course_id = 'GEO.103.lecture'"
- id: GEO.103-03
  target:
    table: grading_schemes
    key: {course_id: "GEO.103.lecture"}
    field: ai_policy
  stored: null
  materials: "Study aids from readings allowed; no AI or technology on in-class quizzes or exams"
  citation: "bb_file:42#unit:10"
  quote: "you may not use AI on the in-class quizzes or exams."
  verdict: matches
  call: keep
  value: null
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus states the same policy."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select ai_policy from grading_schemes where course_id = 'GEO.103.lecture'"
- id: GEO.103-04
  target:
    table: grading_schemes
    key: {course_id: "GEO.103.lecture"}
    field: notes
  stored: false
  materials: "Repeated phone use in lecture can cost significant deductions or a zero on participation"
  citation: "bb_file:42#unit:4"
  quote: "significant deductions, or even a zero, on your course participation grade"
  verdict: materials_say_more
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "Note only. Notes text for 106: Existing notes + 'Lecture phone use: repeated infractions can bring significant deductions or a zero on participation (note only, not computed).'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%repeated infractions can bring significant deductions or a zero on participation%' from grading_schemes where course_id = 'GEO.103.lecture'"
- id: GEO.103-05
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: lecture_attendance}
    field: weight_pct
  stored: 5.00
  materials: "5% Lecture Attendance"
  citation: "bb_file:42#unit:2"
  quote: "5% Lecture Attendance"
  verdict: matches
  call: keep
  value: 5.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'GEO.103.lecture' and code = 'lecture_attendance'"
- id: GEO.103-06
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: lecture_attendance}
    field: notes
  stored: false
  materials: "Three free absences; further absences deducted by an unstated amount"
  citation: "bb_file:42#unit:3"
  quote: "Any additional absences will lead to deductions from your lecture attendance grade."
  verdict: materials_say_more
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "Likely not updated frequently. Leave as ungraded. Notes text for 106: Existing notes + 'Absences column (_3602583_1) is an absence count, not a score: excluded (\"Not graded\") until Stack relinks the column; a posted score does not count while excluded; no estimated deductions.'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%is an absence count, not a score%' from grade_components where course_id = 'GEO.103.lecture' and code = 'lecture_attendance'"
- id: GEO.103-07
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: section_participation}
    field: weight_pct
  stored: 15.00
  materials: "15% Discussion Section: Attendance and Participation"
  citation: "bb_file:42#unit:2"
  quote: "15% Discussion Section: Attendance and Participation"
  verdict: matches
  call: keep
  value: 15.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight, restated by the section syllabus."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'GEO.103.lecture' and code = 'section_participation'"
- id: GEO.103-08
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: section_participation}
    field: notes
  stored: false
  materials: "A-F rubric; absences lower the grade"
  citation: "bb_file:22#unit:1"
  quote: "Absences will lower your grade."
  verdict: materials_say_more
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "Use whatever the TA posts in the gradebook. Notes text for 106: Existing notes + 'Scored only from the grade the TA posts in the gradebook; not yet graded until then. The recitation Attendance column (_3602445_1) is excluded (\"Not graded\") until Stack relinks the column; a posted score does not count while excluded.'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%Scored only from the grade the TA posts in the gradebook%' from grade_components where course_id = 'GEO.103.lecture' and code = 'section_participation'"
- id: GEO.103-09
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: reading_quizzes}
    field: weight_pct
  stored: 10.00
  materials: "10% Reading Quizzes"
  citation: "bb_file:42#unit:2"
  quote: "10% Reading Quizzes"
  verdict: matches
  call: keep
  value: 10.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'GEO.103.lecture' and code = 'reading_quizzes'"
- id: GEO.103-10
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: reading_quizzes}
    field: count_expected
  stored: 5
  materials: "Five or so unannounced reading quizzes"
  citation: "bb_file:42#unit:3"
  quote: "we will give five or so reading quizzes in the discussion sections"
  verdict: matches
  call: keep
  value: 5
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus count (approximate)."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count_expected from grade_components where course_id = 'GEO.103.lecture' and code = 'reading_quizzes'"
- id: GEO.103-11
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: reading_quizzes}
    field: drop_lowest
  stored: 1
  materials: "Lowest quiz score, or a zero for a missed quiz, dropped"
  citation: "bb_file:42#unit:3"
  quote: "We will drop your lowest quiz score or a zero for missing a quiz"
  verdict: matches
  call: keep
  value: 1
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus drop rule."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select drop_lowest from grade_components where course_id = 'GEO.103.lecture' and code = 'reading_quizzes'"
- id: GEO.103-12
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: exam_1}
    field: weight_pct
  stored: 20.00
  materials: "20% First Exam"
  citation: "bb_file:42#unit:2"
  quote: "20% First Exam"
  verdict: matches
  call: keep
  value: 20.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'GEO.103.lecture' and code = 'exam_1'"
- id: GEO.103-13
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: exam_2}
    field: weight_pct
  stored: 20.00
  materials: "20% Second Exam"
  citation: "bb_file:42#unit:2"
  quote: "20% Second Exam"
  verdict: matches
  call: keep
  value: 20.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'GEO.103.lecture' and code = 'exam_2'"
- id: GEO.103-14
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: final_exam}
    field: weight_pct
  stored: 30.00
  materials: "30% Final Exam"
  citation: "bb_file:42#unit:2"
  quote: "30% Final Exam"
  verdict: matches
  call: keep
  value: 30.00
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The syllabus weight."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select weight_pct from grade_components where course_id = 'GEO.103.lecture' and code = 'final_exam'"
- id: GEO.103-15
  target:
    table: grading_schemes
    key: {course_id: "GEO.103.lecture"}
    field: "check: top-level weights sum to 100"
  stored: 100
  materials: "5+15+10+20+20+30 = 100"
  citation: "bb_file:42#unit:2"
  quote: "10% Reading Quizzes"
  verdict: matches
  call: keep
  value: 100
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "The weights sum to 100."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select sum(weight_pct) from grade_components where course_id = 'GEO.103.lecture' and parent_id is null"
- id: GEO.103-16
  target:
    table: grading_schemes
    key: {course_id: "GEO.103.recitation"}
    field: "check: no scheme row"
  stored: 0
  materials: "The section grade is 15% of the single course grade"
  citation: "bb_file:22#unit:1"
  quote: "Attendance and participation in discussion section is 15% of your final grade"
  verdict: matches
  call: keep
  value: 0
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Export Q9: the recitation rolls into the lecture scheme."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select count(*) from grading_schemes where course_id = 'GEO.103.recitation'"
- id: GEO.103-17
  target:
    table: grade_column_links
    key: {course_id: "GEO.103.lecture", column_id: "_3602583_1"}
    field: excluded
  stored: true
  materials: "Lecture attendance is scored by absences; the column reads as an absence count"
  citation: "bb_file:42#unit:3"
  quote: "You can miss three lectures, no questions asked."
  verdict: not_in_materials
  call: mark_ungraded
  value: true
  reason_code: STACK_OVERRIDE
  why: "Likely not updated frequently. Leave as ungraded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select coalesce((select excluded from grade_column_links where course_id = 'GEO.103.lecture' and column_id = '_3602583_1' and component_id is null), false)"
- id: GEO.103-18
  target:
    table: grade_column_links
    key: {course_id: "GEO.103.recitation", column_id: "_3602445_1"}
    field: excluded
  stored: true
  materials: "The section grade is the TA's rubric grade; absences lower it"
  citation: "bb_file:22#unit:1"
  quote: "Absences will lower your grade."
  verdict: not_in_materials
  call: mark_ungraded
  value: true
  reason_code: STACK_OVERRIDE
  why: "Same as A: likely not updated frequently. Leave as ungraded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select coalesce((select excluded from grade_column_links where course_id = 'GEO.103.recitation' and column_id = '_3602445_1' and component_id is null), false)"
- id: GEO.103-19
  target:
    table: assignments
    key: {id: "GEO.103/exam-1"}
    field: component_id
  stored: 7
  materials: "Two exams and a final"
  citation: "bb_file:42#unit:3"
  quote: "There are two exams in the course and a final exam."
  verdict: matches
  call: keep
  value: 7
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to the first exam."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'GEO.103/exam-1'"
- id: GEO.103-20
  target:
    table: assignments
    key: {id: "GEO.103/exam-2"}
    field: component_id
  stored: 8
  materials: "Two exams and a final"
  citation: "bb_file:42#unit:3"
  quote: "There are two exams in the course and a final exam."
  verdict: matches
  call: keep
  value: 8
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to the second exam."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'GEO.103/exam-2'"
- id: GEO.103-21
  target:
    table: assignments
    key: {id: "GEO.103/final-exam"}
    field: component_id
  stored: 9
  materials: "Two exams and a final"
  citation: "bb_file:42#unit:3"
  quote: "There are two exams in the course and a final exam."
  verdict: matches
  call: keep
  value: 9
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Linked to the final exam."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'GEO.103/final-exam'"
- id: GEO.103-22
  target:
    table: assignments
    key: {id: "GEO.103/carbon-footprint-activity"}
    field: component_id
  stored: 5
  materials: "Calculator results handed in during the discussion section"
  citation: "bb_file:42#unit:5"
  quote: "You will hand in your results during the discussion section."
  verdict: matches
  call: keep
  value: 5
  reason_code: SYLLABUS_AUTHORITATIVE
  why: "Handed in at section, so it belongs to section participation; no points of its own."
  decided_by: session
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'GEO.103/carbon-footprint-activity'"
- id: GEO.103-23
  target:
    table: assignments
    key: {id: "GEO.103/discussion-questions"}
    field: component_id
  stored: 5
  materials: "Reading prompts posted by the professor; nothing handed in"
  citation: "bb_file:42#unit:3"
  quote: "I will post 4 or 5 questions on the GEO 103 Blackboard"
  verdict: not_in_materials
  call: mark_ungraded
  value: null
  reason_code: STACK_OVERRIDE
  why: "Ungraded."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'GEO.103/discussion-questions'"
- id: GEO.103-24
  target:
    table: assignments
    key: {id: "GEO.103/reading-quiz-series"}
    field: component_id
  stored: 6
  materials: "Unannounced quizzes; none posted by week 5"
  citation: "bb_file:42#unit:3"
  quote: "We will not announce these quizzes in advance."
  verdict: not_in_materials
  call: keep
  value: 6
  reason_code: STACK_OVERRIDE
  why: "Keep for now but note that nothing exists 5 weeks into the semester."
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select component_id from assignments where id = 'GEO.103/reading-quiz-series'"
- id: GEO.103-25
  target:
    table: grade_components
    key: {course_id: "GEO.103.lecture", code: reading_quizzes}
    field: notes
  stored: false
  materials: "Same rule; no reading quiz posted as of 2026-09-29 (week 5)"
  citation: "bb_file:42#unit:3"
  quote: "we will give five or so reading quizzes in the discussion sections"
  verdict: materials_say_more
  call: change_to
  value: true
  reason_code: STACK_OVERRIDE
  why: "Note that nothing exists 5 weeks into the semester. Notes text for 106: Existing notes + 'As of 2026-09-29 (week 5) no reading quiz is posted; the series placeholder stays until one is, and has no points.'"
  decided_by: Stack
  decided_on: 2026-09-29
  confidence_after: confirmed
  recheck: "select notes like '%As of 2026-09-29 (week 5) no reading quiz is posted%' from grade_components where course_id = 'GEO.103.lecture' and code = 'reading_quizzes'"
```
