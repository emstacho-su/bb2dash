-- bb2dash :: db/tests/phase21_141_workspace_realtime.sql
-- Phase 21 (docs/planning/sprint-2/briefs/102_PHASE21_workspace.md), task 3 (P-87). Worker W-63.
-- Tests migration 141: the receive-only Realtime policy on `realtime.messages`.
--
-- TWO LABELLED FORMS. A partition of `realtime.messages` exists only for a few days after a client
-- last joined a channel (the Realtime server makes one table per UTC day and drops those older
-- than 72 hours), and with no partition a send stores nothing. So:
--
--   * the policy half always runs: exactly one policy on `realtime.messages`,
--     `workspace_owner_receive`, for SELECT to `authenticated`, naming `app_owner()`,
--     `extension = 'broadcast'` and `realtime.topic()`; no INSERT, UPDATE, DELETE or ALL policy;
--   * when a partition covers now(), the send-and-receive half runs too, and the last row reads
--     `phase21_141 send and receive: PASS`;
--   * when none does, the last row reads `phase21_141 policy only (no partition today): PASS`.
--
-- A run that ends on the policy-only row has NOT proven the send-and-receive half. The Runner
-- prints only `PASS  <file>`, never this last row, so what shows which form ran is the partition
-- test below.
--
-- THE PARTITION TEST, as one standalone select. It is the expression section 0 stores and section
-- 2 branches on, character for character. Run exactly this through `execute_sql` immediately
-- before the Runner; true means the Runner's PASS is the send-and-receive form:
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
-- It reads the catalogs by name (`pg_inherits`, `pg_class`, `pg_namespace`) and never through
-- `'realtime.messages'::regclass`: `db_test_runner` has no USAGE on schema `realtime` and gets
-- none. `localtimestamp` is what a sent row's `inserted_at` (default `now()`, a timestamp without
-- time zone) receives in this session, so the test asks whether the row a send would write has a
-- partition to land in.
--
-- HOW THE SEND-AND-RECEIVE HALF READS. `realtime.messages` is read only under `set local role
-- authenticated` or `anon`, with `realtime.topic` set explicitly before each read (a send leaves it
-- set to the send's topic for the rest of the transaction). Only `topic`, `extension` and `payload`
-- of a stored row are asserted, never the table's column list: Realtime's own schema is moving.
-- That half needs migration 142 (`workspace_stream` and the role `workspace_runner`); a run made
-- between the first channel join and 142's apply fails and is not a verdict. Before it claims, it
-- cancels every other queued or claimed request inside this transaction, because on prod a real
-- question can sit queued.
--
-- AN `execute_sql` DRY RUN of this unit adds, inside its own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
-- because `postgres` cannot `set role` into a runner role otherwise (the creator's automatic grant
-- carries neither option).
--
-- RUN IT: `node scripts/db-test.mjs --only phase21_141_workspace_realtime.sql`. A failing assertion
-- raises. NOTHING IS COMMITTED: the file opens its own transaction and its last statement is
-- `rollback`.

begin;

-- =============================================================================================
-- 0. The partition test, evaluated once
-- =============================================================================================
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
-- 1. The policy half (always runs)
-- =============================================================================================
do $$
declare
  v_got  text;
  v_qual text;
  v_fail text[] := '{}';
begin
  select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+') || ':'
                    || p.permissive, ', ' order by p.policyname collate "C")
    into v_got
    from pg_policies p
   where p.schemaname = 'realtime' and p.tablename = 'messages';
  if v_got is null then
    raise exception 'FAIL phase21_141: migration 141 is not applied (realtime.messages has no policy)';
  end if;
  -- Exactly one, and it only lets the owner receive: no INSERT, UPDATE, DELETE or ALL policy.
  if v_got <> 'workspace_owner_receive:SELECT:authenticated:PERMISSIVE' then
    raise exception 'FAIL phase21_141: the policies on realtime.messages are [%], expected exactly workspace_owner_receive for SELECT to authenticated', v_got;
  end if;

  select p.qual into v_qual
    from pg_policies p
   where p.schemaname = 'realtime' and p.tablename = 'messages'
     and p.policyname = 'workspace_owner_receive';
  if position('( SELECT auth.uid() AS uid)' in v_qual) = 0 then
    v_fail := v_fail || 'it does not read auth.uid() once, in a scalar subquery'::text;
  end if;
  if position('app_owner()' in v_qual) = 0 then
    v_fail := v_fail || 'it does not name app_owner()'::text;
  end if;
  if position('extension = ''broadcast''' in v_qual) = 0 then
    v_fail := v_fail || 'it does not require extension = broadcast'::text;
  end if;
  if position('topic()' in v_qual) = 0 or position('''workspace:%''' in v_qual) = 0 then
    v_fail := v_fail || 'it does not require realtime.topic() like workspace:%'::text;
  end if;
  if not exists (select 1
                   from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'realtime' and c.relname = 'messages' and c.relrowsecurity) then
    v_fail := v_fail || 'row security is off on realtime.messages'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase21_141 (workspace_owner_receive): %; its qual is %',
      array_to_string(v_fail, '; '), v_qual;
  end if;
end $$;

-- =============================================================================================
-- 2. The send-and-receive half (only when a partition covers now())
-- =============================================================================================
do $$
declare
  v_owner uuid := app_owner();
  v_out   jsonb;
  v_conv  uuid;
  v_req   bigint;
  v_msg   uuid;
  v_topic text;
  v_claim record;
  v_ok    boolean;
  v_n     integer;
