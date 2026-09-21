-- bb2dash :: db/tests/phase12b_082_083_planner_series.sql
-- Phase 12b post-MVP tail, item T-1. Tests migrations 082 and 083:
--   1. bounds        0 rows and 53 rows are refused; 52 is accepted
--   2. cap           a 53rd occurrence is refused, one row at a time or several in one statement
--   3. shape         a non-object, a missing key, a wrong type, an unknown key, a wall clock
--                    without an offset - each refused
--   4. DST           an instant on either side of the 2026-11-01 transition is stored verbatim
--   5. detach        "this one" survives an "all events" edit; naming it in p_rows refuses the
--                    call; series_detached without a series is refused by the check
--   6. following     the split makes a new series, keeps the row ids, shortens until_date
--   7. all           only future, non-detached rows change
--   8. delete        "all" leaves past rows behind with series_id null and the flag cleared
--   9. boundary      another uid sees nothing and changes nothing; anon holds nothing
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. Every write is inside the
-- transaction and the last statement is `rollback`, so prod is untouched either way.
--
-- Ids travel between statements in transaction-local GUCs (`set_config(..., true)`) rather than
-- a temp table: the test runs as `authenticated`, which holds no TEMP privilege, and a GUC is
-- rolled back with everything else.

begin;

-- =============================================================================================
-- 0. Become the owner, and remember what the tables held before
-- =============================================================================================
select set_config('request.jwt.claim.sub', (select app_owner()::text), true);
select set_config('w35.events_before', (select count(*)::text from planner_events), true);
select set_config('w35.series_before', (select count(*)::text from planner_event_series), true);

set local role authenticated;

-- =============================================================================================
-- 1. Bounds: 0 rows and 53 rows are refused
-- =============================================================================================
do $$
declare
  v_53 jsonb;
begin
  begin
    perform planner_series_create('weekly', date '2026-11-12', '[]'::jsonb);
    raise exception 'FAIL an empty p_rows was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform planner_series_create('weekly', date '2026-11-12', 'null'::jsonb);
    raise exception 'FAIL a json null p_rows was accepted';
  exception when sqlstate '22023' then null;
  end;

  select jsonb_agg(jsonb_build_object(
           'kind', 'event',
           'title', '[W-35 test] over the cap ' || i,
           'starts_at', (date '2027-01-07' + i)::text || 'T18:00:00-05:00',
           'ends_at',   (date '2027-01-07' + i)::text || 'T19:00:00-05:00',
           'time_zone', 'America/New_York',
           'all_day', false))
    into v_53
    from generate_series(0, 52) i;                      -- 53 elements

  begin
    perform planner_series_create('daily', date '2027-02-28', v_53);
    raise exception 'FAIL 53 occurrences were accepted';
  exception when sqlstate '22023' then null;
  end;

  -- An unknown p_freq and a missing p_until are refused too.
  begin
    perform planner_series_create('fortnightly', date '2026-11-12',
      '[{"kind":"event","title":"x","starts_at":"2026-10-01T18:00:00-04:00",
         "ends_at":"2026-10-01T19:00:00-04:00","time_zone":"America/New_York","all_day":false}]'::jsonb);
    raise exception 'FAIL an unknown frequency was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform planner_series_create('weekly', null,
      '[{"kind":"event","title":"x","starts_at":"2026-10-01T18:00:00-04:00",
         "ends_at":"2026-10-01T19:00:00-04:00","time_zone":"America/New_York","all_day":false}]'::jsonb);
    raise exception 'FAIL a series with no end date was accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- =============================================================================================
-- 2. The cap trigger: 52 is the ceiling, and one statement cannot walk past it
-- =============================================================================================
do $$
declare
  v_52    jsonb;
  v_cap   uuid;
  v_first uuid;
