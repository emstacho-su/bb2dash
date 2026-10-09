-- bb2dash :: db/tests/phase18_122_supersede_rule.sql
-- Phase 18 (brief 98), task 9. Worker W-48. supersede_replaced_files (122), R-63:
--   (1) with 2, 74, 150 and 162 un-superseded inside this transaction, the function over the
--       newest registered crawl writes exactly four links, one from each of the four, and each
--       points at the current END OF THAT FILE'S OWN SUPERSESSION CHAIN, which the unit reads
--       (following superseded_by, at most CHAIN_LIMIT = 1000 hops, so only a cycle or an absurd
--       chain stops it) BEFORE it clears the four. No other file is linked by that call. The expectation is the chain's end and not an id because the
--       course re-posts these documents (the IST.466 schedule, the IST.352 decks) and each
--       re-post supersedes the last, so any pinned id goes stale at the next sync: it first read
--       "150 -> 162" (crawl f24a7ff5), then "150 -> 967" (crawl 1f10c823, 2026-10-01), and on
--       2026-10-09 the chains were 2>151, 74>149>2509, 150>967>2640>2773, 162>967>2640>2773.
--       The assumption it rests on: each re-post replaced the previous file ALONE in its content
--       item, so the function re-creates each link straight to the chain's end. A hop that Stack's
--       answer made (several files in the item) or an end that left Blackboard would fail here
--       and want the unit read again.
--   (2) a replay writes 0
--   (3) 31, 32, 47 (the three IST.352 decks) and 155, 156 are unchanged
--   (4) rows classified_by 'stack' are unchanged
--   (5) an older registered run writes 0 and says older_run
--   (6) a name-only match (a synthetic row whose item is gone while a file of the same name sits
--       in another item) raises exactly 1 attention row and writes 0
--   (7) a pre-existing sibling is not a replacement (160): an item held A.pdf and B.pdf in one
--       registered crawl; the next (newest) crawl shows only A. B is NOT superseded by A and no
--       question is raised; B is left for the missing marker. (1) still holds under 160 because
--       the chain ends never sat beside 2, 74, 150 and 162 in their items in any registered crawl.
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
  v_expect   text;
  v_ends     int;
  v_end_of_2 bigint;
  -- how far a supersession chain is followed; reaching it means a cycle or a longer chain
  CHAIN_LIMIT constant int := 1000;
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

  -- the end of each of the four files' own chain, read before the four are cleared. A chain that
  -- has no end within CHAIN_LIMIT steps (a cycle or a longer chain) or a file that is not
  -- superseded at all yields no entry.
  with recursive chain(start_id, id, next_id, depth) as (
    select f.id, f.id, f.superseded_by, 0 from bb_files f where f.id in (2, 74, 150, 162)
    union all
    select c.start_id, f.id, f.superseded_by, c.depth + 1
      from chain c join bb_files f on f.id = c.next_id
     where c.depth < CHAIN_LIMIT
  )
  select string_agg(format('%s->%s', start_id, id), ', ' order by start_id), count(*),
         (array_agg(id) filter (where start_id = 2))[1]
    into v_expect, v_ends, v_end_of_2
    from chain where next_id is null and depth > 0;

  update bb_files set superseded_by = null where id in (2, 74, 150, 162);

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
  if v_ends <> 4 then
    v_fail := v_fail || format('(1) precondition: only %s of files 2, 74, 150 and 162 have a supersession chain '
                               'that ends (a file not superseded, a cycle or a chain longer than %s): %s',
                               v_ends, CHAIN_LIMIT, coalesce(v_expect, 'none'));
  elsif (v_r->>'superseded')::int <> 4 or v_got is distinct from v_expect then
    v_fail := v_fail || format('(1) newest run %s wrote %s: %s, expected the chain ends %s',
                               v_newest, v_r->>'superseded', coalesce(v_got, 'nothing'), v_expect);
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
  update bb_files set superseded_by = null where id in (2, 74, 150, 162);
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
    from bb_files g where g.id = v_end_of_2  -- the current file of that name: the end of file 2's chain
  returning id into v_synth;
  v_r := supersede_replaced_files(v_newest, v_sync);
  select count(*) into v_open from attention_items
   where kind = 'stack_must_confirm' and ref = 'supersede/' || v_synth::text and state = 'open';
  if v_open <> 1 or (select superseded_by from bb_files where id = v_synth) is not null
     or (v_r->>'asked')::int <> 1 then
    v_fail := v_fail || format('(6) name-only: %s open rows, result %s', v_open, v_r);
  end if;

  -- (7) two synthetic registered crawls of IST.323, later than every real one
  declare
    v_run_ab uuid := gen_random_uuid();
    v_run_a  uuid := gen_random_uuid();
    v_bb_id  text := (select bb_id from courses where id = 'IST.323');
    v_a      bigint;
    v_b      bigint;
  begin
    insert into agent_requests (kind, state, run_id, note) values
      ('sync', 'done', v_run_ab, 'phase18_122 synthetic'),
      ('sync', 'done', v_run_a, 'phase18_122 synthetic');
    insert into bb_raw (run_id, captured_at, bb_course_id, kind, payload) values
      (v_run_ab, now() + interval '1 hour', v_bb_id, 'course', jsonb_build_object('content', jsonb_build_array(
         jsonb_build_object('id', '_p18_ab_item', 'embeddedFiles', jsonb_build_array(
           jsonb_build_object('name', 'p18 A.pdf', 'url', '/bbcswebdav/p18-122-A'),
           jsonb_build_object('name', 'p18 B.pdf', 'url', '/bbcswebdav/p18-122-B')))))),
      (v_run_a, now() + interval '2 hours', v_bb_id, 'course', jsonb_build_object('content', jsonb_build_array(
         jsonb_build_object('id', '_p18_ab_item', 'embeddedFiles', jsonb_build_array(
           jsonb_build_object('name', 'p18 A.pdf', 'url', '/bbcswebdav/p18-122-A'))))));
    insert into bb_files (bb_course_id, course_id, content_id, file_name, source_url, bucket,
                          classified_by, classification_confidence, notes)
    values (v_bb_id, 'IST.323', '_p18_ab_item', 'p18 A.pdf',
            'https://blackboard.syracuse.edu/bbcswebdav/p18-122-A', 'readings', 'rule', 0.6, 'phase18_122 synthetic')
    returning id into v_a;
    insert into bb_files (bb_course_id, course_id, content_id, file_name, source_url, bucket,
                          classified_by, classification_confidence, notes)
    values (v_bb_id, 'IST.323', '_p18_ab_item', 'p18 B.pdf',
            'https://blackboard.syracuse.edu/bbcswebdav/p18-122-B', 'readings', 'rule', 0.6, 'phase18_122 synthetic')
    returning id into v_b;

    v_r := supersede_replaced_files(v_run_a, v_sync);
    select count(*) into v_open from attention_items
     where ref = 'supersede/' || v_b::text and state = 'open';
    if (select superseded_by from bb_files where id = v_b) is not null or v_open <> 0 then
      v_fail := v_fail || format('(7) deleted sibling B (%s) superseded_by %s, %s open questions, result %s',
        v_b, coalesce((select superseded_by::text from bb_files where id = v_b), 'null'), v_open, v_r);
    end if;
  end;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_122_supersede_rule: PASS' as result;

rollback;
