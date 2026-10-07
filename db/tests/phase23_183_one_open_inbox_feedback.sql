-- bb2dash :: db/tests/phase23_183_one_open_inbox_feedback.sql
-- Phase 23 (Inbox auto-apply; DECISIONS 2026-10-07). Tests migration 183:
--
--   0. the partial unique index is installed. UNTIL 183 IS APPLIED (at the cut-over, with the
--      Phase 23 skill) THIS UNIT FAILS HERE, on purpose: the suite says so until the day it is.
--   1. a second open inbox_feedback request is refused with 23505, queued or claimed
--   2. closed requests, and requests of another kind, are not counted
--   3. the two filing functions (180, 181) return the open request and never trip the index
--
-- RUN IT: `node scripts/db-test.mjs --only phase23_183_one_open_inbox_feedback.sql`. NOTHING IS COMMITTED.

begin;

do $$
begin
  if to_regclass('public.agent_requests_one_open_inbox_feedback') is null then
    raise exception 'FAIL phase23_183: migration 183 is not applied (it is applied at the cut-over, with the Phase 23 skill)';
  end if;
  if not exists (select 1 from pg_index x
                  where x.indexrelid = 'public.agent_requests_one_open_inbox_feedback'::regclass
                    and x.indisunique and x.indisvalid and x.indpred is not null) then
    raise exception 'FAIL 0: the index is not a valid partial unique index';
  end if;
end $$;

-- Setup (not an assertion): no real open request, answered row or sync is in the way.
update agent_requests set state = 'cancelled'
 where kind = 'inbox_feedback' and state in ('queued', 'claimed');

do $$
declare
  v_first bigint; v_sync bigint; v_id bigint; v_follow bigint;
  v_state text;
  v_raised boolean;
  v_case text;
begin
  insert into agent_requests (kind, scope, state, note)
  values ('inbox_feedback', 'all', 'queued', 'phase23_183 first') returning id into v_first;

  -- 1. A second open one, queued or claimed, is refused.
  foreach v_case in array array['queued', 'claimed'] loop
    v_raised := false;
    begin
      insert into agent_requests (kind, scope, state, note)
      values ('inbox_feedback', 'all', v_case, 'phase23_183 second');
    exception when unique_violation then
      v_raised := true;
    end;
    if not v_raised then
      raise exception 'FAIL 1: a second open inbox_feedback request (%) was accepted', v_case;
    end if;
  end loop;
  -- And so is reopening a closed one beside it.
  insert into agent_requests (kind, scope, state, finished_at, note)
  values ('inbox_feedback', 'all', 'done', now(), 'phase23_183 closed') returning id into v_id;
  v_raised := false;
  begin
    update agent_requests set state = 'queued' where id = v_id;
  exception when unique_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL 1: a closed request was reopened beside an open one';
  end if;

  -- 2. Closed requests and other kinds are not counted.
  insert into agent_requests (kind, scope, state, note)
  values ('inbox_feedback', 'all', 'failed', 'phase23_183 failed'),
         ('inbox_feedback', 'all', 'cancelled', 'phase23_183 cancelled'),
         ('transform', 'all', 'queued', 'phase23_183 transform');
  update agent_requests set state = 'cancelled' where kind = 'sync' and state in ('queued', 'claimed');
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, note)
  values ('sync', 'all', 'done', now(), 'sync-runner', now(), 'phase23_183 sync') returning id into v_sync;

  -- 3. 180's function returns the open request; it does not try a second.
  set local role sync_runner;
  v_id := sync_request_inbox_apply(v_sync);
  reset role;
  if v_id is distinct from v_first then
    raise exception 'FAIL 3: sync_request_inbox_apply returned %, expected the open request %', v_id, v_first;
  end if;

  -- 181's close files its follow-up only once the request it closes is no longer open.
  update attention_items
     set state = 'archived', archived_at = now(), archived_by = 'phase23_183 setup',
         decision = '{"change": "test setup"}'::jsonb
   where state in ('resolved', 'dismissed');
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test183:left', '183 left', 'resolved', now(), '{"value":"yes"}');
  set local role inbox_apply_runner;
  select c.id into v_id from inbox_apply_claim() c;
  v_follow := inbox_apply_close(v_first, 'done', '{"lines": ["1 answer applied"], "archived": 1}'::jsonb);
  reset role;
  if v_id is distinct from v_first or v_follow is null then
    raise exception 'FAIL 3: the claim returned % and the close filed follow-up %', v_id, v_follow;
  end if;
  if (select count(*) from agent_requests
       where kind = 'inbox_feedback' and state in ('queued', 'claimed')) <> 1 then
    raise exception 'FAIL 3: not exactly one inbox_feedback request is open after the follow-up';
  end if;
end $$;

select 'phase23_183_one_open_inbox_feedback: PASS' as result, current_user as ran_as;

rollback;
