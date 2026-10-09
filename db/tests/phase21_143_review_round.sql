-- bb2dash :: db/tests/phase21_143_review_round.sql
-- Phase 21 (docs/planning/sprint-2/briefs/102_PHASE21_workspace.md), the review round (rulings V3
-- and X2; 102a, CR-4, CR-7, CR-8 and the note under `/security-review`). Worker W-63.
-- Tests migration 143, the four changes it makes to objects of 140 and 142:
--
--   0. installed and shaped: the view's five columns, its option and its grants; the trigger and
--      its condition; the two replaced functions' attributes
--   1. setup
--   2. CR-8: v_workspace_status.polled_age_seconds
--   3. the security note: workspace_finish refuses a request that is not claimed or cancelled
--   4. CR-4: workspace_claim also finishes an assistant row its request left behind, with the
--      10 minutes tested at the boundary
--   5. CR-7: updated_at moves when the title or the session id changes, and for nothing else the
--      page can send; workspace_finish stamps it itself
--
-- Units 140, 140b, 141 and 142 still hold everything else about these objects; this unit holds
-- what 143 changed and nothing more.
--
-- As in unit 142: every function of 142 is called under `set local role workspace_runner`, the
-- owner's calls under `set local role authenticated` with the owner's uid, and the setup rows and
-- the reads that check an effect run as the session role. Everything happens in one transaction,
-- where now() never moves, so the unit sets finished_at and updated_at itself wherever an age
-- matters. On prod a real question can sit queued and the heartbeat row exists once the service
-- has run, so section 1 cancels every open request and deletes the heartbeat row (named by its
-- id: a delete with no `where` is held by `execute_sql` for a confirmation), inside this
-- transaction only.
--
-- AN `execute_sql` DRY RUN of this unit adds, inside its own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
-- because `postgres` cannot `set role` into a runner role otherwise.
--
-- RUN IT: `node scripts/db-test.mjs --only phase21_143_review_round.sql`. A failing assertion
-- raises; a pass ends with one row reading `phase21_143_review_round: PASS`. NOTHING IS
-- COMMITTED: the file opens its own transaction and its last statement is `rollback`.

begin;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  v_def  text;
  r      record;
  f      text;
