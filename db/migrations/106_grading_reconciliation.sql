-- 106_grading_reconciliation.sql
-- Phase 16 · R-30, R-32, R-33, P-3, P-75. V-1's reconciliation, generated from the six verdict files'
-- machine blocks (docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_*.md) and hand-checked.
--
--   * Corrections: every change_to / mark_ungraded entry whose value is not already on prod, course by
--     course in sitting order (IST.323, IST.466, IST.352, ECN.304, GEO.103, IST.471).
--   * Citations (P-75), appended after ' | ', never replacing, to grading_schemes.notes,
--     grade_components.notes and assignments.source_ref: a correction's from its first correcting
--     entry, a citation-only row's from its first entry in file order, except the IST.323 scheme row,
--     which never takes IST.323-05's (DECISIONS 2026-09-29, the waived mismatch). The form is
--     bb_file:<id>#unit:<n> "<quote>" verified_on:2026-09-29 when the entry cites a file, else
--     STACK_OVERRIDE "<Stack's why>" verified_on:2026-09-29. grade_column_links rows get none.
--   * Notes: the text after "Notes text for 106:" in the entry's why is appended; IST.323-08 and
--     IST.471-11 replace the note, as their entries say, and the citation follows.
--   * B-12: components 18 / 19 (IST.323 fp_proposal / fp_log) re-cut 11 / 3 -> 13 / 1 by UPDATE,
--     never delete / recreate (grade_column_links.component_id cascades).
--   * "Not graded" (P-3) is a grade_column_links row, component_id null, excluded true: IST.466/_3562500_1
--     is inserted here; the GEO.103 attendance pair is 105's and must already be on prod.
--   * The fold (P-3): assignments.component_id from a non-excluded link only where the column binds
--     exactly one assignment and the value differs; never confidence; no link row deleted.
--   * No row is left tentative, so 106 writes no confidence.
--   * Not written: grade_components IST.323/* (IST.323-22), grade_components IST.352/* (IST.352-11), grading_schemes GEO.103.recitation (GEO.103-16)
--     are checks, not rows (course-wide "*" keys; the recitation has no scheme row), so they get no
--     citation and the guard's citation-only term drops them.
--
-- Document text is hostile input: every string taken from a verdict file is a standard-quoted literal
-- ('' doubled) in the one INSERT into _106_text below; the do-blocks hold only keys, enums, numbers.
-- _106_before snapshot and guards follow 078's pattern; every write is row-count guarded (079's).
-- References nothing created by 110 or later. No top-level transaction statement.

-- =============================================================================================
-- 0. Snapshot: planner state (count + fingerprint) and every row of the four grading tables
-- =============================================================================================
create temp table _106_before as
select 'assignment_progress'::text as tbl, '*'::text as row_key, count(*)::text || ':' ||
       md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as fp,
       null::numeric as points_possible, null::boolean as no_column, null::text as confidence
  from assignment_progress t
union all
select 'reading_progress', '*', count(*)::text || ':' ||
       md5(coalesce(string_agg(t::text, '|' order by t::text), '')), null, null, null
  from reading_progress t
union all
select 'grading_schemes', t.course_id, md5(t::text), null, null, t.confidence::text from grading_schemes t
union all
select 'grade_components', t.course_id || '/' || t.code, md5(t::text), null, null, t.confidence::text
  from grade_components t
union all
select 'assignments', t.id, md5(t::text), t.points_possible, t.bb_column_id is null, t.confidence::text
  from assignments t
union all
select 'grade_column_links', t.course_id || '/' || t.column_id, md5(t::text), null, null, null
  from grade_column_links t;

-- =============================================================================================
-- 1. The verdict files' text: notes to write, jsonb values, citation strings
-- =============================================================================================
create temp table _106_text (k text primary key, t text not null);
insert into _106_text (k, t) values
  ('note:IST.323-08',
   'Discussion, questions during presentations, demos; laptop misuse => 0. Each absence beyond two reduces your participation grade by one letter (note only, not computed).'),
  ('cite:grade_components:IST.323/participation',
   'bb_file:3#unit:1 "Each absence beyond two reduces your participation grade by one letter." verified_on:2026-09-29'),
  ('cite:grade_components:IST.323/fp_proposal',
   'STACK_OVERRIDE "B-12 re-cut: the Blackboard proposal column is 13 = proposal 11 + final log 2; Final Project stays 20" verified_on:2026-09-29'),
  ('cite:grade_components:IST.323/fp_log',
   'STACK_OVERRIDE "B-12 re-cut: the Blackboard proposal column is 13 = proposal 11 + final log 2; Final Project stays 20" verified_on:2026-09-29'),
  ('cite-only:grading_schemes:IST.323',
   'bb_file:151#unit:1 "Total Possible | 104 points" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.323/quizzes',
   'bb_file:151#unit:1 "a total quiz score out of 5 points" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.323/sitn_group',
   'bb_file:151#unit:1 "Security in the News Group Presentation | 5 Points" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.323/individual_presentation',
   'bb_file:151#unit:1 "Assignment: Individual Presentation | 15 points" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.323/final_project',
   'bb_file:151#unit:1 "Assignment: Final Project | 20 points" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.323/fp_defense',
   'bb_file:151#unit:1 "The in-class defense (6 points)." verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.323/exams',
   'bb_file:151#unit:1 "Exams (3 exams, 10 points each) | 30 points" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.323/labs',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.323/extra_credit_lab',
   'bb_file:151#unit:1 "1 Extra Credit Lab | 4 points" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/assignment-1',
   'bb_file:151#unit:1 "Assignment #1 given" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/fp-proposal',
   'bb_file:151#unit:1 "The proposal (11 points)." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/presentation-choice',
   'bb_file:151#unit:1 "This assignment carries no points." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/participation',
   'bb_file:151#unit:1 "Class Participation | 5 points" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/exam-1',
   'bb_file:151#unit:1 "are worth 10 points each on your final grade" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/exam-2',
   'bb_file:151#unit:1 "are worth 10 points each on your final grade" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/exam-3',
   'bb_file:151#unit:1 "are worth 10 points each on your final grade" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/fp-defense',
   'bb_file:151#unit:1 "The in-class defense (6 points)." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/fp-log-checkpoint',
   'bb_file:151#unit:1 "A checkpoint is due Friday, October 30 (1 point" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/fp-log-final',
   'bb_file:151#unit:1 "the completed log is submitted with your proposal (2 points)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/fp-packet',
   'bb_file:151#unit:1 "Final Project packets assigned" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/individual-presentation',
   'bb_file:151#unit:1 "Assignment: Individual Presentation | 15 points" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/lab-1',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/lab-2',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/lab-3',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/lab-4',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/lab-extra-credit',
   'bb_file:151#unit:1 "1 Extra Credit Lab | 4 points" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-01',
   'bb_file:151#unit:1 "Quiz #1 Due before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-02',
   'bb_file:151#unit:1 "Quiz #2 Due before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-03',
   'bb_file:151#unit:1 "Quiz #3 Due before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-04',
   'bb_file:151#unit:1 "Quiz #4 Due before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-05',
   'bb_file:151#unit:1 "Quiz #5 Due on before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-06',
   'bb_file:151#unit:1 "Quiz #6 Due on before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-07',
   'bb_file:151#unit:1 "Quiz #7 Due on before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-08',
   'bb_file:151#unit:1 "Quiz #8 Due before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-09',
   'bb_file:151#unit:1 "Quiz #9 Due before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/quiz-10',
   'bb_file:151#unit:1 "Quiz #10 Due before class" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.323/sitn-group-presentation',
   'bb_file:151#unit:1 "Security in the News Group Presentation | 5 Points" verified_on:2026-09-29'),
  ('note:IST.466-06',
   'Disrespect deduction: up to 20 points per class (note only, not computed).'),
  ('cite:grading_schemes:IST.466',
   'bb_file:39#unit:1 "can receive a deduction of up to 20 points per class." verified_on:2026-09-29'),
  ('note:IST.466-11',
   'Practical max 90 of 100 (own team presents once); display 100 per syllabus. Scored from gradebook column Class Participation, earned / possible x 100.'),
  ('cite:grade_components:IST.466/participation',
   'bb_file:39#unit:1 "up to 10 points for each of the 10 ethics presentations" verified_on:2026-09-29'),
  ('note:IST.466-16',
   'Rubric deck (bb_file 20/38, 120 pts) does not govern this item; filed with the Ethics vs. exercise.'),
  ('cite:grade_components:IST.466/ethics_presentations',
   'bb_file:21#unit:1 "eligible for a maximum of 65 out of 100 points" verified_on:2026-09-29'),
  ('cite:grade_components:IST.466/attendance',
   'bb_file:149#unit:1 "*indicates 1 out of 15 classes where attendance and participation counts." verified_on:2026-09-29'),
  ('cite:assignments:IST.466/class-participation',
   'bb_file:39#unit:1 "Up to 100 points for participation." verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.466/major_cases',
   'bb_file:39#unit:1 "Major Project (300 points) This semester there will be two cases." verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.466/ethics_practice',
   'bb_file:39#unit:1 "up to 50 points for a 30-minute practice presentation" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.466/ethics_vs',
   'bb_file:39#unit:1 "Ethics vs. Presentation – 120 points" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.466/letter_of_gratitude',
   'bb_file:39#unit:1 "Letter of Gratitude – 100 points" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.466/ai_team_assignment',
   'bb_file:39#unit:1 "AI Team Assignment – 100 points" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/ai-team-assignment',
   'bb_file:39#unit:1 "AI Team Assignment – 100 points" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/attendance',
   'bb_file:39#unit:1 "Up to 150 points for attendance." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/attendance-35625001',
   'STACK_OVERRIDE "Stack 2026-09-29: attendance and participation are separate, each on the syllabus''s own points; the 100-point Attendance column is not in the syllabus, so it is not merged and is ''Not graded'' (IST.466-39)." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/ethics-team-2-practice',
   'bb_file:21#unit:1 "Practice is worth up to 50 points." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/ethics-team-2-presentation',
   'bb_file:21#unit:1 "Presentation is worth up to 100 points." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/ethics-vs-activity',
   'bb_file:36#unit:1 "Ethics Exercise (120 points) Schedule" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/letter-of-gratitude',
   'bb_file:39#unit:1 "Letter of Gratitude – 100 points" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/major-case-2-kickoff',
   'bb_file:149#unit:1 "SU IT Dept. to present Major Case #2" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/major-project-1-synchrony',
   'bb_file:39#unit:1 "Each case analysis is worth up to 150 points." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/major-project-2-su-it',
   'bb_file:39#unit:1 "Each case analysis is worth up to 150 points." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.466/synchrony-case-kickoff',
   'bb_file:149#unit:1 "“Synchrony” -Major Project Presentation" verified_on:2026-09-29'),
  ('note:IST.352-04',
   'Late: minus 20 percent of total points per day late; re-grade requests within one week of return; repeated disruption affects the final grade (notes only, not computed).'),
  ('cite:grading_schemes:IST.352',
   'bb_file:27#unit:1 "penalty of 20% of total points for each day being late" verified_on:2026-09-29'),
  ('note:IST.352-12',
   'Bonus items add to earned points only (note only, not computed: the figure applies no 100 percent cap).'),
  ('cite:grade_components:IST.352/project_deliverables',
   'bb_file:27#unit:1 "Event Model (Bonus Material)" verified_on:2026-09-29'),
  ('note:IST.352-13',
   'No scored gradebook column: shown as not yet graded; standing computed over the other 85 percent.'),
  ('cite:grade_components:IST.352/attendance',
   'bb_file:27#unit:1 "This option can only be used once during the semester." verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.352/research',
   'bb_file:27#unit:1 "Research – Role of Systems Analyst | 5%" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.352/project_final',
   'bb_file:27#unit:1 "Project Presentation / Final Version of Project Deliverables | 10%" verified_on:2026-09-29'),
  ('cite-only:grade_components:IST.352/peer_assessment',
   'bb_file:27#unit:1 "Project Self / Peer Assessment | 10%" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/role-of-systems-analyst',
   'bb_file:27#unit:1 "Research – Role of Systems Analyst | 5%" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/project-1a',
   'bb_file:27#unit:1 "Project Assignments Deliverables" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/project-assignment-2a-project-resources-risks',
   'bb_file:27#unit:1 "Project Assignments Deliverables" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/project-assignment-3-business-case',
   'bb_file:27#unit:1 "Business Case (Short Version)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/project-assignment-4-project-charter',
   'bb_file:27#unit:1 "Project Charter" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/project-assignment-5-communication-plan',
   'bb_file:27#unit:1 "Communication Plan" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/project-assignment-6-hl-processes',
   'bb_file:27#unit:1 "High-Level Processes" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/project-assignment-7-interview-questions',
   'bb_file:27#unit:1 "Project Assignments Deliverables" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/term-project',
   'bb_file:27#unit:1 "Project Assignments Deliverables" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/knowledge-check-2026-08-26',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/knowledge-check-2026-08-31',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/knowledge-check-2026-09-02',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/knowledge-check-09-09-2026',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/knowledge-check-09-14-26',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/knowledge-check-09-16-2026',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/knowledge-check-09-21-26',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/knowledge-check-09-23-26',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/knowledge-check-09-28-26',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/reading-ch1',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/reading-ch1-all',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/reading-ch2',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/reading-chapter-3',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/reading-chapter-4',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/reading-chapter-6-pp-91-98',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/read-chapter-7-pp-108-111',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/moving-tasks',
   'bb_file:72#unit:21 "Detail a high-level (HL) project plan for moving from Syracuse, NY" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/moving-tasks-processes',
   'bb_file:72#unit:21 "Detail a high-level (HL) project plan for moving from Syracuse, NY" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/team-and-project-selection',
   'bb_file:30#unit:4 "will email the names of the team members, which project option" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.352/team-request',
   'bb_file:30#unit:4 "want to be assigned to a group will notify me by August 30" verified_on:2026-09-29'),
  ('note:ECN.304-04',
   'Exam make-up only with an urgent, legitimate, documented reason (note only, not computed).'),
  ('cite:grading_schemes:ECN.304',
   'bb_file:23#unit:2 "Exams may not be made up unless an urgent and legitimate reason" verified_on:2026-09-29'),
  ('note:ECN.304-15',
   'Attendance is posted regularly and counts as posted (Stack, 2026-09-29).'),
  ('cite:grade_components:ECN.304/participation',
   'bb_file:23#unit:2 "I expect everyone to attend and actively participate in every class." verified_on:2026-09-29'),
  ('note:ECN.304-26',
   'Until all three exams are graded: not yet graded before Exam 1; then the average of the exams taken fills the full 75 percent.'),
  ('cite:grade_components:ECN.304/exams',
   'bb_file:23#unit:2 "The highest exam grade will be weighted 30%, the median grade 25%" verified_on:2026-09-29'),
  ('cite:assignments:ECN.304/quiz-series',
   'bb_file:23#unit:2 "will be administered throughout the semester" verified_on:2026-09-29'),
  ('cite-only:grade_components:ECN.304/quizzes',
   'bb_file:23#unit:2 "Average Quiz Grade 15%" verified_on:2026-09-29'),
  ('cite-only:assignments:ECN.304/attendance',
   'bb_file:23#unit:2 "I expect everyone to attend and actively participate in every class." verified_on:2026-09-29'),
  ('cite-only:assignments:ECN.304/exam-1',
   'bb_file:23#unit:2 "There will be 3 non-cumulative exams." verified_on:2026-09-29'),
  ('cite-only:assignments:ECN.304/exam-2',
   'bb_file:23#unit:2 "There will be 3 non-cumulative exams." verified_on:2026-09-29'),
  ('cite-only:assignments:ECN.304/exam-3',
   'bb_file:23#unit:2 "There will be 3 non-cumulative exams." verified_on:2026-09-29'),
  ('cite-only:assignments:ECN.304/quiz-01',
   'STACK_OVERRIDE "Blackboard is source." verified_on:2026-09-29'),
  ('cite-only:assignments:ECN.304/quiz-02',
   'STACK_OVERRIDE "Blackboard is source." verified_on:2026-09-29'),
  ('cite-only:assignments:ECN.304/quiz-3',
   'STACK_OVERRIDE "Blackboard is source." verified_on:2026-09-29'),
  ('cite-only:assignments:ECN.304/quiz-4',
   'STACK_OVERRIDE "Blackboard is source." verified_on:2026-09-29'),
  ('note:GEO.103-04',
   'Lecture phone use: repeated infractions can bring significant deductions or a zero on participation (note only, not computed).'),
  ('cite:grading_schemes:GEO.103.lecture',
   'bb_file:42#unit:4 "significant deductions, or even a zero, on your course participation grade" verified_on:2026-09-29'),
  ('note:GEO.103-06',
   'Absences column (_3602583_1) is an absence count, not a score: excluded ("Not graded") until Stack relinks the column; a posted score does not count while excluded; no estimated deductions.'),
  ('cite:grade_components:GEO.103.lecture/lecture_attendance',
   'bb_file:42#unit:3 "Any additional absences will lead to deductions from your lecture attendance grade." verified_on:2026-09-29'),
  ('note:GEO.103-08',
   'Scored only from the grade the TA posts in the gradebook; not yet graded until then. The recitation Attendance column (_3602445_1) is excluded ("Not graded") until Stack relinks the column; a posted score does not count while excluded.'),
  ('cite:grade_components:GEO.103.lecture/section_participation',
   'bb_file:22#unit:1 "Absences will lower your grade." verified_on:2026-09-29'),
  ('note:GEO.103-25',
   'As of 2026-09-29 (week 5) no reading quiz is posted; the series placeholder stays until one is, and has no points.'),
  ('cite:grade_components:GEO.103.lecture/reading_quizzes',
   'bb_file:42#unit:3 "we will give five or so reading quizzes in the discussion sections" verified_on:2026-09-29'),
  ('cite:assignments:GEO.103/discussion-questions',
   'bb_file:42#unit:3 "I will post 4 or 5 questions on the GEO 103 Blackboard" verified_on:2026-09-29'),
  ('cite-only:grade_components:GEO.103.lecture/exam_1',
   'bb_file:42#unit:2 "20% First Exam" verified_on:2026-09-29'),
  ('cite-only:grade_components:GEO.103.lecture/exam_2',
   'bb_file:42#unit:2 "20% Second Exam" verified_on:2026-09-29'),
  ('cite-only:grade_components:GEO.103.lecture/final_exam',
   'bb_file:42#unit:2 "30% Final Exam" verified_on:2026-09-29'),
  ('cite-only:assignments:GEO.103/exam-1',
   'bb_file:42#unit:3 "There are two exams in the course and a final exam." verified_on:2026-09-29'),
  ('cite-only:assignments:GEO.103/exam-2',
   'bb_file:42#unit:3 "There are two exams in the course and a final exam." verified_on:2026-09-29'),
  ('cite-only:assignments:GEO.103/final-exam',
   'bb_file:42#unit:3 "There are two exams in the course and a final exam." verified_on:2026-09-29'),
  ('cite-only:assignments:GEO.103/carbon-footprint-activity',
   'bb_file:42#unit:5 "You will hand in your results during the discussion section." verified_on:2026-09-29'),
  ('cite-only:assignments:GEO.103/reading-quiz-series',
   'bb_file:42#unit:3 "We will not announce these quizzes in advance." verified_on:2026-09-29'),
  ('value:IST.471-02',
   '[{"min": 93, "letter": "A"}, {"min": 90, "letter": "A-"}, {"min": 87, "letter": "B+"}, {"min": 84, "letter": "B"}, {"min": 81, "letter": "B-"}, {"min": 77, "letter": "C+"}, {"min": 74, "letter": "C"}, {"min": 71, "letter": "C-"}, {"min": 68, "letter": "D+"}, {"min": 65, "letter": "D"}, {"min": 62, "letter": "D-"}, {"min": 0, "letter": "F"}]'),
  ('stored:IST.471-02',
   '[{"min": 93, "letter": "A"}, {"min": 90, "letter": "A-"}, {"min": 87, "letter": "B+"}, {"min": 84, "letter": "B"}, {"min": 81, "letter": "B-"}, {"min": 77, "letter": "C+"}, {"min": 74, "letter": "C"}, {"min": 71, "letter": "C-"}]'),
  ('note:IST.471-04',
   'Grading basis: letter grade (Stack, 2026-09-29).'),
  ('cite:grading_schemes:IST.471',
   'bb_file:26#unit:5 "Quality of professional work in the internship 70%" verified_on:2026-09-29'),
  ('note:IST.471-10',
   'Fed by the Assignment 6 column (_3599888_1, 100 pts), earned / possible x 70; shown as not yet graded until a score is entered.'),
  ('cite:grade_components:IST.471/work_quality',
   'bb_file:61#unit:2 "Please give a number grade and comments if applicable" verified_on:2026-09-29'),
  ('note:IST.471-11',
   'Assignments 1-5 and 7. Blackboard columns for 1-5 (5+5+5+5+10 = 30 raw points); Assignment 7 has no column yet; Assignment 6 feeds work_quality. Earned / possible x 30; not yet graded until posted.'),
  ('cite:grade_components:IST.471/assignments',
   'bb_file:26#unit:5 "Complete, timely submission, and correctly formatted assignments 30%" verified_on:2026-09-29'),
  ('cite:assignments:IST.471/a6-site-evaluations',
   'bb_file:26#unit:4 "Give the site supervisor evaluation form to your site supervisor." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.471/a1-proposal',
   'bb_file:26#unit:3 "submit it as Assignment 1 in Blackboard" verified_on:2026-09-29'),
  ('cite-only:assignments:IST.471/a2-introductions',
   'bb_file:26#unit:3 "Assignment 2: Sharing Introductions with classmates." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.471/a3-first-impressions',
   'bb_file:26#unit:3 "Assignment 3: First Impressions." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.471/a4-learning-agreement',
   'bb_file:26#unit:3 "Assignment 4: The First 30 hours. The Learning Agreement." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.471/a5-faculty-visit',
   'bb_file:26#unit:4 "Assignment 5: The faculty supervisor''s visit, call, or email." verified_on:2026-09-29'),
  ('cite-only:assignments:IST.471/a7-final-reflection',
   'bb_file:26#unit:4 "Assignment 7: Final Reflection" verified_on:2026-09-29');

do $$
declare n integer;
begin
  select count(*) into n from _106_text;
  if n <> 151 then
    raise exception '106: expected 151 text rows, found %', n;
  end if;

  -- 106 runs after 105: the GEO.103 "Not graded" pair must already be there.
  select count(*) into n from grade_column_links
   where (course_id, column_id) in (('GEO.103.lecture', '_3602583_1'),
                                    ('GEO.103.recitation', '_3602445_1'))
     and component_id is null and excluded;
  if n <> 2 then
    raise exception '106: expected 105''s 2 GEO.103 "Not graded" links, found %', n;
  end if;
end $$;

-- =============================================================================================
-- IST.323
-- =============================================================================================

-- grade_components IST.323/participation (correction: IST.323-08)
do $$
declare n integer;
begin
  update grade_components
     set notes = concat_ws(' | ', (select t from _106_text where k = 'note:IST.323-08'),
                   (select t from _106_text where k = 'cite:grade_components:IST.323/participation'))
   where course_id = 'IST.323' and code = 'participation';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.323/participation: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components IST.323/fp_proposal (correction: IST.323-57)
do $$
declare n integer;
begin
  update grade_components
     set points = 13.0,
         notes = concat_ws(' | ', nullif(notes, ''),
                   (select t from _106_text where k = 'cite:grade_components:IST.323/fp_proposal'))
   where course_id = 'IST.323' and code = 'fp_proposal'
     and points = 11.0;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.323/fp_proposal: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components IST.323/fp_log (correction: IST.323-58)
do $$
declare n integer;
begin
  update grade_components
     set points = 1.0,
         notes = concat_ws(' | ', nullif(notes, ''),
                   (select t from _106_text where k = 'cite:grade_components:IST.323/fp_log'))
   where course_id = 'IST.323' and code = 'fp_log'
     and points = 3.0;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.323/fp_log: expected 1 row, updated %', n;
  end if;
end $$;

-- =============================================================================================
-- IST.466
-- =============================================================================================

-- grading_schemes IST.466 (correction: IST.466-06)
do $$
declare n integer;
begin
  update grading_schemes
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:IST.466-06')),
                   (select t from _106_text where k = 'cite:grading_schemes:IST.466'))
   where course_id = 'IST.466';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grading_schemes IST.466: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components IST.466/participation (correction: IST.466-08, IST.466-09, IST.466-10, IST.466-11)
do $$
declare n integer;
begin
  update grade_components
     set aggregation = 'normalized'::aggregation_rule,
         count_expected = null,
         normalize_to = 100.0,
         notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:IST.466-11')),
                   (select t from _106_text where k = 'cite:grade_components:IST.466/participation'))
   where course_id = 'IST.466' and code = 'participation'
     and aggregation = 'sum'::aggregation_rule
     and count_expected = 10
     and normalize_to is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.466/participation: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components IST.466/ethics_presentations (correction: IST.466-16)
do $$
declare n integer;
begin
  update grade_components
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:IST.466-16')),
                   (select t from _106_text where k = 'cite:grade_components:IST.466/ethics_presentations'))
   where course_id = 'IST.466' and code = 'ethics_presentations';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.466/ethics_presentations: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components IST.466/attendance (correction: IST.466-22, IST.466-23, IST.466-24)
do $$
declare n integer;
begin
  update grade_components
     set aggregation = 'normalized'::aggregation_rule,
         count_expected = null,
         normalize_to = 150.0,
         notes = concat_ws(' | ', nullif(notes, ''),
                   (select t from _106_text where k = 'cite:grade_components:IST.466/attendance'))
   where course_id = 'IST.466' and code = 'attendance'
     and aggregation = 'sum'::aggregation_rule
     and count_expected = 30
     and normalize_to is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.466/attendance: expected 1 row, updated %', n;
  end if;
end $$;

-- assignments IST.466/class-participation (correction: IST.466-30)
do $$
declare n integer;
begin
  update assignments
     set component_id = 23,
         source_ref = concat_ws(' | ', nullif(source_ref, ''),
                   (select t from _106_text where k = 'cite:assignments:IST.466/class-participation'))
   where id = 'IST.466/class-participation'
     and component_id is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: assignments IST.466/class-participation: expected 1 row, updated %', n;
  end if;
end $$;

-- IST.466-39: "Not graded" link (DECISIONS 2026-09-29, IST.466 attendance and participation).
do $$
declare n integer;
begin
  select count(*) into n from grade_column_links where course_id = 'IST.466' and column_id = '_3562500_1';
  if n <> 0 then
    raise exception '106: IST.466-39: % grade_column_links row(s) already on IST.466 _3562500_1', n;
  end if;
  insert into grade_column_links (course_id, column_id, component_id, excluded)
  values ('IST.466', '_3562500_1', null, true);
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: IST.466-39: expected 1 link inserted, inserted %', n;
  end if;
end $$;

-- =============================================================================================
-- IST.352
-- =============================================================================================

-- grading_schemes IST.352 (correction: IST.352-04)
do $$
declare n integer;
begin
  update grading_schemes
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:IST.352-04')),
                   (select t from _106_text where k = 'cite:grading_schemes:IST.352'))
   where course_id = 'IST.352';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grading_schemes IST.352: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components IST.352/project_deliverables (correction: IST.352-12)
do $$
declare n integer;
begin
  update grade_components
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:IST.352-12')),
                   (select t from _106_text where k = 'cite:grade_components:IST.352/project_deliverables'))
   where course_id = 'IST.352' and code = 'project_deliverables';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.352/project_deliverables: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components IST.352/attendance (correction: IST.352-13)
do $$
declare n integer;
begin
  update grade_components
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:IST.352-13')),
                   (select t from _106_text where k = 'cite:grade_components:IST.352/attendance'))
   where course_id = 'IST.352' and code = 'attendance';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.352/attendance: expected 1 row, updated %', n;
  end if;
end $$;

-- =============================================================================================
-- ECN.304
-- =============================================================================================

-- grading_schemes ECN.304 (correction: ECN.304-04)
do $$
declare n integer;
begin
  update grading_schemes
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:ECN.304-04')),
                   (select t from _106_text where k = 'cite:grading_schemes:ECN.304'))
   where course_id = 'ECN.304';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grading_schemes ECN.304: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components ECN.304/participation (correction: ECN.304-15)
do $$
declare n integer;
begin
  update grade_components
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:ECN.304-15')),
                   (select t from _106_text where k = 'cite:grade_components:ECN.304/participation'))
   where course_id = 'ECN.304' and code = 'participation';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components ECN.304/participation: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components ECN.304/exams (correction: ECN.304-26)
do $$
declare n integer;
begin
  update grade_components
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:ECN.304-26')),
                   (select t from _106_text where k = 'cite:grade_components:ECN.304/exams'))
   where course_id = 'ECN.304' and code = 'exams';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components ECN.304/exams: expected 1 row, updated %', n;
  end if;
end $$;

-- assignments ECN.304/quiz-series (correction: ECN.304-24)
do $$
declare n integer;
begin
  update assignments
     set component_id = null,
         source_ref = concat_ws(' | ', nullif(source_ref, ''),
                   (select t from _106_text where k = 'cite:assignments:ECN.304/quiz-series'))
   where id = 'ECN.304/quiz-series'
     and component_id = 2;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: assignments ECN.304/quiz-series: expected 1 row, updated %', n;
  end if;
end $$;

-- =============================================================================================
-- GEO.103
-- =============================================================================================

-- grading_schemes GEO.103.lecture (correction: GEO.103-04)
do $$
declare n integer;
begin
  update grading_schemes
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:GEO.103-04')),
                   (select t from _106_text where k = 'cite:grading_schemes:GEO.103.lecture'))
   where course_id = 'GEO.103.lecture';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grading_schemes GEO.103.lecture: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components GEO.103.lecture/lecture_attendance (correction: GEO.103-06)
do $$
declare n integer;
begin
  update grade_components
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:GEO.103-06')),
                   (select t from _106_text where k = 'cite:grade_components:GEO.103.lecture/lecture_attendance'))
   where course_id = 'GEO.103.lecture' and code = 'lecture_attendance';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components GEO.103.lecture/lecture_attendance: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components GEO.103.lecture/section_participation (correction: GEO.103-08)
do $$
declare n integer;
begin
  update grade_components
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:GEO.103-08')),
                   (select t from _106_text where k = 'cite:grade_components:GEO.103.lecture/section_participation'))
   where course_id = 'GEO.103.lecture' and code = 'section_participation';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components GEO.103.lecture/section_participation: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components GEO.103.lecture/reading_quizzes (correction: GEO.103-25)
do $$
declare n integer;
begin
  update grade_components
     set notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:GEO.103-25')),
                   (select t from _106_text where k = 'cite:grade_components:GEO.103.lecture/reading_quizzes'))
   where course_id = 'GEO.103.lecture' and code = 'reading_quizzes';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components GEO.103.lecture/reading_quizzes: expected 1 row, updated %', n;
  end if;
end $$;

-- assignments GEO.103/discussion-questions (correction: GEO.103-23)
do $$
declare n integer;
begin
  update assignments
     set component_id = null,
         source_ref = concat_ws(' | ', nullif(source_ref, ''),
                   (select t from _106_text where k = 'cite:assignments:GEO.103/discussion-questions'))
   where id = 'GEO.103/discussion-questions'
     and component_id = 5;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: assignments GEO.103/discussion-questions: expected 1 row, updated %', n;
  end if;
end $$;

-- =============================================================================================
-- IST.471
-- =============================================================================================

-- grading_schemes IST.471 (correction: IST.471-01, IST.471-02, IST.471-04)
do $$
declare n integer;
begin
  update grading_schemes
     set method = 'weighted_pct'::grading_method,
         letter_scale = (select t from _106_text where k = 'value:IST.471-02')::jsonb,
         notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:IST.471-04')),
                   (select t from _106_text where k = 'cite:grading_schemes:IST.471'))
   where course_id = 'IST.471'
     and method = 'qualitative'::grading_method
     and letter_scale = (select t from _106_text where k = 'stored:IST.471-02')::jsonb;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grading_schemes IST.471: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components IST.471/work_quality (correction: IST.471-08, IST.471-10)
do $$
declare n integer;
begin
  update grade_components
     set aggregation = 'single'::aggregation_rule,
         notes = concat_ws(' | ', concat_ws(' ', nullif(notes, ''), (select t from _106_text where k = 'note:IST.471-10')),
                   (select t from _106_text where k = 'cite:grade_components:IST.471/work_quality'))
   where course_id = 'IST.471' and code = 'work_quality'
     and aggregation = 'manual'::aggregation_rule;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.471/work_quality: expected 1 row, updated %', n;
  end if;
end $$;

-- grade_components IST.471/assignments (correction: IST.471-09, IST.471-11)
do $$
declare n integer;
begin
  update grade_components
     set aggregation = 'sum'::aggregation_rule,
         notes = concat_ws(' | ', (select t from _106_text where k = 'note:IST.471-11'),
                   (select t from _106_text where k = 'cite:grade_components:IST.471/assignments'))
   where course_id = 'IST.471' and code = 'assignments'
     and aggregation = 'manual'::aggregation_rule;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: grade_components IST.471/assignments: expected 1 row, updated %', n;
  end if;
end $$;

-- assignments IST.471/a6-site-evaluations (correction: IST.471-17)
do $$
declare n integer;
begin
  update assignments
     set component_id = 21,
         source_ref = concat_ws(' | ', nullif(source_ref, ''),
                   (select t from _106_text where k = 'cite:assignments:IST.471/a6-site-evaluations'))
   where id = 'IST.471/a6-site-evaluations'
     and component_id = 22;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: assignments IST.471/a6-site-evaluations: expected 1 row, updated %', n;
  end if;
end $$;

-- =============================================================================================
-- Citation-only rows (P-75, R-33's backfill): one guarded UPDATE per table, driven by _106_text
-- =============================================================================================

do $$
declare n integer;
begin
  update grading_schemes g
     set notes = concat_ws(' | ', nullif(g.notes, ''), x.t)
    from _106_text x
   where x.k = 'cite-only:grading_schemes:' || g.course_id;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '106: citation-only grading_schemes: expected 1 rows, updated %', n;
  end if;
end $$;

do $$
declare n integer;
begin
  update grade_components g
     set notes = concat_ws(' | ', nullif(g.notes, ''), x.t)
    from _106_text x
   where x.k = 'cite-only:grade_components:' || g.course_id || '/' || g.code;
  get diagnostics n = row_count;
  if n <> 20 then
    raise exception '106: citation-only grade_components: expected 20 rows, updated %', n;
  end if;
end $$;

do $$
declare n integer;
begin
  update assignments g
     set source_ref = concat_ws(' | ', nullif(g.source_ref, ''), x.t)
    from _106_text x
   where x.k = 'cite-only:assignments:' || g.id;
  get diagnostics n = row_count;
  if n <> 87 then
    raise exception '106: citation-only assignments: expected 87 rows, updated %', n;
  end if;
end $$;

-- =============================================================================================
-- 2. The fold (P-3): component_id from a non-excluded link whose column binds exactly one assignment
-- =============================================================================================
create temp table _106_fold (id text primary key, component_id bigint not null, fold_only boolean not null);

do $$
declare n integer;
begin
  insert into _106_fold (id, component_id, fold_only)
  select a.id, l.component_id, md5(a::text) = b.fp
    from assignments a
    join grade_column_links l on l.course_id = a.course_id and l.column_id = a.bb_column_id
    join _106_before b on b.tbl = 'assignments' and b.row_key = a.id
   where not l.excluded
     and l.component_id is not null
     and a.component_id is distinct from l.component_id
     and (select count(*) from assignments x
           where x.course_id = l.course_id and x.bb_column_id = l.column_id) = 1;

  update assignments a
     set component_id = f.component_id
    from _106_fold f
   where f.id = a.id;
  get diagnostics n = row_count;
  if n <> (select count(*) from _106_fold) then
    raise exception '106: the fold expected % row(s), updated %', (select count(*) from _106_fold), n;
  end if;
  raise notice '106: the fold changed % assignment(s), % of them only by the fold',
    n, (select count(*) from _106_fold where fold_only);
end $$;

-- =============================================================================================
-- 3. Guards
-- =============================================================================================
do $$
declare
  C_CORRECTIONS   constant int := 27;   -- v1_recheck.py --summary: corrections
  C_BY_105        constant int := 2;    -- of them, the GEO.103 links 105 already wrote
  C_CITATION_ONLY constant int := 111;  -- v1_recheck.py --summary: citation-only
  C_PSEUDO        constant int := 3;    -- of them, checks whose target is no row
  moved      text;
  n          integer;
  tentative  integer;
  n_fold     integer;
  changed    integer;
  expected   integer;
begin
  -- planner state unchanged
  select string_agg(b.tbl, ', ' order by b.tbl) into moved
    from _106_before b
    join (select 'assignment_progress'::text as tbl, count(*)::text || ':' ||
                 md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as fp
            from assignment_progress t
          union all
          select 'reading_progress', count(*)::text || ':' ||
                 md5(coalesce(string_agg(t::text, '|' order by t::text), ''))
            from reading_progress t) a on a.tbl = b.tbl
   where a.fp <> b.fp;
  if moved is not null then
    raise exception '106: planner state changed: %', moved;
  end if;

  -- no points_possible written on a row with no Blackboard column (no invented values)
  select string_agg(a.id, ', ' order by a.id) into moved
    from assignments a
    join _106_before b on b.tbl = 'assignments' and b.row_key = a.id
   where b.no_column
     and a.points_possible is distinct from b.points_possible;
  if moved is not null then
    raise exception '106: points_possible written on a row with no bb_column_id: %', moved;
  end if;

  -- grade_components row count unchanged
  select count(*) - (select count(*) from _106_before where tbl = 'grade_components') into n
    from grade_components;
  if n <> 0 then
    raise exception '106: grade_components row count moved by %', n;
  end if;

  -- no link row deleted; the rows added are exactly the inserts the verdict files list
  select string_agg(b.row_key, ', ' order by b.row_key) into moved
    from _106_before b
   where b.tbl = 'grade_column_links'
     and not exists (select 1 from grade_column_links l
                      where l.course_id || '/' || l.column_id = b.row_key);
  if moved is not null then
    raise exception '106: grade_column_links row(s) deleted: %', moved;
  end if;
  select string_agg(l.course_id || '/' || l.column_id, ', ' order by l.course_id, l.column_id) into moved
    from grade_column_links l
   where not exists (select 1 from _106_before b
                      where b.tbl = 'grade_column_links'
                        and b.row_key = l.course_id || '/' || l.column_id);
  if moved is distinct from 'IST.466/_3562500_1' then
    raise exception '106: grade_column_links rows added: %, expected IST.466/_3562500_1', moved;
  end if;

  -- left-tentative rows that were not already tentative (none are left tentative; counted anyway)
  select count(*) into tentative
    from (select 'grading_schemes'::text as tbl, course_id as row_key, confidence::text as c from grading_schemes
          union all
          select 'grade_components', course_id || '/' || code, confidence::text from grade_components
          union all
          select 'assignments', id, confidence::text from assignments) x
    join _106_before b on b.tbl = x.tbl and b.row_key = x.row_key
   where x.c = 'tentative' and b.confidence is distinct from 'tentative';
  select count(*) into n_fold from _106_fold where fold_only;

  -- changed rows, per distinct row, across the four tables (an inserted link counts as changed)
  with after_rows as (
    select 'grading_schemes'::text as tbl, t.course_id as row_key, md5(t::text) as fp from grading_schemes t
    union all
    select 'grade_components', t.course_id || '/' || t.code, md5(t::text) from grade_components t
    union all
    select 'assignments', t.id, md5(t::text) from assignments t
    union all
    select 'grade_column_links', t.course_id || '/' || t.column_id, md5(t::text) from grade_column_links t
  ), before_rows as (
    select tbl, row_key, fp from _106_before
     where tbl in ('grading_schemes', 'grade_components', 'assignments', 'grade_column_links'))
  select count(*) into changed
    from before_rows b
    full join after_rows a on a.tbl = b.tbl and a.row_key = b.row_key
   where a.fp is distinct from b.fp;
  expected := C_CORRECTIONS - C_BY_105 + C_CITATION_ONLY - C_PSEUDO + tentative + n_fold;
  if changed <> expected then
    raise exception '106: % row(s) changed, expected % (corrections % less % by 105, citation-only % less % course-wide, newly tentative %, fold-only %)',
      changed, expected, C_CORRECTIONS, C_BY_105, C_CITATION_ONLY, C_PSEUDO, tentative, n_fold;
  end if;
  raise notice '106: % row(s) changed, as expected', changed;
end $$;

drop table _106_fold;
drop table _106_text;
drop table _106_before;
