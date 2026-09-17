-- bb2dash :: 074_reading_file_links.sql
-- Phase 12b, item M-2 (docs/planning/80c_PHASE12B_page_pass.md: P-materials-2). Worker W-30.
--
-- THE PROBLEM
--   `resolveReadingRoute()` calls a reading "Off-platform" when no `bb_files` row points at it.
--   41 readings read "Off-platform"; only 21 of them are real textbook chapters. The other 20 are
--   GEO.103 readings that ARE on Blackboard - and two of them already have the harvested file
--   sitting in `bb_files`, because nothing has ever set `bb_files.reading_id` since the seed
--   migrations. The classifier puts a file in the `readings` bucket and stops there; no stage
--   binds it to the reading it is a copy of, so Materials tells Stack to go and find a file the
--   app is already holding.
--
-- THE FIX, two halves that share one rule
--   * `reading_match_tokens(text)` - the normaliser, immutable and shared so the link step, the
--     SQL test and anything later all mean the same thing by "the same title": lowercase, every
--     run of non-alphanumerics is a separator, tokens under 3 characters and a small stopword and
--     file-extension list are dropped, the result is sorted and deduplicated.
--   * `link_reading_files(p_sync_run_id)` - for every `readings`-bucket file with no `reading_id`,
--     score each reading of the same scheme course by token overlap. A reading is a CANDIDATE when
--     at least 2 of its tokens are in the file's name and they cover at least half of the
--     reading's own tokens. EXACTLY ONE candidate links. SEVERAL raise one `stack_must_confirm`
--     Inbox row against `reading_link/<file id>` and link nothing - guessing here would put the
--     wrong PDF under a reading, and Stack can settle it in one click. NONE does nothing: that
--     reading has no file, which is what `stage_gaps` already says.
--
-- WHY A CONSERVATIVE RULE. Measured against prod before applying, the rule produces exactly two
-- candidate pairs across the whole corpus, and both are right:
--     bb_files 67 "Roberts-The best way to reduce your personal carbon emissions..." -> readings 47
--     bb_files 69 "Robbins-Political-Economy-Cleaned-OCR.pdf"                        -> readings 48
-- It deliberately does NOT match the two GEO.103 reading-QUESTION documents (those are prep
-- worksheets, not the reading) or the two IST.352 chapter decks. A rule that reached further would
-- have to guess.
--
-- THE 18 THAT STAY OFF-PLATFORM. After this backfill, 18 GEO.103 readings marked `on_blackboard`
-- still have no file, and `bb_content` explains why rather than the link rule: the crawled content
-- tree for GEO.103.lecture is 37 nodes covering Weeks 1-5 only, and it names none of the 18. The
-- single exception is `readings` 45 (Institute of Physics), which has a node - `bb_content`
-- _12904333_1 - but it is `item_kind = 'link'` (`resource/x-bb-externallink`), so there is no file
-- to harvest. The textbook chapters (Murphy, Johnson, Goodell, Robbins) live behind the Orange
-- Instant Access ebook LTI placement (`bb_content` _12920094_1), not as Blackboard files. Nothing
-- this migration can do reaches them; a GEO.103 file pull (bb-sync step 4) is the next lever.
--
-- `stage_files` gains step 6 so every future fold runs the same rule on whatever the crawl brings.
-- The body below is 053's, verbatim, with that one step and its counter added; 053 stays frozen.

