-- bb2dash :: 050_bb_attempts.sql
-- Phase 10a (docs/planning/67_PHASE10A_grades.md, Contract section "050 - bb_attempts"). R-17.
--
-- What Blackboard says Stack actually handed in: one row per submission attempt, plus a catalog
-- entry for every file that attempt carried. The bytes are not fetched here - bb-sync's new
-- step 4b downloads them in the logged-in tab and fills storage_path / sha256 / bytes on the
-- bb_files row this stage creates.
--
-- THE PAYLOAD THIS READS (frozen by the Contract, produced by ingest/bb_crawler.js v3):
--
--   attempts: [{ columnId, contentId, endpoint, status,        -- status = HTTP status of the call
--                results: [{ id, status, created, modified, submitted, score, feedback,
--                            studentComments, studentSubmission, exempt, receipt,
--                            files: [{ id, name, size, downloadUrl }], keys: [...] }] }]
--
-- NOTHING IN bb_raw CARRIES THIS KEY YET. Every crawl on record was made by a crawler build with
-- no attempts probe (checked: 0 of 7 course payloads in run bf2f81e5 have an `attempts` key), so
-- this stage is written against the frozen shape and tested against the fixtures in
-- db/fixtures/phase10a/. It reads a missing key as an empty array (bb_jarray, 034's rule), so a
-- replay of an older crawl records attempts_seen = 0 and changes nothing.
--
-- `keys` IS THE PROBE. The crawler puts Object.keys() of the first raw attempt per column into
-- `keys`, and this stage keeps the whole attempt object in `raw`, so after the first live crawl
-- one query over bb_attempts.raw names the real Blackboard key spellings - the same trick
-- `authorSource` played for announcements in Phase 9. Until that crawl the key names are
-- UNVERIFIED and an unknown key yields null, never a guess. The list of keys the probe has to
-- settle is in docs/planning/66_W17_VERIFICATION.md.
--
-- HARD RULES: assignment_progress and reading_progress are never written. Nothing is ever
-- deleted or updated - bb_attempts appends and bb_files is only ever inserted into, never
-- modified, by this stage. A bb_files row that already exists for the same (bb_course_id,
-- source_url) is left exactly as it is.
--
-- DEVIATIONS from the Contract, deliberate:
--   1. GRANTS and RLS PREDICATE follow 038, not 034/031 - same reasoning as migration 046's
--      header (lint 0029 and lint 0003). service_role only; (select auth.uid()) = (select
--      public.app_owner()).
--   2. The bb_files insert also carries `run_id` and `captured_at`, which the Contract's field
--      list does not name. stage_files sets both on every row it catalogues, and a submission
--      file with no provenance would be the only row in the table that cannot say which crawl
--      found it.
--   3. `v_attempts_latest` picks the newest row per (course_id, column_id, attempt_id) rather
--      than per bare attempt_id. Blackboard attempt ids look globally unique, but "looks unique"
--      is not a key, and the wider partition cannot collapse two genuinely different attempts.
--   4. `v_assignment_attempts.attempt_no` partitions by (assignment_id, course_id, column_id),
--      not by column_id alone. One column can be linked to two assignments (IST.323 _3569973_1
--      is, today); partitioning by the column alone would number that column's attempts 1..2N
--      across the join and tell Stack he is on "attempt 4 of 1".

-- =============================================================================================
-- 1. The table
-- =============================================================================================
create table bb_attempts (
  id                 bigint generated always as identity primary key,
  run_id             uuid not null, sync_run_id bigint references sync_runs(id),
  course_id          text not null references courses(id),
  column_id          text not null,
  attempt_id         text not null,
  status             text,                 -- NEEDS_GRADING | COMPLETED | IN_PROGRESS | ..., verbatim
  created_bb         timestamptz, submitted_bb timestamptz, modified_bb timestamptz,
  score              numeric(9,3), feedback text, student_comments text, student_submission text,
  exempt             boolean,
  receipt            text,                 -- Blackboard's confirmation number when the payload carries one
  files              jsonb not null default '[]',   -- [{id, name, size}] as captured
  seen_at            timestamptz not null, raw jsonb not null,
  unique (run_id, course_id, attempt_id)
);

create index bb_attempts_latest_idx on bb_attempts (course_id, column_id, seen_at desc);
create index bb_attempts_sync_run_idx on bb_attempts (sync_run_id);

alter table bb_attempts enable row level security;
create policy bb_attempts_owner_all on bb_attempts for all to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));

