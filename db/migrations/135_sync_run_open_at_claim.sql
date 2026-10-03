-- bb2dash :: 135_sync_run_open_at_claim.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), task 12. Worker W-53.
-- R-65 and the run-state half of R-41: a sync is `running` from the moment it is claimed.
--
-- HOW THIS WAS BUILT. `run_transform` is re-created from its LIVE definition, read out of prod with
--     select pg_get_functiondef('public.run_transform(uuid, text)'::regprocedure);
-- on 2026-10-02 before a line was written. It was migration 051's body: nothing since 051
-- re-creates it. Every line below that is not named under WHAT CHANGES is that body, carried as
-- it stands. The trigger function and the column are new, so they start from the Contract.
--
-- WHY. `run_transform` opened and closed its `sync_runs` row inside one transaction, so no
-- `running` row was ever committed: every row on prod has `started_at = finished_at`, Home never
-- said "running", and the 30-minute reaper had nothing to reap. A crawl that died left its request
-- `claimed` and the Sync button on "syncing..." with no end.
--
-- WHAT CHANGES
--   1. `sync_runs.interrupted_at timestamptz null`. 136's terminal rule stamps it; 137's
--      `v_sync_status.interrupted` reads it. Nothing in this file writes it.
--   2. `sync_request_open_run()` and the trigger `agent_requests_open_sync_run`. Registering a run
--      is setting `agent_requests.run_id` on a `claimed` sync request. The trigger fires on exactly
--      that (insert, or update of `state` or `run_id`) and opens the run's `sync_runs` row as
--      `running`, stamped `clock_timestamp()`. A run id the tick has already quarantined
--      (`scope = 'unregistered'`) is refused with SQLSTATE 42501: a crawl nobody claimed while it
--      was landing is not adopted afterwards. A run that already has a real row gets no second one.
--   3. `run_transform`
--      a. locks the run's real `sync_runs` row `for update`. A finished row is returned unchanged,
--         as 051. A `running` row is no longer "another tick is mid-flight": it is the row the
--         claim opened, so it is ADOPTED and its `trigger` is set from `p_trigger`. The lock is what
--         keeps two callers from adopting the same row: the second waits, then reads it finished.
--      b. the registration guard now runs before the adopt as well as before the insert, so a
--         `running` row cannot stand in for a registration.
--      c. calls `material_history_record(p_run_id)` (migration 132) after `stage_files` and records
--         it as stage `history` in `sync_stage_runs`, in its own block: a failure there makes the
--         run `partial` and costs no other stage. Nine stages.
--      d. `finished_at = clock_timestamp()`, so an adopted run reads `finished_at > started_at`
--         even when the claim and the fold share a transaction.
--
-- WHAT DOES NOT CHANGE
--   * The order of the other eight stages, the summary envelope, the idempotence of a finished
--     run, the refusal of an unregistered run, and the with-no-row path (insert, then fold), which
--     is what a crawl registered on a `done` request or folded by hand still takes.
--   * `transform_tick` is 136's. Between this file and 136 the live tick would never fold a
--     claim-opened run (its "never folded" test sees the `running` row), so 135 and 136 are
--     applied back to back while no sync request is `queued` or `claimed`.
--   * Signature, language, security and search_path of `run_transform`, so `create or replace`
--     keeps its grants; they are re-asserted at the foot as prod holds them.
--
-- THE INSTALLED SKILL STILL WORKS. Until Phase 19 merges, bb-sync claims with no `run_id`, crawls,
-- and sets `run_id` after `bb.runAll` returns. The claim opens nothing (no run id). Setting
-- `run_id` fires the trigger: quarantine is held while a sync is claimed (039), so there is no
-- quarantine row to refuse it, and the `running` row opens with the calendar row already in
-- `bb_raw`. The next tick adopts and folds it.

-- =============================================================================================
-- 1. sync_runs.interrupted_at
-- =============================================================================================
alter table public.sync_runs add column if not exists interrupted_at timestamptz null;

comment on column public.sync_runs.interrupted_at is
  'When transform_tick''s terminal rule (migration 136) gave up on a run still running after 30 '
  'minutes. Null for every run that finished, failed in the driver, or was quarantined. '
  'v_sync_status.interrupted is "this is not null".';

