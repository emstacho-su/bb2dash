-- bb2dash :: db/tests/phase19_170_activity_stream.sql
-- Phase 19 round 3 (brief 99, "Round 3", rows R3-2, R3-3 and R3-4). Worker W-52.
-- Tests migration 170:
--   (R3-4) Activity counts exactly what the Stream posts for the run. material_history_record's
--          `appeared` and `changed` equal the run's material posts in v_course_stream, by
--          change; `vanished` counts the same kinds of thing (catalogued files, and document,
--          link or file nodes no bb_files row claims). A document whose catalogued file claims
--          it does not count when only the document changed; a file node nobody catalogued
--          does.
--   (R3-2) a file history row whose bb_file_id is null posts once its file is catalogued: the
--          Stream resolves it at read time on (course_id, content_id = bb_item_id, file_name).
--   (R3-3) prod: no content `changed` row is left whose changed_fields is exactly {path} while,
--          recomputed from bb_raw, the item's own parentId and title are the same in its run and
--          the run's predecessor (138's rule). 10 such rows on 2026-10-03, before 170.
-- RUN IT: `node scripts/db-test.mjs --only phase19_170_activity_stream.sql`, or paste the whole
-- file into one `execute_sql` call. The last statement is `rollback`.

begin;

create temp table _fx170 (
  crawl int not null, ord int not null, id text not null, type text,
  path text not null, title text not null, detail jsonb, files jsonb
) on commit drop;

insert into _fx170 (crawl, ord, id, type, path, title, detail, files) values
  (1, 1, '_w52a_d_1', null, 'Lecture notes', 'Lecture notes', null,
      '[{"name":"f.pdf","url":"https://blackboard.syracuse.edu/bbcswebdav/w52a/f1","mime":"application/pdf","sessionScoped":false}]'),
  (1, 2, '_w52a_l_1', 'resource/x-bb-externallink', 'Reading', 'Reading',
      '{"url":"https://example.invalid/w52a/reading"}', null),
  (1, 3, '_w52a_q_1', 'resource/x-bb-file', 'Quiz sheet', 'Quiz sheet',
      '{"file":{"url":"https://blackboard.syracuse.edu/sessions/q1/x","name":"quiz.pdf"}}', null);

-- Crawl 2: the document is retitled (its file is not touched); a file node nobody can catalogue
-- (session-scoped) and a document carrying a catalogued file appear.
insert into _fx170 (crawl, ord, id, type, path, title, detail, files)
select 2, ord, id, type,
       case when id = '_w52a_d_1' then 'Lecture notes v2' else path end,
       case when id = '_w52a_d_1' then 'Lecture notes v2' else title end,
       detail, files
  from _fx170 where crawl = 1;
insert into _fx170 (crawl, ord, id, type, path, title, detail, files) values
  (2, 4, '_w52a_q2_1', 'resource/x-bb-file', 'Quiz sheet 2', 'Quiz sheet 2',
      '{"file":{"url":"https://blackboard.syracuse.edu/sessions/q2/x","name":"quiz2.pdf"}}', null),
  (2, 5, '_w52a_n_1', null, 'Week 2 handout', 'Week 2 handout', null,
      '[{"name":"g.pdf","url":"https://blackboard.syracuse.edu/bbcswebdav/w52a/g1","mime":"application/pdf","sessionScoped":false}]');

-- Crawl 3: the link, the uncatalogued file node and the document with its file are gone.
insert into _fx170 (crawl, ord, id, type, path, title, detail, files)
select 3, ord, id, type, path, title, detail, files
  from _fx170 where crawl = 2 and id in ('_w52a_d_1', '_w52a_q_1');

do $$
declare
  COURSE  constant text := 'W52.170';
  SHELL   constant text := '_w52_170_1';
  v_fail  text[] := '{}';
  v_runs  uuid[] := '{}';
  v_r     jsonb;
  v_got   text;
  v_n     bigint;
  v_late  bigint;
  i       int;
