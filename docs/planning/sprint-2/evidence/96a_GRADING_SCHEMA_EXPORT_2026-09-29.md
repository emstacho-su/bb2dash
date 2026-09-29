# 96a — Grading schema export, 2026-09-29

Generated 2026-09-29 from prod (`goultdzqcavefcgnifdy`) by `scripts/export-grading-schema.sql`
(git blob `9a2da4860feeefc58829d58ffb7ed39d7d7c4a43`), run read-only as `db_test_runner` inside
`begin read only; … rollback;`. Sections 0–5 are the query's output, unedited; §6 is the PM's, by hand.
Taken **before migration 105** (links 5); if 105 lands before sitting 1, the export is regenerated
that day (links 7). This is the claim under test for every V-1 sitting (brief 63, method; 96c, shape).

## 0. Counts

| table | rows |
|---|---|
| grading_schemes | 6 |
| grade_components | 35 |
| assignments | 93 |
| grade_column_links | 5 |
| v_gradebook_latest (gradebook columns) | 64 |

## 1. Schemes

| course_id | method | total_points | graded_out_of | letter_scale | ai_policy | notes | confidence | syllabus file |
|---|---|---|---|---|---|---|---|---|
| ECN.304 | weighted_pct | — | — | [{"min": 93, "letter": "A"}, {"min": 90, "letter": "A-"}, {"min": 87, "letter": "B+"}, {"min": 83, "letter": "B"}, {"min": 80, "letter": "B-"}, {"min": 77, "letter": "C+"}, {"min": 73, "letter": "C"}, {"min": 70, "letter": "C-"}, {"min": 60, "letter": "D"}, {"min": 0, "letter": "F"}] | AI is permitted only for reviewing course materials. Each assignment/quiz/exam may state more; if no instructions are given for an item, no AI use is permitted. Any use beyond what is documented is prohibited. Uploading or sharing instructor course materials (Chegg/Course Hero etc.) may be a Level 3 academic-integrity violation; any established violation may result in course failure. | Course grade = Participation 10% + Average Quiz Grade 15% + Highest Exam 30% + Median Exam 25% + Lowest Exam 20%. Exams are non-cumulative and weighted by RANK of score, not exam number. Lowest quiz grade dropped. No total points published. Verified verbatim against ECN 304 F26 Syllabus_M001.pdf (bb_files.id 23) pages 2-3. | confirmed | bb_file:23 |
| GEO.103.lecture | weighted_pct | — | — | [{"min": 94, "letter": "A"}, {"min": 90, "letter": "A-"}, {"min": 87, "letter": "B+"}, {"min": 83, "letter": "B"}, {"min": 80, "letter": "B-"}, {"min": 77, "letter": "C+"}, {"min": 73, "letter": "C"}, {"min": 70, "letter": "C-"}, {"min": 60, "letter": "D"}, {"min": 0, "letter": "F"}] | AI allowed for study aids (e.g. NotebookLM explainers from readings). No AI or technology of any kind during in-class quizzes/exams. | Recitation grade (15% participation + 10% reading quizzes) is earned in section M003 but rolls into this scheme. ~5 unannounced quizzes; lowest dropped (or a zero for a missed one). [Section M003 (TA Cheyenne Morris), from "Discussion Section Syllabus Fall 2026.docx", added 2026-09-03] Participation rubric (Prof. Wilson's guidelines, applied by the TA): A = read everything, clear grasp of key ideas, brings own questions/comments, speaks regularly without dominating, listens and builds on classmates. B = read the material loosely, gets the gist but struggles when pressed, infrequent contributor. C = little evidence of doing the reading, occasional shallow contributions, but attends regularly. D = as C, plus spends large chunks of section on laptop/tablet/phone for non-section things. F = little participation, off-task on devices, and missed sections. Absences lower the grade. Section environment: smartphones not to be used in section - repeated reminders reduce the participation score; laptops for note-taking only unless directed. Absence: notify the TA in advance for university-related activities, ASAP if sick; the student is responsible for checking in with the TA about a reading-quiz make-up after an absence. Grades are not discussed over email - office hours only. | confirmed | bb_file:42 |
| IST.323 | points | 104.00 | 100.00 | [{"min": 94, "letter": "A"}, {"min": 90, "letter": "A-"}, {"min": 87, "letter": "B+"}, {"min": 83, "letter": "B"}, {"min": 80, "letter": "B-"}, {"min": 77, "letter": "C+"}, {"min": 73, "letter": "C"}, {"min": 70, "letter": "C-"}, {"min": 65, "letter": "D"}, {"min": 60, "letter": "D-"}, {"min": 0, "letter": "F"}] | AI allowed as a tool with disclosure; not during tests, quizzes, or the in-class Final Project defense. Final Project: AI explicitly permitted, Appendix B must document what you asked, kept, rejected. | 104 points possible, graded out of 100 (4 pts extra-credit lab). Instructor reserves right to curve/adjust letter grades. | confirmed | bb_file:151 |
| IST.352 | weighted_pct | — | — | [{"min": 93, "letter": "A"}, {"min": 90, "letter": "A-"}, {"min": 87, "letter": "B+"}, {"min": 83, "letter": "B"}, {"min": 80, "letter": "B-"}, {"min": 77, "letter": "C+"}, {"min": 73, "letter": "C"}, {"min": 70, "letter": "C-"}, {"min": 67, "letter": "D+"}, {"min": 63, "letter": "D"}, {"min": 60, "letter": "D-"}, {"min": 0, "letter": "F"}] | Zero tolerance: all generative-AI tools prohibited at every stage (research, brainstorming, outlining, polishing, any content). | Team project: members may receive different grades; peer evaluation per team assignment. One missed class can be made up once with a one-page reading report within a week. Assignments must be electronic, professional, no handwriting. Class time per syllabus: Mon 12:45-2:05 Hinds 018 (Blackboard knowledge checks also fall on Wednesdays; confirm MW). | confirmed | bb_file:27 |
| IST.466 | points | 1020.00 | 1020.00 | [{"min": 930, "letter": "A"}, {"min": 900, "letter": "A-"}, {"min": 870, "letter": "B+"}, {"min": 830, "letter": "B"}, {"min": 800, "letter": "B-"}, {"min": 770, "letter": "C+"}, {"min": 730, "letter": "C"}, {"min": 700, "letter": "C-"}, {"min": 600, "letter": "D"}, {"min": 0, "letter": "F"}] | No AI policy stated in the course syllabus; the syllabus lists an "AI Team Assignment" (100 pts). University academic-integrity appendix applies. | From IST466M3 Fall2026 Syllabus.docx (bb_file 39). 1020 pts: Team Ethics Presentation 150 (practice 50 + presentation 100); Major Project 300 (2 cases x 150, rank-scored 150/140/130/120/110/100 by section placement); Attendance 150 (5/class); Participation 100 (10 per each of 10 ethics presentations); Letter of Gratitude 100; Ethics vs. Presentation 120; AI Team Assignment 100. No text, no final exam. Rubric deck says ethics presentation = 120 pts (Analysis 60/Polish 20/Slides 15/Execution 25); syllabus (100) treated as authoritative. Gradebook columns are rolled over from 2021-22 and do not yet reflect this. | confirmed | bb_file:39 |
| IST.471 | qualitative | — | — | [{"min": 93, "letter": "A"}, {"min": 90, "letter": "A-"}, {"min": 87, "letter": "B+"}, {"min": 84, "letter": "B"}, {"min": 81, "letter": "B-"}, {"min": 77, "letter": "C+"}, {"min": 74, "letter": "C"}, {"min": 71, "letter": "C-"}] | Syllabus p.6 (iSchool appendix, Aug 2026): "Limited and Specified Artificial Intelligence Use." The template placeholder listing permitted assignments was left unfilled, and the appendix states that if no instructions are given for a specific assignment then no AI tool is permitted. No assignment in this shell names an AI allowance, so the operative default for IST 471 is: no AI use on any assignment unless the instructor grants documented permission. Also prohibits uploading/redistributing instructor course materials (Chegg/Course Hero = possible Level 3 violation). | 70% quality of professional work (site supervisor evaluation); 30% complete, timely, correctly formatted assignments. No supervisor evaluation => no credit. Verified against the pulled syllabus PDF 2026-09-03: 70/30 split, letter scale and late-penalty wording match the seed exactly; no change. The 70% work-quality score is produced by Site Supervisor Evaluation.pdf (8 competencies rated 1-5, 8 IM&T learning outcomes rated S/D-SA, 4 narrative questions), which the supervisor returns to the faculty supervisor - this is why the a6 Blackboard column is worth 100 points while the other five are worth 5-10. | confirmed | bb_file:26 |

## 2. Components

| id | course_id | code | name | weight_pct | points | count_expected | aggregation | drop_lowest | rank_weights | normalize_to | is_extra_credit | parent_id | notes | confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ECN.304 | participation | Participation | 10.00 | — | — | manual | 0 | — | — | false | — | Attend and actively participate in every class; email the instructor beforehand to be excused. Gradebook exposes a single manual "Attendance" column (_3598937_1, 100 pts). Verified against syllabus PDF p.2. | confirmed |
| 2 | ECN.304 | quizzes | Average Quiz Grade | 15.00 | — | — | average_drop_lowest | 1 | — | — | false | — | Quizzes on assigned readings and course materials administered throughout the semester; lowest quiz grade dropped. Count and dates are NOT stated in the syllabus. Verified against syllabus PDF p.2. | confirmed |
| 3 | ECN.304 | exams | Exams (rank-weighted) | 75.00 | — | 3 | rank_weighted | 0 | [30, 25, 20] | — | false | — | Highest exam 30%, median 25%, lowest 20%. Three non-cumulative exams (10/01, 11/05, 12/08). Verified against syllabus PDF p.2. | confirmed |
| 4 | GEO.103.lecture | lecture_attendance | Lecture Attendance | 5.00 | — | — | manual | 0 | — | — | false | — | Qwickly; 3 free absences | confirmed |
| 5 | GEO.103.lecture | section_participation | Discussion Section Attendance & Participation | 15.00 | — | — | manual | 0 | — | — | false | — | Earned in section M003; TA sets criteria | confirmed |
| 6 | GEO.103.lecture | reading_quizzes | Reading Quizzes | 10.00 | — | 5 | average_drop_lowest | 1 | — | — | false | — | ~5 unannounced quizzes in section; lowest (or a missed zero) dropped | confirmed |
| 7 | GEO.103.lecture | exam_1 | First Exam | 20.00 | — | 1 | single | 0 | — | — | false | — | — | confirmed |
| 8 | GEO.103.lecture | exam_2 | Second Exam | 20.00 | — | 1 | single | 0 | — | — | false | — | — | confirmed |
| 9 | GEO.103.lecture | final_exam | Final Exam | 30.00 | — | 1 | single | 0 | — | — | false | — | — | confirmed |
| 10 | IST.323 | participation | Class Participation | — | 5.00 | — | manual | 0 | — | — | false | — | Discussion, questions during presentations, demos; laptop misuse => 0 | confirmed |
| 11 | IST.323 | quizzes | Blackboard Quizzes | — | 5.00 | 10 | normalized | 0 | — | 5.00 | false | — | Untimed, up to 3 attempts, due before class; normalized to 5 pts at semester end | confirmed |
| 12 | IST.323 | sitn_group | Security in the News Group Presentation | — | 5.00 | 1 | single | 0 | — | — | false | — | 5-10 min exec summary; group + date assigned on Blackboard | confirmed |
| 13 | IST.323 | individual_presentation | Individual Security Presentation | — | 15.00 | 1 | single | 0 | — | — | false | — | 5-7 min; topic post-Sept-2024; 5+ MLA refs; PowerPoint posted 24h before | confirmed |
| 14 | IST.323 | final_project | Final Project: Security Program Proposal | — | 20.00 | — | sum | 0 | — | — | false | — | Proposal 11 + running log 3 + in-class defense 6 | confirmed |
| 15 | IST.323 | exams | Exams | — | 30.00 | 3 | sum | 0 | — | — | false | — | 3 x 10 pts, non-cumulative, online during class; 40-50 MC/TF + 1-2 short essays | confirmed |
| 16 | IST.323 | labs | Required Labs | — | 20.00 | 4 | sum | 0 | — | — | false | — | 4 x 5 pts; J&B Learning lab environment | confirmed |
| 17 | IST.323 | extra_credit_lab | Extra Credit Lab | — | 4.00 | 1 | single | 0 | — | — | true | — | Due on scheduled final exam day | confirmed |
| 18 | IST.323 | fp_proposal | Final Project: Proposal | — | 11.00 | 1 | single | 0 | — | — | false | 14 | <=4 pages excl. appendices; PLAN-PROTECT-RESPOND; single .docx Blackboard column "Final Project - Proposal and Appendices" = 13 pts (proposal 11 + completed log 2). | confirmed |
| 19 | IST.323 | fp_log | Final Project: Running Log | — | 3.00 | 2 | sum | 0 | — | — | false | 14 | Checkpoint 1 pt (10/30) + completed log 2 pts (with proposal); complete/incomplete | confirmed |
| 20 | IST.323 | fp_defense | Final Project: In-class Defense | — | 6.00 | 1 | single | 0 | — | — | false | 14 | 3 written questions in Blackboard during Exam #3 session; no advance notice; printed copy allowed | confirmed |
| 29 | IST.352 | research | Research - Role of Systems Analyst | 5.00 | — | 1 | single | 0 | — | — | false | — | Individual; Blackboard column 5 pts | confirmed |
| 30 | IST.352 | project_deliverables | Project Assignment Deliverables | 60.00 | — | — | sum | 0 | — | — | false | — | Team: business case (short), project charter, context diagram, high-level processes, data assets, system requirements, interfaces/forms/reports, status reporting, logical modeling & design, data modeling (DFDs), task responsibility matrix, communication plan; bonus: event model, activity diagram, project plans | confirmed |
| 31 | IST.352 | project_final | Project Presentation / Final Version of Deliverables | 10.00 | — | 1 | single | 0 | — | — | false | — | Team presentations 11/2-12/7 | confirmed |
| 32 | IST.352 | peer_assessment | Project Self / Peer Assessment | 10.00 | — | 1 | single | 0 | — | — | false | — | — | confirmed |
| 33 | IST.352 | attendance | Attendance, Class Contribution | 15.00 | — | — | manual | 0 | — | — | false | — | Knowledge checks + reading confirmations feed this; one make-up reading report allowed per semester | confirmed |
| 23 | IST.466 | participation | Participation (10 ethics presentations x 10) | — | 100.00 | 10 | sum | 0 | — | — | false | — | Up to 10 pts per each of the 10 ethics presentations for asking good questions; presenters do not earn participation that day. Syllabus. | confirmed |
| 24 | IST.466 | major_cases | Two Major Case Studies (Synchrony, SU IT) | — | 300.00 | 2 | sum | 0 | — | — | false | — | Two cases (Synchrony, SU IT) x up to 150. Rank-scored within section: 1st 150, 2nd 140, 3rd 130, 4th 120, 5th 110, 6th 100. Same team both cases (Major Case Group #3). Syllabus. | confirmed |
| 25 | IST.466 | ethics_presentations | Team Ethics Case Presentations | — | 100.00 | 1 | single | 0 | — | — | false | — | 40-min team ethics case presentation, up to 100 pts (<30 min capped at 65). Part of "Team Ethics Presentation (150)" with practice. Syllabus. | confirmed |
| 26 | IST.466 | attendance | Attendance | — | 150.00 | 30 | sum | 0 | — | — | false | — | 5 pts per on-time class attendance, up to 150. Syllabus. | confirmed |
| 28 | IST.466 | ethics_practice | Ethics Case Practice | — | 50.00 | 1 | single | 0 | — | — | false | — | 30-min practice with instructor the week before the team ethics presentation, up to 50 pts. Syllabus. | confirmed |
| 34 | IST.466 | ethics_vs | Ethics vs. Presentation | — | 120.00 | 1 | single | 0 | — | — | false | — | Ethics vs. exercise (6 groups: Morals/Laws/Integrity/Religion/Politics/Stress), 120 pts. Syllabus + Ethics vs deck. | confirmed |
| 35 | IST.466 | letter_of_gratitude | Letter of Gratitude | — | 100.00 | 1 | single | 0 | — | — | false | — | 100 pts, last day of class 12/10. Syllabus. | confirmed |
| 36 | IST.466 | ai_team_assignment | AI Team Assignment | — | 100.00 | 1 | single | 0 | — | — | false | — | 100 pts; no details or date yet (syllabus line only). Syllabus. | confirmed |
| 21 | IST.471 | work_quality | Quality of professional work in the internship | 70.00 | — | — | manual | 0 | — | — | false | — | Site supervisor evaluation (Assignment 6). Instrument: Site Supervisor Evaluation.pdf - 8 competencies rated 1-5 (problem analysis, grasping essentials, enthusiasm/creativity, professional-level work, quality of work, trustworthiness, learning from criticism, working independently) plus 8 IM&T program learning outcomes and 4 narrative questions. | confirmed |
| 22 | IST.471 | assignments | Complete, timely, correctly formatted assignments | 30.00 | — | — | manual | 0 | — | — | false | — | Assignments 1-7. Blackboard carries columns for 1-6 only (5+5+5+5+10+100 = 130 raw points); Assignment 7 Final Reflection has no column yet. | confirmed |

## 3. Assignments

| id | title | component_id | points_possible | bb_column_id | due day (America/New_York) | confidence | source_ref |
|---|---|---|---|---|---|---|---|
| ECN.304/attendance | Attendance | 1 | 100.00 | _3598937_1 | — | confirmed | Phase 9 transform, gradebook column _3598937_1 (type inferred from the column name) |
| ECN.304/exam-1 | Exam 1 | 3 | — | — | 2026-10-01 | confirmed | ECN 304 F26 Syllabus_M001.pdf: schedule |
| ECN.304/exam-2 | Exam 2 | 3 | — | — | 2026-11-05 | confirmed | ECN 304 F26 Syllabus_M001.pdf: schedule |
| ECN.304/exam-3 | Exam 3 | 3 | — | — | 2026-12-08 | confirmed | ECN 304 F26 Syllabus_M001.pdf: schedule |
| ECN.304/quiz-01 | Quiz 1 (in class) | 2 | 10.00 | _3607818_1 | 2026-09-03 | confirmed | gradebook column _3607818_1 (run 6b122650) |
| ECN.304/quiz-02 | Quiz 2 (in class) | 2 | 8.00 | _3615278_1 | 2026-09-10 | confirmed | announcement _1668519_1 (2026-09-07) |
| ECN.304/quiz-3 | Quiz 3 (in class) | 2 | 7.00 | _3618944_1 | 2026-09-23 | confirmed | announcement _1670694_1 (2026-09-13); gradebook column _3618944_1 (sync_run 62) |
| ECN.304/quiz-4 | Quiz 4 (in class) | 2 | 10.00 | _3621234_1 | 2026-09-25 | confirmed | Phase 9 transform, gradebook column _3621234_1 (type inferred from the column name) |
| ECN.304/quiz-series | Reading quizzes (series placeholder) | 2 | — | — | — | inferred | ECN 304 F26 Syllabus_M001.pdf: grading policy |
| GEO.103.lecture/absences | Absences | 4 | 100.00 | _3602583_1 | — | confirmed | Phase 9 transform, gradebook column _3602583_1 (type inferred from the column name) |
| GEO.103/exam-1 | First Exam | 7 | — | — | 2026-09-23 | confirmed | GEO 103 syllabus: Week Five |
| GEO.103/exam-2 | Second Exam | 8 | — | — | 2026-11-02 | confirmed | GEO 103 syllabus: Week Eleven |
| GEO.103/final-exam | Final Exam | 9 | — | — | 2026-12-15 | confirmed | GEO 103 syllabus: p.9 |
| GEO.103.recitation/attendance | Attendance | 5 | 100.00 | _3602445_1 | — | confirmed | Phase 9 transform, gradebook column _3602445_1 (type inferred from the column name) |
| GEO.103/carbon-footprint-activity | EPA Carbon Footprint Calculator results | 5 | — | — | 2026-09-11 | tentative | GEO 103 syllabus: Week Three activities; meeting day from Discussion Section Syllabus Fall 2026.docx |
| GEO.103/discussion-questions | Weekly Discussion Questions (prep for section) | 5 | — | — | — | inferred | GEO 103 syllabus: Discussion Sections |
| GEO.103/reading-quiz-series | Unannounced reading quizzes (series placeholder) | 6 | — | — | — | inferred | GEO 103 syllabus: Discussion Sections |
| IST.323/assignment-1 | Assignment #1 (given 8/24, details unknown) | — | — | — | — | inferred | 323Fall26V1.3.1.docx: Week 1 |
| IST.323/exam-1 | Exam #1 | 15 | 10.00 | _3560537_1 | 2026-09-14 | confirmed | 323Fall26V1.3.1.docx: Week 4 |
| IST.323/exam-2 | Exam #2 | 15 | 10.00 | — | 2026-10-21 | confirmed | 323Fall26V1.3.1.docx: Week 9 |
| IST.323/exam-3 | Exam #3 | 15 | 10.00 | — | 2026-12-07 | confirmed | 323Fall26V1.3.1.docx: Week 15 |
| IST.323/fp-defense | Final Project in-class defense | 20 | 6.00 | — | 2026-12-07 | confirmed | 323Fall26V1.3.1.docx: Week 15; deck slide 22 |
| IST.323/fp-log-checkpoint | Final Project running log checkpoint | 19 | 1.00 | _3569947_1 | 2026-10-30 | confirmed | 323Fall26V1.3.1.docx: Week 10 |
| IST.323/fp-log-final | Final Project running log (completed, Appendix C) | 19 | 2.00 | _3569973_1 | 2026-12-02 | confirmed | 323Fall26V1.3.1.docx: Final Project |
| IST.323/fp-packet | Final Project packet assigned (organization) | 14 | — | — | 2026-08-31 | confirmed | 323Fall26V1.3.1.docx: Week 2 |
| IST.323/fp-proposal | Final Project: Security Program Proposal + Appendices A/B/C | 18 | 13.00 | _3569973_1 | 2026-12-02 | confirmed | 323Fall26V1.3.1.docx: Week 14; deck slide 22 |
| IST.323/individual-presentation | Individual Security Presentation | 13 | 15.00 | _3560527_1 | — | tentative | 323Fall26V1.3.1.docx; CourseIntro deck slide 20 |
| IST.323/lab-1 | Lab #1: Performing a Ransomware Attack | 16 | 5.00 | _3560541_1 | 2026-09-23 | confirmed | 323Fall26V1.3.1.docx: Week 5 |
| IST.323/lab-2 | Lab #2 - Using Encryption to Enhance Confidentiality and Integrity | 16 | 5.00 | _3560540_1 | 2026-10-14 | confirmed | 323Fall26V1.3.1.docx: Week 8 \| Blackboard column _3560540_1 folded in 2026-09-29 (inbox item 752, precedent decision 286) |
| IST.323/lab-3 | Lab #3 | 16 | 5.00 | — | 2026-11-30 | confirmed | 323Fall26V1.3.1.docx: Week 14 |
| IST.323/lab-4 | Lab #4 | 16 | 5.00 | — | 2026-12-07 | confirmed | 323Fall26V1.3.1.docx: Week 15 |
| IST.323/lab-extra-credit | Extra Credit Lab | 17 | 4.00 | — | 2026-12-15 | confirmed | 323Fall26V1.3.1.docx: Scheduled Final Exam Day |
| IST.323/participation | Participation | 10 | 5.00 | _3560545_1 | 2026-12-30 | confirmed | Phase 9 transform, gradebook column _3560545_1 (type inferred from the column name) |
| IST.323/presentation-choice | Individual Presentation Selection (topic + date) | — | 100.00 | _3598132_1 | 2026-09-09 | confirmed | 323Fall26V1.3.1.docx: Week 3 |
| IST.323/quiz-01 | Quiz #1 | 11 | 10.00 | _3560530_1 | 2026-09-09 | confirmed | 323Fall26V1.3.1.docx: Week 3 |
| IST.323/quiz-02 | Quiz #2 | 11 | 10.00 | _3560531_1 | 2026-09-09 | confirmed | 323Fall26V1.3.1.docx: Week 3 |
| IST.323/quiz-03 | Quiz #3 | 11 | 10.00 | _3560532_1 | 2026-09-16 | confirmed | 323Fall26V1.3.1.docx: Week 4 |
| IST.323/quiz-04 | Quiz #4 | 11 | 10.00 | _3560533_1 | 2026-09-21 | confirmed | 323Fall26V1.3.1.docx: Week 5 |
| IST.323/quiz-05 | Quiz #5 | 11 | 10.00 | _3560534_1 | 2026-09-28 | confirmed | 323Fall26V1.3.1.docx: Week 6 |
| IST.323/quiz-06 | Quiz #6 | 11 | — | — | 2026-10-05 | confirmed | 323Fall26V1.3.1.docx: Week 7 |
| IST.323/quiz-07 | Quiz #7 | 11 | — | — | 2026-10-07 | confirmed | 323Fall26V1.3.1.docx: Week 7 |
| IST.323/quiz-08 | Quiz #8 | 11 | — | — | 2026-10-19 | confirmed | 323Fall26V1.3.1.docx: Week 9 |
| IST.323/quiz-09 | Quiz #9 | 11 | — | — | 2026-10-28 | confirmed | 323Fall26V1.3.1.docx: Week 10 |
| IST.323/quiz-10 | Quiz #10 | 11 | — | — | 2026-11-11 | confirmed | 323Fall26V1.3.1.docx: Week 12 |
| IST.323/sitn-group-presentation | Security in the News group presentation | 12 | 5.00 | _3560526_1 | 2026-11-04 | confirmed | 323Fall26V1.3.1.docx; deck slide 18 |
| IST.352/knowledge-check-09-09-2026 | Knowledge Check - 09/09/2026 | 33 | 0.00 | _3611110_1 | 2026-09-09 | confirmed | Phase 9 transform, gradebook column _3611110_1 (type inferred from the column name) |
| IST.352/knowledge-check-09-14-26 | Knowledge Check - 09/14/26 | 33 | 0.00 | _3613591_1 | 2026-09-14 | confirmed | Phase 9 transform, gradebook column _3613591_1 (type inferred from the column name) |
| IST.352/knowledge-check-09-16-2026 | Knowledge Check - 09/16/2026 | 33 | 0.00 | _3615186_1 | 2026-09-16 | confirmed | Phase 9 transform, gradebook column _3615186_1 (type inferred from the column name) |
| IST.352/knowledge-check-09-21-26 | Knowledge Check - 09/21/26 | 33 | 0.00 | _3617597_1 | 2026-09-21 | confirmed | Phase 9 transform, gradebook column _3617597_1 (type inferred from the column name) |
| IST.352/knowledge-check-09-23-26 | Knowledge Check - 09/23/26 | 33 | 0.00 | _3619312_1 | 2026-09-23 | confirmed | Phase 9 transform, gradebook column _3619312_1 (type inferred from the column name) |
| IST.352/knowledge-check-09-28-26 | Knowledge Check - 09/28/26 | 33 | 0.00 | _3622060_1 | 2026-09-28 | confirmed | Phase 9 transform, gradebook column _3622060_1 (type inferred from the column name) |
| IST.352/knowledge-check-2026-08-26 | Knowledge Check - 08/26/26 | 33 | 0.00 | _3599875_1 | 2026-08-26 | confirmed | gradebook |
| IST.352/knowledge-check-2026-08-31 | Knowledge Check - 08/31/26 | 33 | 0.00 | _3603945_1 | 2026-08-31 | confirmed | gradebook |
| IST.352/knowledge-check-2026-09-02 | Knowledge Check - 09/02/26 | 33 | 0.00 | _3606600_1 | 2026-09-02 | confirmed | gradebook |
| IST.352/moving-tasks | Moving Tasks | — | 0.00 | _3615326_1 | 2026-09-16 | confirmed | Phase 9 transform, gradebook column _3615326_1 (type inferred from the column name) |
| IST.352/moving-tasks-processes | Moving Tasks - Processes | — | 0.00 | _3619706_1 | 2026-09-23 | confirmed | Phase 9 transform, gradebook column _3619706_1 (type inferred from the column name) |
| IST.352/project-1a | Project Assignment #1A - Project Description | 30 | 10.00 | _3607154_1 | 2026-09-08 | confirmed | re-created item _13195312_1 / column _3607154_1 (run 6b122650); previous _13192249_1/_3606589_1 removed \| bb column re-created _3607154_1 -> _3606589_1 \| bb column re-created _3606589_1 -> _3607154_1 |
| IST.352/project-assignment-2a-project-resources-risks | Project Assignment #2A - Project Resources & Risks | 30 | 10.00 | _3610995_1 | 2026-09-13 | confirmed | Phase 9 transform, gradebook column _3610995_1 (type inferred from the column name) |
| IST.352/project-assignment-3-business-case | Project Assignment #3 - Business Case | 30 | 10.00 | _3543039_1 | 2026-09-20 | confirmed | Phase 9 transform, gradebook column _3543039_1 (type inferred from the column name) |
| IST.352/project-assignment-4-project-charter | Project Assignment #4 - Project Charter | 30 | 10.00 | _3617598_1 | 2026-09-27 | confirmed | Phase 9 transform, gradebook column _3617598_1 (type inferred from the column name) |
| IST.352/project-assignment-5-communication-plan | Project Assignment #5 - Communication Plan | 30 | 10.00 | _3617599_1 | 2026-09-27 | confirmed | Phase 9 transform, gradebook column _3617599_1 (type inferred from the column name) |
| IST.352/project-assignment-6-hl-processes | Project Assignment #6 - HL Processes | 30 | 10.00 | _3543071_1 | 2026-10-04 | confirmed | Phase 9 transform, gradebook column _3543071_1 (type inferred from the column name) |
| IST.352/project-assignment-7-interview-questions | Project Assignment #7 - Interview Questions | 30 | 10.00 | _3622062_1 | 2026-10-04 | confirmed | Phase 9 transform, gradebook column _3622062_1 (type inferred from the column name) |
| IST.352/read-chapter-7-pp-108-111 | Read Chapter 7 (pp. 108-111) | 33 | 0.00 | _3622061_1 | 2026-10-04 | confirmed | Phase 9 transform, gradebook column _3622061_1 (type inferred from the column name) |
| IST.352/reading-ch1 | Reading - Chapter 1 (pp. 11-12) | 33 | 0.00 | _3543065_1 | 2026-08-26 | confirmed | Welcome & Course Introduction.pptx slide 6 |
| IST.352/reading-ch1-all | Read Chapter 1 (All) | 33 | 0.00 | _3599890_1 | 2026-08-30 | confirmed | gradebook |
| IST.352/reading-ch2 | Reading - Chapters 2 | 33 | 0.00 | _3543066_1 | 2026-09-08 | confirmed | gradebook |
| IST.352/reading-chapter-3 | Reading - Chapter 3 | 33 | 0.00 | _3611099_1 | 2026-09-20 | confirmed | Phase 9 transform, gradebook column _3611099_1 (type inferred from the column name) |
| IST.352/reading-chapter-4 | Reading - Chapter 4 | 33 | 0.00 | _3543069_1 | 2026-09-20 | confirmed | Phase 9 transform, gradebook column _3543069_1 (type inferred from the column name) |
| IST.352/reading-chapter-6-pp-91-98 | Reading - Chapter 6 (pp. 91-98) | 33 | 0.00 | _3543072_1 | 2026-09-27 | confirmed | Phase 9 transform, gradebook column _3543072_1 (type inferred from the column name) |
| IST.352/role-of-systems-analyst | Research - Role of Systems Analyst | 29 | 5.00 | _3543038_1 | 2026-09-02 | confirmed | Welcome & Course Introduction.pptx slide 6 |
| IST.352/team-and-project-selection | Project Teams & Option | — | 0.00 | _3543058_1 | 2026-09-01 | confirmed | Welcome & Course Introduction.pptx slides 3-4 |
| IST.352/team-request | Request assignment to random project team | — | — | — | 2026-08-30 | tentative | Welcome & Course Introduction.pptx slide 4 |
| IST.352/term-project | Team project: Otto's Custom T-Shirt E-Commerce Website (Group 7) | 30 | — | — | — | confirmed | Welcome & Course Introduction.pptx slide 3 |
| IST.466/ai-team-assignment | AI Team Assignment | 36 | 100.00 | — | — | tentative | IST466M3 Fall2026 Syllabus.docx |
| IST.466/attendance | Attendance | 26 | 150.00 | _3562493_1 | — | confirmed | Phase 9 transform, gradebook column _3562493_1 (type inferred from the column name) |
| IST.466/attendance-35625001 | Attendance | — | 100.00 | _3562500_1 | — | tentative | Phase 9 transform, gradebook column _3562500_1 (type inferred from the column name) |
| IST.466/class-participation | Class Participation | — | 150.00 | _3562494_1 | — | confirmed | Phase 9 transform, gradebook column _3562494_1 (type inferred from the column name) |
| IST.466/ethics-team-2-practice | Ethics Team 3 practice presentation (30 min) | 28 | 50.00 | _3562491_1 | 2026-09-22 | confirmed | IST466M3 Schedule Fall2026Wk2xy.docx (v. Sep 3): wk 5; Stack 2026-09-17 (team 3) |
| IST.466/ethics-team-2-presentation | Ethics Team 3 presentation | 25 | 100.00 | _3562497_1 | 2026-09-24 | confirmed | IST466M3 Fall2026 Syllabus.docx; IST466 Ethics Cases Spring 2026.docx; schedule wk 5; Stack 2026-09-17 (team 3 + assigned case) |
| IST.466/ethics-vs-activity | "Ethics vs. Activity" presentation | 34 | 120.00 | _3562495_1 | 2026-09-01 | confirmed | IST466M3 Fall2026 Syllabus.docx; Ethics vs IST466_Fall 2026_M3.pptx |
| IST.466/letter-of-gratitude | "Letter of Gratitude" | 35 | 100.00 | — | 2026-12-10 | confirmed | IST466M3 Fall2026 Syllabus.docx; schedule wk 16 |
| IST.466/major-case-2-kickoff | SU IT Dept presents Major Case #2 | — | — | — | 2026-11-05 | confirmed | IST466M3 Schedule Fall2026-Wk2.docx: wk 10-11 |
| IST.466/major-project-1-synchrony | Major Project #1: Synchrony case student presentation | 24 | 150.00 | _3562496_1 | 2026-10-20 | confirmed | IST466M3 Fall2026 Syllabus.docx; schedule wk 8 |
| IST.466/major-project-2-su-it | Major Project #2: SU IT case student presentation | 24 | 150.00 | _3562492_1 | 2026-11-17 | tentative | IST466M3 Fall2026 Syllabus.docx; schedule wk 12 |
| IST.466/synchrony-case-kickoff | Synchrony major case presentation to class (kickoff) | — | — | — | 2026-09-10 | confirmed | IST466M3 Schedule Fall2026-Wk2.docx |
| IST.471/a1-proposal | Assignment 1: Internship Proposal | 22 | 5.00 | _3599883_1 | 2026-09-11 | confirmed | IST 471 Syllabus.pdf: Requirements |
| IST.471/a2-introductions | Assignment 2: Sharing Introductions | 22 | 5.00 | _3599884_1 | 2026-09-11 | confirmed | IST 471 Syllabus.pdf |
| IST.471/a3-first-impressions | Assignment 3: First Impressions | 22 | 5.00 | _3599885_1 | 2026-09-18 | confirmed | IST 471 Syllabus.pdf |
| IST.471/a4-learning-agreement | Assignment 4: Learning Agreement (first 30 hours) | 22 | 5.00 | _3599886_1 | 2026-10-09 | confirmed | IST 471 Syllabus.pdf |
| IST.471/a5-faculty-visit | Assignment 5: Faculty Supervisor Conference (midpoint) | 22 | 10.00 | _3599887_1 | 2026-11-06 | confirmed | IST 471 Syllabus.pdf |
| IST.471/a6-site-evaluations | Assignment 6: Site Supervisor Evaluation | 22 | 100.00 | _3599888_1 | 2026-12-11 | confirmed | IST 471 Syllabus.pdf |
| IST.471/a7-final-reflection | Assignment 7: Final Reflection | 22 | — | — | — | tentative | IST 471 Syllabus.pdf |

## 4. Gradebook columns

| course_id | column_id | name | possible | column_kind | linked_assignments | counts_toward_grade |
|---|---|---|---|---|---|---|
| ECN.304 | _3598937_1 | Attendance | 100.000 | attendance | 1 | true |
| ECN.304 | _3607818_1 | Quiz 1 | 10.000 | item | 1 | true |
| ECN.304 | _3615278_1 | Quiz 2 | 8.000 | item | 1 | true |
| ECN.304 | _3618944_1 | Quiz 3 | 7.000 | item | 1 | true |
| ECN.304 | _3621234_1 | Quiz 4 | 10.000 | item | 1 | true |
| GEO.103.lecture | _3602583_1 | Absences | 100.000 | attendance | 1 | true |
| GEO.103.recitation | _3602445_1 | Attendance | 100.000 | attendance | 1 | true |
| IST.323 | _3560523_1 | Final Letter Grade | 100.000 | letter | 0 | false |
| IST.323 | _3599279_1 | Total Score | 104.000 | total | 0 | false |
| IST.323 | _3560545_1 | Participation | 5.000 | item | 1 | true |
| IST.323 | _3560526_1 | Security in the News Group Presentation | 5.000 | item | 1 | true |
| IST.323 | _3598132_1 | Individual Presentation Selection | 100.000 | item | 1 | false |
| IST.323 | _3560527_1 | Individual Security Presentation | 15.000 | item | 1 | true |
| IST.323 | _3569947_1 | Log Checkpoint Assignment | 1.000 | item | 1 | true |
| IST.323 | _3569973_1 | Final Project - Proposal and Appendices | 13.000 | item | 2 | true |
| IST.323 | _3560541_1 | Lab #1: Performing a Ransomware Attack | 5.000 | item | 1 | true |
| IST.323 | _3560540_1 | Lab #2 - Using Encryption to Enhance Confidentiality and Integrity | 5.000 | item | 1 | true |
| IST.323 | _3560537_1 | Exam #1 | 10.000 | item | 1 | true |
| IST.323 | _3560530_1 | Quiz #1 | 10.000 | item | 1 | true |
| IST.323 | _3560531_1 | Quiz #2 | 10.000 | item | 1 | true |
| IST.323 | _3560532_1 | Quiz #3 | 10.000 | item | 1 | true |
| IST.323 | _3560533_1 | Quiz #4 | 10.000 | item | 1 | true |
| IST.323 | _3560534_1 | Quiz #5 | 10.000 | item | 1 | true |
| IST.352 | _3543038_1 | Research - Role of Systems Analyst | 5.000 | item | 1 | true |
| IST.352 | _3543039_1 | Project Assignment #3 - Business Case | 10.000 | item | 1 | true |
| IST.352 | _3543058_1 | Project Teams & Option | 0.000 | item | 1 | false |
| IST.352 | _3543065_1 | Reading - Chapter 1 (pp. 11-12) | 0.000 | item | 1 | true |
| IST.352 | _3543066_1 | Reading - Chapters 2 | 0.000 | item | 1 | true |
| IST.352 | _3543069_1 | Reading - Chapter 4 | 0.000 | item | 1 | true |
| IST.352 | _3543071_1 | Project Assignment #6 - HL Processes | 10.000 | item | 1 | true |
| IST.352 | _3543072_1 | Reading - Chapter 6 (pp. 91-98) | 0.000 | item | 1 | true |
| IST.352 | _3599875_1 | Knowledge Check - 08/26/26 | 0.000 | item | 1 | true |
| IST.352 | _3599890_1 | Read Chapter 1 (All) | 0.000 | item | 1 | true |
| IST.352 | _3603945_1 | Knowledge Check - 08/31/26 | 0.000 | item | 1 | true |
| IST.352 | _3606600_1 | Knowledge Check - 09/02/26 | 0.000 | item | 1 | true |
| IST.352 | _3607154_1 | Project Assignment #1A - Project Description | 10.000 | item | 1 | true |
| IST.352 | _3610995_1 | Project Assignment #2A - Project Resources & Risks | 10.000 | item | 1 | true |
| IST.352 | _3611099_1 | Reading - Chapter 3 | 0.000 | item | 1 | true |
| IST.352 | _3611110_1 | Knowledge Check - 09/09/2026 | 0.000 | item | 1 | true |
| IST.352 | _3613591_1 | Knowledge Check - 09/14/26 | 0.000 | item | 1 | true |
| IST.352 | _3615186_1 | Knowledge Check - 09/16/2026 | 0.000 | item | 1 | true |
| IST.352 | _3615326_1 | Moving Tasks | 0.000 | item | 1 | false |
| IST.352 | _3617597_1 | Knowledge Check - 09/21/26 | 0.000 | item | 1 | true |
| IST.352 | _3617598_1 | Project Assignment #4 - Project Charter | 10.000 | item | 1 | true |
| IST.352 | _3617599_1 | Project Assignment #5 - Communication Plan | 10.000 | item | 1 | true |
| IST.352 | _3619312_1 | Knowledge Check - 09/23/26 | 0.000 | item | 1 | true |
| IST.352 | _3619706_1 | Moving Tasks - Processes | 0.000 | item | 1 | false |
| IST.352 | _3622060_1 | Knowledge Check - 09/28/26 | 0.000 | item | 1 | true |
| IST.352 | _3622061_1 | Read Chapter 7 (pp. 108-111) | 0.000 | item | 1 | true |
| IST.352 | _3622062_1 | Project Assignment #7 - Interview Questions | 10.000 | item | 1 | true |
| IST.466 | _3562491_1 | Ethics Case Practice | 50.000 | item | 1 | true |
| IST.466 | _3562492_1 | SU IT - Major Case #2 | 150.000 | item | 1 | true |
| IST.466 | _3562493_1 | Attendance | 150.000 | attendance | 1 | true |
| IST.466 | _3562494_1 | Class Participation | 150.000 | item | 1 | false |
| IST.466 | _3562495_1 | Ethics vs. Activity | 120.000 | item | 1 | true |
| IST.466 | _3562496_1 | Synchrony Major Case #1 | 150.000 | item | 1 | true |
| IST.466 | _3562497_1 | Ethics Case Presentation | 100.000 | item | 1 | true |
| IST.466 | _3562500_1 | Attendance | 100.000 | attendance | 1 | false |
| IST.471 | _3599883_1 | Assignment 1 - Internship Proposal | 5.000 | item | 1 | true |
| IST.471 | _3599884_1 | Assignment 2 - Sharing | 5.000 | item | 1 | true |
| IST.471 | _3599885_1 | Assignment 3 - First Impressions | 5.000 | item | 1 | true |
| IST.471 | _3599886_1 | Assignment 4 - Learning Agreement | 5.000 | item | 1 | true |
| IST.471 | _3599887_1 | Assignment 5 - The Faculty Supervisor Conference | 10.000 | item | 1 | true |
| IST.471 | _3599888_1 | Assignment 6 - Site Supervisor Evaluation | 100.000 | item | 1 | true |

## 5. grade_column_links

| course_id | column_id | component_id | excluded |
|---|---|---|---|
| ECN.304 | _3621234_1 | 2 | false |
| IST.323 | _3560527_1 | 13 | false |
| IST.323 | _3560541_1 | 16 | false |
| IST.323 | _3569973_1 | 18 | false |
| IST.323 | _3598132_1 | — | true |

## 6. Open questions

Re-seeded from `docs/planning/sprint-1-hub/briefs/64_GRADING_SCHEMA_EXPORT_2026-09-14.md` §4. "Changed
since 9/14" means `/inbox-apply` or the "Counts toward…" picker has written the row without a document
citation: the sitting treats it as **needs citation or STACK_OVERRIDE**, not as settled.

**Syllabus fallback (IST.323).** §1 resolves IST.323's syllabus to `bb_file:2` because the 2 → 151
supersession chain is Phase 18's (P-26) and `courses.syllabus_path` still names `323Fall26V1.3.1.docx`.
The current syllabus is **`bb_file:151`**; cite it, not 2.

1. **Attendance columns (ECN.304, GEO.103 lecture + recitation, IST.466).** Changed since 9/14: ECN.304
   `attendance` → component 1, GEO.103.recitation `attendance` → component 5, both `confirmed` with no
   citation; the GEO columns each hold a posted 0.000 / 100. Migration 105 marks both GEO columns "Not
   graded" until the GEO sitting (B-10). Needs citation or STACK_OVERRIDE: count, or bookkeeping column?
2. **IST.323 `participation`** is now linked to component 10 (5 pts), `confirmed`, no citation. Needs
   citation or STACK_OVERRIDE.
3. **IST.323 `fp-proposal` is 13 pts** against component 18's 11 (`fp_log` 3, `fp_defense` 6; 20 in all);
   the picker links column `_3569973_1` to 18. Default (B-12): re-cut 18 / 19 to 13 / 1 in 106. Graded
   2026-12-03, inside the code freeze. Open, decided in sitting 1.
4. **IST.466 attendance / participation.** `attendance` (150) → component 26, `confirmed`, no citation;
   `attendance-35625001` (100, `tentative`) and `class-participation` (150, `confirmed`) have no component.
   Default (B-13): leave today's links; the two unscored columns are named under the figure until linked.
   Open.
5. **IST.466 ethics presentation, 120 vs 100.** `ethics-vs-activity` carries 120 → component 34;
   `ethics-team-2-presentation` carries 100 → component 25. Which document governs each? Open.
6. **IST.352 knowledge checks at 0 pts → component 33.** Now nine rows, all `confirmed` by the
   2026-09-29 Inbox answers, no citation. Needs citation or STACK_OVERRIDE.
7. **IST.471 letter scale stops at C- (≥ 71).** Open.
8. **ECN.304 quizzes.** `quiz-02` now carries 8 pts (announcement `_1668519_1`), `quiz-01` 10; the
   component averages with the lowest dropped (`drop_lowest` 1). Are quizzes averaged as percentages?
   Needs citation.
9. **GEO.103.recitation has no scheme** by design (rolls into lecture). Confirm from the section syllabus.
   Open.
10. **ECN.304 rank weights [30, 25, 20]**, no exam dropped. The rule line (R-36) will print them. Confirm
    against the syllabus (`bb_file:23`). Open.
11. **New: IST.466 `major-project-1-synchrony`** returns to `tentative` in 105 (B-9) to match
    major-project-2; its component link is the sitting's to confirm.
12. **New: IST.466 component 24** (`major_cases`) notes named "Major Case Group #3"; 105 corrects it to #2
    (DECISIONS 2026-09-22). Its rank scoring (150 … 100) needs a citation.
