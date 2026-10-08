-- bb2dash :: db/tests/phase23_187_held_answers.sql
-- Phase 23 follow-ups (brief 110, Item 1; DECISIONS 2026-10-08, "Remember a skipped answer").
-- Tests migration 187, section 1: an answer the apply worker could not apply is held, and a sync
-- does not try it again.
--
--   0. installed: the hold table, inbox_apply_held_items(), the three re-created bodies
--   1. a close whose skip lists an item, with the resolved_at the run was handed, holds it
--   2. with only that item waiting, sync_request_inbox_apply files nothing; with a second, unheld
--      row it files one request
--   3. prepare returns the id under `held` for a request with a trigger, and [] for one with none
--   4. once the item is answered again it is not held
--   5. an answer given again after the claim and before the close gets no hold
--   6. a held item whose applied_at is then set, with no note, is not held, and a sync files for it
--   7. a failed request with a skip list, inserted as `authenticated` (the owner) and as the test
--      login, holds nothing
--   8. a done close keeps `inbox-apply-failed` open while an item is held, and archives it once
--      none is
--   9. the `not_applied` notice says a sync does not try the answers again, names a new answer and
--      the button, and holds no "Undo"; every other failure keeps its sentence
--  10. anon, authenticated, inbox_apply_runner and sync_runner cannot execute
--      inbox_apply_held_items(); the service role and the test login can
--  11. on the table, no privilege is held by anon, authenticated or service_role, the test login
--      holds select alone, and an insert as authenticated and as the test login is refused
--  12. a hold for the same answer is kept by a later close; a different answer replaces it
--  13. a malformed skip_seen is refused with 22023 and changes nothing
--  14. a close with no skip_seen, or with an id outside its skip, writes no hold
--  15. a close removes the hold of an item that left the queue
--  16. no follow-up is filed for a queue that holds held answers alone
--
-- Every call to a worker function is made under `set local role inbox_apply_runner` (181 grants
-- db_test_runner the role with inherit false); the sync's under `sync_runner` (094).
-- RUN IT: `node scripts/db-test.mjs --only phase23_187_held_answers.sql`.
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

