-- bb2dash :: db/tests/phase16_107_counts_toward_links.sql
-- Phase 16 · migration 107 (v_gradebook_latest.counts_toward_grade follows the Grades tab's
-- "Counts toward..." picker, grade_column_links). Brief: docs/planning/sprint-2/verification/115_SQL_UNITS_AUDIT_2026-10-09.md, section C.
--
-- THE RULE UNDER TEST, for a gradebook row (course_id, column_id) of kind item or attendance:
--   a grade_column_links row for it that is excluded ("Not graded")          -> false
--   else a grade_column_links row for it, not excluded, with a component_id   -> true
--   else what 047 always did: bool_or(assignments.component_id is not null)
--        over the assignments linked to the column, false when there are none.
-- For every other kind (total, letter, calc_other) a link changes nothing: the model view (081,
-- column_items) applies a link only to item and attendance columns, and the flag follows it.
-- 057 forbids a link that is neither: grade_column_links_one_target says (component_id is not null)
-- <> excluded, so "a link, not excluded, with a null component" cannot exist. Section 4 proves the
-- table refuses it, which is why there is no fourth fixture case.
--
-- WHAT IS ASSERTED
--   1  the first check: the view's definition mentions grade_column_links (107 is applied).
--   2  an invariant over EVERY live row: the flag equals the rule, computed here from the two tables
--      by one temp function (pg_temp.counts_mismatch), called again in section 5.
--   3  fixtures on one live gradebook row, all inside this transaction: no link (the assignment with
--      a component, then without), an excluded link, a placed link; each case also compares the rest
--      of the view's row with its snapshot, so only the flag may move.
--   3b a total or calc_other column: an excluded link, then a placed link, leave its flag where it was.
--   4  the table refuses a not-excluded link with no component (the reason for no case 4).
--   5  the invariant of 2 again after the fixtures, and the grade model view agrees with the flag.
--   6  inbox_apply_runner, which 181 lets read the view, still can: the view is security_invoker and
--      now reads grade_column_links, so 107 grants that role select there (and a select policy), and
--      no write. Run under set local role, as the phase23_18x units do.
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
-- The rule, written out here from the two tables and not read from the view. Returns the rows where
-- the flag and the rule disagree, as text, or null. Called here and again after the fixtures.
create function pg_temp.counts_mismatch() returns text
  language sql stable as $$
  select string_agg(format('%s/%s (%s): flag %s, rule %s', g.course_id, g.column_id, g.column_kind,
                           g.counts_toward_grade, r.want),
                    '; ' order by g.course_id, g.column_id)
    from public.v_gradebook_latest g
    left join public.grade_column_links l
           on l.course_id = g.course_id and l.column_id = g.column_id
   cross join lateral (
     select case
              when g.column_kind in ('item', 'attendance') and l.excluded then false
              when g.column_kind in ('item', 'attendance') and l.component_id is not null then true
              else coalesce((select bool_or(a.component_id is not null)
                               from public.assignments a
                              where a.course_id = g.course_id and a.bb_column_id = g.column_id), false)
            end as want) r
   where g.counts_toward_grade is distinct from r.want
$$;

do $$
declare
  n_rows int;
  bad    text;
begin
  select count(*) into n_rows from public.v_gradebook_latest;
  if n_rows = 0 then
    raise exception 'FAIL precondition: v_gradebook_latest has no rows to check';
  end if;
  bad := pg_temp.counts_mismatch();
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
-- 3b. A column that is not an item or attendance column ignores the picker's links
-- =============================================================================================
-- The first total or calc_other column by (course_id, column_id) with no link, in a course whose
-- scheme has a component. If there is none the case is skipped (a notice, not a pass of anything).
do $$
declare
  v_course    text;
  v_column    text;
  v_kind      text;
  v_component bigint;
  v_before    boolean;
  v_flag      boolean;
