-- bb2dash :: db/tests/phase17_116_retire_inbox_feedback.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-09. Worker W-44.
-- Tests migration 116: `v_inbox_feedback` is gone, and what 077 gave /inbox-apply stays:
--   * agent_requests accepts kind 'inbox_feedback' and still refuses an unknown kind
--     (moved here from the deleted phase12b_077_inbox_feedback.sql);
--   * transform_tick still drains only kind 'transform', so it never claims an inbox_feedback row;
--   * v_inbox_queue, the queue /inbox-apply reads, is still selectable by the owner.
--
-- RUN IT: `node scripts/db-test.mjs --only phase17_116_retire_inbox_feedback.sql`, or paste the
-- whole file into one `execute_sql` call. The inserts roll back with the rest.

begin;

select set_config('w44.fail', '', true);

-- Phase 23 (migration 183): one inbox_feedback request may be open at a time, and this unit
-- inserts one, so a real open one is set aside for this transaction.
update agent_requests set state = 'cancelled'
 where kind = 'inbox_feedback' and state in ('queued', 'claimed');

do $$
declare
  v_fail   text[] := '{}';
  v_id     bigint;
  v_raised boolean := false;
begin
  if to_regclass('public.v_inbox_feedback') is not null then
    v_fail := v_fail || 'v_inbox_feedback still exists'::text;
  end if;

  insert into agent_requests (kind, note) values ('inbox_feedback', 'W44 116 test')
  returning id into v_id;
  if v_id is null then
    v_fail := v_fail || 'agent_requests refused kind inbox_feedback'::text;
  end if;

  begin
    insert into agent_requests (kind, note) values ('_w44_unknown', 'W44 116 test');
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    v_fail := v_fail || 'agent_requests accepted an unknown kind'::text;
  end if;

  if pg_get_functiondef('public.transform_tick()'::regprocedure) not like '%kind = ''transform''%' then
    v_fail := v_fail || 'transform_tick no longer filters its drain on kind = transform'::text;
  end if;

  if to_regclass('public.v_inbox_queue') is null
     or not has_table_privilege('authenticated', 'public.v_inbox_queue', 'select') then
    v_fail := v_fail || 'v_inbox_queue is missing or not readable by authenticated'::text;
  end if;

  perform set_config('w44.fail', array_to_string(v_fail, '; '), true);
end $$;

-- The owner reads v_inbox_queue.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims',
                  json_build_object('sub', public.app_owner(), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('w44.queue_rows', (select count(*)::text from v_inbox_queue), true);
reset role;

do $$
begin
  if coalesce(current_setting('w44.fail', true), '') <> '' then
    raise exception 'FAIL phase17_116: %', current_setting('w44.fail', true);
  end if;
  if current_setting('w44.queue_rows', true) is null then
    raise exception 'FAIL phase17_116: the owner could not read v_inbox_queue';
  end if;
end $$;

select 'phase17_116_retire_inbox_feedback: PASS'                                      as result,
       current_setting('w44.queue_rows', true)                                          as owner_queue_rows;

rollback;
