-- bb2dash :: db/tests/phase23_186_notices.sql
-- Phase 23 (Inbox auto-apply), the review of 185 (2026-10-07). Tests migration 186, acting as the role:
--
--   0. installed: the two function bodies, still SECURITY DEFINER and the role's alone
--   1. inbox_apply_archive refuses a decision that carries closed_itself, and takes the same one without
--   2. the sign-in notice closes on a close that proves the sign-in, and on no other
--   3. the failure notice stays while an answer a failed run could not apply still waits, and
--      closes on the first done close after that
--
-- Every call is made under `set local role inbox_apply_runner` (181 grants db_test_runner the
-- role with inherit false). RUN IT: `node scripts/db-test.mjs --only phase23_186_notices.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

create temp table _t186 (label text primary key, id bigint) on commit drop;
grant all on _t186 to inbox_apply_runner;

-- One claimed request of the worker's at a time (183): each close below needs a fresh one.
create function pg_temp.t186_request() returns bigint language sql as $$
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('inbox_feedback', 'all', 'claimed', now(), 'inbox-apply-runner', 1, 'phase23_186')
  returning id
$$;

-- Open notices of each kind, as "failed/login".
create function pg_temp.t186_open() returns text language sql as $$
  select count(*) filter (where ref = 'inbox-apply-failed') || '/' ||
         count(*) filter (where ref = 'apply-login-required')
    from attention_items
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
  if position('c_signed_in' in (select prosrc from pg_proc
                                 where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_186: migration 186 is not applied (inbox_apply_close is not its body)';
  end if;
  if position('closed_itself' in (select prosrc from pg_proc
                                   where oid = 'public.inbox_apply_archive(bigint, bigint, jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_186: migration 186 is not applied (inbox_apply_archive is still 181''s body)';
  end if;
  foreach f in array array['public.inbox_apply_close(bigint, text, jsonb)',
                           'public.inbox_apply_archive(bigint, bigint, jsonb)'] loop
    select p.prosecdef, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg
      into r from pg_proc p where p.oid = f::regprocedure;
    if not r.prosecdef or r.owner <> 'postgres' or not r.cfg @> array['search_path=public, pg_temp'] then
      raise exception 'FAIL phase23_186 (shape): % lost SECURITY DEFINER, its owner or its search_path', f;
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
       or not has_function_privilege('inbox_apply_runner', f, 'execute') then
      raise exception 'FAIL phase23_186 (shape): % is not executable by inbox_apply_runner alone', f;
    end if;
  end loop;
end $$;

-- =============================================================================================
-- Setup (not an assertion): no real open inbox_feedback request, no real answered row, no real
-- open notice and no real failed request's skip list is in the way. Inside this transaction only.
-- =============================================================================================
update agent_requests set state = 'cancelled'
 where kind = 'inbox_feedback' and state in ('queued', 'claimed');

update agent_requests set claimed_by = 'phase23_186 setup'
 where kind = 'inbox_feedback' and claimed_by = 'inbox-apply-runner' and state in ('done', 'failed');

update attention_items
   set state = 'archived', archived_at = now(), archived_by = 'phase23_186 setup',
       decision = '{"change": "test setup"}'::jsonb
 where state in ('resolved', 'dismissed')
    or (state = 'open' and ref in ('inbox-apply-failed', 'apply-login-required'));

do $$
declare v_id bigint;
begin
  -- X: an answer a run will fail to apply. Y: an answer given later, that nothing has tried.
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test186:x', '186 X', 'resolved', now() - interval '1 hour',
          '{"value":"yes","value_type":"text"}')
  returning id into v_id;
  insert into _t186 values ('x', v_id);
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test186:y', '186 Y', 'resolved', now() - interval '1 hour',
          '{"value":"yes","value_type":"text"}')
  returning id into v_id;
  insert into _t186 values ('y', v_id);
  -- Z: archived in section 1.
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test186:z', '186 Z', 'resolved', now() - interval '1 hour',
          '{"value":"yes","value_type":"text"}')
  returning id into v_id;
  insert into _t186 values ('z', v_id);
end $$;

-- =============================================================================================
-- 1. The archive refuses closed_itself
-- =============================================================================================
do $$
declare
  v_z bigint := (select id from _t186 where label = 'z');
  v_r bigint := pg_temp.t186_request();
  v_decision jsonb;
  v_case jsonb;
  v_ok boolean;
begin
  v_decision := jsonb_build_object('schema', 'inbox-decision/1', 'item', v_z, 'request', v_r, 'mode', 'unattended',
                                   'bucket', 'applied_by_transform', 'change', 'recorded only', 'rule', 'test');
  -- True, false and null alike: the key is the transform's, not a value to get right.
  foreach v_case in array array['true'::jsonb, 'false'::jsonb, 'null'::jsonb, '"true"'::jsonb] loop
    begin
      set local role inbox_apply_runner;
      perform inbox_apply_archive(v_r, v_z, v_decision || jsonb_build_object('closed_itself', v_case));
      reset role;
      raise exception 'FAIL 1: a decision with closed_itself % was archived', v_case;
    exception when sqlstate '22023' then
      reset role;
    end;
  end loop;
  if (select state from attention_items where id = v_z) <> 'resolved' then
    raise exception 'FAIL 1: a refused archive changed the item';
  end if;

  set local role inbox_apply_runner;
  v_ok := inbox_apply_archive(v_r, v_z, v_decision);
  reset role;
  if not v_ok or (select state from attention_items where id = v_z) <> 'archived'
     or (select decision ? 'closed_itself' from attention_items where id = v_z) then
    raise exception 'FAIL 1: the same decision without closed_itself was not archived as given';
  end if;

  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'done', '{"lines": ["1 recorded only"], "archived": 0, "skip": []}'::jsonb);
  reset role;
end $$;

-- =============================================================================================
-- 2. The sign-in notice
-- =============================================================================================
do $$
declare
  v_r bigint;
  v_case record;
begin
  -- Raised by a run whose sign-in had expired, though it "started".
  v_r := pg_temp.t186_request();
  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'failed', '{"lines": [], "error": "sign_in_expired", "archived": 0, "skip": [], "claude": {"started": true}}'::jsonb);
  reset role;
  if pg_temp.t186_open() <> '0/1' then
    raise exception 'FAIL 2: an expired sign-in left notices %, expected 0/1 (failed/login)', pg_temp.t186_open();
  end if;

  -- Closes that prove nothing about the sign-in leave it open. (The failed ones raise the other
  -- notice; only the sign-in one is read here.)
  for v_case in
    select * from (values
      ('done',   '{"lines": ["Nothing to apply"], "archived": 0, "skip": [], "claude": {"started": false}}'::jsonb),
      ('done',   '{"lines": ["Nothing to apply"], "archived": 0, "skip": []}'::jsonb),
      ('failed', '{"lines": [], "error": "cli_error", "archived": 0, "skip": [], "claude": {"started": true}}'::jsonb),
      ('failed', '{"lines": [], "error": "interrupted", "archived": 0, "skip": [], "claude": {"started": true}}'::jsonb),
      ('failed', '{"lines": [], "error": "daily_cap", "archived": 0, "skip": [], "claude": {"started": false}}'::jsonb),
      ('failed', '{"lines": [], "error": "not_applied", "archived": 0, "skip": [], "claude": {"started": false}}'::jsonb)
    ) t(state, result)
  loop
    v_r := pg_temp.t186_request();
    set local role inbox_apply_runner;
    perform inbox_apply_close(v_r, v_case.state, v_case.result);
    reset role;
    if split_part(pg_temp.t186_open(), '/', 2) <> '1' then
      raise exception 'FAIL 2: a % close with % closed the sign-in notice', v_case.state, v_case.result;
    end if;
  end loop;

  -- A run that started Claude and could not apply one answer: failed, and the sign-in worked.
  v_r := pg_temp.t186_request();
  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'failed', '{"lines": [], "error": "not_applied", "archived": 0, "skip": [], "claude": {"started": true}}'::jsonb);
  reset role;
  if split_part(pg_temp.t186_open(), '/', 2) <> '0' then
    raise exception 'FAIL 2: a run that started Claude and closed failed (not_applied) left the sign-in notice open';
  end if;
  if not exists (select 1 from attention_items
                  where ref = 'apply-login-required' and state = 'archived' and archived_by = 'inbox-apply-runner'
                    and archived_at = now() and decision->>'closed_itself' = 'true'
                    and decision->>'trigger' = 'inbox_apply_close') then
    raise exception 'FAIL 2: the sign-in notice was not archived as closed_itself by the close';
  end if;

  -- And a done run that started Claude closes one raised again.
  v_r := pg_temp.t186_request();
  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'failed', '{"lines": [], "error": "sign_in_expired", "archived": 0, "skip": []}'::jsonb);
  reset role;
  v_r := pg_temp.t186_request();
  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'done', '{"lines": ["1 answer applied"], "archived": 0, "skip": [], "claude": {"started": true}}'::jsonb);
  reset role;
  if split_part(pg_temp.t186_open(), '/', 2) <> '0' then
    raise exception 'FAIL 2: a done run that started Claude left the sign-in notice open';
  end if;
end $$;

-- =============================================================================================
-- 3. The failure notice
-- =============================================================================================
-- Section 2's failed closes are behind us: their notice is set aside, and so are they.
update attention_items
   set state = 'archived', archived_at = now(), archived_by = 'phase23_186 setup',
       decision = '{"change": "test setup"}'::jsonb
 where state = 'open' and ref = 'inbox-apply-failed';
update agent_requests set claimed_by = 'phase23_186 setup'
 where kind = 'inbox_feedback' and claimed_by = 'inbox-apply-runner' and state in ('done', 'failed');

do $$
declare
  v_x bigint := (select id from _t186 where label = 'x');
  v_y bigint := (select id from _t186 where label = 'y');
  v_r bigint;
  v_follow bigint;
  v_seen_at timestamptz;
begin
  -- (a) A run could not apply X.
  v_r := pg_temp.t186_request();
  select q.resolved_at into v_seen_at from v_inbox_queue q where q.id = v_x;
  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'failed', jsonb_build_object(
    'lines', jsonb_build_array('1 could not be applied'), 'error', 'not_applied', 'archived', 0,
    'skip', jsonb_build_array(v_x), 'claude', jsonb_build_object('started', true),
    -- 187: since the hold is a stored fact written from skip_seen (the time the run was handed for
    -- each skipped id), this failed close hands it back as the worker does. 186's close ignores the key.
    'skip_seen', jsonb_build_array(jsonb_build_object('id', v_x, 'resolved_at', v_seen_at))));
  reset role;
  if pg_temp.t186_open() <> '1/0' then
    raise exception 'FAIL 3a: a failed close left notices %, expected 1/0 (failed/login)', pg_temp.t186_open();
  end if;

  -- (b) The follow-up carries X in its skip and finishes: X still waits, the notice stays. This
  --     is the close that lost the notice on the first live run (request 2414).
  v_r := pg_temp.t186_request();
  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'done', jsonb_build_object(
    'lines', jsonb_build_array('2 recorded only'), 'archived', 0, 'skip', jsonb_build_array(v_x),
    'claude', jsonb_build_object('started', true)));
  reset role;
  if pg_temp.t186_open() <> '1/0' then
    raise exception 'FAIL 3b: a done follow-up that skipped the unapplied answer left notices %, expected 1/0', pg_temp.t186_open();
  end if;

  -- (c) A request a sync files knows no skip list. It finishes without touching X (the day's
  --     batch was full of other rows): the failed run's own skip list still holds the notice (since 187 as a stored hold, written by that close from skip_seen).
  v_r := pg_temp.t186_request();
  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'done', '{"lines": ["6 recorded only"], "archived": 0, "skip": []}'::jsonb);
  reset role;
  if pg_temp.t186_open() <> '1/0' then
    raise exception 'FAIL 3c: a done close with no skip list of its own closed the notice while the unapplied answer waited (%)', pg_temp.t186_open();
  end if;

  -- (d) X leaves the queue (applied by a later run, or taken back). Y, which no run has failed
  --     on, still waits: the notice is about X alone, so it closes.
  update attention_items
     set state = 'archived', archived_at = now(), archived_by = 'phase23_186 setup',
         decision = '{"change": "test setup"}'::jsonb
   where id = v_x;
  v_r := pg_temp.t186_request();
  set local role inbox_apply_runner;
  v_follow := inbox_apply_close(v_r, 'done', '{"lines": ["Nothing to apply"], "archived": 0, "skip": []}'::jsonb);
  reset role;
  if pg_temp.t186_open() <> '0/0' then
    raise exception 'FAIL 3d: with the unapplied answer gone and another answer waiting, notices are %, expected 0/0', pg_temp.t186_open();
  end if;
  if not exists (select 1 from v_inbox_queue where id = v_y) then
    raise exception 'FAIL 3d (setup): Y is no longer waiting, so this case tested nothing';
  end if;

  -- (e) An answer given again after the failure is a new answer: an old skip list does not hold it.
  update attention_items
     set state = 'resolved', resolved_at = now() + interval '1 minute', archived_at = null, archived_by = null, decision = null
   where id = v_x;
  v_r := pg_temp.t186_request();
  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'failed', '{"lines": [], "error": "timed_out", "archived": 0, "skip": []}'::jsonb);
  reset role;
  v_r := pg_temp.t186_request();
  set local role inbox_apply_runner;
  perform inbox_apply_close(v_r, 'done', '{"lines": ["Nothing to apply"], "archived": 0, "skip": []}'::jsonb);
  reset role;
  if pg_temp.t186_open() <> '0/0' then
    raise exception 'FAIL 3e: an answer given again after the failed run still held the notice (%)', pg_temp.t186_open();
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase23_186_notices: PASS' as result, current_user as ran_as;

rollback;
