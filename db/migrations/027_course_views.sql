-- bb2dash :: 027_course_views.sql
-- Phase 8 (W-12). Spec: docs/planning/61_PHASE8_course_dimension.md
-- "§Contract -> Stream feed (v_course_stream, migration 027)" and "Classwork tree
-- (v_content_tree, migration 027)". Column lists are frozen by that contract.
--
-- Both views are `security_invoker = true`. Every view in migrations 001-025 was created
-- without it, so it runs as its owner (`postgres`, which has BYPASSRLS) and hands the caller
-- every row regardless of who is asking - `set role anon; select count(*) from v_work_items`
-- returns all 152 rows today while `select count(*) from assignments` correctly returns 0.
-- Owner-scoped RLS (migration 020) is only worth anything if the views honour it, so these two
-- do. anon loses SELECT on them outright as well.
--
-- Where an arm would otherwise read ONLY through a pre-020 view (which still bypasses RLS even
-- when a security_invoker view selects from it), it is anchored to an owner-scoped base table
-- with an inner join that cannot change the row set:
--   * the file arm joins `courses` (every one of the 60 current files has a course_id),
--   * the assignment_due arm joins `assignments` on the work item's id (a 1:1 primary-key
--     join that the item_kind = 'assignment' filter already guarantees).
-- Those joins are the RLS boundary, not decoration.

-- ---------------------------------------------------------------------------------------------
-- 1. v_course_stream - the Classroom-style feed, one row per post, newest first.
--
--    Course scoping is by SHELL: GEO 103 lecture and recitation each carry their own course_id
--    and the client unions them via v_course_display.shell_ids, exactly as the Course screen
--    already does.
--
--    The `material` kind has two arms on purpose. A harvested file is the better post (it has a
--    bucket, a name and a mime type); a Blackboard content node only becomes a post when no
--    bb_files row claims it, so nothing is listed twice. Reading `bb_files` rather than
--    `v_bb_files_current` in that NOT EXISTS is the contract's wording and also the honest
--    result: the three IST.466 nodes whose only file rows are superseded (roster 35, schedules
--    58 and 16 - migration 022) stay out of the feed, because their current replacements (37,
--    66) are already in it under their own nodes.
-- ---------------------------------------------------------------------------------------------
create view v_course_stream with (security_invoker = true) as
  -- announcements ------------------------------------------------------------------------
  select a.course_id                                as course_id,
         'announcement'::text                       as post_kind,
         coalesce(a.posted_at, a.captured_at)       as posted_at,
         'announcement'::text                       as ref_kind,
         a.id::text                                 as ref_id,
         a.title                                    as title,
         a.body                                     as body,
         jsonb_build_object('is_read', a.is_read)   as meta
    from announcements a

  union all

  -- harvested files ----------------------------------------------------------------------
  select f.course_id,
         'material'::text,
         coalesce(f.bb_modified_at, f.downloaded_at, f.captured_at),
         'bb_file'::text,
         f.id::text,
         f.file_name,
         f.path,
         jsonb_build_object('bucket',    f.bucket::text,
                            'file_name', f.file_name,
                            'mime_type', f.mime_type)
    from v_bb_files_current f
    join courses c on c.id = f.course_id

  union all

  -- Blackboard content nodes that no harvested file represents ----------------------------
  select b.course_id,
         'material'::text,
         coalesce(b.modified_at, b.captured_at),
         'bb_content'::text,
         b.id::text,
         b.title,
         b.path,
         jsonb_build_object('bucket',    null::text,
                            'file_name', null::text,
                            'mime_type', null::text,
                            'item_kind', b.item_kind,
                            'url',       b.url)
    from bb_content b
   where b.item_kind in ('document', 'link', 'file')
     and not exists (select 1
                       from bb_files f
                      where f.course_id = b.course_id
                        and f.content_id = b.bb_item_id)

  union all

  -- assignments as Blackboard published them ----------------------------------------------
  select a.course_id,
         'assignment_posted'::text,
         coalesce(a.available_from, a.created_at),
         'assignment'::text,
         a.id,
         a.title,
         a.description,
         jsonb_build_object('due_on',          coalesce(a.due_at::date, a.due_date),
                            'points_possible', a.points_possible,
                            'type',            a.type::text,
                            'status',          coalesce(p.status::text, 'not_started'))
    from assignments a
    left join assignment_progress p on p.assignment_id = a.id
   where a.source = 'blackboard'

  union all

  -- the same assignments again, posted at their due moment ---------------------------------
  -- due_on is a DATE; the feed sorts on a timestamptz, so it is read as local midnight in
  -- America/New_York rather than UTC midnight, which would land the post on the wrong day.
  -- The client shows this kind only inside a +/-14 day window of today.
  select w.course_id,
         'assignment_due'::text,
         (w.due_on::timestamp at time zone 'America/New_York'),
         'assignment'::text,
         w.item_id,
         w.title,
         a.description,
         jsonb_build_object('due_on',          w.due_on,
                            'points_possible', w.points_possible,
                            'type',            w.type,
                            'status',          w.status)
    from v_work_items w
    join assignments a on a.id = w.item_id
   where w.item_kind = 'assignment'
     and w.due_on is not null

  order by posted_at desc nulls last;

