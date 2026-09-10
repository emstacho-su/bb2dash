-- bb2dash :: 025_snippet_part_rank.sql
-- Pick the most RELEVANT covering part for a keyword hit, not the lowest-numbered one.
--
-- ARGUMENT LIST AND RETURN TYPE ARE UNCHANGED, so `create or replace function` is enough — no
-- drop, no PostgREST churn, no client change. Only hybrid_search_file_text moves;
-- search_file_text and match_file_text are untouched by this migration.
--
-- 024 fixed the real defect (the snippet used to come from the best VECTOR part, which often did
-- not contain the query terms at all) but broke the tie among covering parts by part_no, which
-- is arbitrary. It cost a good answer: for q='final exam date' the IST.323 syllabus (text 521)
-- has three parts whose slice satisfies the tsquery —
--
--     part 16  ts_rank 0.6146   "... Scheduled Final Exam Day 12/15/26 ..."
--     part 12  ts_rank 0.1724   "...llabus. This document can be found on Blackboard..."
--     part  8  ts_rank 0.0088   "...t. You must disclose how, in a required appendix..."
--
-- and 024 returned part 8. ts_rank already knows which one answers the question, so use it:
--
--   1. highest ts_rank(to_tsvector('english', slice), websearch_to_tsquery('english', q))
--   2. tie -> the vector-best part, when that part is itself a covering part (it is the part
--      that earned the row its vector rank, so it is the better guess of the two)
--   3. still tied -> lowest part_no, so the choice stays deterministic
--
-- `coalesce(..., false)` on rule 2 matters: `e.part_no = vb.part_no` is NULL for an unembedded
-- or out-of-scope unit, and DESC sorts NULLs FIRST in Postgres, which would hand the tie to the
-- wrong row.
--
-- The whole-unit fallback is unchanged: when NO part covers the tsquery, ts_headline still runs
-- over the unit (over the text before a [notes] marker when there is one) and part_no is null.
-- Everything else 024 established — the torn-token trim, the '[notes] ' prefix, the early
-- `limit p_limit` inside `fused`, plain-text headlines — is carried through verbatim.
--
-- Cost: the lateral can no longer stop at the first covering part, because rule 1 needs a rank
-- for all of them. It now scans the unit's parts and sorts. Measured on prod, q='final exam
-- date', limit 12: 21.9 ms / 4,189 buffers before, see docs/planning/51_W10_VERIFICATION.md
-- appendix B for after. The real fix for this cost is a stored per-part tsvector, which is
-- deliberately NOT in this phase (backlog).

create or replace function hybrid_search_file_text(q text,
                                                   query_embedding extensions.vector(384),
                                                   p_model text default 'gte-small',
                                                   p_course text default null,
                                                   p_limit int default 10,
                                                   rrf_k int default 50,
                                                   p_min_similarity double precision default null,
                                                   p_include_superseded boolean default false)
returns table (file_id bigint, text_id bigint, course_id text, bucket file_bucket,
               file_name text, unit_kind text, unit_no int, score double precision,
               similarity double precision, snippet text,
               part_no int, snippet_source text)
language sql stable as $$
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
  -- Best (smallest-distance) part per unit, within scope. Still the single source of truth for
  -- `similarity`, still the snippet part for a vector-arm hit, and now also the tiebreak for a
  -- keyword hit whose covering parts rank equally.
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
  -- Fuse, then CUT TO p_limit HERE (024 item 4). The order is fully determined by (sc, tid),
  -- both available at this point, so everything below runs p_limit times instead of once per
  -- candidate unit.
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
  -- Resolve the unit, and choose the part the snippet will be cut from:
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
  sliced as (
    select h.*,
           case when h.snip_range is null then null
                else substring(h.text from lower(h.snip_range) + 1
                                      for upper(h.snip_range) - lower(h.snip_range))
           end as slice_raw,
           -- The slice opens mid-word: it does not start the unit and the character
           -- immediately before it is not whitespace.
           (h.snip_range is not null
            and lower(h.snip_range) > 0
            and substring(h.text from lower(h.snip_range) for 1) !~ '\s') as torn_start,
           -- The speaker-note marker opens before this slice, so the slice IS note text.
           (h.snip_range is not null
            and h.notes_at > 0
            and h.notes_at < lower(h.snip_range) + 1) as in_notes
    from hit h
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
              (case when passage.in_notes then '[notes] ' else '' end)
              || ts_headline('english', passage.slice, websearch_to_tsquery('english', q),
                             'StartSel="", StopSel="", MaxFragments=2, MaxWords=40, MinWords=12, FragmentDelimiter=" … "')
            -- keyword hit with no covering part (or no embedding): headline the unit, but never
            -- across the speaker-note marker
            when passage.via_fts then
              ts_headline('english',
                          case when passage.notes_at > 0 then left(passage.text, passage.notes_at - 1)
                               else passage.text end,
                          websearch_to_tsquery('english', q),
                          'StartSel="", StopSel="", MaxFragments=2, MaxWords=40, MinWords=12, FragmentDelimiter=" … "')
            -- vector-only hit: the head of its best part
            when passage.slice is not null then
              (case when passage.in_notes then '[notes] ' else '' end)
              || left(passage.slice, 400)
            -- defensive; fusion cannot produce it
            else left(passage.text, 400)
          end)::text as snippet,
         passage.snip_part_no as part_no,
         (case when passage.via_fts then 'fts_headline'
               when passage.slice is not null then 'vector_part'
               else 'unit_head'
          end)::text as snippet_source
  from passage
  order by passage.sc desc, passage.text_id
  limit p_limit
$$;

comment on function hybrid_search_file_text(text, extensions.vector(384), text, text, int, int, double precision, boolean) is
  'Hybrid FTS + vector retrieval over bb_file_text, fused with RRF (k=50). snippet is the MATCHED PASSAGE in plain text. For a keyword hit it is a ts_headline over the HIGHEST-RANKING embedding part whose slice satisfies the tsquery (ties: the vector-best part if it covers, else the lowest part_no - 025; 024 always took the lowest), or over the whole unit when no part covers (snippet_source=fts_headline either way); for a vector-only hit it is the head of the best part (vector_part); unit_head is a defensive fallback. part_no is THE PART THE SNIPPET WAS CUT FROM - null for the whole-unit headline and for unembedded units. A slice that opens mid-word loses its torn leading token, and a slice that starts after a [notes] marker is prefixed "[notes] " so client scrubbers still fire. p_min_similarity gates the vector arm only (null disables; callers default to 0.78 - measured 2026-09-09: relevant 0.83-0.92, nonsense 0.75-0.77). p_include_superseded=false (default) drops bb_files rows whose superseded_by is set, before ranking, in both arms. similarity is real cosine from vec_best, independent of which part the snippet came from (null = unembedded); score is an RRF rank sum, ordering only.';
