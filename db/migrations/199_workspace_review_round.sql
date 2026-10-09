-- bb2dash :: db/migrations/199_workspace_review_round.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), the review round: four
-- findings of the code review and the security review on 190 to 198, made here because those files are
-- frozen once applied (as 143 did for 140 and 142). Worker W-76.
--
-- WHAT. `create or replace`, `comment on` and ONE read-only view (5, below): no table, column or index changes.
--   1. workspace_job_claim     the NEWEST finished message is never a rolling job's input and
--                              `through` never reaches it; a message is old when the bytes of the
--                              messages NEWER than it already pass 14,000 (196 counted the message
--                              itself, so a 20,000-byte last answer was summarised and the next
--                              question saw no verbatim turn). The claim records its kind in the
--                              holder, 'rolling:<runner>' or 'memory:<runner>' (no new column).
--   2. workspace_ingest_claim, workspace_ingest_finish
--                              after a failed try a document is not handed out again until 60
--                              seconds times its attempts have passed. The time is `claimed_at`,
--                              which `retry` now sets to the time of the try instead of clearing (it
--                              is null for a row nobody has tried). A document waiting out its wait is
--                              still waiting in v_workspace_index_status (counted by state). New
--                              outcome 'release': a document in text_ready, lease freed, attempts
--                              unchanged, for a try that made progress and ran out of time.
--   3. workspace_job_finish    refused (22023) unless p_runner holds the lease on that conversation
--                              FOR THAT KIND and it is under 5 minutes old.
--   4. workspace_turn_put      each attachment of p_facts is cut to {kind, id, state} (kind file or
--                              upload, id a number or null, state one of read, cut, not_ready, failed,
--                              missing, no_text; one that does not fit is dropped; five at most); a
--                              source's title is the database's own for material, upload and memory
--                              rows and the fixed 'Planner and grades' for feed, cut to 200.
--   5. v_workspace_store_proof  one row: the catalog answers of the store proofs 1, 2, 3 and 7 as plain
--                              columns, for the acceptance run (its reader refuses pg_* relations).
--
-- The bodies are 196's and 193's, with only what is marked 199 changed. Grants are re-stated as they
-- stand. No password, key or DSN is in this file.

do $$
begin
  if to_regprocedure('public.workspace_job_claim(text, text[])') is null
     or to_regprocedure('public.workspace_ingest_finish(text, bigint, text, text)') is null then
    raise exception '199: apply 193 and 196 first';
  end if;
end $$;