-- =============================================================================================
-- 2. sync_request_open_run + the trigger
-- =============================================================================================
create or replace function public.sync_request_open_run() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A quarantined run id is refused. The tick recorded this crawl as one nobody registered; taking
  -- it now would fold payloads that landed with no owner's claim behind them.
  if exists (select 1 from sync_runs s
              where s.run_id = new.run_id and s.scope = 'unregistered') then
    raise exception
      'run % was quarantined as an unregistered crawl; refusing to register it on sync request %',
      new.run_id, new.id
      using errcode = '42501',
            hint = 'Crawl again under a new run id: claim the request with its run_id first, then pass that id to bb.runAll.';
  end if;

  -- Open the run. One real row per run: a second claim, or a re-touch of state or run_id, adds none.
  if not exists (select 1 from sync_runs s
                  where s.run_id = new.run_id and s.scope is distinct from 'unregistered') then
    insert into sync_runs (run_id, status, started_at, trigger, source, scope)
    values (new.run_id, 'running', clock_timestamp(), 'manual', 'blackboard', 'all');
  end if;

  return null;   -- an AFTER ROW trigger's return value is ignored
end $$;

comment on function public.sync_request_open_run() is
  'Trigger function behind agent_requests_open_sync_run. When a sync request is claimed with a '
  'run_id (insert, or update of state or run_id), opens that run''s sync_runs row as running, '
  'once. Refuses a run id the tick has already quarantined, with SQLSTATE 42501.';

create or replace trigger agent_requests_open_sync_run
  after insert or update of state, run_id on public.agent_requests
  for each row
  when (new.kind = 'sync' and new.state = 'claimed' and new.run_id is not null)
  execute function public.sync_request_open_run();

-- =============================================================================================
-- 3. run_transform - adopts the row the claim opened; nine stages
-- =============================================================================================
create or replace function run_transform(p_run_id uuid, p_trigger text default 'manual')
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
  v_prev record;
  v_stages  jsonb := '{}'::jsonb;   -- {stage: counts}
  v_errors  jsonb := '[]'::jsonb;
  v_r       jsonb;
  v_cc      jsonb;
  v_hist    jsonb;
  v_started timestamptz;
  v_before  bigint;
  v_after   bigint;
  v_failed  int := 0;
  v_status  text;
  v_trigger text := case when p_trigger in ('manual','scheduled','app_request')
                         then p_trigger else 'manual' end;
