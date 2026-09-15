-- bb2dash :: 039_tick_quarantine_grace.sql
-- Phase 9, last migration in the 030-039 range. Two corrections to transform_tick, both found by
-- working through what the bb-sync skill will actually have to do.
--
-- 1. THE REGISTRATION RACE. Migration 035 requires a crawl's run_id to be registered in
--    agent_requests before the transform will fold it, and quarantines any complete crawl in
--    bb_raw that nobody registered. The skill is supposed to register first - but the crawler
--    generates its own run_id inside bb.runAll() and only returns it afterwards
--    (ingest/bb_crawler.js: `const run_id = crypto.randomUUID()`), so the skill cannot know the
--    id until the crawl is done. The crawl is "complete" the instant its calendar row lands, so
--    a tick firing in that gap would quarantine Stack's own sync and it would never fold.
--
--    Fix: do not quarantine while the owner has a sync in flight - any agent_requests row of
--    kind 'sync' in state 'claimed' whose claimed_at is within the last 30 minutes. Only the
--    owner can create that row (RLS), so the window cannot be opened by anyone else, and an
--    unregistered run is still never FOLDED during it - it just waits for its quarantine row.
--    Nothing about the authorisation rule changes; only the timing of the bookkeeping.
--
--    This also means the skill may register the run_id immediately after bb.runAll returns and
--    still be safe. Registering before is better and becomes possible the moment runAll accepts
--    a runId; docs/planning/64_W15_VERIFICATION.md spells out both for the PM.
--
-- 2. FOLD ORDER. The fold loop had no ORDER BY, so with two crawls pending the newer one could
--    be folded first - and stage_files then correctly refuses to mark anything missing from the
--    older one (migration 037), but the older crawl's assignment values would still land last.
--    Oldest first is the only order that replays history the way it happened.

create or replace function transform_tick() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_folded int := 0; v_reaped int := 0; v_claimed int := 0; v_failed_req int := 0;
  v_quarantined int := 0;
  v_runs jsonb := '[]'::jsonb;
  v_newest uuid; v_run bigint; v_q bigint;
  v_sync_in_flight boolean;
  r record;
