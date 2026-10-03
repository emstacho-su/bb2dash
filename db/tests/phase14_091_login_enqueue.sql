-- bb2dash :: db/tests/phase14_091_login_enqueue.sql
-- Phase 14 (brief 100), tasks 6, 11 and 13; split out of phase14_091_sync_runner.sql by R2 item 11.
-- Worker W-55. The login item and its self-close; sync_enqueue and the login trigger.
--
--   1. setup
--   6. the login item: raised once, closed by the login check, raised fresh after
--   9. sync_enqueue and the login trigger; sync_login_sync_due on New York dates
--
-- Runs behind its loader, `db/tests/phase14_load_crawl_v4.sql`, which opens the transaction and lands
-- the scrubbed recorded crawl under the fixture run id 00000000-1491-4000-8000-000000000001. Every
-- function call is made under `set local role sync_runner` (094); the setup and the reads that check
-- a call's effect run as the session role. Fixture run ids are `00000000-1491-4000-8000-…`.
--
-- RUN IT: `node scripts/db-test.mjs --only phase14_091_login_enqueue.sql`. A failing assertion raises; a pass ends
-- with one row reading `phase14_091_login_enqueue: PASS`. NOTHING IS COMMITTED: the loader opens the
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
-- 6. The login item: raised once, closed by the login check, raised fresh after
-- =============================================================================================
do $$
declare
  v_r1 bigint; v_r2 bigint; v_r3 bigint; v_r4 bigint;
  v_item1 bigint; v_item2 bigint; v_item3 bigint; v_item4 bigint;
  v_n int;
  v_closed int;
  v_row record;
  v_rep jsonb := '{"lines": ["login required"], "error": "login_required",
                   "files": {"pulled": 0, "not_pulled": []}, "claim_attempts": 0}';
begin
  insert into agent_requests (kind, scope, state, note) values
    ('sync', 'all', 'queued', 'phase14_091 L1') returning id into v_r1;
  insert into agent_requests (kind, scope, state, note) values
    ('sync', 'all', 'queued', 'phase14_091 L2') returning id into v_r2;

  set local role sync_runner;
  perform sync_close(v_r1, 'failed', v_rep);
  perform sync_close(v_r2, 'failed', v_rep);
  reset role;

  if (select state from agent_requests where id = v_r1) <> 'failed'
     or (select state from agent_requests where id = v_r2) <> 'failed' then
    raise exception 'FAIL 6: a login_required close did not move queued -> failed';
  end if;
  select count(*), min(id) into v_n, v_item1 from attention_items
   where kind = 'stack_must_confirm' and ref = 'sync-login-required' and state = 'open';
  if v_n <> 1 then
    raise exception 'FAIL 6: two login_required closes left % open login items, expected 1', v_n;
  end if;
  if (select question from attention_items where id = v_item1)
     <> 'Blackboard login needed — open http://127.0.0.1:6080/vnc.html and sign in with Duo' then
    raise exception 'FAIL 6: the login item''s question is not the frozen text';
  end if;

  set local role sync_runner;
  v_closed := sync_login_ok();
  reset role;
  if v_closed <> 1 then
    raise exception 'FAIL 6: sync_login_ok() returned %, expected 1', v_closed;
  end if;
  select * into v_row from attention_items where id = v_item1;
  if v_row.state <> 'archived' or v_row.archived_by <> 'sync-runner' or v_row.archived_at is null
     or v_row.decision->>'closed_itself' <> 'true'
     or v_row.decision->>'rule' <> 'login check passed'
     or v_row.decision->>'trigger' <> 'sync_login_ok'
     or not (v_row.decision ? 'sync_run_id') or v_row.decision->'sync_run_id' <> 'null'::jsonb then
    raise exception 'FAIL 6: after sync_login_ok the item reads state %, archived_by %, decision %',
      v_row.state, v_row.archived_by, v_row.decision;
  end if;

  set local role sync_runner;
  v_closed := sync_login_ok();
  reset role;
  if v_closed <> 0 then
    raise exception 'FAIL 6: a second sync_login_ok() closed %, expected 0', v_closed;
  end if;

  insert into agent_requests (kind, scope, state, note) values
    ('sync', 'all', 'queued', 'phase14_091 L3') returning id into v_r3;
  set local role sync_runner;
  perform sync_close(v_r3, 'failed', v_rep);
  reset role;
  select count(*), min(id) into v_n, v_item2 from attention_items
   where kind = 'stack_must_confirm' and ref = 'sync-login-required' and state = 'open';
  if v_n <> 1 or v_item2 = v_item1 then
    raise exception 'FAIL 6: the third login_required close left % open items (first %, now %), expected exactly one new item',
      v_n, v_item1, v_item2;
  end if;

  -- sync_login_required(): twice is one item, and a login_required close after it adds none.
  set local role sync_runner;
  perform sync_login_ok();
  v_item3 := sync_login_required();
  v_item4 := sync_login_required();
  reset role;
  if v_item3 is null or v_item3 is distinct from v_item4 then
    raise exception 'FAIL 6: sync_login_required() twice returned % and %', v_item3, v_item4;
  end if;
  if (select state from attention_items where id = v_item3) <> 'open' then
    raise exception 'FAIL 6: sync_login_required() returned an item that is not open';
  end if;

  insert into agent_requests (kind, scope, state, note) values
    ('sync', 'all', 'queued', 'phase14_091 L4') returning id into v_r4;
  set local role sync_runner;
  perform sync_close(v_r4, 'failed', v_rep);
  reset role;
  select count(*) into v_n from attention_items
   where kind = 'stack_must_confirm' and ref = 'sync-login-required' and state = 'open';
  if v_n <> 1 then
    raise exception 'FAIL 6: a login_required close after sync_login_required() left % open items', v_n;
  end if;

  -- A close that is not login_required raises nothing.
  set local role sync_runner;
  perform sync_login_ok();
  reset role;
  insert into agent_requests (kind, scope, state, note) values
    ('sync', 'all', 'queued', 'phase14_091 L5') returning id into v_r4;
  set local role sync_runner;
  perform sync_close(v_r4, 'failed', '{"lines": ["crawl threw"], "error": "crawl failed"}'::jsonb);
  reset role;
  if exists (select 1 from attention_items
              where kind = 'stack_must_confirm' and ref = 'sync-login-required' and state = 'open') then
    raise exception 'FAIL 6: a close whose error is not login_required raised the login item';
  end if;