begin
  if to_regclass('public.v_workspace_status') is null
     or to_regclass('public.workspace_conversations') is null then
    raise exception 'FAIL phase21_143: migration 140 is not applied (public.v_workspace_status is missing)';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'workspace_runner')
     or to_regprocedure('public.workspace_claim(text)') is null then
    raise exception 'FAIL phase21_143: migration 142 is not applied (no role workspace_runner, or no workspace_claim)';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.v_workspace_status'::regclass
                    and a.attname = 'polled_age_seconds' and not a.attisdropped) then
    raise exception 'FAIL phase21_143: migration 143 is not applied (v_workspace_status has no column polled_age_seconds)';
  end if;

  -- The view: 140's four columns unchanged in name, type and order, then 143's one.
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
    into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_workspace_status'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'polled_at timestamp with time zone, runner text, open_requests integer, '
     'oldest_open_at timestamp with time zone, polled_age_seconds integer' then
    v_fail := v_fail || format('v_workspace_status columns are [%s]', v_got);
  end if;
  -- `create or replace view` replaces a view's options, so this is the one that could be lost.
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_status'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    v_fail := v_fail || 'v_workspace_status is not security_invoker'::text;
  end if;
  -- Its grants are 140's.
  if not has_table_privilege('authenticated', 'public.v_workspace_status', 'select')
     or not has_table_privilege('service_role', 'public.v_workspace_status', 'select') then
    v_fail := v_fail || 'authenticated or service_role cannot select v_workspace_status'::text;
  end if;
  if has_table_privilege('authenticated', 'public.v_workspace_status',
                         'insert, update, delete, truncate, references, trigger') then
    v_fail := v_fail || 'authenticated holds a write on v_workspace_status'::text;
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('anon'), ('workspace_runner')) as w(who)
   where has_table_privilege(w.who::name, 'public.v_workspace_status',
                             'select, insert, update, delete, truncate, references, trigger')
      or has_any_column_privilege(w.who::name, 'public.v_workspace_status',
                                  'select, insert, update, references');
  if v_got is not null then
    v_fail := v_fail || format('v_workspace_status is readable or writable by %s', v_got);
  end if;
  if coalesce(obj_description('public.v_workspace_status'::regclass, 'pg_class'), '')
     not like '%polled_age_seconds%' then
    v_fail := v_fail || 'the comment on v_workspace_status does not name polled_age_seconds'::text;
  end if;

  -- The trigger: the table's one trigger, before update, for each row, on set_updated_at(),
  -- enabled, and its condition is the title or the session id changing, nothing more (ruling X2).
  -- The condition is read as the catalogue prints it, brackets and line breaks aside.
  select string_agg(g.tgname, ', ' order by g.tgname collate "C") into v_got
    from pg_trigger g
   where g.tgrelid = 'public.workspace_conversations'::regclass and not g.tgisinternal;
  if v_got is distinct from 'workspace_conversations_updated_at' then
    v_fail := v_fail || format('the triggers on workspace_conversations are [%s]', v_got);
  end if;
  select pg_get_triggerdef(g.oid) into v_def
    from pg_trigger g
   where g.tgrelid = 'public.workspace_conversations'::regclass
     and g.tgname = 'workspace_conversations_updated_at'
     and g.tgfoid = 'public.set_updated_at()'::regprocedure
     and g.tgtype = 19          -- row (1) + before (2) + update (16)
     and g.tgenabled = 'O'
     and g.tgqual is not null;
  if v_def is null then
    v_fail := v_fail || 'workspace_conversations_updated_at is not an enabled before-update row trigger on set_updated_at() with a when clause'::text;
  else
    v_got := btrim(regexp_replace(
               translate(substring(v_def from ' WHEN \((.*)\) EXECUTE FUNCTION '), '()', ''),
               '\s+', ' ', 'g'));
    if v_got is distinct from
       'old.title IS DISTINCT FROM new.title OR '
       'old.claude_session_id IS DISTINCT FROM new.claude_session_id' then
      v_fail := v_fail || format('the trigger''s condition is not "the title or the session id changed": %s', v_def);
    end if;
  end if;

  -- The two replaced functions kept what `create or replace` takes from the new definition.
  foreach f in array array[
    'public.workspace_claim(text)',
    'public.workspace_finish(bigint, text, text, jsonb, text, numeric, integer, text, text)'] loop
    select p.prosecdef, l.lanname, pg_get_userbyid(p.proowner) as owner,
           coalesce(p.proconfig, '{}') as cfg, obj_description(p.oid, 'pg_proc') as note
      into r
      from pg_proc p join pg_language l on l.oid = p.prolang
     where p.oid = f::regprocedure;
    if not r.prosecdef then v_fail := v_fail || format('%s is not security definer', f); end if;
    if r.lanname <> 'plpgsql' then v_fail := v_fail || format('%s is not plpgsql', f); end if;
    if r.owner <> 'postgres' then v_fail := v_fail || format('%s is owned by %s', f, r.owner); end if;
    if not r.cfg @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s does not pin search_path = public, pg_temp', f);
    end if;
    if coalesce(r.note, '') not like '%143%' then
      v_fail := v_fail || format('the comment on %s does not name 143', f);
    end if;
  end loop;
  -- Still 142's five, now among the eleven (196 adds six), for workspace_runner and for nobody else.
  -- RED against prod until 196 is applied (task 22 of brief 109).
  select string_agg(p.proname, ',' order by p.proname collate "C") into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_claim_v2,workspace_finish,workspace_heartbeat,'
     'workspace_job_claim,workspace_job_finish,workspace_planner_feed,workspace_stream,'
     'workspace_turn_context,workspace_turn_put' then
    v_fail := v_fail || format('workspace_runner executes the SECURITY DEFINER functions [%s]', v_got);
  end if;
  select string_agg(w.who || ':' || g.fn, ', ' order by w.who collate "C", g.fn collate "C")
    into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('db_test_runner'),
                 ('sync_runner')) as w(who)
    cross join (values
      ('public.workspace_claim(text)'),
      ('public.workspace_finish(bigint, text, text, jsonb, text, numeric, integer, text, text)')
    ) as g(fn)
   where has_function_privilege(w.who::name, g.fn, 'execute');
  if v_got is not null then
    v_fail := v_fail || format('executable beyond workspace_runner: %s', v_got);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase21_143 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1 to 5. The four changes, as they behave: one block per change
-- =============================================================================================
-- Each block sets the owner's uid and makes its own setup, so it holds whether it runs after the
-- others (the Runner: one transaction) or alone (a dry run that sends one block per call).
do $$
declare
  v_owner uuid := app_owner();
  v_row   record;
  v_case  record;
  v_n     integer;
  v_ok    boolean;
