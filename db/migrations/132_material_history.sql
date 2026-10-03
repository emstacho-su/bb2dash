-- bb2dash :: 132_material_history.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), tasks 7 and 8
-- (R-71, R-38, P-98, B-18). Worker W-52. Additive, except the restamp of stored
-- detail.missing_since values in step 5, which the brief names.
--
-- WHY. Nothing recorded what a crawl added, changed or removed. bb_content and bb_files hold
-- the newest state only, so the Stream posted every current file on every read and Activity
-- could only say "N new item(s)". This table is the per-crawl history both read: one row per
-- content item or file that APPEARED, CHANGED or VANISHED in a registered crawl, measured
-- against the crawl before it. Append-per-run, shaped like bb_gradebook (DECISIONS 2026-09-15).
-- Kept in full through the term; nothing prunes it (B-18).
--
-- WHAT `material_history_record(p_run_id)` DOES
--   * For each course the run carried, it finds the PREDECESSOR: the newest registered crawl
--     (agent_requests.run_id) whose real sync_runs row was folded (status ok or partial) and
--     that holds an older bb_raw row for the same course. A claim-opened `running` row, a
--     reaped `failed` row and a driver-error `failed` row are skipped: none of those crawls
--     was folded, so a later run diffs against the last folded one.
--   * Content is keyed (course_id, item id). An item CHANGED when its title, path, url or
--     modified time differs; changed_fields names which.
--   * Files are keyed (course_id, item id, file name). A file CHANGED when its url differs.
--   * VANISHED is recorded at the run that first missed the item (P-98), with the title and
--     path the predecessor carried, and only for courses the run carried.
--   * A course with no predecessor is a BASELINE and writes nothing, so the first crawl of a
--     course never posts its whole tree as new.
--   * Nothing is written when a history row already exists for a newer registered crawl
--     (older_run = true). Idempotent: `on conflict do nothing`, so a second call writes 0 and
--     returns zeros.
--   * Returns {appeared, changed, vanished, baseline_courses, older_run, sample}. The three
--     counts are the rows this call wrote. sample holds up to three {change, entity, title}
--     per change kind, files first, for 134's Activity lines.
--
-- TWO THINGS THIS FILE DECIDES THAT THE CONTRACT'S WORDING DOES NOT (both reported to the PM)
--   1. FILE REFS COME FROM BOTH `embeddedFiles` AND `detail.file`, exactly the two sources the
--      live stage_files reads into its _bb_refs. The Contract says "from embeddedFiles". On
--      2026-10-02 the newest crawl carried 55 embeddedFiles refs and 30 detail.file refs. A
--      detail.file item is a node of kind `file` that a bb_files row claims, so 133's node arm
--      leaves it out; with embeddedFiles alone those 30 files would never post on the Stream.
--      PM's call, 2026-10-02: both sources. The reason the Contract gave for its wording still
--      holds: both keys live in the content payload, never in `attempts`, so one of Stack's own
--      submissions is never recorded. Session-scoped urls (`/sessions/`) are left out as
--      stage_files leaves them out: they change on every crawl and are never catalogued.
--   2. "A COURSE THE RUN CARRIED" means its bb_raw row holds at least one content item, for this
--      run and for a predecessor alike. That is stage_content's rule for the missing stamp
--      (131, and 026 before it), and P-98 needs the stamp and the `vanished` row to agree. A
--      crawl that returned an empty tree for a course vanishes nothing, and the next crawl does
--      not report the whole tree as new.
--
-- Urls are compared after bb_abs_url, and modified times after stage_content's parse, so a
-- change in how a crawler version spells either one is not reported as a change in Blackboard.
--
-- bb_file_id is matched on (bb_course_id, source_url), which Phase 18 keeps unique, after
-- stage_files has catalogued the run (135 calls this function after stage_files).
--
-- Step 4 backfills every registered, folded crawl, oldest first. Step 5 then restamps each
-- stored detail.missing_since that disagrees with its item's newest `vanished` row, so the
-- one vanish convention (P-98) holds for the stamps that predate it.

