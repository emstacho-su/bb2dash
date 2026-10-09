-- bb2dash :: db/tests/phase24_197_index_status.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 20, and the
-- store's check 15 (answer 17, point 4). Worker W-76.
-- Tests migration 197: `v_workspace_index_status`.
--
--   0. exactly one row, the thirteen columns in their order, security invoker, no storage table
--   1. the course half: indexed + waiting equals the count of bb_file_text; waiting equals the
--      units with no part; indexed equals the units with a vector; the pending files and the
--      newest vector agree with the tables
--   2. the upload and memory half, by deltas over what is really there: one synthetic document in
--      each state moves exactly the column it belongs to and no other (a remembered item in `failed`
--      is memory_failed alone, one in `text_ready` memory_waiting alone), a waiting upload with an
--      expired link is counted in upload_links_expired, a row in `deleting` in uploads_deleting; the
--      counts equal a direct count
--   3. ingest_polled_age_seconds: null before the first heartbeat, then the whole seconds since
--   4. the owner reads it, a stranger reads zeros, anon is refused
--
-- Synthetic rows only, written in this transaction. Nothing is committed.
-- RUN IT: `node scripts/db-test.mjs --only phase24_197_index_status.sql`.

begin;

create function pg_temp.w76_try(p_role text, p_sub text, p_sql text) returns text
  language plpgsql as $$
declare
  v text;
  n integer;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    v := 'ok:' || n;
  exception when others then
    v := sqlstate;
  end;
  reset role;
  return v;
end $$;

-- A document in a given state of a given kind. A remembered item needs a conversation of its own.
create function pg_temp.w76_doc(p_kind text, p_state text, p_tag text, p_expired boolean default false) returns bigint
  language plpgsql as $$
declare
  c_host constant text := 'https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/';
  v_sha  text := md5('w76-197-' || p_tag) || md5('w76-197b-' || p_tag);
  v_conv uuid;
  v_id   bigint;
begin
  if p_kind = 'upload' then
    insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, state,
                                     signed_url, signed_url_expires_at)
    values ('upload', 'w76 197 ' || p_tag, 'text/plain', 10, v_sha, 'u/' || v_sha, p_state,
            case when p_expired then c_host || 'u/' || v_sha || '?token=old' end,
            case when p_expired then now() - interval '1 hour' end)
    returning id into v_id;
  else
    insert into workspace_conversations (title) values ('w76 197 ' || p_tag) returning id into v_conv;
    insert into workspace_documents (kind, title, conversation_id, state)
    values ('memory', 'w76 197 ' || p_tag, v_conv, p_state) returning id into v_id;
  end if;
  return v_id;
end $$;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_got text;
  v_n   integer;
begin
  if to_regclass('public.v_workspace_index_status') is null then
    raise exception 'FAIL phase24_197: migration 197 is not applied (public.v_workspace_index_status is missing)';
  end if;
  select count(*) into v_n from v_workspace_index_status;
  if v_n <> 1 then
    raise exception 'FAIL 0: the view holds % rows, expected exactly one', v_n;
  end if;
  select string_agg(a.attname || ' ' || a.atttypid::regtype::text, ',' order by a.attnum) into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_workspace_index_status'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'course_units_indexed bigint,course_units_waiting bigint,course_last_embedded timestamp with time zone,'
     'course_files_text_pending bigint,uploads_indexed bigint,uploads_waiting bigint,uploads_failed bigint,'
     'upload_links_expired bigint,uploads_deleting bigint,memory_indexed bigint,memory_waiting bigint,'
     'memory_failed bigint,ingest_polled_age_seconds integer' then
    raise exception 'FAIL 0: the columns are [%]', v_got;
  end if;
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_index_status'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    raise exception 'FAIL 0: the view is not security_invoker';
  end if;
  -- It reads no table of the storage schema.
  if pg_get_viewdef('public.v_workspace_index_status'::regclass) ~* 'storage\.' then
    raise exception 'FAIL 0: the view''s definition names a table of the storage schema';
  end if;
  if exists (select 1 from pg_depend d
              join pg_rewrite r on r.oid = d.objid
              join pg_class c on c.oid = d.refobjid
             where r.ev_class = 'public.v_workspace_index_status'::regclass
               and c.relnamespace = 'storage'::regnamespace) then
    raise exception 'FAIL 0: the view depends on a relation in the storage schema';
  end if;
  if has_table_privilege('anon', 'public.v_workspace_index_status', 'select, insert, update, delete')
     or has_any_column_privilege('anon', 'public.v_workspace_index_status', 'select')
     or not has_table_privilege('authenticated', 'public.v_workspace_index_status', 'select')
     or has_table_privilege('authenticated', 'public.v_workspace_index_status', 'insert, update, delete')
     or has_table_privilege('workspace_runner', 'public.v_workspace_index_status', 'select') then
    raise exception 'FAIL 0: the view''s grants are not select for authenticated and service_role alone';
  end if;
