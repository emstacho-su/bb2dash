-- bb2dash :: db/tests/phase19_131_stage_content_item_key.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), tasks 1, 4, 5 and 6.
-- Worker W-52. Tests migration 131: bb_content is keyed (course_id, bb_item_id), and stage_content
-- upserts on that key, counts real changes and writes only as the newest registered crawl
-- (R-64, R-71, P-95).
--
-- Blocks:
--   (S) schema and privileges: the item key exists, the path key is gone, the path index exists,
--       bb_item_id is not null, both functions pin their search_path and are closed to anon and
--       authenticated, v_content_tree's comment no longer calls path unique
--   (P) prod: every item of the newest registered crawl that folded ok has exactly one row
--   (H) bb_content_path_history, called directly
--   (A) crawl A, an IST.466-shaped payload: two sibling lessons named Information, each with a
--       child on the same path. 7 items give 7 rows; each child hangs under its own lesson
--   (A2) a second fold of crawl A: updated = 0, unchanged = the item count, 0 rows change
--   (B) crawl B renames a folder (same item id) and drops a link: 2 rows updated, the old paths
--       kept in detail.previous_paths, no second row, the link stamped missing_since = B,
--       untouched rows keep crawl A's run_id
--   (O) crawl A folded again, now the older crawl: older_run = true and 0 rows change
--   (C) crawl C brings the link back: missing_cleared = 1; previous_ids and previous_paths are
--       carried; a shell no course claims is counted, not folded
--   (X) no bb_content row outside the fixture course changed at any point
--
-- The fixture course and its three crawls exist only inside this transaction. The crawls are
-- dated in the future so each is the newest registered crawl when it is folded. Schema failures
-- are raised before any function is called, so the unit reads plainly before 131 is applied.
-- RUN IT: `node scripts/db-test.mjs --only phase19_131_stage_content_item_key.sql`, or paste the
-- whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

create temp table _fx131 (
  run text not null, ord int not null, id text not null, parent text not null,
  type text, path text not null, title text not null, detail jsonb, description text
) on commit drop;

insert into _fx131 (run, ord, id, parent, type, path, title, detail, description) values
  ('A', 1, '_w52_l1_1', '_w52_root_1', 'resource/x-bb-lesson', 'Information', 'Information', null, null),
  ('A', 2, '_w52_l2_1', '_w52_root_1', 'resource/x-bb-lesson', 'Information', 'Information', null, null),
  ('A', 3, '_w52_c1_1', '_w52_l1_1', 'resource/x-bb-file', 'Information / Class Introduction', 'Class Introduction',
        '{"file":{"url":"/bbcswebdav/w52/c1","name":"intro1.pptx"}}', null),
  ('A', 4, '_w52_c2_1', '_w52_l2_1', 'resource/x-bb-file', 'Information / Class Introduction', 'Class Introduction',
        '{"file":{"url":"/bbcswebdav/w52/c2","name":"intro2.pptx"}}', null),
  ('A', 5, '_w52_f_1', '_w52_root_1', 'resource/x-bb-folder', 'WK01 - Chapter 1', 'WK01 - Chapter 1', null, null),
  ('A', 6, '_w52_d_1', '_w52_f_1', null, 'WK01 - Chapter 1 / ultraDocumentBody', 'ultraDocumentBody', null, 'Read chapter 1'),
  ('A', 7, '_w52_x_1', '_w52_root_1', 'resource/x-bb-externallink', 'Old link', 'Old link',
        '{"url":"https://example.invalid/w52"}', null);

-- Crawl B: the folder is renamed (its document moves with it) and the link is gone.
insert into _fx131 (run, ord, id, parent, type, path, title, detail, description)
select 'B', ord, id, parent, type,
       replace(path, 'WK01 - Chapter 1', 'WK01 - The Systems Development Environment'),
       replace(title, 'WK01 - Chapter 1', 'WK01 - The Systems Development Environment'),
       detail, description
  from _fx131 where run = 'A' and id <> '_w52_x_1';

-- Crawl C: as B, and the link is back.
insert into _fx131 (run, ord, id, parent, type, path, title, detail, description)
select 'C', ord, id, parent, type, path, title, detail, description from _fx131 where run = 'B';
insert into _fx131 (run, ord, id, parent, type, path, title, detail, description)
select 'C', ord, id, parent, type, path, title, detail, description
  from _fx131 where run = 'A' and id = '_w52_x_1';

