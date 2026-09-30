-- bb2dash :: db/tests/phase18_126_assignment_bb_url.sql
-- Phase 18 (brief 98), task 13. Worker W-48. assignment_bb_url and stage_assignments (126), R-69:
--   (1) assignment_bb_url('IST.323', Lab 1's item) is the Ultra page the walk expects
--   (2) a non-test item (the survey link, if any) and an unknown item return null
--   (3) a synthetic new gradebook column with a contentId inserts with bb_item_id and bb_url set
--   (4) a bb_url already there (as Stack would confirm it) is never overwritten
--   (5) a replay of the synthetic crawl writes 0 urls
-- Needs migration 128's execute grant on assignment_bb_url for db_test_runner. Collects failures,
-- raises once. RUN IT: `node scripts/db-test.mjs --only phase18_126_assignment_bb_url.sql`.

begin;

do $$
declare
  LAB1_URL constant text := 'https://blackboard.syracuse.edu/ultra/courses/_571529_1/outline/assessment/test/_12928193_1?courseId=_571529_1&gradeitemView=details';
  CONFIRMED constant text := 'https://blackboard.syracuse.edu/ultra/courses/_571529_1/outline/confirmed-by-stack';
  v_fail  text[] := array[]::text[];
  v_run   uuid := gen_random_uuid();
  v_sync  bigint;
  v_r     jsonb;
  v_got   text;
  v_new   record;
begin
  -- (1)
  v_got := assignment_bb_url('IST.323', '_12928193_1');
  if v_got is distinct from LAB1_URL then
    v_fail := v_fail || format('(1) Lab 1: %s', coalesce(v_got, 'null'));
  end if;

  -- (2)
  select assignment_bb_url(b.course_id, b.bb_item_id) into v_got
    from bb_content b
   where b.bb_type = 'resource/x-bb-asmt-survey-link'
     and not exists (select 1 from bb_content t
                      where t.course_id = b.course_id and t.bb_item_id = b.bb_item_id
                        and t.bb_type = 'resource/x-bb-asmt-test-link')
   limit 1;
  if v_got is not null then
    v_fail := v_fail || format('(2) survey item composed %s', v_got);
  end if;
  if assignment_bb_url('IST.323', '_p18_no_such_item_') is not null then
    v_fail := v_fail || '(2) unknown item composed a url'::text;
  end if;

  -- (4) set up: Lab 1 carries a value Stack confirmed
  update assignments set bb_url = CONFIRMED where id = 'IST.323/lab-1';

  -- (3) a synthetic crawl with one new column pointing at Lab 1's test item
  select id into v_sync from sync_runs order by id desc limit 1;
  insert into bb_raw (run_id, captured_at, bb_course_id, kind, payload)
  select v_run, now(), c.bb_id, 'course',
         jsonb_build_object('gradebook', jsonb_build_array(jsonb_build_object(
           'columnId', '_p18_col_126_1', 'name', 'P18 Synthetic Test Column 126',
           'possible', '10', 'contentId', '_12928193_1')),
           'content', '[]'::jsonb)
    from courses c where c.id = 'IST.323';

  v_r := stage_assignments(v_run, v_sync);
  select a.id, a.bb_item_id, a.bb_url into v_new
    from assignments a where a.course_id = 'IST.323' and a.bb_column_id = '_p18_col_126_1';
  if v_r->>'status' is distinct from 'ok' or v_new.id is null
     or v_new.bb_item_id is distinct from '_12928193_1' or v_new.bb_url is distinct from LAB1_URL then
    v_fail := v_fail || format('(3) new column: status %s, row %s', v_r->>'status', row_to_json(v_new));
  end if;

  -- (4)
  if (select bb_url from assignments where id = 'IST.323/lab-1') is distinct from CONFIRMED then
    v_fail := v_fail || '(4) a confirmed bb_url was overwritten'::text;
  end if;

  -- (5)
  v_r := stage_assignments(v_run, v_sync);
  if (v_r->'counts'->>'urls_composed')::int is distinct from 0
     or (v_r->'counts'->>'urls_set')::int is distinct from 0 then
    v_fail := v_fail || format('(5) replay: %s', v_r->'counts');
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_126_assignment_bb_url: PASS' as result;

rollback;
