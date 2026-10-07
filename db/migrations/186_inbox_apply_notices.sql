-- bb2dash :: db/migrations/186_inbox_apply_notices.sql
-- Phase 23 (Inbox auto-apply), the review of 185 (/code-review and a security pass, 2026-10-07).
-- 181 and 185 stay byte-frozen; this re-creates two functions, as 184 and 185 did.
--
-- WHY
--   1. 185 made the two notices outlast a merely finished run, and tied them to the wrong fact.
--      "The apply run failed" stayed while ANY answered row waited, so an answer Stack gave during
--      the run, or a seventh row the batch deferred, kept a notice about somebody else's failure
--      open. And "sign in again" closed only on a done close: a run that started Claude and then
--      closed failed because one answer could not be applied left Stack told to renew a token that
--      had just worked, while an all-templated run over an empty queue closed it with the token
--      still dead.
--   2. A decision record that carries `closed_itself` is how a question nobody answered is archived
--      (114, 162), and link_file_sessions skips an archived answer that carries it (163). Nothing
--      stopped the apply worker's writer from sending that key on one of Stack's answers: the next
--      fold would then read his answer as never given. The worker's SQL server refuses the key
--      since this change (apply/src/mcp-sql/rpc.ts); this is the same rule where it cannot be missed.
--
-- WHAT
--   1. inbox_apply_close():
--      - `apply-login-required` is archived by a close that proves the sign-in: the run started
--        Claude and closed done, or failed for a reason that only a signed-in run reaches
--        (not_applied, timed_out, usage_limit, budget_exceeded). Never by a run that started nothing.
--      - `inbox-apply-failed` is archived by a done close unless an answer a failed run could not
--        apply is still waiting: an id in this close's skip, or in the skip of a failed request of
--        the worker's that finished after the answer was given.
--   2. inbox_apply_archive(): refuses a decision that carries `closed_itself`.
--   3. a guard block
--
-- Additive in effect: no drop, no rename, no grant changed; two function bodies replaced.

