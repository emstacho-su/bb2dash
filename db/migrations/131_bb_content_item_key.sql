-- bb2dash :: 131_bb_content_item_key.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), tasks 4, 5 and 6
-- (R-64, R-71, P-95). Worker W-52. Applied back to back with 130, in one transaction, while no
-- sync request is queued or claimed.
--
-- HOW THIS WAS BUILT. `stage_content` is re-created from its LIVE prod body, read with
-- `select pg_get_functiondef('public.stage_content(uuid)'::regprocedure)` on 2026-10-02
-- (md5(prosrc) 92260a274cb7bcc356de5d0fa9910084, the value 98c recorded before Phase 18's 124;
-- identical to 026's text, which stays frozen). Its ACL that day was
-- `{postgres=X/postgres,service_role=X/postgres}` (029 revoked authenticated). The shaping of an
-- item (title fallback, item_kind, bb_type, url, state, modified_at, body, detail) is carried
-- line for line. What changes is the key, the parent rule, the write rule and the counts.
--
-- WHAT CHANGES
--   * bb_content is keyed (course_id, bb_item_id). The (course_id, path) unique key is DROPPED:
--     this is Phase 19's second named exception to "migrations are additive", under its own
--     DECISIONS row. Two Blackboard items of one course may share a path (IST.466 publishes
--     two lessons named Information, with same-path children); each now gets its own row, so
--     026's "first occurrence wins" is over. A plain index on (course_id, path) replaces the
--     unique one for path lookups.
--   * parent_id comes from the payload's parentId, not from the parent path. A parentId with
--     no row in that course (the course root) gives null.
--   * a rename or a move is an UPDATE of the item's row, not a second row. The old path is
--     appended to detail.previous_paths by `bb_content_path_history`; detail.previous_ids is
--     carried as it is. `bb_content_detail_merge` (026) stays in place, unused.
--   * only the NEWEST REGISTERED crawl writes (the predicate of 043 and 056). An older run
--     writes nothing and returns older_run = true.
--   * a row is updated only when a stored field differs. `updated` counts those rows and the
--     new `unchanged` counts the rest; an unchanged row keeps its run_id and captured_at.
--   * the missing pass is keyed on bb_item_id. As before it covers only courses this run
--     carried at least one item for, so a crawl that returned an empty tree for a course marks
--     nothing in it. detail.missing_since is cleared when an item returns, as before, and
--     `missing_cleared` now counts those.
--   * bb_type stays the payload's `type` (the crawler's contentHandler id): P-95 is met by
--     this column, and Phase 18's assignment_bb_url (126) reads it.
--
-- RETURN KEYS. Kept: inserted, updated, missing, title_fallbacks, duplicate_paths,
-- unresolved_courses, unresolved_items, items, courses, run_id. duplicate_paths now counts
-- items that share a path with an earlier item of the same course and are KEPT. New:
-- unchanged, missing_cleared, older_run.
--
-- An item with a blank id is skipped the way an item with a blank path always was (0 of 2,430
-- items in bb_raw on 2026-10-02). An id carried twice in one course payload keeps its first
-- occurrence (0 on 2026-10-02).
--
-- The last step re-folds the newest registered crawl, chosen by the 056 predicate and never
-- by a literal id, so the rows the path key refused (7 IST.466 items on 2026-10-02) exist as
-- soon as this migration lands.

-- =============================================================================================
-- 1. The key
-- =============================================================================================

do $$
declare
  v_open bigint;
begin
  select count(*) into v_open
    from public.agent_requests
   where kind = 'sync' and state in ('queued', 'claimed');
  if v_open <> 0 then
    raise exception '131 refused: % sync request(s) are queued or claimed', v_open;
  end if;
end $$;

alter table public.bb_content alter column bb_item_id set not null;

alter table public.bb_content
  add constraint bb_content_course_item_key unique (course_id, bb_item_id);

alter table public.bb_content drop constraint bb_content_course_id_path_key;

create index bb_content_course_path_idx on public.bb_content (course_id, path);

-- =============================================================================================
-- 2. detail merge helper for an item that is already stored
-- =============================================================================================

create or replace function public.bb_content_path_history(
  p_old      jsonb,
  p_new      jsonb,
  p_old_path text,
  p_new_path text
) returns jsonb
language sql immutable
set search_path = ''
as $$
  select nullif(
           coalesce(nullif(p_new, 'null'::jsonb), '{}'::jsonb)
           || case when jsonb_typeof(p_old -> 'previous_ids') = 'array'
                    and jsonb_array_length(p_old -> 'previous_ids') > 0
                   then jsonb_build_object('previous_ids', p_old -> 'previous_ids')
                   else '{}'::jsonb end
           || case when jsonb_array_length(prev.paths) > 0
                   then jsonb_build_object('previous_paths', prev.paths)
                   else '{}'::jsonb end,
           '{}'::jsonb)
  from (
    select case
             when p_old_path is not null
              and p_old_path is distinct from p_new_path
              and not (kept.paths @> to_jsonb(p_old_path))
               then kept.paths || to_jsonb(p_old_path)
             else kept.paths
           end as paths
      from (select case when jsonb_typeof(p_old -> 'previous_paths') = 'array'
                        then p_old -> 'previous_paths'
                        else '[]'::jsonb end as paths) kept
  ) prev;
$$;

comment on function public.bb_content_path_history(jsonb, jsonb, text, text) is
  'Merges a bb_content.detail payload for stage_content (131): the run''s detail wins; '
  'detail->''previous_ids'' is carried from the stored row as it is; when the path changed, the '
  'old path is appended to detail->''previous_paths'' (once, never duplicated). Any stale '
  'missing_since is dropped, because an item present in the run is not missing. Returns NULL '
  'rather than an empty object.';

