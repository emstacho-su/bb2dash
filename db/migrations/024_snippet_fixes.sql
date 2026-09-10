-- bb2dash :: 024_snippet_fixes.sql
-- Five defects that /code-review (high) found in 021's snippet logic, confirmed against prod.
-- Contract: docs/planning/50_PHASE7_retrieval_polish.md § "Round 2 — code-review fixes".
--
-- ARGUMENT LISTS AND RETURN TYPES ARE UNCHANGED, so `create or replace function` is enough here
-- — no drop, no PostgREST schema churn, no client change. Only two of the three entry points
-- move: hybrid_search_file_text (1-4) and search_file_text (5). match_file_text is untouched.
--
-- 1. THE SNIPPET PART MUST CONTAIN THE KEYWORD. 021 always cut the snippet from the best
--    (min-distance) VECTOR part, even for a row that reached the result set through the FTS arm.
--    When the query terms live in a different part, ts_headline finds nothing to highlight and
--    falls back to the head of that part — a passage that does not contain the words the user
--    typed. On prod, q='attendance policy' (limit 20) returned 10 fts_headline rows and 5 of
--    them failed `to_tsvector('english', snippet) @@ websearch_to_tsquery('english', q)`
--    (text 3 p5, 211 p2, 305 p4, 521 p11, 522 p7).
--    Now: for a via_fts row the snippet part is the LOWEST-part_no part whose slice satisfies
--    the tsquery; if no part does, ts_headline runs over the whole unit. `part_no` therefore
--    changes meaning from "the best vector part" to "the part the snippet was cut from", and is
--    null for the whole-unit fallback and for unembedded units. `similarity` is untouched — it
--    still comes from vec_best, which is what makes it comparable across rows.
--    `snippet_source` stays 'fts_headline' either way: the snippet is still a keyword headline.
--
-- 2. NO TORN LEADING WORD. Parts are cut on paragraph/sentence/newline/whitespace boundaries
--    where possible and hard-cut otherwise, and the ~200-char overlap is subtracted blindly, so
--    a part often opens mid-word. 462 of the 661 part>=2 slices in the corpus start on a
--    character whose predecessor is not whitespace. A snippet that opens with "xtreme cases"
--    reads as corruption. When a slice does not start at offset 0 and the character before it
--    is not whitespace, the leading partial token is dropped.
--
-- 3. SPEAKER NOTES STAY LABELLED. PPTX extraction marks speaker notes with a '[notes]' marker,
--    and both clients scrub/label everything after it. A snippet cut from a slice that begins
--    AFTER the marker loses that context and reads as slide body text. Such a snippet is now
--    prefixed with '[notes] ' so the clients' marker-based scrubbers still fire, and the
--    whole-unit fallback headline only ever runs over the text BEFORE the marker.
--    Latent today (no multi-part unit carries a marker) — fixed in the migration family that
--    introduced the slicing rather than left for the first unit that trips it.
--
-- 4. LIMIT BEFORE THE JOINS. 021 fused every candidate unit, joined bb_file_text and bb_files
--    to all of them, cut a slice for each, and only then applied `limit p_limit`. Ordering is
--    fully determined by (sc, text_id), both available inside `fused`, so the limit can move up
--    with identical results and the expensive per-row work runs p_limit times instead of once
--    per candidate. Prod, q='attendance policy', limit 10: 22.1 ms / 5,210 shared buffers before.
--
-- 5. search_file_text RETURNS PLAIN TEXT. Its ts_headline still used the default StartSel /
--    StopSel, so fts mode emitted literal <b> tags that the palette's Keyword mode rendered as
--    text. Same StartSel=""/StopSel="" treatment the hybrid snippet already gets. Its option
--    string is otherwise unchanged (MaxWords=30, MinWords=10 over the whole unit).

create or replace function search_file_text(q text,
                                            p_course text default null,
                                            p_limit int default 20,
                                            p_include_superseded boolean default false)
returns table (file_id bigint, text_id bigint, course_id text, bucket file_bucket,
               file_name text, unit_kind text, unit_no int, rank real, snippet text)
language sql stable as $$
  select f.id, t.id, f.course_id, f.bucket, f.file_name, t.unit_kind, t.unit_no,
         ts_rank(t.fts, websearch_to_tsquery('english', q)) as rank,
         ts_headline('english', t.text, websearch_to_tsquery('english', q),
                     'StartSel="", StopSel="", MaxWords=30, MinWords=10') as snippet
  from bb_file_text t
  join bb_files f on f.id = t.file_id
  where t.fts @@ websearch_to_tsquery('english', q)
    and (p_course is null or f.course_id = p_course)
    and (p_include_superseded or f.superseded_by is null)
  order by rank desc
  limit p_limit
$$;

comment on function search_file_text(text, text, int, boolean) is
  'Keyword-only retrieval over bb_file_text: ts_rank plus a PLAIN-TEXT ts_headline over the whole unit (no markup - StartSel/StopSel are emptied, 024). p_include_superseded=false (default) hides bb_files rows whose superseded_by is set.';

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
  -- `similarity`, and still the snippet part for a vector-arm hit; a keyword hit picks its own
  -- part below.
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
  --   keyword hit -> the lowest-numbered part whose slice actually satisfies the tsquery
  --                  (null when no part does -> whole-unit headline below)
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
      order by e.part_no
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
            -- keyword hit, cut from the part that carries the terms
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
  'Hybrid FTS + vector retrieval over bb_file_text, fused with RRF (k=50). snippet is the MATCHED PASSAGE in plain text. For a keyword hit it is a ts_headline over the lowest-numbered embedding part whose slice satisfies the tsquery, or over the whole unit when no part does (snippet_source=fts_headline either way); for a vector-only hit it is the head of the best part (vector_part); unit_head is a defensive fallback. part_no is THE PART THE SNIPPET WAS CUT FROM - null for the whole-unit headline and for unembedded units (024; it meant "best vector part" in 021). A slice that opens mid-word loses its torn leading token, and a slice that starts after a [notes] marker is prefixed "[notes] " so client scrubbers still fire. p_min_similarity gates the vector arm only (null disables; callers default to 0.78 - measured 2026-09-09: relevant 0.83-0.92, nonsense 0.75-0.77). p_include_superseded=false (default) drops bb_files rows whose superseded_by is set, before ranking, in both arms. similarity is real cosine from vec_best, independent of which part the snippet came from (null = unembedded); score is an RRF rank sum, ordering only.';
