-- bb2dash :: db/migrations/093_sync_runner_review_fixes.sql
-- Phase 14 (docs/planning/sprint-2/briefs/100_PHASE14_containers.md), "Round 2 — W-55", from
-- `/code-review main high` on the phase branch, 2026-10-03. Worker W-55. 091 and 094 stay
-- byte-frozen; this file holds every SQL fix of the round (088's precedent).
--
-- WHAT
--   1. (item 1, item 7) `sync_own_claims()`: the sync runner's own claimed sync requests, as
--      (id, run_id, claimed_at, claim_attempts). The runner resumes the registered ones it never
--      closed (a fold-wait timeout, a stop during the wait, a throw after `sync_register_run`):
--      once the tick has folded such a run, 136's terminal rule never touches it,
--      `sync_requeue_orphans` skips it, and `sync_enqueue` would return its id for good. It reads
--      `claimed_by = 'sync-runner'` rows only, so the runner never sees, let alone closes, a claim
--      it did not make. `claim_attempts` is the column's value for the report (item 7).
--   2. (item 6) `sync_close`: a failed close of a registered request whose run is still `running`
--      marks the run `failed` (finished_at, the error appended to notes) in the same call.
--
-- HOW THIS WAS BUILT. `sync_close` is re-created from its LIVE definition, read out of prod with
--     select pg_get_functiondef('public.sync_close(bigint, text, jsonb)'::regprocedure);
-- on 2026-10-03: 091's body as applied (md5 6b577e2f09310c189a0a1078c4841f80). Every line below that
-- is not marked 093 is that body, carried as it stands; signature, language, security and
-- search_path are unchanged, so `create or replace` keeps its grants, which are re-asserted.
--
-- Privileges: revoked from public, anon, authenticated and service_role; granted to sync_runner
-- only. sync_runner's SECURITY DEFINER set grows from twelve to thirteen.

-- =============================================================================================
-- 1. sync_own_claims
-- =============================================================================================
create or replace function public.sync_own_claims()
  returns table (id bigint, run_id uuid, claimed_at timestamptz, claim_attempts smallint)
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    select a.id, a.run_id, a.claimed_at, a.claim_attempts
      from agent_requests a
     where a.kind = 'sync' and a.state = 'claimed' and a.claimed_by = 'sync-runner'
     order by a.claimed_at, a.id;
end $$;

comment on function public.sync_own_claims() is
  'The sync runner''s own claimed sync requests (093): (id, run_id, claimed_at, claim_attempts) where '
  'claimed_by = sync-runner. The runner resumes the registered ones it never closed, and reports '
  'claim_attempts. Never another claimant''s row. sync_runner only.';

revoke all on function public.sync_own_claims() from public, anon, authenticated, service_role;
grant execute on function public.sync_own_claims() to sync_runner;

-- =============================================================================================
-- 2. sync_close: a failed close fails a still-running run
-- =============================================================================================
create or replace function public.sync_close(p_id bigint, p_state text, p_report jsonb)
  returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_req    record;
  v_run_id bigint;
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object'
     or jsonb_typeof(p_report->'lines') is distinct from 'array' then
    raise exception 'sync_close: the report must be an object whose lines is an array of text'
      using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_report->'lines') l
              where jsonb_typeof(l) <> 'string') then
    raise exception 'sync_close: every line of the report must be text' using errcode = '22023';
  end if;
  if p_state is null or p_state not in ('done', 'failed') then
    raise exception 'sync_close: state must be done or failed, not %', coalesce(p_state, 'null')
      using errcode = '22023';
  end if;

  select a.id, a.kind, a.state, a.claimed_by, a.run_id into v_req
    from agent_requests a where a.id = p_id for update;
  if not found or v_req.kind <> 'sync' then
    raise exception 'sync_close: % is not a sync request', p_id using errcode = '22023';
  end if;
  -- Two transitions only: this runner's claim -> done / failed, and queued -> failed (a login
  -- that died before the claim).
  if not ((v_req.state = 'claimed' and v_req.claimed_by = 'sync-runner')
          or (v_req.state = 'queued' and p_state = 'failed')) then
    raise exception 'sync_close: refusing % -> % on request % (claimed_by %)',
      v_req.state, p_state, p_id, coalesce(v_req.claimed_by, 'null') using errcode = '22023';
  end if;

  if v_req.run_id is not null then
    select s.id into v_run_id
      from sync_runs s
     where s.run_id = v_req.run_id and s.scope is distinct from 'unregistered'
     order by s.id desc
     limit 1;
  end if;

  update agent_requests a
     set state = p_state, finished_at = now(), result = p_report,
         sync_run_id = coalesce(v_run_id, a.sync_run_id)
   where a.id = p_id;

  -- 093 (R2 item 6): a failed close of a registered request fails its run at once when the run is
  -- still running (a crawl that threw never folds), with the error in notes, so Home and Activity
  -- show the failure now and not at the 30-minute rule. A run that already finished keeps its status.
  if p_state = 'failed' and v_run_id is not null then
    update sync_runs s
       set status      = 'failed',
           finished_at = coalesce(s.finished_at, now()),
           notes       = btrim(coalesce(s.notes || ' | ', '')
                               || left('sync-runner: ' || coalesce(p_report->>'error', 'failed'), 500))
     where s.id = v_run_id and s.status = 'running';
  end if;

  -- The runner's lines go where Activity already reads the fold's: summary->'changes'.
  if v_run_id is not null and jsonb_array_length(p_report->'lines') > 0 then
    update sync_runs s
       set summary = jsonb_set(coalesce(s.summary, '{}'::jsonb), '{changes}',
                               case when jsonb_typeof(s.summary->'changes') = 'array'
                                    then s.summary->'changes' else '[]'::jsonb end
                               || (p_report->'lines'))
     where s.id = v_run_id;
  end if;

  if p_report->>'error' = 'login_required' then
    perform sync_login_required();
  end if;
end $$;

comment on function public.sync_close(bigint, text, jsonb) is
  'Closes a sync request for the sync runner (091, 093): its own claimed -> done or failed, or queued -> '
  'failed; sets finished_at, result = the report and sync_run_id, and appends the report''s lines to '
  'that run''s summary.changes. A failed close fails the run too while it is still running, with the '
  'error in notes (093). error login_required raises the login item (sync_login_required). Refuses any '
  'other transition and a report that is not an object with an array of text lines. sync_runner only.';

revoke all on function public.sync_close(bigint, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.sync_close(bigint, text, jsonb) to sync_runner;

-- =============================================================================================
-- 3. Guard
-- =============================================================================================
do $$
declare
  v_got text;
begin
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('sync_runner', p.oid, 'execute');
  if v_got is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_own_claims,sync_register_run,sync_requeue_orphans,'
     'sync_run_outcome,sync_sweep_stale' then
    raise exception 'FAIL 093: sync_runner executes SECURITY DEFINER functions %, expected the thirteen', v_got;
  end if;
  if has_function_privilege('anon', 'public.sync_own_claims()', 'execute')
     or has_function_privilege('authenticated', 'public.sync_own_claims()', 'execute')
     or has_function_privilege('anon', 'public.sync_close(bigint, text, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_close(bigint, text, jsonb)', 'execute') then
    raise exception 'FAIL 093: anon or authenticated can execute sync_own_claims or sync_close';
  end if;
end $$;
