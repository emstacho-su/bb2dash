-- bb2dash :: db/migrations/100_db_test_runner_role.sql
-- Phase 15, task 4 (P-100, P-31, B-42). The login role the SQL test runner connects as.
--
-- `scripts/db-test.mjs` runs every file in db/tests/ against prod inside a transaction the file
-- opens and rolls back. It needs a credential that is narrower than the owner: it may read
-- everything in `public`, write only the tables the suite writes, and call only the functions the
-- suite calls. It gets BYPASSRLS because the suite's fixtures are written as the session role, the
-- way they were written as `postgres` through MCP; role attributes are not inherited, so
-- membership in `service_role` would not supply it. It is a member of `anon` and `authenticated`
-- WITH INHERIT FALSE, so the four files that `set local role` into those roles mid-transaction
-- still work while the role itself inherits neither one's privileges.
--
-- THE FILE CARRIES NO PASSWORD, EVER. Stack sets it by hand in an unsaved SQL-editor tab and keeps
-- the DSN in the gitignored `.env.local` (acceptance step 1). Nothing here reads or writes it.
--
-- The three lists below (tables, sequences, functions) are derived from the 21 test units, by
-- reading every file in db/tests/ and recording which statements run as the session role and which
-- run under `set local role anon` / `set local role authenticated` (those need anon's and
-- authenticated's grants, which already exist, not this role's). Each function is named by its
-- identity signature so a future overload cannot silently inherit the grant. A gap found by a live
-- check goes in 103, and one found after 103 is on prod goes in 104; this file stays byte-frozen.
--
-- Additive only: no drop, no rename, no function body change.

-- =============================================================================================
-- 1. The role
-- =============================================================================================

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise notice 'db_test_runner already exists; its settings and grants are re-applied below';
  else
    create role db_test_runner with login bypassrls nosuperuser nocreatedb nocreaterole
      noreplication connection limit 2;
  end if;
end $$;

-- A unit that hangs must not hold a transaction open against prod: the suite's slowest unit is
-- well under a minute, and every unit is one statement to the server.
alter role db_test_runner set statement_timeout = '60s';
alter role db_test_runner set idle_in_transaction_session_timeout = '30s';

-- `set local role anon` / `set local role authenticated` inside a unit, and nothing inherited
-- outside one. Role attributes (BYPASSRLS above) are not inherited either way.
grant anon, authenticated to db_test_runner with inherit false;

-- =============================================================================================
-- 2. Schemas and reads
-- =============================================================================================

-- `public` for everything the suite asserts on. `extensions` because `match_file_text` and
-- `hybrid_search_file_text` resolve `operator(extensions.<=>)` as the caller; the
-- `extensions.cosine_distance(vector, vector)` behind that operator keeps its PUBLIC execute
-- (prod 2026-09-27), so no execute grant inside `extensions` is needed. No other schema is
-- granted: `pg_catalog`, `information_schema` and `net` reach the role through PUBLIC, and
-- `vault`, `storage`, `auth` and `cron` grant PUBLIC nothing, so the role has nothing there.
grant usage on schema public to db_test_runner;
grant usage on schema extensions to db_test_runner;

grant select on all tables in schema public to db_test_runner;
alter default privileges for role postgres in schema public grant select on tables to db_test_runner;

