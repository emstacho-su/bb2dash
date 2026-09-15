-- bb2dash :: db/tests/phase10a_stage_attempts.sql
-- Phase 10a. Tests migration 050 (bb_attempts + stage_attempts + the two attempt views) and the
-- bb_files changes from 048/049, against the committed fixtures.
--
-- RUN IT (the loader opens the transaction; this file closes it with a rollback):
--
--   cat db/tests/phase10a_load_fixtures.sql db/tests/phase10a_stage_attempts.sql \
--     | psql "$DATABASE_URL"
--
-- or paste that same concatenation into one `execute_sql` call through the Supabase MCP.
--
-- NOTHING IS COMMITTED. The last statement is `rollback`.
--
-- THE FIXTURE IS SYNTHETIC and says so in its own `_note`: no crawl on record carries an
-- `attempts` key, because the probe ships with crawler version 3 and has never run against a live
-- Blackboard session. The column ids, the course and the assignment links are real; the attempts,
-- files and receipts are invented. What this file proves is that the stage reads the FROZEN shape
-- correctly - not that Blackboard's real key names are what the fixture guesses. That is settled
-- by the `keys` probe after Stack's acceptance crawl; see docs/planning/66_W17_VERIFICATION.md.

-- =============================================================================================
-- 0. Gradebook first, exactly as the driver orders it
-- =============================================================================================
-- stage_attempts depends on nothing from the gradebook, but v_assignment_attempts reads
-- attempts_allowed out of v_gradebook_latest, so the run has to be folded in the driver's order
-- for the view to have anything to say.
do $$
declare v_run uuid; v_sync bigint;
begin
  select run_id, sync_run_id into v_run, v_sync from _fx;
  if stage_gradebook(v_run, v_sync)->>'status' <> 'ok' then
    raise exception 'FAIL stage_gradebook did not succeed; the attempts test cannot be trusted';
  end if;
end $$;

-- =============================================================================================
-- 1. The stage runs and reports what the fixture contains
-- =============================================================================================
do $$
declare v_run uuid; v_sync bigint; r jsonb; c jsonb;
begin
  select run_id, sync_run_id into v_run, v_sync from _fx;
  r := stage_attempts(v_run, v_sync);
  c := r->'counts';

  if r->>'status' <> 'ok' then
    raise exception 'FAIL stage_attempts status = % (%)', r->>'status', r->>'error';
  end if;
  if (c->>'columns_probed')::int <> 4 then
    raise exception 'FAIL columns_probed = %, expected 4', c->>'columns_probed';
  end if;
  if (c->>'attempts_seen')::int <> 4 then
    raise exception 'FAIL attempts_seen = %, expected 4 (2 on Quiz #1, 1 each on two more)',
      c->>'attempts_seen';
  end if;
  if (c->>'inserted')::int <> 4 then
    raise exception 'FAIL inserted = %, expected 4', c->>'inserted';
  end if;
  if (c->>'files_catalogued')::int <> 3 then
    raise exception 'FAIL files_catalogued = %, expected 3 (one attempt carries no file at all)',
      c->>'files_catalogued';
  end if;
  -- The Lab #1 probe came back 403. A column whose attempts call failed returns an empty
  -- `results` array, so it has to be counted here or it disappears from the record entirely.
  if (c->>'errors')::int <> 1 then
    raise exception 'FAIL errors = %, expected 1 (the 403 on _3560541_1)', c->>'errors';
  end if;
end $$;

