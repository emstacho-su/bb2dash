-- bb2dash :: 063_announcements_seen.sql
-- Phase 11 (docs/planning/69_PHASE11_planner.md, Contract "Migrations", 063). Worker W-21.
-- Pushed FIRST of the 060-064 set because W-22's bell reads both objects below.
--
-- WHAT THIS IS. The bell needs one question answered - "how many announcements has Stack not
-- seen?" - and one verb - "he has seen them now". Nothing else. There is no new column: 033
-- added `announcements.read_at` for exactly this and its comment already says so, so the
-- Contract renames the definition-of-done's `seen_at` wording to `read_at` from here on.
--
-- TWO DIFFERENT "READ" MARKS, and why both appear in the where clause.
--   announcements.is_read  Blackboard's own flag, written by stage_announcements on every sync.
--                          An announcement Stack already opened inside Blackboard Ultra is not
--                          new to him, so it must never light the bell.
--   announcements.read_at  bb2dash's mark, stamped by mark_announcements_seen() and never
--                          written by a sync (Contract seam table). It is the only thing the
--                          bell and the /announcements page write.
-- Unread therefore means: bb2dash has not shown it to him AND Blackboard does not already
-- think he read it. `is distinct from true` rather than `= false` because is_read is nullable
-- and a null there means "Blackboard did not say", which is not the same as "he read it".
--
-- SEMANTICS OF THE VERB. mark_announcements_seen() stamps every unread row, not a list of ids:
-- Stack's decision (2026-09-14) is that opening the dropdown marks its items seen and that the
-- /announcements page does the same (Q4), and there is no per-item read tracking in the MVP.
-- It is SECURITY INVOKER on purpose - the announcements_owner_all policy is what scopes the
-- update, so a second authenticated uid would stamp zero rows rather than everybody's.
--
-- The view is security_invoker with anon revoked, as 036's guard block requires of every public
-- view; an owner-run view here would hand the whole announcement stream to the publishable key.

-- ---------------------------------------------------------------------------------------------
-- 1. v_announcements_unread - what the badge counts and what the dropdown lists first
-- ---------------------------------------------------------------------------------------------
create or replace view v_announcements_unread as
select a.id, a.course_id, c.title_short as course, a.title, a.author, a.posted_at,
       a.modified_at, a.read_at
  from announcements a join courses c on c.id = a.course_id
 where a.read_at is null and a.is_read is distinct from true;

alter view v_announcements_unread set (security_invoker = true);

comment on view v_announcements_unread is
  'Announcements the owner has not been shown in bb2dash (read_at is null) and has not already '
  'read inside Blackboard (is_read is distinct from true). The bell badge is count(*) over this '
  'view; the dropdown lists these rows first. security_invoker, so the owner RLS policy on '
  'announcements decides what it returns.';

-- ---------------------------------------------------------------------------------------------
-- 2. mark_announcements_seen - the only writer of read_at
-- ---------------------------------------------------------------------------------------------
create or replace function mark_announcements_seen() returns int
  language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  n int;
begin
  update announcements set read_at = now() where read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

comment on function mark_announcements_seen() is
  'Stamp read_at = now() on every announcement that has none, and return how many rows changed. '
  'Called when the bell dropdown opens and when /announcements is visited (Stack, 2026-09-14: '
  'opening marks seen; there is no per-item read tracking). SECURITY INVOKER so the '
  'announcements_owner_all policy scopes it to the owner''s own rows.';

-- ---------------------------------------------------------------------------------------------
-- 3. Privileges. The app reads and calls both as the owner; anon has no business here.
-- ---------------------------------------------------------------------------------------------
revoke all on v_announcements_unread from anon;
grant select on v_announcements_unread to authenticated, service_role;

revoke all on function public.mark_announcements_seen() from public, anon;
grant execute on function public.mark_announcements_seen() to authenticated, service_role;
