-- bb2dash :: db/tests/phase10a_stage_gradebook.sql
-- Phase 10a. Tests migration 046 (bb_gradebook + stage_gradebook) and 047 (the three views)
-- against the committed fixtures.
--
-- RUN IT (the loader opens the transaction; this file closes it with a rollback):
--
--   cat db/tests/phase10a_load_fixtures.sql db/tests/phase10a_stage_gradebook.sql \
--     | psql "$DATABASE_URL"
--
-- or paste that same concatenation into one `execute_sql` call through the Supabase MCP. A
-- failing assertion raises, which is the failure signal; a pass ends with one summary row.
--
-- NOTHING IS COMMITTED. Every insert this file and the loader make is inside the transaction the
-- loader opened, and the last statement here is `rollback`.
--
-- WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT
--   Deterministic, asserted exactly: the column counts, the column_kind split, idempotency, the
--   reconciliation against bb_raw, and the three v_course_grade states.
--   NOT asserted on the first call: scores_new / scores_changed. Those compare against the newest
--   row from any OTHER run, so their value depends on whether the database already holds a real
--   crawl of the same columns - 6 on an empty database, 0 on prod, where run bf2f81e5 carries the
--   same scores. Section 5 proves their semantics properly instead, with a second fixture crawl
--   whose changes are known.

-- =============================================================================================
-- 1. The stage runs, and says what the fixtures contain
-- =============================================================================================
do $$
declare
  v_run uuid; v_sync bigint; r jsonb; c jsonb;
begin
  select run_id, sync_run_id into v_run, v_sync from _fx;

  r := stage_gradebook(v_run, v_sync);
  c := r->'counts';

  if r->>'status' <> 'ok' then
    raise exception 'FAIL stage_gradebook status = % (%)', r->>'status', r->>'error';
  end if;
  if (c->>'columns_seen')::int <> 20 then
    raise exception 'FAIL columns_seen = %, expected 20 (2 ECN.304 + 12 IST.323 + 6 IST.471)',
      c->>'columns_seen';
  end if;
  if (c->>'inserted')::int <> 20 then
    raise exception 'FAIL inserted = %, expected 20', c->>'inserted';
  end if;
  if (c->>'duplicates_skipped')::int <> 0 then
    raise exception 'FAIL duplicates_skipped = % on a first call, expected 0', c->>'duplicates_skipped';
  end if;
  if (c->>'courses_unresolved')::int <> 0 then
    raise exception 'FAIL courses_unresolved = %, expected 0', c->>'courses_unresolved';
  end if;
  -- column_kind: IST.323 "Total Score" is the one calculated total, "Final Letter Grade" the one
  -- letter column, ECN.304 "Attendance" the one attendance column. Everything else is an item -
  -- including IST.323 "Participation", which bb_assignment_type reads as participation, not
  -- attendance, and which therefore belongs on the item rows.
  if (c->>'totals')::int <> 1 then
    raise exception 'FAIL totals = %, expected 1 (IST.323 Total Score)', c->>'totals';
  end if;
  if (c->>'attendance')::int <> 1 then
    raise exception 'FAIL attendance = %, expected 1 (ECN.304 Attendance)', c->>'attendance';
  end if;
  if (c->>'items')::int <> 17 then
    raise exception 'FAIL items = %, expected 17', c->>'items';
  end if;
end $$;

-- =============================================================================================
-- 2. column_kind row by row, and the rules that are easy to get wrong
-- =============================================================================================
-- Every query in this section is scoped to the fixture run. The suite is designed to run against
-- prod, which already holds the real crawl of these same columns; an unscoped read would compare
-- against whichever row happened to come back first.
do $$
declare v text; v_run uuid;
begin
  select run_id into v_run from _fx;

  select column_kind into v from bb_gradebook where run_id = v_run and column_id = '_3599279_1';
  if v <> 'total' then raise exception 'FAIL IST.323 Total Score is %, expected total', v; end if;

  select column_kind into v from bb_gradebook where run_id = v_run and column_id = '_3560523_1';
  if v <> 'letter' then
    raise exception 'FAIL IST.323 Final Letter Grade is %, expected letter. It is NOT a calculated '
                    'column (isCalc false), so only the name rule can catch it.', v;
  end if;

  select column_kind into v from bb_gradebook where run_id = v_run and column_id = '_3598937_1';
  if v <> 'attendance' then raise exception 'FAIL ECN.304 Attendance is %, expected attendance', v; end if;

  select column_kind into v from bb_gradebook where run_id = v_run and column_id = '_3560545_1';
  if v <> 'item' then
    raise exception 'FAIL IST.323 Participation is %, expected item - participation is not attendance', v;
  end if;

  if exists (select 1 from bb_gradebook where run_id = v_run and column_kind = 'total' and not is_total)
     or exists (select 1 from bb_gradebook where run_id = v_run and column_kind <> 'total' and is_total) then
    raise exception 'FAIL is_total is not (column_kind = total) on every row';
  end if;

  -- g.score is null on every real column and is never read; effective_score is the only score.
  if exists (select 1 from bb_gradebook where run_id = v_run and (raw->>'score') is not null) then
    raise exception 'FAIL a fixture column carries a non-null g.score; the rule that it is never '
                    'read needs re-checking against that payload';
  end if;