end $$;

-- =============================================================================================
-- 9. sync_enqueue and the login trigger
-- =============================================================================================
-- Sections 3-8 left open sync rows, and section 3 closed one `done` today; the queue starts empty
-- again here, with no done sync on today's New York date.
update agent_requests set state = 'cancelled'
 where kind = 'sync' and state in ('queued', 'claimed');
update agent_requests set state = 'failed'
 where kind = 'sync' and state = 'done'
   and (finished_at at time zone 'America/New_York')::date
       = (now() at time zone 'America/New_York')::date;

do $$
declare
  v_j1 bigint; v_j2 bigint; v_l1 bigint; v_l2 bigint; v_l3 bigint; v_j3 bigint;
  v_before int;
  v_raised boolean;
  v_bad text;
  v_case record;
begin
  -- 'just' twice is one id.
  set local role sync_runner;
  v_j1 := sync_enqueue('just');
  v_j2 := sync_enqueue('just');
  reset role;
  if v_j1 is null or v_j1 is distinct from v_j2 then
    raise exception 'FAIL 9: sync_enqueue(''just'') twice returned % and %', v_j1, v_j2;
  end if;
  if (select params->>'trigger' from agent_requests where id = v_j1) is distinct from 'just'
     or (select state from agent_requests where id = v_j1) <> 'queued'
     or (select kind from agent_requests where id = v_j1) <> 'sync' then
    raise exception 'FAIL 9: the just request is not a queued sync with params.trigger just';
  end if;

  -- 'login' with one open returns that id.
  set local role sync_runner;
  v_l1 := sync_enqueue('login');
  reset role;
  if v_l1 is distinct from v_j1 then
    raise exception 'FAIL 9: sync_enqueue(''login'') with one open returned %, expected %', v_l1, v_j1;
  end if;

  -- 'login' with none done today queues a new one.
  update agent_requests set state = 'cancelled' where id = v_j1;
  set local role sync_runner;
  v_l2 := sync_enqueue('login');
  reset role;
  if v_l2 is null or v_l2 = v_j1
     or (select params->>'trigger' from agent_requests where id = v_l2) is distinct from 'login' then
    raise exception 'FAIL 9: sync_enqueue(''login'') with no sync done today returned %', v_l2;
  end if;

  -- 'login' with one done today (New York) returns null and inserts nothing.
  update agent_requests set state = 'done', claimed_at = now(), claimed_by = 'sync-runner',
                            finished_at = now()
   where id = v_l2;
  select count(*) into v_before from agent_requests where kind = 'sync';
  set local role sync_runner;
  v_l3 := sync_enqueue('login');
  reset role;
  if v_l3 is not null or (select count(*) from agent_requests where kind = 'sync') <> v_before then
    raise exception 'FAIL 9: sync_enqueue(''login'') after a done sync today returned % and inserted % row(s)',
      v_l3, (select count(*) from agent_requests where kind = 'sync') - v_before;
  end if;

  -- 'just' is Stack's own press: it still queues on a day that has a done sync.
  set local role sync_runner;
  v_j3 := sync_enqueue('just');
  reset role;
  if v_j3 is null then
    raise exception 'FAIL 9: sync_enqueue(''just'') after a done sync today queued nothing';
  end if;
  -- Out of the way of the date cases below, whatever day the suite runs on.
  update agent_requests set state = 'cancelled' where id = v_l2;

  -- 'scheduled' (dropped with 092 on 2026-10-03), an unknown word and null are refused.
  for v_case in select * from (values ('scheduled'), ('nightly'), (null)) t(trig) loop
    v_raised := false;
    begin
      set local role sync_runner;
      perform sync_enqueue(v_case.trig);
    exception when others then
      v_raised := true;
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 9: sync_enqueue(%) was accepted', coalesce(quote_literal(v_case.trig), 'null');
    end if;
  end loop;