-- =============================================================================================
-- 1. The close
-- =============================================================================================
create or replace function public.inbox_apply_close(p_request bigint, p_state text, p_result jsonb)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- 180's lock: every function that files an inbox_feedback request takes it.
  c_lock_key   constant bigint := 1400910002;
  c_claimant   constant text := 'inbox-apply-runner';
  -- The run errors (apply/src/report.ts) that only a run whose sign-in worked can end with.
  c_signed_in  constant text[] := array['not_applied', 'timed_out', 'usage_limit', 'budget_exceeded'];
  v_skip       bigint[] := '{}';
  v_archived   integer := 0;
  v_follow     bigint;
  v_signed_in  boolean;
  v_stuck      boolean;
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
      and a.claimed_by = c_claimant
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
  end if;

  -- The two notices a failed close raises close themselves (114's closed_itself record shape), each
  -- once what it says is no longer true and not before.
  -- "Sign in again": a run that started Claude and got as far as a result has signed in.
  v_signed_in := p_result->'claude'->>'started' = 'true'
                 and (p_state = 'done' or (p_result->>'error' = any (c_signed_in)) is true);
  -- "The apply run failed ... run the rest": an answer a failed run could not apply still waits.
  -- The request just closed is in the second arm when it failed; its skip counts either way.
  v_stuck := exists (
    select 1 from v_inbox_queue q
     where q.id = any (v_skip)
        or exists (select 1 from agent_requests a
                    where a.kind = 'inbox_feedback' and a.state = 'failed' and a.claimed_by = c_claimant
                      and jsonb_typeof(a.result->'skip') = 'array'
                      and a.result->'skip' @> to_jsonb(q.id)
                      and a.finished_at >= coalesce(q.resolved_at, '-infinity'::timestamptz)));
  update attention_items i
     set state = 'archived', archived_at = now(), archived_by = c_claimant,
         decision = jsonb_build_object('closed_itself', true, 'rule', 'a later apply run finished',
                                       'sync_run_id', null, 'trigger', 'inbox_apply_close')
   where i.kind = 'stack_must_confirm' and i.course_id is null and i.state = 'open'
     and (   (i.ref = 'apply-login-required' and v_signed_in)
          or (i.ref = 'inbox-apply-failed' and p_state = 'done' and not v_stuck));

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
  'Closes an inbox_feedback request for the apply worker (181, 186): its own claimed -> done or failed, '
  'with finished_at and result (an object whose lines is an array of text). A failed close raises one '
  'inbox-apply-failed item (apply-login-required for error sign_in_expired). Since 186 '
  'apply-login-required is archived by a close whose run started Claude and ended done or with '
  'not_applied, timed_out, usage_limit or budget_exceeded; inbox-apply-failed by a done close unless '
  'an answer a failed run listed in its skip (this close''s skip included) is still in v_inbox_queue. '
  'When the run archived something (result.archived > 0) and v_inbox_queue still holds a row outside '
  'result.skip, files one queued follow-up {trigger: followup, after, skip} and returns its id; null '
  'otherwise. Refuses any other transition. inbox_apply_runner only.';

-- =============================================================================================
-- 2. The archive
-- =============================================================================================
create or replace function public.inbox_apply_archive(p_request bigint, p_item bigint, p_decision jsonb)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_buckets constant text[] := array['needs_change', 'applied_by_transform', 'kept', 'dismissed',
                                     'recorded_elsewhere'];
  v_wrote boolean;
begin
  if not inbox_apply_is_own_claim(p_request) then
    raise exception 'inbox_apply_archive: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;
  if p_item is null or p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'inbox_apply_archive: the decision must be a jsonb object' using errcode = '22023';
  end if;
  -- The shape the exporter renders (182) and the app reads (decision.change). Text, not trust.
  if p_decision->>'schema' is distinct from 'inbox-decision/1'
     or p_decision->>'item' is distinct from p_item::text
     or p_decision->>'request' is distinct from p_request::text
     or (p_decision->>'bucket' = any (c_buckets)) is not true
     or p_decision->>'mode' is distinct from 'unattended'
     or jsonb_typeof(p_decision->'change') is distinct from 'string'
     or btrim(p_decision->>'change') = ''
     or jsonb_typeof(p_decision->'rule') is distinct from 'string'
     or (p_decision ? 'sources' and jsonb_typeof(p_decision->'sources') <> 'array')
     or (p_decision ? 'flagged' and jsonb_typeof(p_decision->'flagged') not in ('object', 'null')) then
    raise exception 'inbox_apply_archive: the decision for item % is not an inbox-decision/1 record', p_item
      using errcode = '22023';
  end if;
  -- 186: the mark of a question nobody answered. On an answer it would make the transform read
  -- the answer as never given (163), so it is never this function's to store, whatever its value.
  if p_decision ? 'closed_itself' then
    raise exception 'inbox_apply_archive: the decision for item % carries closed_itself, which marks a question nobody answered', p_item
      using errcode = '22023';
  end if;

  perform 1 from attention_items i
    where i.id = p_item and i.state in ('resolved', 'dismissed')
    for update;
  if not found then
    return false;
  end if;

  -- 042's F3 rule, read from the log and not from the caller: applied_at is stamped only when a
  -- row was actually written for this item by this request.
  select exists (select 1 from inbox_apply_writes w
                  where w.item_id = p_item and w.request_id = p_request) into v_wrote;
  if v_wrote then
    update attention_items i set applied_at = now()
     where i.id = p_item and i.applied_at is null;
  end if;

  perform archive_attention_item(p_item, p_decision, 'inbox-apply request ' || p_request);
  perform set_config('inbox_apply.item', '', true);
  return true;
end $$;

comment on function public.inbox_apply_archive(bigint, bigint, jsonb) is
  'Archives one answered Inbox item for the apply worker (181, 186), with its decision record: an '
  'inbox-decision/1 object naming this item and request, a bucket, mode unattended, a change and a '
  'rule, and never the key closed_itself (186). Stamps applied_at when inbox_apply_writes holds a write '
  'for the item by this request (042''s F3 rule, read from the log). archived_by is inbox-apply request '
  '<id>. False when the item is no longer answered. Refuses any other decision shape and a request that '
  'is not the worker''s own claim. inbox_apply_runner only.';

-- =============================================================================================
-- 3. Guard
-- =============================================================================================
do $$
declare
  f text;
begin
  foreach f in array array['public.inbox_apply_close(bigint, text, jsonb)',
                           'public.inbox_apply_archive(bigint, bigint, jsonb)'] loop
    if not exists (select 1 from pg_proc p
                    where p.oid = f::regprocedure and p.prosecdef
                      and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
      raise exception 'FAIL 186: % lost SECURITY DEFINER or its search_path', f;
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
       or not has_function_privilege('inbox_apply_runner', f, 'execute') then
      raise exception 'FAIL 186: % is not executable by inbox_apply_runner alone', f;
    end if;
  end loop;
  if position('c_signed_in' in (select prosrc from pg_proc
                                 where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0
     or position('closed_itself' in (select prosrc from pg_proc
                                      where oid = 'public.inbox_apply_archive(bigint, bigint, jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL 186: inbox_apply_close or inbox_apply_archive is not the 186 body';
  end if;
end $$;
