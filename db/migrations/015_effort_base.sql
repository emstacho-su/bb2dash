-- bb2dash :: 015_effort_base.sql
-- The effort model's reference data and primitives (20_D1 §3, 21_D2 §3.015,
-- renumbered per docs/planning/40_RECONCILIATION_2026-09-09.md).
--
-- Three objects:
--   1. effort_base            -- base score, workload flag, glyph/category per assignment_type
--   2. v_course_points_median -- the multiplier's denominator + the qualification gate
--   3. v_assignment_effort    -- the five-rung fallback ladder, with the source label
--
-- Where the two source docs disagree, 20_D1 §3 wins: the reconciliation adopted "the effort
-- model in full (20_D1 §3)". That means base scores and in_workload come from 20_D1's table
-- (checkpoint 1 not 1.5, meeting 0.5 not 1, evaluation 1 not 2, and the in_workload=false
-- flag for meeting/attendance/participation, none of which 21_D2 §3.015 carried), while the
-- category/glyph pair comes from 21_D2 §3.015. The multiplier gate is n >= 5, not 21_D2's
-- n >= 3 (20_D1 §3: "3 is only one value away from ECN's degenerate case and buys nothing").

-- ---------------------------------------------------------------------------
-- 1. effort_base: reference data, seeded once, editable by Stack.
--    All 19 assignment_type values. An unmapped type is a bug, not a default —
--    but the ladder still degrades to 2 rather than dropping the row (rung 5),
--    so a future enum addition breaks nothing.
-- ---------------------------------------------------------------------------
create table effort_base (
  type        assignment_type primary key,
  base        numeric(4,2) not null,
  in_workload boolean not null default true,   -- false = scored but excluded from day-load sums and the tracker
  category    text not null,                   -- 'reading'|'assignment'|'quiz'|'project'|'exam' (the 5 glyphs)
  glyph       text not null
);

comment on table effort_base is
  'Base effort score, workload flag and glyph per assignment_type (20_D1 §3). Reference data: one row per enum value, no exceptions.';
comment on column effort_base.in_workload is
  'false for meeting/attendance/participation: continuous obligations, not discrete work. Excluded from day-load sums and the tracker rather than drawn as a tiny bar.';

insert into effort_base (type, base, in_workload, category, glyph) values
  ('final_exam',         10, true,  'exam',       'E'),
  ('exam',                8, true,  'exam',       'E'),
  ('project',             6, true,  'project',    'P'),
  ('paper',               6, true,  'project',    'P'),
  ('group_presentation',  6, true,  'project',    'P'),
  ('lab',                 4, true,  'assignment', 'A'),
  ('presentation',        4, true,  'project',    'P'),
  ('quiz',                3, true,  'quiz',       'Q'),
  ('homework',            2, true,  'assignment', 'A'),
  ('activity',            2, true,  'assignment', 'A'),
  ('other',               2, true,  'assignment', 'A'),   -- the modal value, so the 3 `other` rows never render as a zero-height bar
  ('discussion_post',   1.5, true,  'assignment', 'A'),
  ('reading',             1, true,  'reading',    'R'),
  ('form',                1, true,  'assignment', 'A'),
  ('checkpoint',          1, true,  'assignment', 'A'),
  ('evaluation',          1, true,  'assignment', 'A'),
  ('meeting',           0.5, false, 'assignment', 'A'),
  ('attendance',        0.5, false, 'assignment', 'A'),
  ('participation',     0.5, false, 'assignment', 'A');

alter table effort_base enable row level security;
create policy effort_base_owner_all on effort_base for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. v_course_points_median: the multiplier's denominator, and the gate.
--    One row per course shell so callers can join on assignments.course_id directly,
--    but n and med are computed over the DISPLAY course (GEO's two shells unioned via
--    courses.parent_course_id), so a future points backfill in either GEO shell helps both.
--    The n >= 5 threshold lives here and only here — change it in one place.
-- ---------------------------------------------------------------------------
create view v_course_points_median as
with pts as (
  select coalesce(c.parent_course_id, c.id) as display_course_id,
         a.points_possible
  from assignments a
  join courses c on c.id = a.course_id
  where a.points_possible is not null and a.points_possible > 0
),
agg as (
  select display_course_id,
         (percentile_cont(0.5) within group (order by points_possible))::numeric as med,
         count(*)::integer as n
  from pts
  group by display_course_id
)
select c.id                                   as course_id,
       coalesce(c.parent_course_id, c.id)     as display_course_id,
       agg.med,
       coalesce(agg.n, 0)                     as n,
       (coalesce(agg.n, 0) >= 5 and coalesce(agg.med, 0) > 0) as qualifies
from courses c
left join agg on agg.display_course_id = coalesce(c.parent_course_id, c.id);

comment on view v_course_points_median is
  'Median positive points_possible per display course (GEO shells unioned). qualifies = n >= 5, the single place the multiplier gate is stated (20_D1 §3).';

-- ---------------------------------------------------------------------------
-- 3. v_assignment_effort: the five-rung fallback ladder (20_D1 §3). First match wins,
--    and every rung names a source the UI can show:
--      1 override  -- assignment_progress.effort_override         chip "yours"
--      2 estimate  -- clamp(est_minutes / 45.0, 0.5, 12), to 0.5  chip "from your estimate"
--      3 weighted  -- base * clamp(points / course median, 0.5, 2.0), gated on qualifies
--      4 base      -- base alone
--      5 default   -- type absent from effort_base: 2, never undefined
--    effort_base is LEFT joined precisely so rung 5 is reachable: an enum value added later
--    degrades to 2 instead of silently dropping the assignment out of every planner surface.
-- ---------------------------------------------------------------------------
create view v_assignment_effort as
with resolved as (
  select a.id,
         a.course_id,
         a.points_possible,
         b.base,
         b.category,
         b.glyph,
         b.in_workload,
         p.effort_override,
         p.est_minutes,
         m.med,
         m.n                              as points_n,
         coalesce(m.qualifies, false)     as course_qualifies,
         case
           when p.effort_override is not null then 'override'
           when p.est_minutes is not null then 'estimate'
           when b.base is not null
                and coalesce(m.qualifies, false)
                and a.points_possible is not null and a.points_possible > 0
                and m.med is not null and m.med > 0 then 'weighted'
           when b.base is not null then 'base'
           else 'default'
         end as effort_source
  from assignments a
  left join effort_base b            on b.type = a.type
  left join assignment_progress p    on p.assignment_id = a.id
  left join v_course_points_median m on m.course_id = a.course_id
)
select id,
       course_id,
       coalesce(category, 'assignment')::text as category,
       coalesce(glyph, 'A')::text             as glyph,
       coalesce(in_workload, true)            as in_workload,
       effort_source::text                    as effort_source,
       case effort_source
         when 'override' then effort_override
         when 'estimate' then round(least(12.0, greatest(0.5, est_minutes / 45.0)) * 2) / 2
         when 'weighted' then round(base * least(2.0, greatest(0.5, points_possible / med)), 2)
         when 'base'     then base
         else 2.0
       end                                    as effort,
       (effort_source = 'override')           as is_override,
       (effort_source = 'weighted')           as multiplier_applied,
       course_qualifies,
       points_n,
       med
from resolved;

comment on view v_assignment_effort is
  'Effort per assignment via the 20_D1 §3 fallback ladder. effort_source is one of override/estimate/weighted/base/default and every figure carries it; multiplier_applied is true only when rung 3 actually fired, so the UI can say when the points multiplier did NOT apply.';
