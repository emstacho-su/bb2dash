-- bb2dash :: 127_retire_ical_poll.sql
-- Phase 18 (brief 98, Contract row 127; task 14; R-72, B-32). Worker W-48.
--
-- The daily iCal poll writes an "ok" sync_runs row every day with no data behind it (R-72; 19
-- source = 'ical' rows on 2026-09-29, the last at 06:17 UTC). B-32's default retires the job and amends
-- R-15's clause. Only the schedule goes; ical_poll(), ical_collect() and the app_settings.ical_*
-- columns are left in place (ical_collect is still called by transform_tick, where it is now a
-- no-op; Phase 19's driver migration may drop that call). No other cron job is touched.
-- Idempotent: unscheduling runs only while the job exists, and the guard checks the end state.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bb2dash-ical-poll') then
    perform cron.unschedule('bb2dash-ical-poll');
  end if;

  if exists (select 1 from cron.job where jobname = 'bb2dash-ical-poll') then
    raise exception '127: bb2dash-ical-poll is still scheduled';
  end if;
  if (select count(*) from cron.job
       where jobname in ('bb2dash-transform-tick', 'bb2dash-calendar-push')) <> 2 then
    raise exception '127: expected the transform tick and the calendar push to stay scheduled';
  end if;
end $$;
