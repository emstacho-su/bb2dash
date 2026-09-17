-- bb2dash :: db/tests/phase12b_084_shared_column_conflict.sql
-- Phase 12b, F-5 (P-data-2 follow-up). Tests migration 084: a gradebook column that is bound, on
-- purpose, to more than one assignment is no longer an open question. Migration 075 taught
-- `stage_assignments` to restamp every row on such a column, so the transform now knows exactly
-- what to do with it and has nothing to ask. The "which one does Blackboard mean?" conflict is
-- kept for the case it was written for: a column matched to several assignments by TITLE, none of
-- which carries its id.
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. Sections 2 and 3 fold the newest
-- crawl and section 3 appends a synthetic column to a `bb_raw` payload; the file's last statement
-- is `rollback`, so none of it survives.

begin;

-- =============================================================================================
-- 1. The open row for the IST.323 shared column is closed, with 084's note
-- =============================================================================================
do $$
declare
  n    int;
  note text;
begin
  select count(*) into n
    from attention_items
   where kind = 'conflict' and field = 'bb_column_id' and ref like 'column:%'
     and state = 'open';
  if n <> 0 then
    raise exception 'FAIL % shared/ambiguous gradebook-column conflicts are still open', n;
  end if;

  select resolution_note into note
    from attention_items
   where ref = 'column:_3569973_1' and kind = 'conflict' and field = 'bb_column_id';
  if note is distinct from
     'Closed by 084: a shared gradebook column is handled by 075; nothing to decide.' then
    raise exception 'FAIL the IST.323 row carries the wrong note: %', coalesce(note, '<null>');
  end if;

  if not exists (select 1 from attention_items
                  where ref = 'column:_3569973_1' and state = 'dismissed'
                    and resolved_at is not null) then
    raise exception 'FAIL the IST.323 shared-column row is not dismissed';
  end if;
end $$;

-- =============================================================================================
-- 2. A replay of the newest crawl does not re-raise it - and still restamps (075 stands)
-- =============================================================================================
do $$
declare
  v_run    uuid;
  v_sync   bigint;
  v_before int;
  v_after  int;
  r        jsonb;
  n        int;
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

  -- Prove the two IST.323 rows really do share the column, so the branch under test is reached.
  select count(*) into n from assignments
   where course_id = 'IST.323' and bb_column_id = '_3569973_1';
  if n <> 2 then
    raise exception 'FAIL % assignments carry IST.323 column _3569973_1, expected 2', n;
  end if;

  -- Wind the liveness back the way the P-data-2 bug left it, so the replay has to restamp.
  update assignments set bb_last_seen = timestamptz '2026-09-02 20:32:02.182677+00'
   where id in ('IST.323/fp-proposal', 'IST.323/fp-log-final');
  select count(*) into n from v_calendar_push_items
   where ref_id in ('IST.323/fp-proposal', 'IST.323/fp-log-final') and absent_from_blackboard;
  if n <> 2 then
    raise exception 'FAIL the wind-back did not reproduce P-data-2 (% of 2 rows absent)', n;
  end if;

  select count(*) into v_before from attention_items;
  r := stage_assignments(v_run, v_sync);
  if r->>'status' <> 'ok' then
    raise exception 'FAIL the replay failed: %', r;
  end if;
  select count(*) into v_after from attention_items;

  if v_after <> v_before then
    raise exception 'FAIL the replay raised % new attention_items rows (%s -> %s)',
                    v_after - v_before, v_before, v_after;
  end if;

  if exists (select 1 from attention_items
              where ref = 'column:_3569973_1' and state = 'open') then
    raise exception 'FAIL the replay re-opened the IST.323 shared-column question';
  end if;

  -- 075's contract is untouched: the column is still reported, and its values are still applied
  -- to neither row.
  if (r->'counts'->>'ambiguous_columns')::int < 1 then
    raise exception 'FAIL the replay stopped reporting the shared column: %', r->'counts';
  end if;
  select count(*) into n from assignments
   where id in ('IST.323/fp-proposal', 'IST.323/fp-log-final')
     and bb_last_seen > timestamptz '2026-09-02 20:32:02.182677+00';
  if n <> 2 then
    raise exception 'FAIL the replay restamped % of the 2 shared-column rows', n;
  end if;
  select count(*) into n from v_calendar_push_items
   where ref_id in ('IST.323/fp-proposal', 'IST.323/fp-log-final') and absent_from_blackboard;
  if n <> 0 then
    raise exception 'FAIL % of the 2 rows are still absent after the replay', n;
  end if;
  if exists (select 1 from assignments
              where id in ('IST.323/fp-proposal', 'IST.323/fp-log-final')
                and bb_item_id is distinct from '_12983388_1') then
    raise exception 'FAIL the replay changed the bb_item_id of an IST.323 final-project row';
  end if;
