-- bb2dash :: db/tests/phase24_store_proof.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 49, "The store's
-- proof, as written": proofs 1 to 7 and 7b. Worker W-76. Answer 17: the pgvector store, scoped to
-- bb2dash.
--
-- A read-only unit over the catalogs and the counts. Each proof is the statement the brief gives (so
-- the PM can paste it into the SQL editor), run here inside its own block; every failure, and every
-- statement that raises, is collected and the unit raises ONCE, on one line, naming every proof that
-- failed. It writes nothing. Proof 4 sets two planner settings for the transaction only and the
-- EXPLAIN without ANALYZE runs no query, so no text leaves the database.
--
--   1. the extension `vector` is present, in schema `extensions`
--   2. exactly two columns are vectors, each vector(384) and not null, and no view hands one out
--   3. each vector column has its valid HNSW cosine index
--   4. a search's plan uses the index: match_file_text's own statement names the course index, and a
--      statement of the same shape names the new table's (with the planner's sequential scan and
--      sort taken out of the choice, so the answer does not depend on the table's size; the new
--      table is empty on the day it is applied)
--   5. every vector row names its model (gte-small), and the model is in the key
--   6. the counts by kind agree with a direct count (v_workspace_index_status)
--   7. no function of the store reads another project
--   7b. who holds a right on the five content tables: row security on all five; the grid of grants
--      AND policies (a right is both); the policies; the two columns the owner may update
--
-- It is green only once 190 to 198 are on prod (so it is RED before: one vector column exists where
-- two are expected). Proof 8's four greps and proof 9 are not SQL; the verification file holds them.
-- RUN IT: `node scripts/db-test.mjs --only phase24_store_proof.sql`.

begin;

do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  v_plan json;
  v_rec  record;
