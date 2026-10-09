-- bb2dash :: db/tests/phase24_195_turn_state.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 18, and the
-- memory branch of task 13's `workspace_document_delete`. Worker W-76.
-- Tests migration 195: `workspace_profile`, `workspace_conversation_state`, `workspace_turns` and
-- `workspace_sources`.
--
--   0. installed and shaped: the four tables, row security, the policies naming app_owner(), the
--      browser's one column write (about_me), and no column that could hold text
--   1. workspace_profile: About me of 2,000 characters passes and 2,001 raises 23514; memory_since
--      has no default and the owner cannot write it (42501); one row only; a stranger and anon
--   2. the trace tables' constraints (states, tiers, the 40-row cap, similarity, the key)
--   3. the conversation state's constraints and its cascade
--   4. the memory branch of workspace_document_delete (migration 190): the item, its unit, its
--      vectors go in one transaction and memory_opt_out is set
--
-- memory_since is null right after 195 is applied, and a runner stamps it later (196). So this unit
-- asserts what 195 itself makes true: the column has no default and the owner may not write it. The
-- stamp is phase24_196_runner_v2.sql's to prove.
--
-- Synthetic data; nothing is committed. RUN IT: `node scripts/db-test.mjs --only phase24_195_turn_state.sql`.

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

create function pg_temp.w76_call(p_role text, p_sub text, p_expr text) returns jsonb
  language plpgsql as $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  execute 'select ' || p_expr into v;
  reset role;
  return v;
end $$;

create function pg_temp.w76_basis(p_n integer) returns extensions.vector
  language sql immutable as $$
  select ('[' || array_to_string(array(select case when i = p_n then 1 else 0 end
                                         from generate_series(1, 384) i), ',') || ']')::extensions.vector(384)
$$;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  t      text;
  v_tabs text[] := array['workspace_profile', 'workspace_conversation_state', 'workspace_turns', 'workspace_sources'];