begin
  select jsonb_agg(jsonb_build_object(
           'kind', 'event',
           'title', '[W-35 test] cap day ' || i,
           'starts_at', (date '2027-01-07' + i)::text || 'T18:00:00-05:00',
           'ends_at',   (date '2027-01-07' + i)::text || 'T19:00:00-05:00',
           'time_zone', 'America/New_York',
           'all_day', false))
    into v_52
    from generate_series(0, 51) i;                      -- 52 elements, all inside EST

  v_cap := planner_series_create('daily', date '2027-02-27', v_52);
  if (select count(*) from planner_events where series_id = v_cap) <> 52 then
    raise exception 'FAIL a 52-occurrence series did not land whole';
  end if;

  -- One more row, on its own.
  begin
    insert into planner_events (kind, title, starts_at, ends_at, time_zone, all_day, series_id)
    values ('event', '[W-35 test] the 53rd', timestamptz '2027-02-28 18:00:00-05',
            timestamptz '2027-02-28 19:00:00-05', 'America/New_York', false, v_cap);
    raise exception 'FAIL a 53rd occurrence was accepted';
  exception when check_violation then null;
  end;

  -- Two more rows in ONE statement: a per-row trigger could not see its own command, which is
  -- why 082's cap runs after the statement with a transition table.
  begin
    insert into planner_events (kind, title, starts_at, ends_at, time_zone, all_day, series_id)
    select 'event', '[W-35 test] the 53rd and 54th', d, d + interval '1 hour',
           'America/New_York', false, v_cap
      from (values (timestamptz '2027-02-28 18:00:00-05'),
                   (timestamptz '2027-03-01 18:00:00-05')) as t(d);
    raise exception 'FAIL two rows in one statement walked past the cap';
  exception when check_violation then null;
  end;

  -- And moving an existing row into a full series is refused as well.
  insert into planner_events (kind, title, starts_at, ends_at, time_zone, all_day)
  values ('event', '[W-35 test] a one-off', timestamptz '2027-03-04 18:00:00-05',
          timestamptz '2027-03-04 19:00:00-05', 'America/New_York', false)
  returning id into v_first;
  begin
    update planner_events set series_id = v_cap where id = v_first;
    raise exception 'FAIL an existing row was moved into a full series';
  exception when check_violation then null;
  end;

  -- 082's check: a row with no series cannot be detached from one.
  begin
    update planner_events set series_detached = true where id = v_first;
    raise exception 'FAIL a one-off row was marked series_detached';
  exception when check_violation then null;
  end;

  delete from planner_events where id = v_first;
  perform planner_series_delete(v_cap, 'all', null);
end $$;

-- =============================================================================================
-- 3. Shape: what the gate refuses
-- =============================================================================================
do $$
declare
  v_ok  jsonb := '{"kind":"event","title":"[W-35 test] shape",
                   "starts_at":"2026-10-01T18:00:00-04:00",
                   "ends_at":"2026-10-01T19:00:00-04:00",
                   "time_zone":"America/New_York","all_day":false}'::jsonb;
  v_bad jsonb;
  v_lbl text;
begin
  foreach v_lbl in array array[
      'a nested array',      -- 080's lesson: lax mode would unwrap this
      'a missing key',
      'a wrong type',
      'a wall clock with no offset',
      'an unknown key',
      'a non-object element']
  loop
    v_bad := case v_lbl
      when 'a nested array'               then jsonb_build_array(jsonb_build_array(v_ok))
      when 'a missing key'                then jsonb_build_array(v_ok - 'time_zone')
      when 'a wrong type'                 then jsonb_build_array(jsonb_set(v_ok, '{all_day}', '"no"'))
      when 'a wall clock with no offset'  then jsonb_build_array(
                                                 jsonb_set(v_ok, '{starts_at}', '"2026-10-01T18:00:00"'))
      when 'an unknown key'               then jsonb_build_array(v_ok || '{"colour":"blue"}'::jsonb)
      when 'a non-object element'         then jsonb_build_array(v_ok, 7)
    end;
    begin
      perform planner_series_create('weekly', date '2026-11-12', v_bad);
      raise exception 'FAIL % was accepted', v_lbl;
    exception when sqlstate '22023' then null;
    end;
  end loop;

  -- A nested array must be refused for a reason, not because of some other rule: the same rows
  -- without the wrapper are accepted.
  perform planner_series_delete(planner_series_create('weekly', date '2026-11-12',
                                                      jsonb_build_array(v_ok)), 'all', null);
end $$;

-- =============================================================================================
-- 4. The fixture: one weekly series, five Thursdays, two of them after the DST change
-- =============================================================================================
do $$
declare
  v_series uuid;