begin
  if v_owner is null then
    raise exception 'FAIL phase21_143: app_owner() returned null, so the owner cannot be simulated';
  end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- ---------------------------------------------------------------------------------------------
  -- 1. Setup (not an assertion)
  -- ---------------------------------------------------------------------------------------------
  update workspace_requests
     set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');
  delete from workspace_runner_heartbeat where id = 1;

  -- ---------------------------------------------------------------------------------------------
  -- 2. CR-8: polled_age_seconds
  -- ---------------------------------------------------------------------------------------------
  -- 2a. Before the first heartbeat: the one row, with a null age (never 0), typed integer.
  set local role authenticated;
  select count(*) as n, bool_and(s.polled_at is null) as no_poll,
         bool_and(s.polled_age_seconds is null) as no_age,
         max(pg_typeof(s.polled_age_seconds)::text) as age_type
    into v_row from v_workspace_status s;
  reset role;
  if v_row.n <> 1 or v_row.no_poll is not true or v_row.no_age is not true
     or v_row.age_type is distinct from 'integer' then
    raise exception 'FAIL 2a: with no heartbeat row v_workspace_status reads %', row_to_json(v_row);
  end if;

  -- 2b. After a heartbeat: 0 (in one transaction now() is the heartbeat's own polled_at).
  set local role workspace_runner;
  perform workspace_heartbeat('phase21_143');
  reset role;
  set local role authenticated;
  select count(*) as n, max(s.polled_age_seconds) as age, max(s.runner) as runner
    into v_row from v_workspace_status s;
  reset role;
  if v_row.n <> 1 or v_row.age is distinct from 0 or v_row.runner is distinct from 'phase21_143' then
    raise exception 'FAIL 2b: right after a heartbeat v_workspace_status reads %', row_to_json(v_row);
  end if;

  -- 2c. Whole seconds from polled_at to the server's now(), rounded down, never negative.
  for v_case in
    select * from (values
      ('59.999 seconds ago',        interval '59.999 seconds',  59),
      ('90.9 seconds ago',          interval '90.9 seconds',    90),
      ('exactly 120 seconds ago',   interval '120 seconds',    120),
      ('2 minutes 1 second ago',    interval '121 seconds',    121),
      ('72 hours ago',              interval '72 hours',    259200),
      ('5 seconds ahead of now()',  interval '-5 seconds',       0),
      ('half a second ahead',       interval '-0.5 seconds',     0)
    ) as x(label, ago, want)
  loop
    update workspace_runner_heartbeat set polled_at = now() - v_case.ago where id = 1;
    set local role authenticated;
    select s.polled_age_seconds into v_n from v_workspace_status s;
    reset role;
    if v_n is distinct from v_case.want then
      raise exception 'FAIL 2c (a heartbeat %): polled_age_seconds is %, expected %',
        v_case.label, v_n, v_case.want;
    end if;
  end loop;

  -- 2d. A stranger uid still gets the one row, and no age: RLS hides the heartbeat from the view.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  set local role authenticated;
  select count(*), bool_and(s.polled_at is null and s.polled_age_seconds is null)
    into v_n, v_ok from v_workspace_status s;
  reset role;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  if v_n <> 1 or v_ok is not true then
    raise exception 'FAIL 2d: a stranger uid reads % row(s) of v_workspace_status, age hidden: %', v_n, v_ok;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

do $$
declare
  c_sid   constant text := '0a1b2c3d-0000-4000-8000-00000000a143';
  v_owner uuid := app_owner();
  v_out   jsonb;
  v_claim record;
  v_row   record;
  v_case  record;
  v_snap  jsonb;
  v_now   jsonb;
  v_got   text;
  v_said  text;
  v_ok    boolean;
  v_f uuid;                                       -- F: one conversation, four requests in turn
  v_f1_req bigint; v_f1_ans uuid;                 --   F1 finished done
  v_f2_req bigint; v_f2_ans uuid;                 --   F2 finished failed / timeout
  v_f3_req bigint; v_f3_ans uuid;                 --   F3 queued, later claimed and finished
  v_f4_req bigint; v_f4_ans uuid;                 --   F4 claimed, then stopped
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  -- Setup, as in section 1: no other request may be open when this block claims.
  update workspace_requests
     set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');
  -- ---------------------------------------------------------------------------------------------
  -- 3. workspace_finish: only a claimed or a cancelled request
  -- ---------------------------------------------------------------------------------------------
  -- F1: asked, claimed, begun, finished done.
  set local role authenticated;
  v_out := workspace_ask(null, 'phase21_143 F1');
  reset role;
  v_f      := (v_out->>'conversation_id')::uuid;
  v_f1_req := (v_out->>'request_id')::bigint;
  set local role workspace_runner;
  select * into v_claim from workspace_claim('phase21_143');
  v_f1_ans := workspace_begin(v_f1_req, 'low', 'claude-cli', 'haiku');
  perform workspace_finish(v_f1_req, 'done', 'first answer', '[]'::jsonb, null, 0.01, 100, c_sid, null);
  reset role;
  if v_claim.request_id is distinct from v_f1_req then
    raise exception 'FAIL 3 (setup): the claim returned request %, expected F1 (%)', v_claim.request_id, v_f1_req;
  end if;
  -- F2: the same, finished failed / timeout.
  set local role authenticated;
  v_out := workspace_ask(v_f, 'phase21_143 F2');
  reset role;
  v_f2_req := (v_out->>'request_id')::bigint;
  set local role workspace_runner;
  perform workspace_claim('phase21_143');
  v_f2_ans := workspace_begin(v_f2_req, 'mid', 'claude-cli', 'sonnet');
  perform workspace_finish(v_f2_req, 'failed', '', null, 'timeout', null, 480000, c_sid, null);
  reset role;
  -- F3: asked, still queued.
  set local role authenticated;
  v_out := workspace_ask(v_f, 'phase21_143 F3');
  reset role;
  v_f3_req := (v_out->>'request_id')::bigint;

  select jsonb_build_object(
           'requests', (select jsonb_agg(to_jsonb(r) order by r.id)
                          from workspace_requests r where r.conversation_id = v_f),
           'messages', (select jsonb_agg(to_jsonb(m) order by m.id)
                          from workspace_messages m where m.conversation_id = v_f),
           'conversation', (select to_jsonb(c) from workspace_conversations c where c.id = v_f))
    into v_snap;
  if v_snap #>> '{requests,0,state}' <> 'done' or v_snap #>> '{requests,1,state}' <> 'failed'
     or v_snap #>> '{requests,2,state}' <> 'queued' or jsonb_array_length(v_snap->'messages') <> 5 then
    raise exception 'FAIL 3 (setup): F is not done, failed, queued with five messages: %', v_snap->'requests';
  end if;

  -- 3a. A request already done, already failed, or not yet claimed: 22023, in the function's own
  --     words, naming the state it found.
  set local role workspace_runner;
  for v_case in
    select * from (values
      ('done again on a request already done', 'done',
       format('select workspace_finish(%s, ''done'', ''written over'', ''[]'', null, 9.99, 1, null, ''x'')', v_f1_req)),
      ('failed on a request already done', 'done',
       format('select workspace_finish(%s, ''failed'', ''written over'', null, ''cli_error'', null, null, null, null)', v_f1_req)),
      ('done on a request already failed', 'failed',
       format('select workspace_finish(%s, ''done'', ''written over'', null, null, null, null, null, null)', v_f2_req)),
      ('done on a request still queued', 'queued',
       format('select workspace_finish(%s, ''done'', ''written over'', null, null, null, null, null, null)', v_f3_req))
    ) as x(label, state, stmt)
  loop
    begin
      execute v_case.stmt;
      v_got := 'no error';
      v_said := '';
    exception when others then
      v_got := sqlstate;
      v_said := sqlerrm;
    end;
    if v_got <> '22023' or v_said not like 'workspace_finish: request %'
       or v_said not like '%is not claimed or cancelled (it is ' || v_case.state || ')' then
      raise exception 'FAIL 3a (finish %): got % (%), expected 22023 from workspace_finish naming the state %',
        v_case.label, v_got, v_said, v_case.state;
    end if;
  end loop;
  reset role;
  -- Nothing was written by a refused call: the three requests, the five messages (the stored
  -- answer among them) and the conversation's session id and updated_at read as before.
  select jsonb_build_object(
           'requests', (select jsonb_agg(to_jsonb(r) order by r.id)
                          from workspace_requests r where r.conversation_id = v_f),
           'messages', (select jsonb_agg(to_jsonb(m) order by m.id)
                          from workspace_messages m where m.conversation_id = v_f),
           'conversation', (select to_jsonb(c) from workspace_conversations c where c.id = v_f))
    into v_now;
  if v_now is distinct from v_snap then
    raise exception 'FAIL 3a: a refused finish wrote something. Before: %. After: %', v_snap, v_now;
  end if;

  -- 3b. A claimed request is finished, as before.
  set local role workspace_runner;
  select * into v_claim from workspace_claim('phase21_143');
  v_f3_ans := workspace_begin(v_f3_req, 'low', 'claude-cli', 'haiku');
  perform workspace_finish(v_f3_req, 'done', 'third answer', '[]'::jsonb, null, 0.02, 200, c_sid, null);
  reset role;
  select r.state, r.error_code, r.finished_at, m.finished, m.content, m.error_code as message_code
    into v_row
    from workspace_requests r join workspace_messages m on m.id = v_f3_ans where r.id = v_f3_req;
  if v_claim.request_id is distinct from v_f3_req or v_row.state <> 'done' or v_row.error_code is not null
     or v_row.finished_at is null or v_row.finished is not true or v_row.content <> 'third answer'
     or v_row.message_code is not null then
    raise exception 'FAIL 3b: finish on a claimed request left %', row_to_json(v_row);
  end if;

  -- 3c. A cancelled request is finished too: Stop wins, and the partial text is stored.
  set local role authenticated;
  v_out := workspace_ask(v_f, 'phase21_143 F4');
  reset role;
  v_f4_req := (v_out->>'request_id')::bigint;
  set local role workspace_runner;
  perform workspace_claim('phase21_143');
  v_f4_ans := workspace_begin(v_f4_req, 'low', 'claude-cli', 'haiku');
  reset role;
  set local role authenticated;
  v_ok := workspace_cancel(v_f4_req);
  reset role;
  set local role workspace_runner;
  perform workspace_finish(v_f4_req, 'done', 'partial text', '[]'::jsonb, null, 0.03, 300, c_sid, null);
  reset role;
  select r.state, r.error_code, m.finished, m.content, m.error_code as message_code
    into v_row
    from workspace_requests r join workspace_messages m on m.id = v_f4_ans where r.id = v_f4_req;
  if v_ok is not true or v_row.state <> 'cancelled' or v_row.error_code is distinct from 'cancelled'
     or v_row.finished is not true or v_row.content <> 'partial text'
     or v_row.message_code is distinct from 'cancelled' then
    raise exception 'FAIL 3c: finish on a cancelled request left % (cancel returned %)', row_to_json(v_row), v_ok;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

do $$
declare
  v_owner uuid := app_owner();
  v_out   jsonb;
  v_claim record;
  v_row   record;
  v_case  record;
  v_n     integer;
  v_ok    boolean;
  v_x_req bigint; v_x_ans uuid;                   -- X: stopped 11 minutes ago, its runner gone
  v_y_req bigint; v_y_ans uuid;                   -- Y: stopped 9 minutes ago
  v_q_req bigint;                                 -- Q: queued when the second sweep runs
  v_h uuid; v_h_msg uuid;                         -- H: rows made by hand, as the session role
  v_z_req bigint; v_z_ans uuid;                   --   Z failed / timeout 11 minutes ago
  v_w_req bigint; v_w_ans uuid;                   --   W done 11 minutes ago
  v_n_req bigint; v_n_ans uuid;                   --   N cancelled with no finished_at
  v_k_req bigint; v_k_ans uuid;                   --   K failed 11 minutes ago, its answer finished
  v_u_msg uuid;                                   --   U a user row that names Z
  v_e_req bigint; v_e_ans uuid;                   --   E failed exactly 10 minutes ago
  v_l_req bigint; v_l_ans uuid;                   --   L failed 10 minutes and 1 second ago
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  -- Setup, as in section 1: no other request may be open when this block claims.
  update workspace_requests
     set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');
  -- ---------------------------------------------------------------------------------------------
  -- 4. CR-4: the orphan sweep
  -- ---------------------------------------------------------------------------------------------
  -- X and Y the way it happens: asked, claimed, begun, stopped, and the runner never calls finish.
  -- X was stopped 11 minutes ago, Y 9 minutes ago.
  set local role authenticated;
  v_out := workspace_ask(null, 'phase21_143 X');
  reset role;
  v_x_req := (v_out->>'request_id')::bigint;
  set local role workspace_runner;
  perform workspace_claim('phase21_143');
  v_x_ans := workspace_begin(v_x_req, 'low', 'claude-cli', 'haiku');
  reset role;
  set local role authenticated;
  v_ok := workspace_cancel(v_x_req);
  v_out := workspace_ask(null, 'phase21_143 Y');
  reset role;
  v_y_req := (v_out->>'request_id')::bigint;
  set local role workspace_runner;
  perform workspace_claim('phase21_143');
  v_y_ans := workspace_begin(v_y_req, 'low', 'claude-cli', 'haiku');
  reset role;
  set local role authenticated;
  v_ok := v_ok and workspace_cancel(v_y_req);
  reset role;
  if v_ok is not true then
    raise exception 'FAIL 4 (setup): the owner could not stop X or Y';
  end if;
  update workspace_requests set finished_at = now() - interval '11 minutes' where id = v_x_req;
  update workspace_requests set finished_at = now() - interval '9 minutes' where id = v_y_req;

  -- H: rows no function writes, made by hand. Z failed and W done 11 minutes ago with their
  -- answers unfinished; N cancelled with no finished_at; K failed 11 minutes ago with a FINISHED
  -- answer that carries no code; U a user row, unfinished, that names Z's request; E and L failed
  -- exactly 10 minutes ago and one second longer, their answers unfinished (the boundary).
  insert into workspace_conversations (title) values ('phase21_143 H') returning id into v_h;
  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_h, 'user', 'question H', true) returning id into v_h_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, error_code, finished_at)
  values (v_h, v_h_msg, 'failed', 'timeout', now() - interval '11 minutes') returning id into v_z_req;
  insert into workspace_requests (conversation_id, user_message_id, state, error_code, finished_at)
  values (v_h, v_h_msg, 'done', null, now() - interval '11 minutes') returning id into v_w_req;
  insert into workspace_requests (conversation_id, user_message_id, state, error_code, finished_at)
  values (v_h, v_h_msg, 'cancelled', 'cancelled', null) returning id into v_n_req;
  insert into workspace_requests (conversation_id, user_message_id, state, error_code, finished_at)
  values (v_h, v_h_msg, 'failed', 'cli_error', now() - interval '11 minutes') returning id into v_k_req;
  insert into workspace_messages (conversation_id, role, request_id, content, finished)
  values (v_h, 'assistant', v_z_req, 'left behind', false) returning id into v_z_ans;
  insert into workspace_messages (conversation_id, role, request_id, content, finished)
  values (v_h, 'assistant', v_w_req, 'left behind', false) returning id into v_w_ans;
  insert into workspace_messages (conversation_id, role, request_id, content, finished)
  values (v_h, 'assistant', v_n_req, 'left behind', false) returning id into v_n_ans;
  insert into workspace_messages (conversation_id, role, request_id, content, finished)
  values (v_h, 'assistant', v_k_req, 'kept', true) returning id into v_k_ans;
  insert into workspace_messages (conversation_id, role, request_id, content, finished)
  values (v_h, 'user', v_z_req, 'not an answer', false) returning id into v_u_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, error_code, finished_at)
  values (v_h, v_h_msg, 'failed', 'cli_error', now() - interval '10 minutes') returning id into v_e_req;
  insert into workspace_requests (conversation_id, user_message_id, state, error_code, finished_at)
  values (v_h, v_h_msg, 'failed', 'cli_error', now() - interval '10 minutes 1 second')
  returning id into v_l_req;
  insert into workspace_messages (conversation_id, role, request_id, content, finished)
  values (v_h, 'assistant', v_e_req, 'left behind', false) returning id into v_e_ans;
  insert into workspace_messages (conversation_id, role, request_id, content, finished)
  values (v_h, 'assistant', v_l_req, 'left behind', false) returning id into v_l_ans;

  -- 4a. One poll with nothing queued: no row comes back, and the sweep has still run.
  set local role workspace_runner;
  select count(*) into v_n from workspace_claim('phase21_143');
  reset role;
  if v_n <> 0 then
    raise exception 'FAIL 4a: a claim with nothing queued returned % row(s)', v_n;
  end if;
  for v_case in
    select * from (values
      ('X, stopped 11 minutes ago: finished, with the request''s code', v_x_ans, true,  'cancelled', ''),
      ('Y, stopped 9 minutes ago: left alone',                         v_y_ans, false, null,        ''),
      ('Z, failed / timeout 11 minutes ago: finished, timeout',        v_z_ans, true,  'timeout',   'left behind'),
      ('W, done 11 minutes ago: finished, no code',                    v_w_ans, true,  null,        'left behind'),
      ('N, cancelled with no finished_at: left alone',                 v_n_ans, false, null,        'left behind'),
      ('K, an answer already finished: its code is not rewritten',     v_k_ans, true,  null,        'kept'),
      ('U, a user row: left alone',                                    v_u_msg, false, null,        'not an answer'),
      -- The boundary: "more than 10 minutes" is strict.
      ('E, failed exactly 10 minutes ago: left alone',                 v_e_ans, false, null,        'left behind'),
      ('L, failed 10 minutes and 1 second ago: finished, cli_error',   v_l_ans, true,  'cli_error', 'left behind')
    ) as x(label, id, finished, code, content)
  loop
    select m.finished, m.error_code, m.content into v_row from workspace_messages m where m.id = v_case.id;
    if v_row.finished is distinct from v_case.finished or v_row.error_code is distinct from v_case.code
       or v_row.content is distinct from v_case.content then
      raise exception 'FAIL 4a (%): the row reads %', v_case.label, row_to_json(v_row);
    end if;
  end loop;
  -- The sweep writes the message only: X's request row is as Stop left it.
  select r.state, r.error_code, r.finished_at = now() - interval '11 minutes' as finished_at_kept,
         r.attempts
    into v_row from workspace_requests r where r.id = v_x_req;
  if v_row.state <> 'cancelled' or v_row.error_code is distinct from 'cancelled'
     or v_row.finished_at_kept is not true or v_row.attempts <> 1 then
    raise exception 'FAIL 4a: the sweep changed X''s request row: %', row_to_json(v_row);
  end if;

  -- 4b. A finish that arrives after the sweep still stores the partial text (X is cancelled).
  set local role workspace_runner;
  perform workspace_finish(v_x_req, 'done', 'late partial', '[]'::jsonb, null, null, null, null, null);
  reset role;
  select m.finished, m.error_code, m.content into v_row from workspace_messages m where m.id = v_x_ans;
  if v_row.finished is not true or v_row.error_code is distinct from 'cancelled'
     or v_row.content <> 'late partial' then
    raise exception 'FAIL 4b: a finish after the sweep left %', row_to_json(v_row);
  end if;

  -- 4c. Two minutes on, Y is past the 10 minutes: the next poll finishes it, and claims Q in the
  --     same call.
  update workspace_requests set finished_at = now() - interval '11 minutes' where id = v_y_req;
  set local role authenticated;
  v_out := workspace_ask(null, 'phase21_143 Q');
  reset role;
  v_q_req := (v_out->>'request_id')::bigint;
  set local role workspace_runner;
  select * into v_claim from workspace_claim('phase21_143');
  reset role;
  select m.finished, m.error_code, m.content into v_row from workspace_messages m where m.id = v_y_ans;
  if v_claim.request_id is distinct from v_q_req or v_claim.prompt is distinct from 'phase21_143 Q'
     or v_row.finished is not true or v_row.error_code is distinct from 'cancelled' or v_row.content <> '' then
    raise exception 'FAIL 4c: the poll claimed request % (expected Q, %) and Y''s answer reads %',
      v_claim.request_id, v_q_req, row_to_json(v_row);
  end if;
  -- N (no finished_at) is still left alone after a second poll, and so is E (exactly 10 minutes).
  if (select m.finished from workspace_messages m where m.id = v_n_ans) is not false then
    raise exception 'FAIL 4c: an answer whose request has no finished_at was finished';
  end if;
  if (select m.finished from workspace_messages m where m.id = v_e_ans) is not false then
    raise exception 'FAIL 4c: an answer whose request closed exactly 10 minutes ago was finished';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

