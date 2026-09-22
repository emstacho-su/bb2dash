-- bb2dash :: 090_attention_archive.sql
-- Inbox feedback loop, automation half (Stack's brief in the bb-sync session for request 34,
-- 2026-09-22). Pairs with skills/inbox-apply/SKILL.md, the worker that 077 left a queue for.
-- Additive: one more `attention_items.state`, three new columns, one function that moves a row
-- into that state, one view that is the worker's queue, and a `create or replace` of 041's
-- attention_keep_stands so a settled disagreement stays settled after it is archived. 031, 041,
-- 042 and 077 stay byte-frozen.
--
-- ---------------------------------------------------------------------------------------------
-- THE GAP. AN ANSWERED ROW IS THE END OF THE ROAD FOR EVERYTHING BUT FOUR FIELDS
-- ---------------------------------------------------------------------------------------------
-- apply_resolutions() (042) writes an answer only when it names due_at, due_date, points_possible
-- or bb_url on an assignment. Every other answer - "add it", "same person, keep mine", a
-- course-map date, a dismissal with a reason - is recorded in `resolution` / `resolution_note`
-- and read by nothing (077 built `v_inbox_feedback` as the queue for a worker that did not yet
-- exist). Measured on prod before this migration: 6 resolved rows with applied_at null, 11
-- dismissed rows, and 5 free-text answers that a session applied by hand on 2026-09-22.
--
-- THE SHAPE. A row Stack has closed is processed exactly once by /inbox-apply: the worker reads
-- the answer, gathers the context a careful reader would (syllabus rule, how the course already
-- records comparable rows, Blackboard's own gradebook facts), writes the change, records a
-- decision, and then ARCHIVES the row. Archived is a fourth state, not a second table:
--   * 041's two do-not-re-ask rules read `state <> 'open'` (attention_answered) and `state =
--     'resolved'` (attention_keep_stands). Moving rows to another table would make every
--     dismissed gap and every kept conflict come back on the next fold. A state keeps
--     attention_answered true for free; attention_keep_stands is widened here to `resolved` or
--     `archived` so a kept name stays kept.
--   * The 041 dedupe index is partial on `state = 'open'`, so an archived row never collides.
--   * `v_inbox_feedback` (077) filters `state in ('resolved','dismissed')`, so an archived row
--     leaves that queue by itself; 042's scan is `state = 'resolved'`, so it leaves that too.
--   * The Inbox's counts on Home read `open` only (v_sync_status); nothing there moves.
--
-- WHAT `decision` HOLDS. A jsonb object the worker writes when it archives: what it changed
-- (or "recorded only"), the rule it followed, the sources it read, and anything it flagged for
-- Stack or for a code change. It is the audit trail on the row itself; the same decision is
-- also appended to the decisions store (vault, collection bb2dash-inbox-decisions) by the skill.
--
-- WHAT DOES NOT CHANGE. `agent_requests.kind` already accepts `inbox_feedback` (077); the
-- Inbox's "Apply answers" button files that kind and /inbox-apply claims it, exactly as the Sync
-- button and /bb-sync do with `sync`. No new kind is needed.

-- =============================================================================================
-- 1. The fourth state and the three columns
-- =============================================================================================
alter table attention_items drop constraint attention_items_state_check;
alter table attention_items
  add constraint attention_items_state_check
  check (state in ('open', 'resolved', 'dismissed', 'archived'));

alter table attention_items
  add column archived_at timestamptz,
  add column archived_by text,
  add column decision    jsonb;

comment on column attention_items.state is
  'open: a question for Stack. resolved / dismissed: Stack answered (the Inbox writes these). '
  'archived (090): /inbox-apply processed the answer - applied it, or recorded that nothing '
  'applies - and moved the row out of the live Inbox. Archived rows still count as answered for '
  '041''s do-not-re-ask rules.';
comment on column attention_items.archived_at is
  'When /inbox-apply archived the row (090). Null unless state = archived.';
comment on column attention_items.archived_by is
  'Who archived it: the skill name plus the agent_requests id it ran under (090).';
comment on column attention_items.decision is
  'The worker''s decision record (090): {change, rule, sources, flagged}. What was written for '
  'this answer, the rule that justified it, what was read, and anything left for Stack or for '
  'a code change. Written once, at archive time; never edited.';

-- =============================================================================================
-- 2. attention_keep_stands - a kept disagreement stays kept after it is archived
-- =============================================================================================
create or replace function attention_keep_stands(
  p_course_id text, p_ref text, p_field text, p_to jsonb
) returns boolean
  language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from attention_items ai
     where ai.state in ('resolved', 'archived')
       and ai.kind  = 'conflict'
       and ai.resolution->>'accept' = 'keep'
       and ai.to_value is not distinct from p_to
       and coalesce(ai.course_id,'') = coalesce(p_course_id,'')
       and coalesce(ai.ref,'')       = coalesce(p_ref,'')
       and coalesce(ai.field,'')     = coalesce(p_field,''))
$$;

comment on function attention_keep_stands(text,text,text,jsonb) is
  'Did Stack already settle this exact disagreement with "Keep mine"? True only when a resolved '
  'OR archived (090) conflict exists for the same (course, ref, field) AND Blackboard is still '
  'saying the same thing (to_value unchanged). A different value from Blackboard is a new '
  'disagreement and is raised again. Comparison is jsonb equality on the stored value.';

-- =============================================================================================
-- 3. archive_attention_item - the only way a row becomes archived
-- =============================================================================================
create or replace function archive_attention_item(
  p_id bigint, p_decision jsonb, p_by text default 'inbox-apply'
) returns attention_items
  language plpgsql set search_path = public, pg_temp as $$
declare v_row attention_items;
begin
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'archive_attention_item: decision must be a jsonb object'
      using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_by), '') = '' then
    raise exception 'archive_attention_item: archived_by must name the worker'
      using errcode = 'check_violation';
  end if;

  update attention_items
     set state = 'archived', archived_at = now(), archived_by = p_by, decision = p_decision
   where id = p_id and state in ('resolved', 'dismissed')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'archive_attention_item: item % is not a closed (resolved or dismissed) row', p_id
      using errcode = 'no_data_found';
  end if;
  return v_row;
end $$;

comment on function archive_attention_item(bigint, jsonb, text) is
  'Move one answered Inbox row to state archived (090), stamping archived_at, archived_by and '
  'the worker''s decision record. Refuses an open row (a question Stack has not answered is '
  'never archived), a row already archived, and a decision that is not a jsonb object. Runs '
  'as the caller, so RLS applies: the owner from the app, the service role from the skill.';

revoke all on function archive_attention_item(bigint, jsonb, text) from public, anon;
grant execute on function archive_attention_item(bigint, jsonb, text) to authenticated, service_role;

-- =============================================================================================
-- 4. v_inbox_queue - every answered, not-yet-archived row: what /inbox-apply reads
-- =============================================================================================
create view v_inbox_queue
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
       ai.resolution->>'accept'                                  as accept,
       ai.resolution_note                                        as feedback,
       (coalesce(btrim(ai.resolution_note), '') <> '')           as has_note,
       ai.raised_at,
       ai.raised_by                                              as raised_by_sync_run,
       ai.resolved_at,
       ai.applied_at,
       (ai.applied_at is not null)                               as was_applied
  from attention_items ai
 where ai.state in ('resolved', 'dismissed');

comment on view v_inbox_queue is
  'The /inbox-apply queue (090): every Inbox row Stack has closed (resolved or dismissed) that '
  'the worker has not yet archived, with the answer, the note, and whether apply_resolutions() '
  'already acted on it. Unlike v_inbox_feedback (077) it does not require a note: a bare "yes" '
  'is an answer the worker must still apply or record. Rows leave it only through '
  'archive_attention_item(). security_invoker with anon revoked, as 036 requires.';

revoke all on v_inbox_queue from public, anon;
grant select on v_inbox_queue to authenticated, service_role;

-- =============================================================================================
-- Guards
-- =============================================================================================
do $$
declare v_def text;
begin
  -- The state check accepts the new state and still rejects an unknown one.
  begin
    insert into attention_items (kind, state, question) values ('data_gap', 'bogus', '090 probe');
    raise exception '090: attention_items_state_check accepted an unknown state';
  exception when check_violation then null;
  end;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'attention_items'::regclass
                    and conname = 'attention_items_state_check'
                    and pg_get_constraintdef(oid) like '%archived%') then
    raise exception '090: attention_items_state_check does not list archived';
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'attention_items'
         and column_name in ('archived_at', 'archived_by', 'decision')) <> 3 then
    raise exception '090: the three archive columns are missing';
  end if;

  select pg_get_functiondef('attention_keep_stands(text,text,text,jsonb)'::regprocedure) into v_def;
  if v_def not like '%''archived''%' then
    raise exception '090: attention_keep_stands does not honour archived rows';
  end if;

  if has_function_privilege('anon', 'archive_attention_item(bigint, jsonb, text)', 'execute') then
    raise exception '090: archive_attention_item is executable by anon';
  end if;
  if has_table_privilege('anon', 'public.v_inbox_queue', 'select') then
    raise exception '090: v_inbox_queue is readable by anon';
  end if;
  if not exists (select 1 from pg_views v join pg_class c on c.relname = v.viewname
                  where v.schemaname = 'public' and v.viewname = 'v_inbox_queue'
                    and c.reloptions::text like '%security_invoker=true%') then
    raise exception '090: v_inbox_queue is not security_invoker';
  end if;
end $$;
