-- bb2dash :: 010_search_layer.sql
-- Search layer over the harvested corpus, for the hub's retrieval needs.
-- Two tiers:
--   1. Full-text search (tsvector + GIN) on bb_file_text, bb_content, announcements.
--      Works today, no embedding pipeline required.
--   2. pgvector embeddings in bb_text_embeddings, one row per (text unit, model, part).
--      Kept OUT of bb_file_text so re-embedding with a different model never touches
--      extraction data, and long units can be split into parts without re-chunking text.
-- Dimension is 1024 (Voyage voyage-3.5 default). If a different model is chosen before
-- the first embedding run, alter the column + function argument in one migration —
-- cheap while the table is empty, a re-embed after that.

create extension if not exists vector with schema extensions;

-- ---- tier 1: full-text search ------------------------------------------------
alter table bb_file_text add column fts tsvector
  generated always as (to_tsvector('english', text)) stored;
create index bb_file_text_fts_idx on bb_file_text using gin (fts);

alter table bb_content add column fts tsvector
  generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) stored;
create index bb_content_fts_idx on bb_content using gin (fts);

alter table announcements add column fts tsvector
  generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) stored;
create index announcements_fts_idx on announcements using gin (fts);

-- Ranked keyword search over file text, with course/bucket context and a highlighted snippet.
create or replace function search_file_text(q text, p_course text default null, p_limit int default 20)
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
  order by rank desc
  limit p_limit
$$;

-- ---- tier 2: vector embeddings -----------------------------------------------
create table bb_text_embeddings (
  id           bigint generated always as identity primary key,
  text_id      bigint not null references bb_file_text(id) on delete cascade,
  part_no      integer not null default 1,   -- >1 when a long unit is split before embedding
  part_range   int4range,                    -- char offsets into bb_file_text.text when split
  model        text not null,                -- e.g. 'voyage-3.5'
  embedding    extensions.vector(1024) not null,
  embedded_at  timestamptz not null default now(),
  unique (text_id, model, part_no)
);
create index bb_text_embeddings_hnsw
  on bb_text_embeddings using hnsw (embedding extensions.vector_cosine_ops);
alter table bb_text_embeddings enable row level security;
create policy bb_text_embeddings_owner_all on bb_text_embeddings
  for all to authenticated using (true) with check (true);
-- Embedding job runs like extraction: publishable key, insert-only, no read-back.
create policy bb_text_embeddings_anon_insert on bb_text_embeddings
  for insert to anon with check (true);

-- Cosine-similarity retrieval for the hub / RAG path.
create or replace function match_file_text(query_embedding extensions.vector(1024), p_model text,
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

-- Coverage: how much of each course's text corpus has embeddings.
create view v_embedding_status as
select f.course_id,
       count(distinct t.id) as text_units,
       count(distinct e.text_id) as units_embedded,
       count(e.id) as embedding_rows,
       max(e.embedded_at) as last_embedded
from bb_file_text t
join bb_files f on f.id = t.file_id
left join bb_text_embeddings e on e.text_id = t.id
group by 1 order by 1;
