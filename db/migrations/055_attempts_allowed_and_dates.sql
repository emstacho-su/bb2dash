-- bb2dash :: 055_attempts_allowed_and_dates.sql
-- Phase 10a round 2, findings R2-5 and R2-6. See docs/planning/67_PHASE10A_grades.md § "Round 2".
--
-- Two fixes to the attempts side, both re-created from the LIVE definitions read out of prod
-- first (`pg_get_functiondef('public.stage_attempts(uuid,bigint)'::regprocedure)` and
-- `pg_get_viewdef('public.v_assignment_attempts'::regclass, true)`, 2026-09-15 — both still 050's,
-- confirmed by the four bare `::timestamptz` / `::numeric` casts and by the view still selecting
-- `g.multiple_attempts AS attempts_allowed`). 046-051 stay frozen.
--
-- =============================================================================================
-- R2-5 — "Attempt 2 of 1"
-- =============================================================================================
-- `v_assignment_attempts.attempts_allowed` was `g.multiple_attempts`, and that is not a ceiling.
-- In the live payloads `multipleAttempts` is 0 on a single-attempt column (not 1), and "unlimited"
-- is not in that field at all — it is `attemptsLeft = -1`. So a column with two recorded attempts
-- and `multipleAttempts = 0` rendered as "Attempt 2 of 0", and an unlimited column as "of 0" too.
-- Checked against the real run: 17 of 45 columns carry `attemptsLeft = -1` and almost all of them
-- have `multipleAttempts = 0`, so this was going to be wrong on most rows Stack looked at.
--
-- The rule, which W-18's `attemptsAllowed()` helper mirrors exactly:
--     attempts_left = -1   -> -1   (unlimited; the client renders "Attempt N (unlimited)")
--     multiple_attempts > 1 -> that number
--     otherwise             -> 1   (0 and 1 both mean a single attempt)
-- plus one branch the bare rule needs and the finding did not spell out: the join to
-- `v_gradebook_latest` is a LEFT join, so an attempt whose gradebook column has not been crawled
-- has BOTH fields null. `case … else 1 end` would then claim "of 1" on no evidence at all. That
-- row reports **null**, which is the same answer W-18's helper gives for (null, null) and which
-- the popout renders as a bare "Attempt N".
--
-- =============================================================================================
-- R2-6 — one bad date must not cost the whole stage
-- =============================================================================================
-- 050 parsed `created` / `submitted` / `modified` with a bare `::timestamptz`. Those keys are
-- UNVERIFIED — no crawl has ever produced an attempt — and Blackboard's internal endpoints hand
-- back epoch milliseconds in some places and ISO strings in others. A single numeric value would
-- raise inside the stage's one exception block, so the whole run's attempts would land as
-- `status = 'failed'` with zero rows: one odd field, and Stack loses every submission record.
--
-- Fixed with migration 026's pattern, which exists for exactly this reason:
--     jsonb number                             -> to_timestamp(n / 1000.0)
--     jsonb string matching ^\d{4}-\d{2}-\d{2}[T ] -> ::timestamptz
--     anything else                            -> null
-- A value nobody can read drops that one field and the row still lands.
--
-- `score` is hardened the same way, and for the same reason, although the finding only names the
-- dates: `nullif(r->>'score','')::numeric` on a non-numeric string is the identical failure mode
-- in the identical exception block. A numeric string is still accepted, so nothing that worked
-- before stops working.
--
-- STILL ABLE TO FAIL THE STAGE, and accepted: a score of 1e9 would overflow `numeric(9,3)` at
-- insert time. Clamping it would mean inventing a number, and the stage's exception block records
-- that honestly as a failed stage with its message. If a real payload ever does it, the fix is the
-- column type, not a silent truncation.

-- =============================================================================================
-- 1. v_assignment_attempts — a real ceiling
-- =============================================================================================
-- `create or replace view`, not drop/create: the column list and types are unchanged, so nothing
-- that depends on the view has to be rebuilt and the security_invoker reloption is carried
-- forward explicitly.
create or replace view v_assignment_attempts
  with (security_invoker = true) as