begin
  -- 1. Fold every REGISTERED crawl that is complete and has never been folded, OLDEST FIRST. A
  --    crawl is complete when its calendar row has landed (the crawler posts it last) or when
  --    nothing new has arrived for three minutes. Registration, not presence in bb_raw, is the
  --    authority.
  for r in
    select a.run_id,
           (select max(b.captured_at) from bb_raw b where b.run_id = a.run_id) as last_at
      from agent_requests a
     where a.kind = 'sync'
       and a.run_id is not null
       -- 'claimed' is the state during a crawl; 'done' covers a skill that closed its request
       -- before the next tick came round. Either way the owner asked for this run.
       and a.state in ('claimed','done')
       and not exists (select 1 from sync_runs s
                        where s.run_id = a.run_id and s.scope is distinct from 'unregistered')
       and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'course')
       and (exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'calendar')
            or (select max(b.captured_at) from bb_raw b where b.run_id = a.run_id)
               < now() - interval '3 minutes')
     group by a.run_id
     order by 2
  loop
    v_run := run_transform(r.run_id, 'scheduled');
    v_folded := v_folded + 1;
    v_runs := v_runs || to_jsonb(v_run);
  end loop;

  -- 2. Quarantine. A complete crawl nobody registered is recorded once and then invisible to
  --    every later tick, so junk posted with the publishable key costs two rows and no data.
  --    Held off entirely while the owner has a sync in flight, because the crawler names the run
  --    and the skill can only register it once bb.runAll returns.
  select exists (select 1 from agent_requests a
                  where a.kind = 'sync' and a.state = 'claimed'
                    and a.claimed_at > now() - interval '30 minutes')
    into v_sync_in_flight;

  if not v_sync_in_flight then
    for r in
      select b.run_id
        from bb_raw b
       where b.kind = 'course'
         and not exists (select 1 from sync_runs s where s.run_id = b.run_id)
         and not exists (select 1 from agent_requests a
                          where a.kind = 'sync' and a.run_id = b.run_id)
       group by b.run_id
      having (exists (select 1 from bb_raw c where c.run_id = b.run_id and c.kind = 'calendar')
              or max(b.captured_at) < now() - interval '3 minutes')
    loop
      insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope, notes)
      values (r.run_id, 'failed', now(), now(), 'scheduled', 'blackboard', 'unregistered',
              'unregistered run: no agent_requests row of kind sync claimed this run_id, and bb_raw accepts anon inserts. Recorded and ignored.')
      returning id into v_q;

      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_q, 'crawl', 'skipped',
              jsonb_build_object('run_id', r.run_id), now(), now(), 'unregistered run');

      v_quarantined := v_quarantined + 1;
    end loop;
  end if;

  -- 3. Reap. A run still marked running half an hour later is not running; it died with its
  --    session. Say so out loud instead of leaving "syncing..." on Home forever.
  update sync_runs
     set status      = 'failed',
         finished_at = coalesce(finished_at, now()),
         notes       = btrim(coalesce(notes || ' | ', '') || 'interrupted (reaped)')
   where status = 'running'
     and started_at < now() - interval '30 minutes';
  get diagnostics v_reaped = row_count;

  -- 4. Drain the transform requests the app queued. 'sync' requests are not touched: they need
  --    a logged-in Blackboard tab, so only the bb-sync skill can close one.
  select a.run_id into v_newest
    from agent_requests a
   where a.kind = 'sync' and a.run_id is not null
     and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'course')
   order by (select max(b.captured_at) from bb_raw b where b.run_id = a.run_id) desc
   limit 1;

  for r in
    select id from agent_requests
     where state = 'queued' and kind = 'transform'
     order by created_at
     for update skip locked
  loop
    update agent_requests
       set state = 'claimed', claimed_at = now(), claimed_by = 'transform_tick'
     where id = r.id;

    begin
      if v_newest is null then
        update agent_requests
           set state = 'failed', finished_at = now(),
               result = jsonb_build_object('error', 'no registered crawl in bb_raw to transform')
         where id = r.id;
        v_failed_req := v_failed_req + 1;
      else
        v_run := run_transform(v_newest, 'app_request');
        update agent_requests
           set state = 'done', finished_at = now(), sync_run_id = v_run, run_id = v_newest,
               result = (select jsonb_build_object('sync_run_id', s.id, 'run_id', s.run_id,
                                                   'status', s.status, 'summary', s.summary)
                           from sync_runs s where s.id = v_run)
         where id = r.id;
        v_claimed := v_claimed + 1;
      end if;
    exception when others then
      update agent_requests
         set state = 'failed', finished_at = now(),
             result = jsonb_build_object('error', left(sqlerrm, 500))
       where id = r.id;
      v_failed_req := v_failed_req + 1;
    end;
  end loop;

  return jsonb_build_object('folded', v_folded, 'sync_run_ids', v_runs,
                            'quarantined', v_quarantined,
                            'quarantine_held_for_sync', coalesce(v_sync_in_flight, false),
                            'reaped', v_reaped,
                            'requests_done', v_claimed, 'requests_failed', v_failed_req,
                            'at', now());
end $$;

comment on function transform_tick() is
  'Scheduled every two minutes by pg_cron as the postgres role. Folds registered crawls oldest '
  'first, quarantines complete crawls nobody registered (once each, and never while the owner '
  'has a sync in flight), reaps runs still running after 30 minutes, and drains queued '
  'agent_requests of kind transform. Never touches kind = sync: those need a logged-in '
  'Blackboard tab and belong to the bb-sync skill.';

revoke all on function public.transform_tick() from public, anon, authenticated;
grant execute on function public.transform_tick() to service_role;
