-- bb2dash :: 046_bb_gradebook.sql
-- Phase 10a (docs/planning/67_PHASE10A_grades.md, Contract section "046 - bb_gradebook").
--
-- The append-per-run mirror of Blackboard's gradebook, plus the stage that fills it. R-10.
--
-- WHAT THIS IS, AND WHAT IT IS NOT
--   Every row here is a number Blackboard published, captured with the moment we saw it. Nothing
--   in this file sums, averages, projects or compares anything. A course's "total" is whichever
--   row Blackboard itself calculates; when Blackboard publishes none, bb2dash says so instead of
--   inventing one (047's v_course_grade).
--
-- HARD RULES honoured (same list as 034):
--   * assignment_progress and reading_progress are never written. Not once.
--   * assignments, attention_items, grading_schemes and grade_components are never written by
--     this stage either - it is a mirror, not a planner, and V-1 owns the grading tables.
--   * Nothing is ever deleted or updated. A second crawl appends; the newest row wins in 047.
--
-- WHAT THE REAL PAYLOADS FORCED (checked against run bf2f81e5-ea4c-4b64-bc43-129fd53d4616,
-- 45 columns across 7 shells, 2026-09-14):
--   * `g.score` is null on all 45 columns; `g.effectiveScore` is the only score Blackboard gives
--     a student. The contract says never read `g.score`, and this stage does not.
--   * One column is calculated (IST.323 "Total Score", calc = CUSTOM, formula.isTotalCalculation
--     = true, 5 of 104). Every other column is NON_CALCULATED.
--   * IST.323 "Final Letter Grade" is NOT a calculated column - it is a manual override column
--     with no score at all - so the calc rules would have filed it as an item. `column_kind`
--     catches it by name instead.
--   * `attemptsLeft` is -1 (unlimited) on 17 columns and null on the rest; `multipleAttempts` is
--     0 on most (single attempt), 1 or 3 on a few. Both are stored verbatim; nothing interprets
--     them here.
--   * ECN.304 "Attendance" has effectiveScore 83.33333. numeric(9,3) is the frozen DDL, so it is
--     stored as 83.333. The reconciliation in docs/planning/66_W17_VERIFICATION.md therefore
--     compares at the column's own scale (round(..., 3)), not at the payload's.
--
-- DEVIATIONS from the Contract, deliberate, each written down because reality asked for it:
--   1. GRANTS. The Contract says "grants as in 034 section Privileges" (revoke from public and
--      anon; grant to authenticated, service_role). Migration 038 then took every stage function
--      off the PostgREST surface entirely - revoking from `authenticated` too - because a
--      SECURITY DEFINER function reachable at /rest/v1/rpc/<name> hands a browser caller
--      postgres's reach. Granting `authenticated` here would re-open the exact advisor finding
--      (lint 0029) that 038 closed, so stage_gradebook follows 038, not 034: service_role only.
--      Nothing loses access - the stage is only ever called from inside run_transform, whose body
--      runs as its owner.
--   2. RLS PREDICATE. The Contract says "owner-scoped exactly like 031/032
--      (auth.uid() = public.app_owner())". 038 rewrote those same three policies to
--      (select auth.uid()) = (select public.app_owner()) to close performance lint 0003. The
--      predicate is identical; the scalar subquery is evaluated once per statement instead of
--      once per row. This table uses the 038 form so it does not add a 22nd auth_rls_initplan
--      finding on its first day.
--   3. scores_new / scores_changed are counted over `column_kind = 'item'` rows only. A running
--      total recalculates every time any item is graded, and an attendance column moves after
--      every class, so counting those would put a permanent "N score(s) changed" line in the
--      Activity feed that means nothing. A first sighting with a score counts as scores_new (a
--      column with no earlier row is treated as "previously null"), which is what makes the first
--      gradebook run report the grades it found instead of reporting nothing.

-- =============================================================================================
-- 1. The table
-- =============================================================================================
create table bb_gradebook (
  id                    bigint generated always as identity primary key,
  run_id                uuid        not null,            -- bb_raw.run_id
  sync_run_id           bigint      references sync_runs(id),
  course_id             text        not null references courses(id),
  column_id             text        not null,            -- g.columnId  ('_3560530_1')
  name                  text        not null,            -- g.name
  position              integer,                         -- g.position
  content_id            text,                            -- g.contentId
  category_id           text,                            -- g.categoryId
  possible              numeric(9,3),                    -- g.possible
  due_at                timestamptz,                     -- g.due
  calc_type             text,                            -- g.calc  ('NON_CALCULATED' | 'CUSTOM' | ...)
  is_calc               boolean     not null default false,   -- g.isCalc
  is_total              boolean     not null default false,   -- see column_kind
  column_kind           text        not null check (column_kind in ('item','attendance','total','calc_other','letter')),
  aggregation           text,                            -- g.aggregation ('LAST' | 'HIGHEST' | ...)
  visible               boolean, grades_released boolean,
  multiple_attempts     integer,                         -- g.multipleAttempts (0 = single attempt)
  attempts_left         integer,                         -- g.attemptsLeft (-1 = unlimited, null = n/a)
  effective_score       numeric(9,3),                    -- g.effectiveScore   <- THE score
  manual_score          numeric(9,3),                    -- g.manualScore
  display_score         numeric(9,3),                    -- g.displayGrade.score
  display_grade         text,                            -- g.displayGrade.grade ('Complete')
  is_override           boolean,                         -- g.displayGrade.isOverride
  is_exempt             boolean,
  feedback              text,                            -- g.feedback (already stripped to text, <= 1000)
  submission_status     text,                            -- g.submissionStatus, verbatim
  last_attempt_status   text, last_attempt_created timestamptz,
  last_attempt_submitted timestamptz, last_attempt_score numeric(9,3),
  seen_at               timestamptz not null,            -- bb_raw.captured_at of the run
  raw                   jsonb       not null,            -- the column object verbatim
  unique (run_id, course_id, column_id)
);

create index bb_gradebook_latest_idx on bb_gradebook (course_id, column_id, seen_at desc);

-- The FK to sync_runs would otherwise be scanned on every cascade check (advisor lint 0001).
create index bb_gradebook_sync_run_idx on bb_gradebook (sync_run_id);

alter table bb_gradebook enable row level security;
create policy bb_gradebook_owner_all on bb_gradebook for all to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));

