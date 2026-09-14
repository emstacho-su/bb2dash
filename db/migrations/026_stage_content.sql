-- bb2dash :: 026_stage_content.sql
-- Phase 8 (W-12). Spec: docs/planning/61_PHASE8_course_dimension.md
-- "§Contract -> stage_content(p_run_id uuid) (migration 026) - the seam with Phase 9".
--
-- Folds the `content` array of every `bb_raw` row `where run_id = p_run_id and kind = 'course'`
-- into `bb_content`, idempotently. Phase 9's transform driver CALLS this; the signature
-- `stage_content(p_run_id uuid) returns jsonb` is frozen by the phase seam.
--
-- Never touches bb_files, assignments, or any *_progress table. Never touches
-- bb_content.assignment_id either: the content->assignment link is owned by the classify pass,
-- not by this stage.
--
-- ---------------------------------------------------------------------------------------------
-- DEVIATION FROM THE BRIEF (recorded, not silent) - course resolution
--
-- The brief says "`course_id` resolves via `courses.bb_course_id = bb_raw.bb_course_id`".
-- The data says otherwise: `bb_raw.bb_course_id` holds Blackboard's internal shell id
-- (`_569316_1`), which is `courses.bb_id`. `courses.bb_course_id` is the registrar-style code
-- (`GEO.103.M001.FALL26`), and it matches 0 of the 7 rows of run 6b122650. Resolving the
-- brief's way stages nothing at all.
--
-- This function therefore matches on `courses.bb_id` FIRST and falls back to
-- `courses.bb_course_id`, so both spellings work and the brief's literal wording still
-- resolves if a future writer posts the registrar code as `bb_raw.bb_course_id`. Items whose
-- shell resolves to no `courses` row are skipped, not guessed, and counted in the returned
-- `unresolved_courses` / `unresolved_items`.
-- ---------------------------------------------------------------------------------------------
--
-- OTHER RULES THE BRIEF DID NOT PIN DOWN, decided here and reported in
-- docs/planning/63_W12_VERIFICATION.md:
--
--   * `modified` arrives as epoch MILLISECONDS (a JSON number) from ingest/bb_crawler.js, not
--     as an ISO string. Both are accepted; anything else lands as null rather than raising.
--   * Duplicate `(course_id, path)` inside ONE run: the upsert key is unique, so the run cannot
--     carry two of them. IST.466 really does publish two sibling lessons named Information /
--     Assignments / Content (positions 2,3,4 and 9,10,11) plus two identically-pathed children.
--     First occurrence in crawl order wins - which is also the row bb_content already holds -
--     and the losers are counted as `duplicate_paths` and otherwise left alone. This is a
--     genuine representational gap in the frozen `(course_id, path)` key, NOT something this
--     function invents a disambiguator for.
--   * `body` is the payload's `body` only. The payload's separate `description` (6 rows in the
--     run, all on items whose `body` is null) is preserved under `detail->'description'` so
--     nothing is dropped, but it is not merged into `body`.
--   * `embeddedFiles` is deliberately ignored: files are Phase 9's `stage_files` stage.
--   * `detail->>'missing_since'` is CLEARED when an item reappears in a later run. A row that
--     is present in the run is not missing, and leaving the marker would be a stale claim.
--   * A Blackboard content type this mapping does not know lands as item_kind 'other' rather
--     than being folded into an existing kind.

-- ---------------------------------------------------------------------------------------------
-- 1. detail merge helper. Kept out of the ON CONFLICT clause so the previous-id rule is
--    readable and testable on its own.
-- ---------------------------------------------------------------------------------------------
create or replace function public.bb_content_detail_merge(
  p_old         jsonb,
  p_new         jsonb,
  p_old_item_id text,
  p_new_item_id text
) returns jsonb
language sql immutable
set search_path = ''
as $$
  select nullif(
           coalesce(p_new, '{}'::jsonb)
           || case when jsonb_array_length(prev.ids) > 0
                   then jsonb_build_object('previous_ids', prev.ids)
                   else '{}'::jsonb end,
           '{}'::jsonb)
  from (
    select case
             when p_old_item_id is not null
              and p_old_item_id is distinct from p_new_item_id
              and not (coalesce(p_old -> 'previous_ids', '[]'::jsonb) @> to_jsonb(p_old_item_id))
               then coalesce(p_old -> 'previous_ids', '[]'::jsonb) || to_jsonb(p_old_item_id)
             else coalesce(p_old -> 'previous_ids', '[]'::jsonb)
           end as ids
  ) prev;
$$;

comment on function public.bb_content_detail_merge(jsonb, jsonb, text, text) is
  'Merges a bb_content.detail payload for stage_content: the run''s detail wins, and a '
  're-created item (same path, new bb_item_id) keeps the old id in detail->''previous_ids'' '
  '(appended once, never duplicated). Any stale missing_since is dropped, because an item '
  'present in the run is not missing. Returns NULL rather than an empty object.';

