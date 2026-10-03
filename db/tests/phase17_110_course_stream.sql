-- bb2dash :: db/tests/phase17_110_course_stream.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-03. Worker W-44.
-- Tests migration 110: `v_course_stream` keeps its 8 columns, its announcement rows carry the
-- bell's unread flag, its file rows carry their routes, and my-submission files, vanished files
-- and vanished content nodes are off the feed.
--
-- The filters are exercised on rows this file seeds (one per excluded shape, plus one kept file),
-- not only on whatever prod holds, so every assertion has a row to bite on. Failures are collected
-- and raised once, at the end.
--
-- RUN IT: `node scripts/db-test.mjs --only phase17_110_course_stream.sql`, or paste the whole file
-- into one `execute_sql` call. Every write is inside the transaction; the last statement is
-- `rollback`.

begin;

do $$
declare
  v_fail    text[] := '{}';
  v_course  text;
  v_run     uuid;
  v_keep    bigint;
  v_mine    bigint;
  v_gone    bigint;
  v_node    bigint;
  v_n       bigint;
  v_cols    text;
  v_meta    jsonb;
begin
  -- -------------------------------------------------------------------------------------------
  -- Shape and privileges
  -- -------------------------------------------------------------------------------------------
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'v_course_stream';
  if v_cols is distinct from 'course_id,post_kind,posted_at,ref_kind,ref_id,title,body,meta' then
    v_fail := v_fail || format('columns are %s', v_cols);
  end if;
  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.v_course_stream'::regclass and o = 'security_invoker=true') then
    v_fail := v_fail || 'v_course_stream is not security_invoker'::text;
  end if;
  if has_table_privilege('anon', 'public.v_course_stream', 'select') then
    v_fail := v_fail || 'anon can select v_course_stream'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.v_course_stream', 'select')
     or not has_table_privilege('service_role', 'public.v_course_stream', 'select') then
    v_fail := v_fail || 'authenticated / service_role cannot select v_course_stream'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- Prod as it stands (the brief's T-03 (b) checks)
  -- -------------------------------------------------------------------------------------------
  select count(*) into v_n
    from v_course_stream s join bb_files f on s.ref_kind = 'bb_file' and f.id = s.ref_id::bigint
   where f.bucket = 'my_submissions' or coalesce(f.notes, '') like '%missing_since_run=%';
  if v_n <> 0 then
    v_fail := v_fail || format('%s my-submission or vanished file rows on the Stream', v_n);
  end if;
  select count(*) into v_n
    from v_course_stream s join bb_content b on s.ref_kind = 'bb_content' and b.id = s.ref_id::bigint
   where b.detail->>'missing_since' is not null;
  if v_n <> 0 then
    v_fail := v_fail || format('%s vanished content rows on the Stream', v_n);
  end if;
  if (select count(*) from v_course_stream
       where post_kind = 'announcement' and (meta->>'is_unread')::boolean)
     is distinct from (select count(*) from v_announcements_unread) then
    v_fail := v_fail || 'Stream unread count differs from v_announcements_unread'::text;
  end if;
  if exists (select 1 from v_course_stream where post_kind = 'announcement'
                                             and not (meta ? 'is_unread' and meta ? 'is_read')) then
    v_fail := v_fail || 'an announcement row lacks is_unread or is_read'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- Seeded rows: one kept file, one my-submission file, one vanished file, one vanished node
  -- -------------------------------------------------------------------------------------------
  select id into v_course from courses order by id limit 1;
  select run_id into v_run from bb_files where run_id is not null order by id desc limit 1;

  insert into bb_files (run_id, bb_course_id, course_id, path, file_name, source_url, storage_path, bucket, notes)
  values (v_run, '_w44_1', v_course, 'W44 / kept', 'w44_kept.pdf', 'https://example.invalid/w44_kept',
          'bb-files/w44/kept.pdf', 'readings', null)
  returning id into v_keep;
  insert into bb_files (run_id, bb_course_id, course_id, path, file_name, source_url, bucket, classified_by)
  values (v_run, '_w44_1', v_course, 'W44 / mine', 'w44_mine.docx', 'https://example.invalid/w44_mine',
          'my_submissions', 'stack')
  returning id into v_mine;
  insert into bb_files (run_id, bb_course_id, course_id, path, file_name, source_url, bucket, notes)
  values (v_run, '_w44_1', v_course, 'W44 / gone', 'w44_gone.pdf', 'https://example.invalid/w44_gone',
          'readings', 'missing_since_run=00000000-0000-0000-0000-000000000044')
  returning id into v_gone;

  insert into bb_content (course_id, bb_item_id, path, title, item_kind, detail)
  values (v_course, '_w44_gone_1', 'W44 gone node', 'W44 gone node', 'document',
          jsonb_build_object('missing_since', '00000000-0000-0000-0000-000000000044'))
  returning id into v_node;

  -- Phase 19 (133, brief 99 task 9): the Stream posts a material only when a crawl recorded it
  -- as appeared or changed in bb_material_history, so each seeded row gets its history row.
  -- Without them the kept file would not post, and the three exclusion checks below would pass
  -- with nothing to exclude. Every assertion below is as Phase 17 wrote it.
  insert into bb_material_history
    (run_id, course_id, entity, bb_item_id, file_name, bb_file_id, change, title, path, seen_at)
  values
    (coalesce(v_run, '00000000-0000-0000-0000-000000000044'), v_course, 'file', '_w44_kept_1',
     'w44_kept.pdf', v_keep, 'appeared', 'w44_kept.pdf', 'W44 / kept', now()),
    (coalesce(v_run, '00000000-0000-0000-0000-000000000044'), v_course, 'file', '_w44_mine_1',
     'w44_mine.docx', v_mine, 'appeared', 'w44_mine.docx', 'W44 / mine', now()),
    (coalesce(v_run, '00000000-0000-0000-0000-000000000044'), v_course, 'file', '_w44_gonef_1',
     'w44_gone.pdf', v_gone, 'appeared', 'w44_gone.pdf', 'W44 / gone', now()),
    (coalesce(v_run, '00000000-0000-0000-0000-000000000044'), v_course, 'content', '_w44_gone_1',
     '', null, 'appeared', 'W44 gone node', 'W44 gone node', now());

  select meta into v_meta from v_course_stream where ref_kind = 'bb_file' and ref_id = v_keep::text;
  if v_meta is null then
    v_fail := v_fail || 'the seeded kept file is not on the Stream'::text;
  elsif v_meta->>'storage_path' is distinct from 'bb-files/w44/kept.pdf'
     or v_meta->>'source_url' is distinct from 'https://example.invalid/w44_kept' then
    v_fail := v_fail || format('kept file meta lacks its routes: %s', v_meta);
  end if;
  if exists (select 1 from v_course_stream where ref_kind = 'bb_file' and ref_id = v_mine::text) then
    v_fail := v_fail || 'the seeded my_submissions file is on the Stream'::text;
  end if;
  if exists (select 1 from v_course_stream where ref_kind = 'bb_file' and ref_id = v_gone::text) then
    v_fail := v_fail || 'the seeded vanished file is on the Stream'::text;
  end if;
  if exists (select 1 from v_course_stream where ref_kind = 'bb_content' and ref_id = v_node::text) then
    v_fail := v_fail || 'the seeded vanished content node is on the Stream'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_110: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase17_110_course_stream: PASS'                                                  as result,
       (select count(*) from v_course_stream)                                             as stream_rows,
       (select count(*) from v_course_stream
         where post_kind = 'announcement' and (meta->>'is_unread')::boolean)              as unread_rows;

rollback;
