-- bb2dash :: 037_stage_files_replay_guard.sql
-- Phase 9. A bug found by running the transform for real, and the correction of the rows it
-- touched. Not in the brief; it is here because the brief's own verification step exposed it.
--
-- WHAT HAPPENED. The brief asks for the latest crawl (6b122650, 2026-09-08) to be folded first
-- and the earlier one (3e12fd89, 2026-09-02) second. stage_files marks a catalogued file
-- "gone from Blackboard" when the run being folded does not mention it. Replaying an OLDER crawl
-- after a newer one inverts that test: the 9/2 crawl was made by a crawler build that only
-- reported attached files (25 refs) and not the embedded ones the 9/8 build finds (61 refs), so
-- folding it stamped missing_since_run on 22 files that are demonstrably still in Blackboard -
-- they were seen three minutes of wall-clock earlier in run 16.
--
-- Nothing was deleted and no fact was overwritten: the damage is 22 wrong notes and one wrong
-- Activity line. Both are corrected below, and the correction is recorded rather than hidden.
--
-- THE FIX. "Gone" is only meaningful from the most recent crawl. stage_files now runs its
-- missing pass only when the run being folded is the newest one folded so far, and reports
-- missing_skipped_older_run = true when it declines. Everything else about the stage is
-- unchanged; this is a create-or-replace of one function.