end $$;

-- =============================================================================================
-- 3. Idempotency: a second call on the same run inserts nothing
-- =============================================================================================
do $$
declare
  v_run uuid; v_sync bigint; v_before bigint; v_after bigint; c jsonb;
begin
  select run_id, sync_run_id into v_run, v_sync from _fx;
  select count(*) into v_before from bb_gradebook;

  c := stage_gradebook(v_run, v_sync)->'counts';

  select count(*) into v_after from bb_gradebook;
  if v_after <> v_before then
    raise exception 'FAIL second call added % row(s); the stage is not idempotent', v_after - v_before;
  end if;
  if (c->>'inserted')::int <> 0 then
    raise exception 'FAIL second call reports inserted = %, expected 0', c->>'inserted';
  end if;
  if (c->>'duplicates_skipped')::int <> 20 then
    raise exception 'FAIL second call reports duplicates_skipped = %, expected 20', c->>'duplicates_skipped';
  end if;
end $$;

-- =============================================================================================
-- 4. Reconciliation against bb_raw, and the views
-- =============================================================================================
do $$
declare n int; v text; s numeric;
begin
  -- 4a. Per course, the column count in bb_raw equals the count in v_gradebook_latest.
  select count(*) into n from (
    select bb_resolve_course(b.bb_course_id) as course_id, count(*) as raw_cols
      from bb_raw b, lateral jsonb_array_elements(bb_jarray(b.payload->'gradebook')) g
     where b.run_id = (select run_id from _fx) and b.kind = 'course'
       and coalesce(g->>'columnId','') <> ''
     group by 1) rc
   join (select course_id, count(*) as view_cols from v_gradebook_latest group by 1) vc
     on vc.course_id = rc.course_id
  where rc.raw_cols <> vc.view_cols;
  if n > 0 then raise exception 'FAIL % course(s) disagree on column count between bb_raw and v_gradebook_latest', n; end if;

  -- 4b. Every effective_score equals g->>'effectiveScore' at the column's own scale. numeric(9,3)
  --     is the frozen DDL, so ECN.304 Attendance 83.33333 is stored 83.333 - compared rounded,
  --     never ignored.
  select count(*) into n
    from (select bb_resolve_course(b.bb_course_id) as course_id, g->>'columnId' as column_id,
                 nullif(g->>'effectiveScore','')::numeric as raw_score
            from bb_raw b, lateral jsonb_array_elements(bb_jarray(b.payload->'gradebook')) g
           where b.run_id = (select run_id from _fx) and b.kind = 'course'
             and coalesce(g->>'columnId','') <> '') src
    join bb_gradebook gb
      on gb.run_id = (select run_id from _fx)
     and gb.course_id = src.course_id and gb.column_id = src.column_id
   where gb.effective_score is distinct from round(src.raw_score, 3);
  if n > 0 then raise exception 'FAIL % column(s) whose stored effective_score is not the payload value', n; end if;

  -- 4c. v_course_grade: IST.323 publishes a total, the other two fixtures do not.
  select total_effective_score into s from v_course_grade where course_id = 'IST.323';
  if s is distinct from 5.000 then raise exception 'FAIL IST.323 total_effective_score = %, expected 5.000', s; end if;
  select total_name into v from v_course_grade where course_id = 'IST.323';
  if v <> 'Total Score' then raise exception 'FAIL IST.323 total_name = %', v; end if;
  if exists (select 1 from v_course_grade where course_id in ('ECN.304','IST.471') and has_total) then
    raise exception 'FAIL a fixture course without a calculated column reports has_total';
  end if;
  if exists (select 1 from v_course_grade where course_id in ('ECN.304','IST.323','IST.471') and not has_gradebook) then
    raise exception 'FAIL a crawled fixture course reports has_gradebook false';
  end if;
  -- The third state, "never synced" (has_gradebook false, gradebook_seen_at null), is not
  -- asserted here: on a database that already holds a real crawl every course has a gradebook,
  -- so the assertion would pass on an empty database and fail on prod for the right reason.
  -- v_course_grade produces it by construction (the lateral returns count 0 -> false, max() ->
  -- null), and W-18's GradesScreen test covers the rendering of all three states.

  -- 4d. item_count / graded_item_count are Blackboard''s items only - no total, no attendance.
  select item_count into n from v_course_grade where course_id = 'IST.323';
  if n <> 10 then raise exception 'FAIL IST.323 item_count = %, expected 10', n; end if;
  select graded_item_count into n from v_course_grade where course_id = 'IST.323';
  if n <> 3 then raise exception 'FAIL IST.323 graded_item_count = %, expected 3', n; end if;
  select item_count into n from v_course_grade where course_id = 'ECN.304';
  if n <> 1 then raise exception 'FAIL ECN.304 item_count = %, expected 1 (Attendance is not an item)', n; end if;

  -- 4e. The assignments link. IST.323 _3569973_1 is attached to TWO assignments today, so
  --     assignment_id must be null and linked_assignments 2 - never a coin toss between them.
  select linked_assignments into n from v_gradebook_latest where column_id = '_3569973_1';
  if n <> 2 then raise exception 'FAIL _3569973_1 linked_assignments = %, expected 2', n; end if;
  if (select assignment_id from v_gradebook_latest where column_id = '_3569973_1') is not null then
    raise exception 'FAIL _3569973_1 resolved to a single assignment despite an ambiguous link';
  end if;
  if (select assignment_id from v_gradebook_latest where column_id = '_3560530_1') is null then
    raise exception 'FAIL IST.323 Quiz #1 did not resolve to its single assignment';
  end if;

  -- 4f. Feedback is stored verbatim, including anything that looks like markup. Escaping is the
  --     renderer''s job; the mirror must not silently alter what an instructor wrote.
  select feedback into v from v_gradebook_latest where column_id = '_3599884_1';
  if v <> 'Please post on the discussion board for others to see.' then
    raise exception 'FAIL IST.471 Assignment 2 feedback = %', coalesce(v, '(null)');
  end if;
