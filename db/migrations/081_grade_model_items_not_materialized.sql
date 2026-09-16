-- bb2dash :: 081_grade_model_items_not_materialized.sql
-- Phase 10b round 2 (docs/planning/68_PHASE10B_grade_model.md, "Round 2 - review fixes", R2-13).
-- Worker W-20. 058 stays byte-frozen; this re-creates one of its views.
--
-- THE PROBLEM
--   v_grade_model_items reads v_gradebook_latest through a `latest` CTE that it references twice
--   (the column rows, and the placeholders' NOT EXISTS). Postgres 12+ materializes a CTE that is
--   referenced more than once, so the whole of v_gradebook_latest was computed and scanned for
--   every read, and the web layer's `scheme_course_id = ...` filter could not be pushed below the
--   join into it.
--
-- THE FIX
--   `latest as not materialized (...)`: the planner inlines the CTE at both references, so the
--   course filter reaches the gradebook scan. Nothing else changes - `create or replace view`
--   with the same columns in the same order, the same body, security_invoker and the grants
--   re-stated, and 036's guard re-run. Row counts are asserted unchanged in
--   db/tests/phase10b_round2.sql, section 3.

create or replace view v_grade_model_items
  with (security_invoker = true) as
with latest as not materialized (
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
  'facts only - the model is computed in the web app. The latest CTE is not materialized (081), '
  'so a scheme_course_id filter reaches the gradebook scan.';

-- =============================================================================================
-- Privileges, re-stated (036's rule)
-- =============================================================================================
alter view v_grade_model_items set (security_invoker = true);
revoke all on v_grade_model_items from public, anon;
grant select on v_grade_model_items to authenticated, service_role;

-- =============================================================================================
-- 036's guard, re-run
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
