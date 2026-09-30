-- bb2dash :: 111_content_tree_missing_notes.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-04 (P-10, R-39, R-40).
-- Worker W-44. 027 is byte-frozen, so `v_content_tree` is re-created here with `create or
-- replace` from its LIVE prod body (pg_get_viewdef, read 2026-09-29, identical to 027's).
--
-- Two columns are appended last, so the 17 existing columns keep their names, order and types
-- (`create or replace view` only allows appending):
--   * missing_since uuid - `(b.detail->>'missing_since')::uuid`, the run id `stage_content`
--     stamps when Blackboard stops listing a node (the P-98 vanish convention). It is a view
--     projection of that convention, not a stored column. Classwork uses it to hide ghosts and
--     put stale nodes behind a toggle (T-13).
--   * notes text - `f.notes` of the joined current file, for the file row's hover (R-40).
-- The order by is unchanged. Phase 19's 131 only re-comments this view.
--
-- The guard block runs first and aborts if any `detail->>'missing_since'` on prod would not cast
-- to uuid (21 of 21 cast on 2026-09-29), because one bad value would make every read of the view
-- fail.

do $$
declare
  v_bad bigint;
begin
  select count(*) into v_bad
    from bb_content
   where detail->>'missing_since' is not null
     and detail->>'missing_since' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad > 0 then
    raise exception '111 refused: % bb_content rows carry a detail.missing_since that is not a uuid', v_bad;
  end if;
end $$;

create or replace view public.v_content_tree with (security_invoker = true) as
 SELECT b.course_id,
    b.id AS content_id,
    b.parent_id,
    b.bb_item_id,
    b.path,
    array_length(string_to_array(b.path, ' / '::text), 1) AS depth,
    b.title,
    b.item_kind,
    b.bb_type,
    b.state,
    b.url,
    b.modified_at,
    b.assignment_id,
    f.id AS file_id,
    f.file_name,
    f.storage_path,
    f.bucket::text AS bucket,
    (b.detail ->> 'missing_since')::uuid AS missing_since,
    f.notes
   FROM bb_content b
     LEFT JOIN v_bb_files_current f ON f.course_id = b.course_id AND f.content_id = b.bb_item_id
  ORDER BY b.course_id, b.path, f.id;

comment on view public.v_content_tree is
  'Classwork tree (Phase 8; missing_since and notes 111): bb_content as Blackboard publishes it, '
  'one row per (node, current file). path is the '' / ''-separated breadcrumb and is unique per '
  'course; depth counts its segments; state is Ultra progress (Started | Completed | None). '
  'file_id/file_name/storage_path/bucket/notes come from v_bb_files_current joined on '
  '(course_id, content_id = bb_item_id) and are null when no harvested file claims the node. '
  'missing_since is detail->>''missing_since'' cast to uuid: the sync run that first found the '
  'node gone from Blackboard (P-98), a projection, not a stored column; null for a live node. '
  'Ordered by path, which places a folder immediately before its children. security_invoker: '
  'owner-scoped RLS applies.';

revoke all on public.v_content_tree from anon;
grant select on public.v_content_tree to authenticated, service_role;
