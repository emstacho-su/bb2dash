-- bb2dash :: 110_course_stream_unread_filters.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-03 (P-9, R-37, R-39).
-- Worker W-44. 001-102 are applied; 027 is byte-frozen, so `v_course_stream` is re-created here
-- with `create or replace` from its LIVE prod body (pg_get_viewdef, read 2026-09-29, identical
-- to 027's), keeping the same 8 columns in the same order and the same types.
--
-- What changes, arm by arm:
--   * announcement: `meta` gains `is_unread`, the bell's predicate (063, DECISIONS 2026-09-15:
--     unread = `read_at is null and is_read is distinct from true`), so the Stream's "unread" tag
--     agrees with the bell (B-17). `is_read` stays for any reader of the old key.
--   * bb_file: `meta` gains `storage_path` and `source_url`, so the Stream row can hand
--     `FileOpenAction` its routes. The arm drops Stack's own submissions (`bucket =
--     'my_submissions'`, 105 §3) and files `stage_files` has marked vanished (the P-98
--     `missing_since_run=` note, 053).
--   * bb_content: the arm drops nodes Blackboard no longer lists (`detail->>'missing_since'`).
--   * the two assignment arms are unchanged.
--
-- security_invoker is kept, anon stays revoked, select is re-asserted to authenticated and
-- service_role, and the comment names the new keys. Phase 19's 133 re-creates this view from
-- this body.

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
    COALESCE(f.bb_modified_at, f.downloaded_at, f.captured_at) AS posted_at,
    'bb_file'::text AS ref_kind,
    f.id::text AS ref_id,
    f.file_name AS title,
    f.path AS body,
    jsonb_build_object('bucket', f.bucket::text, 'file_name', f.file_name, 'mime_type', f.mime_type,
                       'storage_path', f.storage_path, 'source_url', f.source_url) AS meta
   FROM v_bb_files_current f
     JOIN courses c ON c.id = f.course_id
  WHERE f.bucket IS DISTINCT FROM 'my_submissions'
    AND COALESCE(f.notes, ''::text) NOT LIKE '%missing_since_run=%'
UNION ALL
 SELECT b.course_id,
    'material'::text AS post_kind,
    COALESCE(b.modified_at, b.captured_at) AS posted_at,
    'bb_content'::text AS ref_kind,
    b.id::text AS ref_id,
    b.title,
    b.path AS body,
    jsonb_build_object('bucket', NULL::text, 'file_name', NULL::text, 'mime_type', NULL::text, 'item_kind', b.item_kind, 'url', b.url) AS meta
   FROM bb_content b
  WHERE (b.item_kind = ANY (ARRAY['document'::text, 'link'::text, 'file'::text]))
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
  'Course Stream feed (Phase 8; filters and keys 110): one row per post, newest first, over the '
  'shell course_id. post_kind announcement | material | assignment_posted | assignment_due; '
  'ref_kind/ref_id name the underlying row (announcement | bb_file | bb_content | assignment). '
  'meta carries {is_read, is_unread} for announcements (is_unread is the bell''s predicate, 063: '
  'read_at is null and is_read is distinct from true), {bucket, file_name, mime_type, '
  'storage_path, source_url} for files ({bucket, file_name, mime_type} all null on the '
  'bb_content arm, which adds item_kind and url instead) and {due_on, points_possible, type, status} for both '
  'assignment kinds. Left out (110): my_submissions files, files noted missing_since_run= and '
  'bb_content nodes with detail.missing_since. assignment_due posts at local midnight in '
  'America/New_York; the client windows it to +/-14 days. security_invoker: owner-scoped RLS '
  'applies.';

revoke all on public.v_course_stream from anon;
grant select on public.v_course_stream to authenticated, service_role;
