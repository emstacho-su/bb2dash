-- bb2dash :: db/migrations/185_inbox_apply_session_links.sql
-- Phase 23 (Inbox auto-apply), the gap the first live run showed (2026-10-07; STATUS "Phase 23").
-- 181 stays byte-frozen; this re-creates two of its functions, as 184 did for one, and adds two reads.
--
-- WHY. Three of Stack's sixteen answers were left in "Answered, not applied": 3435, 3436, 3437, each
-- a session answer (`session_link/<file id>`, "which class is this file for?"). Such an answer is
-- not the apply worker's to write: `link_file_sessions` applies it at the fold, from an archived row
-- too (123, 163). But 181 gave the role no read on `bb_files`, so neither the worker nor Claude could
-- see that files 2489 and 2490 already carried his picks, and the writer left the three where they
-- were. The same blindness had it flag item 3453 for a code change that was already done.
-- And the notice that told Stack so did not last: request 1859 closed failed and raised
-- `inbox-apply-failed`; the follow-up 2414 closed done and archived it, with the three still waiting.
--
-- WHAT
--   1. Two reads for inbox_apply_runner, each with its own policy: `bb_files` (the columns that
--      describe a file: what it is, where it is filed, whether its bytes are stored; never its
--      Blackboard link, its path on the host or its hash) and `sessions`. No write on either.
--   2. inbox_apply_prepare(): each queue row gains `session_link`. For a session answer it is
--      {file_id, pick, file_found, file_current, file_session_id}: the file the ref names, the
--      session Stack picked (null for "none"), and what the file carries now. For any other row it
--      is null. The worker records the answer itself when the file agrees with it (apply/src/batch.ts).
--   3. inbox_apply_close(): a done close archives `inbox-apply-failed` only when no answered row is
--      left waiting, and `apply-login-required` then or when the run it closes started Claude (a
--      run that started and finished proves the sign-in). Until then the notice stays in the Inbox.
--   4. a guard block
--
-- Additive in effect: no drop, no rename; two grants and two policies added, two function bodies
-- replaced, every key 181's prepare sent still sent.

-- =============================================================================================
-- 1. Reads
-- =============================================================================================
grant select (id, course_id, path, file_name, mime_type, bytes, captured_at, bucket, week_no,
              session_id, assignment_id, reading_id, classified_by, classification_confidence,
              storage_path, downloaded_at, bb_modified_at, text_status, notes, superseded_by,
              link_confidence)
  on public.bb_files to inbox_apply_runner;

grant select on public.sessions to inbox_apply_runner;

do $$
declare t text;
begin
  -- The owner's policy on each table is `to authenticated`, so this role sees no row without its own.
  foreach t in array array['bb_files', 'sessions'] loop
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t and policyname = t || '_inbox_apply_read') then
      execute format('create policy %I on public.%I for select to inbox_apply_runner using (true)',
                     t || '_inbox_apply_read', t);
    end if;
  end loop;
end $$;

-- =============================================================================================
-- 2. The queue, with each session answer's file
-- =============================================================================================
create or replace function public.inbox_apply_prepare(p_request bigint)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_params jsonb;
begin
  if not inbox_apply_is_own_claim(p_request) then
    raise exception 'inbox_apply_prepare: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;

  -- 042's writer first, always (the skill's step 2): an answer given between folds is still
  -- applied_at null, and archiving it would take it out of 042's scan for good.
  perform apply_resolutions();

  select a.params into v_params from agent_requests a where a.id = p_request;

  return jsonb_build_object(
    'params', coalesce(v_params, '{}'::jsonb),
    'queue', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id, 'kind', q.kind, 'course_id', q.course_id, 'entity', q.entity, 'ref', q.ref,
               'field', q.field, 'question', q.question, 'state', q.state, 'accept', q.accept,
               'has_note', q.has_note, 'was_applied', q.was_applied, 'applied_at', q.applied_at,
               'resolved_at', q.resolved_at,
               -- 185: the question link_file_sessions raises (123), and nothing that only looks like it.
               'session_link', (
                 select jsonb_build_object(
                          'file_id', sl.file_id,
                          'pick', case when q.resolution->>'session_id' ~ '^[0-9]{1,18}$'
                                       then (q.resolution->>'session_id')::bigint end,
                          'file_found', f.id is not null,
                          'file_current', f.id is not null and f.superseded_by is null,
                          'file_session_id', f.session_id)
                   from (select substring(q.ref from '^session_link/([0-9]{1,18})$')::bigint as file_id) sl
                   left join bb_files f on f.id = sl.file_id
                  where q.kind = 'stack_must_confirm' and q.entity = 'bb_file' and q.field = 'session_id'
                    and sl.file_id is not null))
               order by q.course_id nulls last, q.resolved_at, q.id), '[]'::jsonb)
        from v_inbox_queue q),
    'runs_today', (
      select count(*) from agent_requests a
       where a.kind = 'inbox_feedback' and a.id <> p_request
         and a.claimed_by = 'inbox-apply-runner'
         and a.result->'claude'->>'started' = 'true'
         and (a.claimed_at at time zone 'America/New_York')::date
             = (now() at time zone 'America/New_York')::date));
