-- bb2dash :: 101_search_path_pin.sql
-- Phase 15 (docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md), R-78. Worker W-40.
-- 001-100 are applied and byte-frozen; this changes one function attribute on seven functions
-- and nothing else. No body, no signature, no grant and no security setting moves.
--
-- ---------------------------------------------------------------------------------------------
-- THE FINDING: "Function Search Path Mutable" (lint 0011), open since 2026-09-10
-- ---------------------------------------------------------------------------------------------
-- A function with no `search_path` in its proconfig resolves every unqualified name against the
-- CALLER's search_path. So a caller who can create a relation in a schema that sits ahead of
-- `public` on its own path - a temporary table is the classic one, since `pg_temp` is searched
-- first unless it is named later - decides which `bb_files` or `sessions` the function body
-- actually reads. None of these seven is SECURITY DEFINER, so nothing here escalates a
-- privilege; what it buys an attacker is the function's ANSWER, which is worse than it sounds
-- for `classify_bb_file` (it decides a file's bucket during a transform) and for the three
-- search functions (they decide what retrieval returns).
--
-- Every other function in `public` was already pinned when it was written. These seven predate
-- the habit: 001-025's helpers (`set_updated_at`, `classify_bb_file`, `suggested_start`), 015's
-- `bb_file_relpath`, and the three retrieval functions from 021-024.
--
-- THE FIX: `set search_path = public, pg_temp` on each, which is the value every other function
-- in this database carries. `pg_temp` is named LAST on purpose: that is what stops a temporary
-- relation from shadowing a real one, because a schema that is not first cannot pre-empt
-- `public`. `extensions` is deliberately NOT on the list - the two vector functions reach the
-- distance operator through an explicit `operator(extensions.<=>)`, as 021-024 wrote them, so
-- they need no schema on the path to find it.
--
-- WHAT THIS COSTS: pinning a SQL function stops the planner from inlining it, because an inlined
-- body would run under the caller's path and defeat the point. Measured and accepted in the R-78
-- DECISIONS row: `hybrid_search_file_text` is re-timed in this phase's task 16 against the 60 ms
-- ceiling, and `suggested_start` (read per row by `v_work_items`) and `classify_bb_file` (called
-- in `stage_files`) run over tables under 300 rows.
--
-- The loop is 038's shape, the guard is 036's.

-- 1. Pin the seven -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'set_updated_at()',
    'classify_bb_file(text,text,text)',
    'bb_file_relpath(bigint)',
    'suggested_start(text,date,numeric)',
    'search_file_text(text,text,integer,boolean)',
    'match_file_text(extensions.vector,text,text,integer,boolean)',
    'hybrid_search_file_text(text,extensions.vector,text,text,integer,integer,double precision,boolean)']
  loop
    execute format('alter function public.%s set search_path = public, pg_temp', f);
  end loop;
end $$;

-- 2. Guard: refuse to record this migration if any function in public is still unpinned --------
-- 036's shape. Extension-owned functions are excluded: they belong to pgcrypto, pg_net and the
-- rest, this project does not own their definitions, and the advisor does not count them either.
-- A function added later without a pinned path is the same finding reopened, and this is where it
-- gets caught - by the migration that would otherwise close the finding on paper.
do $$
declare
  n    int;
  list text;
begin
  select count(*), string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into n, list
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
                      where c like 'search_path=%');
  if n > 0 then
    raise exception '101: % function(s) in public still resolve names against the caller''s '
                    'search_path: %', n, list;
  end if;
end $$;