begin
  -- Idempotent. A run that already has a FINISHED real sync_runs row is never folded twice: that
  -- row is returned as-is. A row still marked running is the one the claim opened (migration 135's
  -- trigger), and it is adopted below. The row is locked, so a second caller waits here and then
  -- reads the row the first one finished. A quarantine row is not a fold, so it is skipped here.
  select id, status into v_prev
    from sync_runs
   where run_id = p_run_id and scope is distinct from 'unregistered'
   order by id desc limit 1
     for update;
  if found and v_prev.status <> 'running' then
    return v_prev.id;
  end if;

  -- The guard. bb_raw accepts anon inserts, so "this run exists in bb_raw" proves nothing.
  if not exists (select 1 from agent_requests a
                  where a.kind = 'sync' and a.run_id = p_run_id) then
    raise exception
      'run % is not registered by an owner-authenticated sync request; refusing to fold it', p_run_id
      using hint = 'Insert or update an agent_requests row (kind = sync) with this run_id from an authenticated session first.';
  end if;

  if v_prev.id is not null then
    -- Adopt the row opened at claim. started_at stays the claim's; the trigger is this fold's.
    v_id := v_prev.id;
    update sync_runs set trigger = v_trigger where id = v_id;
  else
    insert into sync_runs (run_id, status, started_at, trigger, source, scope)
    values (p_run_id, 'running', now(), v_trigger, 'blackboard', 'all')
    returning id into v_id;
  end if;

  begin
    select count(*) into v_before from attention_items;

    v_r := stage_courses(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('courses', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- stage_content belongs to Phase 8. Call it if it is installed; record an honest skipped
    -- row if it is not, rather than failing a whole sync over a function someone else owns.
    v_started := clock_timestamp();
    if to_regprocedure('public.stage_content(uuid)') is null then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'content', 'skipped', '{}'::jsonb, v_started, clock_timestamp(),
              'stage_content not installed');
      v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
      v_errors := v_errors || to_jsonb('stage_content not installed'::text);
    else
      begin
        execute 'select public.stage_content($1)' into v_cc using p_run_id;
        v_cc := coalesce(v_cc, '{}'::jsonb);
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'ok', v_cc, v_started, clock_timestamp(), null);
        v_stages := v_stages || jsonb_build_object('content', v_cc);
      exception when others then
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
                left(sqlstate || ' ' || sqlerrm, 1000));
        v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
        v_errors := v_errors || to_jsonb(left('stage_content: ' || sqlerrm, 1000));
      end;
    end if;

    v_r := stage_assignments(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('assignments', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- Phase 10a. Gradebook AFTER assignments, because stage_assignments is what creates and
    -- re-points assignments.bb_column_id, and attempts AFTER gradebook, because the file
    -- catalogue reads that link to decide which assignment a submission file belongs to.
    v_r := stage_gradebook(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('gradebook', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_attempts(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('attempts', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_announcements(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('announcements', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_files(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('files', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- Phase 19. The per-crawl material history, AFTER stage_files: a file's history row carries
    -- the bb_files id that stage has just catalogued. material_history_record (132) writes no
    -- stage row of its own, so the row is written here, and the call sits in its own block so a
    -- failure in it is this stage's failure and nobody else's: the run reads partial.
    v_started := clock_timestamp();
    begin
      v_hist := coalesce(material_history_record(p_run_id), '{}'::jsonb);
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'history', 'ok', v_hist, v_started, clock_timestamp(), null);
      v_stages := v_stages || jsonb_build_object('history', v_hist);
    exception when others then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'history', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
              left(sqlstate || ' ' || sqlerrm, 1000));
      v_stages := v_stages || jsonb_build_object('history', '{}'::jsonb);
      v_errors := v_errors || to_jsonb(left('material_history_record: ' || sqlerrm, 1000));
    end;

    v_r := stage_gaps(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('gaps', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    select count(*) into v_after from attention_items;

    select count(*) into v_failed from sync_stage_runs
     where sync_run_id = v_id and status = 'failed';
    v_status := case when v_failed > 0 then 'partial' else 'ok' end;

    update sync_runs
       set status      = v_status,
           finished_at = clock_timestamp(),
           summary     = jsonb_build_object(
                           'stages',           v_stages,
                           'changes',          sync_change_lines(v_stages),
                           'attention_raised', greatest(v_after - v_before, 0),
                           'errors',           v_errors)
     where id = v_id;

  exception when others then
    -- Belt and braces: the stages catch their own errors, so reaching here means something
    -- outside them broke. Record it on the run rather than leaving a row stuck at running.
    update sync_runs
       set status = 'failed', finished_at = clock_timestamp(),
           notes  = btrim(coalesce(notes || ' | ', '') || left('driver: ' || sqlerrm, 500))
     where id = v_id;
  end;

  return v_id;
end $$;

comment on function run_transform(uuid, text) is
  'Fold one crawl into the typed tables. Refuses any run_id that no agent_requests row of kind '
  'sync has registered, because bb_raw takes anon inserts. Adopts the running sync_runs row the '
  'claim opened (migration 135), or inserts one when there is none; calls the nine stages in '
  'order (courses, content, assignments, gradebook, attempts, announcements, files, history, '
  'gaps), and writes summary = {stages, changes, attention_raised, errors}. Idempotent: a run '
  'whose real sync_runs row has finished returns that id and does nothing.';

-- =============================================================================================
-- 4. Privileges, re-asserted exactly as prod holds them today
-- =============================================================================================
-- The trigger function: nobody calls it. Firing a trigger checks no EXECUTE privilege, so it needs
-- no grant at all, and it gets none for anon or authenticated.
revoke all on function public.sync_request_open_run() from public, anon, authenticated;

-- run_transform: service_role (051), and the test role (held since migration 100, re-asserted).
revoke all on function public.run_transform(uuid, text) from public, anon, authenticated;
grant execute on function public.run_transform(uuid, text) to service_role;
grant execute on function public.run_transform(uuid, text) to db_test_runner;

-- =============================================================================================
-- 5. Guard
-- =============================================================================================
do $$
begin
  if (select count(*) from pg_trigger
       where tgrelid = 'public.agent_requests'::regclass
         and tgname = 'agent_requests_open_sync_run' and not tgisinternal) <> 1 then
    raise exception 'FAIL 135: the trigger agent_requests_open_sync_run is not on agent_requests';
  end if;
  if has_function_privilege('anon', 'public.sync_request_open_run()', 'execute')
     or has_function_privilege('authenticated', 'public.sync_request_open_run()', 'execute')
     or has_function_privilege('anon', 'public.run_transform(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.run_transform(uuid, text)', 'execute') then
    raise exception 'FAIL 135: anon or authenticated can execute sync_request_open_run or run_transform';
  end if;
  if to_regprocedure('public.material_history_record(uuid)') is null then
    raise exception 'FAIL 135: material_history_record(uuid) does not exist; apply 132 first '
                    '(prod order must equal name order)';
  end if;
end $$;
