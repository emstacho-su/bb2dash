-- bb2dash :: db/tests/phase10b_round2.sql
-- Phase 10b round 2. Tests migration 080 (strict item_scores shape check, grade_column_links
-- course_id cascade) against prod.
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
-- Pass
-- =============================================================================================
select 'phase10b_round2: PASS' as result,
       (select pg_get_constraintdef(oid) from pg_constraint
         where conname = 'grade_scenarios_item_scores_shape')  as shape_check,
       (select pg_get_constraintdef(oid) from pg_constraint
         where conname = 'grade_column_links_course_id_fkey')  as links_course_fk;

rollback;