-- =============================================================================================
-- 1. The normaliser
-- =============================================================================================
create or replace function reading_match_tokens(p_text text) returns text[]
  language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array(
    select distinct t
      from unnest(string_to_array(
             regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g'), ' ')) t
     where length(t) >= 3
       and t <> all (array['the','and','for','with','from','that','this','its','are','was','were',
                           'not','but','you','your','our','all','how','who','what','when','where',
                           'why','vol','www','http','https','pdf','doc','docx','pptx','ppt','xls',
                           'xlsx','ultradocumentbody','cleaned','ocr'])
     order by t), array[]::text[]);
$$;

comment on function reading_match_tokens(text) is
  'Normalised significant-word tokens of a title or citation, sorted and deduplicated (Phase 12b '
  'M-2). Lowercase; every run of non-alphanumeric characters is a separator, so curly quotes, '
  'punctuation and accents split words; tokens under 3 characters, common English stopwords and '
  'file-extension / scan-artifact words are dropped. Immutable, so the link rule, its SQL test '
  'and anything downstream mean the same thing by "the same title".';

revoke all on function public.reading_match_tokens(text) from public, anon;
grant execute on function public.reading_match_tokens(text) to authenticated, service_role;

-- =============================================================================================
-- 2. The link step
-- =============================================================================================
create or replace function link_reading_files(p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_examined int := 0; v_linked int := 0; v_ambiguous int := 0; v_raised int := 0;
  f       record;
  v_ids   bigint[];
  v_cites text;
  v_cover numeric;
begin
  for f in
    select bf.id,
           bf.course_id,
           bf.file_name,
           coalesce((select c.parent_course_id from courses c where c.id = bf.course_id),
                    bf.course_id) as scheme_course_id,
           -- The file's title: name without its extension and without a " (2)" download marker.
           reading_match_tokens(
             regexp_replace(regexp_replace(bf.file_name, '\.[A-Za-z0-9]{1,5}$', ''),
                            '\s*\(\d+\)\s*$', '')) as toks
      from bb_files bf
     where bf.bucket = 'readings'
       and bf.reading_id is null
       and bf.superseded_by is null
     order by bf.id
  loop
    continue when cardinality(f.toks) = 0;
    v_examined := v_examined + 1;

    select array_agg(m.reading_id order by m.reading_id),
           string_agg(m.citation, ' / ' order by m.reading_id),
           max(round(m.hits::numeric / m.rtoks, 2))
      into v_ids, v_cites, v_cover
      from (select rd.id as reading_id,
                   rd.citation,
                   cardinality(array(select unnest(f.toks)
                                     intersect
                                     select unnest(reading_match_tokens(rd.citation)))) as hits,
                   cardinality(reading_match_tokens(rd.citation))                       as rtoks
              from readings rd
             where coalesce((select c.parent_course_id from courses c where c.id = rd.course_id),
                            rd.course_id) = f.scheme_course_id) m
     where m.rtoks > 0
       and m.hits >= 2
       and m.hits::numeric / m.rtoks >= 0.5;

    if v_ids is null then
      -- No candidate. The reading has no harvested file; stage_gaps already says so.
      null;
    elsif cardinality(v_ids) = 1 then
      update bb_files
         set reading_id      = v_ids[1],
             link_confidence = v_cover,
             notes           = btrim(coalesce(notes || ' | ', '') ||
                               'reading_id linked by link_reading_files, token coverage ' || v_cover::text)
       where id = f.id;
      v_linked := v_linked + 1;
    else
      -- Several readings fit equally well. Guessing would file the wrong PDF under a reading.
      v_ambiguous := v_ambiguous + 1;
      if raise_attention(p_sync_run_id, 'stack_must_confirm', f.course_id, 'bb_file',
           'reading_link/' || f.id::text, 'reading_id', null, to_jsonb(v_ids),
           format('%s: the file "%s" matches %s readings equally well (%s). Pick the one it belongs to, or say it is not a reading.',
                  f.course_id, f.file_name, cardinality(v_ids), v_cites),
           jsonb_build_object('source', 'link_reading_files', 'file_id', f.id,
                              'candidates', to_jsonb(v_ids), 'citations', v_cites))
      then v_raised := v_raised + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('files_examined', v_examined, 'linked', v_linked,
                            'ambiguous', v_ambiguous, 'attention_raised', v_raised);
end $fn$;

comment on function link_reading_files(bigint) is
  'Bind unlinked `readings`-bucket files to the reading they are a copy of (Phase 12b M-2). A '
  'reading is a candidate when at least 2 of its reading_match_tokens appear in the file name and '
  'they cover at least half of the reading''s tokens, within the same scheme course. Exactly one '
  'candidate sets bb_files.reading_id and records the coverage in link_confidence; several raise '
  'one stack_must_confirm Inbox row against reading_link/<file id> and link nothing; none does '
  'nothing. Never overwrites an existing reading_id and never touches a superseded row, so a '
  'replay writes no links and raises no new questions.';

revoke all on function public.link_reading_files(bigint) from public, anon, authenticated;
grant execute on function public.link_reading_files(bigint) to service_role;

-- =============================================================================================
-- 3. stage_files: 053's body, plus step 6
-- =============================================================================================
create or replace function stage_files(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_refs int := 0; v_session int := 0; v_matched_url int := 0; v_url_updated int := 0;
  v_inserted int := 0; v_name_drift int := 0; v_protected int := 0; v_missing int := 0;
  v_cleared int := 0; v_raised int := 0; v_n int;
  v_links jsonb := '{}'::jsonb;
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
      'attention_raised',     v_raised);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'files', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','files','status',v_status,'counts',v_counts,'error',v_error);
end $function$;

-- Privileges are preserved by `create or replace`; re-asserted to match 038 exactly.
revoke all on function public.stage_files(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_files(uuid,bigint) to service_role;

-- =============================================================================================
-- 4. The backfill: run the rule once, now, over everything already catalogued
-- =============================================================================================
do $$
declare v jsonb;
begin
  v := link_reading_files(null);
  raise notice '074 backfill: %', v;
  if (v->>'linked')::int <> 2 or (v->>'ambiguous')::int <> 0 then
    raise exception '074: the backfill was measured to link exactly 2 files and find no ambiguity, got %', v;
  end if;
end $$;
