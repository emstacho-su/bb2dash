-- bb2dash :: db/tests/phase12b_085_stage_attempts_v4.sql
-- Phase 12b, item G-7a (P-grades-4, P-grades-5). Tests migration 085: `stage_attempts` folds the
-- crawler v4 attempts chain, keeps the mime type Blackboard now gives us, leaves Stack's prose in
-- `raw` alone, and still folds a v3 payload without error.
--
-- RUN IT after the loader, in ONE transaction:
--   cat db/tests/phase12b_load_fixture.sql db/tests/phase12b_085_stage_attempts_v4.sql \
--     | psql "$DATABASE_URL"
-- or paste the same concatenation into one execute_sql call through the Supabase MCP. The loader
-- opens the transaction; this file's last statement is `rollback`, so nothing it writes survives.

-- =============================================================================================
-- 1. Fold the fixture crawl
-- =============================================================================================
do $$
declare
  r jsonb;
  c jsonb;
begin
  r := stage_attempts((select run_id from _fx), (select sync_run_id from _fx));
  if r->>'status' <> 'ok' then
    raise exception 'FAIL the stage failed on the v4 fixture: %', r;
  end if;
  c := r->'counts';

  -- 4 chained columns in the v4 shell + 2 probed columns in the v3 shell.
  if (c->>'columns_probed')::int <> 6 then
    raise exception 'FAIL columns_probed = %, expected 6', c->>'columns_probed';
  end if;
  -- The 403 at step 1 and the 500 at step 3 are the two non-2xx entries; the v3 shell's two
  -- columns answered 200 with nothing, which is not an error.
  if (c->>'errors')::int <> 2 then
    raise exception 'FAIL errors = %, expected 2', c->>'errors';
  end if;
  if (c->>'attempts_seen')::int <> 4 or (c->>'inserted')::int <> 4 then
    raise exception 'FAIL attempts_seen / inserted = % / %, expected 4 / 4',
      c->>'attempts_seen', c->>'inserted';
  end if;
  if (c->>'files_catalogued')::int <> 4 then
    raise exception 'FAIL files_catalogued = %, expected 4', c->>'files_catalogued';
  end if;
end $$;

-- =============================================================================================
-- 2. The attempts themselves
-- =============================================================================================
do $$
declare a record;
begin
  if (select count(*) from bb_attempts where run_id = (select run_id from _fx)) <> 4 then
    raise exception 'FAIL % attempt rows, expected 4',
      (select count(*) from bb_attempts where run_id = (select run_id from _fx));
  end if;

  select * into a from bb_attempts
   where run_id = (select run_id from _fx) and attempt_id = '_8100002_1';
  if not found then
    raise exception 'FAIL the newest quiz attempt was not folded';
  end if;
  if a.course_id <> 'IST.323' or a.column_id <> '_3560530_1' or a.status <> 'COMPLETED' then
    raise exception 'FAIL the attempt landed as % / % / %', a.course_id, a.column_id, a.status;
  end if;
  -- attemptReceipt.submissionDate, not attemptDate: the receipt is when Blackboard took it.
  if a.submitted_bb is distinct from timestamptz '2026-09-08T18:05:44.000Z'
     or a.created_bb is distinct from timestamptz '2026-09-08T17:44:19.000Z'
     or a.modified_bb is distinct from timestamptz '2026-09-09T13:12:40.000Z' then
    raise exception 'FAIL the v4 dates did not map: created=%, submitted=%, modified=%',
      a.created_bb, a.submitted_bb, a.modified_bb;
  end if;
  -- displayGrade.score, read through a path rather than a bare key.
  if a.score is distinct from 9.5 then
    raise exception 'FAIL score = %, expected 9.5', a.score;
  end if;
  if a.receipt is distinct from 'RCPT-000000A2' then
    raise exception 'FAIL receipt = %', a.receipt;
  end if;
  if a.exempt is distinct from false then
    raise exception 'FAIL exempt = %', a.exempt;
  end if;

  -- The prose is in `raw` and in no column of its own.
  if a.feedback is not null or a.student_comments is not null or a.student_submission is not null then
    raise exception 'FAIL prose reached a column: feedback=%, comments=%, submission=%',
      a.feedback, a.student_comments, a.student_submission;
  end if;
  if a.raw->'text'->>'studentSubmission' is distinct from 'Second pass, appendix attached.'
     or a.raw->'text'->>'studentComments' is distinct from 'Resubmitting with the appendix I left out.' then
    raise exception 'FAIL the prose is not in raw either: %', a.raw->'text';
  end if;

  -- The attempt whose detail request failed is still recorded, from the step-2 list row.
  select * into a from bb_attempts
   where run_id = (select run_id from _fx) and attempt_id = '_8100005_1';
  if not found or a.submitted_bb is distinct from timestamptz '2026-09-14T05:13:57.000Z' then
    raise exception 'FAIL the detail-failure attempt was lost or mis-dated';
  end if;