begin
  v_series := planner_series_create('weekly', date '2026-11-12', jsonb_build_array(
    jsonb_build_object('kind','event','title','[W-35 test] Thursday study',
      'starts_at','2026-09-10T18:00:00-04:00','ends_at','2026-09-10T19:00:00-04:00',
      'time_zone','America/New_York','all_day',false),
    jsonb_build_object('kind','event','title','[W-35 test] Thursday study',
      'starts_at','2026-10-01T18:00:00-04:00','ends_at','2026-10-01T19:00:00-04:00',
      'time_zone','America/New_York','all_day',false),
    jsonb_build_object('kind','event','title','[W-35 test] Thursday study',
      'starts_at','2026-10-08T18:00:00-04:00','ends_at','2026-10-08T19:00:00-04:00',
      'time_zone','America/New_York','all_day',false),
    jsonb_build_object('kind','event','title','[W-35 test] Thursday study',
      'starts_at','2026-11-05T18:00:00-05:00','ends_at','2026-11-05T19:00:00-05:00',
      'time_zone','America/New_York','all_day',false),
    jsonb_build_object('kind','event','title','[W-35 test] Thursday study',
      'starts_at','2026-11-12T18:00:00-05:00','ends_at','2026-11-12T19:00:00-05:00',
      'time_zone','America/New_York','all_day',false)));

  perform set_config('w35.series', v_series::text, true);
  perform set_config('w35.r1', (select id::text from planner_events
                                 where series_id = v_series and starts_at = '2026-09-10T18:00:00-04:00'), true);
  perform set_config('w35.r2', (select id::text from planner_events
                                 where series_id = v_series and starts_at = '2026-10-01T18:00:00-04:00'), true);
  perform set_config('w35.r3', (select id::text from planner_events
                                 where series_id = v_series and starts_at = '2026-10-08T18:00:00-04:00'), true);
  perform set_config('w35.r4', (select id::text from planner_events
                                 where series_id = v_series and starts_at = '2026-11-05T18:00:00-05:00'), true);
  perform set_config('w35.r5', (select id::text from planner_events
                                 where series_id = v_series and starts_at = '2026-11-12T18:00:00-05:00'), true);

  if (select count(*) from planner_events where series_id = v_series) <> 5 then
    raise exception 'FAIL the fixture series does not hold five rows';
  end if;
  if (select count(*) from planner_events where series_id = v_series and series_detached) <> 0 then
    raise exception 'FAIL a freshly created occurrence is already detached';
  end if;
  if (select until_date from planner_event_series where id = v_series) <> date '2026-11-12' then
    raise exception 'FAIL until_date is not what was asked for';
  end if;
  if not (select gcal_dirty from app_settings where id) then
    raise exception 'FAIL creating a series did not arm the calendar push';
  end if;
end $$;

-- =============================================================================================
-- 5. DST: the instants are the ones the client sent, and each reads 18:00 locally
-- =============================================================================================
do $$
declare
  v_series uuid := current_setting('w35.series')::uuid;
  v_bad    text;
begin
  if (select starts_at from planner_events where id = current_setting('w35.r3')::uuid)
     <> timestamptz '2026-10-08 18:00:00-04' then
    raise exception 'FAIL the pre-transition instant was not stored verbatim';
  end if;
  if (select starts_at from planner_events where id = current_setting('w35.r4')::uuid)
     <> timestamptz '2026-11-05 18:00:00-05' then
    raise exception 'FAIL the post-transition instant was not stored verbatim';
  end if;

  -- Both read 18:00 in New York although their UTC offsets differ by an hour: that is what
  -- "the web converted once, SQL never re-derived" looks like from here.
  select string_agg(to_char(pe.starts_at at time zone pe.time_zone, 'YYYY-MM-DD HH24:MI'), ', '
                    order by pe.starts_at) into v_bad
    from planner_events pe
   where pe.series_id = v_series
     and (pe.starts_at at time zone pe.time_zone)::time <> time '18:00';
  if v_bad is not null then
    raise exception 'FAIL these occurrences do not read 18:00 locally: %', v_bad;
  end if;
end $$;

