-- bb2dash :: 058_grade_model_views.sql
-- Phase 10b (docs/planning/68_PHASE10B_grade_model.md, Contract section "058 - model views").
-- Worker W-20. R-11 (c), R-12.
--
-- The three views the grade model reads. Between them they answer: which items does the model
-- see for a scheme course, what total does Blackboard publish for it (and does that total count
-- ungraded work), and when did a score change?
--
-- NOTHING HERE COMPUTES A GRADE. The views carry facts - Blackboard's columns, V-1's links,
-- Stack's overrides - and the engine in web/src/lib/grade-model does every sum. No view adds,
-- averages, weights or projects a score.
--
-- SCOPE: registered runs only, exactly as 047. v_grade_model_items and v_grade_model_total read
-- v_gradebook_latest, which already applies the predicate; v_gradebook_history reads bb_gradebook
-- and repeats 047's EXISTS against sync_runs itself.
--
-- SECURITY: every view is `with (security_invoker = true)` and revoked from anon, per 036. The
-- guard block at the foot of this file is 036's, repeated.
--
-- CHOICES the Contract left open, written down (none changes a frozen column):
--   1. link_source / link_confidence when a grade_column_links row says "Not graded"
--      (excluded = true). The row is Stack's decision, so it reports link_source = 'override' and
--      link_confidence = 'confirmed' whether or not the column also has an assignment link.
--      component_id still follows the Contract literally (the override's component when not
--      excluded, else the assignment's) and `excluded` tells the engine to leave the item out.
--   2. A column linked to more than one assignment (IST.323 _3569973_1 today) has no single
--      linked assignment, so assignment_id, component_id (absent an override) and
--      link_confidence are all null: the column reads as unlinked until Stack picks a component.
--   3. is_exempt is coalesced to false. Blackboard omits isExempt rather than sending false; a
--      column it did not call exempt is not exempt.
--   4. due_at for a placeholder is assignments.due_at, or - for a date-only syllabus row - 23:59
--      America/New_York on assignments.due_date (060's date-only rule). The engine drops surplus
--      placeholders latest-due first, and 17 of the 31 placeholders today carry only a date.
--   5. v_grade_model_total keeps one row per scheme course, as the Contract says. Should two
--      shells of one scheme course ever both publish a total, the scheme course's own shell wins,
--      then the newest seen_at. Only IST.323 publishes one today.
--   6. v_gradebook_history includes every column kind (item, attendance, total, letter). The
--      Contract does not filter, and "5 changed columns today" counts ECN.304 Attendance and
--      IST.323 Total Score among the five.

-- =============================================================================================
-- 1. v_grade_model_items - one row per model item, per scheme course
-- =============================================================================================
create view v_grade_model_items
  with (security_invoker = true) as
with latest as (
  select g.*
    from v_gradebook_latest g
),
column_items as (
  select coalesce(c.parent_course_id, c.id)                       as scheme_course_id,
         'col:' || g.course_id || ':' || g.column_id               as item_key,
         g.assignment_id,
         g.course_id                                               as shell_course_id,
         g.column_id,
         case when lnk.course_id is not null and not lnk.excluded then lnk.component_id
              else a.component_id end                              as component_id,
         case when lnk.course_id is not null then 'override'
              when a.component_id is not null then 'assignment' end as link_source,
         case when lnk.course_id is not null then 'confirmed'
              when a.component_id is not null then a.confidence::text end as link_confidence,
         coalesce(lnk.excluded, false)                             as excluded,
         g.name,
         g.possible::numeric                                       as possible,
         g.effective_score::numeric                                as score,
         coalesce(g.is_exempt, false)                              as is_exempt,
         g.column_kind,
         a.is_extra_credit                                         as asg_extra_credit,
         g.due_at,
         g.seen_at
    from latest g
    join courses c on c.id = g.course_id
    left join grade_column_links lnk
           on lnk.course_id = g.course_id and lnk.column_id = g.column_id
    left join assignments a on a.id = g.assignment_id
   where g.column_kind in ('item', 'attendance')
),
placeholders as (
  select coalesce(c.parent_course_id, c.id)                       as scheme_course_id,
         'asg:' || a.id                                            as item_key,
         a.id                                                      as assignment_id,
         a.course_id                                               as shell_course_id,
         null::text                                                as column_id,
         a.component_id,
         'assignment'::text                                        as link_source,
         a.confidence::text                                        as link_confidence,
         false                                                     as excluded,
         a.title                                                   as name,
         a.points_possible::numeric                                as possible,
         null::numeric                                             as score,
         false                                                     as is_exempt,
         'placeholder'::text                                       as column_kind,
         a.is_extra_credit                                         as asg_extra_credit,
         coalesce(a.due_at,
                  (a.due_date + time '23:59') at time zone 'America/New_York') as due_at,
         null::timestamptz                                         as seen_at
    from assignments a
    join courses c on c.id = a.course_id
   where a.component_id is not null
     and not exists (select 1 from latest g
                      where g.course_id = a.course_id and g.column_id = a.bb_column_id)
),
items as (
  select * from column_items
  union all
  select * from placeholders
)
select i.scheme_course_id,
       i.item_key,
       i.assignment_id,
       i.shell_course_id,
       i.column_id,
       i.component_id,
       i.link_source,
       i.link_confidence,
       i.excluded,
       i.name,
       i.possible,
       i.score,
       i.is_exempt,
       i.column_kind,
       (coalesce(i.asg_extra_credit, false) or coalesce(gc.is_extra_credit, false)) as is_extra_credit,
       i.due_at,
       i.seen_at
  from items i
  left join grade_components gc on gc.id = i.component_id;

comment on view v_grade_model_items is
  'One row per item the grade model sees, per scheme course (coalesce(parent_course_id, id)): '
  'every latest item and attendance gradebook column from a registered run, plus every '
  'assignments row with a component_id and no gradebook column yet (column_kind = placeholder). '
  'component_id is Stack''s grade_column_links override when one exists and is not "Not '
  'graded", else the single linked assignment''s component. link_source / link_confidence say '
  'which: override rows are confirmed. Total, letter and calc_other columns never appear. Carries '
  'facts only - the model is computed in the web app.';
comment on column v_grade_model_items.item_key is
  'col:<shell_course_id>:<column_id> for a gradebook column, asg:<assignment id> for a '
  'placeholder. The key grade_scenarios.item_scores uses.';
comment on column v_grade_model_items.score is
  'Blackboard''s effective_score. Null means ungraded (never zero); always null for a placeholder.';

-- =============================================================================================
-- 2. v_grade_model_total - Blackboard's published total, and whether it is a running total
-- =============================================================================================
create view v_grade_model_total
  with (security_invoker = true) as
select distinct on (coalesce(c.parent_course_id, c.id))
       coalesce(c.parent_course_id, c.id)            as scheme_course_id,
       g.course_id                                   as shell_course_id,
       g.column_id,
       g.name,
       g.effective_score::numeric                    as score,
       g.possible::numeric                           as possible,
       g.seen_at,
       case substring(gb.raw->'formula'->>'formula' from '"running"\s*:\s*(true|false)')
         when 'true'  then true
         when 'false' then false
       end                                           as bb_running
  from v_gradebook_latest g
  join courses c on c.id = g.course_id
  join bb_gradebook gb on gb.id = g.id
 where g.column_kind = 'total'
 order by coalesce(c.parent_course_id, c.id),
          (g.course_id = coalesce(c.parent_course_id, c.id)) desc,
          g.seen_at desc,
          g.id desc;

comment on view v_grade_model_total is
  'One row per scheme course whose shells publish a calculated total: Blackboard''s score, '
  'possible and seen_at, plus bb_running - true or false when the total column''s formula '
  'carries "running": true|false, null when it could not be read. Read, never guessed: the '
  'agreement check compares graded-so-far against a running total and zeros-on-the-rest '
  'against a non-running one.';
comment on column v_grade_model_total.bb_running is
  'Parsed from raw->formula->formula with the pattern "running"\s*:\s*(true|false). Null means '
  'the setting could not be read, which the model reports as the bb_running_total reason.';

-- =============================================================================================
-- 3. v_gradebook_history - when a score changed
-- =============================================================================================
create view v_gradebook_history
  with (security_invoker = true) as
with observations as (
  select gb.course_id,
         gb.column_id,
         gb.name,
         gb.run_id,
         gb.seen_at,
         gb.effective_score,
         gb.possible,
         lag(gb.effective_score) over w as previous_score,
         row_number() over w            as observation_no
    from bb_gradebook gb
   where exists (select 1 from sync_runs s
                  where s.run_id = gb.run_id and s.scope is distinct from 'unregistered')
  window w as (partition by gb.course_id, gb.column_id order by gb.seen_at, gb.id)
)
select o.course_id                  as shell_course_id,
       o.column_id,
       o.name,
       o.run_id,
       o.seen_at,
       o.effective_score::numeric   as score,
       o.possible::numeric          as possible,
       o.previous_score::numeric    as previous_score
  from observations o
 where o.observation_no = 1
    or o.effective_score is distinct from o.previous_score;

comment on view v_gradebook_history is
  'Per (shell_course_id, column_id): the first registered observation, then every later '
  'registered run whose effective_score differs from the run before it (null -> a score counts '
  'as a change). previous_score is the score of the run immediately before, null on the first '
  'row. A column with two or more rows is a column whose score changed across syncs.';

-- =============================================================================================
-- 4. Privileges (036's rule)
-- =============================================================================================
revoke all on v_grade_model_items  from public, anon;
revoke all on v_grade_model_total  from public, anon;
revoke all on v_gradebook_history  from public, anon;

grant select on v_grade_model_items, v_grade_model_total, v_gradebook_history
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
