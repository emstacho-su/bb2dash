# Grading schema export — as of 2026-09-14

Generated from prod (`goultdzqcavefcgnifdy`) by the PM session for the V-1 grading validation
stream (`63_GRADING_VALIDATION.md`). This is the **claim under test**: what `grading_schemes`,
`grade_components` and `assignments` say today. The validation session reads this file and the
materials corpus (via the `bb2dash` MCP server) and nothing else. It never touches the database.

Columns are verbatim from the tables; `—` is NULL. `source/confidence` is the row's own
provenance claim, which is exactly what the validation is checking.

## 1. `grading_schemes` (one row per course; GEO.103.recitation has none by design — it rolls into the lecture scheme)

| course | method | total_points | graded_out_of | letter scale (min score → letter) | late policy | source | confidence | current syllabus file(s) |
|---|---|---|---|---|---|---|---|---|
| ECN.304 | weighted_pct | — | — | A≥93 A-≥90 B+≥87 B≥83 B-≥80 C+≥77 C≥73 C-≥70 D≥60 F≥0 | Exams may not be made up unless an urgent and legitimate reason is demonstrated with relevant proof. Email the instructor beforehand to be excused from a class; if a true emergency prevents that, email as soon as possible afterward. | blackboard | confirmed | ECN 304 F26 Syllabus_M001.pdf (bb_file 23) |
| GEO.103.lecture | weighted_pct | — | — | A≥94 A-≥90 B+≥87 B≥83 B-≥80 C+≥77 C≥73 C-≥70 D≥60 F≥0 | No late policy stated: the course has no submitted written work. All grades come from Qwickly lecture attendance, discussion-section attendance/participation, unannounced in-section reading quizzes, and three in-class exams. | syllabus | confirmed | GEO 103 (2026) - syllabus - FINAL.pdf (bb_file 42) |
| IST.323 | points | 104.00 | 100.00 | A≥94 A-≥90 B+≥87 B≥83 B-≥80 C+≥77 C≥73 C-≥70 D≥65 D-≥60 F≥0 | Deadlines are firm. Late submissions NOT accepted. Wrong submission format => lowered grade or 0. | syllabus | confirmed | 323Fall26V1.3.1.docx (bb_file 2); Student Policies and Services - syllabus appendix August 2026 .docx (bb_file 3) |
| IST.352 | weighted_pct | — | — | A≥93 A-≥90 B+≥87 B≥83 B-≥80 C+≥77 C≥73 C-≥70 D+≥67 D≥63 D-≥60 F≥0 | 20% of total points per day late; only documented/endorsed excuses considered. Re-grade requests within one week of return. | blackboard | confirmed | IST 352 Syllabus Fall 2026.docx (bb_file 27) |
| IST.466 | points | 1020.00 | 1020.00 | A≥930 A-≥900 B+≥870 B≥830 B-≥800 C+≥770 C≥730 C-≥700 D≥600 F≥0 | No stated late policy (all deliverables are in-class presentations). Ethics presentations under 30 minutes are capped at 65% of points. Disrespect in class (talking, using tech, disrespecting speakers) can cost up to 20 points per class. Attendance: 5 pts per on-time class. | blackboard | confirmed | Student Policies and Services - Syllabus appendix August 2026 .docx (bb_file 33); IST466M3 Fall2026 Syllabus.docx (bb_file 39) |
| IST.471 | qualitative | — | — | A≥93 A-≥90 B+≥87 B≥84 B-≥81 C+≥77 C≥74 C-≥71 | Penalties for incomplete, late, or incorrectly formatted assignments at professor discretion. | syllabus | confirmed | IST 471 Syllabus.pdf (bb_file 26) |

### Scheme notes (verbatim `grading_schemes.notes`)

### ECN.304

Course grade = Participation 10% + Average Quiz Grade 15% + Highest Exam 30% + Median Exam 25% + Lowest Exam 20%. Exams are non-cumulative and weighted by RANK of score, not exam number. Lowest quiz grade dropped. No total points published. Verified verbatim against ECN 304 F26 Syllabus_M001.pdf (bb_files.id 23) pages 2-3.

### GEO.103.lecture

Recitation grade (15% participation + 10% reading quizzes) is earned in section M003 but rolls into this scheme. ~5 unannounced quizzes; lowest dropped (or a zero for a missed one).

