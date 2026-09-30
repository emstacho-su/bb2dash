-- bb2dash :: 124_stage_files_rules.sql
-- Phase 18 (brief 98, Contract row 124; task 11; R-63, R-67). Worker W-48.
--
-- stage_files re-created from its live body (074, as pg_get_functiondef printed it on 2026-09-29)
-- with two steps added and nothing else changed:
--   * step 4b, before the missing pass: supersede_replaced_files (122). A file this crawl shows
--     was replaced in its own content item is superseded, so the missing pass (which skips
--     superseded rows) never calls it "gone from Blackboard".
--   * step 7, after link_reading_files: link_file_sessions (123), so every fold fills the week and
--     session of files it catalogued.
-- `counts` gains `superseded_auto` (122's result) and `session_links` (123's result), each the
-- callee's jsonb, as `reading_links` already is. Questions either step raised are added to
-- `attention_raised`.
-- Signature, SECURITY DEFINER, the pinned search_path and the grants (service_role only, 038)
-- are unchanged; `create or replace` keeps the ACL. stage_content is not touched (Phase 19's).

create or replace function public.stage_files(p_run_id uuid, p_sync_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_refs int := 0; v_session int := 0; v_matched_url int := 0; v_url_updated int := 0;
  v_inserted int := 0; v_name_drift int := 0; v_protected int := 0; v_missing int := 0;
  v_cleared int := 0; v_raised int := 0; v_n int;
  v_links jsonb := '{}'::jsonb;
  v_superseded jsonb := '{}'::jsonb;
  v_sessions jsonb := '{}'::jsonb;
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

    -- 4. Seen again. A marker is a claim about Blackboard, and Blackboard has just contradicted
    --    it: this crawl found the file. Whether the marker came from a truncated crawl, a
    --    crawler build that could not see embedded files, or the instructor genuinely removing
    --    and re-posting the file, the honest thing is to take it off. Without this the marker is
    --    one-way and a single bad crawl condemns a live file forever.
    --    Phase 10a: my_submissions is excluded here for the same reason it is excluded from the
    --    marking step below - this stage reads the content tree, never the attempts payload, so
    --    it has nothing to say about a submission file in either direction.
    update bb_files f
       set notes = nullif(btrim(regexp_replace(regexp_replace(
                     f.notes,
                     '\s*\|?\s*missing_since_run=[0-9a-fA-F-]{36}', '', 'g'),
                     '^\s*\|\s*', '')), '')
     where f.notes like '%missing_since_run=%'
       and f.superseded_by is null
       and f.classified_by is distinct from 'stack'
       and f.bucket <> 'my_submissions'
       and (exists (select 1 from _bb_refs d
                     where d.bb_course_id = f.bb_course_id and d.url = f.source_url)
         or exists (select 1 from _bb_refs d
                     where d.bb_course_id = f.bb_course_id and d.content_id = f.content_id
                       and d.file_name = f.file_name));
    get diagnostics v_n = row_count;
    v_cleared := v_n;

    -- 4b. Replaced in its own item (Phase 18, 122). Before the missing pass, so a re-uploaded
    --     file is superseded by its replacement instead of being called gone. The function
    --     applies 037's newest-crawl guard itself.
    v_superseded := supersede_replaced_files(p_run_id, p_sync_run_id);
    v_raised := v_raised + coalesce((v_superseded->>'asked')::int, 0);

    -- 5. Gone from Blackboard - but only the NEWEST crawl gets to say so. Replaying an older
    --    run would otherwise declare every file that crawler build could not see as missing.
    --    "Newest" is measured across every crawl the owner REGISTERED (agent_requests.run_id),
    --    not across the ones that already have a sync_runs row. A crawl that has not been folded
    --    yet has no sync_runs row, so the old test called the older of two pending crawls the
    --    newest and let it declare live files missing - which is how 037's 22 wrong notes
    --    happened, and 039's oldest-first fold order makes that the normal case, not the edge.
    select not exists (
             select 1
               from agent_requests r
              where r.kind = 'sync'
                and r.run_id is not null
                and r.run_id <> p_run_id
                and (select max(b.captured_at) from bb_raw b where b.run_id = r.run_id)
                    > (select max(b.captured_at) from bb_raw b where b.run_id = p_run_id))
      into v_is_newest;

    if v_is_newest then
      -- One marker while the file is gone - never a DELETE. Step 4 takes it off again if a
      -- later crawl finds the file, so this is a claim that can be withdrawn, not a life sentence.
      --
      -- Phase 10a (R2-3): my_submissions is NOT a claim this stage is entitled to make. A
      -- submission file's download URL lives in payload->'attempts', which this stage never
      -- reads, so it can never appear in _bb_refs and would be marked missing on the very fold
      -- that catalogued it - telling Stack the file he just submitted is "no longer in
      -- Blackboard". stage_attempts owns those rows; this stage owns the content tree.
      update bb_files f
         set notes = btrim(coalesce(f.notes || ' | ', '') || 'missing_since_run=' || p_run_id::text)
       where f.superseded_by is null
         and f.classified_by is distinct from 'stack'
         and f.bucket <> 'my_submissions'
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

    -- 6. Reading <-> file links (Phase 12b M-2). Whatever this fold catalogued in the `readings`
    --    bucket is offered to link_reading_files: exactly one matching reading links, several
    --    raise one Inbox row, none is left alone. It runs over every unlinked readings-bucket row,
    --    not only this run's, so a rule improvement picks up the backlog on the next fold; a row
    --    that is already linked is never revisited, which is what makes a replay write nothing.
    v_links := link_reading_files(p_sync_run_id);
    v_raised := v_raised + coalesce((v_links->>'attention_raised')::int, 0);

    -- 7. Week and session links (Phase 18, 123). After the reading links, because a reading's
    --    date is the strongest way to a session. Fills only null week_no / session_id.
    v_sessions := link_file_sessions(p_sync_run_id);
    v_raised := v_raised + coalesce((v_sessions->>'attention_raised')::int, 0);

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
      'missing_cleared',      v_cleared,
      'missing_skipped_older_run', not v_is_newest,
      'protected_rows_untouched', v_protected,
      'deleted',              0,
      'reading_links',        v_links,
      'superseded_auto',      v_superseded,
      'session_links',        v_sessions,
      'attention_raised',     v_raised);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'files', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','files','status',v_status,'counts',v_counts,'error',v_error);
end
$function$;