end $$;

-- =============================================================================================
-- 5. scores_new / scores_changed, proved with a second fixture crawl
-- =============================================================================================
-- A later crawl of the same three shells with four deliberate changes:
--   IST.323 Quiz #1   (_3560530_1) 10 -> 9        an ITEM whose score moved   -> scores_changed
--   IST.323 Quiz #3   (_3560532_1) null -> 7      an ITEM newly scored        -> scores_new
--   ECN.304 Attendance(_3598937_1) 83.33333 -> 50 an ATTENDANCE column        -> neither
--   IST.323 Total     (_3599279_1) 5 -> 42        the TOTAL column            -> neither
-- The last two are the point of the test: a running total recalculates on every grading and
-- attendance moves after every class, so counting them would put a meaningless line in the
-- Activity feed on every single sync.
insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
values ('sync', 'all', 'done', '00000000-10a0-4000-8000-000000000002',
        'Phase 10a fixture crawl #2 (score movement). Test-only; rolled back.',
        'phase10a fixtures', now(), now());

with r as (
  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
  values ('00000000-10a0-4000-8000-000000000002', 'ok', now(), now(), 'manual', 'blackboard', 'all')
  returning id)
insert into _fx (run_id, sync_run_id) select '00000000-10a0-4000-8000-000000000002', r.id from r;

insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
select '00000000-10a0-4000-8000-000000000002', 'course', b.bb_course_id,
       jsonb_set(b.payload, '{gradebook}', (
         select coalesce(jsonb_agg(
                  case g->>'columnId'
                    when '_3560530_1' then jsonb_set(g, '{effectiveScore}', '9')
                    when '_3560532_1' then jsonb_set(g, '{effectiveScore}', '7')
                    when '_3598937_1' then jsonb_set(g, '{effectiveScore}', '50')
                    when '_3599279_1' then jsonb_set(g, '{effectiveScore}', '42')
                    else g end
                  order by ord), '[]'::jsonb)
           from jsonb_array_elements(bb_jarray(b.payload->'gradebook')) with ordinality t(g, ord))),
       b.captured_at + interval '1 day'
  from bb_raw b
 where b.run_id = '00000000-10a0-4000-8000-000000000001' and b.kind = 'course';

