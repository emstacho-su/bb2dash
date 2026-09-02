-- bb2dash :: 003_seed_fall2026_assignments.sql
-- Every deliverable/event derivable from syllabi and intro decks.
-- confidence: confirmed = date+item explicit in syllabus; tentative = item explicit, date inferred; inferred = existence inferred.
-- Times: EDT (-04) through 2026-11-01 02:00, EST (-05) after.

begin;

-- helper
create or replace function _gc(p_course text, p_code text) returns bigint language sql stable as
$$ select id from grade_components where course_id = p_course and code = p_code $$;

-- ===========================================================================
-- ECN 304
-- ===========================================================================
insert into assignments (id, course_id, component_id, title, type, recurrence, series_key, sequence_no, due_date, event_start, submission, description, source_ref, confidence) values
('ECN.304/exam-1','ECN.304',_gc('ECN.304','exams'),'Exam 1','exam','recurring','ECN.304/exam',1,'2026-10-01',null,'in_class','Non-cumulative. Covers deficits/debt, Social Security, health care costs (weeks 1-6).','ECN 304 F26 Syllabus_M001.pdf: schedule','confirmed'),
('ECN.304/exam-2','ECN.304',_gc('ECN.304','exams'),'Exam 2','exam','recurring','ECN.304/exam',2,'2026-11-05',null,'in_class','Non-cumulative. Covers climate/environment, Great Recession, international financial crisis (weeks 7-11).','ECN 304 F26 Syllabus_M001.pdf: schedule','confirmed'),
('ECN.304/exam-3','ECN.304',_gc('ECN.304','exams'),'Exam 3','exam','recurring','ECN.304/exam',3,'2026-12-08',null,'in_class','Non-cumulative. Covers discrimination, trade, crime (weeks 12-15). Last class day.','ECN 304 F26 Syllabus_M001.pdf: schedule','confirmed'),
('ECN.304/quiz-series','ECN.304',_gc('ECN.304','quizzes'),'Reading quizzes (series placeholder)','quiz','recurring','ECN.304/quiz',null,null,null,'unknown','Quizzes on assigned readings administered throughout the semester; dates/count not in syllabus. Replace with individual rows once visible in Blackboard.','ECN 304 F26 Syllabus_M001.pdf: grading policy','inferred');

-- ===========================================================================
-- GEO 103 (lecture + recitation)
-- ===========================================================================
insert into assignments (id, course_id, component_id, title, type, recurrence, series_key, sequence_no, due_date, event_start, event_end, submission, description, source_ref, confidence) values
('GEO.103/exam-1','GEO.103.lecture',_gc('GEO.103.lecture','exam_1'),'First Exam','exam','recurring','GEO.103/exam',1,'2026-09-23','2026-09-23 10:35-04','2026-09-23 11:30-04','in_class','Covers lecture, readings, and discussion sections weeks 1-5. Format TBA.','GEO 103 syllabus: Week Five','confirmed'),
('GEO.103/exam-2','GEO.103.lecture',_gc('GEO.103.lecture','exam_2'),'Second Exam','exam','recurring','GEO.103/exam',2,'2026-11-02','2026-11-02 10:35-05','2026-11-02 11:30-05','in_class','Covers weeks 6-10.','GEO 103 syllabus: Week Eleven','confirmed'),
('GEO.103/final-exam','GEO.103.lecture',_gc('GEO.103.lecture','final_exam'),'Final Exam','final_exam','one_off',null,null,'2026-12-15','2026-12-15 17:15-05','2026-12-15 19:15-05','in_class','Tuesday Dec 15, 5:15-7:15 PM. Location TBA.','GEO 103 syllabus: p.9','confirmed'),
('GEO.103/carbon-footprint-activity','GEO.103.recitation',_gc('GEO.103.lecture','section_participation'),'EPA Carbon Footprint Calculator results','activity','one_off',null,null,'2026-09-11',null,null,'in_class','Do the EPA calculator (link on Blackboard) before the week 3 readings; hand in results during discussion section. Date assumes section meets Fri 9/11.','GEO 103 syllabus: Week Three activities','tentative'),
('GEO.103/reading-quiz-series','GEO.103.recitation',_gc('GEO.103.lecture','reading_quizzes'),'Unannounced reading quizzes (series placeholder)','quiz','recurring','GEO.103/reading-quiz',null,null,null,null,'in_class','~5 unannounced quizzes in section; Blackboard "Discussion Questions" may become quiz questions. Lowest dropped.','GEO 103 syllabus: Discussion Sections','inferred'),
('GEO.103/discussion-questions','GEO.103.recitation',_gc('GEO.103.lecture','section_participation'),'Weekly Discussion Questions (prep for section)','discussion_post','recurring','GEO.103/discussion-questions',null,null,null,null,'none','4-5 questions posted on Blackboard under "Discussion Questions" each week; prepare answers before section. Not submitted.','GEO 103 syllabus: Discussion Sections','inferred');

