-- bb2dash :: 130_bb_content_ghost_collapse.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), task 3 (R-64, P-25).
-- Worker W-52. DATA only: no object is created or changed. Applied back to back with 131, while
-- no sync request is queued or claimed.
--
-- WHY. bb_content is keyed (course_id, path) until 131. When Blackboard renames or moves an
-- item, stage_content (026) cannot find its row by path, inserts a second row under the new
-- path and stamps the old one detail.missing_since. The item is one item in Blackboard and two
-- rows here: one live, one ghost. 131 keys the table on (course_id, bb_item_id), which those
-- pairs would violate, so they are merged first.
--
-- STACK'S CALL (B-19, 2026-10-02: "Yes, merge"). This is one of Phase 19's two named exceptions
-- to "migrations are additive": the ghost rows are DELETED, after everything they hold is
-- carried to the live row. A ghost is a second copy of an item Blackboard still lists, so no
-- item Blackboard lists loses its row. Rows that are stale with no live twin (really gone, or
-- re-created under a new id) are not touched.
--
-- WHAT IS A PAIR. Two rows of one (course_id, bb_item_id) where exactly one row of that item is
-- live (detail.missing_since absent) and the other carries detail.missing_since. Pairs are
-- found in SQL at run time. No count and no row id is written in this file (21 pairs on
-- 2026-10-02, 16 on 2026-09-24). An item with two live rows, or with none, is not a pair; it
-- is left alone and the closing check then refuses the whole migration.
--
-- PER PAIR, in this order:
--   1. assignment_id is carried to the live row where the live row's is null (Phase 17's 112
--      already moved IST.352's three Knowledge Check links, so this is expected to move 0; it
--      is here so a link can never be deleted with its ghost). A ghost whose link differs from
--      a link the live row already holds refuses the migration: that is a call for Stack.
--   2. the ghost's path is appended to the live row's detail.previous_paths (a jsonb array of
--      strings, oldest first; skipped when it equals the live path or is already recorded).
--      131's stage_content carries that key on every later fold.
--   3. every row whose parent_id is the ghost is re-pointed at the live row.
--   4. the ghost is deleted.
--
-- CLOSING CHECK, inside the same block so the whole change is one statement: it raises, and
-- nothing is kept, if any (course_id, bb_item_id) is still held by more than one row, if a
-- vanished row carries an assignment link (P-11, re-checked), or if the rows deleted are not
-- exactly the ghosts found.
--
-- Never touches assignment_progress, reading_progress, bb_files or assignments.

do $$
declare
  v_open      bigint;
  v_pairs     bigint;
  v_links     bigint := 0;
  v_paths     bigint := 0;
  v_children  bigint := 0;
  v_deleted   bigint := 0;
  v_before    bigint;
  v_after     bigint;
  v_left      bigint;
  v_bad       text;
begin
  -- No sync may be in flight: a fold between 130 and 131 would run 026's path-keyed upsert
  -- over the merged rows.
  select count(*) into v_open
    from public.agent_requests
   where kind = 'sync' and state in ('queued', 'claimed');
  if v_open <> 0 then
    raise exception '130 refused: % sync request(s) are queued or claimed', v_open;
  end if;

  select count(*) into v_before from public.bb_content;

  create temporary table _ghost_pairs on commit drop as
  select g.id            as ghost_id,
         l.id            as live_id,
         g.path          as ghost_path,
         g.assignment_id as ghost_assignment_id
    from public.bb_content g
    join public.bb_content l
      on l.course_id = g.course_id
     and l.bb_item_id = g.bb_item_id
     and l.id <> g.id
   where g.detail ->> 'missing_since' is not null
     and l.detail ->> 'missing_since' is null
     and (select count(*)
            from public.bb_content x
           where x.course_id = g.course_id
             and x.bb_item_id = g.bb_item_id
             and x.detail ->> 'missing_since' is null) = 1;

  select count(*) into v_pairs from _ghost_pairs;

  -- 1. Links. Refuse a disagreement instead of dropping either side.
  select string_agg(format('%s/%s', p.ghost_id, p.live_id), ', ' order by p.ghost_id) into v_bad
    from _ghost_pairs p
    join public.bb_content l on l.id = p.live_id
   where p.ghost_assignment_id is not null
     and l.assignment_id is not null
     and l.assignment_id <> p.ghost_assignment_id;
  if v_bad is not null then
    raise exception '130 refused: ghost/live pair(s) % carry different assignment links', v_bad;
  end if;

  update public.bb_content l
     set assignment_id = c.ghost_assignment_id
    from (select distinct on (p.live_id) p.live_id, p.ghost_assignment_id
            from _ghost_pairs p
           where p.ghost_assignment_id is not null
           order by p.live_id, p.ghost_id) c
   where l.id = c.live_id
     and l.assignment_id is null;
  get diagnostics v_links = row_count;

  -- 2. Paths.
  update public.bb_content l
     set detail = coalesce(nullif(l.detail, 'null'::jsonb), '{}'::jsonb)
                  || jsonb_build_object(
                       'previous_paths',
                       coalesce(l.detail -> 'previous_paths', '[]'::jsonb) || a.paths)
    from (select p.live_id, jsonb_agg(p.ghost_path order by p.ghost_id) as paths
            from _ghost_pairs p
            join public.bb_content lv on lv.id = p.live_id
           where p.ghost_path is not null
             and p.ghost_path is distinct from lv.path
             and not (coalesce(lv.detail -> 'previous_paths', '[]'::jsonb) @> to_jsonb(p.ghost_path))
           group by p.live_id) a
   where l.id = a.live_id;
  get diagnostics v_paths = row_count;

  -- 3. Children. A child that is itself a ghost is re-pointed too, then deleted in step 4.
  update public.bb_content c
     set parent_id = p.live_id
    from _ghost_pairs p
   where c.parent_id = p.ghost_id;
  get diagnostics v_children = row_count;

  -- 4. The ghosts.
  delete from public.bb_content b
   using _ghost_pairs p
   where b.id = p.ghost_id;
  get diagnostics v_deleted = row_count;

  -- Closing check.
  select count(*) into v_after from public.bb_content;
  select count(*) into v_left
    from (select course_id, bb_item_id
            from public.bb_content
           group by course_id, bb_item_id
          having count(*) > 1) d;
  if v_left <> 0 then
    raise exception '130 failed: % (course_id, bb_item_id) pair(s) remain after the merge', v_left;
  end if;
  if v_deleted <> v_pairs or v_before - v_after <> v_pairs then
    raise exception '130 failed: % pair(s) found, % row(s) deleted, % -> % rows',
      v_pairs, v_deleted, v_before, v_after;
  end if;
  if exists (select 1 from public.bb_content
              where assignment_id is not null and detail ->> 'missing_since' is not null) then
    raise exception '130 failed: a vanished row carries an assignment link';
  end if;

  drop table _ghost_pairs;

  raise notice '130: % pair(s) merged; % link(s) carried, % live row(s) given previous_paths, % child row(s) re-pointed, % -> % rows',
    v_pairs, v_links, v_paths, v_children, v_before, v_after;
end $$;
