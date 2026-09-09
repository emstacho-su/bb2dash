-- bb2dash :: 015_course_display.sql
-- Spec: docs/planning/21_D2_architecture_direction.md section 3.017, renumbered 017 -> 015 by
-- docs/planning/40_RECONCILIATION_2026-09-09.md ("the migration DDL set, renumbered 012+").
--
-- One display row per course GROUP. GEO.103 is two Blackboard shells (GEO.103.lecture and
-- GEO.103.recitation, the latter carrying parent_course_id = GEO.103.lecture); the pop-down,
-- the course cards, the course sub-bar and the M-F strip each need the union of them. Solve
-- the merge once here instead of four times in components, which is how the room conflict
-- becomes four different answers.
--
-- room_disputed is a COMPUTED column of this view, not a stored column on courses: the spec
-- defines it as bool_or(meetings.location is distinct from courses.location) over the group.
-- It exists so a card can surface the conflict (GEO.103.recitation: meetings says Maxwell
-- Hall 140, courses says Maxwell Hall 108) rather than pick silently. No courses column is
-- added; nothing is written back to courses.
create view v_course_display as
with shells as (
  select coalesce(c.parent_course_id, c.id) as display_id,
         c.id as shell_id,
         c.subject, c.number, c.title_short, c.location, c.bb_url
  from courses c
)
select s.display_id,
       min(s.subject) || ' ' || min(s.number)                      as code,
       min(s.title_short) filter (where s.shell_id = s.display_id) as title,
       array_agg(distinct s.shell_id)                              as shell_ids,
       jsonb_agg(distinct jsonb_build_object('day', m.day_of_week, 'start', m.start_time,
                                             'end', m.end_time, 'room', m.location))
         filter (where m.id is not null)                           as meetings,
       coalesce(bool_or(m.location is distinct from s.location)
                  filter (where m.id is not null), false)          as room_disputed,
       min(s.bb_url)                                               as bb_url
from shells s
left join meetings m on m.course_id = s.shell_id
group by s.display_id;

comment on view v_course_display is
  'One row per course group (parent shell wins the id); GEO.103 lecture+recitation merged. '
  'room_disputed = meetings.location disagrees with courses.location on at least one meeting; '
  'meetings.location is the authoritative side, the view only reports the disagreement.';