-- =============================================================================================
-- 3. Writes: exactly the tables the suite writes as the session role
-- =============================================================================================
--
--   agent_requests       phase10a_load_fixtures, phase10a_stage_gradebook, phase12b_077,
--                        phase12b_087, phase12b_load_fixture
--   assignment_progress  phase12b_078, phase12b_087
--   assignments          phase12b_075, phase12b_084
--   attention_items      inbox_apply_090 (also through archive_attention_item, which is
--                        SECURITY INVOKER), phase12b_086
--   bb_files             phase10a_stage_attempts, phase12b_074, phase12b_086
--   bb_gradebook         phase12b_087
--   bb_raw               phase10a_load_fixtures, phase10a_stage_gradebook, phase12b_084,
--                        phase12b_087, phase12b_load_fixture
--   courses              phase10b_round2
--   grade_column_links   phase10b_grade_model, phase10b_round2
--   grade_scenarios      phase10b_grade_model, phase10b_round2
--   readings             phase12b_074, phase12b_086
--   sync_runs            phase10a_load_fixtures, phase10a_stage_gradebook, phase12b_087,
--                        phase12b_load_fixture
--
-- `planner_events` and `planner_event_series` are absent on purpose: every write to them in
-- phase12b_082_083 runs under `set local role authenticated`, on authenticated's own grants.
-- The stage functions and `link_reading_files` / `raise_attention` are SECURITY DEFINER, so their
-- writes are the owner's, not this role's.

grant insert, update, delete on
  public.agent_requests,
  public.assignment_progress,
  public.assignments,
  public.attention_items,
  public.bb_files,
  public.bb_gradebook,
  public.bb_raw,
  public.courses,
  public.grade_column_links,
  public.grade_scenarios,
  public.readings,
  public.sync_runs
to db_test_runner;

-- Derived, not written by any unit directly: `assignments_mark_calendar_dirty()` is a SECURITY
-- INVOKER statement trigger on `assignments`, so the `update app_settings set gcal_dirty = true`
-- inside it runs as this role whenever phase12b_075 or phase12b_084 touches `assignments`.
-- UPDATE only: nothing the suite does inserts or deletes the single settings row.
grant update on public.app_settings to db_test_runner;

-- The sequences behind the written tables. All six are GENERATED ALWAYS AS IDENTITY, which
-- Postgres advances without a USAGE check, so these grants are belt and braces; they are here
-- because the contract names them, and because a column converted from identity to a `nextval`
-- default later would otherwise fail silently at the next run.
grant usage on sequence
  public.agent_requests_id_seq,
  public.attention_items_id_seq,
  public.bb_files_id_seq,
  public.bb_raw_id_seq,
  public.readings_id_seq,
  public.sync_runs_id_seq
to db_test_runner;

