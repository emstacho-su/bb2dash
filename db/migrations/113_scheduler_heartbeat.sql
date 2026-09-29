-- bb2dash :: 113_scheduler_heartbeat.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-06 (P-12, P-71, R-52).
-- Worker W-44. New objects only; it redefines no `transform_tick` and no `calendar_push_tick`
-- (DECISIONS 2026-09-15).
--
-- WHY. Google Calendar push failed 633 times, every 2 minutes, between 2026-09-23 19:57Z and the
-- re-mint on 2026-09-24, and nothing said so: pg_cron wrote 'succeeded' for every one of those
-- ticks, because the tick itself ran; only `calendar_push_runs` knew the push failed. Home needs
-- one read that says, per scheduled job, when it last ran, when it last did its job, and how
-- many times in a row it has failed. That read is `v_scheduler_heartbeat`.
--
-- WHY A `private` SCHEMA. The read joins `cron.job` and `cron.job_run_details`, which the browser
-- roles cannot see, so it has to be SECURITY DEFINER. A definer function in `public` would be
-- callable at /rest/v1/rpc; one in `private`, a schema PostgREST does not expose, is reachable
-- only through the invoker view in `public`, and returns rows only to Stack (app_owner()).
--
-- STAGES (B-20, B-28; one constant each, in heartbeat_stage below):
--   off      the cron job is inactive (or missing), or for the push, app_settings.gcal_enabled is off
--   failing  3 or more consecutive failures since the last success
--   missing  no tick ever, or the newest tick is more than 600 s old
--   late     the newest tick is more than 240 s old (Home says nothing at `late`)
--   ok       otherwise
-- Both jobs tick every 120 s (`*/2` and `1-59/2`), so `late` is two missed ticks and `missing`
-- five.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 1. private.heartbeat_stage - the pure rule, so it can be tested on fixed inputs
-- ---------------------------------------------------------------------------------------------
create or replace function private.heartbeat_stage(
  p_last_tick_at timestamptz,
  p_now timestamptz,
  p_consecutive_failures integer,
  p_active boolean)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when not coalesce(p_active, false)                               then 'off'
    when coalesce(p_consecutive_failures, 0) >= 3                    then 'failing'   -- B-28
    when p_last_tick_at is null
      or p_now - p_last_tick_at > make_interval(secs => 600)         then 'missing'   -- B-20
    when p_now - p_last_tick_at > make_interval(secs => 240)         then 'late'      -- B-20
    else 'ok'
  end
$$;

comment on function private.heartbeat_stage(timestamptz, timestamptz, integer, boolean) is
  'Heartbeat stage rule (113, B-20/B-28): off if not active; failing at >= 3 consecutive '
  'failures; missing if never ticked or the newest tick is > 600 s old; late if > 240 s; else ok.';

