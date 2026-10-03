-- bb2dash :: db/tests/phase19_172_stream_lti.sql
-- Phase 19 round 4 (Stack, 2026-10-03: "Videos don't need to be downloaded and stored... Only
-- keep the link to it."). Worker W-52.
-- Tests migration 172: an LTI item (a Kaltura video, `resource/x-bb-blti-link`, item_kind
-- `lti`) is a material, posted as a link and never fetched.
--   (1) an `lti` node that appeared posts on the Stream once, as a `bb_content` post with
--       meta.item_kind = 'lti' and its url in meta.url
--   (2) Activity counts it (170 reads appeared and changed from the Stream)
--   (3) an `lti` node that vanished is counted in `vanished`
--   (4) nothing is ever fetched for it: stage_files, run on the crawl, catalogues no bb_files
--       row for the item, and the history holds no `file` row for it
-- Crawls of one fixture course, each registered and folded in turn (stage_content, then
-- stage_files for crawl 2, then material_history_record), dated in the future.
-- RUN IT: `node scripts/db-test.mjs --only phase19_172_stream_lti.sql`, or paste the whole file
-- into one `execute_sql` call. The last statement is `rollback`.

begin;

create temp table _fx172 (
  crawl int not null, ord int not null, id text not null, type text,
  path text not null, title text not null, detail jsonb
) on commit drop;

insert into _fx172 (crawl, ord, id, type, path, title, detail) values
  (1, 1, '_w52v_l_1', 'resource/x-bb-externallink', 'Reading', 'Reading', '{"url":"https://example.invalid/w52v/reading"}'),
  (2, 1, '_w52v_l_1', 'resource/x-bb-externallink', 'Reading', 'Reading', '{"url":"https://example.invalid/w52v/reading"}'),
  (2, 2, '_w52v_v_1', 'resource/x-bb-blti-link', 'Lab Tips video', 'Lab Tips video',
      '{"url":"https://kaltura.example.invalid/w52v/lab-tips"}'),
  (3, 1, '_w52v_l_1', 'resource/x-bb-externallink', 'Reading', 'Reading', '{"url":"https://example.invalid/w52v/reading"}');

do $$
declare
  COURSE  constant text := 'W52.172';
  SHELL   constant text := '_w52_172_1';
  v_fail  text[] := '{}';
  v_runs  uuid[] := '{}';
  v_sync  bigint;
  v_r     jsonb;
  v_got   text;
  i       int;
begin
  insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short, bb_id)
  select COURSE, (select term_id from courses order by id limit 1), 'W52.172.FIXTURE', 'W52', '172', 'M001',
         'Phase 19 video fixture course (rolled back)', 'W52 video fixture', SHELL;

  for i in 1..3 loop
    v_runs := v_runs || format('00000000-1720-4000-8000-00000000000%s', i)::uuid;
    insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
    values ('sync', 'all', 'done', v_runs[i], format('Phase 19 video fixture crawl %s (rolled back)', i),
            'phase19_172', now(), now());
    insert into bb_raw (run_id, kind, bb_course_id, captured_at, payload)
    select v_runs[i], 'course', SHELL, now() + make_interval(hours => i),
           jsonb_build_object('content', jsonb_agg(jsonb_build_object(
             'id', f.id, 'parentId', '_w52v_root_1', 'type', f.type, 'path', f.path, 'title', f.title,
             'detail', f.detail, 'state', 'None', 'modified', 1790000000000, 'embeddedFiles', '[]'::jsonb)
             order by f.ord))
      from _fx172 f where f.crawl = i;
    if i > 1 then
      insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
      values (v_runs[i - 1], 'ok', now(), now(), 'manual', 'blackboard', 'all');
    end if;

    perform stage_content(v_runs[i]);
    if i = 2 then
      -- (4) the file stage sees the crawl and catalogues nothing for the video.
      insert into sync_runs (run_id, status, started_at, trigger, source, scope)
      values ('00000000-1720-4000-8000-0000000000f2', 'running', now(), 'manual', 'blackboard', 'all')
      returning id into v_sync;
      v_r := stage_files(v_runs[i], v_sync);
      if v_r->>'status' is distinct from 'ok' then
        v_fail := v_fail || format('(4) stage_files read %s %s', v_r->>'status', v_r->>'error');
      end if;
    end if;
    v_r := material_history_record(v_runs[i]);

    if i = 2 then
      -- (1) one post, a link to the video
      select string_agg(format('%s|%s|%s|%s|%s', ref_kind, title, meta->>'item_kind', meta->>'url', meta->>'change'), ' ; ')
        into v_got
        from v_course_stream
       where course_id = COURSE and post_kind = 'material' and meta->>'run_id' = v_runs[2]::text;
      if v_got is distinct from 'bb_content|Lab Tips video|lti|https://kaltura.example.invalid/w52v/lab-tips|appeared' then
        v_fail := v_fail || format('(1) crawl 2 posts %s', coalesce(v_got, '(none)'));
      end if;
      -- (2) Activity counts it
      if (v_r - 'sample') is distinct from
         '{"appeared":1,"changed":0,"vanished":0,"baseline_courses":0,"older_run":false}'::jsonb
         or v_r->'sample' is distinct from '[{"change":"appeared","entity":"content","title":"Lab Tips video"}]'::jsonb then
        v_fail := v_fail || format('(2) crawl 2 returned %s', v_r);
      end if;
    elsif i = 3 then
      -- (3) the video is gone
      if (v_r - 'sample') is distinct from
         '{"appeared":0,"changed":0,"vanished":1,"baseline_courses":0,"older_run":false}'::jsonb then
        v_fail := v_fail || format('(3) crawl 3 returned %s', v_r);
      end if;
    end if;
  end loop;

  -- (1) once, across all three crawls
  if (select count(*) from v_course_stream
       where course_id = COURSE and post_kind = 'material' and title = 'Lab Tips video') <> 1 then
    v_fail := v_fail || '(1) the video does not post exactly once'::text;
  end if;
  -- (4) never fetched
  if exists (select 1 from bb_files where course_id = COURSE and content_id = '_w52v_v_1')
     or exists (select 1 from bb_material_history
                 where course_id = COURSE and bb_item_id = '_w52v_v_1' and entity = 'file') then
    v_fail := v_fail || '(4) a file was catalogued or recorded for the video'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_172: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase19_172_stream_lti: PASS'                                                      as result,
       (select count(*) from v_course_stream
         where post_kind = 'material' and meta->>'item_kind' = 'lti')                       as lti_posts;

rollback;