-- ---------------------------------------------------------------------------------------------
-- 2. stage_content. SECURITY DEFINER so Phase 9's driver can run it under the owner's JWT
--    while the underlying tables stay owner-scoped (migration 020). The owner guard below is
--    what keeps "security definer" from meaning "any authenticated user can rewrite the tree":
--    a JWT that is not the owner's is refused; a null auth.uid() (service_role, psql, the SQL
--    editor, pg_cron) is allowed, exactly as with any other back-office job.
-- ---------------------------------------------------------------------------------------------
create or replace function public.stage_content(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid          uuid := auth.uid();
  v_inserted     integer := 0;
  v_updated      integer := 0;
  v_missing      integer := 0;
  v_fallbacks    integer := 0;
  v_duplicates   integer := 0;
  v_items        integer := 0;
  v_courses      integer := 0;
  v_bad_shells   integer := 0;
  v_bad_items    integer := 0;
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
  -- 2a. Shape every item of the run once. Kept in a temp table because the upsert, the parent
  --     pass and the missing pass all read the same shaped set.
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
           x.item ->> 'path'                         as path,
           string_to_array(x.item ->> 'path', ' / ') as segs
      from expanded x
     where nullif(btrim(coalesce(x.item ->> 'path', '')), '') is not null
  )
  select
    s.course_id,
    s.ord,
    row_number() over (partition by s.course_id, s.path order by s.ord) as rn,
    s.path,
    case when array_length(s.segs, 1) > 1
         then array_to_string(s.segs[1 : array_length(s.segs, 1) - 1], ' / ')
    end                                                                    as parent_path,
    s.item ->> 'id'                                                        as bb_item_id,
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
         count(*) filter (where rn > 1),
         count(*) filter (where rn = 1 and title_fallback)
    into v_items, v_courses, v_duplicates, v_fallbacks
    from _stage_items;

  -- ------------------------------------------------------------------------------------------
  -- 2b. Upsert on the existing (course_id, path) unique key. parent_id is left alone here and
  --     resolved in 2c, because a parent can be inserted by this same statement.
  -- ------------------------------------------------------------------------------------------
  with up as (
    insert into bb_content as b
      (course_id, bb_item_id, title, item_kind, path, url,
       bb_type, state, modified_at, body, detail, run_id, captured_at)
    select s.course_id, s.bb_item_id, s.title, s.item_kind, s.path, s.url,
           s.bb_type, s.state, s.modified_at, s.body,
           nullif(s.detail_base, '{}'::jsonb), p_run_id, now()
      from _stage_items s
     where s.rn = 1
    on conflict (course_id, path) do update set
      bb_item_id  = excluded.bb_item_id,
      title       = excluded.title,
      item_kind   = excluded.item_kind,
      url         = excluded.url,
      bb_type     = excluded.bb_type,
      state       = excluded.state,
      modified_at = excluded.modified_at,
      body        = excluded.body,
      detail      = public.bb_content_detail_merge(b.detail, excluded.detail,
                                                   b.bb_item_id, excluded.bb_item_id),
      run_id      = p_run_id,
      captured_at = now()
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert),
         count(*) filter (where not was_insert)
    into v_inserted, v_updated
    from up;

  -- ------------------------------------------------------------------------------------------
  -- 2c. parent_id by parent path. A root item (no ' / ' in its path) gets null, which is why
  --     this is an outer join and not a filter.
  -- ------------------------------------------------------------------------------------------
  update bb_content b
     set parent_id = p.id
    from _stage_items s
    left join bb_content p
           on p.course_id = s.course_id
          and p.path = s.parent_path
   where s.rn = 1
     and b.course_id = s.course_id
     and b.path = s.path
     and b.parent_id is distinct from p.id;

  -- ------------------------------------------------------------------------------------------
  -- 2d. Items the run did not carry are kept, not deleted, and stamped once with the run that
  --     first missed them. Scoped to the courses this run actually covered, so a partial run
  --     never marks another course's tree missing.
  -- ------------------------------------------------------------------------------------------
  with marked as (
    update bb_content b
       set detail = coalesce(nullif(b.detail, 'null'::jsonb), '{}'::jsonb)
                    || jsonb_build_object('missing_since', p_run_id::text)
     where b.course_id in (select distinct s.course_id from _stage_items s)
       and not exists (select 1
                         from _stage_items s
                        where s.rn = 1
                          and s.course_id = b.course_id
                          and s.path = b.path)
       and coalesce(nullif(b.detail, 'null'::jsonb), '{}'::jsonb) ->> 'missing_since' is null
    returning 1
  )
  select count(*) into v_missing from marked;

  drop table if exists pg_temp._stage_items;

  return jsonb_build_object(
    'inserted',           v_inserted,
    'updated',            v_updated,
    'missing',            v_missing,
    'title_fallbacks',    v_fallbacks,
    'duplicate_paths',    v_duplicates,
    'unresolved_courses', v_bad_shells,
    'unresolved_items',   v_bad_items,
    'items',              v_items,
    'courses',            v_courses,
    'run_id',             p_run_id
  );
end;
$fn$;

comment on function public.stage_content(uuid) is
  'Phase 8 seam. Folds bb_raw(kind=''course'', run_id=p_run_id) payload->content into '
  'bb_content on the (course_id, path) unique key: bb_item_id, parent_id (by parent path), '
  'item_kind, bb_type, url, state, modified_at, body, detail, run_id, captured_at. Title '
  'falls back to "<parent folder> (document)" (or "Untitled document" at root) when the '
  'payload title is blank or the literal ultraDocumentBody. Re-created items keep the old id '
  'in detail->''previous_ids''; items absent from the run are kept and stamped '
  'detail->>''missing_since''. Never touches bb_files, assignments, assignment_id or any '
  '*_progress table. Returns {inserted, updated, missing, title_fallbacks} plus '
  'duplicate_paths / unresolved_courses / unresolved_items / items / courses / run_id. '
  'Phase 9 calls it per run; a change belongs in a Phase 9 migration that create-or-replaces it.';

-- ---------------------------------------------------------------------------------------------
-- 3. Grants. anon can never reach it; authenticated can, but the owner guard inside the
--    function is what actually decides.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.stage_content(uuid) from public, anon;
grant execute on function public.stage_content(uuid) to authenticated, service_role;

revoke all on function public.bb_content_detail_merge(jsonb, jsonb, text, text) from public, anon;
grant execute on function public.bb_content_detail_merge(jsonb, jsonb, text, text)
  to authenticated, service_role;
