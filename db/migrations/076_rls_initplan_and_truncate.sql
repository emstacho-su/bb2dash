-- bb2dash :: 076_rls_initplan_and_truncate.sql
-- Phase 12b, item X-3 (docs/planning/80c_PHASE12B_page_pass.md: P-db-1, P-db-2). Worker W-30.
--
-- TWO CARRY-INS, ONE MIGRATION, both about the same boundary.
--
-- 1. TRUNCATE (P-db-1). STATUS logged it as "the calendar_events TRUNCATE grant"; measured, it is
--    every table and view in `public`: Supabase's default privileges hand `arwdDxtm` - which
--    includes D, TRUNCATE - to `anon` and `authenticated` on anything created in the schema. 79
--    such grants existed (26 to anon, 53 to authenticated). Migration 020 scoped every table to
--    the owner with RLS, and 036 did the same for the views, but **TRUNCATE is not subject to
--    RLS**: a role that holds it empties the table whatever the policies say. So the one operation
--    RLS cannot defend was granted to the role the browser holds. `planner_events` (067) is the
--    only table that already got this right, by revoking all and re-granting the four verbs.
--    Fixed here for the whole schema, plus the default privileges, so a table added by a later
--    migration does not quietly hand it back. SELECT / INSERT / UPDATE / DELETE are untouched:
--    those ARE subject to RLS and the owner policies are the boundary for them.
--
-- 2. auth_rls_initplan (P-db-2). 22 policies call `auth.uid()` bare in their USING / WITH CHECK
--    expression, so Postgres re-evaluates it once per row instead of once per statement (21 in
--    `public`, which is what the advisor counts, plus `storage.objects bb_files_auth_all`, which
--    it does not see). The documented remedy is to wrap the call in a scalar subquery, which the
--    planner hoists into an InitPlan. `app_owner()` is wrapped in the same breath - it is a
--    SECURITY DEFINER lookup into auth.users and has no business running per row either. The
--    policies that were written after this was understood (agent_requests, app_settings,
--    attention_items, bb_attempts, bb_gradebook, calendar_events, calendar_push_runs,
--    grade_column_links, grade_scenarios, the four planner_events policies) already read this way
--    and are not touched.
--
-- NOTHING ABOUT WHO CAN SEE WHAT CHANGES. `(select auth.uid()) = (select app_owner())` is the same
-- predicate as `auth.uid() = app_owner()`; only how often it is computed changes. The SQL test
-- proves it by reading as the owner's uid and as a stranger's.

-- =============================================================================================
-- 1. public: the 21 owner policies the advisor flags
-- =============================================================================================
alter policy announcements_owner_all        on announcements
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy assignment_progress_owner_all  on assignment_progress
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy assignments_owner_all          on assignments
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy bb_content_owner_all           on bb_content
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy bb_file_text_owner_all         on bb_file_text
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy bb_files_owner_all             on bb_files
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy bb_raw_owner_all               on bb_raw
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy bb_text_embeddings_owner_all   on bb_text_embeddings
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy course_maps_owner_all          on course_maps
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy course_staff_owner_all         on course_staff
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy courses_owner_all              on courses
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy effort_base_owner_all          on effort_base
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy grade_components_owner_all     on grade_components
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy grading_schemes_owner_all      on grading_schemes
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy meetings_owner_all             on meetings
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy reading_progress_owner_all     on reading_progress
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy readings_owner_all             on readings
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy sessions_owner_all             on sessions
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy sync_runs_owner_all            on sync_runs
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy sync_stage_runs_owner_all      on sync_stage_runs
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));
alter policy terms_owner_all                on terms
  using ((select auth.uid()) = (select app_owner())) with check ((select auth.uid()) = (select app_owner()));

-- =============================================================================================
-- 2. storage: the 22nd, which the advisor does not report
-- =============================================================================================
-- The bucket test stays first and outside the subqueries: it is the cheap per-row filter, and it
-- is what keeps this policy from claiming rows in any other bucket.
alter policy bb_files_auth_all on storage.objects
  using       (bucket_id = 'bb-files' and (select auth.uid()) = (select app_owner()))
  with check  (bucket_id = 'bb-files' and (select auth.uid()) = (select app_owner()));

-- =============================================================================================
-- 3. TRUNCATE: take it off what exists, and off what is created next
-- =============================================================================================
revoke truncate on all tables in schema public from anon, authenticated;

-- Only the `postgres` default-privilege row can be changed from here, and that is the one that
-- matters: every bb2dash migration creates its tables as postgres. Supabase's own `supabase_admin`
-- row is left alone - nothing in this repo creates a table as that role.
alter default privileges in schema public revoke truncate on tables from anon, authenticated;

-- =============================================================================================
-- Guards: refuse to record this migration if any of the three conditions is still true
-- =============================================================================================
do $$
declare
  bare  text;
  held  text;
  n_own int;
begin
  select string_agg(schemaname || '.' || tablename || ' ' || policyname, ', '
                    order by schemaname, tablename, policyname) into bare
    from pg_policies
   where replace(replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                         '( SELECT auth.uid() AS uid)', ''),
                 '(select auth.uid())', '') like '%auth.uid()%';
  if bare is not null then
    raise exception '076: these policies still call auth.uid() per row: %', bare;
  end if;

  select string_agg(grantee || ' on ' || table_name, ', ' order by grantee, table_name) into held
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
     and privilege_type = 'TRUNCATE';
  if held is not null then
    raise exception '076: TRUNCATE is still granted: %', held;
  end if;

  -- The 35 owner-scoped policies measured before this migration must all still be here: an
  -- ALTER POLICY that dropped one would be a hole, not a speedup.
  select count(*) into n_own from pg_policies
   where coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%app_owner%';
  if n_own <> 35 then
    raise exception '076: % owner-scoped policies remain, expected the 35 that existed before', n_own;
  end if;
end $$;
