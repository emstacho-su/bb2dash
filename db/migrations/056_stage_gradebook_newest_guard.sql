-- bb2dash :: 056_stage_gradebook_newest_guard.sql
-- Phase 10a round 2, finding R2-7. See docs/planning/67_PHASE10A_grades.md § "Round 2".
--
-- THE BUG. `scores_new` and `scores_changed` compare each column against "the newest row from any
-- OTHER run", ordered by `seen_at`. That is the right comparison when the run being folded IS the
-- newest crawl. It is exactly backwards when it is not.
--
-- Folds do not arrive in crawl order. Migration 039 made `transform_tick` fold oldest-first, and a
-- crawl can be registered late (the bb-sync skill registers after `runAll` returns, and 035's
-- backfill registered two crawls retroactively months after the fact). So folding the 2026-09-02
-- crawl today compares its 9/2 scores against the 9/14 rows already in the mirror, finds them
-- different, and reports "N score(s) changed" — announcing that Stack's grades moved when what
-- actually happened is that an old crawl was replayed. `sync_change_lines` puts that sentence
-- straight in the Activity feed.
--
-- `stage_files` already guards the identical hazard for the identical reason (043, "only the
-- NEWEST crawl gets to say so"). This is the same predicate, applied to the same class of claim:
-- a statement about CHANGE is only meaningful from the run that is furthest forward.
--
-- THE FIX. Compute both counts only when this run is the newest REGISTERED crawl; otherwise report
-- 0 and 0 with `older_run: true` alongside. The rows are still inserted exactly as before — the
-- mirror is append-only and an older crawl's rows are perfectly good history, they just do not get
-- to narrate. `older_run` is always present (true or false) so the key is stable for anything
-- reading the counts, the same way `stage_files` always reports `missing_skipped_older_run`.
--
-- WHY "REGISTERED" AND NOT "FOLDED": copied verbatim from 043's reasoning. A crawl that has not
-- been folded yet has no `sync_runs` row, so testing against `sync_runs` would call the older of
-- two pending crawls the newest — and 039's oldest-first order makes two pending crawls the normal
-- case, not the edge. `agent_requests.run_id` is the owner's claim and is set before the fold.
--
-- Built from the LIVE definition (`select pg_get_functiondef('public.stage_gradebook(uuid,bigint)'
-- ::regprocedure)`, read 2026-09-15, md5 0ba7a9b356bb3eddcaf423189f25a7ad — still 046's). The only
-- differences below are the guard, the extra count, and their comments. 046-051 stay frozen.

create or replace function stage_gradebook(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_started timestamptz := clock_timestamp();
  v_status  text := 'ok';
  v_error   text;
  v_counts  jsonb := '{}'::jsonb;
  v_seen int := 0; v_attempted int := 0; v_ins int := 0; v_dupes int := 0;
  v_unresolved int := 0; v_totals int := 0; v_attendance int := 0; v_items int := 0;
  v_new int := 0; v_changed int := 0;
  v_is_newest boolean := true;
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

    -- Phase 10a round 2 (R2-7): only the NEWEST registered crawl may report score movement.
    -- Folds do not arrive in crawl order - 039 folds oldest-first and a crawl can be registered
    -- late - so an older run compared against the mirror's newer rows would report every value it
    -- carries as "changed", and the Activity feed would tell Stack his grades moved when all that
    -- happened was a replay. Same predicate, same reason, as stage_files (043). "Registered", not
    -- "folded": a crawl waiting to be folded has no sync_runs row yet.
    select not exists (
             select 1
               from agent_requests r
              where r.kind = 'sync'
                and r.run_id is not null
                and r.run_id <> p_run_id
                and (select max(b.captured_at) from bb_raw b where b.run_id = r.run_id)
                    > (select max(b.captured_at) from bb_raw b where b.run_id = p_run_id))
      into v_is_newest;

    -- Score movement, measured BEFORE the insert: comparing against the newest row from any
    -- earlier run. A column with no earlier row at all reads as "previously null", so the first
    -- gradebook run reports the grades it found rather than reporting silence.
    if v_is_newest then
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
    end if;

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
      'scores_changed',     v_changed,
      'older_run',          not v_is_newest);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'gradebook', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','gradebook','status',v_status,'counts',v_counts,'error',v_error);
end $function$;

comment on function stage_gradebook(uuid, bigint) is
  'Mirror one crawl''s gradebook columns into bb_gradebook. Reads bb_raw rows of kind = course '
  'for the run, resolves each shell with bb_resolve_course, and inserts one row per column with '
  'on conflict do nothing, so a second call on the same run inserts 0. scores_new and '
  'scores_changed are reported only when this is the newest REGISTERED crawl; an older run being '
  'replayed inserts its rows as history and reports 0 / 0 with older_run = true, because a claim '
  'about change is only meaningful from the run that is furthest forward. Writes nothing to '
  'assignments, assignment_progress or attention_items. Never raises.';

-- Privileges are preserved by `create or replace`; re-asserted to match 046/038 exactly.
revoke all on function public.stage_gradebook(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_gradebook(uuid,bigint) to service_role;