do $$
declare v_sync bigint; c jsonb; s numeric;
begin
  select sync_run_id into v_sync from _fx where run_id = '00000000-10a0-4000-8000-000000000002';
  c := stage_gradebook('00000000-10a0-4000-8000-000000000002'::uuid, v_sync)->'counts';

  if (c->>'inserted')::int <> 20 then
    raise exception 'FAIL second crawl inserted = %, expected 20 (a new run appends, never updates)',
      c->>'inserted';
  end if;
  if (c->>'scores_changed')::int <> 1 then
    raise exception 'FAIL scores_changed = %, expected exactly 1 (Quiz #1). A total or an '
                    'attendance column moving must not count.', c->>'scores_changed';
  end if;
  if (c->>'scores_new')::int <> 1 then
    raise exception 'FAIL scores_new = %, expected exactly 1 (Quiz #3, null -> 7)', c->>'scores_new';
  end if;
  -- Migration 056: this crawl IS the newest registered one, so it is entitled to report movement.
  if (c->>'older_run')::boolean then
    raise exception 'FAIL the newest registered crawl reported older_run = true';
  end if;

  -- The newest run wins in the view, and the older row is still there: this is a mirror with a
  -- history, not a table that gets overwritten.
  select effective_score into s from v_gradebook_latest where column_id = '_3560530_1';
  if s is distinct from 9.000 then raise exception 'FAIL v_gradebook_latest shows % for Quiz #1, expected 9.000', s; end if;
  if (select count(*) from bb_gradebook
       where column_id = '_3560530_1' and run_id in (select run_id from _fx)) <> 2 then
    raise exception 'FAIL Quiz #1 has % fixture row(s); both crawls should be kept',
      (select count(*) from bb_gradebook where column_id = '_3560530_1' and run_id in (select run_id from _fx));
  end if;
end $$;

-- =============================================================================================
-- 5b. An OLDER crawl replayed after a newer one narrates nothing (migration 056, R2-7)
-- =============================================================================================
-- Fixture crawl #1 is now a day older than crawl #2, which is already in the mirror. Folding it
-- again must not report "N score(s) changed": every value it carries differs from the newer rows,
-- and 039 folds oldest-first, so without the guard a replay would announce that Stack's grades
-- moved when all that happened was an out-of-order fold. The rows themselves are still history and
-- are still kept.
do $$
declare v_sync bigint; c jsonb;
begin
  select sync_run_id into v_sync from _fx where run_id = '00000000-10a0-4000-8000-000000000001';
  c := stage_gradebook('00000000-10a0-4000-8000-000000000001'::uuid, v_sync)->'counts';

  if not (c->>'older_run')::boolean then
    raise exception 'FAIL an out-of-order replay did not report older_run = true';
  end if;
  if (c->>'scores_changed')::int <> 0 or (c->>'scores_new')::int <> 0 then
    raise exception 'FAIL an older crawl reported scores_new = % / scores_changed = %, expected 0 / 0',
      c->>'scores_new', c->>'scores_changed';
  end if;
  if sync_change_lines(jsonb_build_object('gradebook', c)) <> jsonb_build_array('Nothing changed') then
    raise exception 'FAIL the Activity feed would still narrate an out-of-order replay: %',
      sync_change_lines(jsonb_build_object('gradebook', c));
  end if;
  -- It is a replay of a run already folded, so nothing new is inserted either.
  if (c->>'inserted')::int <> 0 then
    raise exception 'FAIL the replay inserted % row(s)', c->>'inserted';
  end if;
end $$;

-- =============================================================================================
-- 6. The stage writes facts and nothing else
-- =============================================================================================
do $$
declare n bigint;
begin
  -- Nothing in this file touched Stack's planner state or the Inbox. The counts are compared
  -- against a fresh read inside the same transaction: stage_gradebook never inserts into any of
  -- them, so any change here would be a regression, not a race.
  select count(*) into n from attention_items
   where raised_by in (select sync_run_id from _fx);
  if n <> 0 then raise exception 'FAIL stage_gradebook raised % attention item(s)', n; end if;

  select count(*) into n from assignments
   where source_ref like '%stage_gradebook%' or source_ref like '%Phase 10a%';
  if n <> 0 then raise exception 'FAIL stage_gradebook wrote % assignments row(s)', n; end if;

  select count(*) into n from sync_stage_runs
   where sync_run_id in (select sync_run_id from _fx) and stage = 'gradebook';
  if n <> 4 then
    raise exception 'FAIL % gradebook stage row(s) recorded, expected 4 (two calls on run 1, one on run 2, one replay of run 1)', n;
  end if;
end $$;

-- =============================================================================================
-- 7. Pass
-- =============================================================================================
select 'phase10a_stage_gradebook: PASS' as result,
       (select count(*) from bb_gradebook)                                          as gradebook_rows,
       (select count(*) from v_gradebook_latest)                                    as latest_rows,
       (select count(*) from v_course_grade where has_gradebook)                    as courses_with_gradebook,
       (select count(*) from v_course_grade where has_total)                        as courses_with_total,
       (select jsonb_object_agg(column_kind, n)
          from (select column_kind, count(*) as n from v_gradebook_latest group by 1) k) as kinds;

rollback;
