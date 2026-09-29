-- bb2dash :: db/tests/phase15_102_planner_series_orphan.sql
-- Phase 15 (docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md), tasks 12 and 13. Worker W-40.
-- R-54, the Phase 12b tail walk's finding W-3: a `planner_event_series` row outlives its last
-- occurrence when that occurrence is deleted outside 083/088's RPCs. Migration 102's statement
-- trigger closes it. This file is written first and fails on case 1 until 102 is on prod.
--
--   1. detached last row, plain delete   "this one" was edited, then deleted -> 0 series left
--   2. attached last row, plain delete   "This event" on the only occurrence  -> 0 series left
--   3. a series with rows left           deleting one of two occurrences leaves the rule alone
--   4. a stranger uid                    deletes nothing, and the owner's series survives whole
--   5. the two RPC scopes                'following' from the first occurrence and 'all' still
--                                        return the counts 083/088 promise, with the trigger
--                                        firing inside them (TR-4 becomes a no-op, not a bug)
--
-- Case 1 is first on purpose: it is the reported bug, and it is the case the phase's RED check
-- expects to see fail.
--
-- RUN IT: `node scripts/db-test.mjs --only phase15_102_planner_series_orphan.sql`, or paste the
-- whole file into one `execute_sql` call. A failing assertion raises; a pass ends with one
-- summary row. Every write is inside the transaction and the last statement is `rollback`, so
-- prod is untouched either way - which matters more here than anywhere else in the suite,
-- because a committed `planner_events` row is on Stack's real Google calendar within two minutes
-- (DECISIONS 2026-09-16).
--
-- Ids and counts travel between statements in transaction-local GUCs (`set_config(..., true)`)
-- rather than a temp table: the test runs as `authenticated`, which holds no TEMP privilege, and
-- a GUC is rolled back with everything else.
--
-- Every fixture instant is derived from `now()`, never a literal date, so no case can age out the
-- way `phase10a_stage_gradebook.sql` did (P-30). Zone 'UTC' with 'Z' offsets and all_day false
-- keeps 067/069's K-2 and K-3 checks satisfied without depending on a DST rule.

begin;

-- =============================================================================================
-- 0. Become the owner, and remember what the tables held before
-- =============================================================================================
select set_config('w40.owner_sub', (select app_owner()::text), true);
select set_config('request.jwt.claim.sub', (select app_owner()::text), true);
select set_config('w40.events_before', (select count(*)::text from planner_events), true);
select set_config('w40.series_before', (select count(*)::text from planner_event_series), true);
select set_config('w40.orphans_before',
  (select count(*)::text from planner_event_series s
    where not exists (select 1 from planner_events e where e.series_id = s.id)), true);

set local role authenticated;

-- =============================================================================================
-- 1. A detached last occurrence, deleted the plain way, takes its series with it
-- =============================================================================================
-- "This one" (an edit of a single occurrence) sets series_detached and keeps series_id, so the
-- row is still the series' only occurrence. Deleting it leaves nothing to repeat.
do $$
declare
  v_s  uuid;
  v_id uuid;
  v_t0 timestamptz := date_trunc('hour', now()) + interval '10 days';
