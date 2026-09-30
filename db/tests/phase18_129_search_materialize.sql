-- bb2dash :: db/tests/phase18_129_search_materialize.sql
-- Phase 18 (brief 98), task 8 repair, migration 129. Worker W-48.
--   (m) both live search functions carry 129's MATERIALIZED CTEs
--   (r) their results are unchanged by 129: 121's bodies are re-created here as pg_temp
--       functions (copied verbatim from db/migrations/121_search_notes_label.sql, only the schema
--       and name changed) and compared row for row, in order, with the live functions on task 8's
--       two queries: hybrid (limit 12, probe = the stored gte-small embedding of text 277 part 1,
--       W10 B3's probe) and keyword (limit 20).
-- The comparison needs no fixed values, so it holds whatever the corpus holds. Writes nothing.
-- Collects failures, raises once. RUN IT: `node scripts/db-test.mjs --only phase18_129_search_materialize.sql`.

begin;

create function pg_temp.hybrid_121(
  q text,
  query_embedding extensions.vector,
  p_model text default 'gte-small',
  p_course text default null,
  p_limit integer default 10,
  rrf_k integer default 50,
  p_min_similarity double precision default null,
  p_include_superseded boolean default false)
returns table(file_id bigint, text_id bigint, course_id text, bucket file_bucket, file_name text,
              unit_kind text, unit_no integer, score double precision,
              similarity double precision, snippet text, part_no integer, snippet_source text)
language sql
stable
set search_path = public, pg_temp
as $function$
  with fts as (
    select t.id as tid,
           row_number() over (order by ts_rank(t.fts, websearch_to_tsquery('english', q)) desc,
                                       t.id) as rnk
    from bb_file_text t
    join bb_files f on f.id = t.file_id
    where t.fts @@ websearch_to_tsquery('english', q)
      and (p_course is null or f.course_id = p_course)
      and (p_include_superseded or f.superseded_by is null)
  ),
  -- Best (smallest-distance) part per unit, within scope. The single source of truth for
  -- `similarity`, the snippet part for a vector-arm hit, and the tiebreak for a keyword hit whose
  -- covering parts rank equally.
  vec_best as (
    select distinct on (e.text_id)
           e.text_id as tid,
           (e.embedding operator(extensions.<=>) query_embedding) as dist,
           e.part_no,
           e.part_range
    from bb_text_embeddings e
    join bb_file_text t on t.id = e.text_id
    join bb_files f on f.id = t.file_id
    where e.model = p_model
      and (p_course is null or f.course_id = p_course)
      and (p_include_superseded or f.superseded_by is null)
    order by e.text_id,
             (e.embedding operator(extensions.<=>) query_embedding) asc,
             e.part_no
  ),
  -- The vector arm's ranked list: only units that clear the floor take part in fusion.
  vec as (
    select v.tid, row_number() over (order by v.dist asc, v.tid) as rnk
    from vec_best v
    where p_min_similarity is null or (1 - v.dist) >= p_min_similarity
  ),
  -- Fuse, then cut to p_limit here (024 item 4).
  fused as (
    select coalesce(fts.tid, vec.tid) as tid,
           coalesce(1.0 / (rrf_k + fts.rnk), 0.0)
         + coalesce(1.0 / (rrf_k + vec.rnk), 0.0) as sc,
           (fts.tid is not null) as via_fts
    from fts
    full outer join vec on vec.tid = fts.tid
    order by sc desc, tid
    limit p_limit
  ),
  -- Resolve the unit, and choose the part the snippet will be cut from (row 41, unchanged):
  --   keyword hit -> among the parts whose slice satisfies the tsquery, the highest-ranking one
  --                  (ties: the vector-best part if it covers, else the lowest part_no);
  --                  null when no part covers -> whole-unit headline below
  --   vector hit  -> the best part, which is the one that earned the row its rank
  hit as (
    select f.id as file_id, t.id as text_id, f.course_id, f.bucket, f.file_name,
           t.unit_kind, t.unit_no, t.text,
           fused.sc, fused.via_fts, vb.dist,
           position('[notes]' in t.text) as notes_at,
           case when fused.via_fts then kw.part_no    else vb.part_no    end as snip_part_no,
           case when fused.via_fts then kw.part_range else vb.part_range end as snip_range
    from fused
    join bb_file_text t on t.id = fused.tid
    join bb_files f on f.id = t.file_id
    left join vec_best vb on vb.tid = fused.tid
    left join lateral (
      select e.part_no, e.part_range
      from bb_text_embeddings e
      where fused.via_fts
        and e.text_id = t.id
        and e.model = p_model
        and to_tsvector('english',
              substring(t.text from lower(e.part_range) + 1
                                for upper(e.part_range) - lower(e.part_range)))
            @@ websearch_to_tsquery('english', q)
      order by ts_rank(to_tsvector('english',
                         substring(t.text from lower(e.part_range) + 1
                                           for upper(e.part_range) - lower(e.part_range))),
                       websearch_to_tsquery('english', q)) desc,
               coalesce(e.part_no = vb.part_no, false) desc,
               e.part_no
      limit 1
    ) kw on true
  ),
  -- 0-based offsets: the slice is [lo, hi); the marker is [m0, m0 + 7). With no marker, m0 is
  -- past the end of the text, so the whole slice is pre side.
  bounds as (
    select h.*,
           lower(h.snip_range) as lo,
           upper(h.snip_range) as hi,
           case when h.notes_at > 0 then h.notes_at - 1 else char_length(h.text) end as m0,
           case when h.notes_at > 0 then h.notes_at + 6 else char_length(h.text) end as m1
    from hit h
  ),
  -- Split the slice (or, with no slice, the whole unit) at the marker.
  sides as (
    select b.*,
           case when b.snip_range is null then null
                when b.lo < b.m0 then substring(b.text from b.lo + 1 for least(b.hi, b.m0) - b.lo)
           end as pre_raw,
           case when b.snip_range is null or b.notes_at = 0 or b.hi <= b.m1 then null
                else ltrim(substring(b.text from greatest(b.lo, b.m1) + 1
                                            for b.hi - greatest(b.lo, b.m1)))
           end as post_raw,
           case when b.notes_at > 0 then left(b.text, b.notes_at - 1) else b.text end as unit_pre,
           case when b.notes_at > 0 then ltrim(substring(b.text from b.notes_at + 7)) end as unit_post
    from bounds b
  ),
  -- Which side is headlined. A keyword hit takes the side that covers the tsquery, the pre side
  -- on a tie; a vector hit takes the pre side. An empty side never wins over one with text.
  chosen as (
    select s.*,
           (s.post_raw is not null and btrim(s.post_raw) <> ''
            and (s.pre_raw is null or btrim(s.pre_raw) = ''
                 or (s.via_fts
                     and not (to_tsvector('english', s.pre_raw) @@ websearch_to_tsquery('english', q))
                     and to_tsvector('english', s.post_raw) @@ websearch_to_tsquery('english', q))))
             as slice_in_notes,
           (s.unit_post is not null and btrim(s.unit_post) <> ''
            and (btrim(s.unit_pre) = ''
                 or (not (to_tsvector('english', s.unit_pre) @@ websearch_to_tsquery('english', q))
                     and to_tsvector('english', s.unit_post) @@ websearch_to_tsquery('english', q))))
             as unit_in_notes
    from sides s
  ),
  sliced as (
    select c.*,
           case when c.snip_range is null then null
                when c.slice_in_notes then c.post_raw
                else c.pre_raw
           end as slice_raw,
           -- The pre side opens mid-word: it starts the slice, the slice does not start the unit,
           -- and the character immediately before it is not whitespace. The post side starts at
           -- the marker's end (or later, when the slice itself starts inside the notes).
           (c.snip_range is not null
            and c.lo > 0
            and (not c.slice_in_notes or c.lo >= c.m1)
            and substring(c.text from c.lo for 1) !~ '\s') as torn_start
    from chosen c
  ),
  passage as (
    select s.*,
           case when s.slice_raw is null then null
                when s.torn_start then regexp_replace(s.slice_raw, '^\S+\s+', '')
                else s.slice_raw
           end as slice
    from sliced s
  )
  select passage.file_id, passage.text_id, passage.course_id, passage.bucket, passage.file_name,
         passage.unit_kind, passage.unit_no,
         passage.sc::double precision as score,
         (1 - passage.dist)::double precision as similarity,
         (case
            -- keyword hit, cut from the best-ranking part that carries the terms
            when passage.via_fts and passage.slice is not null then
              (case when passage.slice_in_notes then '[notes] ' else '' end)
              || ts_headline('english', passage.slice, websearch_to_tsquery('english', q),
                             'StartSel="", StopSel="", MaxFragments=2, MaxWords=40, MinWords=12, FragmentDelimiter=" … "')
            -- keyword hit with no covering part (or no embedding): headline the unit, on one side
            -- of the speaker-note marker only
            when passage.via_fts then
              (case when passage.unit_in_notes then '[notes] ' else '' end)
              || ts_headline('english',
                             case when passage.unit_in_notes then passage.unit_post
                                  else passage.unit_pre end,
                             websearch_to_tsquery('english', q),
                             'StartSel="", StopSel="", MaxFragments=2, MaxWords=40, MinWords=12, FragmentDelimiter=" … "')
            -- vector-only hit: the head of its best part, on one side of the marker
            when passage.slice is not null then
              (case when passage.slice_in_notes then '[notes] ' else '' end)
              || left(passage.slice, 400)
            -- defensive; fusion cannot produce it
            else
              (case when passage.unit_in_notes then '[notes] ' else '' end)
              || left(case when passage.unit_in_notes then passage.unit_post
                           else passage.unit_pre end, 400)
          end)::text as snippet,
         passage.snip_part_no as part_no,
         (case when passage.via_fts then 'fts_headline'
               when passage.slice is not null then 'vector_part'
               else 'unit_head'
          end)::text as snippet_source
  from passage
  order by passage.sc desc, passage.text_id
  limit p_limit
$function$;

create function pg_temp.keyword_121(
  q text,
  p_course text default null,
  p_limit integer default 20,
  p_include_superseded boolean default false)
returns table(file_id bigint, text_id bigint, course_id text, bucket file_bucket, file_name text,
              unit_kind text, unit_no integer, rank real, snippet text)
language sql
stable
set search_path = public, pg_temp
as $function$
  with ranked as (
    select f.id as file_id, t.id as text_id, f.course_id, f.bucket, f.file_name,
           t.unit_kind, t.unit_no, t.text,
           ts_rank(t.fts, websearch_to_tsquery('english', q)) as rank,
           position('[notes]' in t.text) as notes_at
    from bb_file_text t
    join bb_files f on f.id = t.file_id
    where t.fts @@ websearch_to_tsquery('english', q)
      and (p_course is null or f.course_id = p_course)
      and (p_include_superseded or f.superseded_by is null)
    order by rank desc
    limit p_limit
  ),
  sides as (
    select r.*,
           case when r.notes_at > 0 then left(r.text, r.notes_at - 1) else r.text end as unit_pre,
           case when r.notes_at > 0 then ltrim(substring(r.text from r.notes_at + 7)) end as unit_post
    from ranked r
  ),
  -- The side that covers the tsquery is headlined; the pre side on a tie.
  chosen as (
    select s.*,
           (s.unit_post is not null and btrim(s.unit_post) <> ''
            and (btrim(s.unit_pre) = ''
                 or (not (to_tsvector('english', s.unit_pre) @@ websearch_to_tsquery('english', q))
                     and to_tsvector('english', s.unit_post) @@ websearch_to_tsquery('english', q))))
             as in_notes
    from sides s
  )
  select c.file_id, c.text_id, c.course_id, c.bucket, c.file_name, c.unit_kind, c.unit_no,
         c.rank,
         (case when c.in_notes then '[notes] ' else '' end)
         || ts_headline('english',
                        case when c.in_notes then c.unit_post else c.unit_pre end,
                        websearch_to_tsquery('english', q),
                        'StartSel="", StopSel="", MaxWords=30, MinWords=10') as snippet
  from chosen c
  order by c.rank desc
$function$;

do $$
declare
  QUERIES constant text[] := array['final exam date', 'attendance policy'];
  v_fail  text[] := array[]::text[];
  v_emb   extensions.vector;
  v_q     text;
  v_live  jsonb;
  v_ref   jsonb;
  v_bad   text;
begin
  -- (m)
  select string_agg(proname, ', ' order by proname) into v_bad
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('hybrid_search_file_text', 'search_file_text')
     and position('materialized' in prosrc) = 0;
  if v_bad is not null then
    v_fail := v_fail || format('(m) not materialized: %s', v_bad);
  end if;

  -- (r)
  select embedding into v_emb from bb_text_embeddings
   where text_id = 277 and part_no = 1 and model = 'gte-small';
  if v_emb is null then
    v_fail := v_fail || '(r) no probe embedding for text 277 part 1'::text;
  else
    foreach v_q in array QUERIES loop
      select jsonb_agg(to_jsonb(h) order by n) into v_live
        from public.hybrid_search_file_text(v_q, v_emb, 'gte-small', null, 12) with ordinality h(file_id, text_id, course_id, bucket, file_name, unit_kind, unit_no, score, similarity, snippet, part_no, snippet_source, n);
      select jsonb_agg(to_jsonb(h) order by n) into v_ref
        from pg_temp.hybrid_121(v_q, v_emb, 'gte-small', null, 12) with ordinality h(file_id, text_id, course_id, bucket, file_name, unit_kind, unit_no, score, similarity, snippet, part_no, snippet_source, n);
      if v_live is distinct from v_ref or v_live is null then
        v_fail := v_fail || format('(r) hybrid "%s" differs from 121 (%s vs %s rows)', v_q,
                                   jsonb_array_length(v_live), jsonb_array_length(v_ref));
      end if;

      select jsonb_agg(to_jsonb(k) order by n) into v_live
        from public.search_file_text(v_q, null, 20) with ordinality k(file_id, text_id, course_id, bucket, file_name, unit_kind, unit_no, rank, snippet, n);
      select jsonb_agg(to_jsonb(k) order by n) into v_ref
        from pg_temp.keyword_121(v_q, null, 20) with ordinality k(file_id, text_id, course_id, bucket, file_name, unit_kind, unit_no, rank, snippet, n);
      if v_live is distinct from v_ref or v_live is null then
        v_fail := v_fail || format('(r) keyword "%s" differs from 121 (%s vs %s rows)', v_q,
                                   jsonb_array_length(v_live), jsonb_array_length(v_ref));
      end if;
    end loop;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_129_search_materialize: PASS' as result;

rollback;
