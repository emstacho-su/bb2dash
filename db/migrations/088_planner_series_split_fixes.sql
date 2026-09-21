-- bb2dash :: 088_planner_series_split_fixes.sql
-- Phase 12b post-MVP tail, round 2 (docs/planning/80c_PHASE12B_page_pass.md, "Tail round 2 -
-- /code-review main high, 2026-09-21": TR-3, TR-4, and the SQL half of TR-6). Worker W-35.
-- 082 and 083 are applied and byte-frozen; this is a `create or replace` of two functions and
-- nothing else. Same signatures, same grants, same security invoker, same search_path.
--
-- ---------------------------------------------------------------------------------------------
-- TR-3. THE SPLIT LEFT DETACHED ROWS BEHIND ON THE OLD SERIES
-- ---------------------------------------------------------------------------------------------
-- 083 moved only the NON-detached rows at or after the cut, because those are the rows an edit
-- may rewrite. But "this and following" is a statement about a stretch of the calendar, not about
-- which rows happen to be rewritable: a detached occurrence after the cut belongs to the part
-- Stack split off, and leaving it on the old series meant a later "all events" on the new series
-- could never reach it and a delete of the old series would take it away with the past.
--
-- So the split now has TWO sets:
--   * the MOVED set - every row of the series at or after the cut, detached included. They change
--     `series_id` and nothing else; a detached row keeps `series_detached = true` and its columns.
--   * the SCOPE set - the non-detached members of that same stretch. Only these may be named in
--     `p_rows`, and naming anything else still refuses the whole call (083's rule, unchanged).
--
-- ---------------------------------------------------------------------------------------------
-- TR-4. A SPLIT FROM THE FIRST OCCURRENCE LEFT AN EMPTY SERIES ROW
-- ---------------------------------------------------------------------------------------------
-- "This and following" from the first occurrence moves (or deletes) every row the series has, and
-- 083 left the rule row behind with no occurrences and an `until_date` a day before its own
-- start. Nothing reads such a row, but it is a lie in the table and it accumulates. Both RPCs now
-- delete a series that has no rows left, in the same transaction.
--
-- There is no ON DELETE SET NULL hazard here, unlike delete-'all': a series with zero rows has
-- nothing for the foreign key to null, so 082's "detached implies a series" check cannot fire.
-- delete-'all' still clears `series_detached` first, because it deletes a series that DOES leave
-- rows behind.
--
-- ---------------------------------------------------------------------------------------------
-- TR-6 (the SQL half). THE NEW SERIES COPIED AN until_date THAT NO LONGER FITS
-- ---------------------------------------------------------------------------------------------
-- The split handed the new series the old rule's `until_date` unchanged. But the whole point of
-- "this and following" is usually to move the remaining occurrences, so the last one can now
-- start AFTER the date the rule claims to end on. The new series' `until_date` is therefore the
-- later of the old one and the last moved row's own local date - computed AFTER `p_rows` has been
-- applied, so it reflects where the occurrences actually landed.
--
-- "Local date" is read in each row's OWN `time_zone`, the unambiguous direction (an instant has
-- exactly one local date in a given zone). Nothing here rebuilds an instant from a wall clock;
-- 067's K-9 still holds. The old series' `until_date` is still the day before the cut, read in
-- the zone of the series' earliest row.

-- =============================================================================================
-- 1. planner_series_update
-- =============================================================================================
create or replace function planner_series_update(p_series_id uuid, p_scope text,
                                                 p_from timestamptz, p_rows jsonb)
  returns integer
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_freq      text;
  v_until     date;
  v_zone      text;
  v_new       uuid;
  v_new_until date;
  v_moved     uuid[];
  v_scope     uuid[];
  v_bad       text;
  v_updated   int;
begin
  if p_scope is null or p_scope not in ('following','all') then
    raise exception 'planner_series_update: p_scope must be following or all, got % '
                    '("this one" is an ordinary row update, not an RPC)',
      coalesce(p_scope, 'null') using errcode = '22023';
  end if;
  if p_scope = 'following' and p_from is null then
    raise exception 'planner_series_update: p_from is required for the following scope'
      using errcode = '22023';
  end if;

  perform planner_series_check_rows(p_rows, true);

  select s.freq, s.until_date into v_freq, v_until
    from planner_event_series s where s.id = p_series_id for update;
  if not found then
    raise exception 'planner_series_update: series % not found', p_series_id
      using errcode = 'no_data_found';
  end if;

  -- Both sets are fixed before anything moves. MOVED is the whole stretch (TR-3); SCOPE is the
  -- rewritable part of it, and it is what p_rows may name.
  select coalesce(array_agg(pe.id), '{}'::uuid[]),
         coalesce(array_agg(pe.id) filter (where not pe.series_detached), '{}'::uuid[])
    into v_moved, v_scope
    from planner_events pe
   where pe.series_id = p_series_id
     and pe.starts_at >= case when p_scope = 'following' then p_from else now() end;

  select string_agg(x.id::text, ', ') into v_bad
    from (select (e->>'id')::uuid as id from jsonb_array_elements(p_rows) e) x
   where not (x.id = any(v_scope));
  if v_bad is not null then
    raise exception 'planner_series_update: these rows are not in scope for % on series % '
                    '(detached, in another series, or starting before the cut): %',
      p_scope, p_series_id, v_bad using errcode = '22023';
  end if;

  if p_scope = 'following' then
    -- The zone to read the cut's local date in: the series' own earliest row (the header).
    select pe.time_zone into v_zone
      from planner_events pe where pe.series_id = p_series_id order by pe.starts_at limit 1;

    insert into planner_event_series (freq, until_date) values (v_freq, v_until)
      returning id into v_new;

    -- TR-3: the detached rows after the cut come along. Only series_id changes.
    update planner_events set series_id = v_new where id = any(v_moved);

    update planner_event_series
       set until_date = (p_from at time zone coalesce(v_zone, 'America/New_York'))::date - 1
     where id = p_series_id;
  end if;

  with r as (
    select (e->>'id')::uuid                     as id,
           (e->>'kind')::planner_event_kind     as kind,
           e->>'title'                          as title,
           (e->>'starts_at')::timestamptz       as starts_at,
           (e->>'ends_at')::timestamptz         as ends_at,
           e->>'time_zone'                      as time_zone,
           (e->>'all_day')::boolean             as all_day,
           e->>'location_kind'                  as location_kind,
           e->>'location'                       as location,
           e->>'notes'                          as notes,
           (e->>'done')::boolean                as done,
           e->>'course_id'                      as course_id
      from jsonb_array_elements(p_rows) e)
  update planner_events pe
     set kind          = r.kind,
         title         = r.title,
         starts_at     = r.starts_at,
         ends_at       = r.ends_at,
         time_zone     = r.time_zone,
         all_day       = r.all_day,
         location_kind = r.location_kind,
         location      = r.location,
         notes         = r.notes,
         done          = r.done,
         course_id     = r.course_id
    from r
   where pe.id = r.id;

  get diagnostics v_updated = row_count;

  if p_scope = 'following' then
    -- TR-6: after p_rows has landed, the new rule must cover where its occurrences actually are.
    select greatest(v_until, coalesce(max((pe.starts_at at time zone pe.time_zone)::date), v_until))
      into v_new_until
      from planner_events pe where pe.series_id = v_new;
    update planner_event_series set until_date = v_new_until where id = v_new;

    -- TR-4: a rule with no occurrences left is not a rule.
    if not exists (select 1 from planner_events pe where pe.series_id = p_series_id) then
      delete from planner_event_series s where s.id = p_series_id;
    end if;
  end if;

  return v_updated;
end $$;

comment on function planner_series_update(uuid, text, timestamptz, jsonb) is
  'Rewrites a series'' occurrences by id and returns how many rows it changed. p_scope '
  '''following'': a new series takes the old rule, EVERY row starting at or after p_from moves to '
  'it - detached ones too, moved and not rewritten (TR-3) - the rows named in p_rows are updated '
  'by id, the new series'' until_date becomes the later of the old one and the last moved row''s '
  'own local date (TR-6), the old series'' until_date becomes the day before the cut, and an old '
  'series left with no rows is deleted (TR-4). p_scope ''all'': the non-detached rows starting at '
  'or after now(). A row named in p_rows that is not in scope - detached, in another series, or '
  'in the past - refuses the whole call. Row ids never change, so the Google mirror sees patches. '
  'Security invoker: RLS is the boundary.';

revoke all on function public.planner_series_update(uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function public.planner_series_update(uuid, text, timestamptz, jsonb) to authenticated;

-- =============================================================================================
-- 2. planner_series_delete
-- =============================================================================================
create or replace function planner_series_delete(p_series_id uuid, p_scope text,
                                                 p_from timestamptz)
  returns integer
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_zone    text;
  v_deleted int;
begin
  if p_scope is null or p_scope not in ('following','all') then
    raise exception 'planner_series_delete: p_scope must be following or all, got % '
                    '("this one" is an ordinary row delete, not an RPC)',
      coalesce(p_scope, 'null') using errcode = '22023';
  end if;
  if p_scope = 'following' and p_from is null then
    raise exception 'planner_series_delete: p_from is required for the following scope'
      using errcode = '22023';
  end if;

  perform 1 from planner_event_series s where s.id = p_series_id for update;
  if not found then
    raise exception 'planner_series_delete: series % not found', p_series_id
      using errcode = 'no_data_found';
  end if;

  select pe.time_zone into v_zone
    from planner_events pe where pe.series_id = p_series_id order by pe.starts_at limit 1;

  if p_scope = 'following' then
    -- Detached rows go too: Stack asked for this occurrence onwards to be gone.
    delete from planner_events pe
     where pe.series_id = p_series_id and pe.starts_at >= p_from;
    get diagnostics v_deleted = row_count;

    update planner_event_series
       set until_date = (p_from at time zone coalesce(v_zone, 'America/New_York'))::date - 1
     where id = p_series_id;

    -- TR-4: nothing left to repeat. No row survives, so the foreign key has nothing to null and
    -- 082's "detached implies a series" check cannot fire.
    if not exists (select 1 from planner_events pe where pe.series_id = p_series_id) then
      delete from planner_event_series s where s.id = p_series_id;
    end if;
  else
    delete from planner_events pe
     where pe.series_id = p_series_id and pe.starts_at >= now();
    get diagnostics v_deleted = row_count;

    -- The series row is about to go, and the FK will null series_id on every row it leaves
    -- behind. 082's check says a row with no series cannot be detached from one, so the flag
    -- is cleared first - those rows are ordinary events from here on.
    update planner_events pe
       set series_detached = false
     where pe.series_id = p_series_id and pe.series_detached;

    delete from planner_event_series s where s.id = p_series_id;
  end if;

  return v_deleted;
end $$;

comment on function planner_series_delete(uuid, text, timestamptz) is
  'Deletes a series'' occurrences and returns how many rows went. p_scope ''following'': every '
  'row (detached included) starting at or after p_from, until_date is shortened to the day before '
  'the cut, and a series left with no rows is deleted (TR-4). p_scope ''all'': every row starting '
  'at or after now(), then the series row itself - past occurrences stay behind with series_id '
  'null and series_detached cleared, which is Stack''s answer 15. Security invoker: RLS is the '
  'boundary.';

revoke all on function public.planner_series_delete(uuid, text, timestamptz) from public, anon;
grant execute on function public.planner_series_delete(uuid, text, timestamptz) to authenticated;

-- =============================================================================================
-- Guards: the two functions are still invoker-only and still callable by authenticated alone
-- =============================================================================================
do $$
declare
  v_bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('planner_series_update','planner_series_delete')
     and (p.prosecdef
          or p.proacl is null
          or has_function_privilege('anon', p.oid, 'execute')
          or not has_function_privilege('authenticated', p.oid, 'execute')
          or exists (select 1 from unnest(p.proacl) a where a::text like '=%'));
  if v_bad is not null then
    raise exception '088: these functions have the wrong security or grants: %', v_bad;
  end if;
end $$;
