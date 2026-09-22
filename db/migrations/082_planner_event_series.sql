-- bb2dash :: 082_planner_event_series.sql
-- Phase 12b post-MVP tail, item T-1 (docs/planning/80c_PHASE12B_page_pass.md, "Post-MVP tail -
-- frozen contract", T-1 Recurring planner events; Stack's answer 15). Worker W-35.
-- 001-081 and 084-087 are applied and byte-frozen; this adds one table, two columns, one check,
-- one index, two functions and two triggers, and nothing else.
--
-- Contents
--   planner_series_max_occurrences()   the 52 cap, as one value both migrations read
--   planner_event_series               the repeat rule a set of occurrences was expanded from
--   planner_events.series_id           which series an occurrence belongs to (null = one-off)
--   planner_events.series_detached     "this one" was edited, so the series no longer rewrites it
--   planner_events_series_cap()        AFTER STATEMENT trigger: no series may exceed the cap
--
-- ---------------------------------------------------------------------------------------------
-- WHAT A ROW IS, AND WHAT IT IS NOT
-- ---------------------------------------------------------------------------------------------
-- A `planner_event_series` row is the RULE Stack chose in the form - daily, weekly or monthly,
-- ending on a local date he had to give. It is not the occurrences. The web layer expands the
-- rule in `planner-recurrence.ts` (wall clock, zone-aware, Temporal's "compatible" DST rule) and
-- sends finished rows; every occurrence is an ordinary `planner_events` row. That is deliberate:
--
--   * `v_calendar_push_items` and calendar-push are untouched - an occurrence pushes like any
--     other event, so Google gets real events, not a recurrence rule it would have to expand;
--   * SQL never converts a wall clock into an instant (067's K-9: Postgres resolves a DST fold
--     the other way from Temporal's "compatible" rule), so nothing here derives a `starts_at`.
--     The only wall-clock arithmetic in 082-083 is the reverse direction - reading the local
--     DATE of an instant to shorten `until_date`, which is unambiguous - and it is documented
--     where it happens (083).
--
-- The rule is not editable after creation (PM's cut for the tail): to change it, delete "all
-- following" and create a new series. So `planner_event_series` has no `updated_at`.
--
-- ---------------------------------------------------------------------------------------------
-- WHY `series_detached`
-- ---------------------------------------------------------------------------------------------
-- "This one" - editing a single occurrence - needs no RPC: the web updates the row and sets
-- `series_detached = true`. From then on "all events" and "this and following" leave that row
-- alone, so Stack's one-off change is not silently rewritten by a later series edit. The row
-- keeps its `series_id`, because it is still an occurrence of that series for the purpose of
-- DELETING the series. Hence the check: detached implies it still belongs to a series.
--
-- ---------------------------------------------------------------------------------------------
-- WHY THE CAP IS AN AFTER STATEMENT TRIGGER WITH A TRANSITION TABLE
-- ---------------------------------------------------------------------------------------------
-- A BEFORE ROW trigger cannot count its own statement: rows inserted by the command that is
-- running are not visible to a query made from inside it, so `insert ... select` of 60 rows
-- would pass 60 times. An AFTER STATEMENT trigger with `referencing new table` sees every row
-- the statement wrote, counts the real total per affected series, and raises before the
-- transaction can commit. Two triggers rather than one because Postgres allows a transition
-- table on a single-event trigger only.
--
-- ---------------------------------------------------------------------------------------------
-- RLS AND PRIVILEGES
-- ---------------------------------------------------------------------------------------------
-- Owner-only on all four verbs in 038's scalar-subquery form - `(select auth.uid()) = (select
-- public.app_owner())` - which the planner reads once per statement, so the auth_rls_initplan
-- advisor stays quiet (076). The project's default ACL hands every new table to `anon`; it is
-- revoked here, and `authenticated` gets exactly the four verbs the policies govern. TRUNCATE is
-- never granted: it is the one operation RLS cannot defend (076, P-db-1).

-- =============================================================================================
-- 1. The cap, as a value and not a literal in three places
-- =============================================================================================
create or replace function planner_series_max_occurrences() returns integer
  language sql immutable parallel safe set search_path = public, pg_temp as $$
  select 52
$$;

comment on function planner_series_max_occurrences() is
  'The largest number of occurrences one planner_event_series may hold: 52, Stack''s answer 15 '
  '(a year of weeklies). Read by planner_events_series_cap() and by 083''s row-count bounds; the '
  'web holds the same number as MAX_SERIES_OCCURRENCES in planner-recurrence.ts.';

revoke all on function public.planner_series_max_occurrences() from public, anon;
grant execute on function public.planner_series_max_occurrences() to authenticated, service_role;

-- =============================================================================================
-- 2. planner_event_series
-- =============================================================================================
create table planner_event_series (
  id         uuid primary key default gen_random_uuid(),
  freq       text not null
             constraint planner_event_series_freq_known check (freq in ('daily','weekly','monthly')),
  until_date date not null,
  created_at timestamptz not null default now()
);

comment on table planner_event_series is
  'One row per repeat rule Stack created in the planner (Phase 12b tail, T-1). The occurrences '
  'themselves are ordinary planner_events rows carrying series_id, expanded by the web from this '
  'rule; SQL never expands it. The rule cannot be edited after creation - "all following" plus a '
  'new series is how it changes. Owner-only under RLS for every verb; anon has no access.';
comment on column planner_event_series.id is
  'Series identifier. planner_events.series_id references it ON DELETE SET NULL, so deleting a '
  'series leaves its past occurrences behind as ordinary events (Stack''s answer 15).';
comment on column planner_event_series.freq is
  'daily, weekly or monthly. Weekly means the same weekday; monthly means the same day-of-month, '
  'and a month without that day is skipped. The web applies the rule; this column records it.';
comment on column planner_event_series.until_date is
  'The last LOCAL date an occurrence of this series may start on - mandatory, per Stack''s '
  'answer 15. A date and not an instant: it is a calendar bound Stack typed, not a moment. '
  '083''s "following" scope shortens it to the day before the split.';
comment on column planner_event_series.created_at is
  'When the series was created. There is no updated_at: the rule is immutable after creation, '
  'and until_date''s only writer is 083''s split, which is recorded by the new series it makes.';
comment on constraint planner_event_series_freq_known on planner_event_series is
  'freq is one of the three frequencies the form offers (answer 15). A text column with a check '
  'rather than an enum: nothing joins on it and a fourth frequency should not need a type change.';

-- =============================================================================================
-- 3. planner_events joins a series
-- =============================================================================================
alter table planner_events
  add column series_id uuid references planner_event_series(id) on delete set null,
  add column series_detached boolean not null default false;

alter table planner_events add constraint planner_events_detached_implies_series
  check (not series_detached or series_id is not null);

comment on column planner_events.series_id is
  'The series this row is an occurrence of, or null for a one-off event. ON DELETE SET NULL: '
  'when a series is deleted its remaining (past) occurrences stay, as ordinary events.';
comment on column planner_events.series_detached is
  'True when Stack edited or moved THIS occurrence only. A detached row keeps its series_id but '
  'is skipped by 083''s series updates, so the edit is never overwritten. Deleting the series '
  'still removes it (083), and 083 clears this flag on the rows a deleted series leaves behind, '
  'because a row with no series cannot be detached from one.';
comment on constraint planner_events_detached_implies_series on planner_events is
  'series_detached implies series_id is not null: "detached" is a statement about a series, so a '
  'row that belongs to none cannot hold it.';

create index planner_events_series_id_idx on planner_events (series_id)
  where series_id is not null;

comment on index planner_events_series_id_idx is
  'Partial: almost every planner_events row is a one-off, and every series query is an equality '
  'on series_id (which implies not null), so the planner can use it.';

-- =============================================================================================
-- 4. The cap
-- =============================================================================================
create or replace function planner_events_series_cap() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
declare
  v_series uuid;
  v_count  bigint;
begin
  select pe.series_id, count(*) into v_series, v_count
    from planner_events pe
   where pe.series_id in (select n.series_id from new_rows n where n.series_id is not null)
   group by pe.series_id
  having count(*) > planner_series_max_occurrences()
   limit 1;

  if v_series is not null then
    raise exception 'planner_events: series % would hold % occurrences; the limit is %',
      v_series, v_count, planner_series_max_occurrences()
      using errcode = 'check_violation';
  end if;

  return null;
end $$;

comment on function planner_events_series_cap() is
  'AFTER STATEMENT trigger on planner_events, once for INSERT and once for UPDATE, each with a '
  'NEW transition table. Refuses any statement that would leave a series holding more than '
  'planner_series_max_occurrences() rows. Statement level and not row level because a BEFORE ROW '
  'trigger cannot see the rows its own command has already written, so a multi-row insert would '
  'walk straight past the cap.';

create trigger planner_events_series_cap_insert
  after insert on planner_events
  referencing new table as new_rows
  for each statement execute function planner_events_series_cap();

create trigger planner_events_series_cap_update
  after update on planner_events
  referencing new table as new_rows
  for each statement execute function planner_events_series_cap();

-- =============================================================================================
-- 5. RLS: owner only, every verb, 038's form
-- =============================================================================================
alter table planner_event_series enable row level security;

create policy planner_event_series_owner_select on planner_event_series for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
create policy planner_event_series_owner_insert on planner_event_series for insert to authenticated
  with check ((select auth.uid()) = (select public.app_owner()));
create policy planner_event_series_owner_update on planner_event_series for update to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));
create policy planner_event_series_owner_delete on planner_event_series for delete to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

comment on policy planner_event_series_owner_select on planner_event_series is
  'Only the app owner reads series rows; any other uid sees none.';
comment on policy planner_event_series_owner_insert on planner_event_series is
  'Only the app owner creates a series. 083''s create RPC is security invoker, so a stranger '
  'calling it is refused here.';
comment on policy planner_event_series_owner_update on planner_event_series is
  'Only the app owner shortens until_date (083''s "following" split).';
comment on policy planner_event_series_owner_delete on planner_event_series is
  'Only the app owner deletes a series. The FK''s ON DELETE SET NULL then leaves past '
  'occurrences behind.';

-- =============================================================================================
-- 6. Privileges. anon holds nothing; authenticated holds the four verbs and no TRUNCATE.
-- =============================================================================================
revoke all on planner_event_series from anon;
revoke all on planner_event_series from authenticated;
grant select, insert, update, delete on planner_event_series to authenticated;
grant select, insert, update, delete on planner_event_series to service_role;

revoke all on function public.planner_events_series_cap() from public, anon, authenticated;

-- =============================================================================================
-- Guards: refuse to record this migration if the boundary is not what it claims
-- =============================================================================================
do $$
declare
  n_pol  int;
  held   text;
begin
  select count(*) into n_pol from pg_policies
   where schemaname = 'public' and tablename = 'planner_event_series';
  if n_pol <> 4 then
    raise exception '082: planner_event_series has % policies, expected 4', n_pol;
  end if;

  select string_agg(grantee || ' ' || privilege_type, ', ' order by grantee, privilege_type)
    into held
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'planner_event_series'
     and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type = 'TRUNCATE'));
  if held is not null then
    raise exception '082: planner_event_series still grants %', held;
  end if;

  if not exists (select 1 from pg_trigger
                  where tgrelid = 'planner_events'::regclass
                    and tgname in ('planner_events_series_cap_insert',
                                   'planner_events_series_cap_update')
                  having count(*) = 2) then
    raise exception '082: both cap triggers must exist on planner_events';
  end if;
end $$;
