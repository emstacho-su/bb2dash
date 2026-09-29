-- bb2dash :: db/tests/phase18_124_stage_files_replay.sql
-- Phase 18 (brief 98), task 11. Worker W-48. stage_files as 124 re-creates it (R-63, R-67):
--   (1) identity args are `p_run_id uuid, p_sync_run_id bigint`
--   (2) a fold of the newest registered crawl returns counts with keys `superseded_auto` and
--       `session_links`
--   (3) a replay of that crawl changes 0 bb_files rows. The first fold inside this transaction
--       may still apply 122's and 123's rules to rows the live fold has not yet seen under them;
--       every row it changes is listed in the failure message if the replay changes anything.
--   (4) stage_content's body is untouched: md5(prosrc) equals the value recorded in 98c before
--       124 (92260a274cb7bcc356de5d0fa9910084)
-- Needs execute on stage_files for db_test_runner (migration 128). Collects failures, raises once.
-- RUN IT: `node scripts/db-test.mjs --only phase18_124_stage_files_replay.sql`.

begin;

do $$
declare
  STAGE_CONTENT_MD5 constant text := '92260a274cb7bcc356de5d0fa9910084';
  v_fail   text[] := array[]::text[];
  v_newest uuid;
  v_sync   bigint;
  v_r      jsonb;
  v_snap   jsonb;
  v_bad    text;
  v_got    text;
begin
  -- (1)
  select pg_get_function_identity_arguments('public.stage_files(uuid, bigint)'::regprocedure)
    into v_got;
  if v_got is distinct from 'p_run_id uuid, p_sync_run_id bigint' then
    v_fail := v_fail || format('(1) identity args: %s', v_got);
  end if;

  with reg as (
    select r.run_id, (select max(b.captured_at) from bb_raw b where b.run_id = r.run_id) as last_at
      from agent_requests r
     where r.kind = 'sync' and r.run_id is not null
  )
  select run_id into v_newest from reg where last_at is not null order by last_at desc limit 1;
  select id into v_sync from sync_runs where run_id = v_newest order by id desc limit 1;

  -- (2) the first fold
  v_r := stage_files(v_newest, v_sync);
  if v_r->>'status' is distinct from 'ok' then
    v_fail := v_fail || format('(2) first fold: %s %s', v_r->>'status', v_r->>'error');
  elsif not (v_r->'counts' ? 'superseded_auto' and v_r->'counts' ? 'session_links') then
    v_fail := v_fail || format('(2) counts keys: %s',
      (select string_agg(k, ',' order by k) from jsonb_object_keys(v_r->'counts') k));
  end if;

  -- (3) the replay
  select jsonb_object_agg(f.id, md5(row(f.*)::text)) into v_snap from bb_files f;
  v_r := stage_files(v_newest, v_sync);
  select string_agg(f.id::text, ', ' order by f.id) into v_bad
    from bb_files f
   where md5(row(f.*)::text) is distinct from v_snap->>f.id::text;
  if v_r->>'status' is distinct from 'ok' or v_bad is not null then
    v_fail := v_fail || format('(3) replay of %s: status %s, changed rows %s',
                               v_newest, v_r->>'status', coalesce(v_bad, 'none'));
  end if;

  -- (4)
  select md5(prosrc) into v_got from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'stage_content';
  if v_got is distinct from STAGE_CONTENT_MD5 then
    v_fail := v_fail || format('(4) stage_content md5 %s', v_got);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_124_stage_files_replay: PASS' as result;

rollback;
