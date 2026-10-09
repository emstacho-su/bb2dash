-- bb2dash :: db/tests/phase16_107_counts_toward_links.sql
-- Phase 16 · migration 107 (v_gradebook_latest.counts_toward_grade follows the Grades tab's
-- "Counts toward..." picker, grade_column_links). Brief: docs/planning/sprint-2/verification/115_SQL_UNITS_AUDIT_2026-10-09.md, section C.
--
-- THE RULE UNDER TEST, for a gradebook row (course_id, column_id):
--   a grade_column_links row for it that is excluded ("Not graded")          -> false
--   else a grade_column_links row for it, not excluded, with a component_id   -> true
--   else what 047 always did: bool_or(assignments.component_id is not null)
--        over the assignments linked to the column, false when there are none.
-- 057 forbids a link that is neither: grade_column_links_one_target says (component_id is not null)
-- <> excluded, so "a link, not excluded, with a null component" cannot exist. Section 4 proves the
-- table refuses it, which is why there is no fourth fixture case.
--
-- WHAT IS ASSERTED
--   1  the first check: the view's definition mentions grade_column_links (107 is applied).
--   2  an invariant over EVERY live row: the flag equals the rule, computed here from the two tables.
--   3  fixtures on one live gradebook row, all inside this transaction: no link (the assignment with
--      a component, then without), an excluded link, a placed link; each case also compares the rest
--      of the view's row with its snapshot, so only the flag may move.
--   4  the table refuses a not-excluded link with no component (the reason for no case 4).
--   5  the invariant of 2 again after the fixtures, and the grade model view agrees with the flag.
--   6  inbox_apply_runner, which 181 lets read the view, still can (the view is security_invoker and
--      now reads grade_column_links, which that role was never granted).
--
-- HOW THE FIXTURE ROW IS PICKED (deterministic): the first row of v_gradebook_latest, by course_id
-- then column_id, whose column_kind is item or attendance, which links exactly one assignments row
-- (linked_assignments = 1), which has no grade_column_links row, and whose scheme course
-- (coalesce(courses.parent_course_id, courses.id)) has a grade_components row; the component used is
-- that scheme course's lowest id, so the fixtures obey the same-course trigger of 057. If no live row
-- qualifies the unit fails with a precondition message: that is a data state to read, not a pass.
--
-- SECTION 5's model comparison. v_grade_model_items (081) takes a column's component from a
-- non-excluded link first, else from the SINGLE linked assignment (assignment_id is null when the
-- column links several assignments, so its component is null then), and carries excluded from the link.
-- So (component_id is not null and not excluded) equals the flag wherever the column has a link, or
-- links at most one assignment. A column linked to several assignments with no link is left out: the
-- flag's fallback is bool_or over all of them and the model's is the single assignment's, which differ
-- there by design.
--
-- RUN IT: node scripts/db-test.mjs --only phase16_107_counts_toward_links.sql
-- Before 107 is applied it raises FAIL ... migration 107 is not applied. Nothing is committed: the
-- first statement is begin and the last is rollback.

begin;

-- =============================================================================================
-- 1. 107 is applied
-- =============================================================================================
do $$
begin
  if position('grade_column_links' in pg_get_viewdef('public.v_gradebook_latest'::regclass)) = 0 then
    raise exception 'FAIL phase16_107_counts_toward_links: migration 107 is not applied';
  end if;
end $$;

-- =============================================================================================
-- 2. The flag equals the rule on every live row
-- =============================================================================================
do $$
declare
  n_rows int;
  bad    text;
