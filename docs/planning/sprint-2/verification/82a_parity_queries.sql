-- 82a — Phase 14 parity query set (brief 100 task 2; R-85, P-40). Frozen 2026-10-02, before W-55 is cut.
--
-- What it is for: task 28's same-day pair. Run <A> is the Windows skill path (`/bb-sync`, the `sync`
-- container stopped); run <B> is the container path (`sync-runner`, `syncLauncher = queue-only`). Both are
-- crawls of the same Blackboard on the same day, so every query below must read the same for <A> and <B>
-- except where its comment says a difference is expected. Replace '<A>' and '<B>' with the two run ids
-- (`agent_requests.run_id`) and paste each query's output into `82a_PHASE14_PARITY_AND_IMAGES.md`.
--
-- Read-only. Nothing here writes.
--
-- Baseline on record: the brief names request 39 -> sync_runs 62, run 3b5174b8 (2026-09-23; 26 attempts,
-- 58 gradebook rows, 9 bb_raw). Syncs have run since; on 2026-10-02 the last crawl is request 457 ->
-- sync_runs 485, run 2a4d4a2e-80ff-4e20-8185-c96a5e2e459a (crawler v5). The pair in task 28 is compared
-- with itself, not with either of these.

-- Q1 current totals of the typed tables (one row; read once before <A>, once between, once after <B>:
--    the second crawl of a day must not grow any of them, a growth is a row the runner invented)
select
  (select count(*) from assignments)   as assignments,
  (select count(*) from readings)      as readings,
  (select count(*) from bb_content)    as bb_content,
  (select count(*) from announcements) as announcements,
  (select count(*) from bb_files)      as bb_files,
  (select count(*) from bb_attempts)   as bb_attempts;

-- Q2 bb_raw rows per kind for each run (expected equal: 1 calendar, 1 memberships, one course row per
--    current-term course)
select run_id, kind, count(*) as n
  from bb_raw
 where run_id in ('<A>', '<B>')
 group by run_id, kind
 order by kind, run_id;

-- Q3 bb_attempts per run (expected equal)
select run_id, count(*) as attempts, count(distinct course_id) as courses
  from bb_attempts
 where run_id in ('<A>', '<B>')
 group by run_id
 order by run_id;

-- Q4 bb_gradebook per run (expected equal)
select run_id, count(*) as gradebook_rows, count(distinct course_id) as courses
  from bb_gradebook
 where run_id in ('<A>', '<B>')
 group by run_id
 order by run_id;

-- Q5 the two runs' summary counters, stage by stage (every numeric counter a stage reports, side by side;
--    `differs` is true where <A> and <B> disagree. Counters of what the crawl saw must match. Counters of
--    what the fold changed (inserted, updated, attention_raised and the like) may be lower in the second
--    run of the day, because the first already folded the change; each such row is explained in 82a)
with counters as (
  select r.run_id, s.key as stage, c.key as counter, (c.value)::text::numeric as n
    from sync_runs r
    cross join lateral jsonb_each(r.summary -> 'stages') s
    cross join lateral jsonb_each(s.value) c
   where r.run_id in ('<A>', '<B>')
     and r.scope is distinct from 'unregistered'
     and jsonb_typeof(s.value) = 'object'
     and jsonb_typeof(c.value) = 'number'
)
select coalesce(a.stage, b.stage) as stage,
       coalesce(a.counter, b.counter) as counter,
       a.n as run_a,
       b.n as run_b,
       a.n is distinct from b.n as differs
  from (select * from counters where run_id = '<A>') a
  full join (select * from counters where run_id = '<B>') b
    on a.stage = b.stage and a.counter = b.counter
 order by 1, 2;

-- Q6 each run's status and stages (expected: the same status, the same stage names, no errors; and the
--    request behind <B> claimed by 'sync-runner')
select r.run_id,
       r.id as sync_run_id,
       r.status,
       r.scope,
       r.started_at,
       r.finished_at,
       (select string_agg(k, ', ' order by k) from jsonb_object_keys(r.summary -> 'stages') k) as stages,
       coalesce(jsonb_array_length(r.summary -> 'errors'), 0) as errors,
       q.id as request_id,
       q.state as request_state,
       q.claimed_by
  from sync_runs r
  left join agent_requests q on q.run_id = r.run_id
 where r.run_id in ('<A>', '<B>')
   and r.scope is distinct from 'unregistered'
 order by r.started_at;
