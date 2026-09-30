-- bb2dash :: 160_supersede_new_candidates_only.sql
-- Phase 18 (brief 98; task 9, R-63; code-review HIGH, PM round 3). Worker W-48.
-- 122 is applied and frozen and 120-129 are full; the PM gives the fix this number (the 160-169
-- block, recorded in DECISIONS).
--
-- The flaw in 122: a current file F whose content item is still in the crawl but whose URL is
-- not was superseded by the item's one remaining file G even when G had sat beside F all along.
-- An item holding A.pdf and B.pdf whose instructor deletes B (and replaces nothing) would, on the
-- next fold, get B.superseded_by = A with no question: B leaves search and /materials, its note
-- says A replaced it, and 124's missing pass skips it because superseded rows are skipped.
--
-- The rule now: a candidate G replaces F only if G is NEW BESIDE F, i.e. no registered crawl in
-- bb_raw ever showed F's URL and G's URL in that same content item. bb_raw is what records it;
-- bb_files.run_id cannot (it names the fold that last touched a row, and the fold that first
-- saw a replacement may have run before this rule existed, as 162 did in crawl 6923d85d).
--   * exactly one file in the item, and it is new beside F      -> supersede, as before
--   * no new candidate (every candidate pre-existed)            -> nothing: no supersede, no
--                                                                  question; F falls through to
--                                                                  stage_files' missing marker
--   * several files in the item and at least one new candidate  -> one stack_must_confirm
--                                                                  question naming the new ones
--   * the name-only match across items                          -> one question, as before
-- Everything else is 122's live body unchanged; `create or replace` keeps its grants
-- (service_role, db_test_runner) and its pinned search_path.

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
  v_cands      bigint[];
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
    -- 160: every file reference of every registered crawl, to tell which URLs have ever sat
    -- together in one content item.
    seen as materialized (
      select b.run_id, b.bb_course_id, ci->>'id' as content_id, bb_abs_url(e->>'url') as url
        from bb_raw b,
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci,
             lateral jsonb_array_elements(bb_jarray(ci->'embeddedFiles')) e
       where b.kind = 'course'
         and b.run_id in (select r.run_id from agent_requests r
                           where r.kind = 'sync' and r.run_id is not null)
         and coalesce(e->>'url', '') <> ''
      union
      select b.run_id, b.bb_course_id, ci->>'id', bb_abs_url(ci->'detail'->'file'->>'url')
        from bb_raw b,
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci
       where b.kind = 'course'
         and b.run_id in (select r.run_id from agent_requests r
                           where r.kind = 'sync' and r.run_id is not null)
         and coalesce(ci->'detail'->'file'->>'url', '') <> ''
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
               and g.superseded_by is null and g.id <> el.id) as candidates,
           -- 160: the candidates that no registered crawl ever showed beside F in this item
           (select array_agg(distinct g.id order by g.id)
              from crawl c
              join bb_files g on g.bb_course_id = c.bb_course_id and g.source_url = c.url
             where c.bb_course_id = el.bb_course_id and c.content_id = el.content_id
               and g.superseded_by is null and g.id <> el.id
               and not exists (select 1
                                 from seen s1
                                 join seen s2 on s2.run_id = s1.run_id
                                             and s2.bb_course_id = s1.bb_course_id
                                             and s2.content_id = s1.content_id
                                where s1.bb_course_id = el.bb_course_id
                                  and s1.content_id = el.content_id
                                  and s1.url = el.source_url
                                  and s2.url = g.source_url)) as new_candidates
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
               and g.superseded_by is null and g.id <> el.id),
           null::bigint[]
      from eligible el
     where not exists (select 1 from crawl c
                        where c.bb_course_id = el.bb_course_id
                          and c.content_id is not distinct from el.content_id)
    order by 2
  loop
    continue when f.candidates is null;
    v_examined := v_examined + 1;

    -- 160: inside an item only a candidate that is new beside F can replace it. With none, F is
    -- not superseded and nothing is asked: stage_files' missing pass marks it instead.
    v_cands := case when f.match_kind = 'item' then f.new_candidates else f.candidates end;
    continue when v_cands is null;

    if f.match_kind = 'item' and f.n_urls = 1 and cardinality(v_cands) = 1 then
      update bb_files
         set superseded_by = v_cands[1],
             notes = btrim(coalesce(notes || ' | ', '') ||
                     format('superseded by bb_file %s: content item %s carries only that file in crawl %s, and no earlier crawl showed it beside this one (supersede_replaced_files, 160)',
                            v_cands[1], f.content_id, p_run_id))
       where id = f.id
         and superseded_by is null;
      if found then v_superseded := v_superseded + 1; end if;
      continue;
    end if;

    -- Several files in the item with at least one new, or a name-only match: ask once, write
    -- nothing.
    select exists (
             select 1
               from attention_items ai
              where ai.kind = 'stack_must_confirm'
                and ai.entity = 'bb_file'
                and ai.ref = 'supersede/' || f.id::text
                and ai.field = 'superseded_by'
                and ai.state in ('resolved', 'dismissed')
                and ai.to_value is not distinct from to_jsonb(v_cands))
      into v_settled;
    continue when v_settled;

    if raise_attention(p_sync_run_id, 'stack_must_confirm', f.course_id, 'bb_file',
         'supersede/' || f.id::text, 'superseded_by', null, to_jsonb(v_cands),
         case when f.match_kind = 'item'
              then format('%s: Blackboard item %s no longer carries "%s"; it now carries %s files. Which one replaces it, if any?',
                          f.course_id, f.content_id, f.file_name, f.n_urls)
              else format('%s: "%s" is gone from its Blackboard item, and a file of the same name now sits in another item. Is that the same document?',
                          f.course_id, f.file_name)
         end,
         jsonb_build_object('source', 'supersede_replaced_files', 'file_id', f.id,
                            'match', f.match_kind, 'run_id', p_run_id,
                            'candidates', to_jsonb(v_cands),
                            'answer_with', '{"superseded_by": <one of candidates>} or {"accept": "none"}'))
    then
      v_asked := v_asked + 1;
    end if;
  end loop;

  return jsonb_build_object('examined', v_examined, 'superseded', v_superseded,
                            'asked', v_asked, 'older_run', false);
end
$function$;