begin
  v_s := planner_series_create('weekly', (v_t0 + interval '21 days')::date, jsonb_build_array(
    jsonb_build_object(
      'kind', 'event',
      'title', '[W-40 test] detached last occurrence',
      'starts_at', to_char(v_t0 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t0 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC',
      'all_day', false)));

  select id into v_id from planner_events where series_id = v_s;
  if v_id is null then
    raise exception 'FAIL the one-occurrence fixture did not land';
  end if;

  update planner_events set series_detached = true where id = v_id;

  delete from planner_events where id = v_id;

  if exists (select 1 from planner_event_series where id = v_s) then
    raise exception 'FAIL series % outlived its last occurrence: a detached row deleted the '
                    'plain way left the rule behind', v_s;
  end if;
end $$;

-- =============================================================================================
-- 2. "This event" on the last attached occurrence does the same
-- =============================================================================================
-- Identical to 1 without the detach, because the web's single-occurrence delete is an ordinary
-- row delete either way (queries.plannerSeries.ts) - there is no RPC on this path to clean up.
do $$
declare
  v_s  uuid;
  v_id uuid;
  v_t0 timestamptz := date_trunc('hour', now()) + interval '11 days';
begin
  v_s := planner_series_create('weekly', (v_t0 + interval '21 days')::date, jsonb_build_array(
    jsonb_build_object(
      'kind', 'event',
      'title', '[W-40 test] attached last occurrence',
      'starts_at', to_char(v_t0 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t0 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC',
      'all_day', false)));

  select id into v_id from planner_events where series_id = v_s;
  delete from planner_events where id = v_id;

  if exists (select 1 from planner_event_series where id = v_s) then
    raise exception 'FAIL series % outlived its last occurrence ("This event" on the only '
                    'attached row)', v_s;
  end if;
end $$;

-- =============================================================================================
-- 3. A series that still has occurrences is never touched
-- =============================================================================================
-- The trigger's second predicate. Deleting one of two occurrences must leave the rule, its
-- until_date and the surviving row's series_id exactly as they were.
do $$
declare
  v_s     uuid;
  v_ids   uuid[];
  v_until date;
  v_t0    timestamptz := date_trunc('hour', now()) + interval '12 days';
  v_t1    timestamptz := date_trunc('hour', now()) + interval '19 days';
begin
  v_s := planner_series_create('weekly', (v_t1 + interval '7 days')::date, jsonb_build_array(
    jsonb_build_object(
      'kind', 'event', 'title', '[W-40 test] rows left 1',
      'starts_at', to_char(v_t0 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t0 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC', 'all_day', false),
    jsonb_build_object(
      'kind', 'event', 'title', '[W-40 test] rows left 2',
      'starts_at', to_char(v_t1 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t1 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC', 'all_day', false)));

  select array_agg(pe.id order by pe.starts_at) into v_ids
    from planner_events pe where pe.series_id = v_s;
  select s.until_date into v_until
    from planner_event_series s where s.id = v_s;

  delete from planner_events where id = v_ids[1];

  if not exists (select 1 from planner_event_series where id = v_s) then
    raise exception 'FAIL series % was deleted although one occurrence remains', v_s;
  end if;
  if (select until_date from planner_event_series where id = v_s) <> v_until then
    raise exception 'FAIL series %''s until_date moved from % to %', v_s, v_until,
      (select until_date from planner_event_series where id = v_s);
  end if;
  if (select series_id from planner_events where id = v_ids[2]) is distinct from v_s then
    raise exception 'FAIL the surviving occupant of series % lost its series_id', v_s;
  end if;

  -- Clean up: the last row goes, and with it the rule.
  delete from planner_events where id = v_ids[2];
  if exists (select 1 from planner_event_series where id = v_s) then
    raise exception 'FAIL series % survived the deletion of its second and last occurrence', v_s;
  end if;
end $$;

-- =============================================================================================
-- 4. A stranger uid deletes nothing
-- =============================================================================================
-- The trigger is SECURITY INVOKER, so 082's owner-only RLS on both tables decides what it can
-- see. A stranger's delete matches no occurrence, and the trigger's own delete then matches no
-- series - it must not raise, and it must not reach the owner's rule.
do $$
declare
  v_s  uuid;
  v_t0 timestamptz := date_trunc('hour', now()) + interval '13 days';
  v_t1 timestamptz := date_trunc('hour', now()) + interval '20 days';
begin
  v_s := planner_series_create('weekly', (v_t1 + interval '7 days')::date, jsonb_build_array(
    jsonb_build_object(
      'kind', 'event', 'title', '[W-40 test] stranger 1',
      'starts_at', to_char(v_t0 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t0 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC', 'all_day', false),
    jsonb_build_object(
      'kind', 'event', 'title', '[W-40 test] stranger 2',
      'starts_at', to_char(v_t1 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t1 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC', 'all_day', false)));
  perform set_config('w40.stranger_series', v_s::text, true);
end $$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
set local role authenticated;

do $$
declare v_gone int;
begin
  if (select count(*) from planner_event_series) <> 0 then
    raise exception 'FAIL a stranger can read % series rows',
      (select count(*) from planner_event_series);
  end if;

  delete from planner_events
   where series_id = current_setting('w40.stranger_series')::uuid;
  get diagnostics v_gone = row_count;
  if v_gone <> 0 then
    raise exception 'FAIL a stranger deleted % occurrences of series %', v_gone,
      current_setting('w40.stranger_series');
  end if;

  -- A bare delete of everything it can see: still nothing, and the trigger must not raise.
  delete from planner_events;
  get diagnostics v_gone = row_count;
  if v_gone <> 0 then
    raise exception 'FAIL a stranger deleted % planner_events rows', v_gone;
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', current_setting('w40.owner_sub'), true);
set local role authenticated;

do $$
declare v_s uuid := current_setting('w40.stranger_series')::uuid;
begin
  if not exists (select 1 from planner_event_series where id = v_s) then
    raise exception 'FAIL the owner''s series % did not survive a stranger''s delete', v_s;
  end if;
  if (select count(*) from planner_events where series_id = v_s) <> 2 then
    raise exception 'FAIL series % holds % occupants, expected 2', v_s,
      (select count(*) from planner_events where series_id = v_s);
  end if;

  -- Clean up.
  delete from planner_events where series_id = v_s;
  if exists (select 1 from planner_event_series where id = v_s) then
    raise exception 'FAIL series % survived the deletion of both its occurrences', v_s;
  end if;
end $$;

-- =============================================================================================
-- 5. The RPCs still return their counts, with the trigger firing inside them
-- =============================================================================================
-- 'following' from the FIRST occurrence empties the series inside the RPC's own delete, so the
-- trigger removes the rule and the RPC's TR-4 delete becomes a no-op. The return value is taken
-- from `get diagnostics` before either, so it must be unchanged (088:161-164, 088's TR-4).
do $$
declare
  v_s       uuid;
  v_deleted int;
  v_t0      timestamptz := date_trunc('hour', now()) + interval '14 days';
  v_t1      timestamptz := date_trunc('hour', now()) + interval '21 days';
begin
  v_s := planner_series_create('weekly', (v_t1 + interval '7 days')::date, jsonb_build_array(
    jsonb_build_object(
      'kind', 'event', 'title', '[W-40 test] following 1',
      'starts_at', to_char(v_t0 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t0 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC', 'all_day', false),
    jsonb_build_object(
      'kind', 'event', 'title', '[W-40 test] following 2',
      'starts_at', to_char(v_t1 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t1 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC', 'all_day', false)));

  v_deleted := planner_series_delete(v_s, 'following', v_t0);
  if v_deleted <> 2 then
    raise exception 'FAIL planner_series_delete(following, the first occurrence) returned %, '
                    'expected 2', v_deleted;
  end if;
  if exists (select 1 from planner_event_series where id = v_s) then
    raise exception 'FAIL series % survived a "following" delete from its first occurrence', v_s;
  end if;
end $$;

-- 'all' deletes every occurrence from now() on, then deletes the rule itself. With no past
-- occurrence the trigger gets there first; the RPC's own delete then matches 0 rows and the
-- count is still the number of occurrences that went.
do $$
declare
  v_s       uuid;
  v_deleted int;
  v_t0      timestamptz := date_trunc('hour', now()) + interval '15 days';
  v_t1      timestamptz := date_trunc('hour', now()) + interval '22 days';
begin
  v_s := planner_series_create('weekly', (v_t1 + interval '7 days')::date, jsonb_build_array(
    jsonb_build_object(
      'kind', 'event', 'title', '[W-40 test] all 1',
      'starts_at', to_char(v_t0 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t0 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC', 'all_day', false),
    jsonb_build_object(
      'kind', 'event', 'title', '[W-40 test] all 2',
      'starts_at', to_char(v_t1 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'ends_at', to_char((v_t1 + interval '1 hour') at time zone 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
      'time_zone', 'UTC', 'all_day', false)));

  v_deleted := planner_series_delete(v_s, 'all', null);
  if v_deleted <> 2 then
    raise exception 'FAIL planner_series_delete(all) returned %, expected 2', v_deleted;
  end if;
  if exists (select 1 from planner_event_series where id = v_s) then
    raise exception 'FAIL series % survived an "all" delete', v_s;
  end if;
end $$;

reset role;

-- =============================================================================================
-- 6. The invariant holds over the whole table, and nothing leaked out of the fixture
-- =============================================================================================
do $$
declare v_orphans int;
begin
  select count(*) into v_orphans
    from planner_event_series s
   where not exists (select 1 from planner_events e where e.series_id = s.id);
  if v_orphans <> 0 then
    raise exception 'FAIL % series rows have no occurrence left (it was % before this file ran)',
      v_orphans, current_setting('w40.orphans_before');
  end if;

  if (select count(*) from planner_events) <> current_setting('w40.events_before')::int then
    raise exception 'FAIL planner_events holds % rows, started with %',
      (select count(*) from planner_events), current_setting('w40.events_before');
  end if;
  if (select count(*) from planner_event_series) <> current_setting('w40.series_before')::int then
    raise exception 'FAIL planner_event_series holds % rows, started with %',
      (select count(*) from planner_event_series), current_setting('w40.series_before');
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase15_102_planner_series_orphan: PASS'         as result,
       (select count(*) from pg_trigger
         where tgrelid = 'public.planner_events'::regclass
           and tgname = 'planner_events_delete_empty_series') as trigger_present,
       current_setting('w40.events_before')              as planner_events_at_start,
       current_setting('w40.series_before')              as series_at_start;

rollback;
