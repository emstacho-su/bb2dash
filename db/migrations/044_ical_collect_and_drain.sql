-- bb2dash :: 044_ical_collect_and_drain.sql
-- Phase 9, round 2 (code-review findings F5 and F8-drain). All create-or-replace; 001-043 are
-- applied and byte-frozen.
--
-- ---------------------------------------------------------------------------------------------
-- F5. The calendar body was never going to arrive
-- ---------------------------------------------------------------------------------------------
-- pg_net is asynchronous: net.http_get() returns a request id and the worker later writes the
-- body into net._http_response. Migration 035 made ical_poll() two-phase - collect what the
-- PREVIOUS call asked for, then ask again - and scheduled it once a day.
--
-- pg_net deletes response rows after pg_net.ttl, which on this project is 6 hours (verified:
-- `select setting from pg_settings where name = 'pg_net.ttl'` -> "6 hours"). A response fetched
-- at 06:17 is gone long before the next day's 06:17 poll. So the collect phase would have found
-- nothing, every day, forever: it would have taken the "no pg_net response after an hour"
-- branch, recorded a failure, asked again, and thrown away the body it had already been given.
-- The feed URL is blank today, which is the only reason this has not produced a year of noise.
--
-- Fix: collection stops being tied to the daily cadence. ical_collect() is small, cheap, and
-- returns immediately when nothing is outstanding; transform_tick() - already running every two
-- minutes - calls it at the end of every tick, so a body is picked up within two minutes of
-- landing, well inside the ttl. ical_poll() stays the daily requester and calls ical_collect()
-- itself first, which covers the case where the tick was not running.
--
-- ical_collect writes rows only when it actually collects something: a sync_runs row
-- (source = 'ical') and a sync_stage_runs row (stage = 'ical') per collected body or definite
-- failure. A tick with nothing outstanding writes nothing at all - 720 empty rows a day would
-- bury the real history.
--
-- ---------------------------------------------------------------------------------------------
-- F8 (drain side). A 'transform' request now actually does something
-- ---------------------------------------------------------------------------------------------
-- The drain calls run_transform(newest registered crawl), which is idempotent: a crawl that has
-- already been folded returns its existing sync_runs id and runs no stage. The request was then
-- marked done carrying that old run's summary, and every answer Stack had given in the Inbox was
-- still sitting there unapplied. Pressing Sync did nothing at all for the Inbox.
--
-- With migration 042 the apply step stands on its own, so the drain calls apply_resolutions()
-- after run_transform and reports its counts in agent_requests.result, alongside
-- folded_a_new_crawl so the result says which of the two things happened. When run_transform did
-- fold a new crawl, stage_assignments has already applied the answers and this second call
-- returns zeros - the counts are in the run's own summary in that case.

-- ---------------------------------------------------------------------------------------------
-- 1. ical_collect - the half of the poll that has to run often
-- ---------------------------------------------------------------------------------------------
create or replace function ical_collect() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started  timestamptz := clock_timestamp();
  v_cfg      app_settings%rowtype;
  v_resp     record;
  v_run      bigint;
  v_run_uuid uuid;
  v_status   text;
  v_counts   jsonb := '{}'::jsonb;
  v_error    text;
