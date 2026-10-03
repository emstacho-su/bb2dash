-- bb2dash :: db/tests/phase19_138_material_history_counts.sql
-- Phase 19 round 2 (brief 99, "Round 2", rows R2-2 to R2-5). Worker W-52.
-- Tests migration 138: material_history_record still writes every history row, but
--   R2-2  its counts and sample cover materials only: file rows, plus document and link nodes
--         no file row of the same run and item covers. A file node is one material, not two;
--         folders and learning modules are not materials.
--   R2-3  a folder rename marks no descendant changed: `path` is a changed field only when the
--         item's own parentId or its own title changed.
--   R2-4  a session-scoped (`/sessions/`) url compares as null, so its churn is not a change.
--   R2-5  older_run uses the registered-crawl predicate: a newer registered crawl folded ok or
--         partial makes this run older, even when that crawl wrote no history rows.
--
-- Crawls (one fixture course, registered one at a time, dated in the future):
--   1  baseline: folder Week 1 (document + file node + link under it), a module, a link whose
--      url is session-scoped
--   2  Week 1 renamed; the session url churns; a new folder with a document carrying a file, a
--      new file node, a new module
--   3  the link under Week 1 is retitled, the file node moves to the new folder, a document with
--      no file appears
--   4  as 3, registered and folded `ok` but never recorded
-- RUN IT: `node scripts/db-test.mjs --only phase19_138_material_history_counts.sql`, or paste
-- the whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

create temp table _fx138 (
  crawl int not null, ord int not null, id text not null, parent text not null, type text,
  path text not null, title text not null, detail jsonb, files jsonb
) on commit drop;

insert into _fx138 (crawl, ord, id, parent, type, path, title, detail, files) values
  (1, 1, '_w52k_f_1', '_w52k_root_1', 'resource/x-bb-folder', 'Week 1', 'Week 1', null, null),
  (1, 2, '_w52k_m_1', '_w52k_root_1', 'resource/x-bb-lesson', 'Module A', 'Module A', null, null),
  (1, 3, '_w52k_d_1', '_w52k_f_1', null, 'Week 1 / ultraDocumentBody', 'ultraDocumentBody', null,
      '[{"name":"d.pdf","url":"https://blackboard.syracuse.edu/bbcswebdav/w52k/d1","mime":"application/pdf","sessionScoped":false}]'),
  (1, 4, '_w52k_k_1', '_w52k_f_1', 'resource/x-bb-file', 'Week 1 / Slides', 'Slides',
      '{"file":{"url":"/bbcswebdav/w52k/k1","name":"slides.pptx"}}', null),
  (1, 5, '_w52k_l_1', '_w52k_f_1', 'resource/x-bb-externallink', 'Week 1 / Reading', 'Reading',
      '{"url":"https://example.invalid/w52k/reading"}', null),
  (1, 6, '_w52k_s_1', '_w52k_root_1', 'resource/x-bb-externallink', 'Session link', 'Session link',
      '{"url":"https://blackboard.syracuse.edu/sessions/aaa/x"}', null);

-- Crawl 2.
insert into _fx138 (crawl, ord, id, parent, type, path, title, detail, files)
select 2, ord, id, parent, type,
       replace(path, 'Week 1', 'Week 1 - Intro'),
       case when id = '_w52k_f_1' then 'Week 1 - Intro' else title end,
       case when id = '_w52k_s_1' then '{"url":"https://blackboard.syracuse.edu/sessions/bbb/x"}'::jsonb
            else detail end,
       files
  from _fx138 where crawl = 1;
insert into _fx138 (crawl, ord, id, parent, type, path, title, detail, files) values
  (2, 7, '_w52k_n_1', '_w52k_root_1', 'resource/x-bb-folder', 'Week 2', 'Week 2', null, null),
  (2, 8, '_w52k_n2_1', '_w52k_n_1', null, 'Week 2 / ultraDocumentBody', 'ultraDocumentBody', null,
      '[{"name":"e.pdf","url":"https://blackboard.syracuse.edu/bbcswebdav/w52k/e1","mime":"application/pdf","sessionScoped":false}]'),
  (2, 9, '_w52k_k2_1', '_w52k_n_1', 'resource/x-bb-file', 'Week 2 / Handout', 'Handout',
      '{"file":{"url":"/bbcswebdav/w52k/k2","name":"handout.pdf"}}', null),
  (2, 10, '_w52k_m2_1', '_w52k_root_1', 'resource/x-bb-lesson', 'Module B', 'Module B', null, null);

-- Crawl 3: the link is retitled, the file node moves under Week 2, a bare document appears.
insert into _fx138 (crawl, ord, id, parent, type, path, title, detail, files)
select 3, ord, id,
       case when id = '_w52k_k_1' then '_w52k_n_1' else parent end,
       type,
       case id when '_w52k_l_1' then 'Week 1 - Intro / Reading v2'
               when '_w52k_k_1' then 'Week 2 / Slides'
               else path end,
       case when id = '_w52k_l_1' then 'Reading v2' else title end,
       detail, files
  from _fx138 where crawl = 2;
insert into _fx138 (crawl, ord, id, parent, type, path, title, detail, files) values
  (3, 11, '_w52k_notes_1', '_w52k_root_1', null, 'Notes', 'Notes', null, null);

