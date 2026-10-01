-- bb2dash :: db/tests/phase18_161_outside_links.sql
-- Tests migration 161 (fix/sync-file-pull-chrome): a bb_files row whose source_url is an outside
-- site is an OUTSIDE LINK, not a Blackboard file waiting for its bytes.
--
--   A. bb_file_is_outside_link(): http(s) off the Blackboard host is true; a Blackboard URL (any
--      path, any subdomain), a local:// path, null and a look-alike host are answered correctly;
--      the function is immutable and pins its search_path
--   B. prod rows 738-746 (ECN.304 readings a tutoring session catalogued) are outside links, and
--      no open storage_path gap is left on any outside link (161 closed them)
--   C. stage_gaps raises a storage_path gap for a Blackboard file with no bytes and none for an
--      outside link with no bytes
--   D. close_cleared_gaps archives an open storage_path gap on an outside link with rule
--      'outside_link'
--   E. privileges: service_role and db_test_runner can execute the helper
--
-- Every fixture is a row this file seeds; prod rows are only read. RUN IT:
-- `node scripts/db-test.mjs --only phase18_161_outside_links.sql`, or paste the whole file into one
-- `execute_sql` call. The last statement is `rollback`.

begin;

do $$
declare
  v_fail   text[] := '{}';
  v_course constant text := 'ECN.304';
  v_out    bigint;
  v_bb     bigint;
  v_out2   bigint;
  v_gap    bigint;
  v_sr     bigint;
  v_r      jsonb;
  v_row    attention_items;
begin
  if to_regprocedure('public.bb_file_is_outside_link(text)') is null then
    raise exception 'FAIL phase18_161: bb_file_is_outside_link(text) does not exist';
  end if;

  -- -------------------------------------------------------------------------------------------
  -- A. the helper
  -- -------------------------------------------------------------------------------------------
  if not bb_file_is_outside_link('https://www.cbo.gov/system/files/2025-03/61187.pdf')
     or not bb_file_is_outside_link('http://www.sec.gov/files/ib_interestraterisk.pdf')
     or not bb_file_is_outside_link('HTTPS://www.ncbi.nlm.nih.gov/books/NBK22930/')
     or not bb_file_is_outside_link('https://blackboard.syracuse.edu.evil.example/x') then
    v_fail := v_fail || 'A: an outside URL is not an outside link'::text;
  end if;
  if bb_file_is_outside_link('https://blackboard.syracuse.edu/bbcswebdav/pid-1-dt-content-rid-2_1/xid-2_1')
     or bb_file_is_outside_link('https://blackboard.syracuse.edu/ultra/courses/_1_1/outline')
     or bb_file_is_outside_link('https://BLACKBOARD.syracuse.edu/learn/api/v1/x')
     or bb_file_is_outside_link('https://cdn.blackboard.syracuse.edu/x')
     or bb_file_is_outside_link('local://course context/IST.352/admin/bio.pdf')
     or bb_file_is_outside_link('') then
    v_fail := v_fail || 'A: a Blackboard or local URL reads as an outside link'::text;
  end if;
  if bb_file_is_outside_link(null) is distinct from false then
    v_fail := v_fail || 'A: a null source_url is not plainly false'::text;
  end if;
  if (select provolatile from pg_proc where oid = 'public.bb_file_is_outside_link(text)'::regprocedure) <> 'i'
     or (select proconfig from pg_proc where oid = 'public.bb_file_is_outside_link(text)'::regprocedure) is null then
    v_fail := v_fail || 'A: the helper is not immutable or does not pin its search_path'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- B. prod: 738-746 are outside links; no open file gap is left on an outside link
  -- -------------------------------------------------------------------------------------------
  if (select count(*) from bb_files where id between 738 and 746 and bb_file_is_outside_link(source_url)) <> 9 then
    v_fail := v_fail || format('B: %s of bb_files 738-746 are outside links, expected 9',
      (select count(*) from bb_files where id between 738 and 746 and bb_file_is_outside_link(source_url)));
  end if;
  if exists (select 1 from attention_items ai join bb_files f on f.id::text = ai.ref
              where ai.state = 'open' and ai.kind = 'data_gap' and ai.entity = 'bb_file'
                and ai.field = 'storage_path' and bb_file_is_outside_link(f.source_url)) then
    v_fail := v_fail || 'B: an open storage_path gap is still on an outside link'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- D. an open gap on an outside link closes, rule outside_link
  -- -------------------------------------------------------------------------------------------
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket)
  values ('_w161_d', v_course, 'W161 / D', 'w161_d.html', 'https://www.example.org/w161/d', 'readings')
  returning id into v_out2;
  insert into attention_items (kind, course_id, entity, ref, field, question, suggested)
  values ('data_gap', v_course, 'bb_file', v_out2::text, 'storage_path', 'W161 case D',
          '{"source": "stage_gaps"}'::jsonb)
  returning id into v_gap;
  v_r := close_cleared_gaps(null, 'w161_test');
  select * into v_row from attention_items where id = v_gap;
  if v_row.state is distinct from 'archived' or v_row.archived_by is distinct from 'stage_gaps'
     or v_row.decision->>'closed_itself' is distinct from 'true'
     or v_row.decision->>'rule' is distinct from 'outside_link' then
    v_fail := v_fail || format('D: the outside-link gap is state %s, decision %s', v_row.state, v_row.decision);
  end if;

  -- -------------------------------------------------------------------------------------------
  -- C. stage_gaps: a gap for the Blackboard file, none for the outside link
  -- -------------------------------------------------------------------------------------------
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket)
  values ('_w161_c', v_course, 'W161 / C out', 'w161_c_out.html', 'https://www.example.org/w161/c', 'readings')
  returning id into v_out;
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket)
  values ('_w161_c', v_course, 'W161 / C bb', 'w161_c_bb.pdf',
          'https://blackboard.syracuse.edu/bbcswebdav/pid-161-dt-content-rid-161161_1/xid-161161_1', 'readings')
  returning id into v_bb;

  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
  values ('00000000-0161-4000-8000-000000000161', 'ok', now(), now(), 'manual', 'blackboard', 'all')
  returning id into v_sr;
  v_r := stage_gaps('00000000-0161-4000-8000-000000000161', v_sr);
  if v_r->>'status' is distinct from 'ok' then
    v_fail := v_fail || format('C: stage_gaps returned %s', v_r);
  end if;
  if not exists (select 1 from attention_items where state = 'open' and kind = 'data_gap'
                    and entity = 'bb_file' and ref = v_bb::text and field = 'storage_path') then
    v_fail := v_fail || 'C: no gap raised for a Blackboard file with no bytes'::text;
  end if;
  if exists (select 1 from attention_items where kind = 'data_gap' and entity = 'bb_file'
                and ref = v_out::text and field = 'storage_path') then
    v_fail := v_fail || 'C: a gap was raised for an outside link'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- E. privileges
  -- -------------------------------------------------------------------------------------------
  if not has_function_privilege('service_role', 'public.bb_file_is_outside_link(text)', 'execute')
     or not has_function_privilege('db_test_runner', 'public.bb_file_is_outside_link(text)', 'execute') then
    v_fail := v_fail || 'E: service_role or db_test_runner cannot execute bb_file_is_outside_link'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase18_161: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_161_outside_links: PASS' as result,
       (select count(*) from bb_files
         where storage_path is null and superseded_by is null and source_url is not null
           and not bb_file_is_outside_link(source_url))                                  as manifest_rows_in_txn;

rollback;
