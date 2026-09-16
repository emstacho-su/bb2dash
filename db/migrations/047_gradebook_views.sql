-- bb2dash :: 047_gradebook_views.sql
-- Phase 10a (docs/planning/67_PHASE10A_grades.md, Contract section "047 - views"). R-10, R-11.
--
-- The three views the Grades screens read. Between them they answer: what does Blackboard say
-- about this column right now, about this assignment, and about this course's total?
--
-- THE HONESTY RULE, enforced here rather than in the client
--   The client never sums. v_course_grade carries Blackboard's own total row or nulls, and
--   `has_gradebook` / `has_total` make "never synced" and "Blackboard publishes no total" two
--   different, nameable states instead of one ambiguous blank. Nothing in this file adds,
--   averages, weights or projects a number.
--
-- SCOPE: registered runs only. A crawl nobody registered is quarantined by the driver with
-- sync_runs.scope = 'unregistered' (035). bb_raw takes anon inserts, so a gradebook row whose run
-- was never claimed by the owner is not evidence of anything and must not reach a screen. Each
-- view therefore requires an EXISTS against a sync_runs row whose scope is distinct from
-- 'unregistered' - EXISTS, not a join, so a run that has both a quarantine row and a real one
-- cannot duplicate a column.
--
-- SECURITY: every view is created `with (security_invoker = true)` and revoked from anon, per
-- migration 036. The guard block at the foot of this file is 036's, repeated: it refuses to let
-- this migration record if any public view is still owner-run.
--
-- DEVIATIONS from the Contract, deliberate:
--   1. `v_assignment_grade` exposes `assignments.id` as **assignment_id**, not `id`. The view
--      also carries the gradebook row's own key (as `gradebook_id`), and two columns called `id`
--      cannot coexist. `assignment_id` is also the name W-18's assignmentGradeOptions filters on.
--      For the same reason the view carries `assignments.course_id` once, not twice, and
--      `bb_column_id` is exposed as `column_id` to match v_gradebook_latest.
--   2. `counts_toward_grade` is `bool_or(component_id is not null)` over every assignments row
--      linked to the column, not only over a single link. IST.323 column _3569973_1 is linked to
--      two assignments today (fp-proposal, fp-log-final), both with a component_id; reading it as
--      "not counting" because the link is ambiguous would be the wrong answer to a question the
--      data answers clearly. `assignment_id` still goes null when the link is ambiguous, exactly
--      as the Contract says, and `linked_assignments` says how many there are.
--   3. GEO.103 is two shells and each keeps its own v_course_grade row, as the Contract requires.
--      Neither publishes a total today, so both read "Blackboard publishes no total". The web
--      layer groups shells through v_course_display.shell_ids; this file does not group anything.

-- =============================================================================================
-- 1. v_gradebook_latest - one row per (course_id, column_id), newest registered run
-- =============================================================================================
create view v_gradebook_latest
  with (security_invoker = true) as
with latest as (
  select distinct on (gb.course_id, gb.column_id) gb.*
    from bb_gradebook gb
   where exists (select 1 from sync_runs s
                  where s.run_id = gb.run_id and s.scope is distinct from 'unregistered')
   order by gb.course_id, gb.column_id, gb.seen_at desc, gb.id desc
)
select l.id,
       l.run_id,
       l.sync_run_id,
       l.course_id,
       l.column_id,
       l.name,
       l.position,
       l.content_id,
       l.category_id,
       l.possible,
       l.due_at,
       l.calc_type,
       l.is_calc,
       l.is_total,
       l.column_kind,
       l.aggregation,
       l.visible,
       l.grades_released,
       l.multiple_attempts,
       l.attempts_left,
       l.effective_score,
       l.manual_score,
       l.display_score,
       l.display_grade,
       l.is_override,
       l.is_exempt,
       l.feedback,
       l.submission_status,
       l.last_attempt_status,
       l.last_attempt_created,
       l.last_attempt_submitted,
       l.last_attempt_score,
       l.seen_at,
       lk.assignment_id,
       lk.linked_assignments,
       lk.counts_toward_grade
  from latest l
  left join lateral (
    select case when count(*) = 1 then min(a.id) end            as assignment_id,
           count(*)::int                                        as linked_assignments,
           coalesce(bool_or(a.component_id is not null), false)  as counts_toward_grade
      from assignments a
     where a.course_id = l.course_id and a.bb_column_id = l.column_id) lk on true;