do $$
declare
  c_sid   constant text := '0a1b2c3d-0000-4000-8000-00000000a143';
  c_day   constant interval := interval '1 day';
  v_owner uuid := app_owner();
  v_claim record;
  v_row   record;
  v_case  record;
  v_got   text;
  v_msg   uuid;
  v_req   bigint;
  v_c1 uuid; v_c2 uuid; v_c3 uuid;                -- three chats last touched a day ago
  v_c4 uuid;                                      -- a fourth, answered now for the first time
  v_c5 uuid;                                      -- a fifth, answered now in the session it had
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  -- Setup, as in section 1: no other request may be open when this block claims.
  update workspace_requests
     set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');
  -- ---------------------------------------------------------------------------------------------
  -- 5. CR-7: what moves updated_at (ruling X2)
  -- ---------------------------------------------------------------------------------------------
  -- Five chats last touched a day ago; the fifth already has a session id.
  insert into workspace_conversations (title, updated_at)
  values ('phase21_143 archive', now() - c_day) returning id into v_c1;
  insert into workspace_conversations (title, updated_at)
  values ('phase21_143 title', now() - c_day) returning id into v_c2;
  insert into workspace_conversations (title, updated_at)
  values ('phase21_143 both', now() - c_day) returning id into v_c3;
  insert into workspace_conversations (title, updated_at)
  values ('phase21_143 answered', now() - c_day) returning id into v_c4;
  insert into workspace_conversations (title, updated_at, claude_session_id)
  values ('phase21_143 resumed', now() - c_day, c_sid) returning id into v_c5;

  -- 5a to 5d. The owner's page, one update after another, in this order. After each one
  -- updated_at is either still a day old (kept) or now() (moved).
  for v_case in
    select * from (values
      ('5a archive only',
       v_c1, 'archived = true',  'kept',  true,  'phase21_143 archive'),
      ('5b nothing changes: archiving a chat that is already archived',
       v_c1, 'archived = true',  'kept',  true,  'phase21_143 archive'),
      ('5a restore only',
       v_c1, 'archived = false', 'kept',  false, 'phase21_143 archive'),
      ('5c archive, with the title sent as it already is',
       v_c1, 'archived = true, title = ''phase21_143 archive''', 'kept', true, 'phase21_143 archive'),
      ('5c a title set to itself',
       v_c2, 'title = ''phase21_143 title''', 'kept', false, 'phase21_143 title'),
      ('5c a title set to itself by name',
       v_c2, 'title = title',    'kept',  false, 'phase21_143 title'),
      ('5d a new title',
       v_c2, 'title = ''phase21_143 renamed''', 'moved', false, 'phase21_143 renamed'),
      ('5d a new title together with archived',
       v_c3, 'archived = true, title = ''phase21_143 both, renamed''', 'moved', true,
       'phase21_143 both, renamed')
    ) as x(label, id, sets, want, archived, title)
  loop
    set local role authenticated;
    execute format('update workspace_conversations set %s where id = %L', v_case.sets, v_case.id);
    reset role;
    select case when c.updated_at = now() - c_day then 'kept'
                when c.updated_at = now() then 'moved'
                else c.updated_at::text end as got,
           c.archived, c.title
      into v_row from workspace_conversations c where c.id = v_case.id;
    if v_row.got is distinct from v_case.want or v_row.archived is distinct from v_case.archived
       or v_row.title is distinct from v_case.title then
      raise exception 'FAIL % (set %): updated_at %, expected %; the row reads archived %, title %',
        v_case.label, v_case.sets, v_row.got, v_case.want, v_row.archived, v_row.title;
    end if;
  end loop;

  -- 5e. An answer moves it, and the stamp is workspace_finish's own. C4's first answer changes
  --     the session id, so the trigger fires as well. C5 is answered in the session it already
  --     had: neither the title nor the session id changes, the trigger is silent, and updated_at
  --     moves only because workspace_finish writes it.
  for v_case in
    select * from (values
      ('a first answer: the session id changes', v_c4),
      ('an answer in the session the chat already had', v_c5)
    ) as x(label, id)
  loop
    insert into workspace_messages (conversation_id, role, content, finished)
    values (v_case.id, 'user', 'question', true) returning id into v_msg;
    insert into workspace_requests (conversation_id, user_message_id)
    values (v_case.id, v_msg) returning id into v_req;
    set local role workspace_runner;
    select * into v_claim from workspace_claim('phase21_143');
    perform workspace_begin(v_req, 'low', 'claude-cli', 'haiku');
    perform workspace_finish(v_req, 'done', 'answer', '[]'::jsonb, null, null, null, c_sid, null);
    reset role;
    select c.updated_at = now() as moved, c.claude_session_id into v_row
      from workspace_conversations c where c.id = v_case.id;
    if v_claim.request_id is distinct from v_req or v_row.moved is not true
       or v_row.claude_session_id is distinct from c_sid then
      raise exception 'FAIL 5e (%): the chat reads % (claimed request %, expected %)',
        v_case.label, row_to_json(v_row), v_claim.request_id, v_req;
    end if;
  end loop;

  -- 5f. The trigger no longer writes over an updated_at that an update sets, so what keeps the
  --     column true for the page is 140's column grant: the owner's role updates title and
  --     archived, and nothing else.
  set local role authenticated;
  begin
    update workspace_conversations set updated_at = now() - c_day where id = v_c2;
    v_got := 'no error';
  exception when others then
    v_got := sqlstate;
  end;
  reset role;
  if v_got <> '42501' then
    raise exception 'FAIL 5f: the owner''s role setting updated_at got %, expected 42501', v_got;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase21_143_review_round: PASS' as result,
       (select count(*) from pg_attribute a
         where a.attrelid = 'public.v_workspace_status'::regclass and a.attnum > 0
           and not a.attisdropped)                                              as status_columns,
       (select g.tgqual is not null from pg_trigger g
         where g.tgrelid = 'public.workspace_conversations'::regclass
           and g.tgname = 'workspace_conversations_updated_at')                 as trigger_has_when,
       (select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prosecdef
           and has_function_privilege('workspace_runner', p.oid, 'execute'))    as runner_definer_functions;

rollback;
