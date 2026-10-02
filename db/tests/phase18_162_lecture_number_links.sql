-- bb2dash :: db/tests/phase18_162_lecture_number_links.sql
-- file_lecture_no and the two lecture-number rules in link_file_sessions (162). Stack's Inbox note
-- on item 906 (2026-10-01), scoped on 2026-10-02 to the two rules his answers bear out.
-- Six synthetic IST.323 lecture files are added inside the transaction, in four weeks whose
-- sessions the premise check pins, and the real numbered lectures of the two-session weeks are
-- set aside (superseded inside the transaction) so the counts are the test's own:
--   week 4 (Exam #1, then a lecture)   #86            -> rule 1: the one session that is not an exam
--   week 1 (two sessions)              #81, #82       -> rule 2: lower number, earlier session;
--                                                        #81's open question closes itself
--   week 7 (two sessions)              #83, #84       -> #83 carries Stack's answer (the later
--                                                        session), which wins; #84's rank now
--                                                        disagrees with a linked sibling, so it asks
--   week 6 (two sessions)              #85            -> a lone lecture still asks
-- Then, after link_file_sessions(null):
--   (0) file_lecture_no reads the number from the name, then the path; null for "LectureM3"
--   (1) #86 -> the week-4 lecture, confidence 0.8, no question
--   (2) #81 -> the earlier week-1 session, #82 -> the later, confidence 0.8, no open question
--   (3) #81's open question is archived as closed_itself by link_file_sessions
--   (4) #83 -> Stack's pick; #84 unlinked with one open question
--   (5) #85 unlinked with one open question
--   (6) the counts: linked_by_lecture_no = 3, questions_closed = 1
--   (7) a replay writes 0
-- Collects failures, raises once.
-- RUN IT: `node scripts/db-test.mjs --only phase18_162_lecture_number_links.sql`.

begin;

do $$
declare
  COURSE constant text := 'IST.323';
  v_fail text[] := array[]::text[];
  v_r    jsonb;
  v_ids  jsonb := '{}'::jsonb;   -- lecture number -> synthetic file id
  v_wk   jsonb;                  -- week -> the sessions a lecture may take, in date order
  v_all7 jsonb;                  -- week 7's sessions as the question names them (id order)
  v_n    int;
  v_no   int;
  v_week int;
  v_id   bigint;
