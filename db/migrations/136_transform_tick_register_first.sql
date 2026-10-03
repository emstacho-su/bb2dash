-- bb2dash :: 136_transform_tick_register_first.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), tasks 13 and 14.
-- Worker W-53. R-65: only a complete crawl is folded, and a crawl that never completes ends.
--
-- HOW THIS WAS BUILT. `transform_tick` is re-created from its LIVE definition, read out of prod with
--     select pg_get_functiondef('public.transform_tick()'::regprocedure);
-- on 2026-10-02 before a line was written. It was migration 044's body: 077 and 116 mention the
-- tick but neither re-creates it. Every line below that is not named under WHAT CHANGES is that
-- body, carried as it stands.
--
-- WHY. 044 folded a REGISTERED run when its calendar row had landed OR when nothing new had
-- arrived for three minutes. The second half has no completeness check: a slow crawl registered
-- before it started could be folded with one course landed, and `run_transform` is idempotent, so
-- the other courses were then dropped for good. That is why the skill registered its run only
-- after `bb.runAll` returned (DECISIONS 2026-09-15), and why nothing could say "running". And when
-- a crawl died, nothing ever closed its request: the tick left `kind = 'sync'` alone.
--
-- WHAT CHANGES
--   1. Fold. A registered run folds ONLY when `bb_raw` holds its `calendar` row, which the crawler
--      posts last. There is no idle branch for registered runs. The "never folded" test gains
--      `and s.status <> 'running'`: since 135 a claimed run already has a `running` row, and
--      without that clause the row opened at claim would stop every registered run from folding.
--   2. Quarantine is unchanged, three-minute idle rule and all. It applies to unregistered runs only.
--   3. The reaper becomes the TERMINAL RULE (B-20: Stack's yes, 2026-10-02, "interrupted at 30
--      minutes"). One constant, `c_terminal_after`.
--        * A `running` row whose `started_at` is older than that becomes `failed`, with
--          `interrupted_at = now()` and `finished_at = coalesce(finished_at, now())`. `notes` still
--          ends `interrupted (reaped)`, appended as 044 does, and the tick still counts it in `reaped`.
--        * Its `claimed` sync request becomes `failed`, `result = {error: 'interrupted', sync_run_id}`.
--        * A `claimed` sync request with no `run_id`, claimed longer ago than that, becomes
--          `failed`, `result = {error: 'interrupted before a run was registered'}`.
--        * Each closed request raises exactly one Inbox item through `raise_attention`, kind
--          `stack_must_confirm`, null course and field, entity `agent_request`, ref
--          `agent_request:<id>`. The open-item dedupe index (041) keys on (kind, course, ref,
--          field), so a later raise for the same request lands on the same row.
--        * Nothing is retried. An interrupted run is never folded: its `failed` row is a finished
--          row, so the "never folded" test excludes it even if its calendar row arrives late.
--      This is the one place the tick writes a `kind = 'sync'` request (DECISIONS 2026-09-15 said
--      it never does; this phase's row records the departure).
--   4. Drain. "The newest registered crawl" becomes the newest COMPLETE one (calendar row
--      present), and `v_was_folded` uses the fold pass's test, so a claim-opened `running` row
--      does not read as "already folded".
--   5. The return value keeps every key and gains `interrupted_requests`.
--
-- WHAT DOES NOT CHANGE
--   * The pg_cron job `bb2dash-transform-tick` and its schedule (`*/2 * * * *`). This file does
--     not touch `cron`.
--   * `ical_collect()` stays the tick's last step (DECISIONS 2026-09-14). 127 unscheduled the
--     daily poll, so the call finds nothing outstanding and returns at once.
--   * Quarantine, including its hold while a sync is claimed: the installed skill still registers
--     after its crawl until this phase merges, and the hold is what covers that gap.
--   * Signature, language, security and search_path, so `create or replace` keeps the grants; they
--     are re-asserted at the foot as prod holds them.
--
-- A NULL `claimed_at`. The no-run-id rule reads `coalesce(claimed_at, created_at)`. The installed
-- skill's no-id path inserts a request already `claimed` with no `claimed_at`; read literally, such
-- a claim would never be 30 minutes old and would hold "syncing..." for good.

create or replace function transform_tick() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- B-20. How long a claimed sync may go without completing before it is called interrupted.
  c_terminal_after constant interval := interval '30 minutes';
  v_minutes int := (extract(epoch from c_terminal_after) / 60)::int;   -- for the Inbox question
  v_folded int := 0; v_reaped int := 0; v_claimed int := 0; v_failed_req int := 0;
  v_quarantined int := 0;
  v_interrupted int := 0;
  v_runs jsonb := '[]'::jsonb;
  v_newest uuid; v_run bigint; v_q bigint;
  v_sync_in_flight boolean;
  v_res jsonb;
  v_was_folded boolean;
  v_ical jsonb := jsonb_build_object('collected', false, 'reason', 'not attempted');
  r record;
  q record;
begin
  -- 1. Fold every REGISTERED crawl that is complete and has never been folded, OLDEST FIRST. A
  --    crawl is complete when its calendar row has landed (the crawler posts it last), and by
  --    nothing else: an idle registered crawl is an unfinished one. Registration, not presence in
  --    bb_raw, is the authority.
  for r in
    select a.run_id,
           (select max(b.captured_at) from bb_raw b where b.run_id = a.run_id) as last_at
      from agent_requests a
     where a.kind = 'sync'
       and a.run_id is not null
       -- 'claimed' is the state during a crawl; 'done' covers a skill that closed its request
       -- before the next tick came round. Either way the owner asked for this run.
       and a.state in ('claimed','done')
       -- Never folded. The row opened at claim (135) is 'running' and is not a fold.
       and not exists (select 1 from sync_runs s
                        where s.run_id = a.run_id and s.scope is distinct from 'unregistered'
                          and s.status <> 'running')
       and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'course')
       and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'calendar')
     group by a.run_id
     order by 2
  loop
    v_run := run_transform(r.run_id, 'scheduled');
    v_folded := v_folded + 1;
    v_runs := v_runs || to_jsonb(v_run);
  end loop;

  -- 2. Quarantine. A complete crawl nobody registered is recorded once and then invisible to
  --    every later tick, so junk posted with the publishable key costs two rows and no data.
  --    Held off entirely while the owner has a sync in flight, because the crawler names the run
  --    and the skill can only register it once bb.runAll returns.
  select exists (select 1 from agent_requests a
                  where a.kind = 'sync' and a.state = 'claimed'
                    and a.claimed_at > now() - interval '30 minutes')
    into v_sync_in_flight;

  if not v_sync_in_flight then
    for r in
      select b.run_id
        from bb_raw b
       where b.kind = 'course'
         and not exists (select 1 from sync_runs s where s.run_id = b.run_id)
         and not exists (select 1 from agent_requests a
                          where a.kind = 'sync' and a.run_id = b.run_id)
       group by b.run_id
      having (exists (select 1 from bb_raw c where c.run_id = b.run_id and c.kind = 'calendar')
              or max(b.captured_at) < now() - interval '3 minutes')
    loop
      insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope, notes)
      values (r.run_id, 'failed', now(), now(), 'scheduled', 'blackboard', 'unregistered',
              'unregistered run: no agent_requests row of kind sync claimed this run_id, and bb_raw accepts anon inserts. Recorded and ignored.')
      returning id into v_q;

      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_q, 'crawl', 'skipped',
              jsonb_build_object('run_id', r.run_id), now(), now(), 'unregistered run');

      v_quarantined := v_quarantined + 1;
    end loop;
  end if;

  -- 3. The terminal rule. A run still marked running after c_terminal_after is not running; it
  --    died with its session. Say so out loud instead of leaving "syncing..." on Home forever:
  --    the run reads interrupted, its claimed request is closed as failed, and Stack gets one
  --    Inbox item. Nothing is retried.
  for r in
    update sync_runs
       set status         = 'failed',
           interrupted_at = now(),
           finished_at    = coalesce(finished_at, now()),
           notes          = btrim(coalesce(notes || ' | ', '') || 'interrupted (reaped)')
     where status = 'running'
       and started_at < now() - c_terminal_after
    returning id, run_id
  loop
    v_reaped := v_reaped + 1;

    for q in
      update agent_requests a
         set state = 'failed', finished_at = now(), sync_run_id = r.id,
             result = jsonb_build_object('error', 'interrupted', 'sync_run_id', r.id)
       where a.kind = 'sync' and a.state = 'claimed' and a.run_id = r.run_id
      returning a.id
    loop
      perform raise_attention(
        r.id, 'stack_must_confirm', null, 'agent_request', 'agent_request:' || q.id, null, null, null,
        format('A Blackboard sync did not finish within %s minutes and was marked interrupted. Nothing from it was folded in. Press Sync to run it again.', v_minutes),
        null);
      v_interrupted := v_interrupted + 1;
    end loop;
  end loop;

  --    A claim that never registered a run has no sync_runs row to reap, so it is closed here.
  for q in
    update agent_requests a
       set state = 'failed', finished_at = now(),
           result = jsonb_build_object('error', 'interrupted before a run was registered')
     where a.kind = 'sync' and a.state = 'claimed' and a.run_id is null
       and coalesce(a.claimed_at, a.created_at) < now() - c_terminal_after
    returning a.id
  loop
    perform raise_attention(
      null, 'stack_must_confirm', null, 'agent_request', 'agent_request:' || q.id, null, null, null,
      format('A Blackboard sync was claimed but never started its crawl within %s minutes, and was marked interrupted. Press Sync to run it again.', v_minutes),
      null);
    v_interrupted := v_interrupted + 1;
  end loop;

  -- 4. Drain the transform requests the app queued. They fold the newest COMPLETE registered
  --    crawl; a newer one whose calendar row has not landed is still crawling and is left alone.
  --    'sync' requests are not drained: they need a logged-in Blackboard tab, so only the bb-sync
  --    skill can run one. The terminal rule above is the only thing here that closes one.
  select a.run_id into v_newest
    from agent_requests a
   where a.kind = 'sync' and a.run_id is not null
     and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'course')
     and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'calendar')
   order by (select max(b.captured_at) from bb_raw b where b.run_id = a.run_id) desc
   limit 1;

  for r in
    select id from agent_requests
     where state = 'queued' and kind = 'transform'
     order by created_at
     for update skip locked
  loop
    update agent_requests
       set state = 'claimed', claimed_at = now(), claimed_by = 'transform_tick'
     where id = r.id;

    begin
      if v_newest is null then
        update agent_requests
           set state = 'failed', finished_at = now(),
               result = jsonb_build_object('error', 'no registered crawl in bb_raw to transform')
         where id = r.id;
        v_failed_req := v_failed_req + 1;
      else
        -- run_transform is idempotent, so this folds the newest crawl only if nobody has folded
        -- it yet. Either way the answers Stack has given get applied: that is the whole point of
        -- a transform request, and before migration 042 it was the one thing it could not do.
        -- "Folded" is the fold pass's test: a row still running was opened at claim, not folded.
        v_was_folded := exists (select 1 from sync_runs s
                                 where s.run_id = v_newest
                                   and s.scope is distinct from 'unregistered'
                                   and s.status <> 'running');
        v_run := run_transform(v_newest, 'app_request');
        v_res := apply_resolutions();
        update agent_requests
           set state = 'done', finished_at = now(), sync_run_id = v_run, run_id = v_newest,
               result = (select jsonb_build_object('sync_run_id', s.id, 'run_id', s.run_id,
                                                   'status', s.status, 'summary', s.summary,
                                                   'folded_a_new_crawl', not v_was_folded,
                                                   'resolutions', v_res)
                           from sync_runs s where s.id = v_run)
         where id = r.id;
        v_claimed := v_claimed + 1;
      end if;
    exception when others then
      update agent_requests
         set state = 'failed', finished_at = now(),
             result = jsonb_build_object('error', left(sqlerrm, 500))
       where id = r.id;
      v_failed_req := v_failed_req + 1;
    end;
  end loop;

  -- 5. Collect the calendar feed's body if pg_net has it. Isolated: a pg_net problem must not
  --    cost us the fold, the terminal rule and the drain that already succeeded above.
  begin
    v_ical := ical_collect();
  exception when others then
    v_ical := jsonb_build_object('collected', false, 'error', left(sqlerrm, 300));
  end;

  return jsonb_build_object('folded', v_folded, 'sync_run_ids', v_runs,
                            'quarantined', v_quarantined,
                            'quarantine_held_for_sync', coalesce(v_sync_in_flight, false),
                            'reaped', v_reaped,
                            'interrupted_requests', v_interrupted,
                            'requests_done', v_claimed, 'requests_failed', v_failed_req,
                            'ical', v_ical,
                            'at', now());
