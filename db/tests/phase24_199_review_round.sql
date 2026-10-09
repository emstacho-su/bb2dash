-- bb2dash :: db/tests/phase24_199_review_round.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), the review round. Worker W-76.
-- Tests migration 199 (four findings of the code review and the security review):
--
--   0. installed and fenced: the five re-stated functions are definer, pinned, executable by their one
--      role alone; the two roles still execute eleven and four definer functions
--   1. workspace_job_claim: the newest finished message is never a rolling job's input and `through`
--      never reaches it (a last answer of 20,000 bytes: no job when nothing else is old, and when
--      older messages are due the job stops short of it); the next request's context still holds it
--   2. workspace_ingest_claim / _finish: after a failed try a document waits 60 seconds times its
--      attempts (the clock is moved by setting claimed_at back; a transaction's now() does not move);
--      it still counts as waiting in v_workspace_index_status; the new outcome `release` frees the lease
--      and counts no try, and only for a document in text_ready
--   3. workspace_job_finish: another runner's name, the other kind and an expired lease are each
--      refused (22023) and write nothing
--   4. workspace_turn_put: an attachment is cut to {kind, id, state} (the rest dropped, five at most);
--      a source's title is the database's own (the feed's fixed, cut to 200)
--
-- Every call is made under 'set local role workspace_runner' or 'workspace_ingest_runner'. The unit
-- first parks, INSIDE this transaction only, every request, conversation lease and waiting document
-- that really exists. All data is synthetic. Nothing is committed.
-- AN 'execute_sql' DRY RUN adds, inside its own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
--     grant workspace_ingest_runner to postgres with inherit false, set true;
-- RUN IT: 'node scripts/db-test.mjs --only phase24_199_review_round.sql'.

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

create function pg_temp.w76_req(p_title text, p_state text, p_age interval, p_by text default null) returns bigint
  language plpgsql as $$
declare
  v_conv uuid; v_msg uuid; v_req bigint;
begin
  insert into workspace_conversations (title) values (p_title) returning id into v_conv;
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  values (v_conv, 'user', 'question ' || p_title, true, now() - p_age) returning id into v_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, claimed_by, claimed_at, created_at,
                                  finished_at)
  values (v_conv, v_msg, p_state, p_by, case when p_state = 'claimed' then now() - p_age end, now() - p_age,
          case when p_state in ('done', 'failed', 'cancelled') then now() - p_age end)
  returning id into v_req;
  return v_req;
end $$;

create function pg_temp.w76_msg(p_conv uuid, p_role text, p_content text, p_age interval) returns uuid
  language plpgsql as $$
declare
  v_id uuid;
begin
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  values (p_conv, p_role, p_content, true, now() - p_age) returning id into v_id;
  return v_id;
end $$;

create function pg_temp.w76_up(p_tag text, p_state text, p_age interval) returns bigint
  language plpgsql as $$
declare
  c_host constant text := 'https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/';
  v_sha  text := md5('w76-199-' || p_tag) || md5('w76-199b-' || p_tag);
  v_id   bigint;
begin
  insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, state,
                                   signed_url, signed_url_expires_at, created_at)
  values ('upload', 'w76 199 ' || p_tag, 'text/plain', 10, v_sha, 'u/' || v_sha, p_state,
          c_host || 'u/' || v_sha || '?token=synthetic', now() + interval '7 days', now() - p_age)
  returning id into v_id;
  return v_id;
end $$;

-- =============================================================================================
-- 0. Installed and fenced
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  f      text;
  v_n    integer;