begin
  select g.course_id, g.column_id, g.column_kind,
         (select min(gc.id) from public.grade_components gc
           where gc.course_id = coalesce(co.parent_course_id, co.id)),
         g.counts_toward_grade
    into v_course, v_column, v_kind, v_component, v_before
    from public.v_gradebook_latest g
    join public.courses co on co.id = g.course_id
   where g.column_kind in ('total', 'calc_other')
     and not exists (select 1 from public.grade_column_links l
                      where l.course_id = g.course_id and l.column_id = g.column_id)
     and exists (select 1 from public.grade_components gc
                  where gc.course_id = coalesce(co.parent_course_id, co.id))
   order by g.course_id, g.column_id
   limit 1;
  if v_column is null then
    raise notice 'phase16_107: case 3b skipped, no total or calc_other column without a link in a course with components';
    return;
  end if;

  insert into public.grade_column_links (course_id, column_id, component_id, excluded)
  values (v_course, v_column, null, true);
  select g.counts_toward_grade into v_flag
    from public.v_gradebook_latest g where g.course_id = v_course and g.column_id = v_column;
  if v_flag is distinct from v_before then
    raise exception 'FAIL case 3b: an excluded link moved the flag of the % column %/% from % to %',
      v_kind, v_course, v_column, v_before, v_flag;
  end if;

  delete from public.grade_column_links where course_id = v_course and column_id = v_column;
  insert into public.grade_column_links (course_id, column_id, component_id, excluded)
  values (v_course, v_column, v_component, false);
  select g.counts_toward_grade into v_flag
    from public.v_gradebook_latest g where g.course_id = v_course and g.column_id = v_column;
  if v_flag is distinct from v_before then
    raise exception 'FAIL case 3b: a component link moved the flag of the % column %/% from % to %',
      v_kind, v_course, v_column, v_before, v_flag;
  end if;
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
  bad := pg_temp.counts_mismatch();
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
--    select on v_gradebook_latest, so 107 gives it select on grade_column_links and a select
--    policy, and nothing more: as that role the view and the table both read, and an insert, an
--    update and a delete on the table are each refused (42501).
-- =============================================================================================
do $$
declare
  n_login_view  bigint;
  n_login_links bigint;
  n_role_view   bigint;
  n_role_links  bigint;
  v_refused     int := 0;
  v_read_error  text;
begin
  select count(*) into n_login_view  from public.v_gradebook_latest;
  select count(*) into n_login_links from public.grade_column_links;

  set local role inbox_apply_runner;
  begin
    select count(*) into n_role_view from public.v_gradebook_latest;
    select count(*) into n_role_links from public.grade_column_links;
  exception when insufficient_privilege then
    v_read_error := sqlerrm;
  end;
  if v_read_error is null then
    -- Each write is refused by the privilege check before any row is looked at, so where false
    -- touches nothing and the insert never reaches its trigger.
    begin
      insert into public.grade_column_links (course_id, column_id, component_id, excluded)
      values ('none', 'none', null, true);
    exception when insufficient_privilege then
      v_refused := v_refused + 1;
    end;
    begin
      update public.grade_column_links set excluded = excluded where false;
    exception when insufficient_privilege then
      v_refused := v_refused + 1;
    end;
    begin
      delete from public.grade_column_links where false;
    exception when insufficient_privilege then
      v_refused := v_refused + 1;
    end;
  end if;
  reset role;

  if v_read_error is not null then
    raise exception 'FAIL inbox_apply_runner cannot read v_gradebook_latest or grade_column_links (%): 107 must grant it select on the table', v_read_error;
  end if;
  if n_role_view is distinct from n_login_view then
    raise exception 'FAIL inbox_apply_runner sees % v_gradebook_latest rows, the test login sees %', n_role_view, n_login_view;
  end if;
  if n_role_links is distinct from n_login_links then
    raise exception 'FAIL inbox_apply_runner sees % grade_column_links rows, the test login sees %: a select policy for the role is missing', n_role_links, n_login_links;
  end if;
  if v_refused <> 3 then
    raise exception 'FAIL inbox_apply_runner was refused % of 3 writes (insert, update, delete) on grade_column_links', v_refused;
  end if;
end $$;

select 'phase16_107_counts_toward_links: PASS' as result, current_user as ran_as;

rollback;