begin
  foreach t in array v_tabs loop
    if to_regclass('public.' || t) is null then
      raise exception 'FAIL phase24_195: migration 195 is not applied (public.% is missing)', t;
    end if;
  end loop;

  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any (v_tabs) and not c.relrowsecurity;
  if v_got is not null then v_fail := v_fail || format('row security is off on %s', v_got); end if;

  foreach t in array v_tabs loop
    if has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete, truncate, references, trigger')
       or has_any_column_privilege('anon', 'public.' || t, 'select, insert, update, references') then
      v_fail := v_fail || format('anon holds a privilege on %s', t);
    end if;
    if not has_table_privilege('authenticated', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'insert, update, delete, truncate, references, trigger') then
      v_fail := v_fail || format('authenticated does not hold select alone, at table level, on %s', t);
    end if;
    if has_table_privilege('workspace_runner', 'public.' || t, 'select, insert, update, delete')
       or has_any_column_privilege('workspace_runner', 'public.' || t, 'select, insert, update') then
      v_fail := v_fail || format('workspace_runner holds a privilege on %s', t);
    end if;
  end loop;

  -- The browser writes one column of one table.
  select string_agg(c.relname || '.' || a.attname || ':' || p.priv, ', '
                    order by c.relname collate "C", a.attname collate "C", p.priv)
    into v_got
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join (values ('insert'), ('update')) as p(priv)
   where c.relnamespace = 'public'::regnamespace and c.relname = any (v_tabs)
     and has_column_privilege('authenticated', c.oid, a.attname, p.priv);
  if v_got is distinct from 'workspace_profile.about_me:update' then
    v_fail := v_fail || format('authenticated''s column-level writes are [%s]', v_got);
  end if;

  select string_agg(p.tablename || '.' || p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+'),
                    ', ' order by p.tablename collate "C", p.policyname collate "C") into v_got
    from pg_policies p where p.schemaname = 'public' and p.tablename = any (v_tabs);
  if v_got is distinct from
     'workspace_conversation_state.workspace_conversation_state_owner_select:SELECT:authenticated, '
     'workspace_profile.workspace_profile_owner_select:SELECT:authenticated, '
     'workspace_profile.workspace_profile_owner_update:UPDATE:authenticated, '
     'workspace_sources.workspace_sources_owner_select:SELECT:authenticated, '
     'workspace_turns.workspace_turns_owner_select:SELECT:authenticated' then
    v_fail := v_fail || format('the policies are [%s]', v_got);
  end if;
  select string_agg(p.policyname, ', ' order by p.policyname collate "C") into v_got
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = any (v_tabs)
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') not like '%app_owner()%';
  if v_got is not null then v_fail := v_fail || format('these policies do not name app_owner(): %s', v_got); end if;

  -- No column of the trace tables could hold text.
  select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname collate "C", a.attname collate "C")
    into v_got
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.oid in ('public.workspace_turns'::regclass, 'public.workspace_sources'::regclass)
     and a.attnum > 0 and not a.attisdropped
     and a.attname in ('text', 'passage', 'content', 'snippet');
  if v_got is not null then v_fail := v_fail || format('a trace table has the column(s) %s', v_got); end if;
  select string_agg(c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', '
                    order by c.relname collate "C", a.attname collate "C") into v_got
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.oid in ('public.workspace_turns'::regclass, 'public.workspace_sources'::regclass)
     and a.attnum > 0 and not a.attisdropped and a.atttypid = 'text'::regtype
     and a.attname not in ('depth', 'tier', 'plan_state', 'retrieval_state', 'kind', 'origin', 'course_id',
                           'unit_kind', 'title');
  if v_got is not null then v_fail := v_fail || format('an unexpected text column: %s', v_got); end if;

  -- memory_since: nullable, no default (so it starts null), and not the browser's.
  if exists (select 1 from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
              where d.adrelid = 'public.workspace_profile'::regclass and a.attname = 'memory_since') then
    v_fail := v_fail || 'workspace_profile.memory_since has a default'::text;
  end if;
  if (select count(*) from workspace_profile p where p.id = 1) <> 1 or (select count(*) from workspace_profile) <> 1 then
    v_fail := v_fail || 'workspace_profile does not hold exactly its one row'::text;
  end if;
  if (select p.memory_since from workspace_profile p where p.id = 1) > now() then
    v_fail := v_fail || 'memory_since is in the future'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase24_195 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1 to 4. Behaviour
-- =============================================================================================
do $$
declare
  v_owner uuid := app_owner();
  v_other uuid := gen_random_uuid();
  v_conv  uuid; v_msg uuid; v_req bigint; v_req2 bigint;
  v_doc   bigint; v_unit bigint;
  v_out   jsonb;
  v_got   text;
  v_case  record;
