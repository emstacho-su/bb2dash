-- bb2dash :: 002_seed_fall2026_core.sql
-- Terms, courses, staff, meeting patterns, grading schemes and components.
-- Source: syllabi / intro decks in bb2dash/course context (extracted 2026-09-02).
-- Timestamps are America/New_York; EDT (-04) through 2026-11-01, EST (-05) after.

begin;

insert into terms (id, name, start_date, end_date, notes) values
('FALL26','Fall 2026','2026-08-24','2026-12-15','End date = latest known final (GEO 103, 12/15). Confirm official finals week in Blackboard/MySlice.');

-- ---------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------
insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short, kind, parent_course_id, credits, location, syllabus_path, syllabus_status, group_notes, notes, source) values
('ECN.304','FALL26','ECN.304.M001.FALL26','ECN','304','M001','The Economics of Social Issues','The Economics of Social Issues','lecture',null,3,null,
 'ECN.304/ECN 304 F26 Syllabus_M001.pdf','complete',null,
 'Tue/Thu. Meeting time and room NOT in syllabus; capture from Blackboard. No textbook required (Guell optional).','syllabus'),
('GEO.103.lecture','FALL26','GEO.103.M001.FALL26','GEO','103','M001','Environment and Society','Environment and Society','lecture',null,3,'Watson Theater',
 'GEO.103/GEO 103 (2026) - syllabus - FINAL.pdf','complete',null,
 'Attendance via Qwickly; 3 free lecture absences. Texts (Murphy 2026; Goodell 2023) available on Blackboard.','syllabus'),
('GEO.103.recitation','FALL26','GEO.103.M003.FALL26','GEO','103','M003','Environment and Society','Environment and Society (Discussion Section)','recitation','GEO.103.lecture',null,'Maxwell Hall 108',
 'GEO.103/GEO 103 (2026) - syllabus - FINAL.pdf','complete',null,
 'Section M003 assumed = syllabus "Sec. 3" (Fri 11:40-12:35, Maxwell 108). TA Cheyenne Morris. CONFIRM in Blackboard.','syllabus'),
('IST.323','FALL26','IST.323.M002.FALL26','IST','323','M002','Intro to Cybersecurity','Intro to Cybersecurity','lecture',null,3,'Hinds Hall 010',
 'IST.323/323Fall26V1.3.1.docx','complete',null,
 'Syllabus v1.3.1 (9/1/26). Late work NOT accepted. Email subject must start with IST323. Lab access code from jblearning.com ($60). Textbook: Boyle & Panko, Corporate Cybersecurity 6e.','syllabus'),
('IST.352','FALL26','IST.352.M001.FALL26','IST','352','M001','Info Analysis of Org. Systems','Info Analysis of Organization Systems','lecture',null,3,null,
 'IST.352/Welcome & Course Introduction.pptx','partial',null,
 'Mon/Wed. Only intro deck available; no syllabus in folder. Grading, meeting time, and schedule must come from Blackboard. Text: Valacich & George, Modern Systems Analysis and Design 10e.','course_deck'),
('IST.466','FALL26','IST.466.M003.FALL26','IST','466','M003','IM and T Capstone','IM&T Capstone','lecture',null,3,null,
 'IST.466/IST466M3 Schedule Fall2026-Wk2.docx','partial','Ethics Case Group #2; Major Case (Synchrony / SU IT) Group #3',
 'Tue/Thu. Schedule doc v. Aug 31 2026 + intro deck only; grading weights unknown (participation/attendance, two major case studies, ethics team presentations). Meeting time from Blackboard.','course_deck'),
