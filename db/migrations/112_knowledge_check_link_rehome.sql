-- bb2dash :: 112_knowledge_check_link_rehome.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-05 (P-11, R-39).
-- Worker W-44. DATA only: no object is created or changed.
--
-- IST.352's three Knowledge Checks are linked to assignments through `bb_content.assignment_id`
-- on rows 58, 59 and 60. Blackboard re-listed those three items under new content rows 1602,
-- 1603 and 1604 (same `bb_item_id`), and `stage_content` stamped the old rows
-- `detail.missing_since`. Classwork hides a node whose live twin shares its `bb_item_id` (T-13),
-- so the drop zone would disappear with the ghost. This moves each link onto its live twin:
-- the live row is stamped first, then the stale row is nulled. `stage_content` never writes
-- `assignment_id` (026:10), so the move holds across syncs. Phase 19's 130 re-checks it.
--
-- The guard aborts unless exactly these three pairs match: same course, same `bb_item_id`, the
-- stale row vanished and linked, the live row present and unlinked. On a second run (the move
-- already made) the guard aborts rather than guessing.

do $$
declare
  v_pairs bigint;
begin
  select count(*) into v_pairs
    from (values (58::bigint, 1602::bigint), (59, 1603), (60, 1604)) p(stale_id, live_id)
    join bb_content s on s.id = p.stale_id
    join bb_content l on l.id = p.live_id
   where s.course_id = 'IST.352'
     and l.course_id = s.course_id
     and l.bb_item_id = s.bb_item_id
     and s.detail->>'missing_since' is not null
     and l.detail->>'missing_since' is null
     and s.assignment_id is not null
     and l.assignment_id is null;
  if v_pairs <> 3 then
    raise exception '112 refused: % of the 3 stale/live Knowledge Check pairs match (58/1602, 59/1603, 60/1604)', v_pairs;
  end if;
end $$;

update public.bb_content l
   set assignment_id = s.assignment_id
  from (values (58::bigint, 1602::bigint), (59, 1603), (60, 1604)) p(stale_id, live_id)
  join public.bb_content s on s.id = p.stale_id
 where l.id = p.live_id;

update public.bb_content
   set assignment_id = null
 where id in (58, 59, 60);

do $$
begin
  if (select count(*) from bb_content where id in (1602, 1603, 1604) and assignment_id is not null) <> 3
     or exists (select 1 from bb_content where id in (58, 59, 60) and assignment_id is not null) then
    raise exception '112 failed: the three links did not land on 1602, 1603, 1604';
  end if;
end $$;