-- =============================================================================================
-- 1. The table
-- =============================================================================================

create table public.bb_material_history (
  id             bigint generated always as identity primary key,
  run_id         uuid not null,
  course_id      text not null references public.courses(id) on delete cascade,
  entity         text not null check (entity in ('content', 'file')),
  bb_item_id     text not null,
  file_name      text not null default '',
  bb_file_id     bigint null references public.bb_files(id) on delete set null,
  change         text not null check (change in ('appeared', 'changed', 'vanished')),
  changed_fields text[] null,
  title          text not null,
  path           text null,
  seen_at        timestamptz not null,
  recorded_at    timestamptz not null default now(),
  constraint bb_material_history_key unique (run_id, entity, course_id, bb_item_id, file_name)
);

create index bb_material_history_course_run_idx
  on public.bb_material_history (course_id, run_id);

comment on table public.bb_material_history is
  'Per-crawl history of course materials (132): one row per content item or file that appeared, '
  'changed or vanished in a registered crawl, against the newest folded crawl before it. '
  'Append-per-run, written only by material_history_record. entity content | file; a file row '
  'carries the node that holds it in bb_item_id and its name in file_name (empty for content). '
  'run_id on a vanished row is the run that first missed the item (P-98). seen_at is the '
  'captured_at of that course''s bb_raw row in run_id, and is the Stream''s posted_at. The first '
  'crawl of a course is a baseline and has no rows. Kept in full through the term.';

alter table public.bb_material_history enable row level security;

