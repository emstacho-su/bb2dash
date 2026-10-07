-- bb2dash :: db/tests/phase23_180_inbox_apply_trigger.sql
-- Phase 23 (Inbox auto-apply; DECISIONS 2026-10-07). Tests migration 180:
--
--   0. installed and shaped like 091's functions; sync_runner's DEFINER set is the fourteen
--   1. refusals that return null and insert nothing: a null id, a missing id, a sync that failed,
--      a sync another claimant closed, a request that is not a sync
--   2. an empty answered queue files nothing
--   3. a non-empty queue files one queued inbox_feedback request with params {trigger, after}
--   4. a second call returns the open request and files no second one; a claimed one counts as open
--   5. anon, authenticated and service_role cannot run it
--
-- Every call is made under `set local role sync_runner` (094). RUN IT:
-- `node scripts/db-test.mjs --only phase23_180_inbox_apply_trigger.sql`. NOTHING IS COMMITTED.

begin;

create temp table _t180 (label text primary key, id bigint) on commit drop;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  r      record;
  c_fn   constant text := 'public.sync_request_inbox_apply(bigint)';
begin
  if to_regprocedure(c_fn) is null then
    raise exception 'FAIL phase23_180: migration 180 is not applied (% is missing)', c_fn;
  end if;

  select p.prosecdef, l.lanname, pg_get_userbyid(p.proowner) as owner,
         coalesce(p.proconfig, '{}') as cfg, obj_description(p.oid, 'pg_proc') as note
    into r
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = c_fn::regprocedure;
  if not r.prosecdef then v_fail := v_fail || 'not security definer'::text; end if;
  if r.lanname <> 'plpgsql' then v_fail := v_fail || 'not plpgsql'::text; end if;
  if r.owner <> 'postgres' then v_fail := v_fail || format('owned by %s', r.owner); end if;
  if not r.cfg @> array['search_path=public, pg_temp'] then
    v_fail := v_fail || 'does not pin search_path = public, pg_temp'::text;
  end if;
  if r.note is null then v_fail := v_fail || 'has no comment'::text; end if;

  if (select string_agg(p.proname, ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and has_function_privilege('sync_runner', p.oid, 'execute'))
     is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_own_claims,sync_register_run,sync_request_inbox_apply,'
     'sync_requeue_orphans,sync_run_outcome,sync_sweep_stale' then
    v_fail := v_fail || 'sync_runner does not execute exactly the fourteen'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase23_180 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Setup (not an assertion): no real open inbox_feedback request and no real answered row is in the
-- way. Both are changed inside this transaction only; the rollback restores them.
-- =============================================================================================
update agent_requests set state = 'cancelled'
 where kind = 'inbox_feedback' and state in ('queued', 'claimed');

update attention_items
   set state = 'archived', archived_at = now(), archived_by = 'phase23_180 setup',
       decision = '{"change": "test setup"}'::jsonb
 where state in ('resolved', 'dismissed');

do $$
declare v_done bigint; v_failed bigint; v_other bigint; v_transform bigint;
begin
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, note)
  values ('sync', 'all', 'done', now(), 'sync-runner', now(), 'phase23_180 done')
  returning id into v_done;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, note)
  values ('sync', 'all', 'failed', now(), 'sync-runner', now(), 'phase23_180 failed')
  returning id into v_failed;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, note)
  values ('sync', 'all', 'done', now(), 'bb-sync session', now(), 'phase23_180 other claimant')
  returning id into v_other;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, note)
  values ('transform', 'all', 'done', now(), 'sync-runner', now(), 'phase23_180 transform')
  returning id into v_transform;
  insert into _t180 values ('done', v_done), ('failed', v_failed), ('other', v_other),
                           ('transform', v_transform);
end $$;

-- =============================================================================================
-- 2. An empty answered queue files nothing (run before any answered row exists)
-- =============================================================================================
do $$
declare
  v_done bigint := (select id from _t180 where label = 'done');
  v_id   bigint;
begin
  if exists (select 1 from v_inbox_queue) then
    raise exception 'FAIL 2 (setup): v_inbox_queue is not empty';
  end if;
  set local role sync_runner;
  v_id := sync_request_inbox_apply(v_done);
  reset role;
  if v_id is not null then
    raise exception 'FAIL 2: an empty queue returned request %', v_id;
  end if;
  if exists (select 1 from agent_requests where kind = 'inbox_feedback' and state in ('queued', 'claimed')) then
    raise exception 'FAIL 2: an empty queue filed a request';
  end if;
