-- bb2dash :: 066_calendar_push_lock_and_dirty.sql
-- Phase 11, round 2b (docs/planning/69_PHASE11_planner.md, "Round 2b"). Worker W-21.
-- Covers R2b-6 (weekday convention), R2b-2 (gcal_dirty lost mid-run), R2b-3 (the lock was
-- global) and R2b-7 (the web base URL was baked into the event body).
-- 001-065 are applied and byte-frozen; this adds two columns and recreates one view and one
-- function.
--
-- ---------------------------------------------------------------------------------------------
-- R2b-6. The weekday convention is 0 = Sunday, and 060 used ISO
-- ---------------------------------------------------------------------------------------------
-- `meetings.day_of_week smallint not null check (day_of_week between 0 and 6)` (migration 001),
-- documented as "0=Sun" in DATA_SYNTAX.md and read that way by the seed and by
-- web/src/lib/planner-week.ts. 060's view joined on `extract(isodow from due_date)` and its
-- header said so out loud, which was simply wrong about this schema.
--
-- The two agree on Monday (1) through Saturday (6) and differ only on Sunday: isodow returns 7,
-- dow returns 0. No course in the Fall 2026 seed meets on a Sunday, so nothing on prod moved -
-- but a Sunday meeting would have silently failed to match and a date-only exam due that Sunday
-- would have landed at 23:59 instead of at class start. Corrected here rather than left as a
-- latent trap.
--
-- ---------------------------------------------------------------------------------------------
-- R2b-2. A change that lands mid-push was being erased
-- ---------------------------------------------------------------------------------------------
-- The flag was cleared when a run finished ok. The transform tick runs on the even minute, this
-- push on the odd one, and a push can take the full 55 seconds - so a transform that rewrote a
-- due date WHILE the push was reading the old value set gcal_dirty, and the push then cleared it
-- on the way out. The change would have sat unpushed until something else happened to dirty the
-- flag again.
--
-- The fix is to clear the flag at the START, in the very UPDATE that records the request id:
-- from that instant the flag means "something changed since the push began reading", which is
-- exactly the question the next tick needs answered. The edge function never clears it; it sets
-- it back to true when the run was partial or failed, so a bad run still retries.
--
-- ---------------------------------------------------------------------------------------------
-- R2b-3. One lock, two claimants
-- ---------------------------------------------------------------------------------------------
-- gcal_push_request_id was the only record of "a push is in flight", and the edge function
-- nulled it at the end of every run - including a manual one invoked by hand, which never held
-- it. A manual run finishing while the scheduled push was mid-flight therefore released
-- somebody else's lock, and the next tick fired a second concurrent push against the same
-- deterministic event ids. The reaper had the same shape of bug: it failed EVERY row still
-- marked running, so a manual run in progress was declared dead by a reap that had nothing to do
-- with it.
--
-- gcal_push_run_id names the run that holds the lock. The function releases the lock only when
-- the row still names its own run, and the reaper fails only that run's calendar_push_runs row.
-- A manual run holds no lock, writes no lock, and releases none.
--
-- ---------------------------------------------------------------------------------------------
-- R2b-7. The Vercel hostname was compiled into every event description
-- ---------------------------------------------------------------------------------------------
-- It is part of the canonical body, so it is part of content_hash: the day the deployment URL
-- changes, every event's hash moves and the next push patches all 62 of them - but only if
-- somebody remembers to edit google.ts and redeploy first. As a column it is one UPDATE.
--
-- The tick's own function URL stays a literal below, deliberately: the project ref
-- goultdzqcavefcgnifdy IS this project's identity, it cannot change without the database
-- changing with it, and reading it out of a table the same database owns would buy nothing.

-- ---------------------------------------------------------------------------------------------
-- 1. Two more columns on app_settings
-- ---------------------------------------------------------------------------------------------
alter table app_settings
  add column gcal_push_run_id bigint,
  add column web_base_url     text not null
                              default 'https://web-xi-ten-uy9xk6c6p0.vercel.app';

alter table app_settings
  add constraint app_settings_web_base_url_shape
    check (web_base_url ~ '^https?://[^/[:space:]]+$');

comment on column app_settings.gcal_push_run_id is
  'The calendar_push_runs row that currently holds the in-flight lock, set with '
  'gcal_push_request_id and cleared only by that same run. Without it a manual push finishing '
  'mid-flight released the scheduled push''s lock and a second concurrent push could start.';
