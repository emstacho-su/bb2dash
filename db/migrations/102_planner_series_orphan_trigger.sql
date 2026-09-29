-- bb2dash :: 102_planner_series_orphan_trigger.sql
-- Phase 15 (docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md), R-54. Worker W-40.
-- 001-101 are applied and byte-frozen; this adds one trigger function and one statement trigger,
-- and nothing else. No existing function body, signature, grant or policy moves.
--
-- ---------------------------------------------------------------------------------------------
-- THE BUG (Phase 12b tail walk, finding W-3)
-- ---------------------------------------------------------------------------------------------
-- 082 holds the rule ("weekly until 12 November") in `planner_event_series` and every occurrence
-- as an ordinary `planner_events` row carrying `series_id`. 083/088's `planner_series_delete`
-- keeps the rule honest at its own two exits: TR-4 deletes a series its delete has emptied, and
-- the 'all' scope deletes the series outright. But "this event" - a single-occurrence delete - is
-- deliberately NOT an RPC (Stack's answer 15, and `queries.plannerSeries.ts` comments): the web
-- deletes the row directly. So deleting the LAST occurrence that way leaves the rule behind with
-- nothing to repeat: a row Stack can never see, never edit (the rule is immutable after creation)
-- and never delete, since the planner only offers series actions from an occurrence.
--
-- ---------------------------------------------------------------------------------------------
-- THE FIX: the invariant moves from the RPCs to the table
-- ---------------------------------------------------------------------------------------------
-- An AFTER DELETE ... FOR EACH STATEMENT trigger with an OLD transition table. Statement level
-- and not row level for 082's own reason: the check is "does this series still have occurrences",
-- which a row trigger would ask once per deleted row and answer against a half-finished
-- statement. The transition table names exactly the series the statement touched, so a delete of
-- unrelated one-off events does no work at all.
--
-- HOW IT MEETS THE THREE EXISTING PATHS
--   * plain delete ("this event", detached or not) - the case above. The trigger is now the only
--     thing that closes it.
--   * `planner_series_delete` - the trigger fires at the end of the RPC's inner delete. If that
--     delete emptied the series, the trigger removes it and the RPC's own series delete then
--     matches 0 rows (TR-4 and the 'all' scope both survive as no-ops). If rows remain ('all'
--     with past occurrences), the trigger leaves the series and the RPC deletes it as before, so
--     the FK's ON DELETE SET NULL still hands those rows back as ordinary events. The RPC's
--     return value is taken from `get diagnostics` before either, so no count changes.
--   * `planner_series_update` - it empties a series by UPDATE, which this trigger does not see.
--     088:161-164's TR-4 delete is therefore unchanged and still needed.
--
-- SECURITY INVOKER (the default, stated here because it is the point): the delete of the series
-- row runs as the deleting session, so 082's section 5 owner-only RLS on `planner_event_series`
-- applies.
-- A stranger's delete matches no occurrences, and the trigger's own delete then matches no series
-- either. It never cascades, it ignores null `series_id`, it never raises, and it matches zero
-- rows without complaint - `deleteOpenedRow` (`queries.plannerSeries.ts:411-415`) runs after
-- `series_id` is already null and is a no-op here.
--
-- EXECUTE is revoked the way 082 revokes its own trigger function: a trigger function is called
-- by the trigger, never by a client, so it has no business on the PostgREST surface.

create function public.planner_events_delete_empty_series() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  delete from public.planner_event_series s
   where s.id in (select distinct o.series_id from old_rows o where o.series_id is not null)
     and not exists (select 1 from public.planner_events e where e.series_id = s.id);
  return null;
end $$;

comment on function public.planner_events_delete_empty_series() is
  'AFTER DELETE FOR EACH STATEMENT trigger on planner_events, with an OLD transition table. '
  'Deletes every planner_event_series row the statement left with no occurrences, so no repeat '
  'rule outlives its last occurrence on any delete path - not only inside 083/088''s RPCs (R-54, '
  'Phase 12b tail finding W-3). Security invoker, so 082''s owner-only RLS decides which series '
  'rows it can see; it ignores null series_id, never raises, and matching zero rows is normal.';

create trigger planner_events_delete_empty_series
  after delete on public.planner_events
  referencing old table as old_rows
  for each statement execute function public.planner_events_delete_empty_series();

comment on trigger planner_events_delete_empty_series on public.planner_events is
  'R-54: a single-occurrence delete ("this event") is an ordinary row delete, not an RPC, so the '
  'series it emptied used to survive unreachable. This closes it at the table.';

revoke all on function public.planner_events_delete_empty_series() from public, anon, authenticated;

-- Guard: refuse to record this migration if the trigger is not on the table, or if the function
-- it calls is on the API surface. 082/088's shape.
do $$
declare v_bad text;
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.planner_events'::regclass
                    and tgname = 'planner_events_delete_empty_series') then
    raise exception '102: the planner_events_delete_empty_series trigger is not on planner_events';
  end if;

  select string_agg(r, ', ' order by r) into v_bad
    from (select 'anon' as r where has_function_privilege('anon',
            'public.planner_events_delete_empty_series()'::regprocedure, 'execute')
          union all
          select 'authenticated' where has_function_privilege('authenticated',
            'public.planner_events_delete_empty_series()'::regprocedure, 'execute')
          union all
          select 'PUBLIC' where exists (
            select 1 from pg_proc p
             where p.oid = 'public.planner_events_delete_empty_series()'::regprocedure
               and (p.proacl is null
                    or exists (select 1 from unnest(p.proacl) a where a::text like '=%')))) x(r);
  if v_bad is not null then
    raise exception '102: planner_events_delete_empty_series() is executable by %', v_bad;
  end if;
end $$;
