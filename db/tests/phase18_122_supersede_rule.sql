-- bb2dash :: db/tests/phase18_122_supersede_rule.sql
-- Phase 18 (brief 98), task 9. Worker W-48. supersede_replaced_files (122), R-63:
--   (1) with 2 and 74 un-superseded inside this transaction, the function over the newest
--       registered crawl writes exactly 2 rows: 2 -> 151 and 74 -> 149
--   (2) a replay writes 0
--   (3) 31, 32, 47 (the three IST.352 decks) and 155, 156 are unchanged
--   (4) rows classified_by 'stack' are unchanged
--   (5) an older registered run writes 0 and says older_run
--   (6) a name-only match (a synthetic row whose item is gone while a file of the same name sits
--       in another item) raises exactly 1 attention row and writes 0
-- Needs migration 128's execute grant for db_test_runner. Collects every failure, raises once.
-- RUN IT: `node scripts/db-test.mjs --only phase18_122_supersede_rule.sql`.

begin;

do $$
declare
  v_fail     text[] := array[]::text[];
  v_newest   uuid;
  v_older    uuid;
  v_sync     bigint;
  v_older_sync bigint;
  v_before   jsonb;
  v_r        jsonb;
  v_got      text;
  v_watch    text;
  v_stack    text;
  v_synth    bigint;
  v_open     int;
begin
  -- the two newest registered crawls, newest first
  with reg as (
    select r.run_id, (select max(b.captured_at) from bb_raw b where b.run_id = r.run_id) as last_at
      from agent_requests r
     where r.kind = 'sync' and r.run_id is not null
  )
  select (array_agg(run_id order by last_at desc nulls last))[1],
         (array_agg(run_id order by last_at desc nulls last))[2]
    into v_newest, v_older
    from reg where last_at is not null;
  select id into v_sync from sync_runs where run_id = v_newest order by id desc limit 1;
  select id into v_older_sync from sync_runs where run_id = v_older order by id desc limit 1;

  update bb_files set superseded_by = null where id in (2, 74);

  select jsonb_object_agg(id, superseded_by) into v_before from bb_files;
  select md5(string_agg(row(f.*)::text, '|' order by f.id)) into v_watch
    from bb_files f where f.id in (31, 32, 47, 155, 156);
  select md5(coalesce(string_agg(row(f.*)::text, '|' order by f.id), '')) into v_stack
    from bb_files f where f.classified_by = 'stack';

  -- (1)
  v_r := supersede_replaced_files(v_newest, v_sync);
  select string_agg(format('%s->%s', f.id, f.superseded_by), ', ' order by f.id) into v_got
    from bb_files f
   where f.superseded_by is distinct from (v_before->>f.id::text)::bigint;
  if (v_r->>'superseded')::int <> 2 or v_got is distinct from '2->151, 74->149' then
    v_fail := v_fail || format('(1) newest run %s wrote %s: %s', v_newest, v_r->>'superseded',
                               coalesce(v_got, 'nothing'));
  end if;

  -- (2)
  v_r := supersede_replaced_files(v_newest, v_sync);
  if (v_r->>'superseded')::int <> 0 then
    v_fail := v_fail || format('(2) replay wrote %s', v_r->>'superseded');
  end if;

  -- (3), (4)
  if (select md5(string_agg(row(f.*)::text, '|' order by f.id))
        from bb_files f where f.id in (31, 32, 47, 155, 156)) is distinct from v_watch then
    v_fail := v_fail || '(3) 31/32/47/155/156 changed'::text;
  end if;
  if (select md5(coalesce(string_agg(row(f.*)::text, '|' order by f.id), ''))
        from bb_files f where f.classified_by = 'stack') is distinct from v_stack then
    v_fail := v_fail || '(4) stack rows changed'::text;
  end if;

  -- (5)
  update bb_files set superseded_by = null where id in (2, 74);
  v_r := supersede_replaced_files(v_older, v_older_sync);
  if not coalesce((v_r->>'older_run')::boolean, false) or (v_r->>'superseded')::int <> 0
     or (select superseded_by from bb_files where id = 2) is not null then
    v_fail := v_fail || format('(5) older run %s: %s', v_older, v_r);
  end if;

  -- (6) a synthetic row: its item is not in the crawl, its name is
  insert into bb_files (bb_course_id, course_id, content_id, file_name, source_url, bucket,
                        classified_by, classification_confidence, notes)
  select g.bb_course_id, g.course_id, '_p18_synthetic_item_1', g.file_name,
         'https://blackboard.syracuse.edu/bbcswebdav/p18-synthetic-122', g.bucket,
         'rule', 0.6, 'phase18_122 synthetic'
    from bb_files g where g.id = 151
  returning id into v_synth;
  v_r := supersede_replaced_files(v_newest, v_sync);
  select count(*) into v_open from attention_items
   where kind = 'stack_must_confirm' and ref = 'supersede/' || v_synth::text and state = 'open';
  if v_open <> 1 or (select superseded_by from bb_files where id = v_synth) is not null
     or (v_r->>'asked')::int <> 1 then
    v_fail := v_fail || format('(6) name-only: %s open rows, result %s', v_open, v_r);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_122_supersede_rule: PASS' as result;

rollback;
