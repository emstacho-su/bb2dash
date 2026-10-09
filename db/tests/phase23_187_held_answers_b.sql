-- bb2dash :: db/tests/phase23_187_held_answers_b.sql
-- Phase 23 follow-ups (brief 110, Item 1, with Round 2's R3, R4 and the failed-close rule).
-- The SECOND of two units on migration 187, section 1 (the first is phase23_187_held_answers.sql).
-- THIS FILE HOLDS cases 0, 10 to 17, 19 and 20, and repeats the first file's installed check and setup:
--
--   0. installed (as in the first file)
--  10. anon, authenticated, inbox_apply_runner and sync_runner cannot execute
--      inbox_apply_held_items(); the service role and the test login can
--  11. on the table, no privilege is held by anon, authenticated or service_role, the test login
--      holds select alone, and an insert as authenticated and as the test login is refused
--  12. a hold for the same answer is kept by a later close; a different answer replaces it
--  13. a malformed skip_seen is refused with 22023 and changes nothing
--  14. a close with no skip_seen, or with an id outside its skip, writes no hold
--  15. a close removes the hold of an item that left the queue
--  16. no follow-up is filed for a queue that holds held answers alone
--  17. R3: a press tries held answers through its whole chain: the button's follow-up carries
--      retry_held and the first close's skip, and is handed exactly that skip as held; a sync-filed
--      request's follow-up is handed the held set and carries no retry_held; held rows alone file
--      nothing after a sync-filed close and a retry follow-up after the button's
--  19. a done close writes no hold, keeps the holds that stand
--  20. round 3: the failed close of a retry follow-up writes no hold for an id in its own skip (an
--      answer given again mid-chain, a hand-written request), and leaves a standing hold alone
--
-- RUN IT: `node scripts/db-test.mjs --only phase23_187_held_answers_b.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

create temp table _t187 (label text primary key, id bigint) on commit drop;

-- One claimed request of the worker's at a time (183): each close below needs a fresh one.
create function pg_temp.t187_request(p_params jsonb default '{"trigger": "sync", "after": 1}'::jsonb)
  returns bigint language sql as $$
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, params, note)
  values ('inbox_feedback', 'all', 'claimed', now(), 'inbox-apply-runner', 1, p_params, 'phase23_187')
  returning id
$$;

create function pg_temp.t187_sync() returns bigint language sql as $$
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, note)
  values ('sync', 'all', 'done', now(), 'sync-runner', now(), 'phase23_187')
  returning id
$$;

-- An answered row, given an hour ago.
create function pg_temp.t187_item(p_ref text, p_note text default null) returns bigint language sql as $$
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution, resolution_note)
  values ('stack_must_confirm', 'assignment', p_ref, '187 ' || p_ref, 'resolved',
          now() - interval '1 hour', '{"value":"yes","value_type":"text"}', p_note)
  returning id
$$;

-- Answered again: a new answer carries a new resolved_at, later than the transaction's now() (the
-- failed requests of this unit finish at now(), so an older time would still read as held by 186's arm).
create function pg_temp.t187_reanswer(p_id bigint) returns void language sql as $$
  update attention_items set resolved_at = greatest(resolved_at, now()) + interval '1 minute' where id = p_id
$$;

create function pg_temp.t187_archive(p_id bigint) returns void language sql as $$
  update attention_items
     set state = 'archived', archived_at = now(), archived_by = 'phase23_187 setup',
         decision = '{"change": "test setup"}'::jsonb
   where id = p_id
$$;

-- The queue row as prepare hands it to the worker: {id, resolved_at}.
create function pg_temp.t187_seen(p_id bigint) returns jsonb language sql as $$
  select jsonb_build_object('id', q.id, 'resolved_at', q.resolved_at) from v_inbox_queue q where q.id = p_id
$$;

-- plpgsql, so that creating it does not need 187 (section 0 says "not applied" first).
create function pg_temp.t187_held() returns bigint[] language plpgsql as $$
declare v_ids bigint[];
begin
  select coalesce(array_agg(h order by h), '{}'::bigint[]) into v_ids from public.inbox_apply_held_items() h;
  return v_ids;
end $$;

create function pg_temp.t187_close(p_req bigint, p_state text, p_result jsonb) returns bigint
  language plpgsql as $$
declare v_follow bigint;
begin
  set local role inbox_apply_runner;
  v_follow := inbox_apply_close(p_req, p_state, p_result);
  reset role;
  return v_follow;
end $$;

create function pg_temp.t187_prepare(p_req bigint) returns jsonb language plpgsql as $$
declare v_prep jsonb;
begin
  set local role inbox_apply_runner;
  v_prep := inbox_apply_prepare(p_req);
  reset role;
  return v_prep;
end $$;

create function pg_temp.t187_sync_request(p_sync bigint) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  set local role sync_runner;
  v_id := sync_request_inbox_apply(p_sync);
  reset role;
  return v_id;
end $$;

-- A run that could not apply `p_item`: it was handed `p_seen` for it.
create function pg_temp.t187_skip_result(p_ids bigint[], p_seen jsonb, p_error text default 'not_applied')
  returns jsonb language sql as $$
  select jsonb_build_object('lines', jsonb_build_array('1 could not be applied'), 'error', p_error,
                            'archived', 0, 'skip', to_jsonb(p_ids), 'skip_seen', p_seen,
                            'claude', jsonb_build_object('started', true))
$$;

-- Open notices of the two kinds, as "failed/login".
create function pg_temp.t187_open() returns text language sql as $$
  select count(*) filter (where ref = 'inbox-apply-failed') || '/' ||
         count(*) filter (where ref = 'apply-login-required')
    from attention_items
   where state = 'open' and ref in ('inbox-apply-failed', 'apply-login-required')
$$;

create function pg_temp.t187_archive_notices() returns void language sql as $$
  update attention_items
     set state = 'archived', archived_at = now(), archived_by = 'phase23_187 setup',
         decision = '{"change": "test setup"}'::jsonb
   where state = 'open' and ref in ('inbox-apply-failed', 'apply-login-required')
$$;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare
  f text;
  r record;
begin
  if to_regclass('public.inbox_apply_holds') is null
     or to_regprocedure('public.inbox_apply_held_items()') is null then
    raise exception 'FAIL phase23_187_held_answers_b: migration 187 is not applied (the hold table or inbox_apply_held_items() is missing)';
  end if;
  if position('session_link' in (select prosrc from pg_proc
                                  where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0
     or position('inbox_apply_held_items' in (select prosrc from pg_proc
                                               where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_187_held_answers_b: migration 187 is not applied (inbox_apply_prepare is not its body)';
  end if;
  if position('c_signed_in' in (select prosrc from pg_proc
                                 where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0
     or position('skip_seen' in (select prosrc from pg_proc
                                  where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_187_held_answers_b: migration 187 is not applied (inbox_apply_close is not its body)';
  end if;
  if position('inbox_apply_held_items' in (select prosrc from pg_proc
                                            where oid = 'public.sync_request_inbox_apply(bigint)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_187_held_answers_b: migration 187 is not applied (sync_request_inbox_apply is still 180''s body)';
  end if;

  foreach f in array array['public.inbox_apply_held_items()',
                           'public.inbox_apply_prepare(bigint)',
                           'public.inbox_apply_close(bigint, text, jsonb)',
                           'public.sync_request_inbox_apply(bigint)'] loop
    select p.prosecdef, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg
      into r from pg_proc p where p.oid = f::regprocedure;
    if not r.prosecdef or r.owner <> 'postgres' or not r.cfg @> array['search_path=public, pg_temp'] then
      raise exception 'FAIL phase23_187_held_answers_b (shape): % lost SECURITY DEFINER, its owner or its search_path', f;
    end if;
  end loop;
end $$;

-- =============================================================================================
-- Setup (not an assertion): no real open inbox_feedback request, no real answered row and no real
-- open notice is in the way. Changed inside this transaction only; the rollback restores them.
-- =============================================================================================
update agent_requests set state = 'cancelled'
 where kind = 'inbox_feedback' and state in ('queued', 'claimed');

update attention_items
   set state = 'archived', archived_at = now(), archived_by = 'phase23_187 setup',
       decision = '{"change": "test setup"}'::jsonb
 where state in ('resolved', 'dismissed')
    or (state = 'open' and ref in ('inbox-apply-failed', 'apply-login-required'));

-- =============================================================================================
-- 10. Who can run inbox_apply_held_items()
-- =============================================================================================
do $$
declare
  c_fn constant text := 'public.inbox_apply_held_items()';
  v_state text;
  v_raised boolean;
  v_role text;
begin
  if has_function_privilege('anon', c_fn, 'execute') or has_function_privilege('authenticated', c_fn, 'execute')
     or has_function_privilege('inbox_apply_runner', c_fn, 'execute') or has_function_privilege('sync_runner', c_fn, 'execute') then
    raise exception 'FAIL 10: inbox_apply_held_items() is executable beyond the service role and the test login';
  end if;
  if not has_function_privilege('service_role', c_fn, 'execute') or not has_function_privilege('db_test_runner', c_fn, 'execute') then
    raise exception 'FAIL 10: the service role or the test login cannot execute inbox_apply_held_items()';
  end if;

  -- A call, not just a catalog read.
  foreach v_role in array array['anon', 'authenticated', 'inbox_apply_runner', 'sync_runner'] loop
    v_raised := false;
    begin
      execute format('set local role %I', v_role);
      perform inbox_apply_held_items();
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '42501';
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 10: % was not refused when it called inbox_apply_held_items()', v_role;
    end if;
  end loop;
end $$;

-- =============================================================================================
-- 11. The table grants nothing
-- =============================================================================================
do $$
declare
  c_tbl constant text := 'public.inbox_apply_holds';
  v_role text;
  v_priv text;
  v_state text;
  v_raised boolean;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'inbox_apply_runner', 'sync_runner'] loop
    foreach v_priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege(v_role, c_tbl, v_priv) then
        raise exception 'FAIL 11: % holds % on the hold table', v_role, v_priv;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('db_test_runner', c_tbl, 'select') then
    raise exception 'FAIL 11: the test login cannot read the hold table';
  end if;
  foreach v_priv in array array['insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    if has_table_privilege('db_test_runner', c_tbl, v_priv) then
      raise exception 'FAIL 11: the test login holds % on the hold table', v_priv;
    end if;
  end loop;
  if not (select c.relrowsecurity from pg_class c where c.oid = c_tbl::regclass) then
    raise exception 'FAIL 11: row level security is off on the hold table';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inbox_apply_holds') then
    raise exception 'FAIL 11: the hold table has a policy';
  end if;

  -- An insert as authenticated, then as the test login: refused.
  v_raised := false;
  begin
    set local role authenticated;
    insert into inbox_apply_holds (item_id, request_id, resolved_at) values (-1, -1, now());
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_raised := v_state = '42501';
  end;
  reset role;
  if not v_raised then
    raise exception 'FAIL 11: an insert as authenticated was not refused with 42501';
  end if;

  v_raised := false;
  begin
    insert into inbox_apply_holds (item_id, request_id, resolved_at) values (-1, -1, now());
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_raised := v_state = '42501';
  end;
  if not v_raised then
    raise exception 'FAIL 11: an insert as the test login was not refused with 42501';
  end if;
end $$;

-- =============================================================================================
-- 12. A hold for the same answer is kept; a different answer replaces it
-- =============================================================================================
do $$
declare
  v_w    bigint := pg_temp.t187_item('test187:w');
  v_r1   bigint := pg_temp.t187_request();
  v_r2   bigint;
  v_r3   bigint;
  v_h1   record;
  v_h2   record;
begin
  insert into _t187 values ('w', v_w);
  perform pg_temp.t187_close(v_r1, 'failed', pg_temp.t187_skip_result(array[v_w], jsonb_build_array(pg_temp.t187_seen(v_w))));
  select * into v_h1 from inbox_apply_holds where item_id = v_w;

  -- The same answer, held again by a later run: the row is the first run's, untouched.
  v_r2 := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r2, 'failed', pg_temp.t187_skip_result(array[v_w], jsonb_build_array(pg_temp.t187_seen(v_w))));
  select * into v_h2 from inbox_apply_holds where item_id = v_w;
  -- (held_at is not compared: now() is one value inside this transaction, so it could not differ.)
  if v_h2.request_id is distinct from v_r1 or v_h2.resolved_at is distinct from v_h1.resolved_at
     or (select count(*) from inbox_apply_holds where item_id = v_w) <> 1 then
    raise exception 'FAIL 12: the hold for the same answer was not kept: first %, then %', row_to_json(v_h1), row_to_json(v_h2);
  end if;

  -- A new answer, held by a new run: the one row now names the new run and the new time.
  perform pg_temp.t187_reanswer(v_w);
  v_r3 := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r3, 'failed', pg_temp.t187_skip_result(array[v_w], jsonb_build_array(pg_temp.t187_seen(v_w))));
  select * into v_h2 from inbox_apply_holds where item_id = v_w;
  if v_h2.request_id is distinct from v_r3
     or v_h2.resolved_at is distinct from (select resolved_at from attention_items where id = v_w)
     or (select count(*) from inbox_apply_holds where item_id = v_w) <> 1 then
    raise exception 'FAIL 12: the hold for a new answer did not replace the old: %', row_to_json(v_h2);
  end if;
  if pg_temp.t187_held() <> array[v_w] then
    raise exception 'FAIL 12: held set is %, expected {%}', pg_temp.t187_held(), v_w;
  end if;
end $$;

-- =============================================================================================
-- 13. A malformed skip_seen is refused
-- =============================================================================================
do $$
declare
  v_w     bigint := (select id from _t187 where label = 'w');
  v_r     bigint := pg_temp.t187_request();
  v_case  record;
  v_state text;
  v_raised boolean;
  v_holds int := (select count(*) from inbox_apply_holds);
begin
  for v_case in
    select * from (values
      ('an object',            '{"id": 1}'::jsonb),
      ('a string',             '"x"'::jsonb),
      ('a list of numbers',    '[1, 2]'::jsonb),
      ('an id as text',        jsonb_build_array(jsonb_build_object('id', v_w::text, 'resolved_at', null))),
      ('a missing id',         jsonb_build_array(jsonb_build_object('resolved_at', null))),
      ('a fractional id',      jsonb_build_array(jsonb_build_object('id', 1.5, 'resolved_at', null))),
      ('a numeric time',       jsonb_build_array(jsonb_build_object('id', v_w, 'resolved_at', 5))),
      ('a time that is no time', jsonb_build_array(jsonb_build_object('id', v_w, 'resolved_at', 'not a time')))
    ) t(label, seen)
  loop
    v_raised := false;
    begin
      perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(array[v_w], v_case.seen));
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '22023';
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 13: skip_seen as % was not refused with 22023', v_case.label;
    end if;
    if (select state from agent_requests where id = v_r) <> 'claimed' then
      raise exception 'FAIL 13: the refused close for % changed the request', v_case.label;
    end if;
  end loop;
  if (select count(*) from inbox_apply_holds) <> v_holds then
    raise exception 'FAIL 13: a refused close changed the holds';
  end if;

  -- Well-formed: a list that is empty.
  perform pg_temp.t187_close(v_r, 'done', pg_temp.t187_skip_result(array[v_w], '[]'::jsonb));
end $$;

-- A null time is a well-formed skip_seen: it holds a row whose answer has no resolved_at (an answered
-- row can sit in the queue with none), and holds nothing for a row that has a time.
do $$
declare
  v_w    bigint := (select id from _t187 where label = 'w');
  v_nt   bigint;
  v_r    bigint;
  v_before bigint := (select request_id from inbox_apply_holds where item_id = (select id from _t187 where label = 'w'));
begin
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test187:nulltime', '187 nulltime', 'resolved', null, '{"value":"yes"}')
  returning id into v_nt;
  if not exists (select 1 from v_inbox_queue where id = v_nt and resolved_at is null) then
    raise exception 'FAIL 13 (setup): the null-time row is not in the queue with no resolved_at';
  end if;
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(
    array[v_nt, v_w], jsonb_build_array(jsonb_build_object('id', v_nt, 'resolved_at', null),
                                        jsonb_build_object('id', v_w, 'resolved_at', null))));
  if not exists (select 1 from inbox_apply_holds where item_id = v_nt and request_id = v_r and resolved_at is null)
     or not v_nt = any (pg_temp.t187_held()) then
    raise exception 'FAIL 13: a null time against a row with no resolved_at did not hold it';
  end if;
  -- A null time against W, which has a time: no hold written, the one that stands is untouched.
  if (select request_id from inbox_apply_holds where item_id = v_w) is distinct from v_before
     or (select resolved_at from inbox_apply_holds where item_id = v_w) is null then
    raise exception 'FAIL 13: a null time against a row that has a time changed its hold';
  end if;
end $$;

-- =============================================================================================
-- 14. No skip_seen, or an id outside the skip: no hold
-- =============================================================================================
do $$
declare
  v_a bigint := pg_temp.t187_item('test187:a');
  v_b bigint := pg_temp.t187_item('test187:b');
  v_r bigint;
begin
  insert into _t187 values ('a', v_a), ('b', v_b);

  -- The worker before its rebuild: a skip and no skip_seen.
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', jsonb_build_object(
    'lines', jsonb_build_array('1 could not be applied'), 'error', 'not_applied', 'archived', 0,
    'skip', jsonb_build_array(v_a), 'claude', jsonb_build_object('started', true)));
  if exists (select 1 from inbox_apply_holds where item_id = v_a) or v_a = any (pg_temp.t187_held()) then
    raise exception 'FAIL 14: a close with no skip_seen wrote a hold';
  end if;

  -- A time seen for an item the run did not skip: no hold either.
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(array[v_a], jsonb_build_array(pg_temp.t187_seen(v_b))));
  if exists (select 1 from inbox_apply_holds where item_id in (v_a, v_b)) then
    raise exception 'FAIL 14: a hold was written for an id that is not both in skip and in skip_seen';
  end if;

  -- An id that is not in the queue at all is not held, and does not break the close.
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(
    array[-5::bigint], jsonb_build_array(jsonb_build_object('id', -5, 'resolved_at', null))));
  if exists (select 1 from inbox_apply_holds where item_id = -5) then
    raise exception 'FAIL 14: an id outside the queue was held';
  end if;
end $$;

-- =============================================================================================
-- 15. A close removes the hold of an item that left the queue
-- =============================================================================================
do $$
declare
  v_w bigint := (select id from _t187 where label = 'w');
  v_r bigint := pg_temp.t187_request();
begin
  if not exists (select 1 from inbox_apply_holds where item_id = v_w) then
    raise exception 'FAIL 15 (setup): W has no hold';
  end if;
  perform pg_temp.t187_archive(v_w);
  -- Nothing removes the row until a close runs; held_items ignores it meanwhile.
  if v_w = any (pg_temp.t187_held()) then
    raise exception 'FAIL 15: an archived item is held';
  end if;
  perform pg_temp.t187_close(v_r, 'done', '{"lines": ["Nothing new"], "archived": 0, "skip": []}'::jsonb);
  if exists (select 1 from inbox_apply_holds where item_id = v_w) then
    raise exception 'FAIL 15: the hold of an item that left the queue survived a close';
  end if;
end $$;

-- =============================================================================================
-- 16. A queue of held answers alone gets no follow-up
-- =============================================================================================
do $$
declare
  v_c bigint := pg_temp.t187_item('test187:c');
  v_d bigint;
  v_r bigint;
  v_follow bigint;
  v_row record;
begin
  insert into _t187 values ('c', v_c);
  -- Put everything else aside: C is the whole queue, and it is held.
  update attention_items
     set state = 'archived', archived_at = now(), archived_by = 'phase23_187 setup',
         decision = '{"change": "test setup"}'::jsonb
   where state in ('resolved', 'dismissed') and id <> v_c;
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(array[v_c], jsonb_build_array(pg_temp.t187_seen(v_c))));
  if pg_temp.t187_held() <> array[v_c] then
    raise exception 'FAIL 16 (setup): C is not held: %', pg_temp.t187_held();
  end if;

  -- A run that archived something, leaving only a held answer: nothing to follow up.
  v_r := pg_temp.t187_request();
  v_follow := pg_temp.t187_close(v_r, 'done', '{"lines": ["1 answer applied"], "archived": 1, "skip": []}'::jsonb);
  if v_follow is not null then
    raise exception 'FAIL 16: a follow-up % was filed for a queue of held answers alone', v_follow;
  end if;

  -- With an unheld row also waiting, the follow-up is filed, as in 186, with the close's own skip.
  v_d := pg_temp.t187_item('test187:d');
  v_r := pg_temp.t187_request();
  v_follow := pg_temp.t187_close(v_r, 'done', '{"lines": ["1 answer applied"], "archived": 1, "skip": []}'::jsonb);
  if v_follow is null then
    raise exception 'FAIL 16: no follow-up was filed with an unheld row waiting';
  end if;
  select state, params into v_row from agent_requests where id = v_follow;
  if v_row.state <> 'queued'
     or v_row.params is distinct from jsonb_build_object('trigger', 'followup', 'after', v_r, 'skip', '[]'::jsonb) then
    raise exception 'FAIL 16: the follow-up reads %', row_to_json(v_row);
  end if;
  update agent_requests set state = 'cancelled' where id = v_follow;
end $$;
-- =============================================================================================
-- 17. R3: a press tries held answers through its whole chain
-- =============================================================================================
update attention_items
   set state = 'archived', archived_at = now(), archived_by = 'phase23_187 setup',
       decision = '{"change": "test setup"}'::jsonb
 where state in ('resolved', 'dismissed');

do $$
declare
  v_h1   bigint := pg_temp.t187_item('test187:h1');
  v_u1   bigint := pg_temp.t187_item('test187:u1');
  v_u2   bigint := pg_temp.t187_item('test187:u2');
  v_r    bigint;
  v_follow bigint;
  v_follow2 bigint;
  v_row  record;
  v_prep jsonb;
begin
  insert into _t187 values ('h1', v_h1), ('u1', v_u1), ('u2', v_u2);
  -- h1 was held by an earlier failed run; u1 and u2 are plain answers.
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(array[v_h1], jsonb_build_array(pg_temp.t187_seen(v_h1))));
  if pg_temp.t187_held() <> array[v_h1] then
    raise exception 'FAIL 17 (setup): h1 is not held: %', pg_temp.t187_held();
  end if;

  -- (a) The button's request. Its batch archived one and could not apply u1; h1 (held, untried) and
  -- u2 are beyond the batch. A follow-up is filed, a retry follow-up carrying the first close's skip.
  v_r := pg_temp.t187_request('{}'::jsonb);
  v_prep := pg_temp.t187_prepare(v_r);
  if v_prep->'held' <> '[]'::jsonb then
    raise exception 'FAIL 17: the button''s request was handed held %', v_prep->'held';
  end if;
  v_follow := pg_temp.t187_close(v_r, 'done',
    jsonb_build_object('lines', jsonb_build_array('1 answer applied'), 'archived', 1, 'skip', jsonb_build_array(v_u1),
                       'claude', jsonb_build_object('started', true)));
  if v_follow is null then
    raise exception 'FAIL 17: the button''s request filed no follow-up with a held, untried row waiting';
  end if;
  select state, params into v_row from agent_requests where id = v_follow;
  if v_row.state <> 'queued'
     or v_row.params is distinct from jsonb_build_object('trigger', 'followup', 'after', v_r,
                                                          'skip', jsonb_build_array(v_u1), 'retry_held', true) then
    raise exception 'FAIL 17: the button''s follow-up reads %', row_to_json(v_row);
  end if;
  -- The follow-up is handed exactly the first close's skip as held, not the whole held set ([h1]).
  update agent_requests set state = 'claimed', claimed_at = now(), claimed_by = 'inbox-apply-runner', claim_attempts = 1
   where id = v_follow;
  v_prep := pg_temp.t187_prepare(v_follow);
  if v_prep->'held' is distinct from jsonb_build_array(v_u1) then
    raise exception 'FAIL 17: the retry follow-up was handed held %, expected exactly [%]', v_prep->'held', v_u1;
  end if;

  -- (a2) That follow-up archives one more and only held answers are left beyond its skip: another
  -- retry follow-up (the chain goes on), with the skip of this close.
  update attention_items
     set state = 'archived', archived_at = now(), archived_by = 'phase23_187 setup', decision = '{"change": "test setup"}'::jsonb
   where id = v_u2;
  v_follow2 := pg_temp.t187_close(v_follow, 'done',
    jsonb_build_object('lines', jsonb_build_array('1 answer applied'), 'archived', 1, 'skip', jsonb_build_array(v_u1),
                       'claude', jsonb_build_object('started', true)));
  if v_follow2 is null then
    raise exception 'FAIL 17: a retry follow-up with held answers left filed no further follow-up';
  end if;
  if (select params from agent_requests where id = v_follow2)
     is distinct from jsonb_build_object('trigger', 'followup', 'after', v_follow, 'skip', jsonb_build_array(v_u1), 'retry_held', true) then
    raise exception 'FAIL 17: the second follow-up reads %', (select params from agent_requests where id = v_follow2);
  end if;
  update agent_requests set state = 'cancelled' where id = v_follow2;

  -- (b) A sync-filed request: its follow-up is handed the held set and carries no retry_held.
  update attention_items set state = 'resolved', archived_at = null, archived_by = null, decision = null where id = v_u2;
  v_r := pg_temp.t187_request();
  v_follow := pg_temp.t187_close(v_r, 'done', '{"lines": ["1 answer applied"], "archived": 1, "skip": []}'::jsonb);
  if v_follow is null then
    raise exception 'FAIL 17: a sync-filed request with an unheld row waiting filed no follow-up';
  end if;
  select params into v_row from agent_requests where id = v_follow;
  if v_row.params ? 'retry_held' or v_row.params->>'trigger' <> 'followup' then
    raise exception 'FAIL 17: a sync-filed request''s follow-up carries %', v_row.params;
  end if;
  update agent_requests set state = 'claimed', claimed_at = now(), claimed_by = 'inbox-apply-runner', claim_attempts = 1
   where id = v_follow;
  v_prep := pg_temp.t187_prepare(v_follow);
  if v_prep->'held' is distinct from jsonb_build_array(v_h1) then
    raise exception 'FAIL 17: a sync-filed follow-up was handed held %, expected the held set [%]', v_prep->'held', v_h1;
  end if;
  perform pg_temp.t187_close(v_follow, 'done', '{"lines": ["Nothing new"], "archived": 0, "skip": []}'::jsonb);

  -- (c) Held rows alone after a sync-filed close file nothing; after the button's, they file a retry.
  perform pg_temp.t187_archive(v_u1);
  perform pg_temp.t187_archive(v_u2);
  v_r := pg_temp.t187_request();
  if pg_temp.t187_close(v_r, 'done', '{"lines": ["1 answer applied"], "archived": 1, "skip": []}'::jsonb) is not null then
    raise exception 'FAIL 17: held rows alone after a sync-filed close filed a follow-up';
  end if;
  v_r := pg_temp.t187_request('{}'::jsonb);
  v_follow := pg_temp.t187_close(v_r, 'done', '{"lines": ["1 answer applied"], "archived": 1, "skip": []}'::jsonb);
  if v_follow is null
     or (select params from agent_requests where id = v_follow)
        is distinct from jsonb_build_object('trigger', 'followup', 'after', v_r, 'skip', '[]'::jsonb, 'retry_held', true) then
    raise exception 'FAIL 17: held rows alone after the button''s close filed % (expected a retry follow-up)', v_follow;
  end if;
  update agent_requests set state = 'cancelled' where id = v_follow;

  -- (d) A retry follow-up does not loop: nothing archived, no follow-up.
  v_r := pg_temp.t187_request('{"trigger": "followup", "after": 1, "skip": [], "retry_held": true}'::jsonb);
  if pg_temp.t187_close(v_r, 'done', '{"lines": ["Nothing new"], "archived": 0, "skip": []}'::jsonb) is not null then
    raise exception 'FAIL 17: a retry follow-up that archived nothing filed a follow-up';
  end if;
  -- And a retry_held that is not the JSON boolean true is not a retry request.
  v_r := pg_temp.t187_request('{"trigger": "followup", "after": 1, "skip": [], "retry_held": "true"}'::jsonb);
  if pg_temp.t187_close(v_r, 'done', '{"lines": ["1 answer applied"], "archived": 1, "skip": []}'::jsonb) is not null then
    raise exception 'FAIL 17: retry_held as text was read as a retry request';
  end if;
end $$;

-- =============================================================================================
-- 19. A done close writes no hold (a new hold is a failed close's alone)
-- =============================================================================================
do $$
declare
  v_n    bigint := pg_temp.t187_item('test187:n');
  v_r    bigint := pg_temp.t187_request();
begin
  insert into _t187 values ('n', v_n);
  perform pg_temp.t187_close(v_r, 'done', jsonb_build_object(
    'lines', jsonb_build_array('Nothing new'), 'archived', 0, 'skip', jsonb_build_array(v_n),
    'skip_seen', jsonb_build_array(pg_temp.t187_seen(v_n))));
  if exists (select 1 from inbox_apply_holds where item_id = v_n) or v_n = any (pg_temp.t187_held()) then
    raise exception 'FAIL 19: a done close wrote a hold';
  end if;
  -- The standing hold (h1) survived that done close.
  if not (select id from _t187 where label = 'h1') = any (pg_temp.t187_held()) then
    raise exception 'FAIL 19: a done close removed a hold that stands';
  end if;
end $$;

-- =============================================================================================
-- 20. Round 3: the failed close of a retry follow-up writes no hold for an id in its own skip
-- =============================================================================================
select pg_temp.t187_archive_notices();
update attention_items
   set state = 'archived', archived_at = now(), archived_by = 'phase23_187 setup',
       decision = '{"change": "test setup"}'::jsonb
 where state in ('resolved', 'dismissed');

do $$
declare
  v_a bigint := pg_temp.t187_item('test187:ra');
  v_c bigint := pg_temp.t187_item('test187:rc');
  v_d bigint := pg_temp.t187_item('test187:rd');
  v_e bigint := pg_temp.t187_item('test187:re');
  v_b bigint := pg_temp.t187_item('test187:rb');
  v_r1 bigint;
  v_f  bigint;
  v_hold record;
begin
  -- (i) The button's request R1 fails on A: a hold on A at its time t1.
  v_r1 := pg_temp.t187_request('{}'::jsonb);
  perform pg_temp.t187_close(v_r1, 'failed', pg_temp.t187_skip_result(array[v_a], jsonb_build_array(pg_temp.t187_seen(v_a))));
  if pg_temp.t187_held() <> array[v_a] then
    raise exception 'FAIL 20 (setup): A is not held: %', pg_temp.t187_held();
  end if;
  -- He answers A again (t2). The retry follow-up is handed skip = [A]; it does not try A, fails on
  -- C, and the worker reports both ids with their present times.
  perform pg_temp.t187_reanswer(v_a);
  v_f := pg_temp.t187_request(jsonb_build_object('trigger', 'followup', 'after', v_r1,
                                                  'skip', jsonb_build_array(v_a), 'retry_held', true));
  if pg_temp.t187_prepare(v_f)->'held' is distinct from jsonb_build_array(v_a) then
    raise exception 'FAIL 20 (setup): the retry follow-up was not handed [A]';
  end if;
  perform pg_temp.t187_close(v_f, 'failed', pg_temp.t187_skip_result(
    array[v_a, v_c], jsonb_build_array(pg_temp.t187_seen(v_a), pg_temp.t187_seen(v_c))));
  if not exists (select 1 from inbox_apply_holds where item_id = v_c and request_id = v_f) or not v_c = any (pg_temp.t187_held()) then
    raise exception 'FAIL 20: C, which the follow-up tried, is not held';
  end if;
  if exists (select 1 from inbox_apply_holds where item_id = v_a) or v_a = any (pg_temp.t187_held()) then
    raise exception 'FAIL 20: A, answered again and never tried by the follow-up, was held on its new time';
  end if;
  -- A stays in the skip, so the notice stays open.
  if pg_temp.t187_open() <> '1/0' then
    raise exception 'FAIL 20: the notice is %, expected 1/0', pg_temp.t187_open();
  end if;

  -- (ii) A hand-written retry follow-up over two waiting, unheld ids, closed failed with both in its
  -- skip and skip_seen: neither is held.
  v_f := pg_temp.t187_request(jsonb_build_object('trigger', 'followup', 'after', 1,
                                                  'skip', jsonb_build_array(v_d, v_e), 'retry_held', true));
  perform pg_temp.t187_close(v_f, 'failed', pg_temp.t187_skip_result(
    array[v_d, v_e], jsonb_build_array(pg_temp.t187_seen(v_d), pg_temp.t187_seen(v_e))));
  if exists (select 1 from inbox_apply_holds where item_id in (v_d, v_e)) or v_d = any (pg_temp.t187_held()) or v_e = any (pg_temp.t187_held()) then
    raise exception 'FAIL 20: a hand-written retry follow-up made ids held';
  end if;
  -- The same request with retry_held as the text "true" is an ordinary request: the same close holds them.
  v_f := pg_temp.t187_request(jsonb_build_object('trigger', 'followup', 'after', 1,
                                                  'skip', jsonb_build_array(v_d), 'retry_held', 'true'));
  perform pg_temp.t187_close(v_f, 'failed', pg_temp.t187_skip_result(array[v_d], jsonb_build_array(pg_temp.t187_seen(v_d))));
  if not v_d = any (pg_temp.t187_held()) then
    raise exception 'FAIL 20: retry_held as text was read as a retry request (D was not held by an ordinary failed close)';
  end if;

  -- (iii) B was held by a button request and was not answered again: the follow-up's failed close
  -- leaves that hold exactly as it was.
  v_r1 := pg_temp.t187_request('{}'::jsonb);
  perform pg_temp.t187_close(v_r1, 'failed', pg_temp.t187_skip_result(array[v_b], jsonb_build_array(pg_temp.t187_seen(v_b))));
  select * into v_hold from inbox_apply_holds where item_id = v_b;
  v_f := pg_temp.t187_request(jsonb_build_object('trigger', 'followup', 'after', v_r1,
                                                  'skip', jsonb_build_array(v_b), 'retry_held', true));
  perform pg_temp.t187_close(v_f, 'failed', pg_temp.t187_skip_result(array[v_b], jsonb_build_array(pg_temp.t187_seen(v_b))));
  if (select request_id from inbox_apply_holds where item_id = v_b) is distinct from v_r1
     or (select resolved_at from inbox_apply_holds where item_id = v_b) is distinct from v_hold.resolved_at
     or not v_b = any (pg_temp.t187_held()) then
    raise exception 'FAIL 20: the hold that stood for B was changed or lost by the follow-up''s failed close';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase23_187_held_answers_b: PASS' as result, current_user as ran_as;

rollback;