-- ===========================================================================
-- IST 323
-- ===========================================================================
-- Quizzes: due before class (3:45 PM) on the listed day
insert into assignments (id, course_id, component_id, title, type, recurrence, series_key, sequence_no, due_at, due_rule, submission, description, source_ref, confidence) values
('IST.323/quiz-01','IST.323',_gc('IST.323','quizzes'),'Quiz #1','quiz','recurring','IST.323/quiz',1,'2026-09-09 15:45-04','before class','blackboard','Chap 1. Moved to 9/9 in syllabus v1.3.1.','323Fall26V1.3.1.docx: Week 3','confirmed'),
('IST.323/quiz-02','IST.323',_gc('IST.323','quizzes'),'Quiz #2','quiz','recurring','IST.323/quiz',2,'2026-09-09 15:45-04','before class','blackboard','Chap 2.1-2.7. Moved to 9/9 in syllabus v1.3.1.','323Fall26V1.3.1.docx: Week 3','confirmed'),
('IST.323/quiz-03','IST.323',_gc('IST.323','quizzes'),'Quiz #3','quiz','recurring','IST.323/quiz',3,'2026-09-16 15:45-04','before class','blackboard','Chap 3.1-3.3 (Cryptography 1)','323Fall26V1.3.1.docx: Week 4','confirmed'),
('IST.323/quiz-04','IST.323',_gc('IST.323','quizzes'),'Quiz #4','quiz','recurring','IST.323/quiz',4,'2026-09-21 15:45-04','before class','blackboard','Chap 3.4-3.9 (Cryptography 2)','323Fall26V1.3.1.docx: Week 5','confirmed'),
('IST.323/quiz-05','IST.323',_gc('IST.323','quizzes'),'Quiz #5','quiz','recurring','IST.323/quiz',5,'2026-09-28 15:45-04','before class','blackboard','Chap 3.10-3.11 (Internet Security Protocols)','323Fall26V1.3.1.docx: Week 6','confirmed'),
('IST.323/quiz-06','IST.323',_gc('IST.323','quizzes'),'Quiz #6','quiz','recurring','IST.323/quiz',6,'2026-10-05 15:45-04','before class','blackboard','Chap 5.1-5.6 (Access Control - Authorization)','323Fall26V1.3.1.docx: Week 7','confirmed'),
('IST.323/quiz-07','IST.323',_gc('IST.323','quizzes'),'Quiz #7','quiz','recurring','IST.323/quiz',7,'2026-10-07 15:45-04','before class','blackboard','Chap 5.7, 5.11 (Authentication)','323Fall26V1.3.1.docx: Week 7','confirmed'),
('IST.323/quiz-08','IST.323',_gc('IST.323','quizzes'),'Quiz #8','quiz','recurring','IST.323/quiz',8,'2026-10-19 15:45-04','before class','blackboard','Chap 4.6 (Wireless Security)','323Fall26V1.3.1.docx: Week 9','confirmed'),
('IST.323/quiz-09','IST.323',_gc('IST.323','quizzes'),'Quiz #9','quiz','recurring','IST.323/quiz',9,'2026-10-28 15:45-04','before class','blackboard','Chap 6.1-6.5 (Firewalls and Monitoring)','323Fall26V1.3.1.docx: Week 10','confirmed'),
('IST.323/quiz-10','IST.323',_gc('IST.323','quizzes'),'Quiz #10','quiz','recurring','IST.323/quiz',10,'2026-11-11 15:45-05','before class','blackboard','Chap 8.1, 8.3 (Application Security)','323Fall26V1.3.1.docx: Week 12','confirmed');

