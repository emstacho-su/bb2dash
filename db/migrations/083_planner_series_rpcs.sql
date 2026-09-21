-- bb2dash :: 083_planner_series_rpcs.sql
-- Phase 12b post-MVP tail, item T-1 (docs/planning/80c_PHASE12B_page_pass.md, "Post-MVP tail -
-- frozen contract", T-1, the RPC table). Worker W-35. 082 is applied and byte-frozen.
--
-- Contents
--   planner_series_check_rows()   the shape gate every RPC runs before it writes
--   planner_series_create()       series + its occurrences, one transaction -> the series id
--   planner_series_update()       "this and following" / "all events"        -> rows updated
--   planner_series_delete()       "this and following" / "all events"        -> rows deleted
--
-- ---------------------------------------------------------------------------------------------
-- THE RULE THESE FUNCTIONS DO NOT BREAK: SQL NEVER CONVERTS A WALL CLOCK
-- ---------------------------------------------------------------------------------------------
-- 067's K-9. The web expands the recurrence in `planner-recurrence.ts` with Temporal's
-- "compatible" DST rule and sends INSTANTS; Postgres resolves a DST fold the other way, so if
-- SQL rebuilt an instant from a local date and time the two layers would disagree twice a year.
-- So `starts_at` / `ends_at` are cast straight from the strings the client sent and stored as
-- they arrive - and `planner_series_check_rows()` refuses a timestamp string WITHOUT an explicit
-- offset, because that is precisely the string Postgres would have to interpret in a zone.
--
-- The one wall-clock reading here is the opposite direction and is unambiguous: shortening
-- `until_date` needs the LOCAL DATE of the split instant, and an instant has exactly one local
-- date in a given zone. The zone used is the one the series' own earliest row was entered in
-- (its rows come from a single draft, so they share it); 'America/New_York' if the series somehow
-- has no rows left. `until_date` is metadata about the rule - nothing expands it, and the
-- occurrences are already rows - so this cannot move an event.
--
-- ---------------------------------------------------------------------------------------------
-- SECURITY INVOKER, ON PURPOSE
-- ---------------------------------------------------------------------------------------------
-- Every function here runs as the caller, so 067's and 082's owner-only policies are the
-- boundary exactly as they are for an ordinary PostgREST write. A stranger's JWT gets no rows
-- from the SELECTs and is refused by the INSERT policies; nothing is bypassed. `search_path` is
-- pinned to `public, pg_temp` so a caller cannot shadow a referenced object, and EXECUTE is
-- revoked from `public` and `anon` and granted to `authenticated` only.
--
-- ---------------------------------------------------------------------------------------------
-- STRICT JSONPATH, AND THE ONE THING IT CANNOT SAY (080's lesson, measured on prod)
-- ---------------------------------------------------------------------------------------------
-- 080: a LAX path unwraps arrays and swallows structural errors, so `{"k": [1]}` satisfied a
-- "every member is a number" check. Every TYPE rule below is therefore strict-mode.
-- But strict mode cannot express "this key is missing": `strict $[*] ? (!exists(@.kind))`
-- returns FALSE for an element with no `kind`, because the structural error makes the predicate
-- unknown and `!unknown` is not true (measured on prod, 2026-09-21). Presence is therefore
-- checked with a LAX path, where the same expression is true - lax mode is safe for presence
-- because presence is the only thing it is asked. Unknown keys are refused outright, so a typo
-- in the client cannot silently drop a column.
--
-- ---------------------------------------------------------------------------------------------
-- WHAT "IN SCOPE" MEANS, AND WHY AN OUT-OF-SCOPE ROW IS AN ERROR
-- ---------------------------------------------------------------------------------------------
-- An update's scope is computed BEFORE anything moves: the series' non-detached rows starting at
-- or after `p_from` ("following") or `now()` ("all"). If `p_rows` names a row that is not in
-- that set - detached, in another series, already past, or simply not there - the whole call is
-- refused. Skipping it silently would tell the browser the edit succeeded while one occurrence
-- quietly kept its old text, and the optimistic cache would then hold a lie.
--
-- Updates are done BY ID, so a row keeps its identity: `v_calendar_push_items` derives the
-- Google event id from `planner_events.id`, which means Google sees a patch and never a delete
-- plus an insert. That is the whole reason the split moves rows to a new series instead of
-- recreating them.

-- =============================================================================================
-- 1. The shape gate
-- =============================================================================================
create or replace function planner_series_check_rows(p_rows jsonb, p_require_id boolean)
  returns void
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_len int;
  v_bad text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'planner series: p_rows must be a json array, got %',
      coalesce(jsonb_typeof(p_rows), 'null') using errcode = '22023';
  end if;

  v_len := jsonb_array_length(p_rows);
  if v_len < 1 or v_len > planner_series_max_occurrences() then
    raise exception 'planner series: p_rows holds % occurrences; it must hold 1 to %',
      v_len, planner_series_max_occurrences() using errcode = '22023';
  end if;

  -- Strict: every element is an object (lax mode would unwrap a nested array here).
  if jsonb_path_exists(p_rows, 'strict $[*] ? (@.type() != "object")') then
    raise exception 'planner series: every element of p_rows must be a json object'
      using errcode = '22023';
  end if;

  -- Lax, and only for presence: strict mode cannot say "this key is missing" (see the header).
  if jsonb_path_exists(p_rows, 'lax $[*] ? (!exists(@.kind) || !exists(@.title)
                                            || !exists(@.starts_at) || !exists(@.ends_at)
                                            || !exists(@.time_zone) || !exists(@.all_day))') then
    raise exception 'planner series: every element of p_rows needs kind, title, starts_at, '
                    'ends_at, time_zone and all_day' using errcode = '22023';
  end if;
  if p_require_id and jsonb_path_exists(p_rows, 'lax $[*] ? (!exists(@.id))') then
    raise exception 'planner series: an update names the row it changes - every element of '
                    'p_rows needs id' using errcode = '22023';
  end if;

  -- Strict: the required members' types.
  if jsonb_path_exists(p_rows, 'strict $[*] ? (@.kind.type() != "string"
                                               || @.title.type() != "string"
                                               || @.starts_at.type() != "string"
                                               || @.ends_at.type() != "string"
                                               || @.time_zone.type() != "string"
                                               || @.all_day.type() != "boolean")') then
    raise exception 'planner series: kind, title, starts_at, ends_at and time_zone must be '
                    'strings and all_day a boolean' using errcode = '22023';
  end if;

  -- Strict: the optional members are a string or json null, except done, which is a boolean.
  if jsonb_path_exists(p_rows, 'strict $[*] ? (@.location_kind.type() != "string"
                                                 && @.location_kind.type() != "null"
                                               || @.location.type() != "string"
                                                 && @.location.type() != "null"
                                               || @.notes.type() != "string"
                                                 && @.notes.type() != "null"
                                               || @.course_id.type() != "string"
                                                 && @.course_id.type() != "null")') then
    raise exception 'planner series: location_kind, location, notes and course_id must be a '
                    'string or null' using errcode = '22023';
  end if;
  if jsonb_path_exists(p_rows, 'strict $[*] ? (@.done.type() != "boolean"
                                               && @.done.type() != "null")') then
    raise exception 'planner series: done must be a boolean or null' using errcode = '22023';
  end if;

  -- Strict: starts_at and ends_at carry their own offset, so nothing here interprets a wall
  -- clock (the header). 'Z' or +/-HH:MM, seconds and fractional seconds optional.
  if jsonb_path_exists(p_rows,
        'strict $[*] ? (!(@.starts_at like_regex "^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:?\\d{2})$")
                     || !(@.ends_at like_regex "^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:?\\d{2})$"))') then
    raise exception 'planner series: starts_at and ends_at must be ISO 8601 instants with an '
                    'explicit offset (the database never reads a wall clock)'
      using errcode = '22023';
  end if;

  if p_require_id and jsonb_path_exists(p_rows,
        'strict $[*] ? (@.id.type() != "string"
                     || !(@.id like_regex "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"))') then
    raise exception 'planner series: id must be a uuid string' using errcode = '22023';
  end if;

  -- No key the insert would drop on the floor.
  select string_agg(distinct k, ', ' order by k) into v_bad
    from jsonb_array_elements(p_rows) e, jsonb_object_keys(e) k
   where k not in ('id','kind','title','starts_at','ends_at','time_zone','all_day',
                   'location_kind','location','notes','done','course_id');
  if v_bad is not null then
    raise exception 'planner series: p_rows holds unknown keys: %', v_bad using errcode = '22023';
  end if;
end $$;

comment on function planner_series_check_rows(jsonb, boolean) is
  'The shape gate for 083''s three RPCs: p_rows is a json array of 1 to '
  'planner_series_max_occurrences() objects, each carrying the planner_events insert columns '
  '(and id when p_require_id). Type rules use strict-mode jsonpath (080: lax unwraps arrays); '
  'presence uses a lax path because strict mode cannot express a missing key. starts_at and '
  'ends_at must be ISO instants with an explicit offset, so no wall clock is ever interpreted '
  'here. Unknown keys are refused. It writes nothing; it only raises. Granted to authenticated '
  'because the three RPCs are security invoker and call it as the caller.';

revoke all on function public.planner_series_check_rows(jsonb, boolean) from public, anon;
grant execute on function public.planner_series_check_rows(jsonb, boolean) to authenticated;

-- =============================================================================================
-- 2. planner_series_create
-- =============================================================================================
create or replace function planner_series_create(p_freq text, p_until date, p_rows jsonb)
  returns uuid
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_series uuid;
begin
  if p_freq is null or p_freq not in ('daily','weekly','monthly') then
    raise exception 'planner_series_create: p_freq must be daily, weekly or monthly, got %',
      coalesce(p_freq, 'null') using errcode = '22023';
  end if;
  if p_until is null then
    raise exception 'planner_series_create: p_until is required - a repeat must end '
                    '(Stack''s answer 15)' using errcode = '22023';
  end if;

  perform planner_series_check_rows(p_rows, false);

  insert into planner_event_series (freq, until_date) values (p_freq, p_until)
    returning id into v_series;

  insert into planner_events (kind, title, starts_at, ends_at, time_zone, all_day,
                              location_kind, location, notes, done, course_id, series_id)
  select (r->>'kind')::planner_event_kind,
         r->>'title',
         (r->>'starts_at')::timestamptz,
         (r->>'ends_at')::timestamptz,
         r->>'time_zone',
         (r->>'all_day')::boolean,
         r->>'location_kind',
         r->>'location',
         r->>'notes',
         (r->>'done')::boolean,
         r->>'course_id',
         v_series
    from jsonb_array_elements(p_rows) as r;

  return v_series;
end $$;

comment on function planner_series_create(text, date, jsonb) is
  'Creates a repeat rule and its occurrences in one transaction and returns the series id. '
  'p_rows are finished rows the web expanded (1 to 52); this function neither expands the rule '
  'nor converts a wall clock. 067''s zone and all-day triggers and 082''s cap trigger all fire '
  'as they would for an ordinary insert, and RLS decides who may write - it is security invoker.';

revoke all on function public.planner_series_create(text, date, jsonb) from public, anon;
grant execute on function public.planner_series_create(text, date, jsonb) to authenticated;

-- =============================================================================================
-- 3. planner_series_update
-- =============================================================================================
create or replace function planner_series_update(p_series_id uuid, p_scope text,
                                                 p_from timestamptz, p_rows jsonb)
  returns integer
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_freq    text;
  v_until   date;
  v_zone    text;
  v_new     uuid;
  v_scope   uuid[];
  v_bad     text;
  v_updated int;
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

  -- The scope, fixed before anything moves.
  select coalesce(array_agg(pe.id), '{}'::uuid[]) into v_scope
    from planner_events pe
   where pe.series_id = p_series_id
     and not pe.series_detached
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
    -- The zone to read the cut's local date in: the series' own earliest row (header).
    select pe.time_zone into v_zone
      from planner_events pe where pe.series_id = p_series_id order by pe.starts_at limit 1;

    insert into planner_event_series (freq, until_date) values (v_freq, v_until)
      returning id into v_new;

    update planner_events set series_id = v_new where id = any(v_scope);

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
  return v_updated;
end $$;

comment on function planner_series_update(uuid, text, timestamptz, jsonb) is
  'Rewrites a series'' occurrences by id and returns how many rows it changed. p_scope '
  '''following'': a new series takes the old rule, the non-detached rows starting at or after '
  'p_from move to it, and the old series'' until_date is shortened to the day before the cut. '
  'p_scope ''all'': the non-detached rows starting at or after now(). A row named in p_rows that '
  'is not in scope - detached, in another series, or in the past - refuses the whole call. Row '
  'ids never change, so the Google mirror sees patches. Security invoker: RLS is the boundary.';

revoke all on function public.planner_series_update(uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function public.planner_series_update(uuid, text, timestamptz, jsonb) to authenticated;

-- =============================================================================================
-- 4. planner_series_delete
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
  'row (detached included) starting at or after p_from, and until_date is shortened to the day '
  'before the cut; the series row stays. p_scope ''all'': every row starting at or after now(), '
  'then the series row itself - past occurrences stay behind with series_id null and '
  'series_detached cleared, which is Stack''s answer 15. Security invoker: RLS is the boundary.';

revoke all on function public.planner_series_delete(uuid, text, timestamptz) from public, anon;
grant execute on function public.planner_series_delete(uuid, text, timestamptz) to authenticated;

-- =============================================================================================
-- Guards: refuse to record this migration if a function is callable by the wrong role
-- =============================================================================================
do $$
declare
  v_bad text;
begin
  -- PUBLIC is not a role, so it cannot be asked with has_function_privilege: a grant to it shows
  -- up in proacl as an entry with an empty grantee (and a null proacl means the default, which
  -- grants EXECUTE to PUBLIC).
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('planner_series_check_rows','planner_series_create',
                       'planner_series_update','planner_series_delete')
     and (p.proacl is null
          or has_function_privilege('anon', p.oid, 'execute')
          or exists (select 1 from unnest(p.proacl) a where a::text like '=%'));
  if v_bad is not null then
    raise exception '083: these functions are still executable by anon or PUBLIC: %', v_bad;
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('planner_series_create','planner_series_update','planner_series_delete')
         and p.prosecdef) <> 0 then
    raise exception '083: the series RPCs must be security invoker';
  end if;
end $$;