do $$
declare
  RUN_A   constant uuid := '00000000-1310-4000-8000-00000000000a';
  RUN_B   constant uuid := '00000000-1310-4000-8000-00000000000b';
  RUN_C   constant uuid := '00000000-1310-4000-8000-00000000000c';
  COURSE  constant text := 'W52.131';
  SHELL   constant text := '_w52_131_1';
  v_fail  text[] := '{}';
  v_r     jsonb;
  v_n     bigint;
  v_got   text;
  v_want  text;
  v_snap  jsonb;
  v_world jsonb;
  v_bad   text;
  v_run   uuid;
  v_label text;
  v_at    timestamptz;
begin
  -- -------------------------------------------------------------------------------------------
  -- (S) schema and privileges
  -- -------------------------------------------------------------------------------------------
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.bb_content'::regclass and conname = 'bb_content_course_item_key'
                    and pg_get_constraintdef(oid) = 'UNIQUE (course_id, bb_item_id)') then
    v_fail := v_fail || '(S) no unique bb_content_course_item_key (course_id, bb_item_id)'::text;
  end if;
  if exists (select 1 from pg_constraint
              where conrelid = 'public.bb_content'::regclass and conname = 'bb_content_course_id_path_key') then
    v_fail := v_fail || '(S) bb_content_course_id_path_key still exists'::text;
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'bb_content'
                    and indexname = 'bb_content_course_path_idx') then
    v_fail := v_fail || '(S) no index bb_content_course_path_idx'::text;
  end if;
  if not (select attnotnull from pg_attribute
           where attrelid = 'public.bb_content'::regclass and attname = 'bb_item_id') then
    v_fail := v_fail || '(S) bb_content.bb_item_id is nullable'::text;
  end if;
  if to_regprocedure('public.bb_content_path_history(jsonb, jsonb, text, text)') is null then
    v_fail := v_fail || '(S) bb_content_path_history(jsonb, jsonb, text, text) does not exist'::text;
  else
    select string_agg(r, ', ' order by r) into v_bad
      from unnest(array['anon', 'authenticated']) r,
           unnest(array['public.stage_content(uuid)',
                        'public.bb_content_path_history(jsonb, jsonb, text, text)']) f
     where has_function_privilege(r, f, 'execute');
    if v_bad is not null then
      v_fail := v_fail || format('(S) executable by %s', v_bad);
    end if;
    if not has_function_privilege('service_role', 'public.stage_content(uuid)', 'execute')
       or not has_function_privilege('service_role', 'public.bb_content_path_history(jsonb, jsonb, text, text)', 'execute') then
      v_fail := v_fail || '(S) service_role lost execute'::text;
    end if;
    if (select not prosecdef or proconfig is distinct from array['search_path=public, pg_temp']
          from pg_proc where oid = 'public.stage_content(uuid)'::regprocedure) then
      v_fail := v_fail || '(S) stage_content is not definer with search_path = public, pg_temp'::text;
    end if;
    if (select prosecdef or provolatile <> 'i' or proconfig is distinct from array['search_path=""']
          from pg_proc where oid = 'public.bb_content_path_history(jsonb, jsonb, text, text)'::regprocedure) then
      v_fail := v_fail || '(S) bb_content_path_history is not invoker, immutable, search_path = '''''::text;
    end if;
  end if;
  if coalesce(obj_description('public.v_content_tree'::regclass, 'pg_class'), '') like '%unique per course%' then
    v_fail := v_fail || '(S) v_content_tree''s comment still calls path unique per course'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_131: %', array_to_string(v_fail, '; ');
  end if;

  -- -------------------------------------------------------------------------------------------
  -- (P) prod: the newest registered crawl that folded ok has a row for every item it carried
  -- -------------------------------------------------------------------------------------------
  select r.run_id into v_run
    from agent_requests r
   where r.kind = 'sync' and r.run_id is not null
     and exists (select 1 from sync_runs s
                  where s.run_id = r.run_id and s.status = 'ok' and s.scope is distinct from 'unregistered')
   order by (select max(b.captured_at) from bb_raw b where b.run_id = r.run_id) desc nulls last
   limit 1;
  select count(*) into v_n
    from bb_raw r
    cross join lateral jsonb_array_elements(bb_jarray(r.payload->'content')) e
   where r.run_id = v_run and r.kind = 'course'
     and bb_resolve_course(r.bb_course_id) is not null
     and (select count(*) from bb_content b
           where b.course_id = bb_resolve_course(r.bb_course_id) and b.bb_item_id = e->>'id') <> 1;
  if v_run is null or v_n <> 0 then
    v_fail := v_fail || format('(P) %s item(s) of crawl %s do not have exactly one row', v_n, coalesce(v_run::text, '(none)'));
  end if;

  -- -------------------------------------------------------------------------------------------
  -- (H) bb_content_path_history
  -- -------------------------------------------------------------------------------------------
  if bb_content_path_history(
       '{"previous_ids":["a"],"missing_since":"x","previous_paths":["p0"],"url":"old"}'::jsonb,
       '{"url":"u"}'::jsonb, 'p1', 'p2')
     is distinct from '{"url":"u","previous_ids":["a"],"previous_paths":["p0","p1"]}'::jsonb then
    v_fail := v_fail || '(H) a path change did not append the old path and carry previous_ids'::text;
  end if;
  if bb_content_path_history('{"previous_paths":["p0","p1"]}'::jsonb, null, 'p1', 'p2')
     is distinct from '{"previous_paths":["p0","p1"]}'::jsonb then
    v_fail := v_fail || '(H) an old path already recorded was appended twice'::text;
  end if;
  if bb_content_path_history('{"missing_since":"x"}'::jsonb, '{"url":"u"}'::jsonb, 'p', 'p')
     is distinct from '{"url":"u"}'::jsonb then
    v_fail := v_fail || '(H) an unchanged path wrote previous_paths, or missing_since survived'::text;
  end if;
  if bb_content_path_history('{"missing_since":"x"}'::jsonb, null, 'p', 'p') is not null then
    v_fail := v_fail || '(H) nothing to keep should return null'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- The fixture course, and a snapshot of every row that is not its own
  -- -------------------------------------------------------------------------------------------
  insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short, bb_id)
  select COURSE, (select term_id from courses order by id limit 1), 'W52.131.FIXTURE', 'W52', '131', 'M001',
         'Phase 19 fixture course (rolled back)', 'W52 fixture', SHELL;
  select jsonb_object_agg(b.id, md5(row(b.*)::text)) into v_world from bb_content b;

  -- -------------------------------------------------------------------------------------------
  -- The three crawls are registered and folded one at a time, in A, A, B, A, C order
  -- -------------------------------------------------------------------------------------------
  foreach v_label in array array['A', 'A2', 'B', 'O', 'C'] loop
    v_run := case left(v_label, 1) when 'A' then RUN_A when 'O' then RUN_A when 'B' then RUN_B else RUN_C end;
    v_at  := now() + case left(v_label, 1) when 'B' then interval '2 hours' when 'C' then interval '3 hours'
                                           else interval '1 hour' end;
    if v_label in ('A', 'B', 'C') then
      insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
      values ('sync', 'all', 'done', v_run, 'Phase 19 fixture crawl ' || v_label || ' (rolled back)',
              'phase19_131', now(), now());
      insert into bb_raw (run_id, kind, bb_course_id, captured_at, payload)
      select v_run, 'course', SHELL, v_at,
             jsonb_build_object('content', jsonb_agg(
               jsonb_build_object('id', f.id, 'parentId', f.parent, 'type', f.type, 'path', f.path,
                                  'title', f.title, 'detail', f.detail, 'description', f.description,
                                  'state', 'None', 'modified', 1790000000000, 'embeddedFiles', '[]'::jsonb)
               order by f.ord))
        from _fx131 f where f.run = v_label;
    end if;
    if v_label = 'C' then
      -- A shell no course claims, and a previous_ids value that must survive the fold.
      insert into bb_raw (run_id, kind, bb_course_id, captured_at, payload)
      values (v_run, 'course', '_w52_nowhere_1', v_at,
              '{"content":[{"id":"_w52_lost_1","parentId":"_w52_root_9","path":"Lost","title":"Lost"}]}'::jsonb);
      update bb_content set detail = coalesce(detail, '{}'::jsonb) || '{"previous_ids":["_w52_old_1"]}'::jsonb
       where course_id = COURSE and bb_item_id = '_w52_l1_1';
    end if;

    select jsonb_object_agg(b.id, md5(row(b.*)::text)) into v_snap from bb_content b where b.course_id = COURSE;
    v_r := stage_content(v_run);
    select count(*) into v_n from bb_content b
     where b.course_id = COURSE and md5(row(b.*)::text) is distinct from v_snap->>b.id::text;
    v_got := format('inserted %s updated %s unchanged %s missing %s missing_cleared %s items %s courses %s '
                    'title_fallbacks %s duplicate_paths %s unresolved_courses %s unresolved_items %s older_run %s '
                    'rows_changed %s',
                    v_r->>'inserted', v_r->>'updated', v_r->>'unchanged', v_r->>'missing', v_r->>'missing_cleared',
                    v_r->>'items', v_r->>'courses', v_r->>'title_fallbacks', v_r->>'duplicate_paths',
                    v_r->>'unresolved_courses', v_r->>'unresolved_items', v_r->>'older_run', v_n);
    v_want := case v_label
         when 'A'  then 'inserted 7 updated 0 unchanged 0 missing 0 missing_cleared 0 items 7 courses 1 title_fallbacks 1 duplicate_paths 2 unresolved_courses 0 unresolved_items 0 older_run false rows_changed 7'
         when 'A2' then 'inserted 0 updated 0 unchanged 7 missing 0 missing_cleared 0 items 7 courses 1 title_fallbacks 1 duplicate_paths 2 unresolved_courses 0 unresolved_items 0 older_run false rows_changed 0'
         when 'B'  then 'inserted 0 updated 2 unchanged 4 missing 1 missing_cleared 0 items 6 courses 1 title_fallbacks 1 duplicate_paths 2 unresolved_courses 0 unresolved_items 0 older_run false rows_changed 3'
         when 'O'  then 'inserted 0 updated 0 unchanged 0 missing 0 missing_cleared 0 items 7 courses 1 title_fallbacks 1 duplicate_paths 2 unresolved_courses 0 unresolved_items 0 older_run true rows_changed 0'
         else           'inserted 0 updated 1 unchanged 6 missing 0 missing_cleared 1 items 7 courses 1 title_fallbacks 1 duplicate_paths 2 unresolved_courses 1 unresolved_items 1 older_run false rows_changed 1'
       end;
    if v_got is distinct from v_want then
      v_fail := v_fail || format('(%s) %s', v_label, v_got);
    end if;
    if v_r->>'run_id' is distinct from v_run::text then
      v_fail := v_fail || format('(%s) run_id key reads %s', v_label, v_r->>'run_id');
    end if;

    if v_label = 'A' then
      select count(*) into v_n
        from bb_content c join bb_content p on p.id = c.parent_id
       where c.course_id = COURSE
         and (c.bb_item_id, p.bb_item_id) in (('_w52_c1_1', '_w52_l1_1'), ('_w52_c2_1', '_w52_l2_1'), ('_w52_d_1', '_w52_f_1'));
      if v_n <> 3 then
        v_fail := v_fail || format('(A) %s of 3 children hang under their own parent item', v_n);
      end if;
      select count(*) into v_n from bb_content
       where course_id = COURSE and parent_id is null
         and bb_item_id in ('_w52_l1_1', '_w52_l2_1', '_w52_f_1', '_w52_x_1');
      if v_n <> 4 then
        v_fail := v_fail || format('(A) %s of 4 root items have a null parent', v_n);
      end if;
      select string_agg(format('%s|%s|%s|%s', bb_item_id, item_kind, coalesce(bb_type, '-'), title), ' ; ' order by bb_item_id)
        into v_got from bb_content where course_id = COURSE and bb_item_id in ('_w52_d_1', '_w52_l2_1', '_w52_c2_1');
      if v_got is distinct from
         '_w52_c2_1|file|resource/x-bb-file|Class Introduction ; _w52_d_1|document|-|WK01 - Chapter 1 (document) ; '
         '_w52_l2_1|learning_module|resource/x-bb-lesson|Information' then
        v_fail := v_fail || format('(A) kinds, types and titles read %s', v_got);
      end if;
      if (select url is distinct from '/bbcswebdav/w52/c2' from bb_content
           where course_id = COURSE and bb_item_id = '_w52_c2_1')
         or (select detail->>'description' is distinct from 'Read chapter 1' from bb_content
              where course_id = COURSE and bb_item_id = '_w52_d_1') then
        v_fail := v_fail || '(A) the second same-path file lost its url, or the document its description'::text;
      end if;
    elsif v_label = 'B' then
      select string_agg(format('%s|%s|%s|%s', bb_item_id, path, detail->'previous_paths', left(run_id::text, 36)),
                        ' ; ' order by bb_item_id)
        into v_got from bb_content where course_id = COURSE and bb_item_id in ('_w52_f_1', '_w52_d_1');
      if v_got is distinct from format(
           '_w52_d_1|WK01 - The Systems Development Environment / ultraDocumentBody|["WK01 - Chapter 1 / ultraDocumentBody"]|%s ; '
           '_w52_f_1|WK01 - The Systems Development Environment|["WK01 - Chapter 1"]|%s', RUN_B, RUN_B) then
        v_fail := v_fail || format('(B) the renamed folder and its document read %s', v_got);
      end if;
      if (select count(*) from bb_content where course_id = COURSE) <> 7 then
        v_fail := v_fail || '(B) the rename left a second row'::text;
      end if;
      if (select detail->>'missing_since' from bb_content where course_id = COURSE and bb_item_id = '_w52_x_1')
         is distinct from RUN_B::text then
        v_fail := v_fail || '(B) the dropped link is not stamped missing_since = crawl B'::text;
      end if;
      if (select count(*) from bb_content where course_id = COURSE and run_id = RUN_A) <> 5 then
        v_fail := v_fail || '(B) an unchanged row lost crawl A''s run_id'::text;
      end if;
      if (select title from bb_content where course_id = COURSE and bb_item_id = '_w52_d_1')
         is distinct from 'WK01 - The Systems Development Environment (document)' then
        v_fail := v_fail || '(B) the document''s fallback title did not follow its folder'::text;
      end if;
    elsif v_label = 'C' then
      if (select detail ? 'missing_since' or detail->>'url' is distinct from 'https://example.invalid/w52'
            from bb_content where course_id = COURSE and bb_item_id = '_w52_x_1') then
        v_fail := v_fail || '(C) the returned link still reads missing, or lost its detail'::text;
      end if;
      if (select detail from bb_content where course_id = COURSE and bb_item_id = '_w52_l1_1')
         is distinct from '{"previous_ids":["_w52_old_1"]}'::jsonb then
        v_fail := v_fail || '(C) previous_ids was not carried as it is'::text;
      end if;
      if (select detail->'previous_paths' from bb_content where course_id = COURSE and bb_item_id = '_w52_f_1')
         is distinct from '["WK01 - Chapter 1"]'::jsonb then
        v_fail := v_fail || '(C) previous_paths was not carried by a fold that changed nothing'::text;
      end if;
      if exists (select 1 from bb_content where bb_item_id = '_w52_lost_1') then
        v_fail := v_fail || '(C) an item of an unclaimed shell was folded'::text;
      end if;
    end if;
  end loop;

  -- -------------------------------------------------------------------------------------------
  -- (X) nothing outside the fixture course moved
  -- -------------------------------------------------------------------------------------------
  select count(*) into v_n
    from bb_content b
   where b.course_id <> COURSE and md5(row(b.*)::text) is distinct from v_world->>b.id::text;
  if v_n <> 0 or (select count(*) from bb_content where course_id <> COURSE)
                 <> (select count(*) from jsonb_object_keys(v_world)) then
    v_fail := v_fail || format('(X) %s row(s) of other courses changed', v_n);
  end if;

  begin
    perform stage_content(null);
    v_fail := v_fail || 'a null run id did not raise'::text;
  exception when sqlstate '22004' then null;
  end;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_131: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase19_131_stage_content_item_key: PASS'                                       as result,
       (select count(*) from bb_content where course_id = 'W52.131')                     as fixture_rows,
       (select count(*) from bb_content where course_id = 'W52.131' and detail ? 'previous_paths') as renamed_rows;

rollback;