-- Exams (in class, online)
insert into assignments (id, course_id, component_id, title, type, recurrence, series_key, sequence_no, due_date, event_start, event_end, points_possible, submission, description, source_ref, confidence) values
('IST.323/exam-1','IST.323',_gc('IST.323','exams'),'Exam #1','exam','recurring','IST.323/exam',1,'2026-09-14','2026-09-14 15:45-04','2026-09-14 17:05-04',10,'blackboard','Weeks 1-3: security properties, threat environment, planning & policy, risk. 40-50 MC/TF + 1-2 short essay. Online during class.','323Fall26V1.3.1.docx: Week 4','confirmed'),
('IST.323/exam-2','IST.323',_gc('IST.323','exams'),'Exam #2','exam','recurring','IST.323/exam',2,'2026-10-21','2026-10-21 15:45-04','2026-10-21 17:05-04',10,'blackboard','Cryptography, internet security protocols, access control, wireless.','323Fall26V1.3.1.docx: Week 9','confirmed'),
('IST.323/exam-3','IST.323',_gc('IST.323','exams'),'Exam #3','exam','recurring','IST.323/exam',3,'2026-12-07','2026-12-07 15:45-05','2026-12-07 16:15-05',10,'blackboard','Firewalls, application security, AI & security, data protection. 30 minutes, then Final Project defense. No final exam in finals week.','323Fall26V1.3.1.docx: Week 15','confirmed');

-- Labs (due dates in schedule; submitted per Blackboard instructions)
insert into assignments (id, course_id, component_id, title, type, recurrence, series_key, sequence_no, due_date, points_possible, is_extra_credit, submission, description, source_ref, confidence) values
('IST.323/lab-1','IST.323',_gc('IST.323','labs'),'Lab #1','lab','recurring','IST.323/lab',1,'2026-09-23',5,false,'blackboard','In-class lab session 9/9; report due 9/23. Topic TBA. J&B Learning environment; use course-provided lab manual.','323Fall26V1.3.1.docx: Week 5','confirmed'),
('IST.323/lab-2','IST.323',_gc('IST.323','labs'),'Lab #2','lab','recurring','IST.323/lab',2,'2026-10-14',5,false,'blackboard','In-class lab session 9/23; report due 10/14.','323Fall26V1.3.1.docx: Week 8','confirmed'),
('IST.323/lab-3','IST.323',_gc('IST.323','labs'),'Lab #3','lab','recurring','IST.323/lab',3,'2026-11-30',5,false,'blackboard','In-class lab session 11/9; report due 11/30.','323Fall26V1.3.1.docx: Week 14','confirmed'),
('IST.323/lab-4','IST.323',_gc('IST.323','labs'),'Lab #4','lab','recurring','IST.323/lab',4,'2026-12-07',5,false,'blackboard','In-class lab session 11/30; report due 12/7.','323Fall26V1.3.1.docx: Week 15','confirmed'),
('IST.323/lab-extra-credit','IST.323',_gc('IST.323','extra_credit_lab'),'Extra Credit Lab','lab','one_off',null,null,'2026-12-15',4,true,'blackboard','Due on the scheduled final exam day (no final exam held).','323Fall26V1.3.1.docx: Scheduled Final Exam Day','confirmed');

