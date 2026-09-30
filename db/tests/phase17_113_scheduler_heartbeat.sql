-- bb2dash :: db/tests/phase17_113_scheduler_heartbeat.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-06. Worker W-44.
-- Tests migration 113: schema `private`, `private.heartbeat_stage`, `private.scheduler_heartbeat`
-- and `public.v_scheduler_heartbeat`.
--
--   1. heartbeat_stage on fixed inputs: age 200 s ok, 300 s late, 700 s missing, never ticked
--      missing, 3 failures failing, 2 failures ok, inactive off
--   2. privileges: anon has no usage on `private`, no execute on either function and no select
--      on the view; authenticated and service_role have what the web and the PM need
--   3. three seeded failed calendar pushes make the calendar_push row read at least 3
--      consecutive failures with the newest seeded error (the 633-failure case of 2026-09-23)
--   4. the owner's JWT reads exactly 2 rows (transform, calendar_push); a stranger's reads 0
--
-- Values cross the `set local role` boundary in transaction-local GUCs, which roll back with
-- everything else. RUN IT: `node scripts/db-test.mjs --only phase17_113_scheduler_heartbeat.sql`,
-- or paste the whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

select set_config('w44.fail', '', true);

-- =============================================================================================
-- 1-2. The rule on fixed inputs, and privileges
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  t0     timestamptz := '2026-09-29 12:00:00+00';
  v_got  text;
  r      record;
begin
  if to_regprocedure('private.heartbeat_stage(timestamptz,timestamptz,integer,boolean)') is null
     or to_regprocedure('private.scheduler_heartbeat()') is null
     or to_regclass('public.v_scheduler_heartbeat') is null then
    raise exception 'FAIL phase17_113: private.heartbeat_stage, private.scheduler_heartbeat or '
                    'v_scheduler_heartbeat does not exist';
  end if;

  for r in
    select * from (values
      (t0 - interval '200 seconds', 0, true,  'ok',      'age 200 s'),
      (t0 - interval '300 seconds', 0, true,  'late',    'age 300 s'),
      (t0 - interval '700 seconds', 0, true,  'missing', 'age 700 s'),
      (null::timestamptz,           0, true,  'missing', 'never ticked'),
      (t0 - interval '60 seconds',  3, true,  'failing', '3 failures'),
      (t0 - interval '60 seconds',  2, true,  'ok',      '2 failures'),
      (t0 - interval '60 seconds',  0, false, 'off',     'inactive'),
      (t0 - interval '700 seconds', 5, false, 'off',     'inactive beats failing')
    ) v(tick, fails, active, want, label)
  loop
    execute 'select private.heartbeat_stage($1, $2, $3, $4)'
      into v_got using r.tick, t0, r.fails, r.active;
    if v_got is distinct from r.want then
      v_fail := v_fail || format('heartbeat_stage %s: %s, expected %s', r.label, v_got, r.want);
    end if;
  end loop;

  if has_schema_privilege('anon', 'private', 'usage') then
    v_fail := v_fail || 'anon has usage on schema private'::text;
  end if;
  if has_function_privilege('anon', 'private.scheduler_heartbeat()', 'execute')
     or has_function_privilege('anon', 'private.heartbeat_stage(timestamptz,timestamptz,integer,boolean)', 'execute') then
    v_fail := v_fail || 'anon can execute a private heartbeat function'::text;
  end if;
  if has_table_privilege('anon', 'public.v_scheduler_heartbeat', 'select') then
    v_fail := v_fail || 'anon can select v_scheduler_heartbeat'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.v_scheduler_heartbeat', 'select')
     or not has_function_privilege('authenticated', 'private.scheduler_heartbeat()', 'execute')
     or not has_schema_privilege('authenticated', 'private', 'usage') then
    v_fail := v_fail || 'authenticated cannot read the heartbeat'::text;
  end if;
  if not has_table_privilege('service_role', 'public.v_scheduler_heartbeat', 'select') then
    v_fail := v_fail || 'service_role cannot select v_scheduler_heartbeat'::text;
  end if;
  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.v_scheduler_heartbeat'::regclass and o = 'security_invoker=true') then
    v_fail := v_fail || 'v_scheduler_heartbeat is not security_invoker'::text;
  end if;
  if not (select prosecdef from pg_proc where oid = 'private.scheduler_heartbeat()'::regprocedure) then
    v_fail := v_fail || 'private.scheduler_heartbeat is not security definer'::text;
  end if;
  if exists (select 1 from pg_proc
              where oid in ('private.scheduler_heartbeat()'::regprocedure,
                            'private.heartbeat_stage(timestamptz,timestamptz,integer,boolean)'::regprocedure)
                and not coalesce(proconfig, '{}') @> array['search_path=public, pg_temp']) then
    v_fail := v_fail || 'a heartbeat function does not pin search_path = public, pg_temp'::text;
  end if;

  perform set_config('w44.fail', array_to_string(v_fail, '; '), true);
