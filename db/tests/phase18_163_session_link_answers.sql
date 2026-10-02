-- bb2dash :: db/tests/phase18_163_session_link_answers.sql
-- link_file_sessions (163): Stack's answer still counts after /inbox-apply archived it, and the
-- number-order rule reads a sibling's answer before that answer is applied. Code review of 162.
-- Five synthetic IST.323 lecture files inside the transaction, real numbered lectures of the
-- two-session weeks set aside as in phase18_162:
--   week 4 (Exam #1, then a lecture)  #93  an ARCHIVED "none" answer  -> stays unlinked, no question
--   week 6 (two sessions)             #94  an ARCHIVED pick (later)   -> linked to the pick
--   week 1 (two sessions)             #91  unanswered, the lower id
--                                     #92  Stack's answer: the EARLIER session, off its rank
--                                          -> #92 takes the answer; #91 asks (the order is broken)
--   week 7 (two sessions)             #95  an archived row that closed itself is not an answer
--                                          -> still asks
-- Then, after link_file_sessions(null):
--   (1) #93 unlinked, 0 open questions
--   (2) #94 -> Stack's archived pick
--   (3) #92 -> Stack's pick; #91 unlinked with 1 open question
--   (4) #95 unlinked with 1 open question
--   (5) a replay writes 0
-- Collects failures, raises once.
-- RUN IT: `node scripts/db-test.mjs --only phase18_163_session_link_answers.sql`.

begin;

do $$
declare
  COURSE constant text := 'IST.323';
  v_fail text[] := array[]::text[];
  v_r    jsonb;
  v_ids  jsonb := '{}'::jsonb;   -- lecture number -> synthetic file id
  v_wk   jsonb;                  -- week -> the sessions a lecture may take, in date order
  v_all  jsonb;                  -- week -> the sessions as the question names them (id order)
  v_n    int;
  v_no   int;
  v_week int;
  v_id   bigint;
begin
  select jsonb_object_agg(week_no, ids) into v_wk
    from (select s.week_no, jsonb_agg(s.id order by s.session_date, s.id) as ids
            from sessions s
           where s.course_id = COURSE and s.week_no in (1, 4, 6, 7)
             and s.kind not in ('no_class', 'exam')
           group by s.week_no) w;
  select jsonb_object_agg(week_no, ids) into v_all
    from (select s.week_no, jsonb_agg(s.id order by s.id) as ids
            from sessions s
           where s.course_id = COURSE and s.week_no in (1, 4, 6, 7) and s.kind <> 'no_class'
           group by s.week_no) w;
  if jsonb_array_length(v_wk->'4') <> 1 or jsonb_array_length(v_all->'4') <> 2
     or jsonb_array_length(v_wk->'1') <> 2 or jsonb_array_length(v_wk->'6') <> 2
     or jsonb_array_length(v_wk->'7') <> 2 then
    raise exception 'FAIL premise moved: IST.323 weeks 1/4/6/7 sessions are % (all: %)', v_wk, v_all;
  end if;

  for v_no, v_week in
    select * from (values (91, 1), (92, 1), (93, 4), (94, 6), (95, 7)) t(no, wk) order by no
  loop
    insert into bb_files (bb_course_id, course_id, content_id, path, file_name, source_url, bucket,
                          classified_by, classification_confidence, notes)
    select c.bb_id, COURSE, '_p18_synthetic_163_' || v_no,
           format('Lecture Slides / Lecture #%s - Week %s: p18 synthetic', v_no, v_week),
           format('Lecture#%s-p18 synthetic.pptx', v_no),
           'https://blackboard.syracuse.edu/bbcswebdav/p18-synthetic-163-' || v_no,
           'lecture_slides', 'rule', 0.6, 'phase18_163 synthetic'
      from courses c where c.id = COURSE
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(v_no::text, v_id);
  end loop;

  update bb_files
     set superseded_by = (v_ids->>'91')::bigint
   where course_id = COURSE and week_no in (1, 6, 7) and superseded_by is null
     and file_lecture_no(path, file_name) is not null;

  -- #93: "none", archived by /inbox-apply. #94: a pick, archived by /inbox-apply.
  insert into attention_items (kind, course_id, entity, ref, field, to_value, question, suggested,
                               state, resolved_at, resolution, archived_at, archived_by, decision)
  values ('stack_must_confirm', COURSE, 'bb_file', 'session_link/' || (v_ids->>'93'), 'session_id',
          v_all->'4', 'phase18_163 synthetic archived none',
          jsonb_build_object('source', 'link_file_sessions'), 'archived', now(),
          jsonb_build_object('accept', 'none'), now(), 'inbox-apply request 0',
          jsonb_build_object('change', 'recorded only')),
         ('stack_must_confirm', COURSE, 'bb_file', 'session_link/' || (v_ids->>'94'), 'session_id',
          v_all->'6', 'phase18_163 synthetic archived pick',
          jsonb_build_object('source', 'link_file_sessions'), 'archived', now(),
          jsonb_build_object('session_id', (v_wk->'6'->>1)::bigint), now(), 'inbox-apply request 0',
          jsonb_build_object('change', 'recorded only')),
  -- #92: Stack's answer, not yet applied: the earlier session, where rank gives it the later.
         ('stack_must_confirm', COURSE, 'bb_file', 'session_link/' || (v_ids->>'92'), 'session_id',
          v_all->'1', 'phase18_163 synthetic answered question',
          jsonb_build_object('source', 'link_file_sessions'), 'resolved', now(),
          jsonb_build_object('session_id', (v_wk->'1'->>0)::bigint), null, null, null),
  -- #95: a question that closed itself is not Stack's answer.
         ('stack_must_confirm', COURSE, 'bb_file', 'session_link/' || (v_ids->>'95'), 'session_id',
          v_all->'7', 'phase18_163 synthetic self-closed question',
          jsonb_build_object('source', 'link_file_sessions'), 'archived', null,
          null, now(), 'link_file_sessions',
          jsonb_build_object('closed_itself', true));

  v_r := link_file_sessions(null);

  -- (1)
  select count(*) into v_n from attention_items
   where ref = 'session_link/' || (v_ids->>'93') and state = 'open';
  if (select session_id from bb_files where id = (v_ids->>'93')::bigint) is not null or v_n <> 0 then
    v_fail := v_fail || format('(1) archived "none": #93 -> %s, %s open question(s)',
      (select session_id from bb_files where id = (v_ids->>'93')::bigint), v_n);
  end if;

  -- (2)
  if (select session_id from bb_files where id = (v_ids->>'94')::bigint)
       is distinct from (v_wk->'6'->>1)::bigint then
    v_fail := v_fail || format('(2) archived pick: #94 -> %s',
      (select session_id from bb_files where id = (v_ids->>'94')::bigint));
  end if;

  -- (3)
  if (select session_id from bb_files where id = (v_ids->>'92')::bigint)
       is distinct from (v_wk->'1'->>0)::bigint then
    v_fail := v_fail || format('(3) Stack''s answer lost: #92 -> %s',
      (select session_id from bb_files where id = (v_ids->>'92')::bigint));
  end if;
  select count(*) into v_n from attention_items
   where ref = 'session_link/' || (v_ids->>'91') and state = 'open';
  if (select session_id from bb_files where id = (v_ids->>'91')::bigint) is not null or v_n <> 1 then
    v_fail := v_fail || format('(3) sibling''s answer pending: #91 -> %s, %s open question(s)',
      (select session_id from bb_files where id = (v_ids->>'91')::bigint), v_n);
  end if;

  -- (4)
  select count(*) into v_n from attention_items
   where ref = 'session_link/' || (v_ids->>'95') and state = 'open';
  if (select session_id from bb_files where id = (v_ids->>'95')::bigint) is not null or v_n <> 1 then
    v_fail := v_fail || format('(4) self-closed row read as an answer: #95 -> %s, %s open question(s)',
      (select session_id from bb_files where id = (v_ids->>'95')::bigint), v_n);
  end if;

  -- (5)
  v_r := link_file_sessions(null);
  if (v_r->>'weeks_set')::int <> 0 or (v_r->>'sessions_linked')::int <> 0
     or (v_r->>'attention_raised')::int <> 0 or (v_r->>'questions_closed')::int <> 0 then
    v_fail := v_fail || format('(5) replay wrote %s', v_r);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_163_session_link_answers: PASS' as result;

rollback;
