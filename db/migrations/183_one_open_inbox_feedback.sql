-- bb2dash :: db/migrations/183_one_open_inbox_feedback.sql
-- Phase 23 (Inbox auto-apply; DECISIONS 2026-10-07).
--
-- WHY. "One request at a time" was the /inbox-apply skill's rule, kept by prose and by the Inbox
-- button's own lookup. Three callers now file an `inbox_feedback` request: the Inbox button, the
-- sync container after a done sync (180) and the apply worker's follow-up (181). The two functions
-- take one advisory lock; the button does not. This index makes the rule the database's: a second
-- open request is refused with 23505, which the button follows instead of showing as an error.
--
-- APPLY AT THE CUT-OVER, NOT BEFORE. The skill installed before Phase 23 inserts a request of its
-- own, already claimed, when it is run with no id; with a request queued it would be refused. The
-- Phase 23 skill claims the open request instead, so this file is applied together with it.
--
-- WHAT
--   1. a refusal to proceed while more than one inbox_feedback request is open
--   2. the partial unique index agent_requests_one_open_inbox_feedback
--   3. a guard block
--
-- Additive only: no drop, no rename, no function body changed.

do $$
declare v_open integer;
begin
  select count(*) into v_open
    from agent_requests a
   where a.kind = 'inbox_feedback' and a.state in ('queued', 'claimed');
  if v_open > 1 then
    raise exception '183: % inbox_feedback requests are open; close all but one before applying', v_open;
  end if;
end $$;

create unique index if not exists agent_requests_one_open_inbox_feedback
  on public.agent_requests (kind)
  where kind = 'inbox_feedback' and state in ('queued', 'claimed');

comment on index public.agent_requests_one_open_inbox_feedback is
  'One open (queued or claimed) inbox_feedback request at a time (183): the Inbox button, the sync '
  'runner''s sync_request_inbox_apply (180) and the apply worker''s follow-up (181) cannot file two. A '
  'second insert raises 23505.';

do $$
begin
  if not exists (select 1 from pg_index x
                  where x.indexrelid = 'public.agent_requests_one_open_inbox_feedback'::regclass
                    and x.indisunique and x.indisvalid and x.indpred is not null) then
    raise exception 'FAIL 183: the index is not a valid partial unique index';
  end if;
end $$;