('IST.471','FALL26','IST.471.M800.FALL26','IST','471','M800','Internship in Info Mgmt and Tech','Internship','internship',null,3,'Online',
 'IST.471/IST 471 Syllabus.pdf','complete',null,
 '3 credits = 150 hours minimum (50 hrs/credit). Site: Syracuse University ITS (Information Security/Development internship). Assignment due dates not in syllabus; capture from Blackboard.','syllabus');

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
insert into course_staff (course_id, name, role, email, office, office_hours, phone, notes) values
('ECN.304','Chung-Chin Eugene Liu','instructor','cliu09@syr.edu','110 Eggers Hall','Tue/Thu 2:00-3:15 PM or by appointment',null,'Email must state you are in ECN304'),
('ECN.304','Brenda Revilla','ta','bateruya@syr.edu',null,'Email for appointment',null,null),
('GEO.103.lecture','Bob Wilson','instructor','rmwilson@syr.edu','Eggers 533','Fridays 12:00-1:50 PM or by appointment',null,'Robert M. Wilson'),
('GEO.103.lecture','Rachel Ameen','ta','rlameen@syr.edu','Eggers 142',null,null,null),
('GEO.103.lecture','Cheyenne Morris','ta','cmorri30@syr.edu','Eggers 140',null,null,null),
('GEO.103.recitation','Cheyenne Morris','ta','cmorri30@syr.edu','Eggers 140',null,null,'Leads section M003'),
('IST.323','Christopher Croad','instructor','ccroad@syr.edu','None','By appointment (in person or MS Teams); right after class','315-412-6310','SU CISO. Subject line must start with IST323. Text with your name.'),
('IST.352','Michael Larche','instructor',null,null,null,null,'Contact details not in deck; capture from Blackboard'),
('IST.466','Alexander Corsello','instructor',null,null,null,null,'Teaching Professor; contact details from Blackboard'),
('IST.466','Sloan Strudler','coordinator',null,null,null,null,'UGSS, introduced week 1'),
('IST.471','Patti Bevans','instructor','pabevans@syr.edu','114 Hinds Hall','By appointment','315-443-1797','Director, Career Services. Site supervisor evaluation goes to her email.'),
('IST.471','Dan Cohen','faculty_sponsor',null,null,null,null,'Faculty sponsor for the ITS internship credit (per Stack)');

-- ---------------------------------------------------------------------------
-- Weekly meetings (0=Sun..6=Sat)
-- ---------------------------------------------------------------------------
insert into meetings (course_id, day_of_week, start_time, end_time, location, starts_on, ends_on, confidence, source) values
('ECN.304',2,null,null,null,'2026-08-25','2026-12-08','tentative','syllabus'),
('ECN.304',4,null,null,null,'2026-08-25','2026-12-08','tentative','syllabus'),
('GEO.103.lecture',1,'10:35','11:30','Watson Theater','2026-08-24','2026-12-07','confirmed','syllabus'),
('GEO.103.lecture',3,'10:35','11:30','Watson Theater','2026-08-24','2026-12-07','confirmed','syllabus'),
('GEO.103.recitation',5,'11:40','12:35','Maxwell Hall 108','2026-08-28','2026-12-04','tentative','syllabus'),
('IST.323',1,'15:45','17:05','Hinds Hall 010','2026-08-24','2026-12-07','confirmed','syllabus'),
('IST.323',3,'15:45','17:05','Hinds Hall 010','2026-08-24','2026-12-07','confirmed','syllabus'),
('IST.352',1,null,null,null,'2026-08-24','2026-12-07','tentative','course_deck'),
('IST.352',3,null,null,null,'2026-08-24','2026-12-07','tentative','course_deck'),
('IST.466',2,null,null,null,'2026-08-25','2026-12-10','tentative','course_deck'),
('IST.466',4,null,null,null,'2026-08-25','2026-12-10','tentative','course_deck');