begin
  foreach f in array array[
    'public.workspace_job_claim(text, text[])',
    'public.workspace_job_finish(text, uuid, text, text, text, timestamptz)',
    'public.workspace_turn_put(bigint, text, jsonb, jsonb)',
    'public.workspace_ingest_claim(text)',
    'public.workspace_ingest_finish(text, bigint, text, text)'] loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase24_199: % is missing', f;
    end if;
    if not (select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']
              from pg_proc p where p.oid = f::regprocedure) then
      v_fail := v_fail || format('%s is not security definer with a pinned path', f);
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') or has_function_privilege('public', f, 'execute')
       or has_function_privilege('db_test_runner', f, 'execute') then
      v_fail := v_fail || format('%s is executable beyond its role', f);
    end if;
  end loop;
  if not has_function_privilege('workspace_runner', 'public.workspace_job_finish(text, uuid, text, text, text, timestamptz)', 'execute')
     or not has_function_privilege('workspace_ingest_runner', 'public.workspace_ingest_finish(text, bigint, text, text)', 'execute') then
    v_fail := v_fail || 'a role lost its function'::text;
  end if;
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_n <> 11 then v_fail := v_fail || format('workspace_runner executes %s definer functions', v_n); end if;
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_ingest_runner', p.oid, 'execute');
  if v_n <> 4 then v_fail := v_fail || format('workspace_ingest_runner executes %s definer functions', v_n); end if;
  if position('o.rn > 1 and o.bytes_newer' in pg_get_functiondef('public.workspace_job_claim(text, text[])'::regprocedure)) = 0 then
    raise exception 'FAIL phase24_199: migration 199 is not applied (workspace_job_claim is still 196''s)';
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase24_199 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1 and 3. The rolling job and the job's lease
-- =============================================================================================
do $$
declare
  c_role constant text := 'workspace_runner';
  c_r1   constant text := 'w76-r1';
  c_r2   constant text := 'w76-r2';
  v_rb bigint; v_rc bigint; v_rn bigint;
  v_cb uuid; v_cc uuid;
  v_last uuid;
  v_out jsonb; v_o2 jsonb;
  v_m3_at timestamptz;
  v_row record;
  v_got text;