comment on table bb_gradebook is
  'Append-per-run mirror of Blackboard''s gradebook columns. One row per (run, course, column); '
  'nothing is ever updated or deleted, so the history of a score is the history of its rows and '
  'v_gradebook_latest picks the newest. Every number here is Blackboard''s, carried with the '
  'seen_at that says when it was true.';
comment on column bb_gradebook.effective_score is
  'g.effectiveScore - the only score Blackboard gives a student. g.score is null on every column '
  'in every payload seen so far and is deliberately never read (R-10).';
comment on column bb_gradebook.column_kind is
  'item | attendance | total | calc_other | letter. Decided in this order: total when the column '
  'is calculated AND (formula.isTotalCalculation or its name is one of 034''s total names); '
  'calc_other for any other calculated column; letter for a non-calculated column whose name '
  'says "letter grade" (an override column with no score); attendance when bb_assignment_type '
  'reads the name as attendance; item otherwise. is_total = (column_kind = ''total'').';
comment on column bb_gradebook.seen_at is
  'bb_raw.captured_at of the crawl this row came from. Every figure bb2dash shows is rendered '
  'beside its seen_at, because a mirrored score is only true as of the moment it was read.';
comment on column bb_gradebook.raw is
  'The gradebook column object exactly as the crawler posted it. Kept so a later phase can read '
  'a key this table does not have without needing another crawl.';