begin
  if v_owner is null then
    raise exception 'FAIL phase24_195: app_owner() returned null, so the owner cannot be simulated';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 1. workspace_profile
  -- ---------------------------------------------------------------------------------------------
  for v_case in
    select * from (values
      ('the owner writing 2000 characters of About me', v_owner::text, 'ok:1', 'update workspace_profile set about_me = repeat(''a'', 2000)'),
      ('the owner writing 2001 characters of About me', v_owner::text, '23514', 'update workspace_profile set about_me = repeat(''a'', 2001)'),
      ('the owner writing memory_since', v_owner::text, '42501', 'update workspace_profile set memory_since = now()'),
      ('the owner writing updated_at', v_owner::text, '42501', 'update workspace_profile set updated_at = now()'),
      ('the owner writing the id', v_owner::text, '42501', 'update workspace_profile set id = 2'),
      ('the owner inserting a second row', v_owner::text, '42501', 'insert into workspace_profile (id) values (2)'),
      ('the owner deleting the row', v_owner::text, '42501', 'delete from workspace_profile'),
      ('a stranger writing About me: the row is not visible', v_other::text, 'ok:0', 'update workspace_profile set about_me = ''stolen'''),
      ('the owner reading the row', v_owner::text, 'ok:1', 'select 1 from workspace_profile'),
      ('a stranger reading the row', v_other::text, 'ok:0', 'select 1 from workspace_profile')
    ) as x(label, sub, want, stmt)
  loop
    v_got := pg_temp.w76_try('authenticated', v_case.sub, v_case.stmt);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 1: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  if pg_temp.w76_try('anon', '', 'select 1 from workspace_profile') <> '42501'
     or pg_temp.w76_try('anon', '', 'update workspace_profile set about_me = ''x''') <> '42501' then
    raise exception 'FAIL 1: anon touched workspace_profile';
  end if;
  if (select p.about_me from workspace_profile p where p.id = 1) <> repeat('a', 2000) then
    raise exception 'FAIL 1: the owner''s About me of 2000 characters was not stored';
  end if;
  -- The session role (the test login) may set the id twice? No: one row by check.
  if pg_temp.w76_try(null, '', 'insert into workspace_profile (id) values (2)') <> '23514' then
    raise exception 'FAIL 1: a second profile row was not refused by the one-row check';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 2. The trace tables. A conversation, a question and two requests (one answered, one open).
  -- ---------------------------------------------------------------------------------------------
  insert into workspace_conversations (title) values ('w76 195') returning id into v_conv;
  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_conv, 'user', 'A question', true) returning id into v_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, finished_at)
  values (v_conv, v_msg, 'done', now()) returning id into v_req;
  insert into workspace_requests (conversation_id, user_message_id) values (v_conv, v_msg) returning id into v_req2;

  for v_case in
    select * from (values
      ('a turn with a depth off the four', '23514', format('insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state) values (%s, ''max'', ''mid'', ''planned'', ''found'')', v_req)),
      ('a turn with a tier off the three', '23514', format('insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state) values (%s, ''deep'', ''max'', ''planned'', ''found'')', v_req)),
      ('a turn with a plan state off the three', '23514', format('insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state) values (%s, ''deep'', ''high'', ''thought'', ''found'')', v_req)),
      ('a turn with a retrieval state off the four', '23514', format('insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state) values (%s, ''deep'', ''high'', ''planned'', ''lost'')', v_req)),
      ('a turn with a negative count', '23514', format('insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state, found_n) values (%s, ''deep'', ''high'', ''planned'', ''found'', -1)', v_req)),
      ('a turn whose attachments are an object', '23514', format('insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state, attachments) values (%s, ''deep'', ''high'', ''planned'', ''found'', ''{}'')', v_req)),
      ('a turn for a request that is not there', '23503', 'insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state) values (0, ''deep'', ''high'', ''planned'', ''found'')'),
      ('a good turn', 'ok:1', format('insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state, found_n, passages_n, memory_n, feed_rows, attachments, prompt_bytes, plan_ms, retrieval_ms, plan_cost_usd) values (%s, ''standard'', ''mid'', ''planned'', ''found'', 3, 2, 1, 5, ''[{"kind": "file", "id": 1, "state": "cut"}]'', 48211, 1480, 912, 0.0016)', v_req)),
      ('a second turn for one request', '23505', format('insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state) values (%s, ''deep'', ''high'', ''planned'', ''found'')', v_req)),
      ('a source of a kind off the four', '23514', format('insert into workspace_sources (request_id, ord, kind, origin) values (%s, 1, ''web'', ''auto'')', v_req)),
      ('a source of an origin off the three', '23514', format('insert into workspace_sources (request_id, ord, kind, origin) values (%s, 1, ''material'', ''guess'')', v_req)),
      ('a source at ord 0', '23514', format('insert into workspace_sources (request_id, ord, kind, origin) values (%s, 0, ''material'', ''auto'')', v_req)),
      ('a source at ord 41', '23514', format('insert into workspace_sources (request_id, ord, kind, origin) values (%s, 41, ''material'', ''auto'')', v_req)),
      ('a source with a similarity over 1', '23514', format('insert into workspace_sources (request_id, ord, kind, origin, similarity) values (%s, 1, ''material'', ''auto'', 1.5)', v_req)),
      ('sources at ord 1 to 40', 'ok:40', format('insert into workspace_sources (request_id, ord, kind, origin, file_id, text_id, similarity, title) select %s, g, ''material'', ''auto'', 1, g, 0.8, ''t'' from generate_series(1, 40) g', v_req)),
      ('a second source at one ord', '23505', format('insert into workspace_sources (request_id, ord, kind, origin) values (%s, 7, ''feed'', ''auto'')', v_req)),
      ('a feed source with no ids', 'ok:1', format('insert into workspace_sources (request_id, ord, kind, origin, title) values (%s, 1, ''feed'', ''auto'', ''Planner and grades'')', v_req2)),
      ('a source for a request that is not there', '23503', 'insert into workspace_sources (request_id, ord, kind, origin) values (0, 1, ''feed'', ''auto'')')
    ) as x(label, want, stmt)
  loop
    v_got := pg_temp.w76_try(null, '', v_case.stmt);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 2: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  -- The owner reads the trace; a stranger, anon and the browser's writes: nothing.
  for v_case in
    select * from (values
      ('the owner reading workspace_turns', 'authenticated', v_owner::text, 'ok:1', format('select 1 from workspace_turns where request_id = %s', v_req)),
      ('a stranger reading workspace_turns', 'authenticated', v_other::text, 'ok:0', format('select 1 from workspace_turns where request_id = %s', v_req)),
      ('the owner reading workspace_sources', 'authenticated', v_owner::text, 'ok:40', format('select 1 from workspace_sources where request_id = %s', v_req)),
      ('a stranger reading workspace_sources', 'authenticated', v_other::text, 'ok:0', format('select 1 from workspace_sources where request_id = %s', v_req)),
      ('anon reading workspace_sources', 'anon', '', '42501', 'select 1 from workspace_sources'),
      ('the owner inserting a turn', 'authenticated', v_owner::text, '42501', format('insert into workspace_turns (request_id, depth, tier, plan_state, retrieval_state) values (%s, ''deep'', ''high'', ''planned'', ''found'')', v_req2)),
      ('the owner updating a turn', 'authenticated', v_owner::text, '42501', 'update workspace_turns set tier = ''low'''),
      ('the owner deleting a source', 'authenticated', v_owner::text, '42501', 'delete from workspace_sources'),
      ('the owner inserting a source', 'authenticated', v_owner::text, '42501', format('insert into workspace_sources (request_id, ord, kind, origin) values (%s, 2, ''feed'', ''auto'')', v_req2)),
      ('the owner writing conversation state', 'authenticated', v_owner::text, '42501', format('insert into workspace_conversation_state (conversation_id) values (%L)', v_conv)),
      ('the owner updating conversation state', 'authenticated', v_owner::text, '42501', 'update workspace_conversation_state set memory_opt_out = false')
    ) as x(label, role, sub, want, stmt)
  loop
    v_got := pg_temp.w76_try(v_case.role, v_case.sub, v_case.stmt);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 2: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  -- A request's removal takes its trace with it.
  delete from workspace_requests where id = v_req;
  if exists (select 1 from workspace_turns t where t.request_id = v_req)
     or exists (select 1 from workspace_sources s where s.request_id = v_req) then
    raise exception 'FAIL 2: deleting a request left its turn or its sources';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 3. The conversation state
  -- ---------------------------------------------------------------------------------------------
  for v_case in
    select * from (values
      ('a first state row', 'ok:1', format('insert into workspace_conversation_state (conversation_id) values (%L)', v_conv)),
      ('a second state row for one conversation', '23505', format('insert into workspace_conversation_state (conversation_id) values (%L)', v_conv)),
      ('a rolling summary of 3001 characters', '23514', format('update workspace_conversation_state set rolling_summary = repeat(''s'', 3001) where conversation_id = %L', v_conv)),
      ('a rolling summary of 3000 characters', 'ok:1', format('update workspace_conversation_state set rolling_summary = repeat(''s'', 3000) where conversation_id = %L', v_conv)),
      ('a negative failure count', '23514', format('update workspace_conversation_state set job_failures = -1 where conversation_id = %L', v_conv)),
      ('a state row for a conversation that is not there', '23503', format('insert into workspace_conversation_state (conversation_id) values (%L)', gen_random_uuid()))
    ) as x(label, want, stmt)
  loop
    v_got := pg_temp.w76_try(null, '', v_case.stmt);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 3: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  if (select s.job_failures || '/' || s.memory_opt_out from workspace_conversation_state s where s.conversation_id = v_conv) <> '0/false' then
    raise exception 'FAIL 3: the defaults of a state row are not 0 failures and no opt-out';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 4. The memory branch of workspace_document_delete (190): everything goes in one transaction and
  --    the conversation is never summarised again.
  -- ---------------------------------------------------------------------------------------------
  insert into workspace_documents (kind, title, conversation_id, state) values ('memory', 'w76 195 memory', v_conv, 'indexed')
  returning id into v_doc;
  insert into workspace_document_text (document_id, unit_kind, unit_no, text, embedded_at)
  values (v_doc, 'doc', 1, 'Synthetic remembered summary.', now()) returning id into v_unit;
  insert into workspace_text_embeddings (text_id, part_no, model, embedding) values (v_unit, 1, 'gte-small', pg_temp.w76_basis(1));
  if (select s.memory_opt_out from workspace_conversation_state s where s.conversation_id = v_conv) then
    raise exception 'FAIL 4 (setup): the conversation is opted out before the delete';
  end if;

  -- A stranger cannot.
  if pg_temp.w76_try('authenticated', v_other::text, format('select public.workspace_document_delete(%s, false)', v_doc)) <> '42501' then
    raise exception 'FAIL 4: a stranger deleting a remembered item did not end in 42501';
  end if;
  v_out := pg_temp.w76_call('authenticated', v_owner::text, format('public.workspace_document_delete(%s, false)', v_doc));
  if v_out->>'state' <> 'deleted' or v_out->>'kind' <> 'memory' or v_out->'storage_key' <> 'null'::jsonb
     or (v_out->>'id')::bigint <> v_doc then
    raise exception 'FAIL 4: the memory delete returned %', v_out;
  end if;
  if exists (select 1 from workspace_documents d where d.id = v_doc)
     or exists (select 1 from workspace_document_text t where t.id = v_unit)
     or exists (select 1 from workspace_text_embeddings e where e.text_id = v_unit) then
    raise exception 'FAIL 4: the remembered item, its unit or its vector is still there';
  end if;
  if not (select s.memory_opt_out from workspace_conversation_state s where s.conversation_id = v_conv) then
    raise exception 'FAIL 4: memory_opt_out was not set on the existing state row';
  end if;
  -- A conversation with no state row yet gets one, opted out.
  insert into workspace_conversations (title) values ('w76 195 second') returning id into v_conv;
  insert into workspace_documents (kind, title, conversation_id, state) values ('memory', 'w76 195 memory two', v_conv, 'text_ready')
  returning id into v_doc;
  v_out := pg_temp.w76_call('authenticated', v_owner::text, format('public.workspace_document_delete(%s, true)', v_doc));
  if v_out->>'state' <> 'deleted'
     or not coalesce((select s.memory_opt_out from workspace_conversation_state s where s.conversation_id = v_conv), false) then
    raise exception 'FAIL 4: a memory delete for a conversation with no state row returned % or set no opt-out', v_out;
  end if;
  if pg_temp.w76_try('authenticated', v_owner::text, format('select public.workspace_document_delete(%s, false)', v_doc)) <> '22023' then
    raise exception 'FAIL 4: deleting a remembered item twice did not end in 22023';
  end if;
  -- The conversation's removal takes its state with it.
  delete from workspace_conversations where id = v_conv;
  if exists (select 1 from workspace_conversation_state s where s.conversation_id = v_conv) then
    raise exception 'FAIL 3: deleting a conversation left its state row';
  end if;
end $$;

select 'phase24_195_turn_state: PASS' as result;

rollback;
