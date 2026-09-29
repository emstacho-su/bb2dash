-- bb2dash :: db/tests/phase17_150_no_appendix_b.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), round 3, R3-6b. Worker W-44.
-- Tests migration 150: no current extracted text unit carries IST.323's Final Project
-- "Appendix B: AI Use Statement" or an item naming it, the appendix PDF (file 13) has no text
-- units, and no embedding points past the end of its unit. A re-pull or re-extraction that brings
-- the appendix back into the corpus fails this file.
--
-- Read-only. RUN IT: `node scripts/db-test.mjs --only phase17_150_no_appendix_b.sql`, or paste the
-- whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

do $$
declare
  v_fail text[] := '{}';
  v_bad  text;
begin
  select string_agg(format('%s (%s, %s)', t.id, f.course_id, f.file_name), '; ' order by t.id) into v_bad
    from bb_file_text t
    join bb_files f on f.id = t.file_id
   where f.superseded_by is null
     and t.text ~* 'AI use statement';
  if v_bad is not null then
    v_fail := v_fail || format('current units still carry Appendix B: %s', v_bad);
  end if;

  select string_agg(t.id::text, ', ' order by t.id) into v_bad
    from bb_file_text t
    join bb_files f on f.id = t.file_id
   where f.superseded_by is null
     and f.file_name ~* 'appendix[ _]b';
  if v_bad is not null then
    v_fail := v_fail || format('an Appendix B file has extracted text units again: %s', v_bad);
  end if;

  select string_agg(distinct e.text_id::text, ', ') into v_bad
    from bb_text_embeddings e
    join bb_file_text t on t.id = e.text_id
   where upper(e.part_range) > t.char_count;
  if v_bad is not null then
    v_fail := v_fail || format('embeddings point past the end of units %s', v_bad);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_150: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase17_150_no_appendix_b: PASS'                                                as result,
       (select count(*) from bb_file_text t join bb_files f on f.id = t.file_id
         where f.superseded_by is null and f.course_id = 'IST.323')                      as ist323_units;

rollback;
