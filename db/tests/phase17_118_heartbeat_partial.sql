-- phase17_118_heartbeat_partial.sql — Phase 17 round 2 (code-review gate, 2026-09-29), migration 118.
-- A calendar push run with status 'partial' (authenticated and pushed, some items failed, 061) is a
-- success for the heartbeat: it resets consecutive_failures and moves last_ok_at. Before 118, three
-- failures followed by a 'partial' run read as 3 failures, stage 'failing', forever.
-- Runs as db_test_runner (117 grants insert on calendar_push_runs); everything rolls back.
begin;

insert into calendar_push_runs (trigger, started_at, finished_at, status, error)
select 'scheduled', now() - make_interval(secs => 20 - 2 * g), now() - make_interval(secs => 19 - 2 * g),
       'failed', format('P118 fixture push failure %s', g)
  from generate_series(1, 3) g
 order by g;

insert into calendar_push_runs (trigger, started_at, finished_at, status, error)
values ('scheduled', now() - interval '2 seconds', now() - interval '1 second', 'partial',
        'P118 fixture: 1 item failed');

select set_config('request.jwt.claims',
                  json_build_object('sub', public.app_owner(), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('p118.push',
                  (select to_jsonb(h)::text from v_scheduler_heartbeat h where job = 'calendar_push'), true);
reset role;

do $$
declare
  v_push jsonb := nullif(current_setting('p118.push', true), '')::jsonb;
  v_fail text[] := '{}';
begin
  if v_push is null then
    raise exception 'FAIL phase17_118: no calendar_push row for the owner';
  end if;
  if (v_push->>'consecutive_failures')::int <> 0 then
    v_fail := v_fail || format('%s consecutive failures after a partial run, expected 0',
                               v_push->>'consecutive_failures');
  end if;
  if v_push->>'last_error' is not null then
    v_fail := v_fail || format('last_error %s after a partial run, expected null', v_push->>'last_error');
  end if;
  if (v_push->>'last_ok_at')::timestamptz < now() - interval '3 seconds' then
    v_fail := v_fail || format('last_ok_at %s is not the partial run', v_push->>'last_ok_at');
  end if;
  if v_push->>'stage' = 'failing' then
    v_fail := v_fail || 'stage is failing after a partial run'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_118: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase17_118_heartbeat_partial: PASS' as result,
       nullif(current_setting('p118.push', true), '')::jsonb ->> 'stage' as push_stage;

rollback;
