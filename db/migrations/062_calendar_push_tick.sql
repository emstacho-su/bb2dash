-- bb2dash :: 062_calendar_push_tick.sql
-- Phase 11 (docs/planning/69_PHASE11_planner.md, Contract "Migrations", 062). Worker W-21.
--
-- Contents
--   calendar_push_tick()   every two minutes: reap a dead push, fire a new one if anything moved
--   calendar_push_now()    the owner (or the PM's SQL session) asks for a push on the next tick
--   pg_cron schedule       bb2dash-calendar-push, offset one minute from the transform tick
--
-- ---------------------------------------------------------------------------------------------
-- WHY THERE IS NO COLLECT PHASE (unlike ical_poll/ical_collect in 044)
-- ---------------------------------------------------------------------------------------------
-- The iCal poll had to be two-phase because pg_net answers asynchronously and only pg_net knows
-- what came back. The calendar push does not: the edge function holds the service role, so it
-- writes its own calendar_push_runs row, its own app_settings.gcal_last_* and its own
-- calendar_events rows before it returns. Nothing here ever reads net._http_response for a
-- result - the response body is a courtesy, not the record. All this tick needs from pg_net is
-- the request id, as a lock ("a push is in flight") and as the thing the reaper abandons.
--
-- THE TWO WRITERS AND THE ONE FLAG. assignments_mark_calendar_dirty (061) sets gcal_dirty; a
-- push that finishes ok clears it. A partial or failed push leaves it set, so the next tick
-- retries two minutes later without anybody scheduling a retry.
--
-- THE LOCK. gcal_push_request_id being non-null is the whole concurrency story: one push at a
-- time, for the same reason 044 refuses to issue a second iCal request while one is outstanding.
-- Two concurrent pushes against one calendar would race on the same deterministic event ids.
--
-- THE REAPER. pg_net can lose a request (the worker restarts, the row ages out of pg_net.ttl,
-- the function dies before it can write its row). Without the reaper the lock would be held
-- forever and the calendar would silently stop updating. Thirty minutes is the same generosity
-- 044 gives the iCal collect, and far beyond the 55-second timeout of the request itself.
--
-- THE SECRET. calendar_push_secret is the only thing in this file that touches Vault, and it is
-- the reason the function is SECURITY DEFINER: vault.decrypted_secrets is readable by postgres,
-- not by the roles that might call the tick. The secret is written into a pg_net header and
-- never returned, logged or stored anywhere else. If it is missing the tick records a failed run
-- saying so instead of firing a request that could only ever come back 401.

-- ---------------------------------------------------------------------------------------------
-- 1. calendar_push_tick
-- ---------------------------------------------------------------------------------------------
create or replace function calendar_push_tick() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- The project's own edge-function endpoint. Hardcoded because there is no second project and
  -- no setting that could hold it; if the project ref ever changes this line changes with it.
  c_url      constant text := 'https://goultdzqcavefcgnifdy.supabase.co/functions/v1/calendar-push';
  c_reap_msg constant text := 'no response from calendar-push within 30 minutes';
  v_cfg      app_settings%rowtype;
  v_reaped   int := 0;
  v_fired    boolean := false;
  v_run      bigint;
  v_request  bigint;
  v_secret   text;
  v_reason   text;
begin
  select * into v_cfg from app_settings where id;

  -- 1. Reap. A request that has been outstanding for half an hour is not coming back; say so
  --    out loud and release the lock, or the calendar stops updating and nothing says why.
  if v_cfg.gcal_push_request_id is not null
     and v_cfg.gcal_push_requested_at < now() - interval '30 minutes' then
    update calendar_push_runs
       set status = 'failed', finished_at = coalesce(finished_at, now()), error = c_reap_msg
     where status = 'running';
    get diagnostics v_reaped = row_count;

    update app_settings
       set gcal_push_request_id = null,
           gcal_last_push_at    = now(),
           gcal_last_status     = 'failed',
           gcal_last_error      = c_reap_msg
     where id;

    select * into v_cfg from app_settings where id;
  end if;

  -- 2. Fire, if there is anything to push and nothing in flight.
  if not v_cfg.gcal_enabled then
    v_reason := 'gcal_enabled is false';
  elsif not v_cfg.gcal_dirty then
    v_reason := 'nothing has changed since the last successful push';
  elsif v_cfg.gcal_push_request_id is not null then
    v_reason := 'a push is still in flight';
  else
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'calendar_push_secret';

    if coalesce(btrim(v_secret), '') = '' then
      -- Enabled but unconfigured. Record it once per tick rather than firing a request that can
      -- only come back 401 - a visible failed run is how the PM finds out the setup is half done.
      v_reason := 'calendar_push_secret is not in Vault; run scripts/google-consent.mjs';
      insert into calendar_push_runs (trigger, status, finished_at, error)
      values ('scheduled', 'failed', now(), v_reason)
      returning id into v_run;

      update app_settings
         set gcal_last_push_at = now(), gcal_last_status = 'failed', gcal_last_error = v_reason
       where id;
    else
      insert into calendar_push_runs (trigger) values ('scheduled') returning id into v_run;

      v_request := net.http_post(
        url                  := c_url,
        body                 := jsonb_build_object('run_id', v_run),
        headers              := jsonb_build_object('x-push-secret', v_secret,
                                                   'content-type', 'application/json'),
        timeout_milliseconds := 55000);

      update app_settings
         set gcal_push_request_id = v_request, gcal_push_requested_at = now()
       where id;

      v_fired := true;
    end if;
  end if;

  return jsonb_build_object('fired', v_fired, 'reaped', v_reaped, 'run_id', v_run,
                            'reason', v_reason, 'at', now());
end $$;

comment on function calendar_push_tick() is
  'Scheduled every two minutes by pg_cron as bb2dash-calendar-push, one minute offset from the '
  'transform tick. Reaps a pg_net request that has been outstanding for 30 minutes (marking the '
  'open calendar_push_runs row failed and releasing the lock), then - if gcal_enabled and '
  'gcal_dirty and nothing is in flight - opens a running calendar_push_runs row and POSTs its id '
  'to the calendar-push edge function with the x-push-secret header from Vault. There is no '
  'collect phase: the function holds the service role and writes its own result back. SECURITY '
  'DEFINER only so it can read vault.decrypted_secrets; the secret never leaves the header.';

-- ---------------------------------------------------------------------------------------------
-- 2. calendar_push_now - "push as soon as you can"
-- ---------------------------------------------------------------------------------------------
-- It sets the flag rather than calling the function: one code path fires pushes, one lock stops
-- two of them, and a manual request cannot jump the queue past an in-flight run.
create or replace function calendar_push_now() returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A JWT-borne call always carries a uid, and it must be the owner's. A null uid means the call
  -- came from a direct SQL session (postgres via the Supabase MCP, or service_role), which is
  -- already trusted and is how the PM runs the acceptance script; anon holds no EXECUTE at all.
  if (select auth.uid()) is not null and (select auth.uid()) <> public.app_owner() then
    raise exception 'calendar_push_now: only the owner may request a calendar push';
  end if;

  update app_settings set gcal_dirty = true where id;
end $$;

comment on function calendar_push_now() is
  'Mark the Google calendar dirty so the next calendar_push_tick (within two minutes) fires a '
  'push. Owner-only: a call carrying a JWT must be the owner''s, a call with no JWT can only be '
  'a direct SQL session. Not used by the UI in the MVP - it exists for the PM''s acceptance '
  'script and for "the dates look wrong, push again".';

-- ---------------------------------------------------------------------------------------------
-- 3. Privileges. 038's rule: nothing on the push path is callable from a browser except the
--    owner-guarded calendar_push_now.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.calendar_push_tick() from public, anon, authenticated;
grant execute on function public.calendar_push_tick() to service_role;

revoke all on function public.calendar_push_now() from public, anon;
grant execute on function public.calendar_push_now() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. pg_cron. cron.schedule replaces a job of the same name, so re-running this is safe.
--    '1-59/2' is every two minutes on the ODD minute: the transform tick owns '*/2' (the even
--    minutes), and a transform that has just rewritten 80 assignments should not be competing
--    with a push for the same rows in the same second.
-- ---------------------------------------------------------------------------------------------
select cron.schedule('bb2dash-calendar-push', '1-59/2 * * * *',
                     $cron$select public.calendar_push_tick()$cron$);
