-- bb2dash :: 138_material_history_counts.sql
-- Phase 19 round 2 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md, "Round 2",
-- rows R2-2, R2-3, R2-4 and R2-5). Worker W-52.
--
-- HOW THIS WAS BUILT. `material_history_record` is re-created with `create or replace` from its
-- LIVE prod body, read with
-- `select pg_get_functiondef('public.material_history_record(uuid)'::regprocedure)` on 2026-10-03
-- (md5(prosrc) 43b1eaec60d0a3c2a2254d9c4b3d0939, 132's body; 132 stays frozen). Its ACL that day
-- was `{postgres=X/postgres,service_role=X/postgres,db_test_runner=X/postgres}`. The table, its
-- policy, the backfill and the restamp are 132's and are not touched; no history row is
-- rewritten. Four rules change, each from the first code-review pass:
--
--   R2-2  The returned counts and `sample` cover MATERIALS only, the way 133's Stream does: file
--         rows, plus content rows whose node kind is `document` or `link` and that no file row of
--         the same run and item covers. A file node (one content row and one detail.file row)
--         is one material, not two; a folder or a learning module is not a material. Every
--         history row is still WRITTEN: P-98's vanish convention needs a content row for every
--         node. 134's Activity lines read these counts.
--   R2-3  `path` is a changed field only when the item's own parent (its parentId) or its own
--         title changed. Renaming a folder changes the breadcrumb of everything under it; that
--         is not a change to those items, and they get no row. The folder itself still does.
--   R2-4  A session-scoped url (`/sessions/`) on a content item compares as null, as the file
--         arm already left such urls out (stage_files never catalogues them): they change on
--         every crawl. 0 occurrences on prod on 2026-10-03; defensive.
--   R2-5  older_run uses the registered-crawl predicate of 043, 056 and 131, narrowed to crawls
--         that were folded: this run is older when a NEWER registered crawl has a real
--         sync_runs row with status ok or partial, whether or not that crawl wrote history
--         rows. 132 only looked at crawls that had history rows. A crawl still being folded
--         (its row `running`, 135) or reaped (`failed`) does not count.
--
-- Everything else is 132's, line for line: the predecessor, the baseline, the two file
-- sources, the "carried" rule (a course row with at least one content item), the empty-tree
-- rule, the on-conflict idempotence and the return keys
-- {appeared, changed, vanished, baseline_courses, older_run, sample}.

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

  -- 138 (R2-5): a newer registered crawl that was folded makes this run older, history rows or
  -- not. Writing this run's diff now would post old changes after newer ones.
  select exists (
           select 1
             from agent_requests a
            where a.kind = 'sync'
              and a.run_id is not null
              and a.run_id <> p_run_id
              and exists (select 1 from sync_runs s
                           where s.run_id = a.run_id
                             and s.scope is distinct from 'unregistered'
                             and s.status in ('ok', 'partial'))
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
  --    138: content items also carry their parentId (R2-3) and their node kind, mapped as
  --    stage_content maps it (R2-2); a session-scoped content url is null (R2-4).
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
  --    Every row is written; the counts and the sample are taken over the materials only.
  -- ------------------------------------------------------------------------------------------
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
               -- 138 (R2-3): the breadcrumb counts only when the item itself moved or was renamed.
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
    returning change, entity, title, course_id, bb_item_id, file_name
  ),
  -- 138 (R2-2): file rows, and document or link nodes that no file row of this run covers.
  materials as (
    select i.change, i.entity, i.title, i.bb_item_id
      from ins i
      join d on d.entity = i.entity and d.course_id = i.course_id
            and d.bb_item_id = i.bb_item_id and d.file_name = i.file_name
     where i.entity = 'file'
        or (d.item_kind in ('document', 'link')
            and not exists (select 1 from ins f
                             where f.entity = 'file'
                               and f.course_id = i.course_id
                               and f.bb_item_id = i.bb_item_id))
  ),
  ranked as (
    select m.change, m.entity, m.title,
           row_number() over (partition by m.change
                              order by (m.entity = 'file') desc, m.title, m.bb_item_id) as rn
      from materials m
  )
  select count(*) filter (where change = 'appeared'),
         count(*) filter (where change = 'changed'),
         count(*) filter (where change = 'vanished'),
         coalesce(jsonb_agg(jsonb_build_object('change', change, 'entity', entity, 'title', title)
                            order by change, rn) filter (where rn <= 3), '[]'::jsonb)
    into v_appeared, v_changed, v_vanished, v_sample
    from ranked;

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
  'Records what one crawl added, changed or removed (132; counts and rules 138). Diffs the run''s '
  'bb_raw course rows against the predecessor: the newest registered crawl folded ok or partial '
  'with an older row for the same course. Content is keyed (course_id, item id) and changed on '
  'title, url, modified, or path when the item''s own parent or title changed (an ancestor''s '
  'rename is not a change); a session-scoped url compares as null. Files are keyed (course_id, '
  'item id, file name), read from embeddedFiles and detail.file as stage_files reads them, and '
  'changed on url. A course with no predecessor is a baseline and writes nothing; a course whose '
  'row carries no content item is not carried. Writes nothing when a newer registered crawl was '
  'already folded (older_run). on conflict do nothing, so a second call writes 0. Every history '
  'row is written; the returned {appeared, changed, vanished} and sample (up to three {change, '
  'entity, title} per kind) count materials only: file rows, and document or link nodes no file '
  'row of the run covers. Also returns baseline_courses and older_run. Writes only '
  'bb_material_history.';

revoke all on function public.material_history_record(uuid) from public, anon, authenticated;
grant execute on function public.material_history_record(uuid) to service_role;
grant execute on function public.material_history_record(uuid) to db_test_runner;
