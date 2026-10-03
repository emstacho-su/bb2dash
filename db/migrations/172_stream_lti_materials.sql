-- bb2dash :: 172_stream_lti_materials.sql
-- Phase 19 round 4 (Stack, 2026-10-03, on the first register-first sync: "Videos don't need to
-- be downloaded and stored... Only keep the link to it."). Worker W-52. Block 170-179.
--
-- HOW THIS WAS BUILT. Read on prod on 2026-10-03, after 170 and 171 were applied:
--   * `v_course_stream` from `select pg_get_viewdef('public.v_course_stream'::regclass, true)`,
--     md5 8059c79fce2db2c316c3cb7de49f579b (170's body; 170 stays frozen).
--   * `material_history_record` from
--     `select pg_get_functiondef('public.material_history_record(uuid)'::regprocedure)`,
--     md5(prosrc) af19c79f8e00a9608f220dd8986e4bd5 (170's body).
-- Both are re-created from those bodies with ONE change each, and their comments say so;
-- nothing else changes, grants included.
--
-- WHY. Sync 866 (run 3a7b8572-726f-42ce-8277-e65197610e1f) recorded a new Kaltura video, "IST-323
-- Lab #2 Tips" (`_13292201_1`, item_kind `lti`, bb_type `resource/x-bb-blti-link`), as
-- `appeared` in bb_material_history, but it never posted: the Stream's content arm took only
-- `document`, `link` and `file` nodes. An LTI item is a material Stack wants to see, as a link.
--   * v_course_stream: the content arm's item kinds gain 'lti'. The post is a `bb_content` row
--     with meta.item_kind = 'lti' and meta.url, the same shape as a link. 170's
--     material_history_record reads `appeared` and `changed` from this view, so Activity counts
--     it with no change to the function's counting of those two.
--   * material_history_record: the `vanished` rule's kinds gain 'lti', so a video that is gone
--     is named in Activity like a link that is gone.
-- Nothing is downloaded or catalogued for a video: stage_files reads only `embeddedFiles` and
-- `detail.file`, and an LTI item carries neither (its url is in `detail.url`), so no bb_files row
-- and no `file` history row is ever made for it (phase19_172 runs stage_files to prove it).
-- On 2026-10-03 two existing history rows newly post: the Lab #2 Tips `appeared` row and
-- IST.323's "Orange Instant Access" `changed` row (crawl 6b122650).

-- =============================================================================================
-- 1. v_course_stream
-- =============================================================================================

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
 SELECT h.course_id,
    'material'::text AS post_kind,
    h.seen_at AS posted_at,
    'bb_file'::text AS ref_kind,
    f.id::text AS ref_id,
    f.file_name AS title,
    f.path AS body,
    jsonb_build_object('bucket', f.bucket::text, 'file_name', f.file_name, 'mime_type', f.mime_type,
                       'storage_path', f.storage_path, 'source_url', f.source_url,
                       'change', h.change, 'run_id', h.run_id) AS meta
   FROM ( SELECT DISTINCT ON (fh.course_id, fh.run_id, fid.file_id)
                 fh.course_id, fh.run_id, fid.file_id, fh.change, fh.seen_at
            FROM bb_material_history fh
            CROSS JOIN LATERAL ( SELECT COALESCE(fh.bb_file_id,
                     ( SELECT cf.id
                         FROM v_bb_files_current cf
                        WHERE cf.course_id = fh.course_id
                          AND cf.content_id = fh.bb_item_id
                          AND cf.file_name = fh.file_name
                        ORDER BY cf.id DESC
                        LIMIT 1)) AS file_id) fid
           WHERE fh.entity = 'file'
             AND fh.change = ANY (ARRAY['appeared'::text, 'changed'::text])
             AND fid.file_id IS NOT NULL
           ORDER BY fh.course_id, fh.run_id, fid.file_id, (fh.change = 'appeared') DESC, fh.id) h
     JOIN v_bb_files_current f ON f.id = h.file_id AND f.course_id = h.course_id
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
    AND (b.item_kind = ANY (ARRAY['document'::text, 'link'::text, 'file'::text, 'lti'::text]))
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
  'Course Stream feed (Phase 8; filters and keys 110; material posts from history 133; null '
  'file ids resolved at read time 170; LTI items such as Kaltura videos post as links 172): one '
  'row per post, newest first, over the shell '
  'course_id. post_kind announcement | material | assignment_posted | assignment_due; '
  'ref_kind/ref_id name the underlying row (announcement | bb_file | bb_content | assignment). '
  'A material post is one bb_material_history row that appeared or changed in a registered '
  'crawl, dated by that crawl (posted_at = seen_at); vanished items and a course''s baseline '
  'crawl post nothing, and one file or node posts once per crawl it changed in. A file row '
  'whose bb_file_id is null is matched at read time on (course_id, content_id = bb_item_id, '
  'file_name). meta carries {is_read, is_unread} for announcements (is_unread is the bell''s '
  'predicate, 063: read_at is null and is_read is distinct from true), {bucket, file_name, '
  'mime_type, storage_path, source_url, change, run_id} for files ({bucket, file_name, '
  'mime_type} all null on the bb_content arm, which adds item_kind, url, change and run_id '
  'instead, item_kind being document | link | file | lti; change is appeared | changed) and '
  '{due_on, points_possible, type, status} for both '
  'assignment kinds. Left out: my_submissions files, files noted missing_since_run=, '
  'superseded files, bb_content nodes with detail.missing_since, and nodes a file claims. '
  'assignment_due posts at local midnight in America/New_York; the client windows it to '
  '+/-14 days. security_invoker: owner-scoped RLS applies.';

revoke all on public.v_course_stream from anon;
grant select on public.v_course_stream to authenticated, service_role;

-- =============================================================================================
-- 2. material_history_record
-- =============================================================================================

create or replace function public.material_history_record(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_last      timestamptz;
  v_older     boolean := false;
  v_baseline  integer := 0;
  v_written   integer := 0;
  v_appeared  integer := 0;
  v_changed   integer := 0;
  v_vanished  integer := 0;
  v_sample    jsonb := '[]'::jsonb;
begin
  if p_run_id is null then
    raise exception 'material_history_record: p_run_id is required' using errcode = '22004';
  end if;

  if v_uid is not null and v_uid <> public.app_owner() then
    raise exception 'material_history_record: caller % is not the bb2dash owner', v_uid
      using errcode = '42501';
  end if;

  select max(b.captured_at) into v_last from bb_raw b where b.run_id = p_run_id;

  -- 170 (R3-1): exactly stage_content's predicate. A newer registered crawl, folded or not,
  -- makes this run older, and an older run writes nothing.
  select exists (
           select 1
             from agent_requests a
            where a.kind = 'sync'
              and a.run_id is not null
              and a.run_id <> p_run_id
              and (select max(b.captured_at) from bb_raw b where b.run_id = a.run_id) > v_last)
    into v_older;

  if v_older then
    return jsonb_build_object(
      'appeared', 0, 'changed', 0, 'vanished', 0,
      'baseline_courses', 0, 'older_run', true, 'sample', '[]'::jsonb);
  end if;

  -- ------------------------------------------------------------------------------------------
  -- a. One row per course this run carried, with its predecessor (null for a baseline).
  -- ------------------------------------------------------------------------------------------
  drop table if exists pg_temp._mh_pairs;

  create temporary table _mh_pairs on commit drop as
  select c.course_id,
         c.bb_course_id,
         c.captured_at   as seen_at,
         c.payload       as cur_payload,
         p.run_id        as pred_run_id,
         p.bb_course_id  as pred_bb_course_id,
         p.payload       as pred_payload
    from (select distinct on (bb_resolve_course(r.bb_course_id))
                 bb_resolve_course(r.bb_course_id) as course_id,
                 r.bb_course_id, r.captured_at, r.payload
            from bb_raw r
           where r.run_id = p_run_id
             and r.kind = 'course'
             and bb_resolve_course(r.bb_course_id) is not null
             and jsonb_array_length(bb_jarray(r.payload -> 'content')) > 0
           order by bb_resolve_course(r.bb_course_id), r.captured_at desc, r.id desc) c
    left join lateral (
           select r.run_id, r.bb_course_id, r.payload
             from bb_raw r
            where r.kind = 'course'
              and r.run_id <> p_run_id
              and bb_resolve_course(r.bb_course_id) = c.course_id
              and r.captured_at < c.captured_at
              and jsonb_array_length(bb_jarray(r.payload -> 'content')) > 0
              and exists (select 1 from agent_requests a
                           where a.kind = 'sync' and a.run_id = r.run_id)
              and exists (select 1 from sync_runs s
                           where s.run_id = r.run_id
                             and s.scope is distinct from 'unregistered'
                             and s.status in ('ok', 'partial'))
            order by r.captured_at desc, r.id desc
            limit 1) p on true;

  select count(*) filter (where pred_run_id is null) into v_baseline from _mh_pairs;

  -- ------------------------------------------------------------------------------------------
  -- b. Both sides of every course that has a predecessor, shaped the same way: content items,
  --    then file refs from embeddedFiles and from detail.file (stage_files' two sources).
  --    Content items carry their parentId (R2-3) and node kind (R2-2); a session-scoped
  --    content url is null (R2-4).
  -- ------------------------------------------------------------------------------------------
  drop table if exists pg_temp._mh_items;

  create temporary table _mh_items on commit drop as
  with sides as (
    select 'cur'::text as side, m.course_id, m.bb_course_id, m.cur_payload as payload
      from _mh_pairs m where m.pred_run_id is not null
    union all
    select 'pred'::text, m.course_id, m.pred_bb_course_id, m.pred_payload
      from _mh_pairs m where m.pred_run_id is not null
  ),
  items as (
    select s.side, s.course_id, s.bb_course_id, e.item, e.ord,
           string_to_array(e.item ->> 'path', ' / ') as segs
      from sides s
      cross join lateral jsonb_array_elements(bb_jarray(s.payload -> 'content'))
                 with ordinality as e(item, ord)
     where nullif(btrim(coalesce(e.item ->> 'id', '')), '') is not null
  ),
  content as (
    select distinct on (i.side, i.course_id, i.item ->> 'id')
           i.side,
           'content'::text                                     as entity,
           i.course_id,
           i.bb_course_id,
           i.item ->> 'id'                                     as bb_item_id,
           ''::text                                            as file_name,
           -- The stored title, with stage_content's fallback for an Ultra document.
           case when coalesce(btrim(i.item ->> 'title'), '') in ('', 'ultraDocumentBody')
                then case when array_length(i.segs, 1) > 1
                          then i.segs[array_length(i.segs, 1) - 1] || ' (document)'
                          else 'Untitled document' end
                else btrim(i.item ->> 'title') end             as title,
           btrim(coalesce(i.item ->> 'title', ''))             as cmp_title,
           i.item ->> 'path'                                   as path,
           case when u.url ~ '/sessions/' then null else u.url end as url,
           case
             when jsonb_typeof(i.item -> 'modified') = 'number'
               then to_timestamp((i.item ->> 'modified')::numeric / 1000.0)
             when jsonb_typeof(i.item -> 'modified') = 'string'
              and (i.item ->> 'modified') ~ '^\d{4}-\d{2}-\d{2}[T ]'
               then (i.item ->> 'modified')::timestamptz
           end                                                 as modified_at,
           nullif(btrim(coalesce(i.item ->> 'parentId', '')), '') as parent_item_id,
           case i.item ->> 'type'
             when 'resource/x-bb-folder'            then 'folder'
             when 'resource/x-bb-lesson'            then 'learning_module'
             when 'resource/x-bb-file'              then 'file'
             when 'resource/x-bb-externallink'      then 'link'
             when 'resource/x-bb-courselink'        then 'course_link'
             when 'resource/x-bb-asmt-test-link'    then 'test'
             when 'resource/x-bb-asmt-survey-link'  then 'survey'
             else case
                    when i.item ->> 'type' is null                    then 'document'
                    when i.item ->> 'type' like 'resource/x-bb-blti%' then 'lti'
                    else 'other'
                  end
           end                                                 as item_kind
      from items i
      cross join lateral (
        select bb_abs_url(coalesce(i.item -> 'detail' -> 'file' ->> 'url',
                                   i.item -> 'detail' ->> 'url')) as url) u
     where nullif(btrim(coalesce(i.item ->> 'path', '')), '') is not null
     order by i.side, i.course_id, i.item ->> 'id', i.ord
  ),
  refs as (
    select i.side, i.course_id, i.bb_course_id,
           i.item ->> 'id'                                     as bb_item_id,
           i.item ->> 'path'                                   as path,
           coalesce(nullif(e ->> 'name', ''), 'untitled')      as file_name,
           bb_abs_url(e ->> 'url')                             as url
      from items i
      cross join lateral jsonb_array_elements(bb_jarray(i.item -> 'embeddedFiles')) e
    union all
    select i.side, i.course_id, i.bb_course_id,
           i.item ->> 'id',
           i.item ->> 'path',
           coalesce(nullif(coalesce(i.item -> 'detail' -> 'file' ->> 'name', i.item ->> 'title'), ''),
                    'untitled'),
           bb_abs_url(i.item -> 'detail' -> 'file' ->> 'url')
      from items i
  ),
  files as (
    select distinct on (r.side, r.course_id, r.bb_item_id, r.file_name)
           r.side,
           'file'::text          as entity,
           r.course_id,
           r.bb_course_id,
           r.bb_item_id,
           r.file_name,
           r.file_name           as title,
           r.file_name           as cmp_title,
           r.path,
           r.url,
           null::timestamptz     as modified_at,
           null::text            as parent_item_id,
           null::text            as item_kind
      from refs r
     where r.url is not null
       and r.url !~ '/sessions/'
     order by r.side, r.course_id, r.bb_item_id, r.file_name, r.url
  )
  select * from content
  union all
  select * from files;

  -- ------------------------------------------------------------------------------------------
  -- c. The diff, written once. A `changed` row with nothing in changed_fields is not a change.
  --    Every row is written; what this call wrote is kept for the counts in d.
  -- ------------------------------------------------------------------------------------------
  drop table if exists pg_temp._mh_written;

  create temporary table _mh_written (
    change     text,
    entity     text,
    title      text,
    course_id  text,
    bb_item_id text,
    file_name  text,
    bb_file_id bigint,
    item_kind  text
  ) on commit drop;

  with d as (
    select coalesce(c.entity, p.entity)             as entity,
           coalesce(c.course_id, p.course_id)       as course_id,
           coalesce(c.bb_item_id, p.bb_item_id)     as bb_item_id,
           coalesce(c.file_name, p.file_name)       as file_name,
           case when p.side is null then 'appeared'
                when c.side is null then 'vanished'
                else 'changed' end                  as change,
           case when c.side is not null and p.side is not null then
             array_remove(array[
               case when c.entity = 'content' and c.cmp_title is distinct from p.cmp_title then 'title' end,
               -- The breadcrumb counts only when the item itself moved or was renamed (R2-3).
               case when c.entity = 'content' and c.path is distinct from p.path
                     and (c.parent_item_id is distinct from p.parent_item_id
                          or c.cmp_title is distinct from p.cmp_title) then 'path' end,
               case when c.url is distinct from p.url then 'url' end,
               case when c.entity = 'content' and c.modified_at is distinct from p.modified_at then 'modified' end
             ], null)
           end                                      as changed_fields,
           coalesce(c.title, p.title)               as title,
           coalesce(c.path, p.path)                 as path,
           coalesce(c.url, p.url)                   as url,
           coalesce(c.bb_course_id, p.bb_course_id) as bb_course_id,
           coalesce(c.item_kind, p.item_kind)       as item_kind
      from (select * from _mh_items where side = 'cur') c
      full join (select * from _mh_items where side = 'pred') p
        on p.entity = c.entity
       and p.course_id = c.course_id
       and p.bb_item_id = c.bb_item_id
       and p.file_name = c.file_name
  ),
  ins as (
    insert into bb_material_history
      (run_id, course_id, entity, bb_item_id, file_name, bb_file_id, change, changed_fields,
       title, path, seen_at)
    select p_run_id, d.course_id, d.entity, d.bb_item_id, d.file_name,
           case when d.entity = 'file'
                then (select f.id
                        from bb_files f
                       where f.bb_course_id = d.bb_course_id
                         and f.source_url = d.url
                       limit 1) end,
           d.change,
           case when d.change = 'changed' then d.changed_fields end,
           d.title, d.path, m.seen_at
      from d
      join _mh_pairs m on m.course_id = d.course_id
     where d.change <> 'changed'
        or cardinality(d.changed_fields) > 0
    on conflict (run_id, entity, course_id, bb_item_id, file_name) do nothing
    returning change, entity, title, course_id, bb_item_id, file_name, bb_file_id
  )
  insert into _mh_written (change, entity, title, course_id, bb_item_id, file_name, bb_file_id, item_kind)
  select i.change, i.entity, i.title, i.course_id, i.bb_item_id, i.file_name, i.bb_file_id, d.item_kind
    from ins i
    join d on d.entity = i.entity and d.course_id = i.course_id
          and d.bb_item_id = i.bb_item_id and d.file_name = i.file_name;
  get diagnostics v_written = row_count;

  -- ------------------------------------------------------------------------------------------
  -- d. 170 (R3-4): the counts are what the Stream posts for this run. `appeared` and `changed`
  --    are read from v_course_stream; `vanished`, which the Stream never posts, counts
  --    catalogued files and document, link or file nodes no bb_files row claims. Only when
  --    this call wrote rows, so a re-run returns zeros.
  -- ------------------------------------------------------------------------------------------
  if v_written > 0 then
    with posts as (
      select s.meta ->> 'change'                                          as change,
             case when s.ref_kind = 'bb_file' then 'file' else 'content' end as entity,
             s.title,
             s.ref_id                                                     as ref
        from v_course_stream s
       where s.post_kind = 'material'
         and s.course_id in (select m.course_id from _mh_pairs m)
         and s.meta ->> 'run_id' = p_run_id::text
    ),
    gone as (
      select w.change, w.entity, w.title, w.bb_item_id || '/' || w.file_name as ref
        from _mh_written w
       where w.change = 'vanished'
         and (   (w.entity = 'file'
                  and (w.bb_file_id is not null
                       or exists (select 1 from bb_files f
                                   where f.course_id = w.course_id
                                     and f.content_id = w.bb_item_id
                                     and f.file_name = w.file_name)))
              or (w.entity = 'content'
                  and w.item_kind in ('document', 'link', 'file', 'lti')
                  and not exists (select 1 from bb_files f
                                   where f.course_id = w.course_id
                                     and f.content_id = w.bb_item_id)))
    ),
    ranked as (
      select m.change, m.entity, m.title,
             row_number() over (partition by m.change
                                order by (m.entity = 'file') desc, m.title, m.ref) as rn
        from (select * from posts union all select * from gone) m
    )
    select count(*) filter (where change = 'appeared'),
           count(*) filter (where change = 'changed'),
           count(*) filter (where change = 'vanished'),
           coalesce(jsonb_agg(jsonb_build_object('change', change, 'entity', entity, 'title', title)
                              order by change, rn) filter (where rn <= 3), '[]'::jsonb)
      into v_appeared, v_changed, v_vanished, v_sample
      from ranked;
  end if;

  drop table if exists pg_temp._mh_written;
  drop table if exists pg_temp._mh_items;
  drop table if exists pg_temp._mh_pairs;

  return jsonb_build_object(
    'appeared',         v_appeared,
    'changed',          v_changed,
    'vanished',         v_vanished,
    'baseline_courses', v_baseline,
    'older_run',        false,
    'sample',           v_sample
  );
end;
$fn$;

comment on function public.material_history_record(uuid) is
  'Records what one crawl added, changed or removed (132; rules 138; counts and older_run 170; '
  'LTI nodes counted as vanished materials 172). '
  'Diffs the run''s bb_raw course rows against the predecessor: the newest registered crawl '
  'folded ok or partial with an older row for the same course. Content is keyed (course_id, '
  'item id) and changed on title, url, modified, or path when the item''s own parent or title '
  'changed; a session-scoped url compares as null. Files are keyed (course_id, item id, file '
  'name), read from embeddedFiles and detail.file as stage_files reads them, and changed on '
  'url. A course with no predecessor is a baseline and writes nothing; a course whose row '
  'carries no content item is not carried. Writes nothing when a newer crawl is registered '
  '(older_run, stage_content''s predicate). on conflict do nothing, so a second call writes 0. '
  'Every history row is written; the returned {appeared, changed} are the run''s material '
  'posts in v_course_stream, {vanished} counts catalogued files and document, link, file or lti '
  'nodes no bb_files row claims, and sample holds up to three {change, entity, title} per kind. '
  'Also returns baseline_courses and older_run. Writes only bb_material_history.';

revoke all on function public.material_history_record(uuid) from public, anon, authenticated;
grant execute on function public.material_history_record(uuid) to service_role;
grant execute on function public.material_history_record(uuid) to db_test_runner;