-- Presentations & project
insert into assignments (id, course_id, component_id, title, type, recurrence, due_date, due_rule, points_possible, is_group, submission, submission_format, description, source_ref, confidence) values
('IST.323/presentation-choice','IST.323',null,'Presentation Choice (topic + date)','form','one_off','2026-09-09',null,0,false,'blackboard',null,'Record topic and presentation date for the Individual Security Presentation. First come, first served; instructor may veto. No points.','323Fall26V1.3.1.docx: Week 3','confirmed'),
('IST.323/individual-presentation','IST.323',_gc('IST.323','individual_presentation'),'Individual Security Presentation','presentation','one_off',null,'PowerPoint posted to Blackboard 24 hours before your session',15,false,'blackboard','PowerPoint file (.pptx), not PDF or link','5-7 min on a security/privacy case or technology discovered after Sept 2024; key points, lessons learned, 5+ MLA references. Session dates: 9/30, 10/14, 10/26, 11/4, 11/16. Set due_date once chosen in Presentation Choice.','323Fall26V1.3.1.docx; CourseIntro deck slide 20','tentative'),
('IST.323/sitn-group-presentation','IST.323',_gc('IST.323','sitn_group'),'Security in the News group presentation','group_presentation','one_off',null,'opens the assigned class session',5,true,'in_class',null,'5-10 min executive summary of the prior week''s infosec news. Group and date assigned on Blackboard (Groups 1-10 across 9/16-12/2). Set due_date once group is known.','323Fall26V1.3.1.docx; deck slide 18','tentative'),
('IST.323/fp-packet','IST.323',_gc('IST.323','final_project'),'Final Project packet assigned (organization)','other','one_off','2026-08-31',null,null,false,'none',null,'Randomly assigned one of six fictional organizations with packet (assets, systems, incidents, budget, vendor price sheet). Not a deliverable; anchor for the running log.','323Fall26V1.3.1.docx: Week 2','confirmed'),
('IST.323/fp-log-checkpoint','IST.323',_gc('IST.323','fp_log'),'Final Project running log checkpoint','checkpoint','one_off','2026-10-30',null,1,false,'blackboard',null,'2-3 lines per class session connecting content to your assigned organization. Complete/incomplete.','323Fall26V1.3.1.docx: Week 10','confirmed'),
('IST.323/fp-proposal','IST.323',_gc('IST.323','fp_proposal'),'Final Project: Security Program Proposal','project','one_off','2026-12-02',null,11,false,'blackboard','ONE .docx: 1in margins, 12pt Times New Roman, single spaced, block paragraphs. Includes Appendix A (ranked risk summary), B (AI use statement), C (running log).','<=4 pages excl. appendices, organized on PLAN-PROTECT-RESPOND, fixed budget and staff time against vendor list. Say plainly what you chose not to do.','323Fall26V1.3.1.docx: Week 14; deck slide 22','confirmed'),
('IST.323/fp-log-final','IST.323',_gc('IST.323','fp_log'),'Final Project running log (completed, Appendix C)','checkpoint','one_off','2026-12-02',null,2,false,'blackboard','Submitted inside the proposal .docx as Appendix C','Completed log submitted with proposal.','323Fall26V1.3.1.docx: Final Project','confirmed'),
('IST.323/fp-defense','IST.323',_gc('IST.323','fp_defense'),'Final Project in-class defense','exam','one_off','2026-12-07',null,6,false,'blackboard',null,'3 written questions about your own proposal in Blackboard, after the 30-min Exam #3. No advance notice; printed copy allowed; each answer must cite a page/section. No proposal => no defense credit.','323Fall26V1.3.1.docx: Week 15; deck slide 22','confirmed'),
('IST.323/assignment-1','IST.323',null,'Assignment #1 (given 8/24, details unknown)','homework','one_off',null,null,null,false,'unknown',null,'Syllabus schedule says "Assignment #1 given" on 8/24 with no further detail. Identify in Blackboard; may be the Presentation Choice or lab-access setup.','323Fall26V1.3.1.docx: Week 1','inferred');

