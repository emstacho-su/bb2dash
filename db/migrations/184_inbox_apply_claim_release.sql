-- bb2dash :: db/migrations/184_inbox_apply_claim_release.sql
-- Phase 23 (Inbox auto-apply), review round 1 (/code-review on PR #79, 2026-10-07). 181 stays
-- byte-frozen; this re-creates one of its functions, as 093 did for 091.
--
-- WHY. 181's inbox_apply_claim() closed, as dead, ANY open claim of the worker's own it found when
-- the worker asked for work: "one worker, one run at a time". That is not a thing the database can
-- know. Two containers can hold the role's secret at once (the test project beside the real one at
-- the cut-over), and each one's 10-second poll would then fail the other's 14-minute run. And a
-- claim whose answer was lost on the way back would be failed by the very next poll.
--
-- WHAT
--   1. inbox_apply_claim(): a claim of the worker's own is released only once it is older than 16
--      minutes (the worker kills its run at 14 and closes within 2, so a claim that old has no
--      process behind it). A younger one is somebody's live run: nothing is claimed beside it.
--      Anybody else's claim is still released at 30 minutes (R-96). The released request's result
--      now says a Claude run had started, so it counts toward the day's cap of runs, as a run that
--      was interrupted mid-way did start.
--   2. a guard block
--
-- What it costs: after a crash, the worker's own dead claim blocks new work for up to 16 minutes
-- instead of none. The Inbox shows the request as running for that long, then as failed.
--
-- Additive in effect: no drop, no rename, no grant changed; one function body replaced.

create or replace function public.inbox_apply_claim()
  returns table (id bigint, params jsonb, created_at timestamptz)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_claimant          constant text := 'inbox-apply-runner';
  -- RUN_TIMEOUT_MS (14 minutes) plus the close, in apply/src/config.ts; the sweep flags at 20.
  c_own_release_after constant interval := interval '16 minutes';
  c_release_after     constant interval := interval '30 minutes';
  r record;
begin
  -- A claim with no process behind it: the worker's own past 16 minutes, anybody else's past 30
  -- (R-96). Both close failed; what was archived before stays archived.
  for r in
    update agent_requests a
       set state = 'failed', finished_at = now(),
           result = coalesce(a.result, '{}'::jsonb) || jsonb_build_object(
             'error', 'interrupted',
             'lines', jsonb_build_array(
               case when a.claimed_by = c_claimant
                    then 'The apply worker stopped before this request finished.'
                    else 'Claimed for more than 30 minutes without finishing; released.' end),
             'claude', jsonb_build_object('started', a.claimed_by = c_claimant))
     where a.kind = 'inbox_feedback' and a.state = 'claimed'
       and coalesce(a.claimed_at, a.created_at)
           < now() - case when a.claimed_by = c_claimant then c_own_release_after else c_release_after end
    returning a.id
  loop
    perform raise_attention(
      null, 'stack_must_confirm', null, 'agent_request', 'inbox-apply-failed', null, null, null,
      format('The Inbox apply request %s was interrupted before it finished. Answers it had already applied stay applied; press Apply answers to run the rest.', r.id),
      null);
  end loop;

  -- A live claim, the worker's own or somebody else's: one request at a time, nothing to take.
  if exists (select 1 from agent_requests a where a.kind = 'inbox_feedback' and a.state = 'claimed') then
    return;
  end if;

  return query
    update agent_requests a
       set state = 'claimed', claimed_at = now(), claimed_by = c_claimant,
           claim_attempts = a.claim_attempts + 1
     where a.id = (select q.id from agent_requests q
                    where q.kind = 'inbox_feedback' and q.state = 'queued'
                    order by q.created_at, q.id
                    limit 1
                    for update skip locked)
    returning a.id, a.params, a.created_at;
end $$;

comment on function public.inbox_apply_claim() is
  'The apply worker''s queue read and claim (181, as 184 amends it). First closes failed (error '
  'interrupted) any inbox_feedback claim of its own older than 16 minutes and anybody else''s older '
  'than 30 (R-96), raising one inbox-apply-failed item. Then, unless a live claim is open (its own or '
  'somebody else''s), claims the oldest queued inbox_feedback request as inbox-apply-runner and returns '
  'it; no row when there is none. inbox_apply_runner only.';

do $$
declare
  v_fn record;
begin
  select p.prosecdef, p.proconfig, p.prosrc into v_fn
    from pg_proc p where p.oid = 'public.inbox_apply_claim()'::regprocedure;
  if not v_fn.prosecdef or v_fn.proconfig is distinct from array['search_path=public, pg_temp'] then
    raise exception 'FAIL 184: inbox_apply_claim lost SECURITY DEFINER or its search_path';
  end if;
  if position('c_own_release_after' in v_fn.prosrc) = 0 then
    raise exception 'FAIL 184: inbox_apply_claim is not the 184 body';
  end if;
  if not has_function_privilege('inbox_apply_runner', 'public.inbox_apply_claim()', 'execute')
     or has_function_privilege('anon', 'public.inbox_apply_claim()', 'execute')
     or has_function_privilege('authenticated', 'public.inbox_apply_claim()', 'execute')
     or has_function_privilege('service_role', 'public.inbox_apply_claim()', 'execute') then
    raise exception 'FAIL 184: inbox_apply_claim is not executable by inbox_apply_runner alone';
  end if;
end $$;
