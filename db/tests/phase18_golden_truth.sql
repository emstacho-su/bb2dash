-- bb2dash :: db/tests/phase18_golden_truth.sql
-- Phase 18 (brief 98), task 22. Worker W-49. The eval's ground truth still holds on prod data.
-- THE RULE (115): a truth file is the file named OR the current end of its supersession chain
-- (follow superseded_by until null, depth limit 20). A course re-posts a document and each re-post
-- supersedes the last, so a truth that named files by id would go stale at every re-post; the unit
-- resolves each named id to its chain end first, and the checks run on that:
--   * every truth file exists (an id that is not in bb_files fails) and its chain ends within 20
--     steps; the end is current by construction (superseded_by is null)
--   * every truth text_id exists, belongs to one of the row's truth files (named or chain end), and
--     contains the row's answer_phrase
--   * a file-only truth (no text_ids) has at least one unit that contains the answer_phrase, and
--     names every current file of that course whose text carries it
-- A named truth file that has itself been superseded is not a failure here. It is reported as a
-- NOTE (a raise notice, and the `note` column of the PASS row) because ingest/eval/golden_set.json
-- and ingest/eval_search.mjs cannot follow a chain: the eval reaches prod only through the `search`
-- edge function, which hides superseded files, so a stale id there can never score a hit. When this
-- unit prints that NOTE, refresh the row's file ids in golden_set.json AND in the row below to the
-- chain ends it names.
-- Q7's truth is the two current IST.466 schedules, both carrying the answer: since the re-posts of
-- 2026-10, 2509 (the end of 74 > 149 > 2509) and 2773 (the end of 150 > 967 > 2640 > 2773, and of
-- 162's). Either may have no text until a sync pulls its bytes, which passes, because the checks
-- need only one truth file to carry the phrase. Q10 (the IST.323 AI-use disclosure) was
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
  v_ends bigint[];
  v_all bigint[];
  v_ok bigint[];
  v_stale text;
  v_notes text[] := array[]::text[];
begin
  for r in
    select * from (values
      (1, array[270]::bigint[], array[42]::bigint[], 'miss three lectures, no questions asked'),
      (2, array[270]::bigint[], array[42]::bigint[], 'drop your lowest quiz score'),
      (3, array[276]::bigint[], array[42]::bigint[], 'December 15th'),
      (4, array[213]::bigint[], array[23]::bigint[], 'Lowest Exam Grade'),
      (5, array[218]::bigint[], array[23]::bigint[], 'Exam 1'),
      (6, array[]::bigint[], array[21]::bigint[], 'less than 30 minutes'),
      (7, array[]::bigint[], array[2509, 2773]::bigint[], 'Deloitte to Visit'),
      (8, array[]::bigint[], array[27]::bigint[], 'penalty of 20%'),
      (9, array[348]::bigint[], array[26]::bigint[], 'evaluation form will result in no credit')
    ) as g(qid, text_ids, file_ids, answer_phrase)
    order by qid
  loop
    -- the chain end of each named file: follow superseded_by until null, 20 steps at most
    with recursive chain(start_id, id, next_id, depth) as (
      select f.id, f.id, f.superseded_by, 0 from bb_files f where f.id = any(r.file_ids)
      union all
      select c.start_id, f.id, f.superseded_by, c.depth + 1
        from chain c join bb_files f on f.id = c.next_id
       where c.depth < 20
    )
    select array_agg(distinct id order by id) filter (where next_id is null),
           array_agg(distinct start_id order by start_id) filter (where next_id is null),
           string_agg(distinct start_id::text, ',') filter (where depth = 0 and next_id is not null)
      into v_ends, v_ok, v_stale
      from chain;
    v_ends := coalesce(v_ends, array[]::bigint[]);
    v_ok := coalesce(v_ok, array[]::bigint[]);

    select string_agg(x::text, ',' order by x) into v_bad
      from unnest(r.file_ids) x
     where not exists (select 1 from bb_files f where f.id = x);
    if v_bad is not null then
      v_fail := v_fail || format('Q%s file does not exist: %s', r.qid, v_bad);
    end if;
    select string_agg(x::text, ',' order by x) into v_bad
      from unnest(r.file_ids) x
     where exists (select 1 from bb_files f where f.id = x) and not (x = any(v_ok));
    if v_bad is not null then
      v_fail := v_fail || format('Q%s file chain has no end within 20 steps: %s', r.qid, v_bad);
    end if;
    if v_stale is not null then
      v_notes := v_notes || format('Q%s names superseded file(s) %s; chain end(s) %s - refresh golden_set.json and this row',
                                   r.qid, v_stale, array_to_string(v_ends, ','));
    end if;
    -- the truth files: the ones named and the chain ends
    v_all := array(select distinct u from unnest(r.file_ids || v_ends) u);

    select string_agg(x::text, ',' order by x) into v_bad
      from unnest(r.text_ids) x
     where not exists (select 1 from bb_file_text t
                        where t.id = x and t.file_id = any(v_all)
                          and position(r.answer_phrase in t.text) > 0);
    if v_bad is not null then
      v_fail := v_fail || format('Q%s text without its phrase or outside its files: %s', r.qid, v_bad);
    end if;

    if cardinality(r.text_ids) = 0
       and not exists (select 1 from bb_file_text t
                        where t.file_id = any(v_all) and position(r.answer_phrase in t.text) > 0) then
      v_fail := v_fail || format('Q%s no unit of files %s carries its phrase', r.qid, array_to_string(v_all, ','));
    end if;
    -- A file truth is the SET of current files carrying the answer (EVAL_EMBEDDING_POC.md §1: "a
    -- file_id set ... when several near-duplicate files carry the same answer"), so a current file
    -- of the same course that carries the phrase and is missing from the set is a truth defect.
    if cardinality(r.text_ids) = 0 then
      select string_agg(distinct f.id::text, ',') into v_bad
        from bb_files f join bb_file_text t on t.file_id = f.id
       where f.superseded_by is null and not (f.id = any(v_all))
         and f.course_id in (select course_id from bb_files where id = any(v_all))
         and position(r.answer_phrase in t.text) > 0;
      if v_bad is not null then
        v_fail := v_fail || format('Q%s current file carries the phrase but is not in the truth: %s', r.qid, v_bad);
      end if;
    end if;
  end loop;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
  -- not a failure: the maintainer's cue that the eval's ids need the refresh the header names
  if cardinality(v_notes) > 0 then
    raise notice 'NOTE %', array_to_string(v_notes, '; ');
  end if;
  perform set_config('bb2dash.golden_note', array_to_string(v_notes, '; '), true);
end $$;

select 'phase18_golden_truth: PASS' as result,
       nullif(current_setting('bb2dash.golden_note', true), '') as note;

rollback;
