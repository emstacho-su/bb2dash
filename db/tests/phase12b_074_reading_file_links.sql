-- bb2dash :: db/tests/phase12b_074_reading_file_links.sql
-- Phase 12b, item M-2 (P-materials-2). Tests migration 074:
--   * `reading_match_tokens(text)` - the shared, immutable normaliser;
--   * `link_reading_files(bigint)` - link a `readings`-bucket file to its reading when exactly one
--     reading matches, raise an Inbox row when several do, do nothing when none does;
--   * the backfill 074 ran once: the two GEO.103 files that already had a reading on Blackboard
--     (Roberts / Vox and Robbins / Political Economy) now carry `reading_id`;
--   * `stage_files` runs the same step on every fold;
--   * a replay writes nothing: 0 new links, 0 new Inbox rows.
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. The file opens its own
-- transaction and its last statement is `rollback`: the two synthetic readings and the two
-- synthetic files in section 5 never survive it.

begin;

-- =============================================================================================
-- 1. reading_match_tokens: shape, immutability, and the documented normalisation
-- =============================================================================================
do $$
declare v_vol text;
begin
  if to_regprocedure('public.reading_match_tokens(text)') is null then
    raise exception 'FAIL reading_match_tokens(text) does not exist';
  end if;
  select case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end
    into v_vol from pg_proc p where p.oid = 'public.reading_match_tokens(text)'::regprocedure;
  if v_vol <> 'immutable' then
    raise exception 'FAIL reading_match_tokens is %, expected immutable', v_vol;
  end if;

  -- Lowercased, punctuation and curly quotes are separators, tokens under 3 characters and the
  -- stopword list are dropped, the result is sorted and deduplicated.
  if reading_match_tokens('Robbins et al., Ch. 7 "Political Economy," Environment and Society')
     <> array['economy','environment','political','robbins','society'] then
    raise exception 'FAIL reading_match_tokens gave % for the Robbins citation',
      reading_match_tokens('Robbins et al., Ch. 7 "Political Economy," Environment and Society');
  end if;
  if reading_match_tokens(null) <> array[]::text[] or reading_match_tokens('a of 7') <> array[]::text[] then
    raise exception 'FAIL reading_match_tokens does not return an empty array for empty input';
  end if;
end $$;

-- =============================================================================================
-- 2. The backfill landed: the two known pairs, keyed by file name not by generated id
-- =============================================================================================
do $$
declare r record;
begin
  for r in
    select 'Roberts-The best way to reduce your personal carbon emissions_ don''t be rich - Vox.pdf' as fname,
           'Roberts (2017), "The best way to reduce carbon emissions? Don''t be rich." Vox'         as cite
    union all
    select 'Robbins-Political-Economy-Cleaned-OCR.pdf',
           'Robbins et al., Ch. 7 "Political Economy," Environment and Society'
  loop
    if not exists (select 1 from bb_files f join readings rd on rd.id = f.reading_id
                    where f.file_name = r.fname and rd.citation = r.cite) then
      raise exception 'FAIL "%" is not linked to the reading "%"', r.fname, r.cite;
    end if;
  end loop;

  -- The two GEO.103 reading-QUESTION documents are not readings and must stay unlinked.
  if exists (select 1 from bb_files
              where file_name in ('GEO 103 Population Reading Questions.docx',
                                  'GEO 103 (2026) - Reducing Environmental Impact- Individual v. Collective Action.doc')
                and reading_id is not null) then
    raise exception 'FAIL a GEO.103 reading-questions document was linked to a reading';
  end if;
end $$;

-- =============================================================================================
-- 3. stage_files runs the link step on every fold
-- =============================================================================================
do $$
begin
  if to_regprocedure('public.link_reading_files(bigint)') is null then
    raise exception 'FAIL link_reading_files(bigint) does not exist';
  end if;
  if pg_get_functiondef('public.stage_files(uuid,bigint)'::regprocedure) not like '%link_reading_files%' then
    raise exception 'FAIL stage_files does not call link_reading_files';
  end if;
  if position('reading_links' in
        pg_get_functiondef('public.stage_files(uuid,bigint)'::regprocedure)) = 0 then
    raise exception 'FAIL stage_files does not report the link step in its counts';
  end if;
end $$;

-- =============================================================================================
-- 4. Replay writes nothing
-- =============================================================================================
do $$
declare v jsonb;
begin
  v := link_reading_files(null);
  if (v->>'linked')::int <> 0 or (v->>'attention_raised')::int <> 0 then
    raise exception 'FAIL a replay over settled data wrote something: %', v;
  end if;
end $$;

-- =============================================================================================
-- 5. One candidate links; several raise an Inbox row; the file is left alone either way
-- =============================================================================================
insert into readings (course_id, citation, for_date, required, on_blackboard, source, confidence)
values ('IST.471', 'Zorblatt Quantum Widget Analysis, Part 1', date '2026-10-01', true, true, 'manual', 'tentative'),
       ('IST.471', 'Zorblatt Quantum Widget Analysis, Part 2', date '2026-10-02', true, true, 'manual', 'tentative'),
       ('IST.471', 'Frobnicator Handbook, Chapter Nine',       date '2026-10-03', true, true, 'manual', 'tentative');

insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
select c.bb_course_id, 'IST.471', 'readings', f.fname, f.url, 'rule', now()
  from courses c,
       (values ('Zorblatt Quantum Widget Analysis.pdf', 'https://example.invalid/_074_probe_ambiguous'),
               ('Frobnicator Handbook Chapter Nine.pdf', 'https://example.invalid/_074_probe_unique'))
         as f(fname, url)
 where c.id = 'IST.471';

do $$
declare
  v jsonb;
  v_ambiguous_file bigint;
  v_unique_file    bigint;
begin
  select id into v_ambiguous_file from bb_files where source_url = 'https://example.invalid/_074_probe_ambiguous';
  select id into v_unique_file    from bb_files where source_url = 'https://example.invalid/_074_probe_unique';

  v := link_reading_files(null);
  if (v->>'linked')::int <> 1 or (v->>'ambiguous')::int <> 1 or (v->>'attention_raised')::int <> 1 then
    raise exception 'FAIL expected 1 link, 1 ambiguity and 1 new Inbox row, got %', v;
  end if;

  if (select reading_id from bb_files where id = v_ambiguous_file) is not null then
    raise exception 'FAIL the two-candidate file was linked anyway';
  end if;
  if (select rd.citation from bb_files f join readings rd on rd.id = f.reading_id where f.id = v_unique_file)
     is distinct from 'Frobnicator Handbook, Chapter Nine' then
    raise exception 'FAIL the single-candidate file did not link to its reading';
  end if;

  if not exists (select 1 from attention_items
                  where kind = 'stack_must_confirm' and entity = 'bb_file'
                    and ref = 'reading_link/' || v_ambiguous_file::text
                    and field = 'reading_id' and state = 'open') then
    raise exception 'FAIL no open Inbox row was raised for the ambiguous file';
  end if;

  -- And a second pass over the same state writes nothing new.
  v := link_reading_files(null);
  if (v->>'linked')::int <> 0 or (v->>'attention_raised')::int <> 0 then
    raise exception 'FAIL the second pass wrote something: %', v;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_074_reading_file_links: PASS'                                      as result,
       (select count(*) from bb_files where bucket = 'readings')                    as readings_bucket_files,
       (select count(*) from bb_files where bucket = 'readings' and reading_id is null) as still_unlinked,
       (select count(*) from readings rd
         where rd.on_blackboard
           and not exists (select 1 from bb_files f where f.reading_id = rd.id))    as on_bb_without_file;

rollback;