-- ---------------------------------------------------------------------------
-- Grading schemes
-- ---------------------------------------------------------------------------
insert into grading_schemes (course_id, method, total_points, graded_out_of, letter_scale, late_policy, ai_policy, notes, source, confidence) values
('ECN.304','weighted_pct',null,null,
 '[{"letter":"A","min":93},{"letter":"A-","min":90},{"letter":"B+","min":87},{"letter":"B","min":83},{"letter":"B-","min":80},{"letter":"C+","min":77},{"letter":"C","min":73},{"letter":"C-","min":70},{"letter":"D","min":60},{"letter":"F","min":0}]',
 'Exams not made up without urgent, documented reason. Email beforehand to be excused from class.',
 'AI permitted only for reviewing course materials. No AI on any assignment/quiz/exam unless the instructions say so.',
 '3 non-cumulative exams weighted by rank (highest 30%, median 25%, lowest 20%). Lowest quiz dropped.','syllabus','confirmed'),
('GEO.103.lecture','weighted_pct',null,null,
 '[{"letter":"A","min":94},{"letter":"A-","min":90},{"letter":"B+","min":87},{"letter":"B","min":83},{"letter":"B-","min":80},{"letter":"C+","min":77},{"letter":"C","min":73},{"letter":"C-","min":70},{"letter":"D","min":60},{"letter":"F","min":0}]',
 null,
 'AI allowed for study aids (e.g. NotebookLM explainers from readings). No AI or technology of any kind during in-class quizzes/exams.',
 'Recitation grade (15% participation + 10% reading quizzes) is earned in section M003 but rolls into this scheme. ~5 unannounced quizzes; lowest dropped (or a zero for a missed one).','syllabus','confirmed'),
('IST.323','points',104,100,
 '[{"letter":"A","min":94},{"letter":"A-","min":90},{"letter":"B+","min":87},{"letter":"B","min":83},{"letter":"B-","min":80},{"letter":"C+","min":77},{"letter":"C","min":73},{"letter":"C-","min":70},{"letter":"D","min":65},{"letter":"D-","min":60},{"letter":"F","min":0}]',
 'Deadlines are firm. Late submissions NOT accepted. Wrong submission format => lowered grade or 0.',
 'AI allowed as a tool with disclosure; not during tests, quizzes, or the in-class Final Project defense. Final Project: AI explicitly permitted, Appendix B must document what you asked, kept, rejected.',
 '104 points possible, graded out of 100 (4 pts extra-credit lab). Instructor reserves right to curve/adjust letter grades.','syllabus','confirmed'),
('IST.352','unknown',null,null,null,null,null,'No syllabus in folder. Capture grading from Blackboard.','course_deck','inferred'),
('IST.466','unknown',null,null,null,null,null,'Deck says grades based on participation/attendance, two major case studies, team ethics presentations. Weights unknown; capture from Blackboard.','course_deck','inferred'),
('IST.471','qualitative',null,null,
 '[{"letter":"A","min":93},{"letter":"A-","min":90},{"letter":"B+","min":87},{"letter":"B","min":84},{"letter":"B-","min":81},{"letter":"C+","min":77},{"letter":"C","min":74},{"letter":"C-","min":71}]',
 'Penalties for incomplete, late, or incorrectly formatted assignments at professor discretion.',
 null,
 '70% quality of professional work (site supervisor evaluation); 30% complete, timely, correctly formatted assignments. No supervisor evaluation => no credit.','syllabus','confirmed');

-- ---------------------------------------------------------------------------
-- Grade components
-- ---------------------------------------------------------------------------
-- ECN 304
insert into grade_components (course_id, code, name, weight_pct, count_expected, aggregation, drop_lowest, rank_weights, notes) values
('ECN.304','participation','Participation',10,null,'manual',0,null,'Attendance + active participation; email beforehand to be excused'),
('ECN.304','quizzes','Average Quiz Grade',15,null,'average_drop_lowest',1,null,'Quizzes on readings/course materials throughout; count not stated'),
('ECN.304','exams','Exams (rank-weighted)',75,3,'rank_weighted',0,'[30,25,20]','Highest exam 30%, median 25%, lowest 20%. Non-cumulative.');

