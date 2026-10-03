-- bb2dash :: db/tests/phase19_171_stage_content_fresh_rekey.sql
-- Phase 19 round 3 (brief 99, "Round 3", row R3-5). Worker W-52.
-- Tests migration 171: stage_content re-keys only onto a stored row that is not already stamped
-- missing_since. The rule is for an item deleted and re-posted between two crawls; a row gone
-- for weeks is a ghost, and a different item later posted at its path must not inherit its
-- assignment link.
--
-- Crawls of one fixture course, each registered and folded in turn:
--   A  a linked Knowledge Check at "Week 1 / Knowledge Check"
--   B  it is gone: its row is stamped missing_since = B
--   C  a new Knowledge Check appears at the same path:   NOT re-keyed onto the ghost
--   D  that one is deleted and re-posted in the same gap: re-keyed, as 139 does
-- RUN IT: `node scripts/db-test.mjs --only phase19_171_stage_content_fresh_rekey.sql`, or paste
-- the whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

create temp table _fx171 (
  crawl text not null, ord int not null, id text not null, parent text not null, type text,
  path text not null, title text not null
) on commit drop;

insert into _fx171 (crawl, ord, id, parent, type, path, title) values
  ('A', 1, '_w52f_w1_1', '_w52f_root_1', 'resource/x-bb-folder',         'Week 1',                   'Week 1'),
  ('A', 2, '_w52f_kc_a', '_w52f_w1_1',   'resource/x-bb-asmt-test-link', 'Week 1 / Knowledge Check', 'Knowledge Check'),
  ('B', 1, '_w52f_w1_1', '_w52f_root_1', 'resource/x-bb-folder',         'Week 1',                   'Week 1'),
  ('C', 1, '_w52f_w1_1', '_w52f_root_1', 'resource/x-bb-folder',         'Week 1',                   'Week 1'),
  ('C', 2, '_w52f_kc_c', '_w52f_w1_1',   'resource/x-bb-asmt-test-link', 'Week 1 / Knowledge Check', 'Knowledge Check'),
  ('D', 1, '_w52f_w1_1', '_w52f_root_1', 'resource/x-bb-folder',         'Week 1',                   'Week 1'),
  ('D', 2, '_w52f_kc_d', '_w52f_w1_1',   'resource/x-bb-asmt-test-link', 'Week 1 / Knowledge Check', 'Knowledge Check');

do $$
declare
  COURSE  constant text := 'W52.171';
  SHELL   constant text := '_w52_171_1';
  KC_PATH constant text := 'Week 1 / Knowledge Check';
  v_fail  text[] := '{}';
  v_run   uuid;
  v_r     jsonb;
  v_link  text;
  v_ghost bigint;
  v_fresh bigint;
  v_got   text;
  v_label text;
  v_hour  int := 0;
begin
  insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short, bb_id)
  select COURSE, (select term_id from courses order by id limit 1), 'W52.171.FIXTURE', 'W52', '171', 'M001',
         'Phase 19 round 3 re-key fixture course (rolled back)', 'W52 re-key fixture', SHELL;
  select id into v_link from assignments order by id limit 1;

  foreach v_label in array array['A', 'B', 'C', 'D'] loop
    v_hour := v_hour + 1;
    v_run := format('00000000-1710-4000-8000-00000000000%s', lower(v_label))::uuid;
    insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
    values ('sync', 'all', 'done', v_run, 'Phase 19 round 3 re-key fixture crawl ' || v_label || ' (rolled back)',
            'phase19_171', now(), now());
    insert into bb_raw (run_id, kind, bb_course_id, captured_at, payload)
    select v_run, 'course', SHELL, now() + make_interval(hours => v_hour),
           jsonb_build_object('content', jsonb_agg(jsonb_build_object(
             'id', f.id, 'parentId', f.parent, 'type', f.type, 'path', f.path, 'title', f.title,
             'state', 'None', 'modified', 1790000000000) order by f.ord))
      from _fx171 f where f.crawl = v_label;
    v_r := stage_content(v_run);

    if v_label = 'A' then
      update bb_content set assignment_id = v_link
       where course_id = COURSE and bb_item_id = '_w52f_kc_a'
      returning id into v_ghost;

    elsif v_label = 'B' then
      if (select detail->>'missing_since' from bb_content where id = v_ghost) is distinct from v_run::text then
        v_fail := v_fail || '(B) the deleted Knowledge Check is not stamped missing'::text;
      end if;

    elsif v_label = 'C' then
      -- A weeks-old ghost is not a re-key target: the new item gets its own row, and the link
      -- stays on the ghost.
      if coalesce(v_r->>'rekeyed', '-') <> '0' or v_r->>'inserted' <> '1' then
        v_fail := v_fail || format('(C) crawl C returned %s', v_r);
      end if;
      select string_agg(format('%s:%s:%s', bb_item_id, coalesce(assignment_id, 'null'),
                               case when detail ? 'missing_since' then 'gone' else 'live' end),
                        ' ' order by bb_item_id)
        into v_got from bb_content where course_id = COURSE and path = KC_PATH;
      if v_got is distinct from format('_w52f_kc_a:%s:gone _w52f_kc_c:null:live', v_link) then
        v_fail := v_fail || format('(C) the Knowledge Check rows read %s', coalesce(v_got, '(none)'));
      end if;
      select id into v_fresh from bb_content where course_id = COURSE and bb_item_id = '_w52f_kc_c';

    else
      -- D: deleted and re-posted between C and D, so the row C made is re-keyed; the ghost is
      -- still not touched.
      if v_r->>'rekeyed' is distinct from '1' or v_r->>'inserted' <> '0' then
        v_fail := v_fail || format('(D) crawl D returned %s', v_r);
      end if;
      select format('%s|%s|%s', id, bb_item_id, detail->'previous_ids') into v_got
        from bb_content where course_id = COURSE and path = KC_PATH and detail->>'missing_since' is null;
      if v_got is distinct from format('%s|_w52f_kc_d|["_w52f_kc_c"]', v_fresh) then
        v_fail := v_fail || format('(D) the re-posted Knowledge Check reads %s', coalesce(v_got, '(none)'));
      end if;
      select format('%s|%s|%s', bb_item_id, coalesce(assignment_id, 'null'), detail->>'missing_since') into v_got
        from bb_content where id = v_ghost;
      if v_got is distinct from format('_w52f_kc_a|%s|%s', v_link, '00000000-1710-4000-8000-00000000000b') then
        v_fail := v_fail || format('(D) the ghost reads %s', coalesce(v_got, '(none)'));
      end if;
    end if;
  end loop;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_171: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase19_171_stage_content_fresh_rekey: PASS'                                       as result,
       (select count(*) from bb_content where course_id = 'W52.171')                        as fixture_rows;

rollback;
