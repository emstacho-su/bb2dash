-- bb2dash :: db/tests/phase14_091_close_sweep.sql
-- Phase 14 (brief 100), tasks 6, 11 and 13; split out of phase14_091_sync_runner.sql by R2 item 11.
-- Worker W-55. sync_close's refusals and the dead-letter sweep.
--
--   1. setup
--   5. sync_close refuses every other transition and a malformed report
--   7. the dead-letter sweep
--
-- Runs behind its loader, `db/tests/phase14_load_crawl_v4.sql`, which opens the transaction and lands
-- the scrubbed recorded crawl under the fixture run id 00000000-1491-4000-8000-000000000001. Every
-- function call is made under `set local role sync_runner` (094); the setup and the reads that check
-- a call's effect run as the session role. Fixture run ids are `00000000-1491-4000-8000-…`.
--
-- RUN IT: `node scripts/db-test.mjs --only phase14_091_close_sweep.sql`. A failing assertion raises; a pass ends
-- with one row reading `phase14_091_close_sweep: PASS`. NOTHING IS COMMITTED: the loader opens the
-- transaction and this file's last statement is `rollback`.


create temp table _t14 (label text primary key, id bigint, run_id uuid) on commit drop;

-- =============================================================================================
-- 1. Setup (not an assertion)
-- =============================================================================================
-- An open real sync would be the one `sync_next()` and `sync_enqueue` return; a real `done` sync
-- on today's New York date, or on the dates section 9 names, would make the login trigger queue
-- nothing. Both are changed inside this transaction only; the rollback restores them.
update agent_requests set state = 'cancelled'
 where kind = 'sync' and state in ('queued', 'claimed');

update agent_requests set state = 'failed'
 where kind = 'sync' and state = 'done'
   and ((finished_at at time zone 'America/New_York')::date
          = (now() at time zone 'America/New_York')::date
        or (finished_at >= '2026-10-30 00:00Z' and finished_at < '2026-11-04 00:00Z'));

-- =============================================================================================
-- 5a. Setup for the refusals: a request this runner already closed, and another claimant's
-- =============================================================================================
do $$
declare v_a bigint; v_o bigint;
begin
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, note)
  values ('sync', 'all', 'done', now(), 'sync-runner', now(), 'phase14_091 A (closed)')
  returning id into v_a;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, note)
  values ('sync', 'all', 'claimed', now(), 'bb-sync session', 'phase14_091 O') returning id into v_o;
  insert into _t14 values ('A', v_a, null), ('O', v_o, null);
end $$;

-- =============================================================================================
-- 5. sync_close refuses every other transition and a malformed report
-- =============================================================================================
do $$
declare
  v_a bigint := (select id from _t14 where label = 'A');
  v_o bigint := (select id from _t14 where label = 'O');
  v_q bigint;
  v_case record;
  v_raised boolean;
begin
  insert into agent_requests (kind, scope, state, note)
  values ('sync', 'all', 'queued', 'phase14_091 Q5') returning id into v_q;

  for v_case in
    select * from (values
      ('done -> done',            v_a, 'done',    '{"lines": []}'),
      ('done -> failed',          v_a, 'failed',  '{"lines": []}'),
      ('queued -> done',          v_q, 'done',    '{"lines": []}'),
      ('another claimant',        v_o, 'done',    '{"lines": []}'),
      ('state cancelled',         v_q, 'cancelled', '{"lines": []}'),
      ('no lines',                v_q, 'failed',  '{"error": "x"}'),
      ('lines not an array',      v_q, 'failed',  '{"lines": "x"}'),
      ('a line not text',         v_q, 'failed',  '{"lines": [1]}'),
      ('report not an object',    v_q, 'failed',  '["x"]'),
      ('missing request',         -1::bigint, 'failed', '{"lines": []}')
    ) t(label, id, st, rep)
  loop
    v_raised := false;
    begin
      set local role sync_runner;
      perform sync_close(v_case.id, v_case.st, v_case.rep::jsonb);
    exception when others then
      v_raised := true;
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 5: sync_close accepted %', v_case.label;
    end if;
  end loop;

  if (select state from agent_requests where id = v_q) <> 'queued'
     or (select state from agent_requests where id = v_o) <> 'claimed' then
    raise exception 'FAIL 5: a refused close changed a request';
  end if;
end $$;

-- =============================================================================================
-- 7. The dead-letter sweep
-- =============================================================================================
do $$
declare
  v_s21 bigint; v_s3 bigint; v_f21 bigint; v_s19 bigint;
  v_n int;
  v_bad text;
begin
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('sync', 'all', 'claimed', now() - interval '21 minutes', 'sync-runner', 1, 'phase14_091 S21')
  returning id into v_s21;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('sync', 'all', 'claimed', now(), 'sync-runner', 3, 'phase14_091 S3')
  returning id into v_s3;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, note)
  values ('inbox_feedback', 'all', 'claimed', now() - interval '21 minutes', 'inbox-apply', 'phase14_091 F21')
  returning id into v_f21;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('sync', 'all', 'claimed', now() - interval '19 minutes', 'sync-runner', 1, 'phase14_091 S19')
  returning id into v_s19;

  set local role sync_runner;
  v_n := sync_sweep_stale();
  reset role;
  if v_n < 3 then
    raise exception 'FAIL 7: the first sweep flagged %, expected at least this unit''s 3', v_n;
  end if;

  select string_agg(a.note, ', ') into v_bad from agent_requests a
   where a.id in (v_s21, v_s3, v_f21)
     and (a.state <> 'claimed' or a.result->>'dead_lettered_at' is null
          or (select count(*) from attention_items i
               where i.kind = 'stack_must_confirm' and i.ref = 'agent_request:' || a.id
                 and i.state = 'open' and i.entity = 'agent_request' and i.course_id is null) <> 1);
  if v_bad is not null then
    raise exception 'FAIL 7: not flagged once with state kept: %', v_bad;
  end if;
  if (select result from agent_requests where id = v_s19) is not null
     or exists (select 1 from attention_items where ref = 'agent_request:' || v_s19) then
    raise exception 'FAIL 7: the 19-minute claim was flagged';
  end if;

  set local role sync_runner;
  v_n := sync_sweep_stale();
  reset role;
  if v_n <> 0 then
    raise exception 'FAIL 7: the second sweep flagged %, expected 0', v_n;
  end if;
  if (select count(*) from attention_items
       where ref in ('agent_request:' || v_s21, 'agent_request:' || v_s3, 'agent_request:' || v_f21)) <> 3 then
    raise exception 'FAIL 7: the second sweep raised another item';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase14_091_close_sweep: PASS' as result, current_user as ran_as;

rollback;