comment on column app_settings.web_base_url is
  'Origin of the deployed web app, no trailing slash. The calendar-push function builds each '
  'event''s "open in bb2dash" link from it, so changing the deployment URL is an UPDATE here '
  'plus one push (every content_hash moves) rather than a code change and a redeploy.';

-- ---------------------------------------------------------------------------------------------
-- 2. v_calendar_push_items, recreated for the weekday convention (R2b-6)
-- ---------------------------------------------------------------------------------------------
-- Identical to 065 except `extract(dow ...)` in place of `extract(isodow ...)`.
create or replace view v_calendar_push_items as
with newest_crawl as (
  select s.run_id
    from sync_runs s
   where s.source = 'blackboard'
     and s.status in ('ok','partial')
     and s.scope is distinct from 'unregistered'
     and s.run_id is not null
   order by s.started_at desc nulls last
   limit 1
)
select a.id                         as assignment_id,
       a.course_id,
       c.subject || ' ' || c.number as course_code,
       a.title,
       a.type::text                 as type,
       a.due_at,
       a.due_date,
       case
         when a.due_at is not null then a.due_at
         when a.type in ('project','exam','final_exam') and m.start_time is not null
           then (a.due_date + m.start_time) at time zone 'America/New_York'
         else (a.due_date + time '23:59') at time zone 'America/New_York'
       end                          as event_at,
       a.points_possible,
       w.status,
       coalesce(a.bb_item_id is not null and a.bb_last_seen < crawl.captured_at,
                false)              as absent_from_blackboard
  from assignments a
  join courses c      on c.id = a.course_id
  join v_work_items w on w.item_kind = 'assignment' and w.item_id = a.id
  -- meetings.day_of_week is 0 = Sunday (migration 001's check constraint, DATA_SYNTAX.md and the
  -- seed), which is extract(dow), NOT extract(isodow). They agree Monday..Saturday and differ
  -- only on Sunday, so this is a latent-Sunday fix, not a change to any current row.
  left join lateral (
       select mm.start_time
         from meetings mm
        where mm.course_id = a.course_id
          and mm.day_of_week = extract(dow from a.due_date)::smallint
          and mm.start_time is not null
          and (mm.starts_on is null or a.due_date >= mm.starts_on)
          and (mm.ends_on   is null or a.due_date <= mm.ends_on)
        order by mm.start_time
        limit 1) m on true
  -- When this course was crawled in the newest folded run. Null when the run skipped it, which
  -- is the "says nothing about that course" case. At most one row: bb_raw is unique on
  -- (run_id, kind, coalesce(bb_course_id, '')) since migration 035.
  left join lateral (
       select b.captured_at
         from bb_raw b, newest_crawl n
        where b.run_id = n.run_id
          and b.kind = 'course'
          and b.bb_course_id = c.bb_id
        limit 1) crawl on true
 where w.in_workload
   and coalesce(a.due_at::date, a.due_date) is not null;

alter view v_calendar_push_items set (security_invoker = true);

comment on view v_calendar_push_items is
  'Every dated assignment that belongs on the Google calendar (Q6: v_work_items.in_workload, so '
  'no attendance and no syllabus readings), with event_at already resolved to an instant - '
  'due_at, or class start for a date-only project/exam/final_exam, or 23:59 America/New_York - '
  'and absent_from_blackboard saying whether the newest folded crawl of that course stopped '
  'reporting the item (bb_last_seen older than THAT CRAWL ROW''s captured_at, migration 065). '
  'Weekdays are matched with extract(dow), the schema''s 0 = Sunday convention (066). The '
  'pusher drops absent rows from its desired set, which is what deletes their events. '
  'security_invoker with anon revoked, as 036 requires.';

revoke all on v_calendar_push_items from anon;
grant select on v_calendar_push_items to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. calendar_push_tick, recreated for R2b-2 and R2b-3
-- ---------------------------------------------------------------------------------------------
create or replace function calendar_push_tick() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- The project's own edge-function endpoint. Literal on purpose (R2b-7): the project ref is
  -- this database's identity and cannot change without the database changing with it, so a
  -- setting holding it would only be a second place to get it wrong. The WEB app's origin is a
  -- different matter and does live in app_settings.web_base_url.
  c_url      constant text := 'https://goultdzqcavefcgnifdy.supabase.co/functions/v1/calendar-push';
  c_reap_msg constant text := 'no response from calendar-push within 30 minutes';
  v_cfg      app_settings%rowtype;
  v_reaped   int := 0;
  v_fired    boolean := false;
  v_run      bigint;
  v_request  bigint;
  v_secret   text;
  v_reason   text;