begin
  -- ---------------------------------------------------------------------------------------------
  -- 1. The extension is present.
  -- ---------------------------------------------------------------------------------------------
  begin
    select string_agg(x.extname || '|' || x.in_schema, ';') into v_got
      from (select e.extname, e.extversion, n.nspname as in_schema
              from pg_extension e
              join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'vector') x;
    if v_got is distinct from 'vector|extensions' then
      v_fail := v_fail || format('proof 1: the extension reads [%s], expected [vector|extensions]', v_got);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 1 raised %s: %s', sqlstate, sqlerrm);
  end;

  -- ---------------------------------------------------------------------------------------------
  -- 2. Each vector column exists with its type (views are in the list on purpose).
  -- ---------------------------------------------------------------------------------------------
  begin
    select string_agg(x.rel || '|' || x.col || '|' || x.dims || '|' || case when x.not_null then 't' else 'f' end,
                      ';' order by x.rel collate "C") into v_got
      from (select n.nspname || '.' || c.relname as rel, a.attname as col,
                   a.atttypmod as dims, a.attnotnull as not_null
              from pg_attribute a
              join pg_class c on c.oid = a.attrelid
              join pg_namespace n on n.oid = c.relnamespace
             where a.atttypid = 'extensions.vector'::regtype
               and a.attnum > 0 and not a.attisdropped
               and c.relkind in ('r', 'p', 'v', 'm')) x;
    if v_got is distinct from
       'public.bb_text_embeddings|embedding|384|t;public.workspace_text_embeddings|embedding|384|t' then
      v_fail := v_fail || format('proof 2: the vector columns read [%s]', v_got);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 2 raised %s: %s', sqlstate, sqlerrm);
  end;

  -- ---------------------------------------------------------------------------------------------
  -- 3. Each vector column has its HNSW index.
  -- ---------------------------------------------------------------------------------------------
  begin
    select string_agg(x.rel || '|' || x.index_name || '|' || x.method || '|' || x.opclass || '|'
                      || case when x.valid then 't' else 'f' end, ';' order by x.rel collate "C") into v_got
      from (select n.nspname || '.' || t.relname as rel, ic.relname as index_name,
                   am.amname as method, oc.opcname as opclass, i.indisvalid as valid
              from pg_index i
              join pg_class ic on ic.oid = i.indexrelid
              join pg_class t on t.oid = i.indrelid
              join pg_namespace n on n.oid = t.relnamespace
              join pg_am am on am.oid = ic.relam
              join pg_opclass oc on oc.oid = i.indclass[0]
             where am.amname in ('hnsw', 'ivfflat')) x;
    if v_got is distinct from
       'public.bb_text_embeddings|bb_text_embeddings_hnsw|hnsw|vector_cosine_ops|t;'
       'public.workspace_text_embeddings|workspace_text_embeddings_hnsw|hnsw|vector_cosine_ops|t' then
      v_fail := v_fail || format('proof 3: the vector indexes read [%s]', v_got);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 3 raised %s: %s', sqlstate, sqlerrm);
  end;

  -- ---------------------------------------------------------------------------------------------
  -- 4. A search's plan uses the index. The course table: match_file_text's own statement
  --    (021_matched_snippets.sql:80-90) with a literal for each of its five parameters.
  -- ---------------------------------------------------------------------------------------------
  begin
    perform set_config('enable_seqscan', 'off', true);
    perform set_config('enable_sort', 'off', true);
    execute $q$
      explain (costs off, format json)
      select f.id, t.id, e.part_no, f.course_id, f.bucket, f.file_name, t.unit_kind, t.unit_no,
             1 - (e.embedding operator(extensions.<=>)
                  (array_fill(0.01::real, array[384])::extensions.vector(384))) as similarity,
             t.text
        from public.bb_text_embeddings e
        join public.bb_file_text t on t.id = e.text_id
        join public.bb_files f on f.id = t.file_id
       where e.model = 'gte-small'
         and (null::text is null or f.course_id = null::text)
         and (false or f.superseded_by is null)
       order by e.embedding operator(extensions.<=>)
                (array_fill(0.01::real, array[384])::extensions.vector(384))
       limit 10
    $q$ into v_plan;
    if v_plan::text !~ '"Index Name":\s*"bb_text_embeddings_hnsw"' then
      v_fail := v_fail || 'proof 4 (course table): the plan does not name the index bb_text_embeddings_hnsw';
    end if;
    if v_plan::text ~ '"Node Type":\s*"Sort"' then
      v_fail := v_fail || 'proof 4 (course table): the plan has a Sort node';
    end if;
  exception when others then
    v_fail := v_fail || format('proof 4 (course table) raised %s: %s', sqlstate, sqlerrm);
  end;

  -- The new table: a statement of the same shape. No function over it orders by distance with a
  -- limit yet, so this shows that the index can serve the shape and no more than that.
  begin
    perform set_config('enable_seqscan', 'off', true);
    perform set_config('enable_sort', 'off', true);
    execute $q$
      explain (costs off, format json)
      select e.text_id
        from public.workspace_text_embeddings e
       where e.model = 'gte-small'
       order by e.embedding operator(extensions.<=>)
                (array_fill(0.01::real, array[384])::extensions.vector(384))
       limit 10
    $q$ into v_plan;
    if v_plan::text !~ '"Index Name":\s*"workspace_text_embeddings_hnsw"' then
      v_fail := v_fail || 'proof 4 (new table): the plan does not name the index workspace_text_embeddings_hnsw';
    end if;
    if v_plan::text ~ '"Node Type":\s*"Sort"' then
      v_fail := v_fail || 'proof 4 (new table): the plan has a Sort node';
    end if;
  exception when others then
    v_fail := v_fail || format('proof 4 (new table) raised %s: %s', sqlstate, sqlerrm);
  end;
  perform set_config('enable_seqscan', 'on', true);
  perform set_config('enable_sort', 'on', true);

  -- ---------------------------------------------------------------------------------------------
  -- 5. Every vector row names its model, and the model is in the key.
  -- ---------------------------------------------------------------------------------------------
  begin
    select string_agg(x.rel || '|' || coalesce(x.model, '<null>'), ';' order by x.rel collate "C", x.model collate "C")
      into v_got
      from (select 'bb_text_embeddings' as rel, model
              from public.bb_text_embeddings group by model
            union all
            select 'workspace_text_embeddings', model
              from public.workspace_text_embeddings group by model) x
     where x.model is distinct from 'gte-small';
    if v_got is not null then
      v_fail := v_fail || format('proof 5: a vector row is under a model other than gte-small: [%s]', v_got);
    end if;
    -- Two rows, one a table, each with the key (regclass renders the schema only when public is not
    -- on the path, so the key alone is compared).
    select string_agg(x.key, ';') into v_got
      from (select pg_get_constraintdef(oid) as key
              from pg_constraint
             where conrelid in ('public.bb_text_embeddings'::regclass,
                                'public.workspace_text_embeddings'::regclass)
               and contype = 'u') x;
    if v_got is distinct from 'UNIQUE (text_id, model, part_no);UNIQUE (text_id, model, part_no)' then
      v_fail := v_fail || format('proof 5: the unique keys read [%s]', v_got);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 5 raised %s: %s', sqlstate, sqlerrm);
  end;

  -- ---------------------------------------------------------------------------------------------
  -- 6. The counts by kind agree with a direct count.
  -- ---------------------------------------------------------------------------------------------
  begin
    select s.course_units_indexed + s.course_units_waiting
             = (select count(*) from public.bb_file_text) as course_ok,
           s.course_units_indexed
             = (select count(distinct e.text_id) from public.bb_text_embeddings e) as course_vectors_ok,
           s.uploads_indexed
             = (select count(*) from public.workspace_documents d
                 where d.kind = 'upload' and d.state = 'indexed') as uploads_ok,
           s.memory_indexed
             = (select count(*) from public.workspace_documents d
                 where d.kind = 'memory' and d.state = 'indexed') as memory_ok,
           (select count(*) from public.workspace_document_text t
              join public.workspace_documents d on d.id = t.document_id
             where d.state = 'indexed'
               and not exists (select 1 from public.workspace_text_embeddings e
                                where e.text_id = t.id)) = 0 as none_indexed_without_a_vector
      into v_rec
      from public.v_workspace_index_status s;
    if not found then
      v_fail := v_fail || 'proof 6: v_workspace_index_status returned no row';
    elsif not (v_rec.course_ok and v_rec.course_vectors_ok and v_rec.uploads_ok and v_rec.memory_ok and v_rec.none_indexed_without_a_vector) then
      v_fail := v_fail || format('proof 6: course_ok %s, course_vectors_ok %s, uploads_ok %s, memory_ok %s, none_indexed_without_a_vector %s',
                                 v_rec.course_ok, v_rec.course_vectors_ok, v_rec.uploads_ok, v_rec.memory_ok, v_rec.none_indexed_without_a_vector);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 6 raised %s: %s', sqlstate, sqlerrm);
  end;

  -- ---------------------------------------------------------------------------------------------
  -- 7. No function of the store reads another project.
  -- ---------------------------------------------------------------------------------------------
  begin
    select (select count(*) from pg_foreign_server) as foreign_servers,
           (select count(*) from pg_foreign_table) as foreign_tables,
           (select count(*) from pg_extension
             where extname in ('dblink', 'postgres_fdw', 'wrappers', 'http')) as link_extensions,
           (select count(*) from pg_proc p
             where p.pronamespace = 'public'::regnamespace
               and p.prosrc ~ '(bb_file_text|bb_text_embeddings|workspace_documents|workspace_document_text|workspace_text_embeddings)'
               and p.prosrc ~* '(dblink|postgres_fdw|net\.http_|http_post|http_get|extensions\.http)'
           ) as store_functions_that_call_out
      into v_rec;
    if v_rec.foreign_servers <> 0 or v_rec.foreign_tables <> 0 or v_rec.link_extensions <> 0
       or v_rec.store_functions_that_call_out <> 0 then
      v_fail := v_fail || format('proof 7: foreign servers %s, foreign tables %s, link extensions %s, store functions that call out %s',
                                 v_rec.foreign_servers, v_rec.foreign_tables, v_rec.link_extensions, v_rec.store_functions_that_call_out);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 7 raised %s: %s', sqlstate, sqlerrm);
  end;

  -- ---------------------------------------------------------------------------------------------
  -- 7b. Who holds a right on the five content tables.
  -- ---------------------------------------------------------------------------------------------
  begin
    select string_agg(c.relname || ':' || case when c.relrowsecurity then 't' else 'f' end, ';'
                      order by c.relname collate "C") into v_got
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relname in ('bb_file_text', 'bb_text_embeddings', 'workspace_documents',
                         'workspace_document_text', 'workspace_text_embeddings');
    if v_got is distinct from
       'bb_file_text:t;bb_text_embeddings:t;workspace_document_text:t;workspace_documents:t;workspace_text_embeddings:t' then
      v_fail := v_fail || format('proof 7b (row security): [%s]', v_got);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 7b (row security) raised %s: %s', sqlstate, sqlerrm);
  end;

  begin
    with roles(who) as (values ('anon'), ('authenticated'), ('workspace_runner'),
                               ('workspace_ingest_runner'), ('sync_runner'),
                               ('inbox_apply_runner')),
         rels(rel) as (values ('bb_file_text'), ('bb_text_embeddings'), ('workspace_documents'),
                              ('workspace_document_text'), ('workspace_text_embeddings')),
         cmds(cmd) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')),
         grid as (
           select r.who, t.rel, string_agg(c.cmd, ', ' order by c.cmd) as may
             from roles r cross join rels t cross join cmds c
            where case c.cmd
                    when 'DELETE'
                      then has_table_privilege(r.who::name, ('public.' || t.rel)::regclass, 'DELETE')
                    else has_any_column_privilege(r.who::name, ('public.' || t.rel)::regclass, c.cmd)
                  end
              and exists (select 1 from pg_policies p
                           where p.schemaname = 'public' and p.tablename = t.rel
                             and p.permissive = 'PERMISSIVE'
                             and p.cmd in (c.cmd, 'ALL')
                             and (r.who::name = any (p.roles) or 'public'::name = any (p.roles)))
            group by r.who, t.rel)
    select string_agg(g.who || '|' || g.rel || '|' || g.may, ';' order by g.who collate "C", g.rel collate "C")
      into v_got from grid g;
    if v_got is distinct from
       'anon|bb_file_text|INSERT;'
       'authenticated|bb_file_text|DELETE, INSERT, SELECT, UPDATE;'
       'authenticated|bb_text_embeddings|DELETE, INSERT, SELECT, UPDATE;'
       'authenticated|workspace_document_text|SELECT;'
       'authenticated|workspace_documents|SELECT, UPDATE' then
      v_fail := v_fail || format('proof 7b (rights): [%s]', v_got);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 7b (rights) raised %s: %s', sqlstate, sqlerrm);
  end;

  begin
    select string_agg(p.tablename || '|' || p.policyname || '|' || p.roles::text || '|' || p.cmd || '|'
                      || case when (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%app_owner%'
                              then 't' else 'f' end,
                      ';' order by p.tablename collate "C", p.policyname collate "C") into v_got
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename in ('bb_file_text', 'bb_text_embeddings', 'workspace_documents',
                           'workspace_document_text', 'workspace_text_embeddings');
    if v_got is distinct from
       'bb_file_text|bb_file_text_anon_insert|{anon}|INSERT|f;'
       'bb_file_text|bb_file_text_owner_all|{authenticated}|ALL|t;'
       'bb_text_embeddings|bb_text_embeddings_owner_all|{authenticated}|ALL|t;'
       'workspace_document_text|workspace_document_text_owner_select|{authenticated}|SELECT|t;'
       'workspace_documents|workspace_documents_owner_select|{authenticated}|SELECT|t;'
       'workspace_documents|workspace_documents_owner_update|{authenticated}|UPDATE|t' then
      v_fail := v_fail || format('proof 7b (policies): [%s]', v_got);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 7b (policies) raised %s: %s', sqlstate, sqlerrm);
  end;

  begin
    select string_agg(x.col, ', ' order by x.col collate "C") into v_got
      from (select a.attname as col
              from pg_attribute a
             where a.attrelid = 'public.workspace_documents'::regclass
               and a.attnum > 0 and not a.attisdropped
               and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')) x;
    if v_got is distinct from 'course_id, title' then
      v_fail := v_fail || format('proof 7b (columns): authenticated may update [%s] of workspace_documents', v_got);
    end if;
  exception when others then
    v_fail := v_fail || format('proof 7b (columns) raised %s: %s', sqlstate, sqlerrm);
  end;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase24_store_proof: % proof statement(s) failed: %', cardinality(v_fail),
      array_to_string(v_fail, ' ; ');
  end if;
end $$;

select 'phase24_store_proof: PASS' as result,
       (select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid
         where a.atttypid = 'extensions.vector'::regtype and a.attnum > 0 and not a.attisdropped
           and c.relkind in ('r', 'p', 'v', 'm'))                                             as vector_columns,
       (select count(*) from public.bb_text_embeddings)                                       as course_vectors,
       (select count(*) from public.workspace_text_embeddings)                                as workspace_vectors;

rollback;
