# 96d — V-1 grading validation summary (Phase 16)

Six sittings on 2026-09-29, in order IST.323, IST.466, IST.352, ECN.304, GEO.103 (lecture + recitation),
IST.471. Verdict files are `96b_GRADING_VALIDATION_<course>.md`, amended the same day to Stack's
post-sitting answers (each file's `## Amendments` names what changed). Claim under test:
`../evidence/96a_GRADING_SCHEMA_EXPORT_2026-09-29.md`. Migration `db/migrations/106_grading_reconciliation.sql`
writes what follows; `db/tests/phase16_106_v1_recheck.sql` re-checks every entry.

## Counts

Printed by `uv run --with pyyaml python scripts/v1_recheck.py --summary docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_*.md`
(`--compare` checks this table verbatim). Counted per distinct target row. **Taken after 105 was applied (2026-09-30):** the two GEO "Not graded" links (GEO.103-17, -18)
are on prod, so they count under "already applied", not as corrections (task 20).

| count | n |
|---|---|
| target rows | 143 |
| machine-block entries | 211 |
| entries differs | 16 |
| entries matches | 137 |
| entries materials_say_more | 15 |
| entries not_in_materials | 43 |
| corrections | 26 |
| citation-only | 110 |
| left tentative | 0 |
| already applied | 8 |

already applied: grade_column_links GEO.103.lecture/_3602583_1 (GEO.103-17)
already applied: grade_column_links GEO.103.recitation/_3602445_1 (GEO.103-18)
already applied: assignments IST.323/assignment-1 (IST.323-23)
already applied: assignments IST.323/presentation-choice (IST.323-26)
already applied: assignments IST.352/moving-tasks (IST.352-39)
already applied: assignments IST.352/moving-tasks-processes (IST.352-40)
already applied: assignments IST.352/team-and-project-selection (IST.352-41)
already applied: assignments IST.352/team-request (IST.352-42)

## Corrections, in plain statements

**IST.323**

* Final Project parts re-cut (B-12): proposal (component 18) 11 → **13** points, final log (19) 3 → **1**;
  Final Project stays 20. The 13-point Blackboard column stays linked to the proposal and counts in full
  when it is graded on 2026-12-03.
* The completed log's 2 points move with it: `IST.323/fp-log-final` component 19 → **18**; the final-log part keeps one slot, the 1-point checkpoint (`count_expected` 2 → **1**), and its note says so.
* Participation note gains the attendance rule: each absence beyond two lowers participation one letter
  (note only, not computed).

**IST.466**

* Participation (component 23): `sum` → **`normalized`**, no fixed count (was 10), scaled to the syllabus
  **100**; fed by the 150-point Class Participation column, now linked to it (**assignment
  `IST.466/class-participation` → component 23**).
* Attendance (component 26): `sum` → **`normalized`**, no fixed count (was 30), scaled to the syllabus
  **150**; fed by the 150-point Attendance column.
* **Insert** `grade_column_links (IST.466, _3562500_1, null, excluded)`: the second, 100-point Attendance
  column is "Not graded"; the syllabus names no such item.
* Notes: the disrespect deduction (scheme; note only), the participation scoring rule, and the ethics
  presentation's 100-point syllabus figure governing over the 120-point rubric deck.

**IST.352**

* Notes only: the late penalty, re-grade window and disruption rule (scheme); bonus items add to earned
  points with no cap applied (project deliverables); attendance has no scored column, so it is named as
  not yet graded (attendance).

**ECN.304**

* The quiz-series placeholder leaves the grade (component → none); the real quiz columns carry it.
* Notes: the exam make-up rule (scheme); attendance is posted regularly and counts as posted
  (participation); how the exams part reads before all three are graded (exams).

**GEO.103**

* The discussion-questions placeholder leaves the grade (component → none).
* **Links** (written by 105, not 106): the lecture Absences column `_3602583_1` and the recitation
  Attendance column `_3602445_1` are "Not graded".
* Notes: the phone-use rule (scheme; note only); the Absences column is a count, excluded until relinked
  (lecture attendance); participation comes only from the TA's posted grade (section participation); no
  reading quiz posted by week 5 (reading quizzes).

**IST.471**

* Scheme method `qualitative` → **`weighted_pct`** (70 work quality + 30 assignments = 100); letter scale
  extended below C- with **D+ 68, D 65, D- 62, F 0** (Stack's ask; the syllabus stops at C- 71).
* Work quality (component 21): `manual` → **`single`**, fed by Assignment 6 (site evaluation), which moves
  there from assignments (**`IST.471/a6-site-evaluations` 22 → 21**).
* Assignments (component 22): `manual` → **`sum`** over Assignments 1–5 and 7.
* Notes: grading basis is a letter grade (scheme); which column feeds each part.

Every other checked row (110) gains a citation string only (DECISIONS 2026-09-29, P-75).

## Already applied before 106

Found by re-running each correcting entry's recheck on prod (2026-09-30): the two GEO.103 attendance links (written by 105 that day); IST.323 `assignment-1` and
`presentation-choice` (its excluded link already present); IST.352's four 0-point planning columns
(`moving-tasks`, `moving-tasks-processes`, `team-and-project-selection`, `team-request`) already carry no
component. No entry's `stored` had drifted from prod since its sitting.

## Professor questions

None open. No entry's call is `ask_professor`: every sitting question was answered by Stack in the sitting
or afterwards (DECISIONS 2026-09-29), and the IST.466 ethics 120-vs-100 question was settled from the
syllabus.

## Rows left tentative

None. No row becomes `tentative`, so nothing here is newly open to a sync overwrite (084: a sync
overwrites only `tentative` / `inferred` rows). IST.466 `major-project-1-synchrony` is made `tentative`
by 105 (B-9), not by V-1.

## Spot checks (task 18)

Three citations per sitting, re-found with `search_materials` on 2026-09-29.

| spot | row | quote | cited | returned | result |
|---|---|---|---|---|---|
| spot-IST.323-1 | IST.323-05 | AI may not be used during tests, quizzes, or the in-class Final Project defense. | bb_file:8 | none (no hit) | mismatch |
| spot-IST.323-2 | IST.323-08 | Each absence beyond two reduces your participation grade by one letter. | bb_file:3 | bb_file:3 | match |
| spot-IST.323-3 | IST.323-24 | The proposal (11 points). | bb_file:151 | bb_file:151 | match |
| spot-IST.466-1 | IST.466-06 | can receive a deduction of up to 20 points per class. | bb_file:39 | bb_file:39 | match |
| spot-IST.466-2 | IST.466-16 | eligible for a maximum of 65 out of 100 points | bb_file:21 | bb_file:21 | match |
| spot-IST.466-3 | IST.466-30 | Up to 100 points for participation. | bb_file:39 | bb_file:39 | match |
| spot-IST.352-1 | IST.352-04 | penalty of 20% of total points for each day being late | bb_file:27 | bb_file:27 | match |
| spot-IST.352-2 | IST.352-12 | Event Model (Bonus Material) | bb_file:27 | bb_file:27 | match |
| spot-IST.352-3 | IST.352-14 | Research – Role of Systems Analyst, 5% | bb_file:27 | bb_file:27 | match |
| spot-ECN.304-1 | ECN.304-04 | Exams may not be made up unless an urgent and legitimate reason | bb_file:23 | bb_file:23 | match |
| spot-ECN.304-2 | ECN.304-26 | The highest exam grade will be weighted 30%, the median grade 25% | bb_file:23 | bb_file:23 | match |
| spot-ECN.304-3 | ECN.304-25 | Average Quiz Grade 15% | bb_file:23 | bb_file:23 | match |
| spot-GEO.103-1 | GEO.103-04 | significant deductions, or even a zero, on your course participation grade | bb_file:42 | bb_file:42 | match |
| spot-GEO.103-2 | GEO.103-08 | Absences will lower your grade. | bb_file:22 | bb_file:22 | match |
| spot-GEO.103-3 | GEO.103-22 | You will hand in your results during the discussion section. | bb_file:42 | bb_file:42 | match |
| spot-IST.471-1 | IST.471-02 | 71- C- 73 | bb_file:26 | bb_file:26 | match |
| spot-IST.471-2 | IST.471-10 | Failure to receive the site supervisor's evaluation form will result in no credit | bb_file:26 | bb_file:26 | match |
| spot-IST.471-3 | IST.471-18 | Assignment 7: Final Reflection | bb_file:26 | bb_file:26 | match |

**The one mismatch is waived by Stack** (DECISIONS 2026-09-29). IST.323-05 cites slide 13 of the IST.323
course-intro deck (`bb_file:8`), which is missing from the extracted text (slides 12 and 14 exist), and
its quote appears in no IST.323 unit. The row stays as the session wrote it; its value is now null
because Phase 17's migration 119 cleared `ai_policy`. 106 takes the IST.323 scheme row's citation from
another entry. The missing slide is an extraction gap for Phase 18.