[Section M003 (TA Cheyenne Morris), from "Discussion Section Syllabus Fall 2026.docx", added 2026-09-03] Participation rubric (Prof. Wilson's guidelines, applied by the TA): A = read everything, clear grasp of key ideas, brings own questions/comments, speaks regularly without dominating, listens and builds on classmates. B = read the material loosely, gets the gist but struggles when pressed, infrequent contributor. C = little evidence of doing the reading, occasional shallow contributions, but attends regularly. D = as C, plus spends large chunks of section on laptop/tablet/phone for non-section things. F = little participation, off-task on devices, and missed sections. Absences lower the grade. Section environment: smartphones not to be used in section - repeated reminders reduce the participation score; laptops for note-taking only unless directed. Absence: notify the TA in advance for university-related activities, ASAP if sick; the student is responsible for checking in with the TA about a reading-quiz make-up after an absence. Grades are not discussed over email - office hours only.

### IST.323

104 points possible, graded out of 100 (4 pts extra-credit lab). Instructor reserves right to curve/adjust letter grades.

### IST.352

Team project: members may receive different grades; peer evaluation per team assignment. One missed class can be made up once with a one-page reading report within a week. Assignments must be electronic, professional, no handwriting. Class time per syllabus: Mon 12:45-2:05 Hinds 018 (Blackboard knowledge checks also fall on Wednesdays; confirm MW).

### IST.466

From IST466M3 Fall2026 Syllabus.docx (bb_file 39). 1020 pts: Team Ethics Presentation 150 (practice 50 + presentation 100); Major Project 300 (2 cases x 150, rank-scored 150/140/130/120/110/100 by section placement); Attendance 150 (5/class); Participation 100 (10 per each of 10 ethics presentations); Letter of Gratitude 100; Ethics vs. Presentation 120; AI Team Assignment 100. No text, no final exam. Rubric deck says ethics presentation = 120 pts (Analysis 60/Polish 20/Slides 15/Execution 25); syllabus (100) treated as authoritative. Gradebook columns are rolled over from 2021-22 and do not yet reflect this.

### IST.471

70% quality of professional work (site supervisor evaluation); 30% complete, timely, correctly formatted assignments. No supervisor evaluation => no credit. Verified against the pulled syllabus PDF 2026-09-03: 70/30 split, letter scale and late-penalty wording match the seed exactly; no change. The 70% work-quality score is produced by Site Supervisor Evaluation.pdf (8 competencies rated 1-5, 8 IM&T learning outcomes rated S/D-SA, 4 narrative questions), which the supervisor returns to the faculty supervisor - this is why the a6 Blackboard column is worth 100 points while the other five are worth 5-10.

## 2. `grade_components` (`↳` = child of the component above it)

| course | code | name | weight % | points | count | aggregation | drop lowest | rank weights | source/confidence |
|---|---|---|---|---|---|---|---|---|---|
| ECN.304 | participation | Participation | 10.00 | — | — | manual | — | — | blackboard/confirmed |
| ECN.304 | quizzes | Average Quiz Grade | 15.00 | — | — | average_drop_lowest | 1 | — | blackboard/confirmed |
| ECN.304 | exams | Exams (rank-weighted) | 75.00 | — | 3 | rank_weighted | — | [30, 25, 20] | blackboard/confirmed |
| GEO.103.lecture | lecture_attendance | Lecture Attendance | 5.00 | — | — | manual | — | — | syllabus/confirmed |
| GEO.103.lecture | section_participation | Discussion Section Attendance & Participation | 15.00 | — | — | manual | — | — | syllabus/confirmed |
| GEO.103.lecture | reading_quizzes | Reading Quizzes | 10.00 | — | 5 | average_drop_lowest | 1 | — | syllabus/confirmed |
| GEO.103.lecture | exam_1 | First Exam | 20.00 | — | 1 | single | — | — | syllabus/confirmed |
| GEO.103.lecture | exam_2 | Second Exam | 20.00 | — | 1 | single | — | — | syllabus/confirmed |
| GEO.103.lecture | final_exam | Final Exam | 30.00 | — | 1 | single | — | — | syllabus/confirmed |
| IST.323 | participation | Class Participation | — | 5.00 | — | manual | — | — | syllabus/confirmed |
| IST.323 | quizzes | Blackboard Quizzes | — | 5.00 | 10 | normalized | — | — | syllabus/confirmed |
| IST.323 | sitn_group | Security in the News Group Presentation | — | 5.00 | 1 | single | — | — | syllabus/confirmed |
| IST.323 | individual_presentation | Individual Security Presentation | — | 15.00 | 1 | single | — | — | syllabus/confirmed |
| IST.323 | final_project | Final Project: Security Program Proposal | — | 20.00 | — | sum | — | — | syllabus/confirmed |
| IST.323 | ↳ fp_proposal | Final Project: Proposal | — | 11.00 | 1 | single | — | — | syllabus/confirmed |
| IST.323 | ↳ fp_log | Final Project: Running Log | — | 3.00 | 2 | sum | — | — | syllabus/confirmed |
| IST.323 | ↳ fp_defense | Final Project: In-class Defense | — | 6.00 | 1 | single | — | — | syllabus/confirmed |
| IST.323 | exams | Exams | — | 30.00 | 3 | sum | — | — | syllabus/confirmed |
| IST.323 | labs | Required Labs | — | 20.00 | 4 | sum | — | — | syllabus/confirmed |
| IST.323 | extra_credit_lab | Extra Credit Lab | — | 4.00 | 1 | single | — | — | syllabus/confirmed |
| IST.352 | research | Research - Role of Systems Analyst | 5.00 | — | 1 | single | — | — | blackboard/confirmed |
| IST.352 | project_deliverables | Project Assignment Deliverables | 60.00 | — | — | sum | — | — | blackboard/confirmed |
| IST.352 | project_final | Project Presentation / Final Version of Deliverables | 10.00 | — | 1 | single | — | — | blackboard/confirmed |
| IST.352 | peer_assessment | Project Self / Peer Assessment | 10.00 | — | 1 | single | — | — | blackboard/confirmed |
| IST.352 | attendance | Attendance, Class Contribution | 15.00 | — | — | manual | — | — | blackboard/confirmed |
| IST.466 | participation | Participation (10 ethics presentations x 10) | — | 100.00 | 10 | sum | — | — | blackboard/confirmed |
| IST.466 | major_cases | Two Major Case Studies (Synchrony, SU IT) | — | 300.00 | 2 | sum | — | — | blackboard/confirmed |
| IST.466 | ethics_presentations | Team Ethics Case Presentations | — | 100.00 | 1 | single | — | — | blackboard/confirmed |
| IST.466 | attendance | Attendance | — | 150.00 | 30 | sum | — | — | blackboard/confirmed |
| IST.466 | ethics_practice | Ethics Case Practice | — | 50.00 | 1 | single | — | — | blackboard/confirmed |
| IST.466 | ethics_vs | Ethics vs. Presentation | — | 120.00 | 1 | single | — | — | blackboard/confirmed |
| IST.466 | letter_of_gratitude | Letter of Gratitude | — | 100.00 | 1 | single | — | — | blackboard/confirmed |
| IST.466 | ai_team_assignment | AI Team Assignment | — | 100.00 | 1 | single | — | — | blackboard/confirmed |
| IST.471 | work_quality | Quality of professional work in the internship | 70.00 | — | — | manual | — | — | syllabus/confirmed |
| IST.471 | assignments | Complete, timely, correctly formatted assignments | 30.00 | — | — | manual | — | — | syllabus/confirmed |

Arithmetic as stored: ECN.304 weights sum 100; GEO.103.lecture 100; IST.352 100; IST.471 100.
IST.323 top-level points 5+5+5+15+20+30+20+4 = 104 (= total_points), final-project children
11+3+6 = 20. IST.466 points 100+300+100+150+50+120+100+100 = 1020 (= total_points).

## 3. `assignments` → component links

`**(none)**` = `component_id` is NULL. Every row here counts toward a component only if linked.

| course | id | title | type | due | points | component | source/confidence |
|---|---|---|---|---|---|---|---|
| ECN.304 | ECN.304/quiz-01 | Quiz 1 (in class) | quiz | 2026-09-01 | 10.00 | quizzes | blackboard/confirmed |
| ECN.304 | ECN.304/quiz-02 | Quiz 2 (in class) | quiz | 2026-09-10 | — | quizzes | blackboard/confirmed |
| ECN.304 | ECN.304/attendance | Attendance | attendance | — | 100.00 | **(none)** | blackboard/tentative |
| ECN.304 | ECN.304/exam-1 | Exam 1 | exam | — | — | exams | syllabus/confirmed |
| ECN.304 | ECN.304/exam-2 | Exam 2 | exam | — | — | exams | syllabus/confirmed |
| ECN.304 | ECN.304/exam-3 | Exam 3 | exam | — | — | exams | syllabus/confirmed |
| ECN.304 | ECN.304/quiz-series | Reading quizzes (series placeholder) | quiz | — | — | quizzes | syllabus/inferred |
| GEO.103.lecture | GEO.103.lecture/absences | Absences | attendance | — | 100.00 | **(none)** | blackboard/tentative |
| GEO.103.lecture | GEO.103/exam-1 | First Exam | exam | — | — | exam_1 | syllabus/confirmed |
| GEO.103.lecture | GEO.103/exam-2 | Second Exam | exam | — | — | exam_2 | syllabus/confirmed |
| GEO.103.lecture | GEO.103/final-exam | Final Exam | final_exam | — | — | final_exam | syllabus/confirmed |
| GEO.103.recitation | GEO.103.recitation/attendance | Attendance | attendance | — | 100.00 | **(none)** | blackboard/tentative |
| GEO.103.recitation | GEO.103/carbon-footprint-activity | EPA Carbon Footprint Calculator results | activity | — | — | section_participation | blackboard/tentative |
| GEO.103.recitation | GEO.103/discussion-questions | Weekly Discussion Questions (prep for section) | discussion_post | — | — | section_participation | syllabus/inferred |
| GEO.103.recitation | GEO.103/reading-quiz-series | Unannounced reading quizzes (series placeholder) | quiz | — | — | reading_quizzes | syllabus/inferred |
| IST.323 | IST.323/quiz-01 | Quiz #1 | quiz | 2026-09-09 | 10.00 | quizzes | blackboard/confirmed |
| IST.323 | IST.323/quiz-02 | Quiz #2 | quiz | 2026-09-09 | 10.00 | quizzes | blackboard/confirmed |
| IST.323 | IST.323/presentation-choice | Individual Presentation Selection (topic + date) | form | 2026-09-10 | 0.00 | **(none)** | blackboard/confirmed |
| IST.323 | IST.323/quiz-03 | Quiz #3 | quiz | 2026-09-16 | — | quizzes | syllabus/confirmed |
| IST.323 | IST.323/quiz-04 | Quiz #4 | quiz | 2026-09-21 | — | quizzes | syllabus/confirmed |
| IST.323 | IST.323/quiz-05 | Quiz #5 | quiz | 2026-09-28 | — | quizzes | syllabus/confirmed |
| IST.323 | IST.323/quiz-06 | Quiz #6 | quiz | 2026-10-05 | — | quizzes | syllabus/confirmed |
| IST.323 | IST.323/quiz-07 | Quiz #7 | quiz | 2026-10-07 | — | quizzes | syllabus/confirmed |
| IST.323 | IST.323/quiz-08 | Quiz #8 | quiz | 2026-10-19 | — | quizzes | syllabus/confirmed |
| IST.323 | IST.323/quiz-09 | Quiz #9 | quiz | 2026-10-28 | — | quizzes | syllabus/confirmed |
| IST.323 | IST.323/fp-log-checkpoint | Final Project running log checkpoint | checkpoint | 2026-10-31 | 1.00 | fp_log | blackboard/confirmed |
| IST.323 | IST.323/quiz-10 | Quiz #10 | quiz | 2026-11-11 | — | quizzes | syllabus/confirmed |
| IST.323 | IST.323/fp-log-final | Final Project running log (completed, Appendix C) | checkpoint | 2026-12-03 | 2.00 | fp_log | syllabus/confirmed |
| IST.323 | IST.323/fp-proposal | Final Project: Security Program Proposal + Appendices A/B/C | project | 2026-12-03 | 13.00 | fp_proposal | blackboard/confirmed |
| IST.323 | IST.323/participation | Participation | participation | 2026-12-31 | 5.00 | **(none)** | blackboard/tentative |
| IST.323 | IST.323/assignment-1 | Assignment #1 (given 8/24, details unknown) | homework | — | — | **(none)** | syllabus/inferred |
| IST.323 | IST.323/exam-1 | Exam #1 | exam | — | 10.00 | exams | syllabus/confirmed |
| IST.323 | IST.323/exam-2 | Exam #2 | exam | — | 10.00 | exams | syllabus/confirmed |
| IST.323 | IST.323/exam-3 | Exam #3 | exam | — | 10.00 | exams | syllabus/confirmed |
| IST.323 | IST.323/fp-defense | Final Project in-class defense | exam | — | 6.00 | fp_defense | syllabus/confirmed |
| IST.323 | IST.323/fp-packet | Final Project packet assigned (organization) | other | — | — | final_project | blackboard/confirmed |
| IST.323 | IST.323/individual-presentation | Individual Security Presentation | presentation | — | 15.00 | individual_presentation | syllabus/tentative |
| IST.323 | IST.323/lab-1 | Lab #1 | lab | — | 5.00 | labs | syllabus/confirmed |
| IST.323 | IST.323/lab-2 | Lab #2 | lab | — | 5.00 | labs | syllabus/confirmed |
| IST.323 | IST.323/lab-3 | Lab #3 | lab | — | 5.00 | labs | syllabus/confirmed |
| IST.323 | IST.323/lab-4 | Lab #4 | lab | — | 5.00 | labs | syllabus/confirmed |
| IST.323 | IST.323/lab-extra-credit | Extra Credit Lab | lab | — | 4.00 | extra_credit_lab | syllabus/confirmed |
| IST.323 | IST.323/sitn-group-presentation | Security in the News group presentation | group_presentation | — | 5.00 | sitn_group | syllabus/tentative |
| IST.352 | IST.352/knowledge-check-2026-08-26 | Knowledge Check - 08/26/26 | quiz | 2026-08-26 | 0.00 | attendance | blackboard/confirmed |
| IST.352 | IST.352/reading-ch1 | Reading - Chapter 1 (pp. 11-12) | reading | 2026-08-27 | 0.00 | attendance | blackboard/confirmed |
| IST.352 | IST.352/reading-ch1-all | Read Chapter 1 (All) | reading | 2026-08-31 | 0.00 | attendance | blackboard/confirmed |
| IST.352 | IST.352/knowledge-check-2026-08-31 | Knowledge Check - 08/31/26 | quiz | 2026-08-31 | 0.00 | attendance | blackboard/confirmed |
| IST.352 | IST.352/team-and-project-selection | Project Teams & Option | form | 2026-09-02 | 0.00 | **(none)** | blackboard/confirmed |
| IST.352 | IST.352/knowledge-check-2026-09-02 | Knowledge Check - 09/02/26 | quiz | 2026-09-02 | 0.00 | attendance | blackboard/confirmed |
| IST.352 | IST.352/role-of-systems-analyst | Research - Role of Systems Analyst | homework | 2026-09-03 | 5.00 | research | blackboard/confirmed |
| IST.352 | IST.352/project-1a | Project Assignment #1A - Project Description | project | 2026-09-09 | 10.00 | project_deliverables | blackboard/confirmed |
| IST.352 | IST.352/reading-ch2 | Reading - Chapters 2 | reading | 2026-09-09 | 0.00 | attendance | blackboard/confirmed |
| IST.352 | IST.352/team-request | Request assignment to random project team | form | — | — | **(none)** | syllabus/tentative |
| IST.352 | IST.352/term-project | Team project: Otto's Custom T-Shirt E-Commerce Website (Group 7) | project | — | — | project_deliverables | blackboard/confirmed |
| IST.466 | IST.466/ai-team-assignment | AI Team Assignment | project | — | 100.00 | ai_team_assignment | syllabus/tentative |
| IST.466 | IST.466/attendance | Attendance | attendance | — | 150.00 | **(none)** | blackboard/tentative |
| IST.466 | IST.466/attendance-35625001 | Attendance | attendance | — | 100.00 | **(none)** | blackboard/tentative |
| IST.466 | IST.466/class-participation | Class Participation | participation | — | 150.00 | **(none)** | blackboard/tentative |
| IST.466 | IST.466/ethics-team-2-practice | Ethics Team 2 practice presentation (30 min) | presentation | — | 50.00 | ethics_practice | syllabus/confirmed |
| IST.466 | IST.466/ethics-team-2-presentation | Ethics Team 2 presentation | group_presentation | — | 100.00 | ethics_presentations | syllabus/confirmed |
| IST.466 | IST.466/ethics-vs-activity | "Ethics vs. Activity" presentation | presentation | — | 120.00 | ethics_vs | syllabus/confirmed |
| IST.466 | IST.466/letter-of-gratitude | "Letter of Gratitude" | paper | — | 100.00 | letter_of_gratitude | syllabus/confirmed |
| IST.466 | IST.466/major-case-2-kickoff | SU IT Dept presents Major Case #2 | other | — | — | **(none)** | syllabus/confirmed |
| IST.466 | IST.466/major-project-1-synchrony | Major Project #1: Synchrony case student presentation | group_presentation | — | 150.00 | major_cases | syllabus/tentative |
| IST.466 | IST.466/major-project-2-su-it | Major Project #2: SU IT case student presentation | group_presentation | — | 150.00 | major_cases | syllabus/tentative |
| IST.466 | IST.466/synchrony-case-kickoff | Synchrony major case presentation to class (kickoff) | other | — | — | **(none)** | syllabus/confirmed |
| IST.471 | IST.471/a1-proposal | Assignment 1: Internship Proposal | form | 2026-09-12 | 5.00 | assignments | blackboard/confirmed |
| IST.471 | IST.471/a2-introductions | Assignment 2: Sharing Introductions | discussion_post | 2026-09-12 | 5.00 | assignments | blackboard/confirmed |
| IST.471 | IST.471/a3-first-impressions | Assignment 3: First Impressions | paper | 2026-09-19 | 5.00 | assignments | blackboard/confirmed |
| IST.471 | IST.471/a4-learning-agreement | Assignment 4: Learning Agreement (first 30 hours) | form | 2026-10-10 | 5.00 | assignments | blackboard/confirmed |
| IST.471 | IST.471/a5-faculty-visit | Assignment 5: Faculty Supervisor Conference (midpoint) | meeting | 2026-11-07 | 10.00 | assignments | blackboard/confirmed |
| IST.471 | IST.471/a6-site-evaluations | Assignment 6: Site Supervisor Evaluation | evaluation | 2026-12-12 | 100.00 | assignments | blackboard/confirmed |
| IST.471 | IST.471/a7-final-reflection | Assignment 7: Final Reflection | paper | — | — | assignments | syllabus/tentative |

## 4. Questions the export itself raises (seed list for the session; not verdicts)

1. **Attendance rows unlinked in four courses** (ECN.304, GEO.103.lecture, GEO.103.recitation,
   IST.466 ×2, all `blackboard/tentative`, 100–150 pts). Each course has an attendance or
   participation component. Link, or mark as a non-graded Blackboard bookkeeping column?
2. **IST.323 `participation` assignment is unlinked** although the `participation` component
   exists with the same 5 points.
3. **IST.323 `fp-proposal` is 13 pts** but the `fp_proposal` component is 11 (with `fp_log` 3 and
   `fp_defense` 6 = 20). Does the Blackboard column bundle the 2-pt final log? Which is right?
4. **IST.466 has two Attendance rows** (150 and 100 pts) and a Class Participation row (150 pts),
   none linked; the scheme notes say gradebook columns are rolled over from 2021-22. Which
   Blackboard columns are live this term, and do the syllabus figures (attendance 150,
   participation 100) hold?
5. **IST.466 ethics presentation: rubric deck says 120, syllabus says 100.** The scheme treats
   the syllabus as authoritative. Stack to confirm with the professor's materials or in class.
6. **IST.352 knowledge checks and readings are linked to `attendance` at 0 pts.** Is that the
   professor's intent (they feed "class contribution") or a placeholder?
7. **IST.471 letter scale stops at C- (≥71).** Does the syllabus define D/F, or is anything below
   C- a fail for an internship credit?
8. **ECN.304 `quiz-02` has no points**, `quiz-01` has 10. Does the syllabus give a per-quiz point
   value, or are quizzes averaged as percentages (which would make `points` irrelevant)?
9. **GEO.103.recitation carries no scheme** by design (rolls into lecture). Confirm the section
   syllabus does not define a separate section grade.
10. **ECN.304 rank weights [30, 25, 20]** for highest / median / lowest exam. Confirm against the
    syllabus text and that no exam is dropped.