begin
  -- Premise: the sessions the cases stand on.
  select jsonb_object_agg(week_no, ids) into v_wk
    from (select s.week_no, jsonb_agg(s.id order by s.session_date, s.id) as ids
            from sessions s
           where s.course_id = COURSE and s.week_no in (1, 4, 6, 7)
             and s.kind not in ('no_class', 'exam')
           group by s.week_no) w;
  select count(*) into v_n from sessions s
   where s.course_id = COURSE and s.week_no = 4 and s.kind = 'exam';
  if v_n <> 1 or jsonb_array_length(v_wk->'4') <> 1 or jsonb_array_length(v_wk->'1') <> 2
     or jsonb_array_length(v_wk->'6') <> 2 or jsonb_array_length(v_wk->'7') <> 2 then
    raise exception 'FAIL premise moved: IST.323 weeks 1/4/6/7 sessions are %, week-4 exams %', v_wk, v_n;
  end if;
  select to_jsonb(array_agg(s.id order by s.id)) into v_all7
    from sessions s where s.course_id = COURSE and s.week_no = 7 and s.kind <> 'no_class';

  -- (0)
  if file_lecture_no(null, 'Lecture_1-PropertiesTrends-Fall2026.pptx') is distinct from 1
     or file_lecture_no(null, 'Lecture2-Chap 1-ThreatsConcerns.pptx') is distinct from 2
     or file_lecture_no(null, 'Lecture#4-Chap 3a-Crytography.pptx') is distinct from 4
     or file_lecture_no('Lecture Slides / Lecture #6 - Week 5: TLS/IPSec', 'slides.pptx') is distinct from 6
     or file_lecture_no('Lecture Slides / Lecture #6 - Week 5', 'Lecture_7.pptx') is distinct from 7
     or file_lecture_no('Information / Class Introduction', 'LectureM3_IST466Fall 2026 (2).pptx') is not null
     or file_lecture_no('Weekly Modules / WK05', 'Chapters 4 & 5.pptx') is not null then
    v_fail := v_fail || '(0) file_lecture_no misreads a name or path'::text;
  end if;

  -- The synthetic lectures, in id order 81..86.
  for v_no, v_week in
    select * from (values (81, 1), (82, 1), (83, 7), (84, 7), (85, 6), (86, 4)) t(no, wk) order by no
  loop
    insert into bb_files (bb_course_id, course_id, content_id, path, file_name, source_url, bucket,
                          classified_by, classification_confidence, notes)
    select c.bb_id, COURSE, '_p18_synthetic_162_' || v_no,
           format('Lecture Slides / Lecture #%s - Week %s: p18 synthetic', v_no, v_week),
           format('Lecture#%s-p18 synthetic.pptx', v_no),
           'https://blackboard.syracuse.edu/bbcswebdav/p18-synthetic-162-' || v_no,
           'lecture_slides', 'rule', 0.6, 'phase18_162 synthetic'
      from courses c where c.id = COURSE
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(v_no::text, v_id);
  end loop;

  -- Set the real numbered lectures of the two-session weeks aside.
  update bb_files
     set superseded_by = (v_ids->>'81')::bigint
   where course_id = COURSE and week_no in (1, 6, 7) and superseded_by is null
     and file_lecture_no(path, file_name) is not null;

  -- #81 was asked about while it was alone in its week; #83 has Stack's answer: the later session.
  insert into attention_items (kind, course_id, entity, ref, field, to_value, question, suggested, state)
  values ('stack_must_confirm', COURSE, 'bb_file', 'session_link/' || (v_ids->>'81'), 'session_id',
          v_wk->'1', 'phase18_162 synthetic open question',
          jsonb_build_object('source', 'link_file_sessions'), 'open');
  insert into attention_items (kind, course_id, entity, ref, field, to_value, question, suggested,
                               state, resolved_at, resolution)
  values ('stack_must_confirm', COURSE, 'bb_file', 'session_link/' || (v_ids->>'83'), 'session_id',
          v_all7, 'phase18_162 synthetic answered question',
          jsonb_build_object('source', 'link_file_sessions'), 'resolved', now(),
          jsonb_build_object('session_id', (v_wk->'7'->>1)::bigint));

  v_r := link_file_sessions(null);

  -- (1)
  if not coalesce((select session_id = (v_wk->'4'->>0)::bigint and link_confidence = 0.8
                     from bb_files where id = (v_ids->>'86')::bigint), false) then
    v_fail := v_fail || format('(1) exam week: #86 -> %s',
      (select format('session %s conf %s', session_id, link_confidence)
         from bb_files where id = (v_ids->>'86')::bigint));
  end if;
  select count(*) into v_n from attention_items
   where ref = 'session_link/' || (v_ids->>'86') and state = 'open';
  if v_n <> 0 then
    v_fail := v_fail || format('(1) exam week raised %s question(s)', v_n);
  end if;

  -- (2)
  if not coalesce((select a.session_id = (v_wk->'1'->>0)::bigint and a.link_confidence = 0.8
                          and b.session_id = (v_wk->'1'->>1)::bigint and b.link_confidence = 0.8
                     from bb_files a, bb_files b
                    where a.id = (v_ids->>'81')::bigint and b.id = (v_ids->>'82')::bigint), false) then
    v_fail := v_fail || format('(2) number order: #81 -> %s, #82 -> %s, sessions %s',
      (select session_id from bb_files where id = (v_ids->>'81')::bigint),
      (select session_id from bb_files where id = (v_ids->>'82')::bigint), v_wk->'1');
  end if;
  select count(*) into v_n from attention_items
   where ref in ('session_link/' || (v_ids->>'81'), 'session_link/' || (v_ids->>'82')) and state = 'open';
  if v_n <> 0 then
    v_fail := v_fail || format('(2) number order left %s open question(s)', v_n);
  end if;

  -- (3)
  if not exists (select 1 from attention_items
                  where ref = 'session_link/' || (v_ids->>'81') and state = 'archived'
                    and archived_by = 'link_file_sessions'
                    and decision->>'closed_itself' = 'true') then
    v_fail := v_fail || '(3) the open question for #81 did not close itself'::text;
  end if;

  -- (4)
  if (select session_id from bb_files where id = (v_ids->>'83')::bigint)
       is distinct from (v_wk->'7'->>1)::bigint then
    v_fail := v_fail || format('(4) Stack''s answer lost: #83 -> %s',
      (select session_id from bb_files where id = (v_ids->>'83')::bigint));
  end if;
  select count(*) into v_n from attention_items
   where ref = 'session_link/' || (v_ids->>'84') and state = 'open';
  if (select session_id from bb_files where id = (v_ids->>'84')::bigint) is not null or v_n <> 1 then
    v_fail := v_fail || format('(4) disagreeing sibling: #84 -> %s, %s open question(s)',
      (select session_id from bb_files where id = (v_ids->>'84')::bigint), v_n);
  end if;

  -- (5)
  select count(*) into v_n from attention_items
   where ref = 'session_link/' || (v_ids->>'85') and state = 'open';
  if (select session_id from bb_files where id = (v_ids->>'85')::bigint) is not null or v_n <> 1 then
    v_fail := v_fail || format('(5) lone lecture: #85 -> %s, %s open question(s)',
      (select session_id from bb_files where id = (v_ids->>'85')::bigint), v_n);
  end if;

  -- (6)
  if (v_r->>'linked_by_lecture_no')::int is distinct from 3
     or (v_r->>'questions_closed')::int is distinct from 1 then
    v_fail := v_fail || format('(6) counts: %s', v_r);
  end if;

  -- (7)
  v_r := link_file_sessions(null);
  if (v_r->>'weeks_set')::int <> 0 or (v_r->>'sessions_linked')::int <> 0
     or (v_r->>'attention_raised')::int <> 0 or (v_r->>'questions_closed')::int is distinct from 0 then
    v_fail := v_fail || format('(7) replay wrote %s', v_r);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_162_lecture_number_links: PASS' as result;

rollback;