comment on view v_gradebook_latest is
  'The newest bb_gradebook row per (course_id, column_id) from a registered crawl, plus the '
  'assignments link. assignment_id is the ONE assignments row carrying this bb_column_id and is '
  'null when there are none or more than one; linked_assignments says which. '
  'counts_toward_grade is true when a linked assignment has a grade_components link (V-1''s '
  'data - 10a reads it and never sets it) and is what decides whether an attendance column '
  'renders among the items or in the bookkeeping group.';

-- =============================================================================================
-- 2. v_assignment_grade - one row per assignment that Blackboard has a column for
-- =============================================================================================
create view v_assignment_grade
  with (security_invoker = true) as
select a.id                       as assignment_id,
       a.course_id,
       a.title,
       a.type,
       a.points_possible,
       a.bb_column_id             as column_id,
       g.id                       as gradebook_id,
       g.run_id,
       g.sync_run_id,
       g.name,
       g.position,
       g.content_id,
       g.category_id,
       g.possible,
       g.due_at,
       g.calc_type,
       g.is_calc,
       g.is_total,
       g.column_kind,
       g.aggregation,
       g.visible,
       g.grades_released,
       g.multiple_attempts,
       g.attempts_left,
       g.effective_score,
       g.manual_score,
       g.display_score,
       g.display_grade,
       g.is_override,
       g.is_exempt,
       g.feedback,
       g.submission_status,
       g.last_attempt_status,
       g.last_attempt_created,
       g.last_attempt_submitted,
       g.last_attempt_score,
       g.seen_at,
       g.linked_assignments,
       g.counts_toward_grade
  from assignments a
  left join v_gradebook_latest g
         on g.course_id = a.course_id and g.column_id = a.bb_column_id
 where a.bb_column_id is not null;

comment on view v_assignment_grade is
  'One row per assignments row that carries a bb_column_id: the assignment''s own facts plus '
  'every v_gradebook_latest column for that gradebook column. All gradebook fields are null when '
  'the column has not been crawled yet - which is the popout''s "not synced yet" state, not a '
  'zero.';

-- =============================================================================================
-- 3. v_course_grade - one row per course, Blackboard's total or an honest absence
-- =============================================================================================
create view v_course_grade
  with (security_invoker = true) as
select c.id                                     as course_id,
       coalesce(s.column_count, 0) > 0          as has_gradebook,
       s.gradebook_seen_at,
       (t.column_id is not null)                as has_total,
       t.column_id                              as total_column_id,
       t.name                                   as total_name,
       t.effective_score                        as total_effective_score,
       t.possible                               as total_possible,
       t.display_grade                          as total_display_grade,
       t.seen_at                                as total_seen_at,
       coalesce(s.item_count, 0)                as item_count,
       coalesce(s.graded_item_count, 0)         as graded_item_count
  from courses c
  left join lateral (
    select count(*)::int                                                              as column_count,
           max(g.seen_at)                                                             as gradebook_seen_at,
           count(*) filter (where g.column_kind = 'item')::int                        as item_count,
           count(*) filter (where g.column_kind = 'item'
                              and g.effective_score is not null)::int                 as graded_item_count
      from v_gradebook_latest g
     where g.course_id = c.id) s on true
  left join lateral (
    select g.column_id, g.name, g.effective_score, g.possible, g.display_grade, g.seen_at
      from v_gradebook_latest g
     where g.course_id = c.id and g.column_kind = 'total'
     order by g.seen_at desc, g.id desc
     limit 1) t on true;

comment on view v_course_grade is
  'One row per course. has_gradebook false means the course has never been crawled for grades '
  '("not synced yet"); has_gradebook true with has_total false means Blackboard publishes no '
  'calculated total for it, which the screen says in those words. The total figures are '
  'Blackboard''s own calculated row, carried with its seen_at. Nothing here is summed by '
  'bb2dash: a course with 12 graded items and no total row still reports no total.';

-- =============================================================================================
-- 4. Privileges (036's rule)
-- =============================================================================================
revoke all on v_gradebook_latest from anon;
revoke all on v_assignment_grade from anon;
revoke all on v_course_grade     from anon;

grant select on v_gradebook_latest, v_assignment_grade, v_course_grade
  to authenticated, service_role;

-- =============================================================================================
-- 5. 036's guard, repeated. A view added without security_invoker is the Phase 8 hole reopened.
-- =============================================================================================
do $$
declare v text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and coalesce((select o = 'security_invoker=true'
                     from unnest(c.reloptions) o where o like 'security_invoker=%'), false) is false;
  if v is not null then
    raise exception 'these public views still run as their owner and bypass RLS: %', v;
  end if;
end $$;
