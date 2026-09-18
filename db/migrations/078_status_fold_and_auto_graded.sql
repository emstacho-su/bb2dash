-- bb2dash :: 078_status_fold_and_auto_graded.sql
-- Phase 12b, item S-1, database half (docs/planning/80c_PHASE12B_page_pass.md: P-grades-7,
-- Stack's answers 5 and 18). Worker W-30.
--
-- STACK'S DECISION. The status menu offers six values - not opened, in progress, submitted,
-- graded, excused, DNF - and "graded sets itself when Blackboard posts a score". The Postgres
-- enum `progress_status` keeps all nine values (migrations are additive, and an enum value cannot
-- be dropped without rewriting every dependant); the three retired ones simply stop being
-- written. The vocabulary itself lives in ONE place, web/src/lib/progress-status.ts, which is
-- PM-owned and was committed before this branch was cut. This migration is its database mirror.
--
-- 1. THE FOLD. `planned` -> `not_started`, `waived` and `not_applicable` -> `excused`, in both
--    progress tables. Measured on prod before applying: assignment_progress had 2 rows at
--    not_applicable and none at planned or waived; reading_progress had none at all. After this
--    nothing anywhere holds a retired value, and nothing writes one: the menus offer six.
--
-- 2. AUTO-GRADED. A step at the end of `stage_gradebook`, and the same statement applied once
--    here so Stack does not have to wait for the next sync. This is the ONE sanctioned sync write
--    to planner state - every other rule in this project says a sync never touches
--    assignment_progress - so the conditions are narrow and all four are enforced in SQL:
--      * FORWARD-ONLY from not_started / planned / in_progress / submitted, mirroring
--        AUTO_GRADED_FROM in progress-status.ts. `excused` and `missed` are Stack's judgement
--        about the item and are never overwritten. `graded` is already there and is not
--        rewritten, which is what makes a replay write zero rows.
--      * NEWEST CRAWL ONLY, the same guard and the same reason as 056's scores_new /
--        scores_changed: a replayed older run has nothing current to say.
--      * EXACTLY ONE ASSIGNMENT on the column. A shared column (see 075) does not tell the
--        transform which assignment the score belongs to, and guessing would mark the wrong one.
--      * NOT EXEMPT. An exemption is not a grade.
--    Nothing else on the row moves: no score, no planned dates, no priority, no notes.
--
-- The function body below is 056's, verbatim, with the declaration, the step and its count added;
-- 056 stays frozen. Its comment is restated because the old one promised that this stage writes
-- nothing to assignment_progress, and that promise now has an exception with a name.

-- =============================================================================================
-- 0. Snapshot, so the guards at the end can prove nothing moved that should not have
-- =============================================================================================
create temp table _078_before as
select assignment_id, status from assignment_progress;

-- =============================================================================================
-- 1. The fold
-- =============================================================================================
do $$
declare
  n_asg     int;
  n_rdg     int;
  left_over text;
begin
  update assignment_progress
     set status = (case status when 'planned' then 'not_started' else 'excused' end)::progress_status
   where status in ('planned', 'waived', 'not_applicable');
  get diagnostics n_asg = row_count;

  update reading_progress
     set status = (case status when 'planned' then 'not_started' else 'excused' end)::progress_status
   where status in ('planned', 'waived', 'not_applicable');
  get diagnostics n_rdg = row_count;

  raise notice '078 fold: % assignment_progress row(s), % reading_progress row(s)', n_asg, n_rdg;

  select string_agg(q.t || ' ' || q.s, ', ') into left_over
    from (select 'assignment_progress' as t, status::text as s from assignment_progress
           where status in ('planned', 'waived', 'not_applicable')
          union all
          select 'reading_progress', status::text from reading_progress
           where status in ('planned', 'waived', 'not_applicable')) q;
  if left_over is not null then
    raise exception '078: a retired status survived the fold: %', left_over;
  end if;
end $$;

-- =============================================================================================
-- 2. stage_gradebook: 056's body, plus the auto-graded step
-- =============================================================================================
create or replace function stage_gradebook(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_started timestamptz := clock_timestamp();
  v_status  text := 'ok';
  v_error   text;
  v_counts  jsonb := '{}'::jsonb;
  v_seen int := 0; v_attempted int := 0; v_ins int := 0; v_dupes int := 0;
  v_unresolved int := 0; v_totals int := 0; v_attendance int := 0; v_items int := 0;
  v_graded int := 0;
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

    -- Phase 12b S-1 (P-grades-7, Stack's answer 5; DECISIONS 2026-09-17). The one sanctioned
    -- sync write to planner state: an assignment whose gradebook column now carries a score reads
    -- "Graded" without Stack clicking anything. Every condition is in the statement -
    -- forward-only from the four values AUTO_GRADED_FROM lists, newest crawl only, the column
    -- bound to exactly one assignment, not exempt - and nothing but `status` is written.
    if v_is_newest then
      insert into assignment_progress (assignment_id, status)
      select distinct a.id, 'graded'::progress_status
        from _bb_gb n
        join assignments a on a.course_id = n.course_id and a.bb_column_id = n.column_id
       where n.column_kind = 'item'
         and n.effective_score is not null
         and coalesce(n.is_exempt, false) = false
         and (select count(*) from assignments a2
               where a2.course_id = n.course_id and a2.bb_column_id = n.column_id) = 1
      on conflict (assignment_id) do update
         set status = 'graded'
       where assignment_progress.status in ('not_started', 'planned', 'in_progress', 'submitted');
      get diagnostics v_graded = row_count;
    end if;

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
      'auto_graded',        v_graded,
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
  'assignments or attention_items. The ONE thing it writes to assignment_progress (078) is '
  'status = ''graded'' when the newest crawl carries a score for a non-exempt column bound to '
  'exactly one assignment, and only forward from not_started / planned / in_progress / '
  'submitted - never from excused or missed, never any other column of the row, and never on a '
  'replay (counted as auto_graded).';

-- Privileges are preserved by `create or replace`; re-asserted to match 046/038 exactly.
revoke all on function public.stage_gradebook(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_gradebook(uuid,bigint) to service_role;

-- =============================================================================================
-- 3. The same step, applied once to the newest crawl
-- =============================================================================================
-- Statement for statement what stage_gradebook now runs, against the newest folded crawl, so the
-- app tells the truth today instead of after the next sync. Forward-only, so nothing Stack has
-- marked excused or DNF moves; running it a second time writes nothing.
do $$
declare n int;
begin
  insert into assignment_progress (assignment_id, status)
  select distinct a.id, 'graded'::progress_status
    from bb_gradebook g
    join assignments a on a.course_id = g.course_id and a.bb_column_id = g.column_id
   where g.run_id = (select s.run_id from sync_runs s
                      where s.source = 'blackboard' and s.status in ('ok', 'partial')
                        and s.scope is distinct from 'unregistered' and s.run_id is not null
                      order by s.started_at desc nulls last
                      limit 1)
     and g.column_kind = 'item'
     and g.effective_score is not null
     and coalesce(g.is_exempt, false) = false
     and (select count(*) from assignments a2
           where a2.course_id = g.course_id and a2.bb_column_id = g.column_id) = 1
  on conflict (assignment_id) do update
     set status = 'graded'
   where assignment_progress.status in ('not_started', 'planned', 'in_progress', 'submitted');
  get diagnostics n = row_count;
  raise notice '078 auto-graded backfill: % row(s)', n;
end $$;

-- =============================================================================================
-- Guards
-- =============================================================================================
do $$
declare moved text;
begin
  -- Nothing Stack had marked excused or DNF moved.
  select string_agg(b.assignment_id || ': ' || b.status::text || ' -> ' || p.status::text, ', '
                    order by b.assignment_id) into moved
    from _078_before b
    join assignment_progress p on p.assignment_id = b.assignment_id
   where b.status in ('excused', 'missed')
     and p.status is distinct from b.status;
  if moved is not null then
    raise exception '078: a judgement Stack made was overwritten: %', moved;
  end if;

  -- The only rows that moved at all are a retired value being folded, or a status going to graded.
  select string_agg(b.assignment_id || ': ' || b.status::text || ' -> ' || p.status::text, ', '
                    order by b.assignment_id) into moved
    from _078_before b
    join assignment_progress p on p.assignment_id = b.assignment_id
   where p.status is distinct from b.status
     and b.status not in ('planned', 'waived', 'not_applicable')
     and p.status <> 'graded';
  if moved is not null then
    raise exception '078: an unexpected status change: %', moved;
  end if;

  -- And the retired values are gone for good.
  if exists (select 1 from assignment_progress where status in ('planned', 'waived', 'not_applicable'))
     or exists (select 1 from reading_progress where status in ('planned', 'waived', 'not_applicable')) then
    raise exception '078: a retired status is still stored';
  end if;

  -- The step is in the function and reports itself.
  if pg_get_functiondef('public.stage_gradebook(uuid,bigint)'::regprocedure) not like '%auto_graded%' then
    raise exception '078: stage_gradebook does not report auto_graded';
  end if;
end $$;

drop table _078_before;
