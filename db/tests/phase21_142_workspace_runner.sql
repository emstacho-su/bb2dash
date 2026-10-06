-- bb2dash :: db/tests/phase21_142_workspace_runner.sql
-- Phase 21 (docs/planning/sprint-2/briefs/102_PHASE21_workspace.md), task 6 (P-85, P-88). Worker W-63.
-- Tests migration 142: the login role `workspace_runner` and its five SECURITY DEFINER functions
-- (`workspace_claim`, `workspace_begin`, `workspace_stream`, `workspace_finish`,
-- `workspace_heartbeat`).
--
--   0. installed, shaped and fenced: the role's attributes, the five signatures, what the role can
--      and cannot execute or read, and who holds it. Read with has_table_privilege,
--      has_function_privilege and pg_auth_members, never information_schema (it lists enabled
--      roles only, so under an inherit-false membership a count of 0 there proves nothing).
--   1. setup
--   2. claim: the oldest queued whatever its age, the history, prior_tier, no heartbeat stamp,
--      and the session id of the request's own conversation
--   3. begin
--   4. stream, and Stop
--   5. finish on a cancelled request; the stale sweep; finish done; finish failed
--   6. heartbeat
--   7. what the runner's own login cannot read
--
-- Every function call is made under `set local role workspace_runner` (142's membership), the way
-- the runner calls it; the setup rows and the reads that check a call's effect run as the session
-- role. Everything happens in one transaction, where now() never moves, so the unit sets
-- created_at and claimed_at itself wherever an order or an age matters. On prod a real question
-- can sit queued and the heartbeat row always exists once the service has run, so section 1
-- cancels every other open request and deletes the heartbeat row, inside this transaction only.
--
-- THE PARTITION TEST (the same select as in phase21_141_workspace_realtime.sql). With no partition
-- of realtime.messages no send stores a row, so the "an empty delta stores nothing" half of
-- section 4 proves something only on a day when this returns true:
--
-- select exists (
--   select 1
--     from pg_inherits i
--     join pg_class p on p.oid = i.inhparent
--     join pg_namespace pn on pn.oid = p.relnamespace
--     join pg_class c on c.oid = i.inhrelid
--    where pn.nspname = 'realtime' and p.relname = 'messages'
--      and (pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT'
--           or (localtimestamp >= substring(pg_get_expr(c.relpartbound, c.oid)
--                                           from 'FROM \(''([^'']+)''\)')::timestamp
--               and localtimestamp < substring(pg_get_expr(c.relpartbound, c.oid)
--                                          from 'TO \(''([^'']+)''\)')::timestamp))
-- ) as partition_covers_now;
--
-- AN `execute_sql` DRY RUN of this unit adds, inside its own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
-- because `postgres` cannot `set role` into a runner role otherwise. Section 0 allows for that row.
--
-- RUN IT: `node scripts/db-test.mjs --only phase21_142_workspace_runner.sql`. A failing assertion
-- raises; a pass ends with one row reading `phase21_142_workspace_runner: PASS`. NOTHING IS
-- COMMITTED: the file opens its own transaction and its last statement is `rollback`.

begin;

select set_config('w63.partition_covers_now', (
select exists (
  select 1
    from pg_inherits i
    join pg_class p on p.oid = i.inhparent
    join pg_namespace pn on pn.oid = p.relnamespace
    join pg_class c on c.oid = i.inhrelid
   where pn.nspname = 'realtime' and p.relname = 'messages'
     and (pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT'
          or (localtimestamp >= substring(pg_get_expr(c.relpartbound, c.oid)
                                          from 'FROM \(''([^'']+)''\)')::timestamp
              and localtimestamp < substring(pg_get_expr(c.relpartbound, c.oid)
                                         from 'TO \(''([^'']+)''\)')::timestamp))
) as partition_covers_now
)::text, true);

-- =============================================================================================
-- 0. Installed, shaped and fenced
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  r      record;
  f      text;
  v_fns  text[] := array[
    'public.workspace_claim(text)',
    'public.workspace_begin(bigint, text, text, text)',
    'public.workspace_stream(bigint, integer, text)',
    'public.workspace_finish(bigint, text, text, jsonb, text, numeric, integer, text, text)',
    'public.workspace_heartbeat(text)'];
begin
  if not exists (select 1 from pg_roles where rolname = 'workspace_runner') then
    raise exception 'FAIL phase21_142: migration 142 is not applied (no role workspace_runner)';
  end if;
  foreach f in array v_fns loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase21_142: migration 142 is not applied (% is missing)', f;
    end if;
  end loop;

  -- The role: login, noinherit, nobypassrls, nothing more, and a 15 s statement timeout.
  select rolcanlogin, rolinherit, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolreplication,
         coalesce(rolconfig, '{}') as cfg
    into r from pg_roles where rolname = 'workspace_runner';
  if not r.rolcanlogin then v_fail := v_fail || 'workspace_runner cannot log in'::text; end if;
  if r.rolinherit then v_fail := v_fail || 'workspace_runner inherits'::text; end if;
  if r.rolbypassrls then v_fail := v_fail || 'workspace_runner bypasses RLS'::text; end if;
  if r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication then
    v_fail := v_fail || 'workspace_runner holds superuser, createrole, createdb or replication'::text;
  end if;
  if not r.cfg @> array['statement_timeout=15s'] then
    v_fail := v_fail || format('workspace_runner has no statement_timeout=15s (config %s)', r.cfg);
  end if;

  -- The five: SECURITY DEFINER, plpgsql, owned by postgres, search_path pinned, commented.
  foreach f in array v_fns loop
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
    if r.note is null then v_fail := v_fail || format('%s has no comment', f); end if;
  end loop;

  -- Signatures, as the Contract spells them: argument names and results.
  for r in
    select * from (values
      ('public.workspace_claim(text)', 'p_runner text',
       'TABLE(request_id bigint, conversation_id uuid, user_message_id uuid, prompt text, '
       'claude_session_id text, prior_tier text, history jsonb)'),
      ('public.workspace_begin(bigint, text, text, text)',
       'p_request_id bigint, p_tier text, p_provider text, p_model text', 'uuid'),
      ('public.workspace_stream(bigint, integer, text)',
       'p_request_id bigint, p_seq integer, p_delta text', 'boolean'),
      ('public.workspace_finish(bigint, text, text, jsonb, text, numeric, integer, text, text)',
       'p_request_id bigint, p_state text, p_content text, p_tool_calls jsonb, p_error_code text, '
       'p_cost_usd numeric, p_duration_ms integer, p_claude_session_id text, p_model text', 'void'),
      ('public.workspace_heartbeat(text)', 'p_runner text', 'void')
    ) as x(sig, args, result)
  loop
    if pg_get_function_identity_arguments(r.sig::regprocedure) is distinct from r.args then
      v_fail := v_fail || format('%s takes (%s)', r.sig,
                                 pg_get_function_identity_arguments(r.sig::regprocedure));
    end if;
    if pg_get_function_result(r.sig::regprocedure) is distinct from r.result then
      v_fail := v_fail || format('%s returns %s', r.sig, pg_get_function_result(r.sig::regprocedure));
    end if;
  end loop;

  -- The five are exactly the SECURITY DEFINER functions the role can execute in public.
  select string_agg(p.proname, ',' order by p.proname collate "C") into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_finish,workspace_heartbeat,workspace_stream' then
    v_fail := v_fail || format('workspace_runner executes the SECURITY DEFINER functions [%s]', v_got);
  end if;

  -- Nobody else executes any of the five.
  select string_agg(w.who || ':' || g.fn, ', ' order by w.who collate "C", g.fn collate "C")
    into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('db_test_runner'),
                 ('sync_runner')) as w(who)
    cross join unnest(v_fns) as g(fn)
   where has_function_privilege(w.who::name, g.fn, 'execute');
  if v_got is not null then
    v_fail := v_fail || format('executable beyond workspace_runner: %s', v_got);
  end if;

  -- No table, view or sequence privilege in public, on a relation or on a column of one.
  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and ((c.relkind in ('r', 'p', 'v', 'm', 'f')
           and (has_table_privilege('workspace_runner', c.oid,
                                    'select, insert, update, delete, truncate, references, trigger')
                or has_any_column_privilege('workspace_runner', c.oid,
                                            'select, insert, update, references')))
          or (c.relkind = 'S'
              and has_sequence_privilege('workspace_runner', c.oid, 'usage, select, update')));
  if v_got is not null then
    v_fail := v_fail || format('workspace_runner holds a privilege on %s', v_got);
  end if;

  -- Schemas: usage on public, create nowhere, and no way into the schemas a login must not reach.
  if not has_schema_privilege('workspace_runner', 'public', 'usage')
     or has_schema_privilege('workspace_runner', 'public', 'create') then
    v_fail := v_fail || 'workspace_runner lacks usage on public, or holds create on it'::text;
  end if;
  select string_agg(s, ', ' order by s) into v_got
    from unnest(array['realtime', 'auth', 'storage', 'vault', 'cron', 'private']) s
   where has_schema_privilege('workspace_runner', s, 'usage');
  if v_got is not null then
    v_fail := v_fail || format('workspace_runner has usage on %s', v_got);
  end if;

  -- Who holds the role: db_test_runner (inherit false, set true, no admin), so this suite can
  -- `set local role` into it. The only other member allowed is postgres: the row PostgreSQL gives
  -- a role's creator, and the row an execute_sql dry run adds inside its own transaction.
  if not exists (select 1 from pg_auth_members m
                  where m.roleid = 'workspace_runner'::regrole and m.member = 'db_test_runner'::regrole
                    and not m.inherit_option and m.set_option and not m.admin_option) then
    v_fail := v_fail || 'db_test_runner does not hold workspace_runner with inherit false, set true'::text;
  end if;
  select string_agg(m.member::regrole::text, ', ' order by m.member::regrole::text) into v_got
    from pg_auth_members m
   where m.roleid = 'workspace_runner'::regrole
     and (m.member not in ('db_test_runner'::regrole, 'postgres'::regrole) or m.inherit_option);
  if v_got is not null then
    v_fail := v_fail || format('workspace_runner is granted to %s', v_got);
  end if;
  if exists (select 1 from pg_auth_members m where m.member = 'workspace_runner'::regrole) then
    v_fail := v_fail || 'workspace_runner is itself a member of another role'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase21_142 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1 to 7. The runner's turn, call by call