begin
  select count(*) into n_rows from public.v_gradebook_latest;
  if n_rows = 0 then
    raise exception 'FAIL precondition: v_gradebook_latest has no rows to check';
  end if;

  select string_agg(format('%s/%s: flag %s, rule %s', g.course_id, g.column_id,
                           g.counts_toward_grade, r.want),
                    '; ' order by g.course_id, g.column_id) into bad
    from public.v_gradebook_latest g
   cross join lateral (
     select case
              when exists (select 1 from public.grade_column_links l
                            where l.course_id = g.course_id and l.column_id = g.column_id
                              and l.excluded) then false
              when exists (select 1 from public.grade_column_links l
                            where l.course_id = g.course_id and l.column_id = g.column_id
                              and not l.excluded and l.component_id is not null) then true
              else coalesce((select bool_or(a.component_id is not null)
                               from public.assignments a
                              where a.course_id = g.course_id and a.bb_column_id = g.column_id), false)
            end as want) r
   where g.counts_toward_grade is distinct from r.want;
  if bad is not null then
    raise exception 'FAIL counts_toward_grade disagrees with the rule on live rows: %', bad;
  end if;
end $$;

-- =============================================================================================
-- 3. Fixtures on one live row: the flag moves with the link, nothing else in the row moves
-- =============================================================================================
do $$
declare
  v_course    text;
  v_column    text;
  v_asg       text;
  v_component bigint;
  v_base      jsonb;
  v_now       jsonb;
  v_flag      boolean;
  c           record;
begin
  select g.course_id, g.column_id, g.assignment_id,
         (select min(gc.id) from public.grade_components gc
           where gc.course_id = coalesce(co.parent_course_id, co.id))
    into v_course, v_column, v_asg, v_component
    from public.v_gradebook_latest g
    join public.courses co on co.id = g.course_id
   where g.column_kind in ('item', 'attendance')
     and g.linked_assignments = 1
     and g.assignment_id is not null
     and not exists (select 1 from public.grade_column_links l
                      where l.course_id = g.course_id and l.column_id = g.column_id)
     and exists (select 1 from public.grade_components gc
                  where gc.course_id = coalesce(co.parent_course_id, co.id))
   order by g.course_id, g.column_id
   limit 1;
  if v_column is null then
    raise exception 'FAIL precondition: no live item or attendance gradebook row links exactly one assignment, has no grade_column_links row and has a component in its scheme course';
  end if;

  -- The row as it is now, minus the flag: the baseline every case compares with.
  select to_jsonb(g) - 'counts_toward_grade' into v_base
    from public.v_gradebook_latest g where g.course_id = v_course and g.column_id = v_column;

  for c in
    select * from (values
      ('1a no link, assignment has a component',     'none',     true,  true),
      ('1b no link, assignment has no component',    'none',     false, false),
      ('2a excluded link, assignment has a component', 'excluded', true,  false),
      ('2b excluded link, assignment has no component', 'excluded', false, false),
      ('3a placed link, assignment has no component', 'placed',   false, true),
      ('3b placed link, assignment has a component',  'placed',   true,  true),
      ('1c link removed again, assignment has a component', 'none', true, true)
    ) as t(label, link_kind, asg_has_component, want)
  loop
    delete from public.grade_column_links where course_id = v_course and column_id = v_column;
    if c.link_kind = 'excluded' then
      insert into public.grade_column_links (course_id, column_id, component_id, excluded)
      values (v_course, v_column, null, true);
    elsif c.link_kind = 'placed' then
      insert into public.grade_column_links (course_id, column_id, component_id, excluded)
      values (v_course, v_column, v_component, false);
    end if;

    update public.assignments
       set component_id = case when c.asg_has_component then v_component end
     where id = v_asg;

    select g.counts_toward_grade, to_jsonb(g) - 'counts_toward_grade' into v_flag, v_now
      from public.v_gradebook_latest g where g.course_id = v_course and g.column_id = v_column;
    if v_flag is distinct from c.want then
      raise exception 'FAIL case %: % / % reads counts_toward_grade %, expected %',
        c.label, v_course, v_column, v_flag, c.want;
    end if;
    if v_now is distinct from v_base then
      raise exception 'FAIL case %: % / % changed a column other than counts_toward_grade', c.label, v_course, v_column;
    end if;
  end loop;
end $$;

-- =============================================================================================
-- 4. No case 4: 057 refuses a link that is not excluded and has no component
-- =============================================================================================
do $$
declare
  v_course text;
  v_column text;