-- =============================================================================================
-- 3. stage_content, from the live body
-- =============================================================================================

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
         count(*) filter (where rn = 1 and title_fallback),
         count(*) filter (where rn = 1 and not is_new)
    into v_items, v_courses, v_duplicates, v_fallbacks, v_existing
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
    -- 2b. Insert the items no row holds yet, on the (course_id, bb_item_id) key. parent_id is
    --     left alone here and resolved in 2c, because a parent can be inserted by this same
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
    -- 2c. parent_id of the new rows, by the payload's parentId. A parentId with no row in the
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
    -- 2d. Rows that already exist: written only when a stored field differs, so `updated` is a
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
    -- 2e. Items the run did not carry are kept, not deleted, and stamped once with the run that
    --     first missed them (P-98). Keyed on bb_item_id. Scoped to the courses this run carried
    --     at least one item for, so a partial run never marks another course's tree missing.
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
  'Phase 8 seam, re-keyed in 131. Folds bb_raw(kind=''course'', run_id=p_run_id) payload->content '
  'into bb_content on the (course_id, bb_item_id) unique key: title, item_kind, path, bb_type, '
  'url, state, modified_at, body, detail, parent_id (by the payload''s parentId), run_id, '
  'captured_at. Two items may share a path; each has its own row. Only the newest registered '
  'crawl writes; an older run returns older_run = true and changes nothing. A stored row is '
  'written only when a field differs (updated), otherwise it is counted unchanged and keeps its '
  'run_id. A path change appends the old path to detail->''previous_paths''; '
  'detail->''previous_ids'' is carried. Title falls back to "<parent folder> (document)" (or '
  '"Untitled document" at root) when the payload title is blank or the literal '
  'ultraDocumentBody. Items absent from the run are kept and stamped detail->>''missing_since'' '
  'with the run that first missed them; the stamp is cleared when the item returns. Never '
  'touches bb_files, assignments, assignment_id or any *_progress table. Returns {inserted, '
  'updated, unchanged, missing, missing_cleared, title_fallbacks, duplicate_paths, '
  'unresolved_courses, unresolved_items, items, courses, older_run, run_id}.';

-- =============================================================================================
-- 4. v_content_tree's comment stops calling path unique (027 and 111 stay frozen; the view's
--    column list is Phase 17's and is not touched)
-- =============================================================================================

comment on view public.v_content_tree is
  'Classwork tree (Phase 8; missing_since and notes 111; item key 131): bb_content as Blackboard '
  'publishes it, one row per (node, current file). A node is one Blackboard item, keyed '
  '(course_id, bb_item_id). path is the '' / ''-separated breadcrumb; two nodes of a course may '
  'share a path, so parent_id, not path, says which folder holds a node; depth counts its '
  'segments; state is Ultra progress (Started | Completed | None). '
  'file_id/file_name/storage_path/bucket/notes come from v_bb_files_current joined on '
  '(course_id, content_id = bb_item_id) and are null when no harvested file claims the node. '
  'missing_since is detail->>''missing_since'' cast to uuid: the sync run that first found the '
  'node gone from Blackboard (P-98), a projection, not a stored column; null for a live node. '
  'Ordered by path, which places a folder immediately before its children. security_invoker: '
  'owner-scoped RLS applies.';

-- =============================================================================================
-- 5. Re-fold the newest registered crawl, so the items the path key refused get their rows
-- =============================================================================================

do $$
declare
  v_run  uuid;
  v_res  jsonb;
  v_lost bigint;
begin
  select r.run_id into v_run
    from public.agent_requests r
   where r.kind = 'sync'
     and r.run_id is not null
     and exists (select 1 from public.bb_raw b where b.run_id = r.run_id and b.kind = 'course')
   order by (select max(b.captured_at) from public.bb_raw b where b.run_id = r.run_id) desc
   limit 1;

  if v_run is null then
    raise notice '131: no registered crawl to re-fold';
    return;
  end if;

  v_res := public.stage_content(v_run);
  if (v_res ->> 'older_run')::boolean then
    raise exception '131 failed: the re-folded crawl % was refused as an older run', v_run;
  end if;

  select count(*) into v_lost
    from public.bb_raw r
    cross join lateral jsonb_array_elements(public.bb_jarray(r.payload -> 'content')) e
   where r.run_id = v_run
     and r.kind = 'course'
     and public.bb_resolve_course(r.bb_course_id) is not null
     and (select count(*)
            from public.bb_content b
           where b.course_id = public.bb_resolve_course(r.bb_course_id)
             and b.bb_item_id = e ->> 'id') <> 1;
  if v_lost <> 0 then
    raise exception '131 failed: % item(s) of crawl % do not have exactly one row', v_lost, v_run;
  end if;

  raise notice '131: re-folded crawl %: %', v_run, v_res;
end $$;

-- =============================================================================================
-- 6. Grants, as the Contract's RPC table lists them
-- =============================================================================================

revoke all on function public.stage_content(uuid) from public, anon, authenticated;
grant execute on function public.stage_content(uuid) to service_role;
grant execute on function public.stage_content(uuid) to db_test_runner;

revoke all on function public.bb_content_path_history(jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.bb_content_path_history(jsonb, jsonb, text, text) to service_role;
grant execute on function public.bb_content_path_history(jsonb, jsonb, text, text) to db_test_runner;