-- Answered again: a new answer carries a new resolved_at.
create function pg_temp.t187_reanswer(p_id bigint) returns void language sql as $$
  update attention_items set resolved_at = resolved_at + interval '1 minute' where id = p_id
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
    raise exception 'FAIL phase23_187_held_answers: migration 187 is not applied (the hold table or inbox_apply_held_items() is missing)';
  end if;
  if position('session_link' in (select prosrc from pg_proc
                                  where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0
     or position('inbox_apply_held_items' in (select prosrc from pg_proc
                                               where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_187_held_answers: migration 187 is not applied (inbox_apply_prepare is not its body)';
  end if;
  if position('c_signed_in' in (select prosrc from pg_proc
                                 where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0
     or position('skip_seen' in (select prosrc from pg_proc
                                  where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_187_held_answers: migration 187 is not applied (inbox_apply_close is not its body)';
  end if;
  if position('inbox_apply_held_items' in (select prosrc from pg_proc
                                            where oid = 'public.sync_request_inbox_apply(bigint)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_187_held_answers: migration 187 is not applied (sync_request_inbox_apply is still 180''s body)';
  end if;

  foreach f in array array['public.inbox_apply_held_items()',
                           'public.inbox_apply_prepare(bigint)',
                           'public.inbox_apply_close(bigint, text, jsonb)',
                           'public.sync_request_inbox_apply(bigint)'] loop
    select p.prosecdef, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg
      into r from pg_proc p where p.oid = f::regprocedure;
    if not r.prosecdef or r.owner <> 'postgres' or not r.cfg @> array['search_path=public, pg_temp'] then
      raise exception 'FAIL phase23_187_held_answers (shape): % lost SECURITY DEFINER, its owner or its search_path', f;
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
-- 1. A close that lists an item with the time the run was handed holds it
-- =============================================================================================
do $$
declare
  v_x    bigint := pg_temp.t187_item('test187:x');
  v_r    bigint := pg_temp.t187_request();
  v_prep jsonb;
  v_seen jsonb;
  v_hold record;
begin
  insert into _t187 values ('x', v_x);
  if pg_temp.t187_held() <> '{}' then
    raise exception 'FAIL 1 (setup): something is held before any close: %', pg_temp.t187_held();
  end if;

  -- The run reads the queue through prepare, as the worker does, and is handed X's resolved_at.
  v_prep := pg_temp.t187_prepare(v_r);
  v_seen := (select q from jsonb_array_elements(v_prep->'queue') q where (q->>'id')::bigint = v_x);
  if v_seen is null then
    raise exception 'FAIL 1: prepare did not hand over X: %', v_prep;
  end if;

  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(
    array[v_x], jsonb_build_array(jsonb_build_object('id', v_x, 'resolved_at', v_seen->'resolved_at'))));

  if pg_temp.t187_held() <> array[v_x] then
    raise exception 'FAIL 1: after the close the held set is %, expected {%}', pg_temp.t187_held(), v_x;
  end if;
  select h.* into v_hold from inbox_apply_holds h where h.item_id = v_x;
  if v_hold.request_id is distinct from v_r
     or v_hold.resolved_at is distinct from (select resolved_at from attention_items where id = v_x)
     or v_hold.held_at is null then
    raise exception 'FAIL 1: the hold row reads %', row_to_json(v_hold);
  end if;
end $$;

-- =============================================================================================
-- 2. A queue of held answers alone files nothing; with one unheld row it files one request
-- =============================================================================================
do $$
declare
  v_x    bigint := (select id from _t187 where label = 'x');
  v_sync bigint := pg_temp.t187_sync();
  v_id   bigint;
  v_y    bigint;
  v_row  record;
begin
  v_id := pg_temp.t187_sync_request(v_sync);
  if v_id is not null then
    raise exception 'FAIL 2: a queue that holds a held answer alone returned request %', v_id;
  end if;
  if exists (select 1 from agent_requests where kind = 'inbox_feedback' and state in ('queued', 'claimed')) then
    raise exception 'FAIL 2: a queue that holds a held answer alone filed a request';
  end if;

  v_y := pg_temp.t187_item('test187:y');
  insert into _t187 values ('y', v_y);
  v_id := pg_temp.t187_sync_request(v_sync);
  if v_id is null then
    raise exception 'FAIL 2: with a second, unheld row waiting the sync filed nothing';
  end if;
  select kind, state, params into v_row from agent_requests where id = v_id;
  if v_row.kind <> 'inbox_feedback' or v_row.state <> 'queued'
     or v_row.params is distinct from jsonb_build_object('trigger', 'sync', 'after', v_sync) then
    raise exception 'FAIL 2: the filed request reads %', row_to_json(v_row);
  end if;
  if (select count(*) from agent_requests where kind = 'inbox_feedback' and state in ('queued', 'claimed')) <> 1 then
    raise exception 'FAIL 2: more than one request is open';
  end if;
  update agent_requests set state = 'cancelled' where id = v_id;
end $$;

-- =============================================================================================
-- 3. prepare: `held` for a request with a trigger, [] for one with none
-- =============================================================================================
do $$
declare
  v_x    bigint := (select id from _t187 where label = 'x');
  v_case record;
  v_r    bigint;
  v_prep jsonb;
begin
  for v_case in
    select * from (values
      ('a sync request',        '{"trigger": "sync", "after": 1}'::jsonb,    true),
      ('a follow-up request',   '{"trigger": "followup", "after": 1, "skip": []}'::jsonb, true),
      ('the fallback skill''s', '{"trigger": "skill", "after": 1}'::jsonb,   true),
      ('a button request',      '{}'::jsonb,                                  false),
      ('a trigger of null',     '{"trigger": null}'::jsonb,                   false)
    ) t(label, params, expect_held)
  loop
    v_r := pg_temp.t187_request(v_case.params);
    v_prep := pg_temp.t187_prepare(v_r);
    if not (v_prep ? 'held') or jsonb_typeof(v_prep->'held') <> 'array' then
      raise exception 'FAIL 3: prepare for % returned no held array: %', v_case.label, v_prep;
    end if;
    if v_case.expect_held and v_prep->'held' is distinct from jsonb_build_array(v_x) then
      raise exception 'FAIL 3: prepare for % returned held %, expected [%]', v_case.label, v_prep->'held', v_x;
    end if;
    if not v_case.expect_held and v_prep->'held' is distinct from '[]'::jsonb then
      raise exception 'FAIL 3: prepare for % returned held %, expected []', v_case.label, v_prep->'held';
    end if;
    -- The numbers are numbers, and the rest of what prepare sent is still there.
    if v_case.expect_held and jsonb_typeof(v_prep->'held'->0) <> 'number' then
      raise exception 'FAIL 3: held holds a % and not a number', jsonb_typeof(v_prep->'held'->0);
    end if;
    if not (v_prep ?& array['params', 'queue', 'runs_today'])
       or exists (select 1 from jsonb_array_elements(v_prep->'queue') q where not (q ? 'resolved_at')) then
      raise exception 'FAIL 3: prepare for % lost a key: %', v_case.label, v_prep;
    end if;
    perform pg_temp.t187_close(v_r, 'done', '{"lines": ["Nothing new"], "archived": 0, "skip": []}'::jsonb);
  end loop;
  -- The hold survived those closes: they asked nothing of it.
  if pg_temp.t187_held() <> array[v_x] then
    raise exception 'FAIL 3: the closes of section 3 changed the held set to %', pg_temp.t187_held();
  end if;
end $$;

-- =============================================================================================
-- 4. Answered again: not held
-- =============================================================================================
do $$
declare
  v_x    bigint := (select id from _t187 where label = 'x');
  v_sync bigint := pg_temp.t187_sync();
  v_id   bigint;
  v_r    bigint;
  v_prep jsonb;
begin
  perform pg_temp.t187_reanswer(v_x);
  if pg_temp.t187_held() <> '{}' then
    raise exception 'FAIL 4: an answer given again is still held: %', pg_temp.t187_held();
  end if;
  v_r := pg_temp.t187_request();
  v_prep := pg_temp.t187_prepare(v_r);
  if v_prep->'held' is distinct from '[]'::jsonb then
    raise exception 'FAIL 4: prepare still returns held %', v_prep->'held';
  end if;
  perform pg_temp.t187_close(v_r, 'done', '{"lines": ["Nothing new"], "archived": 0, "skip": []}'::jsonb);

  v_id := pg_temp.t187_sync_request(v_sync);
  if v_id is null then
    raise exception 'FAIL 4: with X answered again the sync filed nothing';
  end if;
  update agent_requests set state = 'cancelled' where id = v_id;
end $$;

-- =============================================================================================
-- 5. An answer given again after the claim and before the close gets no hold
-- =============================================================================================
do $$
declare
  v_x    bigint := (select id from _t187 where label = 'x');
  v_r    bigint := pg_temp.t187_request();
  v_seen jsonb;
begin
  v_seen := pg_temp.t187_seen(v_x);          -- what the run was handed
  perform pg_temp.t187_reanswer(v_x);        -- Stack answers again while the run is open
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(array[v_x], jsonb_build_array(v_seen)));
  if exists (select 1 from inbox_apply_holds where item_id = v_x) then
    raise exception 'FAIL 5: an answer given again during the run was held: %',
      (select row_to_json(h) from inbox_apply_holds h where h.item_id = v_x);
  end if;
  if pg_temp.t187_held() <> '{}' then
    raise exception 'FAIL 5: held set is %, expected none', pg_temp.t187_held();
  end if;
end $$;

-- =============================================================================================
-- 6. A held item that needs no reader is not held
-- =============================================================================================
do $$
declare
  v_x    bigint := (select id from _t187 where label = 'x');
  v_y    bigint := (select id from _t187 where label = 'y');
  v_sync bigint := pg_temp.t187_sync();
  v_r    bigint := pg_temp.t187_request();
  v_id   bigint;
begin
  -- Hold X on its current answer, and put Y aside so X is the whole queue.
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(
    array[v_x], jsonb_build_array(pg_temp.t187_seen(v_x))));
  perform pg_temp.t187_archive(v_y);
  if pg_temp.t187_held() <> array[v_x] then
    raise exception 'FAIL 6 (setup): X is not held: %', pg_temp.t187_held();
  end if;
  if pg_temp.t187_sync_request(v_sync) is not null then
    raise exception 'FAIL 6 (setup): a queue of one held answer filed a request';
  end if;

  -- The fold applied it (applied_at set) and Stack left no note: the worker records it without a run.
  update attention_items set applied_at = now() where id = v_x;
  if pg_temp.t187_held() <> '{}' then
    raise exception 'FAIL 6: a held item with applied_at and no note is still held: %', pg_temp.t187_held();
  end if;
  v_id := pg_temp.t187_sync_request(v_sync);
  if v_id is null then
    raise exception 'FAIL 6: the sync filed no request for an applied answer with no note';
  end if;
  update agent_requests set state = 'cancelled' where id = v_id;

  -- With a note it still needs a reader, so it is held again (the hold row never went away).
  update attention_items set resolution_note = 'please look at this' where id = v_x;
  if pg_temp.t187_held() <> array[v_x] then
    raise exception 'FAIL 6: a held item with applied_at and a note is not held: %', pg_temp.t187_held();
  end if;
  if pg_temp.t187_sync_request(v_sync) is not null then
    raise exception 'FAIL 6: the sync filed a request for a held answer that has a note';
  end if;
end $$;

-- =============================================================================================
-- 7. A request written by another login holds nothing
-- =============================================================================================
do $$
declare
  v_z     bigint := pg_temp.t187_item('test187:z');
  v_sync  bigint := pg_temp.t187_sync();
  v_before int := (select count(*) from inbox_apply_holds);
  v_params constant jsonb := '{"trigger": "sync", "after": 1}';
  v_result jsonb;
  v_id    bigint;
begin
  insert into _t187 values ('z', v_z);
  v_result := pg_temp.t187_skip_result(array[v_z], jsonb_build_array(pg_temp.t187_seen(v_z)));

  -- As the app's own login, with the owner's uid: it may insert a request row (038).
  perform set_config('request.jwt.claim.sub', app_owner()::text, true);
  set local role authenticated;
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at, params, result, note)
  values ('inbox_feedback', 'all', 'failed', 'inbox-apply-runner', now(), now(), v_params, v_result, 'phase23_187 as authenticated');
  reset role;

  -- As the test login, which can write the table too.
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at, params, result, note)
  values ('inbox_feedback', 'all', 'failed', 'inbox-apply-runner', now(), now(), v_params, v_result, 'phase23_187 as test login');

  if (select count(*) from agent_requests where note like 'phase23_187 as %') <> 2 then
    raise exception 'FAIL 7 (setup): the two requests were not inserted';
  end if;
  if exists (select 1 from inbox_apply_holds where item_id = v_z) or (select count(*) from inbox_apply_holds) <> v_before then
    raise exception 'FAIL 7: a request written by another login created a hold';
  end if;
  if v_z = any (pg_temp.t187_held()) then
    raise exception 'FAIL 7: an item named in a hand-written failed request is held';
  end if;
  -- And the sync still sees Z as waiting.
  v_id := pg_temp.t187_sync_request(v_sync);
  if v_id is null then
    raise exception 'FAIL 7: the hand-written requests parked an answered item: the sync filed nothing';
  end if;
  update agent_requests set state = 'cancelled' where id = v_id;
end $$;

-- =============================================================================================
-- 8. The failure notice, and the held set
-- =============================================================================================
select pg_temp.t187_archive_notices();

do $$
declare
  v_x    bigint := (select id from _t187 where label = 'x');
  v_r    bigint;
begin
  -- X is answered again and then held on the new answer by a failing run (which raises the notice).
  perform pg_temp.t187_reanswer(v_x);
  update attention_items set applied_at = null, resolution_note = null where id = v_x;
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(
    array[v_x], jsonb_build_array(pg_temp.t187_seen(v_x))));
  if pg_temp.t187_open() <> '1/0' then
    raise exception 'FAIL 8: a failed close left notices %, expected 1/0 (failed/login)', pg_temp.t187_open();
  end if;
  if pg_temp.t187_held() <> array[v_x] then
    raise exception 'FAIL 8 (setup): X is not held: %', pg_temp.t187_held();
  end if;

  -- (a) A done close that lists nothing: X is held, so the notice stays.
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'done', '{"lines": ["Nothing new"], "archived": 0, "skip": []}'::jsonb);
  if pg_temp.t187_open() <> '1/0' then
    raise exception 'FAIL 8a: a done close closed the notice while an item is held (%)', pg_temp.t187_open();
  end if;

  -- (b) Stack answers X again: it is not held, and the next done close archives the notice.
  perform pg_temp.t187_reanswer(v_x);
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'done', '{"lines": ["Nothing new"], "archived": 0, "skip": []}'::jsonb);
  if pg_temp.t187_open() <> '0/0' then
    raise exception 'FAIL 8b: with no item held the done close left notices %, expected 0/0', pg_temp.t187_open();
  end if;
  if not exists (select 1 from attention_items
                  where ref = 'inbox-apply-failed' and state = 'archived' and archived_by = 'inbox-apply-runner'
                    and decision->>'closed_itself' = 'true' and decision->>'trigger' = 'inbox_apply_close') then
    raise exception 'FAIL 8b: the notice was not archived as closed_itself by the close';
  end if;
end $$;

-- =============================================================================================
-- 9. The words of the not_applied notice
-- =============================================================================================
select pg_temp.t187_archive_notices();

do $$
declare
  v_r    bigint;
  v_text text;
begin
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(array[]::bigint[], '[]'::jsonb, 'not_applied'));
  select question into v_text from attention_items where state = 'open' and ref = 'inbox-apply-failed';
  if v_text is null then
    raise exception 'FAIL 9: a not_applied failure raised no notice';
  end if;
  if v_text not ilike '%sync does not try%' or v_text not ilike '%new answer%' or v_text not ilike '%Apply answers%' then
    raise exception 'FAIL 9: the not_applied notice reads "%"', v_text;
  end if;
  if v_text ilike '%undo%' or v_text ilike '%press Apply answers to run the rest%' then
    raise exception 'FAIL 9: the not_applied notice still names Undo or the old sentence: "%"', v_text;
  end if;

  -- Every other failure keeps 186's sentence.
  perform pg_temp.t187_archive_notices();
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', pg_temp.t187_skip_result(array[]::bigint[], '[]'::jsonb, 'cli_error'));
  select question into v_text from attention_items where state = 'open' and ref = 'inbox-apply-failed';
  if v_text is null or v_text not like '%press Apply answers to run the rest.' or v_text not like '%failed: cli_error.%' then
    raise exception 'FAIL 9: a cli_error failure no longer keeps its sentence: "%"', v_text;
  end if;

  -- And the sign-in notice is untouched.
  perform pg_temp.t187_archive_notices();
  v_r := pg_temp.t187_request();
  perform pg_temp.t187_close(v_r, 'failed', '{"lines": [], "error": "sign_in_expired", "archived": 0, "skip": []}'::jsonb);
  select question into v_text from attention_items where state = 'open' and ref = 'apply-login-required';
  if v_text is null or v_text not like '%claude setup-token%' then
    raise exception 'FAIL 9: the sign-in notice changed: "%"', v_text;
  end if;
  perform pg_temp.t187_archive_notices();
end $$;

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
  if v_h2.request_id is distinct from v_r1 or v_h2.held_at is distinct from v_h1.held_at
     or v_h2.resolved_at is distinct from v_h1.resolved_at
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

  -- Well-formed variants are taken: a null time (the row has none), and a list that is empty.
  perform pg_temp.t187_close(v_r, 'done', pg_temp.t187_skip_result(array[v_w], '[]'::jsonb));
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
-- Pass
-- =============================================================================================
select 'phase23_187_held_answers: PASS' as result, current_user as ran_as;

rollback;
