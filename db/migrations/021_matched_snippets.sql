-- bb2dash :: 021_matched_snippets.sql
-- Matched-passage snippets, and a superseded-file filter, for the three search entry points.
--
-- Problem 1 (snippets). hybrid_search_file_text() has always returned `left(t.text, 300)` — the
-- HEAD of the retrieval unit. For the 16-part, 16k-char IST.323 syllabus that head is the
-- instructor's phone number, whatever the query was. Every bb_text_embeddings row already
-- carries `part_range`, the char offsets of the slice that was embedded, and the function
-- already computes which part is the best (smallest-distance) one; both were thrown away at the
-- last step. This migration keeps them and builds the snippet from the passage that matched:
--
--   * unit reached by the FTS arm (with or without a vector rank)
--       -> ts_headline over the best part's slice (whole unit when the unit is unembedded)
--       -> snippet_source = 'fts_headline'
--   * unit reached by the vector arm only
--       -> the head of the best part's slice          -> snippet_source = 'vector_part'
--   * neither, or an embedded unit with no part_range (defensive; neither occurs today)
--       -> the head of the unit                       -> snippet_source = 'unit_head'
--
-- ts_headline runs with StartSel and StopSel emptied, so the snippet is PLAIN TEXT with no
-- markup. Highlighting is a client concern, and both clients (the cmd-K palette and the MCP
-- server) render into contexts that would have to escape the markup again anyway.
--
-- part_range is a 0-based half-open range of CHARACTERS into bb_file_text.text and does NOT
-- cover the "{course} {bucket} — {file}: " context header that embed-corpus prefixes before
-- inference (supabase/functions/embed-corpus/index.ts), so the slice is exactly
--     substring(text from lower(part_range) + 1 for upper(part_range) - lower(part_range))
--
-- Problem 2 (near-duplicates). 018 added bb_files.superseded_by and v_bb_files_current, but no
-- search path ever read them, so four versions of the IST.466 schedule crowded the top ranks of
-- unrelated queries. All three entry points gain `p_include_superseded boolean default false`.
-- When false, superseded rows are dropped BEFORE ranking in both arms, so they do not consume
-- rank positions either. False is the default because one current document is the safe answer;
-- the flag exists for deliberate "what did the old version say" queries. 022 seeds the data.
--
-- Both the return type (two new columns) and the argument lists change, so each function is
-- dropped by full signature and recreated. `create or replace` can do neither: it cannot change
-- a result signature, and adding a defaulted argument through it would leave the OLD overload
-- in place, giving PostgREST two candidates to choose between.

-- ---- tier 1: full-text search -------------------------------------------------------------
-- Filter only. The fts-mode snippet keeps its own ts_headline over the whole unit (and its
-- default <b> markup): the matched-passage contract covers hybrid mode, which is the default.
drop function if exists search_file_text(text, text, int);

create function search_file_text(q text,
                                 p_course text default null,
                                 p_limit int default 20,
                                 p_include_superseded boolean default false)
returns table (file_id bigint, text_id bigint, course_id text, bucket file_bucket,
               file_name text, unit_kind text, unit_no int, rank real, snippet text)
language sql stable as $$
  select f.id, t.id, f.course_id, f.bucket, f.file_name, t.unit_kind, t.unit_no,
         ts_rank(t.fts, websearch_to_tsquery('english', q)) as rank,
         ts_headline('english', t.text, websearch_to_tsquery('english', q),
                     'MaxWords=30, MinWords=10') as snippet
  from bb_file_text t
  join bb_files f on f.id = t.file_id
  where t.fts @@ websearch_to_tsquery('english', q)
    and (p_course is null or f.course_id = p_course)
    and (p_include_superseded or f.superseded_by is null)
  order by rank desc
  limit p_limit
$$;

comment on function search_file_text(text, text, int, boolean) is
  'Keyword-only retrieval over bb_file_text (ts_rank, ts_headline over the whole unit with the default <b> markup). p_include_superseded=false (default) hides bb_files rows whose superseded_by is set.';

-- ---- tier 2: vector retrieval -------------------------------------------------------------
-- Filter only; this one returns one row per embedding PART and the caller collapses to units.
drop function if exists match_file_text(extensions.vector(384), text, text, int);

