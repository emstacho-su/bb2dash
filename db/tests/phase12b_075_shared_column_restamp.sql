-- bb2dash :: db/tests/phase12b_075_shared_column_restamp.sql
-- Phase 12b, item X-3 (P-data-2). Tests migration 075: when a gradebook column is bound to more
-- than one assignment, `stage_assignments` still refuses to guess which one Blackboard's VALUES
-- belong to, but it no longer leaves both rows looking absent from Blackboard. The two IST.323
-- final-project rows are restamped and reach the calendar push again.
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. Section 3 deliberately winds
-- `bb_last_seen` back and re-folds the newest crawl; the file's last statement is `rollback`, so
-- neither the wind-back nor the replay survives it.

begin;

-- =============================================================================================
-- 1. The code path exists and the ambiguity is still reported, not silenced
-- =============================================================================================
do $$
declare def text;
begin
  def := pg_get_functiondef('public.stage_assignments(uuid,bigint)'::regprocedure);
  if position('shared column liveness restamp' in def) = 0 then
    raise exception 'FAIL stage_assignments has no restamp step for a shared gradebook column';
  end if;
  -- The Inbox question about WHICH assignment the column means must still be raised.
  if position('is attached to more than one assignment' in def) = 0 then
    raise exception 'FAIL stage_assignments no longer asks which assignment a shared column means';
  end if;
end $$;

-- =============================================================================================
-- 2. Prod: no assignment on a shared column is reported absent, and both IST.323 rows push
-- =============================================================================================
do $$
declare
  absent text;
  n      int;
begin
  select string_agg(p.ref_id, ', ' order by p.ref_id) into absent
    from v_calendar_push_items p
    join assignments a on a.id = p.assignment_id
   where p.source = 'assignment'
     and p.absent_from_blackboard
     and (select count(*) from assignments a2
           where a2.course_id = a.course_id and a2.bb_column_id = a.bb_column_id) > 1;
  if absent is not null then
    raise exception 'FAIL these rows share a gradebook column and are still reported absent from Blackboard: %', absent;
  end if;

  select count(*) into n
    from v_calendar_push_items
   where ref_id in ('IST.323/fp-proposal', 'IST.323/fp-log-final')
     and source = 'assignment'
     and not absent_from_blackboard;
  if n <> 2 then
    raise exception 'FAIL % of the 2 IST.323 final-project rows are pushable, expected 2', n;
  end if;

  -- The restamp is a liveness claim only. It must not have invented an item id.
  if exists (select 1 from assignments
              where id in ('IST.323/fp-proposal', 'IST.323/fp-log-final')
                and bb_item_id is distinct from '_12983388_1') then
    raise exception 'FAIL 075 changed the bb_item_id of an IST.323 final-project row';
  end if;
end $$;

-- =============================================================================================
-- 3. A replay of the newest crawl restamps them again (this is what the next sync will do)
-- =============================================================================================
do $$
declare
  v_run   uuid;
  v_sync  bigint;
  v_stale timestamptz := timestamptz '2026-09-02 20:32:02.182677+00';
  r       jsonb;
  n       int;
begin
  select s.run_id, s.id into v_run, v_sync
    from sync_runs s
   where s.source = 'blackboard' and s.status in ('ok','partial')
     and s.scope is distinct from 'unregistered' and s.run_id is not null
   order by s.started_at desc nulls last
   limit 1;
  if v_run is null then
    raise exception 'FAIL there is no folded Blackboard crawl to replay';
  end if;

  -- Put the two rows back the way the bug left them.
  update assignments set bb_last_seen = v_stale
   where id in ('IST.323/fp-proposal', 'IST.323/fp-log-final');
  select count(*) into n from v_calendar_push_items
   where ref_id in ('IST.323/fp-proposal', 'IST.323/fp-log-final') and absent_from_blackboard;
  if n <> 2 then
    raise exception 'FAIL the wind-back did not reproduce the bug (% of 2 rows absent)', n;
  end if;

  r := stage_assignments(v_run, v_sync);
  if r->>'status' <> 'ok' then
    raise exception 'FAIL the replay failed: %', r;
  end if;
  if (r->'counts'->>'ambiguous_columns')::int < 1 then
    raise exception 'FAIL the replay did not report the ambiguous column: %', r->'counts';
  end if;

  select count(*) into n
    from assignments
   where id in ('IST.323/fp-proposal', 'IST.323/fp-log-final')
     and bb_last_seen > v_stale;
  if n <> 2 then
    raise exception 'FAIL the replay restamped % of the 2 shared-column rows', n;
  end if;

  select count(*) into n from v_calendar_push_items
   where ref_id in ('IST.323/fp-proposal', 'IST.323/fp-log-final') and absent_from_blackboard;
  if n <> 0 then
    raise exception 'FAIL % of the 2 rows are still absent after the replay', n;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_075_shared_column_restamp: PASS'                                  as result,
       (select count(*) from v_calendar_push_items
         where source = 'assignment' and absent_from_blackboard)                   as absent_rows,
       (select count(*) from v_calendar_push_items where source = 'assignment')    as pushable_assignments;

rollback;