end $$;

-- One answered row and one dismissed row: the queue is now non-empty.
insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
values ('stack_must_confirm', 'assignment', 'test180:resolved', '180 resolved', 'resolved', now(),
        '{"value":"yes","value_type":"text"}');
insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution, resolution_note)
values ('data_gap', 'bb_file', 'test180:dismissed', '180 dismissed', 'dismissed', now(),
        '{"dismissed":true}', 'not a real gap');

-- =============================================================================================
-- 1. Refusals: null, and nothing filed
-- =============================================================================================
do $$
declare
  v_case record;
  v_id   bigint;
begin
  for v_case in
    select * from (values
      ('a null id',                 null::bigint),
      ('a missing id',              -1::bigint),
      ('a sync that failed',        (select id from _t180 where label = 'failed')),
      ('another claimant''s sync',  (select id from _t180 where label = 'other')),
      ('a transform request',       (select id from _t180 where label = 'transform'))
    ) t(label, id)
  loop
    set local role sync_runner;
    v_id := sync_request_inbox_apply(v_case.id);
    reset role;
    if v_id is not null then
      raise exception 'FAIL 1: % returned request %', v_case.label, v_id;
    end if;
  end loop;
  if exists (select 1 from agent_requests where kind = 'inbox_feedback' and state in ('queued', 'claimed')) then
    raise exception 'FAIL 1: a refused call filed a request';
  end if;
end $$;

-- =============================================================================================
-- 3. A non-empty queue files one queued request
-- =============================================================================================
do $$
declare
  v_done bigint := (select id from _t180 where label = 'done');
  v_id   bigint;
  v_row  record;
begin
  set local role sync_runner;
  v_id := sync_request_inbox_apply(v_done);
  reset role;
  if v_id is null then
    raise exception 'FAIL 3: a non-empty queue filed nothing';
  end if;
  select kind, scope, state, params, claimed_at, claimed_by, note into v_row
    from agent_requests where id = v_id;
  if v_row.kind <> 'inbox_feedback' or v_row.scope <> 'all' or v_row.state <> 'queued'
     or v_row.claimed_at is not null or v_row.claimed_by is not null
     or v_row.params is distinct from jsonb_build_object('trigger', 'sync', 'after', v_done)
     or v_row.note is null then
    raise exception 'FAIL 3: the filed request reads %', row_to_json(v_row);
  end if;
  insert into _t180 values ('filed', v_id);
end $$;

-- =============================================================================================
-- 4. One open request at a time: queued, then claimed
-- =============================================================================================
do $$
declare
  v_done  bigint := (select id from _t180 where label = 'done');
  v_filed bigint := (select id from _t180 where label = 'filed');
  v_id    bigint;
begin
  set local role sync_runner;
  v_id := sync_request_inbox_apply(v_done);
  reset role;
  if v_id is distinct from v_filed then
    raise exception 'FAIL 4: a second call returned %, expected the open request %', v_id, v_filed;
  end if;

  update agent_requests set state = 'claimed', claimed_at = now(), claimed_by = 'inbox-apply-runner'
   where id = v_filed;
  set local role sync_runner;
  v_id := sync_request_inbox_apply(v_done);
  reset role;
  if v_id is distinct from v_filed then
    raise exception 'FAIL 4: with the request claimed the call returned %, expected %', v_id, v_filed;
  end if;

  if (select count(*) from agent_requests
       where kind = 'inbox_feedback' and state in ('queued', 'claimed')) <> 1 then
    raise exception 'FAIL 4: more than one inbox_feedback request is open';
  end if;

  -- Once it is closed and answers remain, the next sync files a new one.
  update agent_requests set state = 'done', finished_at = now() where id = v_filed;
  set local role sync_runner;
  v_id := sync_request_inbox_apply(v_done);
  reset role;
  if v_id is null or v_id = v_filed then
    raise exception 'FAIL 4: after the close the call returned %, expected a new request', v_id;
  end if;
end $$;

-- =============================================================================================
-- 5. Nobody else runs it
-- =============================================================================================
do $$
begin
  if has_function_privilege('anon', 'public.sync_request_inbox_apply(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_request_inbox_apply(bigint)', 'execute')
     or has_function_privilege('service_role', 'public.sync_request_inbox_apply(bigint)', 'execute') then
    raise exception 'FAIL 5: sync_request_inbox_apply is executable beyond sync_runner';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase23_180_inbox_apply_trigger: PASS' as result, current_user as ran_as;

rollback;
