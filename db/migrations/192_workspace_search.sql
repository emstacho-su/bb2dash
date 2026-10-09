-- bb2dash :: db/migrations/192_workspace_search.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 15, and the
-- pgvector store scoped to bb2dash (answer 17, points 2 and 3). Worker W-76.
--
-- WHY. One search over three kinds of content, with the kind on every hit: `material` (course
-- files: bb_file_text and bb_text_embeddings), `upload` and `memory` (workspace_documents,
-- workspace_document_text and workspace_text_embeddings, from 190). The runner never searches
-- itself; the batch child of the materials package does, through the edge function
-- `workspace-search`, which calls `workspace_search` with the service key.
--
-- WHAT
--   1. hybrid_search_workspace_text   the twin of hybrid_search_file_text over the new tables
--   2. workspace_search               the one search: the course arm once for each course in scope,
--                                     the twin, merged by kind
--   3. workspace_attachment_read      an attached file's units in order, cut on the server
--   4. privileges, then a guard block
--
-- THE TWIN RANKS EXACTLY AS hybrid_search_file_text DOES (129:46-61; Stack's answer "a" to item 23
-- of 109a): every part in scope is measured with the cosine operator and the BEST PART OF EACH UNIT
-- is kept, a keyword arm ranks the units by ts_rank, and the two lists are fused by reciprocal rank
-- (k = 50). So a similarity means the same thing in all three kinds. THE HNSW INDEX IS NOT USED BY
-- THIS SEARCH, on purpose: it compares against every vector in scope, like the course search, which
-- Phase 18 timed and pinned. Moving both onto the index later is a change to two function bodies in
-- a new migration; no table, column, index or caller changes. The operator is written
-- `operator(extensions.<=>)`, the one both indexes are built for, so that move needs no schema work.
--
-- A RE-EMBED IS ROWS, NOT SCHEMA: `p_model` (default 'gte-small', as 129:20) is handed to both arms,
-- so only vectors of that model are ranked and two models can stand side by side while the corpus
-- is written again.
--
-- WHO MAY CALL. All three are SECURITY INVOKER and granted to `service_role` only (and to the test
-- login `db_test_runner`, as 100 grants it the other search functions). The browser has no right on
-- workspace_text_embeddings, so an invoker call from it would fail anyway; it is refused at the
-- function: `authenticated` and anon get 42501. The page never searches.
--
-- A document in state `deleting` or `failed` is never returned. With a course scope, course
-- materials and course-tagged uploads are filtered; untagged uploads and every remembered item are
-- always searched.
--
-- Additive only: three new functions. No password, key or DSN is in this file.

do $$
begin
  if to_regclass('public.workspace_text_embeddings') is null then
    raise exception '192: table workspace_text_embeddings does not exist; apply 190_workspace_store first';
  end if;
  if to_regprocedure('public.hybrid_search_file_text(text, extensions.vector, text, text, integer, integer, double precision, boolean)') is null then
    raise exception '192: hybrid_search_file_text does not exist; apply 129_search_notes_label_materialize first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '192: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1. hybrid_search_workspace_text
-- =============================================================================================
create or replace function public.hybrid_search_workspace_text(
  q text,
  query_embedding extensions.vector,
  p_model text default 'gte-small',
  p_kinds text[] default array['upload', 'memory'],
  p_courses text[] default null,
  p_limit integer default 10,
  rrf_k integer default 50,
  p_min_similarity double precision default null)
returns table(kind text, document_id bigint, text_id bigint, course_id text, title text,
              unit_kind text, unit_no integer, score double precision,
              similarity double precision, passage text, part_no integer)
