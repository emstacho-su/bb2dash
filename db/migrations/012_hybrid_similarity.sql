-- bb2dash :: 012_hybrid_similarity.sql
-- A relevance floor and a real similarity column for hybrid_search_file_text().
--
-- RRF fuses RANKS, not distances, so it has no notion of "nothing is close enough": a query
-- about banana bread still has a nearest neighbour, and that neighbour comes back at rank 1
-- looking like an answer. The harness RAG hit exactly this and fixed it with a cosine floor on
-- the vector arm; this migration does the same here.
--
-- Measured 2026-09-09 against the live corpus (mode=vector, best-hit cosine, gte-small,
-- every stored part carries the "{course} {bucket} — {file}: " header, which compresses the
-- range upward):
--
--     relevant, 5 course-specific queries      0.830 .. 0.920
--     nonsense English (bread, bike, football) 0.753 .. 0.767
--     gibberish ("asdf qwerty zxcv")           0.818   <- attracted to a roster spreadsheet
--
-- Callers default to 0.78: above every real-English nonsense hit, below every relevant one.
-- Gibberish slips through; that is the known gap. The floor is a PARAMETER with default null
-- so the deployed `search` function keeps working unchanged until it is redeployed.
--
-- Two rules, both borrowed from the harness rag.search():
--   * the floor gates the VECTOR arm only. A unit that matched the query terms literally is
--     independent evidence and is still returned — with its real similarity, so the caller can
--     label it "keyword hit below the floor" rather than hide it.
--   * `similarity` is real cosine and is interpretable in absolute terms. `score` is a raw RRF
--     sum with ceiling 2/(k+1) ≈ 0.039 at k=50; it orders results and means nothing on its own.
--
-- The return type changes (new column), so the function is dropped and recreated rather than
-- replaced — `create or replace` cannot change a result signature.

drop function if exists hybrid_search_file_text(text, extensions.vector(384), text, text, int, int);

create function hybrid_search_file_text(q text,
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
  vec as (
    select v.tid, v.dist, row_number() over (order by v.dist asc, v.tid) as rnk
    from vec_best v
    where p_min_similarity is null or (1 - v.dist) >= p_min_similarity
  ),
  fused as (
    select coalesce(fts.tid, vec.tid) as tid,
           coalesce(1.0 / (rrf_k + fts.rnk), 0.0)
         + coalesce(1.0 / (rrf_k + vec.rnk), 0.0) as sc,
           vec.dist
    from fts
    full outer join vec on vec.tid = fts.tid
  )
  select f.id, t.id, f.course_id, f.bucket, f.file_name, t.unit_kind, t.unit_no,
         fused.sc::double precision as score,
         -- Real cosine for every returned unit. A unit that reached the result set through the
         -- full-text arm alone (below the floor, or unembedded) still gets its true similarity,
         -- computed here, so the caller can see and label it instead of guessing.
         coalesce(
           (1 - fused.dist),
           (select 1 - min(e2.embedding operator(extensions.<=>) query_embedding)
              from bb_text_embeddings e2
             where e2.text_id = t.id and e2.model = p_model)
         )::double precision as similarity,
         left(t.text, 300) as snippet
  from fused
  join bb_file_text t on t.id = fused.tid
  join bb_files f on f.id = t.file_id
  order by fused.sc desc, t.id
  limit p_limit
$$;

comment on function hybrid_search_file_text(text, extensions.vector(384), text, text, int, int, double precision) is
  'Hybrid FTS + vector retrieval over bb_file_text, fused with RRF (k=50). p_min_similarity gates the vector arm only (null disables; callers default to 0.78 — measured 2026-09-09: relevant 0.83-0.92, nonsense 0.75-0.77). similarity is real cosine for every row; score is an RRF rank sum, ordering only.';