-- Crawl 4 repeats crawl 3.
insert into _fx138 (crawl, ord, id, parent, type, path, title, detail, files)
select 4, ord, id, parent, type, path, title, detail, files from _fx138 where crawl = 3;

do $$
declare
  COURSE  constant text := 'W52.138';
  SHELL   constant text := '_w52_138_1';
  v_fail  text[] := '{}';
  v_runs  uuid[] := '{}';
  v_r     jsonb;
  v_got   text;
  i       int;
begin
  insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short, bb_id)
  select COURSE, (select term_id from courses order by id limit 1), 'W52.138.FIXTURE', 'W52', '138', 'M001',
         'Phase 19 round 2 fixture course (rolled back)', 'W52 round 2 fixture', SHELL;

  for i in 1..4 loop
    v_runs := v_runs || format('00000000-1380-4000-8000-00000000000%s', i)::uuid;
    insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
    values ('sync', 'all', 'done', v_runs[i], format('Phase 19 round 2 fixture crawl %s (rolled back)', i),
            'phase19_138', now(), now());
    insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
    values (v_runs[i], 'ok', now(), now(), 'manual', 'blackboard', 'all');
    insert into bb_raw (run_id, kind, bb_course_id, captured_at, payload)
    select v_runs[i], 'course', SHELL, now() + make_interval(hours => i),
           jsonb_build_object('content', jsonb_agg(jsonb_build_object(
             'id', f.id, 'parentId', f.parent, 'type', f.type, 'path', f.path, 'title', f.title,
             'detail', f.detail, 'state', 'None', 'modified', 1790000000000,
             'embeddedFiles', coalesce(f.files, '[]'::jsonb)) order by f.ord))
      from _fx138 f where f.crawl = i;

    continue when i = 4;   -- crawl 4 is folded but never recorded
    v_r := material_history_record(v_runs[i]);

    if i = 1 then
      if (v_r - 'sample') is distinct from
         '{"appeared":0,"changed":0,"vanished":0,"baseline_courses":1,"older_run":false}'::jsonb then
        v_fail := v_fail || format('(1) baseline returned %s', v_r);
      end if;

    elsif i = 2 then
      -- R2-3 and R2-4: only the renamed folder itself changed; nothing under it, and not the
      -- session-scoped link. Every new node and file still has its row.
      select string_agg(format('%s %s %s %s', change, entity, bb_item_id, coalesce(changed_fields::text, '-')),
                        ' ; ' order by change, entity, bb_item_id collate "C", file_name)
        into v_got from bb_material_history where run_id = v_runs[2];
      if v_got is distinct from
         'appeared content _w52k_k2_1 - ; appeared content _w52k_m2_1 - ; appeared content _w52k_n2_1 - ; '
         'appeared content _w52k_n_1 - ; appeared file _w52k_k2_1 - ; appeared file _w52k_n2_1 - ; '
         'changed content _w52k_f_1 {title,path}' then
        v_fail := v_fail || format('(2) rows read %s', coalesce(v_got, '(none)'));
      end if;
      -- R2-2: two materials appeared (e.pdf and handout.pdf); the folder, the module, the file
      -- node and the document the file covers are not counted; the renamed folder is not one.
      if (v_r - 'sample') is distinct from
         '{"appeared":2,"changed":0,"vanished":0,"baseline_courses":0,"older_run":false}'::jsonb then
        v_fail := v_fail || format('(2) counts %s', v_r - 'sample');
      end if;
      select string_agg(e->>'title', ',' order by e->>'title') into v_got
        from jsonb_array_elements(v_r->'sample') e;
      if v_got is distinct from 'e.pdf,handout.pdf' then
        v_fail := v_fail || format('(2) sample titles %s', coalesce(v_got, '(none)'));
      end if;

    elsif i = 3 then
      select string_agg(format('%s %s %s %s', change, entity, bb_item_id, coalesce(changed_fields::text, '-')),
                        ' ; ' order by change, entity, bb_item_id collate "C", file_name)
        into v_got from bb_material_history where run_id = v_runs[3];
      if v_got is distinct from
         'appeared content _w52k_notes_1 - ; changed content _w52k_k_1 {path} ; '
         'changed content _w52k_l_1 {title,path}' then
        v_fail := v_fail || format('(3) rows read %s', coalesce(v_got, '(none)'));
      end if;
      -- A bare document is a material; the retitled link is; the moved file node is not
      -- (its file did not change).
      if (v_r - 'sample') is distinct from
         '{"appeared":1,"changed":1,"vanished":0,"baseline_courses":0,"older_run":false}'::jsonb then
        v_fail := v_fail || format('(3) counts %s', v_r - 'sample');
      end if;
    end if;
  end loop;

  -- R2-5: crawl 4 is newer, registered and folded, and wrote no history. Crawl 3 is now older.
  v_r := material_history_record(v_runs[3]);
  if (v_r->>'older_run')::boolean is distinct from true then
    v_fail := v_fail || format('(5) crawl 3 after a folded, unrecorded crawl 4 returned %s', v_r);
  end if;
  if (select count(*) from bb_material_history where run_id = any (v_runs)) <> 10 then
    v_fail := v_fail || format('(X) %s fixture rows, want 10',
                               (select count(*) from bb_material_history where run_id = any (v_runs)));
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_138: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase19_138_material_history_counts: PASS'                                       as result,
       (select count(*) from bb_material_history where course_id = 'W52.138')            as fixture_rows;

rollback;
