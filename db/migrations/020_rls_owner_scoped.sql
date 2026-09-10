-- bb2dash :: 020_rls_owner_scoped.sql
-- W-9 RLS hardening (21_D2 §2 "belt and braces", §13.5). Sequenced after the first
-- permissive-RLS preview on purpose (project-state/DECISIONS.md 2026-09-09).
--
-- Before: every typed/planner/corpus/search table carries a permissive
--   `<t>_owner_all for all to authenticated using (true) with check (true)` policy,
-- so ANY authenticated JWT (and Supabase email signup is on by default) can read and
-- write the entire database. This migration scopes read/write to the single owner.
--
-- Owner is resolved BY EMAIL, not a hardcoded uid: the account has already been
-- recreated once (the uid changed), so a literal uid is recreation-fragile. A
-- SECURITY DEFINER function reads auth.users during policy evaluation and returns the
-- current uid for the owner email; recreating the account with the same email keeps
-- RLS working with no further migration. (A hardcoded-uid variant was written and
-- rejected for this reason — see project-state/DECISIONS.md.)
--
-- PRESERVED UNCHANGED: the five anon INSERT-only policies (bb_raw, bb_files,
-- bb_file_text, bb_text_embeddings, and storage.objects bb-files insert) that the
-- browser crawler / extraction / embed jobs depend on. service_role bypasses RLS and
-- is untouched. RLS stays ENABLED on every table.
--
-- Additive and idempotent: drop-if-exists then recreate each policy under the same
-- name; safe to re-run.

-- 1. The owner resolver. SECURITY DEFINER so the authenticated role can read auth.users
--    through it during policy evaluation without a direct grant on that table.
create or replace function public.app_owner() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select id from auth.users where email = 'emstacho@syr.edu' limit 1 $$;

revoke all on function public.app_owner() from public, anon;
grant execute on function public.app_owner() to authenticated;

comment on function public.app_owner() is
  'Returns the uid of the single bb2dash owner, resolved by email (emstacho@syr.edu) so an account recreation with the same email keeps owner-scoped RLS working. SECURITY DEFINER; used by every <t>_owner_all policy.';

-- 2. Guard: refuse to apply if the owner email has no auth.users row. Applying
--    owner-scoped policies while app_owner() is NULL would make auth.uid() = NULL
--    for the predicate and lock every authenticated user out of everything.
do $$
begin
  if public.app_owner() is null then
    raise exception
      'app_owner() resolves to NULL (no auth.users row for the owner email) - refusing to apply owner-scoped RLS, which would lock everyone out';
  end if;
end $$;

-- 3. Typed warehouse + planner + corpus + search tables: replace each permissive
--    `using (true)` authenticated policy with an owner-scoped one, same policy name.
--    RLS is already enabled on all of these and is not touched.
drop policy if exists announcements_owner_all on announcements;
create policy announcements_owner_all on announcements for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists assignment_progress_owner_all on assignment_progress;
create policy assignment_progress_owner_all on assignment_progress for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists assignments_owner_all on assignments;
create policy assignments_owner_all on assignments for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists bb_content_owner_all on bb_content;
create policy bb_content_owner_all on bb_content for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists bb_file_text_owner_all on bb_file_text;
create policy bb_file_text_owner_all on bb_file_text for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists bb_files_owner_all on bb_files;
create policy bb_files_owner_all on bb_files for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists bb_raw_owner_all on bb_raw;
create policy bb_raw_owner_all on bb_raw for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists bb_text_embeddings_owner_all on bb_text_embeddings;
create policy bb_text_embeddings_owner_all on bb_text_embeddings for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists course_maps_owner_all on course_maps;
create policy course_maps_owner_all on course_maps for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists course_staff_owner_all on course_staff;
create policy course_staff_owner_all on course_staff for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists courses_owner_all on courses;
create policy courses_owner_all on courses for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists effort_base_owner_all on effort_base;
create policy effort_base_owner_all on effort_base for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists grade_components_owner_all on grade_components;
create policy grade_components_owner_all on grade_components for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists grading_schemes_owner_all on grading_schemes;
create policy grading_schemes_owner_all on grading_schemes for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists meetings_owner_all on meetings;
create policy meetings_owner_all on meetings for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists reading_progress_owner_all on reading_progress;
create policy reading_progress_owner_all on reading_progress for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists readings_owner_all on readings;
create policy readings_owner_all on readings for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists sessions_owner_all on sessions;
create policy sessions_owner_all on sessions for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists sync_runs_owner_all on sync_runs;
create policy sync_runs_owner_all on sync_runs for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists sync_stage_runs_owner_all on sync_stage_runs;
create policy sync_stage_runs_owner_all on sync_stage_runs for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

drop policy if exists terms_owner_all on terms;
create policy terms_owner_all on terms for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

-- 4. Storage: the bb-files bucket is public (object READS bypass RLS, so signed/public
--    URLs and the GUI Open ladder are unaffected). This authenticated ALL policy governs
--    authenticated WRITES/DELETES on those objects; scope it to the owner. The bucket
--    predicate is kept and the owner check ANDed on. The anon INSERT policy on this
--    table is left untouched.
drop policy if exists bb_files_auth_all on storage.objects;
create policy bb_files_auth_all on storage.objects for all to authenticated
  using (bucket_id = 'bb-files' and auth.uid() = public.app_owner())
  with check (bucket_id = 'bb-files' and auth.uid() = public.app_owner());
