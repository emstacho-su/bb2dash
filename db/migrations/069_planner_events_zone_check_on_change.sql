-- bb2dash :: 069_planner_events_zone_check_on_change.sql
-- Phase 11b, round 2 (docs/planning/69b_PHASE11B_planner_events.md, "Round 2", R2-3). Worker W-23.
-- 001-068 are applied and byte-frozen; this recreates one trigger function and nothing else.
--
-- ---------------------------------------------------------------------------------------------
-- THE COST: half a second on every write, for a value that did not change
-- ---------------------------------------------------------------------------------------------
-- 067's planner_events_check_time() looks time_zone up in pg_timezone_names on every INSERT and
-- every UPDATE. That view is not an index: it reads the server's whole zone directory each time,
-- which the PM measured at 499 ms on prod. Ticking a task, renaming an event or editing its notes
-- all paid it, although none of them can make a valid zone invalid.
--
-- THE FIX: the K-2 zone rule runs on INSERT, and on UPDATE only when time_zone is actually
-- different from the stored value (IS DISTINCT FROM). A row that exists already passed the rule
-- when it was written, and nothing but an UPDATE of time_zone can change that.
--
-- UNCHANGED: the K-3 all-day checks still run on every INSERT and UPDATE. They are cheap (two
-- AT TIME ZONE conversions, no catalogue scan) and they depend on starts_at, ends_at and all_day
-- as well as the zone, so skipping them would let an edit break the exclusive-end shape. The
-- trigger itself (BEFORE INSERT OR UPDATE, per row) is untouched; only the function body moves.

create or replace function planner_events_check_time() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
declare
  v_local_start timestamp;
  v_local_end   timestamp;
begin
  -- K-2: 'UTC' or Area/Location, and a name the server's zone database actually holds. The
  -- pg_timezone_names scan is the expensive part, so it runs only when the zone is new (R2-3).
  if tg_op = 'INSERT' or new.time_zone is distinct from old.time_zone then
    if not (new.time_zone = 'UTC'
            or (new.time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$'
                and exists (select 1 from pg_timezone_names z where z.name = new.time_zone))) then
      raise exception 'planner_events: time_zone % is not an IANA zone name (e.g. America/New_York)',
        quote_literal(new.time_zone)
        using errcode = 'check_violation';
    end if;
  end if;

  if new.all_day then
    v_local_start := new.starts_at at time zone new.time_zone;
    v_local_end   := new.ends_at   at time zone new.time_zone;

    -- K-3: both instants are local midnights in the event's own zone ...
    if not (v_local_start::time = time '00:00'
            or new.starts_at = (v_local_start::date::timestamp at time zone new.time_zone))
       or not (v_local_end::time = time '00:00'
               or new.ends_at = (v_local_end::date::timestamp at time zone new.time_zone)) then
      raise exception 'planner_events: an all-day event must start and end at 00:00 in %',
        new.time_zone
        using errcode = 'check_violation';
    end if;

    -- ... and the exclusive end falls on a later local date than the start.
    if v_local_end::date <= v_local_start::date then
      raise exception 'planner_events: an all-day event ends at 00:00 of the day after its last day'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

comment on function planner_events_check_time() is
  'BEFORE INSERT OR UPDATE trigger on planner_events. K-2: time_zone must be ''UTC'' or an '
  'Area/Location name present in pg_timezone_names (POSIX strings such as UTC+3 are refused); '
  'checked on INSERT and on an UPDATE that changes time_zone, never on one that leaves it alone, '
  'because the catalogue scan costs about half a second (069, R2-3). K-3: an all-day row starts '
  'and ends at local 00:00 in its own zone and its exclusive end date is after its start date; '
  'checked on every INSERT and UPDATE.';

-- Privileges are unchanged by create or replace; restated because 038's rule is load-bearing.
revoke all on function public.planner_events_check_time() from public, anon, authenticated;