end $$;

-- =============================================================================================
-- 3. Three failed pushes after the newest ok one
-- =============================================================================================
insert into calendar_push_runs (trigger, started_at, finished_at, status, error)
select 'scheduled', now() - make_interval(secs => 6 - 2 * g), now() - make_interval(secs => 5 - 2 * g),
       'failed', format('W44 fixture push failure %s: re-run scripts/google-consent.mjs', g)
  from generate_series(1, 3) g
 order by g;

-- =============================================================================================
-- 4. The owner reads two rows; a stranger reads none
-- =============================================================================================
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims',
                  json_build_object('sub', public.app_owner(), 'role', 'authenticated')::text, true);
set local role authenticated;

select set_config('w44.owner_rows', (select count(*)::text from v_scheduler_heartbeat), true);
select set_config('w44.owner_jobs',
                  (select string_agg(job, ',' order by job) from v_scheduler_heartbeat), true);
select set_config('w44.push',
                  (select to_jsonb(h)::text from v_scheduler_heartbeat h where job = 'calendar_push'), true);
select set_config('w44.transform',
                  (select to_jsonb(h)::text from v_scheduler_heartbeat h where job = 'transform'), true);

select set_config('request.jwt.claims',
                  json_build_object('sub', '00000000-0000-0000-0000-000000000044', 'role', 'authenticated')::text, true);
select set_config('w44.stranger_rows', (select count(*)::text from v_scheduler_heartbeat), true);

reset role;

do $$
declare
  v_fail  text[] := '{}';
  v_prior text := current_setting('w44.fail', true);
  v_push  jsonb := nullif(current_setting('w44.push', true), '')::jsonb;
  v_tf    jsonb := nullif(current_setting('w44.transform', true), '')::jsonb;
begin
  if coalesce(v_prior, '') <> '' then
    v_fail := v_fail || v_prior;
  end if;
  if current_setting('w44.owner_rows', true) is distinct from '2' then
    v_fail := v_fail || format('owner reads %s rows, expected 2', current_setting('w44.owner_rows', true));
  end if;
  if current_setting('w44.owner_jobs', true) is distinct from 'calendar_push,transform' then
    v_fail := v_fail || format('owner reads jobs %s', current_setting('w44.owner_jobs', true));
  end if;
  if current_setting('w44.stranger_rows', true) is distinct from '0' then
    v_fail := v_fail || format('a stranger reads %s rows, expected 0', current_setting('w44.stranger_rows', true));
  end if;

  if v_push is null then
    v_fail := v_fail || 'no calendar_push row'::text;
  else
    if (v_push->>'consecutive_failures')::int < 3 then
      v_fail := v_fail || format('calendar_push reads %s consecutive failures after 3 seeded',
                                 v_push->>'consecutive_failures');
    end if;
    if v_push->>'last_error' is distinct from
       'W44 fixture push failure 3: re-run scripts/google-consent.mjs' then
      v_fail := v_fail || format('calendar_push last_error is %s', v_push->>'last_error');
    end if;
    if v_push->>'stage' not in ('failing', 'off') then
      v_fail := v_fail || format('calendar_push stage is %s with 3 failures', v_push->>'stage');
    end if;
    if v_push->>'cron_jobname' is distinct from 'bb2dash-calendar-push'
       or (v_push->>'tick_seconds')::int is distinct from 120 then
      v_fail := v_fail || format('calendar_push row misnames its job: %s', v_push);
    end if;
  end if;

  if v_tf is null then
    v_fail := v_fail || 'no transform row'::text;
  else
    if v_tf->>'cron_jobname' is distinct from 'bb2dash-transform-tick' then
      v_fail := v_fail || format('transform row misnames its job: %s', v_tf->>'cron_jobname');
    end if;
    if v_tf->>'stage' not in ('ok', 'late', 'missing', 'failing', 'off') then
      v_fail := v_fail || format('transform stage is %s', v_tf->>'stage');
    end if;
    if (v_tf->>'consecutive_failures')::int > 0 and v_tf->>'last_error' is null then
      v_fail := v_fail || 'transform reports failures with no last_error'::text;
    end if;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_113: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase17_113_scheduler_heartbeat: PASS'                                     as result,
       current_setting('w44.owner_rows', true)                                       as owner_rows,
       current_setting('w44.stranger_rows', true)                                    as stranger_rows,
       nullif(current_setting('w44.transform', true), '')::jsonb ->> 'stage'         as transform_stage,
       nullif(current_setting('w44.push', true), '')::jsonb ->> 'stage'              as push_stage_with_fixture;

rollback;