-- =============================================================================================
-- 2. The attempt rows themselves
-- =============================================================================================
do $$
declare v_run uuid; v text; n int; t timestamptz;
begin
  select run_id into v_run from _fx;

  select status into v from bb_attempts where run_id = v_run and attempt_id = '_8100001_1';
  if v <> 'COMPLETED' then raise exception 'FAIL attempt 1 status = %, expected COMPLETED verbatim', v; end if;

  select submitted_bb into t from bb_attempts where run_id = v_run and attempt_id = '_8100001_1';
  if t is distinct from '2026-08-31T22:51:49.847Z'::timestamptz then
    raise exception 'FAIL attempt 1 submitted_bb = %', t;
  end if;

  -- An in-progress attempt has no submitted timestamp. Null is the answer, not "now".
  select submitted_bb into t from bb_attempts where run_id = v_run and attempt_id = '_8100004_1';
  if t is not null then raise exception 'FAIL an IN_PROGRESS attempt has submitted_bb = %', t; end if;

  -- The receipt is captured and never rendered (Stack's answer 1).
  select receipt into v from bb_attempts where run_id = v_run and attempt_id = '_8100001_1';
  if v <> '0f2a7c91' then raise exception 'FAIL receipt = %', coalesce(v, '(null)'); end if;
  select receipt into v from bb_attempts where run_id = v_run and attempt_id = '_8100002_1';
  if v is not null then raise exception 'FAIL a payload with receipt null stored %', v; end if;

  -- Prose is stored verbatim, markup included. Escaping is the renderer's job; a mirror that
  -- rewrote an instructor's feedback would be lying about what was said.
  select feedback into v from bb_attempts where run_id = v_run and attempt_id = '_8100003_1';
  if v <> '<b>Received</b> & recorded -- see the rubric <a href="#">here</a>.' then
    raise exception 'FAIL feedback was altered: %', coalesce(v, '(null)');
  end if;

  select student_comments into v from bb_attempts where run_id = v_run and attempt_id = '_8100002_1';
  if v <> 'Resubmitting with the appendix I left out.' then
    raise exception 'FAIL student_comments = %', coalesce(v, '(null)');
  end if;

  -- The `keys` probe survives into raw, which is the whole point of keeping raw.
  select jsonb_array_length(raw->'keys') into n
    from bb_attempts where run_id = v_run and attempt_id = '_8100001_1';
  if coalesce(n, 0) = 0 then
    raise exception 'FAIL the keys probe did not reach bb_attempts.raw; one live crawl is supposed '
                    'to settle Blackboard''s real key names from there';
  end if;
end $$;

-- =============================================================================================
-- 3. The file catalogue
-- =============================================================================================
do $$
declare v_run uuid; f bb_files%rowtype; n int; v_keys int;
begin
  select run_id into v_run from _fx;

  select count(*) into n from bb_files
   where run_id = v_run and bucket = 'my_submissions' and classified_by = 'blackboard';
  if n <> 3 then raise exception 'FAIL % submission file row(s), expected 3', n; end if;

  -- A pulled-back file: the catalog entry exists, the bytes do not. stage_gaps already raises
  -- "in the catalog but its bytes were never stored" for exactly this, and bb-sync step 4b fills
  -- storage_path, local_path, bytes and sha256 in the logged-in tab.
  select * into f from bb_files where run_id = v_run and file_name = 'quiz1-attempt1.pdf';
  if f.storage_path is not null then raise exception 'FAIL the stage stored bytes; it must not'; end if;
  if f.attempt_id <> '_8100001_1' then raise exception 'FAIL attempt_id = %', coalesce(f.attempt_id,'(null)'); end if;
  if f.assignment_id <> 'IST.323/quiz-01' then
    raise exception 'FAIL assignment_id = %, expected IST.323/quiz-01', coalesce(f.assignment_id,'(null)');
  end if;
  if f.text_status <> 'na' then raise exception 'FAIL text_status = %', f.text_status; end if;
  if f.classification_confidence <> 1 then raise exception 'FAIL classification_confidence = %', f.classification_confidence; end if;
  -- Migration 052: a pulled-back file keys under its own attempt folder, so it can never land on
  -- the key of a file Stack staged under the same name, nor on an earlier attempt's copy.
  if bb_file_relpath(f.id) <> 'IST.323/my_submissions/quiz-01/attempt-81000011/quiz1-attempt1.pdf' then
    raise exception 'FAIL relpath = %', bb_file_relpath(f.id);
  end if;

  -- The ambiguous column: _3569973_1 is attached to two assignments, so its file is filed under
  -- NONE of them rather than under a coin toss, and its Storage key drops the assignment folder.
  select * into f from bb_files where run_id = v_run and file_name = 'fp-proposal.docx';
  if f.assignment_id is not null then
    raise exception 'FAIL an ambiguous column filed its submission under %', f.assignment_id;
  end if;
  if bb_file_relpath(f.id) <> 'IST.323/my_submissions/attempt-81000041/fp-proposal.docx' then
    raise exception 'FAIL relpath = %', bb_file_relpath(f.id);
  end if;

  -- Every catalogued submission file has its own key. Before 052 the two Quiz #1 attempts shared
  -- one, and a staged file of the same name shared it too.
  select count(*), count(distinct bb_file_relpath(id)) into n, v_keys
    from bb_files where run_id = v_run and bucket = 'my_submissions';
  if n <> v_keys then
    raise exception 'FAIL % submission file(s) share only % distinct Storage key(s)', n, v_keys;
  end if;

  -- An attempt with no files produces no catalog row, and is still mirrored as an attempt.
  if exists (select 1 from bb_files where run_id = v_run and attempt_id = '_8100003_1') then
    raise exception 'FAIL an attempt with an empty files array produced a bb_files row';
  end if;
  if not exists (select 1 from bb_attempts where run_id = v_run and attempt_id = '_8100003_1') then
    raise exception 'FAIL an attempt with no files was not mirrored';
  end if;
end $$;

-- =============================================================================================
-- 4. Idempotency
-- =============================================================================================
do $$
declare v_run uuid; v_sync bigint; a_before bigint; a_after bigint; f_before bigint; f_after bigint; c jsonb;
begin
  select run_id, sync_run_id into v_run, v_sync from _fx;
  select count(*) into a_before from bb_attempts;
  select count(*) into f_before from bb_files;

  c := stage_attempts(v_run, v_sync)->'counts';

  select count(*) into a_after from bb_attempts;
  select count(*) into f_after from bb_files;

  if a_after <> a_before then
    raise exception 'FAIL second call added % attempt row(s)', a_after - a_before;
  end if;
  if f_after <> f_before then
    raise exception 'FAIL second call added % bb_files row(s)', f_after - f_before;
  end if;
  if (c->>'inserted')::int <> 0 or (c->>'files_catalogued')::int <> 0 then
    raise exception 'FAIL second call reports inserted = % / files_catalogued = %, expected 0 / 0',
      c->>'inserted', c->>'files_catalogued';
  end if;
  -- attempts_seen still reports what the payload holds: the count describes the crawl, not the
  -- insert. Only `inserted` is allowed to go to zero.
  if (c->>'attempts_seen')::int <> 4 then
    raise exception 'FAIL second call reports attempts_seen = %, expected 4', c->>'attempts_seen';
  end if;
end $$;

-- =============================================================================================
-- 5. The views
-- =============================================================================================
do $$
declare n int; v text; allowed int;
begin
  -- v_assignment_attempts numbers attempts per assignment, oldest first.
  select count(*) into n from v_assignment_attempts where assignment_id = 'IST.323/quiz-01';
  if n <> 2 then raise exception 'FAIL IST.323/quiz-01 has % attempt row(s), expected 2', n; end if;

  select attempt_id into v from v_assignment_attempts
   where assignment_id = 'IST.323/quiz-01' and attempt_no = 1;
  if v <> '_8100001_1' then raise exception 'FAIL attempt_no 1 is %, expected the earlier attempt', v; end if;

  select attempts_allowed into allowed from v_assignment_attempts
   where assignment_id = 'IST.323/quiz-01' and attempt_no = 1;
  if allowed <> 3 then
    raise exception 'FAIL attempts_allowed = %, expected 3 from the gradebook column', allowed;
  end if;

  -- The ambiguous column is linked to TWO assignments, so its single attempt appears once under
  -- each - and is attempt 1 under each. Numbering by column alone would have called the second
  -- one "attempt 2 of 1".
  select count(*) into n from v_assignment_attempts where column_id = '_3569973_1';
  if n <> 2 then raise exception 'FAIL the ambiguous column produced % view row(s), expected 2', n; end if;
  if exists (select 1 from v_assignment_attempts where column_id = '_3569973_1' and attempt_no <> 1) then
    raise exception 'FAIL an attempt under an ambiguously linked column was numbered above 1';
  end if;

  -- v_attempts_latest carries one row per attempt and does NOT expose raw.
  select count(*) into n from v_attempts_latest where course_id = 'IST.323'
    and attempt_id in ('_8100001_1','_8100002_1','_8100003_1','_8100004_1');
  if n <> 4 then raise exception 'FAIL v_attempts_latest shows % of the 4 fixture attempts', n; end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'v_attempts_latest' and column_name = 'raw') then
    raise exception 'FAIL v_attempts_latest exposes raw; the key probe is read by hand, not by a screen';
  end if;
