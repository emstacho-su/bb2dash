-- bb2dash :: db/tests/phase10b_grade_model.sql
-- Phase 10b. Tests migration 057 (grade_scenarios, grade_column_links + the same-course trigger)
-- and 058 (v_grade_model_items, v_grade_model_total, v_gradebook_history) against prod.
--
-- RUN IT: paste the whole file into one `execute_sql` call through the Supabase MCP, or
--
--   psql "$DATABASE_URL" -f db/tests/phase10b_grade_model.sql
--
-- A failing assertion raises, which is the failure signal; a pass ends with one summary row.
--
-- NOTHING IS COMMITTED. The file opens its own transaction and its last statement is `rollback`.
-- Every row it writes (one scenario, three links) exists only inside that transaction.
--
-- WHAT IS ASSERTED AGAINST LIVE DATA, AND HOW IT STAYS TRUE
--   Counts are compared with an independent computation over the base tables rather than with a
--   literal, because the next sync changes them. The two literals the Contract quotes are kept as
--   floors that can only grow: v_gradebook_history has at least 5 changed columns (the mirror is
--   append-only, so a change once seen never disappears), and IST.323's total reads
--   bb_running = true (its formula says "running": true).

begin;

-- =============================================================================================
-- 0. Seed: rows to hide from anon and from a non-owner
-- =============================================================================================
-- Written as the migration role (RLS does not apply to it), so the RLS checks in section 1 have
-- something real to hide. Section 3 repeats a write as the owner, through RLS.
insert into grade_scenarios (course_id, item_scores, target_letter)
values ('IST.466', '{"col:IST.466:_3562496_1": 120}', 'B+');

insert into grade_column_links (course_id, column_id, component_id)
values ('IST.466', '_3562496_1', 24);               -- Synchrony Major Case #1 -> Major Cases

-- =============================================================================================
-- 1. RLS: anon and a non-owner see nothing
-- =============================================================================================
-- anon has no grant on any of the five relations (036's rule for the views, 057's revoke for the
-- tables), so a read is refused outright; a refusal is recorded as "0 rows visible". Any row
-- actually returned fails the test.
set local role anon;
do $$
declare
  rel text;
  n   bigint;
  seen text := '';
begin
  foreach rel in array array['grade_scenarios', 'grade_column_links', 'v_grade_model_items',
                             'v_grade_model_total', 'v_gradebook_history'] loop
    begin
      execute format('select count(*) from public.%I', rel) into n;
    exception when insufficient_privilege then
      n := 0;
      seen := seen || rel || ' denied; ';
    end;
    if n <> 0 then
      raise exception 'FAIL anon sees % row(s) of %', n, rel;
    end if;
  end loop;
  raise notice 'anon: %', seen;
end $$;
reset role;

-- A different authenticated uid: the grants let it ask, RLS answers with nothing.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  rel text;
  n   bigint;
begin
  foreach rel in array array['grade_scenarios', 'grade_column_links', 'v_grade_model_items',
                             'v_grade_model_total', 'v_gradebook_history'] loop
    execute format('select count(*) from public.%I', rel) into n;
    if n <> 0 then
      raise exception 'FAIL non-owner uid sees % row(s) of %', n, rel;
    end if;
  end loop;

  -- ...and cannot write either. The trigger resolves nothing under its RLS, so a component link is
  -- refused before the policy is consulted; an excluded link reaches the policy and fails there.
  begin
    insert into grade_column_links (course_id, column_id, excluded) values ('IST.323', '_probe_1', true);
    raise exception 'FAIL a non-owner inserted a grade_column_links row';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into grade_column_links (course_id, column_id, component_id) values ('IST.323', '_probe_2', 11);
    raise exception 'FAIL a non-owner inserted a component link';
  exception when check_violation or insufficient_privilege then null;
  end;
  begin
    insert into grade_scenarios (course_id) values ('ECN.304');
    raise exception 'FAIL a non-owner inserted a grade_scenarios row';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- =============================================================================================
-- 2. Check constraints on grade_scenarios
-- =============================================================================================
do $$
begin
  begin
    insert into grade_scenarios (course_id, item_scores) values ('ECN.304', '{"asg:ECN.304/exam-1": "9"}');
    raise exception 'FAIL a string score was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into grade_scenarios (course_id, item_scores) values ('ECN.304', '{"asg:ECN.304/exam-1": -1}');
    raise exception 'FAIL a negative score was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into grade_scenarios (course_id, item_scores) values ('ECN.304', '[9]');
    raise exception 'FAIL a non-object item_scores was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into grade_scenarios (course_id, target_letter) values ('ECN.304', 'A+++');
    raise exception 'FAIL a four-character target letter was accepted';
  exception when check_violation then null;
  end;

  -- The positive case: zero and a decimal are both fine.
  insert into grade_scenarios (course_id, item_scores) values ('ECN.304', '{"a": 0, "b": 9.5}');
  delete from grade_scenarios where course_id = 'ECN.304';

  begin
    insert into grade_column_links (course_id, column_id, component_id, excluded)
    values ('IST.323', '_probe_3', 11, true);
    raise exception 'FAIL a link with both a component and excluded was accepted';
  exception when check_violation then null;
  end;