end $$;

-- =============================================================================================
-- 3. A genuinely ambiguous column - several assignments match its NAME, none carries its id -
--    is still raised, and none of them is bound to it
-- =============================================================================================
do $$
declare
  v_run   uuid;
  v_sync  bigint;
  v_raw   bigint;
  v_cid   text;
  v_col   text := '_084_probe_col_1';
  v_name  text := '084 probe column, two title matches';
  r       jsonb;
  n       int;
  q       text;
begin
  select s.run_id, s.id into v_run, v_sync
    from sync_runs s
   where s.source = 'blackboard' and s.status in ('ok','partial')
     and s.scope is distinct from 'unregistered' and s.run_id is not null
   order by s.started_at desc nulls last
   limit 1;

  -- Append one synthetic gradebook column to a course payload of that crawl.
  select b.id, bb_resolve_course(b.bb_course_id) into v_raw, v_cid
    from bb_raw b
   where b.run_id = v_run and b.kind = 'course'
     and bb_resolve_course(b.bb_course_id) is not null
   order by b.id
   limit 1;
  if v_raw is null then
    raise exception 'FAIL no course payload in the newest crawl to append a probe column to';
  end if;

  update bb_raw
     set payload = jsonb_set(payload, '{gradebook}',
                     bb_jarray(payload->'gradebook') ||
                     jsonb_build_array(jsonb_build_object(
                       'columnId', v_col, 'name', v_name,
                       'possible', 40, 'isCalc', false)))
   where id = v_raw;

  -- Two assignments whose title is that column's name, neither bound to any column.
  insert into assignments (id, course_id, title, type, source, source_ref, confidence)
  values (v_cid || '/084-probe-a', v_cid, v_name, bb_assignment_type(v_name),
          'syllabus', 'phase12b_084 test probe', 'confirmed'),
         (v_cid || '/084-probe-b', v_cid, v_name, bb_assignment_type(v_name),
          'syllabus', 'phase12b_084 test probe', 'confirmed');

  r := stage_assignments(v_run, v_sync);
  if r->>'status' <> 'ok' then
    raise exception 'FAIL the probe fold failed: %', r;
  end if;

  select count(*), max(question) into n, q
    from attention_items
   where ref = 'column:' || v_col and kind = 'conflict' and field = 'bb_column_id'
     and state = 'open';
  if n <> 1 then
    raise exception 'FAIL % open conflicts for the genuinely ambiguous probe column, expected 1', n;
  end if;
  if position('is attached to more than one assignment' in q) = 0 then
    raise exception 'FAIL the probe question does not name the ambiguity: %', q;
  end if;

  -- Ambiguous means nothing is applied: neither probe row may have been bound or valued.
  select count(*) into n from assignments
   where id in (v_cid || '/084-probe-a', v_cid || '/084-probe-b')
     and (bb_column_id is not null or points_possible is not null);
  if n <> 0 then
    raise exception 'FAIL the fold bound or valued % of the 2 ambiguous probe rows', n;
  end if;

  -- And the column is counted, not silently dropped.
  if (r->'counts'->>'ambiguous_columns')::int < 2 then
    raise exception 'FAIL the probe column was not counted as ambiguous: %', r->'counts';
  end if;
end $$;

-- =============================================================================================
-- 4. assignment_progress is never touched by any of this
-- =============================================================================================
do $$
declare n int;
begin
  select count(*) into n from assignment_progress
   where assignment_id in ('IST.323/fp-proposal', 'IST.323/fp-log-final')
     and updated_at > now() - interval '1 minute';
  if n <> 0 then
    raise exception 'FAIL % planner-state rows were written by the replay', n;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
-- `open_column_conflicts` excludes section 3's probe row, which exists only inside this
-- transaction and is rolled back with everything else.
select 'phase12b_084_shared_column_conflict: PASS'                                 as result,
       (select count(*) from attention_items
         where kind = 'conflict' and field = 'bb_column_id' and state = 'open'
           and ref <> 'column:_084_probe_col_1')                                   as open_column_conflicts,
       (select count(*) from v_calendar_push_items
         where ref_id in ('IST.323/fp-proposal', 'IST.323/fp-log-final')
           and not absent_from_blackboard)                                         as ist323_pushable;

rollback;