language sql
stable
set search_path = public, pg_temp
as $function$
  -- The documents in scope: never one being deleted or one that failed.
  with eligible as materialized (
    select d.id, d.kind, d.course_id, d.title
    from workspace_documents d
    where d.state not in ('deleting', 'failed')
      and d.kind = any (coalesce(p_kinds, array['upload', 'memory']))
      and (p_courses is null or d.kind = 'memory' or d.course_id is null
           or d.course_id = any (p_courses))
  ),
  fts as (
    select t.id as tid,
           row_number() over (order by ts_rank(t.fts, websearch_to_tsquery('english', q)) desc,
                                       t.id) as rnk
    from workspace_document_text t
    join eligible e on e.id = t.document_id
    where t.fts @@ websearch_to_tsquery('english', q)
  ),
  -- Best (smallest-distance) part per unit, within scope and model: the single source of
  -- `similarity`, of the passage for a vector-arm hit, and the tiebreak for a keyword hit.
  vec_best as (
    select distinct on (v.text_id)
           v.text_id as tid,
           (v.embedding operator(extensions.<=>) query_embedding) as dist,
           v.part_no,
           v.part_range
    from workspace_text_embeddings v
    join workspace_document_text t on t.id = v.text_id
    join eligible e on e.id = t.document_id
    where v.model = p_model
    order by v.text_id,
             (v.embedding operator(extensions.<=>) query_embedding) asc,
             v.part_no
  ),
  -- Only units that clear the floor take part in fusion.
  vec as (
    select b.tid, row_number() over (order by b.dist asc, b.tid) as rnk
    from vec_best b
    where p_min_similarity is null or (1 - b.dist) >= p_min_similarity
  ),
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
  -- Resolve the unit and choose the part the passage is cut from:
  --   keyword hit -> among the parts whose slice satisfies the tsquery, the highest-ranking one
  --                  (ties: the vector-best part, else the lowest part_no); none -> the unit's head
  --   vector hit  -> the best part, which is the one that earned the row its rank
  hit as materialized (
    select e.kind, e.id as document_id, t.id as text_id, e.course_id, e.title,
           t.unit_kind, t.unit_no, t.text,
           fused.sc, fused.via_fts, vb.dist,
           case when fused.via_fts then kw.part_no    else vb.part_no    end as snip_part_no,
           case when fused.via_fts then kw.part_range else vb.part_range end as snip_range
    from fused
    join workspace_document_text t on t.id = fused.tid
    join eligible e on e.id = t.document_id
    left join vec_best vb on vb.tid = fused.tid
    left join lateral (
      select v.part_no, v.part_range
      from workspace_text_embeddings v
      where fused.via_fts
        and v.text_id = t.id
        and v.model = p_model
        and to_tsvector('english',
              case when v.part_range is null then t.text
                   else substring(t.text from lower(v.part_range) + 1
                                          for upper(v.part_range) - lower(v.part_range)) end)
            @@ websearch_to_tsquery('english', q)
      order by ts_rank(to_tsvector('english',
                         case when v.part_range is null then t.text
                              else substring(t.text from lower(v.part_range) + 1
                                                     for upper(v.part_range) - lower(v.part_range)) end),
                       websearch_to_tsquery('english', q)) desc,
               coalesce(v.part_no = vb.part_no, false) desc,
               v.part_no
      limit 1
    ) kw on true
  )
  select h.kind, h.document_id, h.text_id, h.course_id, h.title, h.unit_kind, h.unit_no,
         h.sc::double precision as score,
         (1 - h.dist)::double precision as similarity,
         left(case when h.snip_range is null then h.text
                   else substring(h.text from lower(h.snip_range) + 1
                                          for upper(h.snip_range) - lower(h.snip_range)) end,
              2000) as passage,
         h.snip_part_no as part_no
  from hit h
  order by h.sc desc, h.text_id
  limit p_limit
$function$;

comment on function public.hybrid_search_workspace_text(text, extensions.vector, text, text[], text[], integer, integer, double precision) is
  'The twin of hybrid_search_file_text over uploads and remembered items (192): the keyword arm and '
  'the vector arm fused by reciprocal rank (rrf_k 50), every part in scope measured with '
  'operator(extensions.<=>) and the best part of each unit kept, so it uses no index and ranks as '
  'the course search does. p_model (default gte-small) picks which vectors are ranked. A document in '
  'state deleting or failed is never returned; with p_courses, uploads tagged with another course '
  'are left out, untagged uploads and every remembered item stay. passage is at most 2000 '
  'characters of the matched part. SECURITY INVOKER; service_role only.';

-- =============================================================================================
-- 2. workspace_search
-- =============================================================================================
create or replace function public.workspace_search(
  p_q text,
  p_query_embedding extensions.vector,
  p_kinds text[] default array['material', 'upload', 'memory'],
  p_courses text[] default null,
  p_limit integer default 10,
  p_min_similarity double precision default null,
  p_model text default 'gte-small')
returns table(kind text, unit_id bigint, file_id bigint, document_id bigint, course_id text,
              title text, unit_kind text, unit_no integer, part_no integer,
              similarity double precision, score double precision, passage text, has_notes boolean)
