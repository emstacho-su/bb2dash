-- bb2dash :: db/tests/phase9_transform_states.sql
-- Phase 15, P-8. The two run states nothing tested: `partial` and a reaped `failed`.
--
-- Phase 9's driver (035, as replaced by 039/044/051) has three honest outcomes for a fold, and
-- only `ok` was ever proved. This file proves the other two:
--
--   1. PARTIAL. A crawl whose payload breaks ONE stage leaves that stage's `sync_stage_runs` row
--      `failed`, every other stage standing, and `sync_runs.status = 'partial'`. A sync is not all
--      or nothing: one bad announcement must not throw away the gradebook that folded fine, and
--      Home has to be able to say "some of it worked".
--   2. REAPED. A `sync_runs` row still `running` half an hour later did not survive its session.
--      `transform_tick()` marks it `failed`, keeps whatever notes it had and appends
--      `interrupted (reaped)`, and counts it in its own `reaped` figure. Without that, Home says
--      "syncing..." forever (035 §3's reason, unchanged through 039 and 044).
--
-- The crafted payload breaks `stage_announcements` and nothing else: `announcements[0].created` is
-- not a timestamp, and 034:715 casts that key to `timestamptz` inside the stage's own
-- `begin … exception` block. The cast raises before any row is written, so the failure is a stage
-- failure and not a half-written announcement. No other stage reads the `announcements` key
-- (035/051 only read the counts the stage returns), and the payload carries nothing else, so every
-- other stage sees an empty crawl and reports `ok` (or `skipped`).
--
-- RUN IT: paste the whole file into one `execute_sql` call through the Supabase MCP, or
--
--   node scripts/db-test.mjs --only phase9_transform_states.sql
--
-- A failing assertion raises, which is the failure signal; a pass ends with one summary row.
--
-- NOTHING IS COMMITTED. The file opens its own transaction and its last statement is `rollback`.
-- It registers one synthetic crawl and writes three `sync_runs` rows, all under fixture run ids
-- (`00000000-0900-…`), never a real crawl's. `transform_tick()` is called inside that transaction:
-- it folds nothing (the fixture crawl already has its `sync_runs` row, and prod held no unfolded
-- registered crawl), and anything it did touch would roll back with the rest. The bb_course_id is
-- a real shell so `bb_resolve_course` finds a course for the announcement to hang on; the payload
-- carries no `course` key, so no real `courses` row is even read for an upsert.

begin;

create temp table _fx9 (label text primary key, run_id uuid, sync_run_id bigint) on commit drop;

-- =============================================================================================
-- 0. Seed: one registered crawl whose payload breaks exactly one stage
-- =============================================================================================
-- Registered, because the transform folds only crawls an owner-claimed agent_requests row named
-- (039; run_transform refuses an unregistered run outright).
insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
values ('sync', 'all', 'done', '00000000-0900-4000-8000-000000000001',
        'Phase 9 run-state fixture (db/tests/phase9_transform_states.sql). Test-only; rolled back.',
        'phase9 states', now(), now());

insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
values ('00000000-0900-4000-8000-000000000001', 'course', '_571529_1',
        $fx9${"crawler":{"version":3},"announcements":[{"id":"phase9-broken-timestamp","title":"Phase 9 fixture: an announcement with an unparseable created date","body":"Test-only row. stage_announcements casts `created` to timestamptz and must record its own failure instead of taking the whole sync down.","created":"the fourteenth of never","modified":null,"isRead":false}]}$fx9$::jsonb,
        now());

-- =============================================================================================
-- 1. partial: one stage failed, the run says so, the rest of the fold stands
-- =============================================================================================
do $$
declare
  v_sync bigint; v_status text; v_failed int; v_stage text; v_error text; v_stages int;
begin
  v_sync := run_transform('00000000-0900-4000-8000-000000000001'::uuid, 'manual');
  insert into _fx9 (label, run_id, sync_run_id)
  values ('partial', '00000000-0900-4000-8000-000000000001', v_sync);

  select status into v_status from sync_runs where id = v_sync;
  if v_status is distinct from 'partial' then
    raise exception 'FAIL run_transform left sync_runs.status = %, expected partial', coalesce(v_status, '(null)');
  end if;

  -- Exactly one stage failed. The message names every stage's status, because "two failed" and
  -- "none failed" have completely different causes and the next reader needs to see which.
  select count(*) into v_failed from sync_stage_runs
   where sync_run_id = v_sync and status = 'failed';
  if v_failed <> 1 then
    raise exception 'FAIL % sync_stage_runs row(s) read failed, expected exactly 1 (%)', v_failed,
      coalesce((select string_agg(stage || '=' || status, ', ' order by stage)
                  from sync_stage_runs where sync_run_id = v_sync), '(no stage rows)');
  end if;

  select stage, error into v_stage, v_error from sync_stage_runs
   where sync_run_id = v_sync and status = 'failed';
  if v_stage <> 'announcements' then
    raise exception 'FAIL the failed stage is %, expected announcements', v_stage;
  end if;
  if coalesce(v_error, '') = '' then
    raise exception 'FAIL the failed announcements stage recorded no error text';
  end if;

  -- The rest of the fold ran, and none of it is left in an unknown state.
  select count(*) into v_stages from sync_stage_runs where sync_run_id = v_sync;
  if v_stages < 2 then
    raise exception 'FAIL the partial run has % stage row(s); the other stages should still have run', v_stages;
  end if;
  if exists (select 1 from sync_stage_runs
              where sync_run_id = v_sync and status not in ('ok', 'skipped', 'failed')) then
    raise exception 'FAIL a stage of the partial run reads status %',
      (select string_agg(distinct status, ', ') from sync_stage_runs
        where sync_run_id = v_sync and status not in ('ok', 'skipped', 'failed'));
  end if;

  -- A partial run carries its reason where the app reads it, not only in the stage table.
  if coalesce(jsonb_array_length((select summary->'errors' from sync_runs where id = v_sync)), 0) = 0 then
    raise exception 'FAIL the partial run recorded no error in summary->errors';
  end if;
  if (select finished_at from sync_runs where id = v_sync) is null then
    raise exception 'FAIL the partial run has no finished_at';
  end if;

  -- Nothing from the broken stage was written: the cast raises before the upsert.
  if exists (select 1 from announcements where bb_item_id = 'phase9-broken-timestamp') then
    raise exception 'FAIL the failed announcements stage wrote a row anyway';
  end if;
end $$;

-- =============================================================================================
-- 2. reaped: a run still `running` after 31 minutes reads failed, and a fresh one is left alone
-- =============================================================================================
-- The stale row keeps a note of its own, so the assertion also proves the reaper APPENDS
-- `interrupted (reaped)` rather than overwriting what the driver had already recorded.
insert into sync_runs (run_id, status, started_at, trigger, source, scope, notes)
values ('00000000-0900-4000-8000-000000000002', 'running', now() - interval '31 minutes',
        'manual', 'blackboard', 'all', 'phase9 fixture: died with its session'),
       ('00000000-0900-4000-8000-000000000003', 'running', now(),
        'manual', 'blackboard', 'all', 'phase9 fixture: still running');

do $$
declare
  v_res jsonb; v_stale bigint; v_fresh bigint; v_status text; v_notes text; v_finished timestamptz;
  v_reaped int;
begin
  select id into v_stale from sync_runs where run_id = '00000000-0900-4000-8000-000000000002';
  select id into v_fresh from sync_runs where run_id = '00000000-0900-4000-8000-000000000003';

  v_res := transform_tick();

  v_reaped := coalesce((v_res->>'reaped')::int, -1);
  if v_reaped < 1 then
    raise exception 'FAIL transform_tick reported reaped = %, expected at least 1',
      coalesce(v_res->>'reaped', '(no reaped key)');
  end if;

  select status, notes, finished_at into v_status, v_notes, v_finished
    from sync_runs where id = v_stale;
  if v_status is distinct from 'failed' then
    raise exception 'FAIL the 31-minute-old running row reads status %, expected failed',
      coalesce(v_status, '(null)');
  end if;
  if coalesce(v_notes, '') = ''
     or right(v_notes, length('interrupted (reaped)')) <> 'interrupted (reaped)' then
    raise exception 'FAIL the reaped row''s notes are %, expected them to end "interrupted (reaped)"',
      coalesce(v_notes, '(null)');
  end if;
  if v_notes not like 'phase9 fixture: died with its session%' then
    raise exception 'FAIL the reaper overwrote the notes the run already had: %', v_notes;
  end if;
  if v_finished is null then
    raise exception 'FAIL the reaped row has no finished_at';
  end if;

  -- The boundary is a real boundary: a run that started a moment ago is still running.
  select status into v_status from sync_runs where id = v_fresh;
  if v_status is distinct from 'running' then
    raise exception 'FAIL the fresh running row reads status %, expected running (the reaper took a live run)',
      coalesce(v_status, '(null)');
  end if;
end $$;

-- =============================================================================================
-- 3. Pass
-- =============================================================================================
select 'phase9_transform_states: PASS'                                                  as result,
       (select status from sync_runs where id = (select sync_run_id from _fx9 where label = 'partial')) as folded_status,
       (select string_agg(stage || '=' || status, ', ' order by stage) from sync_stage_runs
         where sync_run_id = (select sync_run_id from _fx9 where label = 'partial'))     as stages,
       (select notes from sync_runs where run_id = '00000000-0900-4000-8000-000000000002') as reaped_notes,
       (select status from sync_runs where run_id = '00000000-0900-4000-8000-000000000003') as fresh_status;

rollback;
