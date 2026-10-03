-- bb2dash :: db/tests/phase19_137_sync_status.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), tasks 2, 15 and 16.
-- Worker W-53. Tests migration 137: `v_sync_status` keeps its nine columns and gains `notes`,
-- `interrupted` and `streams`.
--
--   0. installed: the twelve columns in order, their types, security_invoker, anon revoked
--   1. run state: a finished run reads `interrupted` = false; a reaped run reads `interrupted` =
--      true with `notes` ending `interrupted (reaped)`
--   2. streams: nine elements in name order, each {stream, last_seen_at, state}; with every
--      `history` stage row deleted the `history` element reads `never` with a null `last_seen_at`;
--      with one `failed` row it still reads `never`; with one `ok` row finished two days ago it
--      reads `stale`; 23 hours ago, `fresh`; finished now, `fresh`; and every element agrees with
--      `v_data_freshness`
--   3. the owner's JWT reads one row with nine streams; a stranger's reads none
--
-- The reaped run is inserted in the shape 136's terminal rule writes (`failed`, `interrupted_at`
-- set, notes ending `interrupted (reaped)`); `phase19_135_136_sync_driver.sql` proves the tick
-- writes that shape. It is stamped one second after the newest real run so the view's one row is
-- this unit's. Fixture run ids are `00000000-1953-4000-8000-0000000001…`, never a real crawl's.
--
-- Values cross the `set local role` boundary in transaction-local GUCs, which roll back with
-- everything else. RUN IT: `node scripts/db-test.mjs --only phase19_137_sync_status.sql`, or paste
-- the whole file into one `execute_sql` call. NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

-- =============================================================================================
-- 0. Installed, and shaped as the Contract freezes it
-- =============================================================================================
do $$
declare
  v_cols text; v_types text; v_fail text[] := '{}';
begin
  select string_agg(attname, ',' order by attnum),
         string_agg(format_type(atttypid, atttypmod), ',' order by attnum) filter (where attnum > 9)
    into v_cols, v_types
    from pg_attribute
   where attrelid = 'public.v_sync_status'::regclass and attnum > 0 and not attisdropped;
  if v_cols is distinct from
     'id,run_id,status,started_at,finished_at,trigger,summary,open_attention,freshness,notes,interrupted,streams' then
    raise exception 'FAIL phase19_137: migration 137 is not applied (v_sync_status columns are %)', v_cols;
  end if;
  if v_types is distinct from 'text,boolean,jsonb' then
    v_fail := v_fail || format('notes, interrupted, streams are typed %s', v_types);
  end if;
  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.v_sync_status'::regclass and o = 'security_invoker=true') then
    v_fail := v_fail || 'v_sync_status is not security_invoker'::text;
  end if;
  if has_table_privilege('anon', 'public.v_sync_status', 'select') then
    v_fail := v_fail || 'anon can select v_sync_status'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.v_sync_status', 'select')
     or not has_table_privilege('service_role', 'public.v_sync_status', 'select') then
    v_fail := v_fail || 'authenticated or service_role cannot select v_sync_status'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_137 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1. Run state: `notes` and `interrupted`
-- =============================================================================================
do $$
declare
  v_ok bigint; v_reaped bigint; v_newest timestamptz; r record; v_n int;
