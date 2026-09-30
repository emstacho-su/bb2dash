-- bb2dash :: db/tests/phase16_106_grading_reconciliation.sql
-- Phase 16, task 21 (R-30, R-32, R-33, P-3, P-75). Tests migration 106_grading_reconciliation, so it
-- passes only once 105 and 106 are on prod. Generated with 106 from the same machine blocks.
--   1. one assertion per correcting entry (B-12: components 18 / 19 are 13 / 1; IST.466
--      participation / attendance normalized to 100 / 150; IST.471 weighted, 12-step scale; ...);
--   2. the "Not graded" links: IST.466 _3562500_1 (106) and the GEO.103 pair (105);
--   3. the notes 106 wrote and one citation string per citation column it wrote (132 rows).
--
-- Document text sits only in the standard-quoted literals of _t106_expect's INSERT.
-- RUN IT: node scripts/db-test.mjs --only phase16_106_grading_reconciliation.sql. Reads only.

begin;

-- =============================================================================================
-- 1. The corrections (scalar values)
-- =============================================================================================
do $$
declare got text;
begin
  select points::text into got from grade_components where course_id = 'IST.323' and code = 'fp_proposal';
  if got::numeric is distinct from 13.0 then
    raise exception 'FAIL IST.323-57 grade_components IST.323/fp_proposal.points is %, expected 13.0', coalesce(got, 'null');
  end if;
  select points::text into got from grade_components where course_id = 'IST.323' and code = 'fp_log';
  if got::numeric is distinct from 1.0 then
    raise exception 'FAIL IST.323-58 grade_components IST.323/fp_log.points is %, expected 1.0', coalesce(got, 'null');
  end if;
  select aggregation::text into got from grade_components where course_id = 'IST.466' and code = 'participation';
  if got is distinct from 'normalized' then
    raise exception 'FAIL IST.466-08 grade_components IST.466/participation.aggregation is %, expected normalized', coalesce(got, 'null');
  end if;
  select count_expected::text into got from grade_components where course_id = 'IST.466' and code = 'participation';
  if got::numeric is distinct from null then
    raise exception 'FAIL IST.466-09 grade_components IST.466/participation.count_expected is %, expected null', coalesce(got, 'null');
  end if;
  select normalize_to::text into got from grade_components where course_id = 'IST.466' and code = 'participation';
  if got::numeric is distinct from 100.0 then
    raise exception 'FAIL IST.466-10 grade_components IST.466/participation.normalize_to is %, expected 100.0', coalesce(got, 'null');
  end if;
  select aggregation::text into got from grade_components where course_id = 'IST.466' and code = 'attendance';
  if got is distinct from 'normalized' then
    raise exception 'FAIL IST.466-22 grade_components IST.466/attendance.aggregation is %, expected normalized', coalesce(got, 'null');
  end if;
  select count_expected::text into got from grade_components where course_id = 'IST.466' and code = 'attendance';
  if got::numeric is distinct from null then
    raise exception 'FAIL IST.466-23 grade_components IST.466/attendance.count_expected is %, expected null', coalesce(got, 'null');
  end if;
  select normalize_to::text into got from grade_components where course_id = 'IST.466' and code = 'attendance';
  if got::numeric is distinct from 150.0 then
    raise exception 'FAIL IST.466-24 grade_components IST.466/attendance.normalize_to is %, expected 150.0', coalesce(got, 'null');
  end if;
  select component_id::text into got from assignments where id = 'IST.466/class-participation';
  if got::numeric is distinct from 23 then
    raise exception 'FAIL IST.466-30 assignments IST.466/class-participation.component_id is %, expected 23', coalesce(got, 'null');
  end if;
  select component_id::text into got from assignments where id = 'ECN.304/quiz-series';
  if got::numeric is distinct from null then
    raise exception 'FAIL ECN.304-24 assignments ECN.304/quiz-series.component_id is %, expected null', coalesce(got, 'null');
  end if;
  select component_id::text into got from assignments where id = 'GEO.103/discussion-questions';
  if got::numeric is distinct from null then
    raise exception 'FAIL GEO.103-23 assignments GEO.103/discussion-questions.component_id is %, expected null', coalesce(got, 'null');
  end if;
  select method::text into got from grading_schemes where course_id = 'IST.471';
  if got is distinct from 'weighted_pct' then
    raise exception 'FAIL IST.471-01 grading_schemes IST.471.method is %, expected weighted_pct', coalesce(got, 'null');
  end if;
  select aggregation::text into got from grade_components where course_id = 'IST.471' and code = 'work_quality';
  if got is distinct from 'single' then
    raise exception 'FAIL IST.471-08 grade_components IST.471/work_quality.aggregation is %, expected single', coalesce(got, 'null');
  end if;
  select aggregation::text into got from grade_components where course_id = 'IST.471' and code = 'assignments';
  if got is distinct from 'sum' then
    raise exception 'FAIL IST.471-09 grade_components IST.471/assignments.aggregation is %, expected sum', coalesce(got, 'null');
  end if;
  select component_id::text into got from assignments where id = 'IST.471/a6-site-evaluations';
  if got::numeric is distinct from 21 then
    raise exception 'FAIL IST.471-17 assignments IST.471/a6-site-evaluations.component_id is %, expected 21', coalesce(got, 'null');
  end if;
