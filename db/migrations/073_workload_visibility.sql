-- bb2dash :: 073_workload_visibility.sql
-- Phase 12b, item H-4 (docs/planning/80c_PHASE12B_page_pass.md: P-home-6, P-home-7, Stack's
-- answers 7, 8 and 9). Worker W-30.
--
-- THE PROBLEM
--   1. The Undated tray leads with three rows that are not work at all. `ECN.304/quiz-series` and
--      `GEO.103/reading-quiz-series` are `inferred` series placeholders standing in for quizzes the
--      syllabus says exist but never dates; `GEO.103/discussion-questions` is weekly prep that is
--      handwritten and handed in in person, with no Blackboard item. Stack's answer 9: hide all
--      three. There is nowhere to say so - `v_work_items.in_workload` is derived purely from
--      `effort_base`, i.e. from the assignment's TYPE, and quiz/discussion_post are workload types.
--   2. Ten `readings` rows are the IST.466 HBR case pool. Nine belong to the other ethics teams;
--      Stack reads only his own. They are `required = false` already, but 016 hardcodes
--      `true as in_workload` for every reading and ignores `required`, so all ten sit undated in
--      the tray and in the day-load sums. Answer 8: `required = false` readings leave Undated and
--      the workload in EVERY course; they stay in Materials.
--   3. Stack is on Ethics Team 3, not Team 2 (Team 2 is his Synchrony major-case group). His case
--      is "Apple vs. The FBI" - `readings` 89, which therefore has a date: the Team 2 & 3
--      presentation on Thu 2026-09-24 (`sessions` 2026-09-24 "Ethics Team 2 & 3 Presentation";
--      Team 3 practice is the 9/22 session). The assignment row seeded for that presentation is
--      labelled for Team 2 and guesses the wrong case.
--
-- THE FIX
--   * `assignments.hidden_from_workload boolean not null default false` - Stack's flag, set here on
--      the three placeholders. NO stage function writes it (db/tests asserts that), so a sync can
--      rewrite every fact on those rows without un-hiding them.
--   * `v_work_items.in_workload` becomes `e.in_workload and not a.hidden_from_workload` for
--     assignments and `r.required is not false` for readings. Same columns, same order, same
--     security_invoker, same grants: `create or replace view`, so the four dependants
--     (v_calendar_push_items and the web/desktop readers) are untouched. v_calendar_push_items
--     already filters `w.in_workload` and only reads `item_kind = 'assignment'` rows that have a
--     date, so none of the twelve newly hidden rows was ever pushed to Google.
--   * Data, three statements, each asserted to touch exactly the rows it names.
--
-- BLAST RADIUS (measured on prod before applying; recorded in docs/planning/80g_W30_VERIFICATION.md)
--   assignments in_workload  75 -> 72     readings in_workload  86 -> 61
--   undated rows counted     13 -> 0      v_work_items rows    169 -> 169 (nothing is dropped)
--   The 25 readings that leave the workload are the 16 dated ECN.304 optional readings (answer 8,
--   deliberate) and the nine other-team IST.466 cases. All 86 stay in `readings` and in Materials.
--
-- This migration writes to `assignments` and `readings`, which are FACT tables. It does not touch
-- `assignment_progress` or `reading_progress`: Stack's planner state is not written here.

-- =============================================================================================
-- 1. The flag
-- =============================================================================================
alter table assignments
  add column hidden_from_workload boolean not null default false;

comment on column assignments.hidden_from_workload is
  'Stack''s "do not count this as work" flag (Phase 12b H-4). true keeps the row in assignments, '
  'Materials and the gradebook but drops it out of v_work_items.in_workload, so it leaves the '
  'Undated tray, the day-load sums and the calendar push. Owned by Stack alone - no stage '
  'function may write it, so a sync never resurrects a hidden row.';

-- =============================================================================================
-- 2. Data: the three series placeholders (answer 9)
-- =============================================================================================
do $$
declare n int;
begin
  update assignments
     set hidden_from_workload = true,
         updated_at           = now()
   where id in ('ECN.304/quiz-series',
                'GEO.103/reading-quiz-series',
                'GEO.103/discussion-questions');
  get diagnostics n = row_count;
  if n <> 3 then
    raise exception '073: expected to hide 3 series placeholders, hid %', n;
  end if;
end $$;

