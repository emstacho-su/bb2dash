-- bb2dash :: db/tests/phase18_golden_truth.sql
-- Phase 18 (brief 98), task 22. Worker W-49. The eval's ground truth still holds on prod data:
--   * every truth file exists and is current (superseded_by is null)
--   * every truth text_id exists, belongs to one of the row's truth files, and contains the
--     row's answer_phrase
--   * a file-only truth (no text_ids) has at least one unit that contains the answer_phrase, and
--     names every current file of that course whose text carries it
-- Q7's truth is the two current IST.466 schedules (149, and 150 posted in a second place, both
-- carrying the answer) since migration 120 superseded 74. Q10 (the IST.323 AI-use disclosure) was
-- removed on 2026-09-29 by Stack's call to take the AI policy out of the app and the corpus (Phase 17
-- migration 119), not for its ranking.
-- The truth rows below are the same as ingest/eval/golden_set.json; ingest/eval_search.test.mjs
-- parses both and fails on any drift. Keep one truth row per line, in this exact shape.
-- Collects every failure and raises once. Writes nothing.
-- RUN IT: `node scripts/db-test.mjs --only phase18_golden_truth.sql`.

begin;

do $$
declare
  v_fail text[] := array[]::text[];
  r record;
  v_bad text;
begin
  for r in
    select * from (values
      (1, array[270]::bigint[], array[42]::bigint[], 'miss three lectures, no questions asked'),
      (2, array[270]::bigint[], array[42]::bigint[], 'drop your lowest quiz score'),
      (3, array[276]::bigint[], array[42]::bigint[], 'December 15th'),
      (4, array[213]::bigint[], array[23]::bigint[], 'Lowest Exam Grade'),
      (5, array[218]::bigint[], array[23]::bigint[], 'Exam 1'),
      (6, array[]::bigint[], array[21]::bigint[], 'less than 30 minutes'),
      (7, array[]::bigint[], array[149, 150]::bigint[], 'Deloitte to Visit'),
      (8, array[]::bigint[], array[27]::bigint[], 'penalty of 20%'),
      (9, array[348]::bigint[], array[26]::bigint[], 'evaluation form will result in no credit')
    ) as g(qid, text_ids, file_ids, answer_phrase)
    order by qid
  loop
    select string_agg(x::text, ',' order by x) into v_bad
      from unnest(r.file_ids) x
     where not exists (select 1 from bb_files f where f.id = x and f.superseded_by is null);
    if v_bad is not null then
      v_fail := v_fail || format('Q%s file not current: %s', r.qid, v_bad);
    end if;

    select string_agg(x::text, ',' order by x) into v_bad
      from unnest(r.text_ids) x
     where not exists (select 1 from bb_file_text t
                        where t.id = x and t.file_id = any(r.file_ids)
                          and position(r.answer_phrase in t.text) > 0);
    if v_bad is not null then
      v_fail := v_fail || format('Q%s text without its phrase or outside its files: %s', r.qid, v_bad);
    end if;

    if cardinality(r.text_ids) = 0
       and not exists (select 1 from bb_file_text t
                        where t.file_id = any(r.file_ids) and position(r.answer_phrase in t.text) > 0) then
      v_fail := v_fail || format('Q%s no unit of files %s carries its phrase', r.qid, array_to_string(r.file_ids, ','));
    end if;
    -- A file truth is the SET of current files carrying the answer (EVAL_EMBEDDING_POC.md §1: "a
    -- file_id set ... when several near-duplicate files carry the same answer"), so a current file
    -- of the same course that carries the phrase and is missing from the set is a truth defect.
    if cardinality(r.text_ids) = 0 then
      select string_agg(distinct f.id::text, ',') into v_bad
        from bb_files f join bb_file_text t on t.file_id = f.id
       where f.superseded_by is null and not (f.id = any(r.file_ids))
         and f.course_id in (select course_id from bb_files where id = any(r.file_ids))
         and position(r.answer_phrase in t.text) > 0;
      if v_bad is not null then
        v_fail := v_fail || format('Q%s current file carries the phrase but is not in the truth: %s', r.qid, v_bad);
      end if;
    end if;
  end loop;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_golden_truth: PASS' as result;

rollback;