language sql
stable
set search_path = public, pg_temp
as $function$
  with prm as (
    select coalesce(p_kinds, array['material', 'upload', 'memory']) as kinds,
           least(greatest(coalesce(p_limit, 10), 1), 50)           as lim
  ),
  -- Course files: the course arm once for each course in scope, or once with no filter.
  mat as (
    select 'material'::text as kind, h.text_id as unit_id, h.file_id, null::bigint as document_id,
           h.course_id, h.file_name as title, h.unit_kind, h.unit_no, h.part_no,
           h.similarity, h.score, h.snippet as passage
    from prm,
         unnest(case when 'material' = any (prm.kinds)
                     then coalesce(p_courses, array[null::text])
                     else array[]::text[] end) as c(course)
    cross join lateral public.hybrid_search_file_text(
           p_q, p_query_embedding, p_model, c.course, prm.lim, 50, p_min_similarity, false) h
  ),
  -- Uploads and remembered items.
  dox as (
    select w.kind, w.text_id as unit_id, null::bigint as file_id, w.document_id,
           w.course_id, w.title, w.unit_kind, w.unit_no, w.part_no,
           w.similarity, w.score, w.passage
    from prm,
         -- once for each document kind named, so p_limit is a kind's limit
         unnest(array(select distinct k from unnest(prm.kinds) k
                       where k in ('upload', 'memory'))) as dk(kind)
    cross join lateral public.hybrid_search_workspace_text(
           p_q, p_query_embedding, p_model, array[dk.kind], p_courses, prm.lim, 50, p_min_similarity) w
  ),
  merged as (
    select * from mat
    union all
    select * from dox
  ),
  -- At most a kind's limit of each kind named, best first.
  ranked as (
    select m.*,
           row_number() over (partition by m.kind
                              order by m.similarity desc nulls last, m.score desc, m.unit_id) as rn
    from merged m
  )
  select r.kind, r.unit_id, r.file_id, r.document_id, r.course_id, r.title, r.unit_kind, r.unit_no,
         r.part_no, r.similarity, r.score,
         left(r.passage, 2000) as passage,
         (position('[notes]' in r.passage) > 0) as has_notes
  from ranked r, prm
  where r.rn <= prm.lim
  order by r.similarity desc nulls last, r.score desc, r.kind, r.unit_id
$function$;

comment on function public.workspace_search(text, extensions.vector, text[], text[], integer, double precision, text) is
  'The one search over every kind (192): course files through hybrid_search_file_text (once for each '
  'course of p_courses, or once with no filter), uploads and remembered items through '
  'hybrid_search_workspace_text. Every row names its kind (material, upload or memory, never null) '
  'and carries the unit''s id (bb_file_text.id for material with file_id set; '
  'workspace_document_text.id for the others with document_id set). p_limit (1 to 50) is a kind''s '
  'limit: at most p_limit rows of each kind named, best first by similarity, then by score. p_model '
  'is handed to both arms. passage is at most 2000 characters; has_notes says it holds the [notes] '
  'marker. SECURITY INVOKER; service_role only (the page never searches).';

-- =============================================================================================
-- 3. workspace_attachment_read
-- =============================================================================================
create or replace function public.workspace_attachment_read(
  p_kind text, p_id bigint, p_max_chars integer)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  v_state       text;
  v_title       text;
  v_course      text;
  v_doc_state   text;
  v_total       integer := 0;
  v_chars_total bigint  := 0;
  v_read        integer := 0;
  v_chars_read  bigint  := 0;
  v_units       jsonb   := '[]'::jsonb;
  v_left        jsonb   := '[]'::jsonb;
