-- bb2dash :: db/tests/phase23_188_archived_answers.sql
-- Phase 23 follow-ups (brief 110, Item 2; DECISIONS 2026-10-08, "Stop re-asking superseded files").
-- Tests migration 188: the two transform functions read an answer /inbox-apply has archived, and a
-- session answer the fold applies carries the "applied" stamp.
--
--   0. installed: supersede_replaced_files and link_file_sessions are 188's bodies, still SECURITY
--      DEFINER, path pinned, and the service role's (and the test login's) alone
--   a. supersede_replaced_files: with an archived answer for the same candidates a fold raises no
--      question; with an archived row that closed itself it raises one; with other candidates it
--      raises one; a resolved answer still settles it (as in 160)
--   b. link_file_sessions: a resolved pick and an archived pick each link the file and stamp the
--      answer's applied_at; "none" links nothing and stamps nothing; a pick outside the week's
--      sessions links nothing and stamps nothing; an archived row that closed itself is no answer;
--      a replay writes nothing and moves no stamp
--  b2. R6: the fold also stamps a session answer whose pick its file already carried before the fold
--      (the loop never visits that file): resolved, dismissed, archived; "none", a differing pick and
--      a self-closed row are not stamped; a stamp already there does not move
--   c. the backfill (the statement is copied here from the migration, below): it stamps a session
--      answer whose pick is the session its current file carries, and only that; run twice, it
--      stamps 0 the second time
--
-- Real IST.323 data is used for the course and its week's sessions (as phase18_122 and _163 do);
-- every file, crawl and answer is created inside the transaction and rolled back. The fold runs
-- over real rows too; nothing is asserted about them.
-- Needs migration 128's execute grants for db_test_runner. RUN IT:
-- `node scripts/db-test.mjs --only phase23_188_archived_answers.sql`. NOTHING IS COMMITTED.

begin;

create temp table _t188 (label text primary key, id bigint) on commit drop;

-- A synthetic file of IST.323 (letters only in the name: no lecture number to read).
create function pg_temp.t188_file(p_name text, p_week integer default null, p_content text default null,
                                  p_session bigint default null) returns bigint language sql as $$
  insert into bb_files (bb_course_id, course_id, content_id, path, file_name, source_url, bucket,
                        classified_by, classification_confidence, notes, week_no, session_id)
  select c.bb_id, 'IST.323', coalesce(p_content, '_p188_' || p_name), 'p188/' || p_name,
         'zz ' || p_name || '.pdf', 'https://blackboard.syracuse.edu/bbcswebdav/p188-' || replace(p_name, ' ', '-'),
         'readings', 'rule', 0.6, 'phase23_188 synthetic', p_week, p_session
    from courses c where c.id = 'IST.323'
  returning id
$$;

-- A session answer for file `p_file`: state, resolution, the candidates it was shown, and a decision.
create function pg_temp.t188_answer(p_file bigint, p_state text, p_resolution jsonb, p_candidates bigint[],
                                    p_decision jsonb default null, p_applied timestamptz default null,
                                    p_prefix text default 'session_link/', p_field text default 'session_id')
  returns bigint language sql as $$
  insert into attention_items (kind, course_id, entity, ref, field, to_value, question, suggested, state,
                               resolved_at, resolution, applied_at, archived_at, archived_by, decision)
  values ('stack_must_confirm', 'IST.323', 'bb_file', p_prefix || p_file, p_field,
          to_jsonb(p_candidates), 'phase23_188 synthetic', jsonb_build_object('source', 'link_file_sessions'),
          p_state, now(), p_resolution, p_applied,
          case when p_state = 'archived' then now() end,
          case when p_state = 'archived' then 'inbox-apply request 0' end,
          p_decision)
  returning id
$$;

-- The migration's backfill statement, verbatim; keep the two in step.
create function pg_temp.t188_backfill() returns integer language plpgsql as $$
declare v_n integer;
begin
  with stamped as (
    update attention_items ai
       set applied_at = now()
      from bb_files f
     where ai.kind = 'stack_must_confirm' and ai.entity = 'bb_file' and ai.field = 'session_id'
       and ai.state in ('resolved', 'archived')
       and (ai.state <> 'archived' or ai.decision->>'closed_itself' is distinct from 'true')
       and ai.applied_at is null
       and f.id = substring(ai.ref from '^session_link/([0-9]{1,18})$')::bigint
       and f.superseded_by is null
       and f.session_id is not null
       and f.session_id = case when ai.resolution->>'session_id' ~ '^[0-9]{1,18}$'
                               then (ai.resolution->>'session_id')::bigint end
    returning ai.id)
  select count(*) into v_n from stamped;
  return v_n;