end $$;

-- =============================================================================================
-- 1 to 4. The numbers
-- =============================================================================================
do $$
declare
  v_owner  uuid := app_owner();
  v_other  uuid := gen_random_uuid();
  v_before jsonb;
  v_after  jsonb;
  v_row    record;
  v_k      text;
  v_got    text;
  v_case   record;
  v_expect jsonb;
  v_ok     boolean;
begin
  -- ---------------------------------------------------------------------------------------------
  -- 1. The course half, in one statement so it is one snapshot.
  -- ---------------------------------------------------------------------------------------------
  select s.course_units_indexed, s.course_units_waiting, s.course_last_embedded, s.course_files_text_pending,
         (select count(*) from bb_file_text) as units,
         (select count(*) from bb_file_text t where not exists (select 1 from bb_text_embeddings e where e.text_id = t.id)) as no_part,
         (select count(distinct e.text_id) from bb_text_embeddings e) as with_vector,
         (select max(e.embedded_at) from bb_text_embeddings e) as last_vector,
         (select count(*) from bb_files f where f.text_status = 'pending') as pending
    into v_row from v_workspace_index_status s;
  if v_row.course_units_indexed + v_row.course_units_waiting <> v_row.units then
    raise exception 'FAIL 1: indexed % + waiting % is not the % units of bb_file_text',
      v_row.course_units_indexed, v_row.course_units_waiting, v_row.units;
  end if;
  if v_row.course_units_waiting <> v_row.no_part then
    raise exception 'FAIL 1: course_units_waiting is %, the units with no part are %', v_row.course_units_waiting, v_row.no_part;
  end if;
  if v_row.course_units_indexed <> v_row.with_vector then
    raise exception 'FAIL 1: course_units_indexed is %, the units with a vector are %', v_row.course_units_indexed, v_row.with_vector;
  end if;
  if v_row.course_last_embedded is distinct from v_row.last_vector then
    raise exception 'FAIL 1: course_last_embedded is %, the newest vector is %', v_row.course_last_embedded, v_row.last_vector;
  end if;
  if v_row.course_files_text_pending <> v_row.pending then
    raise exception 'FAIL 1: course_files_text_pending is %, the pending files are %', v_row.course_files_text_pending, v_row.pending;
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 2. One synthetic document in each state moves exactly its own column.
  -- ---------------------------------------------------------------------------------------------
  select to_jsonb(s) into v_before from v_workspace_index_status s;
  perform pg_temp.w76_doc('upload', 'indexed', 'u-indexed-1');
  perform pg_temp.w76_doc('upload', 'indexed', 'u-indexed-2');
  perform pg_temp.w76_doc('upload', 'stored', 'u-stored');
  perform pg_temp.w76_doc('upload', 'reading', 'u-reading');
  perform pg_temp.w76_doc('upload', 'text_ready', 'u-text-ready');
  perform pg_temp.w76_doc('upload', 'failed', 'u-failed');
  perform pg_temp.w76_doc('upload', 'deleting', 'u-deleting');
  perform pg_temp.w76_doc('upload', 'stored', 'u-expired', true);
  perform pg_temp.w76_doc('memory', 'indexed', 'm-indexed');
  perform pg_temp.w76_doc('memory', 'text_ready', 'm-text-ready');
  perform pg_temp.w76_doc('memory', 'failed', 'm-failed');
  select to_jsonb(s) into v_after from v_workspace_index_status s;

  v_expect := jsonb_build_object(
    'uploads_indexed', 2, 'uploads_waiting', 4, 'uploads_failed', 1, 'upload_links_expired', 1,
    'uploads_deleting', 1, 'memory_indexed', 1, 'memory_waiting', 1, 'memory_failed', 1);
  for v_k in select jsonb_object_keys(v_after) loop
    if (v_after->>v_k) is distinct from (v_before->>v_k) and not v_expect ? v_k then
      raise exception 'FAIL 2: the column % moved from % to % though no document of its kind was added',
        v_k, v_before->>v_k, v_after->>v_k;
    end if;
  end loop;
  for v_k in select jsonb_object_keys(v_expect) loop
    if (v_after->>v_k)::bigint - (v_before->>v_k)::bigint <> (v_expect->>v_k)::bigint then
      raise exception 'FAIL 2: % moved by %, expected %', v_k,
        (v_after->>v_k)::bigint - (v_before->>v_k)::bigint, v_expect->>v_k;
    end if;
  end loop;
  -- The counts equal a direct count (the proof's own comparison).
  select (s.uploads_indexed = (select count(*) from workspace_documents d where d.kind = 'upload' and d.state = 'indexed')
         and s.memory_indexed = (select count(*) from workspace_documents d where d.kind = 'memory' and d.state = 'indexed')
         and s.uploads_failed = (select count(*) from workspace_documents d where d.kind = 'upload' and d.state = 'failed')
         and s.memory_failed = (select count(*) from workspace_documents d where d.kind = 'memory' and d.state = 'failed')
         and s.uploads_deleting = (select count(*) from workspace_documents d where d.kind = 'upload' and d.state = 'deleting')
         and s.uploads_waiting + s.memory_waiting
             = (select count(*) from workspace_documents d where d.state in ('stored', 'reading', 'text_ready')))
    into v_ok from v_workspace_index_status s;
  if v_ok is not true then
    raise exception 'FAIL 2: a count of the view differs from a direct count of workspace_documents';
  end if;
  -- A remembered item in `failed` is memory_failed and nothing else; in `text_ready` memory_waiting and nothing else.
  if (v_after->>'uploads_failed')::bigint - (v_before->>'uploads_failed')::bigint <> 1
     or (v_after->>'uploads_waiting')::bigint - (v_before->>'uploads_waiting')::bigint <> 4 then
    raise exception 'FAIL 2: a remembered item leaked into an upload column';
  end if;
  -- No vector for an indexed document's unit is not this view's to judge (the store proof's), but a
  -- unit-less indexed row is still counted as indexed here.

  -- ---------------------------------------------------------------------------------------------
  -- 3. The heartbeat.
  -- ---------------------------------------------------------------------------------------------
  delete from workspace_ingest_heartbeat where id = 1;
  if (select s.ingest_polled_age_seconds from v_workspace_index_status s) is not null then
    raise exception 'FAIL 3: ingest_polled_age_seconds is not null before the first heartbeat';
  end if;
  insert into workspace_ingest_heartbeat (id, polled_at, runner) values (1, now() - interval '90 seconds', 'w76-197');
  if (select s.ingest_polled_age_seconds from v_workspace_index_status s) is distinct from 90 then
    raise exception 'FAIL 3: a heartbeat 90 s old reads %', (select s.ingest_polled_age_seconds from v_workspace_index_status s);
  end if;
  update workspace_ingest_heartbeat set polled_at = now() + interval '5 seconds' where id = 1;
  if (select s.ingest_polled_age_seconds from v_workspace_index_status s) is distinct from 0 then
    raise exception 'FAIL 3: a heartbeat from the future is not read as 0';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 4. Who may read it.
  -- ---------------------------------------------------------------------------------------------
  for v_case in
    select * from (values
      ('the owner reads one row', 'authenticated', v_owner::text, 'ok:1'),
      ('a stranger reads one row of zeros', 'authenticated', v_other::text, 'ok:1'),
      ('anon is refused', 'anon', '', '42501'),
      ('workspace_runner is refused', 'workspace_runner', '', '42501')
    ) as x(label, role, sub, want)
  loop
    v_got := pg_temp.w76_try(v_case.role, v_case.sub, 'select * from v_workspace_index_status');
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 4: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  -- The stranger's row is zeros (row security hides every document and unit from them).
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  set local role authenticated;
  select s.uploads_indexed, s.uploads_waiting, s.uploads_failed, s.memory_indexed, s.memory_waiting, s.memory_failed,
         s.course_units_indexed, s.course_units_waiting
    into v_row from v_workspace_index_status s;
  reset role;
  if v_row.uploads_indexed <> 0 or v_row.uploads_waiting <> 0 or v_row.uploads_failed <> 0 or v_row.memory_indexed <> 0
     or v_row.memory_waiting <> 0 or v_row.memory_failed <> 0 or v_row.course_units_indexed <> 0 or v_row.course_units_waiting <> 0 then
    raise exception 'FAIL 4: a stranger reads a count that is not zero: %', row_to_json(v_row);
  end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;
  select s.uploads_indexed, s.memory_failed into v_row from v_workspace_index_status s;
  reset role;
  if v_row.uploads_indexed < 2 or v_row.memory_failed < 1 then
    raise exception 'FAIL 4: the owner does not read the synthetic documents: %', row_to_json(v_row);
  end if;
end $$;

select 'phase24_197_index_status: PASS' as result, (select count(*) from v_workspace_index_status) as rows;

rollback;