begin
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');
  insert into workspace_conversation_state (conversation_id, memory_opt_out, job_claimed_by, job_claimed_at)
  select c.id, true, 'w76-parked', now() from workspace_conversations c
  on conflict (conversation_id) do update
     set memory_opt_out = true, job_claimed_by = 'w76-parked', job_claimed_at = now();

  -- 1a. B: the question and one answer of 20,000 bytes. Nothing else is old, so no job at all (196
  --     summarised the answer itself and moved summarised_through onto it).
  v_rb := pg_temp.w76_req('w76 199 B', 'done', interval '3 hours');
  select r.conversation_id into v_cb from workspace_requests r where r.id = v_rb;
  perform pg_temp.w76_msg(v_cb, 'assistant', repeat('b', 20000), interval '1 hour');
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r1)) is not null then
    raise exception 'FAIL 1a: a rolling job was handed out for a conversation whose only old text is its question';
  end if;

  -- 1b. C: three older messages of 5,000 bytes, then a last answer of 20,000 bytes. The job takes the
  --     question and the three and stops short of the last answer; through is the third's time.
  v_rc := pg_temp.w76_req('w76 199 C', 'done', interval '3 hours');
  select r.conversation_id into v_cc from workspace_requests r where r.id = v_rc;
  perform pg_temp.w76_msg(v_cc, 'assistant', repeat('1', 5000), interval '150 minutes');
  perform pg_temp.w76_msg(v_cc, 'user', repeat('2', 5000), interval '140 minutes');
  perform pg_temp.w76_msg(v_cc, 'assistant', repeat('3', 5000), interval '130 minutes');
  v_last := pg_temp.w76_msg(v_cc, 'assistant', repeat('L', 20000), interval '60 minutes');
  select m.created_at into v_m3_at from workspace_messages m
   where m.conversation_id = v_cc and m.content = repeat('3', 5000);
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r1));
  if (v_out->>'conversation_id')::uuid is distinct from v_cc or jsonb_array_length(v_out->'messages') <> 4
     or (v_out->>'through')::timestamptz is distinct from v_m3_at
     or exists (select 1 from jsonb_array_elements(v_out->'messages') m where m->>'content' = repeat('L', 20000)) then
    raise exception 'FAIL 1b: the rolling job reads % messages through [%], expected the question and three, through [%]',
      jsonb_array_length(v_out->'messages'), v_out->>'through', v_m3_at;
  end if;
  if (select s.job_claimed_by from workspace_conversation_state s where s.conversation_id = v_cc) <> 'rolling:' || c_r1 then
    raise exception 'FAIL 1b: the lease holder does not record the kind (rolling:<runner>)';
  end if;

  -- 3. workspace_job_finish checks the job it finishes. Each refusal writes nothing.
  foreach v_got in array array[
    format('select public.workspace_job_finish(%L, %L, ''rolling'', ''done'', ''S'', %L::timestamptz)', c_r2, v_cc, v_m3_at),
    format('select public.workspace_job_finish(%L, %L, ''memory'', ''done'', ''S'', %L::timestamptz)', c_r1, v_cc, v_m3_at),
    format('select public.workspace_job_finish(%L, %L, ''rolling'', ''done'', ''S'', %L::timestamptz)', c_r1, v_cb, v_m3_at),
    format('select public.workspace_job_finish(%L, %L, ''rolling'', ''failed'', null, null)', c_r2, v_cc),
    format('select public.workspace_job_finish(%L, %L, ''rolling'', ''released'', null, null)', c_r2, v_cc),
    format('select public.workspace_job_finish(%L, %L, ''memory'', ''released'', null, null)', c_r1, v_cc)] loop
    if pg_temp.w76_try(c_role, null, v_got) <> '22023' then
      raise exception 'FAIL 3: [%] did not end in 22023', v_got;
    end if;
  end loop;
  update workspace_conversation_state set job_claimed_at = now() - interval '6 minutes' where conversation_id = v_cc;
  if pg_temp.w76_try(c_role, null, format('select public.workspace_job_finish(%L, %L, ''rolling'', ''done'', ''S'', %L::timestamptz)', c_r1, v_cc, v_m3_at)) <> '22023' then
    raise exception 'FAIL 3: an expired lease was accepted';
  end if;
  select s.rolling_summary, s.summarised_through, s.job_failures, s.job_claimed_by into v_row
    from workspace_conversation_state s where s.conversation_id = v_cc;
  if v_row.rolling_summary is not null or v_row.summarised_through is not null or v_row.job_failures <> 0
     or v_row.job_claimed_by <> 'rolling:' || c_r1 then
    raise exception 'FAIL 3: a refused finish wrote something: %', row_to_json(v_row);
  end if;

  -- The right runner and kind, inside the lease, finishes.
  update workspace_conversation_state set job_claimed_at = now() where conversation_id = v_cc;
  v_o2 := pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''rolling'', ''done'', ''Synthetic summary.'', %L::timestamptz)', c_r1, v_cc, v_m3_at));
  if v_o2 <> '{"stored": true, "document_id": null}'::jsonb then
    raise exception 'FAIL 3: the right finish returned %', v_o2;
  end if;
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r1)) is not null then
    raise exception 'FAIL 1b: a job was handed out again with only the last answer left';
  end if;

  -- 1c. The next request's context still holds the 20,000-byte answer, verbatim.
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  values (v_cc, 'user', 'shorten section 3', true, now() - interval '30 seconds');
  insert into workspace_requests (conversation_id, user_message_id, state, claimed_by, claimed_at)
  select v_cc, m.id, 'claimed', c_r1, now() from workspace_messages m
   where m.conversation_id = v_cc and m.content = 'shorten section 3'
  returning id into v_rn;
  v_o2 := pg_temp.w76_call(c_role, null, format('public.workspace_turn_context(%s, %L)', v_rn, c_r1));
  if v_o2->>'rolling_summary' <> 'Synthetic summary.'
     or (select count(*) from jsonb_array_elements(v_o2->'messages') m where m->>'content' = repeat('L', 20000)) <> 1
     or jsonb_array_length(v_o2->'messages') <> 1 then
    raise exception 'FAIL 1c: the next context holds % message(s); the 20,000-byte answer must be there verbatim and alone',
      jsonb_array_length(v_o2->'messages');
  end if;
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now() where id = v_rn;
end $$;

