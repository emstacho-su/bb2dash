-- bb2dash :: 133_course_stream_history.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), task 9 (R-38, B-18).
-- Worker W-52.
--
-- HOW THIS WAS BUILT. `v_course_stream` is re-created with `create or replace` from its LIVE
-- prod body, read with `select pg_get_viewdef('public.v_course_stream'::regclass, true)` on
-- 2026-10-02: Phase 17's 110 (027 stays frozen). The same 8 columns in the same order and with
-- the same types. The announcement arm and the two assignment arms are 110's text, unchanged.
--
-- WHAT CHANGES. The two material arms no longer list every current file and node on every
-- read. They post from bb_material_history (132): one post per file or node that APPEARED or
-- CHANGED in a registered crawl, dated by that crawl (posted_at = the history row's seen_at).
-- A vanished item is not posted (Activity names it, 134). The first crawl of a course is a
-- baseline with no rows, so nothing posts for it.
--   * bb_file arm: history rows of entity `file` joined to v_bb_files_current on bb_file_id,
--     so a superseded file does not post. Phase 17's filters are kept: no my_submissions file
--     and no file noted `missing_since_run=`. One post per (run, file): when two history rows
--     of one run name the same catalogued file, the `appeared` row wins.
--   * bb_content arm: history rows of entity `content` joined to bb_content on
--     (course_id, bb_item_id), with 027's item kinds (document, link, file), Phase 17's rule
--     that a vanished node does not post, and 027's rule that a node a bb_files row claims
--     posts through its file instead.
--   * meta keeps every key 110 gave each arm and gains `change` (appeared | changed) and
--     `run_id` (the crawl), so the Stream can label a post New or Changed and key it per crawl.
--
-- security_invoker is kept (036), so bb_material_history's owner-read policy applies to the
-- reader. anon stays revoked; select is re-asserted to authenticated and service_role.
-- db_test_runner gets insert, update, delete on bb_material_history because this migration's
-- test and phase17_110 seed history rows (brief 99, Test role).

create or replace view public.v_course_stream with (security_invoker = true) as
 SELECT a.course_id,
    'announcement'::text AS post_kind,
    COALESCE(a.posted_at, a.captured_at) AS posted_at,
    'announcement'::text AS ref_kind,
    a.id::text AS ref_id,
    a.title,
    a.body,
    jsonb_build_object('is_read', a.is_read,
                       'is_unread', (a.read_at IS NULL AND a.is_read IS DISTINCT FROM true)) AS meta
   FROM announcements a
UNION ALL
 SELECT f.course_id,
    'material'::text AS post_kind,
    h.seen_at AS posted_at,
    'bb_file'::text AS ref_kind,
    f.id::text AS ref_id,
    f.file_name AS title,
    f.path AS body,
    jsonb_build_object('bucket', f.bucket::text, 'file_name', f.file_name, 'mime_type', f.mime_type,
                       'storage_path', f.storage_path, 'source_url', f.source_url,
                       'change', h.change, 'run_id', h.run_id) AS meta
   FROM ( SELECT DISTINCT ON (fh.run_id, fh.bb_file_id)
                 fh.run_id, fh.bb_file_id, fh.change, fh.seen_at
            FROM bb_material_history fh
           WHERE fh.entity = 'file'
             AND fh.change = ANY (ARRAY['appeared'::text, 'changed'::text])
             AND fh.bb_file_id IS NOT NULL
           ORDER BY fh.run_id, fh.bb_file_id, (fh.change = 'appeared') DESC, fh.id) h
     JOIN v_bb_files_current f ON f.id = h.bb_file_id
     JOIN courses c ON c.id = f.course_id
  WHERE f.bucket IS DISTINCT FROM 'my_submissions'
    AND COALESCE(f.notes, ''::text) NOT LIKE '%missing_since_run=%'
UNION ALL
 SELECT b.course_id,
    'material'::text AS post_kind,
    h.seen_at AS posted_at,
    'bb_content'::text AS ref_kind,
    b.id::text AS ref_id,
    b.title,
    b.path AS body,
    jsonb_build_object('bucket', NULL::text, 'file_name', NULL::text, 'mime_type', NULL::text,
                       'item_kind', b.item_kind, 'url', b.url,
                       'change', h.change, 'run_id', h.run_id) AS meta
   FROM bb_material_history h
     JOIN bb_content b ON b.course_id = h.course_id AND b.bb_item_id = h.bb_item_id
  WHERE h.entity = 'content'
    AND h.change = ANY (ARRAY['appeared'::text, 'changed'::text])
    AND (b.item_kind = ANY (ARRAY['document'::text, 'link'::text, 'file'::text]))
    AND (b.detail ->> 'missing_since') IS NULL
    AND NOT (EXISTS ( SELECT 1
           FROM bb_files f
          WHERE f.course_id = b.course_id AND f.content_id = b.bb_item_id))
UNION ALL
 SELECT a.course_id,
    'assignment_posted'::text AS post_kind,
    COALESCE(a.available_from, a.created_at) AS posted_at,
    'assignment'::text AS ref_kind,
    a.id AS ref_id,
    a.title,
    a.description AS body,
    jsonb_build_object('due_on', COALESCE(a.due_at::date, a.due_date), 'points_possible', a.points_possible, 'type', a.type::text, 'status', COALESCE(p.status::text, 'not_started'::text)) AS meta
   FROM assignments a
     LEFT JOIN assignment_progress p ON p.assignment_id = a.id
  WHERE a.source = 'blackboard'::data_source
UNION ALL
 SELECT w.course_id,
    'assignment_due'::text AS post_kind,
    (w.due_on::timestamp without time zone AT TIME ZONE 'America/New_York'::text) AS posted_at,
    'assignment'::text AS ref_kind,
    w.item_id AS ref_id,
    w.title,
    a.description AS body,
    jsonb_build_object('due_on', w.due_on, 'points_possible', w.points_possible, 'type', w.type, 'status', w.status) AS meta
   FROM v_work_items w
     JOIN assignments a ON a.id = w.item_id
  WHERE w.item_kind = 'assignment'::text AND w.due_on IS NOT NULL
  ORDER BY 3 DESC NULLS LAST;

comment on view public.v_course_stream is
  'Course Stream feed (Phase 8; filters and keys 110; material posts from history 133): one row '
  'per post, newest first, over the shell course_id. post_kind announcement | material | '
  'assignment_posted | assignment_due; ref_kind/ref_id name the underlying row (announcement | '
  'bb_file | bb_content | assignment). A material post is one bb_material_history row that '
  'appeared or changed in a registered crawl, dated by that crawl (posted_at = seen_at); '
  'vanished items and a course''s baseline crawl post nothing, and one file or node posts once '
  'per crawl it changed in. meta carries {is_read, is_unread} for announcements (is_unread is '
  'the bell''s predicate, 063: read_at is null and is_read is distinct from true), {bucket, '
  'file_name, mime_type, storage_path, source_url, change, run_id} for files ({bucket, '
  'file_name, mime_type} all null on the bb_content arm, which adds item_kind, url, change and '
  'run_id instead; change is appeared | changed) and {due_on, points_possible, type, status} for '
  'both assignment kinds. Left out: my_submissions files, files noted missing_since_run=, '
  'superseded files, bb_content nodes with detail.missing_since, and nodes a file claims. '
  'assignment_due posts at local midnight in America/New_York; the client windows it to '
  '+/-14 days. security_invoker: owner-scoped RLS applies.';

revoke all on public.v_course_stream from anon;
grant select on public.v_course_stream to authenticated, service_role;

grant insert, update, delete on public.bb_material_history to db_test_runner;
grant usage on sequence public.bb_material_history_id_seq to db_test_runner;
