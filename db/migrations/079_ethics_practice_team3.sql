-- 079_ethics_practice_team3.sql
-- Phase 12b · P-home-7 follow-up (Stack, 2026-09-17: "Relabel team 2 to team 3 and move it").
--
-- The seed took Stack for Ethics Team 2; he is on Ethics Team 3 (Team 2 is his Synchrony
-- major-case group). 073 corrected the presentation row. This corrects the practice row, which is
-- bound to his own "Ethics Case Practice" gradebook column: Teams 3 & 4 practise with the
-- instructor on Tue 2026-09-22 (sessions row of that date). The id is kept so planner state,
-- column links and the calendar event id stay attached.
--
-- Data only. No stage function writes title, group_key or a date-only due_date on this row's
-- source ('syllabus'); a later Blackboard due date would arrive as an Inbox conflict, not a write.

do $$
declare
  n integer;
begin
  update assignments
     set title       = 'Ethics Team 3 practice presentation (30 min)',
         group_key   = 'Ethics Group #3',
         due_date    = date '2026-09-22',
         description = 'Ethics Teams 3 & 4 practice with the instructor on Tue 9/22 (Yom Kippur '
                       '9/21 note in the schedule). 30-min practice: bring deck + classroom '
                       'questions. Up to 50 pts. Stack is on Ethics Team 3; the row was seeded as '
                       'Team 2 (9/8) by mistake.',
         source_ref  = 'IST466M3 Schedule Fall2026Wk2xy.docx (v. Sep 3): wk 5; '
                       'Stack 2026-09-17 (team 3)',
         updated_at  = now()
   where id = 'IST.466/ethics-team-2-practice';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '079: expected 1 IST.466/ethics-team-2-practice row, updated %', n;
  end if;
end $$;