-- =============================================================================================
-- 2. The ingest wait, and the new outcome release
-- =============================================================================================
do $$
declare
  c_role constant text := 'workspace_ingest_runner';
  c_r1   constant text := 'w76-ing-1';
  v_e bigint; v_d bigint;
  v_out jsonb;
  v_row record;
  v_n integer;
  v_wait_before bigint;
begin
  update workspace_documents
     set state = 'failed', error_code = 'embed_failed', signed_url = null, signed_url_expires_at = null,
         claimed_by = null, claimed_at = null
   where state in ('stored', 'reading', 'text_ready');
  v_e := pg_temp.w76_up('e', 'stored', interval '30 minutes');
  select s.uploads_waiting into v_wait_before from v_workspace_index_status s;

  for v_n in 1..2 loop
    v_out := pg_temp.w76_call(c_role, null, format('public.workspace_ingest_claim(%L)', c_r1));
    if (v_out->>'document_id')::bigint is distinct from v_e or (v_out->>'attempts')::int <> v_n - 1 then
      raise exception 'FAIL 2a: claim % returned %', v_n, v_out;
    end if;
    perform pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_ingest_finish(%L, %s, ''retry'', ''download_failed''))', c_r1, v_e));
    -- Waiting is still waiting.
    if (select s.uploads_waiting from v_workspace_index_status s) is distinct from v_wait_before then
      raise exception 'FAIL 2b: a retried upload is not counted as waiting';
    end if;
    -- Not at once, not one second early, and then at 60 seconds times its attempts.
    if pg_temp.w76_call(c_role, null, format('public.workspace_ingest_claim(%L)', c_r1)) is not null then
      raise exception 'FAIL 2a: retry % was handed out again at once', v_n;
    end if;
    update workspace_documents set claimed_at = now() - (v_n * 60 - 1) * interval '1 second' where id = v_e;
    if pg_temp.w76_call(c_role, null, format('public.workspace_ingest_claim(%L)', c_r1)) is not null then
      raise exception 'FAIL 2a: retry % was handed out 1 second early', v_n;
    end if;
    update workspace_documents set claimed_at = now() - v_n * interval '60 seconds' where id = v_e;
  end loop;

  -- release: a document in text_ready, a try that made progress and ran out of time. No try is
  -- counted, the lease is freed, the state stays, and it is claimable at once.
  v_d := pg_temp.w76_up('d', 'text_ready', interval '20 minutes');
  update workspace_documents set attempts = 1 where id = v_d;
  update workspace_documents set state = 'failed', error_code = 'embed_failed', signed_url = null,
         signed_url_expires_at = null where id = v_e;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_ingest_claim(%L)', c_r1));
  if (v_out->>'document_id')::bigint is distinct from v_d or v_out->>'step' <> 'embed' then
    raise exception 'FAIL 2c: the embed step was claimed as %', v_out;
  end if;
  if pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_ingest_finish(%L, %s, ''release'', null))', c_r1, v_d))#>>'{}' <> 'text_ready' then
    raise exception 'FAIL 2c: release did not return text_ready';
  end if;
  select d.state, d.attempts, d.claimed_by, d.claimed_at into v_row from workspace_documents d where d.id = v_d;
  if v_row.state <> 'text_ready' or v_row.attempts <> 1 or v_row.claimed_by is not null or v_row.claimed_at is not null then
    raise exception 'FAIL 2c: after release the row reads %', row_to_json(v_row);
  end if;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_ingest_claim(%L)', c_r1));
  if (v_out->>'document_id')::bigint is distinct from v_d or (v_out->>'attempts')::int <> 1 then
    raise exception 'FAIL 2c: a released document was not claimable at once: %', v_out;
  end if;
  -- release is only for text_ready, and only by the holder.
  if pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_finish(%L, %s, ''release'', null)', 'w76-ing-2', v_d)) <> '22023' then
    raise exception 'FAIL 2c: release by a runner that does not hold the document was not refused';
  end if;
  update workspace_documents set state = 'reading' where id = v_d;
  if pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_finish(%L, %s, ''release'', null)', c_r1, v_d)) <> '22023' then
    raise exception 'FAIL 2c: release of a document in reading was not refused';
  end if;
