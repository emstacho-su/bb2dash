-- bb2dash :: db/tests/grading_invariants.sql
-- Phase 16, R-32 / R-33. Standing checks on the grading rows the "graded so far" figure uses.
-- Not a test of one migration: every later phase reruns it (brief 96, §Tables and migrations).
--
--   A  weighted_pct scheme: top-level, non-extra-credit sum(weight_pct) = 100.
--   B  points scheme: top-level sum(points) = total_points, and the non-extra-credit sum
--      = graded_out_of.
--   C  a parent's non-extra-credit children sum to the parent, in the unit the parent uses
--      (points to points, weight_pct to weight_pct).
--   E  every component_id (assignments and grade_column_links) belongs to the scheme course,
--      coalesce(courses.parent_course_id, courses.id).
--   D  (ratchet) an assignment with points_possible > 0 and no component of its own sits under an
--      excluded grade_column_links row, or the grade model places it (v_grade_model_items has a row
--      for the assignment with a component_id and not excluded), or its id is in D_EXCEPTIONS. The
--      list only ever shrinks. The model is mirrored, not the raw link: it applies a link only to a
--      column in v_gradebook_latest of kind item or attendance (081, column_items), and it takes
--      the component from a non-excluded link first. Migration 106 folded links into
--      assignments.component_id only once, so a link made later never lands there.
--   F  (ratchet) confirmed rows that carry no citation (bb_file:<id>#unit:<n> or STACK_OVERRIDE):
--      schemes and components by notes, linked point-bearing assignments by source_ref (an
--      assignment whose column is "Not graded", an excluded grade_column_links row, counts toward
--      nothing, so the link row is its decision and it needs no citation: P-3, P-75).
--      F <= F_CEILING. The ceiling only ever goes down; 0 after 106. A column placed by the
--      Grades tab's picker is Stack's own override and carries no citation of its own.
--
-- Exact equality, no tolerance. Qualitative schemes are out of scope for A / B / C. Expected
-- sides come from grading_schemes / grade_components, never from v_grade_model_items.
--
-- RUN IT: node scripts/db-test.mjs --only grading_invariants.sql. It reads only; the final
-- rollback is the runner's lint rule.

begin;

do $$
declare
  -- D: point-bearing assignments knowingly left with no component. Empty after 106 (Stack,
  -- 2026-09-29): IST.466/class-participation is linked to participation (component 23), and
  -- IST.466/attendance-35625001 is "Not graded" by an excluded link, which D already allows.
  D_EXCEPTIONS constant text[] := array[]::text[];
  -- F: 0 after 106 (was 87 on the baseline day, 2026-09-29: 6 schemes + 35 components + 46 assignments).
  F_CEILING constant int := 0;
  cite         constant text := 'bb_file:[0-9]+#unit:[0-9]+';
  bad          text;
  f_schemes    int;
  f_components int;
  f_assign     int;
begin
  -- A ------------------------------------------------------------------------------------------
  select string_agg(format('%s sums to %s', s.course_id, coalesce(t.total::text, 'nothing')),
                    '; ' order by s.course_id) into bad
    from grading_schemes s
    left join lateral (select sum(c.weight_pct) as total
                         from grade_components c
                        where c.course_id = s.course_id and c.parent_id is null
                          and not c.is_extra_credit) t on true
   where s.method = 'weighted_pct'
     and t.total is distinct from 100;
  if bad is not null then
    raise exception 'FAIL A weighted_pct top-level weights do not sum to 100: %', bad;
  end if;

  -- B ------------------------------------------------------------------------------------------
  select string_agg(format('%s: all %s vs total_points %s, non-EC %s vs graded_out_of %s',
                           s.course_id, t.all_pts, s.total_points, t.graded_pts, s.graded_out_of),
                    '; ' order by s.course_id) into bad
    from grading_schemes s
    left join lateral (select sum(c.points) as all_pts,
                              sum(c.points) filter (where not c.is_extra_credit) as graded_pts
                         from grade_components c
                        where c.course_id = s.course_id and c.parent_id is null) t on true
   where s.method = 'points'
     and (t.all_pts is distinct from s.total_points
          or t.graded_pts is distinct from s.graded_out_of);
  if bad is not null then
    raise exception 'FAIL B points top-level sums do not match the scheme: %', bad;
  end if;

  -- C ------------------------------------------------------------------------------------------
  select string_agg(format('%s/%s (id %s): points %s vs children %s, weight_pct %s vs children %s',
                           p.course_id, p.code, p.id, p.points, k.pts, p.weight_pct, k.wts),
                    '; ' order by p.id) into bad
    from grade_components p
    join grading_schemes s on s.course_id = p.course_id and s.method <> 'qualitative'
    join lateral (select sum(c.points) as pts, sum(c.weight_pct) as wts,
                         count(*) filter (where c.points is null) as null_pts,
                         count(*) filter (where c.weight_pct is null) as null_wts
                    from grade_components c
                   where c.parent_id = p.id and not c.is_extra_credit) k on true
   where exists (select 1 from grade_components c where c.parent_id = p.id)
     and ((p.points is not null and (k.null_pts > 0 or k.pts is distinct from p.points))
       or (p.weight_pct is not null and (k.null_wts > 0 or k.wts is distinct from p.weight_pct))
       or (p.points is null and p.weight_pct is null));
  if bad is not null then
    raise exception 'FAIL C children do not sum to their parent: %', bad;
  end if;

  -- E ------------------------------------------------------------------------------------------
  select string_agg(x.what, '; ' order by x.what) into bad
    from (select format('assignment %s -> component %s of %s', a.id, g.id, g.course_id) as what
            from assignments a
            join courses c on c.id = a.course_id
            join grade_components g on g.id = a.component_id
           where g.course_id <> coalesce(c.parent_course_id, c.id)
          union all
          select format('link %s/%s -> component %s of %s', l.course_id, l.column_id, g.id, g.course_id)
            from grade_column_links l
            join courses c on c.id = l.course_id
            join grade_components g on g.id = l.component_id
           where g.course_id <> coalesce(c.parent_course_id, c.id)) x;
  if bad is not null then
    raise exception 'FAIL E component outside the scheme course: %', bad;
  end if;

  -- D (ratchet) --------------------------------------------------------------------------------
  select string_agg(a.id, ', ' order by a.id) into bad
    from assignments a
   where a.points_possible > 0
     and a.component_id is null
     and a.id <> all (D_EXCEPTIONS)
     and not exists (select 1 from grade_column_links l
                      where l.course_id = a.course_id and l.column_id = a.bb_column_id
                        and l.excluded)
     and not exists (select 1 from v_grade_model_items m
                      where m.assignment_id = a.id
                        and m.component_id is not null and not m.excluded);
  if bad is not null then
    raise exception 'FAIL D point-bearing assignments with no component, not excluded, not placed by the grade model, not excepted: %', bad;
  end if;

  -- F (ratchet) --------------------------------------------------------------------------------
  select count(*) into f_schemes
    from grading_schemes
   where confidence = 'confirmed'
     and coalesce(notes, '') !~ cite and coalesce(notes, '') !~ 'STACK_OVERRIDE';
  select count(*) into f_components
    from grade_components
   where confidence = 'confirmed'
     and coalesce(notes, '') !~ cite and coalesce(notes, '') !~ 'STACK_OVERRIDE';
  select count(*) into f_assign
    from assignments a
   where confidence = 'confirmed' and component_id is not null and points_possible > 0
     and coalesce(source_ref, '') !~ cite and coalesce(source_ref, '') !~ 'STACK_OVERRIDE'
     and not exists (select 1 from grade_column_links l
                      where l.course_id = a.course_id and l.column_id = a.bb_column_id
                        and l.excluded);
  if f_schemes + f_components + f_assign > F_CEILING then
    raise exception 'FAIL F % confirmed rows without a citation (schemes %, components %, assignments %), ceiling %',
      f_schemes + f_components + f_assign, f_schemes, f_components, f_assign, F_CEILING;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'grading_invariants: PASS' as result,
       (select count(*) from grading_schemes
         where confidence = 'confirmed'
           and coalesce(notes, '') !~ 'bb_file:[0-9]+#unit:[0-9]+'
           and coalesce(notes, '') !~ 'STACK_OVERRIDE')
     + (select count(*) from grade_components
         where confidence = 'confirmed'
           and coalesce(notes, '') !~ 'bb_file:[0-9]+#unit:[0-9]+'
           and coalesce(notes, '') !~ 'STACK_OVERRIDE')
     + (select count(*) from assignments a
         where confidence = 'confirmed' and component_id is not null and points_possible > 0
           and coalesce(source_ref, '') !~ 'bb_file:[0-9]+#unit:[0-9]+'
           and coalesce(source_ref, '') !~ 'STACK_OVERRIDE'
           and not exists (select 1 from grade_column_links l
                            where l.course_id = a.course_id and l.column_id = a.bb_column_id
                              and l.excluded)) as f_uncited;

rollback;