-- =============================================================================================
-- 1. workspace_job_claim
-- =============================================================================================
create or replace function public.workspace_job_claim(p_runner text, p_kinds text[])
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_lease        constant interval := interval '5 minutes';
  c_quiet        constant interval := interval '15 minutes';
  c_roll_keep    constant integer  := 14000;
  c_roll_due     constant integer  := 12000;
  c_memory_bytes constant integer  := 60000;
  c_max_failures constant integer  := 3;
  v_conv    uuid;
  v_since   timestamptz;
  v_prev    text;
  v_msgs    jsonb;
  v_through timestamptz;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_job_claim: p_runner is required' using errcode = '22023';
  end if;
  if p_kinds is null or exists (select 1 from unnest(p_kinds) k where k is null or k not in ('rolling', 'memory')) then
    raise exception 'workspace_job_claim: p_kinds holds rolling and memory only' using errcode = '22023';
  end if;
  if cardinality(p_kinds) = 0 then
    return null;
  end if;

  -- The first call that asks for memory jobs stamps the time, once. Nothing said before it is remembered.
  if 'memory' = any (p_kinds) then
    update workspace_profile p set memory_since = now() where p.id = 1 and p.memory_since is null;
  end if;

  -- No job while any request is queued or claimed.
  if exists (select 1 from workspace_requests r where r.state in ('queued', 'claimed')) then
    return null;
  end if;

  -- ---- rolling (199): a message is old when the messages NEWER than it already pass 14,000 bytes, and
  --      the newest finished message is never old, however large, so the next question always sees one
  --      verbatim turn. Newer than the through-point, when the old ones pass 12,000 bytes. Not held to
  --      memory_since. The lease records its kind in the holder: 'rolling:<runner>' or 'memory:<runner>'.
  if 'rolling' = any (p_kinds) then
    select q.cid into v_conv
      from (select o.cid, max(o.created_at) as last_older, sum(octet_length(o.content)) as bytes
              from (select m.conversation_id as cid, m.created_at, m.content,
                           coalesce(sum(octet_length(m.content)) over (partition by m.conversation_id
                                                                       order by m.created_at desc, m.id desc
                                                                       rows between unbounded preceding and 1 preceding), 0) as bytes_newer,
                           row_number() over (partition by m.conversation_id
                                              order by m.created_at desc, m.id desc) as rn
                      from workspace_messages m
                      left join workspace_conversation_state s on s.conversation_id = m.conversation_id
                     where m.finished and m.content <> ''
                       and (s.summarised_through is null or m.created_at > s.summarised_through)) o
             where o.rn > 1 and o.bytes_newer > c_roll_keep
             group by o.cid) q
      left join workspace_conversation_state s on s.conversation_id = q.cid
     where q.bytes > c_roll_due
       and (s.conversation_id is null
            or ((s.job_claimed_by is null or s.job_claimed_at <= now() - c_lease)
                and (s.job_failures < c_max_failures
                     or exists (select 1 from workspace_messages n
                                 where n.conversation_id = q.cid and n.finished
                                   and n.created_at > coalesce(s.job_claimed_at, '-infinity')))))
     order by q.last_older, q.cid
     limit 1;

    if v_conv is not null then
      insert into workspace_conversation_state (conversation_id) values (v_conv) on conflict do nothing;
      update workspace_conversation_state s
         set job_claimed_by = 'rolling:' || p_runner, job_claimed_at = now()
       where s.conversation_id = v_conv
         and (s.job_claimed_by is null or s.job_claimed_at <= now() - c_lease)
      returning s.rolling_summary, s.summarised_through into v_prev, v_since;
      if found then
        select coalesce(jsonb_agg(jsonb_build_object('role', o.role, 'content', o.content,
                                                     'created_at', o.created_at)
                                  order by o.created_at, o.id), '[]'::jsonb),
               max(o.created_at)
          into v_msgs, v_through
          from (select m.id, m.role, m.content, m.created_at,
                       coalesce(sum(octet_length(m.content)) over (order by m.created_at desc, m.id desc
                                                                   rows between unbounded preceding and 1 preceding), 0) as bytes_newer,
                       row_number() over (order by m.created_at desc, m.id desc) as rn
                  from workspace_messages m
                 where m.conversation_id = v_conv and m.finished and m.content <> ''
                   and (v_since is null or m.created_at > v_since)) o
         where o.rn > 1 and o.bytes_newer > c_roll_keep;
        return jsonb_build_object('kind', 'rolling', 'conversation_id', v_conv, 'through', v_through,
                                  'previous_summary', v_prev, 'messages', v_msgs);
      end if;
    end if;
  end if;

  -- ---- memory: a conversation whose last finished answer is later than memory_since, quiet for 15
  --      minutes, not archived, not opted out, and not yet remembered up to that answer.
  if 'memory' = any (p_kinds) then
    select c.id into v_conv
      from workspace_conversations c
      join workspace_profile p on p.id = 1 and p.memory_since is not null
      left join workspace_conversation_state s on s.conversation_id = c.id
     cross join lateral (select max(m.created_at) as last_answer
                           from workspace_messages m
                          where m.conversation_id = c.id and m.role = 'assistant'
                            and m.finished and m.error_code is null and m.content <> '') la
     where not c.archived
       and not coalesce(s.memory_opt_out, false)
       and la.last_answer is not null
       and la.last_answer > p.memory_since
       and la.last_answer <= now() - c_quiet
       and (s.memory_written_at is null or la.last_answer > s.memory_written_at)
       and (s.conversation_id is null
            or ((s.job_claimed_by is null or s.job_claimed_at <= now() - c_lease)
                and (s.job_failures < c_max_failures
                     or exists (select 1 from workspace_messages n
                                 where n.conversation_id = c.id and n.finished
                                   and n.created_at > coalesce(s.job_claimed_at, '-infinity')))))
     order by la.last_answer, c.id
     limit 1;

    if v_conv is not null then
      insert into workspace_conversation_state (conversation_id) values (v_conv) on conflict do nothing;
      update workspace_conversation_state s
         set job_claimed_by = 'memory:' || p_runner, job_claimed_at = now()
       where s.conversation_id = v_conv
         and (s.job_claimed_by is null or s.job_claimed_at <= now() - c_lease);
      if found then
        -- The conversation's finished messages, the newest 60,000 bytes at most (the newest is always
        -- kept), oldest first.
        select coalesce(jsonb_agg(jsonb_build_object('role', o.role, 'content', o.content,
                                                     'created_at', o.created_at)
                                  order by o.created_at, o.id), '[]'::jsonb),
               max(o.created_at)
          into v_msgs, v_through
          from (select m.id, m.role, m.content, m.created_at,
                       row_number() over (order by m.created_at desc, m.id desc) as rn,
                       sum(octet_length(m.content)) over (order by m.created_at desc, m.id desc) as cum_incl
                  from workspace_messages m
                 where m.conversation_id = v_conv and m.finished and m.content <> '') o
         where o.rn = 1 or o.cum_incl <= c_memory_bytes;
        return jsonb_build_object('kind', 'memory', 'conversation_id', v_conv, 'through', v_through,
                                  'previous_summary', null, 'messages', v_msgs);
      end if;
    end if;
  end if;

  return null;
end $$;

comment on function public.workspace_job_claim(text, text[]) is
  'Hands the idle runner at most one background job (196; rolling rule 199), with a 5-minute '
  'lease whose holder records the kind (''rolling:<runner>'' or ''memory:<runner>''); null when '
  'there is none, and null while any request is queued or claimed. rolling: a message is old '
  'when the messages newer than it already pass 14000 bytes; the newest finished message of a '
  'conversation is never old and through never reaches it; the old messages newer than '
  'summarised_through are the job when they pass 12000 bytes. memory: as 196. The first call '
  'that asks for memory stamps memory_since, once. Three failures park a conversation''s jobs '
  'until newer messages arrive. Returns {kind, conversation_id, through, previous_summary, '
  'messages}. workspace_runner only.';

