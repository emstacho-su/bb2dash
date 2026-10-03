-- bb2dash :: db/tests/phase19_139_stage_content_rekey.sql
-- Phase 19 round 2 (brief 99, "Round 2", row R2-1). Worker W-52.
-- Tests migration 139: stage_content re-keys a re-created item. When, in one course in one
-- fold, exactly one new item and exactly one stored row the run does not carry share a path
-- and an item_kind, the stored row takes the new id (the old id goes to
-- detail.previous_ids) and is updated in place, so its assignment_id, its children and its
-- previous_paths stay. Counted as `rekeyed`. Every other shape is left to insert + missing.
--
-- Crawl A (fixture course): a Knowledge Check, a folder Week 2 with a child, two sibling
-- lessons on one path (IST.466's shape), a document Twin, a link Kind.
-- Crawl B: the Knowledge Check and Week 2 are deleted and re-posted under new ids; Twin's one
-- item is replaced by two new items on its path; Kind's link is replaced by a document on its
-- path. The two lessons stay.
--   (A)  the two same-path lessons are two rows and nothing is re-keyed
--   (B)  rekeyed = 2: the Knowledge Check keeps its row, its link and the old id in
--        previous_ids; Week 2 keeps its row, so its child still hangs under it
--   (B2) two new and one old: no re-key, the old row stamped missing, two rows inserted
--   (B3) a kind change: no re-key, the link stamped missing, the document inserted
--   (B4) the lessons are left alone
--   (B5) a second fold of crawl B re-keys nothing and changes nothing
-- RUN IT: `node scripts/db-test.mjs --only phase19_139_stage_content_rekey.sql`, or paste the
-- whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

create temp table _fx139 (
  crawl text not null, ord int not null, id text not null, parent text not null, type text,
  path text not null, title text not null
) on commit drop;

insert into _fx139 (crawl, ord, id, parent, type, path, title) values
  ('A', 1, '_w52r_w1_1',  '_w52r_root_1', 'resource/x-bb-folder',         'Week 1',                   'Week 1'),
  ('A', 2, '_w52r_kc_a',  '_w52r_w1_1',   'resource/x-bb-asmt-test-link', 'Week 1 / Knowledge Check', 'Knowledge Check'),
  ('A', 3, '_w52r_w2_a',  '_w52r_root_1', 'resource/x-bb-folder',         'Week 2',                   'Week 2'),
  ('A', 4, '_w52r_c_1',   '_w52r_w2_a',   null,                           'Week 2 / Reading',         'Reading'),
  ('A', 5, '_w52r_l1_1',  '_w52r_root_1', 'resource/x-bb-lesson',         'Information',              'Information'),
  ('A', 6, '_w52r_l2_1',  '_w52r_root_1', 'resource/x-bb-lesson',         'Information',              'Information'),
  ('A', 7, '_w52r_t_a',   '_w52r_w1_1',   null,                           'Week 1 / Twin',            'Twin'),
  ('A', 8, '_w52r_k_a',   '_w52r_w1_1',   'resource/x-bb-externallink',   'Week 1 / Kind',            'Kind'),
  ('B', 1, '_w52r_w1_1',  '_w52r_root_1', 'resource/x-bb-folder',         'Week 1',                   'Week 1'),
  ('B', 2, '_w52r_kc_b',  '_w52r_w1_1',   'resource/x-bb-asmt-test-link', 'Week 1 / Knowledge Check', 'Knowledge Check'),
  ('B', 3, '_w52r_w2_b',  '_w52r_root_1', 'resource/x-bb-folder',         'Week 2',                   'Week 2'),
  ('B', 4, '_w52r_c_1',   '_w52r_w2_b',   null,                           'Week 2 / Reading',         'Reading'),
  ('B', 5, '_w52r_l1_1',  '_w52r_root_1', 'resource/x-bb-lesson',         'Information',              'Information'),
  ('B', 6, '_w52r_l2_1',  '_w52r_root_1', 'resource/x-bb-lesson',         'Information',              'Information'),
  ('B', 7, '_w52r_t_b1',  '_w52r_w1_1',   null,                           'Week 1 / Twin',            'Twin'),
  ('B', 8, '_w52r_t_b2',  '_w52r_w1_1',   null,                           'Week 1 / Twin',            'Twin'),
  ('B', 9, '_w52r_k_b',   '_w52r_w1_1',   null,                           'Week 1 / Kind',            'Kind');

do $$
declare
  COURSE   constant text := 'W52.139';
  SHELL    constant text := '_w52_139_1';
  RUN_A    constant uuid := '00000000-1390-4000-8000-00000000000a';
  RUN_B    constant uuid := '00000000-1390-4000-8000-00000000000b';
  v_fail   text[] := '{}';
  v_r      jsonb;
  v_link   text;
  v_kc     bigint;
  v_w2     bigint;
  v_n      bigint;
  v_got    text;
  v_snap   jsonb;
  v_label  text;
begin
  insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short, bb_id)
  select COURSE, (select term_id from courses order by id limit 1), 'W52.139.FIXTURE', 'W52', '139', 'M001',
         'Phase 19 re-key fixture course (rolled back)', 'W52 re-key fixture', SHELL;
  select id into v_link from assignments order by id limit 1;

  foreach v_label in array array['A', 'B'] loop
    -- Each crawl is registered just before its fold, so each is the newest registered crawl.
    insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
    values ('sync', 'all', 'done', case v_label when 'A' then RUN_A else RUN_B end,
            'Phase 19 re-key fixture crawl ' || v_label || ' (rolled back)', 'phase19_139', now(), now());
    insert into bb_raw (run_id, kind, bb_course_id, captured_at, payload)
    select case v_label when 'A' then RUN_A else RUN_B end, 'course', SHELL,
           now() + case v_label when 'A' then interval '1 hour' else interval '2 hours' end,
           jsonb_build_object('content', jsonb_agg(jsonb_build_object(
             'id', f.id, 'parentId', f.parent, 'type', f.type, 'path', f.path, 'title', f.title,
             'state', 'None', 'modified', 1790000000000) order by f.ord))
      from _fx139 f where f.crawl = v_label;
    exit when v_label = 'B';

    -- (A)
    v_r := stage_content(RUN_A);
    if v_r->>'inserted' is distinct from '8' or coalesce(v_r->>'rekeyed', '0') <> '0' then
      v_fail := v_fail || format('(A) crawl A returned %s', v_r);
    end if;
    if (select count(*) from bb_content where course_id = COURSE and path = 'Information') <> 2 then
      v_fail := v_fail || '(A) the two same-path lessons are not two rows'::text;
    end if;
  end loop;

  -- Stack links the Knowledge Check (as 112 and 130 did for IST.352's).
  update bb_content set assignment_id = v_link
   where course_id = COURSE and bb_item_id = '_w52r_kc_a'
  returning id into v_kc;
  select id into v_w2 from bb_content where course_id = COURSE and bb_item_id = '_w52r_w2_a';

  -- (B)
  v_r := stage_content(RUN_B);
  if v_r->>'rekeyed' is distinct from '2' or v_r->>'inserted' is distinct from '3'
     or v_r->>'missing' is distinct from '2' or (v_r->>'older_run')::boolean then
    v_fail := v_fail || format('(B) crawl B returned %s', v_r);
  end if;
  select format('%s|%s|%s|%s', id, bb_item_id, coalesce(assignment_id, 'null'), detail->'previous_ids')
    into v_got from bb_content where course_id = COURSE and path = 'Week 1 / Knowledge Check';
  if v_got is distinct from format('%s|_w52r_kc_b|%s|["_w52r_kc_a"]', v_kc, v_link)
     or (select count(*) from bb_content where course_id = COURSE and path = 'Week 1 / Knowledge Check') <> 1 then
    v_fail := v_fail || format('(B) the Knowledge Check reads %s', coalesce(v_got, '(none)'));
  end if;
  select format('%s|%s|%s', id, bb_item_id, detail->'previous_ids') into v_got
    from bb_content where course_id = COURSE and path = 'Week 2';
  if v_got is distinct from format('%s|_w52r_w2_b|["_w52r_w2_a"]', v_w2)
     or (select parent_id from bb_content where course_id = COURSE and bb_item_id = '_w52r_c_1') is distinct from v_w2 then
    v_fail := v_fail || format('(B) Week 2 reads %s, its child hangs under %s', coalesce(v_got, '(none)'),
      (select parent_id from bb_content where course_id = COURSE and bb_item_id = '_w52r_c_1'));
  end if;

  -- (B2) two new, one old
  select string_agg(format('%s:%s', bb_item_id, coalesce(detail->>'missing_since', 'live')), ' ' order by bb_item_id)
    into v_got from bb_content where course_id = COURSE and path = 'Week 1 / Twin';
  if v_got is distinct from format('_w52r_t_a:%s _w52r_t_b1:live _w52r_t_b2:live', RUN_B) then
    v_fail := v_fail || format('(B2) Twin reads %s', coalesce(v_got, '(none)'));
  end if;

  -- (B3) a kind change
  select string_agg(format('%s:%s:%s', bb_item_id, item_kind, coalesce(detail->>'missing_since', 'live')), ' '
                    order by bb_item_id)
    into v_got from bb_content where course_id = COURSE and path = 'Week 1 / Kind';
  if v_got is distinct from format('_w52r_k_a:link:%s _w52r_k_b:document:live', RUN_B) then
    v_fail := v_fail || format('(B3) Kind reads %s', coalesce(v_got, '(none)'));
  end if;

  -- (B4) the lessons
  if (select count(*) from bb_content
       where course_id = COURSE and path = 'Information' and detail ? 'previous_ids') <> 0
     or (select count(*) from bb_content
          where course_id = COURSE and path = 'Information' and detail->>'missing_since' is null) <> 2 then
    v_fail := v_fail || '(B4) a same-path lesson was re-keyed or marked missing'::text;
  end if;

  -- (B5) a second fold
  select jsonb_object_agg(b.id, md5(row(b.*)::text)) into v_snap from bb_content b where b.course_id = COURSE;
  v_r := stage_content(RUN_B);
  select count(*) into v_n from bb_content b
   where b.course_id = COURSE and md5(row(b.*)::text) is distinct from v_snap->>b.id::text;
  if coalesce(v_r->>'rekeyed', '-') <> '0' or v_r->>'inserted' <> '0' or v_r->>'updated' <> '0' or v_n <> 0 then
    v_fail := v_fail || format('(B5) a second fold returned %s and changed %s row(s)', v_r, v_n);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_139: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase19_139_stage_content_rekey: PASS'                                             as result,
       (select count(*) from bb_content where course_id = 'W52.139')                        as fixture_rows,
       (select count(*) from bb_content where course_id = 'W52.139' and detail ? 'previous_ids') as rekeyed_rows;

rollback;