end $$;

-- =============================================================================================
-- 3. The files: the mime type 085 adds, the durable URL, and the ambiguous column
-- =============================================================================================
do $$
declare
  n int;
  f record;
begin
  select count(*) into n from bb_files
   where run_id = (select run_id from _fx) and bucket = 'my_submissions';
  if n <> 4 then
    raise exception 'FAIL % submission files catalogued, expected 4', n;
  end if;

  -- Every one is a durable bbcswebdav URL, not v3's built download route.
  if exists (select 1 from bb_files
              where run_id = (select run_id from _fx)
                and source_url !~ '^https://blackboard\.syracuse\.edu/bbcswebdav/xid-\d+_\d+$') then
    raise exception 'FAIL a submission file was catalogued under a URL a student cannot use';
  end if;

  -- 085's change: the mime type is stored, not thrown away.
  if exists (select 1 from bb_files where run_id = (select run_id from _fx) and mime_type is null) then
    raise exception 'FAIL % submission file(s) have no mime_type',
      (select count(*) from bb_files where run_id = (select run_id from _fx) and mime_type is null);
  end if;

  select * into f from bb_files
   where run_id = (select run_id from _fx) and file_name = 'unit-one-appendix.pdf';
  if not found or f.mime_type <> 'application/pdf' then
    raise exception 'FAIL the appendix mime type is %', coalesce(f.mime_type, 'null');
  end if;
  if f.attempt_id <> '_8100002_1' or f.text_status <> 'na' or f.classified_by <> 'blackboard' then
    raise exception 'FAIL the appendix row is %, %, %', f.attempt_id, f.text_status, f.classified_by;
  end if;

  -- A column bound to exactly one assignment files under it...
  if (select count(*) from bb_files
       where run_id = (select run_id from _fx) and assignment_id = 'IST.323/quiz-01') <> 3 then
    raise exception 'FAIL the three quiz files did not file under IST.323/quiz-01';
  end if;
  -- ...and the column IST.323/fp-proposal and fp-log-final share files under neither.
  select * into f from bb_files
   where run_id = (select run_id from _fx) and file_name = 'term-plan.pdf';
  if not found or f.assignment_id is not null then
    raise exception 'FAIL the shared column filed its submission under %', f.assignment_id;
  end if;
end $$;

-- =============================================================================================
-- 4. A replay writes nothing, and the v3 shell folded without error
-- =============================================================================================
do $$
declare
  r jsonb;
  c jsonb;
begin
  r := stage_attempts((select run_id from _fx), (select sync_run_id from _fx));
  c := r->'counts';
  if r->>'status' <> 'ok' then
    raise exception 'FAIL the replay failed: %', r;
  end if;
  if (c->>'inserted')::int <> 0 or (c->>'files_catalogued')::int <> 0 then
    raise exception 'FAIL a replay wrote % attempt(s) and % file(s)',
      c->>'inserted', c->>'files_catalogued';
  end if;

  -- The v3 shell is in the same run and contributed its two probed columns and nothing else.
  if exists (select 1 from bb_attempts
              where run_id = (select run_id from _fx) and course_id = 'ECN.304') then
    raise exception 'FAIL the v3 payload invented an attempt';
  end if;
end $$;

-- =============================================================================================
-- 5. The function reads the v4 mime type and still reads v3's top-level prose keys
-- =============================================================================================
do $$
declare def text;
begin
  def := pg_get_functiondef('public.stage_attempts(uuid,bigint)'::regprocedure);
  if position('f->>''mime''' in def) = 0 or position('d.mime_type' in def) = 0 then
    raise exception 'FAIL stage_attempts does not carry the file mime type through';
  end if;
  -- Kept for a v3 replay. A v4 payload has no such top-level key, which is why the columns above
  -- came out null while the text is in raw.
  if position('r->>''studentSubmission''' in def) = 0
     or position('r->>''studentComments''' in def) = 0
     or position('r->>''feedback''' in def) = 0 then
    raise exception 'FAIL stage_attempts stopped reading v3 prose; a v3 replay would lose it';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_085_stage_attempts_v4: PASS'                                       as result,
       (select count(*) from bb_attempts where run_id = (select run_id from _fx))   as attempts,
       (select count(*) from bb_files
         where run_id = (select run_id from _fx) and bucket = 'my_submissions')     as submission_files,
       (select count(distinct mime_type) from bb_files
         where run_id = (select run_id from _fx))                                   as mime_types;

rollback;