-- =============================================================================================
-- 6. Detach: "this one" is edited and then left alone by "all events"
-- =============================================================================================
do $$
declare
  v_series uuid := current_setting('w35.series')::uuid;
  v_r2 uuid := current_setting('w35.r2')::uuid;
  v_r3 uuid := current_setting('w35.r3')::uuid;
  v_r4 uuid := current_setting('w35.r4')::uuid;
  v_r5 uuid := current_setting('w35.r5')::uuid;
  v_n  int;
begin
  -- "This one" needs no RPC: an ordinary update that sets the flag.
  update planner_events
     set title = '[W-35 test] moved on its own', series_detached = true
   where id = v_r3;

  -- Naming a detached row in an "all events" edit refuses the whole call.
  begin
    perform planner_series_update(v_series, 'all', null, jsonb_build_array(
      jsonb_build_object('id', v_r3, 'kind','event','title','[W-35 test] rewritten',
        'starts_at','2026-10-08T18:00:00-04:00','ends_at','2026-10-08T19:00:00-04:00',
        'time_zone','America/New_York','all_day',false)));
    raise exception 'FAIL a detached row was rewritten by an "all events" edit';
  exception when sqlstate '22023' then null;
  end;

  -- A past row is out of scope for "all events" as well.
  begin
    perform planner_series_update(v_series, 'all', null, jsonb_build_array(
      jsonb_build_object('id', current_setting('w35.r1'), 'kind','event','title','[W-35 test] past',
        'starts_at','2026-09-10T18:00:00-04:00','ends_at','2026-09-10T19:00:00-04:00',
        'time_zone','America/New_York','all_day',false)));
    raise exception 'FAIL a past row was rewritten by an "all events" edit';
  exception when sqlstate '22023' then null;
  end;

  -- The real "all events" edit: the three future, non-detached rows.
  v_n := planner_series_update(v_series, 'all', null, (
    select jsonb_agg(jsonb_build_object(
             'id', pe.id, 'kind','event', 'title','[W-35 test] Thursday deep work',
             'starts_at', to_json(pe.starts_at)#>>'{}',
             'ends_at',   to_json(pe.ends_at)#>>'{}',
             'time_zone', pe.time_zone, 'all_day', false, 'notes', 'rewritten by all'))
      from planner_events pe where pe.id in (v_r2, v_r4, v_r5)));
  if v_n <> 3 then
    raise exception 'FAIL "all events" reported % rows, expected 3', v_n;
  end if;

  if (select count(*) from planner_events
       where id in (v_r2, v_r4, v_r5) and title = '[W-35 test] Thursday deep work') <> 3 then
    raise exception 'FAIL the three future rows were not rewritten';
  end if;
  if (select title from planner_events where id = v_r3) <> '[W-35 test] moved on its own' then
    raise exception 'FAIL the detached row was rewritten after all';
  end if;
  if (select title from planner_events where id = current_setting('w35.r1')::uuid)
     <> '[W-35 test] Thursday study' then
    raise exception 'FAIL the past row was rewritten';
  end if;
  if (select count(*) from planner_events where series_id = v_series) <> 5 then
    raise exception 'FAIL "all events" changed how many rows the series holds';
  end if;
end $$;

-- =============================================================================================
-- 7. "This and following": a new series, the same row ids, a shorter until_date
-- =============================================================================================
do $$
declare
  v_series uuid := current_setting('w35.series')::uuid;
  v_r2 uuid := current_setting('w35.r2')::uuid;
  v_r4 uuid := current_setting('w35.r4')::uuid;
  v_r5 uuid := current_setting('w35.r5')::uuid;
  v_cut timestamptz := timestamptz '2026-11-05 18:00:00-05';
  v_new uuid;
  v_n   int;
