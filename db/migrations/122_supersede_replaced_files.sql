-- bb2dash :: 122_supersede_replaced_files.sql
-- Phase 18 (brief 98, Contract row 122 and rule "Auto-supersession (122)"; task 9; R-63).
-- Worker W-48.
--
-- When an instructor re-uploads a document into the same Blackboard content item, the item's
-- file gets a new URL, stage_files catalogues it as a new row, and the old row stays current:
-- /materials and search then show both copies (the two chains 120 fixed by hand). This function
-- makes the rule automatic, for one crawl:
--
--   For a current bb_files row F (not classified_by 'stack', not bucket 'my_submissions') whose
--   content_id is in the crawl while its source_url is not:
--     * the item now carries exactly one file, whose current row G <> F:
--         F.superseded_by = G.id, and a note naming the run;
--     * the item carries several files: one stack_must_confirm question, nothing written.
--   For a current row F whose content item is gone from the crawl and whose source_url is gone
--   too, while the crawl shows a file of the same name under ANOTHER item of the course (a match
--   by file name alone): one stack_must_confirm question, nothing written.
--
-- Only the newest registered crawl writes or asks (037's guard, the same test stage_files uses):
-- an older run returns older_run = true and touches nothing. A question Stack has already closed
-- about the same candidate set is not asked again (086's settle pattern); applying his answer is
-- /inbox-apply's job. migration 124 calls this from stage_files before its missing pass.
--
-- Returns {examined, superseded, asked, older_run}.

create or replace function public.supersede_replaced_files(p_run_id uuid, p_sync_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_examined   int := 0;
  v_superseded int := 0;
  v_asked      int := 0;
  v_is_newest  boolean;
  v_settled    boolean;
  f            record;
begin
  if p_run_id is null then
    raise exception 'supersede_replaced_files: p_run_id is required';
  end if;

  -- 037's guard: newest across every crawl the owner registered, not only the folded ones.
  select not exists (
           select 1
             from agent_requests r
            where r.kind = 'sync'
              and r.run_id is not null
              and r.run_id <> p_run_id
              and (select max(b.captured_at) from bb_raw b where b.run_id = r.run_id)
                  > (select max(b.captured_at) from bb_raw b where b.run_id = p_run_id))
    into v_is_newest;

  if not v_is_newest then
    return jsonb_build_object('examined', 0, 'superseded', 0, 'asked', 0, 'older_run', true);
  end if;

  for f in
    with refs as (
      -- The crawl's file references, read exactly as stage_files reads them.
      select b.bb_course_id,
             ci->>'id'              as content_id,
             nullif(e->>'name', '') as file_name,
             bb_abs_url(e->>'url')  as url
        from bb_raw b,
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci,
             lateral jsonb_array_elements(bb_jarray(ci->'embeddedFiles')) e
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(e->>'url', '') <> ''
      union
      select b.bb_course_id,
             ci->>'id',
             nullif(coalesce(ci->'detail'->'file'->>'name', ci->>'title'), ''),
             bb_abs_url(ci->'detail'->'file'->>'url')
        from bb_raw b,
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(ci->'detail'->'file'->>'url', '') <> ''
    ),
    crawl as (
      select * from refs where url !~ '/sessions/'
    ),
    eligible as (
      select bf.*
        from bb_files bf
       where bf.superseded_by is null
         and bf.classified_by is distinct from 'stack'
         and bf.bucket <> 'my_submissions'
         and exists (select 1 from crawl c where c.bb_course_id = bf.bb_course_id)
         and not exists (select 1 from crawl c
                          where c.bb_course_id = bf.bb_course_id and c.url = bf.source_url)
    )
    -- Same item, new file(s).
    select 'item' as match_kind, el.id, el.course_id, el.file_name, el.content_id,
           (select count(distinct c.url) from crawl c
             where c.bb_course_id = el.bb_course_id and c.content_id = el.content_id) as n_urls,
           (select array_agg(distinct g.id order by g.id)
              from crawl c
              join bb_files g on g.bb_course_id = c.bb_course_id and g.source_url = c.url
             where c.bb_course_id = el.bb_course_id and c.content_id = el.content_id
               and g.superseded_by is null and g.id <> el.id) as candidates
      from eligible el
     where el.content_id is not null
       and exists (select 1 from crawl c
                    where c.bb_course_id = el.bb_course_id and c.content_id = el.content_id)
    union all
    -- Item gone, same file name under another item.
    select 'name', el.id, el.course_id, el.file_name, el.content_id,
           null::bigint,
           (select array_agg(distinct g.id order by g.id)
              from crawl c
              join bb_files g on g.bb_course_id = c.bb_course_id and g.source_url = c.url
             where c.bb_course_id = el.bb_course_id
               and c.file_name = el.file_name
               and c.content_id is distinct from el.content_id
               and g.superseded_by is null and g.id <> el.id)
      from eligible el
     where not exists (select 1 from crawl c
                        where c.bb_course_id = el.bb_course_id
                          and c.content_id is not distinct from el.content_id)
    order by 2
  loop
    continue when f.candidates is null;
    v_examined := v_examined + 1;

    if f.match_kind = 'item' and f.n_urls = 1 and cardinality(f.candidates) = 1 then
      update bb_files
         set superseded_by = f.candidates[1],
             notes = btrim(coalesce(notes || ' | ', '') ||
                     format('superseded by bb_file %s: content item %s carries only that file in crawl %s (supersede_replaced_files, 122)',
                            f.candidates[1], f.content_id, p_run_id))
       where id = f.id
         and superseded_by is null;
      if found then v_superseded := v_superseded + 1; end if;
      continue;
    end if;

    -- Several candidates, or a name-only match: ask once, write nothing.
    select exists (
             select 1
               from attention_items ai
              where ai.kind = 'stack_must_confirm'
                and ai.entity = 'bb_file'
                and ai.ref = 'supersede/' || f.id::text
                and ai.field = 'superseded_by'
                and ai.state in ('resolved', 'dismissed')
                and ai.to_value is not distinct from to_jsonb(f.candidates))
      into v_settled;
    continue when v_settled;

    if raise_attention(p_sync_run_id, 'stack_must_confirm', f.course_id, 'bb_file',
         'supersede/' || f.id::text, 'superseded_by', null, to_jsonb(f.candidates),
         case when f.match_kind = 'item'
              then format('%s: Blackboard item %s no longer carries "%s"; it now carries %s files. Which one replaces it, if any?',
                          f.course_id, f.content_id, f.file_name, f.n_urls)
              else format('%s: "%s" is gone from its Blackboard item, and a file of the same name now sits in another item. Is that the same document?',
                          f.course_id, f.file_name)
         end,
         jsonb_build_object('source', 'supersede_replaced_files', 'file_id', f.id,
                            'match', f.match_kind, 'run_id', p_run_id,
                            'candidates', to_jsonb(f.candidates),
                            'answer_with', '{"superseded_by": <one of candidates>} or {"accept": "none"}'))
    then
      v_asked := v_asked + 1;
    end if;
  end loop;

  return jsonb_build_object('examined', v_examined, 'superseded', v_superseded,
                            'asked', v_asked, 'older_run', false);
end
$function$;

revoke all on function public.supersede_replaced_files(uuid, bigint) from public, anon, authenticated;
grant execute on function public.supersede_replaced_files(uuid, bigint) to service_role;
