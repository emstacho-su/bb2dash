-- bb2dash :: db/migrations/180_inbox_apply_trigger.sql
-- Phase 23 (Inbox auto-apply; DECISIONS 2026-10-07, Stack's three choices of that day).
--
-- WHY. Nothing ran /inbox-apply on its own: the container sync skips it (B-44) and the Inbox's
-- "Apply answers" button only copied a command. Stack's choice: after a sync closes done, the sync
-- container checks the answered queue and files the request; a separate `apply` container runs it.
-- The sync still holds no LLM (B-43 stands). This file is the sync container's half: one function,
-- so the runner files an `inbox_feedback` request without any table grant.
--
-- WHAT
--   1. sync_request_inbox_apply(p_after bigint) returns bigint: the fourteenth SECURITY DEFINER
--      function sync_runner can run
--   2. privileges: revoked from public, anon, authenticated and service_role; granted to sync_runner
--   3. a guard block
--
-- 091, 093 and 095 stay byte-frozen: their guards name the twelve and the thirteen and ran when
-- those files were applied. The units that pin the set (phase14_091_queue, phase14_093_review_fixes,
-- phase14_095_storage_key) are edited to the fourteen in this phase's PR.
--
-- The lock key 1400910002 is shared by every function that files an inbox_feedback request (181
-- reuses it), so two callers never both find "nothing open" and both insert.
--
-- Additive only: no drop, no rename, no existing function body changed.

-- =============================================================================================
-- 1. The trigger
-- =============================================================================================
create or replace function public.sync_request_inbox_apply(p_after bigint)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- One lock for every inbox_feedback filing, so two callers never insert two open requests.
  c_lock_key constant bigint := 1400910002;
  v_id bigint;
begin
  -- Only after a sync this runner closed done: a failed sync files nothing, and neither does a
  -- sync the Windows skill ran (it files its own).
  if p_after is null or not exists (
       select 1 from agent_requests a
        where a.id = p_after and a.kind = 'sync' and a.state = 'done'
          and a.claimed_by = 'sync-runner') then
    return null;
  end if;

  perform pg_advisory_xact_lock(c_lock_key);

  -- One request at a time (the skill's rule): an open one is the answer.
  select a.id into v_id
    from agent_requests a
   where a.kind = 'inbox_feedback' and a.state in ('queued', 'claimed')
   order by a.created_at, a.id
   limit 1;
  if found then
    return v_id;
  end if;

  -- The Inbox's "Answered, not applied" section is v_inbox_queue (090): nothing there, nothing to do.
  if not exists (select 1 from v_inbox_queue) then
    return null;
  end if;

  insert into agent_requests (kind, scope, state, params, note)
  values ('inbox_feedback', 'all', 'queued',
          jsonb_build_object('trigger', 'sync', 'after', p_after),
          format('queued by the sync runner after sync %s', p_after))
  returning id into v_id;
  return v_id;
end $$;

comment on function public.sync_request_inbox_apply(bigint) is
  'After a sync the sync runner closed done (180): files one queued inbox_feedback request with params '
  '{"trigger": "sync", "after": <sync request id>} when v_inbox_queue is not empty. Under an advisory '
  'lock, returns the open inbox_feedback request''s id if one is queued or claimed; returns null and '
  'inserts nothing when the queue is empty or p_after is not a done sync claimed by sync-runner. The '
  'apply container runs the request; the sync holds no LLM (B-43). sync_runner only.';

-- =============================================================================================
-- 2. Privileges
-- =============================================================================================
revoke all on function public.sync_request_inbox_apply(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.sync_request_inbox_apply(bigint) to sync_runner;

-- =============================================================================================
-- 3. Guard
-- =============================================================================================
do $$
declare
  v_got text;
  v_fn  record;
begin
  -- (a) sync_runner's SECURITY DEFINER set is 093's thirteen and this one.
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('sync_runner', p.oid, 'execute');
  if v_got is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_own_claims,sync_register_run,sync_request_inbox_apply,'
     'sync_requeue_orphans,sync_run_outcome,sync_sweep_stale' then
    raise exception 'FAIL 180: sync_runner executes SECURITY DEFINER functions %, expected the fourteen', v_got;
  end if;

  -- (b) The new function is SECURITY DEFINER with its path pinned, and sync_runner's alone.
  select p.prosecdef, p.proconfig into v_fn
    from pg_proc p where p.oid = 'public.sync_request_inbox_apply(bigint)'::regprocedure;
  if not v_fn.prosecdef or v_fn.proconfig is distinct from array['search_path=public, pg_temp'] then
    raise exception 'FAIL 180: sync_request_inbox_apply is not SECURITY DEFINER with its search_path pinned';
  end if;
  if has_function_privilege('anon', 'public.sync_request_inbox_apply(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_request_inbox_apply(bigint)', 'execute')
     or has_function_privilege('service_role', 'public.sync_request_inbox_apply(bigint)', 'execute') then
    raise exception 'FAIL 180: sync_request_inbox_apply is executable beyond sync_runner';
  end if;

  -- (c) Still no table, view or sequence privilege in public (091's guard (b), re-checked).
  select string_agg(c.relname, ', ' order by c.relname) into v_got
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'S')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('sync_runner', c.oid, 'usage,select,update')
               else has_table_privilege('sync_runner', c.oid, 'select,insert,update,delete') end);
  if v_got is not null then
    raise exception 'FAIL 180: sync_runner holds a privilege on %', v_got;
  end if;
end $$;
