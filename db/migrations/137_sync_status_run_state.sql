-- bb2dash :: 137_sync_status_run_state.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), tasks 15 and 16.
-- Worker W-53. R-41: the run's true state, and a per-stream read that can say "never synced".
--
-- HOW THIS WAS BUILT. `v_sync_status` is re-created from its LIVE definition, read out of prod with
--     select pg_get_viewdef('public.v_sync_status'::regclass, true);
-- on 2026-10-02 before a line was written. It was migration 035's body (section 7): nothing since
-- re-creates it, and its reloptions read `{security_invoker=true}`. `v_data_freshness` was read
-- the same way (it is 040's body) and is not touched. The first nine columns below are the live
-- ones, in the live order, with the live filters, ordering and `limit 1`.
--
-- WHAT CHANGES. Three columns are appended after `freshness`, in this order:
--   * `notes text`           the row's `sync_runs.notes`. A reaped run's ends `interrupted (reaped)`.
--   * `interrupted boolean`  `sync_runs.interrupted_at is not null` (135's column, 136's stamp).
--                            Home says "last sync interrupted" instead of "last run failed".
--   * `streams jsonb`        R-41's per-stream read, computed here in SQL: one
--                            {stream, last_seen_at, state} per EXPECTED stream, ordered by stream.
--
-- THE EXPECTED STREAMS are the nine stages `run_transform` writes once 135 is applied: the eight
-- `v_data_freshness` already held (announcements, assignments, attempts, content, courses, files,
-- gaps, gradebook) plus `history`. They are one named array, `expected_streams`, in the view's
-- constants row below. `ical` and `crawl` are not expected: their only rows are `skipped`
-- bookkeeping, which `v_data_freshness` ignores (040).
--
-- `last_seen_at` is `v_data_freshness.fresh_as_of` for that stage, or null when the view has no
-- row for it. `state` is `never` when `last_seen_at` is null, `stale` when it is older than
-- `stale_after` (one day: Phase 9's threshold, B-20's default; the other named constant in the
-- same row), and `fresh` otherwise. `v_data_freshness` has no row at all for a stage with no real
-- attempt, so until now nothing could say a stage had never run. Listing the expected streams
-- first and joining the freshness onto them is what lets "never synced" show.
--
-- WHAT DOES NOT CHANGE. `v_data_freshness`, the `freshness` column and its thresholds (Phase 17's).
-- `create or replace view` can only append columns, which is all this does. security_invoker is
-- kept; anon stays revoked; the grants are re-asserted at the foot.
--
-- TEST ROLE. `db/tests/phase19_137_sync_status.sql` deletes and inserts `sync_stage_runs` rows for
-- the `history` stage inside its rolled-back transaction. Migration 100 gave `db_test_runner`
-- select on that table and no write, so this file grants it insert, update and delete there (and
-- usage on the identity sequence, as 100 does for the tables it covers). Nothing else is granted.

-- =============================================================================================
-- 1. v_sync_status
-- =============================================================================================
create or replace view v_sync_status
  with (security_invoker = true) as
select s.id,
       s.run_id,
       s.status,
       s.started_at,
       s.finished_at,
       s.trigger,
       s.summary,
       coalesce((select jsonb_object_agg(k.kind, k.n)
                   from (select kind, count(*) as n
                           from attention_items
                          where state = 'open'
                          group by kind) k), '{}'::jsonb) as open_attention,
       coalesce((select jsonb_agg(to_jsonb(f) order by f.stage) from v_data_freshness f),
                '[]'::jsonb) as freshness,
       s.notes,
       (s.interrupted_at is not null) as interrupted,
       coalesce((select jsonb_agg(
                          jsonb_build_object(
                            'stream',       e.stream,
                            'last_seen_at', f.fresh_as_of,
                            'state',        case
                                              when f.fresh_as_of is null then 'never'
                                              when f.fresh_as_of < now() - c.stale_after then 'stale'
                                              else 'fresh'
                                            end)
                          order by e.stream)
                   from unnest(c.expected_streams) as e(stream)
                   left join v_data_freshness f on f.stage = e.stream),
                '[]'::jsonb) as streams
  from sync_runs s
 cross join (select array['announcements', 'assignments', 'attempts', 'content', 'courses',
                          'files', 'gaps', 'gradebook', 'history']::text[] as expected_streams,
                    interval '1 day'                                        as stale_after) c
 where s.source <> 'ical'                        -- a calendar poll is not "last synced"
   and s.scope is distinct from 'unregistered'   -- nor is a quarantined crawl
 order by s.started_at desc nulls last, s.id desc
 limit 1;

comment on view v_sync_status is
  'One row. The latest real Blackboard sync run, with its notes and interrupted (the terminal '
  'rule of migration 136 gave up on it), plus open_attention (counts keyed by kind), freshness '
  '(v_data_freshness as a jsonb array) and streams: one {stream, last_seen_at, state} per '
  'expected stage, state never / stale (older than one day) / fresh, so a stage that has never '
  'synced is named. iCal polls and quarantined unregistered crawls are excluded so Home cannot '
  'report either as a sync.';

-- =============================================================================================
-- 2. Privileges
-- =============================================================================================
revoke all on v_sync_status from anon;
grant select on v_sync_status to authenticated, service_role;
grant select on v_sync_status to db_test_runner;

-- The test role's fixtures for the `history` stream (see TEST ROLE above).
grant insert, update, delete on public.sync_stage_runs to db_test_runner;
grant usage on sequence public.sync_stage_runs_id_seq to db_test_runner;

-- =============================================================================================
-- 3. Guard
-- =============================================================================================
do $$
declare v_cols text;
begin
  select string_agg(attname, ',' order by attnum) into v_cols
    from pg_attribute
   where attrelid = 'public.v_sync_status'::regclass and attnum > 0 and not attisdropped;
  if v_cols is distinct from
     'id,run_id,status,started_at,finished_at,trigger,summary,open_attention,freshness,notes,interrupted,streams' then
    raise exception 'FAIL 137: v_sync_status columns are %', v_cols;
  end if;
  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.v_sync_status'::regclass and o = 'security_invoker=true') then
    raise exception 'FAIL 137: v_sync_status lost security_invoker';
  end if;
  if has_table_privilege('anon', 'public.v_sync_status', 'select') then
    raise exception 'FAIL 137: anon can select v_sync_status';
  end if;
end $$;