begin
  if current_setting('w63.partition_covers_now') <> 'true' then
    return;   -- the policy-only form: with no partition a send stores nothing, so nothing to read
  end if;

  if to_regprocedure('public.workspace_stream(bigint, integer, text)') is null
     or not exists (select 1 from pg_roles where rolname = 'workspace_runner') then
    raise exception 'FAIL phase21_141: a partition of realtime.messages covers now(), so the send-and-receive half runs, and it needs migration 142 (workspace_stream and the role workspace_runner), which is not applied';
  end if;
  if v_owner is null then
    raise exception 'FAIL phase21_141: app_owner() returned null, so the owner cannot be simulated';
  end if;

  -- Setup: no other open request, so the claim below takes this unit's.
  update workspace_requests
     set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');

  -- The owner asks; the runner claims and streams one delta.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;
  v_out := workspace_ask(null, 'phase21_141 send and receive');
  reset role;
  v_conv  := (v_out->>'conversation_id')::uuid;
  v_req   := (v_out->>'request_id')::bigint;
  v_topic := 'workspace:' || v_conv::text;

  set local role workspace_runner;
  select c.request_id, c.conversation_id into v_claim from workspace_claim('phase21_141') c;
  reset role;
  if v_claim.request_id is distinct from v_req or v_claim.conversation_id is distinct from v_conv then
    raise exception 'FAIL 2: workspace_claim returned request %, expected this unit''s %',
      v_claim.request_id, v_req;
  end if;

  set local role workspace_runner;
  v_ok := workspace_stream(v_req, 1, 'phase21_141 delta one');
  reset role;
  if v_ok is not true then
    raise exception 'FAIL 2: workspace_stream on a claimed request returned %, expected true', v_ok;
  end if;

  -- (a) The owner, with realtime.topic set to the topic, reads the delta.
  perform set_config('realtime.topic', v_topic, true);
  set local role authenticated;
  select count(*) into v_n
    from realtime.messages m
   where m.topic = v_topic and m.extension = 'broadcast'
     and m.payload->>'request_id' = v_req::text
     and m.payload->>'seq' = '1'
     and m.payload->>'delta' = 'phase21_141 delta one';
  reset role;
  if v_n <> 1 then
    raise exception 'FAIL 2a: the owner reads % stored delta row(s) on %, expected 1', v_n, v_topic;
  end if;

  -- (b) A stranger uid reads nothing on the same topic.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  perform set_config('realtime.topic', v_topic, true);
  set local role authenticated;
  select count(*) into v_n from realtime.messages m where m.topic = v_topic;
  reset role;
  if v_n <> 0 then
    raise exception 'FAIL 2b: a stranger uid reads % row(s) on %', v_n, v_topic;
  end if;

  -- (c) The owner with a topic outside workspace:% reads nothing at all.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('realtime.topic', 'other:x', true);
  set local role authenticated;
  select count(*) into v_n from realtime.messages m;
  reset role;
  if v_n <> 0 then
    raise exception 'FAIL 2c: with realtime.topic = other:x the owner reads % row(s)', v_n;
  end if;

  -- (d) anon reads nothing.
  perform set_config('realtime.topic', v_topic, true);
  set local role anon;
  select count(*) into v_n from realtime.messages m where m.topic = v_topic;
  reset role;
  if v_n <> 0 then
    raise exception 'FAIL 2d: anon reads % row(s) on %', v_n, v_topic;
  end if;

  -- (e) Clients only receive: a send made as authenticated stores nothing (no policy lets a client
  --     insert; realtime.send turns the refusal into a warning).
  set local role authenticated;
  perform realtime.send(jsonb_build_object('marker', 'phase21_141 client send'), 'delta', v_topic, true);
  reset role;
  perform set_config('realtime.topic', v_topic, true);
  set local role authenticated;
  select count(*) into v_n
    from realtime.messages m
   where m.topic = v_topic and m.payload->>'marker' = 'phase21_141 client send';
  reset role;
  if v_n <> 0 then
    raise exception 'FAIL 2e: a send made as authenticated stored % row(s)', v_n;
  end if;

  -- (f) The other event of the transport: finish sends done {request_id, message_id, state}.
  set local role workspace_runner;
  v_msg := workspace_begin(v_req, 'low', 'claude-cli', 'haiku');
  perform workspace_finish(v_req, 'done', 'phase21_141 answer', '[]'::jsonb, null, null, null, null, null);
  reset role;
  perform set_config('realtime.topic', v_topic, true);
  set local role authenticated;
  select count(*) into v_n
    from realtime.messages m
   where m.topic = v_topic and m.extension = 'broadcast'
     and m.payload->>'request_id' = v_req::text
     and m.payload->>'message_id' = v_msg::text
     and m.payload->>'state' = 'done';
  reset role;
  if v_n <> 1 then
    raise exception 'FAIL 2f: the owner reads % stored done row(s) on %, expected 1', v_n, v_topic;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('w63.form_141', 'send and receive', true);
end $$;

-- =============================================================================================
-- Pass, in the form that ran
-- =============================================================================================
select case when current_setting('w63.form_141', true) = 'send and receive'
            then 'phase21_141 send and receive: PASS'
            else 'phase21_141 policy only (no partition today): PASS' end      as result,
       current_setting('w63.partition_covers_now')                             as partition_covers_now,
       (select count(*) from pg_policies p
         where p.schemaname = 'realtime' and p.tablename = 'messages')         as realtime_policies;

rollback;