begin
  select * into v_cfg from app_settings where id;

  -- 1. Reap. A request outstanding for half an hour is not coming back; release the lock and say
  --    why. R2b-3: only the run that HELD the lock is failed. A manual run happening to be
  --    'running' at the same moment is none of this reaper's business.
  if v_cfg.gcal_push_request_id is not null
     and v_cfg.gcal_push_requested_at < now() - interval '30 minutes' then
    if v_cfg.gcal_push_run_id is not null then
      update calendar_push_runs
         set status = 'failed', finished_at = coalesce(finished_at, now()), error = c_reap_msg
       where id = v_cfg.gcal_push_run_id and status = 'running';
      get diagnostics v_reaped = row_count;
    end if;

    update app_settings
       set gcal_push_request_id = null,
           gcal_push_run_id     = null,
           -- The reaped run never reported, so whatever it was going to push is still pending.
           -- R2b-2's rule from the other side: only a clean finish leaves the flag down.
           gcal_dirty           = true,
           gcal_last_push_at    = now(),
           gcal_last_status     = 'failed',
           gcal_last_error      = c_reap_msg
     where id;

    select * into v_cfg from app_settings where id;
  end if;

  -- 2. Fire, if there is anything to push and nothing in flight.
  if not v_cfg.gcal_enabled then
    v_reason := 'gcal_enabled is false';
  elsif not v_cfg.gcal_dirty then
    v_reason := 'nothing has changed since the last successful push';
  elsif v_cfg.gcal_push_request_id is not null then
    v_reason := 'a push is still in flight';
  else
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'calendar_push_secret';

    if coalesce(btrim(v_secret), '') = '' then
      -- Enabled but unconfigured. Record it once per tick rather than firing a request that can
      -- only come back 401 - a visible failed run is how the PM finds out the setup is half
      -- done. gcal_dirty is deliberately left set: nothing was pushed.
      v_reason := 'calendar_push_secret is not in Vault; run scripts/google-consent.mjs';
      insert into calendar_push_runs (trigger, status, finished_at, error)
      values ('scheduled', 'failed', now(), v_reason)
      returning id into v_run;

      update app_settings
         set gcal_last_push_at = now(), gcal_last_status = 'failed', gcal_last_error = v_reason
       where id;
    else
      insert into calendar_push_runs (trigger) values ('scheduled') returning id into v_run;

      v_request := net.http_post(
        url                  := c_url,
        body                 := jsonb_build_object('run_id', v_run),
        headers              := jsonb_build_object('x-push-secret', v_secret,
                                                   'content-type', 'application/json'),
        timeout_milliseconds := 55000);

      -- R2b-2: gcal_dirty goes down HERE, in the same statement that takes the lock, not when
      -- the run finishes. From this instant the flag means "something changed after the push
      -- started reading", so a transform landing mid-push survives instead of being erased.
      -- R2b-3: the lock records WHICH run holds it, so only that run can release it.
      update app_settings
         set gcal_push_request_id = v_request,
             gcal_push_run_id     = v_run,
             gcal_push_requested_at = now(),
             gcal_dirty           = false
       where id;

      v_fired := true;
    end if;
  end if;

  return jsonb_build_object('fired', v_fired, 'reaped', v_reaped, 'run_id', v_run,
                            'reason', v_reason, 'at', now());
end $$;

comment on function calendar_push_tick() is
  'Scheduled every two minutes by pg_cron as bb2dash-calendar-push, one minute offset from the '
  'transform tick. Reaps a pg_net request outstanding for 30 minutes - failing only the run that '
  'held the lock (066) and re-raising gcal_dirty - then, if gcal_enabled and gcal_dirty and '
  'nothing is in flight, opens a running calendar_push_runs row and POSTs its id to the '
  'calendar-push edge function with the x-push-secret header from Vault, clearing gcal_dirty and '
  'recording gcal_push_run_id in the same statement so a change landing mid-push is not lost. '
  'There is no collect phase: the function holds the service role and writes its own result '
  'back. SECURITY DEFINER only so it can read vault.decrypted_secrets.';

-- Privileges are unchanged by create or replace; restated because 038's rule is load-bearing.
revoke all on function public.calendar_push_tick() from public, anon, authenticated;
grant execute on function public.calendar_push_tick() to service_role;