end $$;

-- =============================================================================================
-- 2. "Not graded" links (P-3)
-- =============================================================================================
do $$
declare n integer;
begin
  select count(*) into n from grade_column_links
   where course_id = 'IST.466' and column_id = '_3562500_1' and component_id is null and excluded;
  if n <> 1 then
    raise exception 'FAIL IST.466-39 IST.466 _3562500_1 is not an excluded link (% rows)', n;
  end if;
  select count(*) into n from grade_column_links
   where course_id = 'GEO.103.lecture' and column_id = '_3602583_1' and component_id is null and excluded;
  if n <> 1 then
    raise exception 'FAIL GEO.103-17 GEO.103.lecture _3602583_1 is not an excluded link (% rows)', n;
  end if;
  select count(*) into n from grade_column_links
   where course_id = 'GEO.103.recitation' and column_id = '_3602445_1' and component_id is null and excluded;
  if n <> 1 then
    raise exception 'FAIL GEO.103-18 GEO.103.recitation _3602445_1 is not an excluded link (% rows)', n;
  end if;
end $$;

-- =============================================================================================
-- 3. Text 106 wrote: jsonb values, notes, citation strings
-- =============================================================================================
create temp table _t106_expect (label text, tbl text, row_key text, col text, mode text, t text not null);
insert into _t106_expect (label, tbl, row_key, col, mode, t) values
  ('IST.323-08', 'grade_components', 'IST.323/participation', 'notes', 'starts',
   'Discussion, questions during presentations, demos; laptop misuse => 0. Each absence beyond two reduces your participation grade by one letter (note only, not computed).'),
  ('IST.466-06', 'grading_schemes', 'IST.466', 'notes', 'holds',
   'Disrespect deduction: up to 20 points per class (note only, not computed).'),
  ('IST.466-11', 'grade_components', 'IST.466/participation', 'notes', 'holds',
   'Practical max 90 of 100 (own team presents once); display 100 per syllabus. Scored from gradebook column Class Participation, earned / possible x 100.'),
  ('IST.466-16', 'grade_components', 'IST.466/ethics_presentations', 'notes', 'holds',
   'Rubric deck (bb_file 20/38, 120 pts) does not govern this item; filed with the Ethics vs. exercise.'),
  ('IST.352-04', 'grading_schemes', 'IST.352', 'notes', 'holds',
   'Late: minus 20 percent of total points per day late; re-grade requests within one week of return; repeated disruption affects the final grade (notes only, not computed).'),
  ('IST.352-12', 'grade_components', 'IST.352/project_deliverables', 'notes', 'holds',
   'Bonus items add to earned points only (note only, not computed: the figure applies no 100 percent cap).'),
  ('IST.352-13', 'grade_components', 'IST.352/attendance', 'notes', 'holds',
   'No scored gradebook column: shown as not yet graded; standing computed over the other 85 percent.'),
  ('ECN.304-04', 'grading_schemes', 'ECN.304', 'notes', 'holds',
   'Exam make-up only with an urgent, legitimate, documented reason (note only, not computed).'),
  ('ECN.304-15', 'grade_components', 'ECN.304/participation', 'notes', 'holds',
   'Attendance is posted regularly and counts as posted (Stack, 2026-09-29).'),
  ('ECN.304-26', 'grade_components', 'ECN.304/exams', 'notes', 'holds',
   'Until all three exams are graded: not yet graded before Exam 1; then the average of the exams taken fills the full 75 percent.'),
  ('GEO.103-04', 'grading_schemes', 'GEO.103.lecture', 'notes', 'holds',
   'Lecture phone use: repeated infractions can bring significant deductions or a zero on participation (note only, not computed).'),
  ('GEO.103-06', 'grade_components', 'GEO.103.lecture/lecture_attendance', 'notes', 'holds',
   'Absences column (_3602583_1) is an absence count, not a score: excluded ("Not graded") until Stack relinks the column; a posted score does not count while excluded; no estimated deductions.'),
  ('GEO.103-08', 'grade_components', 'GEO.103.lecture/section_participation', 'notes', 'holds',
   'Scored only from the grade the TA posts in the gradebook; not yet graded until then. The recitation Attendance column (_3602445_1) is excluded ("Not graded") until Stack relinks the column; a posted score does not count while excluded.'),
  ('GEO.103-25', 'grade_components', 'GEO.103.lecture/reading_quizzes', 'notes', 'holds',
   'As of 2026-09-29 (week 5) no reading quiz is posted; the series placeholder stays until one is, and has no points.'),
  ('IST.471-02', 'grading_schemes', 'IST.471', 'letter_scale', 'jsonb',
   '[{"min": 93, "letter": "A"}, {"min": 90, "letter": "A-"}, {"min": 87, "letter": "B+"}, {"min": 84, "letter": "B"}, {"min": 81, "letter": "B-"}, {"min": 77, "letter": "C+"}, {"min": 74, "letter": "C"}, {"min": 71, "letter": "C-"}, {"min": 68, "letter": "D+"}, {"min": 65, "letter": "D"}, {"min": 62, "letter": "D-"}, {"min": 0, "letter": "F"}]'),
  ('IST.471-04', 'grading_schemes', 'IST.471', 'notes', 'holds',
   'Grading basis: letter grade (Stack, 2026-09-29).'),
  ('IST.471-10', 'grade_components', 'IST.471/work_quality', 'notes', 'holds',
   'Fed by the Assignment 6 column (_3599888_1, 100 pts), earned / possible x 70; shown as not yet graded until a score is entered.'),
  ('IST.471-11', 'grade_components', 'IST.471/assignments', 'notes', 'starts',
   'Assignments 1-5 and 7. Blackboard columns for 1-5 (5+5+5+5+10 = 30 raw points); Assignment 7 has no column yet; Assignment 6 feeds work_quality. Earned / possible x 30; not yet graded until posted.'),
  ('citation IST.323-08', 'grade_components', 'IST.323/participation', 'notes', 'holds',
   'bb_file:3#unit:1 "Each absence beyond two reduces your participation grade by one letter." verified_on:2026-09-29'),
  ('citation IST.323-57', 'grade_components', 'IST.323/fp_proposal', 'notes', 'holds',
   'STACK_OVERRIDE "B-12 re-cut: the Blackboard proposal column is 13 = proposal 11 + final log 2; Final Project stays 20" verified_on:2026-09-29'),
  ('citation IST.323-58', 'grade_components', 'IST.323/fp_log', 'notes', 'holds',
   'STACK_OVERRIDE "B-12 re-cut: the Blackboard proposal column is 13 = proposal 11 + final log 2; Final Project stays 20" verified_on:2026-09-29'),
  ('citation IST.323-01', 'grading_schemes', 'IST.323', 'notes', 'holds',
   'bb_file:151#unit:1 "Total Possible | 104 points" verified_on:2026-09-29'),
  ('citation IST.323-09', 'grade_components', 'IST.323/quizzes', 'notes', 'holds',
   'bb_file:151#unit:1 "a total quiz score out of 5 points" verified_on:2026-09-29'),
  ('citation IST.323-12', 'grade_components', 'IST.323/sitn_group', 'notes', 'holds',
   'bb_file:151#unit:1 "Security in the News Group Presentation | 5 Points" verified_on:2026-09-29'),
  ('citation IST.323-13', 'grade_components', 'IST.323/individual_presentation', 'notes', 'holds',
   'bb_file:151#unit:1 "Assignment: Individual Presentation | 15 points" verified_on:2026-09-29'),
  ('citation IST.323-14', 'grade_components', 'IST.323/final_project', 'notes', 'holds',
   'bb_file:151#unit:1 "Assignment: Final Project | 20 points" verified_on:2026-09-29'),
  ('citation IST.323-17', 'grade_components', 'IST.323/fp_defense', 'notes', 'holds',
   'bb_file:151#unit:1 "The in-class defense (6 points)." verified_on:2026-09-29'),
  ('citation IST.323-18', 'grade_components', 'IST.323/exams', 'notes', 'holds',
   'bb_file:151#unit:1 "Exams (3 exams, 10 points each) | 30 points" verified_on:2026-09-29'),
  ('citation IST.323-19', 'grade_components', 'IST.323/labs', 'notes', 'holds',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('citation IST.323-20', 'grade_components', 'IST.323/extra_credit_lab', 'notes', 'holds',
   'bb_file:151#unit:1 "1 Extra Credit Lab | 4 points" verified_on:2026-09-29'),
  ('citation IST.323-23', 'assignments', 'IST.323/assignment-1', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Assignment #1 given" verified_on:2026-09-29'),
  ('citation IST.323-24', 'assignments', 'IST.323/fp-proposal', 'source_ref', 'holds',
   'bb_file:151#unit:1 "The proposal (11 points)." verified_on:2026-09-29'),
  ('citation IST.323-26', 'assignments', 'IST.323/presentation-choice', 'source_ref', 'holds',
   'bb_file:151#unit:1 "This assignment carries no points." verified_on:2026-09-29'),
  ('citation IST.323-27', 'assignments', 'IST.323/participation', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Class Participation | 5 points" verified_on:2026-09-29'),
  ('citation IST.323-30', 'assignments', 'IST.323/exam-1', 'source_ref', 'holds',
   'bb_file:151#unit:1 "are worth 10 points each on your final grade" verified_on:2026-09-29'),
  ('citation IST.323-31', 'assignments', 'IST.323/exam-2', 'source_ref', 'holds',
   'bb_file:151#unit:1 "are worth 10 points each on your final grade" verified_on:2026-09-29'),
  ('citation IST.323-32', 'assignments', 'IST.323/exam-3', 'source_ref', 'holds',
   'bb_file:151#unit:1 "are worth 10 points each on your final grade" verified_on:2026-09-29'),
  ('citation IST.323-33', 'assignments', 'IST.323/fp-defense', 'source_ref', 'holds',
   'bb_file:151#unit:1 "The in-class defense (6 points)." verified_on:2026-09-29'),
  ('citation IST.323-34', 'assignments', 'IST.323/fp-log-checkpoint', 'source_ref', 'holds',
   'bb_file:151#unit:1 "A checkpoint is due Friday, October 30 (1 point" verified_on:2026-09-29'),
  ('citation IST.323-35', 'assignments', 'IST.323/fp-log-final', 'source_ref', 'holds',
   'bb_file:151#unit:1 "the completed log is submitted with your proposal (2 points)" verified_on:2026-09-29'),
  ('citation IST.323-36', 'assignments', 'IST.323/fp-packet', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Final Project packets assigned" verified_on:2026-09-29'),
  ('citation IST.323-37', 'assignments', 'IST.323/individual-presentation', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Assignment: Individual Presentation | 15 points" verified_on:2026-09-29'),
  ('citation IST.323-38', 'assignments', 'IST.323/lab-1', 'source_ref', 'holds',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('citation IST.323-39', 'assignments', 'IST.323/lab-2', 'source_ref', 'holds',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('citation IST.323-40', 'assignments', 'IST.323/lab-3', 'source_ref', 'holds',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('citation IST.323-41', 'assignments', 'IST.323/lab-4', 'source_ref', 'holds',
   'bb_file:151#unit:1 "4 Required Labs | 20 points (5 pts each)" verified_on:2026-09-29'),
  ('citation IST.323-42', 'assignments', 'IST.323/lab-extra-credit', 'source_ref', 'holds',
   'bb_file:151#unit:1 "1 Extra Credit Lab | 4 points" verified_on:2026-09-29'),
  ('citation IST.323-43', 'assignments', 'IST.323/quiz-01', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #1 Due before class" verified_on:2026-09-29'),
  ('citation IST.323-44', 'assignments', 'IST.323/quiz-02', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #2 Due before class" verified_on:2026-09-29'),
  ('citation IST.323-45', 'assignments', 'IST.323/quiz-03', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #3 Due before class" verified_on:2026-09-29'),
  ('citation IST.323-46', 'assignments', 'IST.323/quiz-04', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #4 Due before class" verified_on:2026-09-29'),
  ('citation IST.323-47', 'assignments', 'IST.323/quiz-05', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #5 Due on before class" verified_on:2026-09-29'),
  ('citation IST.323-48', 'assignments', 'IST.323/quiz-06', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #6 Due on before class" verified_on:2026-09-29'),
  ('citation IST.323-49', 'assignments', 'IST.323/quiz-07', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #7 Due on before class" verified_on:2026-09-29'),
  ('citation IST.323-50', 'assignments', 'IST.323/quiz-08', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #8 Due before class" verified_on:2026-09-29'),
  ('citation IST.323-51', 'assignments', 'IST.323/quiz-09', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #9 Due before class" verified_on:2026-09-29'),
  ('citation IST.323-52', 'assignments', 'IST.323/quiz-10', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Quiz #10 Due before class" verified_on:2026-09-29'),
  ('citation IST.323-53', 'assignments', 'IST.323/sitn-group-presentation', 'source_ref', 'holds',
   'bb_file:151#unit:1 "Security in the News Group Presentation | 5 Points" verified_on:2026-09-29'),
  ('citation IST.466-06', 'grading_schemes', 'IST.466', 'notes', 'holds',
   'bb_file:39#unit:1 "can receive a deduction of up to 20 points per class." verified_on:2026-09-29'),
  ('citation IST.466-08', 'grade_components', 'IST.466/participation', 'notes', 'holds',
   'bb_file:39#unit:1 "up to 10 points for each of the 10 ethics presentations" verified_on:2026-09-29'),
  ('citation IST.466-16', 'grade_components', 'IST.466/ethics_presentations', 'notes', 'holds',
   'bb_file:21#unit:1 "eligible for a maximum of 65 out of 100 points" verified_on:2026-09-29'),
  ('citation IST.466-22', 'grade_components', 'IST.466/attendance', 'notes', 'holds',
   'bb_file:149#unit:1 "*indicates 1 out of 15 classes where attendance and participation counts." verified_on:2026-09-29'),
  ('citation IST.466-30', 'assignments', 'IST.466/class-participation', 'source_ref', 'holds',
   'bb_file:39#unit:1 "Up to 100 points for participation." verified_on:2026-09-29'),
  ('citation IST.466-12', 'grade_components', 'IST.466/major_cases', 'notes', 'holds',
   'bb_file:39#unit:1 "Major Project (300 points) This semester there will be two cases." verified_on:2026-09-29'),
  ('citation IST.466-17', 'grade_components', 'IST.466/ethics_practice', 'notes', 'holds',
   'bb_file:39#unit:1 "up to 50 points for a 30-minute practice presentation" verified_on:2026-09-29'),
  ('citation IST.466-18', 'grade_components', 'IST.466/ethics_vs', 'notes', 'holds',
   'bb_file:39#unit:1 "Ethics vs. Presentation – 120 points" verified_on:2026-09-29'),
  ('citation IST.466-19', 'grade_components', 'IST.466/letter_of_gratitude', 'notes', 'holds',
   'bb_file:39#unit:1 "Letter of Gratitude – 100 points" verified_on:2026-09-29'),
  ('citation IST.466-20', 'grade_components', 'IST.466/ai_team_assignment', 'notes', 'holds',
   'bb_file:39#unit:1 "AI Team Assignment – 100 points" verified_on:2026-09-29'),
  ('citation IST.466-27', 'assignments', 'IST.466/ai-team-assignment', 'source_ref', 'holds',
   'bb_file:39#unit:1 "AI Team Assignment – 100 points" verified_on:2026-09-29'),
  ('citation IST.466-28', 'assignments', 'IST.466/attendance', 'source_ref', 'holds',
   'bb_file:39#unit:1 "Up to 150 points for attendance." verified_on:2026-09-29'),
  ('citation IST.466-29', 'assignments', 'IST.466/attendance-35625001', 'source_ref', 'holds',
   'STACK_OVERRIDE "Stack 2026-09-29: attendance and participation are separate, each on the syllabus''s own points; the 100-point Attendance column is not in the syllabus, so it is not merged and is ''Not graded'' (IST.466-39)." verified_on:2026-09-29'),
  ('citation IST.466-31', 'assignments', 'IST.466/ethics-team-2-practice', 'source_ref', 'holds',
   'bb_file:21#unit:1 "Practice is worth up to 50 points." verified_on:2026-09-29'),
  ('citation IST.466-32', 'assignments', 'IST.466/ethics-team-2-presentation', 'source_ref', 'holds',
   'bb_file:21#unit:1 "Presentation is worth up to 100 points." verified_on:2026-09-29'),
  ('citation IST.466-33', 'assignments', 'IST.466/ethics-vs-activity', 'source_ref', 'holds',
   'bb_file:36#unit:1 "Ethics Exercise (120 points) Schedule" verified_on:2026-09-29'),
  ('citation IST.466-34', 'assignments', 'IST.466/letter-of-gratitude', 'source_ref', 'holds',
   'bb_file:39#unit:1 "Letter of Gratitude – 100 points" verified_on:2026-09-29'),
  ('citation IST.466-35', 'assignments', 'IST.466/major-case-2-kickoff', 'source_ref', 'holds',
   'bb_file:149#unit:1 "SU IT Dept. to present Major Case #2" verified_on:2026-09-29'),
  ('citation IST.466-36', 'assignments', 'IST.466/major-project-1-synchrony', 'source_ref', 'holds',
   'bb_file:39#unit:1 "Each case analysis is worth up to 150 points." verified_on:2026-09-29'),
  ('citation IST.466-37', 'assignments', 'IST.466/major-project-2-su-it', 'source_ref', 'holds',
   'bb_file:39#unit:1 "Each case analysis is worth up to 150 points." verified_on:2026-09-29'),
  ('citation IST.466-38', 'assignments', 'IST.466/synchrony-case-kickoff', 'source_ref', 'holds',
   'bb_file:149#unit:1 "“Synchrony” -Major Project Presentation" verified_on:2026-09-29'),
  ('citation IST.352-04', 'grading_schemes', 'IST.352', 'notes', 'holds',
   'bb_file:27#unit:1 "penalty of 20% of total points for each day being late" verified_on:2026-09-29'),
  ('citation IST.352-12', 'grade_components', 'IST.352/project_deliverables', 'notes', 'holds',
   'bb_file:27#unit:1 "Event Model (Bonus Material)" verified_on:2026-09-29'),
  ('citation IST.352-13', 'grade_components', 'IST.352/attendance', 'notes', 'holds',
   'bb_file:27#unit:1 "This option can only be used once during the semester." verified_on:2026-09-29'),
  ('citation IST.352-05', 'grade_components', 'IST.352/research', 'notes', 'holds',
   'bb_file:27#unit:1 "Research – Role of Systems Analyst | 5%" verified_on:2026-09-29'),
  ('citation IST.352-07', 'grade_components', 'IST.352/project_final', 'notes', 'holds',
   'bb_file:27#unit:1 "Project Presentation / Final Version of Project Deliverables | 10%" verified_on:2026-09-29'),
  ('citation IST.352-08', 'grade_components', 'IST.352/peer_assessment', 'notes', 'holds',
   'bb_file:27#unit:1 "Project Self / Peer Assessment | 10%" verified_on:2026-09-29'),
  ('citation IST.352-14', 'assignments', 'IST.352/role-of-systems-analyst', 'source_ref', 'holds',
   'bb_file:27#unit:1 "Research – Role of Systems Analyst | 5%" verified_on:2026-09-29'),
  ('citation IST.352-15', 'assignments', 'IST.352/project-1a', 'source_ref', 'holds',
   'bb_file:27#unit:1 "Project Assignments Deliverables" verified_on:2026-09-29'),
  ('citation IST.352-16', 'assignments', 'IST.352/project-assignment-2a-project-resources-risks', 'source_ref', 'holds',
   'bb_file:27#unit:1 "Project Assignments Deliverables" verified_on:2026-09-29'),
  ('citation IST.352-17', 'assignments', 'IST.352/project-assignment-3-business-case', 'source_ref', 'holds',
   'bb_file:27#unit:1 "Business Case (Short Version)" verified_on:2026-09-29'),
  ('citation IST.352-18', 'assignments', 'IST.352/project-assignment-4-project-charter', 'source_ref', 'holds',
   'bb_file:27#unit:1 "Project Charter" verified_on:2026-09-29'),
  ('citation IST.352-19', 'assignments', 'IST.352/project-assignment-5-communication-plan', 'source_ref', 'holds',
   'bb_file:27#unit:1 "Communication Plan" verified_on:2026-09-29'),
  ('citation IST.352-20', 'assignments', 'IST.352/project-assignment-6-hl-processes', 'source_ref', 'holds',
   'bb_file:27#unit:1 "High-Level Processes" verified_on:2026-09-29'),
  ('citation IST.352-21', 'assignments', 'IST.352/project-assignment-7-interview-questions', 'source_ref', 'holds',
   'bb_file:27#unit:1 "Project Assignments Deliverables" verified_on:2026-09-29'),
  ('citation IST.352-22', 'assignments', 'IST.352/term-project', 'source_ref', 'holds',
   'bb_file:27#unit:1 "Project Assignments Deliverables" verified_on:2026-09-29'),
  ('citation IST.352-23', 'assignments', 'IST.352/knowledge-check-2026-08-26', 'source_ref', 'holds',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('citation IST.352-24', 'assignments', 'IST.352/knowledge-check-2026-08-31', 'source_ref', 'holds',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('citation IST.352-25', 'assignments', 'IST.352/knowledge-check-2026-09-02', 'source_ref', 'holds',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('citation IST.352-26', 'assignments', 'IST.352/knowledge-check-09-09-2026', 'source_ref', 'holds',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('citation IST.352-27', 'assignments', 'IST.352/knowledge-check-09-14-26', 'source_ref', 'holds',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('citation IST.352-28', 'assignments', 'IST.352/knowledge-check-09-16-2026', 'source_ref', 'holds',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('citation IST.352-29', 'assignments', 'IST.352/knowledge-check-09-21-26', 'source_ref', 'holds',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('citation IST.352-30', 'assignments', 'IST.352/knowledge-check-09-23-26', 'source_ref', 'holds',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('citation IST.352-31', 'assignments', 'IST.352/knowledge-check-09-28-26', 'source_ref', 'holds',
   'bb_file:70#unit:2 "Knowledge Check (5 min.)" verified_on:2026-09-29'),
  ('citation IST.352-32', 'assignments', 'IST.352/reading-ch1', 'source_ref', 'holds',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('citation IST.352-33', 'assignments', 'IST.352/reading-ch1-all', 'source_ref', 'holds',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('citation IST.352-34', 'assignments', 'IST.352/reading-ch2', 'source_ref', 'holds',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('citation IST.352-35', 'assignments', 'IST.352/reading-chapter-3', 'source_ref', 'holds',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('citation IST.352-36', 'assignments', 'IST.352/reading-chapter-4', 'source_ref', 'holds',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('citation IST.352-37', 'assignments', 'IST.352/reading-chapter-6-pp-91-98', 'source_ref', 'holds',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('citation IST.352-38', 'assignments', 'IST.352/read-chapter-7-pp-108-111', 'source_ref', 'holds',
   'bb_file:27#unit:1 "one-page report summary for the reading assignment" verified_on:2026-09-29'),
  ('citation IST.352-39', 'assignments', 'IST.352/moving-tasks', 'source_ref', 'holds',
   'bb_file:72#unit:21 "Detail a high-level (HL) project plan for moving from Syracuse, NY" verified_on:2026-09-29'),
  ('citation IST.352-40', 'assignments', 'IST.352/moving-tasks-processes', 'source_ref', 'holds',
   'bb_file:72#unit:21 "Detail a high-level (HL) project plan for moving from Syracuse, NY" verified_on:2026-09-29'),
  ('citation IST.352-41', 'assignments', 'IST.352/team-and-project-selection', 'source_ref', 'holds',
   'bb_file:30#unit:4 "will email the names of the team members, which project option" verified_on:2026-09-29'),
  ('citation IST.352-42', 'assignments', 'IST.352/team-request', 'source_ref', 'holds',
   'bb_file:30#unit:4 "want to be assigned to a group will notify me by August 30" verified_on:2026-09-29'),
  ('citation ECN.304-04', 'grading_schemes', 'ECN.304', 'notes', 'holds',
   'bb_file:23#unit:2 "Exams may not be made up unless an urgent and legitimate reason" verified_on:2026-09-29'),
  ('citation ECN.304-15', 'grade_components', 'ECN.304/participation', 'notes', 'holds',
   'bb_file:23#unit:2 "I expect everyone to attend and actively participate in every class." verified_on:2026-09-29'),
  ('citation ECN.304-26', 'grade_components', 'ECN.304/exams', 'notes', 'holds',
   'bb_file:23#unit:2 "The highest exam grade will be weighted 30%, the median grade 25%" verified_on:2026-09-29'),
  ('citation ECN.304-24', 'assignments', 'ECN.304/quiz-series', 'source_ref', 'holds',
   'bb_file:23#unit:2 "will be administered throughout the semester" verified_on:2026-09-29'),
  ('citation ECN.304-06', 'grade_components', 'ECN.304/quizzes', 'notes', 'holds',
   'bb_file:23#unit:2 "Average Quiz Grade 15%" verified_on:2026-09-29'),
  ('citation ECN.304-16', 'assignments', 'ECN.304/attendance', 'source_ref', 'holds',
   'bb_file:23#unit:2 "I expect everyone to attend and actively participate in every class." verified_on:2026-09-29'),
  ('citation ECN.304-17', 'assignments', 'ECN.304/exam-1', 'source_ref', 'holds',
   'bb_file:23#unit:2 "There will be 3 non-cumulative exams." verified_on:2026-09-29'),
  ('citation ECN.304-18', 'assignments', 'ECN.304/exam-2', 'source_ref', 'holds',
   'bb_file:23#unit:2 "There will be 3 non-cumulative exams." verified_on:2026-09-29'),
  ('citation ECN.304-19', 'assignments', 'ECN.304/exam-3', 'source_ref', 'holds',
   'bb_file:23#unit:2 "There will be 3 non-cumulative exams." verified_on:2026-09-29'),
  ('citation ECN.304-20', 'assignments', 'ECN.304/quiz-01', 'source_ref', 'holds',
   'STACK_OVERRIDE "Blackboard is source." verified_on:2026-09-29'),
  ('citation ECN.304-21', 'assignments', 'ECN.304/quiz-02', 'source_ref', 'holds',
   'STACK_OVERRIDE "Blackboard is source." verified_on:2026-09-29'),
  ('citation ECN.304-22', 'assignments', 'ECN.304/quiz-3', 'source_ref', 'holds',
   'STACK_OVERRIDE "Blackboard is source." verified_on:2026-09-29'),
  ('citation ECN.304-23', 'assignments', 'ECN.304/quiz-4', 'source_ref', 'holds',
   'STACK_OVERRIDE "Blackboard is source." verified_on:2026-09-29'),
  ('citation GEO.103-04', 'grading_schemes', 'GEO.103.lecture', 'notes', 'holds',
   'bb_file:42#unit:4 "significant deductions, or even a zero, on your course participation grade" verified_on:2026-09-29'),
  ('citation GEO.103-06', 'grade_components', 'GEO.103.lecture/lecture_attendance', 'notes', 'holds',
   'bb_file:42#unit:3 "Any additional absences will lead to deductions from your lecture attendance grade." verified_on:2026-09-29'),
  ('citation GEO.103-08', 'grade_components', 'GEO.103.lecture/section_participation', 'notes', 'holds',
   'bb_file:22#unit:1 "Absences will lower your grade." verified_on:2026-09-29'),
  ('citation GEO.103-25', 'grade_components', 'GEO.103.lecture/reading_quizzes', 'notes', 'holds',
   'bb_file:42#unit:3 "we will give five or so reading quizzes in the discussion sections" verified_on:2026-09-29'),
  ('citation GEO.103-23', 'assignments', 'GEO.103/discussion-questions', 'source_ref', 'holds',
   'bb_file:42#unit:3 "I will post 4 or 5 questions on the GEO 103 Blackboard" verified_on:2026-09-29'),
  ('citation GEO.103-12', 'grade_components', 'GEO.103.lecture/exam_1', 'notes', 'holds',
   'bb_file:42#unit:2 "20% First Exam" verified_on:2026-09-29'),
  ('citation GEO.103-13', 'grade_components', 'GEO.103.lecture/exam_2', 'notes', 'holds',
   'bb_file:42#unit:2 "20% Second Exam" verified_on:2026-09-29'),
  ('citation GEO.103-14', 'grade_components', 'GEO.103.lecture/final_exam', 'notes', 'holds',
   'bb_file:42#unit:2 "30% Final Exam" verified_on:2026-09-29'),
  ('citation GEO.103-19', 'assignments', 'GEO.103/exam-1', 'source_ref', 'holds',
   'bb_file:42#unit:3 "There are two exams in the course and a final exam." verified_on:2026-09-29'),
  ('citation GEO.103-20', 'assignments', 'GEO.103/exam-2', 'source_ref', 'holds',
   'bb_file:42#unit:3 "There are two exams in the course and a final exam." verified_on:2026-09-29'),
  ('citation GEO.103-21', 'assignments', 'GEO.103/final-exam', 'source_ref', 'holds',
   'bb_file:42#unit:3 "There are two exams in the course and a final exam." verified_on:2026-09-29'),
  ('citation GEO.103-22', 'assignments', 'GEO.103/carbon-footprint-activity', 'source_ref', 'holds',
   'bb_file:42#unit:5 "You will hand in your results during the discussion section." verified_on:2026-09-29'),
  ('citation GEO.103-24', 'assignments', 'GEO.103/reading-quiz-series', 'source_ref', 'holds',
   'bb_file:42#unit:3 "We will not announce these quizzes in advance." verified_on:2026-09-29'),
  ('citation IST.471-01', 'grading_schemes', 'IST.471', 'notes', 'holds',
   'bb_file:26#unit:5 "Quality of professional work in the internship 70%" verified_on:2026-09-29'),
  ('citation IST.471-08', 'grade_components', 'IST.471/work_quality', 'notes', 'holds',
   'bb_file:61#unit:2 "Please give a number grade and comments if applicable" verified_on:2026-09-29'),
  ('citation IST.471-09', 'grade_components', 'IST.471/assignments', 'notes', 'holds',
   'bb_file:26#unit:5 "Complete, timely submission, and correctly formatted assignments 30%" verified_on:2026-09-29'),
  ('citation IST.471-17', 'assignments', 'IST.471/a6-site-evaluations', 'source_ref', 'holds',
   'bb_file:26#unit:4 "Give the site supervisor evaluation form to your site supervisor." verified_on:2026-09-29'),
  ('citation IST.471-12', 'assignments', 'IST.471/a1-proposal', 'source_ref', 'holds',
   'bb_file:26#unit:3 "submit it as Assignment 1 in Blackboard" verified_on:2026-09-29'),
  ('citation IST.471-13', 'assignments', 'IST.471/a2-introductions', 'source_ref', 'holds',
   'bb_file:26#unit:3 "Assignment 2: Sharing Introductions with classmates." verified_on:2026-09-29'),
  ('citation IST.471-14', 'assignments', 'IST.471/a3-first-impressions', 'source_ref', 'holds',
   'bb_file:26#unit:3 "Assignment 3: First Impressions." verified_on:2026-09-29'),
  ('citation IST.471-15', 'assignments', 'IST.471/a4-learning-agreement', 'source_ref', 'holds',
   'bb_file:26#unit:3 "Assignment 4: The First 30 hours. The Learning Agreement." verified_on:2026-09-29'),
  ('citation IST.471-16', 'assignments', 'IST.471/a5-faculty-visit', 'source_ref', 'holds',
   'bb_file:26#unit:4 "Assignment 5: The faculty supervisor''s visit, call, or email." verified_on:2026-09-29'),
  ('citation IST.471-18', 'assignments', 'IST.471/a7-final-reflection', 'source_ref', 'holds',
   'bb_file:26#unit:4 "Assignment 7: Final Reflection" verified_on:2026-09-29');

do $$
declare
  n   integer;
  bad text;
begin
  select count(*) into n from _t106_expect;
  if n <> 150 then
    raise exception 'FAIL expected 150 text expectations, found %', n;
  end if;
  with actual as (
    select 'grading_schemes'::text as tbl, course_id as row_key, 'notes'::text as col, notes as v from grading_schemes
    union all
    select 'grading_schemes', course_id, 'letter_scale', letter_scale::text from grading_schemes
    union all
    select 'grade_components', course_id || '/' || code, 'notes', notes from grade_components
    union all
    select 'assignments', id, 'source_ref', source_ref from assignments)
  select string_agg(e.label, '; ' order by e.label) into bad
    from _t106_expect e
    left join actual a on a.tbl = e.tbl and a.row_key = e.row_key and a.col = e.col
   where a.v is null
      or (e.mode = 'holds' and position(e.t in a.v) = 0)
      or (e.mode = 'starts' and left(a.v, length(e.t)) <> e.t)
      or (e.mode = 'jsonb' and a.v::jsonb <> e.t::jsonb);
  if bad is not null then
    raise exception 'FAIL text 106 should have written is missing: %', bad;
  end if;
end $$;

drop table _t106_expect;

select 'phase16_106_grading_reconciliation: PASS' as result;

rollback;