select a.id                                                   as assignment_id,
       a.course_id,
       t.column_id,
       t.attempt_id,
       row_number() over (partition by a.id, t.course_id, t.column_id
                              order by t.created_bb nulls last, t.attempt_id)::int as attempt_no,
       case
         -- No gradebook row for this column: we know nothing, and "of 1" would be a guess.
         when g.multiple_attempts is null and g.attempts_left is null then null
         -- Unlimited lives in attempts_left, never in multiple_attempts.
         when g.attempts_left = -1                                    then -1
         when g.multiple_attempts > 1                                 then g.multiple_attempts
         -- multiple_attempts 0 and 1 both mean one attempt.
         else 1
       end::int                                               as attempts_allowed,
       t.status,
       t.created_bb,
       t.submitted_bb,
       t.modified_bb,
       t.score,
       t.feedback,
       t.student_comments,
       t.student_submission,
       t.exempt,
       t.receipt,
       t.files,
       t.seen_at
  from assignments a
  join v_attempts_latest t
    on t.course_id = a.course_id and t.column_id = a.bb_column_id
  left join v_gradebook_latest g
    on g.course_id = t.course_id and g.column_id = t.column_id
 where a.bb_column_id is not null;

comment on view v_assignment_attempts is
  'Every mirrored attempt for an assignment, numbered attempt_no in the order Blackboard created '
  'them. attempts_allowed is a real ceiling: -1 means unlimited (the gradebook column''s '
  'attempts_left is -1), a number above 1 is that number, 1 covers Blackboard''s 0 and 1, and '
  'null means the column has not been crawled so nothing is known. receipt is carried and not '
  'rendered. The row count plus attempts_allowed is the popout''s "Attempt N of M".';

