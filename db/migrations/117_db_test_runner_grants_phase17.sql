-- bb2dash :: 117_db_test_runner_grants_phase17.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), migration 117 (B-42's
-- default: the db_test_runner role exists). Worker W-44. Applied after 116, because it grants on
-- 113's and 114's objects, and before the seven phase17_*.sql files first run through
-- scripts/db-test.mjs.
--
-- Exactly what the seven phase17_*.sql files call or write AS THE SESSION ROLE and 100 does not
-- already hold (brief 95's rule, as 107 applies it for Phase 16: grants beyond 100 go in the
-- phase's own range, never through service_role membership). Derived by reading every statement
-- of the seven files and confirmed on 2026-09-29: phase17_110, _111, _113 and _114 ran as
-- db_test_runner in rolled-back MCP dry runs (their migrations plus these grants), and
-- phase17_112, _115 and _116 ran through scripts/db-test.mjs before their migrations and failed
-- only on the missing change, never on a privilege:
--
--   usage on schema private                 phase17_113 (heartbeat_stage on fixed inputs)
--   execute private.heartbeat_stage         phase17_113
--   execute private.scheduler_heartbeat     not called as the session role (the test reads the
--                                           view under `set local role authenticated`); granted
--                                           because the brief's T-10 check asserts it, and it
--                                           returns rows only to app_owner()'s JWT anyway
--   execute public.close_cleared_gaps       phase17_114 (case B calls it directly)
--   execute public.stage_gaps               phase17_114 (case E folds)
--   insert, update, delete on bb_content    phase17_110 and _111 seed vanished nodes
--   insert, update, delete on calendar_push_runs
--                                           phase17_113 seeds three failed pushes
--   usage on their two sequences            belt and braces, as 100 (both are GENERATED ALWAYS
--                                           AS IDENTITY, which needs no USAGE)
--
-- Already held from 100 and not re-granted: select on every public table and view (including
-- 113's v_scheduler_heartbeat, through 100's default privileges); insert/update/delete on
-- agent_requests, attention_items, bb_files, readings, sync_runs; execute on app_owner,
-- archive_attention_item, attention_answered (114 re-asserts only public/anon/authenticated and
-- service_role, so 100's grant stands), sync_change_lines, transform_tick. The bb_files trigger
-- function needs no EXECUTE grant to fire. phase17_112, _115 and _116 need nothing new.
--
-- Additive only.

grant usage on schema private to db_test_runner;

grant execute on function
  private.heartbeat_stage(timestamptz, timestamptz, integer, boolean),
  private.scheduler_heartbeat(),
  public.close_cleared_gaps(bigint, text),
  public.stage_gaps(uuid, bigint)
to db_test_runner;

grant insert, update, delete on
  public.bb_content,
  public.calendar_push_runs
to db_test_runner;

grant usage on sequence
  public.bb_content_id_seq,
  public.calendar_push_runs_id_seq
to db_test_runner;

-- Guard: the limits 100 defines this role by still hold after these grants.
do $$
declare
  v_bad text;
begin
  select string_agg(r.rolname, ', ' order by r.rolname) into v_bad
    from pg_auth_members m
    join pg_roles r on r.oid = m.roleid
    join pg_roles g on g.oid = m.member
   where g.rolname = 'db_test_runner'
     and r.rolname in ('service_role', 'postgres');
  if v_bad is not null then
    raise exception 'FAIL 117: db_test_runner is a member of %', v_bad;
  end if;

  select string_agg(f, ', ' order by f) into v_bad
    from unnest(array['public.calendar_secrets()',
                      'public.calendar_secret_set(text, text)']) f
   where has_function_privilege('db_test_runner', f, 'EXECUTE');
  if v_bad is not null then
    raise exception 'FAIL 117: db_test_runner can execute %', v_bad;
  end if;

  if not (has_function_privilege('db_test_runner', 'private.scheduler_heartbeat()', 'execute')
          and has_function_privilege('db_test_runner', 'public.close_cleared_gaps(bigint,text)', 'execute')
          and has_function_privilege('db_test_runner', 'public.stage_gaps(uuid,bigint)', 'execute')) then
    raise exception 'FAIL 117: a grant did not land';
  end if;
end $$;