begin
  select greatest(now(), coalesce(max(started_at), now())) into v_newest from sync_runs;

  -- A finished run, the newest: not interrupted, no notes.
  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope, summary)
  values ('00000000-1953-4000-8000-000000000101', 'ok', v_newest + interval '1 second',
          v_newest + interval '2 seconds', 'manual', 'blackboard', 'all', '{}'::jsonb)
  returning id into v_ok;

  select count(*) into v_n from v_sync_status;
  if v_n <> 1 then
    raise exception 'FAIL v_sync_status returns % row(s), expected 1', v_n;
  end if;
  select * into r from v_sync_status;
  if r.id is distinct from v_ok or r.interrupted is not false or r.notes is not null
     or r.status is distinct from 'ok' then
    raise exception 'FAIL a finished run reads id %, status %, interrupted %, notes %',
      r.id, r.status, r.interrupted, r.notes;
  end if;

  -- A reaped run, newer still, in the shape 136's terminal rule writes.
  insert into sync_runs (run_id, status, started_at, finished_at, interrupted_at, trigger, source, scope, notes)
  values ('00000000-1953-4000-8000-000000000102', 'failed', v_newest + interval '3 seconds',
          v_newest + interval '4 seconds', v_newest + interval '4 seconds', 'manual', 'blackboard', 'all',
          'w53 fixture: died with its tab | interrupted (reaped)')
  returning id into v_reaped;

  select * into r from v_sync_status;
  if r.id is distinct from v_reaped or r.status is distinct from 'failed' then
    raise exception 'FAIL the view''s row is id % status %, expected the reaped fixture %', r.id, r.status, v_reaped;
  end if;
  if r.interrupted is not true then
    raise exception 'FAIL a reaped run reads interrupted = %, expected true', r.interrupted;
  end if;
  if right(coalesce(r.notes, ''), length('interrupted (reaped)')) <> 'interrupted (reaped)' then
    raise exception 'FAIL a reaped run''s notes read %, expected them to end "interrupted (reaped)"',
      coalesce(r.notes, '(null)');
  end if;

  perform set_config('w53.ok_run', v_ok::text, true);
end $$;

-- =============================================================================================
-- 2. Streams: R-41's per-stream read
-- =============================================================================================
do $$
declare
  v_run bigint := current_setting('w53.ok_run')::bigint;
  v_streams jsonb; v_h jsonb; v_names text; v_n int; v_at timestamptz;
begin
  -- Never synced: no history stage row at all (prod's state until the first fold after 135).
  delete from sync_stage_runs where stage = 'history';

  select streams into v_streams from v_sync_status;
  if jsonb_typeof(v_streams) is distinct from 'array' or jsonb_array_length(v_streams) <> 9 then
    raise exception 'FAIL streams is %, expected an array of 9', v_streams;
  end if;
  select string_agg(e->>'stream', ',' order by ord) into v_names
    from jsonb_array_elements(v_streams) with ordinality x(e, ord);
  if v_names is distinct from 'announcements,assignments,attempts,content,courses,files,gaps,gradebook,history' then
    raise exception 'FAIL streams are %, expected the nine expected stages in name order', v_names;
  end if;
  select count(*) into v_n from jsonb_array_elements(v_streams) e
   where not (e ? 'stream' and e ? 'last_seen_at' and e ? 'state')
      or (select count(*) from jsonb_object_keys(e)) <> 3
      or e->>'state' not in ('fresh', 'stale', 'never');
  if v_n > 0 then
    raise exception 'FAIL % stream element(s) are not {stream, last_seen_at, state}: %', v_n, v_streams;
  end if;

  select e into v_h from jsonb_array_elements(v_streams) e where e->>'stream' = 'history';
  if v_h->>'state' is distinct from 'never' or jsonb_typeof(v_h->'last_seen_at') is distinct from 'null' then
    raise exception 'FAIL with no history stage row the element reads %, expected never with a null last_seen_at', v_h;
  end if;

  -- One failed attempt: v_data_freshness now has a history row, with no fresh_as_of. Still never.
  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (v_run, 'history', 'failed', '{}'::jsonb, now(), now(), 'w53 fixture failure');
  select e into v_h from v_sync_status v, jsonb_array_elements(v.streams) e where e->>'stream' = 'history';
  if v_h->>'state' is distinct from 'never' or jsonb_typeof(v_h->'last_seen_at') is distinct from 'null' then
    raise exception 'FAIL with one failed history row the element reads %, expected never', v_h;
  end if;

  -- One ok finish two days ago: stale, and last_seen_at is that finish.
  v_at := now() - interval '2 days';
  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at)
  values (v_run, 'history', 'ok', '{}'::jsonb, v_at, v_at);
  select e into v_h from v_sync_status v, jsonb_array_elements(v.streams) e where e->>'stream' = 'history';
  if v_h->>'state' is distinct from 'stale' or (v_h->>'last_seen_at')::timestamptz is distinct from v_at then
    raise exception 'FAIL with an ok finish two days ago the element reads %, expected stale at %', v_h, v_at;
  end if;

  -- 23 hours ago is inside Phase 9's one day: fresh.
  v_at := now() - interval '23 hours';
  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at)
  values (v_run, 'history', 'ok', '{}'::jsonb, v_at, v_at);
  select e into v_h from v_sync_status v, jsonb_array_elements(v.streams) e where e->>'stream' = 'history';
  if v_h->>'state' is distinct from 'fresh' or (v_h->>'last_seen_at')::timestamptz is distinct from v_at then
    raise exception 'FAIL with an ok finish 23 hours ago the element reads %, expected fresh at %', v_h, v_at;
  end if;

  -- Finished now: fresh.
  v_at := now();
  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at)
  values (v_run, 'history', 'ok', '{}'::jsonb, v_at, v_at);
  select e into v_h from v_sync_status v, jsonb_array_elements(v.streams) e where e->>'stream' = 'history';
  if v_h->>'state' is distinct from 'fresh' or (v_h->>'last_seen_at')::timestamptz is distinct from v_at then
    raise exception 'FAIL with an ok finish now the element reads %, expected fresh at %', v_h, v_at;
  end if;

  -- Every element is v_data_freshness's answer for its stage (task 16's SQL check, in the unit).
  select count(*) into v_n
    from v_sync_status v
   cross join lateral jsonb_array_elements(v.streams) e
    left join v_data_freshness f on f.stage = e->>'stream'
   where coalesce(e->>'state', '') not in ('fresh', 'stale', 'never')
      or (e->>'state' = 'never') is distinct from (f.fresh_as_of is null)
      or (e->>'last_seen_at')::timestamptz is distinct from f.fresh_as_of;
  if v_n > 0 then
    raise exception 'FAIL % stream element(s) disagree with v_data_freshness', v_n;
  end if;