-- =============================================================================================
-- 2. stage_attempts — tolerant date and score parsing
-- =============================================================================================
create or replace function stage_attempts(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_started timestamptz := clock_timestamp();
  v_status  text := 'ok';
  v_error   text;
  v_counts  jsonb := '{}'::jsonb;
  v_probed int := 0; v_seen int := 0; v_ins int := 0; v_files int := 0; v_errs int := 0;
begin
  begin
    -- Every column the crawler probed, and every non-2xx among them. A column whose attempts
    -- call failed comes back with an empty `results`, so it must be counted here or it vanishes.
    select count(*),
           count(*) filter (where coalesce(e->>'status','') ~ '^[0-9]+$'
                              and ((e->>'status')::int < 200 or (e->>'status')::int > 299))
      into v_probed, v_errs
      from bb_raw b,
           lateral jsonb_array_elements(bb_jarray(b.payload->'attempts')) e
     where b.run_id = p_run_id and b.kind = 'course';

    -- One row per (course, attempt). `distinct on` collapses a column probed twice in one
    -- payload rather than leaning on ON CONFLICT to hide it.
    --
    -- Phase 10a round 2 (R2-6): the three dates and the score are parsed tolerantly, with 026's
    -- pattern. Every one of these keys is unverified until a live crawl, and a bare cast on an
    -- epoch-millisecond number would raise inside the single exception block below - losing the
    -- whole run's attempts over one field nobody can read.
    drop table if exists pg_temp._bb_att;
    create temp table _bb_att on commit drop as
      select distinct on (cr.id, r->>'id')
             cr.id                                          as course_id,
             b.bb_course_id                                 as bb_course_id,
             e->>'columnId'                                 as column_id,
             r->>'id'                                       as attempt_id,
             nullif(r->>'status','')                        as status,
             case when jsonb_typeof(r->'created') = 'number'
                    then to_timestamp((r->>'created')::numeric / 1000.0)
                  when jsonb_typeof(r->'created') = 'string'
                   and (r->>'created') ~ '^\d{4}-\d{2}-\d{2}[T ]'
                    then (r->>'created')::timestamptz
             end                                            as created_bb,
             case when jsonb_typeof(r->'submitted') = 'number'
                    then to_timestamp((r->>'submitted')::numeric / 1000.0)
                  when jsonb_typeof(r->'submitted') = 'string'
                   and (r->>'submitted') ~ '^\d{4}-\d{2}-\d{2}[T ]'
                    then (r->>'submitted')::timestamptz
             end                                            as submitted_bb,
             case when jsonb_typeof(r->'modified') = 'number'
                    then to_timestamp((r->>'modified')::numeric / 1000.0)
                  when jsonb_typeof(r->'modified') = 'string'
                   and (r->>'modified') ~ '^\d{4}-\d{2}-\d{2}[T ]'
                    then (r->>'modified')::timestamptz
             end                                            as modified_bb,
             case when jsonb_typeof(r->'score') = 'number'
                    then (r->>'score')::numeric
                  when jsonb_typeof(r->'score') = 'string'
                   and (r->>'score') ~ '^-?\d+(\.\d+)?$'
                    then (r->>'score')::numeric
             end                                            as score,
             nullif(r->>'feedback','')                      as feedback,
             nullif(r->>'studentComments','')               as student_comments,
             nullif(r->>'studentSubmission','')             as student_submission,
             case when jsonb_typeof(r->'exempt') = 'boolean' then (r->>'exempt')::boolean end as exempt,
             nullif(r->>'receipt','')                       as receipt,
             bb_jarray(r->'files')                          as files,
             b.captured_at                                  as seen_at,
             r                                              as raw
        from bb_raw b
        join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
             lateral jsonb_array_elements(bb_jarray(b.payload->'attempts')) e,
             lateral jsonb_array_elements(bb_jarray(e->'results')) r
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(e->>'columnId','') <> ''
         and coalesce(r->>'id','') <> ''
       order by cr.id, r->>'id', b.captured_at desc;

    select count(*) into v_seen from _bb_att;

    insert into bb_attempts (run_id, sync_run_id, course_id, column_id, attempt_id, status,
                             created_bb, submitted_bb, modified_bb, score, feedback,
                             student_comments, student_submission, exempt, receipt, files,
                             seen_at, raw)
    select p_run_id, p_sync_run_id, a.course_id, a.column_id, a.attempt_id, a.status,
           a.created_bb, a.submitted_bb, a.modified_bb, a.score, a.feedback,
           a.student_comments, a.student_submission, a.exempt, a.receipt, a.files,
           a.seen_at, a.raw
      from _bb_att a
    on conflict (run_id, course_id, attempt_id) do nothing;
    get diagnostics v_ins = row_count;

    -- Catalogue the files. No bytes: storage_path stays null until bb-sync step 4b fills it.
    -- assignment_id is set only when the column resolves to ONE assignment, the same rule
    -- v_gradebook_latest uses; an ambiguous column gets a file with no assignment rather than a
    -- file filed under the wrong one. Migration 052 keys each of these under its own
    -- attempt-<digits>/ folder, so it cannot collide with a file Stack staged.
    with refs as (
      select distinct on (a.bb_course_id, bb_abs_url(f->>'downloadUrl'))
             a.bb_course_id, a.course_id, a.column_id, a.attempt_id, a.seen_at,
             coalesce(nullif(btrim(f->>'name'), ''), 'untitled') as file_name,
             bb_abs_url(f->>'downloadUrl')                       as url
        from _bb_att a, lateral jsonb_array_elements(bb_jarray(a.files)) f
       where coalesce(f->>'downloadUrl','') <> ''
       order by a.bb_course_id, bb_abs_url(f->>'downloadUrl'), a.seen_at desc
    )
    insert into bb_files (run_id, bb_course_id, course_id, file_name, mime_type, source_url,
                          bucket, classified_by, classification_confidence, assignment_id,
                          attempt_id, text_status, captured_at, notes)
    select p_run_id, d.bb_course_id, d.course_id, d.file_name, null, d.url,
           'my_submissions', 'blackboard', 1,
           (select case when count(*) = 1 then min(asg.id) end
              from assignments asg
             where asg.course_id = d.course_id and asg.bb_column_id = d.column_id),
           d.attempt_id, 'na', d.seen_at,
           'attempt file; bytes pulled by bb-sync step 4b'
      from refs d
    on conflict (bb_course_id, source_url) do nothing;
    get diagnostics v_files = row_count;

    v_counts := jsonb_build_object(
      'columns_probed',   v_probed,
      'attempts_seen',    v_seen,
      'inserted',         v_ins,
      'files_catalogued', v_files,
      'errors',           v_errs);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'attempts', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','attempts','status',v_status,'counts',v_counts,'error',v_error);
end $function$;

comment on function stage_attempts(uuid, bigint) is
  'Mirror one crawl''s submission attempts into bb_attempts and catalogue every attempt file '
  'into bb_files under bucket = my_submissions, classified_by = blackboard. Both inserts are on '
  'conflict do nothing, so a second call on the same run inserts 0 of each. Dates and the score '
  'are parsed tolerantly (026''s pattern): an epoch-millisecond number converts, an ISO string '
  'converts, anything else drops that one field - because the keys are unverified until a live '
  'crawl and one unreadable value must not cost the run its attempts. Fetches no bytes, writes '
  'nothing to assignment_progress, and never raises.';

-- Privileges are preserved by `create or replace`; re-asserted to match 050/038 exactly.
revoke all on function public.stage_attempts(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_attempts(uuid,bigint) to service_role;
revoke all on v_assignment_attempts from anon;
grant select on v_assignment_attempts to authenticated, service_role;

-- 036's guard, repeated: a view re-created without security_invoker is the Phase 8 hole reopened.
do $$
declare v text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and coalesce((select o = 'security_invoker=true'
                     from unnest(c.reloptions) o where o like 'security_invoker=%'), false) is false;
  if v is not null then
    raise exception 'these public views still run as their owner and bypass RLS: %', v;
  end if;
end $$;
