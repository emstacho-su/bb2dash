-- bb2dash :: db/migrations/141_workspace_realtime_policy.sql
-- Phase 21 (docs/planning/sprint-2/briefs/102_PHASE21_workspace.md), task 3 (P-87). Worker W-63.
--
-- WHY. The Workspace page shows an answer while it is being written. The runner sends each piece
-- of text as a Realtime Broadcast on the private topic `workspace:<conversation uuid>`
-- (`workspace_stream` and `workspace_finish`, 142), and the page listens on that topic. A private
-- channel is authorised by row security on `realtime.messages`: Realtime sets `realtime.topic` to
-- the topic a client asks to join and then reads the table as that client. Until this file the
-- table had row security on and no policy at all, so nobody could join anything.
--
-- WHAT. One policy, `workspace_owner_receive`: the owner may SELECT broadcast rows while the
-- session's topic is a Workspace one. `workspace:%` also covers `workspace:lobby`, the topic the
-- page holds when no conversation is selected.
--
-- CLIENTS ONLY RECEIVE. There is no INSERT, UPDATE or DELETE policy, so a client's own send dies
-- on the missing insert policy. The runner's sends are made inside SECURITY DEFINER functions
-- owned by `postgres`, which bypasses row security.
--
-- `postgres` does not own `realtime.messages`; it may create this policy all the same, because
-- `supautils.policy_grants` names the table for it (read on prod 2026-10-05).
--
-- Additive only: no drop, no existing policy changed.

create policy workspace_owner_receive on realtime.messages
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner())
         and extension = 'broadcast'
         and (select realtime.topic()) like 'workspace:%');

-- =============================================================================================
-- Guard
-- =============================================================================================
do $$
declare
  v_got text;
begin
  -- Exactly this one policy on the table: the owner receives, nobody sends.
  select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+'), ', '
                    order by p.policyname)
    into v_got
    from pg_policies p
   where p.schemaname = 'realtime' and p.tablename = 'messages';
  if v_got is distinct from 'workspace_owner_receive:SELECT:authenticated' then
    raise exception 'FAIL 141: the policies on realtime.messages are [%], expected exactly workspace_owner_receive for SELECT to authenticated', v_got;
  end if;

  if not exists (select 1
                   from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'realtime' and c.relname = 'messages' and c.relrowsecurity) then
    raise exception 'FAIL 141: row security is off on realtime.messages';
  end if;
end $$;
