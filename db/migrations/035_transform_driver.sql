-- bb2dash :: 035_transform_driver.sql
-- Phase 9 (docs/planning/62_PHASE9_sync_loop.md, "Migration 035 - driver, detection, reaper,
-- cron"). This is the piece that makes the loop a loop: nobody has to remember to run anything.
--
-- Contents
--   agent_requests.run_id  the crawl a sync request owns - and the authorisation for folding it
--   bb_raw unique index    one payload per (run, kind, shell); a second one is refused
--   app_settings           one owner-editable row of configuration (the iCal feed URL)
--   sync_change_lines()    the plain-language "what changed" list the Activity feed reads
--   run_transform()        one crawl -> one sync_runs row -> six stages -> a summary
--   transform_tick()       every two minutes: fold registered crawls, reap dead runs, drain requests
--   ical_poll()            daily; skipped while the feed URL is blank
--   v_sync_status          the single row Home and the Inbox header read
--   pg_cron schedules      so the two above actually run
--
-- ---------------------------------------------------------------------------------------------
-- THE AUTHORISATION PROBLEM, and why the driver does not trust bb_raw
-- ---------------------------------------------------------------------------------------------
-- bb_raw carries an anon INSERT policy with `with check (true)` - it has to, because the crawler
-- runs in a browser tab holding only the publishable key. run_id is a bare uuid the browser
-- generates. So anyone with the publishable key can POST a kind='course' row and a kind='calendar'
-- row under any uuid they like, with a guessable bb_course_id and any titles, urls and bodies
-- they choose. If the scheduler folded "every complete run_id in bb_raw", it would fold those
-- straight onto Stack's dashboard.
--
-- The fix is that a crawl must be CLAIMED before it is trusted. The Sync button inserts an
-- agent_requests row; the bb-sync skill, holding the owner's JWT, writes the run_id it is about
-- to crawl into agent_requests.run_id BEFORE calling bb.runAll. Only run_ids registered that way
-- are ever folded:
--   * transform_tick() iterates registered requests, not bb_raw.
--   * run_transform() refuses outright if the run has no registered request, so a manual call
--     cannot walk around the guard either.
--   * a complete crawl in bb_raw that nobody registered is quarantined once - a sync_runs row
--     with scope = 'unregistered' plus a sync_stage_runs row stage='crawl', status='skipped',
--     error='unregistered run' - and then ignored forever. It is recorded, never folded, and
--     never re-examined, so a flood of junk costs one row each and nothing else.
-- The exact registration call the bb-sync skill has to make is written out in
-- docs/planning/64_W15_VERIFICATION.md under "bb-sync registration step for the PM".
--
-- ---------------------------------------------------------------------------------------------
-- pg_cron was NOT installed on this project before this migration (verified 2026-09-10).
-- `create extension if not exists pg_cron` below installs it. The extension records the role that
-- scheduled each job, and apply_migration runs as **postgres**, so both jobs run as postgres -
-- which is also the owner of every function they call, so the security definer functions execute
-- with exactly the privileges they were written for. cron.job is queried in the verification note
-- to prove both jobs exist.

-- =============================================================================================
-- 1. agent_requests.run_id - the registration that authorises a fold
-- =============================================================================================
alter table agent_requests add column run_id uuid;
create index agent_requests_run_idx on agent_requests (run_id) where run_id is not null;

comment on column agent_requests.run_id is
  'The bb_raw.run_id this sync request owns. The bb-sync skill writes it with the owner''s JWT '
  'BEFORE crawling. It is the only thing that authorises the transform to fold that run: a '
  'bb_raw run_id with no request here is quarantined and ignored, because bb_raw accepts anon '
  'inserts and its run_id is chosen by the browser.';

-- A second course payload for the same shell inside one run used to win by insertion order.
-- Now it is refused. Verified against live data first: zero duplicate (run_id, kind, shell)
-- groups across all 24 bb_raw rows, so this index is safe to add.
create unique index bb_raw_run_kind_shell_uidx
  on bb_raw (run_id, kind, (coalesce(bb_course_id, '')));

-- The two crawls already in bb_raw were run by Stack himself from a logged-in tab, before this
-- guard existed. Registering them is a statement of fact, not a bypass, and it is what lets the
-- transform fold them. Run 87440f01 (the 17:27 duplicate of the 17:29 crawl on the same day) is
-- deliberately NOT registered: it is superseded, and leaving it out demonstrates the guard.
insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
select v.kind, 'all', 'done', v.run_id::uuid, v.note, 'W-15 backfill', now(), now()
from (values
  ('sync', '6b122650-49f3-4a70-a801-c177fbf27f1a',
   'Retroactive registration of the 2026-09-08 17:29 crawl, run by Stack from a logged-in Blackboard tab before agent_requests existed.'),
  ('sync', '3e12fd89-1ac8-4ab1-bd2a-0dce984a90fc',
   'Retroactive registration of the 2026-09-02 crawl, run by Stack from a logged-in Blackboard tab before agent_requests existed.')
) as v(kind, run_id, note)
where not exists (select 1 from agent_requests a where a.run_id = v.run_id::uuid);

-- =============================================================================================
-- 2. app_settings: one row, owner-editable
-- =============================================================================================
create table app_settings (
  id                 boolean primary key default true check (id),  -- exactly one row, forever
  ical_url           text,
  ical_request_id    bigint,       -- pg_net request awaiting a response (see ical_poll)
  ical_requested_at  timestamptz,
  ical_last_status   integer,      -- HTTP status of the last collected response
  ical_last_error    text,
  updated_at         timestamptz not null default now()
);

insert into app_settings (id) values (true) on conflict (id) do nothing;

alter table app_settings enable row level security;
create policy app_settings_owner_all on app_settings for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

create trigger app_settings_updated_at before update on app_settings
  for each row execute function set_updated_at();

comment on table app_settings is
  'Single-row configuration. The primary key is a boolean fixed at true by a check constraint, '
  'so a second row is impossible. Owner-scoped like every other table.';
comment on column app_settings.ical_url is
  'Blackboard Ultra calendar share link. Blank until Stack pastes one in; ical_poll() writes a '
  'skipped stage row and does nothing while it is blank. Never commit the URL to the repo.';

-- =============================================================================================
-- 3. sync_change_lines: the Activity feed's sentences, derived from the stage counts
-- =============================================================================================
-- Kept separate from run_transform so the wording can change without touching the driver, and
-- so it can be checked against a fixture. Input is {stage_name: {counts...}}.
create or replace function sync_change_lines(p_stages jsonb) returns jsonb
  language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v jsonb := '[]'::jsonb;
  n int;
begin
  n := coalesce((p_stages->'courses'->>'courses_updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('Course details changed for %s course(s)', n)); end if;
  n := coalesce((p_stages->'courses'->>'staff_inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new staff member(s) from Blackboard', n)); end if;
  n := coalesce((p_stages->'courses'->>'staff_conflicts')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s staff name disagreement(s) need your call', n)); end if;
  n := coalesce((p_stages->'courses'->>'courses_unresolved')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s Blackboard shell(s) match no course here', n)); end if;

  n := coalesce((p_stages->'content'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new item(s) in the course content tree', n)); end if;
  n := coalesce((p_stages->'content'->>'missing')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s content item(s) are no longer in Blackboard', n)); end if;

  n := coalesce((p_stages->'assignments'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new gradebook column(s) added as tentative assignments', n)); end if;
  n := coalesce((p_stages->'assignments'->>'fields_filled')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s missing due date or point value filled in from Blackboard', n)); end if;
  n := coalesce((p_stages->'assignments'->>'fields_overwritten')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s tentative value(s) replaced by Blackboard''s', n)); end if;
  n := coalesce((p_stages->'assignments'->>'repointed')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s assignment(s) re-pointed at a re-created Blackboard item', n)); end if;
  n := coalesce((p_stages->'assignments'->>'conflicts')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s disagreement(s) with Blackboard left for you to settle', n)); end if;
  n := coalesce((p_stages->'assignments'->>'out_of_term_dates')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s Blackboard due date(s) fall outside the term and were not applied', n)); end if;
  n := coalesce((p_stages->'assignments'->>'resolutions_applied_blackboard')::int, 0)
     + coalesce((p_stages->'assignments'->>'resolutions_applied_keep')::int, 0)
     + coalesce((p_stages->'assignments'->>'resolutions_applied_value')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s of your Inbox answers applied', n)); end if;

  n := coalesce((p_stages->'announcements'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new announcement(s)', n)); end if;
  n := coalesce((p_stages->'announcements'->>'updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s announcement(s) changed', n)); end if;

  n := coalesce((p_stages->'files'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new file(s) catalogued', n)); end if;
  n := coalesce((p_stages->'files'->>'source_url_updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) were re-uploaded in Blackboard; the stored copy may be stale', n)); end if;
  n := coalesce((p_stages->'files'->>'marked_missing')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) are no longer in Blackboard', n)); end if;
  n := coalesce((p_stages->'files'->>'session_scoped_skipped')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) had no durable link and were skipped', n)); end if;

  n := coalesce((p_stages->'gaps'->>'attention_raised')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s gap(s) added to the Inbox', n)); end if;

  if jsonb_array_length(v) = 0 then
    v := v || to_jsonb('Nothing changed'::text);
  end if;
  return v;
end $$;

-- =============================================================================================
-- 4. run_transform: one crawl, one sync_runs row, six stages, one summary
-- =============================================================================================
create or replace function run_transform(p_run_id uuid, p_trigger text default 'manual')
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
  v_prev record;
  v_stages  jsonb := '{}'::jsonb;   -- {stage: counts}
  v_errors  jsonb := '[]'::jsonb;
  v_r       jsonb;
  v_cc      jsonb;
  v_started timestamptz;
  v_before  bigint;
  v_after   bigint;
  v_failed  int := 0;
  v_status  text;
begin
  -- Idempotent. A run that already has a real sync_runs row is never folded twice: a finished
  -- row is returned as-is, and a row still marked running means another tick is mid-flight (the
  -- reaper in transform_tick releases one that really did die). A quarantine row is not a fold,
  -- so it is skipped here - registering a run later still lets it through.
  select id, status into v_prev
    from sync_runs
   where run_id = p_run_id and scope is distinct from 'unregistered'
   order by id desc limit 1;
  if found then
    return v_prev.id;
  end if;

  -- The guard. bb_raw accepts anon inserts, so "this run exists in bb_raw" proves nothing.
  if not exists (select 1 from agent_requests a
                  where a.kind = 'sync' and a.run_id = p_run_id) then
    raise exception
      'run % is not registered by an owner-authenticated sync request; refusing to fold it', p_run_id
      using hint = 'Insert or update an agent_requests row (kind = sync) with this run_id from an authenticated session first.';
  end if;

  insert into sync_runs (run_id, status, started_at, trigger, source, scope)
  values (p_run_id, 'running', now(),
          case when p_trigger in ('manual','scheduled','app_request') then p_trigger else 'manual' end,
          'blackboard', 'all')
  returning id into v_id;

  begin
    select count(*) into v_before from attention_items;

    v_r := stage_courses(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('courses', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- stage_content belongs to Phase 8. Call it if it is installed; record an honest skipped
    -- row if it is not, rather than failing a whole sync over a function someone else owns.
    v_started := clock_timestamp();
    if to_regprocedure('public.stage_content(uuid)') is null then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'content', 'skipped', '{}'::jsonb, v_started, clock_timestamp(),
              'stage_content not installed');
      v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
      v_errors := v_errors || to_jsonb('stage_content not installed'::text);
    else
      begin
        execute 'select public.stage_content($1)' into v_cc using p_run_id;
        v_cc := coalesce(v_cc, '{}'::jsonb);
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'ok', v_cc, v_started, clock_timestamp(), null);
        v_stages := v_stages || jsonb_build_object('content', v_cc);
      exception when others then
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
                left(sqlstate || ' ' || sqlerrm, 1000));
        v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
        v_errors := v_errors || to_jsonb(left('stage_content: ' || sqlerrm, 1000));
      end;
    end if;

    v_r := stage_assignments(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('assignments', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_announcements(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('announcements', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_files(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('files', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_gaps(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('gaps', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    select count(*) into v_after from attention_items;

    select count(*) into v_failed from sync_stage_runs
     where sync_run_id = v_id and status = 'failed';
    v_status := case when v_failed > 0 then 'partial' else 'ok' end;

    update sync_runs
       set status      = v_status,
           finished_at = now(),
           summary     = jsonb_build_object(
                           'stages',           v_stages,
                           'changes',          sync_change_lines(v_stages),
                           'attention_raised', greatest(v_after - v_before, 0),
                           'errors',           v_errors)
     where id = v_id;

  exception when others then
    -- Belt and braces: the stages catch their own errors, so reaching here means something
    -- outside them broke. Record it on the run rather than leaving a row stuck at running.
    update sync_runs
       set status = 'failed', finished_at = now(),
           notes  = btrim(coalesce(notes || ' | ', '') || left('driver: ' || sqlerrm, 500))
     where id = v_id;
  end;

  return v_id;
end $$;

comment on function run_transform(uuid, text) is
  'Fold one crawl into the typed tables. Refuses any run_id that no agent_requests row of kind '
  'sync has registered, because bb_raw takes anon inserts. Otherwise inserts the sync_runs row, '
  'calls the six stages in order (courses, content, assignments, announcements, files, gaps), '
  'and writes summary = {stages, changes, attention_raised, errors}. Idempotent: a run that '
  'already has a real sync_runs row returns that id and does nothing.';

-- =============================================================================================
-- 5. transform_tick: the every-two-minutes heartbeat
-- =============================================================================================
create or replace function transform_tick() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_folded int := 0; v_reaped int := 0; v_claimed int := 0; v_failed_req int := 0;
  v_quarantined int := 0;
  v_runs jsonb := '[]'::jsonb;
  v_newest uuid; v_run bigint; v_q bigint;
  r record;
begin
  -- 1. Fold every REGISTERED crawl that is complete and has never been folded. A crawl is
  --    complete when its calendar row has landed (the crawler posts it last) or when nothing new
  --    has arrived for three minutes. Registration, not presence in bb_raw, is the authority.
  for r in
    select distinct a.run_id
      from agent_requests a
     where a.kind = 'sync'
       and a.run_id is not null
       -- 'claimed' is the state during a crawl; 'done' covers a skill that closed its request
       -- before the next tick came round. Either way the owner asked for this run.
       and a.state in ('claimed','done')
       and not exists (select 1 from sync_runs s
                        where s.run_id = a.run_id and s.scope is distinct from 'unregistered')
       and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'course')
       and (exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'calendar')
            or (select max(b.captured_at) from bb_raw b where b.run_id = a.run_id)
               < now() - interval '3 minutes')
  loop
    v_run := run_transform(r.run_id, 'scheduled');
    v_folded := v_folded + 1;
    v_runs := v_runs || to_jsonb(v_run);
  end loop;

  -- 2. Quarantine. A complete crawl nobody registered is recorded once and then invisible to
  --    every later tick, so junk posted with the publishable key costs two rows and no data.
  for r in
    select b.run_id
      from bb_raw b
     where b.kind = 'course'
       and not exists (select 1 from sync_runs s where s.run_id = b.run_id)
       and not exists (select 1 from agent_requests a
                        where a.kind = 'sync' and a.run_id = b.run_id)
     group by b.run_id
    having (exists (select 1 from bb_raw c where c.run_id = b.run_id and c.kind = 'calendar')
            or max(b.captured_at) < now() - interval '3 minutes')
  loop
    insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope, notes)
    values (r.run_id, 'failed', now(), now(), 'scheduled', 'blackboard', 'unregistered',
            'unregistered run: no agent_requests row of kind sync claimed this run_id, and bb_raw accepts anon inserts. Recorded and ignored.')
    returning id into v_q;

    insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
    values (v_q, 'crawl', 'skipped',
            jsonb_build_object('run_id', r.run_id), now(), now(), 'unregistered run');

    v_quarantined := v_quarantined + 1;
  end loop;

  -- 3. Reap. A run still marked running half an hour later is not running; it died with its
  --    session. Say so out loud instead of leaving "syncing..." on Home forever.
  update sync_runs
     set status      = 'failed',
         finished_at = coalesce(finished_at, now()),
         notes       = btrim(coalesce(notes || ' | ', '') || 'interrupted (reaped)')
   where status = 'running'
     and started_at < now() - interval '30 minutes';
  get diagnostics v_reaped = row_count;

  -- 4. Drain the transform requests the app queued. 'sync' requests are not touched: they need
  --    a logged-in Blackboard tab, so only the bb-sync skill can close one.
  select a.run_id into v_newest
    from agent_requests a
   where a.kind = 'sync' and a.run_id is not null
     and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'course')
   order by (select max(b.captured_at) from bb_raw b where b.run_id = a.run_id) desc
   limit 1;

  for r in
    select id from agent_requests
     where state = 'queued' and kind = 'transform'
     order by created_at
     for update skip locked
  loop
    update agent_requests
       set state = 'claimed', claimed_at = now(), claimed_by = 'transform_tick'
     where id = r.id;

    begin
      if v_newest is null then
        update agent_requests
           set state = 'failed', finished_at = now(),
               result = jsonb_build_object('error', 'no registered crawl in bb_raw to transform')
         where id = r.id;
        v_failed_req := v_failed_req + 1;
      else
        v_run := run_transform(v_newest, 'app_request');
        update agent_requests
           set state = 'done', finished_at = now(), sync_run_id = v_run, run_id = v_newest,
               result = (select jsonb_build_object('sync_run_id', s.id, 'run_id', s.run_id,
                                                   'status', s.status, 'summary', s.summary)
                           from sync_runs s where s.id = v_run)
         where id = r.id;
        v_claimed := v_claimed + 1;
      end if;
    exception when others then
      update agent_requests
         set state = 'failed', finished_at = now(),
             result = jsonb_build_object('error', left(sqlerrm, 500))
       where id = r.id;
      v_failed_req := v_failed_req + 1;
    end;
  end loop;

  return jsonb_build_object('folded', v_folded, 'sync_run_ids', v_runs,
                            'quarantined', v_quarantined, 'reaped', v_reaped,
                            'requests_done', v_claimed, 'requests_failed', v_failed_req,
                            'at', now());
end $$;

comment on function transform_tick() is
  'Scheduled every two minutes by pg_cron as the postgres role. Folds complete crawls that an '
  'agent_requests row of kind sync registered, quarantines complete crawls nobody registered '
  '(once each), marks any run still running after 30 minutes as failed (reaped), and drains '
  'queued agent_requests of kind transform. Never touches kind = sync: those need a logged-in '
  'Blackboard tab and belong to the bb-sync skill.';

-- =============================================================================================
-- 6. ical_poll: daily, and a no-op until Stack supplies a feed URL
-- =============================================================================================
-- pg_net is asynchronous: net.http_get returns a request id and the body arrives in
-- net._http_response later, so one function call cannot both ask and read. The poll is therefore
-- two-phase - collect whatever the previous call asked for, then ask again - and at a daily
-- cadence the answer is always waiting by the next run. Parsing the body into sessions and
-- assignments is a later phase; this only lands the raw text in bb_raw.
create or replace function ical_poll() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_cfg     app_settings%rowtype;
  v_run     bigint;
  v_status  text := 'skipped';
  v_counts  jsonb := '{}'::jsonb;
  v_error   text;
  v_resp    record;
  v_new_req bigint;
  v_run_uuid uuid;
begin
  select * into v_cfg from app_settings where id;

  insert into sync_runs (status, started_at, trigger, source, scope)
  values ('running', now(), 'scheduled', 'ical', 'calendar')
  returning id into v_run;

  if coalesce(btrim(v_cfg.ical_url), '') = '' then
    v_status := 'skipped';
    v_counts := jsonb_build_object('reason', 'app_settings.ical_url is blank');
  else
    -- Phase A: collect the response the last poll asked for.
    if v_cfg.ical_request_id is not null then
      select status_code, content, error_msg, timed_out
        into v_resp
        from net._http_response
       where id = v_cfg.ical_request_id;

      if found and v_resp.status_code between 200 and 299
         and coalesce(v_resp.content, '') <> '' then
        v_run_uuid := gen_random_uuid();
        insert into bb_raw (run_id, kind, bb_course_id, payload)
        values (v_run_uuid, 'ical', null,
                jsonb_build_object('source', 'ical', 'url', v_cfg.ical_url,
                                   'fetched_at', now(), 'body', v_resp.content));
        v_status := 'ok';
        v_counts := jsonb_build_object('bytes', length(v_resp.content), 'run_id', v_run_uuid);
        update app_settings set ical_request_id = null, ical_last_status = v_resp.status_code,
                                ical_last_error = null where id;
      elsif found then
        v_status := 'failed';
        v_error  := left(coalesce(v_resp.error_msg,
                                  'HTTP ' || coalesce(v_resp.status_code::text, '?')), 500);
        update app_settings set ical_request_id = null, ical_last_status = v_resp.status_code,
                                ical_last_error = v_error where id;
      elsif v_cfg.ical_requested_at < now() - interval '1 hour' then
        v_status := 'failed';
        v_error  := 'no pg_net response after an hour; request abandoned';
        update app_settings set ical_request_id = null, ical_last_error = v_error where id;
      else
        v_status := 'skipped';
        v_counts := jsonb_build_object('reason', 'still waiting for the previous request');
      end if;
    end if;

    -- Phase B: ask again, unless a request is still outstanding.
    select ical_request_id into v_new_req from app_settings where id;
    if v_new_req is null then
      v_new_req := net.http_get(url := v_cfg.ical_url, timeout_milliseconds := 20000);
      update app_settings set ical_request_id = v_new_req, ical_requested_at = now() where id;
      v_counts := v_counts || jsonb_build_object('requested', v_new_req);
    end if;
  end if;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (v_run, 'ical', v_status, v_counts, v_started, clock_timestamp(), v_error);

  update sync_runs
     set status      = case when v_status = 'failed' then 'partial' else 'ok' end,
         finished_at = now(),
         summary     = jsonb_build_object(
                         'stages',  jsonb_build_object('ical', v_counts),
                         'changes', case when v_status = 'ok'
                                         then jsonb_build_array('Calendar feed fetched')
                                         when v_status = 'failed'
                                         then jsonb_build_array('Calendar feed could not be fetched')
                                         else jsonb_build_array('Calendar feed not set; nothing polled') end,
                         'attention_raised', 0,
                         'errors', case when v_error is null then '[]'::jsonb
                                        else jsonb_build_array(v_error) end)
   where id = v_run;

  return jsonb_build_object('sync_run_id', v_run, 'status', v_status, 'counts', v_counts,
                            'error', v_error);
end $$;

comment on function ical_poll() is
  'Daily calendar-feed poll. Writes a sync_stage_runs row with stage = ical every time, status '
  'skipped while app_settings.ical_url is blank. When set, it is two-phase because pg_net is '
  'asynchronous: collect the previous request''s body into bb_raw(kind = ical), then issue the '
  'next one. Parsing the body is a later phase.';

-- =============================================================================================
-- 7. v_sync_status: the one row Home and the Inbox header read, and nothing else
-- =============================================================================================
-- security_invoker so the caller's RLS decides what they can see; without it this view would
-- run as its owner and hand the whole sync history to anyone holding the publishable key.
create view v_sync_status
  with (security_invoker = true) as
select s.id,
       s.run_id,
       s.status,
       s.started_at,
       s.finished_at,
       s.trigger,
       s.summary,
       coalesce((select jsonb_object_agg(k.kind, k.n)
                   from (select kind, count(*) as n
                           from attention_items
                          where state = 'open'
                          group by kind) k), '{}'::jsonb) as open_attention,
       coalesce((select jsonb_agg(to_jsonb(f) order by f.stage) from v_data_freshness f),
                '[]'::jsonb) as freshness
  from sync_runs s
 where s.source <> 'ical'                        -- a calendar poll is not "last synced"
   and s.scope is distinct from 'unregistered'   -- nor is a quarantined crawl
 order by s.started_at desc nulls last, s.id desc
 limit 1;

comment on view v_sync_status is
  'One row. The latest real Blackboard sync run plus open_attention (counts keyed by kind) and '
  'freshness (v_data_freshness as a jsonb array). iCal polls and quarantined unregistered crawls '
  'are excluded so Home cannot report either as a sync; both still appear in freshness.';

-- =============================================================================================
-- 8. Privileges
-- =============================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'sync_change_lines(jsonb)', 'run_transform(uuid,text)', 'transform_tick()', 'ical_poll()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

revoke all on v_sync_status from anon;
grant select on v_sync_status to authenticated, service_role;

-- =============================================================================================
-- 9. pg_cron. Not installed on this project before now.
-- =============================================================================================
create extension if not exists pg_cron;

-- cron.schedule replaces a job of the same name, so re-running this migration is safe. Both
-- jobs run as the role that scheduled them: postgres, the owner of every function called.
select cron.schedule('bb2dash-transform-tick', '*/2 * * * *', $cron$select public.transform_tick()$cron$);
select cron.schedule('bb2dash-ical-poll',      '17 6 * * *',  $cron$select public.ical_poll()$cron$);
