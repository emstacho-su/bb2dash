-- bb2dash :: db/tests/phase10b_round2.sql
-- Phase 10b round 2. Tests migration 080 (strict item_scores shape check, grade_column_links
-- course_id cascade) and 081 (v_grade_model_items with a not-materialized latest CTE) against prod.
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. The file opens its own
-- transaction and its last statement is `rollback`: nothing it writes survives.

begin;

-- =============================================================================================
-- 1. 080 / R2-6: every malformed item_scores shape is refused; {} and numbers are accepted
-- =============================================================================================
do $$
declare
  shape   text;
  refused int := 0;
begin
  foreach shape in array array[
      '{"asg:ECN.304/exam-1": [1]}',        -- an array: lax mode used to unwrap it
      '{"asg:ECN.304/exam-1": []}',         -- an empty array: lax mode found no member at all
      '{"asg:ECN.304/exam-1": null}',
      '{"asg:ECN.304/exam-1": {"b": 1}}',   -- a nested object
      '{"asg:ECN.304/exam-1": "9"}',        -- a string
      '{"asg:ECN.304/exam-1": -1}',         -- a negative number
      '[9]',                                -- not an object
      'null'] loop
    begin
      insert into grade_scenarios (course_id, item_scores) values ('ECN.304', shape::jsonb);
      raise exception 'FAIL item_scores % was accepted', shape;
    exception when check_violation then
      refused := refused + 1;
    end;
  end loop;
  if refused <> 8 then
    raise exception 'FAIL refused % of 8 malformed shapes', refused;
  end if;

  insert into grade_scenarios (course_id, item_scores) values ('ECN.304', '{}');
  update grade_scenarios set item_scores = '{"a": 0, "b": 9.5, "c": 100}' where course_id = 'ECN.304';
  if (select item_scores from grade_scenarios where course_id = 'ECN.304') <> '{"a": 0, "b": 9.5, "c": 100}'::jsonb then
    raise exception 'FAIL a well-formed scenario did not store';
  end if;
end $$;

-- =============================================================================================
-- 2. 080 / R2-11: deleting a course removes its links (and, as before, its scenario)
-- =============================================================================================
-- A throwaway course, so the delete meets no other foreign key.
insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short)
select 'TEST.080', term_id, '_080_round2_1', 'TST', '080', 'M001', 'Round 2 cascade probe', 'Probe'
  from courses where id = 'IST.323';

insert into grade_column_links (course_id, column_id, excluded) values ('TEST.080', '_probe_col_1', true);
insert into grade_scenarios (course_id, item_scores) values ('TEST.080', '{"col:TEST.080:_probe_col_1": 1}');

do $$
begin
  delete from courses where id = 'TEST.080';
  if exists (select 1 from grade_column_links where course_id = 'TEST.080') then
    raise exception 'FAIL a course delete left its grade_column_links rows behind';
  end if;
  if exists (select 1 from grade_scenarios where course_id = 'TEST.080') then
    raise exception 'FAIL a course delete left its grade_scenarios row behind';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conname = 'grade_column_links_course_id_fkey') not like '%ON DELETE CASCADE%' then
    raise exception 'FAIL grade_column_links_course_id_fkey does not cascade';
  end if;
end $$;

-- =============================================================================================
-- 3. 081 / R2-13: same rows, no materialized CTE, the course filter below the join
-- =============================================================================================
do $$
declare
  n_view bigint; n_expected bigint; r record; plan text := '';
begin
  -- Row count unchanged: latest item + attendance columns + placeholders, computed from the base
  -- relations independently of the view (the same count phase10b_grade_model.sql 4a asserts).
  select count(*) into n_view from v_grade_model_items;
  select (select count(*) from v_gradebook_latest where column_kind in ('item', 'attendance'))
       + (select count(*) from assignments a
           where a.component_id is not null
             and not exists (select 1 from v_gradebook_latest g
                              where g.course_id = a.course_id and g.column_id = a.bb_column_id))
    into n_expected;
  if n_view <> n_expected then
    raise exception 'FAIL v_grade_model_items has % rows, expected %', n_view, n_expected;
  end if;

  if (select string_agg(attname, ',' order by attnum) from pg_attribute
       where attrelid = 'public.v_grade_model_items'::regclass and attnum > 0 and not attisdropped)
     <> 'scheme_course_id,item_key,assignment_id,shell_course_id,column_id,component_id,link_source,'
        'link_confidence,excluded,name,possible,score,is_exempt,column_kind,is_extra_credit,due_at,seen_at' then
    raise exception 'FAIL v_grade_model_items columns changed';
  end if;
  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.v_grade_model_items'::regclass and o = 'security_invoker=true')
     or has_table_privilege('anon', 'public.v_grade_model_items', 'select') then
    raise exception 'FAIL v_grade_model_items lost security_invoker or is readable by anon';
  end if;

  for r in execute 'explain (costs off) select * from v_grade_model_items where scheme_course_id = ''IST.323''' loop
    plan := plan || r."QUERY PLAN" || chr(10);
  end loop;
  -- 058 planned "CTE latest" plus two "CTE Scan on latest" nodes; 081 inlines both references.
  if position('CTE latest' in plan) > 0 or position('CTE Scan' in plan) > 0 then
    raise exception 'FAIL the latest CTE is still materialized:%', chr(10) || plan;
  end if;
  -- The scheme filter is applied on the courses scans, underneath the joins to the gradebook rows.
  if position('Seq Scan on courses c' in plan) = 0
     or position('Filter: (COALESCE(parent_course_id, id) = ''IST.323''::text)' in plan) = 0 then
    raise exception 'FAIL the scheme_course_id filter did not reach the courses scan:%', chr(10) || plan;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase10b_round2: PASS' as result,
       (select pg_get_constraintdef(oid) from pg_constraint
         where conname = 'grade_scenarios_item_scores_shape')  as shape_check,
       (select pg_get_constraintdef(oid) from pg_constraint
         where conname = 'grade_column_links_course_id_fkey')  as links_course_fk,
       (select count(*) from v_grade_model_items)                 as model_items;

rollback;