end $$;

-- =============================================================================================
-- 3. The owner reads it; a stranger does not
-- =============================================================================================
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims',
                  json_build_object('sub', public.app_owner(), 'role', 'authenticated')::text, true);
set local role authenticated;

select set_config('w53.owner_rows', (select count(*)::text from v_sync_status), true);
select set_config('w53.owner_streams', (select jsonb_array_length(streams)::text from v_sync_status), true);
select set_config('w53.owner_interrupted', (select interrupted::text from v_sync_status), true);

select set_config('request.jwt.claims',
                  json_build_object('sub', '00000000-0000-0000-0000-000000000053', 'role', 'authenticated')::text, true);
select set_config('w53.stranger_rows', (select count(*)::text from v_sync_status), true);

reset role;

do $$
begin
  if current_setting('w53.owner_rows', true) is distinct from '1'
     or current_setting('w53.owner_streams', true) is distinct from '9'
     or current_setting('w53.owner_interrupted', true) is distinct from 'true' then
    raise exception 'FAIL the owner reads % row(s), % stream(s), interrupted %; expected 1, 9, true',
      current_setting('w53.owner_rows', true), current_setting('w53.owner_streams', true),
      current_setting('w53.owner_interrupted', true);
  end if;
  if current_setting('w53.stranger_rows', true) is distinct from '0' then
    raise exception 'FAIL a stranger reads % row(s) of v_sync_status, expected 0',
      current_setting('w53.stranger_rows', true);
  end if;
end $$;

-- =============================================================================================
-- 4. Pass
-- =============================================================================================
select 'phase19_137_sync_status: PASS' as result,
       v.status, v.interrupted, v.notes,
       (select string_agg((e->>'stream') || '=' || (e->>'state'), ', ' order by e->>'stream')
          from jsonb_array_elements(v.streams) e) as streams
  from v_sync_status v;

rollback;