revoke all on function private.heartbeat_stage(timestamptz, timestamptz, integer, boolean) from public, anon;
grant execute on function private.heartbeat_stage(timestamptz, timestamptz, integer, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. private.scheduler_heartbeat - two rows, owner only
-- ---------------------------------------------------------------------------------------------
-- last_tick_at  start_time of the job's newest cron.job_run_details row (by runid, the pkey).
-- last_ok_at    transform: the newest 'succeeded' cron row. calendar_push: started_at of the
--               newest calendar_push_runs row with status 'ok' (the cron row says 'succeeded'
--               even when the push failed).
-- consecutive_failures / last_error
--               transform: cron rows with status 'failed' newer (by runid) than the newest
--               'succeeded' row, and the newest such row's return_message.
--               calendar_push: calendar_push_runs rows with status 'failed' newer (by id) than
--               the newest 'ok' row, and the newest such row's error.
--               last_error is null when there is no failure since the last success, so Home
--               never quotes an error that has since been cleared.
-- active        cron.job.active; for calendar_push also app_settings.gcal_enabled. A job missing
--               from cron.job reads inactive, so `off`.
create or replace function private.scheduler_heartbeat()
returns table (job text, cron_jobname text, tick_seconds integer, last_tick_at timestamptz,
               last_ok_at timestamptz, consecutive_failures integer, last_error text, stage text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with jobs(job, cron_jobname, tick_seconds, ord) as (
    values ('transform'::text,     'bb2dash-transform-tick'::text, 120, 1),
           ('calendar_push'::text, 'bb2dash-calendar-push'::text,  120, 2)
  ),
  j as (
    select jobs.*, cj.jobid, coalesce(cj.active, false) as cron_active
      from jobs
      left join cron.job cj on cj.jobname = jobs.cron_jobname
  ),
  tick as (
    select j.*,
           (select d.start_time from cron.job_run_details d
             where d.jobid = j.jobid order by d.runid desc limit 1)                  as last_tick_at,
           (select d.runid from cron.job_run_details d
             where d.jobid = j.jobid and d.status = 'succeeded'
             order by d.runid desc limit 1)                                          as ok_runid,
           (select d.start_time from cron.job_run_details d
             where d.jobid = j.jobid and d.status = 'succeeded'
             order by d.runid desc limit 1)                                          as cron_ok_at
      from j
  ),
  push_ok as (
    select (select r.id from calendar_push_runs r where r.status = 'ok'
             order by r.id desc limit 1)                                             as ok_id,
           (select r.started_at from calendar_push_runs r where r.status = 'ok'
             order by r.id desc limit 1)                                             as ok_at,
           (select s.gcal_enabled from app_settings s limit 1)                       as gcal_enabled
  ),
  shaped as (
    select t.ord, t.job, t.cron_jobname, t.tick_seconds, t.last_tick_at,
           t.cron_ok_at as last_ok_at,
           (select count(*)::integer from cron.job_run_details d
             where d.jobid = t.jobid and d.status = 'failed'
               and d.runid > coalesce(t.ok_runid, 0))                                as consecutive_failures,
           (select d.return_message from cron.job_run_details d
             where d.jobid = t.jobid and d.status = 'failed'
               and d.runid > coalesce(t.ok_runid, 0)
             order by d.runid desc limit 1)                                          as last_error,
           t.cron_active as active
      from tick t
     where t.job = 'transform'
    union all
    select t.ord, t.job, t.cron_jobname, t.tick_seconds, t.last_tick_at,
           p.ok_at,
           (select count(*)::integer from calendar_push_runs r
             where r.status = 'failed' and r.id > coalesce(p.ok_id, 0)),
           (select r.error from calendar_push_runs r
             where r.status = 'failed' and r.id > coalesce(p.ok_id, 0)
             order by r.id desc limit 1),
           t.cron_active and coalesce(p.gcal_enabled, false)
      from tick t cross join push_ok p
     where t.job = 'calendar_push'
  )
  select s.job, s.cron_jobname, s.tick_seconds, s.last_tick_at, s.last_ok_at,
         s.consecutive_failures, s.last_error,
         private.heartbeat_stage(s.last_tick_at, now(), s.consecutive_failures, s.active)
    from shaped s
   where (select auth.uid()) = public.app_owner()
   order by s.ord
$$;

comment on function private.scheduler_heartbeat() is
  'Scheduler heartbeat (113, P-12/P-71): one row per pg_cron job bb2dash reads on Home '
  '(transform, calendar_push) with its newest tick, newest success, consecutive failures since '
  'that success, the newest of those failures'' error, and heartbeat_stage(). SECURITY DEFINER '
  'because it reads cron.*; rows only when auth.uid() = app_owner(). Read it through '
  'public.v_scheduler_heartbeat.';

revoke all on function private.scheduler_heartbeat() from public, anon;
grant execute on function private.scheduler_heartbeat() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. public.v_scheduler_heartbeat - the one read the web makes
-- ---------------------------------------------------------------------------------------------
create or replace view public.v_scheduler_heartbeat with (security_invoker = true) as
  select * from private.scheduler_heartbeat();

comment on view public.v_scheduler_heartbeat is
  'Scheduler heartbeat for Home (113): job transform | calendar_push, cron_jobname, '
  'tick_seconds, last_tick_at, last_ok_at, consecutive_failures, last_error, stage '
  '(ok | late | missing | failing | off). Owner only; empty for anyone else. security_invoker '
  'over private.scheduler_heartbeat().';

revoke all on public.v_scheduler_heartbeat from anon;
grant select on public.v_scheduler_heartbeat to authenticated, service_role;
