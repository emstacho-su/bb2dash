-- bb2dash :: 139_stage_content_rekey.sql
-- Phase 19 round 2 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md, "Round 2",
-- row R2-1). Worker W-52.
--
-- HOW THIS WAS BUILT. `stage_content` is re-created with `create or replace` from its LIVE prod
-- body, read with `select pg_get_functiondef('public.stage_content(uuid)'::regprocedure)` on
-- 2026-10-03 (md5(prosrc) ec78ca41daa2addb02fa113c85b7829d, 131's body; 131 stays frozen). Its
-- ACL that day was `{postgres=X/postgres,service_role=X/postgres,db_test_runner=X/postgres}`.
-- One rule is added (step 2b below, before the insert and so before the missing pass), one
-- return key is added (`rekeyed`), and the count of stored rows is taken after that step.
-- Everything else is 131's, line for line.
--
-- WHY. 131 keys bb_content on (course_id, bb_item_id). When Blackboard deletes an item and
-- re-posts it, the item comes back under a NEW id on the SAME path. 131 inserts a new row for
-- it and stamps the old row missing, and the old row keeps the assignment_id: no fold ever
-- writes assignment_id (only 112 and 130 did), so the link is stranded on a ghost. 026 kept it,
-- because its path key updated the row in place and appended the old id to previous_ids.
-- Prod's crawl history holds one such re-creation (IST.352 "Project Assignment #1A", crawl
-- 6b122650, folded by 026 at the time).
--
-- THE RULE. Within one course in one fold, when EXACTLY ONE new item (no row holds its id)
-- and EXACTLY ONE stored row that this run does not carry share a path, and the two share an
-- item_kind, the stored row is RE-KEYED: its bb_item_id becomes the new id, the old id is
-- appended to detail->'previous_ids' (once), and the row is then folded as an existing row.
-- So its id, assignment_id, children (parent_id points at the row id) and previous_paths stay.
-- Re-keyed rows are counted in the new return key `rekeyed`; each is also counted, like any
-- stored row, as updated or unchanged. Any other shape (two new, two old, a kind change, or a
-- stored row the run still carries, such as IST.466's two live lessons on one path) is left to
-- insert + missing exactly as 131 does. Only the newest registered crawl re-keys, because only
-- it writes at all.

create or replace function public.stage_content(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid             uuid := auth.uid();
  v_inserted        integer := 0;
  v_updated         integer := 0;
  v_unchanged       integer := 0;
  v_existing        integer := 0;
  v_missing         integer := 0;
  v_missing_cleared integer := 0;
  v_rekeyed         integer := 0;
  v_fallbacks       integer := 0;
  v_duplicates      integer := 0;
  v_items           integer := 0;
  v_courses         integer := 0;
  v_bad_shells      integer := 0;
  v_bad_items       integer := 0;
  v_is_newest       boolean := true;
begin
  if p_run_id is null then
    raise exception 'stage_content: p_run_id is required' using errcode = '22004';
  end if;

  if v_uid is not null and v_uid <> public.app_owner() then
    raise exception 'stage_content: caller % is not the bb2dash owner', v_uid
      using errcode = '42501';
  end if;

  -- Shells in this run that no courses row claims. Counted, skipped, never guessed.
  select count(*),
         coalesce(sum(jsonb_array_length(coalesce(r.payload -> 'content', '[]'::jsonb))), 0)
    into v_bad_shells, v_bad_items
    from bb_raw r
   where r.run_id = p_run_id
     and r.kind = 'course'
     and not exists (select 1
                       from courses c
                      where c.bb_id = r.bb_course_id
                         or c.bb_course_id = r.bb_course_id);

  -- ------------------------------------------------------------------------------------------
  -- 2a. Shape every item of the run once. Kept in a temp table because the insert, the update,
  --     the parent pass and the missing pass all read the same shaped set.
  --     rn      = 1 for the first occurrence of an item id in its course (the row that folds)
  --     path_rn > 1 for an item that shares its path with an earlier item of the course
  --     is_new  = no bb_content row holds this (course_id, bb_item_id) yet
  -- ------------------------------------------------------------------------------------------
  drop table if exists pg_temp._stage_items;

  create temporary table _stage_items on commit drop as
  with raw as (
    select r.bb_course_id,
           r.payload -> 'content' as content
      from bb_raw r
     where r.run_id = p_run_id
       and r.kind = 'course'
  ),
  resolved as (
    select raw.content, cr.id as course_id
      from raw
      left join lateral (
        select c.id
          from courses c
         where c.bb_id = raw.bb_course_id
            or c.bb_course_id = raw.bb_course_id
         order by (c.bb_id = raw.bb_course_id) desc, c.id
         limit 1
      ) cr on true
  ),
  expanded as (
    select rs.course_id, e.item, e.ord
      from resolved rs
      cross join lateral jsonb_array_elements(coalesce(rs.content, '[]'::jsonb))
                 with ordinality as e(item, ord)
     where rs.course_id is not null
  ),
  shaped as (
    select x.course_id,
           x.ord,
           x.item,
           x.item ->> 'id'                           as bb_item_id,
           x.item ->> 'path'                         as path,
           string_to_array(x.item ->> 'path', ' / ') as segs
      from expanded x
     where nullif(btrim(coalesce(x.item ->> 'path', '')), '') is not null
       and nullif(btrim(coalesce(x.item ->> 'id', '')), '') is not null
  )
  select
    s.course_id,
    s.ord,
    row_number() over (partition by s.course_id, s.bb_item_id order by s.ord) as rn,
    row_number() over (partition by s.course_id, s.path order by s.ord)       as path_rn,
    s.path,
    s.bb_item_id,
    nullif(btrim(coalesce(s.item ->> 'parentId', '')), '')                  as parent_item_id,
    not exists (select 1
                  from bb_content b
                 where b.course_id = s.course_id
                   and b.bb_item_id = s.bb_item_id)                          as is_new,
    -- Title fallback: an Ultra document whose title is the literal 'ultraDocumentBody'
    -- (or blank) is named after the folder that holds it.
    case when coalesce(btrim(s.item ->> 'title'), '') in ('', 'ultraDocumentBody')
         then case when array_length(s.segs, 1) > 1
                   then s.segs[array_length(s.segs, 1) - 1] || ' (document)'
                   else 'Untitled document' end
         else btrim(s.item ->> 'title') end                                as title,
    (coalesce(btrim(s.item ->> 'title'), '') in ('', 'ultraDocumentBody'))  as title_fallback,
    case s.item ->> 'type'
      when 'resource/x-bb-folder'            then 'folder'
      when 'resource/x-bb-lesson'            then 'learning_module'
      when 'resource/x-bb-file'              then 'file'
      when 'resource/x-bb-externallink'      then 'link'
      when 'resource/x-bb-courselink'        then 'course_link'
      when 'resource/x-bb-asmt-test-link'    then 'test'
      when 'resource/x-bb-asmt-survey-link'  then 'survey'
      else case
             when s.item ->> 'type' is null                       then 'document'
             when s.item ->> 'type' like 'resource/x-bb-blti%'    then 'lti'
             else 'other'
           end
    end                                                                    as item_kind,
    s.item ->> 'type'                                                      as bb_type,
    coalesce(s.item -> 'detail' -> 'file' ->> 'url',
             s.item -> 'detail' ->> 'url')                                 as url,
    nullif(btrim(coalesce(s.item ->> 'state', '')), '')                    as state,
    case
      when jsonb_typeof(s.item -> 'modified') = 'number'
        then to_timestamp((s.item ->> 'modified')::numeric / 1000.0)
      when jsonb_typeof(s.item -> 'modified') = 'string'
       and (s.item ->> 'modified') ~ '^\d{4}-\d{2}-\d{2}[T ]'
        then (s.item ->> 'modified')::timestamptz
    end                                                                    as modified_at,
    nullif(btrim(coalesce(s.item ->> 'body', '')), '')                     as body,
    (
      coalesce(nullif(s.item -> 'detail', 'null'::jsonb), '{}'::jsonb)
      || case when nullif(btrim(coalesce(s.item ->> 'description', '')), '') is null
              then '{}'::jsonb
              else jsonb_build_object('description', btrim(s.item ->> 'description')) end
    )                                                                      as detail_base
  from shaped s;

  select count(*),
         count(distinct course_id),
         count(*) filter (where rn = 1 and path_rn > 1),
         count(*) filter (where rn = 1 and title_fallback)
    into v_items, v_courses, v_duplicates, v_fallbacks
    from _stage_items;

  -- ------------------------------------------------------------------------------------------
  -- Only the NEWEST registered crawl writes. Folds do not arrive in crawl order (039 folds
  -- oldest first, and a crawl can be registered late), so an older run folded now would rename
  -- items back, clear missing marks a newer crawl set and stamp items a newer crawl carries.
  -- Same predicate, same reason, as stage_files (043) and stage_gradebook (056). "Registered",
  -- not "folded": a crawl waiting to be folded has no sync_runs row yet.
  -- ------------------------------------------------------------------------------------------
  select not exists (
           select 1
             from agent_requests r
            where r.kind = 'sync'
              and r.run_id is not null
              and r.run_id <> p_run_id
              and (select max(b.captured_at) from bb_raw b where b.run_id = r.run_id)
                  > (select max(b.captured_at) from bb_raw b where b.run_id = p_run_id))
    into v_is_newest;

  if v_is_newest then
    -- ----------------------------------------------------------------------------------------
    -- 2b. (139, R2-1) Re-key a re-created item. Per course and path: exactly one new item,
    --     exactly one stored row this run does not carry, and the same item_kind. The stored
    --     row takes the new id and keeps everything it holds; the old id joins previous_ids.
    --     The new item is then no longer new, so 2c skips it and 2e updates the row in place.
    -- ----------------------------------------------------------------------------------------
    with new_items as (
      select s.course_id, s.bb_item_id, s.path, s.item_kind
        from _stage_items s
       where s.rn = 1
         and s.is_new
    ),
    gone_rows as (
      select b.id, b.course_id, b.bb_item_id, b.path, b.item_kind
        from bb_content b
       where b.course_id in (select distinct s.course_id from _stage_items s)
         and not exists (select 1
                           from _stage_items s
                          where s.course_id = b.course_id
                            and s.bb_item_id = b.bb_item_id)
    ),
    pairs as (
      select n.bb_item_id as new_id, g.id as row_id, g.bb_item_id as old_id
        from new_items n
        join gone_rows g
          on g.course_id = n.course_id
         and g.path = n.path
         and g.item_kind is not distinct from n.item_kind
       where (select count(*) from new_items n2
               where n2.course_id = n.course_id and n2.path = n.path) = 1
         and (select count(*) from gone_rows g2
               where g2.course_id = n.course_id and g2.path = n.path) = 1
    ),
    rekeyed as (
      update bb_content b
         set bb_item_id  = p.new_id,
             detail      = coalesce(nullif(b.detail, 'null'::jsonb), '{}'::jsonb)
                           || jsonb_build_object(
                                'previous_ids',
                                case
                                  when jsonb_typeof(b.detail -> 'previous_ids') is distinct from 'array'
                                    then jsonb_build_array(p.old_id)
                                  when (b.detail -> 'previous_ids') @> to_jsonb(p.old_id)
                                    then b.detail -> 'previous_ids'
                                  else (b.detail -> 'previous_ids') || to_jsonb(p.old_id)
                                end),
             run_id      = p_run_id,
             captured_at = now()
        from pairs p
       where b.id = p.row_id
      returning 1
    )
    select count(*) into v_rekeyed from rekeyed;

    if v_rekeyed > 0 then
      update _stage_items s
         set is_new = false
       where s.is_new
         and exists (select 1
                       from bb_content b
                      where b.course_id = s.course_id
                        and b.bb_item_id = s.bb_item_id);
    end if;

    select count(*) filter (where rn = 1 and not is_new)
      into v_existing
      from _stage_items;

    -- ----------------------------------------------------------------------------------------
    -- 2c. Insert the items no row holds yet, on the (course_id, bb_item_id) key. parent_id is
    --     left alone here and resolved in 2d, because a parent can be inserted by this same
    --     statement.
    -- ----------------------------------------------------------------------------------------
    insert into bb_content as b
      (course_id, bb_item_id, title, item_kind, path, url,
       bb_type, state, modified_at, body, detail, run_id, captured_at)
    select s.course_id, s.bb_item_id, s.title, s.item_kind, s.path, s.url,
           s.bb_type, s.state, s.modified_at, s.body,
           nullif(s.detail_base, '{}'::jsonb), p_run_id, now()
      from _stage_items s
     where s.rn = 1
       and s.is_new
    on conflict (course_id, bb_item_id) do nothing;
    get diagnostics v_inserted = row_count;

    -- ----------------------------------------------------------------------------------------
    -- 2d. parent_id of the new rows, by the payload's parentId. A parentId with no row in the
    --     course (the course root) gives null, which is why this is an outer join.
    -- ----------------------------------------------------------------------------------------
    update bb_content b
       set parent_id = p.id
      from _stage_items s
      left join bb_content p
             on p.course_id = s.course_id
            and p.bb_item_id = s.parent_item_id
     where s.rn = 1
       and s.is_new
       and b.course_id = s.course_id
       and b.bb_item_id = s.bb_item_id
       and b.parent_id is distinct from p.id;

    -- ----------------------------------------------------------------------------------------
    -- 2e. Rows that already exist: written only when a stored field differs, so `updated` is a
    --     count of real changes and an unchanged row keeps the run_id that last changed it.
    --     A returning item loses detail.missing_since here (the merge drops it).
    -- ----------------------------------------------------------------------------------------
    with target as (
      select b.id,
             s.title, s.item_kind, s.path, s.url, s.bb_type, s.state, s.modified_at, s.body,
             public.bb_content_path_history(b.detail, nullif(s.detail_base, '{}'::jsonb),
                                            b.path, s.path)                as detail,
             p.id                                                          as parent_id,
             (b.detail ->> 'missing_since' is not null)                    as was_missing
        from _stage_items s
        join bb_content b
          on b.course_id = s.course_id
         and b.bb_item_id = s.bb_item_id
        left join bb_content p
               on p.course_id = s.course_id
              and p.bb_item_id = s.parent_item_id
       where s.rn = 1
         and not s.is_new
    ),
    changed as (
      update bb_content b
         set title       = t.title,
             item_kind   = t.item_kind,
             path        = t.path,
             url         = t.url,
             bb_type     = t.bb_type,
             state       = t.state,
             modified_at = t.modified_at,
             body        = t.body,
             detail      = t.detail,
             parent_id   = t.parent_id,
             run_id      = p_run_id,
             captured_at = now()
        from target t
       where b.id = t.id
         and (   b.title       is distinct from t.title
              or b.item_kind   is distinct from t.item_kind
              or b.path        is distinct from t.path
              or b.url         is distinct from t.url
              or b.bb_type     is distinct from t.bb_type
              or b.state       is distinct from t.state
              or b.modified_at is distinct from t.modified_at
              or b.body        is distinct from t.body
              or b.detail      is distinct from t.detail
              or b.parent_id   is distinct from t.parent_id)
      returning t.was_missing
    )
    select count(*), count(*) filter (where was_missing)
      into v_updated, v_missing_cleared
      from changed;

    v_unchanged := v_existing - v_updated;

    -- ----------------------------------------------------------------------------------------
    -- 2f. Items the run did not carry are kept, not deleted, and stamped once with the run that
    --     first missed them (P-98). Keyed on bb_item_id. Scoped to the courses this run carried
    --     at least one item for, so a partial run never marks another course's tree missing.
    --     A re-keyed row now carries the new id, so it is not stamped.
    -- ----------------------------------------------------------------------------------------
    with marked as (
      update bb_content b
         set detail = coalesce(nullif(b.detail, 'null'::jsonb), '{}'::jsonb)
                      || jsonb_build_object('missing_since', p_run_id::text)
       where b.course_id in (select distinct s.course_id from _stage_items s)
         and not exists (select 1
                           from _stage_items s
                          where s.course_id = b.course_id
                            and s.bb_item_id = b.bb_item_id)
         and coalesce(nullif(b.detail, 'null'::jsonb), '{}'::jsonb) ->> 'missing_since' is null
      returning 1
    )
    select count(*) into v_missing from marked;
  end if;

  drop table if exists pg_temp._stage_items;

  return jsonb_build_object(
    'inserted',           v_inserted,
    'updated',            v_updated,
    'unchanged',          v_unchanged,
    'missing',            v_missing,
    'missing_cleared',    v_missing_cleared,
    'rekeyed',            v_rekeyed,
    'title_fallbacks',    v_fallbacks,
    'duplicate_paths',    v_duplicates,
    'unresolved_courses', v_bad_shells,
    'unresolved_items',   v_bad_items,
    'items',              v_items,
    'courses',            v_courses,
    'older_run',          not v_is_newest,
    'run_id',             p_run_id
  );
end;
$fn$;

comment on function public.stage_content(uuid) is
  'Phase 8 seam, re-keyed in 131, re-created item rule in 139. Folds bb_raw(kind=''course'', '
  'run_id=p_run_id) payload->content into bb_content on the (course_id, bb_item_id) unique key: '
  'title, item_kind, path, bb_type, url, state, modified_at, body, detail, parent_id (by the '
  'payload''s parentId), run_id, captured_at. Two items may share a path; each has its own row. '
  'Only the newest registered crawl writes; an older run returns older_run = true and changes '
  'nothing. When exactly one new item and exactly one stored row the run does not carry share a '
  'path and an item_kind in a course, the stored row is re-keyed to the new id (old id appended '
  'to detail->''previous_ids'') and keeps its assignment_id, children and previous_paths '
  '(rekeyed). A stored row is written only when a field differs (updated), otherwise it is '
  'counted unchanged and keeps its run_id. A path change appends the old path to '
  'detail->''previous_paths''; detail->''previous_ids'' is carried. Title falls back to '
  '"<parent folder> (document)" (or "Untitled document" at root) when the payload title is blank '
  'or the literal ultraDocumentBody. Items absent from the run are kept and stamped '
  'detail->>''missing_since'' with the run that first missed them; the stamp is cleared when the '
  'item returns. Never touches bb_files, assignments, assignment_id or any *_progress table. '
  'Returns {inserted, updated, unchanged, missing, missing_cleared, rekeyed, title_fallbacks, '
  'duplicate_paths, unresolved_courses, unresolved_items, items, courses, older_run, run_id}.';

revoke all on function public.stage_content(uuid) from public, anon, authenticated;
grant execute on function public.stage_content(uuid) to service_role;
grant execute on function public.stage_content(uuid) to db_test_runner;
