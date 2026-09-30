-- bb2dash :: 118_heartbeat_push_partial_is_success.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), round 2 of T-06, from the
-- /code-review gate (2026-09-29). 113 is applied and stays byte-frozen; private.scheduler_heartbeat()
-- is re-created here from 113's body with one change.
--
-- WHY. 113 counted only a calendar_push_runs row with status 'ok' as a success. Migration 061 also
-- writes 'partial': the run authenticated and pushed, and a few items failed. A 'partial' run neither
-- reset the consecutive-failure count nor moved last_ok_at, so after a re-mint with one item still
-- failing, every run was 'partial' and Home kept saying "Google Calendar push has failed N times"
-- with the old auth error while pushes went through every two minutes.
--
-- CHANGE. The push's newest success is its newest 'ok' OR 'partial' row, for both last_ok_at and the
-- failure reset. Nothing else: same signature, columns, stage rule, owner guard and grants.

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
    select (select r.id from calendar_push_runs r where r.status in ('ok', 'partial')
             order by r.id desc limit 1)                                             as ok_id,
           (select r.started_at from calendar_push_runs r where r.status in ('ok', 'partial')
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
  'that success, the newest of those failures'' error, and heartbeat_stage(). A calendar push run '
  'that is ok or partial counts as a success (118). SECURITY DEFINER '
  'because it reads cron.*; rows only when auth.uid() = app_owner(). Read it through '
  'public.v_scheduler_heartbeat.';

revoke all on function private.scheduler_heartbeat() from public, anon;
grant execute on function private.scheduler_heartbeat() to authenticated, service_role;