end $$;

comment on function public.inbox_apply_prepare(bigint) is
  'Step 2 of /inbox-apply for the apply worker (181, 185): runs apply_resolutions(), then returns '
  '{params, queue, runs_today}: the request''s params, every v_inbox_queue row in the skill''s order, and '
  'how many of the worker''s requests started Claude on this New York day (the worker''s daily cap). '
  'Since 185 each row carries session_link: for a session answer (session_link/<file id>) the file, '
  'Stack''s pick and the session the file carries now; null for any other row. '
  'Refuses a request that is not the worker''s own claim. inbox_apply_runner only.';

-- =============================================================================================
-- 3. The close, with notices that last as long as what they say
-- =============================================================================================
create or replace function public.inbox_apply_close(p_request bigint, p_state text, p_result jsonb)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- 180's lock: every function that files an inbox_feedback request takes it.
  c_lock_key constant bigint := 1400910002;
  v_skip     bigint[] := '{}';
  v_archived integer := 0;
  v_follow   bigint;
  v_waiting  boolean;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or jsonb_typeof(p_result->'lines') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_result->'lines') l where jsonb_typeof(l) <> 'string') then
    raise exception 'inbox_apply_close: the result must be an object whose lines is an array of text'
      using errcode = '22023';
  end if;
  if p_state is null or p_state not in ('done', 'failed') then
    raise exception 'inbox_apply_close: state must be done or failed, not %', coalesce(p_state, 'null')
      using errcode = '22023';
  end if;
  if p_result ? 'skip' then
    if jsonb_typeof(p_result->'skip') <> 'array'
       or exists (select 1 from jsonb_array_elements(p_result->'skip') s where jsonb_typeof(s) <> 'number') then
      raise exception 'inbox_apply_close: skip must be an array of item ids' using errcode = '22023';
    end if;
    select coalesce(array_agg((s #>> '{}')::bigint), '{}') into v_skip
      from jsonb_array_elements(p_result->'skip') s;
  end if;
  if jsonb_typeof(p_result->'archived') = 'number' then
    v_archived := (p_result->>'archived')::numeric::integer;
  end if;

  perform 1 from agent_requests a
    where a.id = p_request and a.kind = 'inbox_feedback' and a.state = 'claimed'
      and a.claimed_by = 'inbox-apply-runner'
    for update;
  if not found then
    raise exception 'inbox_apply_close: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;

  update agent_requests a
     set state = p_state, finished_at = now(), result = p_result
   where a.id = p_request;

  if p_state = 'failed' then
    perform raise_attention(
      null, 'stack_must_confirm', null, 'agent_request',
      case when p_result->>'error' = 'sign_in_expired' then 'apply-login-required' else 'inbox-apply-failed' end,
      null, null, null,
      case when p_result->>'error' = 'sign_in_expired'
           then format('The apply worker''s Claude sign-in has expired, so Inbox apply request %s did not run. Renew the token (claude setup-token), then press Apply answers.', p_request)
           else format('Inbox apply request %s failed: %s. Answers it had already applied stay applied; press Apply answers to run the rest.',
                       p_request, left(coalesce(p_result->>'error', 'no error recorded'), 200))
      end,
      null);
  else
    -- A done run closes the two items a failed one raises (114's closed_itself record shape), each
    -- only once what it says is no longer true (185). "The apply run failed" is over when no
    -- answered row is left waiting: a later run that merely finished, with the same answers still
    -- unapplied, is not that. "Sign in again" is over then too, or as soon as a run that started
    -- Claude has finished.
    v_waiting := exists (select 1 from v_inbox_queue);
    update attention_items i
       set state = 'archived', archived_at = now(), archived_by = 'inbox-apply-runner',
           decision = jsonb_build_object('closed_itself', true, 'rule', 'a later apply run finished',
                                         'sync_run_id', null, 'trigger', 'inbox_apply_close')
     where i.kind = 'stack_must_confirm' and i.course_id is null and i.state = 'open'
       and (   (i.ref = 'inbox-apply-failed' and not v_waiting)
            or (i.ref = 'apply-login-required'
                and (not v_waiting or p_result->'claude'->>'started' = 'true')));
  end if;

  -- The rest of the queue: one follow-up, only after a run that archived something (so a batch
  -- that gets nowhere never loops), and never for rows this run could not apply (skip).
  if v_archived > 0 and exists (select 1 from v_inbox_queue q where not (q.id = any (v_skip))) then
    perform pg_advisory_xact_lock(c_lock_key);
    if not exists (select 1 from agent_requests a
                    where a.kind = 'inbox_feedback' and a.state in ('queued', 'claimed')) then
      insert into agent_requests (kind, scope, state, params, note)
      values ('inbox_feedback', 'all', 'queued',
              jsonb_build_object('trigger', 'followup', 'after', p_request, 'skip', to_jsonb(v_skip)),
              format('queued by the apply worker after request %s', p_request))
      returning id into v_follow;
    end if;
  end if;
  return v_follow;
end $$;

comment on function public.inbox_apply_close(bigint, text, jsonb) is
  'Closes an inbox_feedback request for the apply worker (181, 185): its own claimed -> done or failed, '
  'with finished_at and result (an object whose lines is an array of text). A failed close raises one '
  'inbox-apply-failed item (apply-login-required for error sign_in_expired). A done close archives '
  'inbox-apply-failed only when v_inbox_queue is empty, and apply-login-required then or when '
  'result.claude.started is true (185). When the run archived something (result.archived > 0) and '
  'v_inbox_queue still holds a row outside result.skip, files one queued follow-up {trigger: followup, '
  'after, skip} and returns its id; null otherwise. Refuses any other transition. inbox_apply_runner only.';

-- =============================================================================================
-- 4. Guard
-- =============================================================================================
do $$
declare
  f text;
begin
  foreach f in array array['public.inbox_apply_prepare(bigint)', 'public.inbox_apply_close(bigint, text, jsonb)'] loop
    if not exists (select 1 from pg_proc p
                    where p.oid = f::regprocedure and p.prosecdef
                      and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
      raise exception 'FAIL 185: % lost SECURITY DEFINER or its search_path', f;
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
       or not has_function_privilege('inbox_apply_runner', f, 'execute') then
      raise exception 'FAIL 185: % is not executable by inbox_apply_runner alone', f;
    end if;
  end loop;
  if position('session_link' in (select prosrc from pg_proc
                                  where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0
     or position('v_waiting' in (select prosrc from pg_proc
                                  where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL 185: inbox_apply_prepare or inbox_apply_close is not the 185 body';
  end if;

  -- The two reads, and nothing that writes.
  if not has_column_privilege('inbox_apply_runner', 'public.bb_files', 'session_id', 'select')
     or not has_table_privilege('inbox_apply_runner', 'public.sessions', 'select') then
    raise exception 'FAIL 185: inbox_apply_runner cannot read bb_files.session_id or sessions';
  end if;
  if has_column_privilege('inbox_apply_runner', 'public.bb_files', 'source_url', 'select')
     or has_column_privilege('inbox_apply_runner', 'public.bb_files', 'local_path', 'select')
     or has_column_privilege('inbox_apply_runner', 'public.bb_files', 'sha256', 'select') then
    raise exception 'FAIL 185: inbox_apply_runner reads a withheld column of bb_files';
  end if;
  if has_any_column_privilege('inbox_apply_runner', 'public.bb_files', 'insert, update')
     or has_table_privilege('inbox_apply_runner', 'public.bb_files', 'delete')
     or has_any_column_privilege('inbox_apply_runner', 'public.sessions', 'insert, update')
     or has_table_privilege('inbox_apply_runner', 'public.sessions', 'delete') then
    raise exception 'FAIL 185: inbox_apply_runner may write bb_files or sessions';
  end if;
end $$;
