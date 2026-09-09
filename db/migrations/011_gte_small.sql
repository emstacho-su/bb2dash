-- bb2dash :: 011_gte_small.sql
-- Resize the embedding tier from vector(1024) (sized for the Voyage path we did not take)
-- to vector(384), the dimension of `gte-small` — the MIT-licensed model bundled in the
-- Supabase Edge Runtime (`Supabase.ai.Session('gte-small')`). No API key, no cost, and the
-- same code path embeds both the corpus and the user's query at search time.
--
-- bb_text_embeddings is EMPTY at this point, so the resize is free: no re-embed, no data
-- rewrite. 010 anticipated exactly this ("alter the column + function argument in one
-- migration — cheap while the table is empty").
--
-- Also adds hybrid_search_file_text(): one entry point for the hub that fuses the keyword
-- ranking (tier 1) and the vector ranking (tier 2) with Reciprocal Rank Fusion. RRF needs no
-- score normalisation between the two very different scales (ts_rank vs cosine distance) —
-- it only reads positions — and it degrades gracefully: with the embedding table still empty
-- the vector list is empty and the function returns pure FTS ordering.

-- ---- resize the embedding column ---------------------------------------------
-- The HNSW index and match_file_text() both pin the old dimension, so they come down first
-- and go back up afterwards. match_file_text is dropped by signature, not replaced, because
-- changing an argument type is not something `create or replace function` can do.
drop index if exists bb_text_embeddings_hnsw;

drop function if exists match_file_text(extensions.vector(1024), text, text, int);

alter table bb_text_embeddings
  alter column embedding type extensions.vector(384)
  using embedding::extensions.vector(384);

-- ---- tier 2 retrieval, unchanged except for the dimension --------------------
create or replace function match_file_text(query_embedding extensions.vector(384), p_model text,
                                           p_course text default null, p_limit int default 10)
returns table (file_id bigint, text_id bigint, part_no int, course_id text, bucket file_bucket,
               file_name text, unit_kind text, unit_no int, similarity double precision, text text)
language sql stable as $$
  select f.id, t.id, e.part_no, f.course_id, f.bucket, f.file_name, t.unit_kind, t.unit_no,
         1 - (e.embedding operator(extensions.<=>) query_embedding) as similarity,
         t.text
  from bb_text_embeddings e
  join bb_file_text t on t.id = e.text_id
  join bb_files f on f.id = t.file_id
  where e.model = p_model
    and (p_course is null or f.course_id = p_course)
  order by e.embedding operator(extensions.<=>) query_embedding
  limit p_limit
$$;

create index bb_text_embeddings_hnsw
  on bb_text_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- ---- hybrid retrieval: RRF over keyword + vector -----------------------------
-- Two independent rankings of the same unit of retrieval (a bb_file_text row):
--   fts  — websearch_to_tsquery over the generated tsvector, ordered by ts_rank desc.
--   vec  — cosine distance to query_embedding; a unit split into several embedding parts is
--          represented by its best (smallest-distance) part, so long syllabi are not
--          penalised or duplicated by chunking.
-- Fusion is a full outer join: a unit found by only one retriever still scores, it just
-- collects a single 1/(k+rank) term instead of two. rrf_k (default 50) damps the top of each
-- list so one retriever's #1 cannot dominate a unit that both retrievers rank highly.
create or replace function hybrid_search_file_text(q text,
                                                   query_embedding extensions.vector(384),
                                                   p_model text default 'gte-small',
                                                   p_course text default null,
                                                   p_limit int default 10,
                                                   rrf_k int default 50)
returns table (file_id bigint, text_id bigint, course_id text, bucket file_bucket,
               file_name text, unit_kind text, unit_no int, score double precision, snippet text)
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
    select v.tid, row_number() over (order by v.dist asc, v.tid) as rnk
    from vec_best v
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
         left(t.text, 300) as snippet
  from fused
  join bb_file_text t on t.id = fused.tid
  join bb_files f on f.id = t.file_id
  order by fused.sc desc, t.id
  limit p_limit
$$;