create function match_file_text(query_embedding extensions.vector(384),
                                p_model text,
                                p_course text default null,
                                p_limit int default 10,
                                p_include_superseded boolean default false)
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
    and (p_include_superseded or f.superseded_by is null)
  order by e.embedding operator(extensions.<=>) query_embedding
  limit p_limit
$$;

comment on function match_file_text(extensions.vector(384), text, text, int, boolean) is
  'Cosine retrieval over bb_text_embeddings; one row per embedding PART, ordered by distance, carrying the unit''s full text. p_include_superseded=false (default) hides bb_files rows whose superseded_by is set.';

-- ---- hybrid retrieval: RRF over keyword + vector, matched-passage snippet ------------------
drop function if exists hybrid_search_file_text(text, extensions.vector(384), text, text, int, int, double precision);

create function hybrid_search_file_text(q text,
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
  -- Best (smallest-distance) part per unit, within scope: the single source of truth for a
  -- unit's similarity, floored or not. `distinct on` replaces 013's min()/group by because the
  -- snippet needs the winning part's identity (part_no) and extent (part_range), not just its
  -- distance. part_no breaks distance ties so the choice is deterministic.
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
  fused as (
    select coalesce(fts.tid, vec.tid) as tid,
           coalesce(1.0 / (rrf_k + fts.rnk), 0.0)
         + coalesce(1.0 / (rrf_k + vec.rnk), 0.0) as sc,
           (fts.tid is not null) as via_fts
    from fts
    full outer join vec on vec.tid = fts.tid
  ),
  -- One row per fused unit, carrying everything the snippet decision needs. The slice is cut
  -- once here instead of three times inside the CASE below.
  hit as (
    select f.id as file_id, t.id as text_id, f.course_id, f.bucket, f.file_name,
           t.unit_kind, t.unit_no, t.text,
           fused.sc, fused.via_fts,
           vb.dist, vb.part_no,
           case when vb.part_range is null then null
                else substring(t.text
                               from lower(vb.part_range) + 1
                               for  upper(vb.part_range) - lower(vb.part_range))
           end as part_slice
    from fused
    join bb_file_text t on t.id = fused.tid
    join bb_files f on f.id = t.file_id
    left join vec_best vb on vb.tid = fused.tid
  )
  select hit.file_id, hit.text_id, hit.course_id, hit.bucket, hit.file_name,
         hit.unit_kind, hit.unit_no,
         hit.sc::double precision as score,
         (1 - hit.dist)::double precision as similarity,
         (case
            when hit.via_fts then
              ts_headline('english', coalesce(hit.part_slice, hit.text),
                          websearch_to_tsquery('english', q),
                          'StartSel="", StopSel="", MaxFragments=2, MaxWords=40, MinWords=12, FragmentDelimiter=" … "')
            when hit.part_slice is not null then left(hit.part_slice, 400)
            else left(hit.text, 400)
          end)::text as snippet,
         hit.part_no,
         (case when hit.via_fts then 'fts_headline'
               when hit.part_slice is not null then 'vector_part'
               else 'unit_head'
          end)::text as snippet_source
  from hit
  order by hit.sc desc, hit.text_id
  limit p_limit
$$;

comment on function hybrid_search_file_text(text, extensions.vector(384), text, text, int, int, double precision, boolean) is
  'Hybrid FTS + vector retrieval over bb_file_text, fused with RRF (k=50). snippet is the MATCHED PASSAGE in plain text: ts_headline over the best embedding part''s slice for FTS-arm hits (snippet_source=fts_headline), the head of that slice for vector-only hits (vector_part), the head of the unit as a defensive fallback (unit_head). part_no is the best part''s number, null when the unit has no embedding. p_min_similarity gates the vector arm only (null disables; callers default to 0.78 — measured 2026-09-09: relevant 0.83-0.92, nonsense 0.75-0.77). p_include_superseded=false (default) drops bb_files rows whose superseded_by is set, before ranking, in both arms. similarity is real cosine from vec_best (null = unembedded); score is an RRF rank sum, ordering only.';
