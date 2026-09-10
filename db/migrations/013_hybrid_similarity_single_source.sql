-- bb2dash :: 013_hybrid_similarity_single_source.sql
-- Cleanup of 012, same signature and result type, so `create or replace` is enough.
--
-- 012 computed `similarity` two ways: from the floored `vec` list for vector-arm rows, and from
-- a correlated subquery re-running min(embedding <=> query) for rows that reached the result set
-- through full-text search alone. Both must agree on p_model, the operator and the per-part
-- min() semantics, and a later change to one would silently drift the other — which is exactly
-- the value the MCP client labels as "below the floor". `vec_best` already holds that minimum
-- for every embedded unit in scope (the floor is applied one CTE later, in `vec`), so the final
-- select just left-joins it. One definition. `similarity` is null only when the unit has no
-- embedding at all.

create or replace function hybrid_search_file_text(q text,
                                                   query_embedding extensions.vector(384),
                                                   p_model text default 'gte-small',
                                                   p_course text default null,
                                                   p_limit int default 10,
                                                   rrf_k int default 50,
                                                   p_min_similarity double precision default null)
returns table (file_id bigint, text_id bigint, course_id text, bucket file_bucket,
               file_name text, unit_kind text, unit_no int, score double precision,
               similarity double precision, snippet text)
language sql stable as $$
  with fts as (
    select t.id as tid,
           row_number() over (order by ts_rank(t.fts, websearch_to_tsquery('english', q)) desc,
                                       t.id) as rnk
    from bb_file_text t
    join bb_files f on f.id = t.file_id
    where t.fts @@ websearch_to_tsquery('english', q)
      and (p_course is null or f.course_id = p_course)
  ),
  -- Best (smallest-distance) part per unit, within course scope. The single source of
  -- truth for a unit's similarity, floored or not.
  vec_best as (
    select e.text_id as tid,
           min(e.embedding operator(extensions.<=>) query_embedding) as dist
    from bb_text_embeddings e
    join bb_file_text t on t.id = e.text_id
    join bb_files f on f.id = t.file_id
    where e.model = p_model
      and (p_course is null or f.course_id = p_course)
    group by e.text_id
  ),
  -- The vector arm's ranked list: only units that clear the floor take part in fusion.
  vec as (
    select v.tid, row_number() over (order by v.dist asc, v.tid) as rnk
    from vec_best v
    where p_min_similarity is null or (1 - v.dist) >= p_min_similarity
  ),
  fused as (
    select coalesce(fts.tid, vec.tid) as tid,
           coalesce(1.0 / (rrf_k + fts.rnk), 0.0)
         + coalesce(1.0 / (rrf_k + vec.rnk), 0.0) as sc
    from fts
    full outer join vec on vec.tid = fts.tid
  )
  select f.id, t.id, f.course_id, f.bucket, f.file_name, t.unit_kind, t.unit_no,
         fused.sc::double precision as score,
         (1 - vb.dist)::double precision as similarity,
         left(t.text, 300) as snippet
  from fused
  join bb_file_text t on t.id = fused.tid
  join bb_files f on f.id = t.file_id
  left join vec_best vb on vb.tid = fused.tid
  order by fused.sc desc, t.id
  limit p_limit
$$;

comment on function hybrid_search_file_text(text, extensions.vector(384), text, text, int, int, double precision) is
  'Hybrid FTS + vector retrieval over bb_file_text, fused with RRF (k=50). p_min_similarity gates the vector arm only (null disables; callers default to 0.78 — measured 2026-09-09: relevant 0.83-0.92, nonsense 0.75-0.77). similarity is real cosine from vec_best for every embedded row (null = unembedded); score is an RRF rank sum, ordering only.';
