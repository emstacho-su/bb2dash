-- bb2dash :: 009_upcoming_excludes_missed.sql
create or replace view v_upcoming as
select a.id, a.course_id, c.title_short, a.title, a.type, a.due_at, a.due_date, a.due_rule,
       a.points_possible, a.confidence, coalesce(p.status,'not_started') as status, p.priority
from assignments a
join courses c on c.id = a.course_id
left join assignment_progress p on p.assignment_id = a.id
where coalesce(a.due_at::date, a.due_date) >= current_date
  and coalesce(p.status,'not_started') not in ('submitted','graded','excused','not_applicable','waived','missed')
order by coalesce(a.due_at, a.due_date::timestamptz);
alter table courses add column if not exists bb_group_id text, add column if not exists bb_group_set_id text;
