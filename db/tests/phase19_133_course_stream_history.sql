-- bb2dash :: db/tests/phase19_133_course_stream_history.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), task 9. Worker W-52.
-- Tests migration 133: v_course_stream's material posts come only from bb_material_history
-- (R-38, B-18): one post per file or node that appeared or changed in a crawl, dated by that
-- crawl, with meta.change and meta.run_id.
--
-- Blocks:
--   (S) the same 8 columns in the same order, security_invoker, no select for anon, select for
--       authenticated and service_role, the view reads bb_material_history
--   (P) prod: every material post names a run that has history rows, carries change
--       (appeared | changed) and run_id, and no post is a my_submissions file, a file noted
--       missing or a vanished node; the announcement and assignment_posted arms still hold one
--       row per announcement and per Blackboard assignment
--   (F) seeded rows, one per shape:
--         a current file with an `appeared` row and a later `changed` row   -> 2 posts
--         a my_submissions file, a file noted missing_since_run=, a superseded file,
--         a file with only a `vanished` row, a file with no history row     -> 0 posts
--         an unclaimed document node with an `appeared` row                 -> 1 post
--         a node a file claims, a vanished node, a folder, a node with only a `vanished`
--         row, a history row with no node                                   -> 0 posts
--       and each post's posted_at is its history row's seen_at
--
-- Needs insert on bb_material_history for db_test_runner (granted by 133). The fixture course
-- exists only inside this transaction. Failures are collected and raised once.
-- RUN IT: `node scripts/db-test.mjs --only phase19_133_course_stream_history.sql`, or paste the
-- whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

do $$
declare
  COURSE  constant text := 'W52.133';
  SHELL   constant text := '_w52_133_1';
  RUN_1   constant uuid := '00000000-1330-4000-8000-000000000001';
  RUN_2   constant uuid := '00000000-1330-4000-8000-000000000002';
  T_1     constant timestamptz := now() - interval '2 days';
  T_2     constant timestamptz := now() - interval '1 day';
  v_fail  text[] := '{}';
  v_n     bigint;
  v_got   text;
  v_keep  bigint; v_mine bigint; v_gone bigint; v_old bigint; v_van bigint; v_bare bigint;
  v_doc   bigint;