begin
  -- A row before the cut is out of scope, so naming it refuses the call.
  begin
    perform planner_series_update(v_series, 'following', v_cut, jsonb_build_array(
      jsonb_build_object('id', v_r2, 'kind','event','title','[W-35 test] too early',
        'starts_at','2026-10-01T18:00:00-04:00','ends_at','2026-10-01T19:00:00-04:00',
        'time_zone','America/New_York','all_day',false)));
    raise exception 'FAIL a row before the cut was rewritten by "this and following"';
  exception when sqlstate '22023' then null;
  end;

  v_n := planner_series_update(v_series, 'following', v_cut, jsonb_build_array(
    jsonb_build_object('id', v_r4, 'kind','event','title','[W-35 test] Friday deep work',
      'starts_at','2026-11-06T18:00:00-05:00','ends_at','2026-11-06T19:00:00-05:00',
      'time_zone','America/New_York','all_day',false),
    jsonb_build_object('id', v_r5, 'kind','event','title','[W-35 test] Friday deep work',
      'starts_at','2026-11-13T18:00:00-05:00','ends_at','2026-11-13T19:00:00-05:00',
      'time_zone','America/New_York','all_day',false)));
  if v_n <> 2 then
    raise exception 'FAIL "this and following" reported % rows, expected 2', v_n;
  end if;

  select distinct series_id into v_new from planner_events where id in (v_r4, v_r5);
  if v_new is null or v_new = v_series then
    raise exception 'FAIL the split did not move the rows to a new series';
  end if;
  perform set_config('w35.new_series', v_new::text, true);

  -- The ids are the ones that existed before: Google sees a patch, never delete + insert.
  if (select count(*) from planner_events where id in (v_r4, v_r5)) <> 2 then
    raise exception 'FAIL the split lost a row id';
  end if;
  if (select count(*) from planner_events
       where id in (v_r4, v_r5) and title = '[W-35 test] Friday deep work') <> 2 then
    raise exception 'FAIL the split did not apply the new text';
  end if;

  -- The new series carries the old rule; the old one now ends the day before the cut.
  if (select freq from planner_event_series where id = v_new) <> 'weekly'
     or (select until_date from planner_event_series where id = v_new) <> date '2026-11-12' then
    raise exception 'FAIL the new series does not carry the old rule';
  end if;
  if (select until_date from planner_event_series where id = v_series) <> date '2026-11-04' then
    raise exception 'FAIL the old series until_date is %, expected 2026-11-04',
      (select until_date from planner_event_series where id = v_series);
  end if;

  -- The rows before the cut stayed where they were, detached row included.
  if (select count(*) from planner_events where series_id = v_series) <> 3 then
    raise exception 'FAIL the old series should keep its three earlier rows';
  end if;
end $$;

-- =============================================================================================
-- 8. Delete: "following" on the new series, then "all" on the old one
-- =============================================================================================
do $$
declare
  v_series uuid := current_setting('w35.series')::uuid;
  v_new    uuid := current_setting('w35.new_series')::uuid;
  v_r1 uuid := current_setting('w35.r1')::uuid;
  v_r2 uuid := current_setting('w35.r2')::uuid;
  v_r3 uuid := current_setting('w35.r3')::uuid;
  v_r4 uuid := current_setting('w35.r4')::uuid;
  v_r5 uuid := current_setting('w35.r5')::uuid;
  v_n  int;
begin
  -- "This and following" from the second of the two: one row goes, the series stays.
  v_n := planner_series_delete(v_new, 'following', timestamptz '2026-11-13 18:00:00-05');
  if v_n <> 1 then
    raise exception 'FAIL "following" deleted % rows, expected 1', v_n;
  end if;
  if exists (select 1 from planner_events where id = v_r5) then
    raise exception 'FAIL the row at the cut was not deleted';
  end if;
  if not exists (select 1 from planner_events where id = v_r4) then
    raise exception 'FAIL the row before the cut was deleted';
  end if;
  if (select until_date from planner_event_series where id = v_new) <> date '2026-11-12' then
    raise exception 'FAIL the new series until_date is %, expected 2026-11-12',
      (select until_date from planner_event_series where id = v_new);
  end if;

  -- "All events" on the old series: the two future rows go (the detached one among them), the
  -- past row stays behind as an ordinary event, and the series row itself is gone.
  v_n := planner_series_delete(v_series, 'all', null);
  if v_n <> 2 then
    raise exception 'FAIL "all events" deleted % rows, expected 2 (r2 and the detached r3)', v_n;
  end if;
  if exists (select 1 from planner_events where id in (v_r2, v_r3)) then
    raise exception 'FAIL a future occurrence survived "all events"';
  end if;
  if exists (select 1 from planner_event_series where id = v_series) then
    raise exception 'FAIL the series row survived "all events"';
  end if;
  if not exists (select 1 from planner_events
                  where id = v_r1 and series_id is null and not series_detached) then
    raise exception 'FAIL the past occurrence did not stay behind with series_id null';
  end if;
  if (select title from planner_events where id = v_r1) <> '[W-35 test] Thursday study' then
    raise exception 'FAIL the past occurrence was altered by the delete';
  end if;

  -- A series that no longer exists refuses both RPCs.
  begin
    perform planner_series_delete(v_series, 'all', null);
    raise exception 'FAIL deleting a missing series was accepted';
  exception when no_data_found then null;
  end;
  begin
    perform planner_series_update(v_series, 'all', null, jsonb_build_array(
      jsonb_build_object('id', v_r1, 'kind','event','title','x',
        'starts_at','2026-09-10T18:00:00-04:00','ends_at','2026-09-10T19:00:00-04:00',
        'time_zone','America/New_York','all_day',false)));
    raise exception 'FAIL updating a missing series was accepted';
  exception when no_data_found then null;
  end;

  -- Tidy the fixture back to nothing: the leftover past row, then the split series and its one
  -- remaining (future) row, which "all events" takes with it.
  delete from planner_events where id = v_r1;
  perform planner_series_delete(v_new, 'all', null);