end $$;

-- =============================================================================================
-- 4. workspace_turn_put stores ids and states only
-- =============================================================================================
do $$
declare
  c_role  constant text := 'workspace_runner';
  c_r1    constant text := 'w76-r1';
  v_owner uuid := app_owner();
  v_c1    text;
  v_rq    bigint;
  v_f     bigint; v_t bigint; v_d bigint; v_dt bigint; v_mem bigint; v_memt bigint;
  v_conv  uuid;
  v_sha   text := md5('w76-199-t') || md5('w76-199-tb');
  v_long  text := repeat('n', 300);
  v_n     integer;
  v_got   text;
begin
  select c.id into v_c1 from courses c order by c.id limit 1;
  v_rq := pg_temp.w76_req('w76 199 put', 'claimed', interval '1 minute', c_r1);
  select r.conversation_id into v_conv from workspace_requests r where r.id = v_rq;
  insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
  select c.bb_course_id, c.id, 'readings', v_long, 'https://example.invalid/_w76_199_f', 'rule', now()
    from courses c where c.id = v_c1;
  select f.id into v_f from bb_files f where f.source_url = 'https://example.invalid/_w76_199_f';
  if pg_temp.w76_try('authenticated', v_owner::text, format(
       'insert into bb_file_text (file_id, unit_kind, unit_no, text) values (%s, ''slide'', 1, ''Synthetic text.'')', v_f)) <> 'ok:1' then
    raise exception 'FAIL phase24_199 (setup): the course unit was not written';
  end if;
  select t.id into v_t from bb_file_text t where t.file_id = v_f;
  insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, state)
  values ('upload', 'w76 199 upload', 'text/plain', 10, v_sha, 'u/' || v_sha, 'indexed') returning id into v_d;
  insert into workspace_document_text (document_id, unit_kind, unit_no, text) values (v_d, 'page', 1, 'Synthetic page.') returning id into v_dt;
  insert into workspace_documents (kind, title, conversation_id, state) values ('memory', 'w76 199 remembered', v_conv, 'indexed') returning id into v_mem;
  insert into workspace_document_text (document_id, unit_kind, unit_no, text) values (v_mem, 'doc', 1, 'Synthetic memory.') returning id into v_memt;

  -- 4a. The attachments: cut to exactly {kind, id, state}; a kind off the two, a state off the six, an
  --     id that is a string and a non-object are dropped; five at most.
  v_n := (pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_turn_put(%s, %L, %L::jsonb, null))', v_rq, c_r1,
    jsonb_build_object('depth', 'deep', 'tier', 'high', 'plan_state', 'planned', 'retrieval_state', 'found',
      'attachments', jsonb_build_array(
        jsonb_build_object('kind', 'file', 'id', 1, 'state', 'read', 'title', 'leak', 'text', 'leak'),
        jsonb_build_object('kind', 'web', 'id', 2, 'state', 'read'),
        jsonb_build_object('kind', 'upload', 'id', null, 'state', 'missing'),
        jsonb_build_object('kind', 'upload', 'state', 'cut'),
        jsonb_build_object('kind', 'file', 'id', '7', 'state', 'read'),
        jsonb_build_object('kind', 'file', 'id', 3, 'state', 'ok'),
        to_jsonb('x'::text),
        jsonb_build_object('kind', 'file', 'id', 4, 'state', 'no_text'),
        jsonb_build_object('kind', 'upload', 'id', 5, 'state', 'failed'),
        jsonb_build_object('kind', 'file', 'id', 6, 'state', 'not_ready'),
        jsonb_build_object('kind', 'file', 'id', 7, 'state', 'cut')))::text)))::text::int;
  if (select t.attachments from workspace_turns t where t.request_id = v_rq) is distinct from
     '[{"kind": "file", "id": 1, "state": "read"}, {"kind": "upload", "id": null, "state": "missing"},
       {"kind": "upload", "id": null, "state": "cut"}, {"kind": "file", "id": 4, "state": "no_text"},
       {"kind": "upload", "id": 5, "state": "failed"}]'::jsonb then
    raise exception 'FAIL 4a: the stored attachments read %', (select t.attachments from workspace_turns t where t.request_id = v_rq);
  end if;
  -- All six states pass; an attachments value that is not an array stores [].
  perform pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_turn_put(%s, %L, %L::jsonb, null))', v_rq, c_r1,
    '{"depth": "deep", "tier": "high", "plan_state": "planned", "retrieval_state": "found", "attachments": [{"kind": "file", "id": 1, "state": "read"}, {"kind": "file", "id": 1, "state": "cut"}, {"kind": "file", "id": 1, "state": "not_ready"}, {"kind": "file", "id": 1, "state": "failed"}, {"kind": "file", "id": 1, "state": "missing"}]}'));
  if jsonb_array_length((select t.attachments from workspace_turns t where t.request_id = v_rq)) <> 5 then
    raise exception 'FAIL 4a: the five states read, cut, not_ready, failed and missing were not all kept';
  end if;
  perform pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_turn_put(%s, %L, %L::jsonb, null))', v_rq, c_r1,
    '{"depth": "deep", "tier": "high", "plan_state": "planned", "retrieval_state": "found", "attachments": {"kind": "file"}}'));
  if (select t.attachments from workspace_turns t where t.request_id = v_rq) <> '[]'::jsonb then
    raise exception 'FAIL 4a: attachments that are not an array did not store []';
  end if;

  -- 4b. The titles: the caller's is ignored; the database's own is stored, cut to 200; the feed's is fixed.
  v_n := (pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_turn_put(%s, %L, %L::jsonb, %L::jsonb))', v_rq, c_r1,
    '{"depth": "deep", "tier": "high", "plan_state": "planned", "retrieval_state": "found"}',
    jsonb_build_array(
      jsonb_build_object('kind', 'feed', 'origin', 'auto', 'title', 'evil feed title'),
      jsonb_build_object('kind', 'material', 'origin', 'auto', 'text_id', v_t, 'title', 'evil material title'),
      jsonb_build_object('kind', 'material', 'origin', 'attached', 'file_id', v_f, 'title', 'evil attached title'),
      jsonb_build_object('kind', 'upload', 'origin', 'auto', 'document_id', v_d, 'doc_text_id', v_dt, 'title', 'evil upload title'),
      jsonb_build_object('kind', 'memory', 'origin', 'auto', 'document_id', v_mem, 'doc_text_id', v_memt, 'title', 'evil memory title'))::text)))::text::int;
  select string_agg(s.kind || ':' || s.origin || ':' || coalesce(char_length(s.title)::text, '-') || ':' ||
                    case when char_length(s.title) > 40 then 'long' else coalesce(s.title, '-') end, '|' order by s.ord)
    into v_got from workspace_sources s where s.request_id = v_rq;
  if v_n <> 5 or v_got is distinct from
     'feed:auto:18:Planner and grades|material:auto:200:long|material:attached:200:long|upload:auto:14:w76 199 upload|memory:auto:18:w76 199 remembered' then
    raise exception 'FAIL 4b: the sources read [%]', v_got;
  end if;
  if exists (select 1 from workspace_sources s where s.request_id = v_rq and s.title like 'evil%') then
    raise exception 'FAIL 4b: a title the caller sent was stored';
  end if;
end $$;

select 'phase24_199_review_round: PASS' as result;

rollback;
