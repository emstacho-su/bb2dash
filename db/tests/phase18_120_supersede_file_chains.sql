-- bb2dash :: db/tests/phase18_120_supersede_file_chains.sql
-- Phase 18 (brief 98), task 6. Worker W-48. The end state migration 120 writes (P-26, R-63):
--   * bb_files 2 -> 151 and 74 -> 149
--   * 151 in the syllabus bucket, classified_by 'agent', with file 2's confidence
--   * IST.323's syllabus_path is the V1.4 key
--   * keyword search for "syllabus" in IST.323 no longer returns file 2
-- Collects every failure and raises once. Writes nothing.
-- RUN IT: `node scripts/db-test.mjs --only phase18_120_supersede_file_chains.sql`.

begin;

do $$
declare
  v_fail text[] := array[]::text[];
  v_got text;
begin
  select string_agg(format('%s->%s', id, coalesce(superseded_by::text, 'null')), ', ' order by id)
    into v_got from bb_files where id in (2, 74);
  if v_got is distinct from '2->151, 74->149' then
    v_fail := v_fail || format('chains: %s', v_got);
  end if;

  select bucket::text into v_got from bb_files where id = 151;
  if v_got is distinct from 'syllabus_policy' then
    v_fail := v_fail || format('151 bucket: %s', v_got);
  end if;

  if not coalesce((select f.classified_by = 'agent'
                          and f.classification_confidence
                              = (select g.classification_confidence from bb_files g where g.id = 2)
                     from bb_files f where f.id = 151), false) then
    v_fail := v_fail || format('151 classification: %s',
      (select format('%s/%s', classified_by, classification_confidence) from bb_files where id = 151));
  end if;

  select syllabus_path into v_got from courses where id = 'IST.323';
  if v_got is distinct from 'IST.323/323Fall26V1.4.docx' then
    v_fail := v_fail || format('IST.323 syllabus_path: %s', v_got);
  end if;

  if (select count(*) from search_file_text('syllabus', 'IST.323', 50, false) where file_id = 2) <> 0 then
    v_fail := v_fail || 'search still returns file 2'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_120_supersede_file_chains: PASS' as result;

rollback;
