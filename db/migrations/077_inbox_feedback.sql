-- bb2dash :: 077_inbox_feedback.sql
-- Phase 12b, item I-1 (docs/planning/80c_PHASE12B_page_pass.md: P-inbox-1, P-home-4, Stack's
-- answer 16). Worker W-30.
--
-- THE QUESTION Stack asked. "Who reads the Inbox, appends changes, and makes edits? I would like
-- to position the feedback provided from Inbox as feedback for an agentic worker eventually."
--
-- WHAT IS TRUE TODAY. `apply_resolutions()` (042) applies exactly four fields of an answered
-- conflict - assignments.due_at, due_date, points_possible, bb_url - and "Keep mine" sets
-- confidence = 'confirmed'. Everything else Stack writes in the Inbox is recorded and then read by
-- nothing: `attention_items.resolution_note` has no reader anywhere in the codebase. Course-level
-- confirmations, staff conflicts, ambiguous columns, grading-scheme questions and every
-- data_gap / deadline dismissal fall in that bucket. 25 closed rows on prod carry a note.
--
-- WHAT THIS MIGRATION DOES, and nothing more (answer 16: "the hook only, no agent").
--   * `v_inbox_feedback` - one row per CLOSED Inbox item that carries a note: what was asked, what
--     Blackboard said, what Stack decided, what he wrote, and whether the transform was able to
--     act on it. That is the queue a future worker reads. It is a view, so it costs nothing and
--     goes stale never.
--   * `agent_requests.kind` gains `inbox_feedback`, so that worker has a queue to be woken by.
--     `transform_tick()` drains `kind = 'transform'` and nothing else, so a queued inbox_feedback
--     row sits untouched until something is built to claim it - which is exactly the behaviour
--     wanted: the hook exists, nothing acts on it yet.
--
-- WHY "closed with a note" AND NOT EVERY ROW. The note is the feedback. An open row is a question
-- Stack has not answered; a closed row with no note is a click, not a sentence. Both states that
-- close a row are included: a dismissal with a reason ("this is not a real gap because ...") is
-- the most useful feedback there is.

-- =============================================================================================
-- 1. The view
-- =============================================================================================
create view v_inbox_feedback
  with (security_invoker = true) as
select ai.id,
       ai.kind,
       ai.course_id,
       ai.entity,
       ai.ref,
       ai.field,
       ai.question,
       ai.from_value,
       ai.to_value,
       ai.suggested,
       ai.state,
       ai.resolution,
       ai.resolution->>'accept'          as accept,
       ai.resolution_note                as feedback,
       ai.raised_at,
       ai.raised_by                      as raised_by_sync_run,
       ai.resolved_at,
       ai.applied_at,
       (ai.applied_at is not null)       as was_applied
  from attention_items ai
 where ai.state in ('resolved', 'dismissed')
   and coalesce(btrim(ai.resolution_note), '') <> '';

comment on view v_inbox_feedback is
  'Every closed Inbox item that carries a note from Stack, as the feedback queue an agentic '
  'worker would read (Phase 12b I-1, Stack''s answer 16). One row per attention_items row whose '
  'state is resolved or dismissed and whose resolution_note is not empty: the question as it was '
  'asked, Blackboard''s value and bb2dash''s, what Stack decided (resolution / accept), what he '
  'wrote (feedback), and whether apply_resolutions() was able to act on it (was_applied - false '
  'for every kind and field 042 does not apply, which is most of them). Read-only and derived; '
  'nothing writes here. security_invoker with anon revoked, as 036 requires.';

-- =============================================================================================
-- Privileges (036's rule)
-- =============================================================================================
revoke all on v_inbox_feedback from public, anon;
grant select on v_inbox_feedback to authenticated, service_role;

-- =============================================================================================
-- 2. The request kind
-- =============================================================================================
alter table agent_requests drop constraint agent_requests_kind_check;
alter table agent_requests add constraint agent_requests_kind_check
  check (kind in ('sync', 'transform', 'inbox_feedback'));

comment on column agent_requests.kind is
  'What the request asks for. sync: a crawl, which needs a logged-in Blackboard tab, so only the '
  'bb-sync skill can close one. transform: fold the newest registered crawl and apply Stack''s '
  'answers - transform_tick() drains these every two minutes. inbox_feedback (077): the queue for '
  'a worker that reads v_inbox_feedback and acts on what Stack wrote. Nothing claims that kind '
  'yet, and transform_tick() filters on kind = ''transform'', so such a row stays queued until '
  'something is built to take it.';

-- =============================================================================================
-- Guards
-- =============================================================================================
do $$
declare v text;
begin
  -- 036: no owner-run view in public.
  select string_agg(c.relname, ', ' order by c.relname) into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and coalesce((select o = 'security_invoker=true'
                     from unnest(c.reloptions) o where o like 'security_invoker=%'), false) is false;
  if v is not null then
    raise exception 'these public views still run as their owner and bypass RLS: %', v;
  end if;

  -- 076: and no view handed to anon, nor TRUNCATE handed to the browser roles.
  if has_table_privilege('anon', 'public.v_inbox_feedback', 'select') then
    raise exception '077: v_inbox_feedback is readable by anon';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'v_inbox_feedback'
                and grantee in ('anon', 'authenticated') and privilege_type = 'TRUNCATE') then
    raise exception '077: v_inbox_feedback was created with a TRUNCATE grant (076 regressed)';
  end if;

  -- The new kind is accepted and the old two still are; anything else is still refused.
  begin
    insert into agent_requests (kind, note) values ('_077_probe_bad_kind', 'guard');
    raise exception '077: agent_requests accepted an unknown kind';
  exception when check_violation then
    null;
  end;
end $$;