end $$;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare
  f text;
  r record;
begin
  foreach f in array array['public.supersede_replaced_files(uuid, bigint)', 'public.link_file_sessions(bigint)'] loop
    if position('-- 188:' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then
      raise exception 'FAIL phase23_188_archived_answers: migration 188 is not applied (% is not its body)', f;
    end if;
    select p.prosecdef, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg
      into r from pg_proc p where p.oid = f::regprocedure;
    if not r.prosecdef or r.owner <> 'postgres' or not r.cfg @> array['search_path=public, pg_temp'] then
      raise exception 'FAIL phase23_188_archived_answers (shape): % lost SECURITY DEFINER, its owner or its search_path', f;
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('inbox_apply_runner', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
       or not has_function_privilege('service_role', f, 'execute') or not has_function_privilege('db_test_runner', f, 'execute') then
      raise exception 'FAIL phase23_188_archived_answers (shape): % is not the service role''s (and the test login''s) alone', f;
    end if;
  end loop;
  -- 163's rule and 160's are kept in the bodies.
  if position('closed_itself' in (select prosrc from pg_proc where oid = 'public.link_file_sessions(bigint)'::regprocedure)) = 0
     or position('new_candidates' in (select prosrc from pg_proc where oid = 'public.supersede_replaced_files(uuid, bigint)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_188_archived_answers (shape): a body lost the rule of 160 or 163';
  end if;
end $$;

-- =============================================================================================
-- a. supersede_replaced_files reads an archived answer
-- =============================================================================================
-- Four content items of a synthetic crawl, each carrying two new files and not the file F that used
-- to sit in it. Item 1 has an archived answer for exactly these candidates; item 2 an archived row
-- that closed itself; item 3 an archived answer for other candidates; item 4 a resolved answer.
do $$
declare
  v_bb_id  text := (select bb_id from courses where id = 'IST.323');
  v_run    uuid := gen_random_uuid();
  v_i      integer;
  v_f      bigint;
  v_b      bigint;
  v_c      bigint;
  v_items  jsonb := '[]'::jsonb;
  v_r      jsonb;
  v_open   integer;
begin
  if v_bb_id is null then
    raise exception 'FAIL premise moved: IST.323 is not a course';
  end if;

  for v_i in 1..4 loop
    v_f := pg_temp.t188_file('supf' || chr(96 + v_i), null, '_p188_item_' || v_i);
    v_b := pg_temp.t188_file('supb' || chr(96 + v_i), null, '_p188_item_' || v_i);
    v_c := pg_temp.t188_file('supc' || chr(96 + v_i), null, '_p188_item_' || v_i);
    insert into _t188 values ('f' || v_i, v_f), ('b' || v_i, v_b), ('c' || v_i, v_c);
    v_items := v_items || jsonb_build_array(jsonb_build_object('id', '_p188_item_' || v_i, 'embeddedFiles', jsonb_build_array(
      jsonb_build_object('name', 'zz supb' || chr(96 + v_i) || '.pdf', 'url', '/bbcswebdav/p188-supb' || chr(96 + v_i)),
      jsonb_build_object('name', 'zz supc' || chr(96 + v_i) || '.pdf', 'url', '/bbcswebdav/p188-supc' || chr(96 + v_i)))));
  end loop;

  -- A registered crawl, later than every real one: the only run the function reads as the newest.
  insert into agent_requests (kind, state, run_id, note) values ('sync', 'done', v_run, 'phase23_188 synthetic');
  insert into bb_raw (run_id, captured_at, bb_course_id, kind, payload)
  values (v_run, now() + interval '3 hours', v_bb_id, 'course', jsonb_build_object('content', v_items));

  -- The answers.
  perform pg_temp.t188_answer((select id from _t188 where label = 'f1'), 'archived', '{"accept":"none"}',
            array[(select id from _t188 where label = 'b1'), (select id from _t188 where label = 'c1')], '{"change":"recorded only"}',
            null, 'supersede/', 'superseded_by');
  perform pg_temp.t188_answer((select id from _t188 where label = 'f2'), 'archived', '{"accept":"none"}',
            array[(select id from _t188 where label = 'b2'), (select id from _t188 where label = 'c2')], '{"closed_itself": true}',
            null, 'supersede/', 'superseded_by');
  perform pg_temp.t188_answer((select id from _t188 where label = 'f3'), 'archived', '{"accept":"none"}',
            array[(select id from _t188 where label = 'b3')], '{"change":"recorded only"}',
            null, 'supersede/', 'superseded_by');
  perform pg_temp.t188_answer((select id from _t188 where label = 'f4'), 'resolved', '{"accept":"none"}',
            array[(select id from _t188 where label = 'b4'), (select id from _t188 where label = 'c4')],
            null, null, 'supersede/', 'superseded_by');

  v_r := supersede_replaced_files(v_run, null);

  if (v_r->>'older_run')::boolean then
    raise exception 'FAIL a (setup): the synthetic crawl was not the newest: %', v_r;
  end if;
  select count(*) into v_open from attention_items
   where ref = 'supersede/' || (select id from _t188 where label = 'f1') and state = 'open';
  if v_open <> 0 then
    raise exception 'FAIL a: an archived answer for the same candidates did not settle item 1 (% open question)', v_open;
  end if;
  select count(*) into v_open from attention_items
   where ref = 'supersede/' || (select id from _t188 where label = 'f4') and state = 'open';
  if v_open <> 0 then
    raise exception 'FAIL a: a resolved answer for the same candidates no longer settles item 4';
  end if;
  select count(*) into v_open from attention_items
   where ref = 'supersede/' || (select id from _t188 where label = 'f2') and state = 'open';
  if v_open <> 1 then
    raise exception 'FAIL a: an archived row that closed itself settled item 2 (% open questions, expected 1)', v_open;
  end if;
  select count(*) into v_open from attention_items
   where ref = 'supersede/' || (select id from _t188 where label = 'f3') and state = 'open';
  if v_open <> 1 then
    raise exception 'FAIL a: an archived answer for other candidates settled item 3 (% open questions, expected 1)', v_open;
  end if;
  if (v_r->>'asked')::int <> 2 then
    raise exception 'FAIL a: the fold asked % questions, expected 2 (items 2 and 3): %', v_r->>'asked', v_r;
  end if;
  -- Nothing was superseded: several files, nothing is written on that path.
  if exists (select 1 from bb_files where id in (select id from _t188 where label ~ '^[fbc][1-4]$') and superseded_by is not null) then
    raise exception 'FAIL a: a file was superseded on the ask path';
  end if;
end $$;

-- =============================================================================================
-- b. link_file_sessions stamps the answer it applies
-- =============================================================================================
do $$
declare
  v_week   integer;
  v_ids    bigint[];
  v_other  bigint;
  v_r      jsonb;
  v_f      bigint;
  v_a      bigint;
  v_stamp  timestamptz;
  v_label  text;
begin
  -- A week of IST.323 with at least two sessions that are not no_class.
  select s.week_no into v_week
    from sessions s
   where s.course_id = 'IST.323' and s.kind <> 'no_class' and s.week_no is not null
   group by s.week_no having count(*) >= 2
   order by s.week_no limit 1;
  if v_week is null then
    raise exception 'FAIL premise moved: IST.323 has no week with two class sessions';
  end if;
  select array_agg(s.id order by s.id) into v_ids
    from sessions s where s.course_id = 'IST.323' and s.week_no = v_week and s.kind <> 'no_class';
  select s.id into v_other from sessions s where s.course_id = 'IST.323' and s.id <> all (v_ids) limit 1;
  if v_other is null then
    raise exception 'FAIL premise moved: IST.323 has no session outside week %', v_week;
  end if;
  insert into _t188 values ('s1', v_ids[1]), ('s2', v_ids[2]), ('other', v_other), ('week', v_week);

  -- Six files of that week, none linked; each has an answer in its own state.
  for v_label, v_f in
    select t.label, pg_temp.t188_file('ses ' || t.label, v_week)
      from (values ('resolved'), ('archived'), ('none'), ('outside'), ('selfclosed'), ('othercands')) t(label)
  loop
    insert into _t188 values ('file_' || v_label, v_f);
  end loop;

  v_a := pg_temp.t188_answer((select id from _t188 where label = 'file_resolved'), 'resolved',
           jsonb_build_object('session_id', v_ids[1]), v_ids);
  insert into _t188 values ('ans_resolved', v_a);
  v_a := pg_temp.t188_answer((select id from _t188 where label = 'file_archived'), 'archived',
           jsonb_build_object('session_id', v_ids[2]), v_ids, '{"change":"recorded only"}');
  insert into _t188 values ('ans_archived', v_a);
  v_a := pg_temp.t188_answer((select id from _t188 where label = 'file_none'), 'resolved', '{"accept":"none"}', v_ids);
  insert into _t188 values ('ans_none', v_a);
  v_a := pg_temp.t188_answer((select id from _t188 where label = 'file_outside'), 'resolved',
           jsonb_build_object('session_id', v_other), v_ids);
  insert into _t188 values ('ans_outside', v_a);
  v_a := pg_temp.t188_answer((select id from _t188 where label = 'file_selfclosed'), 'archived',
           jsonb_build_object('session_id', v_ids[1]), v_ids, '{"closed_itself": true}');
  insert into _t188 values ('ans_selfclosed', v_a);
  -- Shown other candidates than the week's now: not an answer to this question.
  v_a := pg_temp.t188_answer((select id from _t188 where label = 'file_othercands'), 'resolved',
           jsonb_build_object('session_id', v_ids[1]), array[v_ids[1]]);
  insert into _t188 values ('ans_othercands', v_a);

  v_r := link_file_sessions(null);

  -- A resolved pick: linked, stamped.
  if (select session_id from bb_files where id = (select id from _t188 where label = 'file_resolved')) is distinct from v_ids[1]
     or (select applied_at from attention_items where id = (select id from _t188 where label = 'ans_resolved')) is null then
    raise exception 'FAIL b: a resolved pick: file -> %, applied_at %',
      (select session_id from bb_files where id = (select id from _t188 where label = 'file_resolved')),
      (select applied_at from attention_items where id = (select id from _t188 where label = 'ans_resolved'));
  end if;
  -- An archived pick: linked, stamped, still archived.
  if (select session_id from bb_files where id = (select id from _t188 where label = 'file_archived')) is distinct from v_ids[2]
     or (select applied_at from attention_items where id = (select id from _t188 where label = 'ans_archived')) is null
     or (select state from attention_items where id = (select id from _t188 where label = 'ans_archived')) <> 'archived' then
    raise exception 'FAIL b: an archived pick: file -> %, applied_at %',
      (select session_id from bb_files where id = (select id from _t188 where label = 'file_archived')),
      (select applied_at from attention_items where id = (select id from _t188 where label = 'ans_archived'));
  end if;
  -- "None": nothing linked, nothing stamped, no question.
  if (select session_id from bb_files where id = (select id from _t188 where label = 'file_none')) is not null
     or (select applied_at from attention_items where id = (select id from _t188 where label = 'ans_none')) is not null
     or exists (select 1 from attention_items where ref = 'session_link/' || (select id from _t188 where label = 'file_none') and state = 'open') then
    raise exception 'FAIL b: an answer of "none" linked, stamped or asked again';
  end if;
  -- A pick outside the week's sessions: nothing linked, nothing stamped.
  if (select session_id from bb_files where id = (select id from _t188 where label = 'file_outside')) is not null
     or (select applied_at from attention_items where id = (select id from _t188 where label = 'ans_outside')) is not null then
    raise exception 'FAIL b: a pick outside the week''s sessions linked or stamped';
  end if;
  -- An archived row that closed itself is no answer: not applied, not stamped, asked again.
  if (select session_id from bb_files where id = (select id from _t188 where label = 'file_selfclosed')) is not null
     or (select applied_at from attention_items where id = (select id from _t188 where label = 'ans_selfclosed')) is not null then
    raise exception 'FAIL b: an archived row that closed itself was read as an answer';
  end if;
  -- An answer shown other candidates: not this question's answer; not stamped.
  if (select session_id from bb_files where id = (select id from _t188 where label = 'file_othercands')) is not null
     or (select applied_at from attention_items where id = (select id from _t188 where label = 'ans_othercands')) is not null then
    raise exception 'FAIL b: an answer to other candidates linked or stamped';
  end if;

  -- A replay writes nothing about these files and moves no stamp.
  select applied_at into v_stamp from attention_items where id = (select id from _t188 where label = 'ans_resolved');
  perform pg_sleep(0.01);
  v_r := link_file_sessions(null);
  if (select applied_at from attention_items where id = (select id from _t188 where label = 'ans_resolved')) is distinct from v_stamp
     or (select session_id from bb_files where id = (select id from _t188 where label = 'file_resolved')) is distinct from v_ids[1] then
    raise exception 'FAIL b: a replay moved the stamp or the link';
  end if;
end $$;

-- =============================================================================================
-- b2. R6: the fold stamps every session answer whose pick its file carries, however it got there
-- =============================================================================================
-- The files below already carry a session before the fold (a direct fixture write, standing for the
-- reading's date, the week dropping to one session, the lecture number, 123's inheritance), so the
-- loop never visits them and step c never writes their pick. The statement that ends the fold does.
do $$
declare
  v_s1  bigint := (select id from _t188 where label = 's1');
  v_s2  bigint := (select id from _t188 where label = 's2');
  v_ids bigint[] := array[(select id from _t188 where label = 's1'), (select id from _t188 where label = 's2')];
  v_label text;
  v_f   bigint;
  v_t0  constant timestamptz := timestamptz '2026-01-02 03:04:05+00';
  v_r   jsonb;
begin
  for v_label, v_f in
    select t.label, pg_temp.t188_file('pre ' || t.label, null, null, v_s1)
      from (values ('resolved'), ('archived'), ('dismissed'), ('differs'), ('none'), ('selfclosed'), ('already')) t(label)
  loop
    insert into _t188 values ('pre_' || v_label, v_f);
  end loop;
  insert into _t188 values
    ('pa_resolved',   pg_temp.t188_answer((select id from _t188 where label = 'pre_resolved'),   'resolved',  jsonb_build_object('session_id', v_s1), v_ids)),
    ('pa_archived',   pg_temp.t188_answer((select id from _t188 where label = 'pre_archived'),   'archived',  jsonb_build_object('session_id', v_s1), v_ids, '{"change":"recorded only"}')),
    ('pa_dismissed',  pg_temp.t188_answer((select id from _t188 where label = 'pre_dismissed'),  'dismissed', jsonb_build_object('session_id', v_s1), v_ids)),
    ('pa_differs',    pg_temp.t188_answer((select id from _t188 where label = 'pre_differs'),    'resolved',  jsonb_build_object('session_id', v_s2), v_ids)),
    ('pa_none',       pg_temp.t188_answer((select id from _t188 where label = 'pre_none'),       'resolved',  '{"accept":"none"}', v_ids)),
    ('pa_selfclosed', pg_temp.t188_answer((select id from _t188 where label = 'pre_selfclosed'), 'archived',  jsonb_build_object('session_id', v_s1), v_ids, '{"closed_itself": true}')),
    ('pa_already',    pg_temp.t188_answer((select id from _t188 where label = 'pre_already'),    'resolved',  jsonb_build_object('session_id', v_s1), v_ids, null, v_t0));

  v_r := link_file_sessions(null);

  foreach v_label in array array['resolved', 'archived', 'dismissed'] loop
    if (select applied_at from attention_items where id = (select id from _t188 where label = 'pa_' || v_label)) is null then
      raise exception 'FAIL b2: the % answer whose pick its file already carried was not stamped by the fold', v_label;
    end if;
  end loop;
  foreach v_label in array array['differs', 'none', 'selfclosed'] loop
    if (select applied_at from attention_items where id = (select id from _t188 where label = 'pa_' || v_label)) is not null then
      raise exception 'FAIL b2: the "%" answer was stamped', v_label;
    end if;
  end loop;
  if (select applied_at from attention_items where id = (select id from _t188 where label = 'pa_already')) is distinct from v_t0 then
    raise exception 'FAIL b2: the fold moved a stamp that was already there';
  end if;
  if (select state from attention_items where id = (select id from _t188 where label = 'pa_archived')) <> 'archived' then
    raise exception 'FAIL b2: the fold changed a state';
  end if;
  -- And it wrote nothing onto those files.
  if (select count(*) from bb_files where id in (select id from _t188 where label like 'pre\_%') and session_id is distinct from v_s1) <> 0 then
    raise exception 'FAIL b2: the fold changed a file''s session';
  end if;
end $$;

-- =============================================================================================
-- c. The backfill
-- =============================================================================================
do $$
declare
  v_s1 bigint := (select id from _t188 where label = 's1');
  v_s2 bigint := (select id from _t188 where label = 's2');
  v_ids bigint[] := array[(select id from _t188 where label = 's1'), (select id from _t188 where label = 's2')];
  v_f bigint;
  v_a bigint;
  v_label text;
  v_t0 constant timestamptz := timestamptz '2026-01-02 03:04:05+00';
  v_n integer;
begin
  -- Files that already carry session S1 (week_no left null: the fold does not look at them).
  for v_label, v_f in
    select t.label, pg_temp.t188_file('bf ' || t.label, null, null, v_s1)
      from (values ('resolved'), ('archived'), ('differs'), ('selfclosed'), ('none'), ('superseded'), ('already')) t(label)
  loop
    insert into _t188 values ('bf_' || v_label, v_f);
  end loop;
  -- One that carries nothing.
  insert into _t188 values ('bf_unlinked', pg_temp.t188_file('bf unlinked'));
  -- And one that is no longer the current file.
  update bb_files set superseded_by = (select id from _t188 where label = 'bf_resolved')
   where id = (select id from _t188 where label = 'bf_superseded');

  insert into _t188 values
    ('b_resolved',   pg_temp.t188_answer((select id from _t188 where label = 'bf_resolved'),   'resolved', jsonb_build_object('session_id', v_s1), v_ids)),
    ('b_archived',   pg_temp.t188_answer((select id from _t188 where label = 'bf_archived'),   'archived', jsonb_build_object('session_id', v_s1), v_ids, '{"change":"recorded only"}')),
    ('b_differs',    pg_temp.t188_answer((select id from _t188 where label = 'bf_differs'),    'resolved', jsonb_build_object('session_id', v_s2), v_ids)),
    ('b_selfclosed', pg_temp.t188_answer((select id from _t188 where label = 'bf_selfclosed'), 'archived', jsonb_build_object('session_id', v_s1), v_ids, '{"closed_itself": true}')),
    ('b_none',       pg_temp.t188_answer((select id from _t188 where label = 'bf_none'),       'resolved', '{"accept":"none"}', v_ids)),
    ('b_superseded', pg_temp.t188_answer((select id from _t188 where label = 'bf_superseded'), 'resolved', jsonb_build_object('session_id', v_s1), v_ids)),
    ('b_already',    pg_temp.t188_answer((select id from _t188 where label = 'bf_already'),    'resolved', jsonb_build_object('session_id', v_s1), v_ids, null, v_t0)),
    ('b_unlinked',   pg_temp.t188_answer((select id from _t188 where label = 'bf_unlinked'),   'resolved', jsonb_build_object('session_id', v_s1), v_ids));

  v_n := pg_temp.t188_backfill();
  if v_n < 2 then
    raise exception 'FAIL c: the backfill stamped % rows, expected at least the 2 of this unit', v_n;
  end if;

  foreach v_label in array array['resolved', 'archived'] loop
    if (select applied_at from attention_items where id = (select id from _t188 where label = 'b_' || v_label)) is null then
      raise exception 'FAIL c: the backfill did not stamp the % answer whose pick its file carries', v_label;
    end if;
  end loop;
  foreach v_label in array array['differs', 'selfclosed', 'none', 'superseded', 'unlinked'] loop
    if (select applied_at from attention_items where id = (select id from _t188 where label = 'b_' || v_label)) is not null then
      raise exception 'FAIL c: the backfill stamped the "%" answer', v_label;
    end if;
  end loop;
  if (select applied_at from attention_items where id = (select id from _t188 where label = 'b_already')) is distinct from v_t0 then
    raise exception 'FAIL c: the backfill moved a stamp that was already there';
  end if;
  if (select state from attention_items where id = (select id from _t188 where label = 'b_archived')) <> 'archived' then
    raise exception 'FAIL c: the backfill changed a state';
  end if;

  -- Twice: nothing the second time.
  v_n := pg_temp.t188_backfill();
  if v_n <> 0 then
    raise exception 'FAIL c: the backfill run a second time stamped % rows, expected 0', v_n;
  end if;

  -- And still nothing after a fold (R6: the fold ends with the backfill's own predicate), which also
  -- leaves every answer the backfill refused unstamped.
  perform link_file_sessions(null);
  v_n := pg_temp.t188_backfill();
  if v_n <> 0 then
    raise exception 'FAIL c: the backfill stamped % rows after a fold, expected 0', v_n;
  end if;
  foreach v_label in array array['differs', 'selfclosed', 'none', 'superseded', 'unlinked'] loop
    if (select applied_at from attention_items where id = (select id from _t188 where label = 'b_' || v_label)) is not null then
      raise exception 'FAIL c: the fold stamped the "%" answer', v_label;
    end if;
  end loop;
  if (select applied_at from attention_items where id = (select id from _t188 where label = 'b_already')) is distinct from v_t0 then
    raise exception 'FAIL c: the fold moved a stamp that was already there';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase23_188_archived_answers: PASS' as result, current_user as ran_as;

rollback;
