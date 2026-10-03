-- bb2dash :: db/tests/phase19_130_ghost_collapse.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), tasks 1 and 3. Worker W-52.
-- Tests migration 130 (data): the ghost rows are merged into their live twins (R-64, P-25, B-19).
--
-- 130 is a one-off data change, not a function, so this unit asserts the state it leaves on prod:
--   (1) no (course_id, bb_item_id) is held by more than one bb_content row
--   (2) no row Blackboard no longer lists (detail.missing_since) carries an assignment link
--       (Phase 17's P-11 moves, re-checked)
--   (3) the merge kept the ghosts' paths: at least one row carries detail.previous_paths, and
--       every previous_paths value is a non-empty array of non-blank strings
--   (4) no row is its own parent, and no live row hangs under a row that shares its item id
--       with another row (a child left on a ghost)
-- Counts are read from prod, never written here as literals: 21 pairs on 2026-10-02, but the
-- unit only says "none remain".
--
-- Read-only. It fails before 130 is applied (pairs remain, no previous_paths). Failures are
-- collected and raised once. RUN IT: `node scripts/db-test.mjs --only phase19_130_ghost_collapse.sql`,
-- or paste the whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

do $$
declare
  v_fail text[] := '{}';
  v_n    bigint;
begin
  -- (1)
  select count(*) into v_n
    from (select course_id, bb_item_id from bb_content group by 1, 2 having count(*) > 1) d;
  if v_n <> 0 then
    v_fail := v_fail || format('(1) %s (course_id, bb_item_id) pair(s) still held by more than one row', v_n);
  end if;

  -- (2)
  select count(*) into v_n
    from bb_content where assignment_id is not null and detail->>'missing_since' is not null;
  if v_n <> 0 then
    v_fail := v_fail || format('(2) %s vanished row(s) carry an assignment link', v_n);
  end if;

  -- (3)
  select count(*) into v_n from bb_content where detail ? 'previous_paths';
  if v_n = 0 then
    v_fail := v_fail || '(3) no row carries detail.previous_paths: the ghosts'' paths were not kept'::text;
  end if;
  select count(*) into v_n
    from bb_content b
   where b.detail ? 'previous_paths'
     and (jsonb_typeof(b.detail->'previous_paths') is distinct from 'array'
          or jsonb_array_length(b.detail->'previous_paths') = 0
          or exists (select 1 from jsonb_array_elements(b.detail->'previous_paths') e
                      where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = ''));
  if v_n <> 0 then
    v_fail := v_fail || format('(3) %s row(s) carry a malformed previous_paths', v_n);
  end if;

  -- (4)
  select count(*) into v_n from bb_content where parent_id = id;
  if v_n <> 0 then
    v_fail := v_fail || format('(4) %s row(s) are their own parent', v_n);
  end if;
  select count(*) into v_n
    from bb_content c
    join bb_content p on p.id = c.parent_id
   where c.detail->>'missing_since' is null
     and exists (select 1 from bb_content t
                  where t.course_id = p.course_id and t.bb_item_id = p.bb_item_id and t.id <> p.id);
  if v_n <> 0 then
    v_fail := v_fail || format('(4) %s live row(s) hang under a row that has a twin', v_n);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_130: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase19_130_ghost_collapse: PASS'                                             as result,
       (select count(*) from bb_content)                                              as content_rows,
       (select count(*) from bb_content where detail->>'missing_since' is not null)   as vanished_rows,
       (select count(*) from bb_content where detail ? 'previous_paths')              as rows_with_previous_paths;

rollback;