-- =============================================================================================
-- 3. workspace_job_finish
-- =============================================================================================
create or replace function public.workspace_job_finish(
    p_runner text, p_conversation_id uuid, p_kind text, p_outcome text, p_summary text,
    p_through timestamptz)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_held     boolean;
  v_opt_out  boolean;
  v_old      text;
  v_doc      bigint;
  v_unit_text text;
  v_title    text;
  v_stored   boolean := false;
  v_doc_out  bigint;
  v_summary  text := btrim(coalesce(p_summary, ''));
  v_limit    integer;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_job_finish: p_runner is required' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('rolling', 'memory') then
    raise exception 'workspace_job_finish: p_kind is rolling or memory, not %', coalesce(p_kind, 'null')
      using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('done', 'failed', 'released') then
    raise exception 'workspace_job_finish: p_outcome is done, failed or released, not %', coalesce(p_outcome, 'null')
      using errcode = '22023';
  end if;

  select (s.job_claimed_by = p_kind || ':' || p_runner and s.job_claimed_at > now() - interval '5 minutes'),
         s.memory_opt_out, s.rolling_summary
    into v_held, v_opt_out, v_old
    from workspace_conversation_state s
   where s.conversation_id = p_conversation_id
     for update;
  if not found or v_held is not true then
    raise exception 'workspace_job_finish: the % job on conversation % is not held by % or its lease has run out', p_kind,
      p_conversation_id, p_runner using errcode = '22023';
  end if;

  if p_outcome = 'failed' then
    update workspace_conversation_state s
       set job_failures = s.job_failures + 1, job_claimed_by = null
     where s.conversation_id = p_conversation_id;
    return jsonb_build_object('stored', false, 'document_id', null);
  elsif p_outcome = 'released' then
    update workspace_conversation_state s set job_claimed_by = null where s.conversation_id = p_conversation_id;
    return jsonb_build_object('stored', false, 'document_id', null);
  end if;

  -- done
  if v_summary = '' then
    raise exception 'workspace_job_finish: a done job needs its summary' using errcode = '22023';
  end if;
  if p_through is null then
    raise exception 'workspace_job_finish: a done job needs p_through' using errcode = '22023';
  end if;
  v_limit := case p_kind when 'rolling' then 3000 else 1000 end;
  if char_length(v_summary) > v_limit then
    raise exception 'workspace_job_finish: a % summary is at most % characters, not %', p_kind,
      v_limit, char_length(v_summary) using errcode = '22023';
  end if;

  if p_kind = 'rolling' then
    v_stored := v_old is distinct from v_summary;
    update workspace_conversation_state s
       set rolling_summary = v_summary,
           summarised_through = greatest(coalesce(s.summarised_through, p_through), p_through),
           job_failures = 0, job_claimed_by = null
     where s.conversation_id = p_conversation_id;
    return jsonb_build_object('stored', v_stored, 'document_id', null);
  end if;

  -- memory: an upsert on the conversation. An opted-out conversation writes nothing.
  if v_opt_out then
    update workspace_conversation_state s set job_claimed_by = null where s.conversation_id = p_conversation_id;
    return jsonb_build_object('stored', false, 'document_id', null);
  end if;

  select left(c.title, 200) into v_title from workspace_conversations c where c.id = p_conversation_id;
  select d.id into v_doc
    from workspace_documents d
   where d.kind = 'memory' and d.conversation_id = p_conversation_id
     for update;
  if not found then
    insert into workspace_documents (kind, title, conversation_id, state)
    values ('memory', coalesce(v_title, 'Remembered conversation'), p_conversation_id, 'text_ready')
    returning id into v_doc;
    insert into workspace_document_text (document_id, unit_kind, unit_no, text)
    values (v_doc, 'doc', 1, v_summary);
    v_stored := true;
  else
    select t.text into v_unit_text
      from workspace_document_text t
     where t.document_id = v_doc and t.unit_kind = 'doc' and t.unit_no = 1;
    if found and v_unit_text = v_summary then
      -- The same summary: nothing is written and no state moves.
      v_stored := false;
    else
      -- A new summary: the old unit and its vectors go, a new unit comes (so a late embed of the old
      -- text finds no unit), and the document goes back to the state the ingest claim takes, with no
      -- try used, whatever state it was in.
      delete from workspace_text_embeddings e
       using workspace_document_text t
       where t.document_id = v_doc and e.text_id = t.id;
      delete from workspace_document_text t where t.document_id = v_doc;
      insert into workspace_document_text (document_id, unit_kind, unit_no, text)
      values (v_doc, 'doc', 1, v_summary);
      update workspace_documents d
         set state = 'text_ready', attempts = 0, error_code = null, claimed_by = null, claimed_at = null,
             title = coalesce(v_title, d.title)
       where d.id = v_doc;
      v_stored := true;
    end if;
  end if;

  update workspace_conversation_state s
     set memory_written_at = greatest(coalesce(s.memory_written_at, p_through), p_through),
         job_failures = 0, job_claimed_by = null
   where s.conversation_id = p_conversation_id;
  return jsonb_build_object('stored', v_stored, 'document_id', v_doc);
end $$;

comment on function public.workspace_job_finish(text, uuid, text, text, text, timestamptz) is
  'Ends a background job (196; 199 checks the job). Refuses (22023) unless p_runner holds the '
  'lease on the conversation for p_kind and the lease is under 5 minutes old. p_outcome done: '
  'p_summary is required (3000 characters at most for rolling, 1000 for memory) and p_through; '
  'rolling stores the summary and moves summarised_through forward; memory is an upsert on the '
  'conversation (the same summary writes nothing; a new one replaces the unit, removes its '
  'vectors and puts the document back in text_ready with attempts 0). An opted-out conversation '
  'writes nothing. failed: job_failures + 1. released: no failure counted. Every outcome frees '
  'the lease. Returns {stored, document_id}. workspace_runner only.';