-- GEO 103 (all components attach to the lecture shell; recitation items reference via assignments.course_id)
insert into grade_components (course_id, code, name, weight_pct, count_expected, aggregation, drop_lowest, notes) values
('GEO.103.lecture','lecture_attendance','Lecture Attendance',5,null,'manual',0,'Qwickly; 3 free absences'),
('GEO.103.lecture','section_participation','Discussion Section Attendance & Participation',15,null,'manual',0,'Earned in section M003; TA sets criteria'),
('GEO.103.lecture','reading_quizzes','Reading Quizzes',10,5,'average_drop_lowest',1,'~5 unannounced quizzes in section; lowest (or a missed zero) dropped'),
('GEO.103.lecture','exam_1','First Exam',20,1,'single',0,null),
('GEO.103.lecture','exam_2','Second Exam',20,1,'single',0,null),
('GEO.103.lecture','final_exam','Final Exam',30,1,'single',0,null);

-- IST 323 (points)
insert into grade_components (course_id, code, name, points, count_expected, aggregation, normalize_to, is_extra_credit, notes) values
('IST.323','participation','Class Participation',5,null,'manual',null,false,'Discussion, questions during presentations, demos; laptop misuse => 0'),
('IST.323','quizzes','Blackboard Quizzes',5,10,'normalized',5,false,'Untimed, up to 3 attempts, due before class; normalized to 5 pts at semester end'),
('IST.323','sitn_group','Security in the News Group Presentation',5,1,'single',null,false,'5-10 min exec summary; group + date assigned on Blackboard'),
('IST.323','individual_presentation','Individual Security Presentation',15,1,'single',null,false,'5-7 min; topic post-Sept-2024; 5+ MLA refs; PowerPoint posted 24h before'),
('IST.323','final_project','Final Project: Security Program Proposal',20,null,'sum',null,false,'Proposal 11 + running log 3 + in-class defense 6'),
('IST.323','exams','Exams',30,3,'sum',null,false,'3 x 10 pts, non-cumulative, online during class; 40-50 MC/TF + 1-2 short essays'),
('IST.323','labs','Required Labs',20,4,'sum',null,false,'4 x 5 pts; J&B Learning lab environment'),
('IST.323','extra_credit_lab','Extra Credit Lab',4,1,'single',null,true,'Due on scheduled final exam day');

insert into grade_components (course_id, code, name, parent_id, points, count_expected, aggregation, notes) values
('IST.323','fp_proposal','Final Project: Proposal',(select id from grade_components where course_id='IST.323' and code='final_project'),11,1,'single','<=4 pages excl. appendices; PLAN-PROTECT-RESPOND; single .docx'),
('IST.323','fp_log','Final Project: Running Log',(select id from grade_components where course_id='IST.323' and code='final_project'),3,2,'sum','Checkpoint 1 pt (10/30) + completed log 2 pts (with proposal); complete/incomplete'),
('IST.323','fp_defense','Final Project: In-class Defense',(select id from grade_components where course_id='IST.323' and code='final_project'),6,1,'single','3 written questions in Blackboard during Exam #3 session; no advance notice; printed copy allowed');

-- IST 471
insert into grade_components (course_id, code, name, weight_pct, aggregation, notes) values
('IST.471','work_quality','Quality of professional work in the internship',70,'manual','Site supervisor evaluation'),
('IST.471','assignments','Complete, timely, correctly formatted assignments',30,'manual','Assignments 1-7');

-- IST 466 (weights unknown)
insert into grade_components (course_id, code, name, aggregation, notes, source, confidence) values
('IST.466','participation','Participation / Attendance','manual','15 starred classes count for attendance/participation','course_deck','inferred'),
('IST.466','major_cases','Two Major Case Studies (Synchrony, SU IT)','manual','Weight unknown','course_deck','inferred'),
('IST.466','ethics_presentations','Team Ethics Case Presentations','manual','Weight unknown','course_deck','inferred');

commit;
