-- bb2dash :: db/tests/phase12b_089_work_items_due_on.sql
-- Phase 12b post-MVP tail, round 3. Tests migration 089: v_work_items.due_on (and the
-- suggested_start argument and the undated flag) read the NEW YORK date of due_at, not the UTC
-- date a bare `::date` produces on a server whose session zone is UTC.
--
--   1. the bug, on the real row the PM found: IST.323 Lab #1, due_at 2026-09-24 03:59+00
--      (Wednesday the 23rd at 11:59 PM in New York) reads due_on = 2026-09-23
--   2. a date-only item (due_at null) is untouched - it falls back to due_date
--   3. a mid-morning item is untouched - 10:00 AM New York is the same day either way
--   4. a DST-week 11:59 PM item: 2026-11-05 04:59+00 is EST, and reads 2026-11-04
--   5. the invariant across the whole table: no assignment's due_on differs from the New York
--      date of its due_at
--   6. the view's shape, setting and boundary are unchanged (24 columns, security_invoker,
--      nothing readable by anon or PUBLIC)
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. The three synthetic assignments
-- are inserted inside the transaction and the last statement is `rollback`, so prod is untouched.

begin;

select set_config('request.jwt.claim.sub', (select app_owner()::text), true);
select set_config('w35.items_before', (select count(*)::text from v_work_items), true);
select set_config('w35.undated_before', (select count(*)::text from v_work_items where undated), true);

set local role authenticated;

-- =============================================================================================
-- 1. The row the browser walk found
-- =============================================================================================
do $$
declare
  v_due  timestamptz;
  v_on   date;
begin
  select due_at, due_on into v_due, v_on
    from v_work_items where item_id = 'IST.323/lab-1-performing-a-ransomware-attack';
  if not found then
    raise exception 'FAIL the Lab #1 fixture row is gone from v_work_items';
  end if;

  -- The instant itself is still exactly what is stored - 089 changed the derived day, not due_at.
  if v_due <> timestamptz '2026-09-24 03:59:00+00' then
    raise exception 'FAIL due_at is %, expected 2026-09-24 03:59+00', v_due;
  end if;
  if (v_due at time zone 'America/New_York') <> timestamp '2026-09-23 23:59:00' then
    raise exception 'FAIL that instant is not 11:59 PM in New York';
  end if;
  if v_on <> date '2026-09-23' then
    raise exception 'FAIL due_on is %, expected 2026-09-23 (it was 2026-09-24 before 089)', v_on;
  end if;
end $$;

-- =============================================================================================
-- 2-4. Three synthetic rows: date-only, mid-morning, and a DST-week deadline
-- =============================================================================================
do $$
declare
  v_course text;
  v_on     date;
  v_start  date;
  v_undated boolean;
begin
  select id into v_course from courses order by id limit 1;

  insert into assignments (id, course_id, title, type, due_date) values
    ('W35.089/date-only', v_course, '[W-35 r3] a date-only item', 'homework', date '2026-10-06');
  insert into assignments (id, course_id, title, type, due_at) values
    ('W35.089/mid-morning', v_course, '[W-35 r3] 10:00 AM New York', 'homework',
     timestamptz '2026-10-01 14:00:00+00'),
    ('W35.089/dst-week', v_course, '[W-35 r3] 11:59 PM the week the clocks go back', 'homework',
     timestamptz '2026-11-05 04:59:00+00');

  -- 2. due_at is null, so the coalesce falls through to due_date exactly as before.
  select due_on, undated into v_on, v_undated
    from v_work_items where item_id = 'W35.089/date-only';
  if v_on <> date '2026-10-06' or v_undated then
    raise exception 'FAIL a date-only item reads due_on % / undated %', v_on, v_undated;
  end if;

  -- 3. 14:00 UTC is 10:00 EDT: the same calendar day in either zone, so nothing moves.
  select due_on into v_on from v_work_items where item_id = 'W35.089/mid-morning';
  if v_on <> date '2026-10-01' then
    raise exception 'FAIL a 10:00 AM item reads due_on %, expected 2026-10-01', v_on;
  end if;
  if (timestamptz '2026-10-01 14:00:00+00' at time zone 'America/New_York')::time
     <> time '10:00' then
    raise exception 'FAIL the mid-morning fixture is not 10:00 in New York';
  end if;

  -- 4. The clocks go back on 2026-11-01, so 04:59 UTC on the 5th is 23:59 EST on the 4th.
  select due_on into v_on from v_work_items where item_id = 'W35.089/dst-week';
  if v_on <> date '2026-11-04' then
    raise exception 'FAIL the DST-week item reads due_on %, expected 2026-11-04', v_on;
  end if;
  if (timestamptz '2026-11-05 04:59:00+00' at time zone 'America/New_York')
     <> timestamp '2026-11-04 23:59:00' then
    raise exception 'FAIL the DST-week fixture is not 11:59 PM in New York';
  end if;

  -- suggested_start is derived from the same day, so it moved with it: it is counted back from
  -- the 4th, not the 5th.
  select due_on, suggested_start into v_on, v_start
    from v_work_items where item_id = 'W35.089/dst-week';
  if v_start is null or v_start > v_on then
    raise exception 'FAIL suggested_start % is not on or before due_on %', v_start, v_on;
  end if;

  delete from assignments
   where id in ('W35.089/date-only', 'W35.089/mid-morning', 'W35.089/dst-week');