create or replace function stage_files(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_refs int := 0; v_session int := 0; v_matched_url int := 0; v_url_updated int := 0;
  v_inserted int := 0; v_name_drift int := 0; v_protected int := 0; v_missing int := 0;
  v_raised int := 0; v_n int;
  v_is_newest boolean := true;
  s record;
begin
  begin
    drop table if exists pg_temp._bb_refs;
    create temp table _bb_refs on commit drop as
      select cr.id as course_id, b.bb_course_id, b.captured_at,
             ci->>'id'                       as content_id,
             nullif(ci->>'path','')          as path,
             nullif(e->>'name','')           as file_name,
             bb_abs_url(e->>'url')           as url,
             nullif(e->>'mime','')           as mime
        from bb_raw b
        join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci,
             lateral jsonb_array_elements(bb_jarray(ci->'embeddedFiles')) e
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(e->>'url','') <> ''
      union
      select cr.id, b.bb_course_id, b.captured_at,
             ci->>'id',
             nullif(ci->>'path',''),
             nullif(coalesce(ci->'detail'->'file'->>'name', ci->>'title'), ''),
             bb_abs_url(ci->'detail'->'file'->>'url'),
             null
        from bb_raw b
        join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(ci->'detail'->'file'->>'url','') <> '';

    select count(*) into v_refs from _bb_refs;

    -- Session-scoped URLs 403 once the Blackboard session ends, so cataloguing one produces an
    -- entry nothing can ever download. Skip it and say so out loud.
    for s in select * from _bb_refs where url ~ '/sessions/' loop
      v_session := v_session + 1;
      if raise_attention(p_sync_run_id, 'data_gap', s.course_id, 'bb_file',
           coalesce(s.content_id,'?') || '/' || coalesce(s.file_name,'?'), 'source_url',
           null, to_jsonb(s.url),
           format('%s: "%s" is only reachable through a session-scoped Blackboard URL, which stops working when the session ends, so it was not added to the file catalog. It needs a durable bbcswebdav link.',
                  s.course_id, coalesce(s.file_name, s.path, s.content_id)),
           jsonb_build_object('content_id', s.content_id, 'path', s.path, 'source', 'stage_files'))
      then v_raised := v_raised + 1; end if;
    end loop;

    -- 1. Known by URL. Only the label can have drifted; the file_name feeds bb_file_relpath and
    --    the Storage key, so it is noted, never rewritten under a stored object.
    update bb_files f
       set path  = coalesce(f.path, d.path),
           notes = case when f.file_name is distinct from d.file_name
                        then btrim(coalesce(f.notes || ' | ', '') ||
                             'blackboard name now "' || coalesce(d.file_name,'?') || '"')
                        else f.notes end
      from (select distinct on (bb_course_id, url) * from _bb_refs
             where url !~ '/sessions/' order by bb_course_id, url, file_name) d
     where f.bb_course_id = d.bb_course_id and f.source_url = d.url
       and f.superseded_by is null and f.classified_by is distinct from 'stack'
       and (f.path is null and d.path is not null
            or (f.file_name is distinct from d.file_name
                and position('blackboard name now "' || coalesce(d.file_name,'?') || '"' in coalesce(f.notes,'')) = 0));
    get diagnostics v_n = row_count;
    v_name_drift := v_n;

    select count(distinct f.id) into v_matched_url
      from bb_files f join _bb_refs d
        on f.bb_course_id = d.bb_course_id and f.source_url = d.url
     where d.url !~ '/sessions/';

    -- 2. Known by identity, URL moved (the instructor re-uploaded: same item, new rid).
    update bb_files f
       set source_url = d.url,
           run_id     = p_run_id,
           notes      = btrim(coalesce(f.notes || ' | ', '') ||
                        'source_url changed ' || to_char(d.captured_at, 'YYYY-MM-DD') ||
                        '; stored bytes may be stale')
      from (select distinct on (bb_course_id, content_id, file_name) * from _bb_refs
             where url !~ '/sessions/' order by bb_course_id, content_id, file_name, captured_at desc) d
     where f.bb_course_id = d.bb_course_id and f.content_id = d.content_id
       and f.file_name = d.file_name and f.source_url is distinct from d.url
       and f.superseded_by is null and f.classified_by is distinct from 'stack'
       and not exists (select 1 from bb_files g
                        where g.bb_course_id = d.bb_course_id and g.source_url = d.url and g.id <> f.id);
    get diagnostics v_n = row_count;
    v_url_updated := v_n;

    -- 3. Genuinely new. Bucket comes from the existing rule classifier; no bytes are fetched.
    with fresh as (
      select distinct on (d.bb_course_id, d.url) d.*
        from _bb_refs d
       where d.url !~ '/sessions/'
         and not exists (select 1 from bb_files f
                          where f.bb_course_id = d.bb_course_id and f.source_url = d.url)
         and not exists (select 1 from bb_files f
                          where f.bb_course_id = d.bb_course_id and f.content_id = d.content_id
                            and f.file_name = d.file_name)
       order by d.bb_course_id, d.url, d.captured_at desc
    )
    insert into bb_files (run_id, bb_course_id, course_id, content_id, path, file_name,
                          mime_type, source_url, bucket, classified_by, classification_confidence,
                          captured_at, notes)
    select p_run_id, f.bb_course_id, f.course_id, f.content_id, f.path,
           coalesce(f.file_name, 'untitled'), f.mime,
           f.url, classify_bb_file(f.path, coalesce(f.file_name,''), f.mime),
           'rule', 0.6, f.captured_at,
           'catalogued by the Phase 9 transform; bytes not downloaded'
      from fresh f
    on conflict (bb_course_id, source_url) do nothing;
    get diagnostics v_n = row_count;
    v_inserted := v_n;

    -- 4. Gone from Blackboard - but only the NEWEST crawl gets to say so. Replaying an older
    --    run would otherwise declare every file that crawler build could not see as missing.
    select not exists (
             select 1
               from sync_runs s
              where s.run_id is not null
                and s.run_id <> p_run_id
                and s.scope is distinct from 'unregistered'
                and (select max(b.captured_at) from bb_raw b where b.run_id = s.run_id)
                    > (select max(b.captured_at) from bb_raw b where b.run_id = p_run_id))
      into v_is_newest;

    if v_is_newest then
      -- One marker, once, forever - never a DELETE.
      update bb_files f
         set notes = btrim(coalesce(f.notes || ' | ', '') || 'missing_since_run=' || p_run_id::text)
       where f.superseded_by is null
         and f.classified_by is distinct from 'stack'
         and coalesce(f.notes, '') not like '%missing_since_run=%'
         and exists (select 1 from _bb_refs d where d.bb_course_id = f.bb_course_id)
         and not exists (select 1 from _bb_refs d
                          where d.bb_course_id = f.bb_course_id and d.url = f.source_url)
         and not exists (select 1 from _bb_refs d
                          where d.bb_course_id = f.bb_course_id and d.content_id = f.content_id
                            and d.file_name = f.file_name);
      get diagnostics v_n = row_count;
      v_missing := v_n;
    end if;

    select count(distinct f.id) into v_protected
      from bb_files f join _bb_refs d
        on f.bb_course_id = d.bb_course_id and f.source_url = d.url
     where f.classified_by = 'stack' or f.superseded_by is not null;

    v_counts := jsonb_build_object(
      'file_refs',            v_refs,
      'session_scoped_skipped', v_session,
      'matched_by_url',       v_matched_url,
      'name_notes_added',     v_name_drift,
      'source_url_updated',   v_url_updated,
      'inserted',             v_inserted,
      'marked_missing',       v_missing,
      'missing_skipped_older_run', not v_is_newest,
      'protected_rows_untouched', v_protected,
      'deleted',              0,
      'attention_raised',     v_raised);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'files', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','files','status',v_status,'counts',v_counts,'error',v_error);
end $$;

-- =============================================================================================
-- Correction of what the bug wrote, on 2026-09-10
-- =============================================================================================
-- 1. Strip the false marker from the 22 bb_files rows the 9/2 replay stamped. These files were
--    present in run 6b122650, folded minutes earlier, so the claim was untrue. Every other note
--    on those rows is left exactly as it was.
update bb_files
   set notes = nullif(btrim(regexp_replace(
                 notes,
                 '\s*\|?\s*missing_since_run=3e12fd89-1ac8-4ab1-bd2a-0dce984a90fc', '', 'g')), '')
 where notes like '%missing_since_run=3e12fd89-1ac8-4ab1-bd2a-0dce984a90fc%';

-- 2. Correct the run's own record. The stage row keeps its history but records the correction,
--    and the Activity line "22 file(s) are no longer in Blackboard" is recomputed away.
update sync_stage_runs
   set counts = counts || jsonb_build_object('marked_missing', 0,
                                             'missing_skipped_older_run', true,
                                             'corrected_by', 'migration 037')
 where stage = 'files'
   and sync_run_id in (select id from sync_runs
                        where run_id = '3e12fd89-1ac8-4ab1-bd2a-0dce984a90fc'
                          and scope is distinct from 'unregistered');

update sync_runs
   set summary = jsonb_set(summary, '{stages,files,marked_missing}', '0'::jsonb),
       notes   = btrim(coalesce(notes || ' | ', '') ||
                 'migration 037: the files stage of this run wrongly marked 22 files missing. This crawl is older than run 6b122650 and its crawler build reported only attached files, so the gone-from-Blackboard pass should not have run. Notes stripped, counts corrected, stage_files fixed.')
 where run_id = '3e12fd89-1ac8-4ab1-bd2a-0dce984a90fc'
   and scope is distinct from 'unregistered'
   and summary is not null;

update sync_runs
   set summary = jsonb_set(summary, '{changes}', sync_change_lines(summary->'stages'))
 where run_id = '3e12fd89-1ac8-4ab1-bd2a-0dce984a90fc'
   and scope is distinct from 'unregistered'
   and summary is not null;
