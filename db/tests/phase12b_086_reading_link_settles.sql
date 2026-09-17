-- bb2dash :: db/tests/phase12b_086_reading_link_settles.sql
-- Phase 12b round 3, CR-2. Tests migration 086: the ambiguous reading-link question can be
-- settled, and once settled it never comes back.
--
-- 074 raised a `stack_must_confirm` row that nothing could answer: `apply_resolutions()` only
-- writes assignments, `raise_attention`'s do-not-re-ask rules cover only missing/data_gap and
-- "Keep mine" conflicts, and the dedupe index is `where state = 'open'` - so resolving the row
-- made the next fold insert a fresh one, every two minutes, for ever.
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. The file opens its own
-- transaction and its last statement is `rollback`: the synthetic readings, files and Inbox rows
-- never survive it.

begin;

-- Two readings that match one file equally well, and two files that match both of them.
insert into readings (course_id, citation, for_date, required, on_blackboard, source, confidence)
values ('IST.471', 'Zorblatt Quantum Widget Analysis, Part 1', date '2026-10-01', true, true, 'manual', 'tentative'),
       ('IST.471', 'Zorblatt Quantum Widget Analysis, Part 2', date '2026-10-02', true, true, 'manual', 'tentative');

insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
select c.bb_course_id, 'IST.471', 'readings', f.fname, f.url, 'rule', now()
  from courses c,
       (values ('Zorblatt Quantum Widget Analysis.pdf',      'https://example.invalid/_086_answered'),
               ('Zorblatt Quantum Widget Analysis copy.pdf', 'https://example.invalid/_086_dismissed'))
         as f(fname, url)
 where c.id = 'IST.471';

-- =============================================================================================
-- 1. An answer is applied; a dismissal is respected; neither is ever asked again
-- =============================================================================================
do $$
declare
  v        jsonb;
  f_answer bigint;
  f_dismiss bigint;
  r_part1  bigint;
begin
  select id into f_answer  from bb_files where source_url = 'https://example.invalid/_086_answered';
  select id into f_dismiss from bb_files where source_url = 'https://example.invalid/_086_dismissed';
  select min(id) into r_part1 from readings where citation like 'Zorblatt%';

  -- Both files are ambiguous, so both are asked about, once each.
  v := link_reading_files(null);
  if (v->>'ambiguous')::int <> 2 or (v->>'attention_raised')::int <> 2 then
    raise exception 'FAIL the first pass did not raise both questions: %', v;
  end if;

  -- Stack answers one and dismisses the other, the way the Inbox writes a resolution.
  update attention_items
     set state = 'resolved', resolved_at = now(),
         resolution = jsonb_build_object('reading_id', r_part1),
         resolution_note = 'it is Part 1'
   where ref = 'reading_link/' || f_answer::text and state = 'open';
  update attention_items
     set state = 'dismissed', resolved_at = now(),
         resolution = jsonb_build_object('accept', 'none'),
         resolution_note = 'not one of these readings'
   where ref = 'reading_link/' || f_dismiss::text and state = 'open';

  v := link_reading_files(null);
  if (v->>'applied')::int <> 1 or (v->>'settled')::int <> 1 or (v->>'attention_raised')::int <> 0 then
    raise exception 'FAIL the answers were not honoured: %', v;
  end if;
  if (select reading_id from bb_files where id = f_answer) is distinct from r_part1 then
    raise exception 'FAIL the answer did not set bb_files.reading_id';
  end if;
  if (select reading_id from bb_files where id = f_dismiss) is not null then
    raise exception 'FAIL a dismissal linked the file anyway';
  end if;
  if exists (select 1 from attention_items
              where ref in ('reading_link/' || f_answer::text, 'reading_link/' || f_dismiss::text)
                and state = 'open') then
    raise exception 'FAIL a settled question came straight back - this is the bug CR-2 reported';
  end if;

  -- And a third fold - what the two-minute tick does all day - writes nothing at all.
  v := link_reading_files(null);
  if (v->>'applied')::int <> 0 or (v->>'linked')::int <> 0 or (v->>'attention_raised')::int <> 0 then
    raise exception 'FAIL a replay wrote something: %', v;
  end if;
end $$;

-- =============================================================================================
-- 2. A changed candidate set is a new question, asked once
-- =============================================================================================
do $$
declare
  v         jsonb;
  f_answer  bigint;
  f_dismiss bigint;
begin
  select id into f_answer  from bb_files where source_url = 'https://example.invalid/_086_answered';
  select id into f_dismiss from bb_files where source_url = 'https://example.invalid/_086_dismissed';

  insert into readings (course_id, citation, for_date, required, on_blackboard, source, confidence)
  values ('IST.471', 'Zorblatt Quantum Widget Analysis, Part 3', date '2026-10-03', true, true, 'manual', 'tentative');

  v := link_reading_files(null);
  if (v->>'attention_raised')::int <> 1 or (v->>'settled')::int <> 0 then
    raise exception 'FAIL a new candidate should have raised exactly one question: %', v;
  end if;
  if (select count(*) from attention_items
       where ref = 'reading_link/' || f_dismiss::text and state = 'open') <> 1 then
    raise exception 'FAIL the dismissed file was not re-asked about the new candidate set';
  end if;
  -- The answered file is linked, so it is out of the loop's `reading_id is null` filter and
  -- cannot be asked about by any route.
  if exists (select 1 from attention_items
              where ref = 'reading_link/' || f_answer::text and state = 'open') then
    raise exception 'FAIL a linked file was asked about again';
  end if;
end $$;

-- =============================================================================================
-- 3. The real corpus is untouched: 074's two links still stand, nothing new is asked
-- =============================================================================================
do $$
declare v jsonb;
begin
  if (select count(*) from bb_files f join readings r on r.id = f.reading_id
       where f.file_name in ('Roberts-The best way to reduce your personal carbon emissions_ don''t be rich - Vox.pdf',
                             'Robbins-Political-Economy-Cleaned-OCR.pdf')) <> 2 then
    raise exception 'FAIL 086 disturbed the two links 074 made';
  end if;
  v := link_reading_files(null);
  if (v->>'linked')::int <> 0 then
    raise exception 'FAIL 086 linked something on a settled corpus: %', v;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_086_reading_link_settles: PASS'                                    as result,
       (select count(*) from bb_files where bucket = 'readings' and reading_id is not null) as linked_files,
       (select count(*) from attention_items
         where kind = 'stack_must_confirm' and entity = 'bb_file' and state = 'open')       as open_link_questions;

rollback;
