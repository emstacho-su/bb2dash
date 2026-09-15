-- bb2dash :: 031_attention_items.sql
-- Phase 9 (docs/planning/62_PHASE9_sync_loop.md, "Migration 031 - attention_items").
-- DDL from docs/planning/21_D2_architecture_direction.md section 3.011 plus the two additions
-- the phase contract names: resolution_note and applied_at.
--
-- Why: sync_runs.summary cannot back a needs-attention row. Its shape has varied across every
-- run written so far and a jsonb blob has no lifecycle - nothing can be answered, dismissed, or
-- marked applied. attention_items is the queue: the transform raises rows, Stack resolves them
-- in the Inbox, and the next transform applies the resolutions and stamps applied_at.
--
-- DEVIATIONS from the D2 DDL, deliberate:
--   * The spec writes `unique (kind, coalesce(course_id,''), coalesce(ref,''),
--     coalesce(field,''), state)`. Postgres table constraints cannot contain expressions, so
--     this is a UNIQUE INDEX over the same expression list. Identical semantics; ON CONFLICT
--     targets it by repeating the expressions.
--   * Two new columns per the phase contract: resolution_note (Stack's free-text "why", written
--     by the Inbox alongside every resolution) and applied_at (stamped by the transform once a
--     resolution has actually been written to the fact row, which is what the Inbox's
--     "answered, applies on next sync" chip waits on).
--   * Indexes on the two foreign keys (course_id, raised_by). The D2 draft has neither; an
--     unindexed FK makes ON DELETE CASCADE from courses scan the table and trips the Supabase
--     performance advisor.
--
-- RLS: owner-scoped exactly like migration 020. anon gets the default Supabase table grants but
-- no policy, so anon sees zero rows.

create table attention_items (
  id              bigint generated always as identity primary key,
  raised_at       timestamptz not null default now(),
  raised_by       bigint references sync_runs(id),
  kind            text not null
      check (kind in ('conflict','missing','stack_must_confirm','deadline','data_gap')),
  course_id       text references courses(id) on delete cascade,
  entity          text,                       -- 'assignment'|'bb_file'|'session'|'course'|'reading'
  ref             text,                       -- assignments.id, bb_files.id::text, ...
  field           text,                       -- 'due_at' when the item is a field-level conflict
  from_value      jsonb,                      -- what we had
  to_value        jsonb,                      -- what Blackboard says
  question        text not null,
  suggested       jsonb,
  state           text not null default 'open'
      check (state in ('open','resolved','dismissed')),
  resolved_at     timestamptz,
  resolution      jsonb,
  resolution_note text,                       -- Stack's "why", captured with every resolution
  applied_at      timestamptz                 -- set by the transform when the resolution landed
);

-- The dedupe key. Re-running the transform must not stack duplicates: the same unresolved
-- conflict raised on three consecutive runs is one row. state is part of the key on purpose, so
-- a conflict that recurs after being resolved can be raised again as a fresh open row.
create unique index attention_items_dedupe_idx on attention_items
  (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')), state);

create index attention_open_idx on attention_items (state, kind);
create index attention_items_course_idx on attention_items (course_id);
create index attention_items_raised_by_idx on attention_items (raised_by);

alter table attention_items enable row level security;
create policy attention_items_owner_all on attention_items for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

comment on table attention_items is
  'Everything the sync loop could not decide on its own. The transform raises rows; Stack '
  'answers them in the Inbox; the next transform applies the answer and stamps applied_at. '
  'Deduped by attention_items_dedupe_idx so re-running a transform is a no-op.';
comment on column attention_items.resolution_note is
  'Stack''s free-text reason for the resolution, captured by the Inbox. Never interpreted by '
  'the transform - it exists so a decision is still explicable months later.';
comment on column attention_items.applied_at is
  'When the transform actually wrote this resolution to the fact row. Null on a resolved row '
  'means "answered, applies on next sync"; that is the state chip the Inbox renders.';
comment on column attention_items.state is
  'open -> resolved | dismissed. Part of the dedupe key, so the same question can be raised '
  'again after it was answered if Blackboard changes its mind.';

-- ---------------------------------------------------------------------------------------------
-- Seeds: the open questions the course-mapping pass already wrote down but never surfaced.
--
-- Two groups, both read from v_course_map_latest (the newest map per course):
--   1. course_fields entries with stack_must_confirm = true AND a null value - a field the map
--      knows it needs and could not fill from Blackboard or the syllabus.
--   2. gaps entries with owner = 'stack' - things the map explicitly assigned to Stack.
--
-- Both are raised as kind = 'stack_must_confirm' rather than 'data_gap': the Inbox gives
-- stack_must_confirm a text/date input and data_gap only a Dismiss button, and every one of
-- these rows is a question only Stack can answer, not a hole in our own data.
--
-- Idempotent: ON CONFLICT DO NOTHING against the dedupe index, so re-running the migration (or
-- re-running it after Stack has resolved rows) changes nothing.
-- ---------------------------------------------------------------------------------------------

insert into attention_items (kind, course_id, entity, ref, question, suggested)
select 'stack_must_confirm',
       m.course_id,
       'course',
       'course_field:' || (f->>'name'),
       coalesce(
         f->>'confirm_question',
         format('%s - %s is not recorded, and neither Blackboard nor the syllabus supplies it. What is it?',
                m.course_id, replace(f->>'name', '_', ' '))),
       jsonb_build_object('from', 'course_map', 'version', m.version, 'field', f)
from v_course_map_latest m
cross join lateral jsonb_array_elements(coalesce(m.map->'course_fields', '[]'::jsonb)) f
where (f->>'stack_must_confirm')::boolean is true
  and (f->'value' is null or jsonb_typeof(f->'value') = 'null')
on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')), state)
do nothing;

-- Map gaps carry no id of their own, so the ref is a short stable digest of the gap text. The
-- full text is the question and the whole gap object (including closes_with) is the suggestion.
insert into attention_items (kind, course_id, entity, ref, question, suggested)
select 'stack_must_confirm',
       m.course_id,
       'course',
       'map_gap:' || substr(md5(g->>'what'), 1, 12),
       format('%s - %s', m.course_id, g->>'what'),
       jsonb_build_object('from', 'course_map', 'version', m.version, 'gap', g)
from v_course_map_latest m
cross join lateral jsonb_array_elements(coalesce(m.map->'gaps', '[]'::jsonb)) g
where g->>'owner' = 'stack'
  and coalesce(g->>'what', '') <> ''
on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')), state)
do nothing;