begin
  if p_kind is null or p_kind not in ('file', 'upload') then
    raise exception 'workspace_attachment_read: p_kind is file or upload, not %', coalesce(p_kind, 'null')
      using errcode = '22023';
  end if;
  if p_max_chars is null or p_max_chars < 1 then
    raise exception 'workspace_attachment_read: p_max_chars is at least 1' using errcode = '22023';
  end if;

  if p_kind = 'file' then
    select f.file_name, f.course_id into v_title, v_course
      from bb_files f where f.id = p_id;
    if not found then
      v_state := 'missing';
    end if;
  else
    select d.title, d.course_id, d.state into v_title, v_course, v_doc_state
      from workspace_documents d where d.id = p_id and d.kind = 'upload';
    if not found or v_doc_state = 'deleting' then
      v_state := 'missing';
      v_title := null;
      v_course := null;
    elsif v_doc_state = 'failed' then
      v_state := 'failed';
    elsif v_doc_state in ('stored', 'reading') then
      v_state := 'not_ready';
    end if;
  end if;

  if v_state is null then
    -- Whole units, in (unit_kind, unit_no) order, until the next unit would pass p_max_chars; the
    -- first unit is cut to p_max_chars when it alone is longer. The units left out are named by id.
    with src as (
      select t.id, t.unit_kind, t.unit_no, t.text
        from bb_file_text t where p_kind = 'file' and t.file_id = p_id
      union all
      select t.id, t.unit_kind, t.unit_no, t.text
        from workspace_document_text t where p_kind = 'upload' and t.document_id = p_id
    ),
    ordered as (
      select s.*,
             row_number() over (order by s.unit_kind, s.unit_no, s.id) as rn,
             sum(char_length(s.text)) over (order by s.unit_kind, s.unit_no, s.id) as cum
        from src s
    ),
    taken as (
      select o.*, (o.rn = 1 or o.cum <= p_max_chars) as inc
        from ordered o
    )
    select count(*)::integer,
           coalesce(sum(char_length(k.text)), 0),
           (count(*) filter (where k.inc))::integer,
           coalesce(sum(case when k.rn = 1 then least(char_length(k.text), p_max_chars)
                             else char_length(k.text) end) filter (where k.inc), 0),
           coalesce(jsonb_agg(jsonb_build_object('unit_id', k.id, 'unit_kind', k.unit_kind,
                                                 'unit_no', k.unit_no,
                                                 'text', case when k.rn = 1 then left(k.text, p_max_chars)
                                                              else k.text end)
                              order by k.rn) filter (where k.inc), '[]'::jsonb),
           coalesce((select jsonb_agg(x.id order by x.rn)
                       from (select z.id, z.rn from taken z where not z.inc order by z.rn limit 40) x),
                    '[]'::jsonb)
      into v_total, v_chars_total, v_read, v_chars_read, v_units, v_left
      from taken k;

    v_state := case when v_total = 0 then 'no_text'
                    when v_chars_read < v_chars_total then 'cut'
                    else 'read' end;
  end if;

  return jsonb_build_object(
    'kind', p_kind, 'id', p_id, 'state', v_state, 'title', v_title, 'course_id', v_course,
    'units_total', v_total, 'units_read', v_read,
    'chars_total', v_chars_total, 'chars_read', v_chars_read,
    'units', v_units, 'left_out_unit_ids', v_left);
end $function$;

comment on function public.workspace_attachment_read(text, bigint, integer) is
  'An attached file''s units, cut on the server (192). p_kind file (p_id is bb_files.id) or upload '
  '(workspace_documents.id). Units in (unit_kind, unit_no) order, whole units only, until the next '
  'would pass p_max_chars; the first is cut to p_max_chars when it alone is longer. state: read '
  '(every unit), cut, no_text (no unit), not_ready (an upload in stored or reading), failed, or '
  'missing (no such row, or an upload in deleting). Every key is present in every state: kind, id, '
  'state, title, course_id, units_total, units_read, chars_total, chars_read, units [{unit_id, '
  'unit_kind, unit_no, text}], left_out_unit_ids (at most 40). SECURITY INVOKER; service_role only.';

-- =============================================================================================
-- 4. Privileges
-- =============================================================================================
revoke all on function
  public.hybrid_search_workspace_text(text, extensions.vector, text, text[], text[], integer, integer, double precision),
  public.workspace_search(text, extensions.vector, text[], text[], integer, double precision, text),
  public.workspace_attachment_read(text, bigint, integer)
from public, anon, authenticated, service_role;

grant execute on function
  public.hybrid_search_workspace_text(text, extensions.vector, text, text[], text[], integer, integer, double precision),
  public.workspace_search(text, extensions.vector, text[], text[], integer, double precision, text),
  public.workspace_attachment_read(text, bigint, integer)
to service_role;

-- The unit calls them as the session role, which reads every table in public (100's default
-- privilege); 100 grants it the other search functions the same way.
grant execute on function
  public.hybrid_search_workspace_text(text, extensions.vector, text, text[], text[], integer, integer, double precision),
  public.workspace_search(text, extensions.vector, text[], text[], integer, double precision, text),
  public.workspace_attachment_read(text, bigint, integer)
to db_test_runner;

-- =============================================================================================
-- 5. Guard
-- =============================================================================================
do $$
declare
  v_bad text;
begin
  -- (a) Invoker, a pinned path, executable by service_role and the test login, and by nobody else.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('hybrid_search_workspace_text', 'workspace_search', 'workspace_attachment_read')
     and (p.prosecdef
          or not coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']
          or not has_function_privilege('service_role', p.oid, 'execute')
          or not has_function_privilege('db_test_runner', p.oid, 'execute')
          or has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('public', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'FAIL 192: not invoker with a pinned path, or open beyond service_role: %', v_bad;
  end if;

  -- (b) The twin ranks with the operator both indexes are built for.
  if position('operator(extensions.<=>)' in pg_get_functiondef(
       'public.hybrid_search_workspace_text(text, extensions.vector, text, text[], text[], integer, integer, double precision)'::regprocedure)) = 0 then
    raise exception 'FAIL 192: hybrid_search_workspace_text does not use operator(extensions.<=>)';
  end if;
end $$;