end $$;

-- =============================================================================================
-- 9. The boundary: another uid sees nothing and writes nothing
-- =============================================================================================
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
set local role authenticated;

do $$
declare
  v_series uuid;
begin
  if (select count(*) from planner_event_series) <> 0 then
    raise exception 'FAIL a stranger can read % series rows',
      (select count(*) from planner_event_series);
  end if;
  if (select count(*) from planner_events) <> 0 then
    raise exception 'FAIL a stranger can read planner_events';
  end if;

  begin
    v_series := planner_series_create('weekly', date '2026-11-12', jsonb_build_array(
      jsonb_build_object('kind','event','title','[W-35 test] stranger',
        'starts_at','2026-10-01T18:00:00-04:00','ends_at','2026-10-01T19:00:00-04:00',
        'time_zone','America/New_York','all_day',false)));
    raise exception 'FAIL a stranger created series %', v_series;
  exception when insufficient_privilege then null;
  end;

  begin
    perform planner_series_update(gen_random_uuid(), 'all', null, jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'kind','event','title','x',
        'starts_at','2026-10-01T18:00:00-04:00','ends_at','2026-10-01T19:00:00-04:00',
        'time_zone','America/New_York','all_day',false)));
    raise exception 'FAIL a stranger updated a series';
  exception when no_data_found then null;
  end;
end $$;

reset role;

-- =============================================================================================
-- 10. Grants: anon holds nothing, and neither anon nor PUBLIC may call the RPCs
-- =============================================================================================
do $$
declare
  v_bad text;
begin
  select string_agg(grantee || ' ' || privilege_type, ', ' order by grantee, privilege_type)
    into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'planner_event_series'
     and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type = 'TRUNCATE'));
  if v_bad is not null then
    raise exception 'FAIL planner_event_series grants %', v_bad;
  end if;

  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('planner_series_check_rows','planner_series_create',
                       'planner_series_update','planner_series_delete')
     and (p.proacl is null
          or has_function_privilege('anon', p.oid, 'execute')
          or exists (select 1 from unnest(p.proacl) a where a::text like '=%'));
  if v_bad is not null then
    raise exception 'FAIL these functions are callable by anon or PUBLIC: %', v_bad;
  end if;

  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'planner_event_series') <> 4 then
    raise exception 'FAIL planner_event_series does not have four policies';
  end if;
end $$;

-- =============================================================================================
-- 11. Nothing leaked out of the fixture
-- =============================================================================================
do $$
begin
  if (select count(*) from planner_events) <> current_setting('w35.events_before')::int then
    raise exception 'FAIL planner_events holds % rows, started with %',
      (select count(*) from planner_events), current_setting('w35.events_before');
  end if;
  if (select count(*) from planner_event_series) <> current_setting('w35.series_before')::int then
    raise exception 'FAIL planner_event_series holds % rows, started with %',
      (select count(*) from planner_event_series), current_setting('w35.series_before');
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_082_083_planner_series: PASS'                as result,
       planner_series_max_occurrences()                       as cap,
       current_setting('w35.events_before')                   as planner_events_at_start,
       current_setting('w35.series_before')                   as series_at_start;

rollback;