begin
  select g.course_id, g.column_id into v_course, v_column
    from public.v_gradebook_latest g
   where not exists (select 1 from public.grade_column_links l
                      where l.course_id = g.course_id and l.column_id = g.column_id)
   order by g.course_id, g.column_id
   limit 1;
  if v_column is null then
    raise exception 'FAIL precondition: no gradebook row without a link to try the refused state on';
  end if;
  begin
    insert into public.grade_column_links (course_id, column_id, component_id, excluded)
    values (v_course, v_column, null, false);
    raise exception 'FAIL grade_column_links accepted a link with no component that is not excluded';
  exception when check_violation then
    null;  -- grade_column_links_one_target refused it, as 057 says
  end;
end $$;

-- =============================================================================================
-- 5. The invariant again, after the fixtures, and the grade model view agrees
-- =============================================================================================
do $$
declare
  bad text;
begin
  select string_agg(format('%s/%s: flag %s, rule %s', g.course_id, g.column_id,
                           g.counts_toward_grade, r.want),
                    '; ' order by g.course_id, g.column_id) into bad
    from public.v_gradebook_latest g
   cross join lateral (
     select case
              when exists (select 1 from public.grade_column_links l
                            where l.course_id = g.course_id and l.column_id = g.column_id
                              and l.excluded) then false
              when exists (select 1 from public.grade_column_links l
                            where l.course_id = g.course_id and l.column_id = g.column_id
                              and not l.excluded and l.component_id is not null) then true
              else coalesce((select bool_or(a.component_id is not null)
                               from public.assignments a
                              where a.course_id = g.course_id and a.bb_column_id = g.column_id), false)
            end as want) r
   where g.counts_toward_grade is distinct from r.want;
  if bad is not null then
    raise exception 'FAIL after the fixtures counts_toward_grade disagrees with the rule: %', bad;
  end if;
end $$;

do $$
declare
  n_compared int;
  bad        text;
begin
  select count(*) into n_compared
    from public.v_grade_model_items m
    join public.v_gradebook_latest g
      on g.course_id = m.shell_course_id and g.column_id = m.column_id
   where m.column_id is not null
     and (g.linked_assignments <= 1
          or exists (select 1 from public.grade_column_links l
                      where l.course_id = g.course_id and l.column_id = g.column_id));
  if n_compared = 0 then
    raise exception 'FAIL precondition: the grade model view and the gradebook view share no column to compare';
  end if;

  select string_agg(format('%s/%s: model places it %s, flag %s', m.shell_course_id, m.column_id,
                           (m.component_id is not null and not m.excluded), g.counts_toward_grade),
                    '; ' order by m.shell_course_id, m.column_id) into bad
    from public.v_grade_model_items m
    join public.v_gradebook_latest g
      on g.course_id = m.shell_course_id and g.column_id = m.column_id
   where m.column_id is not null
     and (g.linked_assignments <= 1
          or exists (select 1 from public.grade_column_links l
                      where l.course_id = g.course_id and l.column_id = g.column_id))
     and (m.component_id is not null and not m.excluded) is distinct from g.counts_toward_grade;
  if bad is not null then
    raise exception 'FAIL the grade model view and counts_toward_grade disagree: %', bad;
  end if;
end $$;

-- =============================================================================================
-- 6. A role that already reads the view still can. The view is security_invoker, so since 107 its
--    reader needs select on grade_column_links as well. inbox_apply_runner (181) is granted
--    select on v_gradebook_latest and not on grade_column_links.
-- =============================================================================================
do $$
declare
  n bigint;
begin
  set local role inbox_apply_runner;
  begin
    select count(*) into n from public.v_gradebook_latest;
  exception when insufficient_privilege then
    reset role;
    raise exception 'FAIL inbox_apply_runner can no longer read v_gradebook_latest: it has no select on grade_column_links (and no read policy there), which the view reads since 107';
  end;
  reset role;
end $$;

select 'phase16_107_counts_toward_links: PASS' as result, current_user as ran_as;

rollback;