-- =============================================================================================
-- 3. Data: readings 89 is Stack's own case - dated 9/24 and required (answer 7)
-- =============================================================================================
-- Keyed on the business key, not the generated id: (course_id, citation) is what identifies the
-- case if the reading seed is ever replayed.
do $$
declare n int;
begin
  update readings
     set for_date = date '2026-09-24',
         required = true,
         notes    = concat_ws(' ', nullif(notes, ''),
                              'Stack''s Ethics Team 3 case; presented 2026-09-24 (practice 9/22).')
   where course_id = 'IST.466'
     and citation  = 'HBR: Apple vs. The FBI';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '073: expected 1 "HBR: Apple vs. The FBI" reading in IST.466, updated %', n;
  end if;
end $$;

-- =============================================================================================
-- 4. Data: the ethics presentation row is Team 3's (answer 7)
-- =============================================================================================
-- The id is deliberately NOT changed: it is the key `stage_assignments` and `apply_resolutions`
-- bind to, and it is already bound to gradebook column _3562497_1. Only the labels move. The
-- facts on the row (due_date 2026-09-24, 100 pts, the column id) were already right.
do $$
declare n int;
begin
  update assignments
     set title       = 'Ethics Team 3 presentation',
         group_key   = 'Ethics Group #3',
         description = 'Ethics Team 2 & 3 presentations Thu 9/24 (attendance/participation '
                       'counted). 40 min incl. discussion, up to 20 slides, every member '
                       'presents, one monitors chat; <30 min capped at 65 pts. Team must '
                       'purchase its assigned HBR case. Rubric: Analysis 60 / Polish 20 / '
                       'Slides 15 / Execution 25. Stack is on Ethics Team 3 (Team 2 is his '
                       'Synchrony major-case group); assigned case "Apple vs. The FBI" '
                       '(readings 89). Team 3 practises with the instructor on 9/22.',
         source_ref  = 'IST466M3 Fall2026 Syllabus.docx; IST466 Ethics Cases Spring 2026.docx; '
                       'schedule wk 5; Stack 2026-09-17 (team 3 + assigned case)',
         updated_at  = now()
   where id = 'IST.466/ethics-team-2-presentation';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '073: expected 1 IST.466/ethics-team-2-presentation row, updated %', n;
  end if;
end $$;

-- =============================================================================================
-- 5. v_work_items, recreated: same columns, same order, one changed expression per branch
-- =============================================================================================
create or replace view v_work_items
  with (security_invoker = true) as
select 'assignment'::text                          as item_kind,
       a.id::text                                  as item_id,
       a.course_id,
       a.title,
       a.type::text                                as type,
       e.category,
       e.glyph,
       (e.in_workload and not a.hidden_from_workload) as in_workload,
       a.due_at,
       coalesce(a.due_at::date, a.due_date)        as due_on,
       a.due_rule,
       a.points_possible,
       a.submission::text                          as submission,
       a.series_key,
       a.sequence_no,
       coalesce(p.status, 'not_started')::text     as status,
       p.priority::text                            as priority,
       e.effort,
       e.effort_source,
       e.is_override,
       e.multiplier_applied,
       suggested_start(a.course_id, coalesce(a.due_at::date, a.due_date), e.effort) as suggested_start,
       (coalesce(a.due_at::date, a.due_date) is null) as undated,
       a.confidence::text                          as confidence
from assignments a
join v_assignment_effort e        on e.id = a.id
left join assignment_progress p   on p.assignment_id = a.id
union all
select 'reading'::text,
       r.id::text,
       r.course_id,
       r.citation,
       'reading'::text,
       'reading'::text,
       'R'::text,
       (r.required is not false),
       null::timestamptz,
       r.for_date,
       null::text,
       null::numeric,
       null::text,
       null::text,
       null::smallint,
       coalesce(rp.status, 'not_started')::text,
       null::text,
       coalesce((select b.base from effort_base b where b.type = 'reading'), 2.0),
       'base'::text,
       false,
       false,
       suggested_start(r.course_id, r.for_date,
                       coalesce((select b.base from effort_base b where b.type = 'reading'), 2.0)),
       (r.for_date is null),
       r.confidence::text
from readings r
left join reading_progress rp on rp.reading_id = r.id;

comment on view v_work_items is
  'Union of assignments and readings for every planner surface: due_on, undated flag, coalesced '
  'planner status, effort with its source label, glyph/category, in_workload and the suggested '
  'start date. v_upcoming/v_overdue stay as-is for compatibility. in_workload (073): an assignment '
  'counts when its type counts (effort_base) AND Stack has not set hidden_from_workload; a reading '
  'counts when required is not false. Rows are never dropped - hidden work is still listed in '
  'Materials, the gradebook and the course pages.';

-- =============================================================================================
-- Privileges, re-stated (036's rule)
-- =============================================================================================
alter view v_work_items set (security_invoker = true);
revoke all on v_work_items from public, anon;
grant select on v_work_items to authenticated, service_role;

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