end $$;

-- =============================================================================================
-- 6. The stage writes facts and nothing else
-- =============================================================================================
do $$
declare n bigint;
begin
  select count(*) into n from attention_items where raised_by in (select sync_run_id from _fx);
  if n <> 0 then raise exception 'FAIL stage_attempts raised % attention item(s)', n; end if;

  select count(*) into n from bb_files
   where run_id = (select run_id from _fx) and classified_by = 'stack';
  if n <> 0 then raise exception 'FAIL stage_attempts wrote % row(s) on Stack''s behalf', n; end if;

  select count(*) into n from sync_stage_runs
   where sync_run_id in (select sync_run_id from _fx) and stage = 'attempts';
  if n <> 2 then raise exception 'FAIL % attempts stage row(s) recorded, expected 2', n; end if;
end $$;

-- =============================================================================================
-- 7. 049's constraint, the staged path, and the narrowed anon policy
-- =============================================================================================
do $$
declare ok boolean;
begin
  -- A row with no Blackboard URL is only legal when Stack staged it himself.
  begin
    insert into bb_files (bb_course_id, course_id, file_name, source_url, bucket,
                          classified_by, classification_confidence, text_status)
    values ('_571529_1', 'IST.323', 'orphan.pdf', null, 'my_submissions', 'blackboard', 1, 'na');
    raise exception 'FAIL bb_files accepted a blackboard-classified row with no source_url';
  exception
    when check_violation then null;                 -- bb_files_source_or_staged, as intended
    when raise_exception then raise;
  end;

  -- 052 closed the NULL hole: with BOTH columns null, 049's check evaluated to NULL and passed.
  begin
    insert into bb_files (bb_course_id, course_id, file_name, source_url, bucket,
                          classification_confidence, text_status)
    values ('_571529_1', 'IST.323', 'both-null.pdf', null, 'my_submissions', 1, 'na');
    raise exception 'FAIL bb_files accepted a row with neither a source_url nor a classifier';
  exception
    when check_violation then null;
    when raise_exception then raise;
  end;

  -- The staged path is the one the constraint allows, and 052 left its key exactly where it was:
  -- attempt_id is null on a staged row, so no attempt segment, and W-18's client-side
  -- submissionRelPath stays correct.
  insert into bb_files (bb_course_id, course_id, file_name, source_url, bucket,
                        classified_by, classification_confidence, text_status, assignment_id, notes)
  values ('_571529_1', 'IST.323', 'my-draft.docx', null, 'my_submissions', 'stack', 1, 'na',
          'IST.323/quiz-01', 'staged in bb2dash (test)');
  select bb_file_relpath(id) = 'IST.323/my_submissions/quiz-01/my-draft.docx' into ok
    from bb_files where file_name = 'my-draft.docx';
  if not ok then raise exception 'FAIL a staged file did not key to its assignment folder'; end if;

  -- And it does not collide with the attempt file of the same assignment.
  if exists (select 1 from bb_files a join bb_files b on a.id < b.id
                                     and bb_file_relpath(a.id) = bb_file_relpath(b.id)
              where a.bucket = 'my_submissions' and b.bucket = 'my_submissions') then
    raise exception 'FAIL two my_submissions rows compute the same Storage key';
  end if;
