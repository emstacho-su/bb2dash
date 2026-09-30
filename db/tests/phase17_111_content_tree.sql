-- bb2dash :: db/tests/phase17_111_content_tree.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-04. Worker W-44.
-- Tests migration 111: `v_content_tree` keeps its 17 columns in order and appends
-- `missing_since uuid` and `notes text`; every node Blackboard no longer lists surfaces its
-- run id; a file row carries its note. Privileges stay as 027 set them.
--
-- RUN IT: `node scripts/db-test.mjs --only phase17_111_content_tree.sql`, or paste the whole file
-- into one `execute_sql` call. Failures are collected and raised once. The last statement is
-- `rollback`.

begin;

do $$
declare
  v_fail   text[] := '{}';
  v_cols   text;
  v_types  text;
  v_course text;
  v_node   bigint;
  v_file   bigint;
  v_row    record;
begin
  select string_agg(column_name, ',' order by ordinal_position),
         string_agg(data_type, ',' order by ordinal_position) filter (where ordinal_position > 17)
    into v_cols, v_types
    from information_schema.columns
   where table_schema = 'public' and table_name = 'v_content_tree';
  if v_cols is distinct from
     'course_id,content_id,parent_id,bb_item_id,path,depth,title,item_kind,bb_type,state,url,'
     'modified_at,assignment_id,file_id,file_name,storage_path,bucket,missing_since,notes' then
    v_fail := v_fail || format('columns are %s', v_cols);
  end if;
  if v_types is distinct from 'uuid,text' then
    v_fail := v_fail || format('missing_since, notes types are %s', v_types);
  end if;
  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.v_content_tree'::regclass and o = 'security_invoker=true') then
    v_fail := v_fail || 'v_content_tree is not security_invoker'::text;
  end if;
  if has_table_privilege('anon', 'public.v_content_tree', 'select') then
    v_fail := v_fail || 'anon can select v_content_tree'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.v_content_tree', 'select')
     or not has_table_privilege('service_role', 'public.v_content_tree', 'select') then
    v_fail := v_fail || 'authenticated / service_role cannot select v_content_tree'::text;
  end if;

  if v_fail = '{}' then
    -- Prod as it stands: every vanished node, and only those, carries missing_since.
    if (select count(distinct content_id) from v_content_tree where missing_since is not null)
       is distinct from (select count(*) from bb_content where detail->>'missing_since' is not null) then
      v_fail := v_fail || 'missing_since count differs from bb_content''s vanished nodes'::text;
    end if;

    -- Seeded: a vanished node with a noted file.
    select id into v_course from courses order by id limit 1;
    insert into bb_content (course_id, bb_item_id, path, title, item_kind, detail)
    values (v_course, '_w44_111_1', 'W44 111 node', 'W44 111 node', 'file',
            jsonb_build_object('missing_since', '00000000-0000-0000-0000-000000000111'))
    returning id into v_node;
    insert into bb_files (bb_course_id, course_id, content_id, path, file_name, source_url, notes)
    values ('_w44_111', v_course, '_w44_111_1', 'W44 111 node', 'w44_111.pdf',
            'https://example.invalid/w44_111', 'W44 note for the hover')
    returning id into v_file;

    execute 'select missing_since::text as m, notes as n, file_id as f from v_content_tree where content_id = $1'
      into v_row using v_node;
    if v_row.f is distinct from v_file then
      v_fail := v_fail || 'the seeded node did not join its file'::text;
    end if;
    if v_row.m is distinct from '00000000-0000-0000-0000-000000000111' then
      v_fail := v_fail || format('seeded missing_since reads %s', v_row.m);
    end if;
    if v_row.n is distinct from 'W44 note for the hover' then
      v_fail := v_fail || format('seeded notes reads %s', v_row.n);
    end if;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_111: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase17_111_content_tree: PASS'                                               as result,
       (select count(distinct content_id) from v_content_tree
         where to_jsonb(v_content_tree) ->> 'missing_since' is not null)               as missing_nodes;

rollback;