-- ===========================================================================
-- IST 471 (dates not in syllabus; capture from Blackboard)
-- ===========================================================================
insert into assignments (id, course_id, component_id, title, type, recurrence, sequence_no, due_date, due_rule, submission, description, source_ref, confidence) values
('IST.471/a1-proposal','IST.471',_gc('IST.471','assignments'),'Assignment 1: Internship Proposal','form','one_off',1,null,'as soon as internship is found; approval required before starting','blackboard','Submit the proposal form as Assignment 1.','IST 471 Syllabus.pdf: Requirements','tentative'),
('IST.471/a2-introductions','IST.471',_gc('IST.471','assignments'),'Assignment 2: Sharing Introductions','discussion_post','one_off',2,null,null,'discussion_board','Post: who you are, program, where you intern, what the org does.','IST 471 Syllabus.pdf','tentative'),
('IST.471/a3-first-impressions','IST.471',_gc('IST.471','assignments'),'Assignment 3: First Impressions','paper','one_off',3,null,'after at least a couple of days on site','blackboard','First week, supervisor asks, expectations, projects.','IST 471 Syllabus.pdf','tentative'),
('IST.471/a4-learning-agreement','IST.471',_gc('IST.471','assignments'),'Assignment 4: Learning Agreement (first 30 hours)','form','one_off',4,null,'within the first 30 hours of work','blackboard','Complete with site supervisor (form under Content), give them a copy, submit agreed version.','IST 471 Syllabus.pdf','tentative'),
('IST.471/a5-faculty-visit','IST.471',_gc('IST.471','assignments'),'Assignment 5: Faculty supervisor virtual visit (midpoint)','meeting','one_off',5,null,'around the midpoint of the internship; student schedules it','email','15-min virtual meeting: you + site supervisor + Bevans. Email proposed times.','IST 471 Syllabus.pdf','tentative'),
('IST.471/a6-site-evaluations','IST.471',_gc('IST.471','assignments'),'Assignment 6: Site Evaluations','evaluation','one_off',6,null,'within 1 week of semester end','email','Student evaluation form + site supervisor evaluation form (supervisor emails pabevans@syr.edu). No supervisor form => no credit for the course.','IST 471 Syllabus.pdf','tentative'),
('IST.471/a7-final-reflection','IST.471',_gc('IST.471','assignments'),'Assignment 7: Final Reflection','paper','one_off',7,null,null,'blackboard','Essay: initial expectations, observations, interactions, insights, impact on goals.','IST 471 Syllabus.pdf','tentative');

-- ===========================================================================
-- IST 352 (intro deck only)
-- ===========================================================================
insert into assignments (id, course_id, title, type, recurrence, due_date, submission, description, source_ref, confidence) values
('IST.352/team-request','IST.352','Request assignment to random project team','form','one_off','2026-08-30','email','Notify instructor by Aug 30 if you want to be assigned to a group / want Option 3 (instructor-assigned project).','Welcome & Course Introduction.pptx slide 4','tentative'),
('IST.352/team-and-project-selection','IST.352','Form team, select project option, submit project name','form','one_off','2026-09-01','email','Own team: email member names, project option (1-4), project name by Sept 1. Options 2 & 4 need instructor approval by Sept 1.','Welcome & Course Introduction.pptx slides 3-4','tentative'),
('IST.352/reading-ch1','IST.352','Reading: Chapter 1, pp. 11-12 (SDLC)','reading','one_off',null,'none','Valacich & George, Modern Systems Analysis and Design 10e.','Welcome & Course Introduction.pptx slide 6','tentative'),
('IST.352/role-of-systems-analyst','IST.352','Role of Systems Analyst','homework','one_off',null,'unknown','Listed under Upcoming Assignments in intro deck; details and due date from Blackboard.','Welcome & Course Introduction.pptx slide 6','inferred'),
('IST.352/term-project','IST.352','Team project (semester-long systems analysis)','project','one_off',null,'unknown','Options: (1) new system for SU students, (2) local business requirements, (3) instructor-assigned, (4) personal interest (approval required). Milestones from Blackboard.','Welcome & Course Introduction.pptx slide 3','inferred');