begin
  -- -------------------------------------------------------------------------------------------
  -- (S) shape and privileges
  -- -------------------------------------------------------------------------------------------
  select string_agg(attname, ',' order by attnum) into v_got
    from pg_attribute
   where attrelid = 'public.v_course_stream'::regclass and attnum > 0 and not attisdropped;
  if v_got is distinct from 'course_id,post_kind,posted_at,ref_kind,ref_id,title,body,meta' then
    v_fail := v_fail || format('(S) columns are %s', v_got);
  end if;
  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.v_course_stream'::regclass and o = 'security_invoker=true') then
    v_fail := v_fail || '(S) v_course_stream is not security_invoker'::text;
  end if;
  if has_table_privilege('anon', 'public.v_course_stream', 'select') then
    v_fail := v_fail || '(S) anon can select v_course_stream'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.v_course_stream', 'select')
     or not has_table_privilege('service_role', 'public.v_course_stream', 'select') then
    v_fail := v_fail || '(S) authenticated / service_role cannot select v_course_stream'::text;
  end if;
  if pg_get_viewdef('public.v_course_stream'::regclass) not like '%bb_material_history%' then
    v_fail := v_fail || '(S) v_course_stream does not read bb_material_history'::text;
  end if;
  if to_regclass('public.bb_material_history') is null
     or not has_table_privilege(current_user, 'public.bb_material_history', 'insert') then
    v_fail := v_fail || '(S) this role cannot seed bb_material_history'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_133: %', array_to_string(v_fail, '; ');
  end if;

  -- -------------------------------------------------------------------------------------------
  -- (P) prod as it stands
  -- -------------------------------------------------------------------------------------------
  select count(*) into v_n
    from v_course_stream s
   where s.post_kind = 'material'
     and not exists (select 1 from bb_material_history h where h.run_id::text = s.meta->>'run_id');
  if v_n <> 0 then
    v_fail := v_fail || format('(P) %s material post(s) trace to no history row', v_n);
  end if;
  select count(*) into v_n
    from v_course_stream s
   where s.post_kind = 'material'
     and (coalesce(s.meta->>'change', '') not in ('appeared', 'changed') or s.meta->>'run_id' is null);
  if v_n <> 0 then
    v_fail := v_fail || format('(P) %s material post(s) lack change or run_id', v_n);
  end if;
  select count(*) into v_n
    from v_course_stream s join bb_files f on s.ref_kind = 'bb_file' and f.id = s.ref_id::bigint
   where f.bucket = 'my_submissions' or coalesce(f.notes, '') like '%missing_since_run=%'
      or f.superseded_by is not null;
  if v_n <> 0 then
    v_fail := v_fail || format('(P) %s my-submission, vanished or superseded file post(s)', v_n);
  end if;
  select count(*) into v_n
    from v_course_stream s join bb_content b on s.ref_kind = 'bb_content' and b.id = s.ref_id::bigint
   where b.detail->>'missing_since' is not null;
  if v_n <> 0 then
    v_fail := v_fail || format('(P) %s vanished node post(s)', v_n);
  end if;
  select count(*) into v_n
    from (select ref_kind, ref_id, meta->>'run_id' from v_course_stream where post_kind = 'material'
           group by 1, 2, 3 having count(*) > 1) d;
  if v_n <> 0 then
    v_fail := v_fail || format('(P) %s (ref, run) pair(s) post more than once', v_n);
  end if;
  if (select count(*) from v_course_stream where post_kind = 'announcement')
       is distinct from (select count(*) from announcements)
     or (select count(*) from v_course_stream where post_kind = 'assignment_posted')
       is distinct from (select count(*) from assignments where source = 'blackboard') then
    v_fail := v_fail || '(P) the announcement or assignment_posted arm lost or gained rows'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- (F) seeded rows
  -- -------------------------------------------------------------------------------------------
  insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short, bb_id)
  select COURSE, (select term_id from courses order by id limit 1), 'W52.133.FIXTURE', 'W52', '133', 'M001',
         'Phase 19 stream fixture course (rolled back)', 'W52 stream fixture', SHELL;

  insert into bb_files (bb_course_id, course_id, content_id, path, file_name, source_url, storage_path, bucket, mime_type)
  values (SHELL, COURSE, '_w52s_claimed_1', 'W52 / kept', 'kept.pdf', 'https://example.invalid/w52s/kept',
          'bb-files/w52s/kept.pdf', 'readings', 'application/pdf')
  returning id into v_keep;
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket, classified_by)
  values (SHELL, COURSE, 'W52 / mine', 'mine.docx', 'https://example.invalid/w52s/mine', 'my_submissions', 'stack')
  returning id into v_mine;
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket, notes)
  values (SHELL, COURSE, 'W52 / gone', 'gone.pdf', 'https://example.invalid/w52s/gone', 'readings',
          'missing_since_run=00000000-0000-0000-0000-000000000133')
  returning id into v_gone;
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket, superseded_by)
  values (SHELL, COURSE, 'W52 / old', 'old.pdf', 'https://example.invalid/w52s/old', 'readings', v_keep)
  returning id into v_old;
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket)
  values (SHELL, COURSE, 'W52 / vanished', 'vanished.pdf', 'https://example.invalid/w52s/vanished', 'readings')
  returning id into v_van;
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket)
  values (SHELL, COURSE, 'W52 / bare', 'bare.pdf', 'https://example.invalid/w52s/bare', 'readings')
  returning id into v_bare;

  insert into bb_content (course_id, bb_item_id, path, title, item_kind, url, detail) values
    (COURSE, '_w52s_doc_1',     'W52 document',     'W52 document',     'document', 'https://example.invalid/w52s/doc', null),
    (COURSE, '_w52s_claimed_1', 'W52 claimed node', 'W52 claimed node', 'file',     null, null),
    (COURSE, '_w52s_gone_1',    'W52 gone node',    'W52 gone node',    'document', null,
       jsonb_build_object('missing_since', '00000000-0000-0000-0000-000000000133')),
    (COURSE, '_w52s_folder_1',  'W52 folder',       'W52 folder',       'folder',   null, null),
    (COURSE, '_w52s_onlyvan_1', 'W52 once here',    'W52 once here',    'document', null, null);
  select id into v_doc from bb_content where course_id = COURSE and bb_item_id = '_w52s_doc_1';

  insert into bb_material_history
    (run_id, course_id, entity, bb_item_id, file_name, bb_file_id, change, changed_fields, title, path, seen_at)
  values
    (RUN_1, COURSE, 'file', '_w52s_claimed_1', 'kept.pdf',     v_keep, 'appeared', null,         'kept.pdf',     'W52 / kept',     T_1),
    (RUN_2, COURSE, 'file', '_w52s_claimed_1', 'kept.pdf',     v_keep, 'changed',  array['url'], 'kept.pdf',     'W52 / kept',     T_2),
    (RUN_1, COURSE, 'file', '_w52s_mine_1',    'mine.docx',    v_mine, 'appeared', null,         'mine.docx',    'W52 / mine',     T_1),
    (RUN_1, COURSE, 'file', '_w52s_gonef_1',   'gone.pdf',     v_gone, 'appeared', null,         'gone.pdf',     'W52 / gone',     T_1),
    (RUN_1, COURSE, 'file', '_w52s_old_1',     'old.pdf',      v_old,  'appeared', null,         'old.pdf',      'W52 / old',      T_1),
    (RUN_2, COURSE, 'file', '_w52s_van_1',     'vanished.pdf', v_van,  'vanished', null,         'vanished.pdf', 'W52 / vanished', T_2),
    (RUN_1, COURSE, 'content', '_w52s_doc_1',     '', null, 'appeared', null,          'W52 document',     'W52 document',     T_1),
    (RUN_2, COURSE, 'content', '_w52s_claimed_1', '', null, 'changed',  array['url'],  'W52 claimed node', 'W52 claimed node', T_2),
    (RUN_1, COURSE, 'content', '_w52s_gone_1',    '', null, 'appeared', null,          'W52 gone node',    'W52 gone node',    T_1),
    (RUN_1, COURSE, 'content', '_w52s_folder_1',  '', null, 'appeared', null,          'W52 folder',       'W52 folder',       T_1),
    (RUN_2, COURSE, 'content', '_w52s_onlyvan_1', '', null, 'vanished', null,          'W52 once here',    'W52 once here',    T_2),
    (RUN_1, COURSE, 'content', '_w52s_norow_1',   '', null, 'appeared', null,          'W52 no node',      'W52 no node',      T_1);

  select string_agg(format('%s %s %s %s %s', ref_kind, ref_id, meta->>'change', meta->>'run_id',
                           (posted_at = case meta->>'run_id' when RUN_1::text then T_1 else T_2 end)),
                    ' ; ' order by ref_kind, posted_at)
    into v_got
    from v_course_stream where course_id = COURSE and post_kind = 'material';
  if v_got is distinct from format('bb_content %s appeared %s t ; bb_file %s appeared %s t ; bb_file %s changed %s t',
                                   v_doc, RUN_1, v_keep, RUN_1, v_keep, RUN_2) then
    v_fail := v_fail || format('(F) the fixture course posts: %s', coalesce(v_got, '(none)'));
  end if;

  select string_agg(format('%s|%s|%s|%s|%s|%s', title, body, meta->>'bucket', meta->>'file_name',
                           meta->>'storage_path', meta->>'source_url'), ' ; ' order by posted_at)
    into v_got
    from v_course_stream where course_id = COURSE and ref_kind = 'bb_file';
  if v_got is distinct from
     'kept.pdf|W52 / kept|readings|kept.pdf|bb-files/w52s/kept.pdf|https://example.invalid/w52s/kept ; '
     'kept.pdf|W52 / kept|readings|kept.pdf|bb-files/w52s/kept.pdf|https://example.invalid/w52s/kept' then
    v_fail := v_fail || format('(F) the file posts read %s', v_got);
  end if;
  if (select meta->>'mime_type' from v_course_stream where course_id = COURSE and ref_kind = 'bb_file' limit 1)
     is distinct from 'application/pdf' then
    v_fail := v_fail || '(F) the file post lost mime_type'::text;
  end if;

  select format('%s|%s|%s|%s', title, body, meta->>'item_kind', meta->>'url') into v_got
    from v_course_stream where course_id = COURSE and ref_kind = 'bb_content';
  if v_got is distinct from 'W52 document|W52 document|document|https://example.invalid/w52s/doc' then
    v_fail := v_fail || format('(F) the node post reads %s', v_got);
  end if;
  if exists (select 1 from v_course_stream
              where course_id = COURSE and ref_kind = 'bb_content'
                and not (meta ? 'bucket' and meta ? 'file_name' and meta ? 'mime_type')) then
    v_fail := v_fail || '(F) the node post lost its null bucket / file_name / mime_type keys'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_133: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase19_133_course_stream_history: PASS'                                         as result,
       (select count(*) from v_course_stream where post_kind = 'material')               as material_posts,
       (select count(*) from v_course_stream
         where post_kind = 'material' and meta->>'change' = 'appeared')                  as new_posts,
       (select count(*) from v_course_stream
         where post_kind = 'material' and meta->>'change' = 'changed')                   as changed_posts;

rollback;