-- =============================================================================================
do $$
declare
  c_sid_a constant text := '0a1b2c3d-0000-4000-8000-00000000a142';
  c_sid_b constant text := '0a1b2c3d-0000-4000-8000-00000000b142';
  c_sid_c constant text := '0a1b2c3d-0000-4000-8000-00000000c142';
  c_sid_e constant text := '0a1b2c3d-0000-4000-8000-00000000e142';
  v_owner uuid := app_owner();
  v_out   jsonb;
  v_a uuid; v_a_msg uuid; v_a_req bigint; v_a_ans uuid;   -- A: 21 earlier messages, an old request
  v_b uuid; v_b_msg uuid; v_b_req bigint; v_b_ans uuid;   -- B: a first question, then Stop
  v_c uuid; v_c_msg uuid; v_c_req bigint; v_c_ans uuid;   -- C: a queued request, later finished done
  v_d_req bigint; v_d_ans uuid;                           -- D: a follow-up in B, finished failed
  v_e uuid; v_e_req bigint;                               -- E: a request whose question sits in A
  v_claim record;
  v_row   record;
  v_case  record;
  v_tools jsonb;
  v_got   text;
  v_said  text;
  v_ok    boolean;
  v_n     integer;
begin
  if v_owner is null then
    raise exception 'FAIL phase21_142: app_owner() returned null, so the owner cannot be simulated';
  end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- ---------------------------------------------------------------------------------------------
  -- 1. Setup (not an assertion)
  -- ---------------------------------------------------------------------------------------------
  update workspace_requests
     set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');
  delete from workspace_runner_heartbeat;

  -- A: m1..m21 five days ago, a minute apart (odd = user, even = assistant; the latest assistant,
  -- m20, is tier high), then a question asked three days ago and still queued.
  insert into workspace_conversations (title, claude_session_id)
  values ('phase21_142 A', c_sid_a) returning id into v_a;
  insert into workspace_messages (conversation_id, role, content, finished, tier, created_at)
  select v_a, case when g % 2 = 1 then 'user' else 'assistant' end, 'm' || g, true,
         case when g % 2 = 1 then null when g = 20 then 'high' else 'mid' end,
         now() - interval '5 days' + g * interval '1 minute'
    from generate_series(1, 21) g;
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  values (v_a, 'user', 'question A', true, now() - interval '3 days') returning id into v_a_msg;
  insert into workspace_requests (conversation_id, user_message_id, created_at)
  values (v_a, v_a_msg, now() - interval '3 days') returning id into v_a_req;

  -- B: a first question, asked the way the browser asks it.
  set local role authenticated;
  v_out := workspace_ask(null, 'question B');
  reset role;
  v_b     := (v_out->>'conversation_id')::uuid;
  v_b_msg := (v_out->>'message_id')::uuid;
  v_b_req := (v_out->>'request_id')::bigint;

  -- ---------------------------------------------------------------------------------------------
  -- 2. Claim
  -- ---------------------------------------------------------------------------------------------
  -- 2a. The oldest queued request, whatever its age: a queued request does not expire. Every
  --     returns-table column of workspace_claim is aliased in its body, or this call raises 42702.
  set local role workspace_runner;
  select * into v_claim from workspace_claim('phase21_142');
  reset role;
  if v_claim.request_id is distinct from v_a_req or v_claim.conversation_id is distinct from v_a
     or v_claim.user_message_id is distinct from v_a_msg or v_claim.prompt is distinct from 'question A'
     or v_claim.claude_session_id is distinct from c_sid_a
     or v_claim.prior_tier is distinct from 'high' then
    raise exception 'FAIL 2a: the first claim returned % (expected request %, the three-day-old one)',
      row_to_json(v_claim), v_a_req;
  end if;
  -- The history: the last 20 messages before the request's own user message, oldest first, as
  -- [{role, content}]. With 21 earlier messages the oldest (m1) is left out, and the request's own
  -- question is the prompt, never part of the history.
  if jsonb_typeof(v_claim.history) is distinct from 'array' or jsonb_array_length(v_claim.history) <> 20
     or (select string_agg(x.e->>'content', ',' order by x.ord)
           from jsonb_array_elements(v_claim.history) with ordinality as x(e, ord))
        is distinct from (select string_agg('m' || g, ',' order by g) from generate_series(2, 21) g)
     or v_claim.history->0 is distinct from jsonb_build_object('role', 'assistant', 'content', 'm2')
     or v_claim.history->19 is distinct from jsonb_build_object('role', 'user', 'content', 'm21') then
    raise exception 'FAIL 2a: the history is not m2..m21 oldest first as {role, content}: %',
      v_claim.history;
  end if;
  select r.state, r.claimed_by, r.attempts, r.claimed_at, r.error_code into v_row
    from workspace_requests r where r.id = v_a_req;
  if v_row.state <> 'claimed' or v_row.claimed_by is distinct from 'phase21_142'
     or v_row.attempts <> 1 or v_row.claimed_at is null or v_row.error_code is not null then
    raise exception 'FAIL 2a: after the claim the request reads %', row_to_json(v_row);
  end if;
  -- 2b. The claim does not stamp the heartbeat.
  if (select count(*) from workspace_runner_heartbeat) <> 0 then
    raise exception 'FAIL 2b: workspace_claim stamped the heartbeat';
  end if;

  -- 2c. A first question: an empty history and no prior tier.
  set local role workspace_runner;
  select * into v_claim from workspace_claim('phase21_142');
  reset role;
  if v_claim.request_id is distinct from v_b_req or v_claim.prompt is distinct from 'question B'
     or v_claim.history is distinct from '[]'::jsonb or v_claim.prior_tier is not null
     or v_claim.claude_session_id is not null or v_claim.user_message_id is distinct from v_b_msg then
    raise exception 'FAIL 2c: the second claim returned %', row_to_json(v_claim);
  end if;

  -- 2d. Nothing queued: no row.
  set local role workspace_runner;
  select count(*) into v_n from workspace_claim('phase21_142');
  reset role;
  if v_n <> 0 then
    raise exception 'FAIL 2d: a claim with nothing queued returned % row(s)', v_n;
  end if;

  -- 2e. The session id is the one of the request's own conversation. The browser cannot queue a
  --     request whose question sits in another conversation (140's insert policy), but a role that
  --     bypasses RLS can, as the session role does here: E's request names A's question. The claim
  --     must hand back E's session, never A's.
  insert into workspace_conversations (title, claude_session_id)
  values ('phase21_142 E', c_sid_e) returning id into v_e;
  insert into workspace_requests (conversation_id, user_message_id)
  values (v_e, v_a_msg) returning id into v_e_req;
  set local role workspace_runner;
  select * into v_claim from workspace_claim('phase21_142');
  reset role;
  if v_claim.request_id is distinct from v_e_req or v_claim.conversation_id is distinct from v_e
     or v_claim.claude_session_id is distinct from c_sid_e then
    raise exception 'FAIL 2e: the claim of a request in conversation E returned % (expected session %, its own conversation''s)',
      row_to_json(v_claim), c_sid_e;
  end if;
  update workspace_requests
     set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where id = v_e_req;

  -- C: queued now, in a conversation that already carries a session id.
  insert into workspace_conversations (title, claude_session_id)
  values ('phase21_142 C', c_sid_c) returning id into v_c;
  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_c, 'user', 'question C', true) returning id into v_c_msg;
  insert into workspace_requests (conversation_id, user_message_id)
  values (v_c, v_c_msg) returning id into v_c_req;

  -- ---------------------------------------------------------------------------------------------
  -- 3. Begin
  -- ---------------------------------------------------------------------------------------------
  set local role workspace_runner;
  v_a_ans := workspace_begin(v_a_req, 'mid', 'claude-cli', 'sonnet');
  v_b_ans := workspace_begin(v_b_req, 'low', 'claude-cli', 'haiku');
  reset role;
  select m.conversation_id, m.parent_message_id, m.role, m.request_id, m.tier, m.provider, m.model,
         m.content, m.finished, m.error_code, m.tool_calls
    into v_row from workspace_messages m where m.id = v_a_ans;
  if not found or v_row.conversation_id <> v_a or v_row.parent_message_id is distinct from v_a_msg
     or v_row.role <> 'assistant' or v_row.request_id is distinct from v_a_req
     or v_row.tier is distinct from 'mid' or v_row.provider is distinct from 'claude-cli'
     or v_row.model is distinct from 'sonnet' or v_row.content <> '' or v_row.finished
     or v_row.error_code is not null or v_row.tool_calls <> '[]'::jsonb then
    raise exception 'FAIL 3: the assistant message workspace_begin wrote reads %', row_to_json(v_row);
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 4. Stream, and Stop
  -- ---------------------------------------------------------------------------------------------
  set local role workspace_runner;
  v_ok := workspace_stream(v_b_req, 1, 'hello')
          and workspace_stream(v_b_req, 2, repeat('x', 16000))
          and workspace_stream(v_b_req, 3, '')       -- an empty delta: the state only, no send
          and workspace_stream(v_b_req, 3, null);
  reset role;
  if v_ok is not true then
    raise exception 'FAIL 4: workspace_stream on a claimed request did not return true each time';
  end if;

  -- What the runner is refused while its requests are claimed (B) or still queued (C).
  set local role workspace_runner;
  for v_case in
    select * from (values
      ('begin on a queued request', '22023', 'workspace_begin:',
       format('select workspace_begin(%s, ''low'', ''claude-cli'', ''haiku'')', v_c_req)),
      ('a second begin on one request', '22023', 'workspace_begin:',
       format('select workspace_begin(%s, ''low'', ''claude-cli'', ''haiku'')', v_b_req)),
      ('begin with a tier off the three', '22023', 'workspace_begin:',
       format('select workspace_begin(%s, ''max'', ''claude-cli'', ''haiku'')', v_c_req)),
      ('begin with a provider off the three', '22023', 'workspace_begin:',
       format('select workspace_begin(%s, ''low'', ''openai'', ''haiku'')', v_c_req)),
      ('a delta over 16000 characters', '22023', 'workspace_stream:',
       format('select workspace_stream(%s, 3, repeat(''x'', 16001))', v_b_req)),
      ('a delta with seq 0', '22023', 'workspace_stream:',
       format('select workspace_stream(%s, 0, ''x'')', v_b_req)),
      ('finish with a state that is not done or failed', '22023', 'workspace_finish:',
       format('select workspace_finish(%s, ''cancelled'', ''x'', null, null, null, null, null, null)', v_b_req)),
      ('finish with an error code off the eight', '22023', 'workspace_finish:',
       format('select workspace_finish(%s, ''failed'', ''x'', null, ''nope'', null, null, null, null)', v_b_req)),
      ('finish with tool calls that are not an array', '22023', 'workspace_finish:',
       format('select workspace_finish(%s, ''done'', ''x'', ''{}'', null, null, null, null, null)', v_b_req)),
      ('finish on a request that does not exist', '22023', 'workspace_finish:',
       'select workspace_finish(-1, ''done'', ''x'', null, null, null, null, null, null)'),
      ('claim with no runner name', '22023', 'workspace_claim:', 'select * from workspace_claim('' '')'),
      ('heartbeat with no runner name', '22023', 'workspace_heartbeat:', 'select workspace_heartbeat(null)')
    ) as x(label, want, says, stmt)
  loop
    begin
      execute v_case.stmt;
      v_got := 'no error';
      v_said := '';
    exception when others then
      v_got := sqlstate;
      v_said := sqlerrm;
    end;
    if v_got <> v_case.want or v_said not like v_case.says || '%' then
      raise exception 'FAIL 4 (%): got % (%), expected % from %', v_case.label, v_got, v_said,
        v_case.want, v_case.says;
    end if;
  end loop;
  v_ok := workspace_stream(-1, 1, 'x');
  reset role;
  if v_ok is not false then
    raise exception 'FAIL 4: workspace_stream on a missing request returned %, expected false', v_ok;
  end if;
  if (select r.state from workspace_requests r where r.id = v_b_req) <> 'claimed' then
    raise exception 'FAIL 4: a refused call changed the request''s state';
  end if;

  -- Stop: the owner cancels, and the next stream call, with text or empty, answers false.
  set local role authenticated;
  v_ok := workspace_cancel(v_b_req);
  reset role;
  if v_ok is not true then
    raise exception 'FAIL 4: the owner could not cancel a claimed request';
  end if;
  set local role workspace_runner;
  v_ok := workspace_stream(v_b_req, 3, 'after stop') or workspace_stream(v_b_req, 3, '');
  reset role;
  if v_ok is not false then
    raise exception 'FAIL 4: workspace_stream after cancel returned true';
  end if;

  -- On a day with a partition: the two deltas were stored and nothing else was (not the empty
  -- calls, not the call after Stop). With no partition no send stores a row, so this is skipped.
  if current_setting('w63.partition_covers_now') = 'true' then
    perform set_config('realtime.topic', 'workspace:' || v_b::text, true);
    set local role authenticated;
    select count(*) filter (where m.payload->>'request_id' = v_b_req::text
                              and m.payload->>'seq' in ('1', '2')),
           count(*) = 2
      into v_n, v_ok
      from realtime.messages m
     where m.topic = 'workspace:' || v_b::text and m.extension = 'broadcast';
    reset role;
    if v_n <> 2 or v_ok is not true then
      raise exception 'FAIL 4: realtime.messages holds % delta row(s) for the request (only those two: %), expected exactly the two sent', v_n, v_ok;
    end if;
    perform set_config('w63.empty_delta_142', 'read', true);
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 5. Finish
  -- ---------------------------------------------------------------------------------------------
  -- 5a. A cancelled request stays cancelled and its message gets cancelled, whatever the runner
  --     says; a non-null p_model replaces the alias workspace_begin wrote; the session id is stamped.
  set local role workspace_runner;
  perform workspace_finish(v_b_req, 'done', 'partial text', '[]'::jsonb, null, 0.01, 1200, c_sid_b,
                           'claude-haiku-4-5-20251001');
  reset role;
  select r.state, r.error_code,
         m.finished, m.error_code as message_code, m.content, m.model, m.cost_usd, m.duration_ms,
         c.claude_session_id
    into v_row
    from workspace_requests r
    join workspace_messages m on m.id = v_b_ans
    join workspace_conversations c on c.id = r.conversation_id
   where r.id = v_b_req;
  if v_row.state <> 'cancelled' or v_row.error_code is distinct from 'cancelled'
     or v_row.finished is not true or v_row.message_code is distinct from 'cancelled'
     or v_row.content <> 'partial text' or v_row.model is distinct from 'claude-haiku-4-5-20251001'
     or v_row.cost_usd is distinct from 0.01 or v_row.duration_ms is distinct from 1200
     or v_row.claude_session_id is distinct from c_sid_b then
    raise exception 'FAIL 5a: after finish on a cancelled request: %', row_to_json(v_row);
  end if;

  -- 5b. The stale sweep. A's claim is 11 minutes old: the next claim call sweeps it to failed /
  --     stale_claim, on the request row and on its assistant row, and claims C in the same call.
  update workspace_requests set claimed_at = now() - interval '11 minutes' where id = v_a_req;
  set local role workspace_runner;
  select * into v_claim from workspace_claim('phase21_142');
  reset role;
  if v_claim.request_id is distinct from v_c_req or v_claim.claude_session_id is distinct from c_sid_c
     or v_claim.history is distinct from '[]'::jsonb or v_claim.prior_tier is not null then
    raise exception 'FAIL 5b: the claim after the sweep returned %', row_to_json(v_claim);
  end if;
  select r.state, r.error_code, r.finished_at, m.error_code as message_code, m.finished into v_row
    from workspace_requests r join workspace_messages m on m.id = v_a_ans where r.id = v_a_req;
  if v_row.state <> 'failed' or v_row.error_code is distinct from 'stale_claim'
     or v_row.finished_at is null or v_row.message_code is distinct from 'stale_claim'
     or v_row.finished is not true then
    raise exception 'FAIL 5b: an 11-minute-old claim was not swept to failed / stale_claim: %',
      row_to_json(v_row);
  end if;
  -- A claim 9 minutes old is not swept.
  update workspace_requests set claimed_at = now() - interval '9 minutes' where id = v_c_req;
  set local role workspace_runner;
  select count(*) into v_n from workspace_claim('phase21_142');
  reset role;
  if v_n <> 0 or (select r.state from workspace_requests r where r.id = v_c_req) <> 'claimed' then
    raise exception 'FAIL 5b: a 9-minute-old claim was swept, or a claim returned % row(s)', v_n;
  end if;

  -- 5c. Finish done: content cut at 100000, tool calls cut to the first 20, a session id that is
  --     not uuid-shaped stored as null without raising, a null p_model keeping the alias.
  select jsonb_agg(jsonb_build_object('tool', 'search_materials', 'query', 'q' || g,
                                      'scope', case when g % 2 = 0 then 'IST.323' end,
                                      'ok', g % 3 <> 0) order by g)
    into v_tools from generate_series(1, 21) g;
  set local role workspace_runner;
  v_c_ans := workspace_begin(v_c_req, 'low', 'claude-cli', 'haiku');
  perform workspace_finish(v_c_req, 'done', repeat('z', 100001), v_tools, null, 0.123456, 4321,
                           'not-a-uuid', null);
  reset role;
  select r.state, r.error_code, r.finished_at,
         m.finished, m.error_code as message_code, char_length(m.content) as content_length,
         m.tool_calls, m.model, m.cost_usd, m.duration_ms, c.claude_session_id
    into v_row
    from workspace_requests r
    join workspace_messages m on m.id = v_c_ans
    join workspace_conversations c on c.id = r.conversation_id
   where r.id = v_c_req;
  if v_row.state <> 'done' or v_row.error_code is not null or v_row.finished_at is null
     or v_row.finished is not true or v_row.message_code is not null
     or v_row.content_length <> 100000 or v_row.model is distinct from 'haiku'
     or v_row.cost_usd is distinct from 0.1235 or v_row.duration_ms is distinct from 4321
     or v_row.claude_session_id is not null
     or jsonb_array_length(v_row.tool_calls) <> 20
     or v_row.tool_calls->0 is distinct from v_tools->0
     or v_row.tool_calls->19 is distinct from v_tools->19 then
    raise exception 'FAIL 5c: after finish done: state %, codes %/%, finished_at %, content % chars, model %, cost %, duration %, session %, % tool calls',
      v_row.state, v_row.error_code, v_row.message_code, v_row.finished_at, v_row.content_length,
      v_row.model, v_row.cost_usd, v_row.duration_ms, v_row.claude_session_id,
      jsonb_array_length(v_row.tool_calls);
  end if;

  -- 5d. A follow-up in B: the claim carries the conversation's history through the functions (the
  --     question and the stopped answer), the tier of its latest assistant message and the session
  --     id finish stamped. Then finish failed / timeout: the code is on the request row and on the
  --     message, and finished_at is set.
  update workspace_messages set created_at = now() - interval '2 minutes' where id = v_b_msg;
  update workspace_messages set created_at = now() - interval '1 minute' where id = v_b_ans;
  set local role authenticated;
  v_out := workspace_ask(v_b, 'follow-up in B');
  reset role;
  v_d_req := (v_out->>'request_id')::bigint;
  set local role workspace_runner;
  select * into v_claim from workspace_claim('phase21_142');
  reset role;
  if v_claim.request_id is distinct from v_d_req or v_claim.prompt is distinct from 'follow-up in B'
     or v_claim.prior_tier is distinct from 'low' or v_claim.claude_session_id is distinct from c_sid_b
     or v_claim.history is distinct from jsonb_build_array(
          jsonb_build_object('role', 'user', 'content', 'question B'),
          jsonb_build_object('role', 'assistant', 'content', 'partial text')) then
    raise exception 'FAIL 5d: the follow-up''s claim returned %', row_to_json(v_claim);
  end if;
  set local role workspace_runner;
  v_d_ans := workspace_begin(v_d_req, 'high', 'claude-cli', 'opus');
  perform workspace_finish(v_d_req, 'failed', '', null, 'timeout', null, 480000, c_sid_b, null);
  reset role;
  select r.state, r.error_code, r.finished_at, m.finished, m.error_code as message_code,
         m.tool_calls, m.model, m.content
    into v_row
    from workspace_requests r join workspace_messages m on m.id = v_d_ans where r.id = v_d_req;
  if v_row.state <> 'failed' or v_row.error_code is distinct from 'timeout'
     or v_row.finished_at is null or v_row.finished is not true
     or v_row.message_code is distinct from 'timeout' or v_row.tool_calls <> '[]'::jsonb
     or v_row.model is distinct from 'opus' or v_row.content <> '' then
    raise exception 'FAIL 5d: after finish failed / timeout: %', row_to_json(v_row);
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 6. Heartbeat: called twice it leaves exactly one row, and the status view shows it
  -- ---------------------------------------------------------------------------------------------
  set local role workspace_runner;
  perform workspace_heartbeat('phase21_142');
  perform workspace_heartbeat('phase21_142');
  reset role;
  select count(*) as n, min(h.id) as id, max(h.runner) as runner, bool_and(h.polled_at is not null) as polled
    into v_row from workspace_runner_heartbeat h;
  if v_row.n <> 1 or v_row.id <> 1 or v_row.runner is distinct from 'phase21_142' or v_row.polled is not true then
    raise exception 'FAIL 6: after two heartbeats the table reads %', row_to_json(v_row);
  end if;
  set local role authenticated;
  select count(*) as n, max(s.runner) as runner, bool_and(s.polled_at is not null) as polled
    into v_row from v_workspace_status s;
  reset role;
  if v_row.n <> 1 or v_row.runner is distinct from 'phase21_142' or v_row.polled is not true then
    raise exception 'FAIL 6: v_workspace_status reads %', row_to_json(v_row);
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 7. What the runner's own login cannot read: 42501, four of four, and the browser's functions
  -- ---------------------------------------------------------------------------------------------
  set local role workspace_runner;
  for v_case in
    select * from (values
      ('select count(*) from assignment_progress'),
      ('select count(*) from reading_progress'),
      ('select count(*) from workspace_messages'),
      ('select count(*) from agent_requests'),
      ('select count(*) from v_workspace_status'),
      ('select workspace_ask(null, ''x'')'),
      ('select workspace_cancel(1)'),
      ('select realtime.send(''{}''::jsonb, ''delta'', ''workspace:x'', true)')
    ) as x(stmt)
  loop
    begin
      execute v_case.stmt;
      v_got := 'no error';
    exception when others then
      v_got := sqlstate;
    end;
    if v_got <> '42501' then
      raise exception 'FAIL 7: as workspace_runner [%] raised %, expected 42501', v_case.stmt, v_got;
    end if;
  end loop;
  reset role;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase21_142_workspace_runner: PASS' as result,
       (select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prosecdef
           and has_function_privilege('workspace_runner', p.oid, 'execute'))      as runner_definer_functions,
       (select count(*) from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
           and has_table_privilege('workspace_runner', c.oid,
                 'select, insert, update, delete, truncate, references, trigger')) as runner_table_privileges,
       current_setting('w63.partition_covers_now')                               as partition_covers_now,
       coalesce(current_setting('w63.empty_delta_142', true), 'not read')         as empty_delta_stores_nothing;

rollback;
