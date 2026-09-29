-- bb2dash :: db/tests/phase18_post_embed_checks.sql
-- Phase 18 (docs/planning/sprint-2/briefs/98_PHASE18_ingest_corpus.md), task 1. Worker W-48.
-- The corpus is whole and search never passes speaker notes off as slide text (S2-rag-1, R-61,
-- R-62, P-24, P-89). Every assertion is scoped to CURRENT files (`superseded_by is null`).
--
--   (a) every current file with text_status <> 'na' has at least one bb_file_text unit
--   (b) every current 'na' file shares its sha256 with a current 'extracted' file (17 <-> 15),
--       or its id is in NA_EXCEPTIONS below, which is empty on purpose
--   (c) every unit of a current file has gte-small parts numbered 1..n with no gap; part 1 starts
--       at 0, the last part ends at char_length(text), and each part starts at or before the
--       previous part's end. Parts OVERLAP by design (embed-corpus PART_OVERLAP = 200), so
--       "start = previous end" would be wrong. A unit with no part at all fails here too.
--   (d) the notes label rule of migration 121: a returned snippet either holds no text from at or
--       after the unit's first `[notes]` marker, or starts with `[notes] ` and holds only text
--       after it. Probed on hybrid `supplicant` (units 750, 738), hybrid `subrequirements` (482),
--       keyword `supplicant` (738, 750), and every part of the lowest-text_id multi-part `[notes]`
--       unit as a vector-only hit. The SQL runner cannot embed text, so each hybrid call passes
--       the unit's own stored embedding as `query_embedding`.
--
-- How (d) reads a snippet: split it on the headline's fragment delimiter ` … `, fold whitespace,
-- and require every fragment to be a substring of the side it claims (the text before the marker,
-- or, after a `[notes] ` label, the text after it). ts_headline and left() both return verbatim
-- runs of the unit's text, so a fragment that is on neither side is a leak.
--
-- The runner prints only the first line of an error and a unit stops at its first raise, so this
-- file runs every assertion, collects each failure, and raises ONCE, e.g.
--   FAIL (b) na without twin: 68; (d) unlabelled notes: hybrid supplicant/750, …
-- It writes nothing. RUN IT: `node scripts/db-test.mjs --only phase18_post_embed_checks.sql`.

begin;

do $$
declare
  -- Ids a reviewer has accepted as `na` with no twin. Empty on purpose (brief 98 task 1).
  NA_EXCEPTIONS constant bigint[] := array[]::bigint[];
  -- Files whose text units were removed on Stack's word, so (a) expects none. File 13 is IST.323's
  -- "Appendix B: AI Use Statement": Phase 17's migration 150 deleted both of its units on
  -- 2026-09-29 ("remove IST 323 appendix b as well"); its bytes and catalog row stay.
  TEXT_REMOVED constant bigint[] := array[13]::bigint[];
  NO_MATCH_QUERY constant text := 'zzqxnomatchzzq';   -- matches no unit: forces a vector-only hit
  PROBE_LIMIT constant int := 50;
  v_fail text[] := array[]::text[];
  v_ids text;
  v_bad text[];
  v_unit bigint;
  r record;