-- =============================================================================================
-- 4. workspace_turn_put
-- =============================================================================================
create or replace function public.workspace_turn_put(
    p_request_id bigint, p_runner text, p_facts jsonb, p_sources jsonb)
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_max_sources constant integer := 40;
  v_state    text;
  v_by       text;
  v_conv     uuid;
  v_inserted boolean;
  v_ret_state text;
  v_found_n  integer;
  v_next     integer;
  v_kept     integer := 0;
  v_el       jsonb;
  v_kind     text;
  v_origin   text;
  v_file     bigint;
  v_text     bigint;
  v_doc      bigint;
  v_doc_text bigint;
  v_course   text;
  v_ukind    text;
  v_uno      integer;
  v_title    text;
  v_sim      double precision;
  v_dkind    text;
  v_att      jsonb;
begin
  select r.state, r.claimed_by, r.conversation_id into v_state, v_by, v_conv
    from workspace_requests r where r.id = p_request_id;
  if not found or v_state <> 'claimed' or v_by is distinct from p_runner then
    raise exception 'workspace_turn_put: request % is not claimed by %', p_request_id,
      coalesce(p_runner, 'null') using errcode = '22023';
  end if;
  if p_facts is not null and jsonb_typeof(p_facts) <> 'object' then
    raise exception 'workspace_turn_put: p_facts must be a json object or null' using errcode = '22023';
  end if;
  if p_sources is not null and jsonb_typeof(p_sources) <> 'array' then
    raise exception 'workspace_turn_put: p_sources must be a json array or null' using errcode = '22023';
  end if;

  if p_facts is not null then
    -- The facts: a first call writes the row and sends the event `sources`; a second call replaces
    -- the facts and sends no second event.
    -- 199: an attachment is cut to exactly {kind, id, state}; one that does not fit is dropped; five at most.
    select coalesce(jsonb_agg(jsonb_build_object('kind', x.a->>'kind', 'id', x.a->'id', 'state', x.a->>'state')
                              order by x.ord), '[]'::jsonb)
      into v_att
      from (select e.value as a, e.ord
              from jsonb_array_elements(case when jsonb_typeof(p_facts->'attachments') = 'array'
                                             then p_facts->'attachments' else '[]'::jsonb end)
                   with ordinality as e(value, ord)
             where jsonb_typeof(e.value) = 'object'
               and (e.value->>'kind') in ('file', 'upload')
               and coalesce(jsonb_typeof(e.value->'id'), 'null') in ('number', 'null')
               and (e.value->>'state') in ('read', 'cut', 'not_ready', 'failed', 'missing', 'no_text')
             order by e.ord
             limit 5) x;
    begin
      insert into workspace_turns as t
             (request_id, depth, tier, plan_state, retrieval_state, found_n, passages_n, memory_n,
              feed_rows, attachments, prompt_bytes, plan_ms, retrieval_ms, plan_cost_usd)
      values (p_request_id,
              p_facts->>'depth', p_facts->>'tier', p_facts->>'plan_state', p_facts->>'retrieval_state',
              coalesce((p_facts->>'found_n')::integer, 0), coalesce((p_facts->>'passages_n')::integer, 0),
              coalesce((p_facts->>'memory_n')::integer, 0), coalesce((p_facts->>'feed_rows')::integer, 0),
              v_att,
              (p_facts->>'prompt_bytes')::integer, (p_facts->>'plan_ms')::integer,
              (p_facts->>'retrieval_ms')::integer, (p_facts->>'plan_cost_usd')::numeric)
      on conflict (request_id) do update
         set depth = excluded.depth, tier = excluded.tier, plan_state = excluded.plan_state,
             retrieval_state = excluded.retrieval_state, found_n = excluded.found_n,
             passages_n = excluded.passages_n, memory_n = excluded.memory_n,
             feed_rows = excluded.feed_rows, attachments = excluded.attachments,
             prompt_bytes = excluded.prompt_bytes, plan_ms = excluded.plan_ms,
             retrieval_ms = excluded.retrieval_ms, plan_cost_usd = excluded.plan_cost_usd
      returning (t.xmax = 0), t.retrieval_state, t.found_n
        into v_inserted, v_ret_state, v_found_n;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'workspace_turn_put: a number in p_facts is not a number' using errcode = '22023';
    end;

    -- The sources of this call replace whatever was there.
    delete from workspace_sources s where s.request_id = p_request_id;
    v_next := 1;

    if v_inserted then
      perform realtime.send(
        jsonb_build_object('request_id', p_request_id, 'state', v_ret_state, 'found_n', v_found_n),
        'sources', 'workspace:' || v_conv::text, true);
    end if;
  else
    -- No facts: append after the rows that are there (the model''s own tool sources).
    select coalesce(max(s.ord), 0) + 1 into v_next from workspace_sources s where s.request_id = p_request_id;
  end if;

  for v_el in select e.value from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) with ordinality as e(value, ord)
               order by e.ord
  loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'workspace_turn_put: each source is a json object' using errcode = '22023';
    end if;
    v_kind   := v_el->>'kind';
    v_origin := v_el->>'origin';
    if v_kind is null or v_kind not in ('material', 'upload', 'memory', 'feed')
       or v_origin is null or v_origin not in ('auto', 'attached', 'tool') then
      raise exception 'workspace_turn_put: a source needs a kind of material, upload, memory or feed and an origin of auto, attached or tool'
        using errcode = '22023';
    end if;
    -- A row past the 40th is cut, never refused (the shape above is checked for every row).
    exit when v_next > c_max_sources;

    v_file := null; v_text := null; v_doc := null; v_doc_text := null;
    v_course := null; v_ukind := null; v_uno := null; v_title := null;
    begin
      v_file     := case when jsonb_typeof(v_el->'file_id') = 'number' then (v_el->>'file_id')::bigint end;
      v_text     := case when jsonb_typeof(v_el->'text_id') = 'number' then (v_el->>'text_id')::bigint end;
      v_doc      := case when jsonb_typeof(v_el->'document_id') = 'number' then (v_el->>'document_id')::bigint end;
      v_doc_text := case when jsonb_typeof(v_el->'doc_text_id') = 'number' then (v_el->>'doc_text_id')::bigint end;
      v_sim      := case when jsonb_typeof(v_el->'similarity') = 'number'
                         then greatest(-1, least(1, (v_el->>'similarity')::double precision)) end;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'workspace_turn_put: an id in p_sources is not a whole number' using errcode = '22023';
    end;
    v_course := nullif(v_el->>'course_id', '');
    v_ukind  := case when jsonb_typeof(v_el->'unit_kind') = 'string' then left(v_el->>'unit_kind', 40) end;
    v_uno    := case when jsonb_typeof(v_el->'unit_no') = 'number' and (v_el->>'unit_no') ~ '^[0-9]{1,9}$'
                     then (v_el->>'unit_no')::integer end;
    v_title  := left(nullif(v_el->>'title', ''), 300);

    if v_kind = 'material' then
      if v_text is not null then
        -- A unit: the database fills the file, the course, the unit and the title from the unit's row.
        select t.file_id, f.course_id, t.unit_kind, t.unit_no, f.file_name
          into v_file, v_course, v_ukind, v_uno, v_title
          from bb_file_text t join bb_files f on f.id = t.file_id
         where t.id = v_text;
        if not found then continue; end if;
      elsif v_file is not null then
        -- An attached file read whole or in part: no unit.
        select f.course_id, f.file_name into v_course, v_title from bb_files f where f.id = v_file;
        if not found then continue; end if;
        v_ukind := null; v_uno := null;
      else
        continue;
      end if;
      v_doc := null; v_doc_text := null;
    elsif v_kind in ('upload', 'memory') then
      if v_doc_text is not null then
        select t.document_id, t.unit_kind, t.unit_no, d.course_id, d.title, d.kind
          into v_doc, v_ukind, v_uno, v_course, v_title, v_dkind
          from workspace_document_text t join workspace_documents d on d.id = t.document_id
         where t.id = v_doc_text;
        if not found or v_dkind <> v_kind then continue; end if;
      elsif v_doc is not null then
        select d.course_id, d.title, d.kind into v_course, v_title, v_dkind
          from workspace_documents d where d.id = v_doc;
        if not found or v_dkind <> v_kind then continue; end if;
        v_ukind := null; v_uno := null;
      else
        continue;
      end if;
      v_file := null; v_text := null;
    else
      -- feed: one row whenever the feed block is in the prompt; no ids.
      v_file := null; v_text := null; v_doc := null; v_doc_text := null;
      v_course := null; v_ukind := null; v_uno := null; v_sim := null;
      v_title := 'Planner and grades';
    end if;

    -- 199: the title is the database's own (a file's name, an upload's or a remembered item's title,
    -- or the feed's fixed title), never the caller's, cut to 200 characters.
    v_title := left(v_title, 200);
    insert into workspace_sources (request_id, ord, kind, origin, file_id, text_id, document_id, doc_text_id,
                                   course_id, unit_kind, unit_no, similarity, title)
    values (p_request_id, v_next, v_kind, v_origin, v_file, v_text, v_doc, v_doc_text,
            v_course, v_ukind, v_uno, v_sim, v_title);
    v_next := v_next + 1;
    v_kept := v_kept + 1;
  end loop;
  return v_kept;