end $$;

comment on function transform_tick() is
  'Scheduled every two minutes by pg_cron as the postgres role. Folds registered crawls whose '
  'calendar row has landed, oldest first; quarantines complete crawls nobody registered (once '
  'each, and never while the owner has a sync in flight); applies the terminal rule (a run still '
  'running after 30 minutes reads failed and interrupted, its claimed sync request is closed as '
  'failed, a claimed request that never registered a run is closed the same way, and each closed '
  'request raises one Inbox item); drains queued agent_requests of kind transform - folding the '
  'newest complete registered crawl if it is unfolded and applying Stack''s answers either way - '
  'and finally collects the calendar feed''s pg_net response if it has arrived. It never runs a '
  'sync: that needs a logged-in Blackboard tab and belongs to the bb-sync skill.';

-- =============================================================================================
-- Privileges, re-asserted exactly as prod holds them today
-- =============================================================================================
-- service_role (044), and the test role (held since migration 100, re-asserted). Not callable
-- from a browser (038).
revoke all on function public.transform_tick() from public, anon, authenticated;
grant execute on function public.transform_tick() to service_role;
grant execute on function public.transform_tick() to db_test_runner;

-- =============================================================================================
-- Guard
-- =============================================================================================
do $$
begin
  if has_function_privilege('anon', 'public.transform_tick()', 'execute')
     or has_function_privilege('authenticated', 'public.transform_tick()', 'execute') then
    raise exception 'FAIL 136: anon or authenticated can execute transform_tick';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sync_runs'
                    and column_name = 'interrupted_at') then
    raise exception 'FAIL 136: sync_runs.interrupted_at does not exist; apply 135 first';
  end if;
end $$;
