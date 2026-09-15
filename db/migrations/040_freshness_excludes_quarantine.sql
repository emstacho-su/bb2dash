-- bb2dash :: 040_freshness_excludes_quarantine.sql
-- Phase 9 (PM, after the security review). Number 040 is a one-off extension of Phase 9's
-- 030–039 range, allocated by the PM for this fix.
--
-- v_data_freshness (019) counted every sync_stage_runs row as an attempt. Two kinds of row are
-- bookkeeping, not attempts:
--   * the quarantine row transform_tick writes for an unregistered bb_raw run
--     (stage='crawl', status='skipped', parent sync_runs.scope='unregistered', 039). Anyone with
--     the publishable key can create one by POSTing two junk bb_raw rows, and the view then
--     reported "crawl last attempt failed" on the owner's Home row forever.
--   * ical_poll's daily status='skipped' row while app_settings.ical_url is blank (035).
-- Skipped rows and unregistered runs no longer count; a stage with no real attempt has no row.
-- Same column list and order as 019; security_invoker kept (036); grants unchanged.

create or replace view v_data_freshness with (security_invoker = true) as
select s.stage,
       max(s.finished_at) filter (where s.status = 'ok')                 as fresh_as_of,
       max(s.finished_at) filter (where s.status <> 'skipped')           as last_attempt_at,
       (max(s.finished_at) filter (where s.status = 'ok'))
         is distinct from
       (max(s.finished_at) filter (where s.status <> 'skipped'))         as last_attempt_failed
from sync_stage_runs s
join sync_runs r on r.id = s.sync_run_id
where coalesce(r.scope, '') <> 'unregistered'
group by s.stage
having count(*) filter (where s.status <> 'skipped') > 0;

comment on view v_data_freshness is
  'Age of each data class, one row per stage. fresh_as_of = last successful finish; '
  'last_attempt_failed = the most recent real attempt did not succeed. Rows with '
  'status = skipped (ical while unconfigured, quarantined unregistered crawls) are '
  'bookkeeping, not attempts, and are ignored; a stage with no real attempt has no row.';