comment on view v_course_stream is
  'Course Stream feed (Phase 8): one row per post, newest first, over the shell course_id. '
  'post_kind announcement | material | assignment_posted | assignment_due; ref_kind/ref_id '
  'name the underlying row (announcement | bb_file | bb_content | assignment). meta carries '
  '{is_read} for announcements, {bucket, file_name, mime_type} for materials (all null on the '
  'bb_content arm, which adds item_kind and url instead) and {due_on, points_possible, type, '
  'status} for both assignment kinds. assignment_due posts at local midnight in '
  'America/New_York; the client windows it to +/-14 days. security_invoker: owner-scoped RLS '
  'applies.';

-- ---------------------------------------------------------------------------------------------
-- 2. v_content_tree - Classwork, grouped by Blackboard's own folders.
--
--    One row per (content node, file). A node carrying several files yields several rows and
--    the client groups by content_id; a node carrying none still appears once, with null file
--    columns. Ordering is by path, which puts a folder immediately before its children because
--    a child's path is the parent's path plus one segment.
-- ---------------------------------------------------------------------------------------------
create view v_content_tree with (security_invoker = true) as
select b.course_id                                        as course_id,
       b.id                                               as content_id,
       b.parent_id                                        as parent_id,
       b.bb_item_id                                       as bb_item_id,
       b.path                                             as path,
       array_length(string_to_array(b.path, ' / '), 1)    as depth,
       b.title                                            as title,
       b.item_kind                                        as item_kind,
       b.bb_type                                          as bb_type,
       b.state                                            as state,
       b.url                                              as url,
       b.modified_at                                      as modified_at,
       b.assignment_id                                    as assignment_id,
       f.id                                               as file_id,
       f.file_name                                        as file_name,
       f.storage_path                                     as storage_path,
       f.bucket::text                                     as bucket
  from bb_content b
  left join v_bb_files_current f
         on f.course_id = b.course_id
        and f.content_id = b.bb_item_id
 order by b.course_id, b.path, f.id;

comment on view v_content_tree is
  'Classwork tree (Phase 8): bb_content as Blackboard publishes it, one row per (node, current '
  'file). path is the '' / ''-separated breadcrumb and is unique per course; depth counts its '
  'segments; state is Ultra progress (Started | Completed | None). file_id/file_name/'
  'storage_path/bucket come from v_bb_files_current joined on (course_id, content_id = '
  'bb_item_id) and are null when no harvested file claims the node. Ordered by path, which '
  'places a folder immediately before its children. security_invoker: owner-scoped RLS applies.';

-- ---------------------------------------------------------------------------------------------
-- 3. Grants. Supabase's default privileges hand every new relation in `public` to anon as well;
--    these two views carry the owner's coursework, so anon is revoked explicitly. With
--    security_invoker anon would already read zero rows - this is the belt to that pair of
--    braces.
-- ---------------------------------------------------------------------------------------------
revoke all on v_course_stream from anon;
revoke all on v_content_tree from anon;
grant select on v_course_stream to authenticated, service_role;
grant select on v_content_tree to authenticated, service_role;