begin
  -- (a) ----------------------------------------------------------------------------------------
  select string_agg(f.id::text, ', ' order by f.id) into v_ids
    from bb_files f
    left join bb_file_text t on t.file_id = f.id
   where f.superseded_by is null
     and f.text_status is distinct from 'na'
     and not (f.id = any (TEXT_REMOVED))
     and t.file_id is null;
  if v_ids is not null then
    v_fail := v_fail || format('(a) no text unit: %s', v_ids);
  end if;

  -- (b) ----------------------------------------------------------------------------------------
  select string_agg(f.id::text, ', ' order by f.id) into v_ids
    from bb_files f
   where f.superseded_by is null
     and f.text_status = 'na'
     and not (f.id = any (NA_EXCEPTIONS))
     and not exists (select 1 from bb_files g
                      where g.superseded_by is null
                        and g.text_status = 'extracted'
                        and g.id <> f.id
                        and g.sha256 = f.sha256);
  if v_ids is not null then
    v_fail := v_fail || format('(b) na without twin: %s', v_ids);
  end if;

  -- (c) ----------------------------------------------------------------------------------------
  with units as (
    select t.id, char_length(t.text) as len
      from bb_file_text t
      join bb_files f on f.id = t.file_id
     where f.superseded_by is null
  ),
  parts as (
    select e.text_id, e.part_no,
           lower(e.part_range) as lo, upper(e.part_range) as hi,
           lag(upper(e.part_range)) over w as prev_hi,
           row_number() over w as rn,
           count(*) over (partition by e.text_id) as n
      from bb_text_embeddings e
      join units u on u.id = e.text_id
     where e.model = 'gte-small'
    window w as (partition by e.text_id order by e.part_no)
  ),
  bad as (
    select u.id, 'no parts' as why
      from units u
      left join (select distinct text_id from parts) p on p.text_id = u.id
     where p.text_id is null
    union all
    select p.text_id, format('part %s numbered out of 1..n', p.part_no) from parts p where p.part_no <> p.rn
    union all
    select p.text_id, 'part 1 does not start at 0' from parts p where p.rn = 1 and p.lo <> 0
    union all
    select p.text_id, 'last part does not end at char_length'
      from parts p join units u on u.id = p.text_id
     where p.rn = p.n and p.hi <> u.len
    union all
    select p.text_id, format('part %s leaves a hole', p.part_no)
      from parts p where p.prev_hi is not null and p.lo > p.prev_hi
  )
  select string_agg(format('%s %s', id, why), ', ' order by id, why) into v_ids from bad;
  if v_ids is not null then
    v_fail := v_fail || format('(c) parts: %s', v_ids);
  end if;

  -- (d) ----------------------------------------------------------------------------------------
  create temp table if not exists pg_temp.p18_probe (
    label text, text_id bigint, snippet text, returned boolean
  ) on commit drop;
  truncate pg_temp.p18_probe;

  -- hybrid, each unit asked with its own part-1 embedding
  insert into pg_temp.p18_probe
  select format('hybrid %s/%s', q.qq, q.tid), q.tid, h.snippet, h.text_id is not null
    from (values ('supplicant', 750::bigint), ('supplicant', 738::bigint),
                 ('subrequirements', 482::bigint)) q(qq, tid)
    left join lateral (
      select x.text_id, x.snippet
        from hybrid_search_file_text(
               q.qq,
               (select e.embedding from bb_text_embeddings e
                 where e.text_id = q.tid and e.model = 'gte-small' and e.part_no = 1),
               'gte-small', null, PROBE_LIMIT) x
       where x.text_id = q.tid
    ) h on true;

  -- keyword
  insert into pg_temp.p18_probe
  select format('keyword supplicant/%s', q.tid), q.tid, k.snippet, k.text_id is not null
    from (values (738::bigint), (750::bigint)) q(tid)
    left join lateral (
      select x.text_id, x.snippet
        from search_file_text('supplicant', null, PROBE_LIMIT) x
       where x.text_id = q.tid
    ) k on true;

  -- every part of the lowest multi-part [notes] unit, as a vector-only hit
  select min(t.id) into v_unit
    from bb_file_text t
    join bb_files f on f.id = t.file_id
   where f.superseded_by is null
     and position('[notes]' in t.text) > 0
     and (select count(*) from bb_text_embeddings e
           where e.text_id = t.id and e.model = 'gte-small') > 1;
  if v_unit is null then
    v_fail := v_fail || '(d) no multi-part [notes] unit to probe'::text;
  else
    insert into pg_temp.p18_probe
    select format('vector part %s/%s', e.part_no, v_unit), v_unit, h.snippet, h.text_id is not null
      from bb_text_embeddings e
      left join lateral (
        select x.text_id, x.snippet
          from hybrid_search_file_text(NO_MATCH_QUERY, e.embedding, 'gte-small', null, PROBE_LIMIT) x
         where x.text_id = v_unit
      ) h on true
     where e.text_id = v_unit and e.model = 'gte-small';
  end if;

  select string_agg(label, ', ' order by label) into v_ids
    from pg_temp.p18_probe where not returned;
  if v_ids is not null then
    v_fail := v_fail || format('(d) probe unit not returned: %s', v_ids);
  end if;

  select array_agg(p.label order by p.label) into v_bad
    from pg_temp.p18_probe p
    join bb_file_text t on t.id = p.text_id
    cross join lateral (
      select position('[notes]' in t.text) as m,
             p.snippet like '[notes] %' as labelled
    ) s
    cross join lateral (
      select btrim(regexp_replace(case when s.m > 0 then left(t.text, s.m - 1) else t.text end,
                                  '\s+', ' ', 'g')) as pre,
             btrim(regexp_replace(case when s.m > 0 then substring(t.text from s.m + 7) else '' end,
                                  '\s+', ' ', 'g')) as post,
             case when s.labelled then substring(p.snippet from 9) else p.snippet end as body
    ) side
   where p.returned
     and s.m > 0
     and exists (
       select 1
         from regexp_split_to_table(side.body, ' … ') frag
        where btrim(regexp_replace(frag, '\s+', ' ', 'g')) <> ''
          and position(btrim(regexp_replace(frag, '\s+', ' ', 'g'))
                       in case when s.labelled then side.post else side.pre end) = 0
     );
  if v_bad is not null then
    v_fail := v_fail || format('(d) unlabelled notes: %s', array_to_string(v_bad, ', '));
  end if;

  -- once ---------------------------------------------------------------------------------------
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_post_embed_checks: PASS' as result,
       (select count(*) from bb_files where superseded_by is null) as current_files,
       (select count(*) from bb_file_text t join bb_files f on f.id = t.file_id
         where f.superseded_by is null) as current_units;

rollback;
