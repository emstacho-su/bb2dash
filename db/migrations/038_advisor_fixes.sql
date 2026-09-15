-- bb2dash :: 038_advisor_fixes.sql
-- Phase 9. Closes the two advisor findings this phase introduced, and nothing else.
--
-- 1. SECURITY: "Signed-In Users Can Execute SECURITY DEFINER Function" (lint 0029).
--    Migrations 034 and 035 granted EXECUTE on the transform functions to `authenticated`,
--    which puts every one of them on the PostgREST surface as /rest/v1/rpc/<name>. They are
--    SECURITY DEFINER and run as postgres, so a caller reaching one gets postgres's reach over
--    the warehouse - and none of them needs to be callable from a browser:
--      * the cron calls transform_tick() and ical_poll() as postgres, which owns them;
--      * run_transform() is called by transform_tick, or by an operator through the MCP/service
--        connection;
--      * the stage_* functions and raise_attention() are only ever called from inside
--        run_transform, and a SECURITY DEFINER function's body runs as its owner, so the inner
--        calls need no grant at all;
--      * the web app's only path to a transform is inserting an agent_requests row, which the
--        tick drains within two minutes. That is the design, not a workaround.
--    So EXECUTE goes back to service_role only. If a later phase genuinely needs a browser-
--    triggered transform, the answer is an agent_requests row of kind 'transform', not a grant.
--
--    public.app_owner() is deliberately NOT touched: it is flagged by the same lint, but the
--    authenticated role must be able to call it for RLS policy evaluation, and it only ever
--    returns the owner's own uid. That trade-off is recorded in project-state/DECISIONS.md
--    (2026-09-10) and predates this phase.
--
-- 2. PERFORMANCE: "Auth RLS Initialization Plan" (lint 0003) on the three tables this phase
--    added. Migration 020's pattern - `auth.uid() = public.app_owner()` - re-evaluates both
--    functions once per row, and the brief said to copy it exactly, so attention_items,
--    agent_requests and app_settings inherited the problem. Wrapping each call in a scalar
--    subquery makes Postgres evaluate it once per statement instead; the predicate is
--    identical. attention_items is the one that will actually grow.
--
--    The 21 policies migration 020 created are left alone: they carry the same lint, but
--    rewriting tables outside this phase's range mid-phase would collide with the other worker
--    and belongs in its own change. Flagged to the PM in docs/planning/64_W15_VERIFICATION.md.

-- 1. Take the transform functions off the public API surface -----------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'raise_attention(bigint,text,text,text,text,text,jsonb,jsonb,text,jsonb)',
    'stage_courses(uuid,bigint)', 'stage_assignments(uuid,bigint)',
    'stage_announcements(uuid,bigint)', 'stage_files(uuid,bigint)', 'stage_gaps(uuid,bigint)',
    'run_transform(uuid,text)', 'transform_tick()', 'ical_poll()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- 2. One evaluation per statement, not per row ------------------------------------------------
drop policy if exists attention_items_owner_all on attention_items;
create policy attention_items_owner_all on attention_items for all to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));

drop policy if exists agent_requests_owner_all on agent_requests;
create policy agent_requests_owner_all on agent_requests for all to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));

drop policy if exists app_settings_owner_all on app_settings;
create policy app_settings_owner_all on app_settings for all to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));