end $$;

-- =============================================================================================
-- 3. The same-course trigger, and a write as the owner through RLS
-- =============================================================================================
select set_config('request.jwt.claims',
                  json_build_object('sub', public.app_owner(), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_updated timestamptz;
begin
  -- An IST.323 column may not count toward ECN.304's Participation (component 1).
  begin
    insert into grade_column_links (course_id, column_id, component_id)
    values ('IST.323', '_3560541_1', 1);
    raise exception 'FAIL the trigger accepted a component from another course';
  exception when check_violation then null;
  end;

  -- ...nor may an update move an existing link across courses.
  begin
    update grade_column_links set component_id = 1
     where course_id = 'IST.466' and column_id = '_3562496_1';
    raise exception 'FAIL the trigger accepted an update to a component from another course';
  exception when check_violation then null;
  end;

  -- A GEO 103 recitation column may count toward a lecture component: the recitation rolls up to
  -- the lecture's scheme (courses.parent_course_id).
  insert into grade_column_links (course_id, column_id, component_id)
  values ('GEO.103.recitation', '_3602445_1', 5);   -- Attendance -> Discussion Section Participation

  -- "Not graded" needs no component and passes the trigger untouched.
  insert into grade_column_links (course_id, column_id, excluded)
  values ('IST.323', '_3598132_1', true);           -- Individual Presentation Selection

  -- The owner reads what the migration role wrote, and updated_at moves on update.
  if (select count(*) from grade_scenarios where course_id = 'IST.466') <> 1 then
    raise exception 'FAIL the owner cannot read the IST.466 scenario';
  end if;
  update grade_scenarios set target_letter = 'A' where course_id = 'IST.466'
  returning updated_at into v_updated;
  if v_updated is null then
    raise exception 'FAIL the owner could not update the scenario through RLS';
  end if;
end $$;
reset role;

-- =============================================================================================
-- 4. v_grade_model_items
-- =============================================================================================
do $$
declare
  n_view bigint; n_expected bigint; r record;
begin
  -- 4a. Row count = latest item + attendance columns + placeholders, computed from the base
  --     relations independently of the view.
  select count(*) into n_view from v_grade_model_items;
  select (select count(*) from v_gradebook_latest where column_kind in ('item', 'attendance'))
       + (select count(*) from assignments a
           where a.component_id is not null
             and not exists (select 1 from v_gradebook_latest g
                              where g.course_id = a.course_id and g.column_id = a.bb_column_id))
    into n_expected;
  if n_view <> n_expected then
    raise exception 'FAIL v_grade_model_items has % rows, expected % (items + attendance + placeholders)',
      n_view, n_expected;
  end if;
  if exists (select 1 from v_grade_model_items where column_kind not in ('item', 'attendance', 'placeholder')) then
    raise exception 'FAIL a total, letter or calc_other column reached v_grade_model_items';
  end if;
  if exists (select 1 from v_grade_model_items group by item_key having count(*) > 1) then
    raise exception 'FAIL an item_key appears twice';
  end if;

  -- 4b. The override flips link_source / link_confidence. _3562496_1 is linked by assignment
  --     IST.466/major-project-1-synchrony with confidence tentative; section 0 wrote an override.
  select * into r from v_grade_model_items where item_key = 'col:IST.466:_3562496_1';
  if r.link_source is distinct from 'override' or r.link_confidence is distinct from 'confirmed'
     or r.component_id is distinct from 24::bigint or r.excluded then
    raise exception 'FAIL override not reflected: source %, confidence %, component %, excluded %',
      r.link_source, r.link_confidence, r.component_id, r.excluded;
  end if;
  -- Its sibling column has no override and keeps the assignment's unsure link.
  select * into r from v_grade_model_items where item_key = 'col:IST.466:_3562492_1';
  if r.link_source is distinct from 'assignment' or r.link_confidence is distinct from 'tentative' then
    raise exception 'FAIL the un-overridden major case reads source %, confidence %',
      r.link_source, r.link_confidence;
  end if;

  -- 4c. The GEO recitation link lands under the lecture's scheme course, as an override.
  select * into r from v_grade_model_items where item_key = 'col:GEO.103.recitation:_3602445_1';
  if r.scheme_course_id <> 'GEO.103.lecture' or r.shell_course_id <> 'GEO.103.recitation'
     or r.component_id is distinct from 5::bigint or r.link_source is distinct from 'override' then
    raise exception 'FAIL GEO recitation link reads scheme %, shell %, component %, source %',
      r.scheme_course_id, r.shell_course_id, r.component_id, r.link_source;
  end if;

  -- 4d. "Not graded": excluded, confirmed override.
  select * into r from v_grade_model_items where item_key = 'col:IST.323:_3598132_1';
  if not r.excluded or r.link_source is distinct from 'override' then
    raise exception 'FAIL the Not graded link reads excluded %, source %', r.excluded, r.link_source;
  end if;

  -- 4e. Placeholders carry no score and no column; extra credit is flagged.
  if exists (select 1 from v_grade_model_items
              where column_kind = 'placeholder' and (score is not null or column_id is not null)) then
    raise exception 'FAIL a placeholder carries a score or a column id';
  end if;
  if not (select is_extra_credit from v_grade_model_items where item_key = 'asg:IST.323/lab-extra-credit') then
    raise exception 'FAIL IST.323/lab-extra-credit is not flagged extra credit';
  end if;

  -- 4f. The ambiguous column (two linked assignments) reads as unlinked.
  select * into r from v_grade_model_items where item_key = 'col:IST.323:_3569973_1';
  if r.assignment_id is not null or r.component_id is not null or r.link_source is not null then
    raise exception 'FAIL the doubly-linked column resolved to assignment %, component %',
      r.assignment_id, r.component_id;
  end if;
end $$;

-- =============================================================================================
-- 5. v_grade_model_total and v_gradebook_history
-- =============================================================================================
do $$
declare
  v_running boolean; n_view bigint; n_expected bigint; n_rows bigint;
begin
  select bb_running into v_running from v_grade_model_total where scheme_course_id = 'IST.323';
  if v_running is distinct from true then
    raise exception 'FAIL IST.323 bb_running = %, expected true', v_running;
  end if;
  if exists (select 1 from v_grade_model_total group by scheme_course_id having count(*) > 1) then
    raise exception 'FAIL v_grade_model_total has two rows for one scheme course';
  end if;

  -- Changed columns, computed again from bb_gradebook with a self-join instead of lag().
  select count(*) into n_view
    from (select 1 from v_gradebook_history group by shell_course_id, column_id having count(*) > 1) h;
  select count(*) into n_expected from (
    select distinct later.course_id, later.column_id
      from bb_gradebook later
      join lateral (
        select prev.effective_score
          from bb_gradebook prev
         where prev.course_id = later.course_id and prev.column_id = later.column_id
           and (prev.seen_at, prev.id) < (later.seen_at, later.id)
           and exists (select 1 from sync_runs s where s.run_id = prev.run_id
                                                   and s.scope is distinct from 'unregistered')
         order by prev.seen_at desc, prev.id desc
         limit 1) p on true
     where exists (select 1 from sync_runs s where s.run_id = later.run_id
                                               and s.scope is distinct from 'unregistered')
       and later.effective_score is distinct from p.effective_score) c;
  if n_view <> n_expected then
    raise exception 'FAIL v_gradebook_history reports % changed columns, independent count %', n_view, n_expected;
  end if;
  if n_view < 5 then
    raise exception 'FAIL v_gradebook_history reports % changed columns; 5 were live on 2026-09-16', n_view;
  end if;

  -- Every column has exactly one first observation (previous_score null on it).
  select count(*) into n_rows
    from (select shell_course_id, column_id from v_gradebook_history group by 1, 2) k;
  if n_rows <> (select count(*) from (select distinct course_id, column_id from bb_gradebook gb
                                        where exists (select 1 from sync_runs s where s.run_id = gb.run_id
                                                        and s.scope is distinct from 'unregistered')) d) then
    raise exception 'FAIL v_gradebook_history does not carry every registered column once';
  end if;
end $$;

-- =============================================================================================
-- 6. Syncs never touch the new tables
-- =============================================================================================
do $$
declare v text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and p.proname <> 'grade_column_links_same_course'     -- 057's own trigger
     and (p.prosrc ilike '%grade_scenarios%' or p.prosrc ilike '%grade_column_links%');
  if v is not null then
    raise exception 'FAIL function(s) outside 057/058 reference the owner tables: %', v;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.grade_scenarios'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.grade_column_links'::regclass) then
    raise exception 'FAIL RLS is not enabled on both owner tables';
  end if;

  select string_agg(c.relname, ', ') into v
    from pg_class c
   where c.relname in ('v_grade_model_items', 'v_grade_model_total', 'v_gradebook_history')
     and not coalesce('security_invoker=true' = any (c.reloptions), false);
  if v is not null then
    raise exception 'FAIL view(s) not security_invoker: %', v;
  end if;
end $$;

-- =============================================================================================
-- 7. Pass
-- =============================================================================================
select 'phase10b_grade_model: PASS' as result,
       (select count(*) from v_grade_model_items)                                        as model_items,
       (select jsonb_object_agg(column_kind, n)
          from (select column_kind, count(*) as n from v_grade_model_items group by 1) k)  as kinds,
       (select count(*) from v_grade_model_items where link_confidence in ('tentative', 'inferred')) as unsure_links,
       (select bb_running from v_grade_model_total where scheme_course_id = 'IST.323')   as ist323_bb_running,
       (select count(*) from (select 1 from v_gradebook_history
                               group by shell_course_id, column_id having count(*) > 1) h) as history_changed_columns;

rollback;
