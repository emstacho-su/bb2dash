-- bb2dash :: db/tests/phase21_140b_workspace_writes.sql
-- Phase 21 (docs/planning/sprint-2/briefs/102_PHASE21_workspace.md), task 2 (P-86). Worker W-63.
-- Tests migration 140, the writes half: the browser's two RPCs (`workspace_ask`,
-- `workspace_cancel`), `workspace_prompt_max()`, and what the owner's own session may and may not
-- write past them. The tables, their shape and privileges, the reads and `v_workspace_status` are
-- in `phase21_140_workspace_tables.sql`. The two were one unit until 2026-10-06 and were split so
-- neither file is over 800 lines; the section numbers are the ones that unit had.
--
--   2. the owner asks: three rows, the title, the trim, and the two refusals (22023, 23505)
--   3. what the owner's own session may not write, and the two columns it may
--   4. cancel
--   4b. two rules the policies carry, tried by hand as the owner: a request names a question of
--       its own conversation, and a cancel carries the code `cancelled`
--   7. a stranger cannot ask, cancel or rename
--
-- The functions are called only under `set local role authenticated`, the way the browser calls
-- them; the reads that check a call's effect run as the session role. The setup is the unit's own:
-- every row it reads was made by its own `workspace_ask` calls, plus one answer written as the
-- session role. The unit runs against prod, where real conversations exist, so it asserts on its
-- own rows by id and never on a table's total.
--
-- RUN IT: `node scripts/db-test.mjs --only phase21_140b_workspace_writes.sql`. A failing assertion
-- raises; a pass ends with one row reading `phase21_140b_workspace_writes: PASS`. NOTHING IS
-- COMMITTED: the file opens its own transaction and its last statement is `rollback`.

begin;