-- =============================================================================================
-- 4. Execute: exactly the functions the suite calls as the session role
-- =============================================================================================
--
-- Called straight from a unit, as the session role:
--   app_owner                       phase10b_grade_model:144, phase12b_076:70,
--                                   phase12b_082_083:30, phase12b_089:22
--   archive_attention_item          inbox_apply_090
--   attention_answered              inbox_apply_090:129
--   attention_keep_stands           inbox_apply_090:112
--   bb_assignment_type              phase12b_084
--   bb_file_relpath                 phase10a_stage_attempts, phase15_101 (101's guard (e))
--   bb_jarray                       phase10a_stage_gradebook, phase12b_084
--   bb_resolve_course               phase10a_stage_gradebook, phase12b_084
--   link_reading_files              phase12b_074, phase12b_086
--   planner_series_max_occurrences  phase12b_082_083:754 (after `reset role`)
--   raise_attention                 inbox_apply_090
--   reading_match_tokens            phase12b_074
--   run_transform                   phase9_transform_states (P-8)
--   stage_assignments               phase12b_075, phase12b_084
--   stage_attempts                  phase10a_stage_attempts, phase12b_085
--   stage_gradebook                 phase10a_*, phase12b_078, phase12b_087
--   sync_change_lines               phase10a_stage_gradebook
--   transform_tick                  phase12b_077:117, phase9_transform_states (P-8)
--   search_file_text                phase15_101 (101's guard (d))
--   match_file_text                 phase15_101 (101's guard (d))
--   hybrid_search_file_text         phase15_101 (101's guard (d))
--
-- Reached through a view the suite selects, evaluated in the caller's session because every public
-- view is `security_invoker` (036):
--   calendar_event_id               v_calendar_push_items, read by phase12b_075, phase12b_084
--                                   and phase12b_089:183
--
-- Not granted, and why: `suggested_start(text, date, numeric)` (behind `v_work_items`),
-- `classify_bb_file(text, text, text)`, `set_updated_at()` and the three search functions above
-- already keep PUBLIC execute, so `search_file_text` / `match_file_text` /
-- `hybrid_search_file_text` and `bb_file_relpath` are granted here only to make 101's test
-- independent of that. `planner_series_create` / `_update` / `_delete` / `_check_rows` are called
-- only under `set local role authenticated`. Trigger functions are not granted: Postgres checks
-- EXECUTE on a trigger function at CREATE TRIGGER time, not when the trigger fires.

grant execute on function
  public.app_owner(),
  public.archive_attention_item(bigint, jsonb, text),
  public.attention_answered(text, text, text, text),
  public.attention_keep_stands(text, text, text, jsonb),
  public.bb_assignment_type(text),
  public.bb_file_relpath(bigint),
  public.bb_jarray(jsonb),
  public.bb_resolve_course(text),
  public.calendar_event_id(text),
  public.hybrid_search_file_text(text, extensions.vector, text, text, integer, integer, double precision, boolean),
  public.link_reading_files(bigint),
  public.match_file_text(extensions.vector, text, text, integer, boolean),
  public.planner_series_max_occurrences(),
  public.raise_attention(bigint, text, text, text, text, text, jsonb, jsonb, text, jsonb),
  public.reading_match_tokens(text),
  public.run_transform(uuid, text),
  public.search_file_text(text, text, integer, boolean),
  public.stage_assignments(uuid, bigint),
  public.stage_attempts(uuid, bigint),
  public.stage_gradebook(uuid, bigint),
  public.sync_change_lines(jsonb),
  public.transform_tick()
to db_test_runner;

-- =============================================================================================
-- 5. Guard: the limits this role is defined by
-- =============================================================================================

do $$
declare
  v_bad text;
begin
  -- (a) Nothing in this role's name on the five schemas it must not reach.
  select string_agg(n.nspname, ', ' order by n.nspname) into v_bad
    from pg_namespace n, aclexplode(n.nspacl) a
   where n.nspname in ('vault', 'storage', 'auth', 'cron', 'net')
     and a.grantee = 'db_test_runner'::regrole;
  if v_bad is not null then
    raise exception 'FAIL 100 granted db_test_runner something on %', v_bad;
  end if;

  -- (b) And it holds no USAGE on four of them. `net` is left out: PUBLIC holds usage on it, so
  -- every role has it; closing that would mean revoking PUBLIC's usage on `net`, a wider change
  -- than this phase takes.
  select string_agg(s, ', ' order by s) into v_bad
    from unnest(array['vault', 'storage', 'auth', 'cron']) s
   where has_schema_privilege('db_test_runner', s, 'USAGE');
  if v_bad is not null then
    raise exception 'FAIL db_test_runner has USAGE on %', v_bad;
  end if;

  -- (c) The only memberships it may hold are the two granted above.
  select string_agg(r.rolname, ', ' order by r.rolname) into v_bad
    from pg_auth_members m
    join pg_roles r on r.oid = m.roleid
    join pg_roles g on g.oid = m.member
   where g.rolname = 'db_test_runner'
     and r.rolname in ('service_role', 'postgres', 'authenticator', 'pg_read_all_data',
                       'supabase_privileged_role');
  if v_bad is not null then
    raise exception 'FAIL db_test_runner is a member of %', v_bad;
  end if;

  -- (d) It cannot reach the Google OAuth secrets in Vault.
  select string_agg(f, ', ' order by f) into v_bad
    from unnest(array['public.calendar_secrets()',
                      'public.calendar_secret_set(text, text)']) f
   where has_function_privilege('db_test_runner', f, 'EXECUTE');
  if v_bad is not null then
    raise exception 'FAIL db_test_runner can execute %', v_bad;
  end if;
end $$;
