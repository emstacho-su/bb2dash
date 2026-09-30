-- bb2dash :: db/tests/phase18_121_search_contract.sql
-- Phase 18 (brief 98), task 7. Worker W-48. Migration 121's contract (R-62):
--
--   (s) both search functions keep their exact signature: arguments and result as prod printed
--       them before 121 (literals below, copied 2026-09-29 under search_path public, extensions),
--       SECURITY INVOKER, Phase 15's pinned search_path, and the ACL recorded in 98c before 121
--   (n) the notes label rule, swept over the whole current corpus: every row either function
--       returns for a unit that carries a `[notes]` marker either holds no text from at or after
--       the marker, or starts with `[notes] ` and holds only text after it. Probes:
--         * every gte-small part of every current `[notes]` unit, as a vector-only hit
--         * per current `[notes]` unit, one word taken from its notes, asked in keyword mode and
--           in hybrid mode (with the unit's own part-1 embedding)
--         * the three live leaks: supplicant, subrequirements
--       A snippet is split on the headline delimiter ` … `, whitespace is folded, and every
--       fragment must be a substring of the side it claims.
--
-- Collects every failure and raises once. Writes nothing.
-- RUN IT: `node scripts/db-test.mjs --only phase18_121_search_contract.sql`.

begin;

set local search_path = public, extensions;

do $$
declare
  HYBRID_ARGS constant text := 'q text, query_embedding vector, p_model text DEFAULT ''gte-small''::text, p_course text DEFAULT NULL::text, p_limit integer DEFAULT 10, rrf_k integer DEFAULT 50, p_min_similarity double precision DEFAULT NULL::double precision, p_include_superseded boolean DEFAULT false';
  HYBRID_RESULT constant text := 'TABLE(file_id bigint, text_id bigint, course_id text, bucket file_bucket, file_name text, unit_kind text, unit_no integer, score double precision, similarity double precision, snippet text, part_no integer, snippet_source text)';
  KEYWORD_ARGS constant text := 'q text, p_course text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_include_superseded boolean DEFAULT false';
  KEYWORD_RESULT constant text := 'TABLE(file_id bigint, text_id bigint, course_id text, bucket file_bucket, file_name text, unit_kind text, unit_no integer, rank real, snippet text)';
  PIN constant text := '{"search_path=public, pg_temp"}';
  ACL constant text := '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,db_test_runner=X/postgres}';
  NO_MATCH_QUERY constant text := 'zzqxnomatchzzq';
  PROBE_LIMIT constant int := 10;
  v_fail text[] := array[]::text[];
  v_bad text;
  v_n int;
begin
  -- (s) ----------------------------------------------------------------------------------------
  select string_agg(format('%s %s', p.proname, x.what), ', ' order by p.proname, x.what) into v_bad
    from pg_proc p
    cross join lateral (values
      ('arguments', pg_get_function_arguments(p.oid)
                    is distinct from case p.proname when 'hybrid_search_file_text' then HYBRID_ARGS
                                                    else KEYWORD_ARGS end),
      ('result',    pg_get_function_result(p.oid)
                    is distinct from case p.proname when 'hybrid_search_file_text' then HYBRID_RESULT
                                                    else KEYWORD_RESULT end),
      ('security definer', p.prosecdef),
      ('search_path', p.proconfig::text is distinct from PIN),
      ('acl', p.proacl::text is distinct from ACL)
    ) x(what, bad)
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('hybrid_search_file_text', 'search_file_text')
     and x.bad;
  if v_bad is not null then
    v_fail := v_fail || format('(s) changed: %s', v_bad);
  end if;
  select count(*) into v_n from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('hybrid_search_file_text', 'search_file_text');
  if v_n <> 2 then
    v_fail := v_fail || format('(s) expected one of each function, found %s', v_n);
  end if;

  -- (n) ----------------------------------------------------------------------------------------
  create temp table if not exists pg_temp.p18_121 (probe text, text_id bigint, snippet text)
    on commit drop;
  truncate pg_temp.p18_121;

  -- current [notes] units, and one word from each unit's notes
  create temp table if not exists pg_temp.p18_121_units on commit drop as
    select t.id,
           (regexp_match(substring(t.text from position('[notes]' in t.text) + 7),
                         '[A-Za-z]{7,}'))[1] as notes_word
      from bb_file_text t
      join bb_files f on f.id = t.file_id
     where f.superseded_by is null
       and position('[notes]' in t.text) > 0;

  -- vector-only hit from every part of every [notes] unit
  insert into pg_temp.p18_121
  select format('vector %s/%s', e.text_id, e.part_no), h.text_id, h.snippet
    from pg_temp.p18_121_units u
    join bb_text_embeddings e on e.text_id = u.id and e.model = 'gte-small'
    cross join lateral hybrid_search_file_text(NO_MATCH_QUERY, e.embedding, 'gte-small', null,
                                               PROBE_LIMIT) h;

  -- one notes word per unit, keyword and hybrid
  insert into pg_temp.p18_121
  select format('keyword %s', u.notes_word), k.text_id, k.snippet
    from pg_temp.p18_121_units u
    cross join lateral search_file_text(u.notes_word, null, PROBE_LIMIT) k
   where u.notes_word is not null;

  insert into pg_temp.p18_121
  select format('hybrid %s', u.notes_word), h.text_id, h.snippet
    from pg_temp.p18_121_units u
    join bb_text_embeddings e on e.text_id = u.id and e.model = 'gte-small' and e.part_no = 1
    cross join lateral hybrid_search_file_text(u.notes_word, e.embedding, 'gte-small', null,
                                               PROBE_LIMIT) h
   where u.notes_word is not null;

  -- the three live leaks
  insert into pg_temp.p18_121
  select format('hybrid %s', q.qq), h.text_id, h.snippet
    from (values ('supplicant', 750::bigint), ('supplicant', 738::bigint),
                 ('subrequirements', 482::bigint)) q(qq, tid)
    join bb_text_embeddings e on e.text_id = q.tid and e.model = 'gte-small' and e.part_no = 1
    cross join lateral hybrid_search_file_text(q.qq, e.embedding, 'gte-small', null, 50) h;
  insert into pg_temp.p18_121
  select format('keyword %s', q.qq), k.text_id, k.snippet
    from (values ('supplicant'), ('subrequirements')) q(qq)
    cross join lateral search_file_text(q.qq, null, 50) k;

  select count(*) into v_n from pg_temp.p18_121;
  if v_n = 0 then
    v_fail := v_fail || '(n) no probe returned a row'::text;
  end if;

  select string_agg(distinct format('%s -> %s', p.probe, p.text_id), ', ') into v_bad
    from pg_temp.p18_121 p
    join bb_file_text t on t.id = p.text_id
    cross join lateral (
      select position('[notes]' in t.text) as m,
             p.snippet like '[notes] %' as labelled
    ) s
    cross join lateral (
      select btrim(regexp_replace(left(t.text, greatest(s.m - 1, 0)), '\s+', ' ', 'g')) as pre,
             btrim(regexp_replace(substring(t.text from s.m + 7), '\s+', ' ', 'g')) as post,
             case when s.labelled then substring(p.snippet from 9) else p.snippet end as body
    ) side
   where s.m > 0
     and exists (
       select 1
         from regexp_split_to_table(side.body, ' … ') frag
        where btrim(regexp_replace(frag, '\s+', ' ', 'g')) <> ''
          and position(btrim(regexp_replace(frag, '\s+', ' ', 'g'))
                       in case when s.labelled then side.post else side.pre end) = 0
     );
  if v_bad is not null then
    v_fail := v_fail || format('(n) snippet crosses the notes marker: %s', v_bad);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', left(array_to_string(v_fail, '; '), 3000);
  end if;
end $$;

select 'phase18_121_search_contract: PASS' as result,
       (select count(*) from pg_temp.p18_121) as probe_rows;

rollback;
