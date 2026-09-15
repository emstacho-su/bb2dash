-- bb2dash :: 043_stage_files_missing_marker.sql
-- Phase 9, round 2 (code-review finding F4). One `create or replace` of stage_files; 001-042 are
-- applied and byte-frozen.
--
-- ---------------------------------------------------------------------------------------------
-- F4. "Only the newest crawl may declare files missing" was measured against the wrong thing,
--     and the marker it writes could never be taken back
-- ---------------------------------------------------------------------------------------------
-- Migration 037 stopped an OLDER crawl declaring files gone, by checking that no other run with
-- a sync_runs row is newer than the one being folded. Two holes in that:
--
--   1. A crawl that has not been folded yet has NO sync_runs row. So with two crawls waiting -
--      which is exactly what 039's oldest-first fold order produces, and what happens whenever
--      two syncs land between ticks - the older one looks like the newest crawl in existence and
--      is allowed to stamp every file the newer crawl can see. The measure has to be "newest
--      among the crawls the owner registered": agent_requests.run_id joined to bb_raw's
--      max(captured_at). Registration is the same authority run_transform already uses, and a
--      registered crawl counts the moment its rows land, folded or not.
--
--   2. missing_since_run= is written once and never removed ("One marker, once, forever"). A
--      crawl truncated mid-walk - a dropped session, a closed tab, Blackboard rate-limiting the
--      contents endpoint - is still the newest crawl, so it stamps every file it never reached.
--      Nothing in the loop could ever take that back: the marker suppresses its own re-write
--      (`notes not like '%missing_since_run=%'`), so the file stays condemned in the catalog,
--      in the Activity line, and in the data_gap questions the Inbox raises about it.
--
--      A later crawl that finds the file is Blackboard contradicting the claim. The marker comes
--      off, and the appended note with it, counted as missing_cleared. Nothing else about the
--      row is touched, files classified by Stack and superseded rows are left alone as always,
--      and no file is ever deleted.
--
-- The 22 rows 037 corrected by hand needed a migration precisely because this pass did not
-- exist. Now it self-heals on the next crawl.

create or replace function stage_files(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_refs int := 0; v_session int := 0; v_matched_url int := 0; v_url_updated int := 0;
  v_inserted int := 0; v_name_drift int := 0; v_protected int := 0; v_missing int := 0;
  v_cleared int := 0; v_raised int := 0; v_n int;
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
    update bb_files f
       set notes = nullif(btrim(regexp_replace(regexp_replace(
                     f.notes,
                     '\s*\|?\s*missing_since_run=[0-9a-fA-F-]{36}', '', 'g'),
                     '^\s*\|\s*', '')), '')
     where f.notes like '%missing_since_run=%'
       and f.superseded_by is null
       and f.classified_by is distinct from 'stack'
       and (exists (select 1 from _bb_refs d
                     where d.bb_course_id = f.bb_course_id and d.url = f.source_url)
         or exists (select 1 from _bb_refs d
                     where d.bb_course_id = f.bb_course_id and d.content_id = f.content_id
                       and d.file_name = f.file_name));
    get diagnostics v_n = row_count;
    v_cleared := v_n;

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
      'missing_cleared',      v_cleared,
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

comment on function stage_files(uuid,bigint) is
  'Catalogues the files a crawl mentions - never their bytes. New (bb_course_id, source_url) '
  'rows are inserted through classify_bb_file(); a moved url updates the row and notes it; a '
  'file this crawl does not mention is marked missing_since_run only when this crawl is the '
  'newest one the owner registered; and a marked file that turns up again in a later crawl has '
  'the marker taken off (missing_cleared), because a truncated crawl must not condemn a live '
  'file forever. Rows with classified_by = stack or a superseded_by are never touched, and '
  'nothing is ever deleted.';

-- Privileges: unchanged by create or replace, restated for the same reason 038 gives - nothing
-- in the transform is callable from a browser.
revoke all on function public.stage_files(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_files(uuid,bigint) to service_role;