begin
  -- -------------------------------------------------------------------------------------------
  -- (R3-3) prod
  -- -------------------------------------------------------------------------------------------
  select count(*) into v_n
    from bb_material_history h
    join lateral (
      select r.payload, r.captured_at
        from bb_raw r
       where r.run_id = h.run_id and r.kind = 'course'
         and bb_resolve_course(r.bb_course_id) = h.course_id
       order by r.captured_at desc, r.id desc
       limit 1) cur on true
    join lateral (
      select r.payload
        from bb_raw r
       where r.kind = 'course' and r.run_id <> h.run_id
         and bb_resolve_course(r.bb_course_id) = h.course_id
         and r.captured_at < cur.captured_at
         and jsonb_array_length(bb_jarray(r.payload->'content')) > 0
         and exists (select 1 from agent_requests a where a.kind = 'sync' and a.run_id = r.run_id)
         and exists (select 1 from sync_runs s
                      where s.run_id = r.run_id and s.scope is distinct from 'unregistered'
                        and s.status in ('ok', 'partial'))
       order by r.captured_at desc, r.id desc
       limit 1) pred on true
    cross join lateral (
      select e from jsonb_array_elements(bb_jarray(cur.payload->'content')) e
       where e->>'id' = h.bb_item_id limit 1) ci
    cross join lateral (
      select e from jsonb_array_elements(bb_jarray(pred.payload->'content')) e
       where e->>'id' = h.bb_item_id limit 1) pi
   where h.entity = 'content' and h.change = 'changed' and h.changed_fields = array['path']
     and nullif(btrim(coalesce(ci.e->>'parentId', '')), '') is not distinct from
         nullif(btrim(coalesce(pi.e->>'parentId', '')), '')
     and btrim(coalesce(ci.e->>'title', '')) = btrim(coalesce(pi.e->>'title', ''));
  if v_n <> 0 then
    v_fail := v_fail || format('(R3-3) %s path-only row(s) left that 138 would not write', v_n);
  end if;

  -- -------------------------------------------------------------------------------------------
  -- (R3-4) the fixture course, three crawls registered and folded in turn
  -- -------------------------------------------------------------------------------------------
  insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short, bb_id)
  select COURSE, (select term_id from courses order by id limit 1), 'W52.170.FIXTURE', 'W52', '170', 'M001',
         'Phase 19 round 3 fixture course (rolled back)', 'W52 round 3 fixture', SHELL;
  -- stage_files' catalogue: f.pdf claims the document, g.pdf the new one; the session-scoped
  -- quiz files are never catalogued.
  insert into bb_files (bb_course_id, course_id, content_id, path, file_name, source_url, bucket) values
    (SHELL, COURSE, '_w52a_d_1', 'Lecture notes',  'f.pdf', 'https://blackboard.syracuse.edu/bbcswebdav/w52a/f1', 'readings'),
    (SHELL, COURSE, '_w52a_n_1', 'Week 2 handout', 'g.pdf', 'https://blackboard.syracuse.edu/bbcswebdav/w52a/g1', 'readings');

  for i in 1..3 loop
    v_runs := v_runs || format('00000000-1700-4000-8000-00000000000%s', i)::uuid;
    insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
    values ('sync', 'all', 'done', v_runs[i], format('Phase 19 round 3 fixture crawl %s (rolled back)', i),
            'phase19_170', now(), now());
    insert into bb_raw (run_id, kind, bb_course_id, captured_at, payload)
    select v_runs[i], 'course', SHELL, now() + make_interval(hours => i),
           jsonb_build_object('content', jsonb_agg(jsonb_build_object(
             'id', f.id, 'parentId', '_w52a_root_1', 'type', f.type, 'path', f.path, 'title', f.title,
             'detail', f.detail, 'state', 'None', 'modified', 1790000000000,
             'embeddedFiles', coalesce(f.files, '[]'::jsonb)) order by f.ord))
      from _fx170 f where f.crawl = i;
    if i > 1 then
      insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
      values (v_runs[i - 1], 'ok', now(), now(), 'manual', 'blackboard', 'all');
    end if;

    -- A fold's order: the content tree first (the Stream's node arm reads it), then the history.
    perform stage_content(v_runs[i]);
    v_r := material_history_record(v_runs[i]);

    if i = 2 then
      -- g.pdf and the uncatalogued quiz node post; the retitled document does not (its file
      -- claims it), nor the new document (g.pdf claims it).
      if (v_r - 'sample') is distinct from
         '{"appeared":2,"changed":0,"vanished":0,"baseline_courses":0,"older_run":false}'::jsonb then
        v_fail := v_fail || format('(R3-4) crawl 2 counts %s', v_r - 'sample');
      end if;
      select string_agg(e->>'title', ',' order by e->>'title' collate "C") into v_got
        from jsonb_array_elements(v_r->'sample') e;
      if v_got is distinct from 'Quiz sheet 2,g.pdf' then
        v_fail := v_fail || format('(R3-4) crawl 2 sample %s', coalesce(v_got, '(none)'));
      end if;
    elsif i = 3 then
      -- The link, the uncatalogued quiz node and the catalogued g.pdf are gone; the document
      -- g.pdf claimed is not counted on its own.
      if (v_r - 'sample') is distinct from
         '{"appeared":0,"changed":0,"vanished":3,"baseline_courses":0,"older_run":false}'::jsonb then
        v_fail := v_fail || format('(R3-4) crawl 3 counts %s', v_r - 'sample');
      end if;
    end if;

    -- One test for both: Activity's appeared and changed are the Stream's posts for the run.
    if i > 1 then
      select format('appeared %s changed %s',
                    count(*) filter (where s.meta->>'change' = 'appeared'),
                    count(*) filter (where s.meta->>'change' = 'changed'))
        into v_got
        from v_course_stream s
       where s.course_id = COURSE and s.post_kind = 'material' and s.meta->>'run_id' = v_runs[i]::text;
      if v_got is distinct from format('appeared %s changed %s', v_r->>'appeared', v_r->>'changed') then
        v_fail := v_fail || format('(R3-4) crawl %s: Activity %s/%s, Stream %s',
                                   i, v_r->>'appeared', v_r->>'changed', v_got);
      end if;
    end if;
  end loop;

  -- -------------------------------------------------------------------------------------------
  -- (R3-2) a null bb_file_id resolves at read time
  -- -------------------------------------------------------------------------------------------
  insert into bb_files (bb_course_id, course_id, content_id, path, file_name, source_url, bucket)
  values (SHELL, COURSE, '_w52a_late_1', 'Late', 'late.pdf', 'https://blackboard.syracuse.edu/bbcswebdav/w52a/late', 'readings')
  returning id into v_late;
  insert into bb_material_history
    (run_id, course_id, entity, bb_item_id, file_name, bb_file_id, change, title, path, seen_at)
  values
    ('00000000-1700-4000-8000-0000000000aa', COURSE, 'file', '_w52a_late_1', 'late.pdf', null, 'appeared',
     'late.pdf', 'Late', now()),
    ('00000000-1700-4000-8000-0000000000aa', COURSE, 'file', '_w52a_none_1', 'none.pdf', null, 'appeared',
     'none.pdf', 'None', now());
  select string_agg(ref_id, ',' order by ref_id) into v_got
    from v_course_stream
   where course_id = COURSE and meta->>'run_id' = '00000000-1700-4000-8000-0000000000aa';
  if v_got is distinct from v_late::text then
    v_fail := v_fail || format('(R3-2) the unresolved rows post %s, want %s', coalesce(v_got, '(none)'), v_late);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_170: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase19_170_activity_stream: PASS'                                                as result,
       (select count(*) from bb_material_history
         where entity = 'content' and change = 'changed' and changed_fields = array['path']) as path_only_rows;

rollback;