end $$;

-- The narrowed anon INSERT policy, asserted on its own text rather than by attempting an insert
-- as anon: a policy violation aborts the surrounding transaction, which would take the whole test
-- with it. The live "anon really is refused" check is in docs/planning/66_W17_VERIFICATION.md,
-- run as `set local role anon` against prod.
do $$
declare v text;
begin
  select pg_get_expr(polwithcheck, polrelid) into v
    from pg_policy where polrelid = 'public.bb_files'::regclass and polname = 'bb_files_anon_insert';
  if v is null then raise exception 'FAIL bb_files_anon_insert is gone'; end if;
  if position('my_submissions' in v) = 0 then
    raise exception 'FAIL the anon insert policy no longer excludes my_submissions: %', v;
  end if;
  if position('''stack''' in v) = 0 or position('''blackboard''' in v) = 0 then
    raise exception 'FAIL the anon insert policy no longer excludes stack/blackboard: %', v;
  end if;
end $$;

-- =============================================================================================
-- 8. Pass
-- =============================================================================================
select 'phase10a_stage_attempts: PASS' as result,
       (select count(*) from bb_attempts where run_id = (select run_id from _fx))        as attempt_rows,
       (select count(*) from bb_files
         where run_id = (select run_id from _fx) and classified_by = 'blackboard')       as pulled_back_files,
       (select count(*) from v_assignment_attempts where course_id = 'IST.323')          as view_rows;

rollback;