end $$;

-- sync_login_sync_due reads the New York date, not UTC, across the 2026-11-01 fall-back. Each case
-- is one done sync finished at `fin`, then the helper at `at`, called as the test role: 094 makes
-- it the helper's one grantee besides the owner, so the instant can be fixed (sync_enqueue only
-- ever passes now()).
do $$
declare
  v_case record;
  v_id   bigint;
  v_got  boolean;
  v_bad  text[] := '{}';
begin
  for v_case in
    select * from (values
      ('2026-10-31 03:30Z'::timestamptz, '2026-10-31 12:00Z'::timestamptz, true),   -- 23:30 on the 30th (EDT)
      ('2026-10-31 13:00Z'::timestamptz, '2026-10-31 12:00Z'::timestamptz, false),  -- 09:00 on the 31st
      ('2026-11-02 04:30Z'::timestamptz, '2026-11-02 12:00Z'::timestamptz, true),   -- 23:30 on the 1st (EST)
      ('2026-11-02 05:30Z'::timestamptz, '2026-11-02 12:00Z'::timestamptz, false)   -- 00:30 on the 2nd (EST)
    ) t(fin, at, want)
  loop
    insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, note)
    values ('sync', 'all', 'done', v_case.fin, 'sync-runner', v_case.fin, 'phase14_091 due case')
    returning id into v_id;
    v_got := sync_login_sync_due(v_case.at);
    if v_got is distinct from v_case.want then
      v_bad := v_bad || format('finished %s, asked at %s: got %s, expected %s',
                               v_case.fin, v_case.at, v_got, v_case.want);
    end if;
    update agent_requests set state = 'cancelled' where id = v_id;
  end loop;

  -- A failed sync, or a done one with no finished_at, is not the day's sync.
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, note)
  values ('sync', 'all', 'failed', '2026-10-31 13:00Z', 'sync-runner', '2026-10-31 13:00Z',
          'phase14_091 due case failed') returning id into v_id;
  if sync_login_sync_due('2026-10-31 12:00Z') is not true then
    v_bad := v_bad || 'a failed sync counted as the day''s done sync'::text;
  end if;
  update agent_requests set state = 'cancelled' where id = v_id;

  if cardinality(v_bad) > 0 then
    raise exception 'FAIL 9: sync_login_sync_due: %', array_to_string(v_bad, '; ');
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase14_091_login_enqueue: PASS' as result, current_user as ran_as;

rollback;
