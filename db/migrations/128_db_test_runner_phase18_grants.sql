-- bb2dash :: 128_db_test_runner_phase18_grants.sql
-- Phase 18 (brief 98, Contract row 128; B-42). Worker W-48.
--
-- Phase 15's test role (100) holds select on every table and execute only on what the sprint-1
-- suite called. Phase 18's tests call four new functions that 122, 123 and 126 grant elsewhere:
-- supersede_replaced_files and link_file_sessions to service_role only, file_week_no and
-- assignment_bb_url to authenticated, which db_test_runner holds WITH INHERIT FALSE, and the
-- role is no service_role member. Without these grants tasks 9, 10 and 13's tests fail with
-- permission denied.
--
-- One grant beyond the brief's row: stage_files(uuid, bigint), which task 11's replay test calls
-- (124 keeps 038's service_role-only ACL). stage_assignments is already granted by 100.
--
-- `update on bb_files` is re-stated for task 9's test (it un-supersedes 2 and 74 inside its
-- transaction); 100 already grants it, so this is a no-op there. Nothing on cron, vault, storage,
-- auth or net; nothing the role did not need.

grant execute on function
  public.supersede_replaced_files(uuid, bigint),
  public.link_file_sessions(bigint),
  public.file_week_no(text, text, text),
  public.assignment_bb_url(text, text),
  public.stage_files(uuid, bigint)
to db_test_runner;

grant update on public.bb_files to db_test_runner;