begin
  select * into v_cfg from app_settings where id;

  -- Nothing outstanding: the overwhelmingly common case, and it must cost nothing.
  if v_cfg.ical_request_id is null then
    return jsonb_build_object('collected', false, 'reason', 'no request outstanding');
  end if;

  select status_code, content, error_msg, timed_out
    into v_resp
    from net._http_response
   where id = v_cfg.ical_request_id;

  if found and v_resp.status_code between 200 and 299
     and coalesce(v_resp.content, '') <> '' then
    v_run_uuid := gen_random_uuid();
    insert into bb_raw (run_id, kind, bb_course_id, payload)
    values (v_run_uuid, 'ical', null,
            jsonb_build_object('source', 'ical', 'url', v_cfg.ical_url,
                               'fetched_at', now(), 'body', v_resp.content));
    v_status := 'ok';
    v_counts := jsonb_build_object('bytes', length(v_resp.content), 'run_id', v_run_uuid,
                                   'request_id', v_cfg.ical_request_id,
                                   'waited_seconds',
                                   round(extract(epoch from (now() - v_cfg.ical_requested_at))));
    update app_settings set ical_request_id = null, ical_last_status = v_resp.status_code,
                            ical_last_error = null where id;

  elsif found then
    v_status := 'failed';
    v_error  := left(coalesce(v_resp.error_msg,
                              'HTTP ' || coalesce(v_resp.status_code::text, '?')), 500);
    v_counts := jsonb_build_object('request_id', v_cfg.ical_request_id);
    update app_settings set ical_request_id = null, ical_last_status = v_resp.status_code,
                            ical_last_error = v_error where id;

  elsif v_cfg.ical_requested_at < now() - interval '30 minutes' then
    -- The response row is not there and is not coming: either the worker never ran or the row
    -- aged out of pg_net.ttl. Half an hour is generous for a 20-second request checked every
    -- two minutes, and abandoning the id is what lets the next poll ask again.
    v_status := 'failed';
    v_error  := 'no pg_net response for request ' || v_cfg.ical_request_id ||
                ' within 30 minutes; abandoned';
    v_counts := jsonb_build_object('request_id', v_cfg.ical_request_id);
    update app_settings set ical_request_id = null, ical_last_error = v_error where id;

  else
    return jsonb_build_object('collected', false, 'reason', 'still waiting',
                              'request_id', v_cfg.ical_request_id);
  end if;

  insert into sync_runs (status, started_at, finished_at, trigger, source, scope, summary)
  values (case when v_status = 'failed' then 'partial' else 'ok' end, v_started, now(),
          'scheduled', 'ical', 'calendar',
          jsonb_build_object(
            'stages',  jsonb_build_object('ical', v_counts),
            'changes', case when v_status = 'ok'
                            then jsonb_build_array('Calendar feed fetched')
                            else jsonb_build_array('Calendar feed could not be fetched') end,
            'attention_raised', 0,
            'errors', case when v_error is null then '[]'::jsonb
                           else jsonb_build_array(v_error) end))
  returning id into v_run;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (v_run, 'ical', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('collected', v_status = 'ok', 'status', v_status,
                            'sync_run_id', v_run, 'counts', v_counts, 'error', v_error);
end $$;

comment on function ical_collect() is
  'Collect the pg_net response ical_poll() asked for, if it has arrived: the body lands in '
  'bb_raw(kind = ical) and the attempt is recorded as one sync_runs + sync_stage_runs pair. '
  'Called by transform_tick() every two minutes because pg_net drops responses after '
  'pg_net.ttl (6 hours here), which a once-a-day collect would always miss. Returns without '
  'writing anything when no request is outstanding or the response has not arrived yet.';

-- ---------------------------------------------------------------------------------------------
-- 2. ical_poll - still daily, still the only thing that asks, no longer the thing that collects
-- ---------------------------------------------------------------------------------------------
create or replace function ical_poll() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_cfg     app_settings%rowtype;
  v_run     bigint;
  v_status  text := 'skipped';
  v_counts  jsonb := '{}'::jsonb;
  v_error   text;
  v_collect jsonb;
  v_new_req bigint;
begin
  select * into v_cfg from app_settings where id;

  insert into sync_runs (status, started_at, trigger, source, scope)
  values ('running', now(), 'scheduled', 'ical', 'calendar')
  returning id into v_run;

  if coalesce(btrim(v_cfg.ical_url), '') = '' then
    v_status := 'skipped';
    v_counts := jsonb_build_object('reason', 'app_settings.ical_url is blank');
  else
    -- Clear the decks first. The tick collects within two minutes of a body landing, so this
    -- normally finds nothing; it matters when the tick has not been running.
    v_collect := ical_collect();
    v_counts  := jsonb_build_object('collect', v_collect);

    select ical_request_id into v_new_req from app_settings where id;
    if v_new_req is null then
      v_new_req := net.http_get(url := v_cfg.ical_url, timeout_milliseconds := 20000);
      update app_settings set ical_request_id = v_new_req, ical_requested_at = now() where id;
      v_counts := v_counts || jsonb_build_object('requested', v_new_req);
      v_status := 'ok';
    else
      -- A request is still in flight. Asking again would orphan the first one.
      v_status := 'skipped';
      v_counts := v_counts || jsonb_build_object('reason', 'a request is still outstanding',
                                                 'request_id', v_new_req);
    end if;
  end if;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (v_run, 'ical', v_status, v_counts, v_started, clock_timestamp(), v_error);

  update sync_runs
     set status      = case when v_status = 'failed' then 'partial' else 'ok' end,
         finished_at = now(),
         summary     = jsonb_build_object(
                         'stages',  jsonb_build_object('ical', v_counts),
                         'changes', case when v_status = 'ok'
                                         then jsonb_build_array('Calendar feed requested')
                                         else jsonb_build_array('Calendar feed not set; nothing polled') end,
                         'attention_raised', 0,
                         'errors', case when v_error is null then '[]'::jsonb
                                        else jsonb_build_array(v_error) end)
   where id = v_run;

  return jsonb_build_object('sync_run_id', v_run, 'status', v_status, 'counts', v_counts,
                            'error', v_error);
end $$;

comment on function ical_poll() is
  'Daily calendar-feed poll: issues one net.http_get for app_settings.ical_url and records a '
  'sync_stage_runs row with stage = ical every time, status skipped while the URL is blank or a '
  'request is still in flight. It no longer collects - ical_collect(), called from every '
  'transform_tick, does that, because pg_net keeps a response for only pg_net.ttl. Parsing the '
  'body into sessions and assignments is a later phase.';

-- ---------------------------------------------------------------------------------------------
-- 3. transform_tick - 039's body, plus the drain's apply step and the calendar collect
-- ---------------------------------------------------------------------------------------------
create or replace function transform_tick() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_folded int := 0; v_reaped int := 0; v_claimed int := 0; v_failed_req int := 0;
  v_quarantined int := 0;
  v_runs jsonb := '[]'::jsonb;
  v_newest uuid; v_run bigint; v_q bigint;
  v_sync_in_flight boolean;
  v_res jsonb;
  v_was_folded boolean;
  v_ical jsonb := jsonb_build_object('collected', false, 'reason', 'not attempted');
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
        -- run_transform is idempotent, so this folds the newest crawl only if nobody has folded
        -- it yet. Either way the answers Stack has given get applied: that is the whole point of
        -- a transform request, and before migration 042 it was the one thing it could not do.
        v_was_folded := exists (select 1 from sync_runs s
                                 where s.run_id = v_newest
                                   and s.scope is distinct from 'unregistered');
        v_run := run_transform(v_newest, 'app_request');
        v_res := apply_resolutions();
        update agent_requests
           set state = 'done', finished_at = now(), sync_run_id = v_run, run_id = v_newest,
               result = (select jsonb_build_object('sync_run_id', s.id, 'run_id', s.run_id,
                                                   'status', s.status, 'summary', s.summary,
                                                   'folded_a_new_crawl', not v_was_folded,
                                                   'resolutions', v_res)
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

  -- 5. Collect the calendar feed's body if pg_net has it. Isolated: a pg_net problem must not
  --    cost us the fold, the reap and the drain that already succeeded above.
  begin
    v_ical := ical_collect();
  exception when others then
    v_ical := jsonb_build_object('collected', false, 'error', left(sqlerrm, 300));
  end;

  return jsonb_build_object('folded', v_folded, 'sync_run_ids', v_runs,
                            'quarantined', v_quarantined,
                            'quarantine_held_for_sync', coalesce(v_sync_in_flight, false),
                            'reaped', v_reaped,
                            'requests_done', v_claimed, 'requests_failed', v_failed_req,
                            'ical', v_ical,
                            'at', now());
end $$;

comment on function transform_tick() is
  'Scheduled every two minutes by pg_cron as the postgres role. Folds registered crawls oldest '
  'first, quarantines complete crawls nobody registered (once each, and never while the owner '
  'has a sync in flight), reaps runs still running after 30 minutes, drains queued '
  'agent_requests of kind transform - folding if there is anything to fold and applying Stack''s '
  'answers either way - and finally collects the calendar feed''s pg_net response if it has '
  'arrived. Never touches kind = sync: those need a logged-in Blackboard tab and belong to the '
  'bb-sync skill.';

-- ---------------------------------------------------------------------------------------------
-- 4. Privileges. 038's rule: none of this is callable from a browser.
-- ---------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['ical_collect()', 'ical_poll()', 'transform_tick()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