-- ===========================================================================
-- IST 466 (schedule doc v. Aug 31 + intro deck). Stack: Ethics Group #2, Major Case Group #3.
-- ===========================================================================
insert into assignments (id, course_id, component_id, title, type, recurrence, due_date, event_start, is_group, group_key, submission, description, source_ref, confidence) values
('IST.466/ethics-vs-activity','IST.466',_gc('IST.466','participation'),'"Ethics vs. Activity" presentation','presentation','one_off','2026-09-01',null,false,null,'in_class','Presentations 9/1 and 9/3 (assigned 8/27, attendance-counted class). Likely already delivered.','IST466M3 Schedule Fall2026-Wk2.docx','tentative'),
('IST.466/ethics-team-2-practice','IST.466',_gc('IST.466','ethics_presentations'),'Ethics Team 2 practice','other','one_off','2026-09-10',null,true,'Ethics Group #2','in_class','"Ethics Teams 1 & 2 Practice" on 9/10 (same day as Synchrony major project presentation).','IST466M3 Schedule Fall2026-Wk2.docx: wk 3','confirmed'),
('IST.466/ethics-team-2-presentation','IST.466',_gc('IST.466','ethics_presentations'),'Ethics Team 2 presentation','group_presentation','one_off','2026-09-24',null,true,'Ethics Group #2','in_class','"Ethics Team 2 & 3 Presentation*" (attendance-counted).','IST466M3 Schedule Fall2026-Wk2.docx: wk 5','confirmed'),
('IST.466/synchrony-case-kickoff','IST.466',_gc('IST.466','major_cases'),'Synchrony major case presentation to class (kickoff)','other','one_off','2026-09-10',null,false,null,'none','Synchrony presents Major Project #1 case; teams work in labs 9/17, 9/27, 10/1, 10/6; practice w/ professor 10/8, 10/15. Deloitte visits 9/17.','IST466M3 Schedule Fall2026-Wk2.docx','confirmed'),
('IST.466/major-project-1-synchrony','IST.466',_gc('IST.466','major_cases'),'Major Project #1: Synchrony case student presentation','group_presentation','one_off','2026-10-20',null,true,'Major Case Group #3','in_class','Student presentations 10/20 and 10/22 (schedule says "MON/WEDS" for these dates; confirm actual day/time). Group #3 slot unknown.','IST466M3 Schedule Fall2026-Wk2.docx: wk 8','tentative'),
('IST.466/major-case-2-kickoff','IST.466',_gc('IST.466','major_cases'),'SU IT Dept presents Major Case #2','other','one_off','2026-11-05',null,false,null,'none','Case 2 info 11/3; SU IT presents 11/5; labs 11/10, 11/12; practice w/ professor 11/12.','IST466M3 Schedule Fall2026-Wk2.docx: wk 10-11','confirmed'),
('IST.466/major-project-2-su-it','IST.466',_gc('IST.466','major_cases'),'Major Project #2: SU IT case student presentation','group_presentation','one_off','2026-11-17',null,true,'Major Case Group #3','in_class','Presentations with IT Dept 11/17 and 11/19. Group #3 slot unknown.','IST466M3 Schedule Fall2026-Wk2.docx: wk 12','tentative'),
('IST.466/letter-of-gratitude','IST.466',_gc('IST.466','participation'),'"Letter of Gratitude"','paper','one_off','2026-12-10',null,false,null,'unknown','Last day of class activity 12/10. Details from Blackboard.','IST466M3 Schedule Fall2026-Wk2.docx: wk 16','tentative');

drop function _gc(text, text);

-- ---------------------------------------------------------------------------
-- Planner state: everything starts not_started; mark the obviously-past items.
-- Stack reconciles actual status during the Blackboard pass.
-- ---------------------------------------------------------------------------
insert into assignment_progress (assignment_id, status, notes)
select id, 'not_started', null from assignments;

update assignment_progress set status = 'not_applicable', notes = 'Anchor event, not a deliverable'
where assignment_id in ('IST.323/fp-packet','IST.466/synchrony-case-kickoff','IST.466/major-case-2-kickoff');

update assignment_progress set notes = 'Due date already passed as of 2026-09-02 seed; confirm done/missed in Blackboard'
where assignment_id in ('IST.352/team-request','IST.352/team-and-project-selection','IST.466/ethics-vs-activity');

commit;