comment on table bb_attempts is
  'Append-per-run mirror of Blackboard submission attempts. One row per (run, course, attempt); '
  'never updated, never deleted. It is the evidence behind the popout''s "submitted at" line and '
  'behind every pulled-back file in bb_files.';
comment on column bb_attempts.files is
  'The attempt''s file list exactly as the crawler captured it: [{id, name, size, downloadUrl}]. '
  'Each entry also becomes a bb_files row under bucket = my_submissions so the bytes can be '
  'pulled and opened from Materials.';
comment on column bb_attempts.receipt is
  'Blackboard''s submission confirmation number, stored when the payload carries one and '
  'deliberately NOT rendered anywhere (Stack''s answer 1: it tells him nothing he acts on).';
comment on column bb_attempts.raw is
  'The attempt object exactly as the crawler posted it, including the `keys` probe. Until the '
  'first live attempts crawl this is the only record of what Blackboard''s real key names are.';

-- =============================================================================================
-- 2. stage_attempts
-- =============================================================================================
create or replace function stage_attempts(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
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
    drop table if exists pg_temp._bb_att;
    create temp table _bb_att on commit drop as
      select distinct on (cr.id, r->>'id')
             cr.id                                          as course_id,
             b.bb_course_id                                 as bb_course_id,
             e->>'columnId'                                 as column_id,
             r->>'id'                                       as attempt_id,
             nullif(r->>'status','')                        as status,
             nullif(r->>'created','')::timestamptz          as created_bb,
             nullif(r->>'submitted','')::timestamptz        as submitted_bb,
             nullif(r->>'modified','')::timestamptz         as modified_bb,
             nullif(r->>'score','')::numeric                as score,
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

    -- Catalogue the files. No bytes: storage_path stays null until bb-sync step 4b fills it, and
    -- stage_gaps already raises "in the catalog but its bytes were never stored" for exactly that.
    -- assignment_id is set only when the column resolves to ONE assignment, the same rule
    -- v_gradebook_latest uses; an ambiguous column gets a file with no assignment rather than a
    -- file filed under the wrong one.
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
end $$;

comment on function stage_attempts(uuid, bigint) is
  'Mirror one crawl''s submission attempts into bb_attempts and catalogue every attempt file '
  'into bb_files under bucket = my_submissions, classified_by = blackboard. Both inserts are on '
  'conflict do nothing, so a second call on the same run inserts 0 of each. Fetches no bytes, '
  'writes nothing to assignment_progress, and never raises: it records status = failed on its '
  'own sync_stage_runs row and returns.';

-- =============================================================================================
-- 3. Views
-- =============================================================================================
create view v_attempts_latest
  with (security_invoker = true) as
select distinct on (t.course_id, t.column_id, t.attempt_id)
       t.id, t.run_id, t.sync_run_id, t.course_id, t.column_id, t.attempt_id, t.status,
       t.created_bb, t.submitted_bb, t.modified_bb, t.score, t.feedback, t.student_comments,
       t.student_submission, t.exempt, t.receipt, t.files, t.seen_at
  from bb_attempts t
 where exists (select 1 from sync_runs s
                where s.run_id = t.run_id and s.scope is distinct from 'unregistered')
 order by t.course_id, t.column_id, t.attempt_id, t.seen_at desc, t.id desc;

comment on view v_attempts_latest is
  'The newest bb_attempts row per (course_id, column_id, attempt_id) from a registered crawl. '
  'raw is deliberately not exposed: it is the key probe''s evidence, read by hand, not by a '
  'screen.';

create view v_assignment_attempts
  with (security_invoker = true) as
select a.id                                                   as assignment_id,
       a.course_id,
       t.column_id,
       t.attempt_id,
       row_number() over (partition by a.id, t.course_id, t.column_id
                              order by t.created_bb nulls last, t.attempt_id)::int as attempt_no,
       g.multiple_attempts                                    as attempts_allowed,
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
  'them, with attempts_allowed from the gradebook column (0 means a single attempt, -1 on '
  'attempts_left means unlimited). receipt is carried and not rendered. The row count is the '
  'popout''s "Attempt N of M".';

-- =============================================================================================
-- 4. Privileges
-- =============================================================================================
revoke all on function public.stage_attempts(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_attempts(uuid,bigint) to service_role;

revoke all on v_attempts_latest     from anon;
revoke all on v_assignment_attempts from anon;
grant select on v_attempts_latest, v_assignment_attempts to authenticated, service_role;

-- =============================================================================================
-- 5. 036's guard, repeated.
-- =============================================================================================
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
