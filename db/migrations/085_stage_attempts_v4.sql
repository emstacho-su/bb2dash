-- bb2dash :: 085_stage_attempts_v4.sql
-- Phase 12b, item G-7a (docs/planning/80c_PHASE12B_page_pass.md: P-grades-4, P-grades-5;
-- docs/planning/80f_ATTEMPTS_ENDPOINT.md). Worker W-30.
--
-- WHAT CHANGED ABOVE THIS FUNCTION. `ingest/bb_crawler.js` is v4: it walks the three requests
-- Blackboard's own gradebook page walks (grade -> attempts -> attempt detail) instead of the one
-- route v3 asked, which answers `200 {"results": []}` for a student on every column. The envelope
-- keeps v3's shape on purpose, so almost all of this function reads the new payload unchanged:
--     attempts[] .columnId .status .results[] .id .status .created .modified .submitted
--                .score .exempt .receipt .files[] .name .downloadUrl
-- Checked name by name against 80f. Three of them moved and one is new.
--
-- 1. THE PROSE MOVED, DELIBERATELY - AND THE SQL IS LEFT ALONE ON PURPOSE.
--    `studentSubmission.rawText` is what Stack typed into Blackboard, `studentComments` is what
--    he wrote alongside it and `instructorFeedback` is what a professor wrote back. v4 nests all
--    three under `results[].text`. The three top-level reads below - `r->>'feedback'`,
--    `r->>'studentComments'`, `r->>'studentSubmission'` - are KEPT, because a v3 payload does put
--    them at the top level and a replay of one must still fill its columns. On a v4 payload those
--    keys are simply absent, so `bb_attempts.feedback`, `.student_comments` and
--    `.student_submission` come out null and the text reaches `bb_attempts.raw` alone, which is
--    owner-only under RLS. Nothing to change here; it is written down because a reader of those
--    three columns would otherwise think the stage had broken.
--
-- 2. THE ONE REAL CHANGE: `mime_type`. v3 had no idea what a submission file was - it BUILT a
--    download URL and had no metadata - so the catalogue insert passed a literal `null` for
--    `bb_files.mime_type`. v4 reads `file.mimeType` off the attempt detail and hands it over as
--    `files[].mime`. A file with no mime_type is a file `v_file_layout` and the Materials open
--    action cannot route, so the literal null is replaced by the value the crawler now has. That
--    is the whole diff in the body: one column in the `refs` CTE and one argument in the insert.
--
-- 3. `file.permanentUrl` NEEDS NO CHANGE. It arrives as `files[].downloadUrl`, already absolute,
--    and `bb_abs_url` passes an absolute URL through untouched. The stored `source_url` becomes a
--    durable `bbcswebdav/xid-<n>_1` link - the same kind bb-sync step 4 already pulls - instead of
--    v3's built `/gradebook/attempts/<id>/files/<id>/download`, which is not a route a student
--    session has. That is the second reason nothing was ever catalogued.
--
-- A v3 PAYLOAD STILL FOLDS. `results: []` yields no rows and no error; a v3 file entry has no
-- `mime` key, so `f->>'mime'` is null and the row is catalogued exactly as before. Both are
-- asserted in db/tests/phase12b_085_stage_attempts_v4.sql against db/fixtures/phase12b, which
-- carries one payload of each version.
--
-- Built from the LIVE definition (`pg_get_functiondef('public.stage_attempts(uuid,bigint)'
-- ::regprocedure)`, read 2026-09-18 - still 055's). 050 and 055 stay frozen.

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
             -- v4 (085): Blackboard's own `file.mimeType`, which v3 never had. Null on a v3
             -- payload, and the row is catalogued exactly as it was before.
             nullif(btrim(f->>'mime'), '')                       as mime_type,
             bb_abs_url(f->>'downloadUrl')                       as url
        from _bb_att a, lateral jsonb_array_elements(bb_jarray(a.files)) f
       where coalesce(f->>'downloadUrl','') <> ''
       order by a.bb_course_id, bb_abs_url(f->>'downloadUrl'), a.seen_at desc
    )
    insert into bb_files (run_id, bb_course_id, course_id, file_name, mime_type, source_url,
                          bucket, classified_by, classification_confidence, assignment_id,
                          attempt_id, text_status, captured_at, notes)
    select p_run_id, d.bb_course_id, d.course_id, d.file_name, d.mime_type, d.url,
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
  'converts, anything else drops that one field. Reads the crawler v4 envelope (085): '
  'files[].mime becomes bb_files.mime_type, and files[].downloadUrl is Blackboard''s own durable '
  'bbcswebdav URL rather than v3''s built one. A v3 payload still folds - its empty results[] '
  'yield no rows and no error. The three prose fields (the typed-in submission, Stack''s comments '
  'and the instructor''s feedback) live under results[].text, which this function does not read, '
  'so they reach bb_attempts.raw and no column of their own. Fetches no bytes, writes nothing to '
  'assignment_progress, and never raises.';

-- Privileges are preserved by `create or replace`; re-asserted to match 050/038 exactly.
revoke all on function public.stage_attempts(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_attempts(uuid,bigint) to service_role;

-- =============================================================================================
-- Guard: the body reads the v4 mime type, and still reads v3's top-level prose keys
-- =============================================================================================
do $$
declare def text;
begin
  def := pg_get_functiondef('public.stage_attempts(uuid,bigint)'::regprocedure);
  if position('f->>''mime''' in def) = 0 then
    raise exception '085: stage_attempts still discards the file mime type';
  end if;
  if position('d.mime_type' in def) = 0 then
    raise exception '085: stage_attempts does not insert the mime type it read';
  end if;
  -- Dropping these would break a replay of a v3 payload, which does carry the prose at the top
  -- level. On a v4 payload the keys are absent and the columns come out null by themselves.
  if position('r->>''studentSubmission''' in def) = 0
     or position('r->>''studentComments''' in def) = 0
     or position('r->>''feedback''' in def) = 0 then
    raise exception '085: stage_attempts stopped reading v3''s top-level prose keys';
  end if;
end $$;