end $$;

comment on function public.workspace_turn_put(bigint, text, jsonb, jsonb) is
  'Writes a turn''s trace (196; 199 narrows what is stored). p_facts not null: writes the '
  'workspace_turns row (attachments cut to [{kind, id, state}], five at most, kind file or '
  'upload, state read, cut, not_ready, failed, missing or no_text), replaces the request''s '
  'sources with p_sources and sends the event sources on the first write. p_facts null: appends '
  'p_sources after the rows there. A row whose id is not found is dropped; a row past the 40th '
  'is cut; a source''s title is the database''s own (the feed''s is ''Planner and grades''), at most '
  '200 characters. Returns the rows kept. Refuses (22023) unless the request is claimed by '
  'p_runner. workspace_runner only.';

-- =============================================================================================
-- 2. workspace_ingest_claim and workspace_ingest_finish
-- =============================================================================================
create or replace function public.workspace_ingest_claim(p_runner text)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_lease constant interval := interval '10 minutes';
  c_tries constant integer  := 3;
  v_id    bigint;
  v_state text;
  v_row   record;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_ingest_claim: p_runner is required' using errcode = '22023';
  end if;

  -- A runner works one document at a time: while it holds one inside its lease, nothing is handed over.
  if exists (select 1 from workspace_documents d
              where d.claimed_by = p_runner and d.claimed_at > now() - c_lease) then
    return null;
  end if;

  -- The sweep: a hold whose lease ran out died with its worker. It is a try; the third ends the row
  -- failed (and clears the link), the others free the row for the next claim.
  update workspace_documents d
     set attempts = d.attempts + 1,
         state = case when d.attempts + 1 >= c_tries then 'failed' else d.state end,
         error_code = case when d.attempts + 1 >= c_tries
                           then case when d.state = 'reading' then 'extract_failed' else 'embed_failed' end
                           else d.error_code end,
         signed_url = case when d.attempts + 1 >= c_tries then null else d.signed_url end,
         signed_url_expires_at = case when d.attempts + 1 >= c_tries then null else d.signed_url_expires_at end,
         claimed_by = null,
         claimed_at = null
   where d.claimed_by is not null
     and d.claimed_at <= now() - c_lease
     and d.state in ('reading', 'text_ready');

  -- The oldest row that can be worked on and that nobody holds.
  select d.id, d.state into v_id, v_state
    from workspace_documents d
   where d.claimed_by is null
     and d.state in ('stored', 'reading', 'text_ready')
     -- 199: after a failed try a document waits 60 seconds times its attempts (claimed_at keeps the try's time).
     and (d.attempts = 0 or d.claimed_at is null
          or d.claimed_at <= now() - d.attempts * interval '60 seconds')
   order by d.created_at, d.id
   limit 1
     for update skip locked;
  if not found then
    return null;
  end if;

  update workspace_documents d
     set claimed_by = p_runner,
         claimed_at = now(),
         state = case when d.state = 'stored' then 'reading' else d.state end
   where d.id = v_id
  returning d.id, d.kind, d.mime, d.byte_size, d.sha256, d.signed_url, d.signed_url_expires_at, d.attempts
    into v_row;

  return jsonb_build_object(
    'document_id',           v_row.id,
    'kind',                  v_row.kind,
    'step',                  case when v_state in ('stored', 'reading') then 'read' else 'embed' end,
    'mime',                  v_row.mime,
    'byte_size',             v_row.byte_size,
    'sha256',                v_row.sha256,
    'signed_url',            v_row.signed_url,
    'signed_url_expires_at', v_row.signed_url_expires_at,
    'attempts',              v_row.attempts);
end $$;

comment on function public.workspace_ingest_claim(text) is
  'The ingest worker''s poll (193; the wait 199): one document at a time, oldest first, for '
  'update skip locked, a 10-minute lease. A document that has had a failed try is not handed '
  'out until 60 seconds times its attempts have passed since that try (claimed_at). Returns '
  'null when p_runner already holds a document inside its lease or nothing waits. Otherwise '
  '{document_id, kind, step, mime, byte_size, sha256, signed_url, signed_url_expires_at, '
  'attempts}. A hold whose lease ran out is counted as a try; the third ends the row failed. '
  'workspace_ingest_runner only.';

create or replace function public.workspace_ingest_finish(
    p_runner text, p_document_id bigint, p_outcome text, p_error_code text)
  returns text
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_tries constant integer := 3;
  v_state    text;
  v_attempts integer;
  v_units    integer;
  v_unembedded integer;
  v_unvectored integer;
  v_new      text;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_ingest_finish: p_runner is required' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('indexed', 'failed', 'retry', 'release') then
    raise exception 'workspace_ingest_finish: outcome must be indexed, failed, retry or release, not %',
      coalesce(p_outcome, 'null') using errcode = '22023';
  end if;
  if p_outcome in ('failed', 'retry')
     and (p_error_code is null
          or p_error_code not in ('too_large', 'bad_type', 'bad_bytes', 'no_text', 'extract_timeout',
                                  'extract_failed', 'too_many_units', 'link_expired',
                                  'download_failed', 'embed_failed')) then
    raise exception 'workspace_ingest_finish: % needs one of the ten error codes, not %', p_outcome,
      coalesce(p_error_code, 'null') using errcode = '22023';
  end if;

  select d.state, d.attempts into v_state, v_attempts
    from workspace_documents d
   where d.id = p_document_id and d.claimed_by = p_runner
     for update;
  if not found then
    raise exception 'workspace_ingest_finish: document % is not held by %', p_document_id, p_runner
      using errcode = '22023';
  end if;
  if v_state not in ('reading', 'text_ready') then
    raise exception 'workspace_ingest_finish: document % is in state %, not reading or text_ready',
      p_document_id, v_state using errcode = '22023';
  end if;

  if p_outcome = 'indexed' then
    select count(*)::integer,
           (count(*) filter (where t.embedded_at is null))::integer,
           (count(*) filter (where not exists (select 1 from workspace_text_embeddings e where e.text_id = t.id)))::integer
      into v_units, v_unembedded, v_unvectored
      from workspace_document_text t
     where t.document_id = p_document_id;
    if v_units = 0 then
      raise exception 'workspace_ingest_finish: document % has no unit, so it cannot be indexed', p_document_id
        using errcode = '22023';
    end if;
    if v_unembedded > 0 or v_unvectored > 0 then
      raise exception 'workspace_ingest_finish: document % has % unit(s) without embedded_at and % without a vector',
        p_document_id, v_unembedded, v_unvectored using errcode = '22023';
    end if;
    v_new := 'indexed';
    update workspace_documents d
       set state = 'indexed', error_code = null, signed_url = null, signed_url_expires_at = null,
           claimed_by = null, claimed_at = null
     where d.id = p_document_id;

  elsif p_outcome = 'release' then
    -- 199: a try that made progress and ran out of time: the lease is freed, no try is counted, the
    -- document stays text_ready for the next claim.
    if v_state <> 'text_ready' then
      raise exception 'workspace_ingest_finish: only a document in text_ready can be released, not one in %', v_state
        using errcode = '22023';
    end if;
    v_new := 'text_ready';
    update workspace_documents d
       set claimed_by = null, claimed_at = null
     where d.id = p_document_id;

  elsif p_outcome = 'failed' or v_attempts + 1 >= c_tries then
    -- Failed outright, or the third try of a step that may be made again.
    v_new := 'failed';
    update workspace_documents d
       set state = 'failed', error_code = p_error_code, attempts = case when p_outcome = 'retry' then least(d.attempts + 1, 3) else d.attempts end,
           signed_url = null, signed_url_expires_at = null, claimed_by = null, claimed_at = null
     where d.id = p_document_id;

  else
    -- retry: back to the queue, one more try used. From reading it goes back to stored.
    v_new := case when v_state = 'reading' then 'stored' else v_state end;
    update workspace_documents d
       set state = v_new, attempts = d.attempts + 1, error_code = p_error_code,
           claimed_by = null, claimed_at = now()   -- 199: the time of this try, for the wait before the next
     where d.id = p_document_id;
  end if;
  return v_new;
end $$;

comment on function public.workspace_ingest_finish(text, bigint, text, text) is
  'Ends the worker''s hold on a document (193; release 199). indexed: refused (22023) unless the '
  'document has at least one unit, each with embedded_at and a stored vector. failed: the row '
  'ends failed with p_error_code. retry: attempts goes up by one, the row goes back to stored '
  '(from reading) or stays text_ready, claimed_at keeps the time of the try, and on the third '
  'it ends failed. release: only for a document in text_ready; the lease is freed, attempts '
  'unchanged, for a try that made progress and ran out of time. Every outcome frees the lease; '
  'indexed and a failed end clear signed_url. Returns the state after the call. '
  'workspace_ingest_runner only.';

-- =============================================================================================
-- 5. v_workspace_store_proof: task 49's proofs 1, 2, 3 and 7 as one row of plain columns
-- =============================================================================================
-- The acceptance run reads the store's proofs on the host through a reader that refuses any statement
-- naming a pg_* relation or a schema other than public, so it could only carry reduced forms. This view
-- (read-only, security invoker, no text of his and no row of a store table) hands the catalog's answers
-- out as columns, computed with the catalog expressions of phase24_store_proof.sql. Types are compared
-- by oid and the text is built from nspname, relname and attname, so a search_path that does or does not
-- carry 'extensions' changes nothing.
create view public.v_workspace_store_proof
  with (security_invoker = true) as
select e.extension_version,
       e.extension_schema,
       coalesce(e.extension_schema = 'extensions', false) as extension_ok,
       c.vector_columns,
       c.vector_columns = 'public.bb_text_embeddings.embedding:384:t, public.workspace_text_embeddings.embedding:384:t'
         as vector_columns_ok,
       i.vector_indexes,
       i.vector_indexes = 'public.bb_text_embeddings.bb_text_embeddings_hnsw:hnsw:vector_cosine_ops:t, '
                          'public.workspace_text_embeddings.workspace_text_embeddings_hnsw:hnsw:vector_cosine_ops:t'
         as vector_indexes_ok,
       l.foreign_servers,
       l.foreign_tables,
       l.link_extensions,
       l.store_functions_that_call_out,
       (l.foreign_servers = 0 and l.foreign_tables = 0 and l.link_extensions = 0
        and l.store_functions_that_call_out = 0) as no_links_ok
  from (select (select x.extversion::text from pg_extension x where x.extname = 'vector') as extension_version,
               (select n.nspname::text from pg_extension x join pg_namespace n on n.oid = x.extnamespace
                 where x.extname = 'vector') as extension_schema) e
 cross join (select coalesce(string_agg(n.nspname || '.' || r.relname || '.' || a.attname || ':' || a.atttypmod
                                        || ':' || case when a.attnotnull then 't' else 'f' end, ', '
                                        order by n.nspname collate "C", r.relname collate "C", a.attname collate "C"),
                             '') as vector_columns
               from pg_attribute a
               join pg_class r on r.oid = a.attrelid
               join pg_namespace n on n.oid = r.relnamespace
              where a.atttypid = 'extensions.vector'::regtype
                and a.attnum > 0 and not a.attisdropped
                and r.relkind in ('r', 'p', 'v', 'm')) c
 cross join (select coalesce(string_agg(n.nspname || '.' || t.relname || '.' || ic.relname || ':' || am.amname
                                        || ':' || oc.opcname || ':' || case when ix.indisvalid then 't' else 'f' end, ', '
                                        order by n.nspname collate "C", t.relname collate "C", ic.relname collate "C"),
                             '') as vector_indexes
               from pg_index ix
               join pg_class ic on ic.oid = ix.indexrelid
               join pg_class t on t.oid = ix.indrelid
               join pg_namespace n on n.oid = t.relnamespace
               join pg_am am on am.oid = ic.relam
               join pg_opclass oc on oc.oid = ix.indclass[0]
              where am.amname in ('hnsw', 'ivfflat')) i
 cross join (select (select count(*) from pg_foreign_server)::integer as foreign_servers,
                    (select count(*) from pg_foreign_table)::integer as foreign_tables,
                    (select count(*) from pg_extension
                      where extname in ('dblink', 'postgres_fdw', 'wrappers', 'http'))::integer as link_extensions,
                    (select count(*) from pg_proc p
                      where p.pronamespace = 'public'::regnamespace
                        and p.prosrc ~ '(bb_file_text|bb_text_embeddings|workspace_documents|workspace_document_text|workspace_text_embeddings)'
                        and p.prosrc ~* '(dblink|postgres_fdw|net\.http_|http_post|http_get|extensions\.http)'
                    )::integer as store_functions_that_call_out) l;

comment on view public.v_workspace_store_proof is
  'One row (migration 199): the catalog answers of the store proofs 1, 2, 3 and 7 as plain columns, for '
  'the acceptance run, which cannot read pg_* relations. extension_version, extension_schema, '
  'extension_ok; vector_columns and vector_columns_ok (exactly the two vector(384) not null columns); '
  'vector_indexes and vector_indexes_ok (exactly the two valid HNSW cosine indexes); foreign_servers, '
  'foreign_tables, link_extensions, store_functions_that_call_out and no_links_ok. No text of his and no '
  'row of a store table. security_invoker with anon revoked, as 036 requires.';

revoke all on public.v_workspace_store_proof from public, anon, authenticated;
grant select on public.v_workspace_store_proof to service_role;

revoke all on function
  public.workspace_job_claim(text, text[]),
  public.workspace_job_finish(text, uuid, text, text, text, timestamptz),
  public.workspace_turn_put(bigint, text, jsonb, jsonb),
  public.workspace_ingest_claim(text),
  public.workspace_ingest_finish(text, bigint, text, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.workspace_job_claim(text, text[]),
  public.workspace_job_finish(text, uuid, text, text, text, timestamptz),
  public.workspace_turn_put(bigint, text, jsonb, jsonb)
to workspace_runner;

grant execute on function
  public.workspace_ingest_claim(text),
  public.workspace_ingest_finish(text, bigint, text, text)
to workspace_ingest_runner;

do $$
declare
  v_bad text;
  v_n   integer;
begin
  -- (a) The five are SECURITY DEFINER with a pinned path, executable by their one role alone
  --     (the test login included: its unit switches role).
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p
   where p.oid in ('public.workspace_job_claim(text, text[])'::regprocedure,
                   'public.workspace_job_finish(text, uuid, text, text, text, timestamptz)'::regprocedure,
                   'public.workspace_turn_put(bigint, text, jsonb, jsonb)'::regprocedure,
                   'public.workspace_ingest_claim(text)'::regprocedure,
                   'public.workspace_ingest_finish(text, bigint, text, text)'::regprocedure)
     and (not p.prosecdef
          or not coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']
          or has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute')
          or has_function_privilege('public', p.oid, 'execute')
          or has_function_privilege('db_test_runner', p.oid, 'execute')
          or not has_function_privilege(case when p.proname like 'workspace\_ingest\_%'
                                             then 'workspace_ingest_runner' else 'workspace_runner' end,
                                        p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'FAIL 199: grants or definer settings are not as stated: %', v_bad;
  end if;

  -- (b) The two roles still execute exactly eleven and four SECURITY DEFINER functions.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_n <> 11 then
    raise exception 'FAIL 199: workspace_runner executes % SECURITY DEFINER functions, expected 11', v_n;
  end if;
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_ingest_runner', p.oid, 'execute');
  if v_n <> 4 then
    raise exception 'FAIL 199: workspace_ingest_runner executes % SECURITY DEFINER functions, expected 4', v_n;
  end if;

  -- (b2) The proof view returns one row and its four checks are true.
  if (select count(*) from public.v_workspace_store_proof) <> 1
     or not (select p.extension_ok and p.vector_columns_ok and p.vector_indexes_ok and p.no_links_ok
               from public.v_workspace_store_proof p) then
    raise exception 'FAIL 199: v_workspace_store_proof is not one row with its four checks true';
  end if;

  -- (c) The new bodies are the ones in place.
  if position('o.rn > 1 and o.bytes_newer' in pg_get_functiondef('public.workspace_job_claim(text, text[])'::regprocedure)) = 0
     or position('p_kind || '':'' || p_runner' in pg_get_functiondef('public.workspace_job_finish(text, uuid, text, text, text, timestamptz)'::regprocedure)) = 0
     or position('''release''' in pg_get_functiondef('public.workspace_ingest_finish(text, bigint, text, text)'::regprocedure)) = 0
     or position('Planner and grades' in pg_get_functiondef('public.workspace_turn_put(bigint, text, jsonb, jsonb)'::regprocedure)) = 0
     or position('60 seconds' in pg_get_functiondef('public.workspace_ingest_claim(text)'::regprocedure)) = 0 then
    raise exception 'FAIL 199: a function body is not the 199 one';
  end if;
end $$;