end $$;

-- =============================================================================================
-- 5. The invariant, across every row
-- =============================================================================================
do $$
declare
  v_bad text;
begin
  select string_agg(w.item_id || ' (' || w.due_on::text || ' vs '
                    || (w.due_at at time zone 'America/New_York')::date::text || ')', ', ')
    into v_bad
    from v_work_items w
   where w.item_kind = 'assignment'
     and w.due_at is not null
     and w.due_on <> (w.due_at at time zone 'America/New_York')::date;
  if v_bad is not null then
    raise exception 'FAIL these items are still on their UTC day: %', v_bad;
  end if;

  -- The reading arm is a date already and must not have been touched.
  if exists (select 1 from v_work_items w join readings r on r.id::text = w.item_id
              where w.item_kind = 'reading' and w.due_on is distinct from r.for_date) then
    raise exception 'FAIL a reading''s due_on no longer equals its for_date';
  end if;

  -- Nothing appeared or vanished, and nothing became undated.
  if (select count(*) from v_work_items) <> current_setting('w35.items_before')::int then
    raise exception 'FAIL v_work_items holds % rows, started with %',
      (select count(*) from v_work_items), current_setting('w35.items_before');
  end if;
  if (select count(*) from v_work_items where undated) <> current_setting('w35.undated_before')::int then
    raise exception 'FAIL % rows are undated, started with %',
      (select count(*) from v_work_items where undated), current_setting('w35.undated_before');
  end if;
end $$;

reset role;

-- =============================================================================================
-- 6. The view itself: shape, setting, boundary, and no bare cast left anywhere
-- =============================================================================================
do $$
declare
  n_cols int;
  bad    text;
begin
  select count(*) into n_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'v_work_items';
  if n_cols <> 24 then
    raise exception 'FAIL v_work_items has % columns, expected 24', n_cols;
  end if;

  if not exists (select 1 from pg_options_to_table(
                   (select reloptions from pg_class where oid = 'v_work_items'::regclass))
                  where option_name = 'security_invoker' and option_value = 'true') then
    raise exception 'FAIL v_work_items is not security_invoker';
  end if;

  select string_agg(grantee || ' ' || privilege_type, ', ') into bad
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'v_work_items'
     and grantee in ('anon', 'PUBLIC');
  if bad is not null then
    raise exception 'FAIL v_work_items is readable by %', bad;
  end if;

  if pg_get_viewdef('v_work_items'::regclass, true) like '%a.due_at::date%' then
    raise exception 'FAIL v_work_items still casts due_at to a date without a zone';
  end if;

  -- The two dependent views still resolve against the replaced definition.
  perform 1 from v_calendar_push_items limit 1;
  perform 1 from v_course_stream limit 1;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_089_work_items_due_on: PASS'                                   as result,
       (select due_on from v_work_items
         where item_id = 'IST.323/lab-1-performing-a-ransomware-attack')         as lab1_due_on,
       current_setting('w35.items_before')                                       as items,
       current_setting('w35.undated_before')                                     as undated;

rollback;