-- =============================================================================================
-- 2. stage_gradebook
-- =============================================================================================
-- Same envelope as every 034 stage: one sync_stage_runs row, never raises, counts in `counts`.
-- Idempotent on run_id: the unique key plus `on conflict do nothing` means a second call on the
-- same run inserts 0 and reports every one of them under duplicates_skipped.
create or replace function stage_gradebook(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status  text := 'ok';
  v_error   text;
  v_counts  jsonb := '{}'::jsonb;
  v_seen int := 0; v_attempted int := 0; v_ins int := 0; v_dupes int := 0;
  v_unresolved int := 0; v_totals int := 0; v_attendance int := 0; v_items int := 0;
  v_new int := 0; v_changed int := 0;
begin
  begin
    -- Every gradebook entry in the crawl, resolvable or not. Counted before anything is filtered
    -- so a shell that matches no course is visible as a difference, not as a silent drop.
    select count(*) into v_seen
      from bb_raw b,
           lateral jsonb_array_elements(bb_jarray(b.payload->'gradebook')) g
     where b.run_id = p_run_id and b.kind = 'course'
       and coalesce(g->>'columnId', '') <> '';

    select count(distinct b.bb_course_id) into v_unresolved
      from bb_raw b
     where b.run_id = p_run_id and b.kind = 'course'
       and bb_resolve_course(b.bb_course_id) is null;

    -- One row per (course, column). `distinct on` collapses a shell that repeats a column id
    -- inside a single payload; without it the insert would rely on ON CONFLICT to do the same
    -- job and the duplicate would be counted twice.
    drop table if exists pg_temp._bb_gb;
    create temp table _bb_gb on commit drop as
      select distinct on (cr.id, g->>'columnId')
             cr.id                                        as course_id,
             g->>'columnId'                               as column_id,
             btrim(g->>'name')                            as name,
             nullif(g->>'position','')::int               as position,
             nullif(g->>'contentId','')                   as content_id,
             nullif(g->>'categoryId','')                  as category_id,
             nullif(g->>'possible','')::numeric           as possible,
             nullif(g->>'due','')::timestamptz            as due_at,
             nullif(g->>'calc','')                        as calc_type,
             coalesce((g->>'isCalc')::boolean, false)     as is_calc,
             nullif(g->>'aggregation','')                 as aggregation,
             case when jsonb_typeof(g->'visible') = 'boolean' then (g->>'visible')::boolean end         as visible,
             case when jsonb_typeof(g->'gradesReleased') = 'boolean' then (g->>'gradesReleased')::boolean end as grades_released,
             nullif(g->>'multipleAttempts','')::int       as multiple_attempts,
             nullif(g->>'attemptsLeft','')::int           as attempts_left,
             nullif(g->>'effectiveScore','')::numeric     as effective_score,
             nullif(g->>'manualScore','')::numeric        as manual_score,
             nullif(g->'displayGrade'->>'score','')::numeric as display_score,
             nullif(g->'displayGrade'->>'grade','')       as display_grade,
             case when jsonb_typeof(g->'displayGrade'->'isOverride') = 'boolean'
                  then (g->'displayGrade'->>'isOverride')::boolean end                                  as is_override,
             case when jsonb_typeof(g->'isExempt') = 'boolean' then (g->>'isExempt')::boolean end       as is_exempt,
             nullif(g->>'feedback','')                    as feedback,
             nullif(g->>'submissionStatus','')            as submission_status,
             nullif(g->'lastAttempt'->>'status','')       as last_attempt_status,
             nullif(g->'lastAttempt'->>'created','')::timestamptz   as last_attempt_created,
             nullif(g->'lastAttempt'->>'submitted','')::timestamptz as last_attempt_submitted,
             nullif(g->'lastAttempt'->>'score','')::numeric         as last_attempt_score,
             b.captured_at                                as seen_at,
             g                                            as raw,
             -- column_kind, in the Contract's order. 034's total-name regex is repeated verbatim.
             case
               when coalesce((g->>'isCalc')::boolean, false)
                    and (g->'formula'->>'isTotalCalculation' = 'true'
                         or btrim(g->>'name') ~* '^(total|total score|overall|weighted total|running total|final letter grade|final grade|letter grade)$')
                 then 'total'
               when coalesce((g->>'isCalc')::boolean, false) then 'calc_other'
               when btrim(g->>'name') ~* 'letter grade'      then 'letter'
               when bb_assignment_type(btrim(g->>'name')) = 'attendance' then 'attendance'
               else 'item'
             end                                          as column_kind
        from bb_raw b
        join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
             lateral jsonb_array_elements(bb_jarray(b.payload->'gradebook')) g
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(g->>'columnId', '') <> ''
         and coalesce(btrim(g->>'name'), '') <> ''
       order by cr.id, g->>'columnId', b.captured_at desc;

    select count(*),
           count(*) filter (where column_kind = 'total'),
           count(*) filter (where column_kind = 'attendance'),
           count(*) filter (where column_kind = 'item')
      into v_attempted, v_totals, v_attendance, v_items
      from _bb_gb;

    -- Score movement, measured BEFORE the insert: comparing against the newest row from any
    -- earlier run. A column with no earlier row at all reads as "previously null", so the first
    -- gradebook run reports the grades it found rather than reporting silence.
    select count(*) filter (where n.effective_score is not null and p.effective_score is null),
           count(*) filter (where p.effective_score is not null
                              and p.effective_score is distinct from n.effective_score)
      into v_new, v_changed
      from _bb_gb n
      left join lateral (
        select gb.effective_score
          from bb_gradebook gb
         where gb.course_id = n.course_id and gb.column_id = n.column_id
           and gb.run_id <> p_run_id
         order by gb.seen_at desc, gb.id desc
         limit 1) p on true
     where n.column_kind = 'item';

    insert into bb_gradebook (
      run_id, sync_run_id, course_id, column_id, name, position, content_id, category_id,
      possible, due_at, calc_type, is_calc, is_total, column_kind, aggregation, visible,
      grades_released, multiple_attempts, attempts_left, effective_score, manual_score,
      display_score, display_grade, is_override, is_exempt, feedback, submission_status,
      last_attempt_status, last_attempt_created, last_attempt_submitted, last_attempt_score,
      seen_at, raw)
    select p_run_id, p_sync_run_id, n.course_id, n.column_id, n.name, n.position, n.content_id,
           n.category_id, n.possible, n.due_at, n.calc_type, n.is_calc,
           (n.column_kind = 'total'), n.column_kind, n.aggregation, n.visible,
           n.grades_released, n.multiple_attempts, n.attempts_left, n.effective_score,
           n.manual_score, n.display_score, n.display_grade, n.is_override, n.is_exempt,
           n.feedback, n.submission_status, n.last_attempt_status, n.last_attempt_created,
           n.last_attempt_submitted, n.last_attempt_score, n.seen_at, n.raw
      from _bb_gb n
    on conflict (run_id, course_id, column_id) do nothing;
    get diagnostics v_ins = row_count;

    v_dupes := greatest(v_attempted - v_ins, 0);

    v_counts := jsonb_build_object(
      'columns_seen',       v_seen,
      'inserted',           v_ins,
      'duplicates_skipped', v_dupes,
      'courses_unresolved', v_unresolved,
      'totals',             v_totals,
      'attendance',         v_attendance,
      'items',              v_items,
      'scores_new',         v_new,
      'scores_changed',     v_changed);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'gradebook', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','gradebook','status',v_status,'counts',v_counts,'error',v_error);
end $$;

comment on function stage_gradebook(uuid, bigint) is
  'Mirror one crawl''s gradebook columns into bb_gradebook. Reads bb_raw rows of kind = course '
  'for the run, resolves each shell with bb_resolve_course, and inserts one row per column with '
  'on conflict do nothing, so a second call on the same run inserts 0. Writes nothing to '
  'assignments, assignment_progress or attention_items. Never raises: it records status = failed '
  'on its own sync_stage_runs row and returns.';

-- =============================================================================================
-- 3. Privileges. See deviation 1 in the header: 038's rule, not 034's.
-- =============================================================================================
revoke all on function public.stage_gradebook(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_gradebook(uuid,bigint) to service_role;