create policy bb_material_history_owner_read on public.bb_material_history
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

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

  -- A newer registered crawl already has history: this run is being replayed, and writing its
  -- diff now would post old changes after newer ones. Same idea as 043 and 056.
  select exists (
           select 1
             from (select distinct h.run_id from bb_material_history h where h.run_id <> p_run_id) n
            where exists (select 1 from agent_requests a where a.kind = 'sync' and a.run_id = n.run_id)
              and (select max(b.captured_at) from bb_raw b where b.run_id = n.run_id) > v_last)
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
           bb_abs_url(coalesce(i.item -> 'detail' -> 'file' ->> 'url',
                               i.item -> 'detail' ->> 'url'))  as url,
           case
             when jsonb_typeof(i.item -> 'modified') = 'number'
               then to_timestamp((i.item ->> 'modified')::numeric / 1000.0)
             when jsonb_typeof(i.item -> 'modified') = 'string'
              and (i.item ->> 'modified') ~ '^\d{4}-\d{2}-\d{2}[T ]'
               then (i.item ->> 'modified')::timestamptz
           end                                                 as modified_at
      from items i
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
           null::timestamptz     as modified_at
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
               case when c.entity = 'content' and c.path is distinct from p.path then 'path' end,
               case when c.url is distinct from p.url then 'url' end,
               case when c.entity = 'content' and c.modified_at is distinct from p.modified_at then 'modified' end
             ], null)
           end                                      as changed_fields,
           coalesce(c.title, p.title)               as title,
           coalesce(c.path, p.path)                 as path,
           coalesce(c.url, p.url)                   as url,
           coalesce(c.bb_course_id, p.bb_course_id) as bb_course_id
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
    returning change, entity, title, bb_item_id
  ),
  ranked as (
    select i.change, i.entity, i.title,
           row_number() over (partition by i.change
                              order by (i.entity = 'file') desc, i.title, i.bb_item_id) as rn
      from ins i
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
  'Records what one crawl added, changed or removed (132). Diffs the run''s bb_raw course rows '
  'against the predecessor: the newest registered crawl folded ok or partial with an older row '
  'for the same course. Content is keyed (course_id, item id) and changed on title, path, url or '
  'modified; files are keyed (course_id, item id, file name), read from embeddedFiles and '
  'detail.file as stage_files reads them, and changed on url. A course with no predecessor is a '
  'baseline and writes nothing; a course whose row carries no content item is not carried. '
  'Writes nothing when a newer registered crawl already has history (older_run). on conflict do '
  'nothing, so a second call writes 0. Returns {appeared, changed, vanished, baseline_courses, '
  'older_run, sample}; the counts are rows written, sample is up to three {change, entity, '
  'title} per change kind. Writes only bb_material_history.';

-- =============================================================================================
-- 3. Grants. RLS is the boundary for the app: the owner reads, nothing but this function writes.
-- =============================================================================================

revoke all on public.bb_material_history from public, anon, authenticated;
grant select on public.bb_material_history to authenticated;
grant all on public.bb_material_history to service_role;
grant select on public.bb_material_history to db_test_runner;

revoke all on function public.material_history_record(uuid) from public, anon, authenticated;
grant execute on function public.material_history_record(uuid) to service_role;
grant execute on function public.material_history_record(uuid) to db_test_runner;

-- =============================================================================================
-- 4. Backfill: every registered, folded crawl, oldest first
-- =============================================================================================

do $$
declare
  r      record;
  v_res  jsonb;
  v_runs integer := 0;
begin
  for r in
    select a.run_id
      from (select distinct q.run_id
              from public.agent_requests q
             where q.kind = 'sync' and q.run_id is not null) a
     where exists (select 1 from public.sync_runs s
                    where s.run_id = a.run_id
                      and s.scope is distinct from 'unregistered'
                      and s.status in ('ok', 'partial'))
       and exists (select 1 from public.bb_raw b where b.run_id = a.run_id and b.kind = 'course')
     order by (select max(b.captured_at) from public.bb_raw b where b.run_id = a.run_id)
  loop
    v_res := public.material_history_record(r.run_id);
    if (v_res ->> 'older_run')::boolean then
      raise exception '132 failed: the backfill reached crawl % out of order', r.run_id;
    end if;
    v_runs := v_runs + 1;
    raise notice '132: crawl %: %', r.run_id, v_res - 'sample';
  end loop;
  raise notice '132: % crawl(s) backfilled, % history row(s)',
    v_runs, (select count(*) from public.bb_material_history);
end $$;

-- =============================================================================================
-- 5. One vanish convention (P-98). A stored detail.missing_since that disagrees with its item's
--    newest `vanished` row takes that row's run. Rows with no stamp, and stamped rows with no
--    `vanished` row, are untouched.
-- =============================================================================================

do $$
declare
  v_restamped bigint;
  v_left      bigint;
begin
  update public.bb_content b
     set detail = jsonb_set(b.detail, '{missing_since}', to_jsonb(v.run_id::text))
    from (select distinct on (h.course_id, h.bb_item_id)
                 h.course_id, h.bb_item_id, h.run_id
            from public.bb_material_history h
           where h.entity = 'content' and h.change = 'vanished'
           order by h.course_id, h.bb_item_id, h.seen_at desc, h.id desc) v
   where v.course_id = b.course_id
     and v.bb_item_id = b.bb_item_id
     and b.detail ->> 'missing_since' is not null
     and b.detail ->> 'missing_since' is distinct from v.run_id::text;
  get diagnostics v_restamped = row_count;

  select count(*) into v_left
    from public.bb_content b
   where b.detail ->> 'missing_since' is not null
     and exists (select 1 from public.bb_material_history h
                  where h.run_id::text = b.detail ->> 'missing_since')
     and not exists (select 1 from public.bb_material_history h
                      where h.entity = 'content' and h.change = 'vanished'
                        and h.course_id = b.course_id and h.bb_item_id = b.bb_item_id
                        and h.run_id::text = b.detail ->> 'missing_since');
  if v_left <> 0 then
    raise exception '132 failed: % stamped row(s) still disagree with the history', v_left;
  end if;

  raise notice '132: % missing_since stamp(s) restamped', v_restamped;
end $$;