-- =============================================================================================
-- Installed (the shape is phase21_140_workspace_tables.sql's to assert)
-- =============================================================================================
do $$
declare
  f text;
begin
  if to_regclass('public.workspace_requests') is null then
    raise exception 'FAIL phase21_140b: migration 140 is not applied (public.workspace_requests is missing)';
  end if;
  foreach f in array array['public.workspace_prompt_max()', 'public.workspace_ask(uuid, text)',
                           'public.workspace_cancel(bigint)'] loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase21_140b: migration 140 is not applied (% is missing)', f;
    end if;
  end loop;
end $$;

-- =============================================================================================
-- 2, 3, 4, 7. The owner asks, what the owner may not write, cancel, and a stranger
-- =============================================================================================
do $$
declare
  v_owner uuid := app_owner();
  v_out   jsonb;
  v_conv  uuid;      -- the first conversation
  v_msg   uuid;      -- its first user message
  v_req   bigint;    -- its first request
  v_conv2 uuid;      -- the 8000-character conversation
  v_msg2  uuid;      -- its user message
  v_ans2  uuid;      -- an answer in it, written as the session role
  v_req2  bigint;
  v_req3  bigint;    -- the follow-up request in the first conversation
  v_req4  bigint;    -- the request the owner inserts by hand in the second conversation
  v_req5  bigint;    -- the request left open while a stranger tries
  v_txt   text;
  v_got   text;
  v_said  text;
  v_n     integer;
  v_ok    boolean;
  v_row   record;
  v_case  record;
begin
  if v_owner is null then
    raise exception 'FAIL phase21_140b: app_owner() returned null, so the owner cannot be simulated';
  end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- 2a. The cap is one number, here and in the page.
  set local role authenticated;
  v_n := workspace_prompt_max();
  reset role;
  if v_n is distinct from 8000 then
    raise exception 'FAIL 2a: workspace_prompt_max() returned %, expected 8000', v_n;
  end if;

  -- 2b. A first question creates three rows. The text is stored trimmed; the title is its first line.
  set local role authenticated;
  v_out := workspace_ask(null, '  ' || chr(10) || 'What does the syllabus say about late work?   '
                               || chr(13) || chr(10) || 'A second line.' || chr(10) || '  ');
  reset role;
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'conversation_id,message_id,request_id' then
    raise exception 'FAIL 2b: workspace_ask returned %', v_out;
  end if;
  v_conv := (v_out->>'conversation_id')::uuid;
  v_msg  := (v_out->>'message_id')::uuid;
  v_req  := (v_out->>'request_id')::bigint;

  select c.title, c.archived, c.claude_session_id into v_row
    from workspace_conversations c where c.id = v_conv;
  if not found or v_row.title <> 'What does the syllabus say about late work?'
     or v_row.archived or v_row.claude_session_id is not null then
    raise exception 'FAIL 2b: the conversation reads %', row_to_json(v_row);
  end if;
  select m.conversation_id, m.role, m.content, m.finished, m.parent_message_id, m.request_id,
         m.tier, m.provider, m.model, m.tool_calls, m.error_code
    into v_row from workspace_messages m where m.id = v_msg;
  if not found or v_row.conversation_id <> v_conv or v_row.role <> 'user' or not v_row.finished
     or v_row.content <> 'What does the syllabus say about late work?   ' || chr(13) || chr(10)
                         || 'A second line.'
     or v_row.parent_message_id is not null or v_row.request_id is not null
     or v_row.tier is not null or v_row.provider is not null or v_row.model is not null
     or v_row.tool_calls <> '[]'::jsonb or v_row.error_code is not null then
    raise exception 'FAIL 2b: the user message reads %', row_to_json(v_row);
  end if;
  select r.conversation_id, r.user_message_id, r.state, r.attempts, r.claimed_at, r.claimed_by,
         r.finished_at, r.error_code
    into v_row from workspace_requests r where r.id = v_req;
  if not found or v_row.conversation_id <> v_conv or v_row.user_message_id <> v_msg
     or v_row.state <> 'queued' or v_row.attempts <> 0 or v_row.claimed_at is not null
     or v_row.claimed_by is not null or v_row.finished_at is not null
     or v_row.error_code is not null then
    raise exception 'FAIL 2b: the request reads %', row_to_json(v_row);
  end if;
  if (select count(*) from workspace_messages m where m.conversation_id = v_conv) <> 1
     or (select count(*) from workspace_requests r where r.conversation_id = v_conv) <> 1 then
    raise exception 'FAIL 2b: the first question did not create exactly one message and one request';
  end if;

  -- 2c. A second question while the first is open: 23505 from workspace_requests_one_open, and the
  --     refused call leaves no user message behind.
  set local role authenticated;
  begin
    perform workspace_ask(v_conv, 'A second question while the first is open');
    v_got := 'no error';
    v_said := '';
  exception when others then
    v_got := sqlstate;
    v_said := sqlerrm;
  end;
  reset role;
  if v_got <> '23505' or v_said not like '%workspace_requests_one_open%' then
    raise exception 'FAIL 2c: a second open request raised % (%), expected 23505 from workspace_requests_one_open',
      v_got, v_said;
  end if;
  if (select count(*) from workspace_messages m where m.conversation_id = v_conv) <> 1 then
    raise exception 'FAIL 2c: the refused question left its user message behind';
  end if;

  -- 2d. Empty and over-long text: 22023, in a message that starts with the function's name.
  foreach v_txt in array array['', '   ', chr(10) || chr(9) || ' ', repeat('x', 8001), null]::text[] loop
    set local role authenticated;
    begin
      perform workspace_ask(null, v_txt);
      v_got := 'no error';
      v_said := '';
    exception when others then
      v_got := sqlstate;
      v_said := sqlerrm;
    end;
    reset role;
    if v_got <> '22023' or v_said not like 'workspace_ask:%' then
      raise exception 'FAIL 2d: a question of % characters raised % (%), expected 22023 from workspace_ask',
        coalesce(char_length(v_txt)::text, 'null'), v_got, v_said;
    end if;
  end loop;

  -- 2e. 8000 characters is inside the cap; the title is cut at 120.
  set local role authenticated;
  v_out := workspace_ask(null, repeat('y', 8000));
  reset role;
  v_conv2 := (v_out->>'conversation_id')::uuid;
  v_msg2  := (v_out->>'message_id')::uuid;
  v_req2  := (v_out->>'request_id')::bigint;
  if (select c.title from workspace_conversations c where c.id = v_conv2)
     is distinct from repeat('y', 120) then
    raise exception 'FAIL 2e: the title of an 8000-character question is not its first 120 characters';
  end if;
  if (select char_length(m.content) from workspace_messages m
       where m.id = (v_out->>'message_id')::uuid) <> 8000 then
    raise exception 'FAIL 2e: the 8000-character question was not stored whole';
  end if;

  -- 2f. Once the first request is closed, a follow-up lands in the same conversation.
  update workspace_requests set state = 'done', finished_at = now() where id = v_req;
  set local role authenticated;
  v_out := workspace_ask(v_conv, 'A follow-up');
  reset role;
  v_req3 := (v_out->>'request_id')::bigint;
  if (v_out->>'conversation_id')::uuid <> v_conv
     or (select count(*) from workspace_messages m where m.conversation_id = v_conv) <> 2
     or (select c.title from workspace_conversations c where c.id = v_conv)
        <> 'What does the syllabus say about late work?' then
    raise exception 'FAIL 2f: the follow-up did not land in the first conversation (%)', v_out;
  end if;

  -- 2g. A conversation that does not exist is refused, and not with either code the page reads.
  set local role authenticated;
  begin
    perform workspace_ask('00000000-0000-4000-8000-000000002140', 'A question for no conversation');
    v_got := 'no error';
  exception when others then
    v_got := sqlstate;
  end;
  reset role;
  if v_got <> '23503' then
    raise exception 'FAIL 2g: a question for a missing conversation raised %, expected 23503', v_got;
  end if;

  -- 3. What the owner's own session may not write, and the two columns it may. `want` is a
  --    SQLSTATE, or ok:<rows> for a statement that must succeed.
  set local role authenticated;
  for v_case in
    select * from (values
      ('insert an assistant message', '42501',
       format('insert into workspace_messages (conversation_id, role, content, finished) '
              'values (%L, ''assistant'', ''x'', true)', v_conv)),
      ('insert an unfinished user message', '42501',
       format('insert into workspace_messages (conversation_id, role, content, finished) '
              'values (%L, ''user'', ''x'', false)', v_conv)),
      ('insert a message naming tier', '42501',
       format('insert into workspace_messages (conversation_id, role, content, finished, tier) '
              'values (%L, ''user'', ''x'', true, ''low'')', v_conv)),
      ('insert a message naming tool_calls', '42501',
       format('insert into workspace_messages (conversation_id, role, content, finished, tool_calls) '
              'values (%L, ''user'', ''x'', true, ''[]'')', v_conv)),
      ('insert a request naming its state', '42501',
       format('insert into workspace_requests (conversation_id, user_message_id, state) '
              'values (%L, %L, ''claimed'')', v_conv2, v_msg)),
      ('update an open request to done', '42501',
       format('update workspace_requests set state = ''done'' where id = %s', v_req3)),
      ('update an open request to failed', '42501',
       format('update workspace_requests set state = ''failed'' where id = %s', v_req3)),
      ('update a done request to cancelled', 'ok:0',
       format('update workspace_requests set state = ''cancelled'' where id = %s', v_req)),
      ('update a request''s attempts', '42501',
       format('update workspace_requests set attempts = 9 where id = %s', v_req3)),
      ('update a request''s claimed_by', '42501',
       format('update workspace_requests set claimed_by = ''me'' where id = %s', v_req3)),
      ('update a conversation''s claude_session_id', '42501',
       format('update workspace_conversations set claude_session_id = null where id = %L', v_conv)),
      ('update a conversation''s title', 'ok:1',
       format('update workspace_conversations set title = ''Late work'' where id = %L', v_conv)),
      ('archive a conversation', 'ok:1',
       format('update workspace_conversations set archived = true where id = %L', v_conv)),
      ('update a message''s content', '42501',
       format('update workspace_messages set content = ''edited'' where id = %L', v_msg)),
      ('delete a conversation', '42501',
       format('delete from workspace_conversations where id = %L', v_conv)),
      ('delete a message', '42501',
       format('delete from workspace_messages where id = %L', v_msg)),
      ('delete a request', '42501',
       format('delete from workspace_requests where id = %s', v_req)),
      ('delete the heartbeat', '42501', 'delete from workspace_runner_heartbeat where id = 1'),
      ('insert a heartbeat', '42501',
       'insert into workspace_runner_heartbeat (id, polled_at, runner) values (1, now(), ''me'')'),
      ('update the heartbeat', '42501',
       'update workspace_runner_heartbeat set runner = ''me'' where id = 1'),
      ('truncate the messages', '42501', 'truncate workspace_messages')
    ) as x(label, want, stmt)
  loop
    begin
      execute v_case.stmt;
      get diagnostics v_n = row_count;
      v_got := 'ok:' || v_n;
    exception when others then
      v_got := sqlstate;
    end;
    if v_got <> v_case.want then
      raise exception 'FAIL 3 (%): got %, expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  reset role;
  select c.title, c.archived into v_row from workspace_conversations c where c.id = v_conv;
  if v_row.title <> 'Late work' or not v_row.archived then
    raise exception 'FAIL 3: the owner''s title and archived updates did not land (%)', row_to_json(v_row);
  end if;

  -- 4. Cancel: queued -> cancelled with the code on the request row; a second cancel, a done
  --    request and a null id each return false; claimed -> cancelled.
  set local role authenticated;
  v_ok := workspace_cancel(v_req3);
  reset role;
  select r.state, r.error_code, r.finished_at into v_row from workspace_requests r where r.id = v_req3;
  if v_ok is not true or v_row.state <> 'cancelled' or v_row.error_code is distinct from 'cancelled'
     or v_row.finished_at is null then
    raise exception 'FAIL 4: cancel of a queued request returned % and left %', v_ok, row_to_json(v_row);
  end if;
  set local role authenticated;
  v_ok := workspace_cancel(v_req3);
  reset role;
  if v_ok is not false then
    raise exception 'FAIL 4: a second cancel returned %, expected false', v_ok;
  end if;
  set local role authenticated;
  v_ok := workspace_cancel(v_req);
  reset role;
  if v_ok is not false or (select r.state from workspace_requests r where r.id = v_req) <> 'done' then
    raise exception 'FAIL 4: cancel of a done request returned %, expected false', v_ok;
  end if;
  set local role authenticated;
  v_ok := workspace_cancel(null);
  reset role;
  if v_ok is not false then
    raise exception 'FAIL 4: cancel of a null id returned %, expected false', v_ok;
  end if;
  update workspace_requests
     set state = 'claimed', claimed_at = now(), claimed_by = 'phase21_140', attempts = 1
   where id = v_req2;
  set local role authenticated;
  v_ok := workspace_cancel(v_req2);
  reset role;
  select r.state, r.error_code into v_row from workspace_requests r where r.id = v_req2;
  if v_ok is not true or v_row.state <> 'cancelled' or v_row.error_code is distinct from 'cancelled' then
    raise exception 'FAIL 4: cancel of a claimed request returned % and left %', v_ok, row_to_json(v_row);
  end if;

  -- 4b. Two rules the policies carry (140, the pre-freeze round of 2026-10-06), tried by hand as
  --     the owner. Neither conversation has an open request here, so the pairing is the only thing
  --     the first two inserts can be refused for. The third is the control: the conversation's own
  --     question is accepted, which is what shows the policy reads the new row's conversation. The
  --     two updates then try to stop that request by hand: with another code, and with none.
  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_conv2, 'assistant', 'An answer', true) returning id into v_ans2;
  set local role authenticated;
  for v_case in
    select * from (values
      ('pair the second conversation with the first one''s question', '42501',
       format('insert into workspace_requests (conversation_id, user_message_id) values (%L, %L)',
              v_conv2, v_msg)),
      ('pair a conversation with its own answer', '42501',
       format('insert into workspace_requests (conversation_id, user_message_id) values (%L, %L)',
              v_conv2, v_ans2)),
      ('pair a conversation with its own question', 'ok:1',
       format('insert into workspace_requests (conversation_id, user_message_id) values (%L, %L)',
              v_conv2, v_msg2)),
      ('cancel by hand with another code', '42501',
       format('update workspace_requests set state = ''cancelled'', error_code = ''timeout'' '
              'where conversation_id = %L and state = ''queued''', v_conv2)),
      ('cancel by hand with no code', '42501',
       format('update workspace_requests set state = ''cancelled'' '
              'where conversation_id = %L and state = ''queued''', v_conv2))
    ) as x(label, want, stmt)
  loop
    begin
      execute v_case.stmt;
      get diagnostics v_n = row_count;
      v_got := 'ok:' || v_n;
    exception when others then
      v_got := sqlstate;
    end;
    if v_got <> v_case.want then
      raise exception 'FAIL 4b (%): got %, expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  reset role;
  -- The refused cancels changed nothing: the hand-made request is the one open request there.
  select count(*), max(r.id) into v_n, v_req4
    from workspace_requests r
   where r.conversation_id = v_conv2 and r.user_message_id = v_msg2 and r.state = 'queued'
     and r.error_code is null and r.finished_at is null;
  if v_n <> 1 then
    raise exception 'FAIL 4b: after two refused cancels % request(s) are queued and untouched in the second conversation, expected 1', v_n;
  end if;
  -- workspace_cancel still stops it, with the code and a finish time.
  set local role authenticated;
  v_ok := workspace_cancel(v_req4);
  reset role;
  select r.state, r.error_code, r.finished_at into v_row from workspace_requests r where r.id = v_req4;
  if v_ok is not true or v_row.state <> 'cancelled' or v_row.error_code is distinct from 'cancelled'
     or v_row.finished_at is null then
    raise exception 'FAIL 4b: workspace_cancel returned % and left %', v_ok, row_to_json(v_row);
  end if;

  -- 7. A stranger cannot ask, cancel or rename. The request the stranger tries to stop is open,
  --    and it is still queued afterwards: a false from workspace_cancel on a closed request is
  --    what the owner gets too, so it would prove nothing.
  set local role authenticated;
  v_out := workspace_ask(v_conv, 'Open while a stranger tries');
  reset role;
  v_req5 := (v_out->>'request_id')::bigint;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  set local role authenticated;
  begin
    perform workspace_ask(null, 'A stranger''s question');
    v_got := 'no error';
  exception when others then
    v_got := sqlstate;
  end;
  reset role;
  if v_got <> '42501' then
    raise exception 'FAIL 7: a stranger''s workspace_ask raised %, expected 42501', v_got;
  end if;
  set local role authenticated;
  v_ok := workspace_cancel(v_req5);
  update workspace_conversations set title = 'stranger' where id = v_conv;
  get diagnostics v_n = row_count;
  reset role;
  if v_ok is not false or v_n <> 0 then
    raise exception 'FAIL 7: a stranger cancelled (%) or renamed (% rows)', v_ok, v_n;
  end if;
  select r.state, r.error_code, r.finished_at into v_row from workspace_requests r where r.id = v_req5;
  if not found or v_row.state <> 'queued' or v_row.error_code is not null
     or v_row.finished_at is not null then
    raise exception 'FAIL 7: after a stranger''s cancel the open request reads %', row_to_json(v_row);
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase21_140b_workspace_writes: PASS' as result,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = 'workspace_requests')     as request_policies,
       (select count(*) from pg_proc p
         where p.oid in ('public.workspace_ask(uuid, text)'::regprocedure,
                         'public.workspace_cancel(bigint)'::regprocedure)
           and not p.prosecdef)                                                    as invoker_functions;

rollback;
