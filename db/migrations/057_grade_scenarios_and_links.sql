-- bb2dash :: 057_grade_scenarios_and_links.sql
-- Phase 10b (docs/planning/68_PHASE10B_grade_model.md, Contract section "057 - scenario and link
-- tables"). Worker W-20. R-12.
--
-- WHAT THIS IS
--   Two tables of Stack's own state, owned by bb2dash and never touched by a sync:
--     grade_scenarios     one saved what-if scenario per scheme course (answer: "one saved
--                         scenario per course, resettable"). item_scores maps a model item key
--                         ('col:<shell>:<column>' or 'asg:<assignment id>') to a hypothetical
--                         score; target_letter is the solver's letter (null reads as A-).
--     grade_column_links  Stack's override layer over V-1's assignment -> component links
--                         (answer 2: "Counts toward..." a component, or "Not graded"). A row here
--                         is treated by the model as a confirmed link (answer 3 / PM call 9).
--
-- HARD RULES honoured
--   * Nothing here writes assignments, assignment_progress, grading_schemes, grade_components or
--     bb_gradebook. No transform function and no stage_* is created or edited, so a sync can never
--     reference either table (asserted in db/tests/phase10b_grade_model.sql).
--   * The web app sends only course_id, column_id and the link target; the same-course trigger is
--     the authority on whether that component belongs to that shell's scheme course.
--
-- DEVIATIONS from the Contract, deliberate, each additive:
--   1. An index on grade_column_links.component_id. The foreign key would otherwise be scanned on
--      every cascade delete from grade_components and trip advisor lint 0001 on its first day
--      (031's reasoning). course_id is already covered by the primary key's leading column.
--   2. updated_at triggers on both tables, using the existing public.set_updated_at() exactly as
--      courses, assignments, assignment_progress and planner_events do. The Contract gives the
--      column a default of now(), which only holds on insert; the web layer upserts, and a link
--      write sends nothing but the key and the target, so without the trigger updated_at would
--      keep the time of the first save forever.
--   3. The trigger function also carries an owner-facing message naming both course ids. No
--      data beyond the ids the caller sent (and the component's own course) is disclosed, and a
--      non-owner resolves neither lookup under RLS, so it learns nothing it did not send.

-- =============================================================================================
-- 1. grade_scenarios
-- =============================================================================================
create table grade_scenarios (
  course_id     text primary key references courses(id) on delete cascade, -- the scheme course (GEO: lecture)
  item_scores   jsonb not null default '{}'::jsonb,  -- {"<item_key>": number >= 0}
  target_letter text,                                -- null = 'A-'
  updated_at    timestamptz not null default now(),
  constraint grade_scenarios_item_scores_shape check (
    jsonb_typeof(item_scores) = 'object'
    and not jsonb_path_exists(item_scores, '$.* ? (@.type() != "number" || @ < 0)')),
  constraint grade_scenarios_target_letter check (target_letter is null or char_length(target_letter) between 1 and 3),
  constraint grade_scenarios_size check (pg_column_size(item_scores) < 65536)
);

comment on table grade_scenarios is
  'Stack''s one saved what-if scenario per scheme course (GEO 103: the lecture shell). '
  'item_scores maps a v_grade_model_items.item_key to a hypothetical score; the model uses a '
  'value only on an item Blackboard has not graded, and the agreement with Blackboard never '
  'reads it. Owner state: no sync, transform or stage ever writes or reads this table.';
comment on column grade_scenarios.item_scores is
  'A json object of item_key -> number >= 0. The check constraint refuses any non-number or '
  'negative value; the upper bound (the item''s possible) is validated in the web layer, which '
  'knows the item.';
comment on column grade_scenarios.target_letter is
  'The target letter the solver was last asked about. Null means the default, A-.';

-- =============================================================================================
-- 2. grade_column_links
-- =============================================================================================
create table grade_column_links (
  course_id    text    not null references courses(id),       -- the shell the column lives in
  column_id    text    not null,                              -- bb_gradebook.column_id
  component_id bigint  references grade_components(id) on delete cascade,
  excluded     boolean not null default false,                -- "Not graded"
  updated_at   timestamptz not null default now(),
  primary key (course_id, column_id),
  constraint grade_column_links_one_target check ((component_id is not null) <> excluded)
);

-- Deviation 1.
create index grade_column_links_component_idx on grade_column_links (component_id);

comment on table grade_column_links is
  'Stack''s override of which syllabus component a Blackboard gradebook column counts toward '
  '(component_id), or that it counts toward nothing (excluded = true). Exactly one of the two '
  'is set. v_grade_model_items prefers a row here over the assignment link and reports it as '
  'link_source = override, link_confidence = confirmed. Owner state that V-1 folds in later; '
  'no sync ever touches it.';
comment on column grade_column_links.course_id is
  'The Blackboard shell the column lives in (GEO 103 recitation columns keep the recitation id), '
  'not the scheme course. The same-course trigger maps it to its scheme course.';
comment on column grade_column_links.excluded is
  'Stack marked the column "Not graded": the model leaves it out of every sum.';

-- =============================================================================================
-- 3. The same-course trigger
-- =============================================================================================
-- A component may only be linked to a column whose shell rolls up to that component's scheme
-- course: coalesce(courses.parent_course_id, courses.id). GEO 103 recitation columns therefore
-- accept lecture components, and nothing else crosses a course boundary. SECURITY INVOKER, so the
-- two lookups run under the caller's RLS - an owner resolves them, anybody else resolves nothing
-- and is refused before the table's own policy is even consulted.
create or replace function grade_column_links_same_course() returns trigger
  language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_scheme_course    text;
  v_component_course text;
begin
  if new.component_id is null then
    return new;
  end if;

  select coalesce(c.parent_course_id, c.id) into v_scheme_course
    from courses c
   where c.id = new.course_id;

  select gc.course_id into v_component_course
    from grade_components gc
   where gc.id = new.component_id;

  if v_scheme_course is null
     or v_component_course is null
     or v_component_course <> v_scheme_course then
    raise exception using
      errcode = 'check_violation',
      message = format('grade component %s does not belong to the grading scheme of %s',
                       new.component_id, new.course_id),
      detail  = format('component course: %s; column scheme course: %s',
                       coalesce(v_component_course, 'unknown'),
                       coalesce(v_scheme_course, 'unknown'));
  end if;

  return new;
end $$;

comment on function grade_column_links_same_course() is
  'Before insert/update on grade_column_links: refuses a component_id whose grade_components '
  'course is not coalesce(parent_course_id, id) of the row''s shell. SECURITY INVOKER; raises '
  'check_violation (23514).';

create trigger grade_column_links_same_course
  before insert or update on grade_column_links
  for each row execute function grade_column_links_same_course();

-- Deviation 2.
create trigger grade_column_links_updated_at
  before update on grade_column_links
  for each row execute function set_updated_at();

create trigger grade_scenarios_updated_at
  before update on grade_scenarios
  for each row execute function set_updated_at();

-- =============================================================================================
-- 4. RLS - owner-scoped, the initplan-safe form
-- =============================================================================================
alter table grade_scenarios    enable row level security;
alter table grade_column_links enable row level security;

create policy grade_scenarios_owner_all on grade_scenarios for all to authenticated
  using ((select auth.uid()) = public.app_owner())
  with check ((select auth.uid()) = public.app_owner());

create policy grade_column_links_owner_all on grade_column_links for all to authenticated
  using ((select auth.uid()) = public.app_owner())
  with check ((select auth.uid()) = public.app_owner());

-- =============================================================================================
-- 5. Privileges
-- =============================================================================================
revoke all on grade_scenarios, grade_column_links from public, anon, authenticated;
grant select, insert, update, delete on grade_scenarios, grade_column_links to authenticated;
grant all on grade_scenarios, grade_column_links to service_role;

revoke all on function public.grade_column_links_same_course() from public, anon;
grant execute on function public.grade_column_links_same_course() to authenticated, service_role;
